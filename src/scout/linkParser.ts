/**
 * Turns whatever the user pasted into the Tournament Scout textarea into a list
 * of players.
 *
 * Accepted input, mixed freely, one item per line (several per line also work):
 *   - OP.GG multi-search links            .../multisearch/<region>?summoners=A%23TAG,B%23TAG
 *   - OP.GG profile links (new + legacy)  .../summoners/<region>/<Name>-<TAG>,
 *                                         <region>.op.gg/summoner/userName=<Name>
 *   - League of Graphs profile links      .../summoner/<region>/<Name>-<TAG>
 *   - DeepLoL profile links               .../summoner/<region>/<Name>-<TAG>
 *   - DPM.LOL profile links               dpm.lol/<Name>-<TAG>
 *   - free text                           `EUW player#tag top`,
 *                                         `euw / playername#tag / jungle`,
 *                                         `playername#tag`
 *
 * Design rules:
 *
 *  1. NOTHING IS SWALLOWED. Every non-empty line that yields no player ends up
 *     in `unparsedLines` with a machine-readable `reason` the UI can translate.
 *     Blank lines are the only thing dropped silently — they carry no content.
 *
 *  2. NOTHING IS INVENTED. A missing region stays `SCOUT_REGION_UNKNOWN`, a
 *     missing tagline stays `""`. No default region, no guessed tag. The
 *     downstream link builder turns those gaps into `manual_required` refs.
 *
 *  3. DETERMINISTIC IDENTITY. `buildScoutPlayerId()` derives the id from
 *     region + name + tagline only — no randomness, no clock — so dedupe,
 *     persistence and tests all agree.
 *
 *  4. TOLERANT, BUT HONEST ABOUT IT. Where a provider's URL shape is not fully
 *     documented, the parser falls back to a host-plus-best-effort-path
 *     strategy. Every such spot is commented.
 *
 * No network access, no DOM access, no `Date`: this module is pure.
 */

import type {
  ScoutParseResult,
  ScoutPlayer,
  ScoutPlayerId,
  ScoutPlayerIdentity,
  ScoutRegion,
  ScoutRole,
  ScoutSourceKind,
  ScoutSourceRef,
  UnparsedLine,
  UnparsedLineReason,
} from "./types"
import {
  SCOUT_REGION_UNKNOWN,
  SCOUT_SOURCE_KINDS,
  buildSourceLinks,
  detectSourceKind,
  normalizeScoutRegion,
  toScoutUrl,
} from "./sources"

/* ==========================================================================
 * 1. Small normalisation helpers
 * ========================================================================== */

/**
 * Role spellings we accept in free text (DE + EN + common shorthand).
 * Compared after stripping everything that is not a letter or digit, so
 * `(Jungle)`, `JUNGLE,` and `ad-carry` all resolve.
 */
const ROLE_ALIASES: Readonly<Record<string, ScoutRole>> = {
  top: "top",
  toplane: "top",
  toplaner: "top",
  toplaneer: "top",
  jungle: "jungle",
  jungler: "jungle",
  jung: "jungle",
  jgl: "jungle",
  jg: "jungle",
  dschungel: "jungle",
  mid: "mid",
  middle: "mid",
  midlane: "mid",
  midlaner: "mid",
  mitte: "mid",
  bot: "bot",
  bottom: "bot",
  botlane: "bot",
  adc: "bot",
  ad: "bot",
  adcarry: "bot",
  carry: "bot",
  marksman: "bot",
  sup: "support",
  supp: "support",
  support: "support",
  supporter: "support",
  util: "support",
  utility: "support",
  unterstuetzung: "support",
}

/** Keep only letters/digits — used before role and region lookups. */
function stripDecorations(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase()
}

/**
 * Map a free-text token to a role. Returns `"unknown"` for anything not in
 * {@link ROLE_ALIASES} — never throws, never guesses.
 */
export function normalizeScoutRole(raw: string | null | undefined): ScoutRole {
  if (typeof raw !== "string") return "unknown"
  const key = stripDecorations(raw)
  if (!key) return "unknown"
  return ROLE_ALIASES[key] ?? "unknown"
}

