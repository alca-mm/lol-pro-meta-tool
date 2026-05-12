import { describe, it, expect } from "vitest"
import { calculateChampionStats } from "../src/analysis/championStats"
import type { Match } from "../src/domain/types"

function makeMatch(id: string, picks: Match["picks"], bans: Match["bans"] = []): Match {
  return {
    matchId: id,
    date: "2024-01-01",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "A",
    redTeam: "B",
    winningTeam: "A",
    picks,
    bans,
  }
}

const base: Match["picks"][number] = {
  championName: "Garen",
  team: "A",
  side: "blue",
  role: "top",
  won: true,
}

describe("draftPriorityScore", () => {
  it("score is deterministic", () => {
    const m = makeMatch("m1", [base, { ...base, championName: "X", won: false, side: "red", team: "B" }])
    const a = calculateChampionStats([m])
    const b = calculateChampionStats([m])
    const sa = a.find(s => s.championName === "Garen")!.draftPriorityScore
    const sb = b.find(s => s.championName === "Garen")!.draftPriorityScore
    expect(sa).toBe(sb)
  })

  it("presence has strongest influence (0.5 weight)", () => {
    // High presence champion vs low presence champion
    const highPresence = makeMatch("m1", [
      { ...base, championName: "HighPres", won: true },
      { ...base, championName: "LowPres", won: false, side: "red", team: "B" },
    ], [{ championName: "HighPres", team: "A", side: "blue" }])

    const stats = calculateChampionStats([highPresence])
    const hp = stats.find(s => s.championName === "HighPres")!
    const lp = stats.find(s => s.championName === "LowPres")!
    expect(hp.draftPriorityScore).toBeGreaterThan(lp.draftPriorityScore)
  })

  it("uses 0.5 as winRate component when picks < 5", () => {
    // Champion with 1 pick and 100% winrate should use 0.5, not 1.0
    const m = makeMatch("m1", [base, { ...base, championName: "X", won: false, side: "red", team: "B" }])
    const stats = calculateChampionStats([m])
    const garen = stats.find(s => s.championName === "Garen")!

    expect(garen.picks).toBe(1) // < 5, so winRateComponent = 0.5
    const expectedScore = garen.presence * 0.5 + garen.banRate * 0.2 + garen.pickRate * 0.2 + 0.5 * 0.1
    expect(garen.draftPriorityScore).toBeCloseTo(expectedScore)
  })

  it("uses actual winRate when picks >= 5", () => {
    const picks: Match["picks"] = Array.from({ length: 5 }, (_, i) => ({
      ...base,
      championName: "Garen",
      team: i < 3 ? "A" : "B",
      side: i < 3 ? "blue" : "red",
      won: i < 3,
    }))
    const fiveMatches = picks.map((p, i) =>
      makeMatch(`m${i}`, [p, { ...base, championName: "Other", won: !p.won, side: p.side === "blue" ? "red" : "blue", team: p.team === "A" ? "B" : "A" }])
    )
    const stats = calculateChampionStats(fiveMatches)
    const garen = stats.find(s => s.championName === "Garen")!
    expect(garen.picks).toBe(5)
    expect(garen.winRate).not.toBeNull()
    const expectedScore = garen.presence * 0.5 + garen.banRate * 0.2 + garen.pickRate * 0.2 + garen.winRate! * 0.1
    expect(garen.draftPriorityScore).toBeCloseTo(expectedScore)
  })

  it("score is between 0 and 1 for typical values", () => {
    const m = makeMatch("m1", [base, { ...base, championName: "X", won: false, side: "red", team: "B" }])
    const stats = calculateChampionStats([m])
    stats.forEach(s => {
      expect(s.draftPriorityScore).toBeGreaterThanOrEqual(0)
      expect(s.draftPriorityScore).toBeLessThanOrEqual(1.1) // slight margin for edge cases
    })
  })
})
