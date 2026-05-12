import { describe, it, expect } from "vitest"
import { calculateSynergyStats } from "../src/analysis/synergyStats"
import type { Match } from "../src/domain/types"

const matches: Match[] = [
  {
    matchId: "s1",
    date: "2024-01-01",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "A",
    redTeam: "B",
    winningTeam: "A",
    picks: [
      { championName: "Garen", team: "A", side: "blue", role: "top", won: true },
      { championName: "Orianna", team: "A", side: "blue", role: "mid", won: true },
      { championName: "Vi", team: "A", side: "blue", role: "jungle", won: true },
      { championName: "Jinx", team: "A", side: "blue", role: "bot", won: true },
      { championName: "Thresh", team: "A", side: "blue", role: "support", won: true },
      { championName: "Darius", team: "B", side: "red", role: "top", won: false },
      { championName: "Syndra", team: "B", side: "red", role: "mid", won: false },
      { championName: "Hecarim", team: "B", side: "red", role: "jungle", won: false },
      { championName: "Caitlyn", team: "B", side: "red", role: "bot", won: false },
      { championName: "Lulu", team: "B", side: "red", role: "support", won: false },
    ],
    bans: [],
  },
  {
    matchId: "s2",
    date: "2024-01-02",
    tournament: "T",
    patch: "14.1",
    region: "LEC",
    blueTeam: "A",
    redTeam: "C",
    winningTeam: "C",
    picks: [
      { championName: "Garen", team: "A", side: "blue", role: "top", won: false },
      { championName: "Orianna", team: "A", side: "blue", role: "mid", won: false },
      { championName: "Vi", team: "A", side: "blue", role: "jungle", won: false },
      { championName: "Jinx", team: "A", side: "blue", role: "bot", won: false },
      { championName: "Thresh", team: "A", side: "blue", role: "support", won: false },
      { championName: "Jax", team: "C", side: "red", role: "top", won: true },
      { championName: "Azir", team: "C", side: "red", role: "mid", won: true },
      { championName: "Lee Sin", team: "C", side: "red", role: "jungle", won: true },
      { championName: "Aphelios", team: "C", side: "red", role: "bot", won: true },
      { championName: "Nautilus", team: "C", side: "red", role: "support", won: true },
    ],
    bans: [],
  },
]

describe("calculateSynergyStats", () => {
  const synergies = calculateSynergyStats(matches)

  it("generates pairs only within same team", () => {
    // Garen + Darius are on opposite teams — should not appear as synergy pair
    const crossTeam = synergies.find(
      (s) =>
        (s.championA === "Garen" && s.championB === "Darius") ||
        (s.championA === "Darius" && s.championB === "Garen")
    )
    expect(crossTeam).toBeUndefined()
  })

  it("counts gamesTogether correctly for same-team pair", () => {
    const pair = synergies.find(
      (s) =>
        (s.championA === "Garen" && s.championB === "Orianna") ||
        (s.championA === "Orianna" && s.championB === "Garen")
    )
    expect(pair?.gamesTogether).toBe(2)
  })

  it("counts winsTogether correctly", () => {
    const pair = synergies.find(
      (s) =>
        (s.championA === "Garen" && s.championB === "Orianna") ||
        (s.championA === "Orianna" && s.championB === "Garen")
    )
    expect(pair?.winsTogether).toBe(1)
  })

  it("computes winRateTogether correctly", () => {
    const pair = synergies.find(
      (s) =>
        (s.championA === "Garen" && s.championB === "Orianna") ||
        (s.championA === "Orianna" && s.championB === "Garen")
    )
    expect(pair?.winRateTogether).toBeCloseTo(0.5)
  })

  it("synergyScore is deterministic", () => {
    const a = calculateSynergyStats(matches)
    const b = calculateSynergyStats(matches)
    const scoreA = a.find((s) => s.championA === "Garen" || s.championB === "Garen")?.synergyScore
    const scoreB = b.find((s) => s.championA === "Garen" || s.championB === "Garen")?.synergyScore
    expect(scoreA).toBe(scoreB)
  })

  it("produces canonical pair key — no duplicates", () => {
    const keys = synergies.map((s) => `${s.championA}|${s.championB}`)
    const uniqueKeys = new Set(keys)
    expect(keys.length).toBe(uniqueKeys.size)
  })

  it("attaches sampleSizeLabel", () => {
    synergies.forEach((s) => {
      expect(s.sampleSizeLabel).toBeTruthy()
    })
  })
})
