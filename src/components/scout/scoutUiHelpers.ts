/**
 * Pure helpers for the Tournament Scout UI.
 *
 * Everything in this file is deliberately free of React, DOM and clock access
 * (the one exception, `createEntryId()`, is documented below), so it can be
 * unit-tested in the Node-based vitest suite — see tests/scoutUiHelpers.test.ts.
 *
 * The jobs that live here:
 *
 *  1. i18n key building. Every scout union resolves *mechanically* to a key
 *     (`scout_reason_${code}`, `scout_role_${role}`, …). No switch, no lookup
 *     table — TypeScript checks the resulting template literal against
 *     `TranslationKey`, so a missing key is a compile error, not a runtime
 *     `undefined`.
 *
 *  2. Text assembly. The i18n texts carry `{placeholders}`; the engine ships
 *     `params`. `fillPlaceholders()` is the single place that joins them.
 *
 *  3. Input validation in front of the storage layer (sections 3).
 *
 *  4. Lineup arithmetic (section 5) — assignment, autofill, pruning and the
 *     derived summary the builder renders. This is where the "one player, one
 *     slot" invariant of `ScoutLineup` is enforced on write.
 *
 *  5. Role-aware labels (section 6) — the ban lane suffixes, and the one place
 *     that decides whether a role on screen is a declared lineup slot or only
 *     the parser's guess (`scoutRoleLabel`).
 *
 *  6. The two data-loss guards: the re-parse check (section 7) and the
 *     removed-player archive plus the restore decision (section 8). Both are
 *     pure so they can be tested — the `window.confirm` around them cannot be,
 *     vitest runs in Node without a DOM.
 *
 * The plain-text export lives next door in ./scoutExport.ts.
 */

import type { TranslationKey } from "../../i18n/types"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_REMOVED_PLAYERS_MAX,
  SCOUT_SUBSTITUTE_SLOTS,
} from "../../scout/types"
import type {
  BanCandidate,
  ManualChampionEntry,
  ScoutConfidence,
  ScoutFetchBlockedCode,
  ScoutLineup,
  ScoutLineupAssignment,
  ScoutLineupMembership,
  ScoutLineupSlot,
  ScoutLineupStarterRow,
  ScoutLineupSubstituteRow,
  ScoutLineupSummary,
  ScoutManualSource,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutReason,
  ScoutReasonCode,
  ScoutReasonParams,
  ScoutRecency,
  ScoutRemovedPlayer,
  ScoutRole,
  ScoutRoleFit,
  ScoutSourceNoteCode,
  ScoutSourceStatus,
  ScoutSubstituteSlot,
  ScoutWarning,
  ScoutWarningCode,
  UnparsedLineReason,
} from "../../scout/types"

/** The `t()` of src/i18n/LanguageContext, narrowed to what this module needs. */
export type ScoutTranslate = (key: TranslationKey) => string

/* ==========================================================================
 * 1. Mechanical i18n key building
 * ========================================================================== */

export const scoutRoleKey = (role: ScoutRole): TranslationKey => `scout_role_${role}`
export const scoutSourceKey = (source: ScoutManualSource): TranslationKey =>
  `scout_source_${source}`
export const scoutStatusKey = (status: ScoutSourceStatus): TranslationKey =>
  `scout_status_${status}`
export const scoutRecencyKey = (recency: ScoutRecency): TranslationKey =>
  `scout_recency_${recency}`
export const scoutConfidenceKey = (confidence: ScoutConfidence): TranslationKey =>
  `scout_confidence_${confidence}`
export const scoutUnparsedKey = (reason: UnparsedLineReason): TranslationKey =>
  `scout_unparsed_${reason}`
export const scoutReasonKey = (code: ScoutReasonCode): TranslationKey => `scout_reason_${code}`
export const scoutWarningKey = (code: ScoutWarningCode): TranslationKey => `scout_warning_${code}`
export const scoutNoteKey = (code: ScoutSourceNoteCode): TranslationKey => `scout_note_${code}`
export const scoutBlockedKey = (code: ScoutFetchBlockedCode): TranslationKey =>
  `scout_blocked_${code}`
export const scoutRoleFitKey = (fit: ScoutRoleFit): TranslationKey => `scout_rolefit_${fit}`
export const scoutMembershipKey = (membership: ScoutLineupMembership): TranslationKey =>
  `scout_membership_${membership}`

