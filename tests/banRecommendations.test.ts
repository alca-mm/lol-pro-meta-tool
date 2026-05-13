import { describe, it, expect } from "vitest"
import { generateBanRecommendations } from "../src/components/DraftHelper"
import type { DraftRecommendation } from "../src/analysis/draftHelper"
import type { PickSlot, FlexChampionInfo } from "../src/draft/types"
import type { TranslationKey } from "../src/i18n/types"
import type { Role } from "../src/domain/types"

const t = (key: TranslationKey): string => key

const rec = (
    championName: string,
    role: Role,
    totalScore = 0.7,
): DraftRecommendation => ({
    championName,
    role,
    totalScore,
    draftPriorityScore: totalScore,
    roleStatsScore: totalScore,
    synergyScore: 0.5,
    matchupScore: 0.5,
    games: 10,
    winRate: 0.55,
    sampleSizeLabel: "medium",
    reasons: [],
})

const emptySlots = (): PickSlot[] =>
    Array.from({ length: 5 }, () => ({ championName: "", role: null }))

describe("generateBanRecommendations", () => {
    it("returns empty list when opponentRecommendations is empty", () => {
        const result = generateBanRecommendations({
            opponentRecommendations: [],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 5,
        }, t)
        expect(result).toHaveLength(0)
    })

    it("already banned champions are not recommended again", () => {
        const result = generateBanRecommendations({
            opponentRecommendations: [rec("Ahri", "mid")],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(["ahri"]),
            flexChampionCatalog: new Map(),
            limit: 5,
        }, t)
        expect(result.find((r) => r.championName === "Ahri")).toBeUndefined()
    })

    it("already picked (selected) champions are not recommended as bans", () => {
        const result = generateBanRecommendations({
            opponentRecommendations: [rec("Ahri", "mid")],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(["ahri"]),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 5,
        }, t)
        expect(result.find((r) => r.championName === "Ahri")).toBeUndefined()
    })

    it("higher totalScore champion ranks above lower one", () => {
        const result = generateBanRecommendations({
            opponentRecommendations: [rec("Ahri", "mid", 0.4), rec("Viktor", "mid", 0.9)],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 5,
        }, t)
        expect(result[0].championName).toBe("Viktor")
    })

    it("flex champion receives bonus over non-flex at same base score", () => {
        const flexCatalog = new Map<string, FlexChampionInfo>([
            ["ahri", {
                championName: "Ahri",
                totalGames: 10,
                isFlex: true,
                primaryRole: "mid",
                roles: [
                    { role: "mid", games: 7, share: 0.7, winRate: 0.5 },
                    { role: "top", games: 3, share: 0.3, winRate: 0.5 },
                ],
            }],
        ])
        const result = generateBanRecommendations({
            opponentRecommendations: [rec("Ahri", "mid", 0.7), rec("Viktor", "mid", 0.7)],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: flexCatalog,
            limit: 5,
        }, t)
        const ahriScore = result.find((r) => r.championName === "Ahri")!.score
        const viktorScore = result.find((r) => r.championName === "Viktor")!.score
        expect(ahriScore).toBeGreaterThan(viktorScore)
    })

    it("limit parameter caps the number of results", () => {
        const recs = [rec("A", "mid"), rec("B", "top"), rec("C", "jungle"), rec("D", "bot")]
        const result = generateBanRecommendations({
            opponentRecommendations: recs,
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 2,
        }, t)
        expect(result.length).toBeLessThanOrEqual(2)
    })

    it("result is sorted by score descending", () => {
        const recs = [rec("A", "mid", 0.3), rec("B", "top", 0.9), rec("C", "jungle", 0.6)]
        const result = generateBanRecommendations({
            opponentRecommendations: recs,
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 10,
        }, t)
        for (let i = 1; i < result.length; i++) {
            expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score)
        }
    })

    it("result is deterministic for same input", () => {
        const input = {
            opponentRecommendations: [rec("Ahri", "mid"), rec("Viktor", "top")],
            opponentSlots: emptySlots(),
            selectedChampionSet: new Set<string>(),
            bannedChampionSet: new Set<string>(),
            flexChampionCatalog: new Map<string, FlexChampionInfo>(),
            limit: 5,
        }
        const r1 = generateBanRecommendations(input, t)
        const r2 = generateBanRecommendations(input, t)
        expect(r1.map((r) => r.championName)).toEqual(r2.map((r) => r.championName))
    })

    it("champion hitting an opponent open role receives open-role bonus", () => {
        // Opponent has no mid assigned → mid is an open role
        const opponentSlots: PickSlot[] = emptySlots() // all roles unassigned
        const result = generateBanRecommendations({
            opponentRecommendations: [rec("Ahri", "mid", 0.7)],
            opponentSlots,
            selectedChampionSet: new Set(),
            bannedChampionSet: new Set(),
            flexChampionCatalog: new Map(),
            limit: 5,
        }, t)
        const ahri = result.find((r) => r.championName === "Ahri")!
        expect(ahri.hitsOpenRole).toBe(true)
        // score should include 0.1 open-role bonus on top of base
        expect(ahri.score).toBeGreaterThan(0.7)
    })
})
