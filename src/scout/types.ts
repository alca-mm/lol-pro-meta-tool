/**
 * Domain types for the Tournament Scout feature ("Turnier Scout" tab).
 *
 * This module is the shared contract between the four parts of the feature and
 * therefore contains *only* types plus a small number of documented constants —
 * no logic, no side effects, and type-only imports from src/domain/types alone:
 *
 *   1. link parser        → src/scout/linkParser.ts
 *   2. source adapters    → src/scout/sources.ts
 *   3. analysis engine    → fills the *Analysis / *BanPlan result types and
 *                           reads `ScoutAnalysisOptions`
 *   4. persistence + UI   → ScoutStateV2, lineup, reason/warning codes
 *
 * ---------------------------------------------------------------------------
 * Two rules are baked into these types and must not be softened later:
 *
 * (A) HONESTY — no invented data.
 *     Every champion number in this feature is either typed in by the user or
 *     read out of a link the user pasted. Nothing is scraped, guessed or
 *     interpolated. Where an external source cannot be read from the browser,
 *     that fact is modelled explicitly (`ScoutSourceStatus` +
 *     `ScoutSourceNoteCode`) instead of being hidden behind an empty result.
 *
 * (B) NO PRE-TRANSLATED PROSE.
 *     No type here carries a user-facing German or English sentence.
 *     Explanations travel as machine-readable codes plus parameters
 *     (`ScoutReason`, `ScoutWarning`, `UnparsedLine.reason`) — the same idea
 *     the draft helper already uses with its `reason_*` i18n keys
 *     (see `reasons: string[]` in src/analysis/draftHelper.ts). Only the UI
 *     turns a code into text, so DE/EN stay in src/i18n where they belong.
 * ---------------------------------------------------------------------------
 */

import type { ChampionStats, Role } from "../domain/types"

/* ==========================================================================
 * 1. Scalar / enum-ish base types
 * ========================================================================== */

/** The four scouting sites this feature knows how to build links for. */
export type ScoutSourceKind = "opgg" | "leagueofgraphs" | "deeplol" | "dpm"

/**
 * How usable a single source is for a single player — the honesty flag of this
 * feature. Never widen the meaning of these values:
 *
 * - `parsed_from_url`          the player's identity was read *out of this URL*
 *                              (the user pasted it), so the link is known-good.
 * - `source_link_only`         the link was generated and is usable, but the
 *                              numbers behind it can only be read manually /
 *                              in a separate browser tab.
 * - `manual_required`          no usable link could be built (e.g. region or
 *                              tagline unknown) — the user has to supply the
 *                              data by hand.
 * - `not_supported_in_browser` a *direct* fetch is technically impossible from
 *                              a browser page (CORS / anti-bot / no public API).
 * - `error`                    detection or link building failed.
 */
export type ScoutSourceStatus =
  | "parsed_from_url"
  | "source_link_only"
  | "manual_required"
  | "not_supported_in_browser"
  | "error"

/**
 * Role of a scouted player. Identical to the domain `Role` plus `"unknown"`,
 * because scout input frequently arrives without a role
 * (e.g. a bare OP.GG multilink).
 */
export type ScoutRole = "top" | "jungle" | "mid" | "bot" | "support" | "unknown"

/**
 * Internal: turns a failed type-level check into a real compile error at the
 * declaration below, instead of a silently `never`-typed alias nobody reads.
 * `Assert<false>` does not satisfy the `T extends true` constraint, so `tsc`
 * fails on the guard itself. Zero runtime cost — this file emits no JS for it.
 */
type Assert<T extends true> = T

/**
 * Compile-time guard: if `Role` in src/domain/types.ts ever gains a value that
 * `ScoutRole` does not cover, this alias stops compiling. Purely a type-level
 * assertion, no runtime cost.
 */
export type ScoutRoleCoversDomainRole = Assert<
  [Role] extends [ScoutRole] ? true : false
>

/**
 * How current a manually entered data point is. The user picks this; it is
 * never derived from a clock, so nothing in this feature depends on `Date`.
 *
 * - `current` = current patch / current split
 * - `recent`  = last few patches / previous split
 * - `old`     = anything older (kept, but weighted down by the engine)
 */
export type ScoutRecency = "current" | "recent" | "old"

/**
 * Confidence attached to a signal, a ban candidate or a whole analysis.
 * `none` means "we have literally no basis" and must be rendered as such —
 * it is *not* a synonym for `low`.
 */
export type ScoutConfidence = "high" | "medium" | "low" | "none"

/**
 * Canonical, upper-case region code, e.g. `"EUW"`, `"KR"`, `"NA"`.
 *
 * Deliberately a `string` alias and not a closed union: region slugs differ per
 * provider and per Riot platform generation (`EUW` / `EUW1` / `euw`), and an
 * unknown slug must never break parsing. `normalizeScoutRegion()` in
 * src/scout/sources.ts maps the known aliases onto the canonical code and
 * returns `SCOUT_REGION_UNKNOWN` for everything else.
 */
export type ScoutRegion = string

/**
 * Stable local player id, deterministically derived from region + Riot name +
 * tagline (see `buildScoutPlayerId()` in src/scout/linkParser.ts).
 *
 * Deterministic on purpose: dedupe, persistence (`ScoutState.playerData` is
 * keyed by it) and the tests all rely on the same input producing the same id.
 * Never generate it randomly, never derive it from a timestamp.
 */
export type ScoutPlayerId = string

/**
 * A winrate in **percent, 0–100** (e.g. `71` means 71 %).
 *
 * DECISION — read this before doing any math with a scout winrate:
 * Scout winrates are typed in by a human who is reading them off OP.GG /
 * League of Graphs / DeepLoL / DPM, and those sites all display percent.
 * Storing what the user sees avoids a silent ×100 mistake at input time.
 *
 * NOTE the difference to the meta engine: `ChampionStats.winRate`,
 * `DraftRecommendation.winRate` etc. in src/domain use a **fraction 0–1**.
 * Any bridge between the two worlds must convert explicitly
 * (`fraction = percent / 100`). Never pass a `WinratePercent` into a function
 * that expects the domain fraction.
 */
export type WinratePercent = number

/* ==========================================================================
 * 2. Sources
 * ========================================================================== */

/**
 * Machine-readable note on *why* a source ref looks the way it does.
 * Rendered through i18n by the UI; never shown raw.
 */
export type ScoutSourceNoteCode =
  /** identity was extracted from exactly this URL */
  | "identity_from_url"
  /** profile URL was generated from a verified URL shape */
  | "profile_link_generated"
  /** profile URL was generated from a best-effort / unverified URL shape */
  | "url_format_heuristic"
  /** no link possible: region could not be determined */
  | "region_unknown"
  /** no link possible: Riot tagline missing (e.g. legacy OP.GG link) */
  | "tagline_unknown"
  /** no link possible: name missing or otherwise unusable */
  | "identity_incomplete"
  /** a direct fetch from the browser is not possible for this provider */
  | "direct_fetch_not_supported"
  /** host recognised, but the path shape was not understood */
  | "unknown_url_shape"

/** One link to one external site for one player. */
export interface ScoutSourceRef {
  kind: ScoutSourceKind
  /**
   * Absolute, fully URL-encoded link. When no profile URL could be built this
   * falls back to the provider's site root (never an empty string, never a
   * fabricated deep link), and `status` says `manual_required`.
   */
  url: string
  status: ScoutSourceStatus
  /**
   * Free-form *developer* note. Debug aid only — the UI must not render it,
   * because it is not translated. Use `noteCode` for anything user-facing.
   */
  note?: string
  /** Machine-readable, i18n-able counterpart of `note`. */
  noteCode?: ScoutSourceNoteCode
}

/** Why a provider is not fetched directly, and whether that could ever change. */
export type ScoutFetchBlockedCode =
  /** no public read API documented at all */
  | "no_public_api"
  /** an endpoint exists but does not send permissive CORS headers */
  | "cors_blocked"
  /** bot protection / challenge page makes an unattended fetch unreliable */
  | "anti_bot_protection"
  /** page markup only; scraping would be brittle and ToS-sensitive */
  | "html_scraping_only"
  /**
   * A reachable endpoint exists but is the site's own private backend: no
   * documentation, no stability promise, no ToS coverage. Deliberately treated
   * as blocked — using it would make the tool silently break on their next
   * deploy and would misrepresent an internal API as a supported integration.
   */
  | "undocumented_private_api"
  /** could not be verified — treated as blocked until proven otherwise */
  | "unverified"

/** Whether a provider is known to offer a public API a browser could call. */
export type ScoutPublicApiState =
  /** nothing public documented */
  | "none_documented"
  /** an API is documented, but it is not callable from a browser (no CORS) */
  | "documented_no_cors"
  /** an undocumented internal endpoint does answer cross-origin requests */
  | "undocumented_cors_ok"
  /** could not be established either way */
  | "not_verifiable"

/** Honest, machine-readable statement about direct fetching for one provider. */
export interface ScoutDirectFetchInfo {
  kind: ScoutSourceKind
  /** Always `false` in this version — no adapter implements `fetchSnapshot`. */
  supportedInBrowser: boolean
  /** Currently always `not_supported_in_browser`. */
  status: ScoutSourceStatus
  reason: ScoutFetchBlockedCode
  publicApi: ScoutPublicApiState
}

/**
 * Result shape a *future* real adapter would return. Defined now so the
 * adapter interface is complete and honest; nothing produces one today.
 */
export interface ScoutSourceSnapshot {
  kind: ScoutSourceKind
  playerId: ScoutPlayerId
  /** ISO-8601 timestamp, set by whoever performs the (future) fetch. */
  fetchedAtIso: string
  entries: ManualChampionEntry[]
}

/* ==========================================================================
 * 3. Players and manual data
 * ========================================================================== */

/**
 * The minimum needed to address a player on an external site. Split out from
 * `ScoutPlayer` so link building can be called before an id exists.
 */
export interface ScoutPlayerIdentity {
  /** Riot ID game name, as typed by the user (original casing preserved). */
  riotName: string
  /** Riot ID tagline *without* the leading `#`. Empty string when unknown. */
  tagline: string
  /** Canonical region code, or `SCOUT_REGION_UNKNOWN`. */
  region: ScoutRegion
}

/** A player recognised from the scout input. */
export interface ScoutPlayer extends ScoutPlayerIdentity {
  /** Deterministic id — see {@link ScoutPlayerId}. */
  id: ScoutPlayerId
  /** `"Name#TAG"`, or just `"Name"` when the tagline is unknown. */
  displayName: string
  role: ScoutRole
  /** One entry per known/derivable source, deduped by `kind`. */
  sources: ScoutSourceRef[]
}

/**
 * Where a champion row for a player came from — the provenance a user reads
 * back weeks later when deciding how far to trust a number.
 *
 * The four {@link ScoutSourceKind} values are the scouting sites, `"manual"`
 * means "typed in from memory", and `"other"` means "from somewhere this app
 * does not model" (it is also the fallback for anything unreadable).
 *
 * NOTE the deliberate asymmetry with {@link ScoutImportSourceKind}: that type
 * has an `"unknown"` member, this one does not. `"unknown"` is a legitimate
 * *parser* answer, never a legitimate stored provenance.
 *
 * ---------------------------------------------------------------------------
 * REMOVED MEMBER `"riot"` — HISTORY, SO NOBODY RESTORES IT BY REFLEX.
 * A seventh member `"riot"` existed briefly, for rows fetched through the
 * optional Riot auto-import (a backend proxy). That import was deliberately
 * removed on 2026-08-19 — see the closing note at the end of section 9 — and
 * with nothing able to produce such a row any more, the member would only
 * offer a provenance no user can honestly claim.
 *
 * A row already stored with `source: "riot"` is NOT lost. `readManualSource()`
 * in src/scout/storage.ts degrades every value outside this union to `"other"`,
 * so champion, games, winrate, note, role and recency all survive untouched and
 * only the provenance *label* changes to "other source". That is a LABEL LOSS,
 * NOT A DATA LOSS, and it is the wanted behaviour.
 *
 * {@link SCOUT_SCHEMA_VERSION} therefore stays at 2. The full argument is on
 * `readManualSource()`; in short, the version gate in `normalizeScoutState()`
 * rejects anything *higher* than a build understands and falls back to an EMPTY
 * state — so a bump would trade one mislabelled source chip for the total loss
 * of the scout data in every still-open older tab.
 * ---------------------------------------------------------------------------
 *
 * ADDITIVE ONLY — every member maps mechanically to a `scout_source_<value>`
 * i18n key via `scoutSourceKey()` in src/components/scout/scoutUiHelpers.ts,
 * so a rename is a compile error there, and a removal orphans stored rows.
 */
export type ScoutManualSource = ScoutSourceKind | "manual" | "other"

