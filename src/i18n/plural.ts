/**
 * The singular/plural *selection rule*, and nothing else.
 *
 * WHY THIS MODULE IS SO SMALL, AND WHY IT ONLY HOLDS THE RULE:
 *
 * Two areas of the app render counted strings, and each has its own
 * `fillPlaceholders()`:
 *
 *  - src/components/scout/scoutUiHelpers.ts formats numbers through
 *    `formatScoutNumber()`, drops a placeholder it has no value for, and runs
 *    the result through `tidyText()`.
 *  - src/components/team/teamUiHelpers.ts substitutes plainly and deliberately
 *    leaves an unfilled placeholder visible.
 *
 * Those two behaviours are intentional and different. Hoisting a *shared
 * filler* up here would chain the scout module to the team module (and, via
 * the team module's value import of `RIOT_TRANSPORT_ERROR_CODES`, to the
 * Supabase client) or force one of the two areas to accept the other's
 * formatting. So the filler stays where it is, twice. The RULE — which of the
 * two keys to pick — has no such tension and must exist exactly once, because
 * a second copy is what silently drifts.
 *
 * THE RULE: `count === 1` takes `one`, EVERYTHING else takes `many`.
 *
 *  - `0` is a plural in both languages this app ships: "0 neue Zeilen" and
 *    "0 new rows" are correct, "0 neue Zeile" is not.
 *  - A negative count (`-1`) takes `many`. Nothing here produces one today;
 *    if something ever does, a plural noun is the less wrong of the two, and
 *    the number itself makes the anomaly visible.
 *  - A fractional count (`1.5`, and also `1.0000001`) takes `many` — it is not
 *    `=== 1`. Counted UI strings are whole things (rows, players, games), so
 *    this case is defensive rather than expected.
 *  - `NaN` takes `many` as well, since `NaN === 1` is false.
 *
 * Both keys of a pair must carry the SAME `{placeholder}`, the singular one
 * included, even though its number can only ever be 1. Baking the "1" into the
 * text would break DE/EN placeholder parity (tests/i18nScoutCopy.test.ts checks
 * that for every key) and would hide the number from whoever rewords the string
 * next. This module cannot enforce that — it never looks at the texts — which
 * is precisely why it is stated here.
 *
 * Pure: no React, no DOM, no clock, no I/O, and no `t()`. It picks a key; the
 * caller translates and fills it.
 */

import type { TranslationKey } from "./types"

/**
 * A singular/plural key pair.
 *
 * Generic in the key type so a caller may narrow to its own two literals; the
 * default is the full `TranslationKey` union, which is what the exported pair
 * constants in the UI helper modules use.
 */
export interface PluralKeys<K extends TranslationKey = TranslationKey> {
    readonly one: K
    readonly many: K
}

/**
 * Pick the key that matches `count`.
 *
 * `count === 1` -> `keys.one`, ALL other values -> `keys.many` (see the module
 * comment for why `0`, negatives and fractions land in the plural).
 */
export function pluralKey<K extends TranslationKey>(count: number, keys: PluralKeys<K>): K {
    return count === 1 ? keys.one : keys.many
}