/**
 * Label of one lineup seat.
 *
 * A starting slot has no label of its own — it *is* a role, so it reuses
 * `scout_role_*` (which is where "ADC" for `bot` lives). Only the three bench
 * seats carry their own keys. Introducing a second name for a starting slot is
 * exactly what `ScoutLineupSlot` in src/scout/types.ts forbids.
 */
export const scoutSubstituteSlotKey = (slot: ScoutSubstituteSlot): TranslationKey =>
  `scout_lineup_${slot}`

/** Role values in display order — also the runtime guard for `{role}` params. */
export const SCOUT_ROLE_VALUES: readonly ScoutRole[] = [
  "top",
  "jungle",
  "mid",
  "bot",
  "support",
  "unknown",
]

export const SCOUT_RECENCY_VALUES: readonly ScoutRecency[] = ["current", "recent", "old"]

export const SCOUT_MANUAL_SOURCE_VALUES: readonly ScoutManualSource[] = [
  "opgg",
  "leagueofgraphs",
  "deeplol",
  "dpm",
  "manual",
  "other",
]

function isScoutRole(value: string): value is ScoutRole {
  return SCOUT_ROLE_VALUES.indexOf(value as ScoutRole) !== -1
}

/* ==========================================================================
 * 2. Placeholder substitution
 * ========================================================================== */

/** `62` -> `"62"`, `62.4567` -> `"62.5"`. Locale-neutral on purpose. */
export function formatScoutNumber(value: number): string {
  if (!Number.isFinite(value)) return ""
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10) / 10)
}

/**
 * Tidy a template after substitution.
 *
 * Only ever runs on the *output*, so a fully substituted text passes through
 * unchanged; it exists for the missing-parameter case, where a `{key}` is
 * removed and would otherwise leave `"  "` or a dangling `"%"` behind.
 */
function tidyText(value: string): string {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:!?%])/g, "$1")
    .replace(/^[\s%,.;:—–-]+/, "")
    .replace(/[\s—–-]+$/, "")
    .trim()
}

/**
 * Replace every `{key}` in `template` with the matching entry of `params`.
 *
 * DECISION — a placeholder without a parameter is **removed**, never left raw:
 * a user must not read `{winrate}` on screen. The surrounding whitespace and a
 * then-orphaned leading `%` / `,` are cleaned up by {@link tidyText}. The
 * engine always ships the params its codes need, so this is a defensive path.
 */
export function fillPlaceholders(template: string, params?: ScoutReasonParams): string {
  if (typeof template !== "string" || template.length === 0) return ""
  const replaced = template.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
    const value = params ? params[key] : undefined
    if (value === undefined || value === null) return ""
    return typeof value === "number" ? formatScoutNumber(value) : String(value)
  })
  return tidyText(replaced)
}

/**
 * Does this parameter *name* promise a role code as its value?
 *
 * DECISION — a name rule, not a list. The engine ships `{role}`, `{roles}`,
 * `{signalRole}` and `{lineupRole}` today; an explicit list would have to be
 * extended by hand every time a reason gains another role-bearing parameter,
 * and the failure mode of forgetting is a raw machine code on screen
 * ("aufgestellt als jungle"). The suffix rule covers every present and future
 * `*Role` parameter automatically. It stays safe because it only decides
 * *whether to try*: `isScoutRole()` below still gates the actual substitution,
 * so a `*Role` value that is not one of the six roles passes through untouched.
 */
function isRoleBearingParam(key: string): boolean {
  return key === "roles" || /[Rr]ole$/.test(key)
}

/**
 * Translate the *values* of params that carry machine codes rather than
 * numbers — every role-bearing name (see {@link isRoleBearingParam}).
 * Everything else passes through, so this stays a rule, not a per-code
 * mapping table.
 */
export function localizeScoutParams(
  t: ScoutTranslate,
  params?: ScoutReasonParams,
): ScoutReasonParams | undefined {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const key of Object.keys(params)) {
    const value = params[key]
    if (typeof value === "string" && isRoleBearingParam(key)) {
      out[key] = value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => (isScoutRole(part) ? t(scoutRoleKey(part)) : part))
        .join(", ")
      continue
    }
    out[key] = value
  }
  return out
}

/** One finished justification sentence. */
export function translateScoutReason(t: ScoutTranslate, reason: ScoutReason): string {
  return fillPlaceholders(t(scoutReasonKey(reason.code)), localizeScoutParams(t, reason.params))
}

