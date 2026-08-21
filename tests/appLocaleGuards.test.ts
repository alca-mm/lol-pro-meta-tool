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

/**
 * The one HOP a rewired component is allowed to reach the formatter through.
 *
 * This is NOT a fourth locale-aware module. It formats nothing itself: it holds
 * the Draft tab's assembled sentences, takes `lang` as an argument and hands it
 * to `formatNumber` from src/i18n/format.ts. Section 5 pins it by name and then
 * reads it, so "reaches the formatter" stays a checked fact rather than an
 * assumption. Section 2's whole-tree scans cover it like any other file.
 */
const DRAFT_UI_HELPERS_MODULE = "components/draft/draftUiHelpers.ts"

/**
 * The same two modules as they appear in an import SPECIFIER, which is not the
 * same string as the path: the extension is dropped and the relative prefix
 * varies by depth. DraftHelper.tsx writes `"./draft/draftUiHelpers"` and
 * PatchWeightPanel.tsx, one directory deeper, writes `"./draftUiHelpers"`.
 * {@link importsFrom} anchors the tail at the END of the specifier, so
 * `"./draftUiHelpersExtra"` does not satisfy a check for `"draftUiHelpers"`.
 */
const FORMAT_SPECIFIER = "i18n/format"
const DRAFT_UI_HELPERS_SPECIFIER = "draftUiHelpers"

/** Does this source import from a module specifier ending in `specifierTail`? */
function importsFrom(source: string, specifierTail: string): boolean {
    return new RegExp(String.raw`from\s+["'][^"']*\b${specifierTail}["']`).test(source)
}

/* ==========================================================================
 * The predicates. Defined once so the synthetic fixtures at the bottom can run
 * the EXACT code the real assertions run.
 * ========================================================================== */

/**
 * A BCP-47 tag in a string literal: `"de-DE"`, `'en-US'`, `` `en-GB` ``.
 *
 * THE TAG IS NOT ANCHORED TO THE END OF THE LITERAL, and that is the fix for a
 * hole an audit found by mutation. The first version was
 * `/["'`][a-z]{2}-[A-Z]{2}["'`]/` — it demanded that the tag be the WHOLE
 * literal, so three real ways of naming a locale walked straight past it:
 *
 *   "de-DE-u-ca-gregory"   a tag with a Unicode extension - still a locale
 *   `${base}-DE`           a tag assembled in a template literal
 *   "de_DE"                the POSIX spelling; Intl rejects it, so it renders
 *                          in the HOST locale, which is the TeamDraftLibrary
 *                          bug wearing a different hat
 *
 * So: `\b` instead of a closing quote, `[-_]` instead of `-`, and a second
 * alternative for the interpolated form. Verified against every file under
 * `src/` before landing: the widened pattern still matches i18n/locale.ts and
 * NOTHING else, exactly as the narrow one did.
 *
 * WHAT IS DELIBERATELY LEFT OUT: a lowercase region (`"de-de"`), which `Intl`
 * does accept. `["'`][a-z]{2}[-_][a-z]{2}\b` also matches ordinary kebab-case
 * fragments a component might legitimately hold, and there is no such string
 * in `src/` today to justify the risk. If one ever appears, it is a one-token
 * widening plus a fresh false-positive sweep.
 *
 * The interpolated alternative carries a small residual risk of its own: a
 * template ending in `${x}-AB` for some non-locale two-letter code would be
 * flagged. There is none today; if one lands, name it in this comment rather
 * than deleting the alternative.
 */
