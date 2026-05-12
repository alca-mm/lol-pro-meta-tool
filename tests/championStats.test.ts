import { describe, it, expect } from "vitest"
import { calculateChampionStats } from "../src/analysis/championStats"
import type { Match } from "../src/domain/types"

const matches: Match[] = [
  {
    matchId: "t1",
    date: "2024-01-01",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "A",
    redTeam: "B",
    winningTeam: "A",
    picks: [
      { championName: "Garen", team: "A", side: "blue", role: "top", won: true },
      { championName: "Jinx", team: "A", side: "blue", role: "bot", won: true },
      { championName: "Thresh", team: "A", side: "blue", role: "support", won: true },
      { championName: "Orianna", team: "A", side: "blue", role: "mid", won: true },
      { championName: "Vi", team: "A", side: "blue", role: "jungle", won: true },
      { championName: "Darius", team: "B", side: "red", role: "top", won: false },
      { championName: "Caitlyn", team: "B", side: "red", role: "bot", won: false },
      { championName: "Lulu", team: "B", side: "red", role: "support", won: false },
      { championName: "Syndra", team: "B", side: "red", role: "mid", won: false },
      { championName: "Hecarim", team: "B", side: "red", role: "jungle", won: false },
    ],
    bans: [
      { championName: "Zed", team: "A", side: "blue" },
    ],
  },
  {
    matchId: "t2",
    date: "2024-01-02",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "C",
    redTeam: "D",
    winningTeam: "D",
    picks: [
      { championName: "Garen", team: "C", side: "blue", role: "top", won: false },
      { championName: "Jinx", team: "C", side: "blue", role: "bot", won: false },
      { championName: "Thresh", team: "C", side: "blue", role: "support", won: false },
      { championName: "Orianna", team: "C", side: "blue", role: "mid", won: false },
      { championName: "Vi", team: "C", side: "blue", role: "jungle", won: false },
      { championName: "Darius", team: "D", side: "red", role: "top", won: true },
      { championName: "Caitlyn", team: "D", side: "red", role: "bot", won: true },
      { championName: "Lulu", team: "D", side: "red", role: "support", won: true },
      { championName: "Syndra", team: "D", side: "red", role: "mid", won: true },
      { championName: "Hecarim", team: "D", side: "red", role: "jungle", won: true },
    ],
    bans: [
      { championName: "Zed", team: "C", side: "blue" },
    ],
  },
]

describe("calculateChampionStats", () => {
  const stats = calculateChampionStats(matches)
  const garen = stats.find((s) => s.championName === "Garen")!
  const zed = stats.find((s) => s.championName === "Zed")!

  it("computes picks correctly", () => {
    expect(garen.picks).toBe(2)
  })

  it("computes bans correctly", () => {
    expect(zed.bans).toBe(2)
    expect(zed.picks).toBe(0)
  })

  it("computes pickRate as fraction of total games", () => {
    expect(garen.pickRate).toBeCloseTo(2 / 2)
  })

  it("computes banRate correctly", () => {
    expect(zed.banRate).toBeCloseTo(2 / 2)
  })

  it("computes presence = (picks + bans) / totalGames", () => {
    expect(garen.presence).toBeCloseTo(2 / 2)
    expect(zed.presence).toBeCloseTo(2 / 2)
  })

  it("computes winRate correctly", () => {
    expect(garen.winRate).toBeCloseTo(1 / 2)
  })

  it("returns winRate null when picks = 0", () => {
    expect(zed.winRate).toBeNull()
  })

  it("does not divide by zero with empty matches", () => {
    const empty = calculateChampionStats([])
    expect(empty).toHaveLength(0)
  })

  it("roleDistribution sums to 1 for picked champion", () => {
    const sum = Object.values(garen.roleDistribution).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1)
  })
})
