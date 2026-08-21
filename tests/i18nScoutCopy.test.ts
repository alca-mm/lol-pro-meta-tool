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

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

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

// ---------------------------------------------------------------------------
// 6. Value length in Scout copy
// ---------------------------------------------------------------------------

/**
 * Section 5 above bounds a single *sentence*. This section bounds a whole
 * *value*, which is the shape a justification paragraph actually has: three or
 * four correct short sentences in a row that together explain, at length, why
 * the tool works the way it works. The Tournament Scout used to open with a
 * block like that; the tab is meant to read like a tool, not like a README.
 *
 * Where the number comes from — measured over all 295 `scout_` keys in both
 * catalogues, taking max(de, en) per key, at the time this test was written:
 *
 *     median 32 · p90 121 · longest non-exempt value 200 · longest value 297
 *     values over 120 chars: 30 · over 200: 3 · over 220: 3 · over 240: 1
 *
 * 220 was chosen off that distribution, not invented:
 *  - it sits 20 characters above the longest value that is *not* on the
 *    allowlist (`scout_import_unparsed_page_noise`, 200), so ordinary copy
 *    edits have room to breathe without a red run,
 *  - it sits below every allowlisted value (the shortest is 223), so the limit
 *    genuinely separates "normal UI copy" from "the three strings that are long
 *    on purpose" instead of drawing a line nothing can cross, and
 *  - it is roughly seven times the median. A re-added justification block would
 *    be several hundred characters and could not slip under it.
 *
 * What this does NOT do: it says nothing about how many *keys* a screen shows.
 * Ten 200-character paragraphs stacked in the default view would pass here and
 * still be clutter. Length is a proxy, and a deliberately blunt one.
 */
const MAX_SCOUT_VALUE_LENGTH = 220

/**
 * Keys allowed past the limit, each with the reason it earns the exemption.
 * Three entries, and the list is meant to stay about this size — the moment it
 * grows to cover a normal hint or an intro, the rule has been talked out of
 * existence rather than changed.
 *
 * Two keys that looked like candidates are deliberately NOT here, because the
 * measurement says they do not need to be: `scout_player_removeConfirm` (138)
 * and the multi-line format example `scout_inputPlaceholder` (170) both sit
 * comfortably under the limit. An exemption granted "just in case" is how an
 * allowlist stops meaning anything.
 */
const LONG_BY_DESIGN: ReadonlyArray<readonly [key: string, why: string]> = [
    [
        "scout_reparseConfirmBody",
        // 297/267. A destructive-action confirmation. It has to name what is
        // rebuilt, what happens to players who dropped out of the input, and
        // that the data is archived rather than deleted. Shortening it would
        // mean withholding one of those three facts at the exact moment the
        // user decides.
        "data-loss confirmation: must state rebuild, drop-out and archive",
    ],
    [
        "scout_restoreOverwriteConfirm",
        // 223/195. Same class: restoring replaces existing scouting data in
        // full, and the sentence has to say so before the click.
        "data-loss confirmation: restore overwrites existing scouting data",
    ],
    [
        "scout_dataHonesty",
        // 234/238. The honesty core of the tab (it does not read the sites
        // itself, it builds the links, you enter the values, only entered data
        // is scored, nothing is estimated). Five claims, all load-bearing. It
        // is not clutter because it no longer stands in the default view:
        // TournamentScout.tsx renders it inside a collapsed details element
        // behind `scout_dataHonestySummary`, which
        // tests/scoutUxDeclutter.test.ts asserts.
        "honesty statement, and it lives inside a collapsed details element",
    ],
]

const LONG_BY_DESIGN_KEYS = new Set(LONG_BY_DESIGN.map(([key]) => key))

