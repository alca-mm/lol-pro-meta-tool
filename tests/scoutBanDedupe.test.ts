import { describe, expect, it } from "vitest"

import { analyzeScout } from "../src/scout/analysis"
import {
  championIdentity,
  championLookupKey,
  resolveCatalogChampion,
} from "../src/scout/championIdentity"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS } from "../src/scout/types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutRole,
  ScoutSubstituteSlot,
} from "../src/scout/types"

/**
 * A champion can only be banned once, so the final ban plan must never offer
 * the same champion twice.
 *
 * The defect this file pins down was not a display glitch. `analyzeScout()`
 * grouped ban candidates by `trim().toLowerCase()` plus whitespace collapsing,
 * which KEEPS punctuation and never consulted the champion catalog. Two
 * spellings of one champion therefore became two candidates, and with them the
 * overlap was lost: `isOverlap` went false, `overlapBans` came back empty, the
 * overlap priority bonus and the `hits_multiple_players` reason were forfeited,
 * and both halves could land in a weaker ban phase than the merged candidate
 * earns. A champion two opponents both play was ranked as two weaker single
 * threats.
 *
 * Offline and deterministic: this module only does arithmetic on the objects
 * handed to it. No network, no clock, no file system.
 */

/* -------------------------------------------------------------------------
 * builders — the same shapes tests/scoutAnalysis.test.ts uses, so a drift in
 * the domain types fails here too.
 * ------------------------------------------------------------------------- */

function player(id: string, role: ScoutRole = "unknown"): ScoutPlayer {
  return {
    id,
    riotName: id,
    tagline: "EUW",
    region: "EUW",
    displayName: id + "#EUW",
    role,
    sources: [],
  }
}

function entry(
  championName: string,
  games: number,
  winrate: number,
  overrides: Partial<ManualChampionEntry> = {},
): ManualChampionEntry {
  return {
    championName,
    games,
    winrate,
    note: "",
    source: "manual",
    recency: "current",
    role: "unknown",
    ...overrides,
  }
}

function dataOf(
  ...pairs: readonly (readonly [string, readonly ManualChampionEntry[]])[]
): Record<ScoutPlayerId, ScoutPlayerData> {
  const result: Record<ScoutPlayerId, ScoutPlayerData> = {}
  for (const [id, entries] of pairs) {
    result[id] = { playerId: id, entries: [...entries] }
  }
  return result
}

function lineupOf(
  starters: Partial<Record<ScoutLineupSlot, ScoutPlayerId>> = {},
  substitutes: Partial<Record<ScoutSubstituteSlot, ScoutPlayerId>> = {},
): ScoutLineup {
  const starterSlots = {} as Record<ScoutLineupSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_LINEUP_SLOTS) starterSlots[slot] = starters[slot] ?? null

  const substituteSlots = {} as Record<ScoutSubstituteSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) substituteSlots[slot] = substitutes[slot] ?? null

  return { starters: starterSlots, substitutes: substituteSlots }
}

function names(candidates: readonly BanCandidate[]): string[] {
  return candidates.map((candidate) => candidate.championName)
}

function candidateFor(
  candidates: readonly BanCandidate[],
  championName: string,
): BanCandidate | undefined {
  return candidates.find((candidate) => candidate.championName === championName)
}

function codesOf(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code)
}

function signalFor(
  signals: readonly ChampionSignal[],
  championName: string,
): ChampionSignal | undefined {
  return signals.find((signal) => signal.championName === championName)
}

/* -------------------------------------------------------------------------
 * 1. champion identity
 * ------------------------------------------------------------------------- */

