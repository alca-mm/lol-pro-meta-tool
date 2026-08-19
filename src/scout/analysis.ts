/**
 * Tournament Scout — analysis engine.
 *
 * Turns the manually collected scout data (`ScoutPlayerData`) of a set of
 * opponents into champion signals, per-player analyses and a team ban plan.
 *
 * ---------------------------------------------------------------------------
 * THREE PROPERTIES THIS MODULE GUARANTEES
 *
 * (1) PURE. No side effects, no I/O, no network, no clock. `analyzeScout()`
 *     called twice with the same input returns a deeply equal result, and the
 *     order of every list is fully determined by the input (score first, then
 *     documented tie-breaks that end on the champion key — never on
 *     `localeCompare`, whose result depends on the host locale).
 *
 * (2) HONEST. Nothing is invented. A player without entries produces an empty
 *     signal list plus a `player_without_data` warning — never a guessed ban.
 *     Every score carries at least one `ScoutReason`. Thin data lowers the
 *     `ScoutConfidence` *and* raises a warning; it is never silently presented
 *     as if it were solid. Imported pro meta may *enrich* a recommendation
 *     (`meta_priority`) but can never create one: a champion nobody scouted
 *     never enters the plan, no matter how contested it is in pro play.
 *
 * (3) UNIT-SAFE. Scout winrates are **percent (0–100)**, the meta engine's
 *     `ChampionStats.winRate` / `presence` are **fractions (0–1)**. The two
 *     never meet unconverted: percent values only ever live in variables and
 *     reason params named `*Percent`, fractions in `*Fraction`, and the single
 *     bridge is `percentToFraction()` below.
 * ---------------------------------------------------------------------------
 *
 * SCORING MODEL (per player × champion, all components 0–1)
 *
 *   volumeScore  = sampleConfidence(games, SCOUT_TARGET_GAMES)
 *                  Saturating log curve reused from src/analysis/draftHelper.ts
 *                  so the scout uses the *same* sample-size convention as the
 *                  draft helper instead of inventing a second one.
 *   dampedWinrate= 0.5 + (winrateFraction - 0.5) * volumeScore
 *                  Extreme winrates are pulled toward neutral when the sample
 *                  is small. This is what stops "100 % on 2 games" from
 *                  outranking a real comfort pick — the classic scouting error.
 *   shareScore   = this champion's share of the player's tracked games, but
 *                  only when at least SHARE_MIN_ENTRIES rows exist for that
 *                  player. With a single row the share is trivially 1.0 and
 *                  would say nothing about concentration, so NEUTRAL_SHARE is
 *                  used instead.
 *
 *   raw   = WEIGHT_VOLUME * volumeScore
 *         + WEIGHT_WINRATE * dampedWinrate
 *         + WEIGHT_SHARE  * shareScore                       (weights sum to 1)
 *   score = clamp01(raw * recencyWeight * conflictPenalty), 0 when games <= 0
 *
 *   recencyWeight: current 1.00 / recent 0.85 / old 0.60 — `old` is weighted
 *   down but never dropped, exactly what the UI promises the user
 *   (i18n `scout_manual_recencyHint`).
 *
 * BAN PRIORITY (per champion, across players)
 *
 *   priority = clamp01(
 *       bestSignalScore
 *     + OVERLAP_WEIGHT * (sum of the remaining players' scores)
 *     + (isFlex ? FLEX_BONUS : 0)
 *     + metaBonus                      (only with imported pro meta)
 *     + (userMarkedPriority ? USER_PRIORITY_BONUS : 0))
 *
 * CONFIDENCE (thresholds are the named constants below)
 *
 *   signal:  games 0            -> none
 *            games 1..5         -> low
 *            games 6..14        -> medium
 *            games >= 15        -> high
 *            all entries `old`  -> one step down
 *            conflicting rows   -> one step down (never below `low`)
 *   player:  no entries                                            -> none
 *            >= 25 games AND >= 3 entries AND some `current` data   -> high
 *            >= 10 games AND >= 2 entries                           -> medium
 *            otherwise (entries exist)                              -> low
 *   candidate: the best confidence among its signals.
 *   session:   `none` when nothing was entered at all; otherwise the best
 *              player confidence, one step down when more than half of the
 *              scouted players have no data at all.
 *
 * BAN PHASES
 *
 *   safe        confidence >= medium AND (hits several players OR is a flex
 *               pick OR priority >= PHASE_SAFE_MIN_PRIORITY) — it costs the
 *               opponent something no matter how the draft develops.
 *   target      confidence >= medium AND priority >= PHASE_TARGET_MIN_PRIORITY,
 *               but only one player and one role are affected.
 *   situational everything else: thin data, low confidence or low priority.
 *               Deliberately the fallback bucket, so a weak recommendation is
 *               visibly parked instead of being dressed up as a plan.
 *
 * ROLE AWARENESS (only when `options.lineup` is supplied)
 *
 *   The scenario this exists for: a player stands in the lineup as jungle, but
 *   the only data anybody could find for him is Karma on mid. Announcing "ban
 *   Karma against their jungler" would be a lie built out of true numbers.
 *
 *   reference role = starting slot (starters) | detected `ScoutPlayer.role`
 *                    (substitutes) | none (pool)
 *   roleFit        = unassigned > flex > unknown > onrole/offrole
 *   score         *= 1 (onrole) | 0.4 (offrole) | 0.8 (flex/unknown)
 *                 *= substituteWeight when the player sits on the bench
 *   confidence     = capped at `low` (offrole) / one step down (flex/unknown),
 *                    which also stops an offrole candidate from ever reaching
 *                    the `safe` or `target` phase.
 *   A player in *no* slot is scored neutrally *and* judged not at all: their
 *   `roleFit` is always `unknown`. There is no lineup role to compare against,
 *   and inventing one from a parsed link is exactly what the honesty rule
 *   forbids. They carry `player_without_lineup_role` instead — see
 *   `resolveRoleFit()`.
 *
 *   The primary ban target prefers an `onrole` signal over a merely higher
 *   score, and `targetRole` stays `null` unless the chosen signal really is
 *   onrole — see `buildCandidate()`. Otherwise a strong offrole signal would
 *   put a lane in the headline that none of its rows support.
 *
 *   WITHOUT a lineup nothing above happens: every signal keeps
 *   `roleFit: "unknown"`, no weight is applied, `ScoutAnalysis.lineup` is
 *   `null` and no lineup warning is raised. The engine then produces exactly
 *   the numbers it produced before this feature existed.
 *
 * SUBSTITUTES
 *
 *   `includeSubstitutes: false` (default) — a benched player is skipped
 *   entirely: no signals, no candidates, no session statistics. Down-weighting
 *   alone would still let an 80 %-on-the-bench pick creep into the plan, and
 *   the plan is about the five players who will actually be on the rift.
 *   `includeSubstitutes: true` — their signals count, multiplied by
 *   `substituteWeight` (default 0.6), flagged `fromSubstitute` and explained
 *   with `substitute_risk`. Moving a substitute into the starting five needs no
 *   special case: the lineup says they are a starter, so they count in full.
 */

import { sampleConfidence } from "../analysis/draftHelper"
import type { ChampionStats } from "../domain/types"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS, SCOUT_SUBSTITUTE_WEIGHT } from "./types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutAnalysisOptions,
  ScoutAnalysisResult,
  ScoutBanPhase,
  ScoutBanPhases,
  ScoutConfidence,
  ScoutDataQuality,
  ScoutLineup,
  ScoutLineupAssignment,
  ScoutLineupMembership,
  ScoutLineupSlot,
  ScoutLineupStarterRow,
  ScoutLineupSubstituteRow,
  ScoutLineupSummary,
  ScoutManualSource,
  ScoutPlayer,
  ScoutPlayerAnalysis,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutReason,
  ScoutRecency,
  ScoutRole,
  ScoutRoleFit,
  ScoutWarning,
  TeamBanPlan,
  WinratePercent,
} from "./types"

/**
 * RE-EXPORT, NOT A DECLARATION.
 *
 * These three used to be declared in this file because src/scout/types.ts could
 * not be touched at the time. They now live in the shared contract, but the
 * tests, `ScoutAnalysisPanel.tsx`, `ScoutBanPlanPanel.tsx` and `scoutExport.ts`
 * all import them *from here*. Re-exporting keeps those imports working, so the
 * move stays a pure refactor. Prefer importing them from `./types` in new code.
 */
export type { ScoutAnalysisOptions, ScoutAnalysisResult, ScoutPlayerAnalysis } from "./types"

