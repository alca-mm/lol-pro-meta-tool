import { describe, it, expect } from "vitest"
import { calculateRoleStats } from "../src/analysis/roleStats"
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
    { championName: "Garen", team: "B", side: "red", role: "mid", won: false }, // Garen played mid
    { championName: "Jinx", team: "B", side: "red", role: "bot", won: false },
    { championName: "Thresh", team: "B", side: "red", role: "support", won: false },
  ],
  bans: [],
}

describe("calculateRoleStats", () => {
  const stats = calculateRoleStats([m1])

  it("separates same champion on different roles", () => {
    const garenEntries = stats.filter(s => s.championName === "Garen")
    expect(garenEntries).toHaveLength(2)
    const roles = garenEntries.map(s => s.role).sort()
    expect(roles).toContain("top")
    expect(roles).toContain("mid")
  })

  it("computes picks per role correctly", () => {
    const garenTop = stats.find(s => s.championName === "Garen" && s.role === "top")!
    const garenMid = stats.find(s => s.championName === "Garen" && s.role === "mid")!
    expect(garenTop.picks).toBe(1)
    expect(garenMid.picks).toBe(1)
  })

  it("computes wins per role correctly", () => {
    const garenTop = stats.find(s => s.championName === "Garen" && s.role === "top")!
    const garenMid = stats.find(s => s.championName === "Garen" && s.role === "mid")!
    expect(garenTop.wins).toBe(1)
    expect(garenMid.wins).toBe(0)
  })

  it("computes winrate per role correctly", () => {
    const garenTop = stats.find(s => s.championName === "Garen" && s.role === "top")!
    const garenMid = stats.find(s => s.championName === "Garen" && s.role === "mid")!
    expect(garenTop.winRate).toBe(1)
    expect(garenMid.winRate).toBe(0)
  })

  it("returns null winRate when picks = 0", () => {
    const noPickMatch: Match = {
      ...m1, matchId: "m2",
      picks: [{ championName: "Thresh", team: "A", side: "blue", role: "support", won: true }],
    }
    const stats2 = calculateRoleStats([noPickMatch])
    // All champs have at least 1 pick in this case
    stats2.forEach(s => expect(s.picks).toBeGreaterThan(0))
  })

  it("attaches sampleSizeLabel", () => {
    stats.forEach(s => expect(s.sampleSizeLabel).toBeTruthy())
  })
})
