/**
 * Source adapter layer for the Tournament Scout.
 *
 * WHAT THIS MODULE DOES
 *   - recognises which of the four supported sites a URL belongs to
 *   - normalises region slugs (`EUW1` / `euw` / `EUW` → `"EUW"`)
 *   - builds correctly encoded profile links for a recognised player
 *   - states, per provider and machine-readably, WHY nothing is fetched
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   - it does not scrape, fetch, proxy or parse any provider HTML
 *   - `ScoutSourceAdapter.fetchSnapshot` stays optional and unimplemented
 *
 * Reason, stated honestly rather than hidden: none of the four sites offers a
 * *documented* public read API for champion statistics, three of them are not
 * readable cross-origin at all, and a browser page cannot read a cross-origin
 * HTML document. The one exception found — DeepLoL's undocumented internal
 * backend, which does answer cross-origin GETs — is recorded as a possible
 * future adapter and deliberately not used (see `SCOUT_DIRECT_FETCH_INFO`).
 * Guessing numbers instead is not an option this feature has.
 *
 * URL FORMATS — VERIFIED vs HEURISTIC
 *   Each descriptor carries `urlFormatConfidence`. `"verified"` means the shape
 *   is documented/observed; `"heuristic"` means it is a best-effort shape that
 *   may be wrong for edge cases. Nothing in this file claims more certainty
 *   than that flag. Parsing is intentionally more tolerant than building: the
 *   parser (src/scout/linkParser.ts) accepts several shapes per host, while
 *   this module emits exactly one canonical shape per host.
 */

import { SCOUT_IMPORT_MODES } from "./types"
import type {
  ScoutAutoFetchStatus,
  ScoutDirectFetchInfo,
  ScoutFetchBlockedCode,
  ScoutImportMode,
  ScoutPlayerIdentity,
  ScoutPublicApiState,
  ScoutRegion,
  ScoutSourceKind,
  ScoutSourceRef,
  ScoutSourceSnapshot,
  ScoutSourceStatus,
} from "./types"

/* ==========================================================================
 * 1. Regions
 * ========================================================================== */

/** Canonical value for "region not known". Never guess a default region. */
export const SCOUT_REGION_UNKNOWN = "UNKNOWN"

/** One canonical region plus every spelling we accept for it. */
interface ScoutRegionInfo {
  /** Canonical, upper-case code stored on `ScoutPlayer.region`. */
  code: ScoutRegion
  /** Lower-case slug used inside provider URLs. */
  slug: string
  /** Accepted spellings (lower-case, compared after trimming). */
  aliases: readonly string[]
}

/**
 * Region table. `slug` is the lower-case form every supported provider uses in
 * its paths. Aliases cover the Riot platform ids (`euw1`, `na1`, `la1`, …) that
 * people copy out of other tools.
 *
 * Evidence: the slug list matches the one League of Graphs publishes in its own
 * robots.txt (`br, eune, euw, id, jp, kr, lan, las, na, oce, ph, ru, sg, th,
 * tr, tw, vn`), and `euw` / `na` / `kr` were additionally observed in live
 * OP.GG profile URLs. `ME` (Middle East) is not in that list and is carried
 * here as a best-effort alias — a link built for it may 404 on some providers.
 */
const SCOUT_REGIONS: readonly ScoutRegionInfo[] = [
  { code: "EUW", slug: "euw", aliases: ["euw", "euw1", "euwest", "eu-west"] },
  { code: "EUNE", slug: "eune", aliases: ["eune", "eun1", "eunordiceast", "eu-nordic-east"] },
  { code: "NA", slug: "na", aliases: ["na", "na1", "nam", "northamerica"] },
  { code: "KR", slug: "kr", aliases: ["kr", "kr1", "korea"] },
  { code: "BR", slug: "br", aliases: ["br", "br1", "brazil"] },
  { code: "LAN", slug: "lan", aliases: ["lan", "la1"] },
  { code: "LAS", slug: "las", aliases: ["las", "la2"] },
  { code: "OCE", slug: "oce", aliases: ["oce", "oc1", "oceania"] },
  { code: "TR", slug: "tr", aliases: ["tr", "tr1", "turkey"] },
  { code: "RU", slug: "ru", aliases: ["ru", "ru1", "russia"] },
  { code: "JP", slug: "jp", aliases: ["jp", "jp1", "japan"] },
  { code: "ID", slug: "id", aliases: ["id", "id1", "idn", "indonesia"] },
  { code: "PH", slug: "ph", aliases: ["ph", "ph2"] },
  { code: "SG", slug: "sg", aliases: ["sg", "sg2"] },
  { code: "TH", slug: "th", aliases: ["th", "th2"] },
  { code: "TW", slug: "tw", aliases: ["tw", "tw2"] },
  { code: "VN", slug: "vn", aliases: ["vn", "vn2"] },
  { code: "ME", slug: "me", aliases: ["me", "me1", "mena"] },
]