/* ==========================================================================
 * 1. Constants — every threshold used below is named here, on purpose.
 * ========================================================================== */

/** Games at which `volumeScore` reaches 1.0. Scout pools are small (a single
 *  player's champion list), so this is far below the draft helper's 50. */
const SCOUT_TARGET_GAMES = 20

/** Weights of the three score components. Must sum to 1. */
const WEIGHT_VOLUME = 0.45
const WEIGHT_WINRATE = 0.35
const WEIGHT_SHARE = 0.2

/** A 50 % winrate carries no information in either direction. */
const NEUTRAL_WINRATE_FRACTION = 0.5

/** Used instead of a real pool share when the player has too few rows. */
const NEUTRAL_SHARE = 0.5

/** Minimum rows for a player before pool share becomes meaningful. */
const SHARE_MIN_ENTRIES = 2

/** `old` data is weighted down, never discarded. */
const RECENCY_WEIGHT: Readonly<Record<ScoutRecency, number>> = {
  current: 1,
  recent: 0.85,
  old: 0.6,
}

/** Two rows for the same champion whose winrates differ by at least this many
 *  percentage points are treated as contradicting each other. */
const CONFLICT_WINRATE_DELTA_PERCENT = 25

/** Score multiplier applied to a champion with contradicting rows. */
const CONFLICT_SCORE_PENALTY = 0.85

/** From here on a winrate counts as "strong". */
const HIGH_WINRATE_PERCENT = 55

/** From here on a sample is solid enough to take a strong winrate at face value. */
const SOLID_SAMPLE_GAMES = 10

/** Below this a sample is explicitly flagged as thin (`small_sample`). */
const SMALL_SAMPLE_GAMES = 5

/** Pool share thresholds for `signature_pick` / `one_trick`. */
const SIGNATURE_SHARE = 0.35
const ONE_TRICK_SHARE = 0.6

/** A player needs at least this many tracked games before their pool share is
 *  allowed to justify a `signature_pick` / `one_trick` claim. */
const SIGNATURE_MIN_PLAYER_GAMES = 10

/** Many games at a poor winrate: a weakness to exploit, not a ban target. */
const WEAKNESS_MIN_GAMES = 8
const WEAKNESS_MAX_WINRATE_PERCENT = 45

/** How much every *additional* affected player adds to the ban priority. */
const OVERLAP_WEIGHT = 0.35

/** Flat bonus for a champion that showed up on more than one role. */
const FLEX_BONUS = 0.05

/** Pro-meta enrichment (all fractions 0–1, never percent). */
const META_BONUS_MAX = 0.08
const META_MIN_PRESENCE_FRACTION = 0.2
const META_MIN_SAMPLE = 5

/** Bonus for a champion the user explicitly raised. */
const USER_PRIORITY_BONUS = 0.1

/** Signal confidence thresholds (games). */
const SIGNAL_CONF_HIGH_GAMES = 15
const SIGNAL_CONF_MEDIUM_GAMES = 6

/** Player confidence thresholds. */
const PLAYER_CONF_HIGH_GAMES = 25
const PLAYER_CONF_HIGH_ENTRIES = 3
const PLAYER_CONF_MEDIUM_GAMES = 10
const PLAYER_CONF_MEDIUM_ENTRIES = 2

/** Below this many games in total a player's data quality note says `small_sample`. */
const PLAYER_SMALL_SAMPLE_GAMES = 10

/** Below this many games over the whole session: `small_sample_overall`. */
const SESSION_SMALL_SAMPLE_GAMES = 20

/** From this share of `old` games onwards: `meta_shift_possible`. */
const SESSION_OLD_SHARE_WARNING = 0.5

/** Phase thresholds. */
const PHASE_SAFE_MIN_PRIORITY = 0.65
const PHASE_TARGET_MIN_PRIORITY = 0.35

/* --- role awareness (only ever applied when a lineup was supplied) --------
 *
 * THE PROBLEM THESE THREE NUMBERS SOLVE:
 * A player stands in the lineup as jungle, but the only data the user could
 * find for him is Karma on mid/support. Without a lineup the engine happily
 * turns that into a strong ban — and the ban is then announced as if it hurt
 * the enemy *jungler*, which it does not. Weighting the signal down is the
 * honest answer: the data is real (so it is never deleted), it just says
 * little about the lane this player will actually be in.
 *
 * Multipliers on the signal score, never on the raw user numbers:
 *  - onrole            ×1     the signal is about the lane the player holds
 *  - offrole           ×0.4   a different lane — kept, but it can no longer
 *                             outrank a comparable onrole signal
 *  - flex / unknown    ×0.8   a ban here *may* hit the wrong lane
 *
 * Confidence follows the same idea, one step further: an offrole signal is
 * capped at `low` (never `none` — the data exists), a flex/unknown one is moved
 * one step down. Because `resolvePhase()` requires `medium`, an offrole
 * candidate can never be presented as a `safe` or `target` ban; it always lands
 * in `situational`. That is the mechanism behind "an offrole signal must not be
 * the primary reason to ban for the lineup role".
 */
const OFFROLE_SCORE_WEIGHT = 0.4
const ROLE_UNCERTAIN_SCORE_WEIGHT = 0.8

/** Winrate range accepted from user input; anything else is "no usable value". */
const MIN_WINRATE_PERCENT = 0
const MAX_WINRATE_PERCENT = 100

const CONFIDENCE_ORDER: readonly ScoutConfidence[] = ["none", "low", "medium", "high"]

const RECENCY_VALUES: readonly string[] = ["current", "recent", "old"]

const ROLE_VALUES: readonly string[] = ["top", "jungle", "mid", "bot", "support", "unknown"]

/**
 * Accepted `ScoutManualSource` values.
 *
 * KEEP IN SYNC — this is the **third** copy of this list, and the three are
 * deliberately separate because each guards a different boundary:
 *   1. `MANUAL_SOURCES` in src/scout/storage.ts — what may be *loaded*
 *   2. `SCOUT_MANUAL_SOURCE_VALUES` in src/components/scout/scoutUiHelpers.ts —
 *      what the editor *offers*
 *   3. this one — what the engine *believes* about an entry it is handed
 * A value missing here does not throw and does not change a score: it silently
 * degrades to `"other"` in `ChampionSignal.sources`. THE LESSON IS STILL LIVE,
 * only its example is now historical: when the (since removed) Riot
 * auto-import added `"riot"`, the other two lists got it and this one did not,
 * so every auto-imported row reported its provenance as "some other source".
 * Nothing broke loudly — the feature just started lying about where its
 * numbers came from. When a source is added or removed, all three change
 * together, in the same change.
 *
 * `"riot"` itself is gone from all three since 2026-08-19 (the auto-import was
 * removed; see the closing note of section 9 in src/scout/types.ts). A row a
 * local build already stored with it arrives here as an unknown value and is
 * reported as `"other"` — the same, deliberate degradation the loader applies
 * in `readManualSource()` (src/scout/storage.ts), and no reason to keep a
 * seventh entry in this list.
 */
const MANUAL_SOURCE_VALUES: readonly string[] = [
  "opgg",
  "leagueofgraphs",
  "deeplol",
  "dpm",
  "manual",
  "other",
]

/** Fixed role precedence, used only as a deterministic tie-break. */
const ROLE_ORDER: readonly ScoutRole[] = ["top", "jungle", "mid", "bot", "support", "unknown"]

/* ==========================================================================
 * 2. Local types
 *
 * `ScoutAnalysisOptions`, `ScoutPlayerAnalysis` and `ScoutAnalysisResult` used
 * to be declared here; they are part of the shared contract now and are only
 * re-exported above. What is left below is genuinely internal to the engine.
 * ========================================================================== */

/** Internal: a signal plus the metadata that does not fit into `ChampionSignal`. */
interface SignalContext {
  signal: ChampionSignal
  championKey: string
  /** Distinct roles this champion was entered on for this player. */
  roles: ScoutRole[]
  /** True when the rows contradict each other (see CONFLICT_WINRATE_DELTA_PERCENT). */
  conflicting: boolean
  /** True when this is a weakness, not a threat. */
  isWeakness: boolean
}

/** Internal: one champion of one player, after normalising and merging rows. */
interface ChampionGroup {
  championKey: string
  championName: string
  entries: NormalizedEntry[]
}

