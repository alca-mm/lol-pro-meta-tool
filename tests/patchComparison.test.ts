import { describe, it, expect } from "vitest"
import { comparePatchs, getAvailablePatches } from "../src/analysis/patchComparison"
import type { Match } from "../src/domain/types"

function makeMatch(id: string, patch: string, blueWins: boolean): Match {
  return {
    matchId: id,
    date: "2024-01-01",
    tournament: "T",
    patch,
    region: "LEC",
    blueTeam: "A",
    redTeam: "B",
    winningTeam: blueWins ? "A" : "B",
    picks: [
      { championName: "Garen", team: "A", side: "blue", role: "top", won: blueWins },
      { championName: "Vi", team: "A", side: "blue", role: "jungle", won: blueWins },
      { championName: "Orianna", team: "A", side: "blue", role: "mid", won: blueWins },
      { championName: "Jinx", team: "A", side: "blue", role: "bot", won: blueWins },
      { championName: "Thresh", team: "A", side: "blue", role: "support", won: blueWins },
      { championName: "Darius", team: "B", side: "red", role: "top", won: !blueWins },
      { championName: "Hecarim", team: "B", side: "red", role: "jungle", won: !blueWins },
      { championName: "Syndra", team: "B", side: "red", role: "mid", won: !blueWins },
      { championName: "Caitlyn", team: "B", side: "red", role: "bot", won: !blueWins },
      { championName: "Lulu", team: "B", side: "red", role: "support", won: !blueWins },
    ],
    bans: [],
  }
}

const matchesTwoPatches: Match[] = [
  makeMatch("m1", "14.4", true),
  makeMatch("m2", "14.4", false),
  makeMatch("m3", "14.5", true),
  makeMatch("m4", "14.5", true),
]

describe("getAvailablePatches", () => {
  it("returns all unique patches sorted", () => {
    const patches = getAvailablePatches(matchesTwoPatches)
    expect(patches).toEqual(["14.4", "14.5"])
  })

  it("returns empty array for empty matches", () => {
    expect(getAvailablePatches([])).toHaveLength(0)
  })
})

describe("comparePatchs", () => {
  it("returns entries for champions in either patch", () => {
    const entries = comparePatchs(matchesTwoPatches, "14.4", "14.5")
    expect(entries.length).toBeGreaterThan(0)
  })

  it("computes presence delta correctly", () => {
    const entries = comparePatchs(matchesTwoPatches, "14.4", "14.5")
    const garen = entries.find(e => e.championName === "Garen")!
    // Patch 14.4: 2 matches, 1 pick → pickRate = 0.5, no bans → presence = 0.5
    // Patch 14.5: 2 matches, 1 pick → pickRate = 0.5, no bans → presence = 0.5
    expect(garen.presenceDelta).toBeCloseTo(0)
  })

  it("presence of champion only in patch 2 has positive delta", () => {
    // Add a champion only in patch 14.5
    const extraMatch = makeMatch("m5", "14.5", false)
    extraMatch.picks[0] = { ...extraMatch.picks[0], championName: "NewChamp" }
    const entries = comparePatchs([...matchesTwoPatches, extraMatch], "14.4", "14.5")
    const newChamp = entries.find(e => e.championName === "NewChamp")!
    expect(newChamp.presencePatch1).toBe(0)
    expect(newChamp.presencePatch2).toBeGreaterThan(0)
    expect(newChamp.presenceDelta).toBeGreaterThan(0)
  })

  it("sorts by absolute presence delta descending", () => {
    const entries = comparePatchs(matchesTwoPatches, "14.4", "14.5")
    for (let i = 1; i < entries.length; i++) {
      expect(Math.abs(entries[i - 1].presenceDelta)).toBeGreaterThanOrEqual(Math.abs(entries[i].presenceDelta))
    }
  })

  it("handles missing patches gracefully (no crash)", () => {
    expect(() => comparePatchs(matchesTwoPatches, "99.0", "99.1")).not.toThrow()
  })
})