/** Lower-cased, whitespace-collapsed name — identity only, never displayed. */
function normalizeIdentityName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Stable, deterministic local id for a player: `"<region>:<name>#<tag>"`, all
 * lower-cased (e.g. `"euw:agurin#euw"`).
 *
 * Contract for every other part of the feature:
 *  - same region + name + tagline ⇒ same id, in every session and every test
 *  - case and surrounding whitespace are irrelevant
 *  - an unknown region yields `"unknown:…"`, which is a *different* player than
 *    the same name on a known region until the region is filled in (the parser
 *    merges those two cases itself, see `mergeCandidate`)
 */
export function buildScoutPlayerId(identity: ScoutPlayerIdentity): ScoutPlayerId {
  const region = normalizeScoutRegion(identity.region)
  const name = normalizeIdentityName(identity.riotName ?? "")
  const tag = (identity.tagline ?? "").trim().toLowerCase()
  return `${region.toLowerCase()}:${name}#${tag}`
}

/** Name + tag key used to spot the same player entered with/without a region. */
function nameTagKey(identity: ScoutPlayerIdentity): string {
  return `${normalizeIdentityName(identity.riotName ?? "")}#${(identity.tagline ?? "").trim().toLowerCase()}`
}

/** `"Name#TAG"`, or just `"Name"` when the tagline is unknown. */
function buildDisplayName(riotName: string, tagline: string): string {
  return tagline ? `${riotName}#${tagline}` : riotName
}

/* ==========================================================================
 * 2. URL value decoding
 * ========================================================================== */

/**
 * Decode a raw URL *path* value: `+` becomes a space (some tools encode Riot
 * names that way) and percent escapes are resolved, with a graceful fallback
 * for malformed escapes so a bad paste degrades instead of throwing.
 *
 * Query-string values must NOT go through here — `URLSearchParams.get()`
 * already decoded them, and decoding twice would corrupt a literal `%`.
 */
function decodeUrlValue(value: string): string {
  const withSpaces = value.replace(/\+/g, " ")
  try {
    return decodeURIComponent(withSpaces)
  } catch {
    return withSpaces
  }
}

/**
 * Split an already-decoded `Name#TAG` / `Name-TAG` / `Name` into its parts.
 *
 * `#` wins when present. Otherwise the **last** `-` is treated as the tag
 * separator — that is how all four providers encode a Riot ID in a path — but
 * only when the suffix looks like a tagline (2–6 letters/digits). Names
 * containing hyphens therefore survive (`Big-Boss-EUW` → `Big-Boss` + `EUW`),
 * while a plain name without a tag stays intact.
 *
 * Returns `null` only when nothing usable is left.
 */
function splitNameTag(decoded: string): { riotName: string; tagline: string } | null {
  const value = decoded.trim()
  if (!value) return null

  const hashIndex = value.indexOf("#")
  if (hashIndex >= 0) {
    const riotName = value.slice(0, hashIndex).trim()
    const tagline = value
      .slice(hashIndex + 1)
      .trim()
      .replace(/[^A-Za-z0-9]/g, "")
    if (!riotName) return null
    return { riotName, tagline }
  }

  const dashIndex = value.lastIndexOf("-")
  if (dashIndex > 0) {
    const tagline = value.slice(dashIndex + 1).trim()
    const riotName = value.slice(0, dashIndex).trim()
    if (riotName && /^[A-Za-z0-9]{2,6}$/.test(tagline)) {
      return { riotName, tagline }
    }
  }

  return { riotName: value, tagline: "" }
}

/* ==========================================================================
 * 3. Candidates
 * ========================================================================== */

/** One identity found somewhere in the input, before dedupe. */
interface ScoutCandidate extends ScoutPlayerIdentity {
  role: ScoutRole
  /** The link it was read from, if any. */
  origin: ScoutSourceRef | null
}

/** Region/role hints picked up from the words around a Riot ID or a URL. */
interface LineHints {
  region: ScoutRegion
  role: ScoutRole
}

