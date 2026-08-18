import { describe, expect, it } from "vitest"

import {
  SCOUT_DIRECT_FETCH_INFO,
  SCOUT_REGION_UNKNOWN,
  SCOUT_SOURCE_ADAPTERS,
  SCOUT_SOURCE_DESCRIPTORS,
  SCOUT_SOURCE_KINDS,
  buildNotSupportedRef,
  buildOpggMultiLink,
  buildProfileUrl,
  buildSourceLinks,
  canFetchInBrowser,
  detectSourceKind,
  getDirectFetchInfo,
  getScoutSourceAdapter,
  getScoutSourceDescriptor,
  isKnownScoutRegion,
  normalizeScoutRegion,
  scoutRegionSlug,
  toScoutUrl,
} from "../src/scout/sources"
import type { ScoutPlayerIdentity, ScoutSourceKind, ScoutSourceRef } from "../src/scout/types"

// Offline and deterministic by construction: this module builds and inspects
// strings only. Nothing here performs (or may perform) a network request.

const AGURIN: ScoutPlayerIdentity = { riotName: "Agurin", tagline: "EUW", region: "EUW" }

const byKind = (refs: ScoutSourceRef[]): Map<ScoutSourceKind, ScoutSourceRef> =>
  new Map(refs.map((ref) => [ref.kind, ref]))

describe("detectSourceKind", () => {
  it("recognises all four providers", () => {
    expect(detectSourceKind("https://www.op.gg/summoners/euw/Agurin-EUW")).toBe("opgg")
    expect(detectSourceKind("https://op.gg/lol/summoners/euw/Agurin-EUW")).toBe("opgg")
    expect(detectSourceKind("https://euw.op.gg/summoner/userName=Agurin")).toBe("opgg")
    expect(detectSourceKind("https://www.leagueofgraphs.com/summoner/euw/Agurin-EUW")).toBe(
      "leagueofgraphs",
    )
    expect(detectSourceKind("https://www.deeplol.gg/summoner/euw/Agurin-EUW")).toBe("deeplol")
    expect(detectSourceKind("https://dpm.lol/Agurin-EUW")).toBe("dpm")
  })

  it("works without a scheme and ignores casing and stray punctuation", () => {
    expect(detectSourceKind("op.gg")).toBe("opgg")
    expect(detectSourceKind("WWW.OP.GG/lol/summoners/euw/Agurin-EUW")).toBe("opgg")
    expect(detectSourceKind("  https://dpm.lol/Agurin-EUW,  ")).toBe("dpm")
    expect(detectSourceKind("(https://www.deeplol.gg/summoner/euw/Agurin-EUW).")).toBe("deeplol")
  })

  it("returns null for foreign hosts", () => {
    expect(detectSourceKind("https://example.com/summoner/euw/Agurin-EUW")).toBeNull()
    expect(detectSourceKind("https://www.leagueofgraphs.com.evil.example/x")).toBeNull()
    expect(detectSourceKind("https://notop.gg/x")).toBeNull()
    expect(detectSourceKind("https://opgg.com/x")).toBeNull()
    expect(detectSourceKind("https://u.gg/lol/profile/euw1/Agurin-EUW/overview")).toBeNull()
  })

  it("returns null instead of throwing for junk input", () => {
    for (const input of ["", "   ", "Agurin#EUW", "not a url", "://", "ftp://op.gg/x", null, undefined]) {
      expect(detectSourceKind(input)).toBeNull()
    }
  })
})

describe("toScoutUrl", () => {
  it("parses tolerant input", () => {
    expect(toScoutUrl("op.gg/lol/summoners/euw/A-B")?.hostname).toBe("op.gg")
    expect(toScoutUrl("https://dpm.lol/A-B")?.pathname).toBe("/A-B")
  })

  it("returns null for anything unusable", () => {
    for (const input of ["", "   ", "https://", "http://", null, undefined]) {
      expect(toScoutUrl(input)).toBeNull()
    }
  })
})

describe("regions", () => {
  it("normalises every accepted spelling to the canonical code", () => {
    expect(normalizeScoutRegion("EUW")).toBe("EUW")
    expect(normalizeScoutRegion("euw")).toBe("EUW")
    expect(normalizeScoutRegion("EUW1")).toBe("EUW")
    expect(normalizeScoutRegion(" na1 ")).toBe("NA")
    expect(normalizeScoutRegion("eun1")).toBe("EUNE")
    expect(normalizeScoutRegion("la2")).toBe("LAS")
  })

  it("never guesses a region", () => {
    for (const input of ["", "   ", "xx", "world", "1", null, undefined]) {
      expect(normalizeScoutRegion(input)).toBe(SCOUT_REGION_UNKNOWN)
    }
    expect(isKnownScoutRegion("EUW")).toBe(true)
    expect(isKnownScoutRegion(SCOUT_REGION_UNKNOWN)).toBe(false)
  })

  it("maps a region to its lower-case URL slug", () => {
    expect(scoutRegionSlug("EUW")).toBe("euw")
    expect(scoutRegionSlug("kr1")).toBe("kr")
    expect(scoutRegionSlug(SCOUT_REGION_UNKNOWN)).toBeNull()
    expect(scoutRegionSlug("")).toBeNull()
    expect(scoutRegionSlug(null)).toBeNull()
  })
})

