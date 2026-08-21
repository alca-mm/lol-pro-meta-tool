/**
 * Every number and date the Player Results tab prints, as pure functions.
 *
 * WHY A MODULE INSTEAD OF INLINE JSX: vitest runs in Node with no jsdom
 * (`test.environment: 'node'`), so nothing in this project can assert what a
 * component renders. A `toLocaleDateString("de-DE", …)` sitting in a `.tsx`
 * file is therefore invisible to the test suite — which is exactly how the
 * whole tab came to format German dates for English users without a single
 * test going red. Moved here, the same call is pinned by
 * tests/playerResultsFormat.test.ts. Same argument as scoutImportHelpers.ts
 * and teamUiHelpers.ts.
 *
 * WHAT IS AND IS NOT LOCALE-DEPENDENT, and why the split is not arbitrary:
 *
 *  - Thousands separators and dates ARE. `1.234` / `21.08.26` in German,
 *    `1,234` / `08/21/26` in English. These take the `lang` argument.
 *  - A ratio like a KDA or a CS/min value is NOT. It is printed with a fixed
 *    number of decimals and an ASCII dot, exactly as before, because the whole
 *    app does it that way (`formatScoutNumber` is deliberately locale-neutral
 *    for the same reason) and because a comma there would collide with the
 *    `k/d/a` triples and the `,`-joined lists next to them.
 *
 * That asymmetry is deliberate and pre-existing. This module did not introduce
 * it; it only made it explicit and testable. Changing it would move numbers
 * the user has been reading for months, which is not what an i18n pass is for.
 */

import type { Lang, TranslationKey } from "../../i18n/types"
import type { PluralKeys } from "../../i18n/plural"
import { formatNumber } from "../../i18n/format"
import { localeForLang } from "../../i18n/locale"
import type { PlayerChampionResultStats } from "../../teams/playerResultsAnalytics"

/** The `t()` of src/i18n/LanguageContext, narrowed to what this module needs. */
export type PlayerResultsTranslate = (key: TranslationKey) => string

/** The cell text for a stat that has no value at all. */
export const EMPTY_CELL = "—"

/**
 * A whole number with the language's thousands separator: `1.234` / `1,234`.
 *
 * Rounds first, on purpose. Every caller feeds it a per-minute figure that is
 * already a float (damage, gold), and `Intl` would otherwise print three
 * decimals of a number nobody reads to that precision.
 *
 * THE LOCALE IS NOT RESOLVED HERE. `formatNumber` in src/i18n/format.ts is the
 * app-wide function that turns a number and a `Lang` into a grouped string, and
 * the line this delegates to is byte-for-byte the one that used to stand here.
 * Two copies of `value.toLocaleString(localeForLang(lang))` is how the app came
 * to answer the same question four different ways at once.
 *
 * WHAT DOES STAY at this layer is the {@link EMPTY_CELL} guard, and that split
 * is the intended layering: i18n/format.ts owns the LOCALE, player-results owns
 * what "no value" looks like. `formatNumber` deliberately does not invent a
 * value for a broken input - it stringifies it, so a `NaN` reaches the screen
 * as "NaN" and somebody reports it. A stats table is the one place where that
 * is the wrong answer: the analytics layer can legitimately produce a non-finite
 * figure (a division by zero games), and an em dash is the honest rendering of
 * it. Neither policy belongs in the other module.
 */
export function formatWholeNumber(value: number, lang: Lang): string {
    if (!Number.isFinite(value)) return EMPTY_CELL
    return formatNumber(Math.round(value), lang)
}

/**
 * A match date, short: `21.08.26` in German, `08/21/26` in English.
 *
 * Two-digit day, month and year, which is what the column was built for and
 * what keeps it narrow. The ORDER of those three is the locale's business, and
 * that is the whole point — `2-digit` says how wide, never in which sequence.
 *
 * An unparsable timestamp returns {@link EMPTY_CELL}. `new Date("nonsense")`
 * yields an Invalid Date whose `toLocaleDateString` is the literal string
 * "Invalid Date", which would sit in the table looking like a value.
 *
 * DELIBERATELY NOT ROUTED THROUGH src/i18n/format.ts, unlike the number above.
 * `formatDateNumeric` there prints a `numeric` year, this column a `2-digit`
 * one, and no function in that module offers the short year. Delegating would
 * silently widen every cell in the match table from `21.08.26` to `21.08.2026`.
 * A third app-wide date format for one table's column width would be the worse
 * trade, so this one resolves the locale itself - through the same
 * `localeForLang(lang)`, which is the rule the ban is actually about.
 */
