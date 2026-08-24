import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import {
  SCOUT_KDA_MAX_PLAUSIBLE,
  analyzeScout,
  championStatStrengthMultiplier,
  createEmptyScoutAnalysis,
} from "../src/scout/analysis"
import type { ScoutAnalysisOptions } from "../src/scout/analysis"
import type { ChampionStats } from "../src/domain/types"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_SUBSTITUTE_SLOTS,
  SCOUT_SUBSTITUTE_WEIGHT,
} from "../src/scout/types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutAnalysisResult,
  ScoutConfidence,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutReasonCode,
  ScoutReasonParams,
  ScoutRole,
  ScoutSourceRef,
  ScoutSubstituteSlot,
  ScoutWarningCode,
} from "../src/scout/types"

/**
 * Offline and deterministic by construction: this module only does arithmetic
 * on the objects handed to it. Nothing here touches the network, the clock or
 * the file system — `analyzeScout` never reads a clock, and the only ISO stamp
 * in the result is the one a caller passes in explicitly.
 */

/* -------------------------------------------------------------------------
 * builders
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

/** A full `ChampionStats` row. `presence`/`winRate` are FRACTIONS 0–1 here. */
function metaStats(championName: string, presenceFraction: number, picks = 30): ChampionStats {
  return {
    championName,
    games: 100,
    picks,
    bans: 30,
    wins: Math.round(picks * 0.55),
    losses: picks - Math.round(picks * 0.55),
    pickRate: picks / 100,
    banRate: 0.3,
    presence: presenceFraction,
    winRate: 0.55,
    roleDistribution: { top: 0, jungle: 0, mid: 1, bot: 0, support: 0 },
    sampleSizeLabel: "sample_good",
    draftPriorityScore: 0.7,
  }
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

/** Builds a full `ScoutLineup`: every slot is present, unfilled ones are null. */
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

function codesOf(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code)
}

const CONFIDENCE_RANK: Record<ScoutConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 }

function confidenceRank(confidence: ScoutConfidence): number {
  return CONFIDENCE_RANK[confidence]
}

function signalFor(
  signals: readonly ChampionSignal[],
  championName: string,
): ChampionSignal | undefined {
  return signals.find((signal) => signal.championName === championName)
}

/* -------------------------------------------------------------------------
 * 1. clear signal
 * ------------------------------------------------------------------------- */

describe("analyzeScout — clear signal", () => {
  const players = [player("p1", "mid")]
  const data = dataOf([
    "p1",
    [
      entry("Ahri", 30, 68, { role: "mid", recency: "current" }),
      entry("Syndra", 12, 55, { role: "mid", recency: "current" }),
      entry("Orianna", 8, 52, { role: "mid", recency: "current" }),
    ],
  ])

  it("puts the strongest champion first with a high confidence", () => {
    const result = analyzeScout(players, data)
    const top = result.banPlan.prioritizedBans[0]

    expect(top.championName).toBe("Ahri")
    expect(top.confidence).toBe("high")
    expect(top.priority).toBeGreaterThan(0.7)
  })

  it("justifies the recommendation with reason codes", () => {
    const result = analyzeScout(players, data)
    const codes = result.banPlan.prioritizedBans[0].reasons.map((item) => item.code)

    expect(codes).toContain("high_winrate_many_games")
    expect(codes).toContain("played_recently")
    expect(codes.length).toBeGreaterThan(0)
  })

  it("never emits a candidate or signal without at least one reason", () => {
    const result = analyzeScout(players, data)

    for (const candidate of result.banPlan.prioritizedBans) {
      expect(candidate.reasons.length).toBeGreaterThan(0)
      for (const signal of candidate.signals) {
        expect(signal.reasons.length).toBeGreaterThan(0)
      }
    }
  })

  it("rates the player data quality as high and records the raw counts", () => {
    const result = analyzeScout(players, data)
    const quality = result.players[0].dataQuality

    expect(quality.entryCount).toBe(3)
    expect(quality.totalGames).toBe(50)
    expect(quality.hasCurrentData).toBe(true)
    expect(quality.confidence).toBe("high")
  })

  it("classifies a strong, well-supported ban as a safe ban", () => {
    const result = analyzeScout(players, data)
    const top = result.banPlan.prioritizedBans[0]

    expect(top.phase).toBe("safe")
    expect(names(result.banPlan.phases?.safe ?? [])).toContain("Ahri")
  })
})

/* -------------------------------------------------------------------------
 * 2. overlap
 * ------------------------------------------------------------------------- */

describe("analyzeScout — overlap", () => {
  const players = [player("p1", "jungle"), player("p2", "jungle"), player("p3", "mid")]
  const data = dataOf(
    ["p1", [entry("Nidalee", 12, 60, { role: "jungle" })]],
    ["p2", [entry("Nidalee", 12, 60, { role: "jungle" })]],
    ["p3", [entry("Ahri", 12, 60, { role: "mid" })]],
  )

  it("ranks a champion two opponents play above an equally strong single signal", () => {
    const result = analyzeScout(players, data)
    const ordered = names(result.banPlan.prioritizedBans)

    expect(ordered[0]).toBe("Nidalee")
    expect(ordered.indexOf("Nidalee")).toBeLessThan(ordered.indexOf("Ahri"))
  })

  it("marks the overlap and explains it", () => {
    const result = analyzeScout(players, data)
    const nidalee = candidateFor(result.banPlan.prioritizedBans, "Nidalee")

    expect(nidalee?.isOverlap).toBe(true)
    expect(nidalee?.affectedPlayerIds).toEqual(["p1", "p2"])
    expect(nidalee?.reasons.map((item) => item.code)).toContain("hits_multiple_players")
  })

  it("lists overlap bans separately and does not mark the single signal", () => {
    const result = analyzeScout(players, data)

    expect(names(result.banPlan.overlapBans)).toEqual(["Nidalee"])
    expect(candidateFor(result.banPlan.prioritizedBans, "Ahri")?.isOverlap).toBe(false)
  })

  it("offers the overlap ban to both affected players as a target ban", () => {
    const result = analyzeScout(players, data)

    expect(names(result.banPlan.targetBansByPlayer.p1)).toContain("Nidalee")
    expect(names(result.banPlan.targetBansByPlayer.p2)).toContain("Nidalee")
    expect(names(result.banPlan.targetBansByPlayer.p3)).not.toContain("Nidalee")
  })
})

/* -------------------------------------------------------------------------
 * 3. thin data
 * ------------------------------------------------------------------------- */

describe("analyzeScout — thin data", () => {
  const players = [player("p1", "top")]
  const data = dataOf(["p1", [entry("Zed", 3, 60, { role: "top" })]])

  it("lowers the confidence instead of presenting the pick as solid", () => {
    const result = analyzeScout(players, data)

    expect(result.confidence).toBe("low")
    expect(result.banPlan.prioritizedBans[0].confidence).toBe("low")
  })

  it("raises a small-sample warning", () => {
    const result = analyzeScout(players, data)
    const codes = result.warnings.map((item) => item.code)

    expect(codes).toContain("small_sample_overall")
    expect(result.banPlan.warnings.map((item) => item.code)).toContain("small_sample_overall")
  })

  it("does not give a thin signal an inflated priority or a safe phase", () => {
    const result = analyzeScout(players, data)
    const top = result.banPlan.prioritizedBans[0]

    expect(top.priority).toBeLessThan(0.6)
    expect(top.phase).toBe("situational")
    expect(top.reasons.map((item) => item.code)).toContain("small_sample")
  })
})

/* -------------------------------------------------------------------------
 * 4. high winrate on a tiny sample
 * ------------------------------------------------------------------------- */

describe("analyzeScout — high winrate, tiny sample", () => {
  const players = [player("p1", "mid"), player("p2", "mid")]
  const data = dataOf(
    ["p1", [entry("Yasuo", 2, 100, { role: "mid" })]],
    ["p2", [entry("Ahri", 30, 62, { role: "mid" })]],
  )

  it("does not let 100 % on two games reach the top of the ban list", () => {
    const result = analyzeScout(players, data)
    const ordered = names(result.banPlan.prioritizedBans)

    expect(ordered[0]).toBe("Ahri")
    expect(ordered.indexOf("Yasuo")).toBeGreaterThan(0)
  })

  it("flags the thin sample explicitly", () => {
    const result = analyzeScout(players, data)
    const yasuo = candidateFor(result.banPlan.prioritizedBans, "Yasuo")
    const codes = yasuo?.reasons.map((item) => item.code) ?? []

    expect(codes).toContain("high_winrate_small_sample")
    expect(codes).not.toContain("high_winrate_many_games")
  })

  it("keeps the damped score below the solid one", () => {
    const result = analyzeScout(players, data)
    const yasuo = candidateFor(result.banPlan.prioritizedBans, "Yasuo")
    const ahri = candidateFor(result.banPlan.prioritizedBans, "Ahri")

    expect(yasuo?.priority ?? 1).toBeLessThan(ahri?.priority ?? 0)
  })
})

/* -------------------------------------------------------------------------
 * 5. player without data
 * ------------------------------------------------------------------------- */

describe("analyzeScout — player without data", () => {
  const players = [player("p1", "mid"), player("p2", "support")]
  const data = dataOf(["p1", [entry("Ahri", 20, 60, { role: "mid" })]])

  it("warns instead of inventing a recommendation", () => {
    const result = analyzeScout(players, data)
    const warning = result.warnings.find((item) => item.code === "player_without_data")

    expect(warning).toBeDefined()
    expect(warning?.playerId).toBe("p2")
  })

  it("leaves the player empty and marked as `none`", () => {
    const result = analyzeScout(players, data)
    const p2 = result.players.find((item) => item.playerId === "p2")

    expect(p2?.signals).toEqual([])
    expect(p2?.targetBans).toEqual([])
    expect(p2?.weaknesses).toEqual([])
    expect(p2?.confidence).toBe("none")
    expect(p2?.dataQuality.notes.map((item) => item.code)).toContain("no_data")
  })

  it("never attributes a ban to the player without data", () => {
    const result = analyzeScout(players, data)

    for (const candidate of result.banPlan.prioritizedBans) {
      expect(candidate.affectedPlayerIds).not.toContain("p2")
    }
    expect(result.banPlan.targetBansByPlayer.p2).toEqual([])
  })
})

/* -------------------------------------------------------------------------
 * 6. empty input
 * ------------------------------------------------------------------------- */

