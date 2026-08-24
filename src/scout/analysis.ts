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
 *   raw       = WEIGHT_VOLUME * volumeScore
 *             + WEIGHT_WINRATE * dampedWinrate
 *             + WEIGHT_SHARE  * shareScore                   (weights sum to 1)
 *   baseScore = clamp01(raw * recencyWeight * conflictPenalty), 0 when games <= 0
 *
 *   statStrength = championStatStrengthMultiplier({ games, winrate, kda })
 *                  One extra, two-sided bounded factor (section 3b). It closes
 *                  the two gaps `baseScore` leaves open: experience above
 *                  SCOUT_TARGET_GAMES is flat there (20, 70 and 300 games used
 *                  to score identically), and the KDA the import collects did
 *                  not enter the scoring at all. The winrate and KDA parts are
 *                  scaled by the *same* `sampleConfidence`, so a tiny sample
 *                  can only ever move the factor a few percent.
 *
 *   score = round3(clamp01(clamp01(baseScore * statStrength) * roleWeight))
 *           THE BRACKETING IS THE INVARIANT, not decoration: `statStrength`
 *           reaches 1.2, so `baseScore * statStrength` can exceed 1 and the
 *           outer `clamp01` would then bind on the ONROLE side only — the
 *           offrole side, scaled by 0.4, never comes near the ceiling. That
 *           lifts score(offrole)/score(onrole) above OFFROLE_SCORE_WEIGHT
 *           (measured up to 0.477 before this was fixed, i.e. the offrole
 *           damping quietly weakened by a fifth exactly where the numbers are
 *           strongest). Clamping the stat-weighted base FIRST makes both sides
 *           share one and the same saturated base, so the ratio is again
 *           exactly `roleWeight` for every input. Do not "simplify" this into a
 *           single product — that is the bug, not a shorter spelling of it.
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
import { championIdentity, championIdentityKey } from "./championIdentity"
import type { ChampionStats, Role } from "../domain/types"
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
  ScoutRankTier,
  ScoutRole,
  ScoutRoleFit,
  ScoutRoleGateSummary,
  ScoutRoleViability,
  ScoutRoleViabilityEvidence,
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

/* --- champion stat strength (games / winrate / KDA) -----------------------
 *
 * THE PROBLEM THESE NUMBERS SOLVE:
 * `volumeScore` saturates completely at SCOUT_TARGET_GAMES, so 20, 70 and 300
 * games on the same winrate used to produce the *identical* score — experience
 * beyond 20 games was worth exactly nothing. And the KDA the import collects
 * did not enter the scoring at all. `championStatStrengthMultiplier()` below
 * closes both gaps with ONE extra factor on the signal score.
 *
 * THREE PROPERTIES OF THE DESIGN, all deliberate:
 *  - The small-sample brake is BUILT IN, not a special case: the winrate and
 *    KDA effects are scaled by `sampleConfidence(games, SCOUT_TARGET_GAMES)`,
 *    the very same curve `volumeScore` uses. "1 game, 100 %, KDA 8" therefore
 *    moves the factor by a few percent at most — structurally, without an `if`.
 *  - MULTIPLICATIVE, and applied to the base score *before*
 *    `roleAdjustment.weight`, with a `clamp01` in between. An additive bonus
 *    would partly bypass the offrole damping; multiplying into the already
 *    saturated base keeps `score(offrole) / score(onrole)` exactly at
 *    OFFROLE_SCORE_WEIGHT. Multiplying *after* the role weight does NOT: the
 *    ceiling then trims the onrole side alone and the ratio drifts upward (see
 *    the score formula in the module header).
 *  - Every single factor is clamped on both sides, and the product is clamped
 *    again — three bonuses can never compound into an unbounded push.
 */

/** Games at which the experience factor is exactly 1.0. Bewusst identical to
 *  {@link SCOUT_TARGET_GAMES}: that is precisely where `volumeScore` stops
 *  rewarding more games, so this curve takes over without a step. */
const SCOUT_GAMES_IMPACT_NEUTRAL_GAMES = 20

/** Slope on the log axis. 0.12 is chosen so that ~265 games just reach the cap:
 *  the saturation comes out of the curve, not only out of the clamp. 80 → 300
 *  games is worth a mere +4.4 % — visible, but unmistakably saturated. */
const SCOUT_GAMES_IMPACT_SLOPE = 0.12

/** Upper bound: raw game count is never worth more than +10 %. */
const SCOUT_GAMES_IMPACT_MAX = 1.1

/** Lower bound: a one-game sample loses at most 10 %. Harder would punish it
 *  twice — `volumeScore` and `dampedWinrate` already brake small samples inside
 *  the base score. */
const SCOUT_GAMES_IMPACT_MIN = 0.9

/** Winrate that carries no information. Identical to
 *  {@link NEUTRAL_WINRATE_FRACTION} on purpose — two different zero points for
 *  the same quantity in one module would be a maintenance trap. */
const SCOUT_WINRATE_NEUTRAL_PERCENT = 50

/** Percentage points above/below neutral at which the winrate cap is reached.
 *  15 points = 65 % / 35 %, already the top/bottom end of real scout pools. */
const SCOUT_WINRATE_IMPACT_SPAN_PERCENT = 15

/** Largest winrate bonus (+12 %) — the strongest of the three single factors,
 *  because winrate is the most direct measure of success. Above 65 % nothing
 *  more happens: the difference between 70 % and 80 % is sample noise here. */
const SCOUT_WINRATE_BOOST_CAP = 1.12

/** Largest winrate penalty (−15 %). Deliberately not harsher: a weak champion
 *  is valuable *as a weakness* and must not be damped into invisibility. */
const SCOUT_WINRATE_PENALTY_FLOOR = 0.85

/** KDA that is neither good nor bad — the usual middle of a solo-queue champion
 *  list. At exactly this value the KDA factor is exactly 1.0. */
const SCOUT_KDA_NEUTRAL = 2.5

/** From here upwards the KDA bonus sits at its cap. 4.5 and 8.0 are therefore
 *  worth the same: the difference between them is not carried by scout samples. */
const SCOUT_KDA_STRONG = 4.5

/** From here downwards the KDA penalty sits at its floor. `0` and `1.0` are
 *  both simply "bad"; a finer resolution down there would be invented. */