/** alias → region info, built once. */
const REGION_BY_ALIAS: ReadonlyMap<string, ScoutRegionInfo> = (() => {
  const map = new Map<string, ScoutRegionInfo>()
  for (const info of SCOUT_REGIONS) {
    map.set(info.code.toLowerCase(), info)
    for (const alias of info.aliases) map.set(alias, info)
  }
  return map
})()

/**
 * Normalise any region spelling to its canonical code.
 * Returns {@link SCOUT_REGION_UNKNOWN} for empty/unknown input — never throws,
 * never guesses a default region.
 */
export function normalizeScoutRegion(raw: string | null | undefined): ScoutRegion {
  if (typeof raw !== "string") return SCOUT_REGION_UNKNOWN
  const key = raw.trim().toLowerCase()
  if (!key) return SCOUT_REGION_UNKNOWN
  return REGION_BY_ALIAS.get(key)?.code ?? SCOUT_REGION_UNKNOWN
}

/** `true` when the value is a region this module can build links for. */
export function isKnownScoutRegion(region: string | null | undefined): boolean {
  return normalizeScoutRegion(region) !== SCOUT_REGION_UNKNOWN
}

/**
 * Lower-case URL slug for a region, or `null` when the region is unknown.
 * `null` is the honest answer that stops link building — do not substitute a
 * fallback region.
 */
export function scoutRegionSlug(region: ScoutRegion | null | undefined): string | null {
  if (typeof region !== "string") return null
  const key = region.trim().toLowerCase()
  if (!key) return null
  return REGION_BY_ALIAS.get(key)?.slug ?? null
}

/* ==========================================================================
 * 2. Provider descriptors
 * ========================================================================== */

/** Iteration order for everything that renders "all sources". */
export const SCOUT_SOURCE_KINDS: readonly ScoutSourceKind[] = [
  "opgg",
  "leagueofgraphs",
  "deeplol",
  "dpm",
]

/** How well the emitted profile-URL shape is backed by evidence. */
export type ScoutUrlFormatConfidence = "verified" | "heuristic"

/** Static description of one supported provider. */
export interface ScoutSourceDescriptor {
  kind: ScoutSourceKind
  /** Brand name — a proper noun, never translated. */
  label: string
  /**
   * Site root. Used as the link of a `manual_required` ref so the UI always
   * has something real to link to instead of a fabricated deep link.
   */
  homeUrl: string
  /**
   * Hostnames identifying this provider. A host matches when it equals an
   * entry or ends with `"." + entry` (so `euw.op.gg` matches `op.gg`).
   */
  hosts: readonly string[]
  urlFormatConfidence: ScoutUrlFormatConfidence
  /** A profile URL cannot be built without a region. */
  requiresRegion: boolean
  /** A profile URL cannot be built without a Riot tagline. */
  requiresTagline: boolean
  /**
   * Build the canonical profile URL. Returns `null` when the identity does not
   * carry enough information — callers turn that into `manual_required`.
   */
  buildProfileUrl(identity: ScoutPlayerIdentity): string | null
}

/** `Name` + `TAG` as the `Name-TAG` path segment all four sites use. */
function encodeNameTagSegment(riotName: string, tagline: string): string {
  const name = encodeURIComponent(riotName.trim())
  const tag = tagline.trim()
  return tag ? `${name}-${encodeURIComponent(tag)}` : name
}