/**
 * One champion row a user typed in for one player.
 *
 * `games` and `winrate` are plain numbers on purpose (no `null`): a row only
 * exists because a human entered it. A row the user cannot fill in should not
 * be created — absence of data is expressed by the *absence* of entries plus a
 * `no_data` reason, never by a fake `0`.
 *
 * The single optional field is {@link ManualChampionEntry.kda}: it may be
 * absent, and its absence is neutral rather than bad - see the field itself for
 * why absent and `0` must never be conflated.
 */
export interface ManualChampionEntry {
  /** Optional stable key for list rendering/editing; not part of identity. */
  id?: string
  /** Champion name as used by src/analysis/championCatalog.ts. */
  championName: string
  /** Number of games behind the winrate. Non-negative integer. */
  games: number
  /** Winrate in **percent (0–100)** — see {@link WinratePercent}. */
  winrate: WinratePercent
  /**
   * KDA ratio taken from the import, when the source stated one (e.g. `3.4`).
   *
   * OPTIONAL AND BACKWARD COMPATIBLE IN BOTH DIRECTIONS - which is exactly why
   * {@link SCOUT_SCHEMA_VERSION} stays at 2 and no migration branch was added.
   * The field is purely additive:
   *  - an OLDER build reading a state that carries it ignores the unknown key.
   *    `normalizeManualEntry()` in src/scout/storage.ts builds its result field
   *    by field and never spreads the input, so championName, games, winrate,
   *    note, source, recency and role all survive untouched and only the KDA
   *    itself is gone the next time that build saves. A FIELD LOSS, NEVER A ROW
   *    LOSS - the same reasoning as the legacy `"riot"` source value above.
   *  - a NEWER build reading an older state simply finds no `kda` and reads
   *    that as "not stated".
   *
   * ABSENT / `undefined` / `null` ALL MEAN "NOT STATED" AND MUST BE SCORED
   * NEUTRALLY, NEVER AS A BAD KDA. A missing value is absence of evidence;
   * turning it into a penalty would invent data, which is honesty rule (A) at
   * the top of this file. `0` is a different statement entirely: a real, truly
   * bad value (no kills and no assists) that the source did print, and it has
   * to stay distinguishable from "not stated". Consumers must therefore test
   * for `null`/`undefined` explicitly and never for falsiness - `!entry.kda`
   * collapses precisely the two cases that must not be collapsed.
   *
   * TWO WRITERS, ONE RULE. Until 0.5.1 the stats import was the only writer and
   * this paragraph said so; since 0.5.1 the manual editor writes it too, so a
   * `kda` in the state is no longer proof that the row came from an import.
   *  - `importRowToManualEntry()` in src/scout/statsImport.ts passes
   *    {@link ScoutImportRow.kda} through when it is a finite number `>= 0` and
   *    omits the key otherwise.
   *  - `withKdaValue()` in src/components/scout/ScoutDataEditor.tsx does the
   *    same for a typed-in value, and DELETES the key for an empty field rather
   *    than writing `null`. Its gate `parseKdaInput()` is the stricter of the
   *    two: it also refuses anything above the plausibility bound the scoring
   *    uses (`SCOUT_KDA_MAX_PLAUSIBLE` in src/scout/analysis.ts), because a
   *    value the scoring reads as "not stated" should not sit in a row looking
   *    like data. The import keeps no such bound, so an implausible imported
   *    KDA is stored and then shown flagged in the editor. That asymmetry is
   *    deliberate: it is visible, it costs nothing, and it never drops a row.
   *
   * `normalizeManualEntry()` applies the finite/`>= 0` rule again on load and on
   * save, whoever wrote the value - so a row without a usable KDA serialises
   * exactly as it did before this field existed. An unusable KDA never drops the
   * row; only `games` and `winrate` can do that. For an imported row the value
   * also stays in the human-readable note (`KDA 3.1`), which is unchanged; a
   * typed-in KDA does not touch the note, because the note belongs to the user.
   */
  kda?: number | null
  /** Free user note. Not translated, shown verbatim, never parsed. */
  note: string
  /** Which site the number was read off (or "manual" when from memory). */
  source: ScoutManualSource
  recency: ScoutRecency
  role: ScoutRole
}

/** All manually collected data for one player. */
export interface ScoutPlayerData {
  playerId: ScoutPlayerId
  entries: ManualChampionEntry[]
  /** Free note about the player (not translated, shown verbatim). */
  note?: string
  /**
   * ISO-8601, set by the UI/persistence layer. Optional so pure code stays
   * clock-free and its tests stay deterministic.
   */
  updatedAtIso?: string
}

/* ==========================================================================
 * 4. Lineup (starting five + substitutes)
 *
 * A scouted team is five starting positions plus up to three substitutes.
 * Everything the user pastes first lands in a *pool*; assigning a player to a
 * slot is an explicit user action, never a guess by the parser.
 * ========================================================================== */

/**
 * The five starting positions.
 *
 * DERIVED, NEVER RETYPED: `Exclude<ScoutRole, "unknown">`. Writing the five
 * literals out a second time is exactly how two role vocabularies drift apart;
 * deriving them makes a future change to `ScoutRole` propagate here, and
 * `ScoutLineupSlotMatchesDomainRole` below turns any drift *away from the
 * domain* `Role` into a compile error.
 *
 * NAMING — READ THIS BEFORE "FIXING" IT:
 * The bot lane slot is called **`"bot"`**, never `"adc"`. `ScoutRole` and the
 * domain `Role` (src/domain/types.ts) both use `"bot"`, `ScoutPlayer.role`,
 * `ManualChampionEntry.role`, every persisted state and every `Record` key in
 * this file follow. "ADC" is a *label*, not an identifier: it exists in exactly
 * one place, the i18n layer (`scout_role_bot`), and the UI is free to print
 * "ADC" there. Introducing a second identifier `"adc"` anywhere in code would
 * fork the slot keys, break `ScoutRoleCoversDomainRole` and silently orphan
 * every lineup already persisted in a user's browser. Do not do it.
 */
export type ScoutLineupSlot = Exclude<ScoutRole, "unknown">

/**
 * Compile-time guard: `ScoutLineupSlot` and the domain `Role` must describe the
 * *same* set of five roles. Resolves to `never` as soon as either side gains or
 * loses a member. `[T] extends [U]` (tuple wrapping) stops the conditional from
 * distributing over the union, so this really compares whole sets.
 * Purely type-level, no runtime cost.
 */
export type ScoutLineupSlotMatchesDomainRole = Assert<
  [Role] extends [ScoutLineupSlot] ? ([ScoutLineupSlot] extends [Role] ? true : false) : false
>

/**
 * Substitute slots — exactly three.
 *
 * A team may register one to three substitutes; the slots are always all three,
 * an unused one simply holds `null`. Deliberately *not* derived from a role:
 * a substitute is a bench seat, not a position, and the player sitting there
 * keeps whatever `ScoutPlayer.role` was recognised for them.
 */
export type ScoutSubstituteSlot = "sub1" | "sub2" | "sub3"

/**
 * THE canonical starting-slot order: top → jungle → mid → bot → support.
 *
 * One constant so the UI grid, the export text and the analysis all iterate the
 * same sequence instead of each declaring their own array (that duplication is
 * how three subtly different orders end up on screen). Also the runtime source
 * of "all five slots" for building an empty lineup.
 */
export const SCOUT_LINEUP_SLOTS = [
  "top",
  "jungle",
  "mid",
  "bot",
  "support",
] as const satisfies readonly ScoutLineupSlot[]

/** Compile-time guard: the tuple above lists *every* `ScoutLineupSlot`. */
export type ScoutLineupSlotsAreComplete = Assert<
  [ScoutLineupSlot] extends [(typeof SCOUT_LINEUP_SLOTS)[number]] ? true : false
>

/** Canonical substitute order. Same reasoning as {@link SCOUT_LINEUP_SLOTS}. */
export const SCOUT_SUBSTITUTE_SLOTS = [
  "sub1",
  "sub2",
  "sub3",
] as const satisfies readonly ScoutSubstituteSlot[]

/** Compile-time guard: the tuple above lists *every* `ScoutSubstituteSlot`. */
export type ScoutSubstituteSlotsAreComplete = Assert<
  [ScoutSubstituteSlot] extends [(typeof SCOUT_SUBSTITUTE_SLOTS)[number]] ? true : false
>

/**
 * Where a player stands in the lineup.
 *
 * - `starter`     occupies one of the five starting slots
 * - `substitute`  sits on one of the three substitute slots
 * - `unassigned`  recognised from the input but not placed yet (the pool)
 */
export type ScoutLineupMembership = "starter" | "substitute" | "unassigned"

/**
 * Slot → player assignment for one scouted team.
 *
 * DECISION — two `Record`s, not arrays:
 *  - "this slot is empty" is representable *explicitly* as `null`. An array of
 *    filled assignments can only express emptiness by absence, which the UI
 *    would have to re-inflate into five rows on every render.
 *  - duplicate or missing slots become unrepresentable. An
 *    `{ slot, playerId }[]` would need a runtime invariant check on every load
 *    and every drag-and-drop.
 *  - lookup by slot is direct, which is what the UI grid and the analysis both
 *    do most often.
 *
 * ORDER does **not** come from key order — JSON object key order is not a
 * contract and must never be relied on. Display and export order always come
 * from {@link SCOUT_LINEUP_SLOTS} / {@link SCOUT_SUBSTITUTE_SLOTS}.
 *
 * INVARIANT (not expressible in TypeScript): a `ScoutPlayerId` appears at most
 * once across `starters` and `substitutes`. It is enforced where a lineup is
 * *written* — the UI assignment action and `normalizeScoutState()` — never
 * assumed by readers; a reader that finds a duplicate keeps the first hit in
 * canonical slot order and drops the rest.
 */
export interface ScoutLineup {
  starters: Record<ScoutLineupSlot, ScoutPlayerId | null>
  substitutes: Record<ScoutSubstituteSlot, ScoutPlayerId | null>
}

/** One row of the starting five, already in canonical order. */
export interface ScoutLineupStarterRow {
  slot: ScoutLineupSlot
  /** `null` renders as the empty drop target — never omit the row. */
  playerId: ScoutPlayerId | null
}

/** One substitute row, already in canonical order. */
export interface ScoutLineupSubstituteRow {
  slot: ScoutSubstituteSlot
  playerId: ScoutPlayerId | null
}

/**
 * Where exactly one player sits.
 *
 * INVARIANT: `membership === "starter"` ⇔ `starterSlot !== null`,
 * `membership === "substitute"` ⇔ `substituteSlot !== null`, and
 * `membership === "unassigned"` ⇔ both are `null`. Never both non-null.
 */
export interface ScoutLineupAssignment {
  playerId: ScoutPlayerId
  membership: ScoutLineupMembership
  /** Starting slot, or `null` for substitutes and unassigned players. */
  starterSlot: ScoutLineupSlot | null
  /** Substitute slot, or `null` for starters and unassigned players. */
  substituteSlot: ScoutSubstituteSlot | null
}

/**
 * Derived lineup state that the UI *and* the analysis both need.
 *
 * This type describes the *result* of that derivation, not the derivation
 * itself — computing it belongs in the analysis engine (for the ban plan) and
 * in the UI helpers (for rendering). Defining the shape here stops the two from
 * inventing two slightly different answers to "who is on the bench?".
 *
 * Every list is ordered: slot lists follow the canonical slot order, player-id
 * lists follow the input order of `ScoutPlayer[]`.
 */
export interface ScoutLineupSummary {
  /** Always exactly five rows, in {@link SCOUT_LINEUP_SLOTS} order. */
  starters: ScoutLineupStarterRow[]
  /** Always exactly three rows, in {@link SCOUT_SUBSTITUTE_SLOTS} order. */
  substitutes: ScoutLineupSubstituteRow[]
  /** Assignment per known player. Players missing here are `unassigned`. */
  byPlayerId: Record<ScoutPlayerId, ScoutLineupAssignment>
  /** Ids in the five starting slots, in canonical slot order, empties skipped. */
  starterPlayerIds: ScoutPlayerId[]
  /** Ids on the bench, in canonical slot order, empties skipped. */
  substitutePlayerIds: ScoutPlayerId[]
  /** Recognised players that sit in no slot at all (the pool). */
  unassignedPlayerIds: ScoutPlayerId[]
  /** Starting slots still empty, in canonical order. */
  missingStarterSlots: ScoutLineupSlot[]
  /** `true` exactly when `missingStarterSlots.length === 0`. */
  isStartingFiveComplete: boolean
  /**
   * Ids referenced by the lineup for which no `ScoutPlayer` exists (any more).
   * Normally empty; non-empty after a re-parse dropped a player.
   *
   * DIAGNOSTIC ONLY — it does **not** drive `data_loss_on_reparse`. That
   * warning is raised in src/components/scout/ScoutRemovedPlayersPanel.tsx from
   * the number of entries in the removed-player archive
   * ({@link ScoutRemovedPlayer}); `analyzeScout()` never emits it, because it
   * never sees the archive. Nothing renders this list today: its job here is to
   * keep a stale id *out* of `starters` / `starterPlayerIds` while still saying
   * out loud that the lineup referenced it.
   */
  danglingPlayerIds: ScoutPlayerId[]
}

