import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { validateMatches } from "../src/import/validateMatches"
import type { Match } from "../src/domain/types"

/**
 * Builds a fresh, fully-valid raw match object on every call.
 * Returned as a loosely-typed record so individual tests can mutate
 * fields into invalid states without fighting the TypeScript contract
 * (validateMatches accepts `unknown[]`).
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

describe("validateMatches", () => {
  beforeEach(() => {
    // Drops emit console.warn by design; silence to keep test output clean.
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns a fully valid match unchanged (preserving the Match contract)", () => {
    const raw = validRaw()
    const result = validateMatches([raw])

    expect(result).toHaveLength(1)
    // Same object reference is passed through.
    expect(result[0]).toBe(raw as unknown as Match)
    // All contract fields are preserved verbatim.
    expect(result[0]).toEqual(raw)
    expect(result[0].matchId).toBe("m1")
    expect(result[0].winningTeam).toBe("Blue")
    expect(result[0].picks).toHaveLength(2)
    expect(result[0].bans).toHaveLength(2)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("passes through an array of several valid matches in order", () => {
    const a = validRaw("a")
    const b = validRaw("b")
    const c = validRaw("c")
    const result = validateMatches([a, b, c])

    expect(result).toHaveLength(3)
    expect(result.map((m) => m.matchId)).toEqual(["a", "b", "c"])
  })

  it("returns an empty array for empty input", () => {
    expect(validateMatches([])).toEqual([])
  })

  // ---- each critical missing field causes a drop (not a throw) ----
  for (const field of ["matchId", "date", "tournament", "patch", "region"]) {
    it(`drops a match with a missing/falsy "${field}"`, () => {
      const raw = validRaw()
      raw[field] = ""
      const result = validateMatches([raw])
      expect(result).toHaveLength(0)
      expect(console.warn).toHaveBeenCalled()
    })

    it(`drops a match with "${field}" undefined`, () => {
      const raw = validRaw()
      delete raw[field]
      expect(validateMatches([raw])).toHaveLength(0)
    })
  }

  it("drops a match whose winningTeam is neither blueTeam nor redTeam", () => {
    const raw = validRaw()
    raw.winningTeam = "Green"
    expect(validateMatches([raw])).toHaveLength(0)
  })

  it("accepts a match whose winningTeam equals redTeam", () => {
    const raw = validRaw()
    raw.winningTeam = "Red"
    expect(validateMatches([raw])).toHaveLength(1)
  })

  it("drops a match whose picks is not an array", () => {
    const raw = validRaw()
    raw.picks = "not-an-array"
    expect(validateMatches([raw])).toHaveLength(0)
  })

  it("drops a match containing a pick with an invalid role", () => {
    const raw = validRaw()
    ;(raw.picks as Record<string, unknown>[])[0].role = "carry"
    expect(validateMatches([raw])).toHaveLength(0)
  })

  it("drops a match containing a pick with an invalid side", () => {
    const raw = validRaw()
    ;(raw.picks as Record<string, unknown>[])[1].side = "purple"
    expect(validateMatches([raw])).toHaveLength(0)
  })

  it("accepts all five valid roles", () => {
    const raw = validRaw()
    raw.picks = ["top", "jungle", "mid", "bot", "support"].map((role) => ({
      championName: "X",
      team: "Blue",
      side: "blue",
      role,
      won: true,
    }))
    expect(validateMatches([raw])).toHaveLength(1)
  })

  it("drops a match containing a ban with an invalid side", () => {
    const raw = validRaw()
    ;(raw.bans as Record<string, unknown>[])[0].side = "purple"
    expect(validateMatches([raw])).toHaveLength(0)
  })

  it("accepts a match whose bans field is not an array (bans only validated when an array)", () => {
    const raw = validRaw()
    raw.bans = undefined
    expect(validateMatches([raw])).toHaveLength(1)
  })

  it("keeps only the valid matches from a mixed batch and preserves order", () => {
    const good1 = validRaw("good1")

    const badMissingField = validRaw("badField")
    delete badMissingField.region

    const good2 = validRaw("good2")

    const badWinner = validRaw("badWinner")
    badWinner.winningTeam = "Nobody"

    const badRole = validRaw("badRole")
    ;(badRole.picks as Record<string, unknown>[])[0].role = "support-carry"

    const good3 = validRaw("good3")

    const result = validateMatches([
      good1,
      badMissingField,
      good2,
      badWinner,
      badRole,
      good3,
    ])

    expect(result).toHaveLength(3)
    expect(result.map((m) => m.matchId)).toEqual(["good1", "good2", "good3"])
  })

  // ---- non-object elements must be dropped safely, never throw ----
  describe("non-object array elements", () => {
    it("does not throw and returns [] for a lone null element", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([null])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("does not throw and returns [] for a lone undefined element", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([undefined])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("keeps the single valid match when mixed with null and undefined", () => {
      const good = validRaw("only")
      let result: Match[] = []
      expect(() => {
        result = validateMatches([good, null, undefined])
      }).not.toThrow()
      expect(result).toHaveLength(1)
      expect(result[0].matchId).toBe("only")
    })

    it("preserves the order of surviving valid matches around null/undefined", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([
          validRaw("a"),
          null,
          validRaw("b"),
          undefined,
          validRaw("c"),
        ])
      }).not.toThrow()
      expect(result.map((m) => m.matchId)).toEqual(["a", "b", "c"])
    })

    it("drops primitive elements without throwing", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([42, "x", true])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("drops an array-typed element without throwing", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([[]])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("drops a nested-array element without throwing", () => {
      let result: Match[] = []
      expect(() => {
        result = validateMatches([["picks"]])
      }).not.toThrow()
      expect(result).toEqual([])
    })
  })

  // ---- non-object pick/ban elements must drop the match, never throw ----
  describe("non-object pick/ban elements", () => {
    it("drops (without throwing) a match whose picks array contains a null element", () => {
      const raw = validRaw()
      raw.picks = [null]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
      expect(console.warn).toHaveBeenCalled()
    })

    it("drops (without throwing) a match whose picks array contains an undefined element", () => {
      const raw = validRaw()
      raw.picks = [undefined]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("drops (without throwing) a match whose picks array contains a primitive element", () => {
      const raw = validRaw()
      raw.picks = [42]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("drops (without throwing) a match whose picks array contains an array element", () => {
      const raw = validRaw()
      raw.picks = [["top"]]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("drops (without throwing) a match whose bans array contains a null element", () => {
      const raw = validRaw()
      raw.bans = [null]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
      expect(console.warn).toHaveBeenCalled()
    })

    it("drops (without throwing) a match whose bans array contains a primitive element", () => {
      const raw = validRaw()
      raw.bans = ["Zed"]
      let result: Match[] = []
      expect(() => {
        result = validateMatches([raw])
      }).not.toThrow()
      expect(result).toEqual([])
    })

    it("keeps surrounding valid matches when one has a null pick", () => {
      const a = validRaw("a")
      const bad = validRaw("bad")
      bad.picks = [null]
      const c = validRaw("c")
      let result: Match[] = []
      expect(() => {
        result = validateMatches([a, bad, c])
      }).not.toThrow()
      expect(result.map((m) => m.matchId)).toEqual(["a", "c"])
    })
  })
})