/** Internal: one `ManualChampionEntry` after sanitising every field. */
interface NormalizedEntry {
  championKey: string
  championName: string
  games: number
  /** Percent 0–100, or null when the row carried no usable winrate. */
  winratePercent: WinratePercent | null
  recency: ScoutRecency
  role: ScoutRole
  source: ScoutManualSource
}

/* ==========================================================================
 * 3. Small pure helpers
 * ========================================================================== */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * THE ONLY place a scout percent becomes a domain fraction.
 * Keeping it in one named function makes the 0–100 vs 0–1 mismatch impossible
 * to introduce by accident somewhere in the scoring code.
 */
function percentToFraction(percent: WinratePercent): number {
  return percent / 100
}

/** Locale-independent string compare — `localeCompare` would make the sort
 *  order depend on the machine running the tests. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function confidenceRank(confidence: ScoutConfidence): number {
  const index = CONFIDENCE_ORDER.indexOf(confidence)
  return index < 0 ? 0 : index
}

function downgradeConfidence(confidence: ScoutConfidence, floorIndex = 0): ScoutConfidence {
  const index = Math.max(floorIndex, confidenceRank(confidence) - 1)
  return CONFIDENCE_ORDER[index]
}

/** Lowers a confidence to `ceiling` when it is above it — never raises it, so
 *  `none` ("no basis at all") can not be talked up into `low`. */
function capConfidence(confidence: ScoutConfidence, ceiling: ScoutConfidence): ScoutConfidence {
  return confidenceRank(confidence) > confidenceRank(ceiling) ? ceiling : confidence
}

function bestConfidence(values: readonly ScoutConfidence[]): ScoutConfidence {
  let best: ScoutConfidence = "none"
  for (const value of values) {
    if (confidenceRank(value) > confidenceRank(best)) best = value
  }
  return best
}

function roleRank(role: ScoutRole): number {
  const index = ROLE_ORDER.indexOf(role)
  return index < 0 ? ROLE_ORDER.length : index
}

/** Rounds to one decimal so scores/priorities stay readable and comparable
 *  without exposing float noise in snapshots. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function normalizeChampionKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeRecency(value: unknown): ScoutRecency {
  // Unknown values are treated as `old`: the conservative choice, because it
  // weighs the row *down* instead of inventing currency the user never claimed.
  return typeof value === "string" && RECENCY_VALUES.includes(value)
    ? (value as ScoutRecency)
    : "old"
}

function normalizeRole(value: unknown): ScoutRole {
  return typeof value === "string" && ROLE_VALUES.includes(value) ? (value as ScoutRole) : "unknown"
}

function normalizeSource(value: unknown): ScoutManualSource {
  return typeof value === "string" && MANUAL_SOURCE_VALUES.includes(value)
    ? (value as ScoutManualSource)
    : "other"
}

/** Non-negative integer, robust against NaN / Infinity / negative junk. */
function normalizeGames(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  if (value <= 0) return 0
  return Math.floor(value)
}

/**
 * A winrate is only usable when it is a finite percent inside 0–100.
 * Everything else (NaN, 150, -3, a string) becomes `null` = "no usable value",
 * which the scoring treats as neutral instead of as a maximum threat.
 */
function normalizeWinratePercent(value: unknown): WinratePercent | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < MIN_WINRATE_PERCENT || value > MAX_WINRATE_PERCENT) return null
  return value
}

/**
 * Substitute weight, clamped to 0–1 as the contract promises. Anything that is
 * not a finite number falls back to {@link SCOUT_SUBSTITUTE_WEIGHT} instead of
 * silently becoming 0 — a broken option must not delete the bench.
 */
function normalizeSubstituteWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SCOUT_SUBSTITUTE_WEIGHT
  return clamp01(value)
}

function reason(code: ScoutReason["code"], params?: ScoutReason["params"]): ScoutReason {
  return params ? { code, params } : { code }
}

function dedupeReasons(reasons: readonly ScoutReason[]): ScoutReason[] {
  const seen = new Set<string>()
  const result: ScoutReason[] = []
  for (const item of reasons) {
    if (seen.has(item.code)) continue
    seen.add(item.code)
    result.push(item)
  }
  return result
}

/* ==========================================================================
 * 4. Entry normalisation and grouping
 * ========================================================================== */

function normalizeEntries(entries: readonly ManualChampionEntry[] | undefined): NormalizedEntry[] {
  if (!Array.isArray(entries)) return []

  const result: NormalizedEntry[] = []

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue

    const rawName = typeof entry.championName === "string" ? entry.championName.trim() : ""
    // A row without a champion name carries no information at all and is
    // dropped rather than turned into an empty-named candidate.
    if (rawName.length === 0) continue

    result.push({
      championKey: normalizeChampionKey(rawName),
      championName: rawName,
      games: normalizeGames(entry.games),
      winratePercent: normalizeWinratePercent(entry.winrate),
      recency: normalizeRecency(entry.recency),
      role: normalizeRole(entry.role),
      source: normalizeSource(entry.source),
    })
  }

  return result
}

/** Groups a player's rows per champion, preserving first-seen order. */
function groupByChampion(entries: readonly NormalizedEntry[]): ChampionGroup[] {
  const groups = new Map<string, ChampionGroup>()

  for (const entry of entries) {
    const existing = groups.get(entry.championKey)
    if (existing) {
      existing.entries.push(entry)
      continue
    }
    groups.set(entry.championKey, {
      championKey: entry.championKey,
      championName: entry.championName,
      entries: [entry],
    })
  }

  return [...groups.values()]
}

/**
 * Games-weighted winrate over the rows of one champion.
 * Rows without a usable winrate do not contribute (they are not counted as 0 %).
 */
function aggregateWinratePercent(entries: readonly NormalizedEntry[]): WinratePercent | null {
  let weightedSum = 0
  let weight = 0
  let plainSum = 0
  let plainCount = 0

  for (const entry of entries) {
    if (entry.winratePercent === null) continue
    plainSum += entry.winratePercent
    plainCount += 1
    if (entry.games > 0) {
      weightedSum += entry.winratePercent * entry.games
      weight += entry.games
    }
  }

  if (weight > 0) return weightedSum / weight
  if (plainCount > 0) return plainSum / plainCount
  return null
}

/** Games-weighted recency factor; falls back to the strongest factor when no
 *  row carries games (so a 0-games row is not punished twice). */
function aggregateRecencyWeight(entries: readonly NormalizedEntry[]): number {
  let weightedSum = 0
  let weight = 0
  let maxWeight = 0

  for (const entry of entries) {
    const factor = RECENCY_WEIGHT[entry.recency]
    if (factor > maxWeight) maxWeight = factor
    if (entry.games > 0) {
      weightedSum += factor * entry.games
      weight += entry.games
    }
  }

  if (weight > 0) return weightedSum / weight
  return maxWeight > 0 ? maxWeight : RECENCY_WEIGHT.old
}

/** The recency shown for the merged signal: the one behind most games,
 *  tie-broken toward the more current value. */
function dominantRecency(entries: readonly NormalizedEntry[]): ScoutRecency {
  const gamesPerRecency: Record<ScoutRecency, number> = { current: 0, recent: 0, old: 0 }
  const seen: Record<ScoutRecency, boolean> = { current: false, recent: false, old: false }

  for (const entry of entries) {
    gamesPerRecency[entry.recency] += entry.games
    seen[entry.recency] = true
  }

  const ordered: ScoutRecency[] = ["current", "recent", "old"]
  let best: ScoutRecency | null = null

  for (const recency of ordered) {
    if (!seen[recency]) continue
    if (best === null || gamesPerRecency[recency] > gamesPerRecency[best]) best = recency
  }

  return best ?? "old"
}

/** Distinct known roles, `unknown` only when nothing better exists. */
function collectRoles(entries: readonly NormalizedEntry[]): ScoutRole[] {
  const known = new Set<ScoutRole>()
  let sawUnknown = false

  for (const entry of entries) {
    if (entry.role === "unknown") sawUnknown = true
    else known.add(entry.role)
  }

  if (known.size === 0) return sawUnknown ? ["unknown"] : []
  return [...known].sort((a, b) => roleRank(a) - roleRank(b))
}

/** The single role reported on the signal: most games wins, then role order. */
function primarySignalRole(entries: readonly NormalizedEntry[]): ScoutRole {
  const gamesPerRole = new Map<ScoutRole, number>()

  for (const entry of entries) {
    if (entry.role === "unknown") continue
    gamesPerRole.set(entry.role, (gamesPerRole.get(entry.role) ?? 0) + entry.games)
  }

  if (gamesPerRole.size === 0) return "unknown"

  let bestRole: ScoutRole = "unknown"
  let bestGames = -1

  for (const [role, games] of [...gamesPerRole.entries()].sort(
    (a, b) => roleRank(a[0]) - roleRank(b[0]),
  )) {
    if (games > bestGames) {
      bestGames = games
      bestRole = role
    }
  }

  return bestRole
}