/**
 * Default weight applied to a substitute's signals when substitutes are
 * included in the analysis (`includeSubstitutes === true`).
 *
 * WHY A WEIGHT AND NOT A PLAIN ON/OFF: a substitute *might* play. Scoring their
 * champions like a starter's would push a ban onto a player who may never enter
 * the game; dropping them entirely loses the information that they exist. 0.6
 * keeps a substitute's strongest pick relevant while it can no longer outrank a
 * comparable starter pick — the same "weight down, never delete" convention the
 * engine already applies to `old` data.
 *
 * Tuning constant, not user data: deliberately **not** persisted in
 * `ScoutStateV2`, so changing it here changes it everywhere at once.
 */
export const SCOUT_SUBSTITUTE_WEIGHT = 0.6

/**
 * User-facing lineup switches. Persisted (`includeSubstitutes`) and passed into
 * the analysis via {@link ScoutAnalysisOptions}.
 */
export interface ScoutLineupOptions {
  /**
   * `false` (the default): substitutes produce no signals and no ban
   * candidates at all — they are still shown, still editable, just not scored.
   * `true`: their signals count, multiplied by `substituteWeight`, and every
   * resulting signal carries `fromSubstitute: true`.
   */
  includeSubstitutes: boolean
  /** Override for {@link SCOUT_SUBSTITUTE_WEIGHT}. Clamped to 0–1 by the engine. */
  substituteWeight?: number
}

/* ==========================================================================
 * 5. Parsing
 * ========================================================================== */

/**
 * Why an input line could not be turned into a player. Machine-readable so the
 * UI can translate it — the parser must never silently swallow a line.
 */
export type UnparsedLineReason =
  /** free text without a `#` Riot ID */
  | "no_riot_id"
  /** a `#` was present but name or tagline was empty */
  | "invalid_riot_id"
  /** looked like a URL but could not be parsed at all */
  | "malformed_url"
  /** a URL from a site this feature does not know */
  | "unknown_url_host"
  /** known site, but the path shape was not understood */
  | "unsupported_url_shape"
  /** an OP.GG multilink that contained no summoners */
  | "empty_multilink"

/** A line of input that produced no player, kept for user feedback. */
export interface UnparsedLine {
  /** The original line (or the offending URL token), trimmed. */
  raw: string
  reason: UnparsedLineReason
}

/** Result of parsing one blob of scout input. */
export interface ScoutParseResult {
  players: ScoutPlayer[]
  unparsedLines: UnparsedLine[]
  /** How many recognised identities collapsed into an already known player. */
  duplicatesMerged: number
}

/* ==========================================================================
 * 6. Analysis results (filled by the analysis engine)
 * ========================================================================== */

/**
 * Machine-readable justification code. The UI maps it to a translated string
 * and substitutes `params`; the engine never emits a finished sentence.
 *
 * Example: `{ code: "high_winrate_many_games", params: { games: 42, winrate: 71 } }`
 */
export type ScoutReasonCode =
  /** strong winrate on a solid sample */
  | "high_winrate_many_games"
  /** strong winrate but few games — explicitly flagged as thin */
  | "high_winrate_small_sample"
  /** dominant share of the player's tracked games */
  | "signature_pick"
  /** one-trick-level concentration on a single champion */
  | "one_trick"
  /** played a lot despite a mediocre winrate (comfort pick) */
  | "high_games_low_winrate"
  /** the same champion appears in several roles */
  | "flex_across_roles"
  /** entry marked as current patch/split */
  | "played_recently"
  /** only `old` data available */
  | "stale_data"
  /** sample too small to carry weight on its own */
  | "small_sample"
  /** no manual entries at all for this player */
  | "no_data"
  /** the number came from manual entry only (nothing was fetched) */
  | "manual_entry_only"
  /** banning this champion denies more than one opponent */
  | "hits_multiple_players"
  /** champion is a high-priority pick in the imported pro meta */
  | "meta_priority"
  /** threat is bound to one specific role */
  | "role_specific_threat"
  /** the user explicitly raised this champion's priority */
  | "user_marked_priority"
  /* ---- lineup / role awareness (added with the lineup feature) ----------
   * ADDITIVE ONLY. Never remove a member above: i18n keys
   * (`scout_reason_<code>` in src/i18n/de.ts + en.ts) and tests depend on the
   * exact spelling of every one of them. */
  /** the signal's role is the player's role in the lineup — full weight */
  | "onrole_signal"
  /** the signal comes from a role the player does not hold in the lineup */
  | "offrole_signal"
  /** the champion spans several roles, or no lineup role is known — a ban may
   *  not hit the lane the user has in mind */
  | "role_unknown_or_flex"
  /** the signal comes from a substitute, who may never enter the game */
  | "substitute_risk"
  /** the player sits in no lineup slot, so no role comparison is possible */
  | "player_without_lineup_role"
  /* ---- champion stat strength (games / winrate / KDA weighting) ---------
   * ADDITIVE ONLY, same rule as every group above. Emitted by
   * `buildSignalContext()` in src/scout/analysis.ts, which fires AT MOST ONE
   * of the two per signal (strict ladder: `strong_kda` first, then
   * `many_games_on_champion`) so the weighting stays visible without turning
   * the reason list into a flood. */
  /** a lot of games on this champion — experience, independent of the winrate.
   *  Renders `{games}`, but it deliberately has NO
   *  `scout_reason_many_games_on_championOne` sibling and NO entry in
   *  `COUNT_SENSITIVE_REASONS` (src/components/scout/scoutUiHelpers.ts): the
   *  reason only fires from 44 games up (the threshold `analysis.ts` derives
   *  from `SCOUT_STAT_REASON_MIN_IMPACT`), so `{games} === 1` is structurally
   *  unreachable and a singular string would be copy nobody can ever see.
   *  tests/scoutPlural.test.ts freezes that decision in
   *  `UNTOUCHED_COUNT_KEYS`, and its ballast guard fails if a `...One` sibling
   *  is added anyway. */
  | "many_games_on_champion"
  /** above-average KDA on a sample solid enough to carry the claim */
  | "strong_kda"

/** Parameters substituted into the translated reason text. */
export type ScoutReasonParams = Readonly<Record<string, string | number>>

/** A single machine-readable justification. */
export interface ScoutReason {
  code: ScoutReasonCode
  params?: ScoutReasonParams
}

/**
 * Non-blocking caveats surfaced next to the recommendations.
 *
 * ADDITIVE ONLY — same rule as {@link ScoutReasonCode}: every member maps to a
 * `scout_warning_<code>` i18n key, so removing one breaks translations and
 * tests. New members go at the end.
 */
export type ScoutWarningCode =
  | "player_without_data"
  | "small_sample_overall"
  | "stale_data_overall"
  | "flex_pick_warning"
  | "meta_shift_possible"
  | "source_not_fetchable"
  | "conflicting_entries"
  | "duplicate_players_merged"
  /* ---- lineup / role awareness (added with the lineup feature) ---------- */
  /** fewer than five starting slots are filled — the ban plan is partial.
   *  `params: { missing: number }` */
  | "incomplete_starting_five"
  /** at least one player with data sits in no slot; their signals cannot be
   *  role-checked. `params: { count: number }` */
  | "player_without_lineup_role"
  /** at least one signal comes from a role its player does not hold — a ban
   *  built on it may miss the lane. `params: { count: number }` */
  | "offrole_data_present"
  /** substitutes are being scored (`includeSubstitutes === true`), so part of
   *  the plan targets players who may not play. `params: { count: number }` */
  | "substitute_risk_active"
  /** re-parsing the input would drop players that still carry manual scout
   *  data; the data was archived instead of deleted.
   *  `params: { count: number }` — see {@link ScoutRemovedPlayer} */
  | "data_loss_on_reparse"

/** A translated-by-the-UI warning. Severity mirrors `TeamCompWarning`. */
export interface ScoutWarning {
  code: ScoutWarningCode
  severity: "info" | "warning" | "danger"
  params?: ScoutReasonParams
  /** Optional anchors so the UI can highlight the affected row. */
  playerId?: ScoutPlayerId
  championName?: string
}

/** How trustworthy the data behind a player/analysis is. */
export interface ScoutDataQuality {
  /** Number of manual champion rows behind the judgement. */
  entryCount: number
  /** Sum of `games` over those rows. */
  totalGames: number
  /** `true` when at least one entry is marked `current`. */
  hasCurrentData: boolean
  confidence: ScoutConfidence
  /** Machine-readable notes, e.g. `small_sample` / `stale_data` / `no_data`. */
  notes: ScoutReason[]
}

/**
 * How a champion signal relates to the role its player actually holds in the
 * lineup.
 *
 * DECISION — one closed union, not three booleans:
 * `onrole` / `offrole` / `flex` / `unknown` are mutually exclusive answers to a
 * single question. Booleans (`isOnrole`, `isOffrole`, `isFlex`) would make
 * `isOnrole && isOffrole` representable and force every consumer to invent its
 * own precedence when two of them are set. A union makes the illegal states
 * unrepresentable and lets the UI `switch` exhaustively over exactly four
 * badges. Substitute-ness is *not* folded in here — it answers a different
 * question (who the player is, not which lane the data is from) and is carried
 * separately by `fromSubstitute`, so the two can be combined freely
 * ("offrole data from a substitute").
 *
 * DERIVATION (the analysis engine owns this; documented here so UI, export and
 * engine agree on what a badge means). The *reference role* is:
 *   1. the player's starting slot, when they are a starter;
 *   2. otherwise their `ScoutPlayer.role`, when they are a *substitute* and
 *      that role is not `"unknown"` (this is what gives a substitute a
 *      comparable role at all);
 *   3. otherwise: none.
 * Then, in this precedence:
 *   - `unknown` — the player holds no slot at all (`membership` is
 *                 `"unassigned"`). Their `ScoutPlayer.role` is a guess made by
 *                 the link parser, so there is nothing trustworthy to compare
 *                 against; claiming `offrole` here would contradict the
 *                 `player_without_lineup_role` reason that ships with the very
 *                 same signal, and would wrongly feed `offrole_data_present`
 *                 ("other than the one *in the lineup*"). This check comes
 *                 first, before `flex` — the flex fact itself survives in
 *                 `flex_across_roles` / `BanCandidate.isFlex`, which are
 *                 derived from the entries and not from the lineup.
 *   - `flex`    — the entries behind this champion+player span more than one
 *                 distinct non-`unknown` role. Flex wins even when one of those
 *                 roles matches: "a ban here may hit the wrong lane" is the
 *                 more useful statement.
 *   - `unknown` — no reference role, or the signal's own role is `"unknown"`.
 *   - `onrole`  — signal role === reference role.
 *   - `offrole` — both known and different.
 */
export type ScoutRoleFit = "onrole" | "offrole" | "flex" | "unknown"

/** One champion threat derived from one player's manual entries. */
export interface ChampionSignal {
  championName: string
  playerId: ScoutPlayerId
  /** The role the underlying *entries* were recorded on. */
  role: ScoutRole
  games: number
  /** Percent 0–100, or `null` when the entry carried no usable winrate. */
  winrate: WinratePercent | null
  /**
   * Games-weighted KDA across the entries behind this signal, or `null` when
   * not one of them stated a usable value.
   *
   * THIS IS THE VALUE THE SCORE USED, not a second reading of the same rows.
   * It is the output of the very `aggregateKda()` call that feeds
   * `championStatStrengthMultiplier()`, so a KDA on screen and a KDA in the
   * ban order can never disagree. Implausible values were already dropped by
   * `normalizeKda()` one layer below, which is why an unusable number reaches
   * this field as `null` rather than as a figure that visibly counts for
   * nothing.
   *
   * `0` IS A REAL VALUE and stays apart from `null`, exactly as on
   * {@link ManualChampionEntry.kda}: no kills and no assists is a statement,
   * "not stated" is the absence of one. Read it with an explicit `=== null`
   * check. `!kda` and `kda ?? 0` collapse the two cases that must stay apart.
   */
  kda: number | null
  recency: ScoutRecency
  /** Normalised threat score, 0–1, higher = more dangerous. */
  score: number
  confidence: ScoutConfidence
  reasons: ScoutReason[]
  /** Which sources the underlying entries claim to come from. */
  sources: ScoutManualSource[]
  /**
   * How `role` relates to the player's lineup role — see {@link ScoutRoleFit}.
   * Always `"unknown"` when no lineup was supplied to the analysis; never
   * omitted, so the UI never has to guess a default.
   */
  roleFit: ScoutRoleFit
  /**
   * The player's *starting* slot, or `null` when they are a substitute or sit
   * in no slot. This is the "Lineup: mid" half of an offrole badge; `role`
   * above is the "Signal: top" half.
   */
  lineupRole: ScoutLineupSlot | null
  /**
   * `true` when the player occupies a substitute slot. Orthogonal to
   * `roleFit`; a signal can be offrole *and* from a substitute.
   */
  fromSubstitute: boolean
}

