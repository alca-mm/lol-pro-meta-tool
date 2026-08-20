/**
 * Pure helpers for the Tournament Scout stats import panel.
 *
 * Same contract as ./scoutUiHelpers.ts, and for the same reason: no React, no
 * DOM, no clock, no randomness — so every rule the import UI applies can be
 * unit-tested in the Node-based vitest suite (tests/scoutImportHelpers.test.ts)
 * instead of only being visible in a rendered component nobody can assert on.
 *
 * The jobs that live here:
 *
 *  1. Mechanical i18n key building for the import unions
 *     (`scout_import_warning_<code>`, `scout_import_column_<column>`, …). No
 *     switch, no lookup table: TypeScript checks the resulting template literal
 *     against `TranslationKey`, so a missing key is a compile error rather than
 *     an `undefined` on screen. This mirrors section 1 of scoutUiHelpers.ts.
 *
 *  2. Warning text assembly. The import warnings carry machine codes in their
 *     params (`detectedRole: "bot"`, `detected: "opgg"`); this file is the one
 *     place that turns those into labels before they are substituted, so the
 *     user reads "ADC" and "OP.GG" and never `bot` / `opgg`.
 *
 *  3. The role suggestion. `suggestImportRole()` returns `null` — "the user has
 *     to answer this" — instead of falling back to a role. That `null` is the
 *     whole safeguard of the feature: a Karma table copied off a support
 *     profile must never be filed as a jungle threat because a default was
 *     quietly picked.
 *
 *  4. Row selection arithmetic and cell formatting, where a missing value is
 *     rendered as "no value given" and NEVER as `0` — a `0` would be
 *     indistinguishable from a genuine "0 games" and would flow into a score.
 *     How many rows an APPLY took over is deliberately NOT computed here: that
 *     is `ScoutImportApplyResult.importedRows`, reported by `applyImportRows()`
 *     itself (see the note at the end of section 10).
 *
 *  5. The provenance rule (section 7 below): which `ScoutManualSource` the
 *     applied entries are filed under. That is an honesty question rather than
 *     a label — it is what a user reads back weeks later when deciding how far
 *     to trust a number — so it is decided here and asserted in the suite, not
 *     inline in the component.
 *
 *  6. The two questions the raw OP.GG champions-page copy adds (section 8
 *     below): "did this result come out of such a copy?" and "how many lines
 *     were skipped for which reason?". Both are one-liners, and both live here
 *     for the same reason as everything above: they are the conditions the
 *     panel renders on, so they get asserted in the suite instead of hiding
 *     inside JSX where nothing can test them.
 *
 * Nothing here is duplicated from ./scoutUiHelpers.ts; that module is imported
 * for `fillPlaceholders`, `formatScoutNumber`, `scoutRoleKey`, `scoutSourceKey`
 * and `lineupStarterSlot`.
 */

import type { TranslationKey } from "../../i18n/types"
import { isImportRowApplicable } from "../../scout/statsImport"
import { SCOUT_LINEUP_SLOTS } from "../../scout/types"
import type {
    ScoutImportColumn,
    ScoutImportLayout,
    ScoutImportMode,
    ScoutImportRole,
    ScoutImportRow,
    ScoutImportSourceKind,
    ScoutImportUnparsedLine,
    ScoutImportUnparsedReason,
    ScoutImportWarning,
    ScoutImportWarningCode,
    ScoutLineup,
    ScoutManualSource,
    ScoutPlayer,
    ScoutReasonParams,
    ScoutRole,
    ScoutStatsImportResult,
} from "../../scout/types"
import {
    SCOUT_ROLE_VALUES,
    fillPlaceholders,
    formatScoutNumber,
    lineupStarterSlot,
    scoutRoleKey,
    scoutSourceKey,
    type ScoutTranslate,
} from "./scoutUiHelpers"

/* ==========================================================================
 * 1. Mechanical i18n key building
 * ========================================================================== */

export const scoutImportWarningKey = (code: ScoutImportWarningCode): TranslationKey =>
    `scout_import_warning_${code}`