describe("analyzeScout — empty input", () => {
  it("returns a well-formed empty result without throwing", () => {
    const result = analyzeScout([], {})

    expect(result.players).toEqual([])
    expect(result.banPlan.prioritizedBans).toEqual([])
    expect(result.banPlan.overlapBans).toEqual([])
    expect(result.banPlan.targetBansByPlayer).toEqual({})
    expect(result.banPlan.warnings).toEqual([])
    expect(result.banPlan.phases).toEqual({ safe: [], target: [], situational: [] })
    expect(result.warnings).toEqual([])
    expect(result.weaknesses).toEqual([])
    expect(result.confidence).toBe("none")
    expect(result.generatedAtIso).toBeUndefined()
  })

  it("treats players with an empty entry list the same way", () => {
    const result = analyzeScout([player("p1")], dataOf(["p1", []]))

    expect(result.confidence).toBe("none")
    expect(result.banPlan.prioritizedBans).toEqual([])
    expect(result.warnings.map((item) => item.code)).toEqual(["player_without_data"])
  })

  it("exposes the same shape through createEmptyScoutAnalysis()", () => {
    expect(createEmptyScoutAnalysis()).toEqual(analyzeScout([], {}))
  })
})

/* -------------------------------------------------------------------------
 * 7. recency weighting
 * ------------------------------------------------------------------------- */

describe("analyzeScout — recency weighting", () => {
  const players = [player("p1", "mid"), player("p2", "mid")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 60, { role: "mid", recency: "current" })]],
    ["p2", [entry("Zed", 20, 60, { role: "mid", recency: "old" })]],
  )

  it("ranks current data above identical old data", () => {
    const result = analyzeScout(players, data)
    const ordered = names(result.banPlan.prioritizedBans)

    expect(ordered).toEqual(["Ahri", "Zed"])
  })

  it("keeps the old data in the plan instead of discarding it", () => {
    const result = analyzeScout(players, data)
    const zed = candidateFor(result.banPlan.prioritizedBans, "Zed")

    expect(zed).toBeDefined()
    expect(zed?.priority ?? 0).toBeGreaterThan(0)
    expect(zed?.reasons.map((item) => item.code)).toContain("stale_data")
  })

  it("weights `recent` between `current` and `old`", () => {
    const threePlayers = [player("p1"), player("p2"), player("p3")]
    const threeData = dataOf(
      ["p1", [entry("Ahri", 20, 60, { recency: "current" })]],
      ["p2", [entry("Zed", 20, 60, { recency: "recent" })]],
      ["p3", [entry("Yone", 20, 60, { recency: "old" })]],
    )
    const result = analyzeScout(threePlayers, threeData)

    expect(names(result.banPlan.prioritizedBans)).toEqual(["Ahri", "Zed", "Yone"])
  })

  it("downgrades the confidence of an old-only signal by one step", () => {
    const result = analyzeScout(players, data)
    const ahri = candidateFor(result.banPlan.prioritizedBans, "Ahri")
    const zed = candidateFor(result.banPlan.prioritizedBans, "Zed")

    expect(ahri?.confidence).toBe("high")
    expect(zed?.confidence).toBe("medium")
  })
})

/* -------------------------------------------------------------------------
 * 8. conflicting entries
 * ------------------------------------------------------------------------- */