/**
 * Provider table.
 *
 * Evidence notes (kept next to the code on purpose — checked 2026-08-18 by
 * fetching the URLs, not by assumption):
 *
 *  - OP.GG: the canonical profile URL is `op.gg/lol/summoners/<region>/<Name>-<TAG>`
 *    (200, server-rendered profile title). The shorter, better known
 *    `www.op.gg/summoners/<region>/<Name>-<TAG>` still works but answers 308 to
 *    the canonical one, so the canonical form is emitted and both are parsed.
 *    A wrong region 404s, i.e. the region segment is genuinely validated.
 *    Legacy `<region>.op.gg/summoner/userName=<Name>` still redirects (301→308)
 *    and is parsed; legacy `/multi/query=…` is **dead** (404) — it is parsed
 *    defensively for old bookmarks but never emitted.
 *  - League of Graphs: `/summoner/<region>/<Name>-<TAG>`, with optional
 *    sub-sections such as `/summoner/champions/<region>/<Name>-<TAG>`
 *    (both patterns appear in their robots.txt and in indexed URLs). Live
 *    fetching is blocked by a Cloudflare challenge, so this shape is verified
 *    indirectly rather than by a successful page load.
 *  - DeepLoL: `/summoner/<region>/<Name>-<TAG>` with a **lower-case** region in
 *    the canonical/indexed form. Upper-case also answers 200, but the site is a
 *    SPA with a catch-all route, so that proves nothing — hence lower-case.
 *  - DPM.LOL: profile pages sit directly under the root as `/<Name>-<TAG>`
 *    (verified: a real Riot ID renders its own title, a bogus one renders
 *    "Player Not Found"). No region segment exists. Sub-pages `/live`, `/aram`,
 *    `/lens` hang off the profile; pro pages live under `/pro/<Name>` and carry
 *    no Riot ID, so they cannot yield an identity.
 */
export const SCOUT_SOURCE_DESCRIPTORS: readonly ScoutSourceDescriptor[] = [
  {
    kind: "opgg",
    label: "OP.GG",
    homeUrl: "https://www.op.gg/",
    hosts: ["op.gg"],
    urlFormatConfidence: "verified",
    requiresRegion: true,
    requiresTagline: true,
    buildProfileUrl(identity) {
      const slug = scoutRegionSlug(identity.region)
      if (!slug || !identity.riotName.trim() || !identity.tagline.trim()) return null
      // Canonical form — `www.op.gg/summoners/…` only 308-redirects here.
      return `https://op.gg/lol/summoners/${slug}/${encodeNameTagSegment(identity.riotName, identity.tagline)}`
    },
  },
  {
    kind: "leagueofgraphs",
    label: "League of Graphs",
    homeUrl: "https://www.leagueofgraphs.com/",
    hosts: ["leagueofgraphs.com"],
    urlFormatConfidence: "verified",
    requiresRegion: true,
    requiresTagline: true,
    buildProfileUrl(identity) {
      const slug = scoutRegionSlug(identity.region)
      if (!slug || !identity.riotName.trim() || !identity.tagline.trim()) return null
      return `https://www.leagueofgraphs.com/summoner/${slug}/${encodeNameTagSegment(identity.riotName, identity.tagline)}`
    },
  },
  {
    kind: "deeplol",
    label: "DeepLoL",
    homeUrl: "https://www.deeplol.gg/",
    hosts: ["deeplol.gg"],
    urlFormatConfidence: "verified",
    requiresRegion: true,
    requiresTagline: true,
    buildProfileUrl(identity) {
      const slug = scoutRegionSlug(identity.region)
      if (!slug || !identity.riotName.trim() || !identity.tagline.trim()) return null
      // Lower-case region: that is the canonical/indexed spelling.
      return `https://www.deeplol.gg/summoner/${slug}/${encodeNameTagSegment(identity.riotName, identity.tagline)}`
    },
  },
  {
    kind: "dpm",
    label: "DPM.LOL",
    homeUrl: "https://dpm.lol/",
    hosts: ["dpm.lol"],
    urlFormatConfidence: "verified",
    // DPM.LOL addresses players by Riot ID only; there is no region segment.
    requiresRegion: false,
    requiresTagline: true,
    buildProfileUrl(identity) {
      if (!identity.riotName.trim() || !identity.tagline.trim()) return null
      return `https://dpm.lol/${encodeNameTagSegment(identity.riotName, identity.tagline)}`
    },
  },
]

