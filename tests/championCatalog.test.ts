import { describe, it, expect } from "vitest"
import { ALL_CHAMPIONS } from "../src/analysis/championCatalog"
import { championImageId, championIconUrl } from "../src/analysis/championAssets"

describe("ALL_CHAMPIONS", () => {
    it("contains no duplicates", () => {
        const seen = new Set<string>()
        for (const name of ALL_CHAMPIONS) {
            expect(seen.has(name), `Duplicate: "${name}"`).toBe(false)
            seen.add(name)
        }
    })

    it("contains no empty names", () => {
        for (const name of ALL_CHAMPIONS) {
            expect(name.trim().length, `Empty name found`).toBeGreaterThan(0)
        }
    })

    it("is sorted alphabetically (ignoring apostrophes and punctuation)", () => {
        const normalize = (s: string) => s.replace(/[''.\s&-]/g, "").toLowerCase()
        const sorted = [...ALL_CHAMPIONS].sort((a, b) => normalize(a).localeCompare(normalize(b)))
        expect(ALL_CHAMPIONS).toEqual(sorted)
    })

    it("contains special-character champions", () => {
        const required = [
            "Dr. Mundo",
            "Jarvan IV",
            "Kai'Sa",
            "Kha'Zix",
            "Kog'Maw",
            "K'Sante",
            "Nunu & Willump",
            "Renata Glasc",
            "Tahm Kench",
            "Twisted Fate",
            "Xin Zhao",
        ]
        for (const name of required) {
            expect(ALL_CHAMPIONS, `Missing: "${name}"`).toContain(name)
        }
    })

    it("contains new champions Yunara and Zaahen", () => {
        expect(ALL_CHAMPIONS).toContain("Yunara")
        expect(ALL_CHAMPIONS).toContain("Zaahen")
    })
})

describe("championImageId", () => {
    const cases: [string, string][] = [
        ["Aurelion Sol", "AurelionSol"],
        ["Bel'Veth", "Belveth"],
        ["Cho'Gath", "Chogath"],
        ["Dr. Mundo", "DrMundo"],
        ["Jarvan IV", "JarvanIV"],
        ["Kai'Sa", "Kaisa"],
        ["Kha'Zix", "Khazix"],
        ["Kog'Maw", "KogMaw"],
        ["K'Sante", "KSante"],
        ["LeBlanc", "Leblanc"],
        ["Lee Sin", "LeeSin"],
        ["Master Yi", "MasterYi"],
        ["Miss Fortune", "MissFortune"],
        ["Nunu & Willump", "Nunu"],
        ["Rek'Sai", "RekSai"],
        ["Renata Glasc", "Renata"],
        ["Tahm Kench", "TahmKench"],
        ["Twisted Fate", "TwistedFate"],
        ["Vel'Koz", "Velkoz"],
        ["Wukong", "MonkeyKing"],
        ["Xin Zhao", "XinZhao"],
        ["Yunara", "Yunara"],
        ["Zaahen", "Zaahen"],
    ]

    for (const [input, expected] of cases) {
        it(`"${input}" → "${expected}"`, () => {
            expect(championImageId(input)).toBe(expected)
        })
    }
})

describe("championIconUrl", () => {
    it("contains correct Data Dragon ID for Wukong", () => {
        expect(championIconUrl("Wukong")).toContain("MonkeyKing.png")
    })

    it("contains correct Data Dragon ID for Kai'Sa", () => {
        expect(championIconUrl("Kai'Sa")).toContain("Kaisa.png")
    })

    it("contains correct Data Dragon ID for Yunara", () => {
        expect(championIconUrl("Yunara")).toContain("Yunara.png")
    })

    it("contains correct Data Dragon ID for Zaahen", () => {
        expect(championIconUrl("Zaahen")).toContain("Zaahen.png")
    })

    it("URL starts with ddragon.leagueoflegends.com", () => {
        expect(championIconUrl("Garen")).toMatch(/^https:\/\/ddragon\.leagueoflegends\.com\//)
    })
})
