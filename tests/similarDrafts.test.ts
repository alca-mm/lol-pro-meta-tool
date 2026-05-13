import { describe, it, expect } from "vitest"
import { findSimilarDrafts } from "../src/draft/similarDrafts"
import type { PickSlot } from "../src/draft/types"
import { makeMatch } from "./helpers/matchFixtures"
import type { Match } from "../src/domain/types"

const pick = (championName: string, side: "blue" | "red"): Match["picks"][number] => ({
    championName,
    team: side === "blue" ? "TeamA" : "TeamB",
    side,
    role: "mid",
    won: side === "blue",
})

const ban = (championName: string, side: "blue" | "red"): Match["bans"][number] => ({
    championName,
    team: side === "blue" ? "TeamA" : "TeamB",
    side,
})

const slot = (championName: string): PickSlot => ({ championName, role: null })
const emptySlots = (): PickSlot[] => Array.from({ length: 5 }, () => slot(""))

describe("findSimilarDrafts", () => {
    it("returns empty when no picks are entered", () => {
        const match = makeMatch("m1", [pick("Ahri", "blue")])
        const result = findSimilarDrafts({
            matches: [match],
            bluePicks: emptySlots(),
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })
        expect(result).toHaveLength(0)
    })

    it("returns empty when matches array is empty", () => {
        const result = findSimilarDrafts({
            matches: [],
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })
        expect(result).toHaveLength(0)
    })

    it("finds a match that shares a blue pick", () => {
        const match = makeMatch("m1", [pick("Ahri", "blue"), pick("Viktor", "red")])
        const result = findSimilarDrafts({
            matches: [match],
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })
        expect(result).toHaveLength(1)
        expect(result[0].match.matchId).toBe("m1")
        expect(result[0].matchedBluePicks).toContain("ahri")
    })

    it("does not match a blue pick against the red side", () => {
        // Ahri is on red side in the match but we look for Ahri on blue side
        const match = makeMatch("m1", [pick("Ahri", "red"), pick("Viktor", "blue")])
        const result = findSimilarDrafts({
            matches: [match],
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })
        expect(result).toHaveLength(0)
    })

    it("exact full match scores 1.0", () => {
        const bluePicks: PickSlot[] = ["Yorick", "XinZhao", "TwistedFate", "Ashe", "Lulu"].map(slot)
        const redPicks: PickSlot[] = ["Rumble", "Trundle", "Sylas", "Caitlyn", "Seraphine"].map(slot)
        const blueBans = ["Orianna", "Karma", "JarvanIV", "Ezreal", "MissFortune"]
        const redBans = ["Nocturne", "Bard", "Varus", "Azir", "Anivia"]

        const match = makeMatch(
            "t1-dplus",
            [
                ...bluePicks.map((s) => pick(s.championName, "blue")),
                ...redPicks.map((s) => pick(s.championName, "red")),
            ],
            [
                ...blueBans.map((name) => ban(name, "blue")),
                ...redBans.map((name) => ban(name, "red")),
            ],
        )

        const result = findSimilarDrafts({
            matches: [match],
            bluePicks,
            redPicks,
            blueBans,
            redBans,
        })

        expect(result).toHaveLength(1)
        expect(result[0].score).toBeCloseTo(1.0, 5)
    })

    it("deduplicated results contain no matchId more than once", () => {
        const match = makeMatch("m1", [pick("Ahri", "blue"), pick("Viktor", "red")])
        // Same match object repeated 10 times (simulating patch weighting)
        const duplicatedMatches = Array.from({ length: 10 }, () => match)

        const result = findSimilarDrafts({
            matches: duplicatedMatches,
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })

        const ids = result.map((r) => r.match.matchId)
        expect(ids).toHaveLength(1)
        expect(ids[0]).toBe("m1")
    })

    it("exact match ranks above partial match even when partial appears many times", () => {
        const exactMatch = makeMatch(
            "exact",
            [pick("Ahri", "blue"), pick("Viktor", "blue"), pick("Thresh", "red")],
        )
        // Partial match: only Ahri on blue, repeated 10 times
        const partialMatch = makeMatch("partial", [pick("Ahri", "blue"), pick("Zed", "red")])
        const duplicatedPartials = Array.from({ length: 10 }, () => partialMatch)

        const result = findSimilarDrafts({
            matches: [...duplicatedPartials, exactMatch],
            bluePicks: [slot("Ahri"), slot("Viktor"), ...emptySlots().slice(2)],
            redPicks: [slot("Thresh"), ...emptySlots().slice(1)],
            blueBans: [],
            redBans: [],
            limit: 5,
        })

        expect(result[0].match.matchId).toBe("exact")
    })

    it("score is proportional to number of matched picks", () => {
        const match2 = makeMatch("m2", [pick("Ahri", "blue"), pick("Zed", "blue")])
        const match1 = makeMatch("m1", [pick("Ahri", "blue"), pick("Viktor", "blue")])

        const result = findSimilarDrafts({
            matches: [match2, match1],
            bluePicks: [slot("Ahri"), slot("Viktor"), ...emptySlots().slice(2)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })

        const m2res = result.find((r) => r.match.matchId === "m2")!
        const m1res = result.find((r) => r.match.matchId === "m1")!
        expect(m1res.score).toBeGreaterThan(m2res.score)
    })

    it("ban overlap contributes to score but less than pick overlap", () => {
        const matchWithPick = makeMatch("pick-match", [pick("Ahri", "blue")])
        const matchWithBan = makeMatch("ban-match", [], [ban("Ahri", "blue")])

        const result = findSimilarDrafts({
            matches: [matchWithPick, matchWithBan],
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: ["Ahri"],
            redBans: [],
        })

        const pickResult = result.find((r) => r.match.matchId === "pick-match")!
        const banResult = result.find((r) => r.match.matchId === "ban-match")!

        expect(pickResult.score).toBeGreaterThan(banResult.score)
    })

    it("result is sorted by score descending", () => {
        const matches = [
            makeMatch("m1", [pick("Ahri", "blue")]),
            makeMatch("m2", [pick("Ahri", "blue"), pick("Viktor", "blue")]),
            makeMatch("m3", [pick("Zed", "blue")]),
        ]
        const result = findSimilarDrafts({
            matches,
            bluePicks: [slot("Ahri"), slot("Viktor"), ...emptySlots().slice(2)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
        })
        for (let i = 1; i < result.length; i++) {
            expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score)
        }
    })

    it("limit caps the number of results", () => {
        const matches = Array.from({ length: 20 }, (_, i) =>
            makeMatch(`m${i}`, [pick("Ahri", "blue")]),
        )
        const result = findSimilarDrafts({
            matches,
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)],
            redPicks: emptySlots(),
            blueBans: [],
            redBans: [],
            limit: 3,
        })
        expect(result.length).toBeLessThanOrEqual(3)
    })

    it("result is deterministic for same input", () => {
        const matches = [
            makeMatch("m1", [pick("Ahri", "blue"), pick("Viktor", "red")]),
            makeMatch("m2", [pick("Ahri", "blue"), pick("Zed", "red")]),
        ]
        const input = {
            matches,
            bluePicks: [slot("Ahri"), ...emptySlots().slice(1)] as PickSlot[],
            redPicks: emptySlots(),
            blueBans: [] as string[],
            redBans: [] as string[],
        }
        const r1 = findSimilarDrafts(input)
        const r2 = findSimilarDrafts(input)
        expect(r1.map((r) => r.match.matchId)).toEqual(r2.map((r) => r.match.matchId))
    })
})