describe("buildSourceLinks", () => {
  it("builds one correctly encoded link per provider", () => {
    const refs = buildSourceLinks(AGURIN)

    expect(refs.map((ref) => ref.kind)).toEqual(SCOUT_SOURCE_KINDS)
    const map = byKind(refs)
    expect(map.get("opgg")?.url).toBe("https://op.gg/lol/summoners/euw/Agurin-EUW")
    expect(map.get("leagueofgraphs")?.url).toBe(
      "https://www.leagueofgraphs.com/summoner/euw/Agurin-EUW",
    )
    expect(map.get("deeplol")?.url).toBe("https://www.deeplol.gg/summoner/euw/Agurin-EUW")
    expect(map.get("dpm")?.url).toBe("https://dpm.lol/Agurin-EUW")
  })

  it("percent-encodes spaces and non-ASCII characters", () => {
    const refs = buildSourceLinks({ riotName: "Hide on bush", tagline: "KR1", region: "kr1" })
    const map = byKind(refs)

    expect(map.get("opgg")?.url).toBe("https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1")
    expect(map.get("dpm")?.url).toBe("https://dpm.lol/Hide%20on%20bush-KR1")

    const unicode = byKind(buildSourceLinks({ riotName: "×", tagline: "EUW", region: "EUW" }))
    expect(unicode.get("leagueofgraphs")?.url).toBe(
      "https://www.leagueofgraphs.com/summoner/euw/%C3%97-EUW",
    )
  })

  it("marks every generated link as source_link_only, never as fetched data", () => {
    for (const ref of buildSourceLinks(AGURIN)) {
      expect(ref.status).toBe("source_link_only")
      expect(ref.noteCode === "profile_link_generated" || ref.noteCode === "url_format_heuristic").toBe(
        true,
      )
    }
  })

  it("falls back to manual_required with the site root when the region is unknown", () => {
    const map = byKind(buildSourceLinks({ ...AGURIN, region: SCOUT_REGION_UNKNOWN }))

    for (const kind of ["opgg", "leagueofgraphs", "deeplol"] as const) {
      expect(map.get(kind)?.status).toBe("manual_required")
      expect(map.get(kind)?.noteCode).toBe("region_unknown")
      expect(map.get(kind)?.url).toBe(getScoutSourceDescriptor(kind).homeUrl)
    }
    // DPM.LOL addresses players without a region, so it stays usable.
    expect(map.get("dpm")?.status).toBe("source_link_only")
  })

  it("falls back to manual_required when the tagline is unknown", () => {
    const map = byKind(buildSourceLinks({ ...AGURIN, tagline: "" }))

    for (const kind of SCOUT_SOURCE_KINDS) {
      expect(map.get(kind)?.status).toBe("manual_required")
      expect(map.get(kind)?.noteCode).toBe("tagline_unknown")
    }
  })

  it("stays safe for empty and broken identities", () => {
    const empty = buildSourceLinks({ riotName: "", tagline: "", region: "" })
    expect(empty).toHaveLength(SCOUT_SOURCE_KINDS.length)
    for (const ref of empty) {
      expect(ref.status).toBe("manual_required")
      expect(ref.noteCode).toBe("identity_incomplete")
      expect(ref.url.startsWith("https://")).toBe(true)
    }

    const broken = { riotName: null, tagline: undefined, region: 42 } as unknown as ScoutPlayerIdentity
    expect(() => buildSourceLinks(broken)).not.toThrow()
    for (const ref of buildSourceLinks(broken)) {
      expect(ref.status).toBe("manual_required")
    }
  })

  it("produces links that are recognised again by detectSourceKind", () => {
    for (const ref of buildSourceLinks(AGURIN)) {
      expect(detectSourceKind(ref.url)).toBe(ref.kind)
    }
  })
})