/** Where in the ban phase a candidate belongs. */
export type ScoutBanPhase =
  /** safe/blind ban — hurts the opponent regardless of how the draft develops */
  | "safe"
  /** aimed at one specific player */
  | "target"
  /** only worth it under certain conditions (side, matchup, remaining picks) */
  | "situational"

/**
 * One recommended ban.
 *
 * WHY THE `target*` / `lineupRoles` FIELDS EXIST:
 * The requirement is "ban Karma **against the enemy mid/support data**", not
 * "ban Karma". The pre-lineup fields cannot express that:
 *  - `roles` holds the roles the *entries* were recorded on, including
 *    `"unknown"`, and says nothing about who plays them in the lineup;
 *  - `affectedPlayerIds` lists everyone hit but names no primary target and
 *    carries no order guarantee that a headline could rely on.
 * So the primary target (player + lineup role) and the set of lineup roles hit
 * are stated explicitly. `roles` stays untouched — removing it would break the
 * existing export and the ban rows.
 */
export interface BanCandidate {
  championName: string
  /** Normalised priority, 0–1, higher = ban earlier. */
  priority: number
  confidence: ScoutConfidence
  reasons: ScoutReason[]
  /** Every player this ban takes something away from. */
  affectedPlayerIds: ScoutPlayerId[]
  /** Roles the champion threatens across the affected players (entry roles). */
  roles: ScoutRole[]
  /** The signals this candidate was built from (traceability, no re-derivation). */
  signals: ChampionSignal[]
  /** `true` when more than one opponent is affected. */
  isOverlap: boolean
  /** `true` when the champion showed up in several roles. */
  isFlex: boolean
  phase?: ScoutBanPhase
  /**
   * The player this ban primarily denies.
   *
   * The strongest `onrole` signal wins, and only when the candidate has none at
   * all does the highest-scoring signal decide (ties broken exactly like
   * `affectedPlayerIds` is ordered). Score alone is not enough: an offrole
   * signal is only weighted down by 0.4, so a big offrole number can still
   * outrank a genuine onrole one, and naming *that* player would aim the
   * headline at a lane none of the rows behind it describe.
   * `null` only when the candidate somehow has no signals.
   */
  targetPlayerId: ScoutPlayerId | null
  /**
   * The *lineup* role of `targetPlayerId` — the "against mid" of the headline.
   *
   * `null` whenever the lane cannot be stated honestly: no lineup at all, no
   * `onrole` signal behind this candidate, or an onrole target who is a
   * substitute / holds no starting slot. A `null` here means "do not name a
   * lane", never "unknown lane" — `lineupRoles` still lists every starting slot
   * the ban touches.
   */
  targetRole: ScoutLineupSlot | null
  /**
   * Every starting slot this ban hits, in {@link SCOUT_LINEUP_SLOTS} order and
   * deduped — this is what renders as "Mid / Support". Empty when no affected
   * player is a starter.
   */
  lineupRoles: ScoutLineupSlot[]
  /**
   * Aggregate {@link ScoutRoleFit} over `signals`: `flex` when they disagree or
   * any single signal is flex, `unknown` when none can be judged, otherwise the
   * fit they share.
   */
  roleFit: ScoutRoleFit
  /**
   * `true` when *every* signal behind this candidate comes from a substitute —
   * i.e. banning it may deny a player who never enters the game. `false` as
   * soon as one starter is affected.
   */
  substituteOnly: boolean
}

/** Per-player analysis result. */
export interface PlayerAnalysis {
  playerId: ScoutPlayerId
  /** Denormalised for rendering; the id stays authoritative. */
  displayName: string
  /** The role recognised for the player, independent of the lineup. */
  role: ScoutRole
  signals: ChampionSignal[]
  /** Bans aimed specifically at this player, highest priority first. */
  targetBans: BanCandidate[]
  dataQuality: ScoutDataQuality
  confidence: ScoutConfidence
  /**
   * Champions this player plays a lot but loses on — exploit, do not ban.
   * Lives here rather than in an extension interface because the engine has
   * always produced it and the UI has always rendered it; `ScoutPlayerAnalysis`
   * below is kept only as an alias for existing imports.
   */
  weaknesses: ChampionSignal[]
  /**
   * Where this player sits. Always present: an unplaced player carries
   * `{ membership: "unassigned", starterSlot: null, substituteSlot: null }`,
   * which is what `player_without_lineup_role` is raised from.
   */
  lineup: ScoutLineupAssignment
}

/** Ban plan for the whole enemy team. */
export interface TeamBanPlan {
  /** Global priority list, highest first. */
  prioritizedBans: BanCandidate[]
  /** Target bans per player, keyed by {@link ScoutPlayerId}. */
  targetBansByPlayer: Record<ScoutPlayerId, BanCandidate[]>
  /** Champions that hurt more than one opponent (`isOverlap === true`). */
  overlapBans: BanCandidate[]
  /** Flex / meta / data-quality caveats. */
  warnings: ScoutWarning[]
  /** Optional split of `prioritizedBans` into ban phases. */
  phases?: ScoutBanPhases
}

/** Optional phase split of the ban plan. */
export interface ScoutBanPhases {
  safe: BanCandidate[]
  target: BanCandidate[]
  situational: BanCandidate[]
}

/** Full analysis output for one scouting session. */
export interface ScoutAnalysis {
  players: PlayerAnalysis[]
  banPlan: TeamBanPlan
  /** Aggregate confidence over the whole scouting session. */
  confidence: ScoutConfidence
  /** Session-level warnings. */
  warnings: ScoutWarning[]
  /** All players' weaknesses, strongest sample first. */
  weaknesses: ChampionSignal[]
  /**
   * The lineup the analysis was run against, already derived. `null` when no
   * lineup was supplied — then every `roleFit` is `"unknown"` and no
   * lineup warning is raised (nothing was claimed, so nothing can be wrong).
   */
  lineup: ScoutLineupSummary | null
  /**
   * Optional ISO-8601 stamp. Optional on purpose: the pure engine must stay
   * clock-free so its tests are deterministic; only the UI may fill this in.
   */
  generatedAtIso?: string
}

/* ==========================================================================
 * 7. Analysis input + result aliases
 *
 * These three lived in src/scout/analysis.ts because that module was written
 * before this file could be changed. They belong in the shared contract: the UI
 * imports the result types, and the callers of `analyzeScout()` build the
 * options. analysis.ts now imports them from here instead of declaring them.
 * ========================================================================== */

/**
 * Optional inputs to `analyzeScout()`. Everything is optional — the engine is
 * fully functional without any of it, and every default is documented on the
 * field itself so no caller has to read the engine to find out.
 */
export interface ScoutAnalysisOptions {
  /**
   * Champion statistics from the local pro-meta dataset
   * (`calculateChampionStats()` in src/analysis/championStats.ts).
   * Used *only* to enrich champions that already have scout data.
   * `winRate`, `pickRate`, `banRate` and `presence` in there are FRACTIONS 0–1,
   * while every scout winrate is a percent — see {@link WinratePercent}.
   */
  proMeta?: readonly ChampionStats[]
  /** Champion names the user manually raised in priority (case-insensitive). */
  priorityChampions?: readonly string[]
  /** `ScoutParseResult.duplicatesMerged`, so the analysis can surface it. */
  duplicatesMerged?: number
  /**
   * Optional ISO timestamp passed straight through to
   * `ScoutAnalysis.generatedAtIso`. The engine never reads a clock itself, so
   * tests stay deterministic.
   */
  generatedAtIso?: string
  /**
   * The team's lineup. Omitted (or `undefined`) means "no lineup known": every
   * signal then gets `roleFit: "unknown"`, `lineupRole: null`,
   * `fromSubstitute: false`, `ScoutAnalysis.lineup` is `null`, and none of the
   * lineup warnings are raised. Supplying a *partially filled* lineup is the
   * normal case and does raise `incomplete_starting_five`.
   */
  lineup?: ScoutLineup
  /** See {@link ScoutLineupOptions.includeSubstitutes}. Default `false`. */
  includeSubstitutes?: boolean
  /** See {@link ScoutLineupOptions.substituteWeight}. Default
   *  {@link SCOUT_SUBSTITUTE_WEIGHT}. */
  substituteWeight?: number
}

/**
 * Alias kept for compatibility. `weaknesses` moved onto {@link PlayerAnalysis}
 * itself, so this no longer adds anything — it exists because
 * src/components/scout/ScoutAnalysisPanel.tsx and the export helper import the
 * name. Prefer `PlayerAnalysis` in new code.
 */
export type ScoutPlayerAnalysis = PlayerAnalysis

/**
 * Alias kept for compatibility, same reasoning as {@link ScoutPlayerAnalysis}:
 * `weaknesses` and `lineup` are part of {@link ScoutAnalysis} now. Prefer
 * `ScoutAnalysis` in new code.
 */
export type ScoutAnalysisResult = ScoutAnalysis

/* ==========================================================================
 * 8. Persistence
 * ========================================================================== */

/** Current persistence schema version. Bump together with a new `ScoutStateV*`. */
export const SCOUT_SCHEMA_VERSION = 2

/**
 * Versioned persisted state (localStorage today, possibly Supabase later).
 *
 * Compatibility rules, mirroring the project's contract rules:
 *  - `schemaVersion` is the discriminator; a loader must check it *first* and
 *    fall back to an empty state for anything it does not understand.
 *  - Within one version, new fields are added optional and default-safe. A
 *    field that must always be present gets a new version instead. Never
 *    repurpose a field.
 *  - Derived data (analysis results, generated links) is intentionally *not*
 *    stored — it is cheap to recompute and would otherwise go stale.
 *
 * ---------------------------------------------------------------------------
 * V1 IS LEGACY — READ-ONLY.
 * This build no longer writes V1. It exists solely as the *input* type of the
 * V1 → V2 migration (see {@link ScoutStateV2}), which is why it must not be
 * deleted, renamed or "cleaned up": every browser that used the previous build
 * still has a V1 blob under `lol_tournament_scout`, and dropping this type
 * would turn that user's scout data into an unreadable string.
 * ---------------------------------------------------------------------------
 */
export interface ScoutStateV1 {
  schemaVersion: 1
  /** Recognised players, in input order. */
  players: ScoutPlayer[]
  /** Manual data keyed by {@link ScoutPlayerId}. */
  playerData: Record<ScoutPlayerId, ScoutPlayerData>
  /** The raw textarea content, so the user's paste survives a reload. */
  rawInput?: string
  /** ISO-8601, written by the persistence layer. */
  updatedAtIso?: string
}

/**
 * A player who disappeared from the parsed input but still carries manual
 * scout data.
 *
 * WHY THIS EXISTS: re-parsing the textarea rebuilds `players` from scratch. Any
 * player no longer in the text used to take their `playerData` with them —
 * silently, and irreversibly once the state was saved. That is the exact
 * opposite of this feature's honesty rule: work the user typed in vanished
 * without a word. Instead their player record *and* their data move here, the
 * UI raises `data_loss_on_reparse`, and re-adding the same Riot ID restores
 * everything (the id is deterministic, so the archive key matches again).
 *
 * Archived data is never scored: the analysis only ever sees `players` +
 * `playerData`.
 */
export interface ScoutRemovedPlayer {
  /** The full player record as it was before removal (id, sources, role). */
  player: ScoutPlayer
  /** Their manual rows, untouched. */
  data: ScoutPlayerData
  /**
   * ISO-8601, set by whoever archives. Optional so pure code stays clock-free;
   * the UI sorts by it when present, by `player.displayName` otherwise.
   */
  removedAtIso?: string
}

/**
 * Soft cap on the archive so a long session cannot grow the ~5 MB localStorage
 * budget without bound. When the cap is exceeded, drop the *oldest* entries
 * (`removedAtIso` ascending, entries without a stamp first).
 */
export const SCOUT_REMOVED_PLAYERS_MAX = 50

/**
 * Version 2 — adds the lineup, the substitute switch and the removed-player
 * archive. Same compatibility rules as {@link ScoutStateV1}.
 *
 * ---------------------------------------------------------------------------
 * MIGRATION V1 → V2 (implemented in src/scout/storage.ts, `normalizeScoutState`)
 *
 * Carried over unchanged:
 *   players     ← V1.players     (same order, same ids — ids are deterministic,
 *                                 so nothing has to be recomputed)
 *   playerData  ← V1.playerData  (validated exactly as before)
 *   rawInput    ← V1.rawInput    (kept when present, else omitted)
 *   updatedAtIso← V1.updatedAtIso(kept when present, else omitted)
 *
 * Default-initialised (a V1 state cannot contain any of these):
 *   schemaVersion      → 2
 *   lineup             → all eight slots `null`. Deliberately NOT auto-filled
 *                        from `ScoutPlayer.role`: a parsed role is a guess from
 *                        a URL, and silently promoting five guesses into a
 *                        lineup would present invented structure as the user's
 *                        own decision (honesty rule A). The UI offers a
 *                        one-click "fill from detected roles" instead.
 *   includeSubstitutes → false (the conservative default: nothing a substitute
 *                        plays can influence a ban plan until the user says so)
 *   removedPlayers     → {} (nothing was ever archived under V1)
 *
 * Never invented: no timestamp is generated during migration. A V1 state
 * without `updatedAtIso` stays without one.
 *
 * A V2 state read by an older build is rejected by that build's version check
 * and falls back to empty — which is why the migration must be one-way only and
 * must never write V1 back.
 * ---------------------------------------------------------------------------
 */