export const scoutImportUnparsedKey = (reason: ScoutImportUnparsedReason): TranslationKey =>
    `scout_import_unparsed_${reason}`

export const scoutImportColumnKey = (column: ScoutImportColumn): TranslationKey =>
    `scout_import_column_${column}`

export const scoutImportLayoutKey = (layout: ScoutImportLayout): TranslationKey =>
    `scout_import_layout_${layout}`

export const scoutImportModeKey = (mode: ScoutImportMode): TranslationKey =>
    `scout_import_mode_${mode}`

/**
 * i18n key for an import source.
 *
 * `"unknown"` is not a provider and has no `scout_source_*` entry — it is the
 * parser's honest "could not tell", so it gets its own key. Every other member
 * of `ScoutImportSourceKind` is a `ScoutSourceKind`, which is a subset of
 * `ScoutManualSource`, so it reuses the existing `scout_source_<kind>` label
 * rather than growing a second set of provider names that could drift apart.
 */
export function scoutImportSourceKey(kind: ScoutImportSourceKind): TranslationKey {
    return kind === "unknown" ? "scout_import_source_unknown" : scoutSourceKey(kind)
}

/* ==========================================================================
 * 2. Canonical value lists
 * ========================================================================== */

/**
 * The five selectable import roles, in the canonical order.
 *
 * Derived from `SCOUT_LINEUP_SLOTS`, never retyped: `ScoutImportRole` *is*
 * `ScoutLineupSlot`, so a second hand-written list is a second order waiting to
 * disagree with the lineup grid. It deliberately contains no `"unknown"` —
 * importing is an explicit statement about a role — and no `"adc"`: `"bot"` is
 * the identifier, "ADC" is only what `scout_role_bot` says in German/English.
 */
export const SCOUT_IMPORT_ROLE_VALUES: readonly ScoutImportRole[] = [...SCOUT_LINEUP_SLOTS]

/**
 * Import sources for the dropdown: the four providers, then `"unknown"`.
 *
 * `"unknown"` sits last because it is the fallback answer, not a provider —
 * but it is a legal, selectable answer, which is why it is in the list at all
 * instead of being represented by an empty option.
 */
export const SCOUT_IMPORT_SOURCE_VALUES: readonly ScoutImportSourceKind[] = [
    "opgg",
    "leagueofgraphs",
    "deeplol",
    "dpm",
    "unknown",
]

function isScoutImportSourceKind(value: string): value is ScoutImportSourceKind {
    return SCOUT_IMPORT_SOURCE_VALUES.indexOf(value as ScoutImportSourceKind) !== -1
}

/** Reuses the list scoutUiHelpers already maintains — including `"unknown"`. */
function isScoutRoleValue(value: string): value is ScoutRole {
    return SCOUT_ROLE_VALUES.indexOf(value as ScoutRole) !== -1
}

/* ==========================================================================
 * 3. Warning text
 * ========================================================================== */

/**
 * Translate the *values* of import-warning params that carry machine codes.
 *
 * Two rules, in this order:
 *  - a role-bearing name (`detectedRole`, `selectedRole`, or anything else
 *    ending in `Role`) whose value is a real role becomes the role label. This
 *    is the same suffix rule `localizeScoutParams()` uses in scoutUiHelpers.ts,
 *    and it is why `role_mismatch` reads "Die Quelle nennt ADC" instead of
 *    "Die Quelle nennt bot".
 *  - `detected` / `selected` of `source_mismatch` carry a provider code, so
 *    they become the provider label. The gate is on the *value*, not only the
 *    name: a param called `detected` holding something that is not a source
 *    passes through untouched rather than being mangled.
 *
 * Everything else — `{champion}` above all — passes through verbatim.
 *
 * This is a deliberate sibling of `localizeScoutParams()` rather than a call
 * into it: that function knows nothing about `ScoutImportSourceKind`, and
 * teaching it would mean editing scoutUiHelpers.ts, which this module does not
 * own.
 */
