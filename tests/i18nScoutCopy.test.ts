/**
 * Property tests for the translation catalogues (src/i18n/de.ts, src/i18n/en.ts).
 *
 * These are deliberately *property* tests, never golden texts: not a single
 * assertion here pins down what a string says. Wording is a product decision
 * and has to stay changeable without a test run turning red. What is pinned
 * down is the shape of the copy — key parity, placeholder parity, whitespace
 * hygiene, and two rules about how a sentence in the Tournament Scout may be
 * built.
 *
 * Vitest runs in Node here (see vite.config.ts, test.environment: 'node') —
 * no jsdom, no document, no window. That is fine: both modules are plain
 * object literals and nothing below renders a component.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"

/**
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. These two views exist only
 * so the loops below can walk the catalogues generically. The values really are
 * all strings — test 1 and the compile step guarantee the shape.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const LANGS: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["de", DE],
    ["en", EN],
]

/** The prefix that marks a Tournament Scout string. */
const SCOUT_PREFIX = "scout_"

const scoutKeys = (dict: Record<string, string>): string[] =>
    Object.keys(dict).filter((key) => key.startsWith(SCOUT_PREFIX))

/** Trim a value for a failure label so a long paragraph stays readable. */
const preview = (value: string): string =>
    value.length <= 160 ? value : `${value.slice(0, 160)}…`

// ---------------------------------------------------------------------------
// 1. Key parity
// ---------------------------------------------------------------------------

/**
 * Parity is *already* enforced at compile time: src/i18n/types.ts derives
 * `TranslationKey = keyof typeof de` and `Translations = { [K in
 * TranslationKey]: string }`, and en.ts declares `export const en:
 * Translations`. A missing or surplus key in en.ts is therefore a tsc error
 * today, and this test cannot be the only thing standing between the app and an
 * orphaned key.
 *
 * It is still worth having, for two honest reasons:
 *  - it states the invariant in one readable place instead of leaving it
 *    implicit in a mapped type three files away, and
 *  - it survives a future rebuild of that type chain. The day `Translations`
 *    becomes `Partial<…>`, or en.ts loses its type annotation, the compile-time
 *    guarantee disappears silently — this test would not.
 */
describe("i18n key parity", () => {
    it("DE and EN expose exactly the same keys", () => {
        const deKeys = Object.keys(DE)
        const enKeys = Object.keys(EN)

        const onlyInDe = deKeys.filter((key) => !(key in EN))
        const onlyInEn = enKeys.filter((key) => !(key in DE))

        expect(onlyInDe, `keys present in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `keys present in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
        expect(enKeys.length, "de.ts and en.ts must hold the same number of keys").toBe(deKeys.length)
    })
})

// ---------------------------------------------------------------------------
// 2. No dash asides in Tournament Scout copy
// ---------------------------------------------------------------------------

/**
 * A dash aside ("Keine der vier Seiten — OP.GG, … — lässt sich auslesen")
 * reads as machine-written. The Scout copy is rewritten without them; this test
 * keeps them from creeping back in.
 *
 * Scope — deliberately `scout_` only. Other areas of the app use a dash as a
 * *decorative* element rather than as an aside, e.g. `cn_noRating` is
 * "— Keine Einschätzung —" on purpose. Widening this rule to every key would
 * force an allowlist that is longer than the rule itself, and would quietly
 * take a copy decision for tabs this task never looked at.
 *
 * No allowlist. Every `scout_` value was checked before this test was written:
 * there is no key whose value is a standalone "—" placeholder in a table cell,
 * and no `scout_` value contains an en dash or a "--" today. The only short hit
 * was `scout_lineupEmptySlot` ("Frei — Spieler zuweisen"), which is a genuine
 * aside and part of the rewrite, not an exception to it. If a future cell
 * really needs a bare "—", add a named constant here and justify each entry —
 * do not loosen the pattern.
 */
describe("scout copy avoids dash asides", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: no scout_ value contains an em dash, en dash or "--"`, () => {
            for (const key of scoutKeys(dict)) {
                const value = dict[key]
                const label = `${lang}.${key} contains a dash aside: "${preview(value)}"`
                expect(value, label).not.toMatch(/[—–]/)
                expect(value, label).not.toContain("--")
            }
        })
    }
})

// ---------------------------------------------------------------------------
// 3. Placeholder parity
// ---------------------------------------------------------------------------

/**
 * `fillPlaceholders()` (src/components/scout/scoutUiHelpers.ts) substitutes
 * `/\{(\w+)\}/g` and *removes* any placeholder it has no parameter for, so a
 * placeholder only one language knows about does not show up as "{winrate}" on
 * screen — it shows up as a hole in the sentence. That is the failure this test
 * catches, and it is invisible to the compiler because every value is just a
 * string.
 *
 * The pattern mirrors the runtime one on purpose: `{a b}` is not a placeholder
 * at runtime, so it must not count as one here either. Duplicates within a
 * value are irrelevant (a language may repeat a name), hence set comparison.
 */
const PLACEHOLDER_PATTERN = /\{\w+\}/g

const placeholdersOf = (value: string): string[] =>
    [...new Set(value.match(PLACEHOLDER_PATTERN) ?? [])].sort()

describe("i18n placeholder parity", () => {
    it("every key uses the same {placeholders} in DE and EN", () => {
        for (const key of Object.keys(DE)) {
            if (!(key in EN)) continue // reported by the key-parity test instead

            const dePlaceholders = placeholdersOf(DE[key])
            const enPlaceholders = placeholdersOf(EN[key])

            expect(
                enPlaceholders,
                `${key}: placeholders differ — de=[${dePlaceholders.join(", ")}] en=[${enPlaceholders.join(", ")}]`,
            ).toEqual(dePlaceholders)
        }
    })
})

// ---------------------------------------------------------------------------
// 4. Clean values
// ---------------------------------------------------------------------------

/**
 * Leading/trailing whitespace and doubled spaces are invisible in the source
 * but visible on screen, and they survive to the screen for every string that
 * is rendered directly (only strings routed through `fillPlaceholders()` get
 * collapsed by its `tidyText()`).
 *
 * Empty values are explicitly *not* a violation: en.ts keeps `dh_selectBanSuffix`
 * and `dh_selectPickSuffix` empty on purpose (German needs a suffix there,
 * English does not). `"" === "".trim()` and `""` holds no double space, so both
 * pass the checks below without needing a special case.
 */
describe("i18n values are clean", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: no value has stray leading, trailing or doubled spaces`, () => {
            for (const [key, value] of Object.entries(dict)) {
                expect(
                    value,
                    `${lang}.${key} has leading or trailing whitespace: "${preview(value)}"`,
                ).toBe(value.trim())
                expect(
                    value,
                    `${lang}.${key} contains a doubled space: "${preview(value)}"`,
                ).not.toMatch(/ {2}/)
            }
        })
    }
})

