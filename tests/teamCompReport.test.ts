import { describe, it, expect } from "vitest"
import { generateTeamCompReport } from "../src/components/DraftHelper"
import type { PickSlot } from "../src/draft/types"
import type { TranslationKey } from "../src/i18n/types"

const t = (key: TranslationKey): string => key

const emptySlots = (): PickSlot[] =>
    Array.from({ length: 5 }, () => ({ championName: "", role: null }))

const slot = (championName: string, role: PickSlot["role"] = null): PickSlot => ({
    championName,
    role,
})

describe("generateTeamCompReport", () => {
    it("empty comp has all roles open warning", () => {
        const report = generateTeamCompReport(emptySlots(), t)
        const rolesWarning = report.warnings.find((w) => w.title === "comp_warnTitle_rolesOpen")
        expect(rolesWarning).toBeDefined()
    })

    it("empty comp identity is hybrid when no champions", () => {
        const report = generateTeamCompReport(emptySlots(), t)
        expect(report.identity).toBe("comp_identity_hybrid")
    })

    it("comp with frontline and scaling champions produces frontline strength", () => {
        // Malphite = frontline, Ornn = frontline+engage, Orianna = scaling
        const slots: PickSlot[] = [
            slot("Malphite", "top"),
            slot("Ornn", "jungle"),
            slot("Orianna", "mid"),
            slot("Ashe", "bot"),
            slot("Alistar", "support"),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.strengths).toContain("comp_strength_frontline")
    })

    it("comp with engage and dive champions produces engage strength", () => {
        // Malphite = engage, Alistar = engage+dive, Nautilus = engage+dive
        const slots: PickSlot[] = [
            slot("Malphite", "top"),
            slot("Alistar", "support"),
            slot("Nautilus", "jungle"),
            slot("Orianna", "mid"),
            slot("Kaisa", "bot"),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.strengths).toContain("comp_strength_engage")
    })

    it("comp with 3+ picks and no frontline produces low-frontline warning", () => {
        // Ahri, Viktor, Ezreal, Janna, Zed: none in FRONTLINE_CHAMPIONS
        const slots: PickSlot[] = [
            slot("Ahri", "mid"),
            slot("Viktor", "jungle"),
            slot("Ezreal", "bot"),
            slot("", null),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.warnings.find((w) => w.title === "comp_warnTitle_lowFrontline")).toBeDefined()
    })

    it("comp with 3+ picks and no engage or pick produces low-engage warning", () => {
        // Three AP damage dealers that are not in ENGAGE_CHAMPIONS or PICK_CHAMPIONS
        const slots: PickSlot[] = [
            slot("Cassiopeia", "mid"),
            slot("Karthus", "jungle"),
            slot("Vladimir", "top"),
            slot("", null),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.warnings.find((w) => w.title === "comp_warnTitle_lowEngage")).toBeDefined()
    })

    it("AD-heavy comp with 4+ picks produces AD-heavy info", () => {
        // Ashe, Caitlyn, Draven, Graves: all pure AD
        const slots: PickSlot[] = [
            slot("Ashe", "bot"),
            slot("Caitlyn", "top"),
            slot("Draven", "jungle"),
            slot("Graves", "mid"),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.damageProfile.label).toBe("comp_damage_adHeavy")
        expect(report.warnings.find((w) => w.title === "comp_warnTitle_adHeavy")).toBeDefined()
    })

    it("AP-heavy comp with 4+ picks produces AP-heavy info", () => {
        // Ahri, Syndra, Viktor, Lux: all pure AP
        const slots: PickSlot[] = [
            slot("Ahri", "mid"),
            slot("Syndra", "top"),
            slot("Viktor", "jungle"),
            slot("Lux", "support"),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.damageProfile.label).toBe("comp_damage_apHeavy")
        expect(report.warnings.find((w) => w.title === "comp_warnTitle_apHeavy")).toBeDefined()
    })

    it("damage profile is labeled unknown when no champions are recognized", () => {
        const report = generateTeamCompReport(emptySlots(), t)
        expect(report.damageProfile.label).toBe("comp_damage_unknown")
    })

    it("identity is determined by highest scoring archetype", () => {
        // 2 poke champions → Poke / Siege should dominate
        const slots: PickSlot[] = [
            slot("Xerath", "support"),
            slot("Ziggs", "mid"),
            slot("Ezreal", "bot"),
            slot("", null),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.identity).toBe("Poke / Siege")
    })

    it("metrics array has 6 entries", () => {
        const report = generateTeamCompReport(emptySlots(), t)
        expect(report.metrics).toHaveLength(6)
    })

    it("result is deterministic", () => {
        const slots: PickSlot[] = [
            slot("Malphite", "top"),
            slot("Orianna", "mid"),
            slot("Ashe", "bot"),
            slot("", null),
            slot("", null),
        ]
        const r1 = generateTeamCompReport(slots, t)
        const r2 = generateTeamCompReport(slots, t)
        expect(r1.identity).toBe(r2.identity)
        expect(r1.warnings.map((w) => w.title)).toEqual(r2.warnings.map((w) => w.title))
    })

    it("duplicated role assignment produces duplicate-role warning", () => {
        const slots: PickSlot[] = [
            slot("Ahri", "mid"),
            slot("Viktor", "mid"),
            slot("", null),
            slot("", null),
            slot("", null),
        ]
        const report = generateTeamCompReport(slots, t)
        expect(report.warnings.find((w) => w.title === "comp_warnTitle_dupRole")).toBeDefined()
    })
})
