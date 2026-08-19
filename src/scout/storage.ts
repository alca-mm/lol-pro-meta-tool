/**
 * Local persistence for the Tournament Scout ("Turnier Scout" tab).
 *
 * WHAT THIS MODULE DOES
 *   - stores exactly one versioned `ScoutState` blob under one localStorage key
 *   - turns *anything* that comes back out of that key into a well-formed state
 *   - migrates a legacy V1 blob forward to V2 (one-way, see "SCHEMA VERSIONING")
 *   - never throws: a browser without storage, a private-mode `SecurityError`,
 *     corrupt JSON and a full quota all end in a clean fallback, not a crash
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   - it does not read a clock. `updatedAtIso` is only written when the caller
 *     injects one (`saveScoutState(state, { nowIso })`), so a round-trip through
 *     storage stays byte-for-byte reproducible and no timestamp is invented.
 *     The V1 -> V2 migration follows the same rule: a V1 state without a stamp
 *     stays without one.
 *   - it does not derive identities. Player ids are produced by
 *     `buildScoutPlayerId()` in src/scout/linkParser.ts; storage only validates
 *     them. Recomputing an id here could silently diverge from the stored
 *     `playerData` keys and orphan the user's manual rows.
 *   - it does not invent structure. The migration leaves the lineup empty
 *     instead of seeding it from `ScoutPlayer.role` - see `migrateV1ToV2()`.
 *   - it does not re-canonicalise regions. `ScoutRegion` is deliberately an open
 *     string (src/scout/types.ts); the parser canonicalised the value at write
 *     time, so a region this build does not recognise is kept verbatim instead
 *     of being flattened to `SCOUT_REGION_UNKNOWN`.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THAT GOVERNS EVERY NORMALISATION DECISION BELOW
 *
 *   A partial state is better than a crash - but a *wrong* state is worse than
 *   both. Anything that cannot be interpreted with certainty is dropped, never
 *   guessed, never clamped into something that merely looks plausible.
 *
 * That is why an out-of-range winrate removes the champion row instead of being
 * clamped to 0/100: a fabricated number would flow straight into the ban
 * priorities and quietly change what the user is told to ban. Absence of data is
 * expressed by absence (and by a `no_data` reason downstream), never by a fake
 * value - the same honesty rule the type contract states.
 *
 * Fields that carry no meaning of their own are the exception and are filled
 * default-safe (`role -> "unknown"`, `note -> ""`, `recency -> "old"`), because
 * for those a conservative default cannot overstate anything.
 * ---------------------------------------------------------------------------
 *
 * SCHEMA VERSIONING
 *   `schemaVersion` is checked *first*, in exactly one place
 *   (`normalizeScoutState()`, marked "MIGRATION HOOK"):
 *
 *     1                      -> `migrateV1ToV2()`         (legacy, read-only)
 *     SCOUT_SCHEMA_VERSION   -> `normalizeScoutStateV2()`  (what this build writes)
 *     anything else          -> empty state
 *
 *   "Anything else" means missing, non-numeric, older than 1 or *higher* than
 *   this build understands: a newer tab may have written fields with different
 *   meanings, and reading those with V2 rules would produce confidently wrong
 *   data. The migration is one-way; V1 is never written back.
 */

import { isRecord } from "../lib/isRecord"
import { SCOUT_REGION_UNKNOWN, SCOUT_SOURCE_KINDS } from "./sources"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_REMOVED_PLAYERS_MAX,
  SCOUT_SCHEMA_VERSION,
  SCOUT_SUBSTITUTE_SLOTS,
} from "./types"
import type {
  ManualChampionEntry,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutManualSource,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutRecency,
  ScoutRemovedPlayer,
  ScoutRole,
  ScoutSourceKind,
  ScoutSourceNoteCode,
  ScoutSourceRef,
  ScoutSourceStatus,
  ScoutState,
  ScoutStateV1,
  ScoutSubstituteSlot,
} from "./types"

/* ==========================================================================
 * 1. Storage key and public option types
 * ========================================================================== */

/**
 * The single localStorage key this feature owns. Exported so tests, a future
 * "reset everything" action and any debugging helper share one literal instead
 * of duplicating the string (same idea as `lol_champion_notes` in
 * src/notes/storage.ts).
 *
 * Unchanged across the V1 -> V2 bump on purpose: the migration has to *find*
 * the old blob, and a new key would silently orphan every existing user's data.
 */
export const SCOUT_STORAGE_KEY = "lol_tournament_scout"

/** Options for {@link saveScoutState}. */
export interface SaveScoutStateOptions {
  /**
   * ISO-8601 stamp written to `ScoutState.updatedAtIso`.
   *
   * Injected on purpose: this module never calls `Date.now()`, so tests stay
   * deterministic. Omit it and the stored state keeps whatever `updatedAtIso`
   * it already carried.
   */
  nowIso?: string
}