function collectSources(entries: readonly NormalizedEntry[]): ScoutManualSource[] {
  const seen = new Set<ScoutManualSource>()
  const result: ScoutManualSource[] = []
  for (const entry of entries) {
    if (seen.has(entry.source)) continue
    seen.add(entry.source)
    result.push(entry.source)
  }
  return result
}

/** Two rows for the same champion whose winrates are far apart contradict each
 *  other — the user copied from two sources (or two time frames) that disagree. */
function hasConflictingEntries(entries: readonly NormalizedEntry[]): boolean {
  const winrates = entries
    .map((entry) => entry.winratePercent)
    .filter((value): value is WinratePercent => value !== null)

  if (winrates.length < 2) return false

  const min = Math.min(...winrates)
  const max = Math.max(...winrates)

  return max - min >= CONFLICT_WINRATE_DELTA_PERCENT
}

/* ==========================================================================
 * 4b. Lineup derivation and role awareness
 *
 * Everything in this block is inert unless the caller supplied
 * `options.lineup`. Without a lineup the engine makes *no* claim about roles:
 * every signal keeps `roleFit: "unknown"`, `lineupRole: null`,
 * `fromSubstitute: false`, no score is touched and none of the lineup warnings
 * is raised. "No lineup" is not "an empty lineup" — nothing was claimed, so
 * nothing can be wrong.
 * ========================================================================== */

/** Reads one slot out of a persisted lineup record, tolerating junk. */
function readSlotPlayerId(record: unknown, slot: string): ScoutPlayerId | null {
  if (!record || typeof record !== "object") return null
  const value = (record as Record<string, unknown>)[slot]
  return typeof value === "string" && value.length > 0 ? value : null
}

/**
 * Turns the raw slot→id assignment into the derived {@link ScoutLineupSummary}.
 *
 * Two invariants `ScoutLineup` cannot express in the type system are enforced
 * here, exactly as the contract prescribes for *readers*:
 *  - a player id occupies at most one slot — the first hit in canonical slot
 *    order (starters before substitutes) wins, later duplicates read as empty;
 *  - an id that no longer belongs to any known player is *not* silently kept in
 *    its row. It is reported in `danglingPlayerIds` and its slot counts as
 *    empty, so `starterPlayerIds` only ever contains ids that resolve.
 */
function buildLineupSummary(
  lineup: ScoutLineup | undefined,
  players: readonly ScoutPlayer[],
): ScoutLineupSummary {
  const knownIds = new Set<ScoutPlayerId>(players.map((player) => player.id))
  const taken = new Set<ScoutPlayerId>()
  const danglingPlayerIds: ScoutPlayerId[] = []
  const byPlayerId: Record<ScoutPlayerId, ScoutLineupAssignment> = {}

  const claim = (raw: ScoutPlayerId | null): ScoutPlayerId | null => {
    if (raw === null) return null
    if (!knownIds.has(raw)) {
      if (!danglingPlayerIds.includes(raw)) danglingPlayerIds.push(raw)
      return null
    }
    if (taken.has(raw)) return null
    taken.add(raw)
    return raw
  }

  const starters: ScoutLineupStarterRow[] = []
  const starterPlayerIds: ScoutPlayerId[] = []
  for (const slot of SCOUT_LINEUP_SLOTS) {
    const playerId = claim(readSlotPlayerId(lineup?.starters, slot))
    starters.push({ slot, playerId })
    if (playerId !== null) {
      starterPlayerIds.push(playerId)
      byPlayerId[playerId] = {
        playerId,
        membership: "starter",
        starterSlot: slot,
        substituteSlot: null,
      }
    }
  }

  const substitutes: ScoutLineupSubstituteRow[] = []
  const substitutePlayerIds: ScoutPlayerId[] = []
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
    const playerId = claim(readSlotPlayerId(lineup?.substitutes, slot))
    substitutes.push({ slot, playerId })
    if (playerId !== null) {
      substitutePlayerIds.push(playerId)
      byPlayerId[playerId] = {
        playerId,
        membership: "substitute",
        starterSlot: null,
        substituteSlot: slot,
      }
    }
  }

  const unassignedPlayerIds: ScoutPlayerId[] = []
  for (const player of players) {
    if (byPlayerId[player.id]) continue
    unassignedPlayerIds.push(player.id)
    byPlayerId[player.id] = {
      playerId: player.id,
      membership: "unassigned",
      starterSlot: null,
      substituteSlot: null,
    }
  }

  const missingStarterSlots = starters
    .filter((row) => row.playerId === null)
    .map((row) => row.slot)

  return {
    starters,
    substitutes,
    byPlayerId,
    starterPlayerIds,
    substitutePlayerIds,
    unassignedPlayerIds,
    missingStarterSlots,
    isStartingFiveComplete: missingStarterSlots.length === 0,
    danglingPlayerIds,
  }
}

/**
 * Internal: where one player stands, plus what that means for their signals.
 * Built once per player and handed to every signal of that player, so the
 * scoring never has to look a lineup up again.
 */
interface PlayerRoleContext {
  /** `false` when no lineup was supplied — then nothing below is applied. */
  lineupAware: boolean
  membership: ScoutLineupMembership
  /** Surfaces as `ChampionSignal.lineupRole`; `null` for bench and pool. */
  starterSlot: ScoutLineupSlot | null
  /** What a signal's own role is compared against — see {@link ScoutRoleFit}. */
  referenceRole: ScoutLineupSlot | null
  fromSubstitute: boolean
  /** Score multiplier coming from the bench alone (always 1 for starters). */
  substituteWeight: number
  /**
   * `false` for a substitute while `includeSubstitutes` is off. Such a player
   * is skipped *entirely*: no signals, no ban candidates, no contribution to
   * the session statistics. Weighting them down would still let a 80 % bench
   * pick creep into the plan; the conservative default is that the plan is
   * built from the starting five.
   */
  scored: boolean
}

function buildRoleContext(
  player: ScoutPlayer,
  summary: ScoutLineupSummary | null,
  includeSubstitutes: boolean,
  substituteWeight: number,
): PlayerRoleContext {
  if (summary === null) {
    return {
      lineupAware: false,
      membership: "unassigned",
      starterSlot: null,
      referenceRole: null,
      fromSubstitute: false,
      substituteWeight: 1,
      scored: true,
    }
  }

  const assignment = summary.byPlayerId[player.id]
  const membership: ScoutLineupMembership = assignment?.membership ?? "unassigned"
  const starterSlot = assignment?.starterSlot ?? null
  const detectedRole = normalizeRole(player.role)

  // Precedence straight out of the contract: the starting slot the user chose
  // beats the role that was detected from a pasted link — and for a substitute
  // the detected role is all there is, which is what makes their data
  // comparable at all.
  const referenceRole: ScoutLineupSlot | null =
    starterSlot !== null ? starterSlot : detectedRole === "unknown" ? null : detectedRole

  const fromSubstitute = membership === "substitute"

  return {
    lineupAware: true,
    membership,
    starterSlot,
    referenceRole,
    fromSubstitute,
    substituteWeight: fromSubstitute ? substituteWeight : 1,
    scored: !fromSubstitute || includeSubstitutes,
  }
}

/**
 * The four-way answer to "does this signal describe the lane this player will
 * be in?". Precedence is fixed by the contract: flex > unknown > onrole/offrole.
 * Flex wins even when one of the roles matches, because "this ban may hit the
 * wrong lane" is the more useful statement.
 *
 * A PLAYER IN NO SLOT IS NEVER JUDGED — and that check runs FIRST, before flex.
 * `referenceRole` falls back to `ScoutPlayer.role` for anyone who is not a
 * starter, and for a pool player that role is nothing but the link parser's
 * guess. Comparing against a guess produced a line that contradicted itself
 * three times over: the badge said "different role" next to a `high`
 * confidence, the reason right underneath said "without a slot no role check is
 * possible", and `offrole_data_present` — whose text says "than the one *in the
 * lineup*" — counted a player who stands in no lineup at all. `unknown` is the
 * only honest answer, and it is the one `resolveRoleAdjustment()` already acts
 * on (neutral weight, `player_without_lineup_role`).
 *
 * The flex fact is not lost by ordering this first: `flex_across_roles`,
 * `BanCandidate.isFlex` and `flex_pick_warning` are all derived from the
 * *entries*, not from the lineup, and still fire for a pool player.
 */