describe("scout copy avoids long justification blocks", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: no scout_ value exceeds ${MAX_SCOUT_VALUE_LENGTH} characters unless it is long by design`, () => {
            for (const key of scoutKeys(dict)) {
                if (LONG_BY_DESIGN_KEYS.has(key)) continue

                const value = dict[key]
                expect(
                    value.length,
                    `${lang}.${key} is ${value.length} characters long: "${preview(value)}"\n` +
                        "Shorten it, move it behind a collapsed details element, or - if it is " +
                        "genuinely load-bearing at this length - add it to LONG_BY_DESIGN with a reason.",
                ).toBeLessThanOrEqual(MAX_SCOUT_VALUE_LENGTH)
            }
        })
    }

    /**
     * Keeps the allowlist from rotting in either direction: a renamed key would
     * leave a dead entry behind that silently exempts nothing, and a key that
     * has since been shortened would leave a live entry exempting a value that
     * no longer needs it — which is how an allowlist quietly turns into a
     * loophole. Both are one-line fixes in this file.
     */
    it("every allowlisted key exists and still needs its exemption", () => {
        for (const [key, why] of LONG_BY_DESIGN) {
            expect(DE[key], `LONG_BY_DESIGN lists ${key}, which is not a key in de.ts`).toBeTypeOf(
                "string",
            )
            expect(EN[key], `LONG_BY_DESIGN lists ${key}, which is not a key in en.ts`).toBeTypeOf(
                "string",
            )

            const longest = Math.max(DE[key]?.length ?? 0, EN[key]?.length ?? 0)
            expect(
                longest,
                `${key} is down to ${longest} characters (${why}) and no longer needs the ` +
                    "exemption - drop it from LONG_BY_DESIGN.",
            ).toBeGreaterThan(MAX_SCOUT_VALUE_LENGTH)
        }
    })
})

// ---------------------------------------------------------------------------
// 7. Technical vocabulary stays in the collapsed block
// ---------------------------------------------------------------------------

/**
 * The other half of "reads like a tool, not like documentation": the default
 * view must not argue. Words like CORS, anti-bot, endpoint or scraping answer a
 * question the user did not ask; they belong to the collapsed
 * "why is there no automatic fetch" block and nowhere else.
 *
 * This is a *vocabulary* rule, not a golden text — none of the strings below is
 * pinned. Rewording the blocked-reason lines freely is fine; moving that kind
 * of word back out into a hint, an intro or a step title is not.
 *
 * Measured before writing: exactly seven `scout_` keys carry any of these terms
 * today, and all seven sit in the exempt set. CORS, anti-bot, Cloudflare,
 * scraping, proxy and server currently appear in *no* value at all, in either
 * language — those entries are pure regression guards for wording that has
 * already been removed once.
 *
 * Deliberately NOT on the list: "header" (the Scout import genuinely talks
 * about a table header row — six keys, all legitimate) and
 * "automatic"/"automatisch" (`scout_reason_manual_entry_only` says "nothing was
 * fetched automatically", which is the honest short answer, not a
 * justification). Both would have been pure false alarms.
 */
const TECHNICAL_VOCABULARY: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
    ["CORS", /\bCORS\b/i],
    ["anti-bot", /anti[\s-]?bot|bot[\s-]?schutz/i],
    ["endpoint / API / Schnittstelle", /schnittstelle|endpoint|\bAPI\b/i],
    ["browser", /browser/i],
    ["Cloudflare", /cloudflare/i],
    ["scraping", /scrap/i],
    ["terms of use / Nutzungsbedingungen", /nutzungsbeding|terms of (use|service)|\bToS\b/i],
    ["undocumented / undokumentiert", /undokument|undocument/i],
    ["HTML / markup", /\bHTML\b|markup/i],
    ["proxy / server", /\bproxy\b|\bserver\b/i],
]

/**
 * The exempt set, as measured — deliberately tighter than "everything that
 * looks technical".
 *
 *  - `scout_blocked_*` is reached only through `scoutBlockedKey(status.reason)`
 *    in ScoutStatsImportPanel.tsx, inside the collapsed details element. Naming
 *    the obstacle is the entire job of those lines.
 *  - `scout_status_*` is the per-player status line;
 *    `scout_status_not_supported_in_browser` is the honest one-sentence answer
 *    for a source that cannot be read, and it is the only member that hits.
 *  - the two `autoFetch` keys are the summary and the per-source line of that
 *    same collapsed block.
 *
 * Two keys that were proposed for this list are intentionally absent:
 * `scout_dataHonesty` and `scout_import_honesty` contain none of these terms
 * today, so exempting them would widen the rule for nothing. They talk about
 * what the tool does, not about which HTTP mechanism stops it — and that
 * distinction is exactly what this rule protects.
 */
const TECHNICAL_DETAIL_PREFIXES = ["scout_blocked_", "scout_status_"] as const
const TECHNICAL_DETAIL_KEYS = [
    "scout_import_autoFetchSummary",
    "scout_import_autoFetchUnavailable",
] as const

const isTechnicalDetailKey = (key: string): boolean =>
    TECHNICAL_DETAIL_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    (TECHNICAL_DETAIL_KEYS as readonly string[]).includes(key)

describe("scout copy keeps technical vocabulary out of the default view", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: no scout_ value outside the collapsed block explains the mechanism`, () => {
            for (const key of scoutKeys(dict)) {
                if (isTechnicalDetailKey(key)) continue

                const value = dict[key]
                for (const [label, pattern] of TECHNICAL_VOCABULARY) {
                    expect(
                        pattern.test(value),
                        `${lang}.${key} argues with "${label}": "${preview(value)}"\n` +
                            "That belongs in the collapsed auto-fetch block " +
                            "(scout_blocked_*, scout_status_*, scout_import_autoFetch*), " +
                            "not in copy the user sees before asking.",
                    ).toBe(false)
                }
            }
        })
    }

    /**
     * Same anti-rot idea as the length allowlist: an exemption that no longer
     * exempts anything is an exemption nobody notices growing. Every group
     * listed above must still hold at least one value that would otherwise trip
     * the rule.
     */
    it("every exempt group still carries technical vocabulary", () => {
        const carriesVocabulary = (key: string): boolean =>
            TECHNICAL_VOCABULARY.some(
                ([, pattern]) => pattern.test(DE[key] ?? "") || pattern.test(EN[key] ?? ""),
            )

        for (const prefix of TECHNICAL_DETAIL_PREFIXES) {
            const family = scoutKeys(DE).filter((key) => key.startsWith(prefix))
            expect(family.length, `${prefix}* is empty - drop the prefix`).toBeGreaterThan(0)
            expect(
                family.some(carriesVocabulary),
                `no ${prefix}* value carries technical vocabulary any more - the prefix ` +
                    "exemption is dead, drop it from TECHNICAL_DETAIL_PREFIXES.",
            ).toBe(true)
        }

        for (const key of TECHNICAL_DETAIL_KEYS) {
            expect(DE[key], `TECHNICAL_DETAIL_KEYS lists ${key}, which is not a key`).toBeTypeOf(
                "string",
            )
            expect(
                carriesVocabulary(key),
                `${key} no longer carries technical vocabulary - drop it from ` +
                    "TECHNICAL_DETAIL_KEYS.",
            ).toBe(true)
        }
    })
})

