/**
 * App-wide locale guards: exactly two modules may resolve a locale.
 *
 * WHAT WENT WRONG, and why this file exists
 *
 * Before 0.5.5 the app answered "which locale?" four different ways at the same
 * time. `"de-DE"` was hardcoded in DataSourceInfo, PatchWeightPanel and
 * DraftHelper; TeamDraftLibraryPanel passed `undefined`, i.e. whatever the
 * browser felt like; and only src/components/player-results/ actually followed
 * the language switch. A German user on an English machine could read `1.234`
 * in one panel and `1,234` in the next, and a date panel could show
 * `Aug 21, 2026` inside otherwise German copy.
 *
 * THE RULE these guards enforce: components pass `lang`; `src/i18n/format.ts`
 * and `src/i18n/locale.ts` resolve it. Nothing else in `src/` may name a locale
 * or call `Intl` / a `toLocale*` method. There is exactly one carve-out, and it
 * is named and justified below.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE EVERY SOURCE SCAN
 *
 * `src/i18n/format.ts`, `src/i18n/locale.ts` and
 * src/components/player-results/playerResultsFormat.ts all document these rules
 * by QUOTING the wrong code: their headers spell out `"de-DE"`,
 * `toLocaleDateString("de-DE", …)` and `Intl.NumberFormat` as the patterns they
 * replace. A raw scan fails on exactly the prose that exists to stop the next
 * person reintroducing the bug, and the obvious "fix" would be deleting that
 * prose. A file allowlist would be worse: it would exempt the files most likely
 * to break the rule. So every scan strips line and block comments first — the
 * same decision, for the same reason, as tests/playerResultsI18n.test.ts and
 * tests/scoutKdaVisibility.test.ts.
 *
 * WHAT THESE GUARDS CANNOT PROVE
 *
 * Vitest runs in Node with `environment: 'node'` and no jsdom, so nothing here
 * renders. These are source-text scans. They show that the call sites name no
 * locale and that the two i18n modules do the work; they do NOT show that a
 * component actually reaches its formatter at runtime, that `lang` holds the
 * right value, or that the rendered date reads well. That stays a manual check
 * in both languages.
 */