function resolveRoleFit(
  signalRole: ScoutRole,
  entryRoles: readonly ScoutRole[],
  context: PlayerRoleContext,
): ScoutRoleFit {
  if (!context.lineupAware) return "unknown"
  if (context.membership === "unassigned") return "unknown"
  if (entryRoles.filter((role) => role !== "unknown").length > 1) return "flex"
  if (context.referenceRole === null || signalRole === "unknown") return "unknown"
  return signalRole === context.referenceRole ? "onrole" : "offrole"
}

/** What a {@link ScoutRoleFit} does to one signal's score and confidence. */
interface RoleAdjustment {
  /** Multiplier on the signal score. */
  weight: number
  /** Confidence ceiling, or `null` when this fit does not cap. */
  maxConfidence: ScoutConfidence | null
  /** `true` when the confidence is moved one step down (floor `low`). */
  downgrade: boolean
  /** Always at least one reason whenever anything above is not neutral. */
  reasons: ScoutReason[]
}

const NEUTRAL_ROLE_ADJUSTMENT: RoleAdjustment = {
  weight: 1,
  maxConfidence: null,
  downgrade: false,
  reasons: [],
}

function resolveRoleAdjustment(
  roleFit: ScoutRoleFit,
  signalRole: ScoutRole,
  context: PlayerRoleContext,
): RoleAdjustment {
  if (!context.lineupAware) return NEUTRAL_ROLE_ADJUSTMENT

  if (context.membership === "unassigned") {
    // Neutral on purpose. The player sits in no slot, so there is no lineup
    // role their data could be measured against. Weighting them down would
    // punish them for a decision the user has not made yet; weighting them up
    // would invent a role. The user is told instead — reason here, warning at
    // session level.
    return {
      weight: 1,
      maxConfidence: null,
      downgrade: false,
      reasons: [reason("player_without_lineup_role", { role: signalRole })],
    }
  }

  const reasons: ScoutReason[] = []
  let weight = 1
  let maxConfidence: ScoutConfidence | null = null
  let downgrade = false
  const lineupRole = context.referenceRole ?? "unknown"

  switch (roleFit) {
    case "onrole":
      reasons.push(reason("onrole_signal", { role: signalRole }))
      break
    case "offrole":
      weight = OFFROLE_SCORE_WEIGHT
      // Capped, not zeroed: the data exists and stays visible, it just may not
      // be presented as a reliable ban against this player's lane.
      maxConfidence = "low"
      reasons.push(reason("offrole_signal", { signalRole, lineupRole }))
      break
    case "flex":
    case "unknown":
      weight = ROLE_UNCERTAIN_SCORE_WEIGHT
      downgrade = true
      reasons.push(reason("role_unknown_or_flex", { signalRole, lineupRole }))
      break
  }

  if (context.fromSubstitute) {
    weight *= context.substituteWeight
    reasons.push(reason("substitute_risk", { weight: round3(context.substituteWeight) }))
  }

  return { weight, maxConfidence, downgrade, reasons }
}

/* ==========================================================================
 * 5. Signal building
 * ========================================================================== */

function signalConfidence(input: {
  games: number
  hasCurrent: boolean
  allOld: boolean
  conflicting: boolean
}): ScoutConfidence {
  if (input.games <= 0) return "none"

  let confidence: ScoutConfidence =
    input.games >= SIGNAL_CONF_HIGH_GAMES
      ? "high"
      : input.games >= SIGNAL_CONF_MEDIUM_GAMES
        ? "medium"
        : "low"

  // `old` data still counts, but we say out loud that we trust it less.
  if (input.allOld) confidence = downgradeConfidence(confidence, 1)
  // Contradicting rows never raise confidence above "we saw something".
  if (input.conflicting) confidence = downgradeConfidence(confidence, 1)

  return confidence
}

function buildSignalContext(
  playerId: ScoutPlayerId,
  group: ChampionGroup,
  playerTotalGames: number,
  playerEntryCount: number,
  roleContext: PlayerRoleContext,
): SignalContext {
  const entries = group.entries
  const games = entries.reduce((sum, entry) => sum + entry.games, 0)
  const winratePercent = aggregateWinratePercent(entries)
  const recencyWeight = aggregateRecencyWeight(entries)
  const recency = dominantRecency(entries)
  const roles = collectRoles(entries)
  const conflicting = hasConflictingEntries(entries)
  const hasCurrent = entries.some((entry) => entry.recency === "current")
  const allOld = entries.every((entry) => entry.recency === "old")
  const allManual = entries.every((entry) => entry.source === "manual")

  // --- score components -------------------------------------------------
  const volumeScore = games > 0 ? clamp01(sampleConfidence(games, SCOUT_TARGET_GAMES)) : 0

  // The single percent -> fraction bridge of this module.
  const winrateFraction = winratePercent === null ? null : percentToFraction(winratePercent)
  const dampedWinrate =
    winrateFraction === null
      ? NEUTRAL_WINRATE_FRACTION
      : NEUTRAL_WINRATE_FRACTION + (winrateFraction - NEUTRAL_WINRATE_FRACTION) * volumeScore

  const shareOfPlayerGames = playerTotalGames > 0 ? games / playerTotalGames : 0
  const shareScore =
    playerEntryCount >= SHARE_MIN_ENTRIES ? clamp01(shareOfPlayerGames) : NEUTRAL_SHARE

  const raw =
    WEIGHT_VOLUME * volumeScore +
    WEIGHT_WINRATE * clamp01(dampedWinrate) +
    WEIGHT_SHARE * shareScore

  // No games = no evidence = no score. A row the user typed without a game
  // count still shows up as a signal, but never as a recommendation.
  const baseScore =
    games <= 0 ? 0 : clamp01(raw * recencyWeight * (conflicting ? CONFLICT_SCORE_PENALTY : 1))

  // --- role awareness ---------------------------------------------------
  // Identity transformation when no lineup was supplied, so the numbers below
  // are bit-for-bit the ones this engine produced before the lineup existed.
  const signalRole = primarySignalRole(entries)
  const roleFit = resolveRoleFit(signalRole, roles, roleContext)
  const roleAdjustment = resolveRoleAdjustment(roleFit, signalRole, roleContext)

  const score = round3(clamp01(baseScore * roleAdjustment.weight))

  // --- weakness classification -----------------------------------------
  const isWeakness =
    games >= WEAKNESS_MIN_GAMES &&
    winratePercent !== null &&
    winratePercent <= WEAKNESS_MAX_WINRATE_PERCENT

  // --- reasons ----------------------------------------------------------
  const reasons: ScoutReason[] = []

  if (isWeakness) {
    reasons.push(
      reason("high_games_low_winrate", { games, winrate: round3(winratePercent ?? 0) }),
    )
  } else if (winratePercent !== null && winratePercent >= HIGH_WINRATE_PERCENT) {
    reasons.push(
      reason(games >= SOLID_SAMPLE_GAMES ? "high_winrate_many_games" : "high_winrate_small_sample", {
        games,
        winrate: round3(winratePercent),
      }),
    )
  }

  if (
    playerEntryCount >= SHARE_MIN_ENTRIES &&
    playerTotalGames >= SIGNATURE_MIN_PLAYER_GAMES &&
    shareOfPlayerGames >= SIGNATURE_SHARE
  ) {
    const sharePercent = round3(shareOfPlayerGames * 100)
    reasons.push(
      shareOfPlayerGames >= ONE_TRICK_SHARE
        ? reason("one_trick", { games, share: sharePercent })
        : reason("signature_pick", { games, share: sharePercent }),
    )
  }

  if (roles.filter((role) => role !== "unknown").length >= 2) {
    reasons.push(reason("flex_across_roles", { roles: roles.join(",") }))
  } else if (roles.length === 1 && roles[0] !== "unknown") {
    reasons.push(reason("role_specific_threat", { role: roles[0] }))
  }

  if (hasCurrent) reasons.push(reason("played_recently", { games }))
  else if (allOld) reasons.push(reason("stale_data", { games }))

  if (games > 0 && games < SMALL_SAMPLE_GAMES) {
    reasons.push(reason("small_sample", { games }))
  }
  if (games <= 0) {
    reasons.push(reason("no_data"))
  }

  // `reasons.length === 0` is the guaranteed fallback: no signal ever ships
  // without a reason.
  //
  // `allManual` is NOT "always true" — an earlier version of this comment
  // claimed that, and it was wrong even then: a row the user marks as read off
  // OP.GG fails it, and so does every row applied from a paste import, which
  // carries the site it was copied from. Do not "simplify" this back to an
  // unconditional push — that would tell the user numbers they read off a
  // scouting site were typed in from memory.
  if (allManual || reasons.length === 0) {
    reasons.push(reason("manual_entry_only", { entries: entries.length }))
  }

  // Appended *after* the guarantee above, so role awareness can only ever add
  // to the explanation, never take the last data reason away from a signal.
  reasons.push(...roleAdjustment.reasons)

  let confidence = signalConfidence({ games, hasCurrent, allOld, conflicting })
  // The `> 0` guard keeps `none` at `none`: `downgradeConfidence(_, 1)` has a
  // `low` floor, which would otherwise *raise* a no-data signal.
  if (roleAdjustment.downgrade && confidenceRank(confidence) > 0) {
    confidence = downgradeConfidence(confidence, 1)
  }
  if (roleAdjustment.maxConfidence !== null) {
    confidence = capConfidence(confidence, roleAdjustment.maxConfidence)
  }

  const signal: ChampionSignal = {
    championName: group.championName,
    playerId,
    role: signalRole,
    games,
    winrate: winratePercent === null ? null : round3(winratePercent),
    recency,
    score,
    confidence,
    reasons: dedupeReasons(reasons),
    sources: collectSources(entries),
    roleFit,
    lineupRole: roleContext.starterSlot,
    fromSubstitute: roleContext.fromSubstitute,
  }

  return { signal, championKey: group.championKey, roles, conflicting, isWeakness }
}

