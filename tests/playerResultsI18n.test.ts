/**
 * Guards for the Player Results i18n and locale pass (0.5.3 -> 0.5.4),
 * re-aimed at the app-wide layering of 0.5.5.
 *
 * WHAT CHANGED IN 0.5.5, and why one guard here had to move with it
 *
 * `src/i18n/format.ts` now owns app-wide number and date formatting, so
 * `formatWholeNumber` stopped calling `toLocaleString` itself and delegates to
 * `formatNumber(Math.round(value), lang)`. The rule this file enforces did not
 * change - components format nothing, a module resolves the locale through
 * `localeForLang()` - but it is no longer satisfiable by looking at one file.
 * The anti-vacuity counterweight therefore counts across BOTH modules that
 * format for this tab; its own doc comment says why lowering the old number to
 * 1 would have been the same as deleting it.
 *
 * The `EMPTY_CELL` policy deliberately did NOT move. src/i18n/format.ts prints
 * a broken number as "NaN" so somebody reports it; a table cell renders an em
 * dash instead. Locale downstairs, "no value" upstairs.
 *
 * WHAT WENT WRONG, and why a test file exists for it at all
 *
 * The tab formatted every number and every date through a hardcoded `"de-DE"`,
 * printed two sentences that were built in code (`` `Last ${n}` `` and
 * `` `${n} Match${n !== 1 ? "es" : ""}` ``), carried two column tooltips that
 * were English-only because they sat in a module-level constant where `t()`
 * does not exist yet, and shipped two DE catalogue entries that were literally
 * the English text ("Team Overview", "Needs Review"). To a user the symptom was
 * one thing: the language switch did not appear to work on this tab.
 *
 * None of that could go red before, because vitest runs in Node here
 * (vite.config.ts, `test.environment: 'node'`) with no jsdom: nothing in this
 * project can assert what a component renders. So this file does the two things
 * that ARE provable without a DOM - it checks the catalogues as data, and it
 * scans the sources as text.
 *
 * One rule looks forward rather than back. The champion table now maps fourteen
 * columns to their tooltip keys by hand, and `TranslationKey` only rejects a key
 * that does not EXIST - `playerResults_tipAvgKills` typed onto the `avgDeaths`
 * column compiles, renders, and lies to the user. Section 3 reads the pairs out
 * of the source and checks each one against its own column.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 *
 * Everything in sections 3 and 4 is a source-TEXT scan. It establishes that a
 * forbidden token is not written and that a required call site exists. It does
 * NOT establish that:
 *
 *  - anything is actually rendered. A `false && (...)`, an early `return null`
 *    or a prop that never arrives would still pass here,
 *  - the props flow. `lang` reaching `formatWholeNumber` is a compile-time
 *    question, not a scan question,
 *  - the visual result. Column order, wrapping, CSS and whether the German
 *    date reads well in a narrow cell stay manual checks,
 *  - that the DE copy is GOOD German. Section 2 catches English left standing
 *    in the German catalogue; it cannot review a translation.
 *
 * That honesty requirement is CLAUDE.md P4c, and the same caveat block sits at
 * the top of tests/scoutKdaVisibility.test.ts and tests/scoutUxDeclutter.test.ts.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE EVERY SOURCE SCAN
 *
 * `src/components/player-results/playerResultsFormat.ts` documents the rules
 * this file enforces by QUOTING the wrong code: its module header explains that
 * a `toLocaleDateString("de-DE", ...)` in a `.tsx` file is invisible to the test
 * suite, and the doc comment of PLAYER_RESULTS_MATCH_COUNT_KEYS spells out
 * `` `${n} Match${n !== 1 ? "es" : ""}` `` as the pattern it replaces. A raw
 * scan fails on exactly the prose that exists to prevent the bug, and the
 * obvious "fix" would be to delete that prose. An allowlist of files would be
 * worse still: it would exempt the file most likely to break the rule. So the
 * scans strip line and block comments first - the same decision, for the same
 * reason, as tests/scoutKdaVisibility.test.ts.
 */

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"

/* ==========================================================================
 * Reading the catalogues and the sources
 * ========================================================================== */

/**
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. Same two views, and the same
 * reason, as tests/i18nScoutCopy.test.ts.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const LANGS: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["de", DE],
    ["en", EN],
]

/** The prefix that marks a Player Results string. */
const PREFIX = "playerResults_"

const familyKeys = (dict: Record<string, string>): string[] =>
    Object.keys(dict).filter((key) => key.startsWith(PREFIX))

/** Trim a value for a failure label so a long sentence stays readable. */
const preview = (value: string): string =>
    value.length <= 120 ? value : `${value.slice(0, 120)}...`

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url))
const PANEL_DIR = `${SRC_DIR}components/player-results/`

/**
 * The five components the 0.5.4 pass rewrote. Used only to assert that the
 * directory scan really found them (section 5); every scan below walks the
 * directory itself, so a sixth component added later is covered automatically
 * rather than silently skipped.
 */
const COMPONENT_FILES = [
    "ChampionHighlightCards.tsx",
    "ChampionResultsTable.tsx",
    "MatchTable.tsx",
    "PlayerResultsPage.tsx",
    "RecentFormCards.tsx",
] as const

/** The one module in the directory allowed to touch `Intl` and `{count}`. */
const FORMAT_MODULE = "playerResultsFormat.ts"

/**
 * The app-wide formatter the number path delegates to since 0.5.5, relative to
 * `src/`. It lives OUTSIDE this directory, which is why it is named here rather
 * than found by the directory scan: `formatWholeNumber` is now
 * `formatNumber(Math.round(value), lang)`, and the `toLocaleString` it used to
 * make itself happens in there. A guard that only looked inside
 * src/components/player-results/ would have to conclude the tab stopped
 * formatting numbers at all.
 */
const APP_FORMAT_MODULE = "i18n/format.ts"

const panelFiles = (): string[] =>
    readdirSync(PANEL_DIR)
        .filter((entry) => /\.tsx?$/.test(entry))
        .sort()

const readPanel = (file: string): string => readFileSync(`${PANEL_DIR}${file}`, "utf8")

/** Any file under `src/`, by its path relative to it. */
const readSrc = (relative: string): string => readFileSync(`${SRC_DIR}${relative}`, "utf8")

/**
 * Strips line and block comments. See the module header for why this is not
 * optional. The `(?<!:)` keeps a `https://` inside a string literal from eating
 * the rest of its line; a single slash such as `"CS/min"` is untouched because
 * the pattern needs two.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

/** Every `.ts`/`.tsx` file in the panel directory, comments removed. */
const panelSources = (): ReadonlyArray<readonly [file: string, source: string]> =>
    panelFiles().map((file) => [file, stripComments(readPanel(file))] as const)

/* ==========================================================================
 * The predicates
 *
 * Every rule below is a pure function or a plain RegExp, declared once and used
 * BOTH by the real assertions and by the synthetic fixtures in section 5. That
 * is the whole anti-vacuity mechanism: a scan that quietly stops matching
 * anything would take the synthetic tests down with it.
 * ========================================================================== */

/**
 * A BCP-47 locale written out by hand. `de-DE` is the one that shipped, but the
 * mirror mistake (`en-US` pinned into a component) is the same defect, so the
 * pattern is shaped rather than enumerated.
 *
 * `localeForLang()` in src/i18n/locale.ts is the single place that turns a
 * `Lang` into one of these, and the format helpers are the only callers.
 */
const LOCALE_LITERAL = /\b[a-z]{2}-[A-Z]{2}\b/g