/* ==========================================================================
 * 2. Accepted value sets
 *
 * Kept as `Set<string>` so an `unknown` can be tested directly. Every set is
 * derived from, or mirrors, the unions in src/scout/types.ts - when a union
 * there gains a member, the matching set here has to gain it too, otherwise the
 * new value is silently dropped on load.
 * ========================================================================== */

const SOURCE_KINDS: ReadonlySet<string> = new Set<string>(SCOUT_SOURCE_KINDS)

const SOURCE_STATUSES: ReadonlySet<string> = new Set<string>([
  "parsed_from_url",
  "source_link_only",
  "manual_required",
  "not_supported_in_browser",
  "error",
])

const SOURCE_NOTE_CODES: ReadonlySet<string> = new Set<string>([
  "identity_from_url",
  "profile_link_generated",
  "url_format_heuristic",
  "region_unknown",
  "tagline_unknown",
  "identity_incomplete",
  "direct_fetch_not_supported",
  "unknown_url_shape",
])

const SCOUT_ROLES: ReadonlySet<string> = new Set<string>([
  "top",
  "jungle",
  "mid",
  "bot",
  "support",
  "unknown",
])

const SCOUT_RECENCIES: ReadonlySet<string> = new Set<string>(["current", "recent", "old"])

/**
 * Every legal {@link ScoutManualSource}, as a runtime set.
 *
 * The four site kinds are spread in from `SCOUT_SOURCE_KINDS` rather than
 * retyped, so a new provider reaches this guard by itself.
 *
 * `"riot"` is deliberately NOT in here any more: it was the provenance of a row
 * fetched through the optional Riot auto-import, which was removed on
 * 2026-08-19. A stored `"riot"` row therefore takes the ordinary unknown-value
 * path of `readManualSource()` below - which is exactly what it should do, and
 * which is spelled out there.
 */
const MANUAL_SOURCES: ReadonlySet<string> = new Set<string>([
  ...SCOUT_SOURCE_KINDS,
  "manual",
  "other",
])

/**
 * The five starting-slot keys a stored `ScoutLineup` may use.
 *
 * DERIVED, NEVER RETYPED - same reasoning as `SCOUT_LINEUP_SLOTS` itself
 * (src/scout/types.ts): writing `"top" | "jungle" | ...` out a second time here
 * is exactly how a renamed slot survives the compiler and then silently drops
 * every assignment for that slot on the next load. Deriving the set means a
 * change to the tuple propagates into the loader for free.
 */
const LINEUP_SLOT_KEYS: ReadonlySet<string> = new Set<string>(SCOUT_LINEUP_SLOTS)

/** The three substitute slot keys. Derived for the same reason as above. */
const SUBSTITUTE_SLOT_KEYS: ReadonlySet<string> = new Set<string>(SCOUT_SUBSTITUTE_SLOTS)

/**
 * Object keys that must never be used as a `playerData` / `removedPlayers` key.
 * `JSON.parse` happily produces an own property named `__proto__`, and a plain
 * `target[key] = value` assignment with that key would mutate the prototype
 * chain instead of storing data. A real player id always looks like
 * `"<region>:<name>#<tag>"`, so nothing legitimate is lost by refusing these.
 */
const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set<string>([
  "__proto__",
  "constructor",
  "prototype",
])

/* ==========================================================================
 * 3. Small pure readers
 * ========================================================================== */

/** Trimmed string, or `null` when the value is absent, not a string or blank. */
function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/**
 * String kept exactly as stored (no trimming) - used for the free-text fields
 * the UI renders verbatim: notes and the raw textarea content.
 */
function readVerbatimString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/**
 * A finite number, or `null`.
 *
 * A *numeric string* is accepted and parsed (`"12"` -> `12`): number inputs are
 * the realistic corruption here - an `<input type="number">` hands back a
 * string, and a state written by an older or buggier UI can carry that string
 * into storage. `"12"` has exactly one meaning, so reading it is not guessing.
 * Everything else (`null`, `NaN`, `Infinity`, `true`, `"abc"`, `""`, objects) is
 * rejected rather than coerced - `Number(null)` would be `0`, and `0` is a
 * meaningful sample size in this feature.
 */
function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * A real boolean, or `false`.
 *
 * Deliberately stricter than {@link readFiniteNumber}: `"true"`, `1` and `"on"`
 * are *not* accepted. A checkbox never produces those, so a non-boolean here
 * means the value was written by something that did not understand the field -
 * and `includeSubstitutes` is the switch that decides whether a substitute's
 * champions may enter the ban plan at all. `false` is the conservative answer:
 * it can only ever leave a player out of the scoring, never invent one in.
 */
