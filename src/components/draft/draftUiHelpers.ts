/**
 * Display strings the Draft tab assembles in code rather than in JSX.
 *
 * WHY THIS MODULE EXISTS AT ALL: vitest runs in Node here (vite.config.ts,
 * `test.environment: 'node'`) with no jsdom, so a sentence built inside a
 * component can never be asserted. The project already answers that with a
 * helper module sitting next to the components it serves —
 * src/components/scout/scoutUiHelpers.ts, src/components/team/teamUiHelpers.ts,
 * src/components/player-results/playerResultsFormat.ts. This is that same
 * pattern for src/components/draft/.
 *
 * WHY {@link formatPatchWindowSummary} MOVED HERE INSTEAD OF GAINING AN IMPORT
 * WHERE IT WAS: it used to live in src/draft/patchWindow.ts, next to
 * `weightedPatchWindow`. That file is the engine behind five memoised
 * computations in DraftHelper, and `src/draft/**` has zero imports from
 * `src/i18n/**` — the domain/i18n boundary there is clean today, and
 * `formatNumber` is a VALUE import that would have been the first breach. The
 * function was the only display formatter in an otherwise purely computational
 * file, it had exactly one call site, and no test imported it. Moving it was
 * the smaller change; fixing it in place would have cost the boundary.
 *
 * Pure: no React, no DOM, no clock, no I/O. Every function takes its data, the
 * `t` of src/i18n/LanguageContext and the active `Lang`, and returns a string.
 */

import type { Lang, TranslationKey } from "../../i18n/types"
import type { PluralKeys } from "../../i18n/plural"
import { pluralKey } from "../../i18n/plural"
import { formatNumber } from "../../i18n/format"
import type { PatchWindowData } from "../../draft/types"

/** The `t()` of src/i18n/LanguageContext, narrowed to what this module needs. */
export type DraftTranslate = (key: TranslationKey) => string

/* ==========================================================================
 * Counted nouns
 *
 * WHY THESE EXIST: until 0.6.1 the draft area rendered `{n} {t("dh_games")}`
 * and `{n} {t("dh_recoTablePicks")}` — a number followed by a TABLE-HEADER key.
 * That is the `{zahl} {t("substantiv_im_plural")}` shape CLAUDE.md banned after
 * "1 neue Match gespeichert.", and it was reachable: a patch enters the summary
 * only if it has matches (so its count starts at 1), and the min-picks input is
 * `min={1}`, so a one-pick champion really did render "1 Picks".
 *
 * A header key is the wrong thing to borrow twice over. It is a LABEL, so it
 * carries no number and cannot decline; and in English it is Title Case, which
 * is right above a column and wrong inside a sentence. `dh_games` had no label
 * use left at all once these call sites moved, so it was deleted rather than
 * kept around as a trap.
 *
 * Both pairs carry `{count}` on BOTH halves, the singular included — baking the
 * "1" into the text would break the DE/EN placeholder parity that
 * tests/i18nScoutCopy.test.ts checks across every key.
 * ========================================================================== */

const DRAFT_GAMES_COUNT_KEYS: PluralKeys = {
    one: "dh_gamesCountOne",
    many: "dh_gamesCountMany",
}

const DRAFT_PICKS_COUNT_KEYS: PluralKeys = {
    one: "dh_picksCountOne",
    many: "dh_picksCountMany",
}

/** Fill the one `{count}` a counted-noun key carries. */
function fillCount(template: string, rendered: string): string {
    return template.split("{count}").join(rendered)
}

/**
 * `1 Game` / `4.821 Games`, `1 game` / `4,821 games`.
 *
 * GROUPED, because all three call sites already ran the number through
 * `formatNumber` before this helper existed; keeping that makes the output
 * byte-identical to 0.6.0 for every count except 1.
 */
