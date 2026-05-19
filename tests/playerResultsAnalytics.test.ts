import { describe, it, expect } from "vitest"
import { computeChampionStats } from "../src/teams/playerResultsAnalytics"
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