function localizeImportParams(
    t: ScoutTranslate,
    params?: ScoutReasonParams,
): ScoutReasonParams | undefined {
    if (!params) return undefined
    const out: Record<string, string | number> = {}
    for (const key of Object.keys(params)) {
        const value = params[key]
        if (typeof value === "string" && /[Rr]ole$/.test(key) && isScoutRoleValue(value)) {
            out[key] = t(scoutRoleKey(value))
            continue
        }
        if (
            typeof value === "string" &&
            (key === "detected" || key === "selected" || key === "source") &&
            isScoutImportSourceKind(value)
        ) {
            out[key] = t(scoutImportSourceKey(value))
            continue
        }
        out[key] = value
    }
    return out
}

/** One finished import-warning sentence. Severity drives styling, never text. */
export function translateScoutImportWarning(
    t: ScoutTranslate,
    warning: ScoutImportWarning,
): string {
    return fillPlaceholders(
        t(scoutImportWarningKey(warning.code)),
        localizeImportParams(t, warning.params),
    )
}

/** `"Champion, Games, Winrate"` — translated column names, in the given order. */
export function formatImportColumns(
    t: ScoutTranslate,
    columns: readonly ScoutImportColumn[],
): string {
    return columns.map((column) => t(scoutImportColumnKey(column))).join(", ")
}

/* ==========================================================================
 * 4. Role suggestion
 * ========================================================================== */

/**
 * What the role dropdown should start on for one player — or `null`.
 *
 * Order of preference:
 *  1. the player's *starting* lineup slot. That is what the user declared, and
 *     it is the same precedence `defaultRoleForPlayer()` applies to a new
 *     manual row.
 *  2. the role the link parser guessed, when it guessed one.
 *  3. `null`.
 *
 * `null` means "the user must choose", and the panel renders it as an empty
 * selection plus `scout_import_roleRequired` with the parse button disabled.
 * It must never be turned into a default such as `"top"`: the applied entries
 * all carry the selected role, so a silently defaulted role files a whole
 * champion table under a lane nobody claimed — precisely the failure this
 * feature exists to prevent.
 *
 * A substitute seat is deliberately not read: sitting on the bench says nothing
 * about which lane the pasted table belongs to.
 */
export function suggestImportRole(
    lineup: ScoutLineup,
    player: ScoutPlayer,
): ScoutImportRole | null {
    const starter = lineupStarterSlot(lineup, player.id)
    if (starter !== null) return starter
    return player.role === "unknown" ? null : player.role
}

/* ==========================================================================
 * 5. Row selection
 * ========================================================================== */

/**
 * Ids of every row that can actually become an entry.
 *
 * This answers ONE question: "may this row be applied at all?" — and that is
 * exactly what decides whether the checkbox is enabled, and what "select all"
 * ticks. A champion the catalog does not know stays in this list on purpose:
 * `isImportRowApplicable()` accepts an unresolved name (a new champion, an
 * unusual spelling), so refusing it here would disable a checkbox for a row
 * `applyImportRows()` would happily store.
 *
 * Applicability is asked of `isImportRowApplicable()` (src/scout/statsImport.ts)
 * rather than re-derived from `games`/`winrate` here: two independent answers
 * to "can this row be applied?" is how a checkbox ends up enabled for a row the
 * apply step then silently skips.
 *
 * For the *preselection* use {@link defaultSelectedRowIds}, which is stricter.
 */
export function applicableRowIds(rows: readonly ScoutImportRow[]): string[] {
    return rows.filter((row) => isImportRowApplicable(row)).map((row) => row.id)
}

/**
 * The rows that are **ticked** right after a parse.
 *
 * Stricter than {@link applicableRowIds}, and deliberately so — the two answer
 * different questions:
 *
 *  - `applicableRowIds` answers "may this row be applied at all?". That drives
 *    the disabled state of the checkbox and the "select all" button, and it
 *    does not change here: an unknown champion name stays applicable, because
 *    it may well be a new champion or an unusual spelling that the user knows
 *    better than the catalog does.
 *  - `defaultSelectedRowIds` answers "should this row be taken over without the
 *    user doing anything?". For a name the catalog cannot resolve the honest
 *    answer is no: the user confirms that one by hand.
 *
 * That single extra condition (`championResolved`) is what keeps a copied-along
 * summary or footer line — `total  42  58%` parses into a perfectly applicable
 * row whose "champion" is `total` — from arriving pre-accepted, WITHOUT
 * inventing a heuristic for "what is a total line". The row is still shown,
 * still carries its `unknown_champion` warning, and can still be ticked; it
 * just is not ticked for the user.
 *
 * Order and purity match `applicableRowIds`: parse order, no mutation.
 */
