import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseMatches } from "../src/import/parseMatches"
import type { Match } from "../src/domain/types"

/**
 * Builds a fresh, fully-valid raw match object on every call.
 * Returned loosely typed so individual tests can mutate fields into
 * invalid states without fighting the Match contract (parseMatches
 * accepts `unknown`).
 */
function validRaw(id = "m1"): Record<string, unknown> {
  return {
    matchId: id,
    date: "2024-01-01",
    tournament: "Test Cup",
    patch: "14.1",
    region: "LEC",
    blueTeam: "Blue",
    redTeam: "Red",
    winningTeam: "Blue",
    picks: [
      { championName: "Aatrox", team: "Blue", side: "blue", role: "top", won: true },
      { championName: "Ahri", team: "Red", side: "red", role: "mid", won: false },
    ],
    bans: [
      { championName: "Zed", team: "Blue", side: "blue", banOrder: 1 },
      { championName: "Yasuo", team: "Red", side: "red", banOrder: 2 },
    ],
  }
}

describe("parseMatches", () => {
  beforeEach(() => {
    // The non-array path and per-match drops emit console.warn by design;
    // silence to keep test output pristine.
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("accepts and returns a valid array of well-formed matches", () => {
    const a = validRaw("a")
    const b = validRaw("b")
    const result = parseMatches([a, b])

    expect(result).toHaveLength(2)
    expect(result.map((m) => m.matchId)).toEqual(["a", "b"])
    // Valid matches are passed through by reference (delegated to validateMatches).
    expect(result[0]).toBe(a as unknown as Match)
    expect(result[0]).toEqual(a)
    expect(result[0].picks).toHaveLength(2)
    expect(result[0].bans).toHaveLength(2)
    // No drops -> no warnings for a fully valid batch.
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("returns an empty array for empty input", () => {
    expect(parseMatches([])).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })

  // ---- non-array inputs return [] safely (and warn once) ----
  const nonArrayCases: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["a plain object", { matchId: "x" }],
    ["a number", 42],
    ["a string", "not-an-array"],
    ["a boolean", true],
  ]

  for (const [label, input] of nonArrayCases) {
    it(`returns [] without throwing for non-array input: ${label}`, () => {
      let result: Match[] = []
      expect(() => {
        result = parseMatches(input)
      }).not.toThrow()
      expect(result).toEqual([])
      // The non-array branch warns exactly once.
      expect(console.warn).toHaveBeenCalledTimes(1)
      expect(console.warn).toHaveBeenCalledWith(
        "parseMatches: Eingabe ist kein Array",
      )
    })
  }

  it("keeps only the valid entries from a partially-invalid array (mirrors validateMatches)", () => {
    const good1 = validRaw("good1")

    const badMissingField = validRaw("badField")
    delete badMissingField.region

    const good2 = validRaw("good2")

    const badWinner = validRaw("badWinner")
    badWinner.winningTeam = "Nobody"

    const badRole = validRaw("badRole")
    ;(badRole.picks as Record<string, unknown>[])[0].role = "carry"

    const result = parseMatches([
      good1,
      badMissingField,
      good2,
      badWinner,
      badRole,
    ])

    expect(result).toHaveLength(2)
    expect(result.map((m) => m.matchId)).toEqual(["good1", "good2"])
  })

  it("does not crash on entries with missing or garbage fields", () => {
    const garbage = [
      {}, // no fields at all
      { matchId: "only-id" }, // missing the rest
      { matchId: 123, date: {}, tournament: [], patch: null, region: 0 }, // garbage types
      { ...validRaw("bad-picks"), picks: "not-an-array" }, // picks not array
      42, // primitive entry (m.matchId -> undefined, falsy, dropped)
      "stray-string", // primitive entry
    ]

    let result: Match[] = []
    expect(() => {
      result = parseMatches(garbage)
    }).not.toThrow()
    // None of the garbage entries satisfies the required-field checks.
    expect(result).toEqual([])
  })

  it("keeps valid matches even when garbage entries are interleaved", () => {
    const good = validRaw("survivor")
    const result = parseMatches([{}, good, 7, { matchId: "x" }])

    expect(result).toHaveLength(1)
    expect(result[0].matchId).toBe("survivor")
  })
})