/** One finished warning sentence. Severity only drives styling, never text. */
export function translateScoutWarning(t: ScoutTranslate, warning: ScoutWarning): string {
  return fillPlaceholders(t(scoutWarningKey(warning.code)), localizeScoutParams(t, warning.params))
}

/**
 * Deterministic champion-name order for the UI.
 *
 * `String.prototype.localeCompare()` is deliberately NOT used: its result
 * depends on the host's locale and ICU build, so the same data could sort
 * differently on two machines — and a scout list that reorders itself between
 * two people looking at "the same" plan is a bug that is impossible to
 * reproduce. src/scout/analysis.ts avoids `localeCompare` for exactly this
 * reason (`compareStrings`); this is its UI-side twin, so both layers order
 * champions the same way.
 *
 * Case-insensitive, then a plain code-unit comparison. Ties (names that differ
 * only in case) return 0 and leave the caller's previous order intact.
 */
export function compareChampionNames(a: string, b: string): number {
  const left = String(a ?? "").toLowerCase()
  const right = String(b ?? "").toLowerCase()
  if (left === right) return 0
  return left < right ? -1 : 1
}

/** `scout_count*` and friends: a text whose only placeholder is `{count}`. */
export function translateCount(t: ScoutTranslate, key: TranslationKey, count: number): string {
  return fillPlaceholders(t(key), { count })
}

/* ==========================================================================
 * 3. Manual entry input validation
 *
 * src/scout/storage.ts silently DROPS a row whose `games` is negative or whose
 * `winrate` leaves 0–100. The editor therefore must not let such a row come
 * into existence in the first place — these two parsers are that gate.
 * ========================================================================== */