describe("championIdentity", () => {
  it("collapses every spelling of one champion onto one key", () => {
    const spellings = ["Kai'Sa", "KaiSa", "kaisa", "KAI SA", "  Kai'sa  "]
    const keys = new Set(spellings.map((name) => championIdentity(name).key))

    expect(keys.size, `keys: ${[...keys].join(", ")}`).toBe(1)
    // The one key must be the catalog's, not the first input's.
    expect([...keys][0]).toBe(championLookupKey("Kai'Sa"))
  })

  it("reports the catalog casing as the display name", () => {
    expect(championIdentity("kaisa").displayName).toBe("Kai'Sa")
    expect(championIdentity("LeeSin").displayName).toBe("Lee Sin")
    expect(championIdentity("nunu willump").displayName).toBe("Nunu & Willump")
    expect(championIdentity("kaisa").resolved).toBe(true)
  })

  it("keeps an unresolved name verbatim and never guesses a neighbour", () => {
    const identity = championIdentity("Ahrii")

    expect(identity.resolved).toBe(false)
    expect(identity.displayName).toBe("Ahrii")
    // The guard that matters: no fuzzy match onto the real champion.
    expect(identity.key).not.toBe(championLookupKey("Ahri"))
  })

  it("still merges punctuation variants of an unresolved name", () => {
    // Strictly better than the whitespace-only key it replaced.
    expect(championIdentity("Some-Champ").key).toBe(championIdentity("SomeChamp").key)
  })

  it("treats an empty name as no champion instead of inventing one", () => {
    for (const raw of ["", "   ", "\t"]) {
      expect(championIdentity(raw).key, JSON.stringify(raw)).toBe("")
      expect(championIdentity(raw).displayName).toBe("")
    }
  })

  it("never hands out an empty key for a name that has characters", () => {
    // `championLookupKey` strips everything outside a-z0-9, so these all
    // normalise to "" on their own. An empty string is a valid Map key, so
    // every one of them compared equal to every other.
    for (const name of ["아리", "야스오", "제드", "Ａｈｒｉ", "---", "???", "…"]) {
      expect(championIdentity(name).key, JSON.stringify(name)).not.toBe("")
    }
  })

  it("gives distinct non-Latin names distinct keys", () => {
    const names = ["아리", "야스오", "제드", "Ａｈｒｉ", "---", "???"]
    const keys = names.map((name) => championIdentity(name).key)

    expect(new Set(keys).size, `keys: ${keys.join(" | ")}`).toBe(names.length)
  })

  it("still folds case and whitespace for a non-Latin name", () => {
    // The fallback must be a NORMALISED key, not the raw string, or the same
    // champion typed with stray spaces would split again.
    expect(championIdentity("  아리  ").key).toBe(championIdentity("아리").key)
    expect(championIdentity("Ａｈｒｉ").key).toBe(championIdentity("ａｈｒｉ").key)
  })

  it("resolves through the same path the stats import uses", () => {
    // One normaliser, one catalog. Two slightly different ones is how K'Sante
    // resolves in one place and not in the other.
    expect(resolveCatalogChampion("ksante").name).toBe("K'Sante")
    expect(championIdentity("ksante").displayName).toBe(resolveCatalogChampion("ksante").name)
  })
})

/* -------------------------------------------------------------------------
 * 2. the ban plan holds each champion once
 * ------------------------------------------------------------------------- */

