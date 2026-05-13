import { describe, it, expect } from "vitest"
import { calculateDraftEdgeSummary } from "../src/components/DraftHelper"
import { DEFAULT_WEIGHTS } from "../src/draft/constants"
import type { PickSlot } from "../src/draft/types"
import { makeMatch } from "./helpers/matchFixtures"

const emptySlots = (): PickSlot[] =>
    Array.from({ length: 5 }, () => ({ championName: "", role: null }))

describe("calculateDraftEdgeSummary", () => {
    it("all empty slots return score 50 and zero confidence", () => {
        const result = calculateDraftEdgeSummary({
            matches: [],
            ownSlots: emptySlots(),
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(result.score).toBe(50)
        expect(result.averageConfidence).toBe(0)
        expect(result.assignedRoles).toBe(0)
        expect(result.completedPicks).toBe(0)
    })

    it("slots with champion names but no roles still return score 50", () => {
        const slots: PickSlot[] = [
            { championName: "Ahri", role: null },
            ...Array.from({ length: 4 }, () => ({ championName: "", role: null })),
        ]
        const result = calculateDraftEdgeSummary({
            matches: [],
            ownSlots: slots,
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(result.score).toBe(50)
        expect(result.completedPicks).toBe(1)
        expect(result.assignedRoles).toBe(0)
    })

    it("no NaN values even with empty input", () => {
        const result = calculateDraftEdgeSummary({
            matches: [],
            ownSlots: emptySlots(),
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(Number.isNaN(result.score)).toBe(false)
        expect(Number.isNaN(result.averageConfidence)).toBe(false)
    })

    it("slot with champion and role gives score > 50 when historical data is strong", () => {
        // 10 wins for Ahri in mid
        const matches = Array.from({ length: 10 }, (_, i) =>
            makeMatch(`m${i}`, [{ championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }]),
        )
        const ownSlots: PickSlot[] = [
            { championName: "Ahri", role: "mid" },
            ...Array.from({ length: 4 }, () => ({ championName: "", role: null })),
        ]
        const result = calculateDraftEdgeSummary({
            matches,
            ownSlots,
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(result.score).toBeGreaterThan(50)
        expect(result.assignedRoles).toBe(1)
        expect(result.averageConfidence).toBeGreaterThan(0)
    })

    it("confidence grows with more match data for same champion", () => {
        const makeSlots = (): PickSlot[] => [
            { championName: "Ahri", role: "mid" },
            ...Array.from({ length: 4 }, () => ({ championName: "", role: null })),
        ]
        const onePick = [makeMatch("m0", [{ championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }])]
        const manyPicks = Array.from({ length: 20 }, (_, i) =>
            makeMatch(`m${i}`, [{ championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }]),
        )
        const r1 = calculateDraftEdgeSummary({ matches: onePick, ownSlots: makeSlots(), enemySlots: emptySlots(), weights: DEFAULT_WEIGHTS })
        const r20 = calculateDraftEdgeSummary({ matches: manyPicks, ownSlots: makeSlots(), enemySlots: emptySlots(), weights: DEFAULT_WEIGHTS })
        expect(r20.averageConfidence).toBeGreaterThan(r1.averageConfidence)
    })

    it("completedPicks counts champions without requiring roles", () => {
        const slots: PickSlot[] = [
            { championName: "Ahri", role: null },
            { championName: "Ornn", role: "top" },
            { championName: "", role: null },
            { championName: "", role: null },
            { championName: "", role: null },
        ]
        const result = calculateDraftEdgeSummary({
            matches: [],
            ownSlots: slots,
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(result.completedPicks).toBe(2)
    })

    it("assignedRoles counts only slots with both champion and role", () => {
        const slots: PickSlot[] = [
            { championName: "Ahri", role: "mid" },
            { championName: "Ornn", role: null },
            { championName: "", role: "top" },
            { championName: "", role: null },
            { championName: "", role: null },
        ]
        const result = calculateDraftEdgeSummary({
            matches: [],
            ownSlots: slots,
            enemySlots: emptySlots(),
            weights: DEFAULT_WEIGHTS,
        })
        expect(result.assignedRoles).toBe(1)
    })

    it("result is deterministic for same input", () => {
        const matches = Array.from({ length: 5 }, (_, i) =>
            makeMatch(`m${i}`, [{ championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }]),
        )
        const slots: PickSlot[] = [
            { championName: "Ahri", role: "mid" },
            ...Array.from({ length: 4 }, () => ({ championName: "", role: null })),
        ]
        const input = { matches, ownSlots: slots, enemySlots: emptySlots(), weights: DEFAULT_WEIGHTS }
        const r1 = calculateDraftEdgeSummary(input)
        const r2 = calculateDraftEdgeSummary(input)
        expect(r1.score).toBe(r2.score)
        expect(r1.averageConfidence).toBe(r2.averageConfidence)
    })
})