export interface ScoutStateV2 {
  schemaVersion: 2
  /** Recognised players, in input order. */
  players: ScoutPlayer[]
  /** Manual data keyed by {@link ScoutPlayerId}. */
  playerData: Record<ScoutPlayerId, ScoutPlayerData>
  /**
   * Slot assignment. Required, never `undefined`: an "empty" lineup is eight
   * explicit `null`s, so readers never have to distinguish "no lineup yet" from
   * "lineup with nobody in it".
   */
  lineup: ScoutLineup
  /** See {@link ScoutLineupOptions.includeSubstitutes}. */
  includeSubstitutes: boolean
  /**
   * Archive keyed by {@link ScoutPlayerId} — same key space as `playerData`, so
   * a re-appearing player is found with one lookup. Keyed rather than an array
   * because restoring on re-parse is a lookup, not a scan; ordering for display
   * comes from `removedAtIso`. Capped by {@link SCOUT_REMOVED_PLAYERS_MAX}.
   *
   * A given id lives in `playerData` *or* in `removedPlayers`, never both.
   */
  removedPlayers: Record<ScoutPlayerId, ScoutRemovedPlayer>
  /** The raw textarea content, so the user's paste survives a reload. */
  rawInput?: string
  /** ISO-8601, written by the persistence layer. */
  updatedAtIso?: string
}

/**
 * The state this build reads and writes. Always the newest version — bump this
 * together with {@link SCOUT_SCHEMA_VERSION}.
 */
export type ScoutState = ScoutStateV2

/**
 * Every persisted shape this build can *interpret*, for the migration path.
 * `normalizeScoutState()` narrows on `schemaVersion` and returns
 * {@link ScoutState}; nothing else should accept a `ScoutStateV1`.
 */
export type AnyScoutState = ScoutStateV1 | ScoutStateV2

/* ==========================================================================
 * 9. Stats import (paste a champion table, review it, then apply it)
 *
 * WHAT THIS SECTION MODELS
 * The user opens a scouting site in a second tab, selects the champion table
 * of ONE player for ONE role, copies it, and pastes it into the scout. The
 * import parses that text into reviewable rows, shows what it understood and
 * what it did not, and only turns the rows the user confirms into ordinary
 * `ManualChampionEntry` records.
 *
 * WHY THIS IS STILL "MANUAL" DATA UNDER RULE (A)
 * Nothing here fetches anything. The text arrives because a human copied it,
 * exactly like typing the numbers by hand — only faster and with fewer typos.
 * The parser therefore reports what the text *said*, never what it thinks the
 * text meant: a column it could not find stays `null` (see
 * {@link ScoutImportRow}), a line it could not read is kept verbatim in
 * `unparsedLines` instead of being dropped, and every judgement it makes is
 * attached to the row as a machine-readable {@link ScoutImportWarning} rather
 * than being silently applied.
 *
 * NO SCHEMA BUMP — {@link SCOUT_SCHEMA_VERSION} STAYS AT 2, AND THAT IS CORRECT
 * Nothing here needs a new schema version:
 *  - applying an import produces plain {@link ManualChampionEntry} rows that go
 *    into the existing `ScoutStateV2.playerData`. A saved state after an import
 *    has the same shape as one the user typed by hand — an older
 *    build reading it sees rows it already understands.
 *  - the one field the import has added since, the optional
 *    {@link ManualChampionEntry.kda}, is additive in both directions: an older
 *    build ignores the unknown key and loses nothing but the KDA itself, a
 *    newer build reads an absent key as "not stated". An optional field that
 *    is default-safe on both sides is exactly the case the compatibility rules
 *    on {@link ScoutStateV2} allow WITHOUT a new version.
 *  - the import panel's own state (the selected role, the pasted text, the
 *    parsed preview, the chosen source/recency, the apply mode) is transient UI
 *    state and is deliberately NOT persisted: a half-reviewed paste is not a
 *    scouting result, and restoring one after a reload would re-present
 *    unconfirmed numbers as if the user had accepted them.
 * So there is no new persisted field, no new version and therefore no migration
 * branch. Do not bump the version "to be safe" — a bump without a matching
 * `ScoutStateV*` and a migration branch in `normalizeScoutState()` is exactly
 * what makes existing users lose their scout data.
 *
 * ADDITIVE ONLY, LIKE {@link ScoutReasonCode}: {@link ScoutImportWarningCode},
 * {@link ScoutImportUnparsedReason}, {@link ScoutImportColumn} and
 * {@link ScoutImportLayout} each map mechanically onto an i18n key
 * (`scout_import_warning_<code>`, `scout_import_unparsed_<reason>`,
 * `scout_import_column_<column>`, `scout_import_layout_<layout>` in
 * src/i18n/de.ts + en.ts). Never remove or rename a member — the key lookup is
 * typed, so a rename becomes a compile error in the i18n layer instead of a
 * silent hole in the UI. New members go at the end.
 *
 * AND A NEW MEMBER BELONGS IN ITS RUNTIME TUPLE TOO. Each of these unions has a
 * `SCOUT_IMPORT_*` tuple declared directly beneath it
 * ({@link SCOUT_IMPORT_LAYOUTS}, {@link SCOUT_IMPORT_WARNING_CODES},
 * {@link SCOUT_IMPORT_UNPARSED_REASONS}, {@link SCOUT_IMPORT_COLUMNS},
 * {@link SCOUT_IMPORT_APPLY_MODES}) — the union's runtime projection, and the
 * list the tests iterate to prove that every member really has its i18n key.
 * Extending the union alone does not compile: the paired `…AreComplete`
 * {@link Assert} stays red until the tuple lists the new member as well. That
 * red is the point — it is what stops a member from shipping with an unchecked
 * translation key.
 * ========================================================================== */

/**
 * The role the user picks *before* pasting — the whole point of the feature.
 *
 * DECISION — {@link ScoutLineupSlot}, NOT {@link ScoutRole}:
 * `ScoutRole` carries `"unknown"`, and "unknown" is not something a user can
 * choose. Importing is an explicit statement ("this table is the enemy
 * support's champion pool"), so the type must not offer a way to import
 * role-less data. This is the requirement itself: a Karma table copied from a
 * support/mid profile must never end up scored as a jungle threat. The five
 * real roles are the only legal answers, and
 * {@link ScoutImportRoleMatchesDomainRole} keeps that set tied to the domain
 * `Role`.
 *
 * Derived, never retyped — same reasoning as {@link ScoutLineupSlot} itself.
 */
export type ScoutImportRole = ScoutLineupSlot

/**
 * Compile-time guard: the importable roles are exactly the five domain roles —
 * no more (nothing role-less sneaks in) and no fewer (a new domain role must be
 * importable too). Same tuple-wrapped both-directions check as
 * {@link ScoutLineupSlotMatchesDomainRole}; purely type-level, no runtime cost.
 */
export type ScoutImportRoleMatchesDomainRole = Assert<
  [Role] extends [ScoutImportRole] ? ([ScoutImportRole] extends [Role] ? true : false) : false
>

/**
 * Which site a pasted block appears to come from.
 *
 * `"unknown"` is a first-class answer, not a failure: the layouts of the four
 * supported sites overlap heavily once the text is stripped of markup, and
 * claiming "this is OP.GG" from a coincidence would put a wrong provider into
 * `ManualChampionEntry.source` — a value the user later reads as provenance.
 * When detection is not conclusive the importer says `"unknown"` and lets the
 * user pick; {@link ScoutStatsImportOptions.source} is the user's override, and
 * a disagreement between the two is reported as `source_mismatch`, never
 * resolved silently.
 */
export type ScoutImportSourceKind = ScoutSourceKind | "unknown"

/**
 * The overall shape the importer recognised in the pasted text.
 *
 * - `tabular_with_header` columns plus a header row it could read — the only
 *                         case where the column mapping is certain.
 * - `tabular_no_header`   consistent columns, but no header: the mapping was
 *                         inferred from value shapes and ships with
 *                         `columns_guessed`.
 * - `loose_lines`         one champion per line, values scattered in prose
 *                         (`"Karma 34 games 61% WR"`). Best-effort, per line.
 * - `unrecognized`        nothing table-like was found. `rows` is empty and the
 *                         input is preserved in `unparsedLines` — the importer
 *                         never returns a plausible-looking empty success.
 * - `opgg_raw_champion_page`
 *                         the raw copy of the OP.GG summoner **Champions** page
 *                         — the user selects from "Alle Champions" downwards and
 *                         pastes that.
 *
 * ADDITIVE ONLY — i18n key `scout_import_layout_<layout>`, built by
 * `scoutImportLayoutKey()` in src/components/scout/scoutImportHelpers.ts, so a
 * new member requires a matching `scout_import_layout_*` key in src/i18n/de.ts
 * + en.ts (a missing key is a compile error there, not a hole in the UI). New
 * members go at the end.
 *
 * ---------------------------------------------------------------------------
 * `opgg_raw_champion_page` IS THE ONE LAYOUT THAT IS NOT MADE OF COLUMNS.
 *
 * The other four all describe a *table*: values sit side by side on one line and
 * the importer's job is to map positions onto {@link ScoutImportColumn}s. A
 * browser copy of the OP.GG champions page loses every column boundary, so the
 * values arrive one per line, as a repeating block:
 *
 *     1
 *     Ahri
 *     Ahri
 *     36S
 *     36N
 *     50%
 *     2.60:1
 *
 * It is therefore recognised by a **line-block pattern**, never by a column
 * mapping, and {@link ScoutStatsImportResult.columns} stays empty for it exactly
 * as it does for `loose_lines`. This is also why {@link ScoutImportColumn} is
 * NOT extended for this layout: there is no column to name.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * NOT A SCRAPER — READ THIS BEFORE "AUTOMATING" IT.
 * This layout exists **solely because a human copied something and pasted it**.
 * Nothing is requested, nothing is fetched, no page is loaded, no markup is
 * read. The name mentions OP.GG only to describe the *shape of a text the user
 * already has in their clipboard*.
 *
 * Turning this into "the tool fetches the page itself" means building a
 * scraper, and that is ruled out in this project — see `SCOUT_DIRECT_FETCH_INFO`
 * in src/scout/sources.ts, which records per provider *why* a direct read from
 * the browser is not available (no public API, no CORS, bot protection, brittle
 * ToS-sensitive HTML). {@link ScoutAutoFetchStatus} renders exactly that
 * statement in the UI. A parser for pasted text does not weaken it.
 * ---------------------------------------------------------------------------
 *
 * A member `"riot_api"` existed while the Riot auto-import did; it was
 * removed with it on 2026-08-19 (see the closing note at the end of this
 * section). Every value left here answers "what shape did the pasted text
 * have?", which is the only question there is once nothing is fetched.
 */
export type ScoutImportLayout =
  | "tabular_with_header"
  | "tabular_no_header"
  | "loose_lines"
  | "unrecognized"
  | "opgg_raw_champion_page"

/**
 * The runtime projection of {@link ScoutImportLayout}, in declaration order.
 *
 * WHY THE TUPLE EXISTS: the tests used to mirror this union by hand
 * (`ALL_LAYOUTS` in tests/scoutImportHelpers.test.ts) in order to check that
 * every layout has its `scout_import_layout_*` key. A hand-written copy is a
 * second truth, and a second truth goes stale without a sound — the union gains
 * a member, the copy does not, and the new member's translation ships
 * unverified. That is not hypothetical: it is how the since-removed
 * `"riot_api"` member got as far as it did. Iterating this tuple makes the
 * tests walk the union itself instead of a copy of it.
 *
 * NOT A SECOND LIST: `satisfies` rejects anything that is not a union member,
 * and {@link ScoutImportLayoutsAreComplete} rejects a union member that is
 * missing here. Together they bind tuple and union in both directions — the
 * same pattern as {@link SCOUT_IMPORT_COLUMNS} and {@link SCOUT_LINEUP_SLOTS}.
 */
export const SCOUT_IMPORT_LAYOUTS = [
  "tabular_with_header",
  "tabular_no_header",
  "loose_lines",
  "unrecognized",
  "opgg_raw_champion_page",
] as const satisfies readonly ScoutImportLayout[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportLayout}. */
export type ScoutImportLayoutsAreComplete = Assert<
  [ScoutImportLayout] extends [(typeof SCOUT_IMPORT_LAYOUTS)[number]] ? true : false
>

