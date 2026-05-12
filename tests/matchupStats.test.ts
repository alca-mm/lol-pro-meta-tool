import { describe, it, expect } from "vitest"
import { calculateMatchupStats } from "../src/analysis/matchupStats"
import type { Match } from "../src/domain/types"

const matches: Match[] = [
  {
    matchId: "m1",
    date: "2024-01-01",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "A",
    redTeam: "B",
    winningTeam: "A",
    picks: [
      { championName: "Garen", team: "A", side: "blue", role: "top", won: true },
      { championName: "Vi", team: "A", side: "blue", role: "jungle", won: true },
      { championName: "Orianna", team: "A", side: "blue", role: "mid", won: true },
      { championName: "Jinx", team: "A", side: "blue", role: "bot", won: true },
      { championName: "Thresh", team: "A", side: "blue", role: "support", won: true },
      { championName: "Darius", team: "B", side: "red", role: "top", won: false },
      { championName: "Hecarim", team: "B", side: "red", role: "jungle", won: false },
      { championName: "Syndra", team: "B", side: "red", role: "mid", won: false },
      { championName: "Caitlyn", team: "B", side: "red", role: "bot", won: false },
      { championName: "Lulu", team: "B", side: "red", role: "support", won: false },
    ],
    bans: [],
  },
  {
    matchId: "m2",
    date: "2024-01-02",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "B",
    redTeam: "A",
    winningTeam: "B",
    picks: [
      { championName: "Darius", team: "B", side: "blue", role: "top", won: true },
      { championName: "Hecarim", team: "B", side: "blue", role: "jungle", won: true },
      { championName: "Syndra", team: "B", side: "blue", role: "mid", won: true },
      { championName: "Caitlyn", team: "B", side: "blue", role: "bot", won: true },
      { championName: "Lulu", team: "B", side: "blue", role: "support", won: true },
      { championName: "Garen", team: "A", side: "red", role: "top", won: false },
      { championName: "Vi", team: "A", side: "red", role: "jungle", won: false },
      { championName: "Orianna", team: "A", side: "red", role: "mid", won: false },
      { championName: "Jinx", team: "A", side: "red", role: "bot", won: false },
      { championName: "Thresh", team: "A", side: "red", role: "support", won: false },
    ],
    bans: [],
  },
]

describe("calculateMatchupStats", () => {
  const matchups = calculateMatchupStats(matches)

  it("champion names are canonically sorted (lexicographic)", () => {
    matchups.forEach((m) => {
      expect(m.championA <= m.championB).toBe(true)
    })
  })

  it("counts gamesAgainst correctly", () => {
    // Garen vs Darius appear in both matches
    const mu = matchups.find(
      (m) =>
        (m.championA === "Darius" && m.championB === "Garen") ||
        (m.championA === "Garen" && m.championB === "Darius")
    )
    expect(mu?.gamesAgainst).toBe(2)
  })

  it("counts winsForA correctly regardless of side", () => {
    // Garen won m1 (blue), lost m2 (red). Darius < Garen → A=Darius
    const mu = matchups.find((m) => m.championA === "Darius" && m.championB === "Garen")!
    // Darius lost m1, won m2 → winsForA = 1
    expect(mu.winsForA).toBe(1)
    expect(mu.lossesForA).toBe(1)
    expect(mu.winRateForA).toBeCloseTo(0.5)
  })

  it("matchupScore is positive when A wins more", () => {
    // Create an asymmetric fixture
    const singleMatch: Match[] = [matches[0]]
    const mu = calculateMatchupStats(singleMatch)
    // Darius (A) lost this match → score should be negative
    const dm = mu.find((m) => m.championA === "Darius" && m.championB === "Garen")
    if (dm) expect(dm.matchupScore).toBeLessThan(0)
  })

  it("does not produce duplicate entries", () => {
    const keys = matchups.map((m) => `${m.championA}|${m.championB}`)
    const uniqueKeys = new Set(keys)
    expect(keys.length).toBe(uniqueKeys.size)
  })

  it("attaches sampleSizeLabel", () => {
    matchups.forEach((m) => {
      expect(m.sampleSizeLabel).toBeTruthy()
    })
  })
})