const DESCRIPTOR_BY_KIND: ReadonlyMap<ScoutSourceKind, ScoutSourceDescriptor> = new Map(
  SCOUT_SOURCE_DESCRIPTORS.map((descriptor) => [descriptor.kind, descriptor]),
)

/** Descriptor lookup. Throws only for a kind outside `ScoutSourceKind`. */
export function getScoutSourceDescriptor(kind: ScoutSourceKind): ScoutSourceDescriptor {
  const descriptor = DESCRIPTOR_BY_KIND.get(kind)
  if (!descriptor) {
    // Unreachable for a well-typed call; kept so a future kind fails loudly
    // instead of silently producing a broken link.
    throw new Error(`Unknown scout source kind: ${String(kind)}`)
  }
  return descriptor
}

/* ==========================================================================
 * 3. URL → provider detection
 * ========================================================================== */

/**
 * Parse a user-supplied URL-ish string into a `URL`.
 * Tolerates a missing scheme (`op.gg/...`), surrounding whitespace and common
 * trailing punctuation from prose (`… (https://op.gg/x).`). Returns `null`
 * instead of throwing for anything unparseable.
 */
export function toScoutUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== "string") return null
  let value = raw.trim()
  if (!value) return null

  // Strip wrapping brackets/quotes and trailing sentence punctuation.
  value = value.replace(/^[<("']+/, "").replace(/[>)"',.;]+$/, "")
  if (!value) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname) return null
    return url
  } catch {
    return null
  }
}

/** `true` when `hostname` is the provider host or a subdomain of it. */
function hostMatches(hostname: string, host: string): boolean {
  return hostname === host || hostname.endsWith(`.${host}`)
}

/**
 * Which provider a URL belongs to, or `null` for anything else (including
 * empty strings, free text and unknown hosts). Never throws.
 */
export function detectSourceKind(url: string | null | undefined): ScoutSourceKind | null {
  const parsed = toScoutUrl(url)
  if (!parsed) return null
  const hostname = parsed.hostname.toLowerCase()
  for (const descriptor of SCOUT_SOURCE_DESCRIPTORS) {
    for (const host of descriptor.hosts) {
      if (hostMatches(hostname, host)) return descriptor.kind
    }
  }
  return null
}

/* ==========================================================================
 * 4. Link building
 * ========================================================================== */

/** Build the profile URL for one provider, or `null` when not possible. */
export function buildProfileUrl(
  kind: ScoutSourceKind,
  identity: ScoutPlayerIdentity,
): string | null {
  if (!identity || typeof identity.riotName !== "string") return null
  return getScoutSourceDescriptor(kind).buildProfileUrl(identity)
}

/** Build one source ref, with an honest status for whatever is missing. */
function buildSourceRef(
  descriptor: ScoutSourceDescriptor,
  identity: ScoutPlayerIdentity,
): ScoutSourceRef {
  const name = typeof identity?.riotName === "string" ? identity.riotName.trim() : ""
  const tagline = typeof identity?.tagline === "string" ? identity.tagline.trim() : ""
  const region = typeof identity?.region === "string" ? identity.region : SCOUT_REGION_UNKNOWN

  if (!name) {
    return {
      kind: descriptor.kind,
      url: descriptor.homeUrl,
      status: "manual_required",
      noteCode: "identity_incomplete",
    }
  }
  if (descriptor.requiresRegion && !scoutRegionSlug(region)) {
    return {
      kind: descriptor.kind,
      url: descriptor.homeUrl,
      status: "manual_required",
      noteCode: "region_unknown",
    }
  }
  if (descriptor.requiresTagline && !tagline) {
    return {
      kind: descriptor.kind,
      url: descriptor.homeUrl,
      status: "manual_required",
      noteCode: "tagline_unknown",
    }
  }

  const url = descriptor.buildProfileUrl({ riotName: name, tagline, region })
  if (!url) {
    return {
      kind: descriptor.kind,
      url: descriptor.homeUrl,
      status: "manual_required",
      noteCode: "identity_incomplete",
    }
  }

  return {
    kind: descriptor.kind,
    url,
    // The link works, but the numbers behind it still have to be read by a
    // human — nothing is fetched. That is what `source_link_only` means.
    status: "source_link_only",
    noteCode:
      descriptor.urlFormatConfidence === "heuristic"
        ? "url_format_heuristic"
        : "profile_link_generated",
  }
}

