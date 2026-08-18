import { describe, expect, it } from "vitest"

import { buildScoutPlayerId, normalizeScoutRole, parseScoutInput } from "../src/scout/linkParser"
import { SCOUT_REGION_UNKNOWN } from "../src/scout/sources"
import type { ScoutPlayer } from "../src/scout/types"

// Every test in this file is offline and deterministic: parseScoutInput is a
// pure function (no fetch, no DOM, no Date), so the same string always yields
// the same players and the same ids.

const findPlayer = (players: ScoutPlayer[], displayName: string): ScoutPlayer | undefined =>
  players.find((player) => player.displayName === displayName)

describe("parseScoutInput — OP.GG multi links", () => {
  it("reads every summoner out of a multisearch link", () => {
    const result = parseScoutInput(
      "https://www.op.gg/multisearch/euw?summoners=Agurin%23EUW,Nemesis%23EUW,Caps%23G2",
    )

    expect(result.unparsedLines).toEqual([])
    expect(result.duplicatesMerged).toBe(0)
    expect(result.players.map((player) => player.displayName)).toEqual([
      "Agurin#EUW",
      "Nemesis#EUW",
      "Caps#G2",
    ])
    for (const player of result.players) {
      expect(player.region).toBe("EUW")
      expect(player.role).toBe("unknown")
    }
  })

  it("keeps the multisearch link as a parsed_from_url source on every player", () => {
    const url = "https://op.gg/lol/multisearch/euw?summoners=Agurin%23EUW,Nemesis%23EUW"
    const result = parseScoutInput(url)

    for (const player of result.players) {
      const opgg = player.sources.find((source) => source.kind === "opgg")
      expect(opgg?.status).toBe("parsed_from_url")
      expect(opgg?.url).toBe(url)
      expect(opgg?.noteCode).toBe("identity_from_url")
    }
  })

  it("decodes + as a space in the multisearch query", () => {
    const result = parseScoutInput("https://op.gg/lol/multisearch/kr?summoners=Hide+on+bush%23KR1")

    expect(result.players).toHaveLength(1)
    expect(result.players[0].riotName).toBe("Hide on bush")
    expect(result.players[0].tagline).toBe("KR1")
    expect(result.players[0].region).toBe("KR")
  })

  it("reports a multisearch link without summoners instead of dropping it", () => {
    const result = parseScoutInput("https://www.op.gg/multisearch/euw?summoners=")

    expect(result.players).toEqual([])
    expect(result.unparsedLines).toEqual([
      { raw: "https://www.op.gg/multisearch/euw?summoners=", reason: "empty_multilink" },
    ])
  })

  it("still understands the dead legacy /multi/query= shape", () => {
    const result = parseScoutInput("https://euw.op.gg/multi/query=Agurin,Nemesis")

    expect(result.players.map((player) => player.riotName)).toEqual(["Agurin", "Nemesis"])
    expect(result.players[0].region).toBe("EUW")
    // Legacy links carry no tagline — it must stay empty, not be invented.
    expect(result.players[0].tagline).toBe("")
    expect(result.players[0].displayName).toBe("Agurin")
  })
})