function readBooleanOrFalse(value: unknown): boolean {
  return typeof value === "boolean" ? value : false
}

/** Role from a closed set; anything else becomes the explicit `"unknown"`. */
function readRole(value: unknown): ScoutRole {
  return typeof value === "string" && SCOUT_ROLES.has(value) ? (value as ScoutRole) : "unknown"
}

/**
 * Recency from a closed set.
 *
 * Unknown values fall back to `"old"`, the *weakest* weighting the analysis
 * engine applies. Defaulting to `"current"` would let corrupt data inflate the
 * confidence of a ban recommendation; defaulting down can only understate it.
 */
function readRecency(value: unknown): ScoutRecency {
  return typeof value === "string" && SCOUT_RECENCIES.has(value)
    ? (value as ScoutRecency)
    : "old"
}

/**
 * Manual-entry provenance from a closed set. Unknown values become `"other"`
 * ("a source this app does not model") rather than `"manual"`, which would
 * claim the number was typed in from memory.
 *
 * ---------------------------------------------------------------------------
 * LEGACY VALUE `"riot"` LANDS HERE ON PURPOSE, AND {@link SCOUT_SCHEMA_VERSION}
 * STAYS AT 2.
 *
 * `ScoutManualSource` briefly carried a seventh member, `"riot"`, written by
 * the optional Riot auto-import (a backend proxy). That import was removed on
 * 2026-08-19 and the member with it - see the closing note of section 9 in
 * src/scout/types.ts. It never shipped in a public build, so the only browser
 * that can hold such a row is one that ran the auto-import locally.
 *
 * Such a row is NOT rejected and NOT dropped. It is unknown, so it degrades to
 * `"other"` right here, and that is the wanted behaviour:
 *
 *  - no crash: the loader has always treated provenance as a closed set with a
 *    fallback, and one more value outside the set changes nothing;
 *  - NO DATA LOSS: championName, games, winrate, note, role and recency are
 *    read by their own guards and survive untouched. The row stays visible,
 *    stays editable and stays scoreable by `analyzeScout()`;
 *  - the only thing that changes is the provenance *label*, from "Riot API" to
 *    "other source". A LABEL LOSS, NOT A DATA LOSS.
 *
 * WHY BUMPING THE SCHEMA VERSION WOULD BE ACTIVELY HARMFUL HERE.
 * The version gate in `normalizeScoutState()` rejects any state whose
 * `schemaVersion` is *higher* than this build understands and falls back to an
 * EMPTY state. Nothing about the persisted *shape* changed - removing a member
 * from a string union adds no field, removes no field and needs no migration -
 * so a bump would buy nothing and cost everything: it would trade one
 * mislabelled source chip for the total loss of that user's scouted players in
 * every tab still running the previous bundle. A bump also demands a new
 * `ScoutStateV*` plus a migration branch, and there is neither, because there
 * is nothing to migrate. Do not "bump it to be safe".
 * ---------------------------------------------------------------------------
 */
function readManualSource(value: unknown): ScoutManualSource {
  return typeof value === "string" && MANUAL_SOURCES.has(value)
    ? (value as ScoutManualSource)
    : "other"
}

/* ==========================================================================
 * 4. Normalisation - the pure core (no localStorage anywhere in this section)
 * ========================================================================== */

/**
 * A lineup with all eight slots explicitly empty.
 *
 * Exported because three callers need exactly this object and must not each
 * build their own: the empty state below, the V1 -> V2 migration, and the UI's
 * "reset lineup" action. Built from `SCOUT_LINEUP_SLOTS` /
 * `SCOUT_SUBSTITUTE_SLOTS` rather than written out as a literal, so a change to
 * those tuples cannot leave a slot behind here.
 *
 * Lives here and not in src/scout/types.ts on purpose: that module is the shared
 * contract and is deliberately logic-free.
 */
export function createEmptyScoutLineup(): ScoutLineup {
  // `{}` is not a complete `Record` yet; the loops below make it one, which is
  // what the assertion promises. A hand-written literal would be type-safe but
  // would retype the slot names - the exact drift this function exists to avoid.
  const starters = {} as Record<ScoutLineupSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_LINEUP_SLOTS) starters[slot] = null

  const substitutes = {} as Record<ScoutSubstituteSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) substitutes[slot] = null

  return { starters, substitutes }
}

/** A fresh, well-formed, empty state. Also the fallback for every failure. */
export function createEmptyScoutState(): ScoutState {
  return {
    schemaVersion: SCOUT_SCHEMA_VERSION,
    players: [],
    playerData: {},
    lineup: createEmptyScoutLineup(),
    includeSubstitutes: false,
    removedPlayers: {},
  }
}

