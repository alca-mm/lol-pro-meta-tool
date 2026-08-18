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

/** Where a manually entered champion row came from. */
export type ScoutManualSource = ScoutSourceKind | "manual" | "other"

/**
 * One champion row a user typed in for one player.
 *
 * `games` and `winrate` are plain numbers on purpose (no `null`): a row only
 * exists because a human entered it. A row the user cannot fill in should not
 * be created — absence of data is expressed by the *absence* of entries plus a
 * `no_data` reason, never by a fake `0`.
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