// ---------------------------------------------------------------------------
// 8. No dead scout_ keys
// ---------------------------------------------------------------------------

/**
 * A shortened catalogue is only shortened if the strings that left the UI left
 * the catalogue too. Otherwise the next reader finds a key that still reads
 * like a promise the app no longer makes — which is what the removed Riot
 * auto-import would have left behind, 42 keys per language, if nobody had gone
 * looking (CLAUDE.md, P4).
 *
 * How a key counts as referenced:
 *  1. its full name appears literally anywhere in src/ outside src/i18n, or
 *  2. it starts with a template prefix found in src/, i.e. the `scout_reason_`
 *     of a `scout_reason_${code}` template literal. Eighteen such prefixes
 *     exist today (scout_blocked_, scout_reason_, scout_import_warning_, ...).
 *
 * Where the heuristic is loose, and in which direction: rule 2 accepts a whole
 * family at once, so a `scout_reason_gone` whose reason code no longer exists
 * still counts as referenced. That is a *missed* dead key, never a false alarm
 * — the harmless direction, and the reason this test is worth having at all. A
 * test of this shape that cried wolf would be worse than no test, so the
 * heuristic is biased all the way towards silence.
 *
 * Result at the time of writing: 295 scout_ keys, 0 unreferenced.
 *
 * src/i18n is excluded on purpose: de.ts and en.ts *define* the keys, so
 * scanning them would make every key look referenced.
 */
const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url))

const srcSources = (): { files: string[]; text: string } => {
    const entries = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    const files = entries
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.(ts|tsx)$/.test(entry) && !entry.startsWith("i18n/"))
    return {
        files,
        text: files.map((file) => readFileSync(`${SRC_DIR}${file}`, "utf8")).join("\n"),
    }
}