const SCOUT_KDA_WEAK = 1

/** Largest KDA bonus (+10 %) — smaller than the winrate bonus because KDA is
 *  ROLE-DEPENDENT (a support KDA is structurally higher than a top KDA) and the
 *  multiplier does not know the role. */
const SCOUT_KDA_BOOST_CAP = 1.1

/** Largest KDA penalty (−10 %). Symmetric to the bonus: KDA should order the
 *  list, not exclude anybody from it. */
const SCOUT_KDA_PENALTY_FLOOR = 0.9

/** Above this a "KDA" is a parse accident (OP.GG prints "Perfect KDA"), not a
 *  ratio → scored neutrally instead of as an outlier.
 *
 *  EXPORTED so the manual editor can refuse the same values rather than keep a
 *  second, drifting bound of its own (`parseKdaInput()` in
 *  src/components/scout/scoutUiHelpers.ts). A typed-in 500 that the scoring
 *  silently reads as "not stated" is worse than a rejected one: the user sees a
 *  number sitting in the row and believes it counts. */
export const SCOUT_KDA_MAX_PLAUSIBLE = 100

/** Lower bound of the combined factor. 0.75 rather than, say, 0.5 because a
 *  weak champion has to stay visible — the weakness list is ordered by this very
 *  score. NOTE: this bound never actually binds today (the measured effective
 *  minimum is ≈0.765). It is a safety net against future constant changes, not
 *  an active limit; do not "tune" it expecting an effect. */
const SCOUT_STAT_MULTIPLIER_MIN = 0.75

/** Upper bound of the combined factor. The product of the three single caps
 *  would be 1.355; 1.20 stops three bonuses from compounding into a practically
 *  unbounded push.
 *
 *  WHAT THIS CAP DOES **NOT** DO — an earlier version of this comment claimed
 *  it keeps the top end below the `clamp01` ceiling "so ranking survives up
 *  there". That is false and was measured: over the 1320-combination matrix of
 *  section 10 in tests/scoutStatWeighting.test.ts, 82 combinations (6.2 %) land
 *  exactly on 1.000 — `soloScore(200, 100, 6)` and `soloScore(300, 100, 8)` are
 *  both 1.000 and are no longer distinguishable. At the very top, extreme lines
 *  MERGE, because every boost runs into a hard ceiling.
 *
 *  Why that is accepted rather than re-curved: the merge zone starts at roughly
 *  82 % winrate on a solid sample (below 80 % nothing in the sweep reaches
 *  1.000 at all — the best value there is 0.996), and it needs a strong KDA on
 *  top. Those are outliers, not ban candidates you have to sort: the picks the
 *  ban plan actually orders sit well underneath (70g/61%/KDA 3.2 → 0.901,
 *  120g/66%/KDA 4.5 → 0.937, 300g/73%/KDA 7.7 → 0.967) and keep their order.
 *  And a champion at 1.000 is banned regardless of who else is at 1.000. */
const SCOUT_STAT_MULTIPLIER_MAX = 1.2

/** How far a single factor has to exceed 1.0 before it earns a reason line. A
 *  factor of 1.005 is noise, not a statement. Measured derived thresholds:
 *  `many_games_on_champion` from 44 games (43 → 1.029), `strong_kda` from KDA
 *  3.1 at a full sample and 3.27 at the `SOLID_SAMPLE_GAMES` floor — the sample
 *  scaling raises the bar for thin data all by itself. Those numbers
 *  deliberately get NO constants of their own: they would be a second truth
 *  that silently drifts apart the moment a cap changes. */
const SCOUT_STAT_REASON_MIN_IMPACT = 1.03

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
/**
 * Weight for a champion that is not plausibly played in the lane it was filed
 * under. Harder than {@link OFFROLE_SCORE_WEIGHT} because the statement is
 * stronger: off-role says "this player plays it elsewhere", not playable says
 * "essentially nobody plays it here". The row is damped, never deleted, and the
 * real protection is that it is withheld from ban candidacy entirely.
 */
const ROLE_NOT_PLAYABLE_SCORE_WEIGHT = 0.15
const ROLE_UNCERTAIN_SCORE_WEIGHT = 0.8

/**
 * Rank weights, keyed by tier. A total `Record`, so a new
 * {@link ScoutRankTier} member without a weight is a COMPILE error rather than
 * a tier that silently scores neutral.
 *
 * Platinum and `unranked` both sit at exactly 1.0: platinum is the pivot the
 * spread is built around, and `unranked` must not move a score at all.
 */
const RANK_IMPACT_WEIGHTS: Readonly<Record<ScoutRankTier, number>> = {
  unranked: 1,
  iron: 0.8,
  bronze: 0.85,
  silver: 0.9,
  gold: 0.95,
  platinum: 1,
  emerald: 1.05,
  diamond: 1.1,
  master: 1.16,
  grandmaster: 1.21,
  challenger: 1.25,
}

/** Above this rank multiplier the score change is worth a reason on screen. */
const RANK_REASON_MIN_IMPACT = 1.05

/**
 * Minimum absolute picks in a role before the reference data is allowed to call
 * that role playable.
 *
 * MEASURED, not guessed. Over this repo's dataset (24,978 matches / 249,780
 * picks) every (champion, role) pair with 15 or more picks is spread across at
 * least 5 players, 3 regions and 3 patches, while no pair with 4 or fewer picks
 * is. 15 is that cliff edge. Below it the check starts admitting single-player
 * pocket picks, e.g. Heimerdinger bot: 11 picks, 19 % share, ONE player.
 */
const ROLE_VIABILITY_MIN_PICKS = 15

/**
 * Minimum share of a champion's picks in a role before that role counts.
 *
 * Also measured, and it exists for a failure mode the pick floor cannot catch:
 * a very popular champion accumulates a thin spray of wrong-role picks across
 * many players, so it clears any absolute floor. At 1.25 % the split is clean.
 * Below it sit Nautilus jungle (0.21 %), Corki top (0.24 %), Taliyah bot
 * (0.32 %), K'Sante mid (0.57 %) and Sylas support (1.03 %), all wrong; just
 * above it sit Renekton mid (1.20 %), Kai'Sa mid (1.28 %), Trundle top
 * (1.34 %), Lee Sin top (1.43 %) and Wukong top (1.49 %), all real.
 */