function emptyHints(): LineHints {
  return { region: SCOUT_REGION_UNKNOWN, role: "unknown" }
}

function collectHints(words: readonly string[]): LineHints {
  const hints = emptyHints()
  for (const word of words) {
    const key = stripDecorations(word)
    if (!key) continue
    if (hints.region === SCOUT_REGION_UNKNOWN) {
      const region = normalizeScoutRegion(key)
      if (region !== SCOUT_REGION_UNKNOWN) {
        hints.region = region
        continue
      }
    }
    if (hints.role === "unknown") {
      const role = normalizeScoutRole(key)
      if (role !== "unknown") hints.role = role
    }
  }
  return hints
}

function makeOriginRef(kind: ScoutSourceKind, url: URL): ScoutSourceRef {
  return {
    kind,
    url: url.toString(),
    status: "parsed_from_url",
    noteCode: "identity_from_url",
  }
}

/* ==========================================================================
 * 4. URL parsing
 * ========================================================================== */

/** Either identities, or the machine-readable reason why there were none. */
type UrlParseOutcome = { candidates: ScoutCandidate[] } | { reason: UnparsedLineReason }

/** Path segments of a URL, without the empty ones. */
function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment.length > 0)
}

/** Legacy OP.GG puts parameters into the path: `/summoner/userName=Agurin`. */
function extractInlinePathParam(segments: readonly string[], key: string): string | null {
  const prefix = `${key.toLowerCase()}=`
  for (const segment of segments) {
    if (segment.toLowerCase().startsWith(prefix)) {
      return decodeUrlValue(segment.slice(prefix.length))
    }
  }
  return null
}

/**
 * Read `<region>/<Name>-<TAG>` out of the tail of a path.
 *
 * Tolerant on purpose: the first segment that normalises to a known region wins
 * and the next segment is taken as the Riot ID. That makes sub-sections work
 * without hard-coding them (League of Graphs' `/summoner/champions/euw/…`,
 * OP.GG's `/summoners/euw/Name-TAG/champions`). If no known region is found,
 * a two-segment tail is still read as `<region?>/<Name-TAG>` and a single
 * segment as a bare Riot ID with an unknown region.
 */
function readRegionAndNameTag(
  segments: readonly string[],
): { region: ScoutRegion; riotName: string; tagline: string } | null {
  for (let i = 0; i < segments.length - 1; i += 1) {
    const region = normalizeScoutRegion(decodeUrlValue(segments[i]))
    if (region === SCOUT_REGION_UNKNOWN) continue
    const nameTag = splitNameTag(decodeUrlValue(segments[i + 1]))
    if (nameTag) return { region, ...nameTag }
  }

  if (segments.length >= 2) {
    const nameTag = splitNameTag(decodeUrlValue(segments[1]))
    if (nameTag) {
      return { region: normalizeScoutRegion(decodeUrlValue(segments[0])), ...nameTag }
    }
  }

  if (segments.length === 1) {
    const nameTag = splitNameTag(decodeUrlValue(segments[0]))
    if (nameTag) return { region: SCOUT_REGION_UNKNOWN, ...nameTag }
  }

  return null
}

/**
 * OP.GG. Four shapes are recognised:
 *   1. `/multisearch/<region>?summoners=A%23TAG,B%23TAG`  (current multi link)
 *   2. `/lol/summoners/<region>/<Name>-<TAG>` and `/summoners/<region>/…`
 *   3. `/summoner/userName=<Name>` on a `<region>.op.gg` host  (legacy single)
 *   4. `/multi/query=<Name>,<Name>`                            (legacy multi)
 *
 * Shape 4 returns 404 on op.gg today; it is still parsed so an old bookmark
 * produces players instead of an error, but it is never generated.
 */