/** Games: non-negative integer. Returns `null` for anything else. */
export function parseGamesInput(raw: string): number | null {
  const text = raw.trim()
  if (text.length === 0) return null
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/** Winrate in percent, 0–100, decimals allowed (`,` accepted as separator). */
export function parseWinrateInput(raw: string): number | null {
  const text = raw.trim().replace(",", ".")
  if (text.length === 0) return null
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

let entryCounter = 0

/**
 * Stable-enough id for a manual row. Persisted alongside the row, so it must
 * not collide across sessions — hence the timestamp prefix. This is the only
 * clock read in this module and it is intentional: ids belong to the UI layer.
 */
export function createEntryId(): string {
  entryCounter += 1
  return `sce-${Date.now().toString(36)}-${entryCounter.toString(36)}`
}

/**
 * Give every row an `id` so React keys stay stable while a row is edited.
 * `id` is optional in the contract type and older persisted rows may lack it.
 * Returns the same array instance when nothing had to change.
 */
export function withEntryIds(entries: readonly ManualChampionEntry[]): ManualChampionEntry[] {
  let changed = false
  const out = entries.map((entry) => {
    if (typeof entry.id === "string" && entry.id.length > 0) return entry
    changed = true
    return { ...entry, id: createEntryId() }
  })
  return changed ? out : (entries as ManualChampionEntry[])
}

/** Shared `<datalist>` id — the list itself is rendered once by the container. */
export const CHAMPION_DATALIST_ID = "scout-champion-options"

/* ==========================================================================
 * 4. Example input
 *
 * Structure only. The names are obviously fake and no numbers are attached, so
 * this can never be mistaken for an analysis result — the UI shows
 * `scout_exampleHint` next to it.
 *
 * DECISION — the block is NOT moved into src/i18n; its placeholder names are
 * made language-neutral instead. This is machine input for `parseScoutInput()`,
 * not prose: the URL syntax, the `#EUW` taglines and the `Bot:` / `Support`
 * prefixes are parser-critical and already work in both languages
 * (`ROLE_ALIASES` in src/scout/linkParser.ts accepts the German and the English
 * spellings side by side). One translation key per language would copy that
 * syntax into a file of UI sentences, where a typo in one copy silently
 * produces an example that no longer parses — and only for the users of that
 * language. The single German part was the `Beispiel…` prefix of the names;
 * `Demo…` reads the same in German and in English, and `scout_exampleHint`
 * still states in the user's own language that the names are made up.
 * ========================================================================== */

export const SCOUT_EXAMPLE_INPUT = [
  "https://op.gg/lol/multisearch/euw?summoners=DemoTop%23EUW,DemoJungle%23EUW",
  "https://www.leagueofgraphs.com/summoner/euw/DemoMid-EUW",
  "Bot: DemoBot#EUW",
  "Support DemoSupport#EUW",
].join("\n")

/* ==========================================================================
 * 5. Lineup
 *
 * Pure lineup arithmetic for the builder UI. Every function here takes a
 * `ScoutLineup` and returns a *new* one — React state is never mutated, and
 * the whole block is testable without a DOM.
 *
 * The duplicate invariant of `ScoutLineup` ("a player id occupies at most one
 * of the eight slots") is enforced HERE, at the point where the UI writes a
 * lineup. `normalizeScoutState()` enforces it again on load, but that is the
 * safety net, not the gate: a user must not be able to produce a state that
 * only survives because the storage layer repairs it.
 * ========================================================================== */

/** One seat of the lineup, addressable in a single value. */
export type ScoutLineupTarget =
  | { kind: "starter"; slot: ScoutLineupSlot }
  | { kind: "substitute"; slot: ScoutSubstituteSlot }

/** Why an assignment was refused. Maps 1:1 to `scout_alreadyAssigned`. */
export type ScoutLineupAssignError = "already_assigned"

export interface ScoutLineupAssignResult {
  /** The unchanged input lineup when `error !== null`. */
  lineup: ScoutLineup
  error: ScoutLineupAssignError | null
}

/** Label of any seat — starting slots reuse `scout_role_*`, benches their own. */
export function scoutLineupTargetKey(target: ScoutLineupTarget): TranslationKey {
  return target.kind === "starter"
    ? scoutRoleKey(target.slot)
    : scoutSubstituteSlotKey(target.slot)
}

/** Structural copy — the two `Record`s must not be shared with the input. */
function copyLineup(lineup: ScoutLineup): ScoutLineup {
  return { starters: { ...lineup.starters }, substitutes: { ...lineup.substitutes } }
}

/** Where a player sits, or `null` when they are in the pool. */
export function findLineupTarget(
  lineup: ScoutLineup,
  playerId: ScoutPlayerId,
): ScoutLineupTarget | null {
  for (const slot of SCOUT_LINEUP_SLOTS) {
    if (lineup.starters[slot] === playerId) return { kind: "starter", slot }
  }
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
    if (lineup.substitutes[slot] === playerId) return { kind: "substitute", slot }
  }
  return null
}

/** The starting role a player is set up for, or `null` (bench or pool). */
export function lineupStarterSlot(
  lineup: ScoutLineup,
  playerId: ScoutPlayerId,
): ScoutLineupSlot | null {
  const target = findLineupTarget(lineup, playerId)
  return target !== null && target.kind === "starter" ? target.slot : null
}

/**
 * The role a new manual row should default to.
 *
 * The lineup wins over `ScoutPlayer.role`: the starting slot is what the user
 * *declared*, while `player.role` is what the parser *guessed* from the input.
 * A player on the bench or in the pool has no declared role, so their guessed
 * one is used unchanged.
 */
export function defaultRoleForPlayer(lineup: ScoutLineup, player: ScoutPlayer): ScoutRole {
  return lineupStarterSlot(lineup, player.id) ?? player.role
}

/** Read a seat without caring which half of the lineup it lives in. */
export function lineupSlotPlayerId(
  lineup: ScoutLineup,
  target: ScoutLineupTarget,
): ScoutPlayerId | null {
  return target.kind === "starter"
    ? (lineup.starters[target.slot] ?? null)
    : (lineup.substitutes[target.slot] ?? null)
}

function writeSlot(
  lineup: ScoutLineup,
  target: ScoutLineupTarget,
  playerId: ScoutPlayerId | null,
): ScoutLineup {
  const next = copyLineup(lineup)
  if (target.kind === "starter") next.starters[target.slot] = playerId
  else next.substitutes[target.slot] = playerId
  return next
}

/** Empty one seat. Whoever sat there returns to the pool. */
export function clearLineupSlot(lineup: ScoutLineup, target: ScoutLineupTarget): ScoutLineup {
  return writeSlot(lineup, target, null)
}

/** Take a player out of wherever they sit. A no-op for a pool player. */
export function removePlayerFromLineup(lineup: ScoutLineup, playerId: ScoutPlayerId): ScoutLineup {
  const target = findLineupTarget(lineup, playerId)
  return target === null ? lineup : clearLineupSlot(lineup, target)
}

/**
 * Put a player on a seat.
 *
 * REFUSES instead of moving when the player already sits somewhere else — the
 * user is told (`scout_alreadyAssigned`) and takes them off that seat first.
 * A silent move would look like a swap and quietly empty a slot the user
 * believed was still filled.
 *
 * Re-assigning a player to the seat they already occupy is a no-op, not an
 * error. Assigning onto an *occupied* seat replaces its occupant, who returns
 * to the pool — a deliberate, visible action on a seat the user just pointed
 * at.
 */
export function assignPlayerToSlot(
  lineup: ScoutLineup,
  target: ScoutLineupTarget,
  playerId: ScoutPlayerId,
): ScoutLineupAssignResult {
  const current = findLineupTarget(lineup, playerId)
  if (current !== null) {
    const sameSeat =
      current.kind === target.kind && (current.slot as string) === (target.slot as string)
    if (sameSeat) return { lineup, error: null }
    return { lineup, error: "already_assigned" }
  }
  return { lineup: writeSlot(lineup, target, playerId), error: null }
}

/**
 * Fill the *free* starting slots from the roles the parser recognised.
 *
 * Never overwrites an occupied slot and never touches the bench: autofill is a
 * convenience on top of what the user has, not a reset. The roles it uses are
 * guesses from the pasted input, which is why the UI shows
 * `scout_lineupAutofillHint` right next to the button.
 *
 * Per slot the first still-unassigned player with that role wins, in input
 * order — deterministic, and the same result whether the button is pressed
 * once or five times.
 */
export function autofillLineupFromRoles(
  lineup: ScoutLineup,
  players: readonly ScoutPlayer[],
): ScoutLineup {
  let next = lineup
  for (const slot of SCOUT_LINEUP_SLOTS) {
    const occupant = next.starters[slot]
    if (occupant !== null && occupant !== undefined) continue
    const candidate = players.find(
      (player) => player.role === slot && findLineupTarget(next, player.id) === null,
    )
    if (candidate === undefined) continue
    next = writeSlot(next, { kind: "starter", slot }, candidate.id)
  }
  return next
}

/**
 * Drop every reference to a player id that no longer exists.
 *
 * Called after a re-parse: a slot pointing at a vanished player renders as an
 * empty box with a hidden id behind it, and the analysis scores nobody for
 * that lane while the UI still counts the slot as filled.
 */
export function pruneLineup(
  lineup: ScoutLineup,
  knownPlayerIds: ReadonlySet<ScoutPlayerId>,
): ScoutLineup {
  let next = lineup
  for (const slot of SCOUT_LINEUP_SLOTS) {
    const playerId = lineup.starters[slot]
    if (playerId !== null && playerId !== undefined && !knownPlayerIds.has(playerId)) {
      next = writeSlot(next, { kind: "starter", slot }, null)
    }
  }
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
    const playerId = lineup.substitutes[slot]
    if (playerId !== null && playerId !== undefined && !knownPlayerIds.has(playerId)) {
      next = writeSlot(next, { kind: "substitute", slot }, null)
    }
  }
  return next
}