const ROLE_VIABILITY_MIN_SHARE = 0.0125

/**
 * A champion needs at least this many picks IN TOTAL before the reference is
 * allowed to call any of its roles implausible.
 *
 * Derived, not picked: a role only counts as viable at
 * {@link ROLE_VIABILITY_MIN_PICKS} picks, and a legitimate secondary role sits
 * at roughly a fifth of a champion's games, so below `15 / 0.2 = 75` total picks
 * a real secondary role CANNOT clear the bar however normal it is. An
 * `implausible` verdict there is an artefact of the champion being rare in the
 * reference, not evidence about the role.
 *
 * The reference is PRO play while the scouted numbers come from solo queue, and
 * that gap is exactly where this bites. Measured on the shipped dataset, without
 * this floor: Warwick jungle (39 picks total, 18 % share), Talon mid (34, 21 %),
 * Kayle mid (44, 16 %) and Master Yi top (9, 22 %) all came out `implausible` —
 * every one of them a standard solo-queue role, and each verdict silently
 * removed that champion from the ban plan. 29 of 172 champions are below the
 * floor and are now simply not judged.
 *
 * It costs the gate nothing where it matters: every champion the gate exists to
 * catch is a popular one. Karma has 2254 picks, Lulu 1705, Nautilus 7024.
 */
const ROLE_VIABILITY_MIN_TOTAL_PICKS = 75

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
  /** KDA ratio, or null when the row stated none. `0` is a real bad value and
   *  is NOT the same as null — see {@link normalizeKda}. */
  kda: number | null
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

/** Generic two-sided clamp. Non-finite input collapses to `min`, mirroring the
 *  defensive stance of {@link clamp01} — a NaN must never escape as a factor. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
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

/**
 * Champion grouping key, shared with the stats import via
 * src/scout/championIdentity.ts.
 *
 * It used to be `trim().toLowerCase()` plus whitespace collapsing, which KEPT
 * punctuation and never consulted the champion catalog. `Kai'Sa` and `KaiSa`
 * were therefore two different champions to this engine, which split one ban
 * candidate in two and, far worse than the cosmetics, destroyed the overlap:
 * `isOverlap` went false, `overlapBans` came back empty, and the overlap
 * priority bonus plus the `hits_multiple_players` reason were forfeited. A
 * champion two opponents both play was ranked as two weaker single threats.
 *
 * `championIdentityKey`, not the bare `championLookupKey`: the latter strips
 * every character outside `a-z0-9` and therefore returns the EMPTY STRING for a
 * name written in a non-Latin script or in pure punctuation. Every such name
 * then compares equal to every other. The signal keys already went through
 * `championIdentity()` and were safe; this is the reference/meta side, and
 * having two definitions of champion identity in one module is exactly the trap
 * the `ScoutManualSource` triplication left behind.
 */