/**
 * A column the importer claims to have identified, in the canonical order of
 * {@link SCOUT_IMPORT_COLUMNS}.
 *
 * This is a *report*, not a schema: {@link ScoutStatsImportResult.columns} says
 * which columns were found, so the preview can label what it shows and the user
 * can see at a glance that, say, `winrate` was never located. Columns that have
 * no home on {@link ManualChampionEntry} (`cs`, `csPerMin`,
 * `killParticipation`, `damage`, `role`) are still parsed and still shown —
 * they are what makes a misread table obvious to a human reviewer — but they do
 * not invent new persisted fields.
 *
 * `kda` USED TO BE IN THAT LIST AND NO LONGER IS: it is carried onto the
 * optional {@link ManualChampionEntry.kda} so the ban scoring can read it. It
 * is the only column that gained a home; the rest stay preview-only.
 *
 * `cs` and `csPerMin` are separate members on purpose: sites print either an
 * absolute creep score or a per-minute rate, and treating one as the other
 * would turn `7.8` into `7.8 CS` (or `212` into `212 CS/min`). Only `csPerMin`
 * has a home on {@link ScoutImportRow}; a `cs` column is reported as found but
 * never silently converted, because converting needs a game length nobody
 * pasted.
 *
 * ADDITIVE ONLY — i18n key `scout_import_column_<column>`.
 */
export type ScoutImportColumn =
  | "champion"
  | "games"
  | "winrate"
  | "kda"
  | "cs"
  | "csPerMin"
  | "killParticipation"
  | "damage"
  | "role"

/**
 * THE canonical column order for the preview table, the column-mapping UI and
 * the tests. One constant instead of an array per consumer — the same reasoning
 * as {@link SCOUT_LINEUP_SLOTS}: three independently declared orders is how
 * three subtly different tables end up on screen.
 *
 * Order is champion first (the identity of the row), then the two columns that
 * decide whether a row is applicable at all (`games`, `winrate`), then the
 * informational ones, then `role` last (it does not describe performance, it
 * describes provenance).
 */
export const SCOUT_IMPORT_COLUMNS = [
  "champion",
  "games",
  "winrate",
  "kda",
  "cs",
  "csPerMin",
  "killParticipation",
  "damage",
  "role",
] as const satisfies readonly ScoutImportColumn[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportColumn}. */
export type ScoutImportColumnsAreComplete = Assert<
  [ScoutImportColumn] extends [(typeof SCOUT_IMPORT_COLUMNS)[number]] ? true : false
>

/**
 * Why the importer is unhappy about something it parsed. Machine-readable, so
 * the UI translates it and the importer never emits a sentence (rule B).
 *
 * - `empty_input`            nothing was pasted (or only whitespace).
 * - `no_rows_detected`       text was present but no champion row came out.
 * - `header_not_recognized`  a header-looking line was found but not understood.
 * - `columns_guessed`        the column mapping was inferred, not read — the
 *                            honest counterpart of `tabular_no_header`.
 * - `unknown_champion`       the name did not resolve against
 *                            src/analysis/championCatalog.ts. The row is kept
 *                            with `championResolved: false`; it is never
 *                            auto-corrected to the nearest catalog entry.
 * - `missing_games`          no games value — the row cannot be applied as is.
 * - `missing_winrate`        no winrate value — same consequence.
 * - `value_out_of_range`     a number parsed but is impossible (negative games,
 *                            winrate outside 0–100, kill participation > 100).
 *                            Reported, not clamped: a clamp would turn a
 *                            misparse into a plausible-looking fact.
 * - `duplicate_champion`     the same champion appears twice in one paste.
 * - `role_mismatch`          the row's own role contradicts the role the user
 *                            selected — see {@link ScoutImportRow.detectedRole}.
 * - `row_not_parsed`         a line looked like a row but could not be turned
 *                            into one (it also appears in `unparsedLines`).
 * - `source_mismatch`        the detected source and the user-selected source
 *                            disagree.
 * - `winrate_mismatch`       the paste states a winrate that does not match the
 *                            one implied by its own win/loss counts — see the
 *                            rule below.
 *
 * ---------------------------------------------------------------------------
 * THE `winrate_mismatch` RULE — THE PARSER MUST IMPLEMENT EXACTLY THIS.
 * The OP.GG raw champion page prints a win count, a loss count *and* a rounded
 * winrate ("36S / 36N / 50%"). The three can disagree, because the site rounds
 * and because a copy can span a table that updated between two of its columns.
 * Three separate decisions follow, and none of them may be softened:
 *
 *  1. `games` ALWAYS comes from `wins + losses`. Two counted integers are the
 *     more load-bearing number; a rounded percentage is not evidence of a game
 *     count. Never reconstruct games from the winrate.
 *  2. `winrate` is TAKEN FROM THE PASTE UNCHANGED. It is never quietly replaced
 *     by `wins / (wins + losses) * 100`, and it is never rounded, clamped or
 *     "corrected". Rewriting it would present the tool's arithmetic as
 *     something the source said (rule A at the top of this file).
 *  3. When the recomputed winrate differs from the stated one by more than a
 *     plausible rounding difference, THIS WARNING IS RAISED and the row is kept
 *     as it is. The user decides what to do about it — the tool states the
 *     disagreement, it does not resolve it.
 *
 * `params`:
 *  - `champion` the champion the row is about,
 *  - `stated`   the winrate OP.GG printed (percent 0–100),
 *  - `computed` the winrate recomputed from `wins`/`losses` (percent 0–100).
 * Both numbers travel so the UI can show them side by side; the message text
 * itself lives in i18n, never here (rule B).
 * ---------------------------------------------------------------------------
 *
 * ADDITIVE ONLY — i18n key `scout_import_warning_<code>`.
 */
export type ScoutImportWarningCode =
  | "empty_input"
  | "no_rows_detected"
  | "header_not_recognized"
  | "columns_guessed"
  | "unknown_champion"
  | "missing_games"
  | "missing_winrate"
  | "value_out_of_range"
  | "duplicate_champion"
  | "role_mismatch"
  | "row_not_parsed"
  | "source_mismatch"
  | "winrate_mismatch"

/**
 * The runtime projection of {@link ScoutImportWarningCode}, in declaration
 * order.
 *
 * Same job as {@link SCOUT_IMPORT_LAYOUTS}: tests/scoutImportHelpers.test.ts
 * mirrored this union by hand (`ALL_WARNING_CODES`) to assert that every code
 * resolves to a `scout_import_warning_*` key. Such a copy can go stale in
 * silence while the new code's translation stays unchecked — iterating the
 * tuple makes the assertion walk the union itself.
 *
 * `satisfies` blocks a value that is not a member; the guard below blocks a
 * member that is not in the tuple.
 */
export const SCOUT_IMPORT_WARNING_CODES = [
  "empty_input",
  "no_rows_detected",
  "header_not_recognized",
  "columns_guessed",
  "unknown_champion",
  "missing_games",
  "missing_winrate",
  "value_out_of_range",
  "duplicate_champion",
  "role_mismatch",
  "row_not_parsed",
  "source_mismatch",
  "winrate_mismatch",
] as const satisfies readonly ScoutImportWarningCode[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportWarningCode}. */
export type ScoutImportWarningCodesAreComplete = Assert<
  [ScoutImportWarningCode] extends [(typeof SCOUT_IMPORT_WARNING_CODES)[number]] ? true : false
>

/**
 * One import caveat. Shaped exactly like {@link ScoutWarning} (same `severity`
 * ladder, same `params` type) so the UI can render both with one component; it
 * anchors to a row rather than to a player, because at parse time no player id
 * is involved yet — the target player is chosen when the result is applied.
 *
 * `severity` convention — the authoritative table is `WARNING_SEVERITY` in
 * src/scout/statsImport.ts; this is what it means:
 *  - `info`    = "nothing is wrong, this is just what happened"
 *                (`empty_input`, `row_not_parsed`, `source_mismatch`)
 *  - `warning` = "check this before you apply it"
 *                (`columns_guessed`, `header_not_recognized`, `no_rows_detected`,
 *                 `unknown_champion`, `role_mismatch`, `duplicate_champion`,
 *                 `value_out_of_range`, `winrate_mismatch`)
 *  - `danger`  = "this row cannot be applied at all"
 *                (`missing_games`, `missing_winrate`)
 *
 * TWO PLACEMENTS THAT LOOK WRONG AND ARE NOT — do not "fix" them back:
 *  - `empty_input` is `info`, NOT `danger`. It fires while the paste box is
 *    still empty, i.e. before the user has done anything. A red alert on an
 *    untouched field trains people to ignore red alerts.
 *  - `columns_guessed` is `warning`, NOT `info`. No header was recognised, so
 *    which number is "games" and which is "winrate" was inferred from the shape
 *    of the values. That is precisely the case where the preview has to be read
 *    before applying — an `info` pill would undersell a real chance of a
 *    silently swapped column.
 */
export interface ScoutImportWarning {
  code: ScoutImportWarningCode
  severity: "info" | "warning" | "danger"
  params?: ScoutReasonParams
  /** Index into {@link ScoutStatsImportResult.rows}; absent for whole-paste warnings. */
  rowIndex?: number
  /** Champion the warning is about, when one is known. Raw name, not resolved. */
  championName?: string
}

/**
 * Why a pasted line produced no row. Same job as {@link UnparsedLineReason} on
 * the link-parser side: the importer must never swallow input silently.
 *
 * - `header`       recognised as the table header, intentionally not a row.
 * - `no_champion`  no champion-like token in the line.
 * - `no_numbers`   a champion was found but the line carried no numbers.
 * - `noise`        UI chrome copied along with the table (pagination, filter
 *                  labels, "show more", ad text).
 * - `matchup_row`  a `vs <Champion>` line out of a matchup sub-block: an
 *                  opponent matchup *inside* one champion's section, not a
 *                  champion-pool row of the scouted player.
 * - `recommended_champion`
 *                  a champion out of the recommendation area at the top of the
 *                  page ("Empfohlene Champions" / "Recommended champions").
 * - `aggregate_row`
 *                  the "Alle Champions" / "All champions" summary line.
 * - `page_noise`   a pure STRUCTURE OR SEPARATOR line of the page: `-`, `–`,
 *                  `—`, a run of hyphens, `_`, `•`, `·`, `|`, `/`, or any mix
 *                  of them. It carries NO DATA CONTENT and describes NO
 *                  DECISION — it is the dash a site prints where a column is
 *                  empty.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LAST THREE ARE OWN CATEGORIES AND NOT JUST `noise`.
 * `noise` says "something was thrown away and we cannot tell you what". For a
 * paste of a whole OP.GG champions page that would be most of the input, and the
 * preview could then only report a number. The honesty rule (A) at the top of
 * this file works line by line: a line never disappears without a word, and the
 * preview must be able to say *what* was skipped and how much of it — "18
 * matchup lines, 5 recommended champions, 1 total row" instead of "24 lines
 * ignored". A user who sees their champion counted as "recommended" learns
 * immediately that they copied the wrong part of the page; a user who only sees
 * "noise" learns nothing and blames the parser.
 *
 * Each of them is skipped for its own, different reason:
 *  - `matchup_row` is real data about the *opponent*, not about the scouted
 *    player's pool. Importing it would attribute enemy champions to them.
 *  - `recommended_champion` IS THE DANGEROUS ONE: those entries are OP.GG's own
 *    SUGGESTIONS, not games anybody played. They carry no honest sample at all,
 *    so importing them would fabricate scouting data out of a site's
 *    recommendation widget — precisely what rule (A) forbids.
 *  - `aggregate_row` is a sum over every champion, not a champion. Applied as a
 *    row it would create a phantom champion with the player's whole game count.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * WHY `page_noise` IS ITS OWN CATEGORY AND NOT `noise` — AND NOT ONE OF THE
 * THREE ABOVE EITHER.
 *
 * `noise` says: "this line looked like it might be data and turned out not to
 * be." That is a statement worth reading, and it is why `noise` still raises
 * `row_not_parsed`. `page_noise` says: "that was a dash." OP.GG prints a bare
 * `-` in every column it has no value for, so a single copied profile carries
 * DOZENS of them. Listed one by one they bury the two or three lines the user
 * actually has to look at, and they turn `row_not_parsed` into a warning that
 * fires on every ordinary paste — which is how a user learns to ignore it.
 * The UI therefore COUNTS `page_noise` instead of listing it.
 *
 * It is deliberately NOT folded into `aggregate_row` / `matchup_row` /
 * `recommended_champion`: each of those describes a DECISION the parser made
 * about real content ("these numbers are the opponent's", "this is the site's
 * suggestion, not a game anybody played"). A separator carries no content to
 * decide about, so grouping it with them would dilute exactly the three
 * statements the preview exists to make.
 *
 * IT BELONGS IN `DELIBERATE_NON_ROW_REASONS` (src/scout/statsImport.ts) and
 * therefore raises NO `row_not_parsed` — same reasoning as the table header
 * and the aggregate row: a line every well-formed paste of its kind contains
 * must not produce a permanent warning.
 *
 * CONSERVATIVE BY CONSTRUCTION: the character class behind it
 * (`isPageNoiseLine` in src/scout/statsImport.ts) contains no letter and no
 * digit, so `-5`, `A-` and `36S` can never match it. Wrongly hiding a line
 * that carried something is worse than showing one line too many, so anything
 * in doubt stays `noise`.
 *
 * A BARE `vs` BADGE IS NOT PAGE NOISE. It stays `matchup_row`, because "a
 * matchup sub-block starts here" is a real decision about the lines that
 * follow, not a decoration.
 * ---------------------------------------------------------------------------
 *
 * ADDITIVE ONLY — i18n key `scout_import_unparsed_<reason>`. New members go at
 * the end.
 */
