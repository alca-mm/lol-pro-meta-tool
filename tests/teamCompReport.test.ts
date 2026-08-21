import { describe, it, expect } from "vitest"
import { generateTeamCompReport } from "../src/components/DraftHelper"
import type { DamageProfileKind, PickSlot, TeamCompReport } from "../src/draft/types"
import type { TranslationKey, Translations } from "../src/i18n/types"
import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"

/**
 * The identity translator: `label` comes back AS its catalogue key.
 *
 * Handy for the assertions below, but note what it cannot prove. While `t` is
 * the identity, `label === t("comp_damage_adHeavy")` and
 * `kind === "adHeavy"` are indistinguishable, which is exactly why the older
 * tests in this file could never have caught control flow that ran against
 * translated display text. The blocks further down use the REAL catalogues.
 */
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

// ---------------------------------------------------------------------------
// The damage-profile discriminant.
//
// `damageProfile` carries a machine-readable `kind` next to the human-readable
// `label`. Three checks inside `generateTeamCompReport` (two warnings, one
// strength) branch on it. They used to branch on `label` instead, by comparing
// it against `t("comp_damage_adHeavy")` / `..._apHeavy` / `..._mixed`, which
// held only because those four catalogue values happen to be pairwise distinct
// in both de.ts and en.ts. The tests below pin the replacement AND pin that no
// wording in a catalogue can move a decision any more.
// ---------------------------------------------------------------------------

/** A translator backed by a real catalogue, exactly the way the app builds one. */
const translatorFor =
    (catalogue: Translations) =>
    (key: TranslationKey): string =>
        catalogue[key]

/**
 * A catalogue a translator could plausibly ship by accident: `comp_damage_adHeavy`
 * and `comp_damage_apHeavy` were worded alike, and `comp_damage_unknown` was
 * worded like `comp_damage_mixed`. Nothing outside `comp_damage_*` is touched, so
 * warning titles and strengths still reverse-map through the German catalogue.
 *
 * Under the OLD `label === t("comp_damage_...")` implementation this catalogue
 * silently rewired all three checks: an AP-heavy comp matched the AD-heavy
 * comparison as well (two warnings instead of one), and a comp with no known
 * damage matched the mixed comparison (a strength out of nowhere). No compile
 * error, no test failure, a wording change edited the analysis. Reading `kind`
 * makes this catalogue behave exactly like the correct one.
 */
const collidingCatalogue: Translations = {
    ...de,
    comp_damage_adHeavy: "Damage-lastig",
    comp_damage_apHeavy: "Damage-lastig",
    comp_damage_unknown: "Gemischt",
    comp_damage_mixed: "Gemischt",
}

/**
 * Maps rendered text back to its catalogue key, restricted to one key prefix.
 *
 * The restriction matters: in de.ts `comp_damage_adHeavy` and
 * `comp_warnTitle_adHeavy` are BOTH "AD-lastig", so a catalogue-wide reverse
 * lookup would be ambiguous. Within one prefix the values are unique, and the
 * throw below keeps it that way. A future duplicate must fail loudly rather
 * than quietly merge two decisions and make every comparison here vacuous.
 */
const inverseFor = (catalogue: Translations, prefix: string): Map<string, TranslationKey> => {
    const keys = (Object.keys(catalogue) as TranslationKey[]).filter((key) => key.startsWith(prefix))
    const map = new Map<string, TranslationKey>(keys.map((key) => [catalogue[key], key]))
    if (map.size !== keys.length) {
        throw new Error(`Catalogue has duplicate values under "${prefix}", reverse lookup is ambiguous.`)
    }
    return map
}

type Decisions = {
    kind: DamageProfileKind
    identity: string
    warnings: string[]
    strengths: TranslationKey[]
}

/**
 * Reduces a rendered report back to the DECISIONS behind it, so two runs in two
 * languages become comparable. Everything kept here is language-independent by
 * construction; only the rendered wording is dropped.
 */
const decisionsOf = (report: TeamCompReport, catalogue: Translations): Decisions => {
    const titles = inverseFor(catalogue, "comp_warnTitle_")
    const strengths = inverseFor(catalogue, "comp_strength_")
    const resolve = (map: Map<string, TranslationKey>, value: string): TranslationKey => {
        const key = map.get(value)
        if (!key) throw new Error(`No catalogue key renders as "${value}".`)
        return key
    }

    return {
        kind: report.damageProfile.kind,
        // `identity` is either a hardcoded archetype label or the translated
        // hybrid fallback; normalise the latter so the two languages line up.
        identity:
            report.identity === catalogue.comp_identity_hybrid ? "comp_identity_hybrid" : report.identity,
        warnings: report.warnings.map((w) => `${w.severity}:${resolve(titles, w.title)}`),
        strengths: report.strengths.map((s) => resolve(strengths, s)),
    }
}

type DamageFixture = { name: string; kind: DamageProfileKind; slots: PickSlot[] }

