/**
 * App-wide number and date formatting that follows the language switch.
 *
 * WHY THIS EXISTS: `localeForLang()` next door answers "which locale?", but
 * every caller still had to remember to ask it. Before this module the app
 * answered the question three different ways across four files — `"de-DE"`
 * hardcoded in DataSourceInfo, PatchWeightPanel and DraftHelper, `undefined`
 * (i.e. whatever the browser feels like) in TeamDraftLibraryPanel, and the
 * correct language-aware call only inside player-results. A German user on an
 * English machine could see `1.234` in one panel and `1,234` in the next.
 *
 * THE ONE RULE: nothing outside this file and src/i18n/locale.ts passes a
 * locale to `Intl` or to a `toLocale*` method. Components pass `lang`, these
 * functions resolve it. tests/appLocaleGuards.test.ts enforces that.
 *
 * WHAT IS DELIBERATELY NOT HERE: `localeCompare`. Sorting is not display, and
 * this project has repeatedly decided the opposite way there — src/scout/
 * analysis.ts and scoutUiHelpers.ts avoid `localeCompare` outright, because a
 * sort order that depends on the host's ICU build means two people looking at
 * the same data see different lists. Routing those calls through here would
 * make the order depend on the *language switch* instead, which is a different
 * kind of wrong. They stay as they are.
 *
 * Pure: no React, no DOM, no clock. Every function takes the value and the
 * language and returns a string.
 */

import type { Lang } from "./types"
import { localeForLang } from "./locale"

/**
 * A number with the language's thousands separator: `1.234` / `1,234`.
 *
 * Total, and deliberately does NOT invent a value for a broken input: a
 * non-finite number is stringified as-is, so `NaN` reaches the screen as
 * "NaN". That is a visible bug somebody will report, which is the point —
 * a silent `0` or a blank would be a lie about the data. Callers that have a
 * real "no value" state (player-results renders an em dash) apply that policy
 * at their own layer, before calling in here.
 *
 * Does NOT round to an integer. Every current caller passes an integer count;
 * a caller with a float rounds first, so the decision stays where the meaning
 * is. `Intl` still applies its own `maximumFractionDigits: 3` default, so
 * `1234.5678` prints as `1.234,568` rather than in full — unreachable today,
 * but the doc should not promise more than the runtime does.
 */
export function formatNumber(value: number, lang: Lang): string {
    if (!Number.isFinite(value)) return String(value)
    return value.toLocaleString(localeForLang(lang))
}

/**
 * Is this a `Date` that actually points at a moment in time?
 *
 * THIS GUARD IS LOAD-BEARING, and an earlier version of this comment got the
 * reason wrong. The two APIs behave differently on `new Date("nonsense")`:
 *
 *   d.toLocaleDateString("de-DE", opts)              -> "Invalid Date"
 *   new Intl.DateTimeFormat("de-DE", opts).format(d) -> throws RangeError
 *
 * Every date function below uses the SECOND form. So without this check an
 * unparsable timestamp does not merely render odd text, it throws during React
 * render and takes the surrounding tab down with it. Do not relax it into a
 * cosmetic nicety; tests/i18nFormat.test.ts pins the behaviour.
 */
function isValidDate(date: Date): boolean {
    return !Number.isNaN(date.getTime())
}

/**
 * A calendar date, all numeric: `21.08.2026` / `08/21/2026`.
 *
 * The two-digit day and month keep the width predictable; the ORDER of the
 * three parts is the locale's business, and that is the whole point of routing
 * this through `Intl` rather than assembling it by hand.
 *
 * An invalid `Date` yields `""` so the caller can fall back to its raw input.
 */
export function formatDateNumeric(date: Date, lang: Lang): string {
    if (!isValidDate(date)) return ""
    return new Intl.DateTimeFormat(localeForLang(lang), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date)
}

/** {@link formatDateNumeric} plus the time: `21.08.2026, 14:30` / `08/21/2026, 02:30 PM`. */
export function formatDateTimeNumeric(date: Date, lang: Lang): string {
    if (!isValidDate(date)) return ""
    return new Intl.DateTimeFormat(localeForLang(lang), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date)
}

/**
 * A date with the month spelled short: `21. Aug. 2026` / `Aug 21, 2026`.
 *
 * This is the one format where the language does more than move separators
 * around: the month name itself is translated. It was the format reading the
 * BROWSER locale before, so a German user with an English system got
 * "Aug 21, 2026" in an otherwise German panel.
 */
export function formatDateMedium(date: Date, lang: Lang): string {
    if (!isValidDate(date)) return ""
    return new Intl.DateTimeFormat(localeForLang(lang), {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date)
}