export function defaultSelectedRowIds(rows: readonly ScoutImportRow[]): string[] {
    return rows
        .filter((row) => isImportRowApplicable(row) && row.championResolved)
        .map((row) => row.id)
}

/**
 * The rows the user ticked, in result order.
 *
 * Pure selection: an id that matches nothing is ignored, and the order is the
 * parse order rather than the order in which boxes were ticked, so the applied
 * entries mirror the preview the user was looking at. Applicability is *not*
 * filtered here — the checkbox of a non-applicable row is disabled, and
 * `applyImportRows()` remains the authority that counts such a row as skipped.
 */
export function selectedImportRows(
    rows: readonly ScoutImportRow[],
    selectedIds: ReadonlySet<string>,
): ScoutImportRow[] {
    return rows.filter((row) => selectedIds.has(row.id))
}

/* ==========================================================================
 * 6. Cell formatting
 * ========================================================================== */

/**
 * One preview cell.
 *
 * `null` renders as `scout_import_rowMissing` ("keine Angabe"), never as `"0"`:
 * a column the paste did not contain and a genuine zero are different facts,
 * and the whole point of `ScoutImportRow`'s nullable numbers is that the second
 * is not invented out of the first.
 */
export function importValueLabel(
    t: ScoutTranslate,
    value: number | null,
    suffix?: string,
): string {
    if (value === null) return t("scout_import_rowMissing")
    return `${formatScoutNumber(value)}${suffix ?? ""}`
}

/* ==========================================================================
 * 7. Provenance of the applied rows
 * ========================================================================== */

/**
 * The provenance the applied entries are stored under.
 *
 * `ScoutManualSource` is what a user reads back weeks later when deciding how
 * far to trust a number, so in this module it is an honesty question and not a
 * label: what is stored has to be a statement somebody actually made.
 *
 * The source dropdown of step 3 is that statement — with exactly one
 * correction. `"unknown"` is a legitimate *parser* answer ("I could not tell
 * which site this came from") but not a legitimate stored provenance, and
 * `ScoutManualSource` has no such member on purpose; it becomes `"other"`.
 *
 * `layout` stays in the signature although no current layout answers the
 * question differently: it is the result's own account of the rows, and it is
 * what a layout whose origin is known *exactly* would be read from. Deliberately
 * not consulted today — no pasted layout knows better than the user where the
 * text came from, so none of them may override the dropdown behind their back.
 * The parameter therefore carries the underscore that says "declared, not read".
 */
export function manualSourceForImport(
    _layout: ScoutImportLayout,
    selected: ScoutImportSourceKind,
): ScoutManualSource {
    return selected === "unknown" ? "other" : selected
}

/* ==========================================================================
 * 8. The raw OP.GG champions-page copy
 * ========================================================================== */

/**
 * How many skipped lines were skipped for one particular reason.
 *
 * Pure counting, no side effect and no interpretation: it does not know what a
 * matchup line is, it only asks each entry for the reason the parser already
 * recorded. That keeps the categorisation in exactly one place
 * (src/scout/statsImport.ts) — a second opinion here about "what is really a
 * recommendation" is how a preview ends up reporting numbers the parser did
 * not produce.
 *
 * It exists because rule (A) of the scout — nothing disappears without a word —
 * needs a *number* to be stated: "18 matchup lines skipped" instead of the flat
 * "24 lines ignored" the raw `unparsedLines.length` would give. Every skipped
 * line keeps being listed verbatim in the unparsed block regardless; this is
 * the summary above it, never a replacement for it.
 *
 * Returns `0` for an empty list and for a reason nothing carries — `0` is the
 * honest answer here (there genuinely were none), unlike the nullable numbers
 * on `ScoutImportRow` where `0` and "not stated" are different facts.
 */