describe("analyzeScout — conflicting entries", () => {
  const players = [player("p1", "mid")]
  const data = dataOf([
    "p1",
    [
      entry("Ahri", 20, 75, { role: "mid" }),
      entry("Ahri", 15, 35, { role: "mid" }),
    ],
  ])

  it("warns about the contradiction and names the champion", () => {
    const result = analyzeScout(players, data)
    const warning = result.warnings.find((item) => item.code === "conflicting_entries")

    expect(warning).toBeDefined()
    expect(warning?.championName).toBe("Ahri")
    expect(warning?.playerId).toBe("p1")
  })

  it("pushes the confidence down instead of averaging the problem away", () => {
    const result = analyzeScout(players, data)

    // 35 games would otherwise be a `high` signal.
    expect(result.banPlan.prioritizedBans[0].confidence).toBe("medium")
    expect(result.players[0].dataQuality.confidence).toBe("low")
  })

  it("keeps the contradicting rows visible in the signal", () => {
    const result = analyzeScout(players, data)
    const signal = result.players[0].signals[0]

    expect(signal.games).toBe(35)
    expect(signal.winrate).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------
 * 9. weakness instead of ban
 * ------------------------------------------------------------------------- */

describe("analyzeScout — weakness instead of ban", () => {
  const players = [player("p1", "top")]
  const data = dataOf([
    "p1",
    [entry("Zed", 14, 35, { role: "top" }), entry("Ahri", 12, 62, { role: "mid" })],
  ])

  it("keeps many games at a bad winrate out of the ban list", () => {
    const result = analyzeScout(players, data)

    expect(names(result.banPlan.prioritizedBans)).toEqual(["Ahri"])
    expect(candidateFor(result.banPlan.prioritizedBans, "Zed")).toBeUndefined()
  })

  it("reports it as a weakness with the matching reason", () => {
    const result = analyzeScout(players, data)
    const weakness = result.players[0].weaknesses[0]

    expect(weakness.championName).toBe("Zed")
    expect(weakness.reasons.map((item) => item.code)).toContain("high_games_low_winrate")
    expect(names(result.banPlan.prioritizedBans)).not.toContain("Zed")
    expect(result.weaknesses.map((item) => item.championName)).toEqual(["Zed"])
  })

  it("keeps weaknesses out of the threat signal list", () => {
    const result = analyzeScout(players, data)

    expect(result.players[0].signals.map((item) => item.championName)).toEqual(["Ahri"])
  })
})

/* -------------------------------------------------------------------------
 * 10. flex picks
 * ------------------------------------------------------------------------- */

describe("analyzeScout — flex picks", () => {
  const players = [player("p1", "jungle")]
  const data = dataOf([
    "p1",
    [
      entry("Gragas", 10, 58, { role: "jungle" }),
      entry("Gragas", 8, 55, { role: "support" }),
    ],
  ])

  it("marks a champion played on two roles as flex", () => {
    const result = analyzeScout(players, data)
    const gragas = result.banPlan.prioritizedBans[0]

    expect(gragas.championName).toBe("Gragas")
    expect(gragas.isFlex).toBe(true)
    expect(gragas.roles).toEqual(["jungle", "support"])
    expect(gragas.reasons.map((item) => item.code)).toContain("flex_across_roles")
  })

  it("raises ONE counted flex warning and names the champion on the candidate", () => {
    const result = analyzeScout(players, data)
    const flexWarnings = result.warnings.filter((item) => item.code === "flex_pick_warning")

    // ONE warning for the session, not one per flex champion. This used to be
    // per candidate, which put the same sentence on screen 34 times in a real
    // five-player session while the sentence itself said "at least one
    // champion".
    expect(flexWarnings).toHaveLength(1)
    expect(flexWarnings[0]?.params).toEqual({ count: 1 })
    expect(result.banPlan.warnings.map((item) => item.code)).toContain("flex_pick_warning")

    // The champion is not lost, it is stated where it belongs: on the candidate.
    const gragas = candidateFor(result.banPlan.prioritizedBans, "Gragas")
    expect(gragas?.isFlex).toBe(true)
    expect(codesOf(gragas?.reasons ?? [])).toContain("flex_across_roles")
  })

  it("counts every flex champion in that single warning", () => {
    const many = [player("p1", "top"), player("p2", "mid")]
    const manyData = dataOf(
      [
        "p1",
        [
          entry("Gragas", 12, 60, { role: "top" }),
          entry("Gragas", 10, 58, { role: "jungle" }),
          entry("Sylas", 12, 60, { role: "top" }),
          entry("Sylas", 10, 58, { role: "mid" }),
        ],
      ],
      ["p2", [entry("Ahri", 20, 62, { role: "mid" })]],
    )
    const result = analyzeScout(many, manyData)
    const flexWarnings = result.warnings.filter((item) => item.code === "flex_pick_warning")

    // Two flex champions, still one warning, and the count says two. A test
    // that only ever saw one flex champion could not tell a count from a
    // hard-coded 1.
    expect(flexWarnings).toHaveLength(1)
    expect(flexWarnings[0]?.params).toEqual({ count: 2 })
  })

  it("detects flex across two different players as well", () => {
    const twoPlayers = [player("p1", "top"), player("p2", "mid")]
    const twoData = dataOf(
      ["p1", [entry("Sylas", 14, 58, { role: "top" })]],
      ["p2", [entry("Sylas", 14, 58, { role: "mid" })]],
    )
    const result = analyzeScout(twoPlayers, twoData)
    const sylas = result.banPlan.prioritizedBans[0]

    expect(sylas.isFlex).toBe(true)
    expect(sylas.isOverlap).toBe(true)
    expect(sylas.phase).toBe("safe")
  })
})

/* -------------------------------------------------------------------------
 * 11. determinism
 * ------------------------------------------------------------------------- */

describe("analyzeScout — determinism", () => {
  const players = [player("p1", "mid"), player("p2", "top")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 60, { role: "mid" }), entry("Zed", 5, 40, { role: "mid" })]],
    ["p2", [entry("Ahri", 8, 55, { role: "top" }), entry("Sett", 11, 61, { role: "top" })]],
  )

  it("returns a deeply equal result on repeated calls", () => {
    expect(analyzeScout(players, data)).toEqual(analyzeScout(players, data))
    expect(JSON.stringify(analyzeScout(players, data))).toBe(
      JSON.stringify(analyzeScout(players, data)),
    )
  })

  it("breaks score ties on the champion name, independent of input order", () => {
    const tiePlayers = [player("p1"), player("p2")]
    const forward = analyzeScout(
      tiePlayers,
      dataOf(
        ["p1", [entry("Zed", 20, 60)]],
        ["p2", [entry("Ahri", 20, 60)]],
      ),
    )
    const reversed = analyzeScout(
      [tiePlayers[1], tiePlayers[0]],
      dataOf(
        ["p2", [entry("Ahri", 20, 60)]],
        ["p1", [entry("Zed", 20, 60)]],
      ),
    )

    expect(names(forward.banPlan.prioritizedBans)).toEqual(["Ahri", "Zed"])
    expect(names(reversed.banPlan.prioritizedBans)).toEqual(["Ahri", "Zed"])
  })

  it("sorts the priority list monotonically", () => {
    const bans = analyzeScout(players, data).banPlan.prioritizedBans

    for (let index = 1; index < bans.length; index += 1) {
      expect(bans[index - 1].priority).toBeGreaterThanOrEqual(bans[index].priority)
    }
  })

  it("splits every candidate into exactly one phase", () => {
    const result = analyzeScout(players, data)
    const phases = result.banPlan.phases
    const total =
      (phases?.safe.length ?? 0) + (phases?.target.length ?? 0) + (phases?.situational.length ?? 0)

    expect(total).toBe(result.banPlan.prioritizedBans.length)
    for (const candidate of result.banPlan.prioritizedBans) {
      expect(["safe", "target", "situational"]).toContain(candidate.phase)
    }
  })

  it("never reads a clock — the timestamp only appears when passed in", () => {
    expect(analyzeScout(players, data).generatedAtIso).toBeUndefined()
    expect(
      analyzeScout(players, data, { generatedAtIso: "2026-01-01T00:00:00.000Z" }).generatedAtIso,
    ).toBe("2026-01-01T00:00:00.000Z")
  })
})

/* -------------------------------------------------------------------------
 * 12. optional pro meta
 * ------------------------------------------------------------------------- */

describe("analyzeScout — optional pro meta", () => {
  const players = [player("p1", "mid")]
  const data = dataOf(["p1", [entry("Ahri", 20, 60, { role: "mid" })]])
  const options: ScoutAnalysisOptions = { proMeta: [metaStats("Ahri", 0.6)] }

  it("works identically in structure with and without pro meta", () => {
    const without = analyzeScout(players, data)
    const withMeta = analyzeScout(players, data, options)

    expect(names(without.banPlan.prioritizedBans)).toEqual(["Ahri"])
    expect(names(withMeta.banPlan.prioritizedBans)).toEqual(["Ahri"])
  })

  it("adds meta_priority only when pro meta is supplied", () => {
    const without = analyzeScout(players, data)
    const withMeta = analyzeScout(players, data, options)

    expect(without.banPlan.prioritizedBans[0].reasons.map((item) => item.code)).not.toContain(
      "meta_priority",
    )
    expect(withMeta.banPlan.prioritizedBans[0].reasons.map((item) => item.code)).toContain(
      "meta_priority",
    )
    expect(withMeta.banPlan.prioritizedBans[0].priority).toBeGreaterThan(
      without.banPlan.prioritizedBans[0].priority,
    )
  })

  it("reports the meta presence as an explicit percent param", () => {
    const withMeta = analyzeScout(players, data, options)
    const metaReason = withMeta.banPlan.prioritizedBans[0].reasons.find(
      (item) => item.code === "meta_priority",
    )

    // 0.6 fraction in the meta engine must surface as 60 percent, never as 0.6.
    expect(metaReason?.params?.presencePercent).toBe(60)
  })

  it("never invents a candidate the scout data does not support", () => {
    const withForeignMeta = analyzeScout(players, data, {
      proMeta: [metaStats("Ahri", 0.6), metaStats("Kalista", 0.9)],
    })

    expect(names(withForeignMeta.banPlan.prioritizedBans)).toEqual(["Ahri"])
  })

  it("ignores pro meta below the presence and sample thresholds", () => {
    const weakMeta = analyzeScout(players, data, { proMeta: [metaStats("Ahri", 0.05)] })

    expect(weakMeta.banPlan.prioritizedBans[0].reasons.map((item) => item.code)).not.toContain(
      "meta_priority",
    )
    expect(weakMeta.banPlan.prioritizedBans[0].priority).toBe(
      analyzeScout(players, data).banPlan.prioritizedBans[0].priority,
    )
  })

  it("honours an explicitly raised champion", () => {
    const raised = analyzeScout(players, data, { priorityChampions: ["ahri"] })

    expect(raised.banPlan.prioritizedBans[0].reasons.map((item) => item.code)).toContain(
      "user_marked_priority",
    )
    expect(raised.banPlan.prioritizedBans[0].priority).toBeGreaterThan(
      analyzeScout(players, data).banPlan.prioritizedBans[0].priority,
    )
  })
})

/* -------------------------------------------------------------------------
 * 13. robustness
 * ------------------------------------------------------------------------- */

describe("analyzeScout — robustness", () => {
  const players = [player("p1", "mid")]
  const brokenData = dataOf([
    "p1",
    [
      entry("Ahri", -5, 150, { role: "mid" }),
      entry("Zed", Number.NaN, Number.NaN, { role: "mid" }),
      entry("   ", 20, 60, { role: "mid" }),
      entry("Yone", Number.POSITIVE_INFINITY, 60, { role: "mid" }),
      entry("Sett", 12, -20, { role: "mid" }),
    ],
  ])

  it("does not throw on unplausible input", () => {
    expect(() => analyzeScout(players, brokenData)).not.toThrow()
  })

  it("keeps every score and priority inside 0..1", () => {
    const result = analyzeScout(players, brokenData)

    for (const analysis of result.players) {
      for (const signal of [...analysis.signals, ...analysis.weaknesses]) {
        expect(signal.score).toBeGreaterThanOrEqual(0)
        expect(signal.score).toBeLessThanOrEqual(1)
        expect(Number.isFinite(signal.score)).toBe(true)
        expect(Number.isFinite(signal.games)).toBe(true)
        expect(signal.games).toBeGreaterThanOrEqual(0)
      }
    }
    for (const candidate of result.banPlan.prioritizedBans) {
      expect(candidate.priority).toBeGreaterThanOrEqual(0)
      expect(candidate.priority).toBeLessThanOrEqual(1)
    }
  })

  it("drops rows without a champion name", () => {
    const result = analyzeScout(players, brokenData)
    const allNames = result.players[0].signals.map((item) => item.championName)

    expect(allNames.every((name) => name.trim().length > 0)).toBe(true)
    expect(result.players[0].dataQuality.entryCount).toBe(4)
  })

  it("treats an out-of-range winrate as unknown rather than as a maximum threat", () => {
    const result = analyzeScout(players, brokenData)
    const ahri = result.players[0].signals.find((item) => item.championName === "Ahri")
    const sett = result.players[0].signals.find((item) => item.championName === "Sett")

    expect(ahri?.winrate).toBeNull()
    expect(sett?.winrate).toBeNull()
    expect(sett?.reasons.map((item) => item.code)).not.toContain("high_winrate_many_games")
  })

  it("gives a row without games a zero score and keeps it out of the ban list", () => {
    const result = analyzeScout(players, brokenData)
    const zed = result.players[0].signals.find((item) => item.championName === "Zed")

    expect(zed?.games).toBe(0)
    expect(zed?.score).toBe(0)
    expect(zed?.confidence).toBe("none")
    expect(names(result.banPlan.prioritizedBans)).not.toContain("Zed")
  })

  it("survives missing player data, missing entry arrays and unknown enum values", () => {
    const weird = {
      p1: { playerId: "p1", entries: undefined },
      p2: {
        playerId: "p2",
        entries: [entry("Ahri", 10, 60, { recency: "yesterday", role: "adc", source: "wiki" } as unknown as Partial<ManualChampionEntry>)],
      },
    } as unknown as Record<ScoutPlayerId, ScoutPlayerData>

    const result = analyzeScout([player("p1"), player("p2")], weird)
    const ahri = result.players[1].signals[0]

    expect(ahri.recency).toBe("old")
    expect(ahri.role).toBe("unknown")
    expect(ahri.sources).toEqual(["other"])
    expect(ahri.score).toBeGreaterThan(0)
  })

  it("merges duplicate player ids and says so", () => {
    const result = analyzeScout(
      [player("p1"), player("p1")],
      dataOf(["p1", [entry("Ahri", 20, 60)]]),
    )

    expect(result.players).toHaveLength(1)
    expect(result.warnings.map((item) => item.code)).toContain("duplicate_players_merged")
  })
})

/* -------------------------------------------------------------------------
 * cross-cutting: session-level warnings and unit safety
 * ------------------------------------------------------------------------- */

describe("analyzeScout — session warnings", () => {
  it("warns when nothing current was entered at all", () => {
    const result = analyzeScout(
      [player("p1")],
      dataOf(["p1", [entry("Ahri", 30, 60, { recency: "old" })]]),
    )
    const codes = result.warnings.map((item) => item.code)

    expect(codes).toContain("stale_data_overall")
    expect(codes).toContain("meta_shift_possible")
  })

  it("reports sources that cannot be fetched from the browser", () => {
    const withSource: ScoutPlayer = {
      ...player("p1"),
      sources: [
        {
          kind: "opgg",
          url: "https://www.op.gg/",
          status: "not_supported_in_browser",
        },
      ],
    }
    const result = analyzeScout([withSource], dataOf(["p1", [entry("Ahri", 20, 60)]]))

    expect(result.warnings.map((item) => item.code)).toContain("source_not_fetchable")
  })

  it("keeps scout percent and domain fraction apart", () => {
    const result = analyzeScout([player("p1")], dataOf(["p1", [entry("Ahri", 20, 68)]]))
    const signal = result.players[0].signals[0]

    // The signal keeps the percent the user typed …
    expect(signal.winrate).toBe(68)
    // … while the score stays a normalised 0–1 value.
    expect(signal.score).toBeGreaterThan(0)
    expect(signal.score).toBeLessThanOrEqual(1)
  })

  it("downgrades the session confidence when most players have no data", () => {
    const result = analyzeScout(
      [player("p1"), player("p2"), player("p3")],
      dataOf(["p1", [entry("Ahri", 30, 62), entry("Zed", 20, 58), entry("Sett", 15, 56)]]),
    )

    // p1 alone would be `high`; two of three players contribute nothing.
    expect(result.players[0].confidence).toBe("high")
    expect(result.confidence).toBe("medium")
  })
})

/* -------------------------------------------------------------------------
 * 14. role awareness — the Karma-on-a-jungler case
 *
 * THE test of this feature. A player stands in the lineup as jungle; the only
 * numbers anybody could find for him are Karma games recorded on MID. Turning
 * that into "ban Karma against their jungler" would be a lie assembled from
 * true numbers, so it must not happen.
 * ------------------------------------------------------------------------- */

describe("analyzeScout — offrole data (the Karma/jungle case)", () => {
  const karmaOnMid: ManualChampionEntry[] = [
    entry("Karma", 24, 68, { role: "mid", recency: "current" }),
  ]
  const players = [player("jgl", "jungle"), player("mid1", "mid")]
  const data = dataOf(
    ["jgl", karmaOnMid],
    ["mid1", [entry("Ahri", 24, 62, { role: "mid", recency: "current" })]],
  )
  const withLineup: ScoutAnalysisOptions = { lineup: lineupOf({ jungle: "jgl", mid: "mid1" }) }

  it("ranks Karma first WITHOUT a lineup — the behaviour the lineup has to fix", () => {
    const blind = analyzeScout(players, data)

    // 68 % on 24 games beats 62 % on 24 games as long as nobody knows which
    // lane the data belongs to. This is the starting point, not the goal.
    expect(names(blind.banPlan.prioritizedBans)[0]).toBe("Karma")
  })

  it("does not let offrole Karma outrank the onrole pick once the lineup is known", () => {
    const result = analyzeScout(players, data, withLineup)
    const ordered = names(result.banPlan.prioritizedBans)
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")
    const ahri = candidateFor(result.banPlan.prioritizedBans, "Ahri")

    expect(ordered[0]).toBe("Ahri")
    expect(karma?.priority ?? 1).toBeLessThan(ahri?.priority ?? 0)
  })

  it("weights the very same Karma data down instead of deleting it", () => {
    const blind = candidateFor(analyzeScout(players, data).banPlan.prioritizedBans, "Karma")
    const aware = candidateFor(
      analyzeScout(players, data, withLineup).banPlan.prioritizedBans,
      "Karma",
    )

    expect(aware).toBeDefined()
    expect(aware?.priority ?? 0).toBeLessThan(blind?.priority ?? 0)
  })

  it("marks it as offrole, explains it and caps the confidence at low", () => {
    const result = analyzeScout(players, data, withLineup)
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    expect(karma?.roleFit).toBe("offrole")
    expect(codesOf(karma?.reasons ?? [])).toContain("offrole_signal")
    expect(karma?.confidence).toBe("low")
    // 24 games alone would be a `high` signal — the cap is the role, not the sample.
    expect(
      candidateFor(analyzeScout(players, data).banPlan.prioritizedBans, "Karma")?.confidence,
    ).toBe("high")
  })

  it("never presents an offrole ban as a safe or target ban", () => {
    const result = analyzeScout(players, data, withLineup)
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    expect(karma?.phase).toBe("situational")
    expect(names(result.banPlan.phases?.safe ?? [])).not.toContain("Karma")
    expect(names(result.banPlan.phases?.target ?? [])).not.toContain("Karma")
  })

  it("keeps both halves of the badge on the signal: lineup jungle, data mid", () => {
    const result = analyzeScout(players, data, withLineup)
    const jungler = result.players.find((item) => item.playerId === "jgl")
    const karma = signalFor(jungler?.signals ?? [], "Karma")

    expect(karma?.role).toBe("mid")
    expect(karma?.lineupRole).toBe("jungle")
    expect(karma?.roleFit).toBe("offrole")
    expect(karma?.fromSubstitute).toBe(false)
    const offrole = karma?.reasons.find((item) => item.code === "offrole_signal")
    expect(offrole?.params).toEqual({ signalRole: "mid", lineupRole: "jungle" })
  })

  it("raises offrole_data_present with the number of affected signals", () => {
    const result = analyzeScout(players, data, withLineup)
    const warning = result.warnings.find((item) => item.code === "offrole_data_present")

    expect(warning?.params?.count).toBe(1)
    expect(codesOf(result.banPlan.warnings)).toContain("offrole_data_present")
  })
})

/* -------------------------------------------------------------------------
 * 15. the same data onrole is worth more
 * ------------------------------------------------------------------------- */

describe("analyzeScout — onrole vs offrole vs flex vs unknown", () => {
  const karmaOnMid: ManualChampionEntry[] = [
    entry("Karma", 24, 68, { role: "mid", recency: "current" }),
  ]

  function karmaFor(playerRole: ScoutRole, slot: ScoutLineupSlot): BanCandidate {
    const result = analyzeScout([player("p1", playerRole)], dataOf(["p1", karmaOnMid]), {
      lineup: lineupOf({ [slot]: "p1" }),
    })
    const candidate = candidateFor(result.banPlan.prioritizedBans, "Karma")
    if (!candidate) throw new Error("Karma candidate missing")
    return candidate
  }

  it("gives the mid player a stronger Karma ban than the jungler", () => {
    const onrole = karmaFor("mid", "mid")
    const offrole = karmaFor("jungle", "jungle")

    expect(onrole.roleFit).toBe("onrole")
    expect(offrole.roleFit).toBe("offrole")
    expect(onrole.priority).toBeGreaterThan(offrole.priority)
    expect(confidenceRank(onrole.confidence)).toBeGreaterThan(confidenceRank(offrole.confidence))
    expect(codesOf(onrole.reasons)).toContain("onrole_signal")
    expect(codesOf(onrole.reasons)).not.toContain("offrole_signal")
  })

  it("lowers confidence and priority for a signal with an unknown role", () => {
    const onrole = karmaFor("mid", "mid")
    const unknownResult = analyzeScout(
      [player("p1", "mid")],
      dataOf(["p1", [entry("Karma", 24, 68, { role: "unknown", recency: "current" })]]),
      { lineup: lineupOf({ mid: "p1" }) },
    )
    const unknown = candidateFor(unknownResult.banPlan.prioritizedBans, "Karma")

    expect(unknown?.roleFit).toBe("unknown")
    expect(codesOf(unknown?.reasons ?? [])).toContain("role_unknown_or_flex")
    expect(unknown?.priority ?? 1).toBeLessThan(onrole.priority)
    expect(confidenceRank(unknown?.confidence ?? "none")).toBeLessThan(
      confidenceRank(onrole.confidence),
    )
  })

  it("treats a champion spanning two roles as flex, even when one of them matches", () => {
    const flexResult = analyzeScout(
      [player("p1", "mid")],
      dataOf([
        "p1",
        [
          entry("Karma", 12, 68, { role: "mid", recency: "current" }),
          entry("Karma", 12, 68, { role: "support", recency: "current" }),
        ],
      ]),
      { lineup: lineupOf({ mid: "p1" }) },
    )
    const flex = candidateFor(flexResult.banPlan.prioritizedBans, "Karma")
    const onrole = karmaFor("mid", "mid")

    // Precedence flex > onrole: one of the two roles is the player's lane, but
    // "this ban may hit the wrong lane" is still the more useful statement.
    expect(flex?.roleFit).toBe("flex")
    expect(codesOf(flex?.reasons ?? [])).toContain("role_unknown_or_flex")
    expect(confidenceRank(flex?.confidence ?? "none")).toBeLessThan(
      confidenceRank(onrole.confidence),
    )
  })
})

/* -------------------------------------------------------------------------
 * 16. substitutes
 * ------------------------------------------------------------------------- */

describe("analyzeScout — substitutes", () => {
  const players = [player("star", "mid"), player("bench", "bot")]
  const data = dataOf(
    ["star", [entry("Ahri", 20, 60, { role: "mid", recency: "current" })]],
    ["bench", [entry("Kaisa", 20, 80, { role: "bot", recency: "current" })]],
  )
  const benched = lineupOf({ mid: "star" }, { sub1: "bench" })
  const promoted = lineupOf({ mid: "star", bot: "bench" })

  it("keeps a substitute out of the plan entirely by default", () => {
    const result = analyzeScout(players, data, { lineup: benched })

    // 80 % on 20 games would top the list — but the ban plan is about the five
    // players who will actually be on the rift.
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Ahri"])
    expect(result.banPlan.targetBansByPlayer.bench).toEqual([])
    expect(codesOf(result.warnings)).not.toContain("substitute_risk_active")
  })

  it("keeps the benched player and their rows visible, just unscored", () => {
    const result = analyzeScout(players, data, { lineup: benched })
    const sub = result.players.find((item) => item.playerId === "bench")

    expect(sub?.signals).toEqual([])
    expect(sub?.weaknesses).toEqual([])
    expect(sub?.dataQuality.entryCount).toBe(1)
    expect(sub?.lineup).toEqual({
      playerId: "bench",
      membership: "substitute",
      starterSlot: null,
      substituteSlot: "sub1",
    })
    // They are not a "player without data" — their data is simply out of scope.
    expect(codesOf(result.warnings)).not.toContain("player_without_data")
  })

  it("includes them weighted and clearly marked when asked to", () => {
    const result = analyzeScout(players, data, { lineup: benched, includeSubstitutes: true })
    const kaisa = candidateFor(result.banPlan.prioritizedBans, "Kai'Sa")

    expect(kaisa).toBeDefined()
    expect(kaisa?.substituteOnly).toBe(true)
    expect(kaisa?.signals.every((signal) => signal.fromSubstitute)).toBe(true)
    expect(codesOf(kaisa?.reasons ?? [])).toContain("substitute_risk")
    expect(kaisa?.reasons.find((item) => item.code === "substitute_risk")?.params).toEqual({
      weight: SCOUT_SUBSTITUTE_WEIGHT,
    })

    const warning = result.warnings.find((item) => item.code === "substitute_risk_active")
    expect(warning?.params?.count).toBe(1)
    expect(codesOf(result.banPlan.warnings)).toContain("substitute_risk_active")
  })

  it("weights the bench below the same player in the starting five", () => {
    const asSub = candidateFor(
      analyzeScout(players, data, { lineup: benched, includeSubstitutes: true }).banPlan
        .prioritizedBans,
      "Kai'Sa",
    )
    const asStarter = candidateFor(
      analyzeScout(players, data, { lineup: promoted }).banPlan.prioritizedBans,
      "Kai'Sa",
    )

    expect(asSub?.priority ?? 1).toBeLessThan(asStarter?.priority ?? 0)
    expect(asSub?.signals[0]?.score ?? 1).toBeLessThan(asStarter?.signals[0]?.score ?? 0)
  })

  it("honours a custom substitute weight", () => {
    const light = candidateFor(
      analyzeScout(players, data, {
        lineup: benched,
        includeSubstitutes: true,
        substituteWeight: 0.2,
      }).banPlan.prioritizedBans,
      "Kai'Sa",
    )
    const standard = candidateFor(
      analyzeScout(players, data, { lineup: benched, includeSubstitutes: true }).banPlan
        .prioritizedBans,
      "Kai'Sa",
    )

    expect(light?.priority ?? 1).toBeLessThan(standard?.priority ?? 0)
  })

  it("counts a promoted substitute in full, without any special case", () => {
    const result = analyzeScout(players, data, { lineup: promoted })
    const kaisa = candidateFor(result.banPlan.prioritizedBans, "Kai'Sa")

    expect(kaisa?.substituteOnly).toBe(false)
    expect(kaisa?.signals.every((signal) => signal.fromSubstitute)).toBe(false)
    expect(kaisa?.roleFit).toBe("onrole")
    expect(kaisa?.targetRole).toBe("bot")
    expect(codesOf(result.warnings)).not.toContain("substitute_risk_active")
    // Full weight again: 80 % on 20 games now outranks the 60 % starter.
    expect(names(result.banPlan.prioritizedBans)[0]).toBe("Kai'Sa")
  })
})

/* -------------------------------------------------------------------------
 * 17. players in no slot, and an incomplete starting five
 * ------------------------------------------------------------------------- */

describe("analyzeScout — lineup gaps", () => {
  const players = [player("p1", "mid"), player("p2", "top")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 62, { role: "mid", recency: "current" })]],
    ["p2", [entry("Sett", 20, 62, { role: "top", recency: "current" })]],
  )

  it("warns about a player who sits in no slot and scores them neutrally", () => {
    const partial = analyzeScout(players, data, { lineup: lineupOf({ mid: "p1" }) })
    const blind = analyzeScout(players, data)

    const warning = partial.warnings.find((item) => item.code === "player_without_lineup_role")
    expect(warning?.params?.count).toBe(1)

    const sett = candidateFor(partial.banPlan.prioritizedBans, "Sett")
    expect(codesOf(sett?.reasons ?? [])).toContain("player_without_lineup_role")
    // Neutral means neutral: identical to the no-lineup result, not weighted down.
    expect(sett?.priority).toBe(candidateFor(blind.banPlan.prioritizedBans, "Sett")?.priority)
    expect(sett?.signals[0]?.lineupRole).toBeNull()

    const p2 = partial.players.find((item) => item.playerId === "p2")
    expect(p2?.lineup.membership).toBe("unassigned")
  })

  it("reports how many starting slots are still empty", () => {
    const partial = analyzeScout(players, data, { lineup: lineupOf({ mid: "p1", top: "p2" }) })
    const warning = partial.warnings.find((item) => item.code === "incomplete_starting_five")

    expect(warning?.params?.missing).toBe(3)
    expect(partial.lineup?.missingStarterSlots).toEqual(["jungle", "bot", "support"])
    expect(partial.lineup?.isStartingFiveComplete).toBe(false)
    expect(codesOf(partial.banPlan.warnings)).toContain("incomplete_starting_five")
  })

  it("stays quiet once all five slots are filled", () => {
    const five = [
      player("t", "top"),
      player("j", "jungle"),
      player("m", "mid"),
      player("b", "bot"),
      player("s", "support"),
    ]
    const fiveData = dataOf(
      ["t", [entry("Sett", 20, 62, { role: "top", recency: "current" })]],
      ["j", [entry("Vi", 20, 62, { role: "jungle", recency: "current" })]],
      ["m", [entry("Ahri", 20, 62, { role: "mid", recency: "current" })]],
      ["b", [entry("Kaisa", 20, 62, { role: "bot", recency: "current" })]],
      ["s", [entry("Rakan", 20, 62, { role: "support", recency: "current" })]],
    )
    const result = analyzeScout(five, fiveData, {
      lineup: lineupOf({ top: "t", jungle: "j", mid: "m", bot: "b", support: "s" }),
    })

    expect(result.lineup?.isStartingFiveComplete).toBe(true)
    expect(codesOf(result.warnings)).not.toContain("incomplete_starting_five")
    expect(codesOf(result.warnings)).not.toContain("player_without_lineup_role")
    expect(codesOf(result.warnings)).not.toContain("offrole_data_present")
    expect(result.banPlan.prioritizedBans.every((item) => item.roleFit === "onrole")).toBe(true)
  })

  it("ignores a lineup id that no longer belongs to any player", () => {
    const result = analyzeScout(players, data, { lineup: lineupOf({ mid: "p1", top: "ghost" }) })

    expect(result.lineup?.danglingPlayerIds).toEqual(["ghost"])
    expect(result.lineup?.starterPlayerIds).toEqual(["p1"])
    expect(result.lineup?.missingStarterSlots).toContain("top")
  })
})