export function formatDraftGamesCount(t: DraftTranslate, count: number, lang: Lang): string {
    return fillCount(t(pluralKey(count, DRAFT_GAMES_COUNT_KEYS)), formatNumber(count, lang))
}

/**
 * `1 Pick` / `1.234 Picks`, `1 pick` / `1,234 picks`.
 *
 * GROUPED since 0.6.2, and the history is worth keeping because it explains the
 * shape of the test that guards it. 0.6.1 moved this call site off a
 * table-header key onto a plural pair, but deliberately left the number
 * ungrouped: the old JSX rendered `{entry.games}` raw, and adding a separator
 * would have been a visible change that fix had not been asked for. It froze
 * the ungrouped output in a test **so that this follow-up would have to come
 * back here** rather than drift.
 *
 * Now it takes the same route as `formatDraftGamesCount` above, so the two
 * counts in one recommendation subtitle no longer spell a thousand two
 * different ways.
 *
 * A side effect worth naming: a fractional count now renders `1,5 Picks` in
 * German instead of `1.5 Picks`. 0.6.1 recorded that English decimal point as a
 * wart of not grouping; it is gone. The case stays unreachable either way -
 * `entry.games` counts array entries.
 */
export function formatDraftPicksCount(t: DraftTranslate, count: number, lang: Lang): string {
    return fillCount(t(pluralKey(count, DRAFT_PICKS_COUNT_KEYS)), formatNumber(count, lang))
}

/**
 * The patch line under the recommendations: `14.16 (100%, 4.821 Games) · …`.
 *
 * Shape, separator and ordering are byte-identical to the version this
 * replaced. Three things about it were not:
 *
 *  1. THE NUMBER WAS UNGROUPED. `${summary.rawMatches}` interpolated a raw
 *     `4821`, directly under a line that prints a comparable figure as `10.054`
 *     through `formatNumber`. Two spellings of the same kind of number, one
 *     above the other. It now takes the same route as every other count in the
 *     app: `formatNumber(n, lang)`, which resolves the locale through
 *     `localeForLang` for us.
 *  2. THE EMPTY BRANCH WAS A GERMAN LITERAL. It returned `"keine Patchdaten"`,
 *     and that branch is reachable in the English build — drag all six patch
 *     weights to zero, or filter down to no matches, and an English user read
 *     "Recommendations use a weighted patch selection: keine Patchdaten".
 *     `dh_noPatchData` is the key for it.
 *  3. THE NOUN WAS WELDED IN. Each segment ended in a hardcoded ` Games`. That
 *     first became `t("dh_games")`, and in 0.6.1 `formatDraftGamesCount` above,
 *     because a bare noun key cannot decline: the segment read "1 Games"
 *     whenever a patch contributed exactly one match. `dh_games` is gone; it
 *     had no label use left once every call site turned out to be a count.
 *
 * NOT A `{placeholder}` KEY, deliberately. There is no app-wide substitution
 * layer in this project (the scout and team modules each carry their own
 * `fillPlaceholders`, with different policies on purpose — see the header of
 * src/i18n/plural.ts), and no guard checks that a placeholder was ever filled.
 * A key like `"{patch} ({weight}%, {games} Games)"` would render literal braces
 * on screen while every existing test stayed green. Whole-word keys assembled
 * in code cannot fail that way.
 *
 * The percentage and the ` · ` separator stay locale-neutral, matching the
 * asymmetry documented in playerResultsFormat.ts: grouping separators follow
 * the language, fixed-format ratios and structural punctuation do not.
 */
export function formatPatchWindowSummary(
    patchData: PatchWindowData,
    t: DraftTranslate,
    lang: Lang,
): string {
    if (patchData.summaries.length === 0) return t("dh_noPatchData")

    return patchData.summaries
        .map(
            (summary) =>
                `${summary.patch} (${summary.weight}%, ` +
                `${formatDraftGamesCount(t, summary.rawMatches, lang)})`,
        )
        .join(" · ")
}