function normalizeChampionKey(name: string): string {
  return championIdentityKey(name)
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
 * A KDA is usable when it is a finite, non-negative number no larger than
 * {@link SCOUT_KDA_MAX_PLAUSIBLE}. Everything else — missing, `null`, `NaN`,
 * negative, a "Perfect KDA" parse accident — becomes `null` = "not stated",
 * which the scoring treats as exactly neutral.
 *
 * `0` SURVIVES ON PURPOSE. It is a value a source really printed (no kills, no
 * assists) and it has to stay distinguishable from "not stated"; the field doc
 * on `ManualChampionEntry.kda` spells out why. Dropping the implausible values
 * here rather than only inside `kdaImpactMultiplier()` matters for a second
 * reason: a single `999` row would otherwise poison the games-weighted average
 * in {@link aggregateKda} for every other row of the same champion.
 */
function normalizeKda(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 0 || value > SCOUT_KDA_MAX_PLAUSIBLE) return null
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
 * 3b. Champion stat strength — games / winrate / KDA
 *
 * Four pure functions, exported so they can be pinned down directly by tests
 * instead of only through the score they end up in. All four are total: they
 * return a finite number for every input, including `null`, `undefined`, `NaN`
 * and nonsense magnitudes.
 *
 * THE ONE RULE THAT MUST NOT BE SOFTENED: a value that was never stated scores
 * EXACTLY 1.0 (neutral), while a value that was stated as `0` is a real, bad
 * value and scores below 1.0. `!kda` and `kda ?? 0` both collapse precisely the
 * two cases that have to stay apart — see the `kda` field doc on
 * `ManualChampionEntry` in src/scout/types.ts.
 * ========================================================================== */

/**
 * Experience factor: saturating, clamped on both sides, exactly 1.0 at
 * {@link SCOUT_GAMES_IMPACT_NEUTRAL_GAMES}.
 *
 * This is the factor that reopens the range above `SCOUT_TARGET_GAMES`, where
 * `volumeScore` is flat. It is intentionally the *only* one of the three that
 * is not scaled by sample confidence: it already *is* a statement about the
 * sample size, so damping it by the sample size would be circular.
 *
 * No games (or junk) is not "few games", it is "no evidence" — the base score
 * already zeroes such a signal, so the factor stays neutral at 1.0.
 */
export function gamesImpactMultiplier(games: number): number {
  if (typeof games !== "number" || !Number.isFinite(games) || games <= 0) return 1
  const relative = Math.log(1 + games) / Math.log(1 + SCOUT_GAMES_IMPACT_NEUTRAL_GAMES)
  return clamp(
    1 + (relative - 1) * SCOUT_GAMES_IMPACT_SLOPE,
    SCOUT_GAMES_IMPACT_MIN,
    SCOUT_GAMES_IMPACT_MAX,
  )
}

/**
 * Winrate factor: works only as far as the sample carries it.
 *
 * The scaling by `sampleConfidence(games, SCOUT_TARGET_GAMES)` is the whole
 * point — it reuses the module's existing sample convention rather than
 * inventing a second one, and it is what keeps "80 % on 5 games" from
 * outweighing "61 % on 70 games". A missing or unusable winrate returns exactly
 * 1.0: absence of evidence must not become a penalty.
 */
export function winrateImpactMultiplier(
  winratePercent: WinratePercent | null | undefined,
  games: number,
): number {
  if (winratePercent === null || winratePercent === undefined) return 1
  if (typeof winratePercent !== "number" || !Number.isFinite(winratePercent)) return 1
  if (winratePercent < MIN_WINRATE_PERCENT || winratePercent > MAX_WINRATE_PERCENT) return 1

  const confidence = clamp01(sampleConfidence(games, SCOUT_TARGET_GAMES))
  if (confidence <= 0) return 1

  const delta = clamp(
    (winratePercent - SCOUT_WINRATE_NEUTRAL_PERCENT) / SCOUT_WINRATE_IMPACT_SPAN_PERCENT,
    -1,
    1,
  )
  return delta >= 0
    ? 1 + delta * confidence * (SCOUT_WINRATE_BOOST_CAP - 1)
    : 1 + delta * confidence * (1 - SCOUT_WINRATE_PENALTY_FLOOR)
}

/**
 * KDA factor, scaled by the same sample confidence as the winrate factor.
 *
 * `null` / `undefined` / `NaN` / negative / implausibly large all mean "not
 * stated" and return EXACTLY 1.0. `0` does not: it is a value the source really
 * printed, and it is scored — as far as the sample carries it. Precisely: a
 * stated `0` reaches {@link SCOUT_KDA_PENALTY_FLOOR} (0.9) only at FULL sample
 * confidence, i.e. from SCOUT_TARGET_GAMES upwards; at 10 games it is 0.921, at
 * 1 game 0.977, and at `games <= 0` it is exactly 1.0 because there is no
 * sample to believe at all. Same scaling as every other part of this factor —
 * the floor is where the curve ends, not where it starts.
 *
 * That `0` vs. "not stated" distinction is the reason this function tests for
 * `null`/`undefined` explicitly and never for falsiness.
 */
/**
 * How much a player's stated rank weighs their data up or down.
 *
 * NEUTRAL IS THE IMPORTANT CASE. An absent field (`undefined`), an explicit
 * `null` and an unrecognised value all return EXACTLY 1.0, so every player
 * scouted before 0.7.0 and every player nobody typed a rank for scores exactly
 * as before. `"unranked"` is also 1.0, but it arrives here as a different
 * value on purpose: it is the user SAYING there is no rank, while absence is
 * nobody saying anything. They must not be collapsed in code, the same way
 * `kda: 0` and `kda: null` must not be (see {@link normalizeKda}).
 *
 * The spread is deliberately narrow, 0.80 to 1.25. Rank MODULATES the evidence;
 * it never replaces it. A Challenger with two games still loses to a Gold
 * player with forty, because `sampleConfidence` runs first and this factor
 * cannot undo it. And rank can never rescue a champion the role gate has
 * withheld, because such a signal never becomes a ban candidate at all.
 */
export function rankImpactMultiplier(rankTier: ScoutRankTier | null | undefined): number {
  // Explicit two-way check. `!rankTier` would fold "" into the same branch and,
  // worse, invites the next reader to treat absence and `"unranked"` as one.
  if (rankTier === null || rankTier === undefined) return 1
  const weight = RANK_IMPACT_WEIGHTS[rankTier]
  return typeof weight === "number" ? weight : 1
}

/**
 * Apply a rank strength to an already normalised 0-1 score.
 *
 * NOT a plain multiplication, and that is the whole point. `baseScore` for any
 * solid signal already sits at 0.85 to 0.99, so multiplying by up to 1.25 ran
 * straight into `clamp01`: measured over a 245-point grid, a Challenger team
 * had 87 % of its signals pinned at exactly 1.000 and a Diamond team 53 %,
 * against 0 % without a rank. Pinned scores tie, and `compareCandidates` then
 * falls through to its alphabetical tie-break, so the ban plan of a strong team
 * came out sorted by champion NAME: the clearly strongest pick (120 games,
 * 71 %, KDA 4.6) dropped from first to fourth behind three weaker ones. The
 * feature broke exactly the case it exists for.
 *
 * The saturating form has the four properties the plain product lacks:
 *
 *  - `strength === 1` is the EXACT identity, so an unranked or unstated player
 *    scores bit-for-bit as before 0.7.0. Neutrality is arithmetic, not a
 *    special case.
 *  - strictly increasing in `value`, so it can never create a tie that the
 *    input did not have. The ban order stays the score's order.
 *  - the result is always inside 0-1, so the outer `clamp01` never binds and
 *    the off-role quotient stays exactly `roleAdjustment.weight`.
 *  - increasing in `strength`, so a higher rank still ranks higher.
 *
 * It moves a score toward 1 rather than past it: the head room a signal has
 * left is what gets compressed, which is also the honest reading of what a rank
 * says. It sharpens a judgement, it does not add evidence.
 */
export function applyRankStrength(value: number, strength: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(strength)) return clamp01(value)
  if (strength === 1) return clamp01(value)

  const bounded = clamp01(value)
  // `1 - (1 - x) ** s`. Both endpoints are fixed points, so 0 stays 0 and 1
  // stays 1 for every strength.
  return clamp01(1 - Math.pow(1 - bounded, strength))
}

export function kdaImpactMultiplier(kda: number | null | undefined, games: number): number {
  if (kda === null || kda === undefined) return 1
  if (typeof kda !== "number" || !Number.isFinite(kda)) return 1
  if (kda < 0 || kda > SCOUT_KDA_MAX_PLAUSIBLE) return 1

  const confidence = clamp01(sampleConfidence(games, SCOUT_TARGET_GAMES))
  if (confidence <= 0) return 1

  if (kda >= SCOUT_KDA_NEUTRAL) {
    const reach = Math.min(1, (kda - SCOUT_KDA_NEUTRAL) / (SCOUT_KDA_STRONG - SCOUT_KDA_NEUTRAL))
    return 1 + reach * confidence * (SCOUT_KDA_BOOST_CAP - 1)
  }
  const reach = Math.min(1, (SCOUT_KDA_NEUTRAL - kda) / (SCOUT_KDA_NEUTRAL - SCOUT_KDA_WEAK))
  return 1 - reach * confidence * (1 - SCOUT_KDA_PENALTY_FLOOR)
}