/**
 * The derived view the builder renders: eight rows in canonical order, the
 * pool, the still-empty starting slots and the dangling ids.
 *
 * Mirrors the rules `ScoutLineupSummary` prescribes for readers — first hit in
 * canonical order wins, an id without a `ScoutPlayer` counts as dangling and
 * its slot as empty. The analysis engine derives the same shape for the ban
 * plan; sharing the *type* is what keeps the two answers identical.
 */
export function buildScoutLineupSummary(
  lineup: ScoutLineup,
  players: readonly ScoutPlayer[],
): ScoutLineupSummary {
  const knownIds = new Set<ScoutPlayerId>(players.map((player) => player.id))
  const taken = new Set<ScoutPlayerId>()
  const danglingPlayerIds: ScoutPlayerId[] = []
  const byPlayerId: Record<ScoutPlayerId, ScoutLineupAssignment> = {}

  const claim = (raw: ScoutPlayerId | null | undefined): ScoutPlayerId | null => {
    if (raw === null || raw === undefined) return null
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
    const playerId = claim(lineup.starters[slot])
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
    const playerId = claim(lineup.substitutes[slot])
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

  const missingStarterSlots = starters.filter((row) => row.playerId === null).map((row) => row.slot)

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

/* ==========================================================================
 * 6. Role-aware labels
 * ========================================================================== */

/**
 * What a role label on screen actually *is*.
 *
 * Two very different facts used to end up in the same chip via
 * `starterSlot ?? player.role`: the lineup slot the user **declared** and the
 * role the parser **guessed** out of a pasted line. Reading "Mid" told nobody
 * which of the two they were looking at, and for a player without a seat the
 * membership chip is not rendered either — so the guess was presented as a
 * plan. That is exactly what the honesty rule in ./scoutExport.ts forbids.
 */
export interface ScoutRoleLabel {
  /** Ready to print: `"Mid"` for a declared slot, `"Mid (vermutet)"` for a guess. */
  text: string
  /** `true` when this is only the parser's guess, not a declared lineup slot. */
  isGuess: boolean
}

/**
 * Split the two facts apart and say which one this is. A player holding one of
 * the five starting seats has a declared role; anyone else (bench, pool, or no
 * lineup at all) has at most the parser's guess, and the label says so.
 *
 * `"unknown"` is the *absence* of a guess, so it is never marked as one —
 * "Unbekannt (vermutet)" would claim a guess that was never made.
 *
 * `isGuess` travels with the text so a caller can style the two differently
 * without re-deriving the rule (the analysis panel greys the guess out).
 */
export function scoutRoleLabel(
  t: ScoutTranslate,
  starterSlot: ScoutLineupSlot | null,
  parsedRole: ScoutRole,
): ScoutRoleLabel {
  if (starterSlot !== null) return { text: t(scoutRoleKey(starterSlot)), isGuess: false }

  const text = t(scoutRoleKey(parsedRole))
  if (parsedRole === "unknown") return { text, isGuess: false }
  return { text: fillPlaceholders(t("scout_roleGuessed"), { role: text }), isGuess: true }
}

/** Role codes in canonical slot order, deduplicated. */
export function orderLineupRoles(roles: readonly ScoutLineupSlot[]): ScoutLineupSlot[] {
  const present = new Set<ScoutLineupSlot>(roles)
  return SCOUT_LINEUP_SLOTS.filter((slot) => present.has(slot))
}

/** `"Top, Mid"` — canonical order, translated, never a machine code. */
export function formatLineupRoles(t: ScoutTranslate, roles: readonly ScoutLineupSlot[]): string {
  return orderLineupRoles(roles)
    .map((slot) => t(scoutRoleKey(slot)))
    .join(", ")
}

/**
 * The lane suffixes of a ban candidate — `["gegen Mid"]`, `["trifft Mid,
 * Support"]`, or both.
 *
 * Meant to be appended to the champion name so the row reads as one phrase
 * ("Karma gegen Mid"), which is why the texts are lower-case and carry no
 * punctuation. Empty when no lineup is known: without one the engine claims no
 * role, and inventing "gegen Mid" from `ScoutPlayer.role` would sell a guess
 * as a plan.
 */
export function banRoleLabels(t: ScoutTranslate, candidate: BanCandidate): string[] {
  const labels: string[] = []
  const roles = orderLineupRoles(candidate.lineupRoles ?? [])

  if (candidate.targetRole) {
    labels.push(
      fillPlaceholders(t("scout_banAgainstRole"), { role: t(scoutRoleKey(candidate.targetRole)) }),
    )
  }

  // A single lane that `targetRole` already named would only repeat itself.
  const addsLanes = roles.length > 1 || (roles.length === 1 && roles[0] !== candidate.targetRole)
  if (addsLanes) {
    labels.push(fillPlaceholders(t("scout_banHitsRoles"), { roles: formatLineupRoles(t, roles) }))
  }

  return labels
}

/* ==========================================================================
 * 7. Re-parse protection
 *
 * A `ScoutPlayerId` is built from region + name + tagline, so a corrected typo
 * produces a *different* player — and the old id's manual rows become orphans
 * that `saveScoutState()` drops on the next write. These two helpers decide
 * whether a re-parse is about to destroy work the user typed.
 * ========================================================================== */

/** Did the user actually put anything into this player's scout data? */
export function hasScoutData(data: ScoutPlayerData | undefined): boolean {
  if (!data) return false
  if (Array.isArray(data.entries) && data.entries.length > 0) return true
  return typeof data.note === "string" && data.note.trim().length > 0
}

/**
 * The players a re-parse would drop *and* whose data is worth keeping.
 *
 * A player without a single entry and without a note is NOT reported: asking
 * before every ordinary roster change would train the user to click the dialog
 * away, and then the one prompt that mattered gets clicked away too.
 *
 * Order follows `previousPlayers`, so the dialog lists them as the user knows
 * them from the roster.
 */
export function findDroppedPlayersWithData(
  previousPlayers: readonly ScoutPlayer[],
  playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>,
  nextPlayers: readonly ScoutPlayer[],
): ScoutPlayer[] {
  const keptIds = new Set<ScoutPlayerId>(nextPlayers.map((player) => player.id))
  return previousPlayers.filter(
    (player) => !keptIds.has(player.id) && hasScoutData(playerData[player.id]),
  )
}

/* ==========================================================================
 * 8. Lineup awareness switch and the removed-player archive
 * ========================================================================== */

/**
 * Is this lineup untouched?
 *
 * Decides whether the container hands `options.lineup` to `analyzeScout()` at
 * all, and that distinction matters: the engine treats "no lineup" and "an
 * empty lineup" differently on purpose. An empty lineup is a *statement* ("I
 * opened the builder and filled nothing in") and earns
 * `incomplete_starting_five` plus a `player_without_lineup_role` reason on
 * every single player. Showing that to someone who never opened the builder
 * would bury the analysis under caveats about a feature they are not using —
 * so an untouched lineup is reported as "not known", which is what it is.
 */
export function isLineupEmpty(lineup: ScoutLineup): boolean {
  for (const slot of SCOUT_LINEUP_SLOTS) {
    const playerId = lineup.starters[slot]
    if (playerId !== null && playerId !== undefined) return false
  }
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
    const playerId = lineup.substitutes[slot]
    if (playerId !== null && playerId !== undefined) return false
  }
  return true
}

/**
 * Which ids will carry *live* scout data after a state change — the exact set
 * `normalizeScoutStateV2()` computes as `livePlayerDataIds` before it filters
 * the archive.
 *
 * Mirrors the orphan rule of the storage layer: a `playerData` entry whose
 * player is not in `players` does not survive the save, so it is not "live"
 * either. Pass the *next* roster and the *next* data map, not the ones on
 * screen a moment ago — the archive is filtered against what will be written.
 */
export function liveScoutPlayerDataIds(
  players: readonly ScoutPlayer[],
  playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>,
): Set<ScoutPlayerId> {
  const knownIds = new Set<ScoutPlayerId>(players.map((player) => player.id))
  const live = new Set<ScoutPlayerId>()
  for (const id of Object.keys(playerData)) {
    if (knownIds.has(id)) live.add(id)
  }
  return live
}

/**
 * Put players into the removed-player archive.
 *
 * Mirrors the rules `normalizeRemovedPlayers()` applies on save, so what the
 * archive panel shows is what survives a reload:
 *
 *  - keyed by `player.id`;
 *  - an id that carries live `playerData` is NOT kept. `ScoutStateV2` states
 *    that an id lives in `playerData` or in `removedPlayers`, never in both,
 *    and src/scout/storage.ts enforces it on every write. Without this rule the
 *    panel kept offering "restore" for an entry the very next `saveScoutState()`
 *    had already deleted — a button that works until the page is reloaded;
 *  - capped at `SCOUT_REMOVED_PLAYERS_MAX`, and when the cap bites the *oldest*
 *    entries go (an entry without a `removedAtIso` counts as oldest, ties broken
 *    by position). Re-archiving an id replaces its entry — the newer rows are
 *    the ones the user was last working on.
 *
 * `livePlayerDataIds` is passed in rather than derived here, and is required
 * rather than defaulted: this function only sees the players it is about to
 * archive, never the surviving roster, and a default of "nothing is live" would
 * silently skip the very rule this parameter exists for. Build it with
 * {@link liveScoutPlayerDataIds} from the *next* state.
 *
 * `nowIso` is a parameter, not a `Date.now()` call: this module stays
 * clock-free so the cap behaviour is testable.
 */
export function archiveRemovedPlayers(
  current: Readonly<Record<ScoutPlayerId, ScoutRemovedPlayer>>,
  players: readonly ScoutPlayer[],
  playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>,
  nowIso: string,
  livePlayerDataIds: ReadonlySet<ScoutPlayerId>,
): Record<ScoutPlayerId, ScoutRemovedPlayer> {
  const merged: { key: ScoutPlayerId; removed: ScoutRemovedPlayer }[] = []
  const indexByKey = new Map<ScoutPlayerId, number>()

  for (const key of Object.keys(current)) {
    if (livePlayerDataIds.has(key)) continue
    indexByKey.set(key, merged.length)
    merged.push({ key, removed: current[key] })
  }

  for (const player of players) {
    // Same rule for a fresh entry. A player who is being archived is by
    // definition off the next roster, so this only fires on a contradictory
    // call — and then storage would delete the entry on the next write anyway.
    if (livePlayerDataIds.has(player.id)) continue
    const data = playerData[player.id] ?? { playerId: player.id, entries: [] }
    const removed: ScoutRemovedPlayer = { player, data, removedAtIso: nowIso }
    const existing = indexByKey.get(player.id)
    if (existing === undefined) {
      indexByKey.set(player.id, merged.length)
      merged.push({ key: player.id, removed })
    } else {
      merged[existing] = { key: player.id, removed }
    }
  }

  const dropCount = merged.length - SCOUT_REMOVED_PLAYERS_MAX
  const dropped = new Set<number>()
  if (dropCount > 0) {
    const byAge = merged.map((item, index) => ({ index, removedAtIso: item.removed.removedAtIso }))
    byAge.sort((a, b) => compareRemovedAtIso(a.removedAtIso, b.removedAtIso) || a.index - b.index)
    for (const item of byAge.slice(0, dropCount)) dropped.add(item.index)
  }

  const out: Record<ScoutPlayerId, ScoutRemovedPlayer> = {}
  merged.forEach((item, index) => {
    if (dropped.has(index)) return
    out[item.key] = item.removed
  })
  return out
}

/**
 * Oldest first — an entry without a stamp is treated as the oldest, exactly as
 * src/scout/storage.ts does when the archive cap bites. ISO-8601 UTC strings
 * compare correctly with `<`, which is what every writer here produces.
 */
function compareRemovedAtIso(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return a < b ? -1 : 1
}

/**
 * Archive entries newest first — what was just lost is what the user is
 * looking for. Deterministic: equal or missing stamps keep their key order.
 */
export function sortRemovedPlayers(
  removedPlayers: Readonly<Record<ScoutPlayerId, ScoutRemovedPlayer>>,
): ScoutRemovedPlayer[] {
  return Object.keys(removedPlayers)
    .map((key, index) => ({ index, removed: removedPlayers[key] }))
    .sort(
      (a, b) =>
        compareRemovedAtIso(b.removed.removedAtIso, a.removed.removedAtIso) || a.index - b.index,
    )
    .map((item) => item.removed)
}

/** What restoring an archived player would do to the data that is on screen. */
export type ScoutRestoreDecision = "restore" | "confirm_overwrite"

/**
 * Restoring writes the archived rows to `playerData[playerId]` — as a *replace*,
 * not a merge. When that id already carries live work the write destroys it, so
 * it must not happen silently.
 *
 * The case is real: the same player can sit in the archive *and* back in
 * `players` (the user corrected the spelling again), with a fresh, empty
 * `playerData` entry the user has meanwhile typed into.
 *
 * DECISION — ask, do not merge. Two reasons:
 *  - a merge has no honest answer for the same champion appearing in both
 *    sets. Whichever games/winrate pair wins, the user ends up with a number
 *    they never typed for a champion they did type, and nothing on screen says
 *    which half came from where. A merge is also not undoable, so the "safe"
 *    option would be the one that quietly invents data.
 *  - asking is the established pattern for exactly this class of loss in this
 *    tab (`scout_player_removeConfirm`, `scout_resetConfirm`, and the re-parse
 *    dialog). One more `window.confirm` costs nothing to learn.
 *
 * The predicate is `hasScoutData()`, the same one the re-parse protection uses:
 * an empty container is not work, and prompting for it would train the user to
 * click the prompt away.
 *
 * Pure and exported so it can be tested — vitest runs in Node with no jsdom, so
 * the `window.confirm` around it cannot be.
 */
export function scoutRestoreDecision(liveData: ScoutPlayerData | undefined): ScoutRestoreDecision {
  return hasScoutData(liveData) ? "confirm_overwrite" : "restore"
}