import { readdirSync, readFileSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const SRC = fileURLToPath(new URL("../src/", import.meta.url))

/** Every `.ts`/`.tsx` under `src/`, as paths relative to `src/` with `/` separators. */
function sourceFiles(dir = ""): string[] {
    const found: string[] = []
    for (const entry of readdirSync(SRC + dir, { withFileTypes: true })) {
        const rel = dir === "" ? entry.name : `${dir}/${entry.name}`
        if (entry.isDirectory()) found.push(...sourceFiles(rel))
        else if (/\.tsx?$/.test(entry.name)) found.push(rel)
    }
    return found
}

const read = (rel: string): string => readFileSync(SRC + rel.split("/").join(sep), "utf8")

/**
 * Remove line and block comments so a scan judges CODE only.
 *
 * The `(?<!:)` lookbehind is not decoration: without it a `https://` inside a
 * string literal eats the rest of its line, and hiding a match is the one
 * failure mode a guard cannot afford. tests/playerResultsI18n.test.ts uses the
 * same lookbehind for the same reason; this file claims parity with it in the
 * header, so it has to actually have it.
 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, " ")
}

const code = (rel: string): string => stripComments(read(rel))

/* ==========================================================================
 * The two modules that are allowed to resolve a locale, and the one carve-out.
 * ========================================================================== */

/** Owns the `Lang` -> BCP-47 map. The only place a locale STRING may appear. */
const LOCALE_MODULE = "i18n/locale.ts"

/** Owns the app-wide `Intl` calls. Resolves every one through `localeForLang`. */
const FORMAT_MODULE = "i18n/format.ts"

/**
 * The one carve-out, and it is not laziness.
 *
 * `formatMatchDate` renders `21.08.26` with a TWO-DIGIT year, while every date
 * function in `i18n/format.ts` uses a four-digit one. Rerouting it would have
 * silently turned the match table's date column into `21.08.2026` and widened
 * a column built to be narrow. It still resolves its locale through
 * `localeForLang(lang)` — it names no locale of its own — so the rule holds
 * where it matters.
 */
const PLAYER_RESULTS_FORMAT_MODULE = "components/player-results/playerResultsFormat.ts"

const LOCALE_AWARE_MODULES = [LOCALE_MODULE, FORMAT_MODULE, PLAYER_RESULTS_FORMAT_MODULE]

/* ==========================================================================
 * The predicates. Defined once so the synthetic fixtures at the bottom can run
 * the EXACT code the real assertions run.
 * ========================================================================== */

/** A BCP-47 tag in a string literal: `"de-DE"`, `'en-US'`, `` `en-GB` ``. */
const namesALocale = (source: string): boolean =>
    /["'`][a-z]{2}-[A-Z]{2}["'`]/.test(source)

/** A `toLocale*` method call, however it is parameterised. */
const callsToLocaleMethod = (source: string): boolean =>
    /\.toLocale(String|DateString|TimeString)\s*\(/.test(source)

/** An `Intl.` constructor or helper. */
const usesIntl = (source: string): boolean => /\bIntl\s*\./.test(source)

/** The specific bug that looks harmless: a locale of `undefined`. */
const passesUndefinedLocale = (source: string): boolean =>
    /\.toLocale(String|DateString|TimeString)\s*\(\s*undefined\b/.test(source) ||
    /\bIntl\s*\.\s*\w+\s*\(\s*undefined\b/.test(source)

/** Every locale-bearing call resolves through `localeForLang(...)`. */
const resolvesThroughLocaleForLang = (source: string): boolean =>
    /localeForLang\s*\(/.test(source)

/**
 * A formatter called with a STRING where the language argument belongs.
 *
 * THE BLIND SPOT THIS CLOSES: every predicate above hunts for a full BCP-47
 * tag, so `formatNumber(n, "de-DE")` is caught - but `formatNumber(n, "de")`
 * is not, and it produces the identical user-visible bug. Two of the four
 * rewired components are only INCIDENTALLY protected today: they use `lang`
 * exactly once, so a literal would leave it unused and `noUnusedLocals` would
 * complain. DataSourceInfo.tsx and PatchWeightPanel.tsx use it more than once
 * and would sail straight through.
 *
 * Matches a formatter name, its argument list, a comma, then an opening quote -
 * the only shape that can pin a language at a call site.
 *
 * The argument-list pattern earns its ugliness twice over. `[^)]*` was the
 * obvious first try and it FAILS on the real call `formatDateMedium(new
 * Date(iso), lang)`, because it cannot cross the nested `)`. Allowing one level
 * of nesting fixes that. And quotes are excluded from the consumed set on
 * purpose: without that, `formatNumber(x, lang)} {t("dh_games")}` - a real line
 * in DraftHelper - would match by running past the closing paren into the
 * NEXT call's string, and the guard would false-red on correct code.
 */
const LANGUAGE_PINNED_AT_CALL_SITE =
    /\b(?:formatNumber|formatDateNumeric|formatDateTimeNumeric|formatDateMedium|formatWholeNumber|formatMatchDate)\s*\((?:[^()"'`]|\([^()]*\))*,\s*["'`]/

const pinsALanguageAtCallSite = (source: string): boolean =>
    LANGUAGE_PINNED_AT_CALL_SITE.test(source)

/* ==========================================================================
 * 1. No file outside the locale module may name a locale.
 * ========================================================================== */

describe("no source file hardcodes a locale", () => {
    it("scans a plausible tree", () => {
        const files = sourceFiles()
        expect(files.length, "the source scan found nothing - the glob is broken").toBeGreaterThan(40)
        for (const expected of [
            "components/DataSourceInfo.tsx",
            "components/DraftHelper.tsx",
            "components/draft/PatchWeightPanel.tsx",
            "components/draft/TeamDraftLibraryPanel.tsx",
            FORMAT_MODULE,
            LOCALE_MODULE,
        ]) {
            expect(files, `${expected} is missing from the scan`).toContain(expected)
        }
    })

    it("names a BCP-47 locale only in src/i18n/locale.ts", () => {
        const offenders = sourceFiles().filter(
            (rel) => rel !== LOCALE_MODULE && namesALocale(code(rel)),
        )
        expect(
            offenders,
            `These files hardcode a locale: ${offenders.join(", ")}. A locale string belongs ` +
                `only in src/i18n/locale.ts. Take the language from useTranslation() and pass ` +
                `it to a formatter in src/i18n/format.ts, which calls localeForLang() for you.`,
        ).toEqual([])
    })

    it("still has the map it exempts, so the exemption is not empty", () => {
        const source = code(LOCALE_MODULE)
        expect(namesALocale(source), "src/i18n/locale.ts no longer holds any locale").toBe(true)
        expect(source).toContain("de-DE")
        expect(source).toContain("en-US")
    })
})

/* ==========================================================================
 * 2. No file outside the three locale-aware modules may format.
 * ========================================================================== */

describe("only the i18n formatters call Intl", () => {
    it("makes no toLocale* call anywhere else", () => {
        const offenders = sourceFiles().filter(
            (rel) => !LOCALE_AWARE_MODULES.includes(rel) && callsToLocaleMethod(code(rel)),
        )
        expect(
            offenders,
            `These files format a value themselves: ${offenders.join(", ")}. Use ` +
                `formatNumber / formatDateNumeric / formatDateTimeNumeric / formatDateMedium ` +
                `from src/i18n/format.ts and pass them the lang from useTranslation().`,
        ).toEqual([])
    })

    it("constructs no Intl formatter anywhere else", () => {
        const offenders = sourceFiles().filter(
            (rel) => !LOCALE_AWARE_MODULES.includes(rel) && usesIntl(code(rel)),
        )
        expect(
            offenders,
            `These files construct an Intl formatter: ${offenders.join(", ")}. ` +
                `src/i18n/format.ts is the only place that may.`,
        ).toEqual([])
    })

    it("never pins a language at a call site", () => {
        // `formatNumber(n, "de")` is the same user-visible bug as `"de-DE"`, and
        // every other predicate in this file misses it: there is no region
        // subtag to match on.
        const offenders = sourceFiles().filter((rel) => pinsALanguageAtCallSite(code(rel)))
        expect(
            offenders,
            `These files hand a formatter a hardcoded language instead of the lang from ` +
                `useTranslation(): ${offenders.join(", ")}. The output stops following the ` +
                `language switch just as surely as a hardcoded "de-DE" would.`,
        ).toEqual([])
    })

    it("never passes undefined as the locale", () => {
        // Its own guard because it looks harmless. `toLocaleDateString(undefined, ...)`
        // follows the BROWSER, which is the one signal that ignores the language the
        // user explicitly picked and persisted. This was the TeamDraftLibraryPanel bug.
        const offenders = sourceFiles().filter((rel) => passesUndefinedLocale(code(rel)))
        expect(
            offenders,
            `These files pass undefined as the locale: ${offenders.join(", ")}. That follows ` +
                `the browser, not the app language switch, so a German user on an English ` +
                `machine reads English dates inside German copy.`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 3. Anti-vacuity: the permitted modules really do the work.
 *
 * Without this, "nobody formats anything anywhere" satisfies every guard above.
 * ========================================================================== */

describe("the permitted modules actually format", () => {
    it("src/i18n/format.ts formats numbers and dates through localeForLang", () => {
        const source = code(FORMAT_MODULE)
        expect(callsToLocaleMethod(source), "format.ts formats no number").toBe(true)
        expect(usesIntl(source), "format.ts builds no Intl date formatter").toBe(true)
        expect(resolvesThroughLocaleForLang(source), "format.ts never calls localeForLang").toBe(true)
        expect(namesALocale(source), "format.ts hardcodes a locale of its own").toBe(false)

        // One localeForLang call per locale-bearing call, so none was left behind
        // with a literal or an undefined.
        const localeBearing = source.match(/\.toLocale(String|DateString|TimeString)\s*\(|\bIntl\s*\.\s*\w+\s*\(/g) ?? []
        const resolved = source.match(/localeForLang\s*\(/g) ?? []
        expect(
            resolved.length,
            `format.ts makes ${localeBearing.length} locale-bearing calls but only ` +
                `${resolved.length} localeForLang() calls. Every one must resolve the language.`,
        ).toBeGreaterThanOrEqual(localeBearing.length)
    })

    it("playerResultsFormat.ts keeps its one date call, and resolves it", () => {
        const source = code(PLAYER_RESULTS_FORMAT_MODULE)
        expect(
            callsToLocaleMethod(source),
            "the carve-out formats nothing - if formatMatchDate moved, delete this exemption",
        ).toBe(true)
        expect(resolvesThroughLocaleForLang(source), "it names a locale without resolving it").toBe(true)
        expect(namesALocale(source), "the carve-out hardcodes a locale").toBe(false)
    })
})

/* ==========================================================================
 * 4. localeCompare is ALLOWED, and pinned so it cannot drift into display.
 * ========================================================================== */

/**
 * Sorting is not display, and this project has deliberately gone the OTHER way
 * where it mattered: src/scout/analysis.ts and scoutUiHelpers.ts avoid
 * `localeCompare` outright, because a sort order that depends on the host's ICU
 * build means two people looking at the same data see different lists.
 *
 * So these calls are exempt from the rules above — but they are pinned, because
 * the failure mode worth catching is somebody quietly turning one into a
 * display concern, or routing it through the language switch and making a table
 * re-sort itself when the user flips DE/EN.
 *
 * Comment-only mentions are NOT in this list: ScoutAnalysisPanel.tsx,
 * scoutUiHelpers.ts, scout/analysis.ts and i18n/format.ts all discuss
 * `localeCompare` in prose while deliberately not calling it.
 */
const LOCALE_COMPARE_CALL_SITES = [
    "analysis/draftHelper.ts",
    "components/ChampionStatsTable.tsx",
    "components/DataSourceInfo.tsx",
    "components/Filters.tsx",
    "components/player-results/ChampionResultsTable.tsx",
    "components/player-results/PlayerResultsPage.tsx",
    "draft/patchWindow.ts",
    "draft/similarDrafts.ts",
    "teams/playerResultsAnalytics.ts",
]

describe("localeCompare stays a sort comparator", () => {
    it("is called in exactly the known files", () => {
        const actual = sourceFiles()
            .filter((rel) => /\.localeCompare\s*\(/.test(code(rel)))
            .sort()
        expect(
            actual,
            `The set of localeCompare call sites changed. These are SORT comparators and are ` +
                `deliberately exempt from the locale rules. If you added one, add it here with ` +
                `a reason. If you removed one, drop it here too - do not widen the guard.`,
        ).toEqual([...LOCALE_COMPARE_CALL_SITES].sort())
    })

    it("is never handed a locale", () => {
        // `localeCompare(other)` is fine. `localeCompare(other, "de-DE")` would make the
        // sort follow the language switch, which is the thing this project avoids.
        for (const rel of LOCALE_COMPARE_CALL_SITES) {
            expect(
                /\.localeCompare\s*\([^)]*,/.test(code(rel)),
                `${rel} passes a second argument to localeCompare. That makes the sort order ` +
                    `depend on the locale, so a list would re-sort when the user switches ` +
                    `language. Sorting must not follow the language switch.`,
            ).toBe(false)
        }
    })
})

/* ==========================================================================
 * 5. The four rewired components take the language.
 * ========================================================================== */

const REWIRED_COMPONENTS = [
    "components/DataSourceInfo.tsx",
    "components/DraftHelper.tsx",
    "components/draft/PatchWeightPanel.tsx",
    "components/draft/TeamDraftLibraryPanel.tsx",
]

describe("the rewired components take lang from the context", () => {
    for (const rel of REWIRED_COMPONENTS) {
        it(`${rel} imports the shared formatters`, () => {
            expect(
                /from\s+["'][^"']*i18n\/format["']/.test(code(rel)),
                `${rel} no longer imports src/i18n/format.ts. If it stopped formatting, remove ` +
                    `it from REWIRED_COMPONENTS with a note; otherwise it is formatting some ` +
                    `other way.`,
            ).toBe(true)
        })

        it(`${rel} destructures lang from useTranslation`, () => {
            expect(
                /const\s*\{[^}]*\blang\b[^}]*\}\s*=\s*useTranslation\s*\(\s*\)/.test(code(rel)),
                `${rel} does not take lang from useTranslation(). Without it the formatters ` +
                    `cannot follow the language switch.`,
            ).toBe(true)
        })
    }
})

/* ==========================================================================
 * 6. Anti-vacuity: every predicate above, proven able to go red.
 *
 * Synthetic sources through the EXACT predicates the real assertions use, plus
 * inverse fixtures proving they do NOT fire on legitimate code.
 * ========================================================================== */

describe("the guards can go red", () => {
    it("catches a reintroduced hardcoded locale", () => {
        expect(namesALocale(`n.toLocaleString("de-DE")`)).toBe(true)
        expect(namesALocale(`new Intl.NumberFormat('en-US')`)).toBe(true)
        expect(namesALocale("const x = `en-GB`")).toBe(true)
    })

    it("catches a bare or undefined-locale format call", () => {
        expect(callsToLocaleMethod("n.toLocaleString()")).toBe(true)
        expect(callsToLocaleMethod("d.toLocaleDateString(undefined, opts)")).toBe(true)
        expect(passesUndefinedLocale("d.toLocaleDateString(undefined, opts)")).toBe(true)
        expect(passesUndefinedLocale("Intl.DateTimeFormat(undefined, opts)")).toBe(true)
    })

    it("catches a language pinned at a call site", () => {
        expect(pinsALanguageAtCallSite('formatNumber(rawMatches, "de")')).toBe(true)
        expect(pinsALanguageAtCallSite("formatDateMedium(new Date(iso), 'en')")).toBe(true)
        expect(pinsALanguageAtCallSite('formatWholeNumber(v, "de-DE")')).toBe(true)
        // ...and does NOT fire on the sanctioned shape, nor on an unrelated call
        // that merely happens to take a string.
        expect(pinsALanguageAtCallSite("formatNumber(rawMatches, lang)")).toBe(false)
        expect(pinsALanguageAtCallSite("formatDateMedium(new Date(iso), lang)")).toBe(false)
        expect(pinsALanguageAtCallSite('t("dh_games")')).toBe(false)
        // A nested call in the first argument must not defeat the match...
        expect(pinsALanguageAtCallSite("formatWholeNumber(Math.round(v), 'de')")).toBe(true)
        // ...and a correct call followed by an unrelated string on the same line
        // must not be dragged into one. This exact shape is live in DraftHelper.
        expect(
            pinsALanguageAtCallSite('formatNumber(recentPatchData.rawSample, lang)} {t("dh_games")}'),
        ).toBe(false)
    })

    it("catches an Intl formatter built outside the i18n modules", () => {
        expect(usesIntl("new Intl.DateTimeFormat(loc, opts)")).toBe(true)
        expect(usesIntl("Intl.NumberFormat(loc).format(n)")).toBe(true)
    })

    it("catches a module that stopped formatting", () => {
        const inert = "export function formatNumber(v, lang) { return String(v) }"
        expect(callsToLocaleMethod(inert)).toBe(false)
        expect(usesIntl(inert)).toBe(false)
    })

    it("does NOT fire on legitimate code", () => {
        // The sanctioned call shape.
        expect(namesALocale("n.toLocaleString(localeForLang(lang))")).toBe(false)
        expect(passesUndefinedLocale("n.toLocaleString(localeForLang(lang))")).toBe(false)
        // A sort comparator is neither a locale nor an Intl call.
        expect(callsToLocaleMethod("a.localeCompare(b)")).toBe(false)
        expect(usesIntl("a.localeCompare(b)")).toBe(false)
        expect(namesALocale("a.localeCompare(b)")).toBe(false)
    })

    it("does NOT fire on prose that quotes the banned patterns", () => {
        // This is the whole reason stripComments() exists. The real module headers
        // spell these out to stop the next person reintroducing them.
        const documented = [
            '/** A `toLocaleDateString("de-DE", …)` in a .tsx file is invisible to the suite. */',
            "// Before this, `Intl.NumberFormat('en-US')` was hardcoded here.",
            "/* We used to pass undefined: d.toLocaleDateString(undefined, opts) */",
        ].join("\n")
        const stripped = stripComments(documented)
        expect(namesALocale(stripped)).toBe(false)
        expect(callsToLocaleMethod(stripped)).toBe(false)
        expect(usesIntl(stripped)).toBe(false)
        expect(passesUndefinedLocale(stripped)).toBe(false)

        // ...and the same text WITHOUT stripping would have failed, which is what
        // makes the stripping load-bearing rather than decorative.
        expect(namesALocale(documented)).toBe(true)
        expect(callsToLocaleMethod(documented)).toBe(true)
    })
})