/**
 * The combined, two-sided bounded factor applied to a signal score.
 *
 * Clamping the product a second time is not belt-and-braces: the three single
 * caps multiply to 1.355, and capping at 1.20 keeps three simultaneous bonuses
 * from compounding into a practically unbounded push. It does NOT keep the
 * result out of the `clamp01` ceiling — extreme lines do merge at 1.000, and
 * {@link SCOUT_STAT_MULTIPLIER_MAX} documents exactly where that starts and why
 * it is accepted.
 */
/**
 * One champion's role evidence, distilled from a {@link ChampionStats} row.
 * `picksByRole` is absolute; `shareByRole` is that role's share of the
 * champion's picks (0 to 1).
 */
interface ChampionRoleEvidence {
  picks: number
  picksByRole: Readonly<Record<Role, number>>
  shareByRole: Readonly<Record<Role, number>>
  /** The champion's most-played role, or `null` when it has no picks at all. */
  primaryRole: Role | null
}

/** Champion-key-indexed role evidence. Built once per `analyzeScout()` call. */
export type ChampionRoleIndex = ReadonlyMap<string, ChampionRoleEvidence>

/**
 * Index `ScoutAnalysisOptions.championRoleReference` for lookup by champion key.
 *
 * Exported so a test can build one directly instead of going through the whole
 * engine. Rows without a usable champion name or without picks are skipped: a
 * champion nobody has played says nothing about which roles it can be played in,
 * and pretending otherwise would let the gate fire on no evidence.
 */
export function buildChampionRoleIndex(
  reference: readonly ChampionStats[] | undefined,
): ChampionRoleIndex {
  const index = new Map<string, ChampionRoleEvidence>()
  if (!Array.isArray(reference)) return index

  for (const stats of reference) {
    if (!stats || typeof stats.championName !== "string") continue
    const key = normalizeChampionKey(stats.championName)
    if (key.length === 0 || index.has(key)) continue

    const picks = typeof stats.picks === "number" && Number.isFinite(stats.picks) ? stats.picks : 0
    if (picks <= 0) continue

    const distribution = stats.roleDistribution
    if (!distribution || typeof distribution !== "object") continue

    const picksByRole = {} as Record<Role, number>
    const shareByRole = {} as Record<Role, number>
    let primaryRole: Role | null = null
    let bestShare = -1

    for (const role of SCOUT_LINEUP_SLOTS) {
      const rawShare = distribution[role]
      const share = typeof rawShare === "number" && Number.isFinite(rawShare) ? rawShare : 0
      shareByRole[role] = share
      // ROUNDED, because this is a lossy inverse: `roleDistribution` is itself
      // `roleCount / picks`, so `share * picks` can land a whisker below the
      // integer it came from. Measured: a real count of exactly 15 undershoots
      // to 14.999999999999998 for 11 % of pick totals, which flips the verdict
      // at exactly the documented 15-pick boundary. The shares are exact
      // integer quotients, so rounding recovers the original count.
      picksByRole[role] = Math.round(share * picks)
      if (share > bestShare) {
        bestShare = share
        primaryRole = role
      }
    }

    // A row whose shares are all zero carries no evidence about any role. With
    // `bestShare` starting below zero the first slot would otherwise win by
    // default and the gate would assert "top is viable" out of nothing.
    if (bestShare <= 0) {
      primaryRole = null
    }

    index.set(key, { picks, picksByRole, shareByRole, primaryRole })
  }

  return index
}

/**
 * Is this champion plausibly played in this role?
 *
 * The rule, and every part of it is load-bearing:
 *
 *   viable = (picksInRole >= 15 && roleShare >= 1.25 %) || role === primaryRole
 *
 * The primary-role fallback is NOT a nicety. Without it six champions in this
 * repo's dataset come out with ZERO viable roles despite unambiguous data,
 * because their total sample is tiny: Evelynn (12 picks, 100 % jungle), Master
 * Yi (7 of 9 jungle), Rammus (11 of 14 jungle), Shaco (12 of 18 jungle), Teemo
 * (7 of 9 top), Fizz (4 of 5 mid). Declaring Evelynn unplayable everywhere is a
 * far worse product error than allowing one marginal extra role.
 *
 * THE ERRORS ARE ASYMMETRIC AND THE THRESHOLDS ARE TUNED FOR THAT. Telling a
 * user "Karma jungle is a fine ban" is much worse than staying quiet about a
 * rare pick, so the rule is set for zero false `implausible` verdicts: measured
 * against a 107-pair hand-labelled set it produced 0 false positives and 4 false
 * negatives, and all four remaining misses are genuinely marginal in pro play.
 *
 * `"unknown"` is returned whenever no verdict is possible, and it means exactly
 * what the engine did before 0.7.0: no gate, no damping, no claim either way.
 */
export function championRoleViability(
  index: ChampionRoleIndex,
  championKey: string,
  role: ScoutRole,
): ScoutRoleViability {
  return evaluateChampionRoleViability(index, championKey, role).status
}

/**
 * The same verdict, plus the numbers it was made from.
 *
 * `championRoleViability()` above is a projection of this, so there is one rule
 * and not two that can drift. Every early return here already had its evidence
 * in hand and used to throw it away, which is why the UI could only say "not
 * playable" without ever showing what that judgement rested on.
 *
 * PURE DIAGNOSIS: nothing scores off the returned numbers. A measurement field
 * is omitted rather than zeroed when it was never measured, because "no
 * reference data" and "zero picks" are different statements.
 */
export function evaluateChampionRoleViability(
  index: ChampionRoleIndex,
  championKey: string,
  role: ScoutRole,
): ScoutRoleViabilityEvidence {
  const base = { status: "unknown", evaluatedRole: role } as const

  // No reference data at all: the gate is off, not permissive.
  if (index.size === 0) return { ...base, reason: "reference_missing" }
  // No lane to judge against.
  if (role === "unknown") return { ...base, reason: "role_unknown" }

  const evidence = index.get(championKey)
  // A champion the reference does not cover is not a champion we may judge.
  if (evidence === undefined) return { ...base, reason: "champion_missing" }

  const thresholds = {
    totalPicks: evidence.picks,
    minPicksInRole: ROLE_VIABILITY_MIN_PICKS,
    minRoleShare: ROLE_VIABILITY_MIN_SHARE,
    ...(evidence.primaryRole === null ? {} : { primaryRole: evidence.primaryRole }),
  }

  // Nor is one the reference barely covers: see
  // {@link ROLE_VIABILITY_MIN_TOTAL_PICKS}. Errors here are asymmetric, and a
  // false "not playable" silently deletes a real ban candidate.
  if (evidence.picks < ROLE_VIABILITY_MIN_TOTAL_PICKS) {
    return { ...base, ...thresholds, reason: "sample_too_small" }
  }

  const picksInRole = evidence.picksByRole[role] ?? 0
  const share = evidence.shareByRole[role] ?? 0
  const measured = { ...thresholds, picksInRole, roleShare: share }

  if (evidence.primaryRole === role) {
    return { status: "viable", evaluatedRole: role, ...measured, reason: "primary_role_fallback" }
  }

  const clears = picksInRole >= ROLE_VIABILITY_MIN_PICKS && share >= ROLE_VIABILITY_MIN_SHARE
  return {
    status: clears ? "viable" : "implausible",
    evaluatedRole: role,
    ...measured,
    reason: clears ? "viable" : "below_threshold",
  }
}