describe("buildProfileUrl", () => {
  it("mirrors the descriptor for every kind", () => {
    for (const kind of SCOUT_SOURCE_KINDS) {
      expect(buildProfileUrl(kind, AGURIN)).toBe(getScoutSourceDescriptor(kind).buildProfileUrl(AGURIN))
    }
  })

  it("returns null instead of a fabricated link when data is missing", () => {
    expect(buildProfileUrl("opgg", { ...AGURIN, region: SCOUT_REGION_UNKNOWN })).toBeNull()
    expect(buildProfileUrl("dpm", { ...AGURIN, tagline: "" })).toBeNull()
    expect(buildProfileUrl("opgg", null as unknown as ScoutPlayerIdentity)).toBeNull()
  })
})

describe("buildOpggMultiLink", () => {
  it("builds one multisearch link for a roster", () => {
    const link = buildOpggMultiLink([
      AGURIN,
      { riotName: "Nemesis", tagline: "EUW", region: "EUW" },
      { riotName: "Hide on bush", tagline: "KR1", region: "KR" },
    ])

    expect(link).toBe(
      "https://op.gg/lol/multisearch/euw?summoners=Agurin%23EUW,Nemesis%23EUW,Hide%20on%20bush%23KR1",
    )
  })

  it("returns null when no region or no usable identity is available", () => {
    expect(buildOpggMultiLink([])).toBeNull()
    expect(buildOpggMultiLink([{ ...AGURIN, region: SCOUT_REGION_UNKNOWN }])).toBeNull()
    expect(buildOpggMultiLink([{ ...AGURIN, tagline: "" }])).toBeNull()
    expect(buildOpggMultiLink(null as unknown as ScoutPlayerIdentity[])).toBeNull()
  })
})

describe("descriptors and adapters", () => {
  it("covers exactly the four known kinds, in a stable order", () => {
    expect(SCOUT_SOURCE_DESCRIPTORS.map((descriptor) => descriptor.kind)).toEqual(SCOUT_SOURCE_KINDS)
    expect(SCOUT_SOURCE_KINDS).toEqual(["opgg", "leagueofgraphs", "deeplol", "dpm"])
  })

  it("exposes a link-building adapter per kind", () => {
    for (const kind of SCOUT_SOURCE_KINDS) {
      const adapter = getScoutSourceAdapter(kind)
      expect(adapter.kind).toBe(kind)
      expect(adapter.descriptor.kind).toBe(kind)
      expect(adapter.buildProfileUrl(AGURIN)).toBe(buildProfileUrl(kind, AGURIN))
    }
    expect(Object.keys(SCOUT_SOURCE_ADAPTERS).sort()).toEqual([...SCOUT_SOURCE_KINDS].sort())
  })

  it("implements no fetchSnapshot anywhere — nothing is scraped", () => {
    for (const kind of SCOUT_SOURCE_KINDS) {
      expect(getScoutSourceAdapter(kind).fetchSnapshot).toBeUndefined()
      expect(canFetchInBrowser(kind)).toBe(false)
    }
  })

  it("states a machine-readable reason per provider for not fetching", () => {
    for (const kind of SCOUT_SOURCE_KINDS) {
      const info = getDirectFetchInfo(kind)
      expect(info).toBe(SCOUT_DIRECT_FETCH_INFO[kind])
      expect(info.kind).toBe(kind)
      expect(info.supportedInBrowser).toBe(false)
      expect(info.status).toBe("not_supported_in_browser")
      expect(typeof info.reason).toBe("string")
      expect(typeof info.publicApi).toBe("string")
    }
  })

  it("records DeepLoL's undocumented cross-origin endpoint honestly, without using it", () => {
    const info = getDirectFetchInfo("deeplol")
    expect(info.publicApi).toBe("undocumented_cors_ok")
    expect(info.reason).toBe("undocumented_private_api")
    expect(info.supportedInBrowser).toBe(false)
  })

  it("builds a not_supported ref that still links somewhere real", () => {
    const ref = buildNotSupportedRef("opgg", AGURIN)
    expect(ref.status).toBe("not_supported_in_browser")
    expect(ref.noteCode).toBe("direct_fetch_not_supported")
    expect(ref.url).toBe("https://op.gg/lol/summoners/euw/Agurin-EUW")

    const fallback = buildNotSupportedRef("opgg", { ...AGURIN, region: SCOUT_REGION_UNKNOWN })
    expect(fallback.url).toBe(getScoutSourceDescriptor("opgg").homeUrl)
  })

  it("flags how well each URL shape is backed by evidence", () => {
    for (const descriptor of SCOUT_SOURCE_DESCRIPTORS) {
      expect(["verified", "heuristic"]).toContain(descriptor.urlFormatConfidence)
      expect(descriptor.homeUrl.startsWith("https://")).toBe(true)
      expect(descriptor.hosts.length).toBeGreaterThan(0)
    }
  })
})
