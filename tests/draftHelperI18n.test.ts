/**
 * Guards for the Draft Helper i18n pass: 0.5.5 -> 0.5.6 (Draft Cockpit headings
 * and one aria-label) and 0.5.6 -> 0.5.7 (the recommendations table header row).
 *
 * WHAT WENT WRONG, and why this file exists
 *
 * 0.5.6 - The Draft Cockpit printed five strings that no catalogue owned. Four
 * were section headings written straight into the JSX - `<h2>Draft Cockpit</h2>`,
 * `<h3>Draft Edge</h3>`, `<h3>Team Identity</h3>`, `<h3>Comp Checks</h3>` - and
 * the fifth was worse, because nobody looking at the screen could see it at
 * all: PatchWeightPanel carried `aria-label="Patch-Gewichtungs-Presets"`, a
 * German string read out to every English user of a screen reader. The damage
 * profile line printed a hardcoded `Mixed` next to numbers that were already
 * translated.
 *
 * All five now go through `t()`, and `Mixed` reuses the key that already
 * existed for it (`comp_damage_mixed`, "Gemischt" / "Mixed") rather than
 * minting a sixth.
 *
 * 0.5.7 - The recommendations table wrote eleven `<th>` labels straight into
 * the JSX, and two of them showed the damage plainly: a German `Rolle` and an
 * English `Role` sat in the SAME header row, in BOTH language builds. All
 * eleven now go through `t()`: ten as the new `dh_recoTable*` family, and the
 * one that used to say `Sample` as `tbl_confidence`, the key five sibling
 * tables already use for that same cell. The twelfth column keeps the
 * `dh_tableReasons` key it always had. DraftHelper.tsx now holds ZERO bare-text
 * `<th>`.
 *
 * WHY THE 0.5.6 PINS SURVIVED AS THEIR OWN OPPOSITE
 *
 * Section 4 used to pin those eleven `<th>` and that mixed-language row as
 * known defects, stated so they stayed visible until somebody fixed them.
 * Somebody did. Deleting the pins would have thrown away the only thing in the
 * repository that remembers the row was ever broken, so each was turned around
 * to protect the fixed state instead:
 *
 *  - the count pin ("exactly eleven bare `<th>`") became a ZERO pin,
 *  - the `Rolle`/`Role` pin became the guarantee that the pair cannot collapse:
 *    `dh_recoTableRole` (the champion's ROLE, column 2) and
 *    `dh_recoTableRoleStrength` (the role-stats SCORE, column 5) must remain two
 *    keys carrying two distinct labels,
 *  - and both got an anti-vacuity partner, because "no bare `<th>`" is also
 *    satisfied by a file with no table in it.
 *
 * Section 1 gained the matching data guards for the ten new keys, plus one for
 * the two columns that reuse an older key - so that "tidying" them into the
 * `dh_recoTable*` family, and changing the words in passing, goes red.
 *
 * WHAT IS STILL PINNED AS BROKEN, on purpose
 *
 * `{ROLE_LABELS[entry.role]} · Score {…} · {entry.games} Picks` around line 1545
 * is still hardcoded English welded into a line that otherwise renders
 * translated values. It was out of scope for 0.5.7 and its pin is unchanged.
 * So is the aria-label known-issues list in section 3.
 *
 * WHY AN aria-label IS THE ONE WORTH A WIDE GUARD
 *
 * A hardcoded heading is visible: flip the language switch and it stands out.
 * A hardcoded `aria-label` is untranslated BY CONSTRUCTION and invisible to
 * everyone who does not use a screen reader, so it can sit there for years.
 * Section 3 therefore scans all of `src/components/**`, not just the file this
 * change touched - with the current violators pinned rather than fixed, because
 * fixing them was not this change's job.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE EVERY SOURCE SCAN
 *
 * Same decision, for the same reason, as tests/appLocaleGuards.test.ts and
 * tests/playerResultsI18n.test.ts: a module header that documents a rule by
 * QUOTING the wrong code (`<h3>Draft Edge</h3>`, `aria-label="Close"`) would
 * fail a raw scan, and the obvious "fix" would be deleting the prose that
 * exists to stop the next person reintroducing the bug. A file allowlist would
 * be worse - it would exempt the files most likely to break the rule. So every
 * scan strips line and block comments first. The stripper is deliberately naive
 * about a `//` inside a string literal; it can only ever HIDE a match, never
 * manufacture one, and the fixtures in section 5 prove the predicates still
 * fire on real code.
 *
 * WHAT THESE GUARDS CANNOT PROVE
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) with no
 * jsdom, so nothing in this file renders. These are source-TEXT scans. They
 * show that a forbidden token is not written and that a required call site
 * exists. They do NOT show that:
 *
 *  - the heading is actually rendered. A `false && (...)`, an early
 *    `return null` or a branch nobody reaches would still pass here,
 *  - `t()` resolves. That the key exists is checked against the catalogues as
 *    data in section 1; that the component's `t` is wired to the language
 *    switch is a runtime question,
 *  - a screen reader announces the aria-label, or announces it usefully,
 *  - the German is GOOD German. Section 1 catches an English value left in
 *    de.ts by comparing the two catalogues; it cannot review a translation.
 *    It cannot review a deliberate loanword either, which is why the six
 *    `dh_recoTable*` keys that read the same in both catalogues are listed one
 *    by one instead of waved through,
 *  - the header labels sit above the columns they name. Section 4 pins the
 *    ORDER the twelve keys are written in; that column 5 really renders
 *    `entry.roleStatsScore` underneath `dh_recoTableRoleStrength` is a runtime
 *    question this file cannot reach.
 *
 * That honesty requirement is CLAUDE.md P4c, and the same caveat block sits at
 * the top of tests/appLocaleGuards.test.ts and tests/scoutUxDeclutter.test.ts.
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
 * reason, as tests/playerResultsI18n.test.ts.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const LANGS: ReadonlyArray<readonly [lang: string, dict: Record<string, string>]> = [
    ["de", DE],
    ["en", EN],
]

const SRC = fileURLToPath(new URL("../src/", import.meta.url))
const COMPONENTS = `${SRC}components${sep}`

/** Every `.ts`/`.tsx` under `src/components/`, relative to it, with `/` separators. */
function componentFiles(dir = ""): string[] {
    const found: string[] = []
    for (const entry of readdirSync(COMPONENTS + dir.split("/").join(sep), { withFileTypes: true })) {
        const rel = dir === "" ? entry.name : `${dir}/${entry.name}`
        if (entry.isDirectory()) found.push(...componentFiles(rel))
        else if (/\.tsx?$/.test(entry.name)) found.push(rel)
    }
    return found
}

const readComponent = (rel: string): string =>
    readFileSync(COMPONENTS + rel.split("/").join(sep), "utf8")

/**
 * Remove line and block comments so a scan judges CODE only. See the module
 * header for why this is not optional.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")

const code = (rel: string): string => stripComments(readComponent(rel))

/** The two files this change touched, relative to `src/components/`. */
const DRAFT_HELPER = "DraftHelper.tsx"
const PATCH_WEIGHT_PANEL = "draft/PatchWeightPanel.tsx"

/* ==========================================================================
 * The predicates
 *
 * Every rule below is a pure function, declared once and used BOTH by the real
 * assertions and by the synthetic fixtures in section 5. That is the whole
 * anti-vacuity mechanism: a scan whose regex has quietly stopped matching
 * passes in silence, and only a known-bad input tells "clean" from "blind".
 * ========================================================================== */

/** Anything that could be a word of UI copy, umlauts included. */
const HAS_LETTER = /[A-Za-zÄÖÜäöüß]/