function compareSignals(a: ChampionSignal, b: ChampionSignal): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.games !== a.games) return b.games - a.games
  return compareStrings(a.championName.toLowerCase(), b.championName.toLowerCase())
}

/* ==========================================================================
 * 6. Player level
 * ========================================================================== */

function buildDataQuality(
  entries: readonly NormalizedEntry[],
  contexts: readonly SignalContext[],
): ScoutDataQuality {
  const entryCount = entries.length
  const totalGames = entries.reduce((sum, entry) => sum + entry.games, 0)
  const hasCurrentData = entries.some((entry) => entry.recency === "current")
  const notes: ScoutReason[] = []

  let confidence: ScoutConfidence

  if (entryCount === 0) {
    confidence = "none"
    notes.push(reason("no_data"))
  } else if (
    totalGames >= PLAYER_CONF_HIGH_GAMES &&
    entryCount >= PLAYER_CONF_HIGH_ENTRIES &&
    hasCurrentData
  ) {
    confidence = "high"
  } else if (totalGames >= PLAYER_CONF_MEDIUM_GAMES && entryCount >= PLAYER_CONF_MEDIUM_ENTRIES) {
    confidence = "medium"
  } else {
    confidence = "low"
  }

  if (entryCount > 0) {
    if (totalGames < PLAYER_SMALL_SAMPLE_GAMES) {
      notes.push(reason("small_sample", { games: totalGames }))
    }
    if (!hasCurrentData) notes.push(reason("stale_data", { entries: entryCount }))
    else notes.push(reason("played_recently", { entries: entryCount }))
    if (entries.every((entry) => entry.source === "manual")) {
      notes.push(reason("manual_entry_only", { entries: entryCount }))
    }
  }

  // Contradicting rows drag the whole player's data quality down, too.
  if (contexts.some((context) => context.conflicting)) {
    confidence = downgradeConfidence(confidence, entryCount > 0 ? 1 : 0)
  }

  return { entryCount, totalGames, hasCurrentData, confidence, notes }
}

/* ==========================================================================
 * 7. Ban candidates
 * ========================================================================== */

interface MetaEnrichment {
  bonus: number
  reasons: ScoutReason[]
}

function buildMetaEnrichment(
  championKey: string,
  metaByChampion: ReadonlyMap<string, ChampionStats>,
): MetaEnrichment {
  const stats = metaByChampion.get(championKey)
  if (!stats) return { bonus: 0, reasons: [] }

  const sample = stats.picks + stats.bans
  // `presence` is a FRACTION 0–1 in the meta engine — never a percent.
  const presenceFraction = Number.isFinite(stats.presence) ? clamp01(stats.presence) : 0

  if (sample < META_MIN_SAMPLE || presenceFraction < META_MIN_PRESENCE_FRACTION) {
    return { bonus: 0, reasons: [] }
  }

  return {
    bonus: META_BONUS_MAX * presenceFraction,
    reasons: [
      reason("meta_priority", {
        // Explicit unit in the param name so the UI cannot mistake it for a fraction.
        presencePercent: round3(presenceFraction * 100),
        picks: stats.picks,
        bans: stats.bans,
      }),
    ],
  }
}

/**
 * Aggregate role fit over the signals of one candidate, exactly as the contract
 * defines it: `flex` when any signal is flex *or* the signals disagree,
 * `unknown` when none of them can be judged, otherwise the fit they share.
 */
function aggregateRoleFit(signals: readonly ChampionSignal[]): ScoutRoleFit {
  let shared: ScoutRoleFit | null = null

  for (const signal of signals) {
    if (signal.roleFit === "flex") return "flex"
    if (signal.roleFit === "unknown") continue
    if (shared === null) shared = signal.roleFit
    else if (shared !== signal.roleFit) return "flex"
  }

  return shared ?? "unknown"
}

function buildCandidate(
  championName: string,
  championKey: string,
  contexts: readonly SignalContext[],
  metaByChampion: ReadonlyMap<string, ChampionStats>,
  priorityChampionKeys: ReadonlySet<string>,
  starterSlotByPlayerId: ReadonlyMap<ScoutPlayerId, ScoutLineupSlot>,
): BanCandidate {
  const sorted = [...contexts].sort((a, b) => compareSignals(a.signal, b.signal))
  const signals = sorted.map((context) => context.signal)

  const affectedPlayerIds: ScoutPlayerId[] = []
  for (const signal of signals) {
    if (!affectedPlayerIds.includes(signal.playerId)) affectedPlayerIds.push(signal.playerId)
  }

  const knownRoles = new Set<ScoutRole>()
  let sawUnknownRole = false
  for (const context of sorted) {
    for (const role of context.roles) {
      if (role === "unknown") sawUnknownRole = true
      else knownRoles.add(role)
    }
  }
  const roles: ScoutRole[] =
    knownRoles.size > 0
      ? [...knownRoles].sort((a, b) => roleRank(a) - roleRank(b))
      : sawUnknownRole
        ? ["unknown"]
        : []

  const isOverlap = affectedPlayerIds.length > 1
  const isFlex = knownRoles.size > 1

  const bestScore = signals.length > 0 ? signals[0].score : 0
  // Every *additional* player the ban denies adds a discounted share of its own
  // score: two mediocre threats on the same champion beat one equal single one.
  const overlapScore = signals.slice(1).reduce((sum, signal) => sum + signal.score, 0)

  const meta = buildMetaEnrichment(championKey, metaByChampion)
  const userMarked = priorityChampionKeys.has(championKey)

  const priority = round3(
    clamp01(
      bestScore +
        OVERLAP_WEIGHT * overlapScore +
        (isFlex ? FLEX_BONUS : 0) +
        meta.bonus +
        (userMarked ? USER_PRIORITY_BONUS : 0),
    ),
  )

  const reasons: ScoutReason[] = []
  if (isOverlap) {
    // The param is named `count` because both translations of
    // `scout_reason_hits_multiple_players` render `{count}`. It used to be
    // `players`, which `fillPlaceholders()` silently dropped — the sentence then
    // lost the only number it had. See the placeholder guard in
    // tests/scoutAnalysis.test.ts.
    reasons.push(reason("hits_multiple_players", { count: affectedPlayerIds.length }))
  }
  if (isFlex) {
    reasons.push(reason("flex_across_roles", { roles: roles.join(",") }))
  }
  for (const signal of signals) reasons.push(...signal.reasons)
  reasons.push(...meta.reasons)
  if (userMarked) reasons.push(reason("user_marked_priority"))

  // --- who exactly this ban denies, and in which lane --------------------
  // `signals` is sorted by `compareSignals`, so scanning front to back always
  // finds the *strongest* signal of whatever kind is being looked for.
  //
  // SCORE ALONE IS NOT ENOUGH. A strong offrole signal can outscore a weaker
  // onrole one (0.4 × a big number still beats 1.0 × a small one), and naming
  // that player's starting slot then puts a lane in the headline that none of
  // the data supports: "safe ban: Karma against their jungler", built entirely
  // out of support rows. So an onrole signal wins the primary target whenever
  // one exists, and when none exists no lane is claimed at all — the player is
  // still named (the data really is theirs), the lane is not.
  //
  // Without a lineup every `roleFit` is `"unknown"` and `starterSlotByPlayerId`
  // is empty, so this collapses to exactly the previous behaviour: head of the
  // list, `targetRole: null`.
  const onroleSignal = signals.find((signal) => signal.roleFit === "onrole") ?? null
  const targetSignal = onroleSignal ?? (signals.length > 0 ? signals[0] : null)

  const targetPlayerId: ScoutPlayerId | null = targetSignal === null ? null : targetSignal.playerId
  const targetRole: ScoutLineupSlot | null =
    onroleSignal === null ? null : (starterSlotByPlayerId.get(onroleSignal.playerId) ?? null)

  const lineupRoles: ScoutLineupSlot[] = []
  for (const slot of SCOUT_LINEUP_SLOTS) {
    for (const playerId of affectedPlayerIds) {
      if (starterSlotByPlayerId.get(playerId) === slot) {
        lineupRoles.push(slot)
        break
      }
    }
  }

  return {
    championName,
    priority,
    confidence: bestConfidence(signals.map((signal) => signal.confidence)),
    reasons: dedupeReasons(reasons),
    affectedPlayerIds,
    roles,
    signals,
    isOverlap,
    isFlex,
    targetPlayerId,
    targetRole,
    lineupRoles,
    roleFit: aggregateRoleFit(signals),
    substituteOnly: signals.length > 0 && signals.every((signal) => signal.fromSubstitute),
  }
}

