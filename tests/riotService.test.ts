import { describe, it, expect } from "vitest"
import {
    parseRiotId,
    getMyPlayerAccount,
    getTeamRankedMatches,
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
