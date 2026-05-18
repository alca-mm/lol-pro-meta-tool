import { describe, it, expect } from "vitest"
import { ratingToTeamPoolScore, calculateWeightedScore } from "../src/components/DraftHelper"
import { DEFAULT_WEIGHTS } from "../src/draft/constants"
import type { DraftRecommendation } from "../src/analysis/draftHelper"

const baseRec: DraftRecommendation = {
    championName: "Ahri",
    role: "mid",
    totalScore: 0.6,
    draftPriorityScore: 0.6,
    roleStatsScore: 0.6,
    synergyScore: 0.5,
    matchupScore: 0.5,
    games: 25,
    winRate: 0.55,
    sampleSizeLabel: "Good",
    reasons: [],
    teamPoolScore: null,
    teamPoolRating: null,
}

describe("ratingToTeamPoolScore", () => {
    it("comfort returns 1.00", () => {
        expect(ratingToTeamPoolScore("comfort")).toBe(1.00)
    })

    it("blind returns 0.95", () => {
        expect(ratingToTeamPoolScore("blind")).toBe(0.95)
    })

    it("pocket returns 0.90", () => {
        expect(ratingToTeamPoolScore("pocket")).toBe(0.90)
    })

    it("situational returns 0.65", () => {
        expect(ratingToTeamPoolScore("situational")).toBe(0.65)
    })

    it("needs_practice returns 0.25", () => {
        expect(ratingToTeamPoolScore("needs_practice")).toBe(0.25)
    })

    it("avoid returns 0.00", () => {
        expect(ratingToTeamPoolScore("avoid")).toBe(0.00)
    })

    it("null returns neutral 0.50", () => {
        expect(ratingToTeamPoolScore(null)).toBe(0.50)
    })

    it("ordering: comfort > blind > pocket > situational > needs_practice > avoid", () => {
        expect(ratingToTeamPoolScore("comfort")).toBeGreaterThan(ratingToTeamPoolScore("blind"))
        expect(ratingToTeamPoolScore("blind")).toBeGreaterThan(ratingToTeamPoolScore("pocket"))
        expect(ratingToTeamPoolScore("pocket")).toBeGreaterThan(ratingToTeamPoolScore("situational"))
        expect(ratingToTeamPoolScore("situational")).toBeGreaterThan(ratingToTeamPoolScore("needs_practice"))
        expect(ratingToTeamPoolScore("needs_practice")).toBeGreaterThan(ratingToTeamPoolScore("avoid"))
    })
})

describe("calculateWeightedScore with teamPool", () => {
    it("comfort score is higher than avoid score for same recommendation", () => {
        const comfortScore = calculateWeightedScore(baseRec, DEFAULT_WEIGHTS, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, DEFAULT_WEIGHTS, 0.00)
        expect(comfortScore).toBeGreaterThan(avoidScore)
    })

    it("null pool score yields same result as neutral 0.5", () => {
        const nullScore = calculateWeightedScore(baseRec, DEFAULT_WEIGHTS, null)
        const neutralScore = calculateWeightedScore(baseRec, DEFAULT_WEIGHTS, 0.5)
        expect(nullScore).toBeCloseTo(neutralScore, 10)
    })

    it("avoid with high teamPool weight significantly reduces score vs comfort", () => {
        const highPoolWeights = { ...DEFAULT_WEIGHTS, teamPool: 80 }
        const comfortScore = calculateWeightedScore(baseRec, highPoolWeights, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, highPoolWeights, 0.00)
        expect(comfortScore - avoidScore).toBeGreaterThan(0.15)
    })

    it("teamPool weight=0 means pool score does not affect result", () => {
        const noPoolWeights = { ...DEFAULT_WEIGHTS, teamPool: 0 }
        const comfortScore = calculateWeightedScore(baseRec, noPoolWeights, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, noPoolWeights, 0.00)
        expect(comfortScore).toBeCloseTo(avoidScore, 10)
    })

    it("result is always between 0 and 1 across all rating scores", () => {
        for (const score of [0, 0.25, 0.5, 0.65, 0.9, 0.95, 1.0]) {
            const result = calculateWeightedScore(baseRec, DEFAULT_WEIGHTS, score)
            expect(result).toBeGreaterThanOrEqual(0)
            expect(result).toBeLessThanOrEqual(1)
        }
    })
})