describe("parseScoutInput — single profile links", () => {
  it("reads the current OP.GG profile shape", () => {
    const result = parseScoutInput("https://www.op.gg/summoners/euw/Agurin-EUW")

    expect(result.unparsedLines).toEqual([])
    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "Agurin",
      tagline: "EUW",
      region: "EUW",
      displayName: "Agurin#EUW",
    })
  })

  it("reads the canonical OP.GG /lol/summoners shape", () => {
    const result = parseScoutInput("https://op.gg/lol/summoners/na/Doublelift-NA1")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "Doublelift",
      tagline: "NA1",
      region: "NA",
    })
  })

  it("reads the legacy OP.GG userName shape and takes the region from the subdomain", () => {
    const result = parseScoutInput("https://euw.op.gg/summoner/userName=Agurin")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "Agurin",
      tagline: "",
      region: "EUW",
    })
  })

  it("reads a League of Graphs profile, including a sub-section path", () => {
    const result = parseScoutInput(
      [
        "https://www.leagueofgraphs.com/summoner/euw/Agurin-EUW",
        "https://www.leagueofgraphs.com/summoner/champions/kr/Faker-T1",
      ].join("\n"),
    )

    expect(result.unparsedLines).toEqual([])
    expect(result.players).toHaveLength(2)
    expect(result.players[0]).toMatchObject({ riotName: "Agurin", tagline: "EUW", region: "EUW" })
    expect(result.players[1]).toMatchObject({ riotName: "Faker", tagline: "T1", region: "KR" })
    expect(
      result.players[0].sources.find((source) => source.kind === "leagueofgraphs")?.status,
    ).toBe("parsed_from_url")
  })

  it("reads a DeepLoL profile and normalises the upper-case region", () => {
    const result = parseScoutInput("https://www.deeplol.gg/summoner/EUW/Agurin-EUW")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({ riotName: "Agurin", tagline: "EUW", region: "EUW" })
    expect(result.players[0].sources.find((source) => source.kind === "deeplol")?.status).toBe(
      "parsed_from_url",
    )
  })

  it("reads a DPM.LOL profile, which carries no region", () => {
    const result = parseScoutInput("https://dpm.lol/NAgurin-EU1")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "NAgurin",
      tagline: "EU1",
      region: SCOUT_REGION_UNKNOWN,
    })
    expect(result.players[0].sources.find((source) => source.kind === "dpm")?.status).toBe(
      "parsed_from_url",
    )
  })

  it("reads a DPM.LOL sub-page link", () => {
    const result = parseScoutInput("https://dpm.lol/NAgurin-EU1/lens")

    expect(result.players).toHaveLength(1)
    expect(result.players[0].displayName).toBe("NAgurin#EU1")
  })

  it("accepts a link without a scheme", () => {
    const result = parseScoutInput("op.gg/lol/summoners/euw/Agurin-EUW")

    expect(result.players).toHaveLength(1)
    expect(result.players[0].displayName).toBe("Agurin#EUW")
  })

  it("decodes %20 in a profile path and keeps hyphenated names intact", () => {
    const result = parseScoutInput(
      [
        "https://www.op.gg/summoners/kr/Hide%20on%20bush-KR1",
        "https://www.op.gg/summoners/euw/Big-Boss-EUW",
      ].join("\n"),
    )

    expect(result.players[0]).toMatchObject({ riotName: "Hide on bush", tagline: "KR1" })
    expect(result.players[1]).toMatchObject({ riotName: "Big-Boss", tagline: "EUW" })
  })
})

describe("parseScoutInput — free text", () => {
  it("reads a bare Riot ID without a region", () => {
    const result = parseScoutInput("Agurin#EUW")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "Agurin",
      tagline: "EUW",
      region: SCOUT_REGION_UNKNOWN,
      role: "unknown",
    })
  })

  it("reads `REGION name#tag role`", () => {
    const result = parseScoutInput("EUW player#tag top")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "player",
      tagline: "tag",
      region: "EUW",
      role: "top",
    })
  })

  it("reads slash separated input", () => {
    const result = parseScoutInput("euw / playername#tag / jungle")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "playername",
      tagline: "tag",
      region: "EUW",
      role: "jungle",
    })
  })

  it("reads several comma separated Riot IDs from one line", () => {
    const result = parseScoutInput("Agurin#EUW, Nemesis#EUW ; Caps#G2")

    expect(result.players.map((player) => player.displayName)).toEqual([
      "Agurin#EUW",
      "Nemesis#EUW",
      "Caps#G2",
    ])
  })

  it("keeps spaces inside a Riot name", () => {
    const result = parseScoutInput("KR Hide on bush#KR1 mid")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({
      riotName: "Hide on bush",
      tagline: "KR1",
      region: "KR",
      role: "mid",
    })
  })

  it("normalises region spellings", () => {
    const result = parseScoutInput(
      ["EUW1 a#t1", "euw b#t2", "na1 c#t3", "KR d#t4", "eun1 e#t5"].join("\n"),
    )

    expect(result.players.map((player) => player.region)).toEqual(["EUW", "EUW", "NA", "KR", "EUNE"])
  })

  it("normalises role spellings", () => {
    const result = parseScoutInput(
      ["a#t1 jgl", "b#t2 adc", "c#t3 supp", "d#t4 (Toplane)", "e#t5 middle"].join("\n"),
    )

    expect(result.players.map((player) => player.role)).toEqual([
      "jungle",
      "bot",
      "support",
      "top",
      "mid",
    ])
  })

  it("strips list numbering and surrounding punctuation", () => {
    const result = parseScoutInput("1. EUW Agurin#EUW, top")

    expect(result.players).toHaveLength(1)
    expect(result.players[0]).toMatchObject({ riotName: "Agurin", tagline: "EUW", role: "top" })
  })

  it("takes a role hint standing next to a link", () => {
    const result = parseScoutInput("https://www.op.gg/summoners/euw/Agurin-EUW top")

    expect(result.players).toHaveLength(1)
    expect(result.players[0].role).toBe("top")
  })
})

