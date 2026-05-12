import { describe, it, expect } from "vitest"
import { calculateRoleMatchups } from "../src/analysis/roleMatchups"
import type { Match } from "../src/domain/types"

const m1: Match = {
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
}

describe("calculateRoleMatchups", () => {
  const matchups = calculateRoleMatchups([m1])

  it("only compares champions of the same role", () => {
    // Garen (top) should only match vs Darius (top), not Hecarim (jng)
    const crossRole = matchups.find(m =>
      (m.championA === "Garen" && m.championB === "Hecarim") ||
      (m.championA === "Hecarim" && m.championB === "Garen")
    )
    expect(crossRole).toBeUndefined()
  })

  it("creates same-role matchup", () => {
    const topMatchup = matchups.find(m =>
      m.role === "top" &&
      ((m.championA === "Darius" && m.championB === "Garen") ||
       (m.championA === "Garen" && m.championB === "Darius"))
    )
    expect(topMatchup).toBeDefined()
  })

  it("assigns correct role to matchup", () => {
    matchups.forEach(m => {
      expect(["top", "jungle", "mid", "bot", "support"]).toContain(m.role)
    })
  })

  it("counts wins for A correctly", () => {
    // Darius < Garen lexicographically → A=Darius, B=Garen
    const mu = matchups.find(m => m.championA === "Darius" && m.championB === "Garen")!
    // Garen won (blue), Darius lost (red) → Darius (A) lost → winsForA = 0
    expect(mu.winsForA).toBe(0)
    expect(mu.lossesForA).toBe(1)
    expect(mu.winRateForA).toBe(0)
  })

  it("matchupScore negative when A loses", () => {
    const mu = matchups.find(m => m.championA === "Darius" && m.championB === "Garen")!
    expect(mu.matchupScore).toBeLessThan(0)
  })

  it("does not produce duplicates", () => {
    const keys = matchups.map(m => `${m.role}|${m.championA}|${m.championB}`)
    expect(keys.length).toBe(new Set(keys).size)
  })
})