const damageFixtures: DamageFixture[] = [
    {
        name: "no champions picked at all",
        kind: "unknown",
        slots: emptySlots(),
    },
    {
        // Four champions that sit in neither AP_DAMAGE_CHAMPIONS nor
        // AD_DAMAGE_CHAMPIONS, so knownDamage stays 0 even at four picks. This
        // reaches "unknown" through a different door than the empty comp does.
        name: "four champions outside both damage catalogues",
        kind: "unknown",
        slots: [
            slot("Malphite", "top"),
            slot("Nautilus", "jungle"),
            slot("Ornn", "mid"),
            slot("Alistar", "support"),
            slot("", null),
        ],
    },
    {
        name: "four pure AD champions",
        kind: "adHeavy",
        slots: [
            slot("Ashe", "bot"),
            slot("Caitlyn", "top"),
            slot("Draven", "jungle"),
            slot("Graves", "mid"),
            slot("", null),
        ],
    },
    {
        name: "four pure AP champions",
        kind: "apHeavy",
        slots: [
            slot("Ahri", "mid"),
            slot("Syndra", "top"),
            slot("Viktor", "jungle"),
            slot("Lux", "support"),
            slot("", null),
        ],
    },
    {
        // 2 AP + 2 AD: neither side reaches knownDamage - 1, so the heuristic
        // falls through to "mixed".
        name: "two pure AP and two pure AD champions",
        kind: "mixed",
        slots: [
            slot("Ahri", "mid"),
            slot("Syndra", "top"),
            slot("Ashe", "bot"),
            slot("Caitlyn", "jungle"),
            slot("", null),
        ],
    },
]

const UNKNOWN_EMPTY = 0
const UNKNOWN_FOUR = 1
const AD_HEAVY = 2
const AP_HEAVY = 3
const MIXED = 4

/**
 * The three checks EXACTLY as they read before `kind` existed, as a pure
 * function of the rendered label and the catalogue it came from.
 *
 * This lives here and NOT in src on purpose. Its only job is to prove that
 * `collidingCatalogue` is discriminating: it shows, empirically rather than by
 * assertion, that the pre-kind comparisons answer differently under a colliding
 * catalogue than `kind` does. That is what makes
 * `expect(fromColliding).toEqual(fromDe)` above the assertion that kills a
 * revert instead of a comparison that would have passed either way.
 */
const legacyDamageDecisions = (label: string, catalogue: Translations) => ({
    adHeavyWarning: label === catalogue.comp_damage_adHeavy,
    apHeavyWarning: label === catalogue.comp_damage_apHeavy,
    mixedStrength: label === catalogue.comp_damage_mixed,
})

describe("generateTeamCompReport damage profile kind", () => {
    it("the fixture table reaches all four kinds", () => {
        // Guards the table itself: if a fixture stops producing its kind, the
        // per-case checks below would quietly cover only three of four codes.
        const covered = new Set(damageFixtures.map((fixture) => fixture.kind))
        expect([...covered].sort()).toEqual(["adHeavy", "apHeavy", "mixed", "unknown"])
    })

    for (const fixture of damageFixtures) {
        it(`sets kind and the matching label for ${fixture.name}`, () => {
            const report = generateTeamCompReport(fixture.slots, t)

            // Asserted TOGETHER on purpose: a change that sets one without the
            // other (a new kind with no catalogue key, or a label rendered from
            // something other than the kind) has to fail right here.
            expect(report.damageProfile.kind).toBe(fixture.kind)
            expect(report.damageProfile.label).toBe(`comp_damage_${fixture.kind}`)
        })

        it(`derives the German and English label from the kind for ${fixture.name}`, () => {
            const deReport = generateTeamCompReport(fixture.slots, translatorFor(de))
            const enReport = generateTeamCompReport(fixture.slots, translatorFor(en))

            expect(deReport.damageProfile.kind).toBe(fixture.kind)
            expect(enReport.damageProfile.kind).toBe(fixture.kind)
            expect(deReport.damageProfile.label).toBe(de[`comp_damage_${fixture.kind}`])
            expect(enReport.damageProfile.label).toBe(en[`comp_damage_${fixture.kind}`])
            // The label really is display text and really does move with the
            // language, which is the whole reason it must not steer anything.
            expect(deReport.damageProfile.label).not.toBe(enReport.damageProfile.label)
        })
    }

    it("leaves the raw damage counts untouched next to the kind", () => {
        const report = generateTeamCompReport(damageFixtures[MIXED].slots, translatorFor(de))
        expect(report.damageProfile).toMatchObject({ ap: 2, ad: 2, mixed: 0, unknown: 0, kind: "mixed" })
    })
})