/**
 * Profile links for all four providers, in `SCOUT_SOURCE_KINDS` order.
 * Always returns one ref per provider — a provider that cannot be linked gets
 * `status: "manual_required"` plus a `noteCode` saying what is missing, so the
 * gap is visible in the UI instead of disappearing.
 */
export function buildSourceLinks(identity: ScoutPlayerIdentity): ScoutSourceRef[] {
  return SCOUT_SOURCE_DESCRIPTORS.map((descriptor) => buildSourceRef(descriptor, identity))
}

/**
 * One OP.GG multi-search link for a whole roster.
 *
 * Returns `null` when no identity carries a known region (the multi-search path
 * needs one) or when no identity has a usable Riot ID — a fabricated region
 * would be a guess. The region of the first identity that has one wins.
 * Commas stay literal because that is the separator OP.GG itself emits; the
 * individual Riot IDs are `encodeURIComponent`-encoded, so `#` becomes `%23`.
 *
 * Verified: `.../multisearch/euw?summoners=A%23TAG,B%23TAG` renders exactly the
 * requested summoners (a control request with a different name returned only
 * that one). Note that OP.GG does *not* validate the region segment of a
 * multisearch URL, so a wrong region fails silently there — one more reason not
 * to invent one.
 */
export function buildOpggMultiLink(identities: readonly ScoutPlayerIdentity[]): string | null {
  if (!Array.isArray(identities) || identities.length === 0) return null

  let slug: string | null = null
  const parts: string[] = []
  for (const identity of identities) {
    const name = typeof identity?.riotName === "string" ? identity.riotName.trim() : ""
    const tagline = typeof identity?.tagline === "string" ? identity.tagline.trim() : ""
    if (!name || !tagline) continue
    if (!slug) slug = scoutRegionSlug(identity.region)
    parts.push(encodeURIComponent(`${name}#${tagline}`))
  }

  if (!slug || parts.length === 0) return null
  // Canonical form — `www.op.gg/multisearch/…` only 308-redirects here.
  return `https://op.gg/lol/multisearch/${slug}?summoners=${parts.join(",")}`
}

/* ==========================================================================
 * 5. Adapter contract + honest "why we do not fetch" statements
 * ========================================================================== */

/**
 * Contract a real source adapter would implement.
 *
 * `fetchSnapshot` is optional and **implemented by nobody** in this version.
 * It exists so a later adapter (a server-side proxy, an official API, a browser
 * extension) can be plugged in without changing any caller. Callers must check
 * `canFetchInBrowser(kind)` / `typeof adapter.fetchSnapshot === "function"`
 * before relying on it, and must never fall back to made-up data when it is
 * absent — an absent adapter means "ask the user", not "assume zero".
 */
export interface ScoutSourceAdapter {
  readonly kind: ScoutSourceKind
  readonly descriptor: ScoutSourceDescriptor
  /** Same contract as {@link buildProfileUrl}. */
  buildProfileUrl(identity: ScoutPlayerIdentity): string | null
  /** Not implemented — see the module header. */
  fetchSnapshot?(identity: ScoutPlayerIdentity): Promise<ScoutSourceSnapshot>
}

/** Status every provider reports for a direct browser fetch today. */
const DIRECT_FETCH_STATUS: ScoutSourceStatus = "not_supported_in_browser"

function directFetchInfo(
  kind: ScoutSourceKind,
  reason: ScoutFetchBlockedCode,
  publicApi: ScoutPublicApiState,
): ScoutDirectFetchInfo {
  return { kind, supportedInBrowser: false, status: DIRECT_FETCH_STATUS, reason, publicApi }
}