/**
 * Drop every `{...}` JSX expression from an element's children, leaving only
 * what is written as literal text.
 *
 * Brace-depth counting, deliberately naive about a brace inside a string
 * literal (`{t("a}b")}`). Nothing in these files does that, and the failure
 * direction is safe: a mis-counted brace can only leave EXTRA residue, which
 * shows up as a loud false alarm rather than a silent pass.
 */
const stripJsxExpressions = (children: string): string => {
    let depth = 0
    let out = ""
    for (const character of children) {
        if (character === "{") {
            depth += 1
            continue
        }
        if (character === "}") {
            if (depth > 0) depth -= 1
            continue
        }
        if (depth === 0) out += character
    }
    return out
}

/**
 * Elements of `tag` whose children contain literal text rather than only
 * expressions. Multi-line safe (`[\s\S]`), which is what makes this the guard
 * that a heading reformatted across three lines cannot slip past.
 *
 * `[^>]*` for the attribute run would truncate on an attribute containing a
 * `>` (`style={{ width: a > b ? 1 : 2 }}`). Neither file does that, and the
 * effect would again be a false alarm, not a miss.
 */
const elementsWithBareText = (
    source: string,
    tag: string,
): ReadonlyArray<{ element: string; literal: string }> => {
    const re = new RegExp(`<(${tag})\\b[^>]*>([\\s\\S]*?)</\\1>`, "g")
    const found: Array<{ element: string; literal: string }> = []
    for (const match of source.matchAll(re)) {
        const literal = stripJsxExpressions(match[2]).replace(/\s+/g, " ").trim()
        if (literal && HAS_LETTER.test(literal)) {
            found.push({ element: match[0].replace(/\s+/g, " ").trim(), literal })
        }
    }
    return found
}

/** Headings are `h1`-`h4`; `<hr />` cannot match, the tag needs a digit. */
const headingsWithBareText = (source: string) => elementsWithBareText(source, "h[1-4]")

/**
 * The children of every `<th>` in `source`, whitespace-collapsed, in source
 * order. Counts the header cells regardless of what they render, which is what
 * makes "no bare text" provably different from "no table".
 *
 * Same two naive spots as `elementsWithBareText`, for the same reason: `[^>]*`
 * over the attribute run, and no awareness of a `<th>` written inside a string.
 * Both can only over-report.
 */
const thChildren = (source: string): string[] =>
    [...source.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) =>
        match[1].replace(/\s+/g, " ").trim(),
    )

/** A `<th>` whose children are NOTHING BUT one `t("literal_key")` call. */
const TH_IS_ONE_TRANSLATION_CALL = /^\{\s*t\(\s*"([A-Za-z0-9_]+)"\s*\)\s*\}$/

/**
 * The catalogue key of every `<th>` that renders exactly one `t()` call, in
 * source order.
 *
 * Deliberately strict about "exactly one": `<th>Rolle {t("x")}</th>` and
 * `<th>{someLabel}</th>` both yield nothing here, so a header cell that is half
 * hardcoded or bypasses the catalogue cannot pad the list out to twelve.
 */
const thTranslationKeys = (source: string): string[] => {
    const keys: string[] = []
    for (const child of thChildren(source)) {
        const call = TH_IS_ONE_TRANSLATION_CALL.exec(child)
        if (call) keys.push(call[1])
    }
    return keys
}

/** Values that appear more than once, each named once, in first-seen order. */
const duplicatesOf = (values: readonly string[]): string[] => {
    const seen = new Set<string>()
    const repeated = new Set<string>()
    for (const value of values) {
        if (seen.has(value)) repeated.add(value)
        seen.add(value)
    }
    return [...repeated]
}

/**
 * Text written between JSX tags on ONE line: the run between a `>` or `}` and
 * the next `<` or `{`.
 *
 * Per line on purpose - the same lesson tests/playerResultsI18n.test.ts records
 * in its own scan: letting a run span lines makes the character class jump
 * whole statements and turns plain TypeScript into a "text node".
 */
const jsxTextRuns = (source: string): string[] => {
    const found: string[] = []
    for (const line of source.split("\n")) {
        const re = /([>}])([^<>{}]*)[<{]/g
        let match = re.exec(line)
        while (match !== null) {
            re.lastIndex = match.index + 1 // overlapping runs, e.g. `}A{B}C{`
            const run = match[2].trim()
            if (run && HAS_LETTER.test(run)) found.push(run)
            match = re.exec(line)
        }
    }
    return found
}

/**
 * `aria-label` given a STRING LITERAL instead of an expression.
 *
 * `aria-labelledby="…"` cannot match: the pattern needs `=` immediately after
 * `aria-label`, and there it is followed by `ledby`. An id reference is a
 * different thing anyway - it names an element, it is not copy.
 */