/** Any `Intl`-backed formatting call, with or without an argument. */
const LOCALE_CALL = /\.toLocale(?:String|DateString|TimeString)\s*\(/g

/** The same call with a string literal in first position, i.e. a pinned locale. */
const LOCALE_CALL_WITH_LITERAL = /\.toLocale(?:String|DateString|TimeString)\s*\(\s*["'`]/g

/**
 * The other way to format: `new Intl.DateTimeFormat(locale, …)`.
 *
 * `src/i18n/format.ts` builds its three date functions this way, so a guard
 * that only counted `toLocale*` calls would read that module as doing nothing.
 * Shaped rather than enumerated, for the same reason {@link LOCALE_LITERAL} is:
 * `NumberFormat`, `RelativeTimeFormat` and anything Intl grows later are the
 * same defect if the locale is pinned.
 */
const INTL_FORMATTER = /\bnew Intl\.[A-Za-z]+\s*\(/g

/** The same construction with a string literal in first position. */
const INTL_FORMATTER_WITH_LITERAL = /\bnew Intl\.[A-Za-z]+\s*\(\s*["'`]/g

/**
 * `n !== 1 ? "es" : ""` and `n === 1 ? "" : "s"`.
 *
 * Both branches have to be an empty string or a bare plural suffix, which is
 * what keeps this off an ordinary two-way ternary. CLAUDE.md "Numerus: nie per
 * Suffix basteln" is the rule; "1 neue Match gespeichert." is what it cost.
 */
const SUFFIX_PLURAL = /[!=]==\s*1\s*\?\s*(["'`])(?:e?s)?\1\s*:\s*(["'`])(?:e?s)?\2/g

/**
 * The broader shape: any `x === 1 ? <literal> : <literal>`. A hand-written
 * `count === 1 ? "Match" : "Matches"` avoids the suffix and still hardcodes both
 * forms in code, where no catalogue can reach them. Deliberately requires
 * quoted literals on BOTH sides, so `n === 1 ? t("a") : t("b")` - the correct
 * shape if a component ever needs the branch itself - does not trip it.
 */
const LITERAL_TERNARY_PLURAL = /[!=]==\s*1\s*\?\s*(["'])[^"']*\1\s*:\s*(["'])[^"']*\2/g

/**
 * A template literal that starts with prose and then interpolates:
 * `` `Last ${opt.label}` ``. That is a sentence assembled in code, which is the
 * thing `playerResults_lastN` exists to replace.
 *
 * The SPACE before `${` is what makes this safe. Without it the pattern would
 * also hit `` `translate${x}` ``-shaped class and style strings; with it, only
 * something that reads as words followed by a value matches. A leading digit
 * (`` `1px solid ${c}` ``) and any punctuation in the word run (`` `role-tab${…}` ``)
 * are excluded for the same reason.
 */
const PROSE_TEMPLATE = /`[A-Za-z]+(?: [A-Za-z]+)* \$\{/g

const matchesOf = (source: string, pattern: RegExp): string[] => {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
    return [...source.matchAll(re)].map((match) => match[0])
}

/**
 * Every locale-dependent formatting call in a source, whichever of the two APIs
 * it uses. `localeCompare` is not one of them: sorting is not display, and this
 * project has deliberately gone the other way there (src/scout/analysis.ts
 * avoids it outright so two users see the same order).
 */
const formattingCalls = (source: string): string[] => [
    ...matchesOf(source, LOCALE_CALL),
    ...matchesOf(source, INTL_FORMATTER),
]

/** Those of them that pin the locale in the source instead of resolving it. */
const pinnedLocaleCalls = (source: string): string[] => [
    ...matchesOf(source, LOCALE_CALL_WITH_LITERAL),
    ...matchesOf(source, INTL_FORMATTER_WITH_LITERAL),
]

/**
 * Does this module get its numbers formatted by the app-wide helper?
 *
 * This is the other half of "the number is still formatted somewhere": the
 * count of calls below proves src/i18n/format.ts formats, and this proves the
 * player-results number path actually leads there rather than to a private
 * reimplementation of the same one-liner.
 */
const importsAppNumberFormatter = (source: string): boolean =>
    /import\s*\{[^}]*\bformatNumber\b[^}]*\}\s*from\s*["'][^"']*i18n\/format["']/.test(source)

/* --------------------------------------------------------------------------
 * Visible copy: what a text scan can and cannot see
 * -------------------------------------------------------------------------- */

/**
 * A run of characters between a `>` or `}` and the next `<` or `{`, on ONE
 * line. That covers the three shapes a hardcoded label actually takes here:
 *
 *     <th style={thStyle}>Queue</th>          `>` … `<`
 *     {stat.wins}W {stat.losses}L             `}` … `{`
 *     <span …>{ratio} KDA · {games}G          `}` … `{`
 *
 * PER LINE on purpose. Allowing a run to span lines makes the char class jump
 * whole statements - `useState<SortKey>("games")` followed three lines later by
 * a `{` produced a "text node" of pure TypeScript in an early draft. The
 * multi-line text node that this misses is picked up by
 * {@link sandwichedTextOccurrences} instead.
 *
 * TWO EXCLUSIONS, both measured against the real files rather than guessed:
 *
 *  - a run whose last character is `=` is a JSX ATTRIBUTE NAME, never text:
 *    `<select value={queueFilter} onChange={…}` yields " onChange=".
 *  - a run opened by `}` that contains `= : ; ( )` is code, not text:
 *    `function Card({ stat }: CardProps) {` yields ": CardProps)". Runs opened
 *    by `>` keep the strict rule, because that is where a real text node lives.
 *    The price is a `}`-opened text node containing a colon or a bracket; it
 *    would be missed. A missed line is the harmless direction - it is visible
 *    on screen to anyone who opens the tab - while a false alarm on a
 *    destructured prop list would teach that the guard is the thing in the way.
 */
const textRunOccurrences = (source: string): string[] => {
    const CODEISH = /[=:;()]/
    /** `} else {` is the one keyword sandwich that survives the rules above. */
    const JS_KEYWORD_RUNS = new Set(["else", "catch", "finally", "do", "try"])
    const found: string[] = []

    source.split("\n").forEach((line) => {
        const re = /([>}])([^<>{}]*)[<{]/g
        let match = re.exec(line)
        while (match !== null) {
            re.lastIndex = match.index + 1 // overlapping runs, e.g. `}A{B}C{`
            const [, opener, raw] = match
            const run = raw.trim()
            const codeish = opener === "}" && CODEISH.test(run)
            if (run && !run.endsWith("=") && !codeish && !JS_KEYWORD_RUNS.has(run)) {
                found.push(run)
            }
            match = re.exec(line)
        }
    })
    return found
}

/**
 * A text node written on its own line:
 *
 *     <span
 *         className="muted"
 *     >
 *         Recent form
 *     </span>
 *
 * The sandwich is the whole test - the previous non-blank line has to END with
 * `>` and the next has to START with `</`. An import list fails the first
 * condition (its predecessor ends with `{`), and any line holding an expression
 * fails on its own braces.
 */
const sandwichedTextOccurrences = (source: string): string[] => {
    const lines = source.split("\n")
    const neighbour = (from: number, step: number): string => {
        for (let i = from; i >= 0 && i < lines.length; i += step) {
            if (lines[i].trim()) return lines[i].trim()
        }
        return ""
    }

    return lines.filter((line, index) => {
        const text = line.trim()
        if (!text || /[<>{}]/.test(text) || !/[A-Za-z]/.test(text)) return false
        return neighbour(index - 1, -1).endsWith(">") && neighbour(index + 1, 1).startsWith("</")
    }).map((line) => line.trim())
}

/**
 * String literals handed to an attribute that the user reads.
 *
 * `label` is in the list although it is not a DOM attribute: in this directory
 * it is the prop of the local `StatItem` in RecentFormCards, and it is rendered
 * verbatim. `title` is here because the champion table's column tooltips were
 * the English-only strings this whole change is about - they now pass a
 * `TranslationKey` through `t()`, which is an expression and therefore invisible
 * to this scan, exactly as intended.
 */
const attributeOccurrences = (source: string): string[] => {
    const re = /\b(?:title|placeholder|aria-label|alt|label)\s*=\s*(["'])([^"']*)\1/g
    return [...source.matchAll(re)].map((match) => match[2].trim()).filter((value) => value.length > 0)
}

const visibleOccurrences = (source: string): string[] => [
    ...textRunOccurrences(source),
    ...sandwichedTextOccurrences(source),
    ...attributeOccurrences(source),
]

/** The words of an occurrence that carry an ASCII letter, i.e. could be copy. */
const wordTokens = (occurrence: string): string[] =>
    occurrence.split(/\s+/).filter((token) => /[A-Za-z]/.test(token))

/**
 * The tokens that legitimately stay hardcoded, each with the reason it does.
 *
 * This is spec section 6 of the change, and the reasoning behind all of it is
 * one sentence: these are League stat tokens that a German player reads exactly
 * as written. There is no German word for "KDA", the client itself prints
 * "SoloQ", and a translated "Vision" column would invent a term nobody uses at
 * a scrim. The meaning is carried by the tooltips instead, which ARE translated
 * (`playerResults_tipGames` and friends).
 *
 * Four entries carry no ASCII letter and are therefore never produced by
 * {@link wordTokens}. They are listed anyway, because the rot check below then
 * pins that they are still in the sources - which is the only thing that would
 * notice the `—` empty cell or the sort glyphs quietly disappearing.
 */
const HARDCODED_TOKENS: ReadonlyArray<readonly [token: string, why: string]> = [
    ["Champion", "column head; German LoL usage says 'Champion', not 'Held'"],
    ["Queue", "the client's own word for a matchmaking pool, used untranslated in German"],
    ["SoloQ", "Riot's queue label, printed exactly like this in the League client"],
    ["FlexQ", "the second ranked queue label, same source"],
    ["KDA", "universal acronym; it has no German expansion"],
    ["CS", "creep score; the acronym is the only form in use"],
    ["CS/min", "per-minute form of the same acronym"],
    ["Dmg", "damage column head, abbreviated on the German scoreboard too"],
    ["Dmg/min", "per-minute form of the same abbreviation"],
    ["Gold", "the in-game currency, spelled identically in German"],
    ["Gold/min", "per-minute form"],
    ["Vision", "vision score column head; the German client keeps the English word"],
    ["Win%", "win rate column head; the tooltip playerResults_tipWinRate carries the meaning"],
    ["W/L", "wins/losses label on the form card"],
    ["G", "games column head; single letter, meaning in playerResults_tipGames"],
    ["W", "wins column head, and the win pill letter that calculateRecentForm() returns"],
    ["L", "losses column head, and the loss pill letter from the same data contract"],
    ["K", "average kills column head; meaning in playerResults_tipAvgKills"],
    ["D", "average deaths column head; meaning in playerResults_tipAvgDeaths"],
    ["A", "average assists column head; meaning in playerResults_tipAvgAssists"],
    ["—", "EMPTY_CELL, the 'no value' placeholder CLAUDE.md P4a keeps on purpose"],
    ["▲", "sort and expand glyph, decorative"],
    ["▼", "the other half of the same glyph pair"],
    ["↳", "the teammate row indent glyph, decorative"],
]

const ALLOWED_TOKENS = new Set(HARDCODED_TOKENS.map(([token]) => token))

/** Contents of every string and simple template literal, plus their words. */
const literalTokens = (source: string): string[] => {
    const re = /"([^"\n]*)"|'([^'\n]*)'|`([^`$\n]*)`/g
    const found: string[] = []
    for (const match of source.matchAll(re)) {
        const value = (match[1] ?? match[2] ?? match[3] ?? "").trim()
        if (!value) continue
        found.push(value, ...value.split(/\s+/).filter((token) => token.length > 0))
    }
    return found
}

/**
 * Everything the directory could plausibly print, as tokens. Wider than the
 * violation scan on purpose: it is the ROT check's universe, and an entry such
 * as `Win%` reaches the screen through a prop rather than through a text node.
 */
const visibleTokenUniverse = (): Set<string> => {
    const universe = new Set<string>()
    for (const [, source] of panelSources()) {
        for (const occurrence of visibleOccurrences(source)) {
            universe.add(occurrence)
            for (const token of occurrence.split(/\s+/)) if (token) universe.add(token)
        }
        for (const token of literalTokens(source)) universe.add(token)
    }
    return universe
}

/* --------------------------------------------------------------------------
 * The champion table's hand-written column -> tooltip map
 * -------------------------------------------------------------------------- */

/** The file that holds the COLUMNS constant. */
const CHAMPION_TABLE = "ChampionResultsTable.tsx"

/**
 * The fourteen `{ key, label, titleKey }` entries of `COLUMNS`, read out of the
 * source rather than copied into this file. Copying them here would duplicate
 * the very list that can be wrong, and the copy would agree with the mistake.
 *
 * One entry per line is this file's format, and the parse leans on it. If that
 * ever changes the entry count assertion goes red rather than the pairs
 * quietly coming back empty - which is the direction that matters.
 */
const parseColumnTooltipPairs = (
    source: string,
): ReadonlyArray<{ key: string; titleKey: string | null }> => {
    const start = source.indexOf("const COLUMNS")
    if (start === -1) return []
    const open = source.indexOf("[", start)
    const close = source.indexOf("\n]", open)
    if (open === -1 || close === -1) return []

    return source
        .slice(open, close)
        .split("\n")
        .map((line) => {
            const key = /\bkey:\s*"(\w+)"/.exec(line)
            if (!key) return null
            const titleKey = /\btitleKey:\s*"(\w+)"/.exec(line)
            return { key: key[1], titleKey: titleKey ? titleKey[1] : null }
        })
        .filter((entry): entry is { key: string; titleKey: string | null } => entry !== null)
}

/**
 * The tooltip key a column MUST carry: `avgKills` -> `playerResults_tipAvgKills`.
 *
 * `TranslationKey` already turns a non-existent key into a compile error. What
 * it cannot see is a key that exists but belongs to another column - a
 * `playerResults_tipAvgKills` sitting on the `avgDeaths` row compiles, renders,
 * and tells the user the wrong thing. Fourteen hand-typed pairs is exactly
 * where that happens, and with no jsdom nothing else in this repo would notice.
 */
const expectedTooltipKey = (columnKey: string): string =>
    `${PREFIX}tip${columnKey.charAt(0).toUpperCase()}${columnKey.slice(1)}`

/* --------------------------------------------------------------------------
 * The teammate toggle's two accessible names (0.6.3)
 * -------------------------------------------------------------------------- */

/** The file that renders the expand button. */
const TEAMMATE_TOGGLE_FILE = "MatchTable.tsx"

/**
 * The pair 0.6.3 added, in the order the button reads them: the collapsed
 * button offers to SHOW, the expanded one offers to HIDE.
 *
 * They are the button's `aria-label`, and the button's own content is the glyph
 * `▼`/`▲`. `aria-label` overrides that content outright, so these two strings
 * are the ONLY thing a screen reader announces here - there is no visible text
 * underneath them to fall back on, which is what makes a half-wired pair worse
 * than a missing one.
 */
const TEAMMATE_TOGGLE_KEYS = [
    "playerResults_showTeammates",
    "playerResults_hideTeammates",
] as const

/**
 * The contents of every `aria-label={…}` expression in a source.
 *
 * `[^{}]*` refuses a nested brace on purpose. An accessible name assembled from
 * an object literal or a nested template is not a shape this rule claims to
 * understand, and coming back empty makes {@link namesBothStates} report it
 * rather than guessing at it.
 */
const ariaLabelExpressions = (source: string): string[] =>
    [...source.matchAll(/aria-label=\{([^{}]*)\}/g)].map((match) =>
        match[1].replace(/\s+/g, " ").trim(),
    )

/**
 * Does one accessible name follow the open/closed state?
 *
 * The requirement is BOTH keys inside ONE ternary. Each half of that is a real
 * defect this project could ship and tsc could not see:
 *
 *  - the same key on both branches, or a single key with no ternary, leaves the
 *    button announcing "Mitspieler anzeigen" while the teammate rows are
 *    already on screen,
 *  - one key plus a string literal puts half the name outside every catalogue,
 *    so the language switch moves one state and not the other.
 *
 * `TranslationKey` rejects a key that does not exist; it has nothing to say
 * about a key used twice. With no jsdom nothing in this repo can read the
 * rendered attribute, so the source is where this gets checked.
 */
const namesBothStates = (expression: string): boolean =>
    expression.includes("?") &&
    expression.includes(":") &&
    TEAMMATE_TOGGLE_KEYS.every((key) => expression.includes(key))

/* --------------------------------------------------------------------------
 * Telling the two languages apart
 * -------------------------------------------------------------------------- */

/**
 * Words that belong to English and cannot appear in correct German UI copy.
 *
 * Measured against every German value in the family before this list was
 * fixed, which is why several obvious candidates are NOT here: "match",
 * "matches", "team", "player", "results", "champion", "queue", "gold",
 * "minute", "form", "kills", "assists", "solo" and "flex" all appear in the
 * German catalogue legitimately ("Keine Matches gefunden.", "Wähle ein Team im
 * Team Dashboard aus, um Player Results zu sehen.", "Spiele in der
 * Solo-Queue"). Listing them here would flag correct German.
 *
 * The two entries that matter most are `overview` and `review`: they are what
 * "Team Overview" and "Needs Review" - the two English strings that sat in
 * de.ts until 0.5.4 - are made of.
 *
 * `show`, `hide` and `teammates` arrived with the 0.6.3 pair and are ACCUSING
 * markers on purpose, not COMPARISON_ONLY_MARKERS ones. The failure message of
 * section 2c suggests the latter, and for a homograph that is right - but these
 * three are not homographs. Every German value in both catalogues was checked
 * before they were added and not one contains any of them, while "Show
 * teammates" sitting in de.ts is the 0.5.4 bug verbatim. A word that can only
 * be English belongs where it can say so.
 */
const ENGLISH_MARKERS = [
    "the", "to", "of", "and", "or", "is", "are", "be", "this", "that", "with",
    "from", "not", "no", "all", "above", "yet", "click", "select", "view",
    "overview", "average", "per", "win", "wins", "loss", "losses", "game",
    "games", "best", "needs", "review", "statistics", "history", "duration",
    "date", "found", "saved", "recent", "last", "deaths", "damage", "divided",
    "show", "hide", "teammates",
] as const

/**
 * Words that belong to German and cannot appear in correct English UI copy.
 * The umlaut class below carries most of the weight; these cover the German
 * words that happen to be spelled without one.
 */
const GERMAN_MARKERS = [
    "und", "oder", "nicht", "keine", "kein", "durch", "geteilt", "Schnitt",
    "gefunden", "gespeichert", "Spiele", "Spieler", "Siege", "Sieg", "Siegrate",
    "Niederlage", "Niederlagen", "Ergebnis", "Dauer", "Datum", "Daten",
    "Klicke", "Letzte", "Aktuelle", "Mitspieler", "Beste", "Überprüfen",
    "Statistiken", "Verlauf", "Ansicht", "Tode", "Schaden", "pro",
] as const

/** ä ö ü ß in either case. Present in German copy, never in English copy. */
const GERMAN_LETTERS = /[äöüßÄÖÜ]/

/**
 * Extra words used ONLY to decide whether a key is worth comparing (section
 * 2c), never to accuse a value of being in the wrong language. They are the
 * German/English homographs deliberately kept out of {@link ENGLISH_MARKERS};
 * including them here means every key in the family gets compared instead of
 * 35 of 40.
 */
const COMPARISON_ONLY_MARKERS = [
    "match", "matches", "champion", "champions", "queue", "queues", "team",
    "teammate", "player", "players", "result", "results", "gold", "minute",
    "form", "solo", "flex", "kills", "assists", "data", "rate", "winrate",
    "ranked",
] as const

/**
 * Placeholders are removed first: `{count}` would otherwise make "count" look
 * like a word of the sentence.
 */
const markerHits = (value: string, markers: readonly string[]): string[] =>
    markers.filter((marker) => new RegExp(`\\b${marker}\\b`, "i").test(value.replace(/\{\w+\}/g, " ")))

/**
 * Keys whose two values may be the same sentence in both languages.
 *
 * MEASURED, not assumed: of the 40 keys in the family, exactly three are equal
 * once case is ignored, and all three are correct as they stand.
 *
 * Nothing else is on this list, and the rot check below refuses an entry that
 * has stopped being identical. That is what keeps it from growing into the
 * loophole that swallows the rule. Two candidates were checked and rejected:
 * `playerResults_teamOverview` and `playerResults_needsReview` LOOK like
 * loanword cases, and they are exactly the two values that shipped as English
 * in de.ts. They read "Team-Übersicht" and "Zum Überprüfen" now, and an
 * exemption for either would have re-legalised the bug.
 */
const SAME_IN_BOTH_LANGUAGES: ReadonlyArray<readonly [key: string, why: string]> = [
    [
        "playerResults_matchCountOne",
        // German capitalises the noun, English does not, and "Match" IS the
        // German word here - the plural a German player says is "Matches", not
        // "Spiele", and the rest of this tab already prints it that way. There
        // is nothing to translate, so the two values differ by one capital
        // letter and nothing else.
        "'Match' is the German word too; only the noun's capital letter differs",
    ],
    [
        "playerResults_matchCountMany",
        "same sentence in the plural, same reason",
    ],
    [
        "playerResults_tipWinRate",
        // Byte-identical, not merely recapitalised. "Winrate" is what players
        // of both languages say, and the rest of the catalogue already spells
        // it that way; "Siegrate" and "Win rate" were the outliers.
        "'Winrate' is the term in both languages, and the catalogue's usual spelling",
    ],
]

const SAME_IN_BOTH_KEYS = new Set(SAME_IN_BOTH_LANGUAGES.map(([key]) => key))

const sameSentence = (a: string, b: string): boolean =>
    a.trim().toLowerCase() === b.trim().toLowerCase()

/* --------------------------------------------------------------------------
 * Placeholders
 * -------------------------------------------------------------------------- */

/** Mirrors the runtime substitution (`/\{(\w+)\}/g`): `{a b}` is not one. */
const PLACEHOLDER_PATTERN = /\{\w+\}/g

const placeholdersOf = (value: string): string[] =>
    [...new Set(value.match(PLACEHOLDER_PATTERN) ?? [])].sort()

/**
 * The only placeholder the family uses, and the only three keys allowed to
 * carry it. A typo (`{cout}`) fails the first assertion because it is not
 * `{count}`; a `{count}` that appears on a fourth key fails the second, because
 * nothing would fill it there and the hole would ship.
 */
const COUNT_KEYS = [
    "playerResults_lastN",
    "playerResults_matchCountOne",
    "playerResults_matchCountMany",
] as const

/* ==========================================================================
 * 1. The catalogues, as data
 * ========================================================================== */

describe("playerResults_ catalogue parity", () => {
    it("DE and EN expose exactly the same playerResults_ keys", () => {
        const deKeys = familyKeys(DE)
        const enKeys = familyKeys(EN)

        const onlyInDe = deKeys.filter((key) => !(key in EN))
        const onlyInEn = enKeys.filter((key) => !(key in DE))

        expect(onlyInDe, `in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
        expect(enKeys.length, "both catalogues must hold the same playerResults_ keys").toBe(
            deKeys.length,
        )
    })

    it("found a plausible number of playerResults_ keys", () => {
        // Anti-vacuity: a renamed prefix would make every loop in this file run
        // over nothing and the whole file would pass in silence.
        expect(familyKeys(DE).length, "no playerResults_ keys found at all").toBeGreaterThan(20)
    })

    it("every key uses the same {placeholders} in DE and EN", () => {
        for (const key of familyKeys(DE)) {
            if (!(key in EN)) continue // reported by the parity test instead

            const dePlaceholders = placeholdersOf(DE[key])
            const enPlaceholders = placeholdersOf(EN[key])

            expect(
                enPlaceholders,
                `${key}: placeholders differ - de=[${dePlaceholders.join(", ")}] ` +
                    `en=[${enPlaceholders.join(", ")}]`,
            ).toEqual(dePlaceholders)
        }
    })

    it("uses no placeholder other than {count}, and only on the three count keys", () => {
        const offenders: string[] = []

        for (const [lang, dict] of LANGS) {
            for (const key of familyKeys(dict)) {
                for (const placeholder of placeholdersOf(dict[key])) {
                    if (placeholder !== "{count}") {
                        offenders.push(`${lang}.${key} uses ${placeholder}`)
                        continue
                    }
                    if (!(COUNT_KEYS as readonly string[]).includes(key)) {
                        offenders.push(`${lang}.${key} carries {count} but is not a count key`)
                    }
                }
            }
        }

        expect(
            offenders,
            `unexpected placeholders:\n${offenders.join("\n")}\n` +
                "Every placeholder in this family is filled by formatLastNLabel() or by " +
                "pluralMessage() with PLAYER_RESULTS_MATCH_COUNT_KEYS, and both fill {count}. " +
                "A different name - a typo such as {cout} included - is never substituted and " +
                "ships to the screen as a hole in the sentence.",
        ).toEqual([])
    })

    it("carries {count} on all three count keys, singular included", () => {
        // The singular needs it as much as the plural: without it the DE/EN
        // placeholder parity above would go red the moment one language spells
        // out "1". CLAUDE.md, "Numerus: nie per Suffix basteln".
        for (const [lang, dict] of LANGS) {
            for (const key of COUNT_KEYS) {
                expect(dict[key], `${lang}.ts no longer holds ${key}`).toBeTypeOf("string")
                expect(
                    placeholdersOf(dict[key] ?? ""),
                    `${lang}.${key} lost its {count}: "${preview(dict[key] ?? "")}"`,
                ).toEqual(["{count}"])
            }
        }
    })

    it("no value is empty or blank", () => {
        // The whitespace rule below cannot see this: `expect("").toBe("".trim())`
        // passes, and so does a value of three spaces once it is compared with
        // its own trim. An empty aria-label is the worst version of it - the
        // button keeps overriding its glyph and announces nothing at all.
        for (const [lang, dict] of LANGS) {
            for (const key of familyKeys(dict)) {
                expect(dict[key], `${lang}.${key} is not a string`).toBeTypeOf("string")
                expect(
                    (dict[key] ?? "").trim().length,
                    `${lang}.${key} is empty or whitespace only`,
                ).toBeGreaterThan(0)
            }
        }
    })

    it("no value has stray leading, trailing or doubled whitespace", () => {
        for (const [lang, dict] of LANGS) {
            for (const key of familyKeys(dict)) {
                const value = dict[key]
                expect(
                    value,
                    `${lang}.${key} has leading or trailing whitespace: "${preview(value)}"`,
                ).toBe(value.trim())
                expect(
                    value,
                    `${lang}.${key} contains a doubled space: "${preview(value)}"`,
                ).not.toMatch(/ {2}/)
            }
        }
    })
})

/* ==========================================================================
 * 2. No key left behind, and no language left in the wrong catalogue
 * ========================================================================== */

describe("no dead playerResults_ keys", () => {
    const entries = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.(ts|tsx)$/.test(entry) && !entry.startsWith("i18n/"))
    const text = entries.map((file) => readFileSync(`${SRC_DIR}${file}`, "utf8")).join("\n")

    it("scanned a plausible source tree", () => {
        // Without this the assertion below is vacuous in the silent direction: a
        // mis-globbed scan reads the whole repo and makes every key look alive.
        expect(entries.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no playerResults_noData reference").toContain(
            "playerResults_noData",
        )
    })

    it("builds no playerResults_ key from a template literal", () => {
        // The scout family is assembled as `scout_reason_${code}`, which forces
        // its dead-key check to accept whole prefixes. This family is not, so
        // the check below can be exact - and it should stay that way.
        expect(
            text.match(/playerResults_[a-zA-Z0-9_]*(?=\$\{)/g) ?? [],
            "a playerResults_${…} template would make the dead-key check accept a whole family " +
                "at once. If one is introduced on purpose, rework the check rather than delete it.",
        ).toEqual([])
    })

    it("every playerResults_ key is referenced from src/ outside the catalogues", () => {
        const unreferenced = familyKeys(DE).filter((key) => !text.includes(key))

        expect(
            unreferenced,
            `these playerResults_ keys are in the catalogues but nowhere in src/:\n` +
                `${unreferenced.join("\n")}\n` +
                "Delete them from de.ts and en.ts. A dead key is a promise the app does not " +
                "keep - playerResults_view was exactly that until 0.5.4.",
        ).toEqual([])
    })
})

describe("playerResults_ copy is in the language of its catalogue", () => {
    /**
     * The direct form of the bug that shipped: de.ts held "Team Overview" and
     * "Needs Review" verbatim, so the German build showed English no matter
     * what the language switch said.
     */
    it("de.ts holds no English-only word", () => {
        const offenders: string[] = []
        for (const key of familyKeys(DE)) {
            const hits = markerHits(DE[key], ENGLISH_MARKERS)
            if (hits.length > 0) offenders.push(`${key} [${hits.join(", ")}]: "${preview(DE[key])}"`)
        }

        expect(
            offenders,
            `English left standing in the German catalogue:\n${offenders.join("\n")}\n` +
                "Translate the value. If the word is genuinely German usage too (the way " +
                "'Match', 'Team' and 'Champion' are), drop it from ENGLISH_MARKERS with a " +
                "reason instead of bending the copy around the test.",
        ).toEqual([])
    })

    it("en.ts holds no German-only word and no umlaut", () => {
        const offenders: string[] = []
        for (const key of familyKeys(EN)) {
            const value = EN[key]
            const hits = markerHits(value, GERMAN_MARKERS)
            if (GERMAN_LETTERS.test(value)) hits.push("umlaut")
            if (hits.length > 0) offenders.push(`${key} [${hits.join(", ")}]: "${preview(value)}"`)
        }

        expect(
            offenders,
            `German left standing in the English catalogue:\n${offenders.join("\n")}\n` +
                "The mirror image of the de.ts rule above, and just as invisible to tsc.",
        ).toEqual([])
    })

    /**
     * The backstop for a value that is untranslated but happens to use none of
     * the marker words. Comparing case-insensitively is deliberate: a DE value
     * that is the EN one with different capitalisation is still untranslated.
     */
    it("DE and EN differ for every key that says something in English", () => {
        const markers = [...ENGLISH_MARKERS, ...COMPARISON_ONLY_MARKERS]
        const offenders: string[] = []
        let compared = 0

        for (const key of familyKeys(EN)) {
            if (markerHits(EN[key], markers).length === 0) continue
            compared += 1
            if (SAME_IN_BOTH_KEYS.has(key)) continue
            if (sameSentence(DE[key] ?? "", EN[key])) {
                offenders.push(`${key}: both catalogues say "${preview(EN[key])}"`)
            }
        }

        expect(
            compared,
            `only ${compared} of ${familyKeys(EN).length} keys were compared.\n` +
                "A key the marker lists do not recognise is never compared, and that gap is the " +
                "one way an untranslated value still slips past. Add a word of the new value to " +
                "COMPARISON_ONLY_MARKERS (it only decides WHICH keys get compared; it never " +
                "accuses a value of being in the wrong language).",
        ).toBeGreaterThanOrEqual(familyKeys(EN).length)
        expect(
            offenders,
            `untranslated values:\n${offenders.join("\n")}\n` +
                "Translate the German one. Only add a key to SAME_IN_BOTH_LANGUAGES if the " +
                "sentence really is identical in both languages, and say why.",
        ).toEqual([])
    })

    it("both marker lists still match something in their own language", () => {
        // A marker list that has stopped matching anything is a rule that has
        // quietly stopped existing. Both directions above depend on it.
        const englishHits = familyKeys(EN).filter(
            (key) => markerHits(EN[key], ENGLISH_MARKERS).length > 0,
        )
        const germanHits = familyKeys(DE).filter(
            (key) => markerHits(DE[key], GERMAN_MARKERS).length > 0 || GERMAN_LETTERS.test(DE[key]),
        )

        expect(
            englishHits.length,
            "no English value matches ENGLISH_MARKERS - the de.ts rule cannot fire either",
        ).toBeGreaterThan(20)
        expect(
            germanHits.length,
            "no German value matches GERMAN_MARKERS - the en.ts rule cannot fire either",
        ).toBeGreaterThan(20)
    })

    it("every SAME_IN_BOTH_LANGUAGES entry still exists and is still identical", () => {
        for (const [key, why] of SAME_IN_BOTH_LANGUAGES) {
            expect(DE[key], `SAME_IN_BOTH_LANGUAGES lists ${key}, which is not a key`).toBeTypeOf(
                "string",
            )
            expect(EN[key], `SAME_IN_BOTH_LANGUAGES lists ${key}, which is not a key`).toBeTypeOf(
                "string",
            )
            expect(
                sameSentence(DE[key] ?? "", EN[key] ?? ""),
                `${key} (${why}) now differs between the catalogues, so it no longer needs the ` +
                    "exemption - drop it from SAME_IN_BOTH_LANGUAGES.",
            ).toBe(true)
        }
    })
})

/* ==========================================================================
 * 3. The source scans over src/components/player-results/**
 * ========================================================================== */

describe("player-results sources never pin a locale", () => {
    for (const [file, source] of panelSources()) {
        it(`${file}: writes no hardcoded BCP-47 locale`, () => {
            expect(
                matchesOf(source, LOCALE_LITERAL),
                `${file} contains a hardcoded locale.\n` +
                    "Locale selection belongs to localeForLang(lang) in src/i18n/locale.ts, and " +
                    "the only callers are the helpers in playerResultsFormat.ts. A literal here " +
                    "is the 0.5.3 bug verbatim: the English build formatted German dates.",
            ).toEqual([])
        })
    }
})

/**
 * The two modules that are allowed to resolve a locale for this tab, and what
 * each one owns since 0.5.5. Both are read through the same predicates, so
 * neither can go blind without the assertions below noticing.
 */
const FORMATTING_MODULES: ReadonlyArray<
    readonly [label: string, read: () => string, owns: string]
> = [
    [
        FORMAT_MODULE,
        () => stripComments(readPanel(FORMAT_MODULE)),
        "formatMatchDate, whose 2-digit year no function in src/i18n/format.ts offers",
    ],
    [
        `src/${APP_FORMAT_MODULE}`,
        () => stripComments(readSrc(APP_FORMAT_MODULE)),
        "formatNumber, which formatWholeNumber delegates the thousands separator to",
    ],
]

describe("player-results formats only through the locale-resolving modules", () => {
    for (const [file, source] of panelSources()) {
        if (file === FORMAT_MODULE) continue

        it(`${file}: makes no toLocale* call and touches no Intl`, () => {
            expect(
                matchesOf(source, LOCALE_CALL),
                `${file} formats a number or a date itself.\n` +
                    "Route it through formatWholeNumber / formatMatchDate / formatRatio in " +
                    "playerResultsFormat.ts. A call in a .tsx file is untestable here - vitest " +
                    "runs in Node with no jsdom - which is how the hardcoded 'de-DE' survived.",
            ).toEqual([])
            expect(
                source.includes("Intl."),
                `${file} reaches for Intl directly, same reason as above.`,
            ).toBe(false)
        })
    }

    /**
     * THE ANTI-VACUITY GUARD, and why it now names two files.
     *
     * The rule above - "no component formats anything" - is also satisfied by
     * nobody formatting anything ANYWHERE: delete the helpers and every file
     * goes green. Until 0.5.5 the counterweight was "playerResultsFormat.ts
     * makes at least two toLocale* calls", one for the number and one for the
     * date. Then `formatWholeNumber` became `formatNumber(Math.round(v), lang)`
     * and that count dropped to one - not because the tab stopped formatting,
     * but because the number's `toLocaleString(localeForLang(lang))` moved into
     * src/i18n/format.ts, which is the whole point of that module.
     *
     * Lowering the number to 1 would have thrown the guard away: with a single
     * call required, deleting `formatWholeNumber` outright would still pass.
     * So the count follows the code instead. The honest claim is unchanged in
     * substance - the components format nothing, and the two things this tab
     * prints through a locale are still formatted, in a module that resolves
     * that locale through localeForLang() - it now just spans two files.
     */
    it("the two modules that format for this tab still format, through localeForLang", () => {
        let total = 0

        for (const [label, read, owns] of FORMATTING_MODULES) {
            const source = read()
            const calls = formattingCalls(source)

            expect(
                calls.length,
                `${label} makes no toLocale* call and builds no Intl formatter any more, so it ` +
                    `no longer carries ${owns}. "Only these modules format" then guards nothing: ` +
                    "every component passes the rule above by formatting nothing at all.",
            ).toBeGreaterThanOrEqual(1)
            expect(
                source,
                `${label} no longer imports localeForLang, so whatever it formats no longer ` +
                    "follows the language switch. That is the 0.5.3 bug: a locale decided " +
                    "anywhere other than src/i18n/locale.ts.",
            ).toContain("localeForLang")

            total += calls.length
        }

        expect(
            total,
            "between them these modules format fewer than two things. This tab prints a " +
                "grouped NUMBER and a match DATE through a locale; both call sites have to " +
                "exist somewhere, or the components are clean only because the tab is empty.\n" +
                "The loop above cannot see this by itself: drop an entry from " +
                "FORMATTING_MODULES - the obvious 'tidy-up' once a formatter moves out of this " +
                "directory again - and every remaining module still passes. Only the total " +
                "notices that one of the two things stopped being guarded.",
        ).toBeGreaterThanOrEqual(2)
    })

    it(`${FORMAT_MODULE} routes its numbers to the app-wide formatter`, () => {
        // The other direction of the same claim. The count above proves
        // src/i18n/format.ts formats; this proves the number path in here
        // actually reaches it, instead of quietly growing a second copy of
        // `value.toLocaleString(localeForLang(lang))` - which is exactly the
        // duplication 0.5.5 removed.
        const source = stripComments(readPanel(FORMAT_MODULE))

        expect(
            importsAppNumberFormatter(source),
            `${FORMAT_MODULE} no longer imports formatNumber from src/i18n/format.ts. One app, ` +
                "one place that turns a number into a localized string.",
        ).toBe(true)
        expect(
            source,
            `${FORMAT_MODULE} imports formatNumber but never calls it`,
        ).toMatch(/formatNumber\(/)
    })

    it("neither formatting module hands a string literal to a formatter", () => {
        for (const [label, read] of FORMATTING_MODULES) {
            expect(
                pinnedLocaleCalls(read()),
                `${label} pins a locale in the source. The argument has to be ` +
                    "localeForLang(lang) so the app language decides, in both APIs: " +
                    'toLocale*("de-DE") and new Intl.DateTimeFormat("de-DE", …) are the ' +
                    "same defect.",
            ).toEqual([])
        }
    })
})

describe("player-results sources build no plural by suffix", () => {
    for (const [file, source] of panelSources()) {
        it(`${file}: appends no plural suffix and hardcodes no plural pair`, () => {
            expect(
                matchesOf(source, SUFFIX_PLURAL),
                `${file} builds a plural with a suffix.\n` +
                    "CLAUDE.md, 'Numerus: nie per Suffix basteln': a suffix pluralises the noun " +
                    "and nothing else, which is how '1 neue Match gespeichert.' shipped. Use two " +
                    "keys plus pluralMessage(t, n, PLAYER_RESULTS_MATCH_COUNT_KEYS).",
            ).toEqual([])
            expect(
                matchesOf(source, LITERAL_TERNARY_PLURAL),
                `${file} picks between two hardcoded strings on a count.\n` +
                    "Same rule: the two forms belong in de.ts and en.ts as a *One/*Many pair, " +
                    "not in a ternary no catalogue can reach.",
            ).toEqual([])
        })
    }
})

describe("player-results sources leave visible copy to the catalogues", () => {
    for (const [file, source] of panelSources()) {
        it(`${file}: renders no hardcoded sentence`, () => {
            const offenders: string[] = []

            for (const occurrence of visibleOccurrences(source)) {
                const unexpected = wordTokens(occurrence).filter(
                    (token) => !ALLOWED_TOKENS.has(token),
                )
                if (unexpected.length > 0) {
                    offenders.push(`"${occurrence}" -> ${unexpected.join(", ")}`)
                }
            }

            expect(
                offenders,
                `${file} prints text that no catalogue owns:\n${offenders.join("\n")}\n` +
                    "Move it to a playerResults_ key and render it through t(). If it is a " +
                    "League stat token that reads the same in German, add it to " +
                    "HARDCODED_TOKENS with the reason.",
            ).toEqual([])
        })

        it(`${file}: assembles no sentence in a template literal`, () => {
            expect(
                matchesOf(source, PROSE_TEMPLATE),
                `${file} builds a sentence out of words and a value.\n` +
                    "That is what playerResults_lastN and formatLastNLabel(t, n) replaced - " +
                    "`Last ${n}` has no German form and none could be added.",
            ).toEqual([])
        })
    }

    /**
     * The rot check. An allowlist entry whose token has left the sources
     * exempts nothing and hides the next one that arrives, which is how a list
     * like this stops meaning anything.
     */
    it("every hardcoded token on the allowlist is still in the sources", () => {
        const universe = visibleTokenUniverse()
        const stale = HARDCODED_TOKENS.filter(([token]) => !universe.has(token))

        expect(
            stale.map(([token, why]) => `${token} (${why})`),
            "these tokens are allowlisted but no longer appear anywhere in " +
                "src/components/player-results/ - drop them from HARDCODED_TOKENS.",
        ).toEqual([])
    })
})

describe("player-results components speak through the catalogues", () => {
    for (const file of panelFiles()) {
        if (!file.endsWith(".tsx")) continue

        it(`${file}: imports and calls useTranslation`, () => {
            const source = stripComments(readPanel(file))
            expect(
                source,
                `${file} does not import useTranslation. RecentFormCards.tsx had none at all ` +
                    "before 0.5.4, which is why its heading could not follow the language switch.",
            ).toContain("useTranslation")
            expect(
                source,
                `${file} imports useTranslation but never calls it`,
            ).toMatch(/useTranslation\(\)/)
        })
    }

    it(`${FORMAT_MODULE} stays hook-free`, () => {
        // It takes `t` as a PlayerResultsTranslate parameter instead. A hook
        // here would make the module unloadable in a Node test, which is the
        // one thing it exists to avoid.
        const source = stripComments(readPanel(FORMAT_MODULE))
        expect(source, `${FORMAT_MODULE} must not call a React hook`).not.toContain(
            "useTranslation",
        )
    })
})

describe("champion table tooltips point at their own column", () => {
    const columns = parseColumnTooltipPairs(stripComments(readPanel(CHAMPION_TABLE)))
    const withTooltip = columns.filter((column) => column.titleKey !== null)

    it("parsed every COLUMNS entry", () => {
        // Anti-vacuity in its most literal form: a regex that stopped matching
        // would leave `columns` empty and every assertion below would pass over
        // nothing. The two numbers are the current shape of the table.
        expect(columns.length, `no COLUMNS entries parsed out of ${CHAMPION_TABLE}`).toBe(14)
        expect(
            withTooltip.length,
            "13 of the 14 columns carry a titleKey. Two things land here: a column that gained " +
                "or lost a tooltip (a decision - update the number), and a COLUMNS entry " +
                "reformatted across several lines, which puts `key` and `titleKey` on different " +
                "lines and hides the pair from this parse. Widen parseColumnTooltipPairs for " +
                "the second; do not lower the number.",
        ).toBe(13)
    })

    it("the champion name column deliberately has no tooltip", () => {
        // Stated rather than skipped: the label already IS the word "Champion",
        // so a tooltip would repeat it. A tooltip appearing there later should
        // be a visible decision, not a silent one.
        const championName = columns.find((column) => column.key === "championName")
        expect(championName, "the championName column is gone from COLUMNS").toBeDefined()
        expect(
            championName?.titleKey,
            "championName gained a tooltip. If that is wanted, add the key pair and update this " +
                "test; the label already says 'Champion', so it was left out on purpose.",
        ).toBeNull()
    })

    it("every column's titleKey matches its own stat key", () => {
        const mismatched = withTooltip
            .filter((column) => column.titleKey !== expectedTooltipKey(column.key))
            .map((column) => `${column.key} -> ${column.titleKey} (expected ${expectedTooltipKey(column.key)})`)

        expect(
            mismatched,
            `these columns show another column's tooltip:\n${mismatched.join("\n")}\n` +
                "TranslationKey catches a key that does not exist; it cannot catch one that " +
                "belongs to the neighbouring row, and no test in this repo can see the rendered " +
                "title attribute.",
        ).toEqual([])
    })

    it("every column's titleKey is a real key in both catalogues", () => {
        for (const { key, titleKey } of withTooltip) {
            for (const [lang, dict] of LANGS) {
                expect(
                    dict[titleKey ?? ""],
                    `${lang}.ts has no ${titleKey} for the ${key} column`,
                ).toBeTypeOf("string")
            }
        }
    })
})

/**
 * The teammate toggle, added in 0.6.3.
 *
 * Same class of defect as the block above it: two hand-typed keys that have to
 * end up on the right side of a decision, in a place no test in this repo can
 * see rendered. The difference is what a mistake costs. A column showing the
 * neighbouring tooltip is wrong but visible to anyone who hovers it; a toggle
 * that announces "Mitspieler anzeigen" in both states is invisible to everyone
 * except the screen-reader user it misleads.
 *
 * The generic dead-key guard in section 2 already refuses a key that nothing in
 * src/ mentions, which covers "the pair was added and never used". It cannot
 * tell the halves apart: `hideTeammates` referenced from anywhere - a stray
 * import, the other half's own file, a comment - satisfies it. This block is
 * the specific claim, that both halves are wired into ONE state-dependent name
 * on the button that needs them.
 */
describe("the teammate toggle names both of its states", () => {
    it("both halves of the pair exist, in both catalogues", () => {
        for (const [lang, dict] of LANGS) {
            for (const key of TEAMMATE_TOGGLE_KEYS) {
                expect(
                    dict[key],
                    `${lang}.ts has no ${key}. It is the accessible name of the expand button in ` +
                        `${TEAMMATE_TOGGLE_FILE}, which renders a bare glyph otherwise.`,
                ).toBeTypeOf("string")
                expect(
                    (dict[key] ?? "").trim().length,
                    `${lang}.${key} is empty or whitespace only`,
                ).toBeGreaterThan(0)
                expect(
                    dict[key],
                    `${lang}.${key} has leading or trailing whitespace: "${preview(dict[key])}"`,
                ).toBe(dict[key].trim())
            }
        }
    })

    it("the two halves say different things within each language", () => {
        // The pair only earns its keep by DIFFERING. Both values set to the
        // same sentence compiles, renders, passes the parity and dead-key
        // rules, and announces one name in two states - which is the exact
        // outcome the comment in MatchTable.tsx says a state-independent
        // "Mitspieler" would have produced.
        for (const [lang, dict] of LANGS) {
            const [showKey, hideKey] = TEAMMATE_TOGGLE_KEYS
            expect(
                sameSentence(dict[showKey] ?? "", dict[hideKey] ?? ""),
                `${lang}.ts says the same thing for both states: "${preview(dict[showKey] ?? "")}". ` +
                    "The button's whole job is to tell them apart.",
            ).toBe(false)
        }
    })

    it(`${TEAMMATE_TOGGLE_FILE} picks between both halves on one state expression`, () => {
        const source = stripComments(readPanel(TEAMMATE_TOGGLE_FILE))
        const expressions = ariaLabelExpressions(source)

        expect(
            expressions.length,
            `${TEAMMATE_TOGGLE_FILE} has no aria-label={…} expression at all any more. The expand ` +
                "button is a glyph with no accessible name, and both keys are dead.",
        ).toBeGreaterThan(0)
        expect(
            expressions.some(namesBothStates),
            `no aria-label in ${TEAMMATE_TOGGLE_FILE} names both halves of the pair in one ` +
                `ternary. Found: ${expressions.map((e) => `"${preview(e)}"`).join(" | ")}\n` +
                "Half a pair is the failure mode: one key on both branches, or one key beside a " +
                "string literal, still compiles and still passes every other rule in this file.",
        ).toBe(true)
    })

    it("neither value carries a dash aside", () => {
        // CLAUDE.md P4a, applied where this file can reach. There is no
        // family-wide dash guard for playerResults_ (tests/i18nScoutCopy.test.ts
        // says in so many words that its own is `scout_` only), so this is the
        // narrow version for the two values added here - not a new rule for the
        // whole catalogue, which would need the EMPTY_CELL "—" carve-out that
        // HARDCODED_TOKENS documents.
        for (const [lang, dict] of LANGS) {
            for (const key of TEAMMATE_TOGGLE_KEYS) {
                expect(
                    dict[key] ?? "",
                    `${lang}.${key} contains an em dash or en dash: "${preview(dict[key] ?? "")}"`,
                ).not.toMatch(/[—–]/)
                expect(
                    dict[key] ?? "",
                    `${lang}.${key} contains a double hyphen: "${preview(dict[key] ?? "")}"`,
                ).not.toContain("--")
            }
        }
    })
})

describe("no player-results file substitutes {count} by hand", () => {
    it("only playerResultsFormat.ts names the {count} placeholder", () => {
        const offenders: string[] = []
        for (const [file, source] of panelSources()) {
            const hits = (source.match(/\{count\}/g) ?? []).length
            if (file === FORMAT_MODULE) {
                expect(
                    hits,
                    `${FORMAT_MODULE} should name {count} exactly once, in formatLastNLabel(); ` +
                        `found ${hits}.`,
                ).toBe(1)
                continue
            }
            if (hits > 0) offenders.push(`${file} (${hits}x)`)
        }

        expect(
            offenders,
            `these files substitute {count} themselves: ${offenders.join(", ")}\n` +
                "There are exactly two fillers for this tab and neither lives in a component: " +
                "formatLastNLabel(t, n) for the Last-N buttons, and pluralMessage(t, n, " +
                "PLAYER_RESULTS_MATCH_COUNT_KEYS) wherever the count can really be 1. Two " +
                "components printed this sentence their own way for a while, which is how one " +
                "of them ended up rendering 'Letzte 1'.",
        ).toEqual([])
    })

    it("no player-results file reaches for fillPlaceholders", () => {
        // It is module-private in src/components/team/teamUiHelpers.ts again,
        // and this tab has its own one-key filler. Importing it would export a
        // helper across a module boundary for one String.replace.
        for (const [file, source] of panelSources()) {
            expect(
                source,
                `${file} imports fillPlaceholders. Use formatLastNLabel(t, n) or ` +
                    "pluralMessage(t, n, keys) instead.",
            ).not.toContain("fillPlaceholders")
        }
    })
})

/* ==========================================================================
 * 4. The scan actually scanned something
 * ========================================================================== */

describe("the directory scan covers what it claims to", () => {
    it("finds a non-empty file list containing the five components", () => {
        const files = panelFiles()

        expect(files.length, "src/components/player-results/ scan found no files").toBeGreaterThan(0)
        for (const expected of [...COMPONENT_FILES, FORMAT_MODULE]) {
            expect(
                files,
                `${expected} is missing from the scan - it was renamed or moved, and every rule ` +
                    "in this file stopped applying to it.",
            ).toContain(expected)
        }
    })

    it("reads real content out of every file it scans", () => {
        for (const [file, source] of panelSources()) {
            expect(source.length, `${file} came back empty after comment stripping`).toBeGreaterThan(
                200,
            )
        }
    })
})

/* ==========================================================================
 * 5. Anti-vacuity: every predicate is shown to go red
 *
 * Synthetic sources, deliberately wrong, fed through the EXACT functions the
 * assertions above use. Same idea as the "source scanner" block at the top of
 * tests/scoutKdaVisibility.test.ts: a scan whose regex has quietly stopped
 * matching passes in silence, and only a known-bad input can tell the
 * difference between "clean" and "blind".
 * ========================================================================== */

describe("the scans can go red", () => {
    it("catches a reintroduced de-DE", () => {
        const bad = 'return value.toLocaleString("de-DE")'
        expect(matchesOf(bad, LOCALE_LITERAL)).toEqual(["de-DE"])
        expect(matchesOf('date.toLocaleDateString("en-US")', LOCALE_LITERAL)).toEqual(["en-US"])
        // …and stays quiet on the real shape.
        expect(matchesOf("value.toLocaleString(localeForLang(lang))", LOCALE_LITERAL)).toEqual([])
        expect(matchesOf('className="role-tab"', LOCALE_LITERAL)).toEqual([])
    })

    it("catches a bare toLocale* call, with and without an argument", () => {
        expect(matchesOf("const s = n.toLocaleString()", LOCALE_CALL)).toHaveLength(1)
        expect(matchesOf("const s = n.toLocaleString(undefined)", LOCALE_CALL)).toHaveLength(1)
        expect(matchesOf("d.toLocaleDateString(l, { day: '2-digit' })", LOCALE_CALL)).toHaveLength(1)
        expect(matchesOf("d.toLocaleTimeString(l)", LOCALE_CALL)).toHaveLength(1)
        // localeCompare is sorting, not formatting, and stays allowed.
        expect(matchesOf("a.localeCompare(b)", LOCALE_CALL)).toEqual([])
        // The literal-argument rule is narrower than the call rule.
        expect(matchesOf('n.toLocaleString("de-DE")', LOCALE_CALL_WITH_LITERAL)).toHaveLength(1)
        expect(matchesOf("n.toLocaleString(localeForLang(lang))", LOCALE_CALL_WITH_LITERAL)).toEqual(
            [],
        )
    })

    it("catches a formatting layer that has gone blind, and one that pins its locale", () => {
        // The repaired anti-vacuity guard, fed the three shapes that matter.
        // Delegation alone is NOT formatting: a module that only forwards to
        // somebody else contributes 0 to the count, which is what makes
        // "nobody formats anything anywhere" go red rather than pass.
        const delegating = "return formatNumber(Math.round(value), lang)"
        const viaToLocale = "return value.toLocaleString(localeForLang(lang))"
        const viaIntl =
            'return new Intl.DateTimeFormat(localeForLang(lang), { day: "2-digit" }).format(d)'

        expect(formattingCalls(delegating)).toEqual([])
        expect(formattingCalls(viaToLocale)).toHaveLength(1)
        expect(formattingCalls(viaIntl)).toHaveLength(1)
        expect(formattingCalls([delegating, viaToLocale, viaIntl].join("\n"))).toHaveLength(2)
        // Sorting is not formatting, in either direction of the count.
        expect(formattingCalls("names.sort((a, b) => a.localeCompare(b))")).toEqual([])

        // The literal rule sees both APIs and stays quiet on the real shape.
        expect(pinnedLocaleCalls('value.toLocaleString("de-DE")')).toHaveLength(1)
        expect(pinnedLocaleCalls('new Intl.NumberFormat("de-DE").format(value)')).toHaveLength(1)
        expect(pinnedLocaleCalls([viaToLocale, viaIntl].join("\n"))).toEqual([])

        // …and the delegation link, whose absence is the "second copy of the
        // same one-liner" case the count alone cannot see.
        expect(
            importsAppNumberFormatter('import { formatNumber } from "../../i18n/format"'),
        ).toBe(true)
        expect(importsAppNumberFormatter('import { localeForLang } from "../../i18n/locale"')).toBe(
            false,
        )
        expect(importsAppNumberFormatter('import { formatNumber } from "./ownCopy"')).toBe(false)
    })

    it("catches a suffix-built plural in both spellings", () => {
        expect(matchesOf('`${n} Match${n !== 1 ? "es" : ""}`', SUFFIX_PLURAL)).toHaveLength(1)
        expect(matchesOf('`${n} match${n === 1 ? "" : "es"}`', SUFFIX_PLURAL)).toHaveLength(1)
        expect(matchesOf('`${n} win${n !== 1 ? "s" : ""}`', SUFFIX_PLURAL)).toHaveLength(1)
        expect(matchesOf('n === 1 ? "Match" : "Matches"', LITERAL_TERNARY_PLURAL)).toHaveLength(1)
        // The correct shapes must NOT trip either rule.
        expect(
            matchesOf("pluralMessage(t, n, PLAYER_RESULTS_MATCH_COUNT_KEYS)", SUFFIX_PLURAL),
        ).toEqual([])
        expect(
            matchesOf('n === 1 ? t("playerResults_matchCountOne") : t("…Many")', LITERAL_TERNARY_PLURAL),
        ).toEqual([])
    })

    it("catches a hardcoded English JSX text node", () => {
        const bad = '<span className="section-title">Recent form</span>'
        expect(visibleOccurrences(bad)).toContain("Recent form")
        expect(wordTokens("Recent form").filter((token) => !ALLOWED_TOKENS.has(token))).toEqual([
            "Recent",
            "form",
        ])

        // Multi-line, which the per-line run scan alone would miss.
        const multiLine = ["<span", '    className="muted"', ">", "    Needs review", "</span>"].join(
            "\n",
        )
        expect(sandwichedTextOccurrences(multiLine)).toEqual(["Needs review"])

        // Attributes count as visible copy too.
        expect(visibleOccurrences('<th title="Average KDA">')).toContain("Average KDA")
        expect(visibleOccurrences('<StatItem label="Games" />')).toContain("Games")
    })

    it("catches a sentence assembled in a template literal", () => {
        expect(matchesOf("`Last ${opt.label}`", PROSE_TEMPLATE)).toHaveLength(1)
        expect(matchesOf("`Best champion ${name}`", PROSE_TEMPLATE)).toHaveLength(1)
        // Style and class strings must not trip it: no space before `${`,
        // punctuation in the word run, or a leading digit.
        expect(matchesOf("`translate${x}`", PROSE_TEMPLATE)).toEqual([])
        expect(matchesOf("`role-tab${active ? ' role-tab-active' : ''}`", PROSE_TEMPLATE)).toEqual([])
        expect(matchesOf("`1px solid ${borderColor}`", PROSE_TEMPLATE)).toEqual([])
        expect(matchesOf("`${kills}/${deaths}/${assists}`", PROSE_TEMPLATE)).toEqual([])
    })

    it("catches a playerResults_ key that only one catalogue has", () => {
        const deOnly = { playerResults_win: "Sieg", playerResults_ghost: "Geist" }
        const enOnly = { playerResults_win: "Win" }

        const onlyInDe = familyKeys(deOnly).filter((key) => !(key in enOnly))
        const onlyInEn = familyKeys(enOnly).filter((key) => !(key in deOnly))

        expect(onlyInDe).toEqual(["playerResults_ghost"])
        expect(onlyInEn).toEqual([])
    })

    it("catches English left in de.ts and German left in en.ts", () => {
        // The two values that actually shipped in de.ts until 0.5.4.
        expect(markerHits("Team Overview", ENGLISH_MARKERS)).toContain("overview")
        expect(markerHits("Needs Review", ENGLISH_MARKERS)).toEqual(
            expect.arrayContaining(["needs", "review"]),
        )
        // …and the mirror case in en.ts.
        expect(markerHits("Team-Übersicht", GERMAN_MARKERS)).toEqual([])
        expect(GERMAN_LETTERS.test("Team-Übersicht")).toBe(true)
        expect(markerHits("Keine Matches gefunden.", GERMAN_MARKERS)).toEqual(
            expect.arrayContaining(["keine", "gefunden"]),
        )
        // Correct copy in either language stays quiet.
        expect(markerHits("Zum Überprüfen", ENGLISH_MARKERS)).toEqual([])
        expect(markerHits("Best Champions", GERMAN_MARKERS)).toEqual([])
        expect(GERMAN_LETTERS.test("Best Champions")).toBe(false)
        // Case-insensitive, because a recapitalised English value is still English.
        expect(sameSentence("{count} Match", "{count} match")).toBe(true)
        expect(sameSentence("Letzte {count}", "Last {count}")).toBe(false)
    })

    it("catches a column wearing another column's tooltip", () => {
        const swapped = [
            "const COLUMNS: Col[] = [",
            '    { key: "championName",    label: "Champion" },',
            '    { key: "avgKills",        label: "K", titleKey: "playerResults_tipAvgKills" },',
            '    { key: "avgDeaths",       label: "D", titleKey: "playerResults_tipAvgKills" },',
            "]",
            "",
        ].join("\n")
        const pairs = parseColumnTooltipPairs(swapped)

        expect(pairs).toHaveLength(3)
        expect(pairs.filter((column) => column.titleKey === null)).toHaveLength(1)
        expect(
            pairs
                .filter((column) => column.titleKey !== null)
                .filter((column) => column.titleKey !== expectedTooltipKey(column.key))
                .map((column) => column.key),
        ).toEqual(["avgDeaths"])

        // And the stem rule agrees with the real, correct pairs.
        expect(expectedTooltipKey("csPerMinute")).toBe("playerResults_tipCsPerMinute")
        expect(expectedTooltipKey("winRate")).toBe("playerResults_tipWinRate")
        expect(expectedTooltipKey("games")).toBe("playerResults_tipGames")
        // A parse that finds nothing must come back empty, not throw, so the
        // entry-count assertion is what reports it.
        expect(parseColumnTooltipPairs("const OTHER = []")).toEqual([])
    })

    it("catches a half-wired teammate toggle", () => {
        const wired = [
            "<button",
            "    aria-expanded={isExpanded}",
            "    aria-label={",
            "        isExpanded",
            '            ? t("playerResults_hideTeammates")',
            '            : t("playerResults_showTeammates")',
            "    }",
            ">",
        ].join("\n")

        // The real shape, read across lines and normalised to one.
        expect(ariaLabelExpressions(wired)).toEqual([
            'isExpanded ? t("playerResults_hideTeammates") : t("playerResults_showTeammates")',
        ])
        expect(ariaLabelExpressions(wired).some(namesBothStates)).toBe(true)

        // The three ways to have half of it. Each one compiles, renders, and
        // leaves the button announcing one name in two states.
        const sameKeyTwice =
            'aria-label={isExpanded ? t("playerResults_showTeammates") : t("playerResults_showTeammates")}'
        const keyPlusLiteral =
            'aria-label={isExpanded ? t("playerResults_hideTeammates") : "Mitspieler anzeigen"}'
        const noTernary = 'aria-label={t("playerResults_showTeammates")}'

        for (const bad of [sameKeyTwice, keyPlusLiteral, noTernary]) {
            expect(ariaLabelExpressions(bad).some(namesBothStates), bad).toBe(false)
        }

        // A name assembled inside braces is not a shape this rule reads, and it
        // comes back empty rather than pretending to have understood it.
        expect(
            ariaLabelExpressions('aria-label={`${prefix} ${t("playerResults_showTeammates")}`}'),
        ).toEqual([])
        // A button with no accessible name at all.
        expect(ariaLabelExpressions('<button type="button" onClick={onToggle}>')).toEqual([])
    })

    it("reads the teammate pair's English as English, and its German as clean", () => {
        // The three markers 0.6.3 added. They have to fire on the English
        // values - otherwise section 2c stops comparing these two keys and the
        // `compared` count goes red - and stay silent on the German ones, or
        // they would accuse correct copy.
        expect(markerHits("Show teammates", ENGLISH_MARKERS)).toEqual(
            expect.arrayContaining(["show", "teammates"]),
        )
        expect(markerHits("Hide teammates", ENGLISH_MARKERS)).toEqual(
            expect.arrayContaining(["hide", "teammates"]),
        )
        expect(markerHits("Mitspieler anzeigen", ENGLISH_MARKERS)).toEqual([])
        expect(markerHits("Mitspieler ausblenden", ENGLISH_MARKERS)).toEqual([])
        // "Mitspieler" is the German marker that would catch the mirror mistake.
        expect(markerHits("Mitspieler anzeigen", GERMAN_MARKERS)).toContain("Mitspieler")
        expect(markerHits("Show teammates", GERMAN_MARKERS)).toEqual([])
    })

    it("catches a typo'd placeholder", () => {
        expect(placeholdersOf("Letzte {cout}")).toEqual(["{cout}"])
        expect(placeholdersOf("Letzte {count}")).toEqual(["{count}"])
        // `{a b}` is not a placeholder at runtime, so it is not one here either.
        expect(placeholdersOf("Letzte {von hier}")).toEqual([])
    })

    it("strips comments, keeps code, and does not choke on a URL", () => {
        // The four comment-only occurrences in playerResultsFormat.ts are the
        // reason this helper exists at all; see the module header.
        expect(stripComments('// a toLocaleDateString("de-DE", …) example\n')).not.toContain(
            "de-DE",
        )
        expect(stripComments('/* `${n} Match${n !== 1 ? "es" : ""}` */ const a = 1')).not.toContain(
            "Match",
        )
        expect(stripComments("{/* fillPlaceholders */}")).not.toContain("fillPlaceholders")
        expect(stripComments('const u = "https://example.test/x"')).toContain("example.test")
        expect(stripComments('const label = "CS/min"')).toContain("CS/min")
    })

    it("does not mistake TypeScript and JSX plumbing for visible copy", () => {
        // Every one of these produced a false positive in an early draft, and
        // each is the reason for one of the exclusions in textRunOccurrences.
        const plumbing = [
            "function ChampionCard({ stat, accent }: CardProps) {",
            "export function ChampionResultsTable({ matches }: Props) {",
            "{best.map((s) => <ChampionCard key={s.championName} stat={s} accent='pos' />)}",
            "<select value={queueFilter} onChange={(e) => setQueueFilter(e)}>",
            "<td style={tdStyle} colSpan={5}></td>",
            "if (sortKey === key) setSortAsc((v) => !v)",
            "} else { setSortKey(key) }",
            "const QUEUE_LABELS: Record<number, string> = { 420: 'SoloQ' }",
        ].join("\n")

        const unexpected = visibleOccurrences(plumbing).flatMap((occurrence) =>
            wordTokens(occurrence).filter((token) => !ALLOWED_TOKENS.has(token)),
        )
        expect(unexpected, "the copy scan is reading code as text").toEqual([])
    })

    it("still sees the stat tokens it is meant to allow through", () => {
        // The complement of the test above: if the exclusions were widened
        // until nothing matched, this would go red instead of the file going
        // quietly green.
        expect(visibleOccurrences("<th style={thStyle}>Queue</th>")).toContain("Queue")
        expect(visibleOccurrences("<option value={420}>SoloQ</option>")).toContain("SoloQ")
        expect(visibleOccurrences("<span>{stat.wins}W {stat.losses}L</span>")).toContain("W")
        expect(visibleOccurrences("<span>{formatRatio(k, 2)} KDA · {n}G</span>")).toContain("KDA ·")
    })
})