export function formatMatchDate(iso: string, lang: Lang): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return EMPTY_CELL
    return date.toLocaleDateString(localeForLang(lang), {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    })
}

/** `0.5234` -> `"52.3%"`. Locale-neutral by design, see the module comment. */
export function formatWinRatePercent(fraction: number): string {
    if (!Number.isFinite(fraction)) return EMPTY_CELL
    return `${(fraction * 100).toFixed(1)}%`
}

/** `0.5234` -> `"52%"`. The compact form used on the highlight cards. */
export function formatWinRatePercentShort(fraction: number): string {
    if (!Number.isFinite(fraction)) return EMPTY_CELL
    return `${(fraction * 100).toFixed(0)}%`
}

/** A fixed-decimal ratio (KDA, CS/min). Locale-neutral, see the module comment. */
export function formatRatio(value: number, decimals: number): string {
    if (!Number.isFinite(value)) return EMPTY_CELL
    return value.toFixed(decimals)
}

/** `12/3/7`. Pure string assembly; no locale, no separator question. */
export function formatKdaTriple(kills: number, deaths: number, assists: number): string {
    return `${kills}/${deaths}/${assists}`
}

/**
 * One cell of the champion stats table.
 *
 * Behaviour is byte-identical to the `fCell()` this replaced, apart from the
 * two `toLocaleString` calls now following the app language instead of always
 * German. The switch is kept rather than turned into a per-column config
 * object: `PlayerChampionResultStats` is a flat record of numbers and one
 * string, so a lookup table would only move the same fourteen cases somewhere
 * else while losing the exhaustiveness a `switch` over a key union gives.
 */
export function formatChampionStatCell(
    key: keyof PlayerChampionResultStats,
    value: PlayerChampionResultStats[keyof PlayerChampionResultStats],
    lang: Lang,
): string {
    if (value === null) return EMPTY_CELL
    switch (key) {
        case "winRate":
            return formatWinRatePercent(value as number)
        case "avgKda":
        case "avgKills":
        case "avgDeaths":
        case "avgAssists":
            return formatRatio(value as number, 2)
        case "csPerMinute":
            return formatRatio(value as number, 1)
        case "damagePerMinute":
        case "goldPerMinute":
            return formatWholeNumber(value as number, lang)
        default:
            return String(value)
    }
}

/**
 * "Letzte 10" / "Last 10" — `playerResults_lastN` with its `{count}` filled.
 *
 * TWO COMPONENTS RENDER THIS SENTENCE (the Last-N buttons on the page, and the
 * "Aktuelle Form · Letzte 10" heading on the form card), which is exactly why
 * the substitution lives in one place. They were briefly written twice, once
 * against the team module's filler and once with a local `split`/`join`, and
 * two spellings of one sentence is how the two drift apart.
 *
 * It is NOT a third `fillPlaceholders`. It fills one known placeholder in one
 * known key, so there is no "what happens to an unfilled placeholder" policy to
 * disagree about — which is the thing the scout and team fillers genuinely
 * differ on (see the header of src/i18n/plural.ts). Reaching for either of
 * those would have chained this tab to that module for one `String.replace`.
 *
 * `split`/`join` rather than `replace`, because `replace` with a string pattern
 * substitutes only the first occurrence and treats `$&` in the value as a
 * back-reference. Neither matters for a count, and both would matter later.
 */
export function formatLastNLabel(t: PlayerResultsTranslate, limit: number): string {
    return t("playerResults_lastN").split("{count}").join(String(limit))
}

/**
 * "1 Match" / "3 Matches", as a key pair rather than a suffix.
 *
 * The two places that print this count used `` `${n} Match${n !== 1 ? "es" : ""}` ``,
 * which is the exact pattern the project banned after "1 neue Match gespeichert."
 * shipped: a suffix can pluralise the noun and nothing else, and German needs
 * the article and any adjective to agree too. Both keys carry `{count}`, the
 * singular included.
 *
 * The pair lives here, next to the other Player Results display rules, so no
 * component names a key itself and forgets one of the two halves. The
 * substitution is `pluralMessage()` from teamUiHelpers, which this tab already
 * shares a feature (and a Supabase-backed data source) with; importing it here
 * would pull that whole chain into a module whose entire point is being cheap
 * to load in a test.
 */
export const PLAYER_RESULTS_MATCH_COUNT_KEYS: PluralKeys = {
    one: "playerResults_matchCountOne",
    many: "playerResults_matchCountMany",
}
