import { describe, it, expect } from "vitest"
import {
    computeChampionStats,
    applyLastNFilter,
    applyScopeFilter,
    calculateRecentForm,
    getBestChampionStats,
    getNeedsReviewChampionStats,
} from "../src/teams/playerResultsAnalytics"
import type { RankedMatch } from "../src/teams/riotService"

function makeMatch(overrides: Partial<RankedMatch> = {}): RankedMatch {
    return {
        id:               "id",
        team_id:          "t1",
        puuid:            "p1",
        match_id:         "m1",
        queue_id:         420,
        champion_name:    "Aatrox",
        win:              true,
        kills:            5,
        deaths:           2,
        assists:          3,
        game_duration:    1800,
        game_start:       "2024-01-01T00:00:00Z",
        role:             null,
        lane:             null,
        cs:               180,
        vision_score:     25,
        damage_to_champs: 30000,
        gold_earned:      12000,
        created_at:       "2024-01-01T00:00:00Z",
        ...overrides,
    }
}

describe("computeChampionStats", () => {
    it("returns empty array for empty input", () => {
        expect(computeChampionStats([])).toEqual([])
    })

    it("returns one entry for a single match", () => {
        const result = computeChampionStats([makeMatch()])
        expect(result).toHaveLength(1)
        expect(result[0].championName).toBe("Aatrox")
        expect(result[0].games).toBe(1)
        expect(result[0].wins).toBe(1)
        expect(result[0].losses).toBe(0)
    })

    it("calculates win rate correctly", () => {
        const matches = [
            makeMatch({ match_id: "m1", win: true }),
            makeMatch({ match_id: "m2", win: true }),
            makeMatch({ match_id: "m3", win: false }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.winRate).toBeCloseTo(2 / 3, 5)
        expect(r.wins).toBe(2)
        expect(r.losses).toBe(1)
        expect(r.games).toBe(3)
    })

    it("aggregates separate champions into separate entries", () => {
        const matches = [
            makeMatch({ match_id: "m1", champion_name: "Aatrox" }),
            makeMatch({ match_id: "m2", champion_name: "Zed" }),
            makeMatch({ match_id: "m3", champion_name: "Aatrox" }),
        ]
        const result = computeChampionStats(matches)
        expect(result).toHaveLength(2)
        expect(result.find((r) => r.championName === "Aatrox")!.games).toBe(2)
        expect(result.find((r) => r.championName === "Zed")!.games).toBe(1)
    })

    it("sorts by games descending, then alphabetically", () => {
        const matches = [
            makeMatch({ match_id: "m1", champion_name: "Aatrox" }),
            makeMatch({ match_id: "m2", champion_name: "Zed" }),
            makeMatch({ match_id: "m3", champion_name: "Zed" }),
        ]
        const result = computeChampionStats(matches)
        expect(result[0].championName).toBe("Zed")
        expect(result[1].championName).toBe("Aatrox")
    })

    it("sorts alphabetically as tiebreaker when games are equal", () => {
        const matches = [
            makeMatch({ match_id: "m1", champion_name: "Zed" }),
            makeMatch({ match_id: "m2", champion_name: "Aatrox" }),
        ]
        const result = computeChampionStats(matches)
        expect(result[0].championName).toBe("Aatrox")
        expect(result[1].championName).toBe("Zed")
    })

    it("computes avgKda as (kills + assists) / max(deaths, 1)", () => {
        const [r] = computeChampionStats([makeMatch({ kills: 10, deaths: 4, assists: 6 })])
        expect(r.avgKda).toBeCloseTo((10 + 6) / 4, 5)
    })

    it("uses deaths=1 as floor for avgKda when deaths is 0", () => {
        const [r] = computeChampionStats([makeMatch({ kills: 5, deaths: 0, assists: 3 })])
        expect(r.avgKda).toBeCloseTo(8 / 1, 5)
    })

    it("computes avgKda across multiple games using totals", () => {
        const matches = [
            makeMatch({ match_id: "m1", kills: 4, deaths: 2, assists: 6 }),
            makeMatch({ match_id: "m2", kills: 6, deaths: 2, assists: 2 }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.avgKda).toBeCloseTo((4 + 6 + 6 + 2) / (2 + 2), 5)
    })

    it("computes per-minute stats from totals divided by total duration", () => {
        const matches = [
            makeMatch({ match_id: "m1", cs: 180, damage_to_champs: 30000, gold_earned: 12000, game_duration: 1800 }),
            makeMatch({ match_id: "m2", cs: 120, damage_to_champs: 20000, gold_earned: 8000,  game_duration: 1200 }),
        ]
        const [r] = computeChampionStats(matches)
        const totalMins = (1800 + 1200) / 60
        expect(r.csPerMinute).toBeCloseTo(300 / totalMins, 5)
        expect(r.damagePerMinute).toBeCloseTo(50000 / totalMins, 5)
        expect(r.goldPerMinute).toBeCloseTo(20000 / totalMins, 5)
    })

    it("counts soloQ and flexQ games correctly", () => {
        const matches = [
            makeMatch({ match_id: "m1", queue_id: 420 }),
            makeMatch({ match_id: "m2", queue_id: 420 }),
            makeMatch({ match_id: "m3", queue_id: 440 }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.soloqGames).toBe(2)
        expect(r.flexqGames).toBe(1)
    })

    it("does not count other queue types in soloQ or flexQ", () => {
        const matches = [
            makeMatch({ match_id: "m1", queue_id: 450 }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.soloqGames).toBe(0)
        expect(r.flexqGames).toBe(0)
    })

    it("sets lastPlayedAt to the most recent game_start", () => {
        const matches = [
            makeMatch({ match_id: "m1", game_start: "2024-01-01T00:00:00Z" }),
            makeMatch({ match_id: "m2", game_start: "2024-01-03T00:00:00Z" }),
            makeMatch({ match_id: "m3", game_start: "2024-01-02T00:00:00Z" }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.lastPlayedAt).toBe("2024-01-03T00:00:00Z")
    })

    it("sets lastPlayedAt to null for empty input", () => {
        expect(computeChampionStats([])).toEqual([])
    })

    it("computes avg kills, deaths, assists per game", () => {
        const matches = [
            makeMatch({ match_id: "m1", kills: 4, deaths: 2, assists: 6 }),
            makeMatch({ match_id: "m2", kills: 8, deaths: 4, assists: 2 }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.avgKills).toBeCloseTo(6, 5)
        expect(r.avgDeaths).toBeCloseTo(3, 5)
        expect(r.avgAssists).toBeCloseTo(4, 5)
    })

    it("exposes total kills, deaths, assists", () => {
        const matches = [
            makeMatch({ match_id: "m1", kills: 4, deaths: 2, assists: 6 }),
            makeMatch({ match_id: "m2", kills: 8, deaths: 4, assists: 2 }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.kills).toBe(12)
        expect(r.deaths).toBe(6)
        expect(r.assists).toBe(8)
    })

    it("winRate is 0 when no wins", () => {
        const [r] = computeChampionStats([makeMatch({ win: false })])
        expect(r.winRate).toBe(0)
    })

    it("winRate is 1 when all wins", () => {
        const matches = [
            makeMatch({ match_id: "m1", win: true }),
            makeMatch({ match_id: "m2", win: true }),
        ]
        const [r] = computeChampionStats(matches)
        expect(r.winRate).toBe(1)
    })
})

describe("applyLastNFilter", () => {
    const ms = [
        makeMatch({ match_id: "m1" }),
        makeMatch({ match_id: "m2" }),
        makeMatch({ match_id: "m3" }),
    ]

    it("returns all matches when limit is 'all'", () => {
        expect(applyLastNFilter(ms, "all")).toHaveLength(3)
    })

    it("returns first N matches when limit is a number", () => {
        expect(applyLastNFilter(ms, 2)).toHaveLength(2)
        expect(applyLastNFilter(ms, 2)[0].match_id).toBe("m1")
    })

    it("returns all when N exceeds total", () => {
        expect(applyLastNFilter(ms, 50)).toHaveLength(3)
    })

    it("returns empty array for empty input", () => {
        expect(applyLastNFilter([], 10)).toHaveLength(0)
    })
})

describe("calculateRecentForm", () => {
    it("returns zeros for empty input", () => {
        const r = calculateRecentForm([])
        expect(r.games).toBe(0)
        expect(r.winRate).toBe(0)
        expect(r.form).toEqual([])
    })

    it("uses at most `count` matches", () => {
        const ms = [
            makeMatch({ match_id: "m1", win: true }),
            makeMatch({ match_id: "m2", win: false }),
            makeMatch({ match_id: "m3", win: true }),
        ]
        const r = calculateRecentForm(ms, 2)
        expect(r.games).toBe(2)
        expect(r.form).toEqual(["W", "L"])
    })

    it("calculates win rate correctly", () => {
        const ms = [
            makeMatch({ match_id: "m1", win: true }),
            makeMatch({ match_id: "m2", win: false }),
        ]
        expect(calculateRecentForm(ms).winRate).toBeCloseTo(0.5, 5)
    })

    it("builds form array in order (newest-first as input)", () => {
        const ms = [
            makeMatch({ match_id: "m1", win: true }),
            makeMatch({ match_id: "m2", win: true }),
            makeMatch({ match_id: "m3", win: false }),
        ]
        expect(calculateRecentForm(ms).form).toEqual(["W", "W", "L"])
    })

    it("uses max(deaths,1) floor for avgKda", () => {
        const ms = [makeMatch({ kills: 5, deaths: 0, assists: 3 })]
        expect(calculateRecentForm(ms).avgKda).toBeCloseTo(8, 5)
    })

    it("computes per-minute stats across the window", () => {
        const ms = [
            makeMatch({ match_id: "m1", cs: 120, damage_to_champs: 20000, game_duration: 1200 }),
            makeMatch({ match_id: "m2", cs: 180, damage_to_champs: 30000, game_duration: 1800 }),
        ]
        const r = calculateRecentForm(ms)
        const mins = (1200 + 1800) / 60
        expect(r.csPerMinute).toBeCloseTo(300 / mins, 5)
        expect(r.damagePerMinute).toBeCloseTo(50000 / mins, 5)
    })
})

describe("getBestChampionStats", () => {
    it("returns empty array for empty input", () => {
        expect(getBestChampionStats([])).toEqual([])
    })

    it("sorts by winRate descending", () => {
        const stats = computeChampionStats([
            makeMatch({ match_id: "m1", champion_name: "A", win: false }),
            makeMatch({ match_id: "m2", champion_name: "A", win: false }),
            makeMatch({ match_id: "m3", champion_name: "B", win: true }),
            makeMatch({ match_id: "m4", champion_name: "B", win: true }),
        ])
        const best = getBestChampionStats(stats)
        expect(best[0].championName).toBe("B")
    })

    it("returns at most `limit` entries", () => {
        const stats = computeChampionStats([
            makeMatch({ match_id: "m1", champion_name: "A", win: true }),
            makeMatch({ match_id: "m2", champion_name: "A", win: true }),
            makeMatch({ match_id: "m3", champion_name: "B", win: true }),
            makeMatch({ match_id: "m4", champion_name: "B", win: true }),
            makeMatch({ match_id: "m5", champion_name: "C", win: false }),
            makeMatch({ match_id: "m6", champion_name: "C", win: false }),
            makeMatch({ match_id: "m7", champion_name: "D", win: false }),
            makeMatch({ match_id: "m8", champion_name: "D", win: false }),
        ])
        expect(getBestChampionStats(stats, 3)).toHaveLength(3)
    })

    it("prefers champions with 2+ games when available", () => {
        const stats = computeChampionStats([
            makeMatch({ match_id: "m1", champion_name: "Solo", win: true }),   // 1 game
            makeMatch({ match_id: "m2", champion_name: "Multi", win: false }), // 2 games, lower wr
            makeMatch({ match_id: "m3", champion_name: "Multi", win: false }),
        ])
        const best = getBestChampionStats(stats, 1)
        expect(best[0].championName).toBe("Multi")
    })
})

describe("applyScopeFilter", () => {
    const ms = [
        makeMatch({ match_id: "m1", puuid: "p1" }),
        makeMatch({ match_id: "m2", puuid: "p2" }),
        makeMatch({ match_id: "m3", puuid: "p1" }),
    ]

    it("returns all matches for scope 'team'", () => {
        expect(applyScopeFilter(ms, "team")).toHaveLength(3)
    })

    it("returns empty array for empty input", () => {
        expect(applyScopeFilter([], "p1")).toHaveLength(0)
    })

    it("filters to only matches with the given puuid", () => {
        const result = applyScopeFilter(ms, "p1")
        expect(result).toHaveLength(2)
        expect(result.every((m) => m.puuid === "p1")).toBe(true)
    })

    it("returns empty array when puuid does not exist", () => {
        expect(applyScopeFilter(ms, "unknown-puuid")).toHaveLength(0)
    })

    it("returns only the single match for a puuid with one game", () => {
        const result = applyScopeFilter(ms, "p2")
        expect(result).toHaveLength(1)
        expect(result[0].match_id).toBe("m2")
    })
})

describe("getNeedsReviewChampionStats", () => {
    it("returns empty array for empty input", () => {
        expect(getNeedsReviewChampionStats([])).toEqual([])
    })

    it("sorts by winRate ascending", () => {
        const stats = computeChampionStats([
            makeMatch({ match_id: "m1", champion_name: "Good", win: true }),
            makeMatch({ match_id: "m2", champion_name: "Good", win: true }),
            makeMatch({ match_id: "m3", champion_name: "Bad", win: false }),
            makeMatch({ match_id: "m4", champion_name: "Bad", win: false }),
        ])
        const worst = getNeedsReviewChampionStats(stats, 1)
        expect(worst[0].championName).toBe("Bad")
    })

    it("returns at most `limit` entries", () => {
        const stats = computeChampionStats([
            makeMatch({ match_id: "m1", champion_name: "A", win: false }),
            makeMatch({ match_id: "m2", champion_name: "A", win: false }),
            makeMatch({ match_id: "m3", champion_name: "B", win: false }),
            makeMatch({ match_id: "m4", champion_name: "B", win: false }),
        ])
        expect(getNeedsReviewChampionStats(stats, 1)).toHaveLength(1)
    })
})