describe("generateTeamCompReport decisions are independent of the translation", () => {
    for (const fixture of damageFixtures) {
        it(`decides alike in DE, EN and a colliding catalogue for ${fixture.name}`, () => {
            const fromDe = decisionsOf(generateTeamCompReport(fixture.slots, translatorFor(de)), de)
            const fromEn = decisionsOf(generateTeamCompReport(fixture.slots, translatorFor(en)), en)
            const fromColliding = decisionsOf(
                generateTeamCompReport(fixture.slots, translatorFor(collidingCatalogue)),
                collidingCatalogue,
            )

            expect(fromEn).toEqual(fromDe)
            // THIS is the assertion the old implementation could not survive.
            // With `comp_damage_adHeavy` and `comp_damage_apHeavy` reading alike,
            // `label === t("comp_damage_adHeavy")` fired for AP-heavy comps too,
            // and with `comp_damage_unknown` reading like `comp_damage_mixed` the
            // mixed strength appeared on comps with no known damage at all.
            expect(fromColliding).toEqual(fromDe)
        })
    }

    it("exercises all three call sites rather than comparing empty reports", () => {
        // Anti-vacuity: two empty arrays match no matter what the code does, so
        // pin that the fixtures really drive both warnings and the strength.
        const adHeavy = decisionsOf(generateTeamCompReport(damageFixtures[AD_HEAVY].slots, translatorFor(de)), de)
        const apHeavy = decisionsOf(generateTeamCompReport(damageFixtures[AP_HEAVY].slots, translatorFor(de)), de)
        const mixed = decisionsOf(generateTeamCompReport(damageFixtures[MIXED].slots, translatorFor(de)), de)
        const unknown = decisionsOf(generateTeamCompReport(damageFixtures[UNKNOWN_EMPTY].slots, translatorFor(de)), de)

        expect(adHeavy.warnings).toContain("info:comp_warnTitle_adHeavy")
        expect(adHeavy.warnings).not.toContain("info:comp_warnTitle_apHeavy")
        expect(apHeavy.warnings).toContain("info:comp_warnTitle_apHeavy")
        expect(apHeavy.warnings).not.toContain("info:comp_warnTitle_adHeavy")
        expect(mixed.strengths).toContain("comp_strength_mixed")
        expect(unknown.strengths).not.toContain("comp_strength_mixed")
    })

    it("still renders the two languages differently", () => {
        // Without this the DE/EN comparison above could pass on two identical
        // catalogues and would prove nothing about language independence.
        const fromDe = generateTeamCompReport(damageFixtures[AD_HEAVY].slots, translatorFor(de))
        const fromEn = generateTeamCompReport(damageFixtures[AD_HEAVY].slots, translatorFor(en))

        expect(fromDe.warnings.length).toBeGreaterThan(0)
        expect(fromDe.warnings.map((w) => w.title)).not.toEqual(fromEn.warnings.map((w) => w.title))
        expect(fromDe.damageProfile.label).not.toBe(fromEn.damageProfile.label)
    })

    it("the colliding catalogue really does flip the pre-kind comparisons", () => {
        // With a correct catalogue the old label comparison and the new kind
        // comparison agree, which is why the defect never showed in production.
        for (const catalogue of [de, en]) {
            const apHeavy = generateTeamCompReport(damageFixtures[AP_HEAVY].slots, translatorFor(catalogue))
            expect(apHeavy.damageProfile.kind).toBe("apHeavy")
            expect(legacyDamageDecisions(apHeavy.damageProfile.label, catalogue)).toEqual({
                adHeavyWarning: false,
                apHeavyWarning: true,
                mixedStrength: false,
            })
        }

        // Reword two entries and the old comparison starts answering yes twice:
        // the AP-heavy comp would have collected the AD-heavy warning as well.
        const apHeavy = generateTeamCompReport(damageFixtures[AP_HEAVY].slots, translatorFor(collidingCatalogue))
        expect(apHeavy.damageProfile.kind).toBe("apHeavy")
        expect(legacyDamageDecisions(apHeavy.damageProfile.label, collidingCatalogue)).toEqual({
            adHeavyWarning: true,
            apHeavyWarning: true,
            mixedStrength: false,
        })

        // ...and a comp with no known damage would have earned the mixed
        // strength, while `kind` correctly reports that there is nothing to say.
        const unknown = generateTeamCompReport(damageFixtures[UNKNOWN_FOUR].slots, translatorFor(collidingCatalogue))
        expect(unknown.damageProfile.kind).toBe("unknown")
        expect(legacyDamageDecisions(unknown.damageProfile.label, collidingCatalogue).mixedStrength).toBe(true)
    })

    it("keeps the colliding catalogue genuinely broken and the real ones intact", () => {
        // If someone ever tidies collidingCatalogue back into four distinct
        // values, the comparison above stops defending anything. Pin the trap.
        expect(collidingCatalogue.comp_damage_adHeavy).toBe(collidingCatalogue.comp_damage_apHeavy)
        expect(collidingCatalogue.comp_damage_unknown).toBe(collidingCatalogue.comp_damage_mixed)

        // And the real catalogues are NOT colliding, which is the only reason
        // the shipped app behaved correctly before `kind` existed.
        const deDamage = [de.comp_damage_unknown, de.comp_damage_adHeavy, de.comp_damage_apHeavy, de.comp_damage_mixed]
        const enDamage = [en.comp_damage_unknown, en.comp_damage_adHeavy, en.comp_damage_apHeavy, en.comp_damage_mixed]
        expect(new Set(deDamage).size).toBe(4)
        expect(new Set(enDamage).size).toBe(4)
    })
})