/* -------------------------------------------------------------------------
 * 18. the ban names its target
 * ------------------------------------------------------------------------- */

describe("analyzeScout — ban target and lineup roles", () => {
  it("names the player and the lane a ban is aimed at", () => {
    const result = analyzeScout(
      [player("p1", "mid")],
      dataOf(["p1", [entry("Ahri", 20, 62, { role: "mid", recency: "current" })]]),
      { lineup: lineupOf({ mid: "p1" }) },
    )
    const ahri = result.banPlan.prioritizedBans[0]

    expect(ahri.targetPlayerId).toBe("p1")
    expect(ahri.targetRole).toBe("mid")
    expect(ahri.lineupRoles).toEqual(["mid"])
  })

  it("lists every starting lane an overlap ban hits, in canonical order", () => {
    const result = analyzeScout(
      [player("p1", "mid"), player("p2", "top")],
      dataOf(
        ["p1", [entry("Sylas", 20, 62, { role: "mid", recency: "current" })]],
        ["p2", [entry("Sylas", 24, 66, { role: "top", recency: "current" })]],
      ),
      { lineup: lineupOf({ mid: "p1", top: "p2" }) },
    )
    const sylas = result.banPlan.prioritizedBans[0]

    expect(sylas.championName).toBe("Sylas")
    // top before mid — SCOUT_LINEUP_SLOTS order, not input order.
    expect(sylas.lineupRoles).toEqual(["top", "mid"])
    // The strongest signal decides the primary target.
    expect(sylas.targetPlayerId).toBe("p2")
    expect(sylas.targetRole).toBe("top")
    expect(sylas.roleFit).toBe("onrole")
  })
})