function compareCandidates(a: BanCandidate, b: BanCandidate): number {
  if (b.priority !== a.priority) return b.priority - a.priority
  const confidenceDiff = confidenceRank(b.confidence) - confidenceRank(a.confidence)
  if (confidenceDiff !== 0) return confidenceDiff
  if (b.affectedPlayerIds.length !== a.affectedPlayerIds.length) {
    return b.affectedPlayerIds.length - a.affectedPlayerIds.length
  }
  // Final, always-decisive tie-break: reproducible across runs and machines.
  return compareStrings(a.championName.toLowerCase(), b.championName.toLowerCase())
}

function resolvePhase(candidate: BanCandidate): ScoutBanPhase {
  const solid = confidenceRank(candidate.confidence) >= confidenceRank("medium")

  if (
    solid &&
    (candidate.isOverlap || candidate.isFlex || candidate.priority >= PHASE_SAFE_MIN_PRIORITY)
  ) {
    return "safe"
  }
  if (solid && candidate.priority >= PHASE_TARGET_MIN_PRIORITY) return "target"
  return "situational"
}

function splitPhases(candidates: readonly BanCandidate[]): ScoutBanPhases {
  const phases: ScoutBanPhases = { safe: [], target: [], situational: [] }
  for (const candidate of candidates) {
    // `phase` is already set on the candidate by the caller.
    const phase = candidate.phase ?? "situational"
    phases[phase].push(candidate)
  }
  return phases
}

/* ==========================================================================
 * 8. Main entry point
 * ========================================================================== */

/**
 * Analyses the manually collected scout data of an enemy team.
 *
 * Pure and clock-free: no network, no `Date`, no randomness. The result is
 * fully determined by the arguments.
 *
 * @param players    Recognised opponents, in input order. Duplicate ids are
 *                   merged (first occurrence wins) and reported as
 *                   `duplicate_players_merged`.
 * @param playerData Manual rows keyed by `ScoutPlayerId`. A missing key is a
 *                   player without data — never a reason to guess.
 * @param options    Optional pro-meta enrichment and passthroughs. The engine
 *                   is fully functional without them.
 */