export function countUnparsedByReason(
    lines: readonly ScoutImportUnparsedLine[],
    reason: ScoutImportUnparsedReason,
): number {
    return lines.reduce((total, line) => (line.reason === reason ? total + 1 : total), 0)
}

/**
 * `true` when this result came out of a raw copy of the OP.GG champions page.
 *
 * ONE PLACE FOR THE COMPARISON, and that is the whole point of it being a
 * function rather than `result.layout === "opgg_raw_champion_page"` written out
 * wherever it is needed. The panel asks this question several times over (the
 * detected label, the champion count, the two skip counters, the role note), and
 * a string literal repeated five times is five places to forget when the layout
 * is ever renamed — the compiler cannot help with a comparison that is merely
 * `false` more often than it should be. Here it is one typed comparison the
 * suite pins down, and the panel reads as the condition it means.
 *
 * Deliberately NOT a general `isLayout(result, layout)`: no other layout drives
 * a section of the UI, and a generic helper would invite exactly the scattered
 * per-layout branching this feature has stayed free of.
 */
export function isOpggRawResult(result: ScoutStatsImportResult): boolean {
    return result.layout === "opgg_raw_champion_page"
}

/* ==========================================================================
 * 9. The state of the apply step
 * ========================================================================== */

/**
 * What the apply step is saying right now. Exactly one of three things.
 *
 *  - `applied` — "n rows were taken over", the confirmation of the click that
 *    just happened.
 *  - `blocked` — "not applicable yet", the reason the button is disabled.
 *  - `idle` — nothing to say; the button is live and nothing has been applied.
 */
export type ScoutImportApplyStatus =
    | { kind: "applied"; count: number }
    | { kind: "blocked" }
    | { kind: "idle" }

/**
 * Resolve the apply step's single status message.
 *
 * WHY THIS IS A FUNCTION AT ALL: the panel used to render its two messages from
 * two independent conditions (`!canApply` and `appliedCount !== null`), and the
 * two are not mutually exclusive — so the user got
 * "Noch nicht übernehmbar: …" and "Übernommen: 72 Zeilen." next to each other,
 * one contradicting the other. A single function with a single return value
 * makes that state unrepresentable, and vitest runs in Node without jsdom here,
 * so the rule has to live outside the component to be assertable at all.
 *
 * PRIORITY — `applied` > `blocked` > `idle`, and the order matters:
 *
 *  1. `appliedCount !== null` wins. Right AFTER a successful apply the row
 *     selection is cleared (so the same rows cannot be applied twice by a
 *     double click), which makes `canApply` `false` in the very same render.
 *     That is precisely the constellation that produced both messages at once.
 *     In that moment the fresh confirmation is the only thing the user is
 *     interested in — the button being disabled is a consequence of their own
 *     successful click, not a problem to report.
 *  2. `blocked` after that. It is not swallowed: `appliedCount` is reset on
 *     EVERY context change (row selection, role, player, apply mode, source,
 *     recency, paste text, parse, example, clear), so as soon as the situation
 *     is a new one the `applied` state is gone and `blocked` shows alone and
 *     correctly.
 *  3. `idle` renders nothing.
 *
 * There is NO input on which two messages can arise — that is the whole point
 * of the function, and the suite asserts it over every combination.
 */
export function resolveApplyStatus(input: {
    canApply: boolean
    appliedCount: number | null
}): ScoutImportApplyStatus {
    if (input.appliedCount !== null) return { kind: "applied", count: input.appliedCount }
    if (!input.canApply) return { kind: "blocked" }
    return { kind: "idle" }
}

/* ==========================================================================
 * 10. The compact skip summary
 * ========================================================================== */

/**
 * The skipped lines, split into "counted" and "still worth reading".
 *
 * `listed` holds the lines that keep their verbatim entry; the four numbers are
 * the lines that were rolled up instead.
 */