/* -------------------------------------------------------------------------
 * 19. regression: without a lineup nothing changed
 * ------------------------------------------------------------------------- */

describe("analyzeScout — no lineup supplied", () => {
  const players = [player("p1", "mid"), player("p2", "top")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 62, { role: "mid" }), entry("Zed", 6, 52, { role: "mid" })]],
    ["p2", [entry("Sett", 14, 58, { role: "top" })]],
  )

  it("reports no lineup and no role fit at all", () => {
    const result = analyzeScout(players, data)

    expect(result.lineup).toBeNull()
    for (const analysis of result.players) {
      expect(analysis.lineup).toEqual({
        playerId: analysis.playerId,
        membership: "unassigned",
        starterSlot: null,
        substituteSlot: null,
      })
      for (const signal of [...analysis.signals, ...analysis.weaknesses]) {
        expect(signal.roleFit).toBe("unknown")
        expect(signal.lineupRole).toBeNull()
        expect(signal.fromSubstitute).toBe(false)
      }
    }
    for (const candidate of result.banPlan.prioritizedBans) {
      expect(candidate.targetRole).toBeNull()
      expect(candidate.lineupRoles).toEqual([])
      expect(candidate.substituteOnly).toBe(false)
      expect(candidate.roleFit).toBe("unknown")
    }
  })

  it("raises none of the lineup warnings and none of the lineup reasons", () => {
    const result = analyzeScout(players, data)
    const warningCodes = codesOf(result.warnings).concat(codesOf(result.banPlan.warnings))
    const reasonCodes = result.banPlan.prioritizedBans.flatMap((item) => codesOf(item.reasons))

    for (const code of [
      "incomplete_starting_five",
      "player_without_lineup_role",
      "offrole_data_present",
      "substitute_risk_active",
    ]) {
      expect(warningCodes).not.toContain(code)
    }
    for (const code of [
      "onrole_signal",
      "offrole_signal",
      "role_unknown_or_flex",
      "substitute_risk",
      "player_without_lineup_role",
    ]) {
      expect(reasonCodes).not.toContain(code)
    }
  })

  it("ignores the substitute options when there is no lineup to apply them to", () => {
    const plain = analyzeScout(players, data)

    expect(analyzeScout(players, data, {})).toEqual(plain)
    expect(analyzeScout(players, data, { includeSubstitutes: true })).toEqual(plain)
    expect(analyzeScout(players, data, { includeSubstitutes: true, substituteWeight: 0.1 })).toEqual(
      plain,
    )
  })
})

/* -------------------------------------------------------------------------
 * 20. determinism with a lineup
 * ------------------------------------------------------------------------- */

describe("analyzeScout — determinism with a lineup", () => {
  const players = [player("p1", "mid"), player("p2", "top"), player("p3", "bot")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 62, { role: "mid" }), entry("Karma", 9, 71, { role: "support" })]],
    ["p2", [entry("Sett", 14, 58, { role: "top" }), entry("Ahri", 8, 55, { role: "mid" })]],
    ["p3", [entry("Kaisa", 22, 64, { role: "bot" })]],
  )
  const options: ScoutAnalysisOptions = {
    lineup: lineupOf({ mid: "p1", top: "p2" }, { sub1: "p3" }),
    includeSubstitutes: true,
  }

  it("returns a deeply equal result on repeated calls", () => {
    expect(analyzeScout(players, data, options)).toEqual(analyzeScout(players, data, options))
    expect(JSON.stringify(analyzeScout(players, data, options))).toBe(
      JSON.stringify(analyzeScout(players, data, options)),
    )
  })

  it("keeps the priority list sorted and every candidate in exactly one phase", () => {
    const result = analyzeScout(players, data, options)
    const bans = result.banPlan.prioritizedBans

    for (let index = 1; index < bans.length; index += 1) {
      expect(bans[index - 1].priority).toBeGreaterThanOrEqual(bans[index].priority)
    }
    const phases = result.banPlan.phases
    const total =
      (phases?.safe.length ?? 0) + (phases?.target.length ?? 0) + (phases?.situational.length ?? 0)
    expect(total).toBe(bans.length)
  })

  it("does not depend on the input order of the players", () => {
    const forward = analyzeScout(players, data, options)
    const reversed = analyzeScout([players[2], players[0], players[1]], data, options)

    expect(names(reversed.banPlan.prioritizedBans)).toEqual(names(forward.banPlan.prioritizedBans))
  })
})

