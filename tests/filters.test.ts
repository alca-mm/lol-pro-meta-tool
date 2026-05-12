import { describe, it, expect } from "vitest"
import { applyFilters } from "../src/analysis/filters"
import type { Match, FilterState } from "../src/domain/types"

const base: Pick<Match, "picks" | "bans"> = {
  picks: [],
  bans: [],
}

const matches: Match[] = [
  { matchId: "f1", date: "2024-01-01", tournament: "Spring", patch: "14.4", region: "LEC", blueTeam: "A", redTeam: "B", winningTeam: "A", ...base },
  { matchId: "f2", date: "2024-01-02", tournament: "Spring", patch: "14.4", region: "LCK", blueTeam: "C", redTeam: "D", winningTeam: "D", ...base },
  { matchId: "f3", date: "2024-01-03", tournament: "Worlds", patch: "14.5", region: "LEC", blueTeam: "A", redTeam: "C", winningTeam: "A", ...base },
  { matchId: "f4", date: "2024-01-04", tournament: "Worlds", patch: "14.5", region: "LCK", blueTeam: "B", redTeam: "D", winningTeam: "B", ...base },
]

const noFilter: FilterState = { patch: null, region: null, tournament: null, role: null, minPicks: 1 }

describe("applyFilters", () => {
  it("returns all matches when no filters are set", () => {
    expect(applyFilters(matches, noFilter)).toHaveLength(4)
  })

  it("filters by patch", () => {
    const result = applyFilters(matches, { ...noFilter, patch: "14.4" })
    expect(result).toHaveLength(2)
    result.forEach((m) => expect(m.patch).toBe("14.4"))
  })

  it("filters by region", () => {
    const result = applyFilters(matches, { ...noFilter, region: "LCK" })
    expect(result).toHaveLength(2)
    result.forEach((m) => expect(m.region).toBe("LCK"))
  })

  it("filters by tournament", () => {
    const result = applyFilters(matches, { ...noFilter, tournament: "Worlds" })
    expect(result).toHaveLength(2)
    result.forEach((m) => expect(m.tournament).toBe("Worlds"))
  })

  it("combines patch and region filters", () => {
    const result = applyFilters(matches, { ...noFilter, patch: "14.5", region: "LEC" })
    expect(result).toHaveLength(1)
    expect(result[0].matchId).toBe("f3")
  })

  it("returns empty array when no matches pass filter", () => {
    const result = applyFilters(matches, { ...noFilter, patch: "99.0" })
    expect(result).toHaveLength(0)
  })

  it("handles empty match array", () => {
    expect(applyFilters([], noFilter)).toHaveLength(0)
  })
})