describe("parseScoutInput — dedupe", () => {
  it("merges the same player from a link and from free text", () => {
    const result = parseScoutInput(
      ["https://www.op.gg/summoners/euw/Agurin-EUW", "EUW Agurin#EUW top"].join("\n"),
    )

    expect(result.players).toHaveLength(1)
    expect(result.duplicatesMerged).toBe(1)
    // The role from the free-text line fills the gap the link left open.
    expect(result.players[0].role).toBe("top")
  })

  it("merges a region-less entry into the same player and keeps the known region", () => {
    const result = parseScoutInput(["Agurin#EUW", "EUW / Agurin#EUW / jungle"].join("\n"))

    expect(result.players).toHaveLength(1)
    expect(result.duplicatesMerged).toBe(1)
    expect(result.players[0].region).toBe("EUW")
    expect(result.players[0].role).toBe("jungle")
    expect(result.players[0].id).toBe("euw:agurin#euw")
  })

  it("counts every merge", () => {
    const result = parseScoutInput(["EUW Agurin#EUW", "EUW Agurin#EUW", "euw agurin#euw"].join("\n"))

    expect(result.players).toHaveLength(1)
    expect(result.duplicatesMerged).toBe(2)
  })

  it("does not merge the same name on two different known regions", () => {
    const result = parseScoutInput(["EUW Agurin#EUW", "NA Agurin#EUW"].join("\n"))

    expect(result.players).toHaveLength(2)
    expect(result.duplicatesMerged).toBe(0)
  })

  it("collects every source link of a merged player exactly once per kind", () => {
    const result = parseScoutInput(
      [
        "https://www.op.gg/summoners/euw/Agurin-EUW",
        "https://www.deeplol.gg/summoner/euw/Agurin-EUW",
      ].join("\n"),
    )

    expect(result.players).toHaveLength(1)
    const kinds = result.players[0].sources.map((source) => source.kind)
    expect(kinds).toEqual(["opgg", "leagueofgraphs", "deeplol", "dpm"])
    expect(result.players[0].sources.filter((s) => s.status === "parsed_from_url")).toHaveLength(2)
  })
})

describe("parseScoutInput — sources on every player", () => {
  it("adds a link for all four providers when the identity is complete", () => {
    const player = parseScoutInput("EUW Agurin#EUW").players[0]

    expect(player.sources.map((source) => source.kind)).toEqual([
      "opgg",
      "leagueofgraphs",
      "deeplol",
      "dpm",
    ])
    for (const source of player.sources) {
      expect(source.status).toBe("source_link_only")
      expect(source.url.startsWith("https://")).toBe(true)
    }
  })

  it("marks region-dependent providers as manual_required when the region is unknown", () => {
    const player = parseScoutInput("Agurin#EUW").players[0]
    const byKind = new Map(player.sources.map((source) => [source.kind, source]))

    expect(byKind.get("opgg")?.status).toBe("manual_required")
    expect(byKind.get("opgg")?.noteCode).toBe("region_unknown")
    expect(byKind.get("leagueofgraphs")?.status).toBe("manual_required")
    expect(byKind.get("deeplol")?.status).toBe("manual_required")
    // DPM.LOL needs no region, so it still gets a real profile link.
    expect(byKind.get("dpm")?.status).toBe("source_link_only")
  })

  it("marks providers as manual_required when the tagline is unknown", () => {
    const player = parseScoutInput("https://euw.op.gg/summoner/userName=Agurin").players[0]
    const byKind = new Map(player.sources.map((source) => [source.kind, source]))

    expect(byKind.get("opgg")?.status).toBe("parsed_from_url")
    expect(byKind.get("dpm")?.status).toBe("manual_required")
    expect(byKind.get("dpm")?.noteCode).toBe("tagline_unknown")
  })
})

describe("parseScoutInput — unparsable input", () => {
  it("returns an empty result for empty input", () => {
    for (const input of ["", "   ", "\n\n\t\n"]) {
      expect(parseScoutInput(input)).toEqual({
        players: [],
        unparsedLines: [],
        duplicatesMerged: 0,
      })
    }
  })

  it("reports free text without a Riot ID", () => {
    const result = parseScoutInput("just some random text")

    expect(result.players).toEqual([])
    expect(result.unparsedLines).toEqual([{ raw: "just some random text", reason: "no_riot_id" }])
  })

  it("reports a Riot ID without a name or without a tagline", () => {
    const result = parseScoutInput(["#TAGONLY", "nameonly#"].join("\n"))

    expect(result.players).toEqual([])
    expect(result.unparsedLines.map((line) => line.reason)).toEqual([
      "invalid_riot_id",
      "invalid_riot_id",
    ])
  })

  it("reports a URL from an unknown host", () => {
    const result = parseScoutInput("https://example.com/summoner/euw/Agurin-EUW")

    expect(result.players).toEqual([])
    expect(result.unparsedLines).toEqual([
      { raw: "https://example.com/summoner/euw/Agurin-EUW", reason: "unknown_url_host" },
    ])
  })

  it("reports a known host with an unsupported path", () => {
    const result = parseScoutInput(
      ["https://www.op.gg/champions/ahri", "https://dpm.lol/pro/Oner", "https://op.gg"].join("\n"),
    )

    expect(result.players).toEqual([])
    expect(result.unparsedLines.map((line) => line.reason)).toEqual([
      "unsupported_url_shape",
      "unsupported_url_shape",
      "unsupported_url_shape",
    ])
  })

  it("reports a malformed URL", () => {
    const result = parseScoutInput("https://")

    expect(result.players).toEqual([])
    expect(result.unparsedLines).toEqual([{ raw: "https://", reason: "malformed_url" }])
  })

  it("never throws, whatever it is handed", () => {
    const inputs = ["!!!", "###", "%%%", "http://", "://", "a".repeat(5000), "\u0000"]
    for (const input of inputs) {
      expect(() => parseScoutInput(input)).not.toThrow()
    }
  })
})