/* -------------------------------------------------------------------------
 * 21. mechanical guard: every emitted reason/warning carries the params its
 *     i18n text actually asks for
 *
 * WHY THIS EXISTS. `hits_multiple_players` shipped `{ players: n }` for months
 * while both translations read `{count}`. `fillPlaceholders()` (see
 * src/components/scout/scoutUiHelpers.ts) deliberately replaces a placeholder
 * without a matching param by the empty string, so the defect was completely
 * silent: UI *and* export printed "Trifft Spieler im gegnerischen Team." — the
 * sentence lost the only number it carried. Nothing caught it, because every
 * test in this file asserted on `reason.code` and never on the rendered text.
 *
 * The guard below closes that whole class instead of the single instance: it
 * drives `analyzeScout()` over fixtures that trigger as many codes as possible,
 * walks the *entire* result tree for anything shaped like a `ScoutReason` or a
 * `ScoutWarning`, reads the DE and the EN template for its code and checks that
 * every `{placeholder}` in them has an entry in `params`.
 *
 * It is a pure data check on purpose: no rendering, no React, no i18n helper is
 * involved, so it also holds for consumers that format the params themselves
 * (the clipboard export does exactly that).
 * ------------------------------------------------------------------------- */

/**
 * DE/EN as plain lookup tables. The guard only ever reads raw templates, so the
 * precise key union would only get in the way — a code whose key is *missing*
 * is one of the failures this test is meant to report, not a compile error.
 */
const DE_TEXTS = de as Readonly<Record<string, string>>
const EN_TEXTS = en as Readonly<Record<string, string>>

/** One `ScoutReason` or `ScoutWarning` found somewhere in an analysis result. */
interface CodedItem {
  scenario: string
  kind: "reason" | "warning"
  code: string
  params?: ScoutReasonParams
  /** Where in the result tree it sat — without this a failure is unlocatable. */
  path: string
}

/**
 * Deep-walks a result and collects everything shaped `{ code: string }`.
 *
 * Deliberately structural rather than a hand-written list of the places reasons
 * live (candidate.reasons, signal.reasons, dataQuality.notes, warnings,
 * banPlan.warnings, phases, targetBansByPlayer, weaknesses ...). A new emission
 * site is then covered the day it is added instead of the day someone remembers
 * to extend this file.
 *
 * `seen` is identity-based: candidates appear in `prioritizedBans`, `phases`,
 * `overlapBans` and `targetBansByPlayer` as the *same* objects, so this keeps
 * the walk linear and the report free of duplicates.
 */
function collectCodedItems(
  scenario: string,
  path: string,
  value: unknown,
  out: CodedItem[],
  seen: Set<object>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectCodedItems(scenario, path + "[" + index + "]", item, out, seen),
    )
    return
  }
  if (value === null || typeof value !== "object") return

  const record = value as Record<string, unknown>
  if (seen.has(record)) return
  seen.add(record)

  if (typeof record.code === "string") {
    out.push({
      scenario,
      // `ScoutWarning` is the only coded shape carrying a `severity`, and
      // `ScoutReason` never does — that is the entire discriminator.
      kind: typeof record.severity === "string" ? "warning" : "reason",
      code: record.code,
      params: record.params as ScoutReasonParams | undefined,
      path,
    })
  }

  for (const key of Object.keys(record)) {
    collectCodedItems(scenario, path + "." + key, record[key], out, seen)
  }
}

/** Distinct `{placeholder}` names of one template, in first-seen order. */
function placeholdersOf(template: string): string[] {
  const pattern = /\{(\w+)\}/g
  const found: string[] = []
  let match = pattern.exec(template)
  while (match !== null) {
    if (!found.includes(match[1])) found.push(match[1])
    match = pattern.exec(template)
  }
  return found
}

function i18nKeyOf(item: CodedItem): string {
  return item.kind === "reason" ? "scout_reason_" + item.code : "scout_warning_" + item.code
}

function sourceRef(status: ScoutSourceRef["status"]): ScoutSourceRef {
  return { kind: "opgg", url: "https://www.op.gg/", status }
}

/**
 * One session that is deliberately messy: a partly filled lineup, a starter
 * with offrole data, a flex champion, an overlap champion, contradicting rows,
 * a substitute, a player in no slot, a player without any data, a duplicate id,
 * pro-meta enrichment and a user-raised champion.
 */
function messySessionResult(): ScoutAnalysisResult {
  const top1: ScoutPlayer = {
    ...player("top1", "top"),
    sources: [sourceRef("not_supported_in_browser")],
  }
  const players: ScoutPlayer[] = [
    top1,
    player("jgl1", "jungle"),
    player("mid1", "mid"),
    player("bot1", "bot"),
    player("sub1", "support"),
    player("pool1", "support"),
    // Same id twice -> duplicate_players_merged.
    top1,
  ]
  const data = dataOf(
    [
      "top1",
      [
        entry("Sett", 30, 62, { role: "top", recency: "current" }),
        entry("Gnar", 6, 68, { role: "top", recency: "current" }),
        entry("Gnar", 6, 68, { role: "mid", recency: "current" }),
        entry("Sylas", 20, 60, { role: "top", recency: "current" }),
        entry("Camille", 8, 58, { role: "top", recency: "old" }),
      ],
    ],
    [
      "jgl1",
      [
        entry("Vi", 24, 66, { role: "jungle", recency: "current" }),
        entry("Nocturne", 10, 40, { role: "jungle", recency: "current" }),
        entry("Kindred", 3, 60, { role: "jungle", recency: "current" }),
      ],
    ],
    [
      "mid1",
      [
        entry("Karma", 24, 68, { role: "support", recency: "current" }),
        entry("Sylas", 18, 58, { role: "mid", recency: "current" }),
        entry("Zed", 12, 70, { role: "mid", recency: "current" }),
        entry("Zed", 10, 30, { role: "mid", recency: "current" }),
      ],
    ],
    ["sub1", [entry("Rakan", 14, 60, { role: "support", recency: "current" })]],
    [
      "pool1",
      [
        entry("Nautilus", 20, 62, { role: "support", recency: "current" }),
        entry("Leona", 4, 58, { role: "support", recency: "current" }),
      ],
    ],
  )

  return analyzeScout(players, data, {
    // support deliberately empty -> incomplete_starting_five
    lineup: lineupOf({ top: "top1", jungle: "jgl1", mid: "mid1", bot: "bot1" }, { sub1: "sub1" }),
    includeSubstitutes: true,
    proMeta: [metaStats("Sylas", 0.5)],
    priorityChampions: ["Vi"],
  })
}

/** A session so thin and so old that the three session-level notes all fire. */
function thinStaleSessionResult(): ScoutAnalysisResult {
  return analyzeScout(
    [player("solo", "mid")],
    dataOf(["solo", [entry("Ahri", 4, 52, { role: "mid", recency: "old" })]]),
  )
}

/**
 * A session whose only job is to reach the two stat-weighting reasons.
 *
 * NOT optional decoration: `ALL_REASON_CODES` is a total map, so listing
 * `many_games_on_champion` / `strong_kda` there without a fixture that emits
 * them turns the coverage test below red — which is precisely the point of that
 * test. Neither code is reachable from the two sessions above: the fattest
 * champion there has 30 games (the games reason needs 44) and none of them
 * carries a KDA at all.
 *
 * Both champions sit on ONE player so the ladder stays visible: Ahri has a KDA
 * strong enough for `strong_kda`, Syndra is one game past the 44-game threshold
 * with no KDA, so it can only be `many_games_on_champion`.
 */
function statWeightedSessionResult(): ScoutAnalysisResult {
  return analyzeScout(
    [player("statmid", "mid")],
    dataOf([
      "statmid",
      [
        entry("Ahri", 60, 52, { role: "mid", recency: "current", kda: 4.5 }),
        entry("Syndra", 44, 52, { role: "mid", recency: "current" }),
      ],
    ]),
  )
}

/**
 * A session that exercises the 0.7.0 emission sites: a ranked support main
 * parked in the jungle, with champion role evidence supplied.
 *
 * It has to be its own scenario because both new reasons need inputs none of the
 * three above provide: `champion_not_playable_in_role` needs
 * `championRoleReference`, and `high_rank_player` needs a rank on the player.
 * Adding them to an existing fixture would have changed what those fixtures
 * prove.
 */
function roleGatedSessionResult(): ScoutAnalysisResult {
  const scout: ScoutPlayer = { ...player("gated", "support"), rankTier: "challenger" }
  return analyzeScout(
    [scout],
    dataOf([
      "gated",
      [
        // Karma in the jungle: one pick in the whole reference dataset.
        entry("Karma", 80, 72, { role: "jungle", recency: "current" }),
        // Lee Sin really is a jungler, so the gate must let this one through.
        entry("Lee Sin", 40, 61, { role: "jungle", recency: "current", kda: 4.2 }),
      ],
    ]),
    {
      lineup: lineupOf({ jungle: "gated" }),
      championRoleReference: [
        {
          championName: "Karma",
          games: 1000,
          picks: 2254,
          bans: 0,
          wins: 1127,
          losses: 1127,
          pickRate: 0.1,
          banRate: 0,
          presence: 0.1,
          winRate: 0.5,
          roleDistribution: { top: 0.0346, jungle: 0.0004, mid: 0.2902, bot: 0.0013, support: 0.6735 },
          sampleSizeLabel: "sample_good",
          draftPriorityScore: 0.5,
        },
        {
          championName: "Lee Sin",
          games: 1000,
          picks: 1889,
          bans: 0,
          wins: 944,
          losses: 945,
          pickRate: 0.1,
          banRate: 0,
          presence: 0.1,
          winRate: 0.5,
          roleDistribution: { top: 0.0143, jungle: 0.9719, mid: 0.0079, bot: 0.0026, support: 0.0032 },
          sampleSizeLabel: "sample_good",
          draftPriorityScore: 0.5,
        },
      ],
    },
  )
}

const SCENARIOS: readonly (readonly [string, () => ScoutAnalysisResult])[] = [
  ["messy session", messySessionResult],
  ["thin stale session", thinStaleSessionResult],
  ["stat weighted session", statWeightedSessionResult],
  ["role gated session", roleGatedSessionResult],
]

function collectAllCodedItems(): CodedItem[] {
  const out: CodedItem[] = []
  for (const [name, run] of SCENARIOS) {
    collectCodedItems(name, "result", run(), out, new Set<object>())
  }
  return out
}

/**
 * Every code the engine can emit. Typed as a total `Record` on purpose: adding a
 * member to `ScoutReasonCode` / `ScoutWarningCode` without listing it here is a
 * compile error, so the coverage test below can never quietly go stale.
 */
