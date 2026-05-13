import { describe, it, expect } from "vitest"
import { parsePatchParts, comparePatch, weightedPatchWindow } from "../src/draft/patchWindow"
import { makeMatch } from "./helpers/matchFixtures"

describe("parsePatchParts", () => {
    it("parses simple patch", () => {
        expect(parsePatchParts("14.9")).toEqual([14, 9])
    })

    it("parses patch where minor version > 9", () => {
        expect(parsePatchParts("14.10")).toEqual([14, 10])
    })

    it("parses three-part patch", () => {
        expect(parsePatchParts("14.10.1")).toEqual([14, 10, 1])
    })

    it("handles empty string without crash", () => {
        const result = parsePatchParts("")
        expect(result.every((n) => Number.isFinite(n))).toBe(true)
    })
})

describe("comparePatch", () => {
    it("14.9 < 14.10 (minor version comparison, not lexicographic)", () => {
        expect(comparePatch("14.9", "14.10")).toBeLessThan(0)
    })

    it("14.10 > 14.9", () => {
        expect(comparePatch("14.10", "14.9")).toBeGreaterThan(0)
    })

    it("15.1 > 14.24", () => {
        expect(comparePatch("15.1", "14.24")).toBeGreaterThan(0)
    })

    it("equal patches return 0 or consistent ordering", () => {
        expect(comparePatch("14.9", "14.9")).toBe(0)
    })
})

describe("weightedPatchWindow", () => {
    it("empty match list returns empty result without crashing", () => {
        const result = weightedPatchWindow([], [100, 70, 45, 25, 15, 10])
        expect(result.rawSample).toBe(0)
        expect(result.summaries).toHaveLength(0)
        expect(result.matches).toHaveLength(0)
        expect(result.rawMatches).toHaveLength(0)
    })

    it("selects only the most recent patches up to PATCH_WEIGHT_MAX_PATCHES", () => {
        const matches = [
            makeMatch("m1", [], [], "13.1"),
            makeMatch("m2", [], [], "14.1"),
            makeMatch("m3", [], [], "14.2"),
            makeMatch("m4", [], [], "14.3"),
            makeMatch("m5", [], [], "14.4"),
            makeMatch("m6", [], [], "14.5"),
            makeMatch("m7", [], [], "14.6"),
            makeMatch("m8", [], [], "14.7"),
        ]
        const result = weightedPatchWindow(matches, [100, 70, 45, 25, 15, 10])
        // PATCH_WEIGHT_MAX_PATCHES = 6, so only the 6 most recent patches
        expect(result.summaries.length).toBeLessThanOrEqual(6)
        // 13.1 is the oldest and should be excluded
        expect(result.patches.includes("13.1")).toBe(false)
    })

    it("patches with weight 0 are excluded from weighted result", () => {
        const matches = [
            makeMatch("m1", [], [], "14.1"),
            makeMatch("m2", [], [], "14.2"),
        ]
        // Weight [100, 0]: patch index 0 = newest (14.2), index 1 = older (14.1)
        const result = weightedPatchWindow(matches, [100, 0, 0, 0, 0, 0])
        const includedPatches = result.summaries.map((s) => s.patch)
        expect(includedPatches).toContain("14.2")
        expect(includedPatches).not.toContain("14.1")
    })

    it("rawMatches includes all matches from non-zero-weight patches", () => {
        const bluePick: Match["picks"][number] = { championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }
        const m1 = makeMatch("m1", [bluePick], [], "14.2")
        const m2 = makeMatch("m2", [bluePick], [], "14.1")
        const result = weightedPatchWindow([m1, m2], [100, 50, 0, 0, 0, 0])
        expect(result.rawSample).toBe(2)
    })

    it("matches from weight-0 patches are excluded", () => {
        const bluePick: Match["picks"][number] = { championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }
        const m1 = makeMatch("m1", [bluePick], [], "14.2")
        const m2 = makeMatch("m2", [bluePick], [], "14.1")
        // Only current patch (14.2) has weight > 0
        const result = weightedPatchWindow([m1, m2], [100, 0, 0, 0, 0, 0])
        expect(result.rawSample).toBe(1)
        expect(result.rawMatches.every((m) => m.patch === "14.2")).toBe(true)
    })

    it("higher weight patches produce more weighted matches than lower weight", () => {
        const bluePick: Match["picks"][number] = { championName: "Ahri", team: "Blue", side: "blue", role: "mid", won: true }
        const currentMatches = Array.from({ length: 3 }, (_, i) => makeMatch(`cur-${i}`, [bluePick], [], "14.2"))
        const oldMatches = Array.from({ length: 3 }, (_, i) => makeMatch(`old-${i}`, [bluePick], [], "14.1"))
        const allMatches = [...currentMatches, ...oldMatches]
        // weight 100 for current, 10 for older
        const result = weightedPatchWindow(allMatches, [100, 10, 0, 0, 0, 0])
        const currentSummary = result.summaries.find((s) => s.patch === "14.2")
        const oldSummary = result.summaries.find((s) => s.patch === "14.1")
        expect(currentSummary?.weightedMatches ?? 0).toBeGreaterThan(oldSummary?.weightedMatches ?? 0)
    })

    it("invalid patch values do not crash", () => {
        const m = makeMatch("m1", [], [], "")
        expect(() => weightedPatchWindow([m], [100, 0, 0, 0, 0, 0])).not.toThrow()
    })

    it("result is deterministic for same input", () => {
        const matches = [makeMatch("m1", [], [], "14.2"), makeMatch("m2", [], [], "14.1")]
        const r1 = weightedPatchWindow(matches, [100, 70, 0, 0, 0, 0])
        const r2 = weightedPatchWindow(matches, [100, 70, 0, 0, 0, 0])
        expect(r1.patches).toEqual(r2.patches)
        expect(r1.rawSample).toBe(r2.rawSample)
    })
})