/**
 * Why each provider is not read directly. Machine-readable on purpose: the UI
 * translates `reason`/`publicApi`, so this file contains no user-facing prose.
 *
 * State of research (first checked 2026-08-18, **re-verified 2026-08-19** for
 * the stats-import feature; deliberately conservative — an unverified claim
 * counts as blocked). The re-check matters because the import panel now renders
 * `reason` per provider: a wrong code here is a false statement on screen.
 *
 *  - OP.GG — profile pages answer 200 (nginx). A request carrying an `Origin`
 *    header comes back with **zero** `access-control-*` headers, and no
 *    Cloudflare challenge was observed — so the blocker is CORS, not bot
 *    protection. (2026-08-18 recorded `anti_bot_protection`; that was the wrong
 *    code for the same underlying fact.) The old internal host
 *    `lol-web-api.op.gg` still does not resolve. There *is* one documented
 *    programmatic offering — the official OP.GG MCP server (`mcp-api.op.gg`) —
 *    but it is server-to-server and sends no CORS headers either, which is
 *    exactly what `documented_no_cors` describes.
 *    → `cors_blocked` / `documented_no_cors`.
 *  - League of Graphs — unchanged: every stats page answers 403 behind a
 *    Cloudflare managed challenge (`cf-mitigated: challenge`); robots.txt
 *    disallows `/api/*` and the summoner stat pages.
 *    → `anti_bot_protection` / `none_documented`.
 *  - DeepLoL — unchanged: its private frontend backend
 *    (`b2c-api-cdn.deeplol.gg`) *does* answer cross-origin simple GETs with
 *    `access-control-allow-origin: *`. It is undocumented, unversioned, not
 *    covered by any ToS, and its OPTIONS preflight is rejected, so any
 *    non-simple request fails. Recorded as a *possible future adapter*, and
 *    deliberately NOT used — `supportedInBrowser` stays `false`.
 *    → `undocumented_private_api` / `undocumented_cors_ok`.
 *  - DPM.LOL — **changed since 2026-08-18**: the site now sits behind
 *    Cloudflare. Root, profile pages, `/pro/…` and even `sitemap-all.xml`
 *    answer 403 with `cf-mitigated: challenge` (reproduced twice). The previous
 *    `no_public_api` is no longer the *first* thing that blocks a fetch — a
 *    challenge is — and the panel should say so.
 *    → `anti_bot_protection` / `none_documented`.
 *
 * If any of these ever ships a documented, CORS-enabled endpoint, the correct
 * change is a new adapter implementing `fetchSnapshot`, plus flipping the entry
 * here — not a scraper. Note that `supportedInBrowser` is `false` for all four
 * regardless of `reason`: changing a reason code never changes what the app
 * does, only what it honestly says about *why*.
 */
export const SCOUT_DIRECT_FETCH_INFO: Readonly<Record<ScoutSourceKind, ScoutDirectFetchInfo>> = {
  opgg: directFetchInfo("opgg", "cors_blocked", "documented_no_cors"),
  leagueofgraphs: directFetchInfo("leagueofgraphs", "anti_bot_protection", "none_documented"),
  deeplol: directFetchInfo("deeplol", "undocumented_private_api", "undocumented_cors_ok"),
  dpm: directFetchInfo("dpm", "anti_bot_protection", "none_documented"),
}

/** Honest per-provider statement about direct fetching. */
export function getDirectFetchInfo(kind: ScoutSourceKind): ScoutDirectFetchInfo {
  return SCOUT_DIRECT_FETCH_INFO[kind]
}

/** `false` for every provider in this version. Kept as a function so callers
 * read the capability instead of hard-coding the assumption. */
export function canFetchInBrowser(kind: ScoutSourceKind): boolean {
  return getDirectFetchInfo(kind).supportedInBrowser
}

/**
 * A link-only ref stating that a provider cannot be fetched directly. Useful
 * for a UI that wants to show the blocked state next to the working link.
 */
export function buildNotSupportedRef(
  kind: ScoutSourceKind,
  identity: ScoutPlayerIdentity,
): ScoutSourceRef {
  const descriptor = getScoutSourceDescriptor(kind)
  return {
    kind,
    url: descriptor.buildProfileUrl(identity) ?? descriptor.homeUrl,
    status: DIRECT_FETCH_STATUS,
    noteCode: "direct_fetch_not_supported",
  }
}