const ALL_REASON_CODES: Readonly<Record<ScoutReasonCode, true>> = {
  high_winrate_many_games: true,
  high_winrate_small_sample: true,
  signature_pick: true,
  one_trick: true,
  high_games_low_winrate: true,
  flex_across_roles: true,
  played_recently: true,
  stale_data: true,
  small_sample: true,
  no_data: true,
  manual_entry_only: true,
  hits_multiple_players: true,
  meta_priority: true,
  role_specific_threat: true,
  user_marked_priority: true,
  onrole_signal: true,
  offrole_signal: true,
  role_unknown_or_flex: true,
  substitute_risk: true,
  player_without_lineup_role: true,
  many_games_on_champion: true,
  strong_kda: true,
  champion_not_playable_in_role: true,
  high_rank_player: true,
}

const ALL_WARNING_CODES: Readonly<Record<ScoutWarningCode, true>> = {
  player_without_data: true,
  small_sample_overall: true,
  stale_data_overall: true,
  flex_pick_warning: true,
  meta_shift_possible: true,
  source_not_fetchable: true,
  conflicting_entries: true,
  duplicate_players_merged: true,
  incomplete_starting_five: true,
  player_without_lineup_role: true,
  offrole_data_present: true,
  substitute_risk_active: true,
  data_loss_on_reparse: true,
  role_not_playable_filtered: true,
}

/**
 * `data_loss_on_reparse` describes the *removed-player archive*, not an
 * analysis: it is raised in src/components/scout/ScoutRemovedPlayersPanel.tsx
 * from the number of archived entries. `analyzeScout()` never sees the archive
 * (it only gets `players` + `playerData`), so no fixture can make it appear —
 * which is why it is excluded here by name instead of being left silently
 * uncovered.
 */
const WARNING_CODES_ANALYZE_SCOUT_NEVER_EMITS: readonly string[] = ["data_loss_on_reparse"]