/** One source link. Invalid links are dropped - they are cheap to rebuild. */
function normalizeSourceRef(raw: unknown): ScoutSourceRef | null {
  if (!isRecord(raw)) return null

  const kind = readNonEmptyString(raw.kind)
  if (kind === null || !SOURCE_KINDS.has(kind)) return null

  const url = readNonEmptyString(raw.url)
  if (url === null) return null

  const status = readNonEmptyString(raw.status)
  if (status === null || !SOURCE_STATUSES.has(status)) return null

  const ref: ScoutSourceRef = {
    kind: kind as ScoutSourceKind,
    url,
    status: status as ScoutSourceStatus,
  }

  const note = readVerbatimString(raw.note)
  if (note !== null) ref.note = note

  const noteCode = readNonEmptyString(raw.noteCode)
  if (noteCode !== null && SOURCE_NOTE_CODES.has(noteCode)) {
    ref.noteCode = noteCode as ScoutSourceNoteCode
  }

  return ref
}

/** Source list, deduped by `kind` (first wins) as `ScoutPlayer.sources` promises. */
function normalizeSourceRefs(raw: unknown): ScoutSourceRef[] {
  if (!Array.isArray(raw)) return []
  const refs: ScoutSourceRef[] = []
  const seen = new Set<ScoutSourceKind>()
  for (const item of raw) {
    const ref = normalizeSourceRef(item)
    if (ref === null || seen.has(ref.kind)) continue
    seen.add(ref.kind)
    refs.push(ref)
  }
  return refs
}

/**
 * One player.
 *
 * Dropped when `id` or `riotName` is missing or blank: `id` is the key the whole
 * feature hangs on (`playerData`, `removedPlayers` and every lineup slot), and a
 * player without a name can neither be displayed nor looked up on any source.
 * Everything else is default-safe.
 */
function normalizePlayer(raw: unknown): ScoutPlayer | null {
  if (!isRecord(raw)) return null

  const id = readNonEmptyString(raw.id)
  if (id === null || UNSAFE_OBJECT_KEYS.has(id)) return null

  const riotName = readNonEmptyString(raw.riotName)
  if (riotName === null) return null

  const tagline = readNonEmptyString(raw.tagline) ?? ""
  const region = readNonEmptyString(raw.region) ?? SCOUT_REGION_UNKNOWN
  const displayName =
    readNonEmptyString(raw.displayName) ?? (tagline === "" ? riotName : `${riotName}#${tagline}`)

  return {
    id,
    riotName,
    tagline,
    region,
    displayName,
    role: readRole(raw.role),
    sources: normalizeSourceRefs(raw.sources),
  }
}

/** Player list; broken entries are skipped, duplicate ids keep the first entry. */
function normalizePlayers(raw: unknown): ScoutPlayer[] {
  if (!Array.isArray(raw)) return []
  const players: ScoutPlayer[] = []
  const seen = new Set<ScoutPlayerId>()
  for (const item of raw) {
    const player = normalizePlayer(item)
    if (player === null || seen.has(player.id)) continue
    seen.add(player.id)
    players.push(player)
  }
  return players
}

/**
 * One manually typed champion row. Returns `null` when the row cannot be
 * trusted; see the module header for why nothing is clamped:
 *
 *   - no champion name                      -> dropped (unrenderable)
 *   - games not a number / negative          -> dropped (a fake `0` would lie
 *                                              about the sample size behind the
 *                                              winrate)
 *   - winrate not a number / outside 0-100   -> dropped (a clamped 100 % would
 *                                              change the ban priority)
 *
 * `games` is floored, because the contract says "non-negative integer" and
 * `12.7` games cannot exist; flooring loses no information a user entered.
 */
function normalizeManualEntry(raw: unknown): ManualChampionEntry | null {
  if (!isRecord(raw)) return null

  const championName = readNonEmptyString(raw.championName)
  if (championName === null) return null

  const gamesValue = readFiniteNumber(raw.games)
  if (gamesValue === null || gamesValue < 0) return null

  const winrate = readFiniteNumber(raw.winrate)
  if (winrate === null || winrate < 0 || winrate > 100) return null

  const entry: ManualChampionEntry = {
    championName,
    games: Math.floor(gamesValue),
    winrate,
    note: readVerbatimString(raw.note) ?? "",
    source: readManualSource(raw.source),
    recency: readRecency(raw.recency),
    role: readRole(raw.role),
  }

  const id = readNonEmptyString(raw.id)
  if (id !== null) entry.id = id

  return entry
}

