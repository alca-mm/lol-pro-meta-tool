/**
 * The one place that turns an app language into an `Intl` locale.
 *
 * WHY THIS EXISTS: `Intl.NumberFormat` and `toLocaleDateString` need a BCP-47
 * locale, and `Lang` is not one. Before this module every caller answered that
 * question for itself, and every caller answered `"de-DE"` — including the
 * English build, where a date then read `21.08.26` and a number `1.234`. The
 * language switch worked everywhere except in the numbers.
 *
 * WHY NOT `undefined` (the "just use the browser locale" option): the app has
 * an explicit language switch that the user operates and that persists to
 * localStorage. A German user on an English-locale machine picked German; the
 * host locale is the one signal that does NOT reflect that choice. Passing
 * `undefined` would also make the output untestable — it would differ per
 * machine and per CI image, so no test could pin a formatted string.
 *
 * Pure: no React, no DOM, no `Intl` call of its own. It maps two strings.
 */

import type { Lang } from "./types"

/**
 * `Lang` -> BCP-47 locale.
 *
 * `en-US` rather than `en-GB` because `en-US` is what the rest of the English
 * copy is written in ("Solo queue", not "Solo Queue"), and because the two
 * differ in exactly the place this map is used: `en-GB` formats a short date
 * as `21/08/26`, `en-US` as `08/21/26`. One of the two had to be chosen
 * deliberately rather than inherited from whatever machine renders the page.
 *
 * `Record<Lang, string>` on purpose: adding a third language to `Lang` makes
 * this a compile error instead of a silent fallback to German.
 */
export const LOCALE_BY_LANG: Record<Lang, string> = {
    de: "de-DE",
    en: "en-US",
}

/**
 * The `Intl` locale for the active app language.
 *
 * Falls back to German for a value outside `Lang` — which the type system
 * already rules out, so this only catches a cast or a hand-built object at a
 * boundary. German is the fallback because the app is German-first and
 * `readSavedLang()` in LanguageContext defaults to it for the same reason.
 */
export function localeForLang(lang: Lang): string {
    return LOCALE_BY_LANG[lang] ?? LOCALE_BY_LANG.de
}