export interface ScoutImportSkipSummary {
    aggregateRows: number
    matchupRows: number
    recommendedChampions: number
    pageNoise: number
    /** Lines that are still shown one by one because they carry a real claim. */
    listed: ScoutImportUnparsedLine[]
    /** true when anything at all was skipped. */
    hasSkipped: boolean
}

/**
 * The reasons that are COUNTED instead of listed.
 *
 * The dividing line is not "how many are there" but "does the line tell the
 * user anything they did not already know". These four are categories the
 * parser recognised *positively*: it knows what the line was and why it does
 * not belong in the champion pool. Printing `-` forty times over teaches
 * nobody anything — a raw OP.GG copy floods the block with dozens of `-`,
 * `vs` and "Alle Champions" entries and buries the handful of lines that
 * actually deserve a second look.
 *
 * NOT A MIRROR OF THE UNION, SO DO NOT SWAP IT FOR `SCOUT_IMPORT_UNPARSED_REASONS`:
 * this is a deliberate SUBSET of `ScoutImportUnparsedReason` — the counted
 * reasons, as opposed to the listed ones (`header`, `no_champion`,
 * `no_numbers`, `noise`). Replacing it with the runtime tuple would count every
 * reason and leave `listed` permanently empty, i.e. destroy the very
 * distinction this constant exists to make. A NEW reason therefore does not
 * belong here automatically: it is listed unless it is a category the parser
 * recognised positively.
 */
const COUNTED_SKIP_REASONS: readonly ScoutImportUnparsedReason[] = [
    "aggregate_row",
    "matchup_row",
    "recommended_champion",
    "page_noise",
]

/**
 * Roll the skipped lines up into four numbers plus a short list.
 *
 * WHAT STAYS IN `listed`: `header`, `no_champion`, `no_numbers` and `noise`.
 * Each of those means "something here looked like data and did not become
 * data" — the parser did NOT recognise what it was, so the user is the only
 * one who can judge whether a champion is hiding in it. Those get shown
 * verbatim, exactly as before.
 *
 * WHAT IS COUNTED: see {@link COUNTED_SKIP_REASONS}.
 *
 * FOR EVERY LAYOUT, not only for the raw OP.GG copy. The four counted reasons
 * are only ever produced where they make sense, so a tabular or loose-text
 * paste simply reports four zeroes and an unchanged list — no per-layout
 * branching, and no second definition of "skipped" that could drift from the
 * parser's.
 *
 * Rule (A) of the scout still holds: nothing disappears without a word. The
 * numbers ARE the word, and the panel offers the counted lines behind a
 * collapsed `<details>` for anyone who wants them anyway.
 *
 * Pure: no mutation, no reordering, and `listed` keeps parse order.
 */
export function summarizeSkippedLines(result: ScoutStatsImportResult): ScoutImportSkipSummary {
    const lines = result.unparsedLines
    return {
        aggregateRows: countUnparsedByReason(lines, "aggregate_row"),
        matchupRows: countUnparsedByReason(lines, "matchup_row"),
        recommendedChampions: countUnparsedByReason(lines, "recommended_champion"),
        pageNoise: countUnparsedByReason(lines, "page_noise"),
        listed: lines.filter((line) => COUNTED_SKIP_REASONS.indexOf(line.reason) === -1),
        hasSkipped: lines.length > 0,
    }
}

/*
 * NO `appliedRowCount()` HERE ANY MORE — AND DO NOT BRING IT BACK.
 *
 * The number of rows an apply took over is `ScoutImportApplyResult.importedRows`
 * and is computed by `applyImportRows()` itself. A helper that rebuilt it at the
 * call site as `selected.length - result.skipped` used to live at this spot; it
 * was only correct while the caller passed the EXACT SAME array it had handed to
 * `applyImportRows()`, and nothing could enforce that — a filtered, re-sorted or
 * re-derived selection produced a plausible-looking wrong number. A field on the
 * result cannot be called with the wrong array.
 *
 * Its historic warning ("Übernommen: 72 Zeilen.": `added + replaced` counted a
 * deletion as an import) is preserved in full on `ScoutImportApplyResult` in
 * src/scout/types.ts. Read it there before touching the counters.
 */