const namesALocale = (source: string): boolean =>
    /["'`][a-z]{2}[-_][A-Z]{2}\b/.test(source) || /\$\{[^}]*\}[-_][A-Z]{2}\b/.test(source)

/** A `toLocale*` method call, however it is parameterised. */
const callsToLocaleMethod = (source: string): boolean =>
    /\.toLocale(String|DateString|TimeString)\s*\(/.test(source)

/**
 * `Intl` used at all - not merely `Intl.` used as a member access.
 *
 * THE DOT WAS A HOLE. `/\bIntl\s*\./` misses `const { NumberFormat } = Intl`
 * followed by `new NumberFormat(localeForLang(lang))`. That mutant renders the
 * CORRECT string, so no output test would catch it either, and it silently
 * repeals the "only src/i18n/format.ts formats" rule the moment the next
 * person copies the pattern into a component where the locale is not resolved.
 *
 * Because {@link stripComments} has already run, any surviving `Intl` is code.
 * There is no legitimate reason for a file outside the three locale-aware
 * modules to mention the global at all - not as a call, not as a destructuring
 * source, not as a type namespace. Verified against every file under `src/`:
 * the bare pattern matches i18n/format.ts and nothing else. `\b` on the right
 * keeps `IntlShim` and `IntlHelpers` out.
 *
 * Note what this does NOT fix: {@link passesUndefinedLocale} still looks for
 * `Intl.Something(undefined)`, so a destructured `NumberFormat(undefined)`
 * escapes THAT predicate. It does not escape this one, and this one flags the
 * whole file, which is the outcome that matters. Widening the undefined guard
 * to any `identifier(undefined)` would fire on half the codebase.
 */
const usesIntl = (source: string): boolean => /\bIntl\b/.test(source)

/** The specific bug that looks harmless: a locale of `undefined`. */
const passesUndefinedLocale = (source: string): boolean =>
    /\.toLocale(String|DateString|TimeString)\s*\(\s*undefined\b/.test(source) ||
    /\bIntl\s*\.\s*\w+\s*\(\s*undefined\b/.test(source)

/** Every locale-bearing call resolves through `localeForLang(...)`. */
const resolvesThroughLocaleForLang = (source: string): boolean =>
    /localeForLang\s*\(/.test(source)

/**
 * `localeCompare` handed a second argument, i.e. an explicit locale.
 *
 * ONE LEVEL OF NESTING IS ALLOWED IN THE FIRST ARGUMENT, and that is the fix
 * for the second hole the audit found. `/\.localeCompare\s*\([^)]*,/` cannot
 * cross a `)`, so the entirely realistic
 *
 *   a.localeCompare(b.toLowerCase(), "de-DE")
 *
 * did not match: the guard stayed green while the sort order started following
 * the language switch, which is precisely what it exists to prevent. Same
 * two-level shape as {@link LANGUAGE_PINNED_AT_CALL_SITE} - the idiom is
 * borrowed from there on purpose rather than invented twice.
 *
 * The bare `)` remains a hard wall: `a.localeCompare(b)` cannot be dragged into
 * a comma that happens to sit further along the line, because `[^()]` refuses
 * the closing paren and the nested alternative needs an opening one. Verified
 * against all nine call sites in {@link LOCALE_COMPARE_CALL_SITES}: zero
 * matches, same as before the widening.
 */
const handsALocaleToLocaleCompare = (source: string): boolean =>
    /\.localeCompare\s*\((?:[^()]|\([^()]*\))*,/.test(source)

/**
 * Every locale-bearing call in a source, capturing its FIRST argument.
 *
 * The capture tolerates one level of parentheses so that `localeForLang(lang)`
 * arrives whole rather than truncated at its own closing paren, and stops at
 * the `,` or `)` that ends the argument. An argument-less call captures `""`,
 * which is the browser-locale bug and must be reported, not skipped.
 */
const LOCALE_BEARING_CALL_ARGUMENTS =
    /(?:\.toLocale(?:String|DateString|TimeString)|\bIntl\s*\.\s*\w+)\s*\(\s*((?:[^(),]|\([^()]*\))*)/g

/** Does this first argument RESOLVE the language rather than pin or drop it? */
function resolvesLocaleArgument(argument: string, source: string): boolean {
    const trimmed = argument.trim()
    if (/^localeForLang\s*\(/.test(trimmed)) return true
    // A locale hoisted into a local, e.g. `const locale = localeForLang(lang)`
    // shared by two Intl constructions in one formatter. That is BETTER code
    // than calling twice, so it has to be an accepted shape - see the comment
    // on the assertion that uses this.
    if (!/^[A-Za-z_$][\w$]*$/.test(trimmed)) return false
    return new RegExp(
        String.raw`\b(?:const|let|var)\s+${trimmed}\b[^=\n]*=\s*localeForLang\s*\(`,
    ).test(source)
}

/** The first arguments of every locale-bearing call that does NOT resolve. */
function unresolvedLocaleArguments(source: string): string[] {
    return [...source.matchAll(LOCALE_BEARING_CALL_ARGUMENTS)]
        .map((match) => (match[1] ?? "").trim())
        .filter((argument) => !resolvesLocaleArgument(argument, source))
        .map((argument) => (argument === "" ? "(no locale argument)" : argument))
}

/**
 * A formatter called with a STRING where the language argument belongs.
 *
 * THE BLIND SPOT THIS CLOSES: every predicate above hunts for a full BCP-47
 * tag, so `formatNumber(n, "de-DE")` is caught - but `formatNumber(n, "de")`
 * is not, and it produces the identical user-visible bug. Two of the four
 * rewired components are only INCIDENTALLY protected today: PatchWeightPanel.tsx
 * and TeamDraftLibraryPanel.tsx use `lang` exactly once, so a literal would
 * leave it unused and `noUnusedLocals` would complain. DataSourceInfo.tsx and
 * DraftHelper.tsx pass it at several call sites each and would sail straight
 * through. WHICH two are which is not stable - it moved once already, in 0.6.1,
 * when five counted-noun call sites were rewritten - so do not lean on the
 * pairing. The point survives every such move: incidental protection is not
 * protection, and it can evaporate on an edit that had nothing to do with it.
 *
 * Matches a formatter name, its argument list, a comma, then an opening quote -
 * the only shape that can pin a language at a call site.
 *
 * The argument-list pattern earns its ugliness twice over. `[^)]*` was the
 * obvious first try and it FAILS on the real call `formatDateMedium(new
 * Date(iso), lang)`, because it cannot cross the nested `)`. Allowing one level
 * of nesting fixes that. And quotes are excluded from the consumed set on
 * purpose: without that, a correct call followed on the same line by a
 * translated string - `formatDraftGamesCount(t, n, lang)} {t("dh_rawSample")}`,
 * the shape DraftHelper renders twice on one line today - would match by
 * running past the closing paren into the NEXT call's string, and the guard
 * would false-red on correct code. (Quotes ARE allowed inside a nested call,
 * which is what lets the genuinely wrong `formatNumber(t("x"), "de")` be
 * caught.)
 *
 * EARLIER ROUND, from an audit that mutated the predicate:
 *
 *  1. `formatPatchWindowSummary` joins the union. It is the seventh formatter
 *     that takes a `Lang` (src/components/draft/draftUiHelpers.ts), and until
 *     it was listed here `formatPatchWindowSummary(data, t, "de")` was simply
 *     not a thing the guard looked at. Every new `Lang`-taking formatter has to
 *     be added; there is no way to discover them from a text scan.
 *  2. The nesting allowance goes from one level to two, so
 *     `formatNumber(Math.round(Number(raw)), "de")` no longer walks past. Timed
 *     over 20 passes across all 119 source files before and after: no
 *     measurable difference, and the adversarial inputs that usually break
 *     nested quantifiers return in under a millisecond, because the bare `)`
 *     ends the loop instead of feeding it.
 *
 * THIS ROUND (0.6.1), the eighth and ninth names, and the reason the union is
 * now an ARRAY rather than a hand-typed alternation:
 *
 *  3. `formatDraftGamesCount(t, count, lang)` takes a `Lang` and carries four
 *     call sites: two in DraftHelper.tsx, one in PatchWeightPanel.tsx and one
 *     in draftUiHelpers.ts itself. It joins for exactly the reason (1) did.
 *  4. `formatDraftPicksCount(t, count)` took NO `Lang` at all, and it joined
 *     anyway. Three reasons, in order of weight. It could not false-positive:
 *     both of its parameters were typed (`DraftTranslate`, `number`), so a
 *     string literal in either position was already a compile error, which
 *     meant a match here could only ever mean the SIGNATURE changed under the
 *     guard. Its own doc called the missing thousands separator a follow-up, so
 *     the `lang` it lacked was scheduled rather than absent - and the failure
 *     mode recorded in (1) is precisely somebody adding a `Lang` and not
 *     coming back here. And a union that means "display formatters whose call
 *     sites must not pin a language" needs no revision when one of them starts
 *     taking a language, whereas "formatters that take a `Lang`" does.
 *     The counter-argument, that listing a language-less formatter blurs what
 *     the union means, was answered by writing the broader meaning down here
 *     rather than by leaving a known gap open.
 *
 * THE PREDICTION IN (4) CAME TRUE, IN 0.6.2. Somebody added the `Lang`.
 * `formatDraftPicksCount(t: DraftTranslate, count: number, lang: Lang)` now
 * groups its number like every other count in the app
 * (src/components/draft/draftUiHelpers.ts), and its single call site reads
 * `formatDraftPicksCount(t, entry.games, lang)` (src/components/DraftHelper.tsx).
 *
 * The union needed no edit, which was the entire point of listing it early - so
 * the hedge is recorded as having paid, not quietly deleted. What HAS changed is
 * the reason the entry belongs, and re-deriving it matters more than the
 * anecdote: it is now here on exactly the same footing as the other eight, the
 * ordinary one. It takes a `Lang`, that `Lang` is the last argument, and a
 * literal in that position compiles - so `formatDraftPicksCount(t, n, "de")` is
 * a real bug this predicate is the only thing standing between and a shipped
 * build. Nothing in the union is a special case any more, and the fixtures below
 * pin the pinned-language shape at three arguments rather than two.
 *
 * The argument in (4) is still the one to reuse the next time a display
 * formatter is added before it takes a `Lang`. This is the evidence it holds.
 *
 * The two extra alternatives were swept and timed like the earlier round: over
 * all 119 source files the nine-name pattern matches NOTHING, exactly as the
 * seven-name one did, and 20 passes cost 121 ms against 110 ms - a difference
 * inside the noise of reading the files in the first place.
 *
 * WHAT IS DELIBERATELY STILL OPEN, so nobody mistakes silence for coverage: a
 * language pinned in a VARIABLE - `const lang: Lang = "de"` - and then passed
 * correctly-looking as `formatNumber(n, lang)`. No predicate in this file sees
 * it, and closing it with a text scan costs more than it returns. The two ways
 * to try both fail:
 *
 *   - Enumerate variable names (`/\bconst\s+\w*[Ll]ang\w*\s*=\s*["'`]de/`).
 *     A rename to `activeLanguage` defeats it in one keystroke, and TypeScript
 *     infers `Lang` from context at most real call sites, so the annotation
 *     this shape keys on is usually absent anyway. That is a guard that reads
 *     as coverage while proving nothing.
 *   - Flag every `"de"` / `"en"` literal in `src/`. That fires on
 *     i18n/types.ts (the union that DEFINES `Lang`), i18n/LanguageContext.tsx
 *     (the persisted default and the localStorage read) and App.tsx
 *     (`setLang("de")` on the language buttons) - the three files that
 *     legitimately own those literals. Exempting them means an allowlist that
 *     excuses exactly the files most able to break the rule, which is the same
 *     trade this file's header already rejects for comment stripping.
 *
 * The real protection there is elsewhere and is stronger: a component that
 * formats must destructure `lang` from `useTranslation()` AND hand that `lang`
 * to a known formatter (section 5), and a hand-pinned `lang` next to a
 * `useTranslation()` that also yields one is a shadowed-variable smell a
 * reviewer sees. Left open, on purpose, in writing.
 */
const FORMATTER_NAMES = [
    "formatNumber",
    "formatDateNumeric",
    "formatDateTimeNumeric",
    "formatDateMedium",
    "formatWholeNumber",
    "formatMatchDate",
    "formatPatchWindowSummary",
    "formatDraftGamesCount",
    "formatDraftPicksCount",
] as const

/** The three JS quote characters, spelled once so the two patterns cannot drift. */
const QUOTES = "\"'`"

/**
 * A formatter's argument list, tolerating two levels of nesting and consuming
 * no quote at the top level. See the doc above for why both properties matter.
 */
const FORMATTER_ARGUMENT_LIST = `\\((?:[^()${QUOTES}]|\\((?:[^()${QUOTES}]|\\([^()]*\\))*\\))*`

/**
 * A call to one of {@link FORMATTER_NAMES} whose LAST argument starts with
 * `tail`.
 *
 * Built rather than written out twice. Section 5 needs the same nine names and
 * the same argument-list shape to ask the opposite question ("was it handed
 * `lang`?"), and two hand-maintained copies of a pattern this fiddly would
 * drift the first time a formatter is added — which is the exact failure the
 * doc above already records for the seventh name.
 */
const formatterCallEndingIn = (tail: string): RegExp =>
    new RegExp(`\\b(?:${FORMATTER_NAMES.join("|")})\\s*${FORMATTER_ARGUMENT_LIST},\\s*${tail}`)

const LANGUAGE_PINNED_AT_CALL_SITE = formatterCallEndingIn(`[${QUOTES}]`)

const pinsALanguageAtCallSite = (source: string): boolean =>
    LANGUAGE_PINNED_AT_CALL_SITE.test(source)

/**
 * The inverse: a formatter handed the `lang` the component took from context.
 *
 * Used ONLY against the four files in {@link REWIRED_COMPONENTS}, never as a
 * tree-wide sweep, so it carries no false-positive budget of its own. It is
 * what stops section 5 from passing on a component that imports a formatter and
 * never calls it, or that destructures `lang` and lets it rot.
 *
 * `lang\b` is literal on purpose. A component that renamed the binding to
 * `activeLanguage` would turn this red, and that is the intended answer: the
 * rule this file enforces is "take `lang` from useTranslation() and pass it
 * on", and a guard that accepted any identifier would accept
 * `formatNumber(n, someLocaleFromProps)` too.
 *
 * IT MATCHES A DECLARATION TOO, not only a call: `export function
 * formatNumber(value: number, lang: Lang)` in src/i18n/format.ts satisfies it.
 * That is why it is scoped to the four components and never swept over the
 * tree. None of the four declares a function under any of
 * {@link FORMATTER_NAMES} - their own local wrappers are `formatDate`,
 * `formatDateTime` and `formatUpdatedAt` - so a match in those files can only
 * come from a call. Swept over all of `src/` it would also hit
 * src/i18n/format.ts, playerResultsFormat.ts, MatchTable.tsx and
 * RecentFormCards.tsx, which is why the sweep is not the shape of this check.
 */
const LANG_HANDED_TO_A_FORMATTER = formatterCallEndingIn("lang\\b")

const handsLangToAFormatter = (source: string): boolean =>
    LANG_HANDED_TO_A_FORMATTER.test(source)

/**
 * EVERY call to a known formatter, not merely one, and whether each hands `lang`.
 *
 * WHY THIS EXISTS, and it is a hole 0.6.2 made visible rather than a tidy-up:
 * {@link handsLangToAFormatter} is a single `.test()`, so it goes green on the
 * FIRST call it likes and never looks at the rest. DraftHelper.tsx makes four
 * formatter calls. Three of them - two `formatDraftGamesCount` and one
 * `formatPatchWindowSummary` - already ended in `lang` before 0.6.2, so the
 * fourth could have been left unrewired, or could be de-rewired tomorrow, and
 * section 5 would not have moved. The claim "this component hands the language
 * on" was true about the FILE while being false about a call site in it.
 *
 * So: tally the calls by name, tally the ones ending in `lang`, and report any
 * name where the first number exceeds the second. Built from the same
 * {@link FORMATTER_NAMES} and the same {@link FORMATTER_ARGUMENT_LIST} as every
 * other pattern here, for the reason {@link formatterCallEndingIn} already
 * records: a second hand-maintained copy drifts the first time a formatter is
 * added.
 *
 * SCOPED TO {@link REWIRED_COMPONENTS}, never swept tree-wide, and the reason is
 * the one on LANG_HANDED_TO_A_FORMATTER: `\w+\s*\(` matches a DECLARATION too,
 * so src/i18n/format.ts would be counting its own `export function
 * formatNumber(value: number, lang: Lang)` lines. Those happen to balance today
 * - measured, every file under `src/` has call count == lang count - but a
 * formatter whose `Lang` is not its last parameter would false-red instantly,
 * and that is a shape this project has no rule against.
 *
 * WHAT IT STILL CANNOT SEE: a `lang` that is not the LAST argument, and a call
 * whose language comes from a differently named binding. Both are deliberate and
 * both are inherited from LANG_HANDED_TO_A_FORMATTER; see its doc.
 */
const ANY_FORMATTER_CALL = new RegExp(`\\b(${FORMATTER_NAMES.join("|")})\\s*\\(`, "g")

const FORMATTER_CALL_HANDED_LANG = new RegExp(
    `\\b(${FORMATTER_NAMES.join("|")})\\s*${FORMATTER_ARGUMENT_LIST},\\s*lang\\b`,
    "g",
)

/** How many times each formatter name matches `pattern` in `source`. */
function tallyByName(source: string, pattern: RegExp): Map<string, number> {
    const counts = new Map<string, number>()
    for (const match of source.matchAll(pattern)) {
        const name = match[1] ?? ""
        counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return counts
}

/** Formatter names called more often than they are handed `lang`, described. */
function formatterCallsMissingLang(source: string): string[] {
    const called = tallyByName(source, ANY_FORMATTER_CALL)
    const handed = tallyByName(source, FORMATTER_CALL_HANDED_LANG)
    return [...called]
        .filter(([name, calls]) => calls > (handed.get(name) ?? 0))
        .map(([name, calls]) => `${name}: ${calls} call(s), ${handed.get(name) ?? 0} ending in lang`)
}

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
            // The hop two of those four now reach the formatter through. If the
            // scan cannot see it, section 5's one-hop check reads a file that
            // is not there and the whole-tree scans skip it silently.
            DRAFT_UI_HELPERS_MODULE,
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

        // EVERY locale-bearing call resolves its language - checked per call
        // site, not by counting.
        //
        // This used to assert `localeForLang(...) count >= locale-bearing call
        // count`, which is 4:4 today and passes. But that is not the rule; it
        // is a proxy for the rule that happens to hold at the current call
        // count. A formatter that did
        //
        //     const locale = localeForLang(lang)
        //     return new Intl.DateTimeFormat(locale, dateOpts).format(d) + " " +
        //         new Intl.DateTimeFormat(locale, timeOpts).format(d)
        //
        // is BETTER code - one resolution, two uses - and would have turned
        // this guard red with the message "only 5 localeForLang() calls", which
        // tells the author to make the code worse. A comment warning the next
        // author off writing it would have been the wrong repair: the guard, not
        // the code, was the thing stating something it did not mean.
        //
        // So it now says what it means. Each locale-bearing call's first
        // argument must be `localeForLang(...)` itself, or a local assigned from
        // one. A literal, an `undefined` or a missing argument is named in the
        // failure. The hoisted-local shape above passes; `"de-DE"` does not.
        const callArguments = [...source.matchAll(LOCALE_BEARING_CALL_ARGUMENTS)]
        expect(
            callArguments.length,
            "format.ts makes no locale-bearing call at all - it has stopped formatting",
        ).toBeGreaterThan(0)
        expect(
            unresolvedLocaleArguments(source),
            `format.ts hands a locale-bearing call something other than localeForLang(). ` +
                `Every toLocale*/Intl call in it must resolve the language, either inline or ` +
                `through a local assigned from localeForLang().`,
        ).toEqual([])
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
                handsALocaleToLocaleCompare(code(rel)),
                `${rel} passes a second argument to localeCompare. That makes the sort order ` +
                    `depend on the locale, so a list would re-sort when the user switches ` +
                    `language. Sorting must not follow the language switch.`,
            ).toBe(false)
        }
    })
})

/* ==========================================================================
 * 5. The four rewired components take the language and hand it on.
 *
 * WHAT THIS SECTION IS FOR, restated because 0.6.1 moved its shape: these four
 * components do not format on their own. They take `lang` from the context and
 * give it to a shared formatter. That is still exactly the rule; what changed
 * is that two of them now reach the formatter one module deeper.
 *
 * WHAT 0.6.1 DID. Five counted-noun call sites moved into
 * `formatDraftGamesCount` / `formatDraftPicksCount` in
 * src/components/draft/draftUiHelpers.ts, so DraftHelper.tsx and
 * PatchWeightPanel.tsx stopped importing src/i18n/format.ts and now reach it
 * through that helper. Both still destructure `lang` and both still pass it
 * down. This is the same move playerResultsFormat.ts made in 0.5.5 when
 * `formatWholeNumber` began delegating to `formatNumber`: the rule held, the
 * shape moved. A guard that asserts on an import line has to be told that.
 *
 * WHY NOT SIMPLY DELETE THE TWO ENTRIES. The failure the section exists to
 * catch is a component that quietly stops routing through the shared layer.
 * Dropping the two files that just changed shape removes the guard from
 * precisely the code that moved - the same trade this file's header rejects
 * for comment stripping, arrived at from the other direction.
 *
 * WHY NOT A GENERIC ONE-HOP TRANSITIVE CHECK. "The import may come from
 * i18n/format, or from any module that itself imports i18n/format" would go
 * green here without another thought, and it was the tempting option. It
 * accepts ANY module as the hop, including a formatting helper a future author
 * mints inside a component folder - so it would answer "does a path exist?"
 * when the question is "is this the sanctioned path?". It also needs specifier
 * resolution (`"./draftUiHelpers"` vs `"./draft/draftUiHelpers"`) to find the
 * file to read, which is machinery bought for a weaker answer.
 *
 * WHAT IS DONE INSTEAD, and it is two things, because either alone is soft:
 *
 *  1. The list is SPLIT. {@link REWIRED_DIRECT} imports src/i18n/format.ts
 *     itself; {@link REWIRED_VIA_HELPER} names its hop, and the test reads that
 *     hop and asserts IT imports src/i18n/format.ts. One hop, pinned by name,
 *     actually followed. A component that starts reaching the formatter through
 *     some other module turns this red and has to be moved between the lists on
 *     purpose - which is a review, not a silent pass.
 *  2. Every one of the four must additionally HAND `lang` TO A KNOWN FORMATTER
 *     ({@link handsLangToAFormatter}). This is the anti-vacuity half. Without
 *     it, an import plus a destructure satisfies the section while the value
 *     goes nowhere, and the "reaches a formatter" claim is about a file rather
 *     than about a call.
 *  3. And EVERY formatter call in the file must hand it on, not just one
 *     ({@link formatterCallsMissingLang}). New in 0.6.2, because that release
 *     showed (2) is satisfiable by a file with an unrewired call site in it:
 *     DraftHelper.tsx already passed (2) on its three older calls while
 *     `formatDraftPicksCount(t, entry.games)` sat there taking no language at
 *     all. Dropping the third argument from it today would leave (2) green.
 *
 * WHAT SECTION 5 DOES NOT OWN. (3) is the ARCHITECTURAL form of the rule - no
 * rewired component may drop the language at any formatter call site - and it
 * names no particular call. The exact-call pin for the one 0.6.2 rewired
 * (`formatDraftPicksCount(t, entry.games, lang)` in DraftHelper.tsx, matched
 * against the live JSX) belongs to tests/draftHelperI18n.test.ts, which already
 * owns that component's counted-noun call shapes and pins the sibling
 * `formatDraftGamesCount` the same way. Two files, two granularities, one on
 * purpose: if you are adding a per-call assertion about DraftHelper's keys or
 * arguments, it goes there, not here.
 *
 * WHAT STILL CATCHES WHAT, so this section does not duplicate section 2 and
 * nobody assumes it covers more than it does:
 *
 *   component starts calling toLocaleString / Intl itself
 *       -> section 2, "makes no toLocale* call anywhere else" and "constructs
 *          no Intl formatter anywhere else". Both sweep the WHOLE tree, so they
 *          fire whether or not a file is listed here. Not this section's job.
 *   component hands a formatter a hardcoded language
 *       -> section 2, "never pins a language at a call site", also tree-wide.
 *   component hardcodes a BCP-47 locale
 *       -> section 1, tree-wide.
 *   component stops taking `lang` from useTranslation()
 *       -> here, "destructures lang from useTranslation".
 *   component takes `lang` and never passes it to a formatter
 *       -> here, "hands lang to a shared formatter". New in 0.6.1.
 *   component passes `lang` to SOME formatters and drops it at another
 *       -> here, "hands lang to every formatter it calls". New in 0.6.2.
 *   component stops routing through the shared layer at all
 *       -> here, the import assertions.
 *   the pinned hop itself stops delegating and starts formatting
 *       -> here, the one-hop read; and section 2 tree-wide, since the helper is
 *          an ordinary file with no exemption.
 * ========================================================================== */

/** Imports src/i18n/format.ts itself. */
const REWIRED_DIRECT = ["components/DataSourceInfo.tsx", "components/draft/TeamDraftLibraryPanel.tsx"]

/**
 * Reaches src/i18n/format.ts through ONE named helper, which the test reads.
 *
 * `specifier` is separate from `helper` because the path and the import string
 * are not the same text - see {@link DRAFT_UI_HELPERS_SPECIFIER}.
 */
const REWIRED_VIA_HELPER = [
    {
        rel: "components/DraftHelper.tsx",
        helper: DRAFT_UI_HELPERS_MODULE,
        specifier: DRAFT_UI_HELPERS_SPECIFIER,
    },
    {
        rel: "components/draft/PatchWeightPanel.tsx",
        helper: DRAFT_UI_HELPERS_MODULE,
        specifier: DRAFT_UI_HELPERS_SPECIFIER,
    },
]

/** Still four, however they reach the formatter. */
const REWIRED_COMPONENTS = [...REWIRED_DIRECT, ...REWIRED_VIA_HELPER.map((entry) => entry.rel)]

describe("the rewired components take lang from the context", () => {
    it("still covers four components, split between the two shapes", () => {
        // Anti-vacuity for the split itself: emptying either list would make its
        // loop generate no tests at all, and a describe block with nothing in it
        // is indistinguishable from a passing one.
        expect(REWIRED_DIRECT.length, "REWIRED_DIRECT was emptied").toBeGreaterThan(0)
        expect(REWIRED_VIA_HELPER.length, "REWIRED_VIA_HELPER was emptied").toBeGreaterThan(0)
        expect(
            REWIRED_COMPONENTS.length,
            "a rewired component was dropped rather than moved between the two lists",
        ).toBe(4)
        expect(new Set(REWIRED_COMPONENTS).size, "a component is listed twice").toBe(4)
    })

    for (const rel of REWIRED_DIRECT) {
        it(`${rel} imports the shared formatters directly`, () => {
            expect(
                importsFrom(code(rel), FORMAT_SPECIFIER),
                `${rel} no longer imports src/i18n/format.ts. If its formatting moved behind a ` +
                    `UI helper, move it to REWIRED_VIA_HELPER and name that helper - do not ` +
                    `delete the entry. If it stopped formatting entirely, remove it with a note.`,
            ).toBe(true)
        })
    }

    for (const { rel, helper, specifier } of REWIRED_VIA_HELPER) {
        it(`${rel} reaches the shared formatters through ${helper}`, () => {
            expect(
                importsFrom(code(rel), specifier),
                `${rel} no longer imports ${helper}, and it does not import src/i18n/format.ts ` +
                    `either. Whatever it formats with now is unpinned.`,
            ).toBe(true)

            // The hop, actually followed rather than assumed. This is the whole
            // difference between "an indirection exists" and "the indirection
            // ends at the shared formatter".
            expect(
                importsFrom(code(helper), FORMAT_SPECIFIER),
                `${helper} is pinned as the hop ${rel} formats through, but it no longer ` +
                    `imports src/i18n/format.ts. Either it stopped formatting - in which case ` +
                    `${rel} is formatting some third way - or it now formats on its own.`,
            ).toBe(true)

            // ...and the hop must not become a fourth locale-aware module. If it
            // ever needs an exemption from section 2, that is a design decision
            // to argue for at LOCALE_AWARE_MODULES, not a quiet addition here.
            expect(
                LOCALE_AWARE_MODULES,
                `${helper} was added to LOCALE_AWARE_MODULES. A hop is allowed to DELEGATE ` +
                    `formatting, never to be exempted from section 2 and do it.`,
            ).not.toContain(helper)
        })
    }

    for (const rel of REWIRED_COMPONENTS) {
        it(`${rel} destructures lang from useTranslation`, () => {
            expect(
                /const\s*\{[^}]*\blang\b[^}]*\}\s*=\s*useTranslation\s*\(\s*\)/.test(code(rel)),
                `${rel} does not take lang from useTranslation(). Without it the formatters ` +
                    `cannot follow the language switch.`,
            ).toBe(true)
        })

        it(`${rel} hands lang to a shared formatter`, () => {
            expect(
                handsLangToAFormatter(code(rel)),
                `${rel} imports a formatter and takes lang, but never passes lang to one of ` +
                    `${FORMATTER_NAMES.join(", ")}. An import and a destructure are not ` +
                    `formatting; if the call moved to a new formatter, add its name to ` +
                    `FORMATTER_NAMES.`,
            ).toBe(true)
        })

        it(`${rel} hands lang to EVERY formatter it calls`, () => {
            // Point (3) of this section's header. The check above is one
            // `.test()` and stops at the first call it likes; this one counts.
            // DraftHelper.tsx makes four formatter calls and would pass the
            // other check on any one of them.
            expect(
                formatterCallsMissingLang(code(rel)),
                `${rel} calls a shared formatter without passing it lang. That call stops ` +
                    `following the language switch while the rest of the file keeps working, ` +
                    `so nothing else in this file goes red. If the formatter genuinely takes ` +
                    `no Lang, it does not belong in FORMATTER_NAMES.`,
            ).toEqual([])
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
        expect(pinsALanguageAtCallSite('t("dh_rawSample")')).toBe(false)
        // A nested call in the first argument must not defeat the match...
        expect(pinsALanguageAtCallSite("formatWholeNumber(Math.round(v), 'de')")).toBe(true)
        // ...and a correct call followed by an unrelated string on the same line
        // must not be dragged into one.
        //
        // This is DraftHelper.tsx line 1622 as it stands in 0.6.1, and it is the
        // hardest case in the file for the quote exclusion: TWO correct calls and
        // THREE translated strings, alternating, on one line. Until 0.6.1 this
        // fixture read `formatNumber(x, lang)} {t("dh_games")}` and was labelled
        // a real DraftHelper line; `dh_games` has since been deleted from both
        // catalogues and both call sites became formatDraftGamesCount, so the
        // label was false even though the fixture still exercised the predicate.
        // Replaced with the live line rather than relabelled, because a fixture
        // that tracks real code keeps proving something as the code moves.
        expect(
            pinsALanguageAtCallSite(
                '{t("dh_rawSample")} {formatDraftGamesCount(t, recentPatchData.rawSample, lang)}' +
                    ' · {t("dh_weightedSample")} ' +
                    "{formatDraftGamesCount(t, recentPatchData.weightedSample, lang)}",
            ),
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

    /* ------------------------------------------------------------------
     * The four mutants an audit rode straight through a fully green suite.
     * Each pair is: the mutant the OLD predicate missed, then legitimate code
     * the NEW predicate must still leave alone. Without the second half a
     * widening is not a fix, it is a future false red.
     * ------------------------------------------------------------------ */

    it("catches a locale that is not the whole string literal", () => {
        // A tag with a Unicode extension. Still a hardcoded locale.
        expect(namesALocale(`new Intl.DateTimeFormat("de-DE-u-ca-gregory", opts)`)).toBe(true)
        // The POSIX spelling. Intl REJECTS it, so the output falls back to the
        // host locale - the browser-follows-the-machine bug, arrived at sideways.
        expect(namesALocale(`n.toLocaleString("de_DE")`)).toBe(true)
        // A tag assembled in a template literal.
        expect(namesALocale("const loc = `${base}-DE`")).toBe(true)
        // ...and none of the three matched the old, quote-anchored pattern:
        expect(/["'`][a-z]{2}-[A-Z]{2}["'`]/.test(`"de-DE-u-ca-gregory"`)).toBe(false)

        // Legitimate: kebab-case identifiers, CSS classes and i18n keys are not
        // locales, and neither is a template that merely contains a hyphen.
        expect(namesALocale(`className="scout-details"`)).toBe(false)
        expect(namesALocale(`t("dh_noPatchData")`)).toBe(false)
        expect(namesALocale("const cls = `${champion}-icon`")).toBe(false)
        expect(namesALocale(`const id = "riot-ID"`)).toBe(false)
    })

    it("catches Intl reached through a destructure", () => {
        // The output of this mutant is CORRECT, which is why no rendering test
        // would find it. What it repeals is the architecture rule.
        const destructured = [
            "const { NumberFormat } = Intl",
            "export const fmt = (n, lang) => new NumberFormat(localeForLang(lang)).format(n)",
        ].join("\n")
        expect(usesIntl(destructured)).toBe(true)
        expect(/\bIntl\s*\./.test(destructured), "the old dot-anchored pattern missed it").toBe(
            false,
        )

        // Legitimate: a word that merely starts with those four letters, and
        // ordinary code that has nothing to do with the global.
        expect(usesIntl("IntlShim.format(n)")).toBe(false)
        expect(usesIntl("const internals = collectInternals()")).toBe(false)
        expect(usesIntl("return formatNumber(value, lang)")).toBe(false)
    })

    it("catches a locale handed to localeCompare behind a nested call", () => {
        expect(handsALocaleToLocaleCompare(`a.localeCompare(b.toLowerCase(), "de-DE")`)).toBe(true)
        expect(handsALocaleToLocaleCompare("a.localeCompare(b, undefined, opts)")).toBe(true)
        expect(
            /\.localeCompare\s*\([^)]*,/.test(`a.localeCompare(b.toLowerCase(), "de-DE")`),
            "the old pattern could not cross the nested closing paren",
        ).toBe(false)

        // Legitimate: every real call site in this repo is single-argument, and
        // a comparator's own commas must not be dragged into a match.
        expect(handsALocaleToLocaleCompare("a.localeCompare(b)")).toBe(false)
        expect(handsALocaleToLocaleCompare("a.name.localeCompare(b.name)")).toBe(false)
        expect(handsALocaleToLocaleCompare("names.sort((a, b) => a.localeCompare(b))")).toBe(false)
        expect(handsALocaleToLocaleCompare("[x.localeCompare(y), 1]")).toBe(false)
        // A single argument that is itself a call carrying a comma.
        expect(handsALocaleToLocaleCompare("a.localeCompare(pick(b, role))")).toBe(false)
    })

    it("catches the seventh formatter, and two levels of nesting", () => {
        // formatPatchWindowSummary takes its Lang third; it was invisible until
        // it joined the union.
        expect(pinsALanguageAtCallSite('formatPatchWindowSummary(patchData, t, "de")')).toBe(true)
        // Two levels of nesting in the first argument no longer defeat the match.
        expect(pinsALanguageAtCallSite(`formatNumber(Math.round(Number(raw)), "de")`)).toBe(true)
        // ...and neither mutant matched the six-name, one-level pattern:
        const OLD_PINS =
            /\b(?:formatNumber|formatDateNumeric|formatDateTimeNumeric|formatDateMedium|formatWholeNumber|formatMatchDate)\s*\((?:[^()"'`]|\([^()]*\))*,\s*["'`]/
        expect(OLD_PINS.test('formatPatchWindowSummary(patchData, t, "de")')).toBe(false)
        expect(OLD_PINS.test(`formatNumber(Math.round(Number(raw)), "de")`)).toBe(false)

        // Legitimate: the real DraftHelper line, which passes t AND lang through
        // and sits next to an unrelated translated string on the same line.
        expect(
            pinsALanguageAtCallSite(
                '{t("dh_patchInfo")} {formatPatchWindowSummary(recentPatchData, t, lang)}',
            ),
        ).toBe(false)
        // ...and the real draftUiHelpers line, inside a template literal. Before
        // 0.6.1 this read `${formatNumber(summary.rawMatches, lang)} ${t("dh_games")}`;
        // the noun key is gone and the call is now the counted-noun helper, so
        // the string below is the live one. It still proves what the old one
        // did - a correct call inside `${...}` interpolation, adjacent to other
        // interpolations and a `%` literal, is not a pinned language.
        expect(
            pinsALanguageAtCallSite(
                "`${summary.patch} (${summary.weight}%, ` +" +
                    " `${formatDraftGamesCount(t, summary.rawMatches, lang)})`",
            ),
        ).toBe(false)
        expect(pinsALanguageAtCallSite("formatNumber(Math.round(Number(raw)), lang)")).toBe(false)
    })

    it("catches the eighth and ninth formatters, both of which now take a Lang", () => {
        // formatDraftGamesCount takes a Lang third. Same case as
        // formatPatchWindowSummary above: invisible until it joined the union.
        expect(
            pinsALanguageAtCallSite('formatDraftGamesCount(t, summary.rawMatches, "de")'),
        ).toBe(true)
        // formatDraftPicksCount joined in 0.6.1 while it still took no Lang, on
        // the argument recorded at point (4) on LANGUAGE_PINNED_AT_CALL_SITE.
        // 0.6.2 gave it one, so the shape that pins a language moved from two
        // arguments to three, and it is now an ordinary compilable bug rather
        // than a signature change: `lang: Lang` accepts the literal "de".
        expect(pinsALanguageAtCallSite('formatDraftPicksCount(t, entry.games, "de")')).toBe(true)

        // ...and neither name was in the seven-name union this round replaced:
        const SEVEN_NAME_PINS =
            /\b(?:formatNumber|formatDateNumeric|formatDateTimeNumeric|formatDateMedium|formatWholeNumber|formatMatchDate|formatPatchWindowSummary)\s*\((?:[^()"'`]|\((?:[^()"'`]|\([^()]*\))*\))*,\s*["'`]/
        expect(
            SEVEN_NAME_PINS.test('formatDraftGamesCount(t, summary.rawMatches, "de")'),
        ).toBe(false)
        expect(SEVEN_NAME_PINS.test('formatDraftPicksCount(t, entry.games, "de")')).toBe(false)

        // Legitimate: both live call shapes, which pass t through and take the
        // language from the context.
        expect(
            pinsALanguageAtCallSite("formatDraftGamesCount(t, recentPatchData.rawSample, lang)"),
        ).toBe(false)
        expect(pinsALanguageAtCallSite("formatDraftPicksCount(t, entry.games, lang)")).toBe(false)
        // The picks call is the tail of the recommendation subtitle, after a
        // role label, a translated label and an unrelated formatter. This is
        // DraftHelper.tsx line 1573 verbatim as it stands in 0.6.2; until 0.6.2
        // it ended `formatDraftPicksCount(t, entry.games)` and the fixture said
        // so, which stopped being true the moment the helper took a Lang.
        expect(
            pinsALanguageAtCallSite(
                '{ROLE_LABELS[entry.role]} · {t("dh_recoTableTotal")} {formatScore(entry.totalScore)}' +
                    " · {formatDraftPicksCount(t, entry.games, lang)}",
            ),
        ).toBe(false)
    })

    it("matches an import specifier at its end, not anywhere inside it", () => {
        // The two real spellings of the same hop, from two directory depths.
        expect(
            importsFrom(`import { formatDraftGamesCount } from "./draftUiHelpers"`, DRAFT_UI_HELPERS_SPECIFIER),
        ).toBe(true)
        expect(
            importsFrom(
                `import { formatPatchWindowSummary } from "./draft/draftUiHelpers"`,
                DRAFT_UI_HELPERS_SPECIFIER,
            ),
        ).toBe(true)
        expect(importsFrom(`import { formatNumber } from "../../i18n/format"`, FORMAT_SPECIFIER)).toBe(
            true,
        )

        // A component that stopped importing it. This is the red section 5 needs.
        expect(importsFrom(`import { useTranslation } from "../i18n/LanguageContext"`, FORMAT_SPECIFIER)).toBe(
            false,
        )
        // End-anchored: a DIFFERENT module whose name merely starts the same way
        // must not satisfy the check, or the pin means nothing.
        expect(importsFrom(`import { x } from "./draftUiHelpersExtra"`, DRAFT_UI_HELPERS_SPECIFIER)).toBe(
            false,
        )
        expect(importsFrom(`import { x } from "../i18n/formatting"`, FORMAT_SPECIFIER)).toBe(false)
        // A type-only import counts: it is still a dependency on the module, and
        // `import type { Lang } from "./types"` is how these files spell half of
        // what they take. What must NOT count is the word appearing in code.
        expect(importsFrom(`const s = "i18n/format"`, FORMAT_SPECIFIER)).toBe(false)
    })

    it("knows the difference between holding lang and handing it on", () => {
        // The half of section 5 that stops an import plus a destructure from
        // standing in for actually formatting.
        expect(handsLangToAFormatter("formatDraftGamesCount(t, summary.rawMatches, lang)")).toBe(
            true,
        )
        expect(handsLangToAFormatter("formatDateMedium(new Date(iso), lang)")).toBe(true)
        expect(handsLangToAFormatter("formatNumber(dataSummary.matchCount, lang)")).toBe(true)
        expect(handsLangToAFormatter("formatPatchWindowSummary(recentPatchData, t, lang)")).toBe(
            true,
        )
        // New in 0.6.2. This call USED to be the negative example further down,
        // as a formatter that could not be evidence because it took no Lang. It
        // takes one now, so it moved sides; the negative kept its place with a
        // different meaning.
        expect(handsLangToAFormatter("formatDraftPicksCount(t, entry.games, lang)")).toBe(true)

        // Taking lang and doing nothing with it is exactly the vacuous pass.
        expect(handsLangToAFormatter("const { t, lang } = useTranslation()")).toBe(false)
        // A pinned language is not handing lang on - and section 2 turns red on
        // this same source, tree-wide.
        expect(handsLangToAFormatter('formatDraftGamesCount(t, summary.rawMatches, "de")')).toBe(
            false,
        )
        expect(pinsALanguageAtCallSite('formatDraftGamesCount(t, summary.rawMatches, "de")')).toBe(
            true,
        )
        // A KNOWN formatter called without the language is not evidence either,
        // and this fixture is deliberately kept negative rather than flipped to
        // match the new signature. Read what the predicate is for: it is the
        // anti-vacuity half of section 5, the thing that stops "imports a
        // formatter and destructures lang" from standing in for actually
        // handing the language on. The case it has to refuse is a call to a
        // listed name whose last argument is something other than `lang` - and
        // the positive form of that same call now sits in the group above.
        //
        // Until 0.6.2 this string was live code and the comment here read "a
        // formatter that takes no language cannot be the evidence". Both halves
        // of that are now false: every one of FORMATTER_NAMES takes a `Lang`,
        // and `formatDraftPicksCount(t, entry.games)` no longer compiles. What
        // it IS, and what makes it worth keeping under a different label, is the
        // regression: the call site with its third argument dropped. That is a
        // change somebody could make to DraftHelper.tsx while the file still
        // imports a formatter and still destructures lang, and the predicate
        // must not count it.
        expect(handsLangToAFormatter("formatDraftPicksCount(t, entry.games)")).toBe(false)
        // Neither can a call that is not a known formatter at all.
        expect(handsLangToAFormatter("formatScore(entry.totalScore)")).toBe(false)
        expect(handsLangToAFormatter("renderPanel(props, lang)")).toBe(false)
        // A near-miss identifier is not `lang`.
        expect(handsLangToAFormatter("formatNumber(n, langOverride)")).toBe(false)
    })

    it("counts every formatter call, not just the first one that looks right", () => {
        // The 0.6.2 hole, reduced to two lines: a file whose FIRST formatter
        // call is perfect and whose SECOND has no language. handsLangToAFormatter
        // is satisfied by the first and never reaches the second, which is
        // exactly how an unrewired call site survived a green section 5.
        const mixed = [
            "{t('dh_rawSample')} {formatDraftGamesCount(t, recentPatchData.rawSample, lang)}",
            "{t('dh_recoTableTotal')} {formatDraftPicksCount(t, entry.games)}",
        ].join("\n")
        expect(handsLangToAFormatter(mixed), "the single-test predicate is happy").toBe(true)
        expect(formatterCallsMissingLang(mixed)).toEqual([
            "formatDraftPicksCount: 1 call(s), 0 ending in lang",
        ])

        // The same two lines as they actually stand in DraftHelper.tsx today.
        const rewired = mixed.replace("entry.games)", "entry.games, lang)")
        expect(formatterCallsMissingLang(rewired)).toEqual([])

        // A pinned language is a call that does not hand `lang` on, so it is
        // reported here too - and section 2 turns the whole tree red on it.
        expect(formatterCallsMissingLang('formatNumber(n, "de")')).toEqual([
            "formatNumber: 1 call(s), 0 ending in lang",
        ])

        // Two calls to the SAME name, one of them unrewired, is the case a
        // per-name boolean would miss. DraftHelper calls formatDraftGamesCount
        // twice, so this is not hypothetical.
        expect(
            formatterCallsMissingLang(
                "formatDraftGamesCount(t, a, lang) + formatDraftGamesCount(t, b)",
            ),
        ).toEqual(["formatDraftGamesCount: 2 call(s), 1 ending in lang"])

        // Legitimate, and each of these would be a false red: an import that
        // merely NAMES the formatters, a call spread over several lines, and a
        // call whose argument carries a nested call of its own.
        expect(
            formatterCallsMissingLang(
                `import { formatDraftPicksCount, formatNumber } from "./draftUiHelpers"`,
            ),
        ).toEqual([])
        expect(
            formatterCallsMissingLang("formatPatchWindowSummary(\n    data,\n    t,\n    lang,\n)"),
        ).toEqual([])
        expect(formatterCallsMissingLang("formatDateMedium(new Date(iso), lang)")).toEqual([])
        // A name that merely starts the same way is not one of ours.
        expect(formatterCallsMissingLang("formatNumberRange(a, b)")).toEqual([])
    })

    it("accepts a locale resolved once and reused, and still rejects a pinned one", () => {
        // The shape the old counting assertion would have called a failure. It
        // is the better code, so it has to pass.
        const hoisted = [
            "export function formatDateAndTime(d, lang) {",
            "    const locale = localeForLang(lang)",
            "    return new Intl.DateTimeFormat(locale, dateOpts).format(d) +",
            "        new Intl.DateTimeFormat(locale, timeOpts).format(d)",
            "}",
        ].join("\n")
        expect(unresolvedLocaleArguments(hoisted)).toEqual([])
        // The old proxy would have red-flagged it: 2 locale-bearing calls, 1
        // localeForLang call.
        expect((hoisted.match(/\bIntl\s*\.\s*\w+\s*\(/g) ?? []).length).toBe(2)
        expect((hoisted.match(/localeForLang\s*\(/g) ?? []).length).toBe(1)

        // ...while the three real failures are still named, not counted.
        expect(unresolvedLocaleArguments(`n.toLocaleString("de-DE")`)).toEqual(['"de-DE"'])
        expect(unresolvedLocaleArguments("Intl.DateTimeFormat(undefined, opts)")).toEqual([
            "undefined",
        ])
        expect(unresolvedLocaleArguments("n.toLocaleString()")).toEqual(["(no locale argument)"])
        // A local that was never assigned from localeForLang is not a free pass.
        expect(unresolvedLocaleArguments("const locale = props.locale\nx.toLocaleString(locale)"))
            .toEqual(["locale"])
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