export type ScoutImportUnparsedReason =
  | "header"
  | "no_champion"
  | "no_numbers"
  | "noise"
  | "matchup_row"
  | "recommended_champion"
  | "aggregate_row"
  | "page_noise"

/**
 * The runtime projection of {@link ScoutImportUnparsedReason}, in declaration
 * order.
 *
 * Same job as {@link SCOUT_IMPORT_LAYOUTS}, and here the duplication had
 * already multiplied: tests/scoutImportHelpers.test.ts kept TWO hand-written
 * mirrors of this union (`ALL_UNPARSED_REASONS` and `EVERY_UNPARSED_REASON`) —
 * two copies of one truth, each able to go stale in silence while a new
 * reason's `scout_import_unparsed_*` key stays unverified. One tuple, iterated,
 * replaces both.
 *
 * `satisfies` blocks a value that is not a member; the guard below blocks a
 * member that is not in the tuple.
 */
export const SCOUT_IMPORT_UNPARSED_REASONS = [
  "header",
  "no_champion",
  "no_numbers",
  "noise",
  "matchup_row",
  "recommended_champion",
  "aggregate_row",
  "page_noise",
] as const satisfies readonly ScoutImportUnparsedReason[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportUnparsedReason}. */
export type ScoutImportUnparsedReasonsAreComplete = Assert<
  [ScoutImportUnparsedReason] extends [(typeof SCOUT_IMPORT_UNPARSED_REASONS)[number]]
    ? true
    : false
>

/** A pasted line that produced no row, kept verbatim for user review. */
export interface ScoutImportUnparsedLine {
  /** The original line, trimmed. Never normalised beyond trimming. */
  raw: string
  reason: ScoutImportUnparsedReason
}

/**
 * One parsed champion row, *before* it becomes scout data.
 *
 * DECISION — WHY EVERY NUMBER HERE IS `| null` WHILE
 * `ManualChampionEntry.games` / `.winrate` ARE PLAIN NUMBERS:
 * These two types answer different questions. A `ScoutImportRow` describes what
 * a foreign text *contained*; a `ManualChampionEntry` describes a fact the user
 * has accepted into their scouting data. A column the paste did not contain has
 * no value, and the honest representation of that is `null` — never a `0`, and
 * never an average or a carried-over neighbour value. A `0` here would be
 * indistinguishable from a real "0 games" / "0 % winrate" and would flow
 * straight into a threat score.
 *
 * The bridge between the two is {@link ScoutImportApplyOptions}: a row whose
 * `games` or `winrate` is `null` is NOT APPLICABLE and must be filtered out
 * before an entry is built (it carries `missing_games` / `missing_winrate` at
 * `danger` severity and counts into {@link ScoutImportApplyResult.skippedRows}).
 * That is precisely why `ManualChampionEntry` can keep its two plain numbers:
 * a row that cannot supply them never becomes an entry in the first place.
 * Of the remaining fields, `csPerMin`, `killParticipation` and `damage` have
 * no home on `ManualChampionEntry` at all — they exist so the reviewer can see
 * that the right table was parsed, and are dropped on apply. `kda` is the one
 * exception: it is carried onto the optional {@link ManualChampionEntry.kda}
 * when it is a finite number `>= 0`, and dropped like the others otherwise. A
 * dropped `kda` never blocks the apply - only `games` and `winrate` can.
 */
export interface ScoutImportRow {
  /**
   * Deterministic row id: `"row-"` plus the 0-based index of the row in
   * {@link ScoutStatsImportResult.rows}.
   *
   * Deterministic for the same reason as {@link ScoutPlayerId}: React keys,
   * per-row selection state, warning anchors
   * ({@link ScoutImportWarning.rowIndex}) and the tests must all agree, and
   * re-parsing the same text twice must yield the same ids. Never
   * `Math.random()`, never `Date.now()`, never a counter that survives across
   * parses.
   */
  id: string
  /** The original line this row came from, trimmed. Shown next to the parse. */
  raw: string
  /**
   * Champion name as it appeared, or the catalog spelling once it resolved.
   * Never blank — a line without a champion is an unparsed line, not a row.
   */
  championName: string
  /**
   * `true` when `championName` matched src/analysis/championCatalog.ts.
   * `false` keeps the row visible and applicable-with-a-warning rather than
   * dropping it: catalogs lag behind new releases, and losing a row the user
   * can plainly see in their paste would be the same silent data loss
   * {@link ScoutRemovedPlayer} exists to prevent. It never triggers a fuzzy
   * auto-correction.
   */
  championResolved: boolean
  /**
   * Games behind the winrate, or `null` when the paste had no games column.
   *
   * THE LEADING FIELD, AND IT STAYS THAT WAY. For the
   * `opgg_raw_champion_page` layout it is `wins + losses`; for every other
   * layout it comes from the games column exactly as before. A consumer that
   * only reads `games` keeps working unchanged — which is the whole reason
   * `wins`/`losses` below were added *next to* it instead of replacing it.
   */
  games: number | null
  /**
   * Wins behind the winrate, or `null` when the paste did not state them.
   *
   * `null`, NEVER `0`. `0` means "zero wins", `null` means "the text did not
   * say" — the same distinction every other nullable field on this type makes.
   * Only the `opgg_raw_champion_page` layout prints separate win/loss counts;
   * every other layout leaves both `wins` and `losses` at `null` and keeps
   * getting its `games` from the games column.
   *
   * NOT PERSISTED: {@link ManualChampionEntry} deliberately does not gain these
   * two fields. Persistence keeps storing `games` + `winrate`, so an applied
   * import still produces byte-for-byte the same entry shape an older build
   * understands — {@link SCOUT_SCHEMA_VERSION} stays at 2 and there is no
   * migration. The win/loss split is preview information; if it should survive
   * the apply, it belongs in the language-neutral
   * {@link ManualChampionEntry.note} (e.g. `"36W/36L"`), never in a new field.
   */
  wins: number | null
  /**
   * Losses behind the winrate, or `null` when the paste did not state them.
   * Same rules as {@link ScoutImportRow.wins} in every respect — in particular
   * `null` rather than `0`, and not persisted.
   */
  losses: number | null
  /**
   * Winrate in **percent, 0–100** — the same unit as {@link WinratePercent} and
   * {@link ManualChampionEntry.winrate}, because percent is what every source
   * prints and what the user is looking at while pasting. `null` when absent.
   *
   * NEVER a domain fraction 0–1 (`ChampionStats.winRate` and friends in
   * src/domain/types.ts use that unit). A `"0.61"` read out of a paste is a
   * misparse to report via `value_out_of_range`, not a fraction to multiply by
   * 100 — guessing the unit is how 61 % silently becomes 0.61 %.
   *
   * TAKEN FROM THE PASTE UNCHANGED, even when `wins`/`losses` imply a different
   * number. The disagreement is reported as `winrate_mismatch` (see
   * {@link ScoutImportWarningCode}) and left for the user to judge; it is never
   * recomputed away.
   */
  winrate: WinratePercent | null
  /**
   * KDA ratio as printed (e.g. `3.4`), or `null` when the paste stated none.
   *
   * No longer preview-only: `importRowToManualEntry()` carries a finite value
   * `>= 0` onto {@link ManualChampionEntry.kda}. `null` stays `null` and is
   * never turned into a `0`, because `0` is a real (bad) KDA.
   */
  kda: number | null
  /** Creep score per minute, or `null`. An absolute CS column is not converted. */
  csPerMin: number | null
  /** Kill participation in **percent, 0–100**, or `null`. Same unit rule as `winrate`. */
  killParticipation: number | null
  /** Damage figure as printed (absolute or per minute, unconverted), or `null`. */
  damage: number | null
  /**
   * The role this row *claims*, read out of the pasted text (a role column, a
   * position icon's alt text, a heading). `"unknown"` — hence {@link ScoutRole},
   * not {@link ScoutImportRole} — whenever the text says nothing, which is the
   * common case.
   *
   * INVARIANT: this NEVER overrides the role the user selected. It exists to
   * contradict the user out loud, not behind their back: when it is neither
   * `"unknown"` nor equal to {@link ScoutStatsImportOptions.role}, the row gets
   * `roleMismatch: true` plus a `role_mismatch` warning, and the user decides.
   * The applied {@link ManualChampionEntry.role} is *always*
   * {@link ScoutImportApplyOptions.role}.
   */
  detectedRole: ScoutRole
  /**
   * `true` exactly when `detectedRole` is not `"unknown"` and differs from the
   * selected import role. Precomputed so the UI does not re-derive the
   * comparison per render and reach a different answer.
   */
  roleMismatch: boolean
  /**
   * How much trust this single row deserves: `high` for a fully mapped row from
   * a recognised header, down to `none` for a row where nothing but a champion
   * name survived. `none` means "we have no basis", not "a bit weak" — the same
   * reading as everywhere else in this file (see {@link ScoutConfidence}).
   */
  confidence: ScoutConfidence
  /** Row-scoped warnings; the same objects also appear in the result's list. */
  warnings: ScoutImportWarning[]
}

/**
 * Everything one paste produced. Returned by the parser, rendered as the
 * preview, and never persisted.
 *
 * Honest by construction: `rows` and `unparsedLines` together account for every
 * non-empty line of the input, so "we understood 12 of 17 lines" is a statement
 * the UI can make truthfully instead of showing 12 rows and implying that was
 * all there was.
 */
export interface ScoutStatsImportResult {
  /** Parsed rows in input order. Ids follow that order (`row-0`, `row-1`, …). */
  rows: ScoutImportRow[]
  /** Every non-empty input line that produced no row. Never silently dropped. */
  unparsedLines: ScoutImportUnparsedLine[]
  layout: ScoutImportLayout
  /**
   * Columns the importer believes it identified, in {@link SCOUT_IMPORT_COLUMNS}
   * order and deduped. Empty for the `unrecognized` layout, for `loose_lines`
   * and for `opgg_raw_champion_page` — in all three no column structure exists
   * to report (see {@link ScoutImportLayout}).
   */
  columns: ScoutImportColumn[]
  /** What the text looks like it came from; `"unknown"` when not conclusive. */
  detectedSource: ScoutImportSourceKind
  /**
   * Whole-paste warnings plus every row warning (row-scoped ones keep their
   * `rowIndex`). One flat list so the UI can render a single summary without
   * walking all rows; the duplication with {@link ScoutImportRow.warnings} is
   * intentional and cheap.
   */
  warnings: ScoutImportWarning[]
  /** Aggregate confidence over the whole paste, not the maximum over rows. */
  confidence: ScoutConfidence
}

/**
 * Inputs to the parse step.
 *
 * `role` is required and deliberately not defaulted: the importer must not be
 * callable without the user having answered "which role is this table?".
 */
export interface ScoutStatsImportOptions {
  /** The role the user selected before pasting — see {@link ScoutImportRole}. */
  role: ScoutImportRole
  /**
   * The source the user says this is. Optional: when omitted the importer only
   * reports its own `detectedSource`. When supplied and different from what was
   * detected, the *user's* choice wins for the applied entries and the
   * disagreement is reported as `source_mismatch` — the parser never overrides
   * an explicit human statement about provenance.
   */
  source?: ScoutImportSourceKind
}

/**
 * What applying an import does to the rows a player already has.
 *
 * - `append`  THE DEFAULT. New rows are added; existing rows stay untouched.
 *             Nothing the user typed before can be lost by importing.
 * - `replace` Replaces the player's existing rows **of the imported role
 *             only** — the rows whose {@link ManualChampionEntry.role} equals
 *             {@link ScoutImportApplyOptions.role}. Rows of every other role,
 *             and rows with `role: "unknown"`, are kept.
 *
 * CONTRACT FOR THE IMPLEMENTER — `replace` is role-scoped, never global.
 * Importing a fresh support table must not delete the mid data the user
 * collected for the same player; that would be exactly the silent loss
 * {@link ScoutRemovedPlayer} was introduced to stop. `"unknown"`-role rows are
 * kept too: they were never claimed to belong to the imported role, so
 * replacing that role says nothing about them.
 */
export type ScoutImportApplyMode = "append" | "replace"