function parseOpggUrl(url: URL): UrlParseOutcome {
  const segments = pathSegments(url)
  const lower = segments.map((segment) => segment.toLowerCase())
  const subdomainRegion = normalizeScoutRegion(url.hostname.split(".")[0])

  const multiSearchIndex = lower.indexOf("multisearch")
  if (multiSearchIndex >= 0) {
    const region = normalizeScoutRegion(decodeUrlValue(segments[multiSearchIndex + 1] ?? ""))
    // Already decoded by URLSearchParams (`%23` → `#`, `+` → space).
    const raw = url.searchParams.get("summoners") ?? ""
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    if (parts.length === 0) return { reason: "empty_multilink" }

    const candidates: ScoutCandidate[] = []
    for (const part of parts) {
      const nameTag = splitNameTag(part)
      if (!nameTag) continue
      candidates.push({
        ...nameTag,
        region: region !== SCOUT_REGION_UNKNOWN ? region : subdomainRegion,
        role: "unknown",
        origin: makeOriginRef("opgg", url),
      })
    }
    if (candidates.length === 0) return { reason: "empty_multilink" }
    return { candidates }
  }

  const summonersIndex = lower.indexOf("summoners")
  if (summonersIndex >= 0) {
    const parsed = readRegionAndNameTag(segments.slice(summonersIndex + 1))
    if (!parsed) return { reason: "unsupported_url_shape" }
    return {
      candidates: [
        {
          riotName: parsed.riotName,
          tagline: parsed.tagline,
          region: parsed.region !== SCOUT_REGION_UNKNOWN ? parsed.region : subdomainRegion,
          role: "unknown",
          origin: makeOriginRef("opgg", url),
        },
      ],
    }
  }

  const summonerIndex = lower.indexOf("summoner")
  if (summonerIndex >= 0) {
    const tail = segments.slice(summonerIndex + 1)
    const userName =
      url.searchParams.get("userName") ??
      url.searchParams.get("username") ??
      extractInlinePathParam(tail, "username")
    if (userName) {
      const nameTag = splitNameTag(userName)
      if (!nameTag) return { reason: "unsupported_url_shape" }
      return {
        candidates: [
          { ...nameTag, region: subdomainRegion, role: "unknown", origin: makeOriginRef("opgg", url) },
        ],
      }
    }
    const parsed = readRegionAndNameTag(tail)
    if (parsed) {
      return {
        candidates: [
          {
            riotName: parsed.riotName,
            tagline: parsed.tagline,
            region: parsed.region !== SCOUT_REGION_UNKNOWN ? parsed.region : subdomainRegion,
            role: "unknown",
            origin: makeOriginRef("opgg", url),
          },
        ],
      }
    }
    return { reason: "unsupported_url_shape" }
  }

  const multiIndex = lower.indexOf("multi")
  if (multiIndex >= 0) {
    const query =
      url.searchParams.get("query") ?? extractInlinePathParam(segments.slice(multiIndex + 1), "query")
    const parts = (query ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    if (parts.length === 0) return { reason: "empty_multilink" }

    const candidates: ScoutCandidate[] = []
    for (const part of parts) {
      const nameTag = splitNameTag(part)
      if (!nameTag) continue
      candidates.push({
        ...nameTag,
        region: subdomainRegion,
        role: "unknown",
        origin: makeOriginRef("opgg", url),
      })
    }
    if (candidates.length === 0) return { reason: "empty_multilink" }
    return { candidates }
  }

  return { reason: "unsupported_url_shape" }
}

/**
 * League of Graphs and DeepLoL share the `/summoner/<region>/<Name>-<TAG>`
 * shape (League of Graphs additionally inserts optional sub-sections such as
 * `champions`, which `readRegionAndNameTag` skips over).
 */
function parseSummonerPathUrl(url: URL, kind: ScoutSourceKind): UrlParseOutcome {
  const segments = pathSegments(url)
  const index = segments.findIndex((segment) => segment.toLowerCase() === "summoner")
  if (index < 0) return { reason: "unsupported_url_shape" }

  const parsed = readRegionAndNameTag(segments.slice(index + 1))
  if (!parsed) return { reason: "unsupported_url_shape" }

  return {
    candidates: [
      {
        riotName: parsed.riotName,
        tagline: parsed.tagline,
        region: parsed.region,
        role: "unknown",
        origin: makeOriginRef(kind, url),
      },
    ],
  }
}

/** Segments that may precede the Riot ID on DPM.LOL-style paths. */
const DPM_PREFIX_SEGMENTS = new Set(["summoner", "summoners", "player", "players", "profile", "lol"])

/**
 * DPM.LOL addresses a player directly under the root: `dpm.lol/<Name>-<TAG>`,
 * optionally followed by a sub-page (`/live`, `/aram`, `/lens`). There is no
 * region in the path, so the region stays unknown unless another input line
 * supplies it.
 *
 * `dpm.lol/pro/<ProName>` is a different kind of page that carries no Riot ID
 * and therefore cannot produce an identity — reported, not guessed at.
 */
function parseDpmUrl(url: URL): UrlParseOutcome {
  const segments = pathSegments(url)
  if (segments.length === 0) return { reason: "unsupported_url_shape" }
  if (segments[0].toLowerCase() === "pro") return { reason: "unsupported_url_shape" }

  const tail = DPM_PREFIX_SEGMENTS.has(segments[0].toLowerCase()) ? segments.slice(1) : segments
  if (tail.length === 0) return { reason: "unsupported_url_shape" }

  const nameTag = splitNameTag(decodeUrlValue(tail[0]))
  // A missing tagline here means the segment was a page name ("about"), not a
  // Riot ID — DPM.LOL always carries the tagline in the profile segment.
  if (!nameTag || !nameTag.tagline) return { reason: "unsupported_url_shape" }

  return {
    candidates: [
      { ...nameTag, region: SCOUT_REGION_UNKNOWN, role: "unknown", origin: makeOriginRef("dpm", url) },
    ],
  }
}

/** Dispatch one URL-ish token to the right provider parser. */
function parseUrlToken(token: string): UrlParseOutcome {
  const url = toScoutUrl(token)
  if (!url) return { reason: "malformed_url" }

  const kind = detectSourceKind(token)
  if (!kind) return { reason: "unknown_url_host" }

  switch (kind) {
    case "opgg":
      return parseOpggUrl(url)
    case "leagueofgraphs":
      return parseSummonerPathUrl(url, "leagueofgraphs")
    case "deeplol":
      return parseSummonerPathUrl(url, "deeplol")
    case "dpm":
      return parseDpmUrl(url)
  }
}

/**
 * Is this token meant to be a URL?
 *
 * Two cases only: an explicit http(s) scheme, or a host we support (which also
 * covers scheme-less pastes like `op.gg/summoners/euw/Name-TAG`). Everything
 * else stays free text — important, because a Riot ID may contain dots and
 * would otherwise be mistaken for a host.
 */
function isUrlLike(token: string): boolean {
  if (/^https?:\/\//i.test(token)) return true
  return detectSourceKind(token) !== null
}

/* ==========================================================================
 * 5. Free-text parsing
 * ========================================================================== */

/** Strip list numbering such as `1.` / `2)` from the start of a chunk. */
function stripListPrefix(value: string): string {
  return value.replace(/^\s*\d+[.)]\s*/, "")
}

/**
 * A segment normally holds at most one Riot ID, and the name may contain
 * spaces (`Hide on bush#KR1`). When a segment holds several `#`, whitespace is
 * the only separator left, so it is used — Riot names with spaces are not
 * supported in that (rare) shape, which is the documented trade-off.
 */
function splitIntoIdChunks(segment: string): string[] {
  const hashCount = (segment.match(/#/g) ?? []).length
  if (hashCount <= 1) return [segment]
  return segment.split(/\s+/).filter((part) => part.length > 0)
}

/**
 * Parse one chunk that contains a `#`, e.g. `EUW player#tag top`.
 *
 * A leading region word is consumed (only when a name is left over), a trailing
 * role word after the tagline is consumed. A leading *role* word is
 * deliberately NOT consumed: names like `Jungle Diff#EUW` are more common than
 * the `top Name#TAG` spelling, and `/`-separated input covers that case anyway.
 */
function parseRiotIdChunk(
  chunk: string,
  hints: LineHints,
): { candidate: ScoutCandidate } | { reason: UnparsedLineReason } {
  const value = stripListPrefix(chunk).trim()
  const hashIndex = value.indexOf("#")
  if (hashIndex < 0) return { reason: "no_riot_id" }

  let region = SCOUT_REGION_UNKNOWN
  let role: ScoutRole = "unknown"

  const beforeWords = value.slice(0, hashIndex).trim().split(/\s+/).filter(Boolean)
  if (beforeWords.length > 1) {
    const leading = normalizeScoutRegion(stripDecorations(beforeWords[0]))
    if (leading !== SCOUT_REGION_UNKNOWN) {
      region = leading
      beforeWords.shift()
    }
  }
  const riotName = beforeWords.join(" ")

  const afterWords = value.slice(hashIndex + 1).trim().split(/\s+/).filter(Boolean)
  const tagline = (afterWords.shift() ?? "").replace(/[^A-Za-z0-9]/g, "")
  for (const word of afterWords) {
    const parsedRole = normalizeScoutRole(word)
    if (parsedRole !== "unknown") role = parsedRole
  }

  if (!riotName || !tagline) return { reason: "invalid_riot_id" }

  return {
    candidate: {
      riotName,
      tagline,
      region: region !== SCOUT_REGION_UNKNOWN ? region : hints.region,
      role: role !== "unknown" ? role : hints.role,
      origin: null,
    },
  }
}

/**
 * Parse free text (no URLs). `,` `;` `|` `/` all separate segments, so
 * `euw / playername#tag / jungle` and `EUW player#tag top` both work.
 */
function parseFreeText(
  text: string,
  outerHints: LineHints,
): { candidates: ScoutCandidate[]; reasons: UnparsedLineReason[] } {
  const chunks = text
    .split(/[,;|/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .flatMap(splitIntoIdChunks)

  const idChunks = chunks.filter((chunk) => chunk.includes("#"))
  const otherChunks = chunks.filter((chunk) => !chunk.includes("#"))

  const hints = collectHints(otherChunks.flatMap((chunk) => chunk.split(/\s+/)))
  if (hints.region === SCOUT_REGION_UNKNOWN) hints.region = outerHints.region
  if (hints.role === "unknown") hints.role = outerHints.role

  if (idChunks.length === 0) return { candidates: [], reasons: ["no_riot_id"] }

  const candidates: ScoutCandidate[] = []
  const reasons: UnparsedLineReason[] = []
  for (const chunk of idChunks) {
    const parsed = parseRiotIdChunk(chunk, hints)
    if ("reason" in parsed) reasons.push(parsed.reason)
    else candidates.push(parsed.candidate)
  }
  return { candidates, reasons }
}

/* ==========================================================================
 * 6. Dedupe + assembly
 * ========================================================================== */

/** Mutable accumulator while merging candidates into players. */
interface MergeState {
  players: ScoutPlayer[]
  byId: Map<ScoutPlayerId, ScoutPlayer>
  byNameTag: Map<string, ScoutPlayer>
  duplicatesMerged: number
}

/** Add a source ref unless the exact same URL is already attached. */
function addSourceRef(player: ScoutPlayer, ref: ScoutSourceRef): void {
  if (player.sources.some((existing) => existing.kind === ref.kind && existing.url === ref.url)) return
  player.sources.push(ref)
}

/**
 * Fold one candidate into the player list.
 *
 * Three merge cases, all of which count towards `duplicatesMerged`:
 *  - identical id                       → same player, merge role + source
 *  - same Riot ID, candidate has no region → merge into the known-region player
 *  - same Riot ID, known player has no region → the known region wins and the
 *    player's id is recomputed (ids are derived, so this stays consistent)
 *
 * Two different *known* regions are NOT merged: those are genuinely different
 * accounts.
 */
function mergeCandidate(state: MergeState, candidate: ScoutCandidate): void {
  const id = buildScoutPlayerId(candidate)
  const key = nameTagKey(candidate)

  let existing = state.byId.get(id)
  if (!existing) {
    const sameNameTag = state.byNameTag.get(key)
    if (sameNameTag) {
      if (candidate.region === SCOUT_REGION_UNKNOWN) {
        existing = sameNameTag
      } else if (sameNameTag.region === SCOUT_REGION_UNKNOWN) {
        state.byId.delete(sameNameTag.id)
        sameNameTag.region = candidate.region
        sameNameTag.id = buildScoutPlayerId(sameNameTag)
        state.byId.set(sameNameTag.id, sameNameTag)
        existing = sameNameTag
      }
    }
  }

  if (existing) {
    state.duplicatesMerged += 1
    if (existing.role === "unknown" && candidate.role !== "unknown") existing.role = candidate.role
    if (candidate.origin) addSourceRef(existing, candidate.origin)
    return
  }

  const player: ScoutPlayer = {
    id,
    displayName: buildDisplayName(candidate.riotName, candidate.tagline),
    riotName: candidate.riotName,
    tagline: candidate.tagline,
    region: candidate.region,
    role: candidate.role,
    sources: candidate.origin ? [candidate.origin] : [],
  }
  state.byId.set(id, player)
  if (!state.byNameTag.has(key)) state.byNameTag.set(key, player)
  state.players.push(player)
}

/**
 * Add the generated provider links for every source the player does not
 * already have a ref for, then sort by the canonical provider order so the UI
 * and the tests see a stable sequence.
 */
function finalizeSources(player: ScoutPlayer): void {
  for (const ref of buildSourceLinks(player)) {
    if (!player.sources.some((existing) => existing.kind === ref.kind)) player.sources.push(ref)
  }
  player.sources.sort(
    (a, b) => SCOUT_SOURCE_KINDS.indexOf(a.kind) - SCOUT_SOURCE_KINDS.indexOf(b.kind),
  )
}

/* ==========================================================================
 * 7. Entry point
 * ========================================================================== */

/**
 * Parse a whole scout input blob.
 *
 * Never throws: malformed input becomes an {@link UnparsedLine}, not an
 * exception. Pure and deterministic — the same string always yields the same
 * result, including the player ids.
 */
export function parseScoutInput(raw: string): ScoutParseResult {
  const state: MergeState = {
    players: [],
    byId: new Map(),
    byNameTag: new Map(),
    duplicatesMerged: 0,
  }
  const unparsedLines: UnparsedLine[] = []

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { players: [], unparsedLines, duplicatesMerged: 0 }
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const tokens = line.split(/\s+/).filter(Boolean)
    const urlTokens = tokens.filter(isUrlLike)

    if (urlTokens.length === 0) {
      const { candidates, reasons } = parseFreeText(line, emptyHints())
      for (const candidate of candidates) mergeCandidate(state, candidate)
      for (const reason of reasons) unparsedLines.push({ raw: line, reason })
      continue
    }

    const restTokens = tokens.filter((token) => !isUrlLike(token))
    const hints = collectHints(restTokens.filter((token) => !token.includes("#")))

    for (const token of urlTokens) {
      const outcome = parseUrlToken(token)
      if ("reason" in outcome) {
        unparsedLines.push({ raw: token, reason: outcome.reason })
        continue
      }
      for (const candidate of outcome.candidates) {
        mergeCandidate(state, {
          ...candidate,
          region: candidate.region !== SCOUT_REGION_UNKNOWN ? candidate.region : hints.region,
          role: candidate.role !== "unknown" ? candidate.role : hints.role,
        })
      }
    }

    // A line may mix a link and a plain Riot ID; the plain ones are parsed too.
    const leftover = restTokens.filter((token) => token.includes("#"))
    if (leftover.length > 0) {
      const { candidates, reasons } = parseFreeText(leftover.join(" "), hints)
      for (const candidate of candidates) mergeCandidate(state, candidate)
      for (const reason of reasons) unparsedLines.push({ raw: line, reason })
    }
  }

  for (const player of state.players) finalizeSources(player)

  return {
    players: state.players,
    unparsedLines,
    duplicatesMerged: state.duplicatesMerged,
  }
}