// ---------------------------------------------------------------------------
// 5. Sentence length in Scout copy
// ---------------------------------------------------------------------------

/**
 * A soft guard against the other half of the machine-written feel: one sentence
 * that keeps going. The limit is 200 characters for a *single* sentence — well
 * above normal UI prose (the median Scout sentence is far below 100), so it
 * only bites on real runaways.
 *
 * How a "sentence" is found, and where the heuristic is fuzzy:
 *
 *  - The value is split on newlines first. Two Scout values are multi-line
 *    input placeholders (`scout_inputPlaceholder`,
 *    `scout_import_pastePlaceholder`) that list URLs and paste examples line by
 *    line. They are not prose, and treating the whole block as one sentence
 *    would be a pure false alarm.
 *  - Inside a line, a boundary is `.`/`!`/`?` **followed by whitespace**.
 *    Requiring the whitespace is what keeps "OP.GG", "DPM.LOL" and decimals
 *    like "2.60" intact — none of them has a space after the dot.
 *
 *  - Known over-splitting: "z. B." (in the manual-entry placeholders) and the
 *    numbered step labels ("1. Spieler wählen") split into short fragments.
 *    This is accepted, because the error direction is the harmless one: an
 *    extra split can only make fragments *shorter*, so at worst it hides a long
 *    sentence (false negative). It can never invent one.
 *  - The dangerous direction would be a *missed* boundary, which is what would
 *    produce a false alarm. That needs a sentence ending with no whitespace
 *    after it, which does not occur in this copy — and if it ever did, the
 *    result would be one over-long "sentence" that a human should look at
 *    anyway.
 */
const MAX_SCOUT_SENTENCE_LENGTH = 200

const sentencesOf = (value: string): string[] =>
    value
        .split(/\n+/)
        .flatMap((line) => line.split(/(?<=[.!?])\s+/))
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0)

describe("scout copy avoids runaway sentences", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: no scout_ value holds a single sentence longer than ${MAX_SCOUT_SENTENCE_LENGTH} characters`, () => {
            for (const key of scoutKeys(dict)) {
                for (const sentence of sentencesOf(dict[key])) {
                    expect(
                        sentence.length,
                        `${lang}.${key} has a ${sentence.length}-character sentence: "${preview(sentence)}"`,
                    ).toBeLessThanOrEqual(MAX_SCOUT_SENTENCE_LENGTH)
                }
            }
        })
    }
})