describe("parseScoutInput — mixed input", () => {
  it("handles links, free text and junk in one blob", () => {
    const result = parseScoutInput(
      [
        "https://www.op.gg/multisearch/euw?summoners=Agurin%23EUW,Nemesis%23EUW",
        "",
        "EUW Caps#G2 mid",
        "https://www.leagueofgraphs.com/summoner/euw/Jankos-JK",
        "no riot id here",
        "https://example.org/whatever",
        "  euw / Wunder#TOP / top  ",
      ].join("\n"),
    )

    expect(result.players.map((player) => player.displayName)).toEqual([
      "Agurin#EUW",
      "Nemesis#EUW",
      "Caps#G2",
      "Jankos#JK",
      "Wunder#TOP",
    ])
    expect(result.unparsedLines.map((line) => line.reason)).toEqual([
      "no_riot_id",
      "unknown_url_host",
    ])
    expect(findPlayer(result.players, "Caps#G2")?.role).toBe("mid")
    expect(findPlayer(result.players, "Wunder#TOP")?.role).toBe("top")
  })

  it("is deterministic — parsing twice yields identical ids", () => {
    const input = [
      "https://www.op.gg/multisearch/euw?summoners=Agurin%23EUW,Nemesis%23EUW",
      "KR Hide on bush#KR1 mid",
    ].join("\n")

    const first = parseScoutInput(input)
    const second = parseScoutInput(input)

    expect(first).toEqual(second)
    expect(first.players.map((player) => player.id)).toEqual([
      "euw:agurin#euw",
      "euw:nemesis#euw",
      "kr:hide on bush#kr1",
    ])
  })
})

describe("buildScoutPlayerId", () => {
  it("is stable and case insensitive", () => {
    const a = buildScoutPlayerId({ riotName: "Agurin", tagline: "EUW", region: "EUW" })
    const b = buildScoutPlayerId({ riotName: "  AGURIN ", tagline: "euw", region: "euw1" })

    expect(a).toBe("euw:agurin#euw")
    expect(b).toBe(a)
  })

  it("separates different regions, names and taglines", () => {
    const base = { riotName: "Agurin", tagline: "EUW", region: "EUW" }
    expect(buildScoutPlayerId({ ...base, region: "NA" })).not.toBe(buildScoutPlayerId(base))
    expect(buildScoutPlayerId({ ...base, tagline: "EUW2" })).not.toBe(buildScoutPlayerId(base))
    expect(buildScoutPlayerId({ ...base, riotName: "Agurin2" })).not.toBe(buildScoutPlayerId(base))
  })

  it("collapses inner whitespace but keeps it as a separator", () => {
    expect(
      buildScoutPlayerId({ riotName: "Hide   on  bush", tagline: "KR1", region: "KR" }),
    ).toBe("kr:hide on bush#kr1")
  })

  it("marks an unknown region instead of guessing one", () => {
    expect(buildScoutPlayerId({ riotName: "Agurin", tagline: "EUW", region: "" })).toBe(
      "unknown:agurin#euw",
    )
  })
})

describe("normalizeScoutRole", () => {
  it("maps known spellings", () => {
    expect(normalizeScoutRole("TOP")).toBe("top")
    expect(normalizeScoutRole("jgl")).toBe("jungle")
    expect(normalizeScoutRole("(Mid)")).toBe("mid")
    expect(normalizeScoutRole("ad-carry")).toBe("bot")
    expect(normalizeScoutRole("supporter")).toBe("support")
  })

  it("returns unknown for anything else", () => {
    expect(normalizeScoutRole("")).toBe("unknown")
    expect(normalizeScoutRole("coach")).toBe("unknown")
    expect(normalizeScoutRole(null)).toBe("unknown")
    expect(normalizeScoutRole(undefined)).toBe("unknown")
  })
})
