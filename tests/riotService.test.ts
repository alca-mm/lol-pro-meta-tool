import { describe, it, expect } from "vitest"
import {
    parseRiotId,
    buildPageStarts,
    computeMoreMayBeAvailable,
    getMyPlayerAccount,
    getTeamRankedMatches,
    formatGameDuration,
    filterMatches,
    type RankedMatch,
} from "../src/teams/riotService"

describe("parseRiotId", () => {
    it("parses valid Riot ID into gameName and tagLine", () => {
        const result = parseRiotId("mmmmicrocontroler#EUW")
        expect(result).toEqual({ gameName: "mmmmicrocontroler", tagLine: "EUW" })
    })

    it("returns null for input without #", () => {
        expect(parseRiotId("nohashtag")).toBeNull()
    })

    it("returns null for empty string", () => {
        expect(parseRiotId("")).toBeNull()
    })

    it("returns null when gameName is empty", () => {
        expect(parseRiotId("#EUW")).toBeNull()
    })

    it("returns null when tagLine is empty", () => {
        expect(parseRiotId("Player#")).toBeNull()
    })

    it("handles spaces in gameName correctly", () => {
        const result = parseRiotId("My Player#EUW1")
        expect(result).toEqual({ gameName: "My Player", tagLine: "EUW1" })
    })
})

describe("buildPageStarts", () => {
    it("returns [0, 20, 40] for maxPages=3 pageSize=20", () => {
        expect(buildPageStarts(3, 20)).toEqual([0, 20, 40])
    })

    it("max 60 IDs total: 3 pages × 20 = starts cover exactly [0,20,40]", () => {
        const starts = buildPageStarts(3, 20)
        expect(starts.length).toBe(3)
        expect(starts[starts.length - 1] + 20).toBe(60) // last page ends at 60
    })

    it("returns [0] for maxPages=1", () => {
        expect(buildPageStarts(1, 20)).toEqual([0])
    })

    it("returns empty array for maxPages=0", () => {
        expect(buildPageStarts(0, 20)).toEqual([])
    })
})

describe("computeMoreMayBeAvailable", () => {
    it("false when maxPagesReached is false", () => {
        expect(computeMoreMayBeAvailable(false, 20, 20, 5)).toBe(false)
    })

    it("false when last page was partial (less than pageSize)", () => {
        expect(computeMoreMayBeAvailable(true, 15, 20, 5)).toBe(false)
    })

    it("false when all IDs on last page were already known (unknownOnLastPage=0)", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 0)).toBe(false)
    })

    it("true when maxPagesReached, full last page, and some IDs unknown", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 3)).toBe(true)
    })

    it("true even when only 1 unknown ID on last page", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 1)).toBe(true)
    })
})

describe("getMyPlayerAccount", () => {
    it("returns null when supabase is not configured", async () => {
        const result = await getMyPlayerAccount("team-id", "user-id")
        expect(result).toBeNull()
    })
})

describe("getTeamRankedMatches", () => {
    it("returns empty array when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123")
        expect(result).toEqual([])
    })

    it("returns empty array with custom limit when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123", 5)
        expect(result).toEqual([])
    })
})

describe("formatGameDuration", () => {
    it("formats 0 seconds as 0:00", () => {
        expect(formatGameDuration(0)).toBe("0:00")
    })

    it("formats 90 seconds as 1:30", () => {
        expect(formatGameDuration(90)).toBe("1:30")
    })

    it("pads seconds below 10 with a leading zero", () => {
        expect(formatGameDuration(65)).toBe("1:05")
    })

    it("formats a typical game of 1800 seconds as 30:00", () => {
        expect(formatGameDuration(1800)).toBe("30:00")
    })

    it("formats 2145 seconds as 35:45", () => {
        expect(formatGameDuration(2145)).toBe("35:45")
    })
})

function makeMatch(overrides: Partial<RankedMatch>): RankedMatch {
    return {
        id: "id",
        team_id: "t1",
        puuid: "p1",
        match_id: "m1",
        queue_id: 420,
        champion_name: "Aatrox",
        win: true,
        kills: 5,
        deaths: 2,
        assists: 3,
        game_duration: 1800,
        game_start: "2024-01-01T00:00:00Z",
        role: null,
        lane: null,
        cs: 180,
        vision_score: 25,
        damage_to_champs: 30000,
        gold_earned: 12000,
        created_at: "2024-01-01T00:00:00Z",
        ...overrides,
    }
}

describe("filterMatches", () => {
    const matches: RankedMatch[] = [
        makeMatch({ match_id: "m1", queue_id: 420, puuid: "p1", win: true }),
        makeMatch({ match_id: "m2", queue_id: 440, puuid: "p1", win: false }),
        makeMatch({ match_id: "m3", queue_id: 420, puuid: "p2", win: true }),
        makeMatch({ match_id: "m4", queue_id: 420, puuid: "p1", win: false }),
    ]

    it("returns all matches when filter is empty", () => {
        expect(filterMatches(matches, {})).toHaveLength(4)
    })

    it("filters by queueId", () => {
        const result = filterMatches(matches, { queueId: 420 })
        expect(result).toHaveLength(3)
        expect(result.every((m) => m.queue_id === 420)).toBe(true)
    })

    it("filters by puuid", () => {
        const result = filterMatches(matches, { puuid: "p2" })
        expect(result).toHaveLength(1)
        expect(result[0].match_id).toBe("m3")
    })

    it("filters by win=true", () => {
        const result = filterMatches(matches, { win: true })
        expect(result).toHaveLength(2)
        expect(result.every((m) => m.win)).toBe(true)
    })

    it("filters by win=false", () => {
        const result = filterMatches(matches, { win: false })
        expect(result).toHaveLength(2)
        expect(result.every((m) => !m.win)).toBe(true)
    })

    it("combines multiple filter criteria", () => {
        const result = filterMatches(matches, { queueId: 420, puuid: "p1" })
        expect(result).toHaveLength(2)
        expect(result.map((m) => m.match_id)).toEqual(["m1", "m4"])
    })

    it("returns empty array when no matches pass filter", () => {
        expect(filterMatches(matches, { queueId: 450 })).toHaveLength(0)
    })
})