/** Entry list; broken rows are skipped, the surviving rows keep their order. */
function normalizeManualEntries(raw: unknown): ManualChampionEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: ManualChampionEntry[] = []
  for (const item of raw) {
    const entry = normalizeManualEntry(item)
    if (entry !== null) entries.push(entry)
  }
  return entries
}

/**
 * One `ScoutPlayerData` record, for a player id already known to be safe.
 *
 * `playerId` is passed in rather than read from `raw`, because the *container*
 * is authoritative: for `playerData` that is the map key, for an archive entry
 * it is `ScoutRemovedPlayer.player.id`. A `playerId` field that disagrees with
 * its container is overwritten, not honoured - the container is what every
 * lookup uses.
 */
function normalizePlayerData(
  raw: Record<string, unknown>,
  playerId: ScoutPlayerId,
): ScoutPlayerData {
  const data: ScoutPlayerData = {
    playerId,
    entries: normalizeManualEntries(raw.entries),
  }

  const note = readVerbatimString(raw.note)
  if (note !== null) data.note = note

  const updatedAtIso = readNonEmptyString(raw.updatedAtIso)
  if (updatedAtIso !== null) data.updatedAtIso = updatedAtIso

  return data
}

/**
 * Manual data, keyed by player id.
 *
 * DECISION - orphaned keys (no player with that id) are DROPPED. UNCHANGED IN V2.
 * `playerData` is only ever reached through a `ScoutPlayer.id`, so an orphaned
 * entry is unreachable by definition: the UI cannot render it, the user cannot
 * edit or delete it, and the analysis engine never sees it. Keeping it would
 * mean an invisible, monotonically growing blob competing for the ~5 MB
 * localStorage quota the visible data needs. Dropping it also hands every
 * consumer the invariant "every key has a player", which removes a whole class
 * of `players.find(...)` null handling.
 *
 * V2 does not soften that rule - it adds the explicit place the rule was
 * missing. Data that should survive a re-parse belongs in `removedPlayers`,
 * where it keeps its player record and therefore stays visible and restorable.
 * Silently keeping unreachable keys here would be a different thing entirely:
 * an archive nobody can see.
 *
 * The map key is authoritative: a `playerId` field that disagrees with its key
 * is rewritten to the key, because the key is what every lookup uses.
 */
function normalizePlayerDataMap(
  raw: unknown,
  knownPlayerIds: ReadonlySet<ScoutPlayerId>,
): Record<ScoutPlayerId, ScoutPlayerData> {
  const map: Record<ScoutPlayerId, ScoutPlayerData> = {}
  if (!isRecord(raw)) return map

  for (const [key, value] of Object.entries(raw)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue
    if (!knownPlayerIds.has(key)) continue
    if (!isRecord(value)) continue

    map[key] = normalizePlayerData(value, key)
  }

  return map
}

/**
 * The `slot -> playerId` pairs of one half of a stored lineup, as a `Map`.
 *
 * Two things happen here and nowhere else:
 *  - unknown keys are dropped (`allowedSlots` is derived from the canonical
 *    tuples), which is also what makes a `__proto__` key a non-event;
 *  - a `Map` is used instead of an object, so no assignment can reach a
 *    prototype in the first place.
 *
 * Resolution (does the player exist, duplicates, order) deliberately does *not*
 * happen here - it belongs in {@link normalizeLineup}, which walks the canonical
 * slot order.
 */
function readLineupSlotMap(
  raw: unknown,
  allowedSlots: ReadonlySet<string>,
): ReadonlyMap<string, ScoutPlayerId> {
  const bySlot = new Map<string, ScoutPlayerId>()
  if (!isRecord(raw)) return bySlot

  for (const [key, value] of Object.entries(raw)) {
    if (!allowedSlots.has(key)) continue
    const playerId = readNonEmptyString(value)
    if (playerId === null) continue
    bySlot.set(key, playerId)
  }

  return bySlot
}

/**
 * The lineup. Always returns all eight slots; anything unusable becomes `null`.
 *
 * Three rules, applied in this order:
 *  1. unknown slot keys are ignored (see {@link readLineupSlotMap});
 *  2. a slot value is only accepted when a `ScoutPlayer` with that id survived
 *     normalisation. A slot pointing at a player who is not in `players` is not
 *     "almost right": it would render as an empty box with a hidden id behind
 *     it, and the analysis would score nobody for that lane while the UI still
 *     counted the slot as filled;
 *  3. DUPLICATE INVARIANT: an id occupies at most one of the eight slots.
 *     `ScoutLineup` states this invariant but cannot express it in the type
 *     system, so it is enforced wherever a lineup is *written* - here and in the
 *     UI's assignment action.
 *
 * DECISION - the first hit in CANONICAL order wins (top, jungle, mid, bot,
 * support, sub1, sub2, sub3), exactly as `ScoutLineup` prescribes for readers.
 * Not "the first key in the stored object": JSON key order is not a contract, so
 * resolving by it would make the surviving assignment depend on how the object
 * happened to be serialised - the same state could then load differently twice.
 * Canonical order also means a starter entry beats a substitute entry for the
 * same player, which is the stronger of the two statements.
 */