const ariaLabelLiterals = (source: string): string[] =>
    [...source.matchAll(/\baria-label\s*=\s*(["'])([^"']*)\1/g)].map((match) => match[2])

/** Mirrors the runtime substitution (`/\{(\w+)\}/g`): `{a b}` is not one. */
const placeholdersOf = (value: string): string[] =>
    [...new Set(value.match(/\{\w+\}/g) ?? [])].sort()

/**
 * Case-insensitive on purpose: an EN value that is the DE one with different
 * capitalisation is still an untranslated copy-paste.
 */
const sameSentence = (a: string, b: string): boolean =>
    a.trim().toLowerCase() === b.trim().toLowerCase()

/** Keys of `a` that `b` does not have. */
const keysMissingFrom = (
    keys: readonly string[],
    a: Record<string, string>,
    b: Record<string, string>,
): string[] => keys.filter((key) => key in a && !(key in b))

/**
 * Every `.ts`/`.tsx` under `src/` except `src/i18n/`, as a path list and as one
 * concatenated blob.
 *
 * Both dead-key checks read it: a key the catalogues carry and no other file
 * mentions is a promise the app does not keep. Comments are NOT stripped here
 * on purpose - a key named only in a comment is still a lead worth following,
 * and this scan is looking for absence, not for a violation.
 */
const srcOutsideI18n = (): { files: string[]; text: string } => {
    const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.(ts|tsx)$/.test(entry) && !entry.startsWith("i18n/"))

    return {
        files,
        text: files.map((file) => readFileSync(SRC + file.split("/").join(sep), "utf8")).join("\n"),
    }
}

/* ==========================================================================
 * The keys these two changes minted
 * ========================================================================== */

/**
 * Key, DE value, EN value - written out rather than read from the catalogue,
 * because the point is to pin the exact copy that was agreed. Reading it from
 * de.ts would make the test agree with whatever de.ts says, which is no test at
 * all.
 *
 * All five DE values are hyphenated compounds. That is this catalogue's
 * established habit (`Draft-Empfehlungen`, `Ban-Empfehlung`, `Riot-ID`) and it
 * is also what makes the DE/EN difference check in section 1 meaningful: were
 * the German simply the English text, that assertion would go red.
 */
const NEW_KEYS: ReadonlyArray<readonly [key: string, dePrompt: string, enPrompt: string]> = [
    ["dh_title_draftCockpit", "Draft-Cockpit", "Draft Cockpit"],
    ["dh_title_draftEdge", "Draft-Edge", "Draft Edge"],
    ["dh_title_teamIdentity", "Team-Identität", "Team Identity"],
    ["dh_title_compChecks", "Comp-Checks", "Comp Checks"],
    ["dh_pPresetsAriaLabel", "Patch-Gewichtungs-Presets", "Patch weighting presets"],
]

/** The four headings that used to be literals, as they were written. */
const FORMER_HEADING_LITERALS = [
    "Draft Cockpit",
    "Draft Edge",
    "Team Identity",
    "Comp Checks",
] as const

/**
 * The ten keys 0.5.7 minted for the recommendations table header, in the order
 * the columns are written, with the exact copy that was agreed. Written out
 * rather than read from the catalogue, for the same reason as NEW_KEYS: a test
 * that asks de.ts what de.ts says is not a test.
 *
 * Eleven `<th>` were hardcoded and only TEN keys were minted, because one of
 * the eleven turned out to be a column that already had a name elsewhere - see
 * REUSED_COLUMN_KEYS below.
 *
 * Entry 2 and entry 5 are the point of the whole change. `dh_recoTableRole`
 * labels the champion's ROLE (`ROLE_LABELS[entry.role]`); `dh_recoTableRoleStrength`
 * labels the role-stats SCORE (`formatScore(entry.roleStatsScore)`). They are
 * two different quantities that happened to read `Rolle` and `Role`.
 * "Rollenstärke" / "Role Strength" is the wording the `dh_wLabel_roleStats`
 * weight slider already uses for that score, so the table and the slider that
 * weights it now speak one vocabulary.
 *
 * Two more values are deliberately longer than the word that was in the JSX,
 * and the length is the point:
 *
 *  - `Gesamtscore` / `Total Score`, not `Gesamt` / `Total`. `totalScore` is a
 *    weighted mean scaled by sample confidence, not a sum of the four score
 *    columns next to it, which is what a bare "Gesamt" suggests.
 *  - `Team-Pool` / `Team Pool`, not `Pool`. The same screen also shows
 *    `dh_poolTitle` ("Champion Pool") and `dh_fearlessPool` ("Fearless Pool:"),
 *    so a lone "Pool" named three different things at once.
 */
const RECO_TABLE_KEYS: ReadonlyArray<readonly [key: string, dePrompt: string, enPrompt: string]> = [
    ["dh_recoTableChampion", "Champion", "Champion"],
    ["dh_recoTableRole", "Rolle", "Role"],
    ["dh_recoTableTotal", "Gesamtscore", "Total Score"],
    ["dh_recoTablePriority", "Priorität", "Priority"],
    ["dh_recoTableRoleStrength", "Rollenstärke", "Role Strength"],
    ["dh_recoTableSynergy", "Synergie", "Synergy"],
    ["dh_recoTableMatchup", "Matchup", "Matchup"],
    ["dh_recoTablePicks", "Picks", "Picks"],
    ["dh_recoTableWinrate", "Winrate", "Winrate"],
    ["dh_recoTablePool", "Team-Pool", "Team Pool"],
]

/**
 * The two columns of the header row that do NOT belong to the `dh_recoTable*`
 * family, and must not be tidied into it.
 *
 * `tbl_confidence` is the interesting one. That column was `<th>Sample</th>`
 * until 0.5.7, and the word was wrong: the cell under it renders
 * `t(entry.sampleSizeLabel)`, which resolves through src/analysis/sampleSize.ts
 * to sample_veryLow / sample_low / sample_moderate / sample_good - "sehr geringe
 * Aussagekraft", "geringe Aussagekraft", "brauchbarer Trend", "stabilerer
 * Trend". That is a statement about CONFIDENCE, not a sample count, and the
 * word "Sample" appeared nowhere in its own column. Five sibling tables already
 * render this identical cell under `tbl_confidence` ("Aussagekraft" /
 * "Confidence"), so the column joined them instead of minting an eleventh
 * spelling. `dh_recoTableSample` was never created and must not be.
 *
 * `dh_tableReasons` is the column that already did it right before 0.5.7
 * touched the row.
 */
const CONFIDENCE_COLUMN_KEY = "tbl_confidence"
const REASONS_COLUMN_KEY = "dh_tableReasons"

const REUSED_COLUMN_KEYS: ReadonlyArray<readonly [key: string, de: string, en: string, why: string]> =
    [
        [
            CONFIDENCE_COLUMN_KEY,
            "Aussagekraft",
            "Confidence",
            "shared with ChampionStatsTable, RoleStatsTable, MatchupTable, SynergyTable and " +
                "RoleMatchupTable, which render the same sampleSizeLabel cell",
        ],
        [
            REASONS_COLUMN_KEY,
            "Gründe",
            "Reasons",
            "predates 0.5.7; the one column that was never hardcoded",
        ],
    ]

/** The five sibling tables that share the confidence column, relative to src/components/. */
const CONFIDENCE_COLUMN_SIBLINGS = [
    "ChampionStatsTable.tsx",
    "RoleStatsTable.tsx",
    "MatchupTable.tsx",
    "SynergyTable.tsx",
    "RoleMatchupTable.tsx",
] as const

/**
 * All twelve header keys in COLUMN ORDER: ten minted, plus the confidence
 * column in position ten and the reasons column last. The anti-vacuity checks
 * care about the whole row, not about which change minted which key.
 *
 * Spelled out rather than derived, because the two reused keys sit inside the
 * run rather than after it - and a test that reconstructs the order from the
 * same rule the assertion uses would agree with itself. A consistency check
 * below ties this list back to the two lists above.
 */
const RECO_TABLE_HEADER_KEYS: readonly string[] = [
    "dh_recoTableChampion",
    "dh_recoTableRole",
    "dh_recoTableTotal",
    "dh_recoTablePriority",
    "dh_recoTableRoleStrength",
    "dh_recoTableSynergy",
    "dh_recoTableMatchup",
    "dh_recoTablePicks",
    "dh_recoTableWinrate",
    CONFIDENCE_COLUMN_KEY,
    "dh_recoTablePool",
    REASONS_COLUMN_KEY,
]

/** Column 2 and column 5: the pair that used to read `Rolle` next to `Role`. */
const ROLE_COLUMN_KEY = "dh_recoTableRole"
const ROLE_STRENGTH_COLUMN_KEY = "dh_recoTableRoleStrength"

/**
 * The four header keys that hold the SAME text in de.ts and en.ts, each with
 * the reason it is a loanword rather than a missed translation.
 *
 * This list exists so that translating one of them is a DELIBERATE act. The
 * copy-paste check below skips exactly these four and demands a difference from
 * the other six; a second check demands that these four really are still
 * identical, so somebody who does translate one has to come here and say so.
 * Without the second half the list would quietly become an exemption that
 * nobody re-reads.
 *
 * The premise, checked against the catalogue rather than assumed: German
 * League jargon already uses all four as loanwords elsewhere in de.ts -
 * `dh_wLabel_matchup` ("Matchup / Counter"), `dh_wLabel_winRate` ("Winrate"),
 * `filter_minPicks` ("Min. Picks"), `dh_poolTitle` ("Champion Pool").
 *
 * `dh_recoTablePool` is NOT on this list any more: it reads "Team-Pool" in
 * German against "Team Pool" in English, and the hyphen is a real German
 * compound rather than a coincidence.
 */
const IDENTICAL_BY_DESIGN: ReadonlyArray<readonly [key: string, why: string]> = [
    ["dh_recoTableChampion", '"Champion" is the German word for it too; nobody says "Held"'],
    ["dh_recoTableMatchup", 'loanword, as in dh_wLabel_matchup "Matchup / Counter"'],
    ["dh_recoTablePicks", 'loanword, as in filter_minPicks "Min. Picks"'],
    ["dh_recoTableWinrate", 'loanword, as in dh_wLabel_winRate "Winrate"'],
]

const IDENTICAL_BY_DESIGN_KEYS = new Set(IDENTICAL_BY_DESIGN.map(([key]) => key))

/* ==========================================================================
 * 0. The scans actually scanned something
 *
 * First, because every assertion below is vacuous if the file list is empty or
 * a path has been renamed out from under it.
 * ========================================================================== */

describe("the source scan covers what it claims to", () => {
    it("finds a non-empty file list containing both changed files", () => {
        const files = componentFiles()

        expect(files.length, "src/components/ scan found no files - the walk is broken").toBeGreaterThan(
            20,
        )
        for (const expected of [DRAFT_HELPER, PATCH_WEIGHT_PANEL]) {
            expect(
                files,
                `${expected} is missing from the scan. It was renamed or moved, and every rule in ` +
                    "this file stopped applying to it.",
            ).toContain(expected)
        }
    })

    it("reads real content out of both changed files", () => {
        for (const rel of [DRAFT_HELPER, PATCH_WEIGHT_PANEL]) {
            expect(
                code(rel).length,
                `${rel} came back empty after comment stripping`,
            ).toBeGreaterThan(500)
        }
    })
})

/* ==========================================================================
 * 1. Both key families, as data
 * ========================================================================== */

describe("the five new dh_ keys are in both catalogues", () => {
    it("holds the exact agreed value in de.ts and en.ts", () => {
        for (const [key, dePrompt, enPrompt] of NEW_KEYS) {
            expect(DE[key], `de.ts has no ${key}`).toBe(dePrompt)
            expect(EN[key], `en.ts has no ${key}`).toBe(enPrompt)
        }
    })

    it("is present in both catalogues, in both directions", () => {
        const keys = NEW_KEYS.map(([key]) => key)
        const onlyInDe = keysMissingFrom(keys, DE, EN)
        const onlyInEn = keysMissingFrom(keys, EN, DE)

        expect(onlyInDe, `in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
    })

    it("carries no {placeholder} - these are plain labels", () => {
        // Nothing fills a placeholder on these five: they are handed straight to
        // t() and rendered. A stray `{` would ship to the screen as a hole in the
        // label, and on the aria-label nobody would ever see it.
        for (const [lang, dict] of LANGS) {
            for (const [key] of NEW_KEYS) {
                expect(
                    placeholdersOf(dict[key] ?? ""),
                    `${lang}.${key} carries a placeholder: "${dict[key]}". No caller substitutes ` +
                        "one here, so it would render literally.",
                ).toEqual([])
            }
        }
    })

    it("says something different in DE and EN", () => {
        // The copy-paste check: five keys added to two files in one sitting is
        // exactly where the German text ends up in the English catalogue, and
        // tsc cannot see it. All five genuinely differ - the German ones are
        // hyphenated compounds.
        const identical = NEW_KEYS.filter(([key]) => sameSentence(DE[key] ?? "", EN[key] ?? ""))

        expect(
            identical.map(([key]) => `${key}: both say "${EN[key]}"`),
            "these keys hold the same sentence in both catalogues, which means one was pasted " +
                "into the other. Translate the German one.",
        ).toEqual([])
    })

    it("is referenced from src/ outside src/i18n/, so none is dead", () => {
        const { files: entries, text } = srcOutsideI18n()

        // Anti-vacuity in the silent direction: a mis-globbed scan reads nothing
        // and makes every key look dead, or reads everything and makes every key
        // look alive.
        expect(entries.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no dh_ reference at all").toContain("dh_patchWeightTitle")

        const unreferenced = NEW_KEYS.map(([key]) => key).filter((key) => !text.includes(key))

        expect(
            unreferenced,
            `these keys are in the catalogues but nowhere in src/: ${unreferenced.join(", ")}\n` +
                "A dead key is a promise the app does not keep. Either wire it up or delete it " +
                "from de.ts and en.ts.",
        ).toEqual([])
    })
})

describe("the recommendations header keys are in both catalogues", () => {
    it("holds the exact agreed value in de.ts and en.ts", () => {
        for (const [key, dePrompt, enPrompt] of [
            ...RECO_TABLE_KEYS,
            ...REUSED_COLUMN_KEYS.map(([key, de_, en_]) => [key, de_, en_] as const),
        ]) {
            expect(DE[key], `de.ts has no ${key}`).toBe(dePrompt)
            expect(EN[key], `en.ts has no ${key}`).toBe(enPrompt)
        }
    })

    it("names the same twelve columns in the key lists and in the column order", () => {
        // Ties the three constants together. RECO_TABLE_HEADER_KEYS is written
        // out by hand, because the two reused keys sit INSIDE the run rather
        // than after it - so without this, the order list and the data lists
        // could drift apart and each would still test itself happily.
        const declared = [
            ...RECO_TABLE_KEYS.map(([key]) => key),
            ...REUSED_COLUMN_KEYS.map(([key]) => key),
        ]

        expect(
            [...RECO_TABLE_HEADER_KEYS].sort(),
            "RECO_TABLE_HEADER_KEYS (column order) and RECO_TABLE_KEYS + REUSED_COLUMN_KEYS (the " +
                "data) no longer describe the same set of columns. Update both.",
        ).toEqual([...declared].sort())
        expect(RECO_TABLE_KEYS.length, "the dh_recoTable family should hold ten keys").toBe(10)
    })

    it("keeps the confidence and reasons columns on their older, shared keys", () => {
        // The specific thing a future author is likely to get wrong: the two
        // columns that are NOT dh_recoTable* look like an oversight, and
        // "finishing the family" would rename them and change the words on the
        // way past. tbl_confidence in particular is shared - the five sibling
        // tables below render the very same sampleSizeLabel cell under it, and
        // the recommendations table joined them rather than inventing an
        // eleventh spelling for one screen. Renaming it here would split a
        // vocabulary that is currently consistent across six tables.
        const source = code(DRAFT_HELPER)

        for (const [key, deValue, enValue, why] of REUSED_COLUMN_KEYS) {
            expect(
                source,
                `${DRAFT_HELPER} no longer renders ${key} in its header row (${why}). If the ` +
                    "column was renamed into the dh_recoTable* family, put it back: reusing the " +
                    "existing key is the point.",
            ).toContain(`t("${key}")`)
            expect(DE[key], `de.${key} changed`).toBe(deValue)
            expect(EN[key], `en.${key} changed`).toBe(enValue)
        }

        expect(
            DE.dh_recoTableSample ?? EN.dh_recoTableSample,
            "dh_recoTableSample is back in a catalogue. That column is not a sample count: the " +
                "cell under it renders sample_veryLow / sample_low / sample_moderate / " +
                "sample_good, which say 'Aussagekraft' and 'Trend'. It belongs under " +
                `${CONFIDENCE_COLUMN_KEY} with the five sibling tables.`,
        ).toBeUndefined()

        const withoutConfidence = CONFIDENCE_COLUMN_SIBLINGS.filter(
            (rel) => !code(rel).includes(`t("${CONFIDENCE_COLUMN_KEY}")`),
        )
        expect(
            withoutConfidence,
            `these tables no longer share ${CONFIDENCE_COLUMN_KEY}: ${withoutConfidence.join(", ")}\n` +
                "The shared key is the reason the recommendations table reuses it. If the sharing " +
                "ended, the reasoning above needs revisiting rather than quietly rotting.",
        ).toEqual([])
    })

    it("is present in both catalogues, in both directions", () => {
        const keys = RECO_TABLE_KEYS.map(([key]) => key)
        const onlyInDe = keysMissingFrom(keys, DE, EN)
        const onlyInEn = keysMissingFrom(keys, EN, DE)

        expect(onlyInDe, `in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
    })

    it("carries no {placeholder} - these are one-word column headings", () => {
        // Twelve columns share one horizontally scrolling row, so every value
        // here is a bare noun handed straight to t(). Nothing substitutes into
        // a table header; a stray `{` would ship to the screen as a hole.
        for (const [lang, dict] of LANGS) {
            for (const [key] of RECO_TABLE_KEYS) {
                expect(
                    placeholdersOf(dict[key] ?? ""),
                    `${lang}.${key} carries a placeholder: "${dict[key]}". No caller substitutes ` +
                        "one into a column heading, so it would render literally.",
                ).toEqual([])
            }
        }
    })

    it("says something different in DE and EN, apart from the loanwords", () => {
        // The copy-paste check, narrowed. Ten keys added to two files in one
        // sitting is exactly where the German ends up in the English catalogue -
        // but four of these genuinely read the same in both, so a blanket "DE
        // must differ from EN" would be a false alarm four times over and would
        // get switched off. Only the six that carry real German are checked.
        const translated = RECO_TABLE_KEYS.filter(([key]) => !IDENTICAL_BY_DESIGN_KEYS.has(key))
        const identical = translated.filter(([key]) => sameSentence(DE[key] ?? "", EN[key] ?? ""))

        expect(
            translated.length,
            "IDENTICAL_BY_DESIGN now covers every dh_recoTable key, so this check compares " +
                "nothing at all. Either a real translation was reverted or the list has grown " +
                "past what it was for.",
        ).toBe(RECO_TABLE_KEYS.length - IDENTICAL_BY_DESIGN.length)
        expect(
            identical.map(([key]) => `${key}: both say "${EN[key]}"`),
            "these keys hold the same sentence in both catalogues and are not on the loanword " +
                "list, which means one was pasted into the other. Translate the German one.",
        ).toEqual([])
    })

    it("still reads identically in both catalogues for exactly those loanwords", () => {
        // The other half of the list, and the half that makes it honest. An
        // entry that HAS been translated must leave, or the exemption outlives
        // the reason for it and silently covers the next paste-in. Failing here
        // is the good outcome: delete the entry, and the check above starts
        // demanding a difference for that key.
        for (const [key, why] of IDENTICAL_BY_DESIGN) {
            expect(
                RECO_TABLE_KEYS.map(([entry]) => entry),
                `IDENTICAL_BY_DESIGN lists ${key}, which is not a recommendations table header.`,
            ).toContain(key)
            expect(
                sameSentence(DE[key] ?? "", EN[key] ?? ""),
                `IDENTICAL_BY_DESIGN says ${key} is a loanword (${why}), but de.ts says ` +
                    `"${DE[key]}" and en.ts says "${EN[key]}". If that is a deliberate ` +
                    "translation, delete the entry from IDENTICAL_BY_DESIGN and update " +
                    "RECO_TABLE_KEYS; the DE/EN difference check will then cover it.",
            ).toBe(true)
        }
    })

    it("gives all twelve columns of the row a label of their own, per language", () => {
        // Two columns reading the same word is the failure this whole change was
        // about, one language at a time instead of two languages at once. Two
        // labels can only collide if somebody edits a value, so this is checked
        // as catalogue data rather than as source text.
        for (const [lang, dict] of LANGS) {
            const labels = RECO_TABLE_HEADER_KEYS.map((key) => dict[key] ?? "")
            const collisions = duplicatesOf(labels)

            expect(
                collisions,
                `${lang}.ts gives two recommendation columns the same heading: ` +
                    `${collisions.map((label) => `"${label}"`).join(", ")}\n` +
                    "Twelve columns need twelve distinguishable labels - a reader cannot tell " +
                    "which number belongs to which column otherwise.",
            ).toEqual([])
        }
    })

    it("is referenced from src/ outside src/i18n/, so none is dead", () => {
        const { files, text } = srcOutsideI18n()

        expect(files.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no dh_ reference at all").toContain("dh_patchWeightTitle")

        const unreferenced = RECO_TABLE_HEADER_KEYS.filter((key) => !text.includes(key))

        expect(
            unreferenced,
            `these header keys are in the catalogues but nowhere in src/: ${unreferenced.join(", ")}\n` +
                "A dead key is a promise the app does not keep. Either wire it up or delete it " +
                "from de.ts and en.ts.",
        ).toEqual([])
    })
})

/* ==========================================================================
 * 2. DraftHelper.tsx has no hardcoded heading left
 * ========================================================================== */

describe("DraftHelper headings come from the catalogue", () => {
    it("has no heading containing a bare text literal", () => {
        const offenders = headingsWithBareText(code(DRAFT_HELPER))

        expect(
            offenders.map(({ element, literal }) => `${element}  ->  "${literal}"`),
            "these headings print text the catalogue does not own:\n" +
                offenders.map(({ element }) => element).join("\n") +
                "\nWrap it in t(): add the key to src/i18n/de.ts and src/i18n/en.ts and render " +
                '`<h3>{t("dh_title_…")}</h3>`. A heading\'s children must be an expression, ' +
                "never words typed into the JSX - those cannot follow the language switch.",
        ).toEqual([])
    })

    it("still has the headings it is supposed to have", () => {
        // Anti-vacuity for the rule above: "no heading holds a literal" is also
        // satisfied by a file with no headings at all. This pins that the four
        // rewired ones are still rendered, through t(), with their own key.
        const source = code(DRAFT_HELPER)
        for (const [key] of NEW_KEYS) {
            if (key === "dh_pPresetsAriaLabel") continue // section 3 owns that one
            expect(
                source,
                `${DRAFT_HELPER} no longer renders ${key}. If the section was removed, delete the ` +
                    "key from both catalogues too; the dead-key check in section 1 will otherwise " +
                    "report it.",
            ).toContain(`t("${key}")`)
        }
    })

    it("no longer writes the four former heading literals as JSX text", () => {
        // The direct form of the bug. Exact equality on a trimmed text run, not
        // a substring search, and that distinction is load-bearing:
        //
        //   `<span className="stat-label">Blue Draft Edge</span>`  (line ~1683)
        //   `<span className="stat-label">Red Draft Edge</span>`   (line ~1687)
        //
        // are STILL hardcoded in this file. They are stat-card labels, not
        // headings, and they belong to the untranslated area section 4 pins.
        // A `includes("Draft Edge")` here would fail on them and teach whoever
        // hits it that this guard is the thing in the way.
        const runs = jsxTextRuns(code(DRAFT_HELPER))
        const reintroduced = FORMER_HEADING_LITERALS.filter((literal) => runs.includes(literal))

        expect(
            reintroduced,
            `these heading literals are back as JSX text: ${reintroduced.join(", ")}\n` +
                "They moved to dh_title_draftCockpit / dh_title_draftEdge / dh_title_teamIdentity " +
                "/ dh_title_compChecks in 0.5.6. Render them through t().",
        ).toEqual([])
    })
})

/* ==========================================================================
 * 3. No aria-label is a string literal
 *
 * PatchWeightPanel first, because that is the one this change fixed, then the
 * whole component tree, because the defect class is invisible by construction.
 * ========================================================================== */

/**
 * The `aria-label` string literals that are STILL in src/components/, each with
 * what it says and why it is on the list rather than fixed.
 *
 * This is a known-issues list, NOT approval. Every one of these is announced to
 * a screen reader in whatever language it was typed in, no matter what the
 * language switch says - and three of them are typed in German, so an English
 * user hears German. Fixing them was not this change's job (0.5.6 rewired the
 * Draft Cockpit); pinning them is, so the count cannot quietly grow.
 *
 * THE RULE FOR THIS LIST: it may shrink, never grow. The rot check below fails
 * when an entry has been fixed, so the fix and the deletion happen together.
 *
 * NOT COVERED, and worth knowing: `src/App.tsx:266` carries
 * `aria-label="Ansichten"` on the tab nav - the same defect, one directory up.
 * The scan is scoped to src/components/** as commissioned, so a new violator in
 * App.tsx would not be caught here.
 */
const ARIA_LABEL_LITERALS: ReadonlyArray<readonly [file: string, label: string, why: string]> = [
    [
        "ChampionDetail.tsx",
        "Close",
        "English literal on the modal close button; needs a key, e.g. next to ds_dismiss",
    ],
    [
        "common/ChampionCombobox.tsx",
        "Clear",
        "English literal on the clear-input button, same treatment as above",
    ],
    [
        "draft/DraftFlowPanel.tsx",
        "Draft-Flow",
        "German compound on the flow tablist; reads as German to an English screen reader",
    ],
    [
        "draft/RecommendationSideToggle.tsx",
        "Empfehlungsseite",
        "plainly German; the exact defect dh_pPresetsAriaLabel just fixed next door",
    ],
    [
        "draft/ScoreWeightPanel.tsx",
        "Wichtungs-Presets",
        "plainly German, and the sibling of the panel this change fixed",
    ],
]

const ARIA_ALLOWLIST = new Map(ARIA_LABEL_LITERALS.map(([file, label]) => [file, label]))

/** Every component file that hands `aria-label` a string literal, with its labels. */
const ariaLabelOffenders = (): ReadonlyArray<readonly [file: string, labels: string[]]> =>
    componentFiles()
        .map((rel) => [rel, ariaLabelLiterals(code(rel))] as const)
        .filter(([, labels]) => labels.length > 0)

describe("PatchWeightPanel takes its aria-label from the catalogue", () => {
    it("writes no aria-label string literal at all", () => {
        const literals = ariaLabelLiterals(code(PATCH_WEIGHT_PANEL))

        expect(
            literals,
            `${PATCH_WEIGHT_PANEL} hands aria-label a string literal: ${literals.join(", ")}\n` +
                'It must be an expression - aria-label={t("dh_pPresetsAriaLabel")}. A literal here ' +
                "shipped German to every English screen reader, and nothing on screen showed it.",
        ).toEqual([])
    })

    it("still labels its tablist, through t()", () => {
        // Anti-vacuity: "no literal" is also satisfied by deleting the attribute,
        // which would leave the preset tablist unlabelled - a worse outcome for
        // exactly the user this guard is for.
        expect(
            code(PATCH_WEIGHT_PANEL),
            `${PATCH_WEIGHT_PANEL} no longer labels its tablist. Deleting the aria-label is not ` +
                "the fix for a hardcoded one.",
        ).toMatch(/aria-label=\{\s*t\(\s*"dh_pPresetsAriaLabel"\s*\)\s*\}/)
    })
})

describe("no component hands aria-label a string literal", () => {
    it("has no violator outside the known-issues list", () => {
        const unexpected = ariaLabelOffenders()
            .filter(([file]) => !ARIA_ALLOWLIST.has(file))
            .map(([file, labels]) => `${file}: ${labels.map((l) => `"${l}"`).join(", ")}`)

        expect(
            unexpected,
            `these components hand aria-label a string literal:\n${unexpected.join("\n")}\n` +
                'Use an expression: aria-label={t("some_key")}. An aria-label is untranslated by ' +
                "construction and a screen reader is the one place nobody notices, which is why " +
                "this rule covers all of src/components/ and not just the file that was changed.\n" +
                "ARIA_LABEL_LITERALS is a shrink-only known-issues list. Do not add to it.",
        ).toEqual([])
    })

    it("every known-issues entry still has the literal it claims", () => {
        // The rot check, in both directions. An entry that has been fixed exempts
        // nothing and hides the next violator to arrive in that file, which is
        // how a list like this stops meaning anything.
        const found = new Map(ariaLabelOffenders())

        for (const [file, label, why] of ARIA_LABEL_LITERALS) {
            expect(
                found.get(file),
                `ARIA_LABEL_LITERALS lists ${file} ("${label}" - ${why}), which no longer hands ` +
                    "aria-label a string literal. Good - now delete the entry. This list may " +
                    "shrink, never grow.",
            ).toContain(label)
        }
    })

    it("the scan finds the violators it is pinned against", () => {
        // Anti-vacuity for the pair above: if ariaLabelLiterals() stopped
        // matching, "no unexpected violator" would pass in silence and the rot
        // check would be the only thing left standing. This states the number.
        expect(
            ariaLabelOffenders().length,
            "the aria-label scan found nothing at all in src/components/. Either every literal " +
                "was fixed - in which case empty ARIA_LABEL_LITERALS and this number together - " +
                "or the predicate has gone blind.",
        ).toBe(ARIA_LABEL_LITERALS.length)
    })
})

/* ==========================================================================
 * 4. The recommendations table header row, guarded from the other side
 *
 * Two assertions here were TODO pins in 0.5.6: "exactly eleven bare-text <th>"
 * and "still shows German 'Rolle' next to English 'Role' in the same header
 * row". They named the defect and held its extent so it could not grow while
 * somebody got around to it.
 *
 * 0.5.7 got around to it. Both were turned into their opposite rather than
 * deleted, because a pin that is simply removed on the day it is satisfied
 * leaves nothing behind that knows the row was ever broken, and the next person
 * to add a column has no reason not to type the label straight into the JSX.
 * ========================================================================== */

describe("the recommendations table header comes from the catalogue", () => {
    it("writes no bare-text <th> anywhere in the file", () => {
        // The zero pin. Same predicate as the eleven-count it replaces, so it
        // is still multi-line safe: a header cell reformatted across three
        // lines cannot slip past it.
        const bare = elementsWithBareText(code(DRAFT_HELPER), "th")

        expect(
            bare.map(({ element, literal }) => `${element}  ->  "${literal}"`),
            `${DRAFT_HELPER} writes ${bare.length} <th> label(s) that no catalogue owns:\n` +
                bare.map(({ element }) => element).join("\n") +
                "\nUp to 0.5.6 there were eleven, and two of them printed a German 'Rolle' next " +
                "to an English 'Role' in the same header row of BOTH language builds. That is " +
                "what hardcoded table copy looks like once it has been there a while.\n" +
                "Add the key to src/i18n/de.ts and src/i18n/en.ts and render " +
                '`<th>{t("dh_recoTable…")}</th>` like the other twelve columns. Words typed into ' +
                "JSX cannot follow the language switch.",
        ).toEqual([])
    })

    it("renders all twelve column headings through t(), in column order", () => {
        // Anti-vacuity for the rule above, and it is needed twice over:
        //
        //  - "no bare-text <th>" is also satisfied by a file with no table in
        //    it, so deleting the header row would turn this section green,
        //  - a <th> rendering something that is neither literal text nor a t()
        //    call - `<th>{label}</th>` - is invisible to BOTH checks, which is
        //    why the raw cell count is asserted next to the key list.
        const source = code(DRAFT_HELPER)
        const cells = thChildren(source)
        const keys = thTranslationKeys(source)

        expect(
            cells.length,
            `${DRAFT_HELPER} has ${cells.length} <th> elements, not ${RECO_TABLE_HEADER_KEYS.length}. ` +
                "If a column was added, give it a key and add it to RECO_TABLE_KEYS. If the header " +
                "row was removed, every other assertion in this section became vacuous.",
        ).toBe(RECO_TABLE_HEADER_KEYS.length)

        expect(
            keys,
            "the recommendations header row no longer renders exactly these twelve keys in this " +
                "order. Every <th> must be nothing but one t() call, and the order is the column " +
                "order the labels describe.",
        ).toEqual([...RECO_TABLE_HEADER_KEYS])
    })

    it("keeps the role column and the role-strength column on two separate keys", () => {
        // WHY THIS PAIR AND NOT ANY OTHER: these two columns are the reason the
        // old pin existed. Column 2 is the champion's ROLE
        // (`ROLE_LABELS[entry.role]`), column 5 is the role-stats SCORE
        // (`formatScore(entry.roleStatsScore)`). Two different quantities that
        // happened to read `Rolle` and `Role` - close enough that "tidying" them
        // onto one key looks like a cleanup rather than the loss of a column's
        // meaning, and close enough that nobody noticed one was German and the
        // other English for as long as they were literals.
        //
        // Collapsing them can happen two ways, so both are checked: one key
        // rendered twice (the source side) and two keys carrying one label (the
        // catalogue side).
        const keys = thTranslationKeys(code(DRAFT_HELPER))

        for (const key of [ROLE_COLUMN_KEY, ROLE_STRENGTH_COLUMN_KEY]) {
            expect(
                keys,
                `the recommendations header row no longer renders ${key}. The role column and ` +
                    "the role-strength column are different quantities and need one key each; " +
                    "merging them drops a column heading rather than simplifying anything.",
            ).toContain(key)
        }

        const repeated = duplicatesOf(keys)
        expect(
            repeated,
            `these header keys are rendered more than once: ${repeated.join(", ")}\n` +
                "Two columns pointing at one key is how the pair collapses in the source.",
        ).toEqual([])

        for (const [lang, dict] of LANGS) {
            expect(
                dict[ROLE_COLUMN_KEY],
                `${lang}.ts gives ${ROLE_COLUMN_KEY} and ${ROLE_STRENGTH_COLUMN_KEY} the same ` +
                    `label ("${dict[ROLE_COLUMN_KEY]}"). One names the champion's role, the other ` +
                    "scores how the champion performs in it. Keep them told apart on screen; " +
                    "dh_wLabel_roleStats is the wording the matching weight slider uses.",
            ).not.toBe(dict[ROLE_STRENGTH_COLUMN_KEY])
        }
    })
})

/* ==========================================================================
 * 4b. TODO: hardcoded copy this change did NOT fix, pinned so it cannot grow
 *
 * One area of DraftHelper.tsx was audited and deliberately left alone: the
 * recommendation subtitle and the stat-card labels. Mixing them into the header
 * row pass would have made the diff unreviewable, and they need a decision about
 * their own wording first.
 *
 * Nothing here is approval. The assertion goes red in BOTH directions - when
 * somebody copies the line into a second place, and when somebody finally
 * translates it - and the second is the good outcome. Delete the pin then.
 * ========================================================================== */

describe("TODO: hardcoded copy in DraftHelper, pinned at its current extent", () => {
    it("still prints the untranslated 'Score … Picks' line under each recommendation", () => {
        // `{ROLE_LABELS[entry.role]} · Score {formatScore(…)} · {entry.games} Picks`
        // at roughly line 1545. Two English words welded into a JSX line that
        // otherwise renders translated values, so a German user reads
        // "Mid · Score 0.82 · 41 Picks".
        //
        // Pinned by its markers rather than by a text-run scan on purpose: the
        // trailing `Picks` ends the line, and a per-line run needs a following
        // `<` or `{` to close - so the run scan cannot see it. A pin that cannot
        // see half of what it pins is worse than no pin.
        const source = code(DRAFT_HELPER)

        for (const marker of ["· Score ", "} Picks"]) {
            expect(
                source,
                `the hardcoded "${marker}" is gone from ${DRAFT_HELPER}. If you translated the ` +
                    "recommendation subtitle, delete this assertion - it exists only to stop the " +
                    "line being copied into a second place while it is still hardcoded.",
            ).toContain(marker)
        }
    })
})

/* ==========================================================================
 * 5. Anti-vacuity: every predicate above, proven able to go red
 *
 * Synthetic sources, deliberately wrong, fed through the EXACT functions the
 * assertions use - plus inverse fixtures proving they do NOT fire on
 * legitimate code. Same idea, and the same reason, as the closing block of
 * tests/appLocaleGuards.test.ts.
 * ========================================================================== */

describe("the guards can go red", () => {
    it("catches a heading written as a text literal", () => {
        expect(headingsWithBareText("<h2>Draft Cockpit</h2>")).toHaveLength(1)
        expect(headingsWithBareText("<h3>Comp Checks</h3>")[0].literal).toBe("Comp Checks")
        expect(headingsWithBareText('<h3 className="x">Team Identity</h3>')).toHaveLength(1)
        // German too - the mirror mistake is just as invisible to tsc.
        expect(headingsWithBareText("<h4>Team-Identität</h4>")[0].literal).toBe("Team-Identität")
        // Multi-line, which a per-line scan alone would miss.
        expect(
            headingsWithBareText(["<h3", '    className="muted"', ">", "    Draft Edge", "</h3>"].join("\n")),
        ).toHaveLength(1)
        // Half literal, half expression is still half hardcoded.
        expect(headingsWithBareText('<h3>Draft Edge {t("dh_x")}</h3>')[0].literal).toBe("Draft Edge")
    })

    it("does NOT fire on a heading rendered through t()", () => {
        expect(headingsWithBareText('<h2>{t("dh_title_draftCockpit")}</h2>')).toEqual([])
        expect(headingsWithBareText("<h3>{ROLE_LABELS[role]}</h3>")).toEqual([])
        expect(
            headingsWithBareText('<h3>{t("dh_bestBansTitle")} {sideLabel(oppositeSide(side))}</h3>'),
        ).toEqual([])
        // Nested braces must not leave residue behind.
        expect(headingsWithBareText("<h3>{cond ? t({ a: 1 }) : null}</h3>")).toEqual([])
        // `<hr />` is not a heading, and neither is `<thead>` a `<th>`.
        expect(headingsWithBareText("<hr />")).toEqual([])
        expect(elementsWithBareText("<thead><tr></tr></thead>", "th")).toEqual([])
    })

    it("catches a bare <th> and lets a translated one through", () => {
        expect(elementsWithBareText("<th>Rolle</th>", "th")[0].literal).toBe("Rolle")
        expect(elementsWithBareText('<th>{t("dh_tableReasons")}</th>', "th")).toEqual([])
        // The row as DraftHelper.tsx wrote it until 0.5.7, including the two
        // that made the defect visible: a German label three columns from an
        // English one. The zero pin in section 4 must be able to see all of it.
        const oldRow = [
            "<th>Champion</th>",
            "<th>Rolle</th>",
            "<th>Total</th>",
            "<th>Priority</th>",
            "<th>Role</th>",
        ].join("\n")
        expect(elementsWithBareText(oldRow, "th").map(({ literal }) => literal)).toEqual([
            "Champion",
            "Rolle",
            "Total",
            "Priority",
            "Role",
        ])
        // Reformatted across lines, which a per-line scan alone would miss.
        expect(
            elementsWithBareText(["<th", '    className="num"', ">", "    Winrate", "</th>"].join("\n"), "th"),
        ).toHaveLength(1)
    })

    it("counts every <th> and reads the key out of a translated one", () => {
        const row = [
            '<th>{t("dh_recoTableChampion")}</th>',
            '<th>{t("dh_recoTableRole")}</th>',
            '<th>{t("dh_tableReasons")}</th>',
        ].join("\n")

        expect(thChildren(row)).toHaveLength(3)
        expect(thTranslationKeys(row)).toEqual([
            "dh_recoTableChampion",
            "dh_recoTableRole",
            "dh_tableReasons",
        ])
        // Attributes, line breaks and padding inside the call do not hide it.
        expect(thTranslationKeys('<th className="num">\n    {t( "dh_recoTableWinrate" )}\n</th>')).toEqual([
            "dh_recoTableWinrate",
        ])
        expect(thChildren("<thead><tr></tr></thead>")).toEqual([])
    })

    it("refuses to count a <th> that is not exactly one t() call", () => {
        // The gap the raw cell count in section 4 exists to close. A cell that
        // renders a variable is neither bare text the zero pin can see nor a key
        // the order check can see, so only `thChildren().length` notices it.
        expect(thTranslationKeys("<th>{label}</th>")).toEqual([])
        expect(thTranslationKeys("<th>{t(key)}</th>")).toEqual([])
        expect(thChildren("<th>{label}</th>")).toHaveLength(1)
        // Half literal, half call: not a key here, and a violation over there.
        expect(thTranslationKeys('<th>Rolle {t("dh_recoTableRole")}</th>')).toEqual([])
        expect(
            elementsWithBareText('<th>Rolle {t("dh_recoTableRole")}</th>', "th")[0].literal,
        ).toBe("Rolle")
    })

    it("catches the role columns collapsing onto one key", () => {
        // The exact mutation section 4 guards: dh_recoTableRoleStrength edited
        // back to dh_recoTableRole, which leaves the row one key short and one
        // key twice over.
        const collapsed = [
            '<th>{t("dh_recoTableRole")}</th>',
            '<th>{t("dh_recoTablePriority")}</th>',
            '<th>{t("dh_recoTableRole")}</th>',
        ].join("\n")
        const keys = thTranslationKeys(collapsed)

        expect(keys).not.toContain(ROLE_STRENGTH_COLUMN_KEY)
        expect(duplicatesOf(keys)).toEqual([ROLE_COLUMN_KEY])
        // …and the healthy row reports nothing, in the source and in both
        // catalogues, which is what the section-4 and section-1 pairs assert.
        expect(duplicatesOf(RECO_TABLE_HEADER_KEYS)).toEqual([])
        for (const [, dict] of LANGS) {
            expect(duplicatesOf(RECO_TABLE_HEADER_KEYS.map((key) => dict[key] ?? ""))).toEqual([])
        }
        expect(duplicatesOf(["Rolle", "Gesamt", "Rolle", "Rolle"])).toEqual(["Rolle"])
    })

    it("catches an aria-label string literal in either quote style", () => {
        expect(ariaLabelLiterals('<div aria-label="Patch-Gewichtungs-Presets">')).toEqual([
            "Patch-Gewichtungs-Presets",
        ])
        expect(ariaLabelLiterals("<button aria-label='Close' />")).toEqual(["Close"])
        expect(ariaLabelLiterals('<div aria-label = "Empfehlungsseite">')).toEqual([
            "Empfehlungsseite",
        ])
        // Two on one line are two findings, not one.
        expect(
            ariaLabelLiterals('<a aria-label="Clear" /><b aria-label="Draft-Flow" />'),
        ).toHaveLength(2)
    })

    it("does NOT fire on an aria-label expression, or on aria-labelledby", () => {
        expect(ariaLabelLiterals('aria-label={t("dh_pPresetsAriaLabel")}')).toEqual([])
        expect(ariaLabelLiterals("aria-label={label}")).toEqual([])
        expect(ariaLabelLiterals('aria-label={`${t("scout_assignTo")}: ${name}`}')).toEqual([])
        // An id reference names an element; it is not copy, and it is not this
        // rule's business. ScoutReparseDialog.tsx has one.
        expect(ariaLabelLiterals('aria-labelledby="scout-reparse-title"')).toEqual([])
    })

    it("catches a key that only one catalogue has", () => {
        const deOnly = { dh_title_draftEdge: "Draft-Edge", dh_ghost: "Geist" }
        const enOnly = { dh_title_draftEdge: "Draft Edge" }
        const keys = ["dh_title_draftEdge", "dh_ghost"]

        expect(keysMissingFrom(keys, deOnly, enOnly)).toEqual(["dh_ghost"])
        expect(keysMissingFrom(keys, enOnly, deOnly)).toEqual([])
    })

    it("catches a DE value pasted into the EN catalogue", () => {
        // The exact shape of the mistake: five keys, two files, one sitting.
        expect(sameSentence("Team-Identität", "Team-Identität")).toBe(true)
        expect(sameSentence("Draft-Cockpit", "draft-cockpit")).toBe(true)
        // …and the real, correct pairs stay quiet.
        expect(sameSentence("Team-Identität", "Team Identity")).toBe(false)
        expect(sameSentence("Patch-Gewichtungs-Presets", "Patch weighting presets")).toBe(false)
        expect(sameSentence("Draft-Cockpit", "Draft Cockpit")).toBe(false)
        // The header row needs both answers. `Rolle`/`Role` is a real
        // translation, `Winrate`/`Winrate` is a loanword that is meant to look
        // untranslated - which is why IDENTICAL_BY_DESIGN names the four rather
        // than the check being loosened for all ten.
        expect(sameSentence("Rolle", "Role")).toBe(false)
        expect(sameSentence("Rollenstärke", "Role Strength")).toBe(false)
        expect(sameSentence("Team-Pool", "Team Pool")).toBe(false)
        expect(sameSentence("Winrate", "Winrate")).toBe(true)
        expect(sameSentence("Matchup", "Matchup")).toBe(true)
    })

    it("catches a stray placeholder on a plain label", () => {
        expect(placeholdersOf("Draft-Cockpit {count}")).toEqual(["{count}"])
        expect(placeholdersOf("Draft-Cockpit")).toEqual([])
        // `{a b}` is not substituted at runtime, so it is not one here either.
        expect(placeholdersOf("Draft {von hier}")).toEqual([])
    })

    it("catches a reintroduced heading literal, and tolerates the stat-card labels", () => {
        expect(jsxTextRuns('<h3 className="x">Draft Edge</h3>')).toContain("Draft Edge")
        expect(jsxTextRuns("<h2>Draft Cockpit</h2>")).toContain("Draft Cockpit")
        // The two that are still in the file, and must not be read as the
        // heading coming back. This is what makes the exact-equality check in
        // section 2 the right one.
        const statCards = [
            '<span className="stat-label">Blue Draft Edge</span>',
            '<span className="stat-label">Red Draft Edge</span>',
        ].join("\n")
        expect(jsxTextRuns(statCards)).toEqual(["Blue Draft Edge", "Red Draft Edge"])
        expect(jsxTextRuns(statCards)).not.toContain("Draft Edge")
        // An expression is not a text run.
        expect(jsxTextRuns('<h2>{t("dh_title_draftCockpit")}</h2>')).toEqual([])
    })

    it("strips comments, and the stripping is load-bearing", () => {
        // Prose that documents the rule by quoting the wrong code. Without the
        // stripper this file would fail on exactly the sentences that exist to
        // stop the bug coming back - and the obvious "fix" would be deleting
        // them. See the module header.
        const documented = [
            "/** Before 0.5.6 this said `<h2>Draft Cockpit</h2>`. */",
            '// It carried aria-label="Patch-Gewichtungs-Presets", i.e. German for everyone.',
            "/* <th>Rolle</th> sits next to <th>Role</th>; both were hardcoded. */",
            '// The fix reads `<th>{t("dh_recoTableRole")}</th>`.',
        ].join("\n")
        const stripped = stripComments(documented)

        expect(headingsWithBareText(stripped)).toEqual([])
        expect(ariaLabelLiterals(stripped)).toEqual([])
        expect(elementsWithBareText(stripped, "th")).toEqual([])
        expect(jsxTextRuns(stripped).filter((run) => run === "Draft Cockpit")).toEqual([])
        // Cuts the other way too: prose that quotes the CORRECT code must not
        // be able to satisfy the section-4 anti-vacuity check on its own.
        expect(thChildren(stripped)).toEqual([])
        expect(thTranslationKeys(stripped)).toEqual([])

        // …and the same text WITHOUT stripping fails, which is what makes the
        // stripping load-bearing rather than decorative.
        expect(headingsWithBareText(documented)).toHaveLength(1)
        expect(ariaLabelLiterals(documented)).toEqual(["Patch-Gewichtungs-Presets"])
        expect(elementsWithBareText(documented, "th")).toHaveLength(2)
        expect(thTranslationKeys(documented)).toEqual(["dh_recoTableRole"])
    })
})