export function championStatStrengthMultiplier(input: {
  games: number
  winrate?: WinratePercent | null
  kda?: number | null
}): number {
  const product =
    gamesImpactMultiplier(input.games) *
    winrateImpactMultiplier(input.winrate ?? null, input.games) *
    kdaImpactMultiplier(input.kda ?? null, input.games)
  return clamp(product, SCOUT_STAT_MULTIPLIER_MIN, SCOUT_STAT_MULTIPLIER_MAX)
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

    // The catalog decides both the grouping key and the spelling on screen,
    // so two users typing `kaisa` and `Kai'Sa` produce ONE champion here and
    // one row in the ban plan. An unresolved name keeps its own spelling and
    // is never bent onto a catalog neighbour.
    const identity = championIdentity(rawName)

    result.push({
      championKey: identity.key,
      championName: identity.displayName,
      games: normalizeGames(entry.games),
      winratePercent: normalizeWinratePercent(entry.winrate),
      kda: normalizeKda(entry.kda),
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

/**
 * Games-weighted KDA over the rows of one champion — deliberately the same
 * shape as {@link aggregateWinratePercent}, because it answers the same kind of
 * question and a second averaging convention in one module would be a trap.
 *
 * ROWS WITHOUT A KDA DO NOT CONTRIBUTE AT ALL. They are skipped, not counted as
 * `0` and not counted as a neutral 2.5 either — both would drag the result
 * toward a value nobody stated. Concretely: a champion with one imported row
 * (40 games, KDA 4.2) and one hand-typed row (10 games, no KDA) aggregates to
 * 4.2, exactly what the one row that *has* a KDA says. Only when NO row states
 * one does this return `null`, which scores exactly neutral.
 *
 * The `plainCount` fallback mirrors the winrate aggregate: rows can legitimately
 * carry a KDA while carrying 0 games, and a 0-games row must not be punished
 * twice by silently losing its value here as well.
 */
function aggregateKda(entries: readonly NormalizedEntry[]): number | null {
  let weightedSum = 0
  let weight = 0
  let plainSum = 0
  let plainCount = 0

  for (const entry of entries) {
    if (entry.kda === null) continue
    plainSum += entry.kda
    plainCount += 1
    if (entry.games > 0) {
      weightedSum += entry.kda * entry.games
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
  /**
   * The rank the user stated for this player, or `null`/`undefined` when nobody
   * did. Passed through untouched so {@link rankImpactMultiplier} can keep
   * absence and `"unranked"` apart.
   */
  rankTier: ScoutRankTier | null | undefined
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
      rankTier: player.rankTier,
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
    rankTier: player.rankTier,
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
  viability: ScoutRoleViability,
  championName: string,
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

  // The role GATE, applied after the role-FIT switch above because it answers a
  // different question. Fit compares two labels and can read `onrole` for a
  // champion nobody plays in that lane, because an import stamps every row with
  // the role the USER chose ("die gewaehlte Rolle gewinnt immer"). That is
  // exactly how a support main moved to the jungle got his support pool offered
  // as jungle bans. Viability asks whether the champion is played there at all.
  if (viability === "implausible") {
    weight = Math.min(weight, ROLE_NOT_PLAYABLE_SCORE_WEIGHT)
    maxConfidence = "low"
    // "The rows say this lane and the lineup agrees" is worthless next to "and
    // nobody plays this champion there", and its text ("Ein Ban trifft genau
    // diese Lane.") flatly contradicts the verdict. `offrole_signal` and
    // `role_unknown_or_flex` stay: they point the same way as the gate.
    const onroleIndex = reasons.findIndex((item) => item.code === "onrole_signal")
    if (onroleIndex !== -1) reasons.splice(onroleIndex, 1)
    reasons.push(
      reason("champion_not_playable_in_role", {
        champion: championName,
        role: lineupRole,
      }),
    )
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
  roleIndex: ChampionRoleIndex,
): SignalContext {
  const entries = group.entries
  const games = entries.reduce((sum, entry) => sum + entry.games, 0)
  const winratePercent = aggregateWinratePercent(entries)
  const kda = aggregateKda(entries)
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
  // Judged against the lane this player will actually be in, not against the
  // role the rows happen to carry. Without a lineup role there is nothing to
  // judge and the verdict is `"unknown"`.
  // A PLAYER IN NO SLOT IS NEVER JUDGED, and that check runs first, exactly as
  // in `resolveRoleFit`. For anyone who is not a starter `referenceRole` falls
  // back to `ScoutPlayer.role`, which is nothing but the link parser's guess
  // (CLAUDE.md P4 documents how lossy that guess is). Gating on a guess dropped
  // the top-scoring champion out of the ban plan silently: `resolveRoleAdjustment`
  // returns early for an unassigned player, so the explaining reason was never
  // even attached.
  const roleViabilityEvidence: ScoutRoleViabilityEvidence =
    roleContext.membership === "unassigned"
      ? { status: "unknown", reason: "role_unknown", evaluatedRole: "unknown" }
      : evaluateChampionRoleViability(
          roleIndex,
          group.championKey,
          roleContext.referenceRole ?? "unknown",
        )
  const roleViability = roleViabilityEvidence.status
  const roleAdjustment = resolveRoleAdjustment(
    roleFit,
    signalRole,
    roleContext,
    roleViability,
    group.championName,
  )

  // --- champion stat strength -------------------------------------------
  // The factor multiplies the BASE score, and the result is clamped BEFORE the
  // role weight is applied. That order is the guarantee, not a detail:
  //
  //   score = clamp01(clamp01(base * statStrength) * roleWeight)
  //
  // Both the onrole and the offrole reading of the same entry are then built
  // from one and the same `statAdjustedBase`, so their quotient is exactly
  // `roleWeight` — for every input, saturated or not.
  //
  // WHY THE OBVIOUS SPELLING IS WRONG: `clamp01(base * roleWeight *
  // statStrength)` looks equivalent and is not. `statStrength` goes up to 1.2,
  // so `base * statStrength` can exceed 1; the single outer clamp then trims
  // the ONROLE side while the offrole side (× 0.4) stays far below the ceiling.
  // The offrole ratio drifts upward exactly where the stats are strongest —
  // measured up to 0.477 against a documented 0.4 before this was corrected.
  // Do not collapse the two clamps back into one.
  //
  // An offrole champion with dream games, winrate and KDA therefore still
  // cannot outrank a comparable onrole signal — and the `maxConfidence: "low"`
  // cap, which lives outside this calculation entirely, keeps it out of the
  // `safe`/`target` phases regardless.
  const statStrength = championStatStrengthMultiplier({ games, winrate: winratePercent, kda })

  const rankStrength = rankImpactMultiplier(roleContext.rankTier)

  // BOTH new factors sit INSIDE the inner clamp, strictly before the role
  // weight. That bracketing is the rollen guarantee, not cosmetics: the onrole
  // and the offrole reading are built from one and the same `statAdjustedBase`,
  // so their quotient stays exactly `roleAdjustment.weight`. Multiply the role
  // weight by a factor that can exceed 1 and the OUTER clamp starts binding on
  // the onrole side alone; that is how the documented 0.4 drifted to 0.477 once
  // before, and `rankStrength` reaches 1.25.
  const statAdjustedBase = applyRankStrength(clamp01(baseScore * statStrength), rankStrength)
  const score = round3(clamp01(statAdjustedBase * roleAdjustment.weight))

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

  // --- stat strength, made visible: AT MOST ONE reason, strict ladder ----
  //
  // The weighting above has to be explainable, but it must not turn into a
  // reason flood — so this is a ladder with an early exit, never two pushes.
  //
  // KDA WINS THE TIE on purpose: the game count is already all over the reason
  // vocabulary — `high_winrate_many_games`, `high_winrate_small_sample`,
  // `small_sample` and `high_games_low_winrate` each render `{games}` in both
  // languages — whereas the KDA appears in no other reason text at all. It is
  // the only genuinely new information the user gets out of this.
  // (An earlier version of this comment named `played_recently` and `one_trick`
  // here. Both carry `{games}` as a PARAM but print no number, so they were the
  // wrong evidence for a claim that happens to be true anyway: the count is
  // repeated elsewhere, the KDA is not.)
  //
  // `SOLID_SAMPLE_GAMES` gates `strong_kda` (no new constant needed — it is the
  // module's existing answer to "is this sample solid enough to say that out
  // loud"), and `isWeakness` suppresses `many_games_on_champion` because
  // `high_games_low_winrate` already opens with "{games} Games, aber nur …" —
  // a second line about the same game count is exactly the flood to avoid.
  //
  // `strong_kda` IS DELIBERATELY **NOT** SUPPRESSED ON A WEAKNESS, and the
  // asymmetry to the line above is the point, not an oversight. The two cases
  // differ in what they would repeat:
  //   - `many_games_on_champion` would restate the very number
  //     `high_games_low_winrate` just printed. Pure redundancy, and next to a
  //     weakness it reads like an argument to ban after all.
  //   - `strong_kda` states something no other line says. "60 games, 40 %
  //     winrate, KDA 4.5" is not a contradiction, it is a profile: dies rarely,
  //     still does not win. For a scout that is real information — the champion
  //     is played safely and passively, so the lane is unlikely to be cracked
  //     open on its own even though the record is bad.
  // The UI renders it under "Schwachstellen"/"Weaknesses", where a second,
  // non-repeating sentence about the same champion is exactly what that section
  // is for. tests/scoutStatWeighting.test.ts pins this case so the asymmetry
  // cannot be "cleaned up" silently.
  //
  // NOTE ON THE PARAMS: both codes ship the numbers behind the claim, whether
  // or not the current wording prints them — the engine emits machine-readable
  // justification, the i18n layer decides what to show. `many_games_on_champion`
  // renders `{games}`; because the ladder cannot raise it below 44 games (and
  // `strong_kda` not below SOLID_SAMPLE_GAMES), neither can ever appear at a
  // count of 1, which is why `COUNT_SENSITIVE_REASONS` in
  // src/components/scout/scoutUiHelpers.ts deliberately lists neither.
  if (
    // Explicit `!== null` rather than a falsy check: a stated `0` is a real
    // value here, it simply never clears the impact threshold.
    kda !== null &&
    games >= SOLID_SAMPLE_GAMES &&
    kdaImpactMultiplier(kda, games) >= SCOUT_STAT_REASON_MIN_IMPACT
  ) {
    reasons.push(reason("strong_kda", { games, kda: round3(kda) }))
  } else if (!isWeakness && gamesImpactMultiplier(games) >= SCOUT_STAT_REASON_MIN_IMPACT) {
    reasons.push(reason("many_games_on_champion", { games }))
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

  // One line, and only when the rank actually moved the score. `{rank}`
  // travels as the tier CODE and is localised by the UI
  // (`localizeScoutParams`), the same way a role does. A raw code must never
  // reach the screen.
  if (
    rankStrength >= RANK_REASON_MIN_IMPACT &&
    roleContext.rankTier !== null &&
    roleContext.rankTier !== undefined
  ) {
    reasons.push(reason("high_rank_player", { rank: roleContext.rankTier }))
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

  // Evaluated *after* the guarantee above, so role awareness can only ever add
  // to the explanation, never take the last data reason away from a signal.
  //
  // But it goes to the FRONT of the list, because the role verdict is the
  // headline and the data reasons are its support. The UI shows the leading
  // reasons and collapses the tail, so appending put the one line that says
  // "this champion is not a ban for this lane" behind a fold, under two lines
  // praising its winrate and KDA. A withheld champion has to say so first.
  reasons.unshift(...roleAdjustment.reasons)

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
    // The SAME aggregate that fed `championStatStrengthMultiplier()` above.
    // Recomputing it here from the entries would open the door to a second
    // convention, and the ban plan would eventually print a KDA the score
    // never saw. `round3` matches the winrate line; it is a display rounding
    // and happens after the scoring, so no multiplier shifts by it.
    kda: kda === null ? null : round3(kda),
    recency,
    score,
    confidence,
    reasons: dedupeReasons(reasons),
    sources: collectSources(entries),
    roleFit,
    lineupRole: roleContext.starterSlot,
    fromSubstitute: roleContext.fromSubstitute,
    roleViability,
    roleViabilityEvidence,
  }

  return { signal, championKey: group.championKey, roles, conflicting, isWeakness }
}

function compareSignals(a: ChampionSignal, b: ChampionSignal): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.games !== a.games) return b.games - a.games
  const byName = compareStrings(a.championName.toLowerCase(), b.championName.toLowerCase())
  if (byName !== 0) return byName
  // Final, always-decisive tie-break, and on this list the name above is NOT
  // one: every signal of a merged ban candidate carries the same champion name
  // by construction. Without the player id the sort fell through to input
  // order, and `targetPlayerId` (= `signals[0].playerId` when no lineup is
  // known) then changed whenever the roster was listed in a different order.
  return compareStrings(a.playerId, b.playerId)
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

  // Role evidence for the viability gate. Built once; empty when the caller
  // supplied no reference, which switches the gate off completely.
  const championRoleIndex = buildChampionRoleIndex(options?.championRoleReference)

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
  /**
   * Distinct champions dropped from ban candidacy because they are not
   * plausibly played in the lane they were filed under. Also ONE warning: the
   * user wants to know that something was held back, not to read a line per
   * champion.
   */
  const notPlayableChampionKeys = new Set<string>()
  /** Champions that DID reach the plan, so the filter can stay honest. */
  const playableChampionKeys = new Set<string>()
  /**
   * Champions the reference could not judge: absent from it, or covered by too
   * thin a sample. `role_unknown` is deliberately NOT counted — that is a
   * missing lineup slot, not a gap in the reference, and reporting it as one
   * would blame the data for the user's unfinished lineup.
   */
  const unjudgedChampionKeys = new Set<string>()

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
      buildSignalContext(
        player.id,
        group,
        totalGames,
        entries.length,
        roleContext,
        championRoleIndex,
      ),
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

        const evidenceReason = context.signal.roleViabilityEvidence?.reason
        if (evidenceReason === "champion_missing" || evidenceReason === "sample_too_small") {
          unjudgedChampionKeys.add(context.championKey)
        }

        if (context.signal.roleFit === "offrole") offroleSignalCount += 1

        // A zero-score signal is real data but no recommendation — it never
        // becomes a ban candidate. Checked BEFORE the role gate on purpose: such
        // a signal would not have been a candidate under any configuration, so
        // counting it as "held back by the gate" told the user the gate had
        // removed something when it had removed nothing.
        if (context.signal.score <= 0) continue

        // THE ROLE GATE. A champion that is not plausibly played in this
        // player's lane stays fully visible in `players[].signals`, with its
        // games, winrate, KDA and an explaining reason, but it is withheld
        // from ban candidacy, exactly the way a weakness is. This is what
        // stops a support main moved to the jungle from producing
        // support-champion jungle bans, and it is deliberately structural:
        // because the signal never reaches `threatContextsByChampion`, no
        // rank multiplier and no stat line can lift it back into the plan.
        if (context.signal.roleViability === "implausible") {
          notPlayableChampionKeys.add(context.championKey)
          continue
        }

        playableChampionKeys.add(context.championKey)

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
      // DELIBERATELY one per champion, unlike `flex_pick_warning`. "Check games
      // and winrate" is only actionable next to the champion it is about, and
      // nothing else in the result names it: `buildDataQuality` only downgrades
      // the player's confidence. Aggregating this one would trade an actionable
      // message for a count.
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
  // Only champions that ended up with NO ban candidate at all are reported.
  // A champion held back for one player but still suggested because another
  // plays it on-role was not "not suggested", so counting it would be a
  // false claim.
  const filteredChampionCount = [...notPlayableChampionKeys].filter(
    (key) => !playableChampionKeys.has(key),
  ).length
  if (filteredChampionCount > 0) {
    const notPlayableWarning: ScoutWarning = {
      code: "role_not_playable_filtered",
      severity: "info",
      params: { count: filteredChampionCount },
    }
    warnings.push(notPlayableWarning)
    planWarnings.push(notPlayableWarning)
  }

  // `unavailable` is decided by the INPUT, not by the outcome: with no
  // reference the gate never ran, however few champions happened to be
  // affected. Deriving it from the counters instead would report a healthy gate
  // for a session that simply had nothing to filter.
  const roleGate: ScoutRoleGateSummary = {
    status:
      championRoleIndex.size === 0
        ? "unavailable"
        : unjudgedChampionKeys.size > 0
          ? "partial"
          : "active",
    unjudgedChampions: unjudgedChampionKeys.size,
    filteredChampions: filteredChampionCount,
  }

  const flexCandidates = prioritizedBans.filter((candidate) => candidate.isFlex)
  if (flexCandidates.length > 0) {
    // ONE warning for the whole session. This used to be one warning per flex
    // candidate: a real five-player session produced 34 warnings with two
    // distinct sentences, and the sentence itself said "at least one champion"
    // while being printed 34 times. Which champion is flex stays visible where
    // it belongs, on the candidate: `flex_across_roles` in its reason list and
    // the flex badge on its row.
    const flexWarning: ScoutWarning = {
      code: "flex_pick_warning",
      severity: "warning",
      params: { count: flexCandidates.length },
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
    roleGate,
  }

  // Only ever set from the outside — this module never reads a clock.
  if (options?.generatedAtIso) result.generatedAtIso = options.generatedAtIso

  return result
}

/** Convenience: an empty, well-formed result (e.g. before the first parse). */
export function createEmptyScoutAnalysis(): ScoutAnalysisResult {
  return analyzeScout([], {})
}
