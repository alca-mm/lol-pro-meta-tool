import { describe, it, expect } from "vitest"
import { buildFlexChampionCatalog } from "../src/components/DraftHelper"
import { makeMatch } from "./helpers/matchFixtures"

const pick = (championName: string, role: "top" | "jungle" | "mid" | "bot" | "support", won = true) => ({
    championName,
    team: "Blue",
    side: "blue" as const,
    role,
    won,
})

describe("buildFlexChampionCatalog", () => {
    it("empty matches returns empty catalog", () => {
        const catalog = buildFlexChampionCatalog([])
        expect(catalog.size).toBe(0)
    })

    it("champion played on multiple viable roles is marked as flex", () => {
        // 4 games mid + 2 games top → both roles viable (≥2 games, ≥12% share)
        const matches = [
            ...Array.from({ length: 4 }, (_, i) => makeMatch(`mid-${i}`, [pick("Sylas", "mid")])),
            ...Array.from({ length: 2 }, (_, i) => makeMatch(`top-${i}`, [pick("Sylas", "top")])),
        ]
        const catalog = buildFlexChampionCatalog(matches)
        const sylas = catalog.get("sylas")
        expect(sylas).toBeDefined()
        expect(sylas?.isFlex).toBe(true)
    })

    it("champion played on only one role is not flex", () => {
        const matches = Array.from({ length: 6 }, (_, i) => makeMatch(`m${i}`, [pick("Garen", "top")]))
        const catalog = buildFlexChampionCatalog(matches)
        const garen = catalog.get("garen")
        expect(garen).toBeDefined()
        expect(garen?.isFlex).toBe(false)
    })

    it("secondary role with only 1 game does not qualify as viable (games threshold)", () => {
        // 6 games top, 1 game mid → mid fails games >= 2 threshold
        const matches = [
            ...Array.from({ length: 6 }, (_, i) => makeMatch(`top-${i}`, [pick("Irelia", "top")])),
            makeMatch("mid-0", [pick("Irelia", "mid")]),
        ]
        const catalog = buildFlexChampionCatalog(matches)
        const irelia = catalog.get("irelia")
        expect(irelia?.isFlex).toBe(false)
    })

    it("secondary role with too low share does not qualify (share threshold 12%)", () => {
        // 17 games top, 2 games mid → mid share = 2/19 ≈ 10.5% < 12%
        const matches = [
            ...Array.from({ length: 17 }, (_, i) => makeMatch(`top-${i}`, [pick("Camille", "top")])),
            ...Array.from({ length: 2 }, (_, i) => makeMatch(`mid-${i}`, [pick("Camille", "mid")])),
        ]
        const catalog = buildFlexChampionCatalog(matches)
        const camille = catalog.get("camille")
        expect(camille?.isFlex).toBe(false)
    })

    it("totalGames is the sum of games across all roles", () => {
        const matches = [
            ...Array.from({ length: 4 }, (_, i) => makeMatch(`mid-${i}`, [pick("Akali", "mid")])),
            ...Array.from({ length: 3 }, (_, i) => makeMatch(`top-${i}`, [pick("Akali", "top")])),
        ]
        const catalog = buildFlexChampionCatalog(matches)
        const akali = catalog.get("akali")
        expect(akali?.totalGames).toBe(7)
    })

    it("primaryRole is the most played role", () => {
        const matches = [
            ...Array.from({ length: 6 }, (_, i) => makeMatch(`mid-${i}`, [pick("Kassadin", "mid")])),
            ...Array.from({ length: 2 }, (_, i) => makeMatch(`top-${i}`, [pick("Kassadin", "top")])),
        ]
        const catalog = buildFlexChampionCatalog(matches)
        const kass = catalog.get("kassadin")
        expect(kass?.primaryRole).toBe("mid")
    })

    it("result is deterministic for same input", () => {
        const matches = [
            ...Array.from({ length: 4 }, (_, i) => makeMatch(`mid-${i}`, [pick("Ekko", "mid")])),
            ...Array.from({ length: 2 }, (_, i) => makeMatch(`top-${i}`, [pick("Ekko", "top")])),
        ]
        const c1 = buildFlexChampionCatalog(matches)
        const c2 = buildFlexChampionCatalog(matches)
        expect(c1.get("ekko")?.isFlex).toBe(c2.get("ekko")?.isFlex)
        expect(c1.get("ekko")?.totalGames).toBe(c2.get("ekko")?.totalGames)
    })

    it("champion name is stored case-insensitively (normalized key)", () => {
        const matches = [makeMatch("m1", [pick("Viktor", "mid")])]
        const catalog = buildFlexChampionCatalog(matches)
        expect(catalog.has("viktor")).toBe(true)
        expect(catalog.has("Viktor")).toBe(false)
    })
})