function normalizeLineup(raw: unknown, knownPlayerIds: ReadonlySet<ScoutPlayerId>): ScoutLineup {
  const lineup = createEmptyScoutLineup()
  if (!isRecord(raw)) return lineup

  const rawStarters = readLineupSlotMap(raw.starters, LINEUP_SLOT_KEYS)
  const rawSubstitutes = readLineupSlotMap(raw.substitutes, SUBSTITUTE_SLOT_KEYS)
  const assigned = new Set<ScoutPlayerId>()

  for (const slot of SCOUT_LINEUP_SLOTS) {
    const playerId = rawStarters.get(slot)
    if (playerId === undefined || !knownPlayerIds.has(playerId) || assigned.has(playerId)) continue
    assigned.add(playerId)
    lineup.starters[slot] = playerId
  }

  for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
    const playerId = rawSubstitutes.get(slot)
    if (playerId === undefined || !knownPlayerIds.has(playerId) || assigned.has(playerId)) continue
    assigned.add(playerId)
    lineup.substitutes[slot] = playerId
  }

  return lineup
}

/**
 * One archived player.
 *
 * Dropped when the player record itself is unusable, or when `data` is not an
 * object at all: `ScoutRemovedPlayer` exists for exactly one purpose - keeping
 * manual rows the user typed. An entry with no readable data container preserves
 * nothing, while still costing quota and offering the user a "restore" that
 * would restore nothing. An entry whose rows are all *invalid* is kept (with an
 * empty `entries` array), mirroring `playerData`, where a record with zero
 * surviving rows also stays.
 */
function normalizeRemovedPlayer(raw: unknown): ScoutRemovedPlayer | null {
  if (!isRecord(raw)) return null

  const player = normalizePlayer(raw.player)
  if (player === null) return null

  if (!isRecord(raw.data)) return null

  const removed: ScoutRemovedPlayer = {
    player,
    data: normalizePlayerData(raw.data, player.id),
  }

  const removedAtIso = readNonEmptyString(raw.removedAtIso)
  if (removedAtIso !== null) removed.removedAtIso = removedAtIso

  return removed
}

/**
 * Oldest first, exactly as `SCOUT_REMOVED_PLAYERS_MAX` prescribes: entries
 * without a stamp count as oldest, because an unstamped entry either pre-dates
 * the field or was written by code that did not set it - either way it is the
 * least likely to be the user's most recent work. ISO-8601 strings compare
 * correctly with `<` as long as they are UTC, which is what every writer in this
 * project produces (`toISOString()`).
 */
function compareRemovedAtIso(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return a < b ? -1 : 1
}

/**
 * The removed-player archive, keyed by player id.
 *
 * Guards, in order:
 *  - the same `UNSAFE_OBJECT_KEYS` refusal as `playerData` (prototype pollution
 *    through a `__proto__` key produced by `JSON.parse`);
 *  - an id already present in `playerData` is skipped. `ScoutStateV2` states
 *    that an id lives in one map or the other, never both, and the live data is
 *    the copy the user is editing. (An id that is in `players` but has no
 *    `playerData` is deliberately *not* rejected: dropping the archive there
 *    would delete rows the UI can still restore.)
 *  - the key must equal `value.player.id`. DECISION - a mismatch DROPS the
 *    entry, unlike `playerData`, where the key wins and the `playerId` field is
 *    rewritten. There the value is a bag of rows with one redundant id field;
 *    here the value carries a whole `ScoutPlayer` whose id is *derived* from
 *    region + name + tagline. Rewriting it would produce a player record whose
 *    id no longer matches their Riot ID, which is precisely what breaks the
 *    promise that re-adding the same Riot ID finds the archive again.
 *  - `SCOUT_REMOVED_PLAYERS_MAX` caps the map, dropping the oldest entries.
 *
 * Key order of the result follows input order; only the *decision* which entries
 * to drop uses `removedAtIso`. Ties (equal or missing stamps) are broken by
 * input position, so the outcome is deterministic.
 */