/** Link-building adapters for all four providers. None can fetch. */
export const SCOUT_SOURCE_ADAPTERS: Readonly<Record<ScoutSourceKind, ScoutSourceAdapter>> =
  SCOUT_SOURCE_DESCRIPTORS.reduce(
    (acc, descriptor) => {
      acc[descriptor.kind] = {
        kind: descriptor.kind,
        descriptor,
        buildProfileUrl: (identity) => descriptor.buildProfileUrl(identity),
        // fetchSnapshot intentionally omitted — see the module header.
      }
      return acc
    },
    {} as Record<ScoutSourceKind, ScoutSourceAdapter>,
  )

/** Adapter lookup. */
export function getScoutSourceAdapter(kind: ScoutSourceKind): ScoutSourceAdapter {
  const adapter = SCOUT_SOURCE_ADAPTERS[kind]
  if (!adapter) throw new Error(`Unknown scout source kind: ${String(kind)}`)
  return adapter
}

/* ==========================================================================
 * 6. Auto-fetch status + offerable import modes (views, never a second truth)
 *
 * WHERE THIS SECTION COMES FROM
 * These four functions lived in `src/scout/riotImport.ts` until the Riot
 * auto-import was removed. They were never part of that feature: they describe
 * the *manual* route — the honest "none of the four sites can be read from the
 * browser, so here is the copy/paste path instead" block the import panel
 * renders. Their single data source is `SCOUT_DIRECT_FETCH_INFO`, which lives
 * in this file, so they moved here rather than keeping a module named
 * "riotImport" alive with no Riot import left in it.
 * ========================================================================== */

/**
 * The auto-fetch line the import panel renders for one provider.
 *
 * Derived **strictly** from {@link getDirectFetchInfo}: `supported` is that
 * record's `supportedInBrowser`, and `status`, `reason` and `publicApi` are
 * carried through unchanged. Nothing is added, nothing is dropped and no value
 * is hard-coded here.
 *
 * That is the whole point: {@link SCOUT_DIRECT_FETCH_INFO} stays the only place
 * those facts are recorded, so if a provider ever ships a documented,
 * CORS-enabled endpoint, flipping its entry there changes what this function
 * returns — and therefore what the UI says — automatically. Two independently
 * maintained answers to "is OP.GG fetchable?" is precisely the drift this
 * feature cannot afford.
 *
 * Note in particular that DeepLoL reports `publicApi: "undocumented_cors_ok"`
 * and still `supported: false`: a reachable *undocumented private* backend is
 * recorded as a possible future adapter, not used.
 */
export function getScoutAutoFetchStatus(kind: ScoutSourceKind): ScoutAutoFetchStatus {
  const info = getDirectFetchInfo(kind)
  return {
    kind: info.kind,
    supported: info.supportedInBrowser,
    status: info.status,
    reason: info.reason,
    publicApi: info.publicApi,
  }
}

/** All four providers, in the canonical {@link SCOUT_SOURCE_KINDS} order. */
export function getAllScoutAutoFetchStatuses(): ScoutAutoFetchStatus[] {
  return SCOUT_SOURCE_KINDS.map((kind) => getScoutAutoFetchStatus(kind))
}

/**
 * `true` when not a single provider can be fetched directly from the browser —
 * the condition under which the UI shows the "auto-fetch is not possible, here
 * is the manual route" explanation once instead of four times.
 *
 * Derived from {@link canFetchInBrowser}, so it flips by itself the day a
 * provider becomes fetchable. `true` in this version.
 */
export function isAutoFetchUnavailableForAll(): boolean {
  return SCOUT_SOURCE_KINDS.every((kind) => !canFetchInBrowser(kind))
}

/**
 * The import modes the UI may present, in the canonical
 * {@link SCOUT_IMPORT_MODES} order.
 *
 * Every mode this app has needs no configuration whatsoever — `manual_paste`
 * is a textarea and `source_links` is a generated URL — which is what keeps the
 * feature fully usable in a plain public build. There is therefore nothing left
 * to filter on: the answer is the canonical list itself.
 *
 * The list is copied out of `SCOUT_IMPORT_MODES` rather than spelled out as a
 * literal, so the canonical order stays defined in exactly one place and this
 * function cannot drift away from the union it claims to enumerate.
 *
 * Never throws.
 */
export function availableScoutImportModes(): ScoutImportMode[] {
  return [...SCOUT_IMPORT_MODES]
}