export function analyzeScout(
  players: readonly ScoutPlayer[],
  playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>,
  options?: ScoutAnalysisOptions,
): ScoutAnalysisResult {
  const inputPlayers = Array.isArray(players) ? players : []
  const data: Readonly<Record<string, ScoutPlayerData>> =
    playerData && typeof playerData === "object" ? playerData : {}

  // --- dedupe players by id --------------------------------------------
  const uniquePlayers: ScoutPlayer[] = []
  const seenIds = new Set<ScoutPlayerId>()
  let mergedDuplicates = 0

  for (const player of inputPlayers) {
    if (!player || typeof player !== "object") continue
    const id = typeof player.id === "string" ? player.id : ""
    if (id.length === 0) continue
    if (seenIds.has(id)) {
      mergedDuplicates += 1
      continue
    }
    seenIds.add(id)
    uniquePlayers.push(player)
  }

  // --- lineup context ---------------------------------------------------
  // `undefined` means "no lineup known" and switches role awareness off
  // completely. An *empty* lineup object is something else entirely: the user
  // opened the lineup and filled nothing in, which is worth a warning.
  const lineupSummary: ScoutLineupSummary | null =
    options?.lineup === undefined || options.lineup === null
      ? null
      : buildLineupSummary(options.lineup, uniquePlayers)

  const includeSubstitutes = options?.includeSubstitutes === true
  const substituteWeight = normalizeSubstituteWeight(options?.substituteWeight)

  const starterSlotByPlayerId = new Map<ScoutPlayerId, ScoutLineupSlot>()
  for (const row of lineupSummary?.starters ?? []) {
    if (row.playerId !== null) starterSlotByPlayerId.set(row.playerId, row.slot)
  }

  const metaByChampion = new Map<string, ChampionStats>()
  for (const stats of options?.proMeta ?? []) {
    if (!stats || typeof stats.championName !== "string") continue
    const key = normalizeChampionKey(stats.championName)
    if (key.length === 0 || metaByChampion.has(key)) continue
    metaByChampion.set(key, stats)
  }

  const priorityChampionKeys = new Set<string>()
  for (const name of options?.priorityChampions ?? []) {
    if (typeof name !== "string") continue
    const key = normalizeChampionKey(name)
    if (key.length > 0) priorityChampionKeys.add(key)
  }

  const warnings: ScoutWarning[] = []
  const planWarnings: ScoutWarning[] = []

  const playerAnalyses: ScoutPlayerAnalysis[] = []
  /** The subset that actually feeds the plan — see `PlayerRoleContext.scored`. */
  const scoredAnalyses: ScoutPlayerAnalysis[] = []
  const threatContextsByChampion = new Map<string, SignalContext[]>()
  const championDisplayNames = new Map<string, string>()
  const teamWeaknesses: ChampionSignal[] = []

  let sessionEntryCount = 0
  let sessionGames = 0
  let sessionOldGames = 0
  let sessionHasCurrent = false
  let playersWithData = 0
  let sourcesNotFetchable = 0
  let playersWithoutLineupRole = 0
  let offroleSignalCount = 0
  let scoredSubstitutes = 0

  // --- per player -------------------------------------------------------
  for (const player of uniquePlayers) {
    const roleContext = buildRoleContext(
      player,
      lineupSummary,
      includeSubstitutes,
      substituteWeight,
    )

    const entries = normalizeEntries(data[player.id]?.entries)
    const totalGames = entries.reduce((sum, entry) => sum + entry.games, 0)
    const groups = groupByChampion(entries)

    const contexts = groups.map((group) =>
      buildSignalContext(player.id, group, totalGames, entries.length, roleContext),
    )

    // Data quality describes the *rows the user typed*, so it is computed for
    // every player — including a benched one whose signals are not scored.
    const dataQuality = buildDataQuality(entries, contexts)

    // A substitute while `includeSubstitutes` is off is out of scope entirely:
    // no signals, no candidates, no session statistics, no warnings about them.
    // Their rows stay untouched and become scored the moment the user either
    // switches substitutes on or moves them into the starting five.
    const scored = roleContext.scored

    const threatSignals = scored
      ? contexts
          .filter((context) => !context.isWeakness)
          .map((context) => context.signal)
          .sort(compareSignals)
      : []

    const weaknessSignals = scored
      ? contexts
          .filter((context) => context.isWeakness)
          .map((context) => context.signal)
          .sort(compareSignals)
      : []

    if (scored) {
      for (const context of contexts) {
        if (context.isWeakness) continue
        if (context.signal.roleFit === "offrole") offroleSignalCount += 1
        // A zero-score signal is real data but no recommendation — it never
        // becomes a ban candidate.
        if (context.signal.score <= 0) continue

        const list = threatContextsByChampion.get(context.championKey)
        if (list) list.push(context)
        else threatContextsByChampion.set(context.championKey, [context])

        if (!championDisplayNames.has(context.championKey)) {
          championDisplayNames.set(context.championKey, context.signal.championName)
        }
      }

      teamWeaknesses.push(...weaknessSignals)

      sessionEntryCount += entries.length
      sessionGames += totalGames
      sessionOldGames += entries
        .filter((entry) => entry.recency === "old")
        .reduce((sum, entry) => sum + entry.games, 0)
      if (dataQuality.hasCurrentData) sessionHasCurrent = true
      if (entries.length > 0) playersWithData += 1

      if (roleContext.fromSubstitute && threatSignals.length > 0) scoredSubstitutes += 1
      if (roleContext.lineupAware && roleContext.membership === "unassigned" && entries.length > 0) {
        playersWithoutLineupRole += 1
      }

      if (Array.isArray(player.sources)) {
        for (const source of player.sources) {
          if (source && source.status === "not_supported_in_browser") sourcesNotFetchable += 1
        }
      }
    }

    const analysis: ScoutPlayerAnalysis = {
      playerId: player.id,
      displayName: typeof player.displayName === "string" ? player.displayName : player.id,
      role: normalizeRole(player.role),
      signals: threatSignals,
      // Filled in below, once the global candidate list exists.
      targetBans: [],
      dataQuality,
      confidence: dataQuality.confidence,
      weaknesses: weaknessSignals,
      lineup: lineupSummary?.byPlayerId[player.id] ?? {
        playerId: player.id,
        membership: "unassigned",
        starterSlot: null,
        substituteSlot: null,
      },
    }
    playerAnalyses.push(analysis)
    if (scored) scoredAnalyses.push(analysis)

    if (!scored) continue

    // Honesty rule: no data -> no recommendation, but a visible warning.
    if (entries.length === 0) {
      warnings.push({
        code: "player_without_data",
        severity: "warning",
        playerId: player.id,
      })
    }

    for (const context of contexts) {
      if (!context.conflicting) continue
      const conflictWarning: ScoutWarning = {
        code: "conflicting_entries",
        severity: "warning",
        playerId: player.id,
        championName: context.signal.championName,
      }
      warnings.push(conflictWarning)
      planWarnings.push(conflictWarning)
    }
  }

  // --- candidates -------------------------------------------------------
  const candidates: BanCandidate[] = []

  for (const [championKey, contexts] of [...threatContextsByChampion.entries()].sort((a, b) =>
    compareStrings(a[0], b[0]),
  )) {
    const championName = championDisplayNames.get(championKey) ?? championKey
    candidates.push(
      buildCandidate(
        championName,
        championKey,
        contexts,
        metaByChampion,
        priorityChampionKeys,
        starterSlotByPlayerId,
      ),
    )
  }

  const prioritizedBans = candidates.sort(compareCandidates)
  for (const candidate of prioritizedBans) candidate.phase = resolvePhase(candidate)

  const overlapBans = prioritizedBans.filter((candidate) => candidate.isOverlap)

  const targetBansByPlayer: Record<ScoutPlayerId, BanCandidate[]> = {}
  for (const analysis of playerAnalyses) {
    const own = prioritizedBans
      .filter((candidate) => candidate.affectedPlayerIds.includes(analysis.playerId))
      .sort((a, b) => {
        const aScore = a.signals.find((signal) => signal.playerId === analysis.playerId)?.score ?? 0
        const bScore = b.signals.find((signal) => signal.playerId === analysis.playerId)?.score ?? 0
        if (bScore !== aScore) return bScore - aScore
        return compareCandidates(a, b)
      })
    analysis.targetBans = own
    targetBansByPlayer[analysis.playerId] = own
  }

  // --- warnings ---------------------------------------------------------
  const flexCandidates = prioritizedBans.filter((candidate) => candidate.isFlex)
  for (const candidate of flexCandidates) {
    const flexWarning: ScoutWarning = {
      code: "flex_pick_warning",
      severity: "warning",
      championName: candidate.championName,
      params: { roles: candidate.roles.join(",") },
    }
    warnings.push(flexWarning)
    planWarnings.push(flexWarning)
  }

  if (sessionEntryCount > 0 && sessionGames < SESSION_SMALL_SAMPLE_GAMES) {
    const smallSample: ScoutWarning = {
      code: "small_sample_overall",
      severity: "warning",
      params: { games: sessionGames, entries: sessionEntryCount },
    }
    warnings.push(smallSample)
    planWarnings.push(smallSample)
  }

  if (sessionEntryCount > 0 && !sessionHasCurrent) {
    const stale: ScoutWarning = {
      code: "stale_data_overall",
      severity: "warning",
      params: { entries: sessionEntryCount },
    }
    warnings.push(stale)
    planWarnings.push(stale)
  }

  if (sessionGames > 0 && sessionOldGames / sessionGames >= SESSION_OLD_SHARE_WARNING) {
    const shift: ScoutWarning = {
      code: "meta_shift_possible",
      severity: "info",
      params: { oldGames: sessionOldGames, games: sessionGames },
    }
    warnings.push(shift)
    planWarnings.push(shift)
  }

  if (sourcesNotFetchable > 0) {
    warnings.push({
      code: "source_not_fetchable",
      severity: "info",
      params: { sources: sourcesNotFetchable },
    })
  }

  // --- lineup warnings ---------------------------------------------------
  // Raised only when a lineup was actually supplied: without one the engine
  // claimed nothing about roles, so it has nothing to caveat.
  if (lineupSummary !== null) {
    if (lineupSummary.missingStarterSlots.length > 0) {
      const incomplete: ScoutWarning = {
        code: "incomplete_starting_five",
        severity: "warning",
        params: { missing: lineupSummary.missingStarterSlots.length },
      }
      warnings.push(incomplete)
      planWarnings.push(incomplete)
    }

    if (playersWithoutLineupRole > 0) {
      warnings.push({
        code: "player_without_lineup_role",
        severity: "warning",
        params: { count: playersWithoutLineupRole },
      })
    }

    if (offroleSignalCount > 0) {
      const offrole: ScoutWarning = {
        code: "offrole_data_present",
        severity: "warning",
        params: { count: offroleSignalCount },
      }
      warnings.push(offrole)
      planWarnings.push(offrole)
    }

    if (scoredSubstitutes > 0) {
      const substituteRisk: ScoutWarning = {
        code: "substitute_risk_active",
        severity: "info",
        params: { count: scoredSubstitutes },
      }
      warnings.push(substituteRisk)
      planWarnings.push(substituteRisk)
    }
  }

  const duplicatesMerged =
    mergedDuplicates +
    (typeof options?.duplicatesMerged === "number" && Number.isFinite(options.duplicatesMerged)
      ? Math.max(0, Math.floor(options.duplicatesMerged))
      : 0)

  if (duplicatesMerged > 0) {
    warnings.push({
      code: "duplicate_players_merged",
      severity: "info",
      params: { count: duplicatesMerged },
    })
  }

  // --- session confidence ------------------------------------------------
  let confidence: ScoutConfidence = "none"
  if (sessionEntryCount > 0) {
    // Only players that feed the plan may raise or lower its confidence — an
    // excluded substitute is neither evidence for nor a gap in it.
    confidence = bestConfidence(scoredAnalyses.map((analysis) => analysis.confidence))
    const playersWithoutData = scoredAnalyses.length - playersWithData
    if (playersWithoutData > playersWithData) {
      confidence = downgradeConfidence(confidence, 1)
    }
  }

  const banPlan: TeamBanPlan = {
    prioritizedBans,
    targetBansByPlayer,
    overlapBans,
    warnings: planWarnings,
    phases: splitPhases(prioritizedBans),
  }

  const result: ScoutAnalysisResult = {
    players: playerAnalyses,
    banPlan,
    confidence,
    warnings,
    weaknesses: [...teamWeaknesses].sort(compareSignals),
    lineup: lineupSummary,
  }

  // Only ever set from the outside — this module never reads a clock.
  if (options?.generatedAtIso) result.generatedAtIso = options.generatedAtIso

  return result
}

/** Convenience: an empty, well-formed result (e.g. before the first parse). */
export function createEmptyScoutAnalysis(): ScoutAnalysisResult {
  return analyzeScout([], {})
}