function normalizeRemovedPlayers(
  raw: unknown,
  livePlayerDataIds: ReadonlySet<ScoutPlayerId>,
): Record<ScoutPlayerId, ScoutRemovedPlayer> {
  const map: Record<ScoutPlayerId, ScoutRemovedPlayer> = {}
  if (!isRecord(raw)) return map

  const kept: { key: ScoutPlayerId; removed: ScoutRemovedPlayer }[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue
    if (livePlayerDataIds.has(key)) continue

    const removed = normalizeRemovedPlayer(value)
    if (removed === null || removed.player.id !== key) continue

    kept.push({ key, removed })
  }

  const dropCount = kept.length - SCOUT_REMOVED_PLAYERS_MAX
  const droppedIndices = new Set<number>()
  if (dropCount > 0) {
    const byAge = kept.map((item, index) => ({ index, removedAtIso: item.removed.removedAtIso }))
    byAge.sort((a, b) => compareRemovedAtIso(a.removedAtIso, b.removedAtIso) || a.index - b.index)
    for (const item of byAge.slice(0, dropCount)) droppedIndices.add(item.index)
  }

  kept.forEach((item, index) => {
    if (droppedIndices.has(index)) return
    map[item.key] = item.removed
  })

  return map
}

/** `true` only for the exact schema version this file reads and writes. */
function isCurrentSchemaVersion(value: unknown): value is typeof SCOUT_SCHEMA_VERSION {
  return value === SCOUT_SCHEMA_VERSION
}

/**
 * `true` for the legacy version this file can still *read*. Typed against
 * `ScoutStateV1` so deleting or renumbering that legacy type breaks here first,
 * instead of quietly turning every old browser's blob into an empty state.
 */
function isLegacySchemaVersionV1(value: unknown): value is ScoutStateV1["schemaVersion"] {
  return value === 1
}

/**
 * The fields V1 and V2 have in common, read with identical rules on both paths.
 *
 * Factored out precisely so the migration cannot drift from the current reader:
 * "carried over unchanged" is only true when it is literally the same code.
 */
interface CommonScoutFields {
  players: ScoutPlayer[]
  playerData: Record<ScoutPlayerId, ScoutPlayerData>
  rawInput?: string
  updatedAtIso?: string
}

function readCommonScoutFields(raw: Record<string, unknown>): CommonScoutFields {
  const players = normalizePlayers(raw.players)
  const knownPlayerIds = new Set<ScoutPlayerId>(players.map((player) => player.id))

  const common: CommonScoutFields = {
    players,
    playerData: normalizePlayerDataMap(raw.playerData, knownPlayerIds),
  }

  const rawInput = readVerbatimString(raw.rawInput)
  if (rawInput !== null) common.rawInput = rawInput

  // Note the asymmetry with `rawInput`: `""` is legitimate textarea content, a
  // blank timestamp is not, so it is omitted instead of stored.
  const updatedAtIso = readNonEmptyString(raw.updatedAtIso)
  if (updatedAtIso !== null) common.updatedAtIso = updatedAtIso

  return common
}

/** Copies the two optional fields onto a freshly built state, when present. */
function applyOptionalCommonFields(state: ScoutState, common: CommonScoutFields): ScoutState {
  if (common.rawInput !== undefined) state.rawInput = common.rawInput
  if (common.updatedAtIso !== undefined) state.updatedAtIso = common.updatedAtIso
  return state
}

/**
 * V1 -> V2. One-way; nothing here ever writes a V1 state back.
 *
 * CARRIED OVER (with the same readers the V2 path uses, see
 * {@link readCommonScoutFields}):
 *   players, playerData, and `rawInput` / `updatedAtIso` only when present.
 *   Player ids are deterministic, so nothing is recomputed and the input order
 *   of `players` is preserved.
 *
 * DEFAULT-INITIALISED (a V1 state cannot contain any of these):
 *   lineup -> eight `null`s, includeSubstitutes -> false, removedPlayers -> {}.
 *
 * DELIBERATELY NOT DONE - pre-filling the lineup from `ScoutPlayer.role`. That
 * role is a guess read out of a pasted URL and is frequently `"unknown"`.
 * Writing five guesses into the starting five would present invented structure
 * as the user's own decision, which is exactly the honesty rule this feature is
 * built on. The UI offers an explicit "fill from detected roles" button instead;
 * then it is the user's click, not the loader's assumption.
 *
 * DELIBERATELY NOT DONE - inventing `updatedAtIso`. A V1 state without a stamp
 * stays without one: a migration is not an edit by the user.
 */
function migrateV1ToV2(raw: Record<string, unknown>): ScoutState {
  const common = readCommonScoutFields(raw)

  return applyOptionalCommonFields(
    {
      schemaVersion: SCOUT_SCHEMA_VERSION,
      players: common.players,
      playerData: common.playerData,
      lineup: createEmptyScoutLineup(),
      includeSubstitutes: false,
      removedPlayers: {},
    },
    common,
  )
}