describe("analyzeScout — a champion appears at most once in the ban plan", () => {
  const players = [player("p1", "mid"), player("p2", "top")]

  it("merges two spellings of one champion into a single candidate", () => {
    const result = analyzeScout(players, dataOf(["p1", [entry("Kai'Sa", 30, 68)]], ["p2", [entry("KaiSa", 24, 64)]]))

    const bans = result.banPlan.prioritizedBans
    expect(names(bans)).toEqual(["Kai'Sa"])
    expect(bans).toHaveLength(1)

    const candidate = bans[0]
    expect(candidate.affectedPlayerIds).toEqual(["p1", "p2"])
    expect(candidate.isOverlap).toBe(true)
    expect(codesOf(candidate.reasons)).toContain("hits_multiple_players")
    expect(names(result.banPlan.overlapBans)).toEqual(["Kai'Sa"])
  })

  it("merges the space variant too (Lee Sin / LeeSin)", () => {
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("Lee Sin", 30, 66)]], ["p2", [entry("LeeSin", 22, 62)]]),
    )

    expect(names(result.banPlan.prioritizedBans)).toEqual(["Lee Sin"])
    expect(result.banPlan.prioritizedBans[0]?.isOverlap).toBe(true)
  })

  it("carries the merged candidate's params, not a stale copy", () => {
    // `dedupeReasons` keys on the reason CODE alone and drops the loser's
    // params, so a merge that concatenated instead of recomputing would ship
    // `hits_multiple_players` with the wrong count.
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("Kai'Sa", 30, 68)]], ["p2", [entry("kaisa", 24, 64)]]),
    )

    const reason = result.banPlan.prioritizedBans[0]?.reasons.find(
      (item) => item.code === "hits_multiple_players",
    )
    expect(reason?.params).toEqual({ count: 2 })
  })

  it("holds every champion at most once across the whole plan", () => {
    const result = analyzeScout(
      [player("p1", "mid"), player("p2", "top"), player("p3", "jungle")],
      dataOf(
        ["p1", [entry("Kai'Sa", 30, 68), entry("Ahri", 20, 60)]],
        ["p2", [entry("KaiSa", 24, 64), entry("Lee Sin", 18, 58)]],
        ["p3", [entry("kaisa", 12, 70), entry("LeeSin", 22, 61)]],
      ),
    )

    for (const [label, list] of [
      ["prioritizedBans", result.banPlan.prioritizedBans],
      ["overlapBans", result.banPlan.overlapBans],
      ["phases.safe", result.banPlan.phases?.safe ?? []],
      ["phases.target", result.banPlan.phases?.target ?? []],
      ["phases.situational", result.banPlan.phases?.situational ?? []],
    ] as const) {
      const champions = names(list)
      expect(new Set(champions).size, `${label}: ${champions.join(", ")}`).toBe(champions.length)
    }

    // And the merge really happened rather than one spelling being dropped.
    expect(candidateFor(result.banPlan.prioritizedBans, "Kai'Sa")?.affectedPlayerIds).toEqual([
      "p1",
      "p2",
      "p3",
    ])
  })

  it("deduplicates the per-player target lists as well", () => {
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("Kai'Sa", 30, 68), entry("kaisa", 10, 70)]], ["p2", [entry("KaiSa", 24, 64)]]),
    )

    // Anchor first: iterating an empty map asserts nothing, and this test
    // passed on an empty ban plan before.
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Kai'Sa"])
    expect(Object.keys(result.banPlan.targetBansByPlayer).length).toBeGreaterThan(0)

    for (const [playerId, list] of Object.entries(result.banPlan.targetBansByPlayer)) {
      const champions = names(list)
      expect(new Set(champions).size, `${playerId}: ${champions.join(", ")}`).toBe(champions.length)
    }
  })

  it("does not disturb champions that were never duplicated", () => {
    const data = dataOf(["p1", [entry("Ahri", 30, 68)]], ["p2", [entry("Zed", 24, 62)]])
    const result = analyzeScout(players, data)

    expect(names(result.banPlan.prioritizedBans)).toEqual(["Ahri", "Zed"])
    expect(result.banPlan.prioritizedBans[0]?.isOverlap).toBe(false)
  })

  it("stays independent of player input order", () => {
    const forward = analyzeScout(
      players,
      dataOf(["p1", [entry("Kai'Sa", 30, 68)]], ["p2", [entry("KaiSa", 24, 64)]]),
    )
    const reversed = analyzeScout(
      [...players].reverse(),
      dataOf(["p2", [entry("KaiSa", 24, 64)]], ["p1", [entry("Kai'Sa", 30, 68)]]),
    )

    // Anchor first: `undefined === undefined` compared equal on an empty plan,
    // so the determinism claim held vacuously.
    expect(names(forward.banPlan.prioritizedBans)).toEqual(["Kai'Sa"])
    expect(names(forward.banPlan.prioritizedBans)).toEqual(names(reversed.banPlan.prioritizedBans))
    expect(forward.banPlan.prioritizedBans[0]?.priority).toBeGreaterThan(0)
    expect(forward.banPlan.prioritizedBans[0]?.priority).toBe(
      reversed.banPlan.prioritizedBans[0]?.priority,
    )
  })

  it("keeps one phase per candidate after the merge", () => {
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("Kai'Sa", 30, 68)]], ["p2", [entry("KaiSa", 24, 64)]]),
      { lineup: lineupOf({ mid: "p1", top: "p2" }) },
    )

    const phases = result.banPlan.phases
    const total =
      (phases?.safe.length ?? 0) + (phases?.target.length ?? 0) + (phases?.situational.length ?? 0)
    // Anchor first: `0 === 0` held on an empty plan.
    expect(result.banPlan.prioritizedBans).toHaveLength(1)
    expect(total).toBe(result.banPlan.prioritizedBans.length)
  })

  it("keeps champions apart whose names carry no a-z0-9 at all", () => {
    // REGRESSION, found in review. `championLookupKey` strips every character
    // outside a-z0-9, so a name written in a non-Latin script, in fullwidth
    // Latin (a common CJK paste artefact) or in pure punctuation normalised to
    // the EMPTY STRING — a perfectly valid Map key. All of them therefore
    // collapsed into ONE candidate: one player's two champions had their games
    // summed, a second player's unrelated champion was folded in, and the plan
    // reported an overlap that does not exist.
    const result = analyzeScout(
      players,
      dataOf(
        ["p1", [entry("아리", 30, 68), entry("야스오", 12, 70)]],
        ["p2", [entry("제드", 24, 64)]],
      ),
    )

    expect(result.banPlan.prioritizedBans).toHaveLength(3)
    expect([...names(result.banPlan.prioritizedBans)].sort()).toEqual(
      ["아리", "야스오", "제드"].sort(),
    )
    // The games must NOT be summed across two different champions.
    expect(candidateFor(result.banPlan.prioritizedBans, "아리")?.affectedPlayerIds).toEqual(["p1"])
    expect(candidateFor(result.banPlan.prioritizedBans, "제드")?.affectedPlayerIds).toEqual(["p2"])
    // And no invented overlap.
    expect(result.banPlan.overlapBans).toEqual([])
    expect(signalFor(result.players[0].signals, "아리")?.games).toBe(30)
    expect(signalFor(result.players[0].signals, "야스오")?.games).toBe(12)
  })

  it("keeps punctuation-only and fullwidth names apart too", () => {
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("---", 30, 68), entry("Ａｈｒｉ", 20, 60)]], ["p2", [entry("???", 24, 64)]]),
    )

    expect(result.banPlan.prioritizedBans).toHaveLength(3)
    expect(result.banPlan.overlapBans).toEqual([])
  })

  it("still merges the ASCII spellings the stripping exists for", () => {
    // Guard against "fixing" the above by dropping the punctuation-insensitive
    // key altogether, which would bring the duplicate bans straight back.
    const result = analyzeScout(
      players,
      dataOf(["p1", [entry("Kai'Sa", 30, 68)]], ["p2", [entry("KaiSa", 24, 64)]]),
    )
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Kai'Sa"])
  })

  it("names the same target player regardless of roster order", () => {
    // REGRESSION, found in review. After the merge every signal of a candidate
    // carries the SAME champion name, so `compareSignals`, which ended on that
    // name, was no longer decisive and fell through to input order. With no
    // lineup `targetPlayerId` is `signals[0].playerId`, so simply listing the
    // roster differently renamed the player the ban plan and the export point
    // at. Identical scores on purpose: that is what forces the tie.
    const entries = (name: string) => [entry(name, 30, 68)]
    const forward = analyzeScout(
      [player("p1", "mid"), player("p2", "top"), player("p3", "jungle")],
      dataOf(["p1", entries("Kai'Sa")], ["p2", entries("KaiSa")], ["p3", entries("kaisa")]),
    )
    const reversed = analyzeScout(
      [player("p3", "jungle"), player("p2", "top"), player("p1", "mid")],
      dataOf(["p3", entries("kaisa")], ["p2", entries("KaiSa")], ["p1", entries("Kai'Sa")]),
    )

    expect(forward.banPlan.prioritizedBans[0]?.affectedPlayerIds).toEqual(
      reversed.banPlan.prioritizedBans[0]?.affectedPlayerIds,
    )
    expect(forward.banPlan.prioritizedBans[0]?.targetPlayerId).toBe(
      reversed.banPlan.prioritizedBans[0]?.targetPlayerId,
    )
  })

  it("merges the per-player signal rows for one champion too", () => {
    const result = analyzeScout([player("p1", "mid")], dataOf(["p1", [entry("Kai'Sa", 30, 68), entry("kaisa", 12, 50)]]))

    const signals = result.players[0].signals.filter((signal) => signal.championName === "Kai'Sa")
    expect(signals).toHaveLength(1)
    // 30 + 12, so nothing was thrown away by the merge.
    expect(signals[0]?.games).toBe(42)
  })
})