/**
 * The runtime projection of {@link ScoutImportApplyMode}, in the order the
 * import panel offers them — `append` first, because it is the mode that cannot
 * lose anything the user typed.
 *
 * Same job as {@link SCOUT_IMPORT_LAYOUTS}. The tests spelled this union out
 * inline as `["append", "replace"] as const`, which is a copy like any other: a
 * third mode would leave that literal — and every per-mode case it verifies —
 * quietly behind.
 *
 * `satisfies` blocks a value that is not a member; the guard below blocks a
 * member that is not in the tuple.
 */
export const SCOUT_IMPORT_APPLY_MODES = [
  "append",
  "replace",
] as const satisfies readonly ScoutImportApplyMode[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportApplyMode}. */
export type ScoutImportApplyModesAreComplete = Assert<
  [ScoutImportApplyMode] extends [(typeof SCOUT_IMPORT_APPLY_MODES)[number]] ? true : false
>

/**
 * The user's decisions at the moment they press "apply". Everything here is
 * required — applying is the step where guessing is least acceptable.
 */
export interface ScoutImportApplyOptions {
  /**
   * The role every produced entry gets. Authoritative: it overrides
   * {@link ScoutImportRow.detectedRole} in all cases, including rows with
   * `roleMismatch: true` that the user chose to apply anyway.
   */
  role: ScoutImportRole
  /**
   * Provenance written to {@link ManualChampionEntry.source}. A
   * {@link ScoutManualSource}, not a {@link ScoutImportSourceKind}: `"unknown"`
   * is a legitimate *parser* answer but not a legitimate stored provenance —
   * the honest stored value for "pasted from somewhere unidentified" is
   * `"other"`, which already exists.
   */
  source: ScoutManualSource
  /** How current the pasted numbers are. The user states it; never read off a clock. */
  recency: ScoutRecency
  /** See {@link ScoutImportApplyMode}. `append` is the default the UI preselects. */
  mode: ScoutImportApplyMode
}

/**
 * The outcome of applying an import — a report, not a mutation log.
 *
 * `entries` is the player's **complete resulting** `ManualChampionEntry[]`
 * (existing rows merged with the applied ones according to
 * {@link ScoutImportApplyMode}), so the caller assigns it to
 * `ScoutPlayerData.entries` without re-implementing the merge.
 *
 * The counters exist so the UI can say what actually happened instead of
 * "import successful": `importedRows + skippedRows` accounts for every row that
 * was offered. `skippedRows` is the honest half — it counts rows that could not
 * become entries (missing `games` / `winrate`, see {@link ScoutImportRow}) or
 * that the user deselected.
 *
 * ---------------------------------------------------------------------------
 * WHY `added` / `replaced` / `skipped` ARE GONE — THE "72 ROWS" BUG.
 * `replaced` meant TWO DIFFERENT THINGS depending on the
 * {@link ScoutImportApplyMode}: in `append` mode "an existing entry was
 * overwritten in place", in `replace` mode "an existing entry was DELETED". The
 * success message summed the two import-ish counters (`added + replaced`) and
 * so announced **"72 rows applied"** for a player with 36 existing rows and 36
 * selected ones — while exactly 36 rows were stored. That was not a rounding
 * slip: it counted a deletion as an import, because the field's meaning
 * silently changed with the mode.
 *
 * The fix is naming, not arithmetic. Every counter below answers exactly one
 * question, and the single number the UI prints
 * ({@link ScoutImportApplyResult.importedRows}) is mode-independent by
 * construction, so no caller can ever reassemble the old sum.
 *
 * THE OLD NAMES ARE REMOVED OUTRIGHT — no alias, no deprecated property, no
 * back-compatibility shim. A hard cut is correct *here specifically* because
 * this structure is purely internal: `applyImportRows()` in
 * src/scout/statsImport.ts is its only producer and the import panel in
 * src/components/scout/ its only consumer. It is NOT persisted state (nothing
 * of it reaches `ScoutStateV2.playerData`; only the `entries` array does, and
 * that shape is unchanged) and it is NOT an API response, so there is no stored
 * data and no third-party client that could still carry the old shape.
 * {@link SCOUT_SCHEMA_VERSION} therefore STAYS AT 2 — a bump without a matching
 * `ScoutStateV*` and migration branch is what makes users lose scout data. A
 * soft alias would preserve nothing but the ambiguity that caused the bug.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * INVARIANTS — they hold in BOTH modes, and the tests pin them:
 *
 *     importedRows === rows.length - skippedRows
 *     importedRows === addedRows + overwrittenRows
 *
 * The first says every offered row is accounted for exactly once; the second
 * says an imported row either created an entry or replaced one in place —
 * there is no third outcome.
 *
 * `removedExistingRows` stands OUTSIDE both equations on purpose: it counts the
 * user's own pre-existing rows that this apply deleted, which is not an import
 * at all. Folding it into a "rows applied" figure is precisely the mistake
 * described above, and giving it its own name is what makes that mistake hard
 * to repeat.
 *
 * Per mode, one counter each is structurally zero:
 *  - `append`  → `removedExistingRows` is always 0; nothing is deleted.
 *  - `replace` → `overwrittenRows` is always 0; the role is cleared *first*, so
 *                nothing is left to overwrite in place and every imported row
 *                counts as added.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * THE DUPLICATE-CHAMPION ASYMMETRY IS EXISTING BEHAVIOUR AND IS NOT CHANGED
 * HERE. When one paste contains the same champion twice — the row already
 * carries a `duplicate_champion` warning — the modes end differently:
 *  - `append`  the second row overwrites the first → `overwrittenRows` rises,
 *              ONE entry exists afterwards.
 *  - `replace` both rows are appended to the freshly cleared role →
 *              `addedRows` rises twice, TWO entries exist afterwards.
 * This rename neither introduced that asymmetry nor removes it. In both cases
 * `importedRows === addedRows + overwrittenRows` still holds, so the number the
 * UI prints stays truthful either way — which is the point of counting
 * outcomes rather than counting merge steps.
 * ---------------------------------------------------------------------------
 *
 * `importedRows` REPLACES THE HELPER `appliedRowCount()` (formerly in
 * src/components/scout/scoutImportHelpers.ts), which computed
 * `selected.length - result.skipped` at the call site and is deleted with this
 * change. The number belongs on the result itself: the helper was only correct
 * if the caller passed the *exact same array* it had handed to
 * `applyImportRows()`. Nothing in the type system enforced that, so a caller
 * that filtered, re-sorted or re-derived its selection in between got a
 * plausible-looking wrong number back — the same class of trap as the one
 * above. A field on the result cannot be called with the wrong array.
 */
export interface ScoutImportApplyResult {
  /** The player's full entry list after the merge, ready to store. */
  entries: ManualChampionEntry[]
  /**
   * How many of the passed-in `rows` were APPLIED — mode-independent, and THE
   * number the success message shows.
   * Invariants: `rows.length - skippedRows` and `addedRows + overwrittenRows`.
   *
   * "Applied", not "resulting entries": the two differ in exactly one case, the
   * duplicate champion documented on {@link applyImportRows}. Two `append` rows
   * for one champion are both applied (`importedRows` 2, as `addedRows` 1 +
   * `overwrittenRows` 1) while ONE entry exists afterwards, because the second
   * row overwrote the first. That is the honest reading — the user ticked two
   * rows and both were taken over — and it is what the removed
   * `appliedRowCount()` reported too, so the printed number is unchanged.
   * `entries.length` is the count of resulting entries and is a different
   * question.
   */
  importedRows: number
  /** Imported rows that became NEW entries. */
  addedRows: number
  /**
   * Imported rows that overwrote an existing entry of the same champion AND the
   * same role IN PLACE. Only reachable in `append` mode; in `replace` mode it is
   * 0 by construction, because that mode clears the role beforehand.
   */
  overwrittenRows: number
  /**
   * The user's pre-existing rows that this apply DELETED — in `replace` mode
   * the rows of the imported role, in `append` mode always 0. NOT an import: it
   * carries its own name precisely so it can never be summed into a "rows
   * applied" figure again.
   */
  removedExistingRows: number
  /**
   * Offered rows that were not applied — either not applicable (missing
   * `games` / `winrate`, see {@link ScoutImportRow}) or deselected by the user.
   * Never reported as zero just because it looks nicer.
   */
  skippedRows: number
}

/**
 * How champion data can reach the scout. Reported by the import panel so the UI
 * can state, per mode, what is possible *today* rather than offering a button
 * that quietly does nothing.
 *
 * - `manual_paste`  implemented: this section — the user copies a champion
 *                   table out of a second browser tab and pastes it here.
 * - `source_links`  implemented: the generated profile links the user opens in
 *                   a second tab (see {@link ScoutSourceRef}). Not a fetch.
 *
 * THERE IS NO THIRD MODE, AND THAT IS A DECISION, NOT AN OMISSION: a
 * `"riot_api"` member existed while the optional Riot auto-import did, and was
 * removed with it on 2026-08-19 (closing note at the end of this section).
 * Why the four scouting sites cannot simply be fetched instead is stated, per
 * provider, by {@link ScoutAutoFetchStatus} — that type is the reason this
 * feature is a copy/paste flow at all.
 */
export type ScoutImportMode = "manual_paste" | "source_links"

/** Canonical mode order for the import panel. Same reasoning as {@link SCOUT_IMPORT_COLUMNS}. */
export const SCOUT_IMPORT_MODES = [
  "manual_paste",
  "source_links",
] as const satisfies readonly ScoutImportMode[]

/** Compile-time guard: the tuple above lists *every* {@link ScoutImportMode}. */
export type ScoutImportModesAreComplete = Assert<
  [ScoutImportMode] extends [(typeof SCOUT_IMPORT_MODES)[number]] ? true : false
>

/**
 * Per-provider "can this be fetched automatically?" line, rendered inside the
 * import panel next to each source link.
 *
 * WHY THIS EXISTS NEXT TO {@link ScoutDirectFetchInfo} — IT IS A VIEW, NOT A
 * SECOND TRUTH: `ScoutDirectFetchInfo` is the adapter layer's statement and
 * lives in `SCOUT_DIRECT_FETCH_INFO` (src/scout/sources.ts), which stays the
 * only place those facts are recorded. This type is what the import panel
 * renders, and every instance of it is **derived from that map** — `supported`
 * is `supportedInBrowser`, `status` / `reason` / `publicApi` are carried
 * through unchanged. It is named for the question the UI asks ("is auto-fetch
 * available for this source?") and deliberately adds nothing and drops nothing,
 * so a future provider change stays a one-line edit in
 * `SCOUT_DIRECT_FETCH_INFO` that reaches the UI automatically. Never hard-code
 * a value here: two independently maintained answers to "is OP.GG fetchable?"
 * is precisely the drift this feature's honesty rule cannot afford.
 */
export interface ScoutAutoFetchStatus {
  kind: ScoutSourceKind
  /** Mirrors `ScoutDirectFetchInfo.supportedInBrowser` — `false` for all four today. */
  supported: boolean
  status: ScoutSourceStatus
  reason: ScoutFetchBlockedCode
  publicApi: ScoutPublicApiState
}

/* --------------------------------------------------------------------------
 * CLOSING NOTE OF SECTION 9 — THE REMOVED RIOT AUTO-IMPORT (2026-08-19)
 *
 * There was, for a short while, an optional Riot auto-import: a section 10 in
 * this file plus an adapter that talked to a backend proxy, which held the Riot
 * API key server-side and returned aggregated champion rows. It was REMOVED ON
 * PURPOSE on 2026-08-19. It did not rot away and it was not lost in a merge —
 * it was taken out deliberately, at the product owner's request. Nothing here
 * is "missing".
 *
 * WHY: the app must not depend on a Riot API key, on an edge function, on a
 * user login or on any proxy configuration. Everything this tool does has to
 * keep working from a static bundle on a public domain, for a user who
 * configured nothing. An optional feature that is unavailable in every default
 * deployment carries real cost — types, i18n keys, UI states, tests — for a
 * path almost nobody can take.
 *
 * WHAT SURVIVES, AND WHY NONE OF IT IS A LEFTOVER:
 *  - The whole manual copy/paste import above. It was never part of the Riot
 *    path; the fetch merely fed the *same* preview.
 *  - {@link ScoutAutoFetchStatus}. NOT a remnant: it carries the honest,
 *    per-provider statement that OP.GG, League of Graphs, DeepLoL and DPM
 *    cannot be read from a browser (no public API, no CORS, bot protection).
 *    That statement is exactly what justifies a copy/paste flow existing at
 *    all, and it is derived from `SCOUT_DIRECT_FETCH_INFO` in
 *    src/scout/sources.ts, which has nothing to do with Riot.
 *  - {@link ScoutManualSource} keeps six members; the seventh, `"riot"`, is
 *    gone. A row a local build already stored with it degrades to `"other"` on
 *    load without losing a single number — see the note on that type.
 *
 * IF IT IS EVER WANTED AGAIN: build it NEW and ADDITIVELY — its own proxy, its
 * own types, its own review of what a key, a login and a shared rate budget
 * imply. Do not resurrect fragments of the removed version, and do not assume
 * any of the vocabulary above was shaped for a fetch; it was not.
 * -------------------------------------------------------------------------- */