/** Normalisation of a record already known to carry the current schemaVersion. */
function normalizeScoutStateV2(raw: Record<string, unknown>): ScoutState {
  const common = readCommonScoutFields(raw)
  const knownPlayerIds = new Set<ScoutPlayerId>(common.players.map((player) => player.id))
  const livePlayerDataIds = new Set<ScoutPlayerId>(Object.keys(common.playerData))

  return applyOptionalCommonFields(
    {
      schemaVersion: SCOUT_SCHEMA_VERSION,
      players: common.players,
      playerData: common.playerData,
      lineup: normalizeLineup(raw.lineup, knownPlayerIds),
      includeSubstitutes: readBooleanOrFalse(raw.includeSubstitutes),
      removedPlayers: normalizeRemovedPlayers(raw.removedPlayers, livePlayerDataIds),
    },
    common,
  )
}

/**
 * Turn anything at all into a valid {@link ScoutState}. Pure: no storage, no
 * clock, no logging - this is the function the tests exercise hardest.
 *
 * Unknown extra fields are ignored, because the result is *built* field by field
 * and never spread from the input.
 */
export function normalizeScoutState(raw: unknown): ScoutState {
  // Rejects null, undefined, primitives and arrays in one guard (CLAUDE.md P4).
  if (!isRecord(raw)) return createEmptyScoutState()

  // MIGRATION HOOK - the only place a schema version is interpreted. A future V3
  // adds one branch here (`migrateV2ToV3`); nothing else in this file changes.
  if (isLegacySchemaVersionV1(raw.schemaVersion)) return migrateV1ToV2(raw)
  if (isCurrentSchemaVersion(raw.schemaVersion)) return normalizeScoutStateV2(raw)

  // Missing, non-numeric, older than 1 or *higher* than this build understands:
  // not interpreted at all. A newer tab may have written fields with different
  // meanings, and reading those with V2 rules would produce confidently wrong
  // data.
  return createEmptyScoutState()
}

/* ==========================================================================
 * 5. localStorage boundary
 *
 * Every access is wrapped: reading the global itself can throw a SecurityError
 * when storage is disabled (private mode, blocked cookies, sandboxed iframe),
 * and `setItem` throws `QuotaExceededError` once the ~5 MB budget is used up.
 * Persistence is best-effort - the in-memory React state stays authoritative,
 * so a storage failure must never reach the UI as an exception.
 * ========================================================================== */

function getScoutStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage
  } catch {
    return null
  }
}

/**
 * Read the persisted state. Never throws and always returns a well-formed
 * state - an empty one when storage is unavailable, empty, corrupt or written by
 * a schema version this build does not understand. A legacy V1 blob is migrated
 * (see {@link normalizeScoutState}); the migrated result reaches storage only
 * when the caller saves.
 */
export function loadScoutState(): ScoutState {
  try {
    const storage = getScoutStorage()
    if (storage === null) return createEmptyScoutState()

    const raw = storage.getItem(SCOUT_STORAGE_KEY)
    if (!raw) return createEmptyScoutState()

    return normalizeScoutState(JSON.parse(raw) as unknown)
  } catch {
    // Unreadable storage or invalid JSON: start clean rather than crash.
    return createEmptyScoutState()
  }
}

/**
 * Persist the state. Silently does nothing when storage is unavailable or full
 * (`QuotaExceededError`) - mirroring src/notes/storage.ts, a failed write is not
 * an error the user can act on and must not break the tab.
 *
 * The state is normalised before writing, so whatever lands in storage is
 * guaranteed to load back cleanly. Note that this applies the orphan rule of
 * {@link normalizePlayerDataMap}: manual data whose player is no longer in
 * `players` is not written - archive it in `removedPlayers` first if it should
 * survive. The same holds for a lineup slot pointing at a player who is gone and
 * for an archive entry whose id is back in `playerData`.
 */
export function saveScoutState(state: ScoutState, options?: SaveScoutStateOptions): void {
  try {
    const storage = getScoutStorage()
    if (storage === null) return

    const normalized = normalizeScoutState(state)

    const nowIso = readNonEmptyString(options?.nowIso)
    if (nowIso !== null) normalized.updatedAtIso = nowIso

    storage.setItem(SCOUT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Quota exceeded, storage disabled, or a value that cannot be serialised.
  }
}

/** Remove the persisted state. Never throws. */
export function clearScoutState(): void {
  try {
    const storage = getScoutStorage()
    if (storage === null) return
    storage.removeItem(SCOUT_STORAGE_KEY)
  } catch {
    // Nothing to do - the key is either already gone or unreachable.
  }
}
