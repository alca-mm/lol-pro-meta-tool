import { describe, it, expect } from "vitest"
import { calculateDraftRecommendations, createEmptyDraftState } from "../src/analysis/draftHelper"
import type { Match } from "../src/domain/types"
import { makeMatch } from "./helpers/matchFixtures"

const bluePick = (championName: string, role: Match["picks"][number]["role"], won = true): Match["picks"][number] => ({
    championName,
    team: "Blue",
    side: "blue",
    role,
    won,
})

const redPick = (championName: string, role: Match["picks"][number]["role"], won = false): Match["picks"][number] => ({
    championName,
    team: "Red",
    side: "red",
    role,
    won,
})

// 10 matches: Ahri mid vs Viktor mid, blue wins all
const ahriVsViktor = Array.from({ length: 10 }, (_, i) =>
    makeMatch(`m${i}`, [bluePick("Ahri", "mid"), redPick("Viktor", "mid")]),
)

describe("calculateDraftRecommendations", () => {
    it("returns empty array for no matches", () => {
        const recs = calculateDraftRecommendations([], createEmptyDraftState())
        expect(recs).toHaveLength(0)
    })

    it("recommends champion with enough games", () => {
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        const ahriRec = recs.find((r) => r.championName === "Ahri" && r.role === "mid")
        expect(ahriRec).toBeDefined()
    })

    it("excludes champion when role is already picked by own side", () => {
        const draft = { ...createEmptyDraftState(), ownPicks: { mid: "Ahri" } }
        const recs = calculateDraftRecommendations(ahriVsViktor, draft)
        const midRecs = recs.filter((r) => r.role === "mid")
        expect(midRecs).toHaveLength(0)
    })

    it("excludes picked champion from any role when already in own or enemy picks", () => {
        const draft = { ...createEmptyDraftState(), enemyPicks: { mid: "Ahri" } }
        const recs = calculateDraftRecommendations(ahriVsViktor, draft)
        const ahriRecs = recs.filter((r) => r.championName === "Ahri")
        expect(ahriRecs).toHaveLength(0)
    })

    it("excludes banned champion when excludeBans is true", () => {
        const draft = { ...createEmptyDraftState(), bans: ["Ahri"], excludeBans: true }
        const recs = calculateDraftRecommendations(ahriVsViktor, draft)
        expect(recs.find((r) => r.championName === "Ahri")).toBeUndefined()
    })

    it("includes banned champion when excludeBans is false", () => {
        const draft = { ...createEmptyDraftState(), bans: ["Ahri"], excludeBans: false }
        const recs = calculateDraftRecommendations(ahriVsViktor, draft)
        expect(recs.find((r) => r.championName === "Ahri")).toBeDefined()
    })

    it("excludes champion below minGames threshold", () => {
        // Only 3 matches: below default minGames of 5
        const fewMatches = Array.from({ length: 3 }, (_, i) =>
            makeMatch(`m${i}`, [bluePick("Ahri", "mid"), redPick("Viktor", "mid")]),
        )
        const recs = calculateDraftRecommendations(fewMatches, createEmptyDraftState())
        expect(recs.find((r) => r.championName === "Ahri")).toBeUndefined()
    })

    it("includes champion when minGames is lowered to match available data", () => {
        const fewMatches = Array.from({ length: 3 }, (_, i) =>
            makeMatch(`m${i}`, [bluePick("Ahri", "mid"), redPick("Viktor", "mid")]),
        )
        const draft = { ...createEmptyDraftState(), minGames: 3 }
        const recs = calculateDraftRecommendations(fewMatches, draft)
        expect(recs.find((r) => r.championName === "Ahri")).toBeDefined()
    })

    it("returns results sorted by totalScore descending", () => {
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        for (let i = 1; i < recs.length; i++) {
            expect(recs[i].totalScore).toBeLessThanOrEqual(recs[i - 1].totalScore)
        }
    })

    it("returns deterministic results for same input", () => {
        const r1 = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        const r2 = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        expect(r1.map((r) => r.championName)).toEqual(r2.map((r) => r.championName))
    })

    it("totalScore is between 0 and 1 for all recommendations", () => {
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        for (const rec of recs) {
            expect(rec.totalScore).toBeGreaterThanOrEqual(0)
            expect(rec.totalScore).toBeLessThanOrEqual(1)
        }
    })

    it("missing synergy data yields neutral synergyScore of 0.5", () => {
        // Draft with no own picks → ownChampions is empty → fallback average 0.5
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        const ahriRec = recs.find((r) => r.championName === "Ahri")!
        expect(ahriRec.synergyScore).toBe(0.5)
    })

    it("missing enemy pick for role yields neutral matchupScore of 0.5", () => {
        // No enemy picks → findMatchupScore returns 0.5
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        const ahriRec = recs.find((r) => r.championName === "Ahri")!
        expect(ahriRec.matchupScore).toBe(0.5)
    })

    it("known good matchup increases matchupScore above 0.5", () => {
        // Viktor is the enemy mid, Ahri beats Viktor in all 10 matches
        const draft = { ...createEmptyDraftState(), enemyPicks: { mid: "Viktor" } }
        const recs = calculateDraftRecommendations(ahriVsViktor, draft)
        const ahriRec = recs.find((r) => r.championName === "Ahri" && r.role === "mid")!
        expect(ahriRec?.matchupScore).toBeGreaterThan(0.5)
    })

    it("large sample with moderate WR scores higher roleStatsScore than small sample with extreme WR", () => {
        // Without confidence dampening: 6/6 (100% WR) outscored 25 games at 52% WR.
        // With dampening: small-sample extreme WR is pulled toward neutral 0.5.
        const smallSampleMatches = Array.from({ length: 6 }, (_, i) =>
            makeMatch(`s${i}`, [bluePick("Xayah", "bot"), redPick("Draven", "bot")]),
        )
        const largeSampleMatches = Array.from({ length: 25 }, (_, i) =>
            makeMatch(`l${i}`, [
                bluePick("Kaisa", "bot", i < 13),   // 13/25 wins = 52% WR
                redPick("Jinx", "bot", i >= 13),
            ]),
        )
        const allMatches = [...smallSampleMatches, ...largeSampleMatches]
        const draft = { ...createEmptyDraftState(), minGames: 5 }
        const recs = calculateDraftRecommendations(allMatches, draft)

        const xayahRec = recs.find((r) => r.championName === "Xayah")!
        const kaisaRec = recs.find((r) => r.championName === "Kaisa")!

        expect(xayahRec).toBeDefined()
        expect(kaisaRec).toBeDefined()
        // 25-game stable pick outscores 6-game perfect outlier on role-specific data
        expect(kaisaRec.roleStatsScore).toBeGreaterThan(xayahRec.roleStatsScore)
    })

    it("champion with 25+ games is unaffected by dampening (sampleConfidence = 1)", () => {
        // At exactly 25 games sampleConfidence caps at 1.0 → no dampening
        const fullSampleMatches = Array.from({ length: 25 }, (_, i) =>
            makeMatch(`f${i}`, [
                bluePick("Azir", "mid", i < 14),
                redPick("Orianna", "mid", i >= 14),
            ]),
        )
        const recs25 = calculateDraftRecommendations(fullSampleMatches, createEmptyDraftState())
        // Adding more matches should not change the roleStatsScore (confidence already maxed)
        const moreMatches = [
            ...fullSampleMatches,
            ...Array.from({ length: 25 }, (_, i) =>
                makeMatch(`x${i}`, [
                    bluePick("Azir", "mid", i < 14),
                    redPick("Orianna", "mid", i >= 14),
                ]),
            ),
        ]
        const recs50 = calculateDraftRecommendations(moreMatches, createEmptyDraftState())
        const azir25 = recs25.find((r) => r.championName === "Azir")!
        const azir50 = recs50.find((r) => r.championName === "Azir")!
        // Both have win rate ~56%. With 25 games confidence is maxed in both cases.
        // roleStatsScore should be the same formula result regardless of games beyond 25.
        expect(azir25.roleStatsScore).toBeCloseTo(azir50.roleStatsScore, 2)
    })

    it("large-sample totalScore exceeds tiny-sample totalScore despite perfect WR", () => {
        // 7-game perfect record vs 50-game moderate record.
        // The multiplicative sampleConfidence penalty should ensure the 50-game pick wins.
        const tinyMatches = Array.from({ length: 7 }, (_, i) =>
            makeMatch(`t${i}`, [bluePick("Xayah", "bot"), redPick("Draven", "bot")]),
        )
        const largeMatches = Array.from({ length: 50 }, (_, i) =>
            makeMatch(`lg${i}`, [
                bluePick("Kaisa", "bot", i < 26), // 26/50 = 52% WR
                redPick("Jinx", "bot", i >= 26),
            ]),
        )
        const allMatches = [...tinyMatches, ...largeMatches]
        const draft = { ...createEmptyDraftState(), minGames: 5 }
        const recs = calculateDraftRecommendations(allMatches, draft)

        const xayahRec = recs.find((r) => r.championName === "Xayah")!
        const kaisaRec = recs.find((r) => r.championName === "Kaisa")!

        expect(xayahRec).toBeDefined()
        expect(kaisaRec).toBeDefined()
        expect(kaisaRec.totalScore).toBeGreaterThan(xayahRec.totalScore)
    })

    it("known good synergy increases synergyScore above 0.5", () => {
        // Ahri and Ornn always on the same team, always winning
        const synergyMatches = Array.from({ length: 10 }, (_, i) =>
            makeMatch(`syn-${i}`, [
                bluePick("Ahri", "mid"),
                { championName: "Ornn", team: "Blue", side: "blue", role: "top", won: true },
                redPick("Viktor", "mid"),
                { championName: "Gnar", team: "Red", side: "red", role: "top", won: false },
            ]),
        )
        // With Ornn as own top pick, Ahri synergy should reflect the 100% win rate together
        const draft = { ...createEmptyDraftState(), ownPicks: { top: "Ornn" } }
        const recs = calculateDraftRecommendations(synergyMatches, draft)
        const ahriRec = recs.find((r) => r.championName === "Ahri" && r.role === "mid")!
        expect(ahriRec?.synergyScore).toBeGreaterThan(0.5)
    })
})