/** Finds `scout_reason_` inside a `scout_reason_${code}` template literal. */
const TEMPLATE_PREFIX_PATTERN = /scout_[a-zA-Z0-9_]*(?=\$\{)/g

describe("scout i18n keys are all referenced", () => {
    const { files, text } = srcSources()
    const prefixes = [...new Set(text.match(TEMPLATE_PREFIX_PATTERN) ?? [])]

    it("scanned a plausible source tree", () => {
        // Without this the section passes vacuously the day the scan silently
        // reads nothing: an empty `text` makes every key look dead, and a
        // mis-globbed one makes every key look alive.
        expect(files.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no scout_title reference at all").toContain("scout_title")
    })

    it("uses no catch-all template that would make this test vacuous", () => {
        // A `scout_${x}` template would produce the prefix "scout_" and mark
        // every key referenced. If that pattern is ever introduced on purpose,
        // this test has to be reworked rather than deleted.
        expect(prefixes, "a bare scout_ template prefix defeats this whole check").not.toContain(
            "scout_",
        )
        expect(prefixes.length, "no scout_ template prefix found at all").toBeGreaterThan(0)
    })

    it("every scout_ key is used somewhere in src/", () => {
        const unreferenced = scoutKeys(DE).filter(
            (key) => !text.includes(key) && !prefixes.some((prefix) => key.startsWith(prefix)),
        )

        expect(
            unreferenced,
            "these scout_ keys are in the catalogues but nowhere in src/:\n" +
                `${unreferenced.join("\n")}\n` +
                "Delete them from de.ts and en.ts, or - if they are reached through a " +
                "template this scan does not know - extend TEMPLATE_PREFIX_PATTERN.",
        ).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// 9. Numeric example placeholders spell a decimal the way the app does
// ---------------------------------------------------------------------------

/**
 * The three `scout_manual_*Placeholder` values are the only Scout strings that
 * teach a *notation* instead of describing something, and one of them taught
 * the wrong one until 0.5.3: `scout_manual_kdaPlaceholder` read "z. B. 3,2" in
 * German while the app renders that very number as "3.2".
 *
 * Why the app is right and the placeholder was wrong:
 *  - `formatScoutNumber()` (src/components/scout/scoutUiHelpers.ts) is
 *    locale-neutral on purpose and formats through `String()`, so every number
 *    the Scout prints carries a decimal point in both languages.
 *  - `kdaInputText()` is `String(kda)` and writes back into this exact input.
 *    The user types "3,2" once, the row is stored, and from the next render on
 *    the field reads "3.2". The placeholder was teaching the one spelling the
 *    user never sees again.
 *
 * THE FIX IS NEVER TO TIGHTEN THE PARSER. `parseKdaInput()` and
 * `parseWinrateInput()` both open with `raw.trim().replace(",", ".")` and
 * accept a German comma as a deliberate courtesy to a German keyboard. 0.5.3
 * was a copy change, not a parser change; making the field reject "3,2" would
 * turn a cosmetic inconsistency into a real usability regression.
 *
 * Scope — these three keys, and deliberately nothing else. A blanket "no comma
 * in scout_ copy" rule is out of the question: German prose is full of
 * legitimate commas, and such a rule would flag most of the catalogue.
 *
 * Which of the three carries which half of the rule, and why:
 *  - "no comma-formed decimal" covers all three. It is written as `\d,\d`, a
 *    comma *between digits*, so an ordinary punctuation comma in some later
 *    rewrite ("z. B. 14, gern mehr") cannot trip it.
 *      · kda is the key this section exists for.
 *      · winrate earns it on its own merits: `parseWinrateInput()` accepts
 *        decimals and winrates print through `formatScoutNumber()` too, so
 *        "z. B. 62,5" would be the identical mistake, one edit away.
 *      · games is the weakest of the three and is included with open eyes.
 *        `parseGamesInput()` is `/^\d+$/`, so a decimal cannot legitimately
 *        appear there at all and this half can only ever catch a typo. It costs
 *        nothing given the digit-anchored pattern, and leaving one member of a
 *        three-key family out of a family rule only makes the next reader
 *        wonder whether the omission was an oversight.
 *  - "must show a point-formed decimal" covers the KDA key ALONE. The other two
 *    examples are integers ("14", "62") and read better that way; demanding a
 *    decimal point from them would force a decimal into two examples that do
 *    not want one.
 *
 * The lead-in check below is the closest this file comes to pinning text down,
 * and it stays narrow for that reason: it asserts only that the value still
 * *reads as an example*. A bare "3.2" in a placeholder looks like a value that
 * is already filled in, not like guidance, and guidance is this string's entire
 * job. If the copy ever moves to another example marker, widen the pattern
 * here; the wording itself stays free.
 */
const NUMERIC_EXAMPLE_PLACEHOLDERS = [
    "scout_manual_gamesPlaceholder",
    "scout_manual_winratePlaceholder",
    "scout_manual_kdaPlaceholder",
] as const

/** The subset whose example is a decimal, and must therefore show a point. */
const DECIMAL_EXAMPLE_PLACEHOLDERS = ["scout_manual_kdaPlaceholder"] as const

/** A comma between two digits: a decimal separator, not prose punctuation. */
const COMMA_DECIMAL = /\d,\d/

/** A point between two digits, i.e. the notation the app itself renders. */
const POINT_DECIMAL = /\d\.\d/

/** How each language marks "this is only an example". */
const EXAMPLE_LEAD_IN: Record<string, RegExp> = {
    de: /^z\.\s?B\.\s/,
    en: /^e\.\s?g\.\s/,
}

const SEPARATOR_HINT =
    "The Scout prints numbers through formatScoutNumber(), which is locale-neutral, and " +
    "kdaInputText() writes String(kda) back into this same field - so the user reads a decimal " +
    "POINT there from the first save onwards, and the placeholder has to teach that spelling.\n" +
    "Do NOT 'fix' this in the parser: parseKdaInput() and parseWinrateInput() accept both ',' " +
    "and '.' on purpose, and have to keep doing so."

describe("scout numeric example placeholders", () => {
    for (const [lang, dict] of LANGS) {
        it(`${lang}: numeric example placeholders spell a decimal the way the app does`, () => {
            for (const key of NUMERIC_EXAMPLE_PLACEHOLDERS) {
                const value = dict[key]
                expect(
                    COMMA_DECIMAL.test(value),
                    `${lang}.${key} spells a decimal with a comma: "${preview(value)}"\n${SEPARATOR_HINT}`,
                ).toBe(false)
            }

            for (const key of DECIMAL_EXAMPLE_PLACEHOLDERS) {
                const value = dict[key]
                expect(
                    POINT_DECIMAL.test(value),
                    `${lang}.${key} no longer shows a point-formed decimal: "${preview(value)}"\n${SEPARATOR_HINT}`,
                ).toBe(true)
            }
        })

        it(`${lang}: numeric example placeholders still read as an example`, () => {
            const leadIn = EXAMPLE_LEAD_IN[lang]
            expect(leadIn, `no example lead-in pattern is defined for "${lang}"`).toBeDefined()

            for (const key of NUMERIC_EXAMPLE_PLACEHOLDERS) {
                const value = dict[key]
                expect(
                    leadIn.test(value),
                    `${lang}.${key} lost its example lead-in: "${preview(value)}"\n` +
                        "Without it the placeholder reads as a value that is already filled in " +
                        "rather than as guidance.",
                ).toBe(true)
            }
        })
    }

    /**
     * Anti-vacuity, same idea as the allowlist guards above: a rename would
     * leave the checks looping over keys that resolve to `undefined`, and
     * `RegExp.test(undefined)` matches nothing at all - the section would go
     * quiet instead of red. Both fixes are one line in this file.
     */
    it("the placeholder keys this section guards still exist", () => {
        for (const key of NUMERIC_EXAMPLE_PLACEHOLDERS) {
            for (const [lang, dict] of LANGS) {
                expect(
                    dict[key],
                    `${lang}.ts no longer holds ${key} - this section would pass vacuously. ` +
                        "Rename it in NUMERIC_EXAMPLE_PLACEHOLDERS too.",
                ).toBeTypeOf("string")
            }
        }
    })
})