describe("analyzeScout — reason and warning params satisfy the i18n placeholders", () => {
  const collected = collectAllCodedItems()

  it("finds reasons and warnings at all (the fixtures really do produce output)", () => {
    expect(collected.filter((item) => item.kind === "reason").length).toBeGreaterThan(0)
    expect(collected.filter((item) => item.kind === "warning").length).toBeGreaterThan(0)
  })

  it("supplies a params entry for every placeholder the DE and the EN text uses", () => {
    const failures: string[] = []

    for (const item of collected) {
      const key = i18nKeyOf(item)
      for (const [locale, texts] of [
        ["de", DE_TEXTS],
        ["en", EN_TEXTS],
      ] as const) {
        const template = texts[key]
        if (typeof template !== "string") {
          failures.push(locale + ": no i18n text for key " + key)
          continue
        }
        for (const placeholder of placeholdersOf(template)) {
          const value = item.params ? item.params[placeholder] : undefined
          if (value === undefined || value === null) {
            failures.push(
              locale +
                ": " +
                item.kind +
                ' "' +
                item.code +
                '" is missing the param "' +
                placeholder +
                '" that ' +
                key +
                " renders",
            )
          }
        }
      }
    }

    expect([...new Set(failures)].sort()).toEqual([])
  })

  it("never ships a raw i18n key as a parameter value", () => {
    // `sampleSizeLabel()` returns `sample_veryLow` & friends — machine keys, not
    // text. Handing one to a reason means that the day someone adds `{sample}`
    // to a translation, the raw key lands on screen.
    const offenders: string[] = []

    for (const item of collected) {
      const params = item.params
      if (!params) continue
      for (const name of Object.keys(params)) {
        const value = params[name]
        if (typeof value !== "string") continue
        if (Object.prototype.hasOwnProperty.call(DE_TEXTS, value)) {
          offenders.push(item.kind + ' "' + item.code + '" param "' + name + '" = "' + value + '"')
        }
      }
    }

    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it("covers every reason code and every warning code the engine can emit", () => {
    const seenReasons = new Set(
      collected.filter((item) => item.kind === "reason").map((item) => item.code),
    )
    const seenWarnings = new Set(
      collected.filter((item) => item.kind === "warning").map((item) => item.code),
    )

    const missingReasons = Object.keys(ALL_REASON_CODES).filter((code) => !seenReasons.has(code))
    const missingWarnings = Object.keys(ALL_WARNING_CODES).filter(
      (code) => !seenWarnings.has(code) && !WARNING_CODES_ANALYZE_SCOUT_NEVER_EMITS.includes(code),
    )

    expect(missingReasons).toEqual([])
    expect(missingWarnings).toEqual([])
  })

  it("labels an overlap ban with the {count} its translation asks for", () => {
    const overlap = collected.find(
      (item) => item.kind === "reason" && item.code === "hits_multiple_players",
    )

    expect(overlap).toBeDefined()
    // The bug: the engine shipped `players`, both texts read `{count}`.
    expect(overlap?.params?.count).toBe(2)
    expect(overlap?.params).not.toHaveProperty("players")
  })

  it("keeps the walker honest about where an item was found", () => {
    // `path` is only useful if it really is a path — a bare "result" everywhere
    // would make every failure message above unlocatable.
    const overlap = collected.find(
      (item) => item.kind === "reason" && item.code === "hits_multiple_players",
    )

    expect(overlap?.path.startsWith("result.")).toBe(true)
    expect(overlap?.scenario).toBe("messy session")
  })
})

/* -------------------------------------------------------------------------
 * 22. a player who holds no lineup slot is never judged against a role
 *
 * The pool player's "role" is whatever the link parser guessed. Measuring their
 * champion data against that guess produced a signal that contradicted itself
 * three times over: the badge said "Andere Rolle" next to a `high` confidence,
 * the reason underneath said "no role check is possible", and
 * `offrole_data_present` — whose text explicitly says "than the one *in the
 * lineup*" — counted a player who stands in no lineup at all.
 * ------------------------------------------------------------------------- */

describe("analyzeScout — a player without a lineup slot is never judged offrole", () => {
  const players = [player("p1", "mid"), player("p2", "jungle")]
  const data = dataOf(
    ["p1", [entry("Ahri", 20, 62, { role: "mid", recency: "current" })]],
    // Parser guessed "jungle" for p2; the only data anybody found is support
    // data. p2 sits in no slot, so there is nothing to compare either against.
    ["p2", [entry("Karma", 20, 70, { role: "support", recency: "current" })]],
  )
  const options: ScoutAnalysisOptions = { lineup: lineupOf({ mid: "p1" }) }

  it("reports roleFit unknown, not offrole", () => {
    const result = analyzeScout(players, data, options)
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    expect(karma?.signals[0]?.roleFit).toBe("unknown")
    expect(karma?.roleFit).toBe("unknown")
    expect(karma?.signals[0]?.lineupRole).toBeNull()
  })

  it("does not count pool data as offrole data", () => {
    const result = analyzeScout(players, data, options)

    expect(codesOf(result.warnings)).not.toContain("offrole_data_present")
    expect(codesOf(result.banPlan.warnings)).not.toContain("offrole_data_present")
    // The honest warning for this player is the other one.
    expect(codesOf(result.warnings)).toContain("player_without_lineup_role")
  })

  it("says it once: player_without_lineup_role, and no second role reason", () => {
    const result = analyzeScout(players, data, options)
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")
    const codes = codesOf(karma?.signals[0]?.reasons ?? [])

    expect(codes).toContain("player_without_lineup_role")
    // No reason spam: `role_unknown_or_flex` would state the very same thing a
    // second line further down.
    expect(codes).not.toContain("role_unknown_or_flex")
    expect(codes).not.toContain("offrole_signal")
    expect(codes).not.toContain("onrole_signal")
    expect(codes.filter((code) => code === "player_without_lineup_role")).toHaveLength(1)
  })

  it("keeps the pool player's score and confidence exactly neutral", () => {
    const aware = candidateFor(analyzeScout(players, data, options).banPlan.prioritizedBans, "Karma")
    const blind = candidateFor(analyzeScout(players, data).banPlan.prioritizedBans, "Karma")

    // Not punished for a decision the user has not made yet.
    expect(aware?.priority).toBe(blind?.priority)
    expect(aware?.confidence).toBe(blind?.confidence)
  })

  it("stays unknown even when the pool player's champion spans two roles", () => {
    // DECISION pinned here: "no slot" is checked *before* the flex rule, so a
    // pool player never carries a lineup-relative badge at all. The flex fact
    // itself is not lost — `flex_across_roles` and `flex_pick_warning` are
    // derived from the entries, not from the lineup, and still fire.
    const result = analyzeScout(
      [player("p1", "mid"), player("p2", "jungle")],
      dataOf(
        ["p1", [entry("Ahri", 20, 62, { role: "mid", recency: "current" })]],
        [
          "p2",
          [
            entry("Karma", 10, 70, { role: "support", recency: "current" }),
            entry("Karma", 10, 70, { role: "mid", recency: "current" }),
          ],
        ],
      ),
      options,
    )
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    expect(karma?.signals[0]?.roleFit).toBe("unknown")
    expect(codesOf(karma?.reasons ?? [])).toContain("flex_across_roles")
    expect(karma?.isFlex).toBe(true)
    expect(codesOf(result.warnings)).toContain("flex_pick_warning")
  })

  it("leaves an assigned starter's offrole judgement untouched", () => {
    // Regression guard for the core promise: with a slot, offrole still means
    // offrole, still capped at `low`, still only `situational`.
    const result = analyzeScout(players, data, {
      lineup: lineupOf({ mid: "p1", jungle: "p2" }),
    })
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    expect(karma?.roleFit).toBe("offrole")
    expect(karma?.confidence).toBe("low")
    expect(karma?.phase).toBe("situational")
    expect(codesOf(result.warnings)).toContain("offrole_data_present")
  })
})

/* -------------------------------------------------------------------------
 * 23. the ban headline must not name a lane the data does not support
 *
 * `targetPlayerId` used to be "the highest-scoring signal, full stop", and
 * `targetRole` that player's starting slot. An offrole starter can outscore an
 * onrole substitute, and the plan then read "safe ban: Karma against their
 * jungler" while every Karma row behind it was support data.
 * ------------------------------------------------------------------------- */

describe("analyzeScout — the ban target follows the data, not just the score", () => {
  const players = [player("jgl", "jungle"), player("sub", "support")]
  const data = dataOf(
    // Offrole for the starting jungler: strong numbers, wrong lane.
    ["jgl", [entry("Karma", 40, 80, { role: "support", recency: "current" })]],
    // Onrole for the benched support: weak numbers, right lane.
    ["sub", [entry("Karma", 6, 45, { role: "support", recency: "current" })]],
  )
  const options: ScoutAnalysisOptions = {
    lineup: lineupOf({ jungle: "jgl" }, { sub1: "sub" }),
    includeSubstitutes: true,
  }

  it("reproduces the setup: the offrole starter carries the strongest signal", () => {
    const karma = candidateFor(analyzeScout(players, data, options).banPlan.prioritizedBans, "Karma")

    expect(karma?.signals[0]?.playerId).toBe("jgl")
    expect(karma?.signals[0]?.roleFit).toBe("offrole")
    expect(karma?.signals[1]?.playerId).toBe("sub")
    expect(karma?.signals[1]?.roleFit).toBe("onrole")
    // Overlap + a `medium` from the substitute is what lifts this into `safe`.
    expect(karma?.isOverlap).toBe(true)
    expect(karma?.confidence).toBe("medium")
    expect(karma?.phase).toBe("safe")
  })

  it("never announces the ban against the offrole starter's lane", () => {
    const karma = candidateFor(analyzeScout(players, data, options).banPlan.prioritizedBans, "Karma")

    expect(karma?.targetRole).not.toBe("jungle")
  })

  it("picks the onrole signal as the primary target", () => {
    const karma = candidateFor(analyzeScout(players, data, options).banPlan.prioritizedBans, "Karma")

    expect(karma?.targetPlayerId).toBe("sub")
    // The onrole player is on the bench, so there is no starting lane to name.
    expect(karma?.targetRole).toBeNull()
  })

  it("leaves targetRole null when not a single signal is onrole", () => {
    const result = analyzeScout(
      [player("jgl", "jungle")],
      dataOf(["jgl", [entry("Karma", 40, 80, { role: "support", recency: "current" })]]),
      { lineup: lineupOf({ jungle: "jgl" }) },
    )
    const karma = candidateFor(result.banPlan.prioritizedBans, "Karma")

    // The player is still named — the data really is his — but the lane is not.
    expect(karma?.targetPlayerId).toBe("jgl")
    expect(karma?.targetRole).toBeNull()
  })

  it("still names the lane when the strongest signal is onrole", () => {
    const result = analyzeScout(
      [player("mid1", "mid"), player("top1", "top")],
      dataOf(
        ["mid1", [entry("Sylas", 20, 62, { role: "mid", recency: "current" })]],
        ["top1", [entry("Sylas", 24, 66, { role: "top", recency: "current" })]],
      ),
      { lineup: lineupOf({ mid: "mid1", top: "top1" }) },
    )
    const sylas = candidateFor(result.banPlan.prioritizedBans, "Sylas")

    expect(sylas?.targetPlayerId).toBe("top1")
    expect(sylas?.targetRole).toBe("top")
  })

  it("keeps the no-lineup behaviour: strongest signal names the target, no lane", () => {
    const result = analyzeScout(
      [player("mid1", "mid"), player("top1", "top")],
      dataOf(
        ["mid1", [entry("Sylas", 20, 62, { role: "mid", recency: "current" })]],
        ["top1", [entry("Sylas", 24, 66, { role: "top", recency: "current" })]],
      ),
    )
    const sylas = candidateFor(result.banPlan.prioritizedBans, "Sylas")

    expect(sylas?.targetPlayerId).toBe("top1")
    expect(sylas?.targetRole).toBeNull()
  })
})

/* -------------------------------------------------------------------------
 * 24. ChampionSignal.kda — the number the ban plan is allowed to print
 *
 * The scoring has weighted KDA since 0.5.0, but the signal never carried it.
 * Every consumer that wanted to *show* a KDA therefore had to re-derive one
 * from the entries, and a second derivation is a second convention: the day
 * the two drift apart the plan prints a number the score never saw. The field
 * closes that door. It is the very aggregate `championStatStrengthMultiplier()`
 * was fed, rounded for display and nothing else.
 *
 * THE NEUTRALITY RULE IS WHAT MOST OF THIS SECTION IS ABOUT. "not stated" and
 * "stated 0" are different facts about a player, and `kda ?? 0` / `!kda`
 * collapse precisely those two: the first turns every legacy row — none of
 * which carries a KDA — into a champion with no kills and no assists, the
 * second deletes the one row that really said so. `null` must never surface as
 * `0`, and `0` must never surface as `null`.
 * ------------------------------------------------------------------------- */

describe("analyzeScout — the KDA on a signal", () => {
  /** One mid player, one champion, no lineup: everything except the KDA is held
   *  still so each case below reads as a statement about the KDA alone. */
  function ahriSignal(entries: readonly ManualChampionEntry[]): ChampionSignal {
    const result = analyzeScout([player("p1", "mid")], dataOf(["p1", entries]))
    const signal = signalFor(result.players[0].signals, "Ahri")
    if (!signal) throw new Error("Ahri signal missing")
    return signal
  }

  it("carries a stated KDA through to the signal", () => {
    const signal = ahriSignal([entry("Ahri", 20, 60, { role: "mid", recency: "current", kda: 3.4 })])

    expect(signal.kda).toBe(3.4)
  })

  it("reports null — not undefined, not 0 — when no row states one", () => {
    const signal = ahriSignal([entry("Ahri", 20, 60, { role: "mid", recency: "current" })])

    expect(signal.kda).toBeNull()
    // Spelled out because these are the two values a falsy check would produce
    // here, and both would be a claim about the player nobody made.
    expect(signal.kda).not.toBeUndefined()
    expect(signal.kda).not.toBe(0)
    // Required, not optional: the key exists even when there is nothing to say.
    expect("kda" in signal).toBe(true)
  })

  it("keeps a stated 0 as 0 — no kills and no assists is a statement", () => {
    const signal = ahriSignal([entry("Ahri", 20, 60, { role: "mid", recency: "current", kda: 0 })])

    // THE discriminating case of this whole section. A test that only ever
    // checks a non-zero KDA proves nothing about the neutrality rule: every
    // wrong spelling of it agrees with the right one on 3.4.
    expect(signal.kda).toBe(0)
    expect(signal.kda).not.toBeNull()
  })

  it("aggregates several rows games-weighted, exactly as the scoring does", () => {
    const signal = ahriSignal([
      entry("Ahri", 40, 60, { role: "mid", recency: "current", kda: 4.2 }),
      entry("Ahri", 10, 60, { role: "mid", recency: "current", kda: 1.2 }),
    ])

    expect(signal.games).toBe(50)
    // (4.2 * 40 + 1.2 * 10) / 50
    expect(signal.kda).toBeCloseTo(3.6, 10)
    // The unweighted mean of the same two rows is 2.7 — pinned as a negative so
    // "average the rows" cannot pass for "weight the rows by their games".
    expect(signal.kda).not.toBeCloseTo(2.7, 1)
  })

  it("does not let a row without a KDA drag the aggregate down", () => {
    const signal = ahriSignal([
      entry("Ahri", 40, 60, { role: "mid", recency: "current", kda: 4.2 }),
      entry("Ahri", 10, 60, { role: "mid", recency: "current" }),
    ])

    // The silent row is skipped, not counted as 0 and not counted as a neutral
    // 2.5: the answer is what the one row that has a KDA says, unchanged.
    expect(signal.games).toBe(50)
    expect(signal.kda).toBe(4.2)
  })

  it("rounds the aggregate to three decimals, like the winrate beside it", () => {
    const signal = ahriSignal([
      entry("Ahri", 3, 60, { role: "mid", recency: "current", kda: 4 }),
      entry("Ahri", 4, 60, { role: "mid", recency: "current", kda: 1 }),
    ])

    // (4 * 3 + 1 * 4) / 7 = 2.2857142857142856 raw. Chosen for exactly that:
    // the two cases above divide out evenly and would stay green without any
    // rounding at all.
    expect(signal.kda).toBe(2.286)
  })

  it("never lets an implausible KDA reach the signal", () => {
    const tooHigh = ahriSignal([
      entry("Ahri", 20, 60, { role: "mid", recency: "current", kda: SCOUT_KDA_MAX_PLAUSIBLE + 1 }),
    ])
    const negative = ahriSignal([
      entry("Ahri", 20, 60, { role: "mid", recency: "current", kda: -3 }),
    ])

    // The scoring already ignores both (they return a neutral 1.0), so the
    // signal has to ignore them too — otherwise the plan prints a KDA of 101
    // next to a score that never believed it. UI and score cannot be allowed
    // to contradict each other about the same row.
    expect(tooHigh.kda).toBeNull()
    expect(negative.kda).toBeNull()
  })

  it("does not let one implausible row poison the rows beside it", () => {
    const signal = ahriSignal([
      entry("Ahri", 10, 60, { role: "mid", recency: "current", kda: 3.5 }),
      entry("Ahri", 10, 60, { role: "mid", recency: "current", kda: SCOUT_KDA_MAX_PLAUSIBLE + 900 }),
    ])

    // Dropped before the average, not averaged in: 3.5, not 501.75.
    expect(signal.kda).toBe(3.5)
  })

  it("shows exactly the KDA the score consumed, not a second derivation", () => {
    const withKda = ahriSignal([entry("Ahri", 20, 62, { role: "mid", recency: "current", kda: 4 })])
    const withoutKda = ahriSignal([entry("Ahri", 20, 62, { role: "mid", recency: "current" })])

    expect(withKda.kda).toBe(4)
    expect(withoutKda.kda).toBeNull()
    expect(withKda.games).toBe(withoutKda.games)
    expect(withKda.winrate).toBe(withoutKda.winrate)

    // Both signals differ in the KDA and in nothing else, so the entire gap
    // between their scores is the KDA factor. Feeding the number the signal
    // REPORTS back into the exported multiplier has to reproduce that gap. A
    // field aggregated differently, rounded differently or read off a second
    // code path would not close this ratio.
    const expectedRatio =
      championStatStrengthMultiplier({
        games: withKda.games,
        winrate: withKda.winrate,
        kda: withKda.kda,
      }) /
      championStatStrengthMultiplier({
        games: withoutKda.games,
        winrate: withoutKda.winrate,
        kda: null,
      })

    // Not vacuous: the factor really does move the score, so a ratio of 1 —
    // which any two equal scores would satisfy — is not what is being checked.
    expect(expectedRatio).toBeGreaterThan(1)
    expect(withKda.score).toBeGreaterThan(withoutKda.score)
    // Tolerance covers `round3` on both scores (up to 5e-4 each); the measured
    // gap is 9e-5.
    expect(withKda.score / withoutKda.score).toBeCloseTo(expectedRatio, 2)
  })
})
