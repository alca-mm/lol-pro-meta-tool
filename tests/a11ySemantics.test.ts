/**
 * ARIA semantics guards for the 0.6.3 accessibility pass.
 *
 * WHAT 0.6.3 CHANGED, and why each half needs a guard
 *
 * Until 0.6.3 this repo held four `<div className="role-filter-tabs">` rows
 * carrying an `aria-label` and NO role. tests/draftHelperI18n.test.ts said so in
 * prose: an `aria-label` on an element that maps to role `generic` is prohibited
 * by ARIA 1.2 and dropped by every current browser, so those four labels were
 * translated but inaudible. 0.6.3 gave them roles:
 *
 *  1. src/components/draft/RecommendationSideToggle.tsx became a
 *     `role="radiogroup"` whose two `<button>` are `role="radio"` with
 *     `aria-checked` bound to the live side. It is an EXCLUSIVE two-state
 *     choice, which is the one thing `role="group"` cannot express.
 *  2. DraftFlowPanel, ScoreWeightPanel and PatchWeightPanel became
 *     `role="group"` with the `aria-label` they already had.
 *  3. src/components/player-results/MatchTable.tsx gave its expand button
 *     `aria-expanded={isExpanded}` and a state-dependent accessible name.
 *
 * THE THREE FAILURE MODES THESE GUARDS EXIST FOR, in order of how quietly they
 * would happen:
 *
 *  - THE WRONG SEMANTICS COME BACK. The CSS class is called `role-filter-tabs`,
 *    so `role="tablist"` / `role="tab"` / `aria-selected` is the obvious-looking
 *    thing to reach for, and it is wrong here: a tablist obliges `aria-controls`
 *    pointing at real tabpanels and arrow-key roving, none of which exists. A
 *    half-built tablist promises keyboard behaviour the page does not deliver.
 *    Section 1 asserts those three tokens are absent by name.
 *  - A BOUND STATE ATTRIBUTE BECOMES A LITERAL. `aria-checked="true"` and
 *    `aria-expanded="true"` both compile, both render, and both are silently
 *    wrong forever: two radios that are BOTH announced as checked, and a
 *    collapse button that never stops saying "expanded". Nothing on screen
 *    changes. Sections 1 and 4 therefore check the VALUE SHAPE, not merely that
 *    the attribute is written.
 *  - A NEW PANEL SHIPS WITHOUT SEMANTICS. Section 3 sweeps every `.tsx` under
 *    `src/` rather than the four files 0.6.3 touched, so a fifth
 *    `role-filter-tabs` row that copies the old labelled-but-roleless shape is
 *    caught the day it lands.
 *
 * WHY THE OPENING TAG IS MATCHED AS A UNIT
 *
 * "the file contains role="group"" and "the file contains an aria-label" are two
 * facts that can both be true about a file in which they sit on DIFFERENT
 * elements - which is exactly the bug being guarded against, since three
 * `role-filter-tabs` rows in this repo deliberately have neither. Every pairing
 * assertion here therefore runs over {@link openingTags}, which returns each
 * `<div …>` / `<button …>` opening tag as one string, newlines and all. The
 * RecommendationSideToggle div spans four lines, so a single-line regex would
 * have been vacuous on the very element the change is about.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE EVERY SOURCE SCAN
 *
 * The 0.6.3 implementation documents its choices by NAMING the rejected ones:
 * the JSX comment in RecommendationSideToggle.tsx spells out `tablist`,
 * `aria-selected` and `aria-controls` as things deliberately not used, and
 * MatchTable.tsx's spells out `aria-controls` for the same reason. Section 1's
 * negative assertions run on comment-stripped source; on RAW source they would
 * go red on the prose that exists to stop the next person reintroducing the bug,
 * and the obvious "fix" would be deleting that prose. Verified empirically
 * before this file landed: the negative predicates DO match the raw sources and
 * do NOT match the stripped ones.
 *
 * Same decision, same reason, as tests/appLocaleGuards.test.ts,
 * tests/draftHelperI18n.test.ts and tests/playerResultsI18n.test.ts. The
 * `(?<!:)` lookbehind before `//` is copied from them verbatim and is not
 * decoration: without it a `https://` inside a string literal is read as the
 * start of a comment and the rest of that line is deleted before any predicate
 * sees it. Section 5 proves that with a mutant stripper rather than asserting it
 * in prose.
 *
 * WHAT THESE GUARDS CANNOT PROVE
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) with no
 * jsdom, so NOTHING IN THIS FILE RENDERS. These are source-TEXT scans. They show
 * that an attribute is written, that it is written on the same element as its
 * partner, and that its value is an expression rather than a literal. They do
 * NOT show that:
 *
 *  - the element is reached at runtime. A `false && (...)`, an early
 *    `return null` or a branch nobody hits would still pass here,
 *  - the bound expression evaluates to the RIGHT boolean. `aria-checked={false}`
 *    on both radios passes section 1's shape checks; only the extra assertion
 *    that each expression names `recommendationSide` and that the two differ
 *    narrows that, and even then the comparison could be inverted,
 *  - a screen reader announces any of it, or announces it usefully. Radio
 *    semantics without arrow-key roving are still incomplete for a keyboard
 *    user; that is a manual test in a real browser with a real screen reader,
 *  - the German or English copy is good. The values live in de.ts / en.ts and
 *    are owned by tests/draftHelperI18n.test.ts and
 *    tests/playerResultsI18n.test.ts. This file only asserts the keys EXIST in
 *    both catalogues, so a rename cannot leave an `aria-label` resolving to
 *    nothing.
 *
 * That honesty requirement is CLAUDE.md P4c, and the same caveat block sits at
 * the top of the three sibling guard files named above.
 */

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"

/* ==========================================================================
 * Reading the sources and the catalogues
 * ========================================================================== */

/**
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. Same two views, and the same
 * reason, as tests/draftHelperI18n.test.ts.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const LANGS: ReadonlyArray<readonly [lang: string, dict: Record<string, string>]> = [
    ["de", DE],
    ["en", EN],
]

const SRC = fileURLToPath(new URL("../src/", import.meta.url))

const read = (rel: string): string => readFileSync(SRC + rel.split("/").join(sep), "utf8")

/**
 * Remove line and block comments so a scan judges CODE only. See the module
 * header for why this is not optional in THIS file in particular.
 *
 * The `(?<!:)` lookbehind is copied from tests/appLocaleGuards.test.ts rather
 * than written fresh, because writing it fresh is how the repo ended up with a
 * stripper that ate everything after a `https://` for three versions. A single
 * slash (`"CS/min"`) is untouched: the pattern needs two.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, " ")

/**
 * The stripper WITHOUT the lookbehind, kept solely as a mutant for section 5.
 * Same device, same purpose, as NAIVE_STRIP_COMMENTS in
 * tests/draftHelperI18n.test.ts: without a mutant, "the lookbehind is there" is
 * a claim about a regex; with one, the swallowed attribute is in the failure
 * message.
 */
const naiveStripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")

const code = (rel: string): string => stripComments(read(rel))

/** Every `.tsx` under `src/`, relative to it, with `/` separators. */
const tsxFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => entry.endsWith(".tsx"))

/** Every `.ts`/`.tsx` under `src/`, relative to it, with `/` separators. */
const sourceFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.tsx?$/.test(entry))

/* ==========================================================================
 * The predicates
 *
 * Every rule below is a pure function, declared once and used BOTH by the real
 * assertions and by the synthetic fixtures in section 5. That is the whole
 * anti-vacuity mechanism: a scan whose regex has quietly stopped matching passes
 * in silence, and only a known-bad input tells "clean" from "blind".
 * ========================================================================== */

/**
 * Every opening tag of `tagName` in `source`, as one string each, INCLUDING
 * newlines inside the attribute run.
 *
 * WHY NOT `/<div\b[^>]*>/`: the div this change is really about is written
 * across four lines, and `[^>]*` would still have matched it - but it would also
 * truncate at a `>` inside an attribute expression (`style={{ width: a > b }}`),
 * and this project writes inline `style={{…}}` objects on these very elements.
 * So the scan walks the tag character by character, tracking quote state and
 * brace depth, and stops only at a `>` that is at brace depth 0 and outside any
 * string. `<div />` self-closes into the same shape.
 *
 * DELIBERATELY NAIVE about backslash escapes inside a string literal
 * (`className="a\"b"`). Nothing in `src/` does that, and the failure direction
 * is safe: a mis-read quote makes the tag run LONG, which shows up as a loud
 * mismatch rather than a silent pass.
 *
 * Whitespace is collapsed so a failure message fits on a line and so an
 * assertion cannot depend on how the JSX happens to be wrapped.
 */
function openingTags(source: string, tagName: string): string[] {
    const found: string[] = []
    for (const match of source.matchAll(new RegExp(`<${tagName}\\b`, "g"))) {
        const from = match.index ?? 0
        let index = from + match[0].length
        let depth = 0
        let quote: string | null = null
        while (index < source.length) {
            const character = source[index]
            if (quote !== null) {
                if (character === quote) quote = null
            } else if (character === '"' || character === "'" || character === "`") {
                quote = character
            } else if (character === "{") {
                depth += 1
            } else if (character === "}") {
                if (depth > 0) depth -= 1
            } else if (character === ">" && depth === 0) {
                break
            }
            index += 1
        }
        found.push(source.slice(from, Math.min(index + 1, source.length)).replace(/\s+/g, " ").trim())
    }
    return found
}

/**
 * The value of `attribute` on one opening tag, classified.
 *
 * `kind` is the point of the whole helper. `"literal"` means a quoted string was
 * written where React expects a value - `aria-checked="true"`, the mutant that
 * announces BOTH radios as checked - and `"expression"` means `{…}`, brace
 * balanced so a nested object or ternary does not truncate the text.
 * `"none"` means the attribute is absent, which is the other way to satisfy a
 * naive "no hardcoded value" check: delete the attribute.
 *
 * TWO BOUNDARIES, and the second one was a live bug caught by its own fixture
 * in section 5 rather than by reasoning. The trailing one is free: `aria-label`
 * cannot match `aria-labelledby`, because there the character after
 * `aria-label` is `l` and the pattern demands `\s*=`. The LEADING one is not:
 * `\b` sits happily between the `-` and the `r` of `data-role`, so a plain
 * `\brole\s*=` reads `data-role="filters"` as a role of `filters`. `(?<![\w-])`
 * refuses that, and refuses `x-aria-label` for the same reason.
 */
function attributeValue(
    tag: string,
    attribute: string,
): { kind: "literal" | "expression" | "none"; text: string } {
    const match = new RegExp(`(?<![\\w-])${attribute}\\s*=\\s*`).exec(tag)
    if (match === null) return { kind: "none", text: "" }

    const start = match.index + match[0].length
    const opener = tag[start]

    if (opener === '"' || opener === "'") {
        const end = tag.indexOf(opener, start + 1)
        return { kind: "literal", text: tag.slice(start + 1, end === -1 ? tag.length : end) }
    }

    if (opener === "{") {
        let depth = 1
        let index = start + 1
        while (index < tag.length && depth > 0) {
            if (tag[index] === "{") depth += 1
            else if (tag[index] === "}") depth -= 1
            index += 1
        }
        return { kind: "expression", text: tag.slice(start + 1, depth === 0 ? index - 1 : index).trim() }
    }

    // `aria-checked=true` without braces is not valid JSX and cannot compile,
    // so this branch is unreachable in real source. Reported rather than
    // swallowed, because a helper that silently calls the unknown shape "none"
    // would let a future JSX dialect walk past.
    return { kind: "literal", text: tag.slice(start).split(/\s/)[0] ?? "" }
}

const hasAttribute = (tag: string, attribute: string): boolean =>
    attributeValue(tag, attribute).kind !== "none"

/** True when `tag` carries `attribute="value"` exactly. */
const hasAttributeLiteral = (tag: string, attribute: string, value: string): boolean => {
    const found = attributeValue(tag, attribute)
    return found.kind === "literal" && found.text === value
}

/**
 * The `t("…")` key inside an attribute expression, or `null`.
 *
 * DELIBERATELY TOLERANT of the call being wrapped (a ternary, a template) - it
 * looks for `t("key")` anywhere in the expression rather than demanding the
 * expression BE that call. MatchTable's `aria-label` is a ternary over two keys
 * and has to read as valid; a pattern that insisted on the bare call would have
 * forced the label back to a state-independent one, which is the defect being
 * fixed. {@link translationKeysIn} is the plural form used there.
 */
const translationKeysIn = (expression: string): string[] =>
    [...expression.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"\s*\)/g)].map((match) => match[1])

/**
 * The three tokens that would mean somebody reached for tab semantics.
 *
 * `role="tab"` cannot match `role="tablist"` and vice versa - each pattern
 * demands the closing quote immediately after the word - so both are listed and
 * both mean different, equally wrong, things. `aria-selected` is listed
 * separately because it is the attribute a half-converted tablist keeps even
 * after somebody "fixes" the role.
 */
const TAB_SEMANTICS: ReadonlyArray<readonly [what: string, pattern: RegExp]> = [
    ['role="tablist"', /\brole\s*=\s*["']tablist["']/],
    ['role="tab"', /\brole\s*=\s*["']tab["']/],
    ["aria-selected", /\baria-selected\b/],
]

const tabSemanticsIn = (source: string): string[] =>
    TAB_SEMANTICS.filter(([, pattern]) => pattern.test(source)).map(([what]) => what)

/* ==========================================================================
 * The files and keys 0.6.3 touched
 * ========================================================================== */

const RECO_SIDE_TOGGLE = "components/draft/RecommendationSideToggle.tsx"
const MATCH_TABLE = "components/player-results/MatchTable.tsx"

/** The CSS class every one of these rows shares, and the trap in its name. */
const TAB_ROW_CLASS = 'className="role-filter-tabs"'

/**
 * The three rows that gained `role="group"`, with the key their label resolves
 * to.
 *
 * The key is pinned per file because a label pointing at a key that does not
 * exist renders as the key itself, which a screen reader reads out verbatim -
 * a failure mode with no visual symptom at all. The VALUES behind these keys
 * belong to tests/draftHelperI18n.test.ts; this file only proves the key is
 * carried by both catalogues.
 */
const GROUP_ROWS: ReadonlyArray<readonly [file: string, key: string]> = [
    ["components/draft/DraftFlowPanel.tsx", "dh_flowControlsAriaLabel"],
    ["components/draft/ScoreWeightPanel.tsx", "dh_wPresetsAriaLabel"],
    ["components/draft/PatchWeightPanel.tsx", "dh_pPresetsAriaLabel"],
]

/** The radiogroup's own label key. */
const RECO_SIDE_KEY = "dh_recoSideAriaLabel"

/**
 * The three `role-filter-tabs` rows that are DELIBERATELY out of scope, and why
 * they are exempt rather than forgotten.
 *
 * None of the three carries an `aria-label`, so none of them holds the defect
 * this pass fixed: an inaudible label. They are plain filter rows whose buttons
 * carry their own visible text, and giving them a group role would be a separate
 * decision with its own copy to write. Section 3 pins them BY NAME so that a
 * fourth unlabelled row - or one of these three quietly gaining a label without
 * a role - is visible rather than absorbed into a count.
 */
const UNLABELLED_TAB_ROWS = [
    "components/RoleMatchupTable.tsx",
    "components/RoleStatsTable.tsx",
    "components/draft/ChampionPoolPanel.tsx",
] as const

/** The two keys the MatchTable button's accessible name switches between. */
const TEAMMATE_KEYS = ["playerResults_showTeammates", "playerResults_hideTeammates"] as const

/* ==========================================================================
 * 1. The recommendation side toggle is a radiogroup, not a tablist.
 * ========================================================================== */

describe("RecommendationSideToggle announces an exclusive choice", () => {
    it("has the component and the two buttons this section reads", () => {
        // ANTI-VACUITY, and the reason it comes first: every assertion below is
        // a filter over openingTags(). If the component were renamed, moved or
        // rewritten to render its buttons from a `.map()`, those filters would
        // return empty arrays and several of the checks below would go green on
        // nothing at all. This file has to prove the anchor exists before it is
        // allowed to make claims about what is written on it.
        const raw = read(RECO_SIDE_TOGGLE)
        expect(raw, "the component was renamed or moved").toContain(
            "export function RecommendationSideToggle",
        )

        const source = code(RECO_SIDE_TOGGLE)
        expect(source, "the row lost its class - section 3 would stop seeing it too").toContain(
            TAB_ROW_CLASS,
        )
        expect(
            openingTags(source, "button").length,
            "the two side buttons are gone or are now generated in a loop. Either way the " +
                "per-button assertions below are reading an empty list; re-point them before " +
                "trusting this file again.",
        ).toBe(2)
    })

    it("wraps the two sides in exactly one radiogroup", () => {
        const divs = openingTags(code(RECO_SIDE_TOGGLE), "div").filter((tag) =>
            tag.includes(TAB_ROW_CLASS),
        )
        expect(divs.length, "the role-filter-tabs row is gone or was duplicated").toBe(1)
        expect(
            hasAttributeLiteral(divs[0], "role", "radiogroup"),
            `The side toggle lost role="radiogroup". Without a role the wrapper maps to ` +
                `\`generic\`, and ARIA 1.2 PROHIBITS aria-label there - every browser drops it, ` +
                `so the label goes back to being invisible AND inaudible. role="group" is not a ` +
                `substitute: picking a side is an exclusive choice and group cannot say which ` +
                `option is active. Tag as written: ${divs[0]}`,
        ).toBe(true)
    })

    it("labels the radiogroup with a key both catalogues carry", () => {
        const [group] = openingTags(code(RECO_SIDE_TOGGLE), "div").filter((tag) =>
            tag.includes(TAB_ROW_CLASS),
        )
        const label = attributeValue(group, "aria-label")
        expect(
            label.kind,
            'the radiogroup lost its aria-label, or hardcoded one. A group with a role and no ' +
                'accessible name announces as "group" and names nothing.',
        ).toBe("expression")
        expect(translationKeysIn(label.text), "the label no longer resolves through t()").toContain(
            RECO_SIDE_KEY,
        )
        for (const [lang, dict] of LANGS) {
            expect(dict[RECO_SIDE_KEY], `${RECO_SIDE_KEY} is missing from ${lang}.ts`).toBeTruthy()
        }
    })

    it("makes both sides radios with a BOUND aria-checked", () => {
        const radios = openingTags(code(RECO_SIDE_TOGGLE), "button").filter((tag) =>
            hasAttributeLiteral(tag, "role", "radio"),
        )
        expect(
            radios.length,
            'expected exactly two role="radio" buttons (Blue Side and Red Side). A radiogroup ' +
                "with one radio, or with a role on only one of two buttons, announces a set " +
                "size that does not match what is on screen.",
        ).toBe(2)

        // Both attributes are checked on the SAME tag on purpose. A file-wide
        // scan would be satisfied by one button carrying role="radio" and the
        // other carrying aria-checked, which is a broken control that passes.
        for (const tag of radios) {
            const checked = attributeValue(tag, "aria-checked")
            expect(
                checked.kind,
                `A role="radio" without aria-checked announces as unchecked forever, and a ` +
                    `LITERAL aria-checked="true" announces BOTH sides as checked at once - ` +
                    `neither has any visual symptom. It must be a bound expression. ` +
                    `Tag as written: ${tag}`,
            ).toBe("expression")

            // ...and the expression has to depend on the live side. `{true}` is
            // a bound expression too, and it is the same bug as the literal.
            expect(
                checked.text,
                `aria-checked is bound to something that does not mention recommendationSide, ` +
                    `so it cannot follow the selection. Expression as written: ${checked.text}`,
            ).toContain("recommendationSide")
        }

        const expressions = radios.map((tag) => attributeValue(tag, "aria-checked").text)
        expect(
            new Set(expressions).size,
            `Both radios bind the SAME aria-checked expression (${expressions[0]}), so they are ` +
                `always announced identically - both checked or both unchecked.`,
        ).toBe(2)
    })

    it("does not reach for tab semantics", () => {
        // THE WRONG-SEMANTICS TRAP, named because the CSS class invites it.
        //
        // This runs on comment-STRIPPED source and it has to: the JSX comment
        // right above the div explains why tablist was rejected and therefore
        // writes the word. On raw source this assertion would go red on the
        // prose that exists to prevent the bug.
        expect(
            tabSemanticsIn(code(RECO_SIDE_TOGGLE)),
            'The side toggle uses tab semantics. It is not a tablist: role="tab" obliges ' +
                "aria-controls pointing at real tabpanels and arrow-key roving between the tabs, " +
                "and none of that exists here. A half-built tablist promises keyboard behaviour " +
                "the page does not deliver, which is worse than the generic div it replaced.",
        ).toEqual([])
    })
})

/* ==========================================================================
 * 2. The three labelled rows pair role and label ON THE SAME ELEMENT.
 * ========================================================================== */

describe("the labelled filter rows carry role and label together", () => {
    it("still covers three rows", () => {
        // Anti-vacuity for the loop below: an emptied list generates no tests,
        // and a describe block with nothing in it is indistinguishable from a
        // passing one.
        expect(GROUP_ROWS.length, "GROUP_ROWS was emptied").toBe(3)
        expect(new Set(GROUP_ROWS.map(([file]) => file)).size, "a file is listed twice").toBe(3)
    })

    for (const [file, key] of GROUP_ROWS) {
        it(`${file} pairs role="group" with its aria-label`, () => {
            const rows = openingTags(code(file), "div").filter((tag) => tag.includes(TAB_ROW_CLASS))
            expect(
                rows.length,
                `${file} no longer holds exactly one role-filter-tabs row. Everything below ` +
                    `reads that one tag, so this is checked first rather than assumed.`,
            ).toBe(1)

            const tag = rows[0]

            // ONE TAG, BOTH ATTRIBUTES. Asking "does the file contain
            // role="group"?" and "does the file contain an aria-label?" as two
            // separate questions is satisfied by a file where they sit on
            // different elements - which is precisely the shape this repo had
            // before 0.6.3, and still has in three other files.
            expect(
                hasAttributeLiteral(tag, "role", "group"),
                `${file} has an aria-label on a role-less div. That element maps to \`generic\`, ` +
                    `where ARIA 1.2 PROHIBITS aria-label - every current browser drops it, so ` +
                    `the label is announced to nobody. Tag as written: ${tag}`,
            ).toBe(true)

            const label = attributeValue(tag, "aria-label")
            expect(
                label.kind,
                `${file} lost its aria-label, or hardcoded it. Deleting the attribute satisfies ` +
                    `"no hardcoded label" perfectly and leaves the group with no accessible ` +
                    `name, which is the worse outcome for exactly the user the role is for.`,
            ).toBe("expression")
            expect(
                translationKeysIn(label.text),
                `${file}'s label no longer resolves through t("${key}"). A label pointing at a ` +
                    `missing key is read out as the key itself, with no visual symptom.`,
            ).toContain(key)

            for (const [lang, dict] of LANGS) {
                expect(dict[key], `${key} is missing from ${lang}.ts`).toBeTruthy()
            }
        })
    }
})

/* ==========================================================================
 * 3. The rot guard: every LABELLED role-filter-tabs row has a role.
 *
 * Sections 1 and 2 read four files by name, so they are blind to a FIFTH panel
 * that copies the old shape. This one sweeps `src/` and is the reason the file
 * is worth having beyond the day 0.6.3 landed.
 * ========================================================================== */

/** Every `role-filter-tabs` opening tag under `src/`, with the file it is in. */
const tabRowTags = (): Array<{ file: string; tag: string }> =>
    tsxFiles().flatMap((file) =>
        openingTags(code(file), "div")
            .filter((tag) => tag.includes(TAB_ROW_CLASS))
            .map((tag) => ({ file, tag })),
    )

describe("every labelled role-filter-tabs row has a role", () => {
    it("scans a plausible tree and finds every row exactly once", () => {
        // ANTI-VACUITY IN TWO DIRECTIONS, because the sweep is only as good as
        // the tags it finds. The first number is how many files MENTION the
        // class; the second is how many opening tags the parser actually
        // resolved. If a future row builds its className dynamically
        // (`className={`role-filter-tabs ${extra}`}`), the mention is there and
        // the tag is not, the two numbers disagree, and this goes red instead of
        // the rule silently skipping that row.
        const files = tsxFiles()
        expect(files.length, "the source scan found no .tsx at all - the glob is broken").toBeGreaterThan(30)

        const mentioning = sourceFiles()
            .filter((file) => code(file).includes("role-filter-tabs"))
            .sort()
        const found = tabRowTags()

        expect(
            found.length,
            `${mentioning.length} file(s) mention role-filter-tabs but ${found.length} opening ` +
                `tag(s) were parsed out of them. A row whose className is assembled at runtime ` +
                `is invisible to this sweep - give it a literal className, or teach ` +
                `openingTags()/TAB_ROW_CLASS about the new shape. Files: ${mentioning.join(", ")}`,
        ).toBe(mentioning.length)

        expect(
            [...new Set(found.map((entry) => entry.file))].sort(),
            "the set of files holding a role-filter-tabs row changed",
        ).toEqual(mentioning)
    })

    it("never labels a row without giving it a role", () => {
        // THE RULE ITSELF. Stated as "labelled implies roled" rather than "these
        // four files are fine", so a fifth panel is covered the day it lands.
        const offenders = tabRowTags()
            .filter(({ tag }) => hasAttribute(tag, "aria-label"))
            .filter(
                ({ tag }) =>
                    !hasAttributeLiteral(tag, "role", "group") &&
                    !hasAttributeLiteral(tag, "role", "radiogroup"),
            )
            .map(({ file, tag }) => `${file}: ${tag}`)

        expect(
            offenders,
            `These role-filter-tabs rows carry an aria-label on an element with no role. Such ` +
                `an element maps to \`generic\`, where ARIA 1.2 prohibits aria-label - the ` +
                `browser drops it and the label reaches nobody. Add role="group", or ` +
                `role="radiogroup" if the row is an exclusive choice. That was the whole ` +
                `defect 0.6.3 fixed in four files; do not reintroduce it in a fifth.`,
        ).toEqual([])
    })

    it("never gives a row a role without an accessible name", () => {
        // THE OTHER DIRECTION, and it is not symmetry for its own sake: a
        // `role="group"` with no name announces as a bare "group" and tells the
        // user less than the visible buttons already do. It is the half-fix that
        // looks done. The three deliberately bare rows have NEITHER, so they do
        // not trip this.
        const offenders = tabRowTags()
            .filter(
                ({ tag }) =>
                    hasAttributeLiteral(tag, "role", "group") ||
                    hasAttributeLiteral(tag, "role", "radiogroup"),
            )
            .filter(({ tag }) => !hasAttribute(tag, "aria-label"))
            .map(({ file, tag }) => `${file}: ${tag}`)

        expect(
            offenders,
            `These role-filter-tabs rows have a role and no accessible name. A nameless group ` +
                `announces as "group" and names nothing, which is the half-fix that looks ` +
                `finished. Give it an aria-label through t(), or leave the row role-less the ` +
                `way the three unlabelled filter rows are.`,
        ).toEqual([])
    })

    it("pins the three rows that are deliberately bare", () => {
        // NOT a count on its own. A count of three is satisfied by any three
        // rows, including a newly added one that quietly replaced one of these,
        // so the files are named. If one of them legitimately gains semantics,
        // this list is where that decision gets recorded rather than absorbed.
        const bare = tabRowTags()
            .filter(({ tag }) => !hasAttribute(tag, "aria-label") && !hasAttribute(tag, "role"))
            .map(({ file }) => file)
            .sort()

        expect(
            bare,
            `The set of role-filter-tabs rows with neither a role nor a label changed. These ` +
                `three are exempt because they hold no inaudible label: their buttons carry ` +
                `their own visible text. Adding a fourth is a decision to make on purpose - ` +
                `and if you gave one of them a label, it now needs a role too.`,
        ).toEqual([...UNLABELLED_TAB_ROWS].sort())
    })

    it("keeps the labelled rows and the bare rows adding up", () => {
        // The arithmetic that makes the two lists above a partition rather than
        // two independent claims: every row is either labelled-and-roled or
        // bare, and there is no third category hiding a row from both checks.
        const rows = tabRowTags()
        const labelled = rows.filter(({ tag }) => hasAttribute(tag, "aria-label"))
        expect(
            labelled.length + UNLABELLED_TAB_ROWS.length,
            `The role-filter-tabs rows no longer split cleanly into "labelled with a role" and ` +
                `"deliberately bare". A row in neither group is one that both of the checks ` +
                `above look past.`,
        ).toBe(rows.length)
        expect(
            labelled.length,
            "the four rows 0.6.3 gave semantics to: three groups plus the radiogroup",
        ).toBe(GROUP_ROWS.length + 1)
    })
})

/* ==========================================================================
 * 4. The match table's expand button says what it does and what state it is in.
 * ========================================================================== */

describe("MatchTable's expand button carries its state", () => {
    it("has the component and the button this section reads", () => {
        // ANTI-VACUITY, same reasoning as section 1: every assertion below
        // filters openingTags(source, "button"), and the button is rendered
        // inside a `teammates.length > 0 &&` guard nested four levels into a
        // table. If it moved into its own component, the filters would return
        // an empty array and the state checks would pass on nothing.
        const raw = read(MATCH_TABLE)
        expect(raw, "the component was renamed or moved").toContain("export function MatchTable")
        expect(raw, "the expand/collapse state is gone").toContain("expandedMatchId")

        expect(
            openingTags(code(MATCH_TABLE), "button").length,
            "MatchTable renders no <button> at all - the expand control has moved out of this " +
                "file, and everything below is reading an empty list.",
        ).toBeGreaterThan(0)
    })

    it("binds aria-expanded to the live state", () => {
        const expanders = openingTags(code(MATCH_TABLE), "button").filter((tag) =>
            hasAttribute(tag, "aria-expanded"),
        )
        expect(
            expanders.length,
            "expected exactly one button carrying aria-expanded (the teammates toggle). Zero " +
                "means the collapsed/expanded state is announced to nobody: the visible glyph " +
                "is ▲/▼, which a screen reader reads as the name of a triangle.",
        ).toBe(1)

        const state = attributeValue(expanders[0], "aria-expanded")
        expect(
            state.kind,
            `aria-expanded="true" as a LITERAL is the quiet failure here: the row collapses on ` +
                `screen and the button keeps announcing "expanded" forever. It must be bound to ` +
                `the state. Tag as written: ${expanders[0]}`,
        ).toBe("expression")
        expect(
            state.text,
            `aria-expanded is bound to something other than the expansion state, so it cannot ` +
                `follow the row. Expression as written: ${state.text}`,
        ).toContain("isExpanded")
    })

    it("gives the button a state-dependent accessible name", () => {
        const [expander] = openingTags(code(MATCH_TABLE), "button").filter((tag) =>
            hasAttribute(tag, "aria-expanded"),
        )
        const label = attributeValue(expander, "aria-label")
        expect(
            label.kind,
            "the expand button lost its aria-label. Its only content is ▲/▼, so without a label " +
                "the accessible name is the glyph - announced as the name of a triangle.",
        ).toBe("expression")

        // BOTH keys, because a state-INDEPENDENT name is the tempting
        // simplification and it is the defect: "Mitspieler" leaves a
        // screen-reader user with a noun and no verb, and gives no hint that the
        // control toggles.
        const keys = translationKeysIn(label.text)
        for (const key of TEAMMATE_KEYS) {
            expect(
                keys,
                `The button's accessible name no longer references ${key}. The name has to ` +
                    `follow the state - "Mitspieler anzeigen" when collapsed, "Mitspieler ` +
                    `ausblenden" when expanded. A single fixed name tells the user nothing ` +
                    `about what pressing it will do. Expression as written: ${label.text}`,
            ).toContain(key)
        }
    })

    it("has both teammate keys in both catalogues, saying different things", () => {
        for (const [lang, dict] of LANGS) {
            for (const key of TEAMMATE_KEYS) {
                expect(dict[key], `${key} is missing from src/i18n/${lang}.ts`).toBeTruthy()
            }
            // ...and they must not be the same sentence. Two identical values
            // would satisfy every structural check above while making the label
            // state-independent again, by the back door.
            const [show, hide] = TEAMMATE_KEYS.map((key) => (dict[key] ?? "").trim().toLowerCase())
            expect(
                show === hide,
                `${lang}.ts gives playerResults_showTeammates and playerResults_hideTeammates ` +
                    `the same text. The ternary then switches between two identical strings and ` +
                    `the name stops depending on the state, which is the defect wearing the ` +
                    `structure of the fix.`,
            ).toBe(false)
        }
    })
})

/* ==========================================================================
 * 5. Anti-vacuity: every predicate above, proven able to go red.
 *
 * Synthetic sources through the EXACT helpers the real assertions use, plus
 * inverse fixtures proving they do NOT fire on the code that is actually there.
 * A guard no mutant kills is worthless, so each mutant this file was probed
 * against is written down here as an executable fixture rather than described.
 * ========================================================================== */

describe("the guards can go red", () => {
    it("reads a multi-line opening tag as one unit", () => {
        // The real RecommendationSideToggle div spans four lines. A single-line
        // regex would have found NOTHING on the element this whole file is
        // about, and every assertion built on it would have been vacuous.
        const multiline = [
            "<div",
            '    className="role-filter-tabs"',
            '    role="radiogroup"',
            '    aria-label={t("dh_recoSideAriaLabel")}',
            ">",
        ].join("\n")
        const [tag] = openingTags(multiline, "div")
        expect(tag).toContain(TAB_ROW_CLASS)
        expect(hasAttributeLiteral(tag, "role", "radiogroup")).toBe(true)
        expect(translationKeysIn(attributeValue(tag, "aria-label").text)).toEqual([
            "dh_recoSideAriaLabel",
        ])
    })

    it("does not truncate a tag on a `>` inside an attribute expression", () => {
        // The reason openingTags() counts braces instead of using `[^>]*`. These
        // components write inline `style={{…}}` objects, and a comparison inside
        // one would end the tag early - dropping every attribute after it.
        const tricky = '<div className="role-filter-tabs" style={{ flexGrow: a > b ? 1 : 0 }} role="group" aria-label={t("k")}>'
        const [tag] = openingTags(tricky, "div")
        expect(hasAttributeLiteral(tag, "role", "group")).toBe(true)
        expect(translationKeysIn(attributeValue(tag, "aria-label").text)).toEqual(["k"])
        // ...and the naive pattern really does lose it, so the extra machinery
        // is paying for itself rather than being defensive decoration.
        expect(/<div\b[^>]*>/.exec(tricky)?.[0]).not.toContain("aria-label")
    })

    it("tells a bound aria-checked from a hardcoded one", () => {
        const bound = openingTags('<button role="radio" aria-checked={side === "blue"}>', "button")[0]
        const literal = openingTags('<button role="radio" aria-checked="true">', "button")[0]
        const missing = openingTags('<button role="radio">', "button")[0]

        expect(attributeValue(bound, "aria-checked").kind).toBe("expression")
        expect(attributeValue(literal, "aria-checked").kind).toBe("literal")
        expect(attributeValue(missing, "aria-checked").kind).toBe("none")

        // The literal is the mutant that matters: it compiles, it renders, and
        // it announces BOTH radios as checked with no visual symptom at all.
        expect(hasAttribute(literal, "aria-checked")).toBe(true)
    })

    it("catches tab semantics, and leaves radio semantics alone", () => {
        expect(tabSemanticsIn('<div role="tablist">')).toEqual(['role="tablist"'])
        expect(tabSemanticsIn('<button role="tab" aria-selected={x}>')).toEqual([
            'role="tab"',
            "aria-selected",
        ])
        // role="radiogroup" must NOT read as role="tab"-anything, and the two
        // patterns must not read each other: each demands its closing quote.
        expect(tabSemanticsIn('<div role="radiogroup"><button role="radio" aria-checked={x}>')).toEqual([])
        expect(tabSemanticsIn('<div role="tablist">')).not.toContain('role="tab"')
    })

    it("distinguishes aria-label from aria-labelledby, and role from data-role", () => {
        const labelledBy = openingTags('<div aria-labelledby="heading-1" data-role="filters">', "div")[0]
        expect(hasAttribute(labelledBy, "aria-label")).toBe(false)
        expect(hasAttribute(labelledBy, "role")).toBe(false)
    })

    it("strips a JSX comment that names the rejected semantics", () => {
        // THE FALSE-FAILURE THIS FILE WOULD OTHERWISE HAVE. The 0.6.3 sources
        // explain their choices by naming what they rejected, so the negative
        // predicate fires on RAW source and must not on stripped source.
        const documented = [
            '{/* `radiogroup`, not `tablist`: a tablist would oblige aria-selected',
            "   and aria-controls pointing at real tabpanels. */}",
            '<div role="radiogroup">',
        ].join("\n")
        expect(tabSemanticsIn(documented).length, "the fixture no longer documents anything").toBeGreaterThan(0)
        expect(
            tabSemanticsIn(stripComments(documented)),
            "stripComments() stopped removing block comments, so section 1 is about to go red " +
                "on prose instead of on code",
        ).toEqual([])
    })

    it("keeps the (?<!:) lookbehind, proven against the naive stripper", () => {
        // Without the lookbehind a `https://` inside a string literal is read as
        // the start of a comment and everything after it on that line is
        // deleted - including, here, the attribute the guard exists to find.
        // Hiding a match is the one failure mode a guard cannot afford.
        //
        // The URL and the element have to be on ONE line for the fixture to
        // prove anything: the naive stripper eats to the next newline, so a
        // two-line version loses the comment and keeps the tag under BOTH
        // strippers and quietly proves nothing. That mistake was made here
        // first and caught by this assertion's own message.
        const line =
            'const HELP = "https://aatroxtool.de/"; return <div role="group" aria-label={t("k")}> // docs'
        expect(hasAttribute(openingTags(stripComments(line), "div")[0], "aria-label")).toBe(true)
        expect(
            openingTags(naiveStripComments(line), "div").length,
            "the naive stripper no longer loses the tag, so this fixture has stopped proving " +
                "anything - check whether stripComments() still needs the lookbehind",
        ).toBe(0)
        // A single slash is not a comment and must survive.
        expect(stripComments('<td>{t("CS/min")}</td>')).toContain("CS/min")
    })

    it("would fail on the pre-0.6.3 shape of all four rows", () => {
        // The shape every one of these four elements actually had before 0.6.3:
        // a translated aria-label on a role-less div. It is the reason the rot
        // guard in section 3 is stated as an implication rather than as a list
        // of blessed files.
        const before = '<div className="role-filter-tabs" aria-label={t("dh_wPresetsAriaLabel")}>'
        const [tag] = openingTags(before, "div")
        expect(hasAttribute(tag, "aria-label")).toBe(true)
        expect(hasAttributeLiteral(tag, "role", "group")).toBe(false)
        expect(hasAttributeLiteral(tag, "role", "radiogroup")).toBe(false)
    })
})

/* ==========================================================================
 * The 0.7.8 keyboard pass: two mouse-only controls became real buttons.
 *
 * WHAT 0.7.8 CHANGED, and why it belongs in this file rather than a new one
 *
 * Two controls outside the Scout answered to a click and to nothing else. It is
 * the same defect section 4 already guards one instance of: an element that
 * LOOKS like a control, behaves like one for the mouse, and is invisible to the
 * tab key.
 *
 *  6. src/components/ChampionStatsTable.tsx expanded a champion through a
 *     `<tr onClick>` and nothing else. A table row takes no focus and answers to
 *     no key, so the entire table was unreachable without a mouse. The row click
 *     STAYS - a wide stats row is a forgiving target and removing it would be a
 *     regression for everyone already using it - it is simply no longer the only
 *     way in. The champion cell now holds a real
 *     `<button type="button" aria-expanded={…}>` that calls
 *     `event.stopPropagation()`. Without that call the button handler runs, the
 *     click bubbles on into the row handler, the selection toggles twice and
 *     nothing happens at all.
 *  7. src/components/draft/ChampionNotesPanel.tsx loaded a note into the editor
 *     through a `<div className="recommendation-card" onClick>`. Same defect,
 *     same fix: a real `<button>`. Its note body moved from `<p>` to
 *     `<span className="note-card-text">`, because a `<p>` inside a `<button>`
 *     is flow content inside a phrasing-only element - invalid HTML, which
 *     browsers "recover" from by hoisting the button out of the DOM position it
 *     was written in.
 *  8. src/index.css strips the UA button chrome off both and gives them a
 *     `:focus-visible` outline. That outline is not decoration: both buttons set
 *     `background: none` / `border: none`, which removes the surfaces some
 *     browsers draw their default indicator against, and both sit on rows that
 *     already change colour on hover. Without a stated outline the keyboard user
 *     gets the semantics and still cannot see where the focus is.
 *
 * THE FAILURE MODE ALL THREE SECTIONS EXIST FOR is a revert that still looks
 * finished: `<div onClick>` and `<tr onClick>` render identically to what is
 * there now and behave identically for the mouse. Nothing on screen changes.
 *
 * THE SECOND FAILURE MODE IS THE FAKE FIX - `role="button"` plus `tabIndex`
 * plus a hand-written Enter/Space handler. It satisfies any check that only
 * asks "is there a role?" while getting Space, the button announcement or the
 * disabled semantics subtly wrong, and on the `<tr>` it would additionally
 * REPLACE the row's own table semantics and break table navigation. Sections 6
 * and 7 therefore assert that pair is absent BY NAME, the same way section 1
 * does for tab semantics.
 *
 * The caveat block at the top of this file applies unchanged: Vitest runs in
 * Node with no jsdom, so nothing here renders. These scans show that a button
 * is WRITTEN, not that it is reachable at runtime, not that focus order is
 * sensible, and not that the ring is actually visible against the row behind
 * it. That last one is a manual test in a real browser.
 * ========================================================================== */

const CHAMPION_STATS_TABLE = "components/ChampionStatsTable.tsx"
const CHAMPION_NOTES_PANEL = "components/draft/ChampionNotesPanel.tsx"
const STYLESHEET = "index.css"

const CHAMPION_TOGGLE_CLASS = "champion-row-toggle"
const NOTE_CARD_CLASS = "note-card-button"
const NOTE_CARD_BASE_CLASS = "recommendation-card"
const NOTE_TEXT_CLASS = "note-card-text"

/**
 * The one selection rule, written out in full, that BOTH paths have to call.
 *
 * Pinned as the whole call rather than as the identifier `nextChampionSelection`
 * on purpose: the identifier is already on the import line, so
 * `toContain("nextChampionSelection")` survives deleting every USE of it. This
 * repo has been caught by exactly that three times (`scoutPluralMessage`,
 * `scoutBanPhaseKey`, `splitScoutList`), which is why the assertions below read
 * the OPENING TAG of each control and look for this string inside it.
 */
const SELECTION_CALL = "onSelectChampion(nextChampionSelection(selectedChampion, s.championName))"

/**
 * The inline ternary `nextChampionSelection()` replaced, in both writing
 * directions.
 *
 * It has to be narrow: the same file legitimately writes
 * `s.championName === selectedChampion ? "row-selected" : ""` for the row class
 * and `{s.championName === selectedChampion && (…)}` for the detail row. Only a
 * ternary whose two branches are `null` and `s.championName` is the duplicated
 * rule coming back. Section 9 proves both halves of that claim.
 */
const INLINE_SELECTION_TERNARY = /\?\s*null\s*:\s*s\.championName|\?\s*s\.championName\s*:\s*null/

/**
 * The fake-button pair, named the way TAB_SEMANTICS names tab semantics.
 *
 * `tabIndex` is listed as an attribute rather than as a bare word because
 * `tabIndex={0}` is how the fake fix is written; the `(?<![\w-])` boundary is
 * the same one attributeValue() needs, and for the same reason - without it a
 * `data-tabIndex` would read as the real thing.
 */
const FAKE_BUTTON: ReadonlyArray<readonly [what: string, pattern: RegExp]> = [
    ['role="button"', /\brole\s*=\s*["']button["']/],
    ["tabIndex", /(?<![\w-])tabIndex\s*=/],
]

const fakeButtonIn = (source: string): string[] =>
    FAKE_BUTTON.filter(([, pattern]) => pattern.test(source)).map(([what]) => what)

/**
 * The class tokens on one opening tag, or an empty list when the className is
 * assembled at runtime.
 *
 * The empty list is the point rather than an oversight: a `className={…}`
 * template makes the element INVISIBLE to every filter below, so the "exactly
 * one such button" assertions go red with a loud count instead of quietly
 * passing on nothing. Same failure direction, same reasoning, as section 3's
 * mention-versus-parsed count.
 *
 * Tokens, not a substring: `"note-card-button-wide".includes("note-card-button")`
 * is true and would let a different element answer for the one being guarded.
 */
const classNames = (tag: string): string[] => {
    const found = attributeValue(tag, "className")
    return found.kind === "literal" ? found.text.split(/\s+/).filter(Boolean) : []
}

const hasClass = (tag: string, className: string): boolean => classNames(tag).includes(className)

/** One CSS rule: its selector list and its declaration block, both collapsed. */
interface CssRule {
    selector: string
    body: string
}

/**
 * Every `selector { … }` rule in a stylesheet.
 *
 * DELIBERATELY FLAT: `[^{}]*` cannot match a block containing another block, so
 * an `@media` wrapper is skipped and the rules INSIDE it are returned
 * individually. That is exactly what section 8 asks - whether SOME rule covers a
 * selector, not where that rule is nested - and it keeps this to four lines
 * instead of a CSS tokenizer.
 */
const cssRules = (source: string): CssRule[] =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        selector: match[1].replace(/\s+/g, " ").trim(),
        body: match[2].replace(/\s+/g, " ").trim(),
    }))

/**
 * The value of one declaration in a rule body, or `null`.
 *
 * The `(?<![\w-])` boundary is doing real work here: without it `outline-offset`
 * reads as `outline`, and a rule that set ONLY an offset would look like it drew
 * a ring. `[^;}]*` stops at the next declaration.
 */
const declarationValue = (body: string, property: string): string | null => {
    const match = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]*)`).exec(body)
    return match === null ? null : match[1].trim()
}

/** The values that spell "there is no focus ring" while an `outline:` is written. */
const DEAD_OUTLINE = /^(none|0|0px|initial|unset|revert)$/i

const hasVisibleOutline = (body: string): boolean => {
    const value = declarationValue(body, "outline")
    return value !== null && value.length > 0 && !DEAD_OUTLINE.test(value)
}

/**
 * The whole `<button>…</button>` of the note card, opening tag AND children,
 * whitespace collapsed. Empty when the card is not there.
 *
 * The children are the point: {@link openingTags} stops at the opening tag's
 * `>`, so it can say nothing about what is nested INSIDE the button - and
 * "no `<p>` in there" is precisely the rule that has to hold. Slicing to the
 * first `</button>` is safe because a button cannot legally contain another
 * button and this card contains none.
 */
const noteCardMarkup = (source: string): string => {
    const marker = source.indexOf(NOTE_CARD_CLASS)
    if (marker === -1) return ""
    const start = source.lastIndexOf("<button", marker)
    const end = source.indexOf("</button>", marker)
    if (start === -1 || end === -1) return ""
    return source.slice(start, end + "</button>".length).replace(/\s+/g, " ").trim()
}

/* ==========================================================================
 * 6. The champion stats table can be expanded without a mouse.
 * ========================================================================== */

describe("ChampionStatsTable has a keyboard path into every champion", () => {
    it("has the component, the rows and the buttons this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION - and the failure message has to
        // say so, because every assertion in this section is a FILTER over
        // openingTags(). A renamed file, a moved component or a wrong path makes
        // those filters return empty arrays, and "no offending tag was found" is
        // indistinguishable from "the file was never read". Named markers rather
        // than a bare count, per CLAUDE.md "Quelltext-Scanner in Tests:
        // Anti-Vakuositaet benennt Dateien, nicht Zahlen".
        //
        // Mutation that turns this red: point CHAMPION_STATS_TABLE at a file
        // that does not exist, or rename the component.
        const raw = read(CHAMPION_STATS_TABLE)
        expect(
            raw.length,
            `src/${CHAMPION_STATS_TABLE} read as empty. This is a SCANNER problem, not a rule ` +
                `violation: fix the path before touching the component.`,
        ).toBeGreaterThan(0)
        expect(
            raw,
            `src/${CHAMPION_STATS_TABLE} does not contain "export function ChampionStatsTable". ` +
                `This is a SCANNER problem, not a rule violation - the component was renamed or ` +
                `moved, and this section is reading the wrong file.`,
        ).toContain("export function ChampionStatsTable")

        const source = code(CHAMPION_STATS_TABLE)
        expect(
            openingTags(source, "tr").length,
            `No <tr> parsed out of src/${CHAMPION_STATS_TABLE}. SCANNER problem, not a rule ` +
                `violation: the table markup moved out of this file, so the row assertions below ` +
                `are reading an empty list.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(source, "button").length,
            `No <button> parsed out of src/${CHAMPION_STATS_TABLE}. SCANNER problem, not a rule ` +
                `violation: with an empty list every per-button check below passes on nothing.`,
        ).toBeGreaterThan(0)
    })

    it("puts exactly one real button in the champion cell", () => {
        // Red when the button is deleted, duplicated, or given a runtime
        // className that this scan cannot see.
        const toggles = openingTags(code(CHAMPION_STATS_TABLE), "button").filter((tag) =>
            hasClass(tag, CHAMPION_TOGGLE_CLASS),
        )
        expect(
            toggles.length,
            `Expected exactly one <button className="${CHAMPION_TOGGLE_CLASS}">. Zero means the ` +
                `keyboard path is gone and the table is mouse-only again; more than one means two ` +
                `controls now toggle the same row. A className built at runtime also reads as ` +
                `zero here - give the button a literal className.`,
        ).toBe(1)

        // Red when `type="button"` is dropped from the toggle.
        expect(
            hasAttributeLiteral(toggles[0], "type", "button"),
            `The champion toggle has no type="button". Inside a form it then defaults to ` +
                `type="submit", so Enter submits the form instead of expanding the row - the ` +
                `keyboard path this pass added would be broken for exactly the user it is for. ` +
                `Tag as written: ${toggles[0]}`,
        ).toBe(true)
    })

    it("binds aria-expanded to the live selection", () => {
        // Red when aria-expanded becomes the literal aria-expanded="true", when
        // it is deleted, or when it is bound to something that is not the
        // selection.
        const [toggle] = openingTags(code(CHAMPION_STATS_TABLE), "button").filter((tag) =>
            hasClass(tag, CHAMPION_TOGGLE_CLASS),
        )
        const state = attributeValue(toggle, "aria-expanded")
        expect(
            state.kind,
            `aria-expanded="true" as a LITERAL is the quiet failure here, exactly as it is on ` +
                `MatchTable's expander in section 4: the detail row opens and closes on screen ` +
                `while the button announces "expanded" forever, and nothing looks wrong. ` +
                `Deleting the attribute is the other way to pass a naive check and leaves the ` +
                `disclosure state announced to nobody. It must be a bound expression. Tag as ` +
                `written: ${toggle}`,
        ).toBe("expression")
        expect(
            state.text,
            `aria-expanded is bound to something that does not mention selectedChampion, so it ` +
                `cannot follow which champion is open. Expression as written: ${state.text}`,
        ).toContain("selectedChampion")
    })

    it("stops the button click from bubbling into the row", () => {
        // Red when event.stopPropagation() is removed from the toggle handler.
        const [toggle] = openingTags(code(CHAMPION_STATS_TABLE), "button").filter((tag) =>
            hasClass(tag, CHAMPION_TOGGLE_CLASS),
        )
        // THE CALL, not the identifier: `toContain("stopPropagation")` would be
        // satisfied by the word appearing anywhere in the file and by a
        // reference that is never invoked. Read off the button's OWN opening
        // tag, so a stopPropagation() living on some other element cannot
        // stand in for it.
        expect(
            toggle,
            `The champion toggle does not call event.stopPropagation(). The button sits inside ` +
                `the <tr>, so without it a click runs the button handler and then bubbles into ` +
                `the row handler: the selection toggles twice and lands back where it started, ` +
                `which looks exactly like a dead button. Keyboard activation bubbles the same ` +
                `way, so this breaks the mouse and the keyboard at once. Tag as written: ` +
                `${toggle}`,
        ).toContain("event.stopPropagation()")
    })

    it("keeps the row click AND the button, rather than swapping one for the other", () => {
        // Red when the <tr onClick> is removed (mouse regression) and red when
        // the button is removed while the row click stays (the dead end).
        const source = code(CHAMPION_STATS_TABLE)
        const clickableRows = openingTags(source, "tr").filter((tag) => hasAttribute(tag, "onClick"))
        const toggles = openingTags(source, "button").filter((tag) =>
            hasClass(tag, CHAMPION_TOGGLE_CLASS),
        )

        expect(
            clickableRows.length,
            `Expected exactly one clickable <tr>. The row click is deliberate mouse comfort - a ` +
                `wide stats row is a big, forgiving target - so removing it is a regression for ` +
                `everyone already using it. Two clickable rows would mean the detail row became ` +
                `clickable too.`,
        ).toBe(1)

        // THE POINT OF THIS TEST, and the reason both counts are asserted here
        // rather than in two separate places: a `<tr onClick>` ON ITS OWN is the
        // dead end. A table row takes no focus and answers to no key, so with
        // the button deleted this table is once again unusable without a mouse -
        // and it would look and behave exactly as it does today to anyone
        // testing with a mouse. The row is comfort; the button is the access.
        expect(
            toggles.length,
            `The <tr onClick> is here and the real button is NOT. A clickable row ALONE is the ` +
                `dead end 0.7.8 fixed: a <tr> is not focusable and answers to no key, so ` +
                `keyboard and screen-reader users have no way to expand a champion at all. The ` +
                `row click is mouse comfort and is never a substitute for a focusable control - ` +
                `put the <button className="${CHAMPION_TOGGLE_CLASS}"> back.`,
        ).toBe(1)
    })

    it("routes both paths through nextChampionSelection()", () => {
        // Red when either path stops calling the helper - in particular when one
        // of them goes back to the inline ternary.
        const source = code(CHAMPION_STATS_TABLE)
        const [row] = openingTags(source, "tr").filter((tag) => hasAttribute(tag, "onClick"))
        const [toggle] = openingTags(source, "button").filter((tag) =>
            hasClass(tag, CHAMPION_TOGGLE_CLASS),
        )

        // ONE RULE, TWO CALLERS. The full call is pinned on EACH element, so a
        // path that goes back to deciding for itself goes red on its own tag
        // instead of being covered by the other one still calling the helper.
        for (const [what, tag] of [
            ["clickable <tr>", row],
            [`<button class="${CHAMPION_TOGGLE_CLASS}">`, toggle],
        ] as const) {
            expect(
                tag,
                `The ${what} no longer calls ${SELECTION_CALL}. Both controls toggle the same ` +
                    `champion, so the rule has to live in one place: written twice, one copy ` +
                    `drifts and the two controls disagree about what a second click does. This ` +
                    `repo has shipped that shape three times already. Tag as written: ${tag}`,
            ).toContain(SELECTION_CALL)
        }

        expect(
            INLINE_SELECTION_TERNARY.test(source),
            `The inline selection ternary is back in src/${CHAMPION_STATS_TABLE}. ` +
                `"s.championName === selectedChampion ? null : s.championName" IS ` +
                `nextChampionSelection(), copied by hand - and the copy is what the helper ` +
                `exists to prevent. Call the helper instead.`,
        ).toBe(false)
    })

    it("gives every button in the file a type", () => {
        // Red when type="button" is dropped from ANY button here - the sort
        // buttons included. A <button> without a type defaults to submit, and
        // this table renders inside pages that hold real forms. Cheap to state,
        // invisible to catch by hand.
        const untyped = openingTags(code(CHAMPION_STATS_TABLE), "button").filter(
            (tag) => !hasAttributeLiteral(tag, "type", "button"),
        )
        expect(
            untyped,
            `These <button>s carry no type="button" and therefore default to type="submit". ` +
                `Inside a form, Enter on them submits instead of doing their job.`,
        ).toEqual([])
    })

    it("does not fake the button with role and tabIndex on the row", () => {
        // Red when somebody "fixes" the keyboard by putting role="button" and
        // tabIndex={0} on the <tr> instead of using a real button.
        //
        // Runs on comment-STRIPPED source, and it has to: the JSX comment above
        // the button explains why role="button" plus tabIndex was rejected and
        // therefore writes both words. On raw source this assertion would go red
        // on the prose that exists to stop the next person reintroducing the
        // bug, and the obvious "fix" would be deleting that prose.
        expect(
            fakeButtonIn(code(CHAMPION_STATS_TABLE)),
            `src/${CHAMPION_STATS_TABLE} fakes a button with role/tabIndex. On a <tr> that is ` +
                `worse than doing nothing: role="button" REPLACES the row's table semantics, so ` +
                `screen-reader table navigation breaks, and Space, Enter and the disabled state ` +
                `all become hand-written code that has to be got right. A real <button> gets all ` +
                `of it from the browser for free.`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 7. The note card is a button, and it is legal HTML.
 * ========================================================================== */

describe("ChampionNotesPanel loads a note without a mouse", () => {
    it("has the component and the cards this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION. Same reasoning as section 6,
        // and it matters more here: the div sweep below asserts an EMPTY list,
        // which is exactly what an unread file produces.
        //
        // Mutation that turns this red: point CHAMPION_NOTES_PANEL at a missing
        // file, or rename the component.
        const raw = read(CHAMPION_NOTES_PANEL)
        expect(
            raw.length,
            `src/${CHAMPION_NOTES_PANEL} read as empty. This is a SCANNER problem, not a rule ` +
                `violation: fix the path first.`,
        ).toBeGreaterThan(0)
        expect(
            raw,
            `src/${CHAMPION_NOTES_PANEL} does not contain "export function ChampionNotesPanel". ` +
                `SCANNER problem, not a rule violation - the component was renamed or moved.`,
        ).toContain("export function ChampionNotesPanel")
        expect(
            raw,
            `src/${CHAMPION_NOTES_PANEL} no longer mentions relevantNotes. SCANNER problem, not ` +
                `a rule violation: the note cards moved somewhere else, and this section is now ` +
                `guarding a file that does not hold them.`,
        ).toContain("relevantNotes")

        const source = code(CHAMPION_NOTES_PANEL)
        expect(
            openingTags(source, "div").length,
            `No <div> parsed out of src/${CHAMPION_NOTES_PANEL}. SCANNER problem, not a rule ` +
                `violation: the "no clickable div" rule below would then pass on an empty list, ` +
                `which is the one way it can be green and blind at the same time.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(source, "button").length,
            `No <button> parsed out of src/${CHAMPION_NOTES_PANEL}. SCANNER problem, not a rule ` +
                `violation.`,
        ).toBeGreaterThan(0)
    })

    it("renders the note card as a real button that kept the card styling", () => {
        // Red when the card goes back to a div, when it loses type="button",
        // when it drops .recommendation-card, or when it stops doing anything.
        const cards = openingTags(code(CHAMPION_NOTES_PANEL), "button").filter((tag) =>
            hasClass(tag, NOTE_CARD_CLASS),
        )
        expect(
            cards.length,
            `Expected exactly one <button className="${NOTE_CARD_BASE_CLASS} ${NOTE_CARD_CLASS}">. ` +
                `Zero means the note card is not a button any more, which is the mouse-only ` +
                `<div onClick> this pass removed: a div takes no focus and answers to no key.`,
        ).toBe(1)

        expect(
            hasAttributeLiteral(cards[0], "type", "button"),
            `The note card button has no type="button" and so defaults to type="submit". This ` +
                `panel sits among real form controls, so Enter on the card would submit them ` +
                `instead of loading the note. Tag as written: ${cards[0]}`,
        ).toBe(true)

        expect(
            hasClass(cards[0], NOTE_CARD_BASE_CLASS),
            `The note card button dropped .${NOTE_CARD_BASE_CLASS}. Its border, background and ` +
                `padding come from that class; .${NOTE_CARD_CLASS} only undoes the UA button ` +
                `chrome. Without the base class the card stops looking like a card. Tag as ` +
                `written: ${cards[0]}`,
        ).toBe(true)

        expect(
            hasAttribute(cards[0], "onClick"),
            `The note card button carries no onClick, so it looks like a control and does ` +
                `nothing. Tag as written: ${cards[0]}`,
        ).toBe(true)
    })

    it("has no clickable div left anywhere in the file", () => {
        // Red the moment any <div> in this file gets an onClick back - which is
        // precisely the revert that would look and behave identically for a
        // mouse user.
        //
        // PER TAG, NOT PER FILE. A naive regex over the whole source ("does this
        // file contain <div and onClick?") is satisfied by a file in which the
        // two sit on DIFFERENT elements - that is every component with any div
        // and any handler, so it would be green forever, on anything.
        // openingTags() pairs them on ONE element.
        const clickableDivs = openingTags(code(CHAMPION_NOTES_PANEL), "div").filter((tag) =>
            hasAttribute(tag, "onClick"),
        )
        expect(
            clickableDivs,
            `These <div>s carry an onClick. A div takes no focus and answers to no key, so the ` +
                `action is mouse-only and invisible to the tab key - the exact defect 0.7.8 ` +
                `fixed on the note card. Use a <button type="button">; if it must not look like ` +
                `a button, strip the chrome in CSS the way .${NOTE_CARD_CLASS} does.`,
        ).toEqual([])
    })

    it("does not fake the button with role and tabIndex", () => {
        // Red when the card is "fixed" with role="button" plus tabIndex instead
        // of a real button. Comment-stripped, for the same reason as section 6.
        expect(
            fakeButtonIn(code(CHAMPION_NOTES_PANEL)),
            `src/${CHAMPION_NOTES_PANEL} fakes a button with role/tabIndex. That is the ` +
                `look-alike fix: it satisfies "there is a role" while leaving Space, the ` +
                `disabled state and the focus order as hand-written code that has to be got ` +
                `right. A real <button> gets all three from the browser.`,
        ).toEqual([])
    })

    it("renders the note body as a span, because <p> inside <button> is invalid HTML", () => {
        // Red when the note body goes back to a <p>, and red when the span loses
        // .note-card-text (which is what makes it block-level, so the card would
        // silently reflow into one line).
        const card = noteCardMarkup(code(CHAMPION_NOTES_PANEL))
        expect(
            card.length,
            `The note card markup could not be sliced. SCANNER problem, not a rule violation: ` +
                `noteCardMarkup() looks for "${NOTE_CARD_CLASS}" and then for the enclosing ` +
                `<button>…</button>, so this is the marker moving, not the rule breaking.`,
        ).toBeGreaterThan(0)

        // THE WHOLE ELEMENT, not the class name. `toContain("${NOTE_TEXT_CLASS}")`
        // would be satisfied by the class surviving on any element at all -
        // including the <p> it replaced, which is the mutant this exists for.
        expect(
            card,
            `The note body is no longer a <span className="… ${NOTE_TEXT_CLASS}">{n.note}</span>. ` +
                `It has to be a span: a <p> is flow content and a <button> takes phrasing ` +
                `content only, so a <p> in there is invalid HTML - browsers "recover" by ` +
                `hoisting the button out of the DOM position it was written in, which moves the ` +
                `card on screen. .${NOTE_TEXT_CLASS} makes the span block-level, so it renders ` +
                `exactly as the paragraph did. Card as written: ${card}`,
        ).toMatch(/<span [^>]*className="[^"]*\bnote-card-text\b[^"]*"[^>]*>\{n\.note\}<\/span>/)

        expect(
            /<p\b/.test(card),
            `There is a <p> inside the note card <button>. Flow content inside a phrasing-only ` +
                `element is invalid HTML: the browser reparses it and hoists the button out of ` +
                `the position it was written in, so the card jumps. Use a block-level <span> ` +
                `with .${NOTE_TEXT_CLASS}. Card as written: ${card}`,
        ).toBe(false)
    })
})

/* ==========================================================================
 * 8. Both new buttons show where the keyboard is.
 * ========================================================================== */

describe("the new buttons have a visible focus ring", () => {
    it("has the stylesheet this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION. The rules below are looked up
        // by selector, so a stylesheet that failed to parse reports "no rule
        // covers this class" - which reads as a real violation and sends the
        // next reader off to rewrite CSS that is fine. Named selectors first;
        // the count is only a weaker corroboration underneath them.
        //
        // Mutation that turns this red: move src/index.css, or break cssRules().
        const source = code(STYLESHEET)
        expect(
            source.length,
            `src/${STYLESHEET} read as empty. SCANNER problem, not a rule violation.`,
        ).toBeGreaterThan(0)

        const rules = cssRules(source)
        for (const selector of [".stats-table", ".recommendation-card"]) {
            expect(
                rules.some((rule) => rule.selector.includes(selector)),
                `src/${STYLESHEET} holds no ${selector} rule. SCANNER problem, not a rule ` +
                    `violation: either the stylesheet moved or cssRules() stopped parsing it, ` +
                    `and every lookup below is about to report a false absence.`,
            ).toBe(true)
        }
        expect(
            rules.length,
            `cssRules() parsed almost nothing out of src/${STYLESHEET}. SCANNER problem, not a ` +
                `rule violation.`,
        ).toBeGreaterThan(100)
    })

    for (const className of [CHAMPION_TOGGLE_CLASS, NOTE_CARD_CLASS]) {
        it(`draws a real outline on .${className}:focus-visible`, () => {
            // Red when the shared rule is deleted, when either class is dropped
            // from its selector list, and when the body becomes `outline: none`,
            // `outline: 0`, empty, or nothing but an outline-offset.
            //
            // Asserted PER CLASS rather than by pinning the one shared selector
            // list, because splitting that rule in two is a legitimate edit and
            // the requirement is about each button, not about how the selectors
            // happen to be grouped. What is NOT legitimate is either button
            // losing its ring, and that is caught here for each independently.
            const covering = cssRules(code(STYLESHEET)).filter((rule) =>
                rule.selector.includes(`.${className}:focus-visible`),
            )
            expect(
                covering.length,
                `No :focus-visible rule covers .${className}. That button sets background: none ` +
                    `and border: none, which removes the surfaces some browsers draw the default ` +
                    `focus indicator against, and it sits on a row that already changes colour ` +
                    `on hover - so an indicator that is only a colour shift is indistinguishable ` +
                    `from hovering. Without a stated ring the keyboard user has the semantics ` +
                    `and still cannot see where they are.`,
            ).toBeGreaterThan(0)

            const drawn = covering.filter((rule) => hasVisibleOutline(rule.body))
            expect(
                drawn.length,
                `.${className}:focus-visible is declared but draws nothing. "outline: none", an ` +
                    `outline of 0 and an empty body all satisfy "there is a focus rule" while ` +
                    `removing the only indicator this button has, and an outline-offset on its ` +
                    `own draws no line at all. Rule(s) as written: ` +
                    `${covering.map((rule) => `${rule.selector} { ${rule.body} }`).join(" | ")}`,
            ).toBeGreaterThan(0)
        })
    }
})

/* ==========================================================================
 * 9. Anti-vacuity for sections 6-8: the new predicates, proven able to go red.
 *
 * Same device as section 5, for the same reason: a guard no mutant kills is
 * worthless, and a scan whose pattern has quietly stopped matching passes in
 * silence. Every fixture below runs through the EXACT helper the real
 * assertions use, and each one carries its inverse - the shape that is really
 * in the source and must NOT trip the rule - because a predicate that fires on
 * everything is as useless as one that fires on nothing.
 * ========================================================================== */

describe("the 0.7.8 guards can go red", () => {
    it("reads class tokens, and reports a runtime className as no classes at all", () => {
        const literal = openingTags(
            '<button className="recommendation-card note-card-button">',
            "button",
        )[0]
        expect(classNames(literal)).toEqual(["recommendation-card", "note-card-button"])
        expect(hasClass(literal, "note-card-button")).toBe(true)

        // A PARTIAL TOKEN MUST NOT MATCH. `.includes()` on the raw string would
        // let a `note-card-button-wide` elsewhere answer for the card being
        // guarded, and the "exactly one" count would be satisfied by the wrong
        // element.
        expect(
            hasClass(openingTags('<button className="note-card-button-wide">', "button")[0], "note-card-button"),
        ).toBe(false)

        // ...and the dynamic form reads as zero classes, which is what makes the
        // "exactly one" counts go red loudly instead of silently skipping the
        // element they cannot see.
        expect(classNames(openingTags("<button className={cls}>", "button")[0])).toEqual([])
    })

    it("pairs onClick with the element it is written on", () => {
        // The mutant section 7 exists for: the note card reverted to a div. It
        // renders identically and behaves identically for a mouse.
        const reverted =
            '<div className="recommendation-card" onClick={() => setSelectedChampion(n.championName)}>'
        expect(openingTags(reverted, "div").filter((tag) => hasAttribute(tag, "onClick")).length).toBe(1)

        // ...and a layout div wrapping a handler on some OTHER element must not
        // trip it, or the rule would be unsatisfiable by any real component and
        // the "fix" would be deleting the rule.
        const innocent = '<div style={{ marginBottom: "1rem" }}><button onClick={handleSave}>x</button></div>'
        expect(openingTags(innocent, "div").filter((tag) => hasAttribute(tag, "onClick"))).toEqual([])
    })

    it("catches an untyped and a submit-typed button", () => {
        expect(
            hasAttributeLiteral(openingTags('<button className="sort-btn">', "button")[0], "type", "button"),
        ).toBe(false)
        expect(hasAttributeLiteral(openingTags('<button type="submit">', "button")[0], "type", "button")).toBe(
            false,
        )
        expect(hasAttributeLiteral(openingTags('<button type="button">', "button")[0], "type", "button")).toBe(
            true,
        )
    })

    it("catches the fake button, and leaves a real one alone", () => {
        expect(fakeButtonIn('<tr role="button" tabIndex={0} onKeyDown={onKey}>')).toEqual([
            'role="button"',
            "tabIndex",
        ])
        // Either half on its own is already the fake fix taking shape.
        expect(fakeButtonIn("<tr tabIndex={0}>")).toEqual(["tabIndex"])
        expect(fakeButtonIn('<button type="button" aria-expanded={open}>')).toEqual([])
        // A different role and a data attribute must not read as either half,
        // or sections 6 and 7 would go red on code that is correct.
        expect(fakeButtonIn('<div role="radiogroup" data-tabIndex="1">')).toEqual([])
    })

    it("tells the selection helper from the inline ternary it replaced", () => {
        const before =
            "onClick={() => onSelectChampion(s.championName === selectedChampion ? null : s.championName)}"
        expect(
            INLINE_SELECTION_TERNARY.test(before),
            "the pre-0.7.8 shape stopped being recognised, so section 6's negative assertion has " +
                "stopped guarding anything",
        ).toBe(true)
        expect(
            INLINE_SELECTION_TERNARY.test(
                "onSelectChampion(selectedChampion === s.championName ? s.championName : null)",
            ),
            "the reversed writing of the same ternary slips through",
        ).toBe(true)

        // ...and the two comparisons the file legitimately keeps must NOT trip
        // it, or section 6 would be red on correct code and the obvious "fix"
        // would be deleting the row highlight.
        expect(
            INLINE_SELECTION_TERNARY.test('className={s.championName === selectedChampion ? "row-selected" : ""}'),
        ).toBe(false)
        expect(INLINE_SELECTION_TERNARY.test("{s.championName === selectedChampion && (<tr/>)}")).toBe(false)
        expect(INLINE_SELECTION_TERNARY.test(`onClick={() => ${SELECTION_CALL}}`)).toBe(false)
    })

    it("tells an outline that draws from one that does not", () => {
        const [drawn] = cssRules(
            ".a:focus-visible, .b:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
        )
        expect(drawn.selector).toBe(".a:focus-visible, .b:focus-visible")
        expect(hasVisibleOutline(drawn.body)).toBe(true)

        // THE MUTANTS THAT KEEP THE RULE AND REMOVE THE RING. All three satisfy
        // "a :focus-visible rule exists", which is why section 8 checks the
        // VALUE and not merely the selector.
        expect(hasVisibleOutline(cssRules(".a:focus-visible { outline: none; }")[0].body)).toBe(false)
        expect(hasVisibleOutline(cssRules(".a:focus-visible { outline: 0; }")[0].body)).toBe(false)
        expect(hasVisibleOutline(cssRules(".a:focus-visible { }")[0].body)).toBe(false)

        // ...and the boundary that makes the empty case honest: an offset on its
        // own draws no line, so `outline-offset` must not be read as `outline`.
        expect(hasVisibleOutline(cssRules(".a:focus-visible { outline-offset: 2px; }")[0].body)).toBe(false)
        expect(declarationValue("outline: 2px solid red; outline-offset: 2px;", "outline")).toBe("2px solid red")
    })

    it("slices a note card and sees an invalid <p> inside it", () => {
        const legal =
            '<button type="button" className="recommendation-card note-card-button">' +
            "<strong>{n.championName}</strong>" +
            '<span className="muted note-card-text">{n.note}</span></button>'
        expect(noteCardMarkup(legal)).toContain('<span className="muted note-card-text">{n.note}</span>')
        expect(/<p\b/.test(noteCardMarkup(legal))).toBe(false)

        // The mutant: the paragraph comes back inside the button. It compiles,
        // it renders, and the browser silently reparses it - openingTags() alone
        // would never see this, because it stops at the opening tag's `>`.
        const invalid = '<button className="note-card-button"><p className="muted">{n.note}</p></button>'
        expect(/<p\b/.test(noteCardMarkup(invalid))).toBe(true)

        // An absent card slices to "", which is why section 7 asserts a
        // non-empty slice BEFORE asserting anything about its contents: an empty
        // string contains no <p> either, and would pass every check silently.
        expect(noteCardMarkup('<div className="recommendation-card">{n.note}</div>')).toBe("")
    })
})

/* ==========================================================================
 * 10. The dependency sections 6 and 7 rest on, pinned in BOTH directions.
 *
 * `fakeButtonIn(code(file))` is green for two possible reasons: the fake-button
 * pair really is absent from the code, or stripComments() ate something it
 * should not have. Only one of those is a passing test.
 *
 * CLAUDE.md records this exact trap under "Quelltext-Scanner in Tests:
 * Anti-Vakuositaet benennt Dateien, nicht Zahlen": a rule that was green only
 * because a stripper removed the JSDoc naming the forbidden token, with the
 * dependency itself never checked. When the stripper broke, the message sent
 * the next reader hunting a reintroduction that had never happened. The remedy
 * written down there is to pin the coupling on both sides - RAW must contain,
 * STRIPPED must not.
 * ========================================================================== */

describe("the fake-button scan depends on comment stripping, and says so", () => {
    for (const file of [CHAMPION_STATS_TABLE, CHAMPION_NOTES_PANEL]) {
        it(`${file} documents role="button" in prose and not in code`, () => {
            // Red in one direction when the prose that names the rejected
            // solution is deleted (then this fixture is proving nothing and
            // sections 6/7 would be green on a file with no comments at all);
            // red in the other direction when stripComments() stops working
            // (then sections 6/7 are about to fail on the prose rather than on
            // the code, and the tempting "fix" is deleting the explanation).
            expect(
                fakeButtonIn(read(file)),
                `src/${file} no longer names role="button" in a comment. That prose is what ` +
                    `stops the next reader reintroducing the fake fix, and it is also what makes ` +
                    `this fixture meaningful: without it, "the stripped source is clean" is true ` +
                    `for a file that has nothing to strip. If the comment was rewritten on ` +
                    `purpose, re-point this fixture at whatever now documents the rejected ` +
                    `solution.`,
            ).toContain('role="button"')

            expect(
                fakeButtonIn(code(file)),
                `stripComments() no longer removes the comment in src/${file} that names ` +
                    `role="button". This is a SCANNER problem, not a rule violation: sections 6 ` +
                    `and 7 are about to go red on documentation instead of on code, and the ` +
                    `obvious "fix" - deleting the explanation - would remove the only thing ` +
                    `telling the next reader why a real <button> was used.`,
            ).toEqual([])
        })
    }
})

/* ==========================================================================
 * The 0.7.9 correctness pass: two things in ChampionStatsTable.tsx that
 * compiled, rendered, and did nothing.
 *
 * Both were found by the 0.7.8 review and deliberately left for their own
 * change, and both share the property that makes them worth a guard rather
 * than a comment: NOTHING ON SCREEN LOOKS WRONG EITHER WAY.
 *
 *  11. `aria-sort` sat on the `<button>` inside the header instead of on the
 *      `<th>`. ARIA defines `aria-sort` for `columnheader`, `rowheader` and
 *      `gridcell` only; a button maps to role `button`, so assistive technology
 *      DROPS the attribute there. The sorted column was therefore never
 *      announced as sorted - the arrow glyph was the only signal, and that one
 *      is visual. TypeScript cannot catch this: `aria-sort` lives in
 *      `AriaAttributes`, which `ButtonHTMLAttributes` and `ThHTMLAttributes`
 *      both extend, so it typechecked on the wrong element for as long as it was
 *      there. The fix moves the attribute and nothing else: inactive sortable
 *      columns keep `"none"`, which is what the component already meant to say,
 *      and the non-sortable confidence header carries no `aria-sort` at all.
 *  12. `sorted.map((s) => (<>...</>))` returned the SHORTHAND fragment. A
 *      shorthand cannot carry a `key`, so the key sat on the inner `<tr>` -
 *      which does not satisfy React at all, because the list children are the
 *      fragments and every one of them was keyless. React warned on every render
 *      and reconciled by index, so re-sorting the table re-used the wrong rows
 *      and could carry an open detail row over to a different champion. The fix
 *      is `<Fragment key={s.championName}>`, with the two inner keys removed:
 *      inside the fragment the rows are static siblings, not a list, and a
 *      second key there is a competing identity for the same entry.
 *
 * WHY EVERY NEGATIVE ASSERTION BELOW RUNS ON code(), NOT ON read()
 *
 * The component documents both fixes by NAMING what it rejected: the block above
 * `colBtn()` writes `aria-sort` and `<th>` and `<button>`, and the comment above
 * the fragment writes `<>` verbatim. On raw source the short-fragment scan is
 * red on that prose, and "at least one bare `<th>`" is satisfied by two `<th>`
 * that exist only inside a comment. Section 14 pins that coupling in both
 * directions - RAW must contain, STRIPPED must not - exactly the way section 10
 * does for the fake-button pair, and for the reason CLAUDE.md records under
 * "Quelltext-Scanner in Tests: Anti-Vakuositaet benennt Dateien, nicht Zahlen".
 *
 * The caveat block at the top of this file applies unchanged: Vitest runs in
 * Node with no jsdom, so nothing here renders. These scans show that an
 * attribute is WRITTEN on the right element and that its value is an expression.
 * They do NOT show that a screen reader announces the sort direction, that React
 * stops warning, or that re-sorting keeps the right detail row open. That last
 * one is a manual test: sort by Winrate, expand a champion, sort by Picks, and
 * check the open row still belongs to the champion it was opened on.
 * ========================================================================== */

/**
 * The whole `aria-sort` expression, pinned as one string.
 *
 * Pinned WHOLE rather than as three separate `toContain` checks because the
 * mutation that matters most - swapping `"ascending"` and `"descending"` - keeps
 * every token and every identifier in place. Section 13 proves that with the
 * swapped expression as an executable fixture rather than asserting it in prose.
 */
const ARIA_SORT_EXPRESSION = 'active ? (sortAsc ? "ascending" : "descending") : "none"'

/** The header `colBtn()` returns. Written once in the source, rendered eight times. */
const SORTABLE_HEADER = `<th aria-sort={${ARIA_SORT_EXPRESSION}}>`

/** The one header that is not sortable and therefore has no sort state to report. */
const CONFIDENCE_HEADER = '<th>{t("tbl_confidence")}</th>'

/** The sort button's whole handler, pinned the way SELECTION_CALL is. */
const SORT_HANDLER = "() => handleSort(key)"

/** The keyed fragment, written out in full. */
const KEYED_FRAGMENT = "<Fragment key={s.championName}>"

/** The list whose children are those fragments. */
const ROW_MAP = "sorted.map("

/**
 * The shorthand fragment, named the way TAB_SEMANTICS and FAKE_BUTTON name their
 * rejected shapes.
 *
 * THE LEADING BOUNDARY IS THE WHOLE DIFFICULTY. A bare `/<>/` also matches
 * `Array<>` - an empty type-argument list is two adjacent characters just like a
 * fragment is - so the pattern refuses a `<` that follows an identifier
 * character. `=>` and `a < b > c` never contain the substring at all and need no
 * special handling, but both are pinned as fixtures in section 13 because
 * "obviously fine" is how a pattern ends up rewritten into something that is
 * not. `</>` cannot be confused with anything: `</` is only ever a closing tag.
 */
const SHORT_FRAGMENT: ReadonlyArray<readonly [what: string, pattern: RegExp]> = [
    ["<>", /(?<![\w$])<>/],
    ["</>", /<\/>/],
]

const shortFragmentsIn = (source: string): string[] =>
    SHORT_FRAGMENT.filter(([, pattern]) => pattern.test(source)).map(([what]) => what)

/**
 * The `<Fragment ...>...</Fragment>` block of the champion rows, whitespace
 * collapsed. Empty when it is not there.
 *
 * {@link openingTags} stops at the opening tag's `>`, so it can say nothing
 * about what is nested INSIDE the fragment - and "both rows are in there, main
 * row first" is precisely the rule that has to hold. Same device, same reason,
 * as {@link noteCardMarkup} in section 7. Slicing to the first `</Fragment>` is
 * safe because this file holds exactly one.
 */
const championRowFragment = (source: string): string => {
    const start = source.indexOf("<Fragment")
    const end = source.indexOf("</Fragment>", start)
    if (start === -1 || end === -1) return ""
    return source.slice(start, end + "</Fragment>".length).replace(/\s+/g, " ").trim()
}

/* ==========================================================================
 * 11. The sorted column is announced on the column header, not on a button.
 * ========================================================================== */

describe("ChampionStatsTable announces its sort state on the column header", () => {
    it("has the component, the headers and the buttons this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION - and the message has to say so,
        // because every assertion below is a FILTER over openingTags(). A
        // renamed file or a moved component makes those filters return empty
        // arrays, and "no <button> carries aria-sort" is then true of a file
        // that was never read. Named markers rather than a bare count, per
        // CLAUDE.md "Quelltext-Scanner in Tests: Anti-Vakuositaet benennt
        // Dateien, nicht Zahlen".
        //
        // Mutation that turns this red: point CHAMPION_STATS_TABLE at a file
        // that does not exist, rename the component, or rename colBtn().
        const raw = read(CHAMPION_STATS_TABLE)
        expect(
            raw.length,
            `src/${CHAMPION_STATS_TABLE} read as empty. This is a SCANNER problem, not a rule ` +
                `violation: fix the path before touching the component.`,
        ).toBeGreaterThan(0)
        expect(
            raw,
            `src/${CHAMPION_STATS_TABLE} does not contain "export function ChampionStatsTable". ` +
                `SCANNER problem, not a rule violation - the component was renamed or moved, and ` +
                `this section is reading the wrong file.`,
        ).toContain("export function ChampionStatsTable")

        const source = code(CHAMPION_STATS_TABLE)
        expect(
            source,
            `src/${CHAMPION_STATS_TABLE} no longer defines colBtn(). SCANNER problem, not a rule ` +
                `violation: the sortable header moved, so the "exactly one th carries aria-sort" ` +
                `count below is about to describe something else.`,
        ).toContain("function colBtn(")
        expect(
            openingTags(source, "th").length,
            `No <th> parsed out of src/${CHAMPION_STATS_TABLE}. SCANNER problem, not a rule ` +
                `violation: with an empty list every header assertion below passes on nothing.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(source, "button").length,
            `No <button> parsed out of src/${CHAMPION_STATS_TABLE}. SCANNER problem, not a rule ` +
                `violation: the "no button carries aria-sort" rule would then be green on an ` +
                `empty list, which is the one way it can be clean and blind at the same time.`,
        ).toBeGreaterThan(0)
    })

    it("never puts aria-sort on a <button>", () => {
        // THE 0.7.9 DEFECT ITSELF. Red the moment the attribute moves back onto
        // the sort button.
        //
        // PER TAG, NOT PER FILE, and deliberately not a file-wide regex: the
        // file legitimately contains both `<button` and `aria-sort`, so "does
        // this source mention aria-sort near a button?" is satisfied by the
        // correct code as well as by the broken code. openingTags() pairs the
        // attribute with the ELEMENT it is written on, which is the only
        // question ARIA cares about.
        const offenders = openingTags(code(CHAMPION_STATS_TABLE), "button").filter((tag) =>
            hasAttribute(tag, "aria-sort"),
        )
        expect(
            offenders,
            `These <button>s carry aria-sort. ARIA defines aria-sort for columnheader, ` +
                `rowheader and gridcell ONLY, and a <button> maps to role "button" - assistive ` +
                `technology drops the attribute there, so the sorted column is not announced as ` +
                `sorted at all and the only remaining signal is the visual arrow. TypeScript ` +
                `cannot catch it: aria-sort is in AriaAttributes, which both ` +
                `ButtonHTMLAttributes and ThHTMLAttributes extend. Put it on the enclosing <th>.`,
        ).toEqual([])
    })

    it("puts aria-sort on exactly one <th>, as a bound expression", () => {
        // Red when the attribute is deleted from the header (nothing is
        // announced), when a second literal <th> gains one, and when the value
        // becomes the literal aria-sort="ascending" - which compiles, renders,
        // and announces one fixed direction for every column forever.
        const headers = openingTags(code(CHAMPION_STATS_TABLE), "th").filter((tag) =>
            hasAttribute(tag, "aria-sort"),
        )
        expect(
            headers.length,
            `Expected exactly one <th> carrying aria-sort: colBtn() is written once and called ` +
                `eight times, so one source header covers all eight sortable columns. Zero means ` +
                `the sort state is announced to nobody again; more than one means a second ` +
                `header was written by hand and the two can now disagree.`,
        ).toBe(1)

        const state = attributeValue(headers[0], "aria-sort")
        expect(
            state.kind,
            `aria-sort="ascending" as a LITERAL is the quiet failure here, exactly as ` +
                `aria-checked and aria-expanded are in sections 1 and 4: every sortable column ` +
                `announces the same fixed direction, the arrows on screen keep moving, and ` +
                `nothing looks wrong. Deleting the attribute is the other way to pass a naive ` +
                `check. It must be a bound expression. Tag as written: ${headers[0]}`,
        ).toBe("expression")

        for (const token of ["active", '"ascending"', '"descending"', '"none"']) {
            expect(
                state.text,
                `The aria-sort expression no longer mentions ${token}. It has to name all three ` +
                    `states and hang off "active": the sorted column reports its direction, and ` +
                    `the other seven report "none" rather than silently reporting nothing. ` +
                    `Expression as written: ${state.text}`,
            ).toContain(token)
        }
    })

    it("does not swap ascending for descending", () => {
        // Red when the two directions are exchanged - the one mutation that
        // keeps every token, every identifier and every count above intact while
        // announcing the exact opposite of what the table shows. Pinned as the
        // WHOLE expression for that reason; section 13 proves the token checks
        // alone would not catch it.
        const [header] = openingTags(code(CHAMPION_STATS_TABLE), "th").filter((tag) =>
            hasAttribute(tag, "aria-sort"),
        )
        expect(
            attributeValue(header, "aria-sort").text,
            `The aria-sort expression changed. If ascending and descending were exchanged, the ` +
                `header now announces the opposite of the order on screen, which is worse than ` +
                `announcing nothing - and every token-level check still passes. sortAsc true ` +
                `means "ascending". If the change was deliberate, update ARIA_SORT_EXPRESSION ` +
                `here and say why in the change MD.`,
        ).toBe(ARIA_SORT_EXPRESSION)

        // ...and the header is the one colBtn() returns, not some other <th>
        // that happens to carry the attribute.
        expect(
            code(CHAMPION_STATS_TABLE),
            `colBtn() no longer returns ${SORTABLE_HEADER}. The attribute has to sit on the <th> ` +
                `that WRAPS the sort button, because that is the element mapping to columnheader.`,
        ).toContain(SORTABLE_HEADER)
    })

    it("leaves the non-sortable confidence header without aria-sort", () => {
        // Red when somebody "completes" the pass by giving the confidence header
        // an aria-sort too. It has no sort state to report, and aria-sort="none"
        // there would announce it as a sortable column that merely happens to be
        // unsorted - inviting a keyboard user to look for a control that does
        // not exist.
        //
        // This assertion is the reason section 14 exists: on RAW source it is
        // satisfied by two <th> that live only inside a comment, so it means
        // nothing unless the source has been stripped first.
        const bare = openingTags(code(CHAMPION_STATS_TABLE), "th").filter(
            (tag) => !hasAttribute(tag, "aria-sort"),
        )
        expect(
            bare.length,
            `Every <th> in src/${CHAMPION_STATS_TABLE} now carries aria-sort. The confidence ` +
                `column cannot be sorted, so it has no sort state to report; aria-sort="none" ` +
                `there announces it as a sortable column that is merely unsorted.`,
        ).toBeGreaterThan(0)

        expect(
            code(CHAMPION_STATS_TABLE),
            `The non-sortable header is no longer written as ${CONFIDENCE_HEADER}. Pinned as the ` +
                `whole element rather than as a count, because "there is some bare <th>" is ` +
                `satisfied by any header at all - including a sortable one that quietly lost its ` +
                `aria-sort, which is the defect this section is about.`,
        ).toContain(CONFIDENCE_HEADER)
    })

    it("keeps the sort button typed and wired to handleSort()", () => {
        // Red when type="button" is dropped from the sort button (inside a form
        // it then defaults to submit, so Enter submits instead of sorting) and
        // red when the handler is rewritten or lost - which would leave a header
        // that announces a sort state nothing can change.
        const sortButtons = openingTags(code(CHAMPION_STATS_TABLE), "button").filter((tag) =>
            attributeValue(tag, "onClick").text.includes("handleSort("),
        )
        expect(
            sortButtons.length,
            `Expected exactly one <button> whose onClick calls handleSort(). Zero means the ` +
                `header is no longer clickable at all, so the aria-sort state above can never ` +
                `change; more than one means a second control now sorts the same table.`,
        ).toBe(1)

        expect(
            hasAttributeLiteral(sortButtons[0], "type", "button"),
            `The sort button has no type="button" and therefore defaults to type="submit". ` +
                `Inside a form, Enter on a column header submits the form instead of sorting - ` +
                `and the keyboard user is the one this whole pass is for. Tag as written: ` +
                `${sortButtons[0]}`,
        ).toBe(true)

        // THE WHOLE HANDLER, not the identifier: `toContain("handleSort")` is
        // satisfied by the function's own declaration elsewhere in the file.
        // This repo has been caught by exactly that shape three times
        // (scoutPluralMessage, scoutBanPhaseKey, splitScoutList), which is why
        // the call is read off the button's OWN opening tag.
        expect(
            attributeValue(sortButtons[0], "onClick").text,
            `The sort button's handler is no longer ${SORT_HANDLER}. Each of the eight columns ` +
                `has to sort by ITS OWN key - a handler that closed over something else would ` +
                `sort by one fixed column while the header still reports per-column state.`,
        ).toBe(SORT_HANDLER)
    })
})

/* ==========================================================================
 * 12. The champion rows are keyed on the PAIR, not on one of its halves.
 * ========================================================================== */

describe("ChampionStatsTable keys the row pair, not one of the rows", () => {
    it("has the map and the fragment this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION. Same reasoning as section 11,
        // and it bites harder here: two of the rules below assert an EMPTY list
        // and an empty slice is exactly what an unread file produces.
        //
        // Mutation that turns this red: rename `sorted`, move the row rendering
        // into its own component, or point CHAMPION_STATS_TABLE at a missing
        // file.
        const raw = read(CHAMPION_STATS_TABLE)
        expect(
            raw,
            `src/${CHAMPION_STATS_TABLE} does not contain "export function ChampionStatsTable". ` +
                `SCANNER problem, not a rule violation.`,
        ).toContain("export function ChampionStatsTable")

        const source = code(CHAMPION_STATS_TABLE)
        expect(
            source.indexOf(ROW_MAP),
            `src/${CHAMPION_STATS_TABLE} no longer contains "${ROW_MAP}". SCANNER problem, not a ` +
                `rule violation: the champion rows are built somewhere else now, so this section ` +
                `is guarding a file that does not hold them.`,
        ).toBeGreaterThan(-1)
        expect(
            openingTags(source, "tr").length,
            `No <tr> parsed out of src/${CHAMPION_STATS_TABLE}. SCANNER problem, not a rule ` +
                `violation: the "no key on an inner <tr>" rule below would then be green on an ` +
                `empty list.`,
        ).toBeGreaterThan(0)
        expect(
            championRowFragment(source).length,
            `The champion row fragment could not be sliced out of src/${CHAMPION_STATS_TABLE}. ` +
                `SCANNER problem, not a rule violation: championRowFragment() looks for ` +
                `"<Fragment" and the matching "</Fragment>", so this is the markup moving rather ` +
                `than the rule breaking.`,
        ).toBeGreaterThan(0)
    })

    it("has no shorthand fragment left anywhere in the file", () => {
        // Red the moment `<Fragment key={...}>` goes back to `<>`. That revert
        // renders identically, so nothing on screen says the list children lost
        // their keys again - only React's console warning does, and only in dev.
        //
        // Runs on comment-STRIPPED source, and it HAS to: the comment above the
        // fragment writes `<>` verbatim to explain why the shorthand was
        // rejected. On raw source this assertion is red on the prose that exists
        // to stop the next person reintroducing the bug, and the obvious "fix"
        // would be deleting that prose. Section 14 pins both halves of that
        // coupling.
        expect(
            shortFragmentsIn(code(CHAMPION_STATS_TABLE)),
            `src/${CHAMPION_STATS_TABLE} is back to the shorthand fragment. A <> cannot carry a ` +
                `key, so the list children - which ARE the fragments - are all keyless no matter ` +
                `where a key is written inside them. React then reconciles by index, and ` +
                `re-sorting the table re-uses the wrong rows: an open detail row can end up ` +
                `under a different champion. Use <Fragment key={...}>.`,
        ).toEqual([])
    })

    it("imports Fragment from react", () => {
        // Red when the import is dropped - which is how a revert to `<>` usually
        // starts, and it is the half a "remove unused import" cleanup would do
        // on its own.
        expect(
            code(CHAMPION_STATS_TABLE),
            `src/${CHAMPION_STATS_TABLE} no longer imports Fragment from "react". Without the ` +
                `named import the only fragment available is the <> shorthand, which cannot take ` +
                `a key.`,
        ).toMatch(/import\s*\{[^}]*\bFragment\b[^}]*\}\s*from\s*"react"/)
    })

    it("returns a keyed <Fragment> from sorted.map(), not a bare row", () => {
        // Red when the key is removed from the fragment, when it is bound to
        // something other than the champion name, and when the map returns a
        // <tr> or a <> as its first element again.
        const source = code(CHAMPION_STATS_TABLE)
        const fragments = openingTags(source, "Fragment")
        expect(
            fragments.length,
            `Expected exactly one <Fragment> opening tag in src/${CHAMPION_STATS_TABLE}: one per ` +
                `champion row pair, written once. Zero means the shorthand is back.`,
        ).toBe(1)

        const key = attributeValue(fragments[0], "key")
        expect(
            key.kind,
            `The <Fragment> carries no key. That is the pre-0.7.9 state with a longer spelling: ` +
                `the list children are the fragments, so a keyless fragment leaves React ` +
                `reconciling this list by index however many keys are written inside it. Tag as ` +
                `written: ${fragments[0]}`,
        ).toBe("expression")
        expect(
            key.text,
            `The fragment key is not bound to the champion name, so it does not identify the row ` +
                `pair. An index would be the worst version of this: it is stable across a ` +
                `re-sort by definition, which is precisely the reconciliation bug wearing a key. ` +
                `Expression as written: ${key.text}`,
        ).toBe("s.championName")

        // THE FIRST ELEMENT THE MAP RETURNS, because "the file contains a keyed
        // fragment" and "the map returns it" are two different facts. A revert
        // could leave the Fragment sitting unused elsewhere.
        const opener = /<([A-Za-z][\w.]*|\/?>)/.exec(
            source.slice(source.indexOf(ROW_MAP) + ROW_MAP.length),
        )
        expect(
            opener?.[1],
            `The first element ${ROW_MAP}...) returns is <${opener?.[1] ?? "nothing"}>, not ` +
                `<Fragment>. A ">" here means the shorthand is back; a "tr" means the pair was ` +
                `split so that only one row is the list child, which loses the detail row's tie ` +
                `to its champion.`,
        ).toBe("Fragment")

        expect(
            source,
            `The keyed fragment is no longer written as ${KEYED_FRAGMENT}.`,
        ).toContain(KEYED_FRAGMENT)
    })

    it("leaves no key on either inner <tr>", () => {
        // Red when a key is put back on the main row or on the detail row.
        //
        // This is not tidiness. A key on the inner <tr> is the shape that LOOKS
        // like the list is keyed and is not: React only reads keys from the
        // children of the mapped array, and those children are the fragments.
        // The two rows inside a fragment are static siblings, not a list, so a
        // key there identifies nothing and gives the same entry a second,
        // competing identity.
        const keyedRows = openingTags(code(CHAMPION_STATS_TABLE), "tr").filter((tag) =>
            hasAttribute(tag, "key"),
        )
        expect(
            keyedRows,
            `These <tr>s carry a key. A key on the INNER row does not satisfy React: the list ` +
                `children are the <Fragment>s returned by ${ROW_MAP}...), and React reads keys ` +
                `from those and nowhere else. This exact shape - key={s.championName} on the row ` +
                `- is what the 0.7.9 fix removed, because it made a keyless list look keyed. Put ` +
                `the key on the <Fragment> instead; inside it the two rows are static siblings.`,
        ).toEqual([])
    })

    it("keeps the detail row inside the same fragment, right after the main row", () => {
        // Red when the detail row is moved out of the fragment (it then becomes
        // a second, keyless list child) and red when the two are reordered so
        // the detail row is rendered above the champion it belongs to.
        const fragment = championRowFragment(code(CHAMPION_STATS_TABLE))
        const rows = openingTags(fragment, "tr")
        expect(
            rows.length,
            `The <Fragment> holds ${rows.length} <tr> instead of two. The pair is the point: the ` +
                `main row and the detail row share one key because they are one entry. One row ` +
                `means the detail row moved out and is now an unkeyed sibling of the fragments; ` +
                `three means something else was folded in. Fragment as written: ${fragment}`,
        ).toBe(2)

        const mainRow = fragment.indexOf("<tr")
        const detail = fragment.indexOf("{s.championName === selectedChampion && (")
        expect(
            detail,
            `The conditional detail row is not inside the fragment any more. Outside it, it is a ` +
                `separate child of the map with no key of its own - and it is the row whose ` +
                `identity mattered most, because it is the one that visibly ends up under the ` +
                `wrong champion. Fragment as written: ${fragment}`,
        ).toBeGreaterThan(-1)
        expect(
            detail,
            `The detail row is rendered BEFORE the champion row inside the fragment, so the ` +
                `expanded panel appears above the row it belongs to.`,
        ).toBeGreaterThan(mainRow)

        expect(
            fragment,
            `The fragment no longer renders <ChampionDetail>. The detail row exists to hold it; ` +
                `without it the conditional second row is an empty row.`,
        ).toContain("<ChampionDetail")
    })
})

/* ==========================================================================
 * 13. Anti-vacuity for sections 11-12: the new predicates, proven able to go
 * red.
 *
 * Same device as sections 5 and 9, for the same reason: a scan whose pattern has
 * quietly stopped matching passes in silence, so every mutant these guards were
 * probed against is written down here as an executable fixture rather than
 * described in prose. Each fixture carries its INVERSE - the shape that is
 * really in the source and must NOT trip the rule - because a predicate that
 * fires on everything is as useless as one that fires on nothing.
 * ========================================================================== */

describe("the 0.7.9 guards can go red", () => {
    it("matches a real shorthand fragment and nothing that merely looks like one", () => {
        // THE RULE FIRES on the shape section 12 forbids...
        expect(shortFragmentsIn("return (\n    <>\n        <tr />\n    </>\n)")).toEqual(["<>", "</>"])
        expect(shortFragmentsIn("<></>")).toEqual(["<>", "</>"])
        // ...including at the very start of a string, where the lookbehind has
        // nothing to look at.
        expect(shortFragmentsIn("<>")).toEqual(["<>"])

        // ...AND IT MUST NOT FIRE on any of these, or section 12 goes red on
        // correct code and the tempting "fix" is deleting the rule. The generic
        // is the one that actually needs the lookbehind: `Array<>` contains the
        // two characters side by side exactly as a fragment does.
        expect(shortFragmentsIn("const xs: Array<> = []")).toEqual([])
        expect(shortFragmentsIn("const empty: Map<> = new Map()")).toEqual([])
        // An arrow function has no `<` at all, and a chained comparison has no
        // adjacency. Both are pinned anyway: "obviously fine" is how a pattern
        // gets rewritten into something that is not.
        expect(shortFragmentsIn("const f = (x: number) => x > 0")).toEqual([])
        expect(shortFragmentsIn("if (a < b > c) { return }")).toEqual([])
        expect(shortFragmentsIn('const [k, setK] = useState<SortKey>("picks")')).toEqual([])
        // ...and the fix itself must read as clean, which is the inverse that
        // makes section 12's empty expectation mean something.
        expect(shortFragmentsIn(KEYED_FRAGMENT + "<tr /></Fragment>")).toEqual([])
    })

    it("tells a bound aria-sort from a hardcoded one, and sees one on a button", () => {
        const bound = openingTags(SORTABLE_HEADER, "th")[0]
        const literal = openingTags('<th aria-sort="ascending">', "th")[0]
        const bare = openingTags(CONFIDENCE_HEADER, "th")[0]

        expect(attributeValue(bound, "aria-sort").kind).toBe("expression")
        expect(attributeValue(bound, "aria-sort").text).toBe(ARIA_SORT_EXPRESSION)
        // The literal is the mutant that matters: it compiles, it renders, and
        // every column announces one fixed direction with no visual symptom.
        expect(attributeValue(literal, "aria-sort").kind).toBe("literal")
        expect(hasAttribute(literal, "aria-sort")).toBe(true)
        // The bare confidence header is the inverse: section 11 requires one of
        // these to exist, so the helper has to report it as absent rather than
        // as an empty value.
        expect(attributeValue(bare, "aria-sort").kind).toBe("none")
        expect(hasAttribute(bare, "aria-sort")).toBe(false)

        // THE PRE-0.7.9 SHAPE: the attribute on the button inside the header.
        // Without this fixture, "no <button> carries aria-sort" could be green
        // because the filter never matches anything at all.
        const onButton = openingTags(
            '<button type="button" aria-sort={active ? "ascending" : "none"}>',
            "button",
        )[0]
        expect(hasAttribute(onButton, "aria-sort")).toBe(true)
        // ...and a correct button must not trip it, or section 11 would be
        // unsatisfiable by any real component.
        expect(
            hasAttribute(openingTags('<button type="button" onClick={x}>', "button")[0], "aria-sort"),
        ).toBe(false)
    })

    it("goes red on a swap of ascending and descending, which every token check survives", () => {
        // THE POINT OF PINNING THE WHOLE EXPRESSION. This mutant announces the
        // exact opposite of the order on screen while keeping every identifier,
        // every quoted state and every count in section 11's other tests intact.
        const swapped = '<th aria-sort={active ? (sortAsc ? "descending" : "ascending") : "none"}>'
        const text = attributeValue(openingTags(swapped, "th")[0], "aria-sort").text

        for (const token of ["active", '"ascending"', '"descending"', '"none"']) {
            expect(
                text,
                "the swapped expression stopped containing the tokens, so this fixture no longer " +
                    "demonstrates why the whole expression has to be pinned",
            ).toContain(token)
        }
        expect(text).not.toBe(ARIA_SORT_EXPRESSION)
    })

    it("tells a keyed fragment from a keyless one, and sees a key on a <tr>", () => {
        const keyed = openingTags(KEYED_FRAGMENT, "Fragment")[0]
        expect(attributeValue(keyed, "key").kind).toBe("expression")
        expect(attributeValue(keyed, "key").text).toBe("s.championName")
        expect(attributeValue(openingTags("<Fragment>", "Fragment")[0], "key").kind).toBe("none")

        // THE TWO PRE-0.7.9 KEYS, both on inner rows. Without these fixtures the
        // "no key on a <tr>" rule could be green because attributeValue() had
        // stopped finding `key` at all.
        expect(
            openingTags('<tr key={s.championName} className="row-selected">', "tr").filter((tag) =>
                hasAttribute(tag, "key"),
            ).length,
        ).toBe(1)
        // The detail row's key was a template literal, so the brace walk has to
        // survive a `${...}` inside the value.
        expect(
            openingTags("<tr key={`${s.championName}-detail`}>", "tr").filter((tag) =>
                hasAttribute(tag, "key"),
            ).length,
        ).toBe(1)

        // ...and the rows that are really there must NOT trip it, or section 12
        // would be red on correct code.
        expect(
            openingTags(
                '<tr className={s.championName === selectedChampion ? "row-selected" : ""} onClick={handle}>',
                "tr",
            ).filter((tag) => hasAttribute(tag, "key")),
        ).toEqual([])
        // Nor may an attribute that merely ENDS in "key". The (?<![\w-])
        // boundary in attributeValue() is what refuses both of these.
        expect(hasAttribute(openingTags('<tr data-key="x" monkey="y">', "tr")[0], "key")).toBe(false)
    })
})

/* ==========================================================================
 * 14. The dependency sections 11 and 12 rest on, pinned in BOTH directions.
 *
 * `shortFragmentsIn(code(file))` is empty for two possible reasons: the
 * shorthand really is gone from the code, or stripComments() ate something it
 * should not have. Only one of those is a passing test. Same for "at least one
 * bare <th>": on RAW source that is satisfied by two <th> that exist only inside
 * a comment, so the claim means nothing until the source has been stripped.
 *
 * This is section 10's device applied to the 0.7.9 scans, and CLAUDE.md records
 * it under "Quelltext-Scanner in Tests: Anti-Vakuositaet benennt Dateien, nicht
 * Zahlen": a rule that was green only because a stripper removed the prose
 * naming the forbidden token, with the dependency itself never checked. When the
 * stripper broke, the message sent the next reader hunting a reintroduction that
 * had never happened.
 * ========================================================================== */

describe("the 0.7.9 scans depend on comment stripping, and say so", () => {
    it("names the shorthand fragment in prose and nowhere in code", () => {
        // Red in one direction when the comment that names `<>` is deleted -
        // then section 12's empty expectation is true of a file with nothing to
        // strip, and this fixture is proving nothing.
        expect(
            shortFragmentsIn(read(CHAMPION_STATS_TABLE)),
            `src/${CHAMPION_STATS_TABLE} no longer names the <> shorthand in a comment. That ` +
                `prose is what stops the next reader reverting to it, and it is also what makes ` +
                `section 12 meaningful: without it, "the stripped source holds no shorthand" is ` +
                `true of a file that has nothing to strip. If the comment was rewritten on ` +
                `purpose, re-point this fixture at whatever now documents the rejected shape.`,
        ).toContain("<>")

        // Red in the other direction when stripComments() stops working - then
        // section 12 is about to fail on documentation rather than on code, and
        // the tempting "fix" is deleting the explanation.
        expect(
            shortFragmentsIn(code(CHAMPION_STATS_TABLE)),
            `stripComments() no longer removes the comment in src/${CHAMPION_STATS_TABLE} that ` +
                `names the <> shorthand. This is a SCANNER problem, not a rule violation: ` +
                `section 12 is about to go red on prose instead of on code, and the obvious ` +
                `"fix" - deleting the explanation - would remove the only thing telling the next ` +
                `reader why <Fragment key={...}> is spelled out longhand.`,
        ).toEqual([])
    })

    it("writes <th> in prose, so the bare-header claim only holds on stripped source", () => {
        // The same coupling for section 11's "at least one <th> without
        // aria-sort". The comment above colBtn() writes `<th>` twice while
        // explaining where the attribute belongs, and neither of those carries
        // an aria-sort - so on raw source the claim is satisfied by prose alone.
        const rawBare = openingTags(read(CHAMPION_STATS_TABLE), "th").filter(
            (tag) => !hasAttribute(tag, "aria-sort"),
        ).length
        const codeBare = openingTags(code(CHAMPION_STATS_TABLE), "th").filter(
            (tag) => !hasAttribute(tag, "aria-sort"),
        ).length

        expect(
            rawBare,
            `Raw source holds ${rawBare} <th> without aria-sort and stripped source holds ` +
                `${codeBare}. They are equal, which means one of two things and neither is a ` +
                `passing state: the comment above colBtn() that writes <th> in prose was ` +
                `deleted, or stripComments() stopped removing it. SCANNER problem either way - ` +
                `section 11's "at least one bare <th>" check is only a real claim when the prose ` +
                `has been stripped out from under it.`,
        ).toBeGreaterThan(codeBare)

        expect(
            codeBare,
            `No bare <th> survives stripping, so section 11 has nothing left to find. That is ` +
                `the confidence header having gained an aria-sort, or the header markup having ` +
                `moved out of this file.`,
        ).toBeGreaterThan(0)
    })
})

/* ==========================================================================
 * The 0.7.11 combobox pass: the highlight moved, and nobody was told.
 *
 * WHAT 0.7.10 FOUND AND LEFT OPEN
 *
 * The 0.7.10 sweep (tests/clickableNonInteractive.test.ts) classified
 * src/components/common/ChampionCombobox.tsx as an ALLOWED interactive pattern:
 * its `<li role="option">` answer to the mouse and are deliberately not tab
 * stops, because in an ARIA combobox focus stays on the `<input>` the whole
 * time. That classification is right, and it came with a real gap written down
 * next to it: there was no `aria-activedescendant` and the options had no ids.
 *
 * So the arrow keys moved a visible highlight and a screen reader user heard
 * NOTHING while arrowing through the list. Focus never moved, no option was
 * referenced, and the only announcement was the input's own value. That is the
 * defect this pass fixed, and it is the quietest kind: the highlight is plainly
 * visible on screen, so nothing looks broken to the person writing the code.
 *
 *  15. The `<input role="combobox">` gained `aria-activedescendant`, bound to
 *      `activeDescendantId`, plus an `aria-controls` that is set ONLY while the
 *      listbox is really rendered.
 *  16. The `<ul>` gained `id={listboxId}` and every `<li role="option">` gained
 *      `id={comboboxOptionId(inputId, i)}`, which is what
 *      `aria-activedescendant` has to point AT. An option id that does not exist
 *      is worse than no attribute at all: it is a dangling reference.
 *  17. All three ids are namespaced by the SAME `inputId`, and
 *      `comboboxActiveDescendantId()` builds its value by calling
 *      `comboboxOptionId()` - the one function that also stamps the options.
 *      Two bases would compile, render, and point at nothing.
 *  18. The keyboard model that made the attribute necessary is unchanged:
 *      `handleKeyDown` still owns ArrowDown, ArrowUp, Enter and Escape.
 *
 * THE FAILURE MODES THESE SECTIONS EXIST FOR, all of them invisible on screen:
 *
 *  - THE ATTRIBUTE IS DELETED, or written as a LITERAL. `aria-activedescendant`
 *    is announced, never drawn; a hardcoded `"champion-option-0"` points at the
 *    first option forever while the highlight moves. Section 15 checks the VALUE
 *    SHAPE, exactly as sections 1, 4 and 11 do for aria-checked, aria-expanded
 *    and aria-sort.
 *  - THE REFERENCE DANGLES. The ids stop being built from `inputId`, or the
 *    options lose their ids entirely. The input then names an element that is
 *    not in the document and assistive tech announces nothing - the same silence
 *    as before the fix, with all the markup of the fix in place. Sections 16 and
 *    17 pin the FULL CALLS rather than the identifiers, because the identifiers
 *    are all on the import line and `toContain("comboboxOptionId")` survives
 *    deleting every use of it. CLAUDE.md records that trap four times
 *    (`scoutPluralMessage`, `scoutBanPhaseKey`, `splitScoutList`,
 *    `nextChampionSelection`).
 *  - THE OPTIONS BECOME TAB STOPS. A `<button>` per option, or a `tabIndex` on
 *    the `<li>`, is the obvious-looking "make it keyboard accessible" move and
 *    it is the wrong one here: it puts ~170 tab stops in the page and destroys
 *    the listbox semantics that make `aria-activedescendant` meaningful in the
 *    first place. Section 16 asserts that pair is absent BY NAME, the way
 *    section 1 does for tab semantics and sections 6/7 do for the fake button.
 *
 * WHY THAT LAST SCAN IS SCOPED TO THE `<ul>` AND NOT TO THE FILE
 *
 * The same file legitimately contains `<button className="combobox-clear"
 * tabIndex={-1}>`. That button is CORRECT: it is a real button, and its
 * `tabIndex={-1}` deliberately keeps the clear affordance out of the tab order
 * because the input next to it already reaches the same behaviour. A file-wide
 * `fakeButtonIn()` would go red on it, and the tempting "fix" would be either
 * deleting the clear button or weakening the rule until it no longer catches an
 * option turned into a tab stop. {@link listboxMarkup} therefore slices the
 * `<ul>` block and the scan runs on that slice only. Section 19 proves both
 * halves of that claim.
 *
 * The caveat block at the top of this file applies unchanged: Vitest runs in
 * Node with no jsdom, so nothing here renders. These scans show that the
 * attribute is WRITTEN and that it is built from the same base as the ids it
 * points at. They do NOT show that the reference RESOLVES at runtime, that the
 * highlighted option is the one Enter would take, or that any screen reader
 * announces it. That last one is a manual test in a real browser.
 * ========================================================================== */

const CHAMPION_COMBOBOX = "components/common/ChampionCombobox.tsx"
const COMBOBOX_IDS = "components/common/comboboxIds.ts"

/**
 * `source` with ALL whitespace removed, so a multi-line call can be pinned in
 * full without pinning how the formatter happened to wrap it.
 *
 * The component writes `comboboxActiveDescendantId(` with its four arguments on
 * four lines. {@link openingTags} already collapses runs of whitespace to single
 * spaces, which is enough for an attribute but not for an argument list: a
 * reformat from four lines to one changes `( inputId,` into `(inputId,` and
 * would turn a formatting change into a false red. Removing the whitespace
 * entirely makes the pin depend on the CALL and on nothing else.
 */
const dense = (source: string): string => source.replace(/\s+/g, "")

/** The marker that identifies the popup, used to find the `<ul>` around it. */
const LISTBOX_ROLE = 'role="listbox"'

/**
 * The whole `<ul role="listbox">...</ul>`, opening tag AND children, whitespace
 * collapsed. Empty when there is no listbox in `source`.
 *
 * Same device, same reason, as {@link noteCardMarkup}: {@link openingTags} stops
 * at the opening tag's `>`, so it can say nothing about what is nested INSIDE
 * the popup - and "no button and no tab stop in there" is precisely the rule
 * that has to hold. Slicing to the first `</ul>` is safe because this component
 * renders exactly one list and nests none.
 *
 * The empty return is load-bearing rather than defensive: an absent listbox
 * slices to `""`, which contains no `<button>` either and would pass the scan in
 * silence. Section 16 therefore asserts the slice is non-empty BEFORE asserting
 * anything about its contents.
 */
const listboxMarkup = (source: string): string => {
    const marker = source.indexOf(LISTBOX_ROLE)
    if (marker === -1) return ""
    const start = source.lastIndexOf("<ul", marker)
    const end = source.indexOf("</ul>", marker)
    if (start === -1 || end === -1) return ""
    return source.slice(start, end + "</ul>".length).replace(/\s+/g, " ").trim()
}

/**
 * Everything inside a listbox slice that would make an option focusable.
 *
 * Reuses {@link fakeButtonIn} for the `role="button"` / `tabIndex` pair rather
 * than restating those two patterns, and adds the one shape it cannot see: a
 * real `<button>` ELEMENT nested in the popup. An option rebuilt as a button
 * carries no `role="button"` and needs no `tabIndex` - it is a tab stop by being
 * a button - so a check for the fake pair alone would wave it through.
 */
const listboxTabStopsIn = (markup: string): string[] => [
    ...(/<button\b/.test(markup) ? ["<button>"] : []),
    ...fakeButtonIn(markup),
]

/** Every `<input role="combobox">` opening tag in `source`. */
const comboboxInputs = (source: string): string[] =>
    openingTags(source, "input").filter((tag) => hasAttributeLiteral(tag, "role", "combobox"))

/** The four keys `handleKeyDown` owns, and the whole reason the highlight moves. */
const COMBOBOX_KEYS = ["ArrowDown", "ArrowUp", "Enter", "Escape"] as const

/* ==========================================================================
 * 15. The combobox input names the option it has highlighted.
 * ========================================================================== */

describe("ChampionCombobox points at the option it has highlighted", () => {
    it("has the component, the input and the listbox this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION - and the message has to say so,
        // because every assertion in this section is a FILTER over
        // openingTags(). A renamed file or a moved component makes those filters
        // return empty arrays, and "no offending tag was found" is
        // indistinguishable from "the file was never read". Named markers rather
        // than a bare count, per CLAUDE.md "Quelltext-Scanner in Tests:
        // Anti-Vakuositaet benennt Dateien, nicht Zahlen".
        //
        // Red when: CHAMPION_COMBOBOX points at a file that does not exist, or
        // the component is renamed.
        const raw = read(CHAMPION_COMBOBOX)
        expect(
            raw.length,
            `src/${CHAMPION_COMBOBOX} read as empty. This is a SCANNER problem, not a rule ` +
                `violation: fix the path before touching the component.`,
        ).toBeGreaterThan(0)
        expect(
            raw,
            `src/${CHAMPION_COMBOBOX} does not contain "export function ChampionCombobox". This ` +
                `is a SCANNER problem, not a rule violation - the component was renamed or ` +
                `moved, and this section is reading the wrong file.`,
        ).toContain("export function ChampionCombobox")

        const source = code(CHAMPION_COMBOBOX)
        expect(
            openingTags(source, "input").length,
            `No <input> parsed out of src/${CHAMPION_COMBOBOX}. SCANNER problem, not a rule ` +
                `violation: with an empty list every per-input check below passes on nothing.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(source, "ul").length,
            `No <ul> parsed out of src/${CHAMPION_COMBOBOX}. SCANNER problem, not a rule ` +
                `violation: the popup markup moved out of this file.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(source, "li").length,
            `No <li> parsed out of src/${CHAMPION_COMBOBOX}. SCANNER problem, not a rule ` +
                `violation: section 16 reads these, and an empty list makes every option check ` +
                `vacuous.`,
        ).toBeGreaterThan(0)
    })

    it("puts the combobox role on exactly one input", () => {
        // Red when the role is dropped from the input, or when a second
        // role="combobox" input appears and the single-tag reads below start
        // silently describing whichever one comes first.
        const inputs = comboboxInputs(code(CHAMPION_COMBOBOX))
        expect(
            inputs.length,
            `Expected exactly one <input role="combobox">. Zero means the input no longer ` +
                `announces as a combobox at all, and aria-expanded / aria-activedescendant on a ` +
                `plain textbox are meaningless to assistive tech. More than one means every ` +
                `assertion below is reading an arbitrary one of them.`,
        ).toBe(1)
    })

    it("binds aria-activedescendant to the computed id, not to a literal", () => {
        // Red when aria-activedescendant is deleted (kind "none"), when it is
        // written as a quoted id (kind "literal"), or when it is bound to
        // anything other than the value the component computes.
        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))
        const active = attributeValue(input, "aria-activedescendant")

        expect(
            active.kind,
            `The combobox input has no bound aria-activedescendant. Without it the arrow keys ` +
                `move a highlight that only SIGHTED users perceive: focus stays on the input by ` +
                `design, so nothing else tells assistive tech which option is current, and a ` +
                `screen reader user hears silence while arrowing through the list. A LITERAL ` +
                `value is the other half of the trap - it compiles, it renders, and it points at ` +
                `one fixed option forever while the highlight moves. Tag as written: ${input}`,
        ).toBe("expression")

        // ...and the expression has to be the one the component computed. `{""}`
        // is a bound expression too, and it is a dangling reference rather than
        // an absent one.
        expect(
            dense(active.text),
            `aria-activedescendant is bound to something other than activeDescendantId, so it no ` +
                `longer follows comboboxActiveDescendantId()'s range check - the one thing that ` +
                `stops it referencing an option that is not in the DOM. Expression as written: ` +
                `${active.text}`,
        ).toBe("activeDescendantId")

        // The whole attribute, pinned as one string: the two assertions above
        // are about the VALUE, and this one is about the attribute still being
        // spelled the way the component reads.
        expect(
            input,
            `The input no longer carries aria-activedescendant={activeDescendantId} verbatim.`,
        ).toContain("aria-activedescendant={activeDescendantId}")
    })

    it("keeps the combobox pattern the fix was added to", () => {
        // REGRESSION GUARD. Red when the 0.7.11 change damaged what 0.7.10
        // classified as correct: drop role="combobox", hardcode aria-expanded,
        // or remove aria-autocomplete, and the new attribute sits on an element
        // that no longer announces as a combobox at all.
        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))

        const expanded = attributeValue(input, "aria-expanded")
        expect(
            expanded.kind,
            `aria-expanded is gone or hardcoded on the combobox input. A LITERAL "true" is the ` +
                `quiet one: the popup closes on screen and the input keeps announcing itself as ` +
                `expanded forever. Tag as written: ${input}`,
        ).toBe("expression")
        expect(
            dense(expanded.text),
            `aria-expanded is bound to something that is not the open state, so it cannot follow ` +
                `the popup. Expression as written: ${expanded.text}`,
        ).toBe("open")

        expect(
            hasAttributeLiteral(input, "aria-autocomplete", "list"),
            `The input lost aria-autocomplete="list". It is what tells assistive tech that ` +
                `typing filters a list of options rather than completing inline, which is ` +
                `exactly the behaviour aria-activedescendant then reports on. Tag as written: ` +
                `${input}`,
        ).toBe(true)
    })

    it("sets aria-controls only while the listbox is rendered", () => {
        // Red when aria-controls is deleted, hardcoded, or set unconditionally
        // to {listboxId} - the last one being the subtle mutant: it compiles and
        // renders, and points at a <ul> that does not exist whenever the popup
        // is closed or the filter matched nothing.
        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))
        const controls = attributeValue(input, "aria-controls")

        expect(
            controls.kind,
            `aria-controls on the combobox input is missing or hardcoded. Tag as written: ` +
                `${input}`,
        ).toBe("expression")

        expect(
            dense(controls.text),
            `aria-controls is no longer gated on listboxRendered. The component renders the <ul> ` +
                `only while the popup is open AND something matched; an ungated aria-controls ` +
                `therefore names an element that is not in the document whenever the popup is ` +
                `closed or the query matched nothing - a DANGLING reference, which is worse than ` +
                `an absent one. Expression as written: ${controls.text}`,
        ).toBe("listboxRendered?listboxId:undefined")
    })
})

/* ==========================================================================
 * 16. Every option carries the id the input points at, and no tab stop.
 * ========================================================================== */

describe("the combobox options are referenceable and are not tab stops", () => {
    it("has the listbox and its options this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION. Every assertion below reads
        // this slice; an absent listbox slices to "" and would satisfy every
        // negative check in silence.
        //
        // Red when: the <ul role="listbox"> is renamed, moved out of the file,
        // or the options stop being <li> - rebuilding them as <button> trips
        // this AND the tab-stop rule below.
        const listbox = listboxMarkup(code(CHAMPION_COMBOBOX))
        expect(
            listbox.length,
            `No <ul ${LISTBOX_ROLE}> block sliced out of src/${CHAMPION_COMBOBOX}. This is a ` +
                `SCANNER problem, not a rule violation: an empty slice contains no <button> and ` +
                `no tabIndex either, so every check in this section would pass on nothing.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(listbox, "li").length,
            `No <li> inside the listbox slice. SCANNER problem unless the options were ` +
                `deliberately rebuilt as some other element - in which case re-point this ` +
                `section before trusting it, because the per-option checks below are reading an ` +
                `empty list.`,
        ).toBeGreaterThan(0)
    })

    it("gives the listbox the id aria-controls points at", () => {
        // Red when the <ul> loses its id (aria-controls then dangles), when it
        // loses role="listbox", or when the id is hardcoded instead of shared
        // with the input's base.
        const [list] = openingTags(code(CHAMPION_COMBOBOX), "ul")
        expect(
            hasAttributeLiteral(list, "role", "listbox"),
            `The popup <ul> lost role="listbox". A bare list is not a listbox, and an ` +
                `aria-activedescendant pointing into it means nothing. Tag as written: ${list}`,
        ).toBe(true)

        const listId = attributeValue(list, "id")
        expect(
            listId.kind,
            `The popup <ul> has no bound id, so the input's aria-controls points at nothing. ` +
                `Tag as written: ${list}`,
        ).toBe("expression")
        expect(
            dense(listId.text),
            `The listbox id is no longer the value the input's aria-controls names. Expression ` +
                `as written: ${listId.text}`,
        ).toBe("listboxId")
    })

    it("marks every item in the listbox as an option", () => {
        // Red when role="option" is dropped from the <li>. A bare <li> inside a
        // role="listbox" has no option role of its own, so the set size and
        // position announcements collapse and aria-activedescendant points at
        // something assistive tech cannot describe.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        const roleless = options.filter((tag) => !hasAttributeLiteral(tag, "role", "option"))
        expect(
            roleless,
            `These list items inside role="listbox" carry no role="option". ` +
                `aria-activedescendant must reference an OPTION; pointing it at a generic list ` +
                `item leaves assistive tech with a reference it cannot describe.`,
        ).toEqual([])
    })

    it("builds every option id from comboboxOptionId(inputId, i)", () => {
        // Red when the option id is deleted (aria-activedescendant then dangles
        // in every state), hardcoded, or rebuilt on a different base such as
        // comboboxOptionId(generatedId, i) - the last one renders perfectly and
        // points at ids that no option carries.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        for (const tag of options) {
            const optionId = attributeValue(tag, "id")
            expect(
                optionId.kind,
                `An option has no bound id, so aria-activedescendant has nothing to reference ` +
                    `and the arrow keys go back to being silent. A LITERAL id is the other half: ` +
                    `every option in the rendered list would then share one id. Tag as written: ` +
                    `${tag}`,
            ).toBe("expression")

            // THE FULL CALL, not the identifier. `comboboxOptionId` is on the
            // import line, so toContain("comboboxOptionId") stays green after
            // deleting every USE of it - the vacuity trap CLAUDE.md records four
            // times over. The exact string also pins the BASE: swapping inputId
            // for any other identifier changes it.
            expect(
                dense(optionId.text),
                `The option id is no longer built by comboboxOptionId(inputId, i). Either the ` +
                    `builder changed or the base did, and a base that differs from the one ` +
                    `behind aria-activedescendant makes every reference dangle while everything ` +
                    `on screen keeps working. Expression as written: ${optionId.text}`,
            ).toBe("comboboxOptionId(inputId,i)")
        }
    })

    it("keeps aria-selected bound to the highlight", () => {
        // Red when aria-selected is deleted or hardcoded - `aria-selected="true"`
        // announces EVERY option as selected at once, with no visual symptom.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        for (const tag of options) {
            const selected = attributeValue(tag, "aria-selected")
            expect(
                selected.kind,
                `An option's aria-selected is missing or hardcoded. A literal "true" announces ` +
                    `every option as selected simultaneously; a literal "false" announces none, ` +
                    `while the highlight is plainly visible on screen. Tag as written: ${tag}`,
            ).toBe("expression")
            expect(
                selected.text,
                `aria-selected no longer depends on activeIndex, so it cannot follow the ` +
                    `highlight that aria-activedescendant is announcing. Expression as written: ` +
                    `${selected.text}`,
            ).toContain("activeIndex")
        }
    })

    it("puts no button and no tab stop inside the listbox", () => {
        // Red when an option gains tabIndex={0}, gains role="button", or is
        // rebuilt as a <button>. SCOPED TO THE <ul> ON PURPOSE: the same file
        // holds a legitimate <button className="combobox-clear" tabIndex={-1}>,
        // and a file-wide scan would be red on correct code - section 19 proves
        // the scoping works in both directions.
        expect(
            listboxTabStopsIn(listboxMarkup(code(CHAMPION_COMBOBOX))),
            `The listbox contains a tab stop. Options in an ARIA combobox are deliberately NOT ` +
                `focusable: focus stays on the input, which is the entire reason ` +
                `aria-activedescendant exists here. Turning the options into buttons or giving ` +
                `them a tabIndex puts one tab stop per champion into the page and destroys the ` +
                `listbox semantics - the "accessibility fix" that makes the control less usable ` +
                `than it was. This scan covers the <ul> block only, so the clear button next to ` +
                `the input is not what tripped it.`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 17. One id base, and one function behind both ends of the reference.
 *
 * `aria-activedescendant` is a STRING COMPARISON performed by the browser. Every
 * check in sections 15 and 16 can pass while the two sides are built from
 * different bases, and the result is a reference that resolves to nothing with
 * no visual symptom whatsoever.
 * ========================================================================== */

describe("the combobox ids all come from one base", () => {
    it("has the id module this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION: this section pins call strings
        // inside two files, and a wrong path makes every toContain() below fail
        // for a reason that has nothing to do with the rule.
        //
        // Red when: comboboxIds.ts is renamed, or one of its three builders is.
        const raw = read(COMBOBOX_IDS)
        expect(
            raw.length,
            `src/${COMBOBOX_IDS} read as empty. SCANNER problem, not a rule violation: fix the ` +
                `path before touching the module.`,
        ).toBeGreaterThan(0)
        for (const marker of [
            "export function comboboxListboxId",
            "export function comboboxOptionId",
            "export function comboboxActiveDescendantId",
        ]) {
            expect(
                raw,
                `src/${COMBOBOX_IDS} does not contain "${marker}". SCANNER problem, not a rule ` +
                    `violation - the builder was renamed, and this section is pinning calls that ` +
                    `no longer exist under that name.`,
            ).toContain(marker)
        }
    })

    it("feeds inputId to every id builder in the component", () => {
        // Red when any of the three ids is built from a second base - a fresh
        // useId(), the raw `id` prop, a champion name - because the input would
        // then point at ids no option carries while everything on screen keeps
        // working. Also red when the input stops carrying inputId itself, which
        // is the same break seen from the other end.
        const flat = dense(code(CHAMPION_COMBOBOX))

        expect(
            flat,
            `The component no longer derives inputId from the id prop with a useId() fallback. ` +
                `Every id below is namespaced by it, so a second source here splits the ` +
                `reference in two.`,
        ).toContain("constinputId=id??generatedId")

        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))
        expect(
            dense(attributeValue(input, "id").text),
            `The input's own id is no longer inputId, so the listbox and option ids are ` +
                `namespaced by something the input does not carry. Tag as written: ${input}`,
        ).toBe("inputId")

        // The FULL CALLS, for the same reason section 16 pins one: all three
        // identifiers sit on the import line at the top of the file, so a scan
        // for the bare name survives deleting every use of it.
        expect(
            flat,
            `The listbox id is no longer comboboxListboxId(inputId). A different base here makes ` +
                `aria-controls point at an element the popup does not have.`,
        ).toContain("constlistboxId=comboboxListboxId(inputId)")
        expect(
            flat,
            `The option ids are no longer comboboxOptionId(inputId, i) - see section 16 for what ` +
                `that costs.`,
        ).toContain("id={comboboxOptionId(inputId,i)}")
        expect(
            flat,
            `comboboxActiveDescendantId() is no longer called with inputId first, or its other ` +
                `three arguments changed. The count argument in particular is deliberately ` +
                `filtered.length - the number of options ACTUALLY being rendered - because ` +
                `activeIndex is clamped in a useEffect and is still the old, out-of-range value ` +
                `during the render in which the list has just got shorter.`,
        ).toContain("comboboxActiveDescendantId(inputId,listboxRendered,filtered.length,activeIndex")
    })

    it("builds aria-activedescendant with the very function that stamps the options", () => {
        // THE COUPLING, pinned where it lives rather than inferred from the
        // component. Red when comboboxActiveDescendantId() stops delegating and
        // formats its own string: the two sides would then be two independent
        // templates that merely happen to agree today.
        const flat = dense(code(COMBOBOX_IDS))

        expect(
            flat,
            `comboboxActiveDescendantId() no longer returns comboboxOptionId(baseId, ` +
                `activeIndex). If it builds the string itself, the value on the input and the ` +
                `ids on the options are produced by two different pieces of code, and a change ` +
                `to one silently breaks the reference.`,
        ).toContain("returncomboboxOptionId(baseId,activeIndex)")

        // ...and the two id shapes themselves, so a renamed suffix on one side
        // cannot pass unnoticed. Both are namespaced by the same `baseId`, which
        // is what keeps two comboboxes on one page from colliding.
        expect(
            flat,
            "comboboxListboxId() no longer builds its id as baseId plus the -listbox suffix",
        ).toContain("return`${baseId}-listbox`")
        expect(
            flat,
            "comboboxOptionId() no longer builds its id as baseId plus the -option-index suffix",
        ).toContain("return`${baseId}-option-${index}`")
    })
})

/* ==========================================================================
 * 18. The keyboard model that made the attribute necessary is unchanged.
 * ========================================================================== */

describe("the combobox keyboard model survived the change", () => {
    it("still routes the input's keys through handleKeyDown", () => {
        // Red when the handler is renamed, deleted, or detached from the input -
        // at which point aria-activedescendant reports a highlight that nothing
        // can move.
        const flat = dense(code(CHAMPION_COMBOBOX))
        expect(
            flat,
            `src/${CHAMPION_COMBOBOX} has no handleKeyDown. The whole keyboard model of this ` +
                `control sits in that one function; without it the arrow keys do nothing and ` +
                `aria-activedescendant announces a highlight that can never move.`,
        ).toContain("functionhandleKeyDown")

        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))
        expect(
            input,
            `The combobox input is no longer wired to handleKeyDown. Tag as written: ${input}`,
        ).toContain("onKeyDown={handleKeyDown}")
    })

    it("still handles ArrowDown, ArrowUp, Enter and Escape", () => {
        // Red when any one branch is deleted. ArrowDown is the one that matters
        // most: it both opens the popup and advances the highlight, so removing
        // it leaves an input that announces a combobox nobody can open from the
        // keyboard - while every other assertion in sections 15 to 17 stays
        // green.
        const flat = dense(code(CHAMPION_COMBOBOX))
        for (const key of COMBOBOX_KEYS) {
            expect(
                flat,
                `handleKeyDown no longer compares e.key against "${key}". The four keys are the ` +
                    `whole keyboard contract of an ARIA combobox: ArrowDown/ArrowUp move the ` +
                    `highlight aria-activedescendant announces, Enter commits it, Escape ` +
                    `restores the committed value. Dropping one leaves the attribute describing ` +
                    `a state the user can no longer reach.`,
            ).toContain(`e.key==="${key}"`)
        }
    })
})

/* ==========================================================================
 * 19. Anti-vacuity for sections 15-18: the new predicates, proven able to go
 * red.
 *
 * Same device as sections 5, 9 and 13, for the same reason: a scan whose pattern
 * has quietly stopped matching passes in silence. Every fixture below runs
 * through the EXACT helper the real assertions use, and each carries its INVERSE
 * - the shape that is really in the source and must NOT trip the rule - because
 * a predicate that fires on everything is as useless as one that fires on
 * nothing.
 * ========================================================================== */

describe("the 0.7.11 guards can go red", () => {
    it("removes whitespace so a wrapped call can be pinned in full", () => {
        // Without this, section 17's call pins would depend on how the formatter
        // wrapped the argument list, and a reformat would read as a defect.
        expect(dense("f(\n    a,\n    b,\n)")).toBe("f(a,b,)")
        expect(dense("const x = id ?? generatedId")).toBe("constx=id??generatedId")
        // ...and it must not flatten two different calls into the same string,
        // which is the direction that would make every pin above vacuous.
        expect(dense("comboboxOptionId(other, i)")).not.toBe("comboboxOptionId(inputId,i)")
    })

    it("slices the listbox block and reports an absent one as empty", () => {
        const listbox = '<ul id={listboxId} role="listbox"><li role="option">{name}</li></ul>'
        expect(listboxMarkup(listbox)).toBe(listbox)
        expect(openingTags(listboxMarkup(listbox), "li").length).toBe(1)

        // The empty case is why section 16 asserts a non-empty slice BEFORE
        // asserting anything about its contents: "" contains no <button> and no
        // tabIndex either, and would pass every negative check silently.
        expect(listboxMarkup('<div className="combobox-empty">{t("common_noMatch")}</div>')).toBe("")
        expect(listboxTabStopsIn("")).toEqual([])
    })

    it("keeps the legitimate clear button out of the listbox slice", () => {
        // THE SCOPING FIXTURE, and the reason the scan is not file-wide. The
        // clear button is CORRECT code: a real button whose tabIndex={-1}
        // deliberately keeps it out of the tab order. A file-wide scan would
        // report it, and the tempting "fix" would be to delete the button or to
        // weaken the rule until an option with a tabIndex slips through.
        const shaped = [
            '<div className="combobox-input-wrap">',
            '  <input role="combobox" aria-activedescendant={activeDescendantId} />',
            '  <button type="button" className="combobox-clear" tabIndex={-1}>x</button>',
            "</div>",
            '<ul id={listboxId} role="listbox">',
            '  <li id={comboboxOptionId(inputId, i)} role="option" aria-selected={i === activeIndex}>{name}</li>',
            "</ul>",
        ].join("\n")

        // The fixture really does hold the trap OUTSIDE the popup...
        expect(
            fakeButtonIn(shaped),
            "the fixture stopped containing a tabIndex outside the listbox, so it no longer " +
                "demonstrates anything about scoping",
        ).toEqual(["tabIndex"])
        expect(
            /<button\b/.test(shaped),
            "the fixture stopped containing a <button> outside the listbox",
        ).toBe(true)

        // ...and the scoped scan must not see any of it.
        expect(
            listboxTabStopsIn(listboxMarkup(shaped)),
            "the listbox slice reaches outside the <ul>, so section 16 is about to go red on the " +
                "clear button - correct code - and the obvious fix would be to weaken the rule",
        ).toEqual([])
    })

    it("catches a tab stop and a button inside the listbox", () => {
        // THE THREE MUTANTS SECTION 16 EXISTS FOR. All three render a list that
        // looks identical and behaves identically for the mouse.
        expect(
            listboxTabStopsIn(
                listboxMarkup('<ul role="listbox"><li tabIndex={0} role="option">{name}</li></ul>'),
            ),
        ).toEqual(["tabIndex"])
        expect(
            listboxTabStopsIn(
                listboxMarkup('<ul role="listbox"><li role="option"><button>{name}</button></li></ul>'),
            ),
        ).toEqual(["<button>"])
        // An option rebuilt AS a button carries no role="button" and needs no
        // tabIndex - it is a tab stop by being a button - so the element check
        // is the only half that catches it.
        expect(
            listboxTabStopsIn(
                listboxMarkup('<ul role="listbox"><button role="option" id={x}>{name}</button></ul>'),
            ),
        ).toContain("<button>")
        // ...and the shape that is really there must stay clean, or section 16
        // would be red on correct code.
        expect(
            listboxTabStopsIn(
                listboxMarkup('<ul role="listbox"><li role="option" onMouseDown={pick}>{name}</li></ul>'),
            ),
        ).toEqual([])
    })

    it("tells a bound aria-activedescendant from a hardcoded and from an absent one", () => {
        const bound = openingTags(
            '<input role="combobox" aria-activedescendant={activeDescendantId}>',
            "input",
        )[0]
        const literal = openingTags(
            '<input role="combobox" aria-activedescendant="champion-option-0">',
            "input",
        )[0]
        const missing = openingTags('<input role="combobox" aria-expanded={open}>', "input")[0]

        expect(attributeValue(bound, "aria-activedescendant").kind).toBe("expression")
        expect(dense(attributeValue(bound, "aria-activedescendant").text)).toBe("activeDescendantId")
        // The literal is the mutant that matters: it compiles, it renders, and
        // it announces the first option forever while the highlight moves.
        expect(attributeValue(literal, "aria-activedescendant").kind).toBe("literal")
        expect(hasAttribute(literal, "aria-activedescendant")).toBe(true)
        // The absent one has to report as "none" rather than as an empty value,
        // or section 15's shape check would pass on a deleted attribute.
        expect(attributeValue(missing, "aria-activedescendant").kind).toBe("none")

        // ...and the filter that finds the input at all has to be selective, or
        // "exactly one" would be counting something else.
        expect(comboboxInputs('<input role="combobox">').length).toBe(1)
        expect(comboboxInputs('<input type="text">').length).toBe(0)
    })

    it("tells a bound option id from a literal one, and refuses a look-alike attribute", () => {
        const option = openingTags(
            '<li id={comboboxOptionId(inputId, i)} role="option" aria-selected={i === activeIndex}>',
            "li",
        )[0]
        expect(dense(attributeValue(option, "id").text)).toBe("comboboxOptionId(inputId,i)")
        expect(hasAttributeLiteral(option, "role", "option")).toBe(true)

        expect(attributeValue(openingTags('<li id="option-0">', "li")[0], "id").kind).toBe("literal")
        expect(attributeValue(openingTags('<li role="option">', "li")[0], "id").kind).toBe("none")

        // THE REBASED MUTANT: still an expression, still built by the right
        // function, and it points at ids no option carries. Only the exact call
        // pin sees it.
        const rebased = openingTags("<li id={comboboxOptionId(generatedId, i)}>", "li")[0]
        expect(attributeValue(rebased, "id").kind).toBe("expression")
        expect(dense(attributeValue(rebased, "id").text)).not.toBe("comboboxOptionId(inputId,i)")

        // ...and an attribute that merely CONTAINS "id" must not read as one.
        // The (?<![\w-]) boundary in attributeValue() is what refuses both of
        // these.
        expect(hasAttribute(openingTags('<li data-id="x" grid="y">', "li")[0], "id")).toBe(false)
    })

    it("tells a gated aria-controls from an unconditional one", () => {
        const gated = openingTags(
            "<input aria-controls={listboxRendered ? listboxId : undefined}>",
            "input",
        )[0]
        expect(dense(attributeValue(gated, "aria-controls").text)).toBe(
            "listboxRendered?listboxId:undefined",
        )

        // THE SUBTLE MUTANT: still an expression, still bound, still green under
        // any "is it hardcoded?" check - and it names a <ul> that is absent
        // whenever the popup is closed or the filter matched nothing.
        const ungated = openingTags("<input aria-controls={listboxId}>", "input")[0]
        expect(attributeValue(ungated, "aria-controls").kind).toBe("expression")
        expect(dense(attributeValue(ungated, "aria-controls").text)).not.toBe(
            "listboxRendered?listboxId:undefined",
        )
        expect(
            attributeValue(openingTags("<input aria-expanded={open}>", "input")[0], "aria-controls")
                .kind,
        ).toBe("none")
    })
})

/* ==========================================================================
 * 20. The dependency section 16 rests on, pinned in BOTH directions.
 *
 * `listboxTabStopsIn(listboxMarkup(code(file)))` is empty for two possible
 * reasons: the popup really holds no tab stop, or stripComments() ate something
 * it should not have. Only one of those is a passing test.
 *
 * The JSX comment inside the `.map()` explains why the options are NOT buttons,
 * and to do that it writes `<button>`. That comment sits between the `<ul>` and
 * its `</ul>`, so it is inside the slice - and on RAW source it alone trips the
 * rule. CLAUDE.md records exactly this trap under "Quelltext-Scanner in Tests:
 * Anti-Vakuositaet benennt Dateien, nicht Zahlen": a rule that was green only
 * because a stripper removed the prose naming the forbidden token, with the
 * dependency itself never checked. When the stripper broke, the message sent the
 * next reader hunting a reintroduction that had never happened.
 * ========================================================================== */

describe("the listbox tab-stop scan depends on comment stripping, and says so", () => {
    it("names the rejected button in prose and nowhere in the popup's code", () => {
        // Red in one direction when the prose that names the rejected solution
        // is deleted - then section 16's empty expectation is true of a popup
        // with nothing to strip, and this fixture proves nothing. Red in the
        // other direction when stripComments() stops working - then section 16
        // is about to fail on documentation rather than on code.
        //
        // ONLY the <button> half is coupled, and deliberately so: the same
        // comment writes tabIndex in backticks with no `=` after it, and
        // FAKE_BUTTON's pattern demands the `=`. Pinning a coupling that does
        // not exist would be a fixture that can never go red.
        expect(
            listboxTabStopsIn(listboxMarkup(read(CHAMPION_COMBOBOX))),
            `The <li> comment in src/${CHAMPION_COMBOBOX} no longer names <button> as the ` +
                `rejected solution. That prose is what stops the next reader "fixing" the ` +
                `keyboard access by turning one option per champion into a tab stop, and it is ` +
                `also what makes section 16 meaningful: without it, "the stripped popup holds no ` +
                `button" is true of a popup that has nothing to strip. If the comment was ` +
                `rewritten on purpose, re-point this fixture at whatever now documents the ` +
                `rejected shape.`,
        ).toContain("<button>")

        expect(
            listboxTabStopsIn(listboxMarkup(code(CHAMPION_COMBOBOX))),
            `stripComments() no longer removes the comment in src/${CHAMPION_COMBOBOX} that ` +
                `names <button>. This is a SCANNER problem, not a rule violation: section 16 is ` +
                `about to go red on documentation instead of on code, and the obvious "fix" - ` +
                `deleting the explanation - would remove the only thing telling the next reader ` +
                `why the options are plain <li>.`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 0.7.12: the options are COUNTED - and the count is only true because the
 * whole filtered list is rendered.
 *
 * WHAT 0.7.12 CHANGED, and why each half needs a guard
 *
 * 0.7.11 gave the combobox `aria-activedescendant`, stable option ids and a
 * gated `aria-controls`, so assistive tech could finally say WHICH option is
 * highlighted. What it still could not say is WHERE that option sits: an
 * `aria-activedescendant` listbox moves a highlight without moving focus, and
 * several screen readers do not count the DOM for themselves in that mode. The
 * user heard "Ahri" and nothing else - not "5 of 170", not "1 of 3 after
 * filtering". 0.7.12 adds the two attributes that say it out loud, on the
 * `<li role="option">` and nowhere else:
 *
 *     aria-setsize={filtered.length}
 *     aria-posinset={i + 1}
 *
 * Nothing else about the component moved. The "no match" note keeps its total
 * absence of ARIA on purpose: it is a MESSAGE ABOUT the list, not a member of
 * it, and there is no listbox rendered beside it to be a member of.
 *
 *  21. Every `<li>` inside the popup carries BOTH attributes, both as bound
 *      expressions, and bound to exactly `filtered.length` and `i + 1`. The
 *      same two attributes are absent from the `<ul>` and from the input.
 *  22. The `<div className="combobox-empty">` carries neither, and no `role`.
 *  23. The `.map()` runs over `filtered` itself, uncapped. This is the
 *      ASSUMPTION the other two numbers stand on, so it is pinned as a rule
 *      rather than left in a comment.
 *  24. The 0.7.11 reference chain still holds on the very tags 0.7.12 extended.
 *
 * THE FAILURE MODES THESE SECTIONS EXIST FOR, all of them invisible on screen:
 *
 *  - THE OFF-BY-ONE. `aria-posinset` is 1-BASED and `i` is 0-based, so
 *    `aria-posinset={i}` is the single most likely mutation in this whole
 *    change. It compiles, it renders, every option still announces a position -
 *    and the first option announces "0 of 170", which is out of range, while the
 *    last announces one short of the total. Nothing on screen differs by a
 *    pixel. Section 21 pins the expression as `i + 1` and section 25 proves the
 *    pin rejects a bare `i`.
 *  - THE COUNT BECOMES A LITERAL. `aria-setsize="170"` is the same trap sections
 *    1, 4, 11 and 15 guard for aria-checked, aria-expanded, aria-sort and
 *    aria-activedescendant: it renders, and it keeps announcing the unfiltered
 *    total after the user has typed the list down to three.
 *  - THE ATTRIBUTES MIGRATE UPWARDS. `aria-setsize` on the `<ul>` looks tidier
 *    and is meaningless: both attributes describe a MEMBER of a set, so on the
 *    container they are ignored, and the options go back to being uncounted with
 *    the markup of the fix apparently in place. Section 21 asserts their absence
 *    on the `<ul>` and on the input BY NAME.
 *  - THE LIST GETS CAPPED. A `.slice(0, 50)` in the map source is the classic
 *    "the dropdown is too long" fix, and it turns the two attributes into
 *    contradictions of each other: `aria-setsize` would keep naming the full
 *    total (which is what it is FOR) while `i + 1` would index a shortened
 *    array, so option 50 of 170 would be the last one reachable and nothing
 *    would say so. Section 23 exists for exactly that mutation.
 *
 * The caveat block at the top of this file applies unchanged: Vitest runs in
 * Node with no jsdom, so nothing here renders. These are source-TEXT scans. They
 * show the attributes are WRITTEN, on the right element, bound to the right
 * expressions, and that the list they describe is uncapped. They do NOT show
 * that a screen reader announces "5 of 170", or that it announces it at a useful
 * moment. That remains a manual test in a real browser with a real screen
 * reader.
 * ========================================================================== */

/** The class on the "no match" note, which is deliberately NOT an option. */
const COMBOBOX_EMPTY_CLASS = "combobox-empty"

/**
 * The two position attributes, each paired with the expression it MUST be bound
 * to, written {@link dense} because that is how both predicates below compare.
 *
 * Declared as one table for the same reason TAB_SEMANTICS and FAKE_BUTTON are:
 * the real assertions and the section 25 fixtures then run the identical rule,
 * and a third place to forget one of the two attributes never exists.
 */
const POSITION_ATTRIBUTES: ReadonlyArray<readonly [attribute: string, expression: string]> = [
    ["aria-setsize", "filtered.length"],
    ["aria-posinset", "i+1"],
]

/**
 * The position attributes on `tag` that are missing, hardcoded, or bound to the
 * wrong expression - named, so a failure says WHICH one and not merely "false".
 *
 * Three defects collapse into one predicate on purpose, because all three have
 * the same symptom (none) and the same cost: `kind !== "expression"` catches the
 * deleted attribute and the literal, and the text comparison catches
 * `aria-posinset={i}`, `aria-posinset={i + 2}` and an `aria-setsize` bound to
 * `champions.length` - the unfiltered total, which announces "5 of 170" while
 * three options are on screen.
 */
const positionDefectsIn = (tag: string): string[] =>
    POSITION_ATTRIBUTES.filter(([attribute, expression]) => {
        const found = attributeValue(tag, attribute)
        return found.kind !== "expression" || dense(found.text) !== expression
    }).map(([attribute]) => attribute)

/**
 * The position attributes PRESENT on `tag`, whatever their value.
 *
 * The inverse question to {@link positionDefectsIn}, and it needs its own helper
 * because the elements it is asked about - the `<ul>`, the input, the no-match
 * note - are the ones that must carry NEITHER. Asking `positionDefectsIn` there
 * would report both attributes as defective on an element that is correct
 * precisely because they are absent.
 */
const positionAttributesOn = (tag: string): string[] =>
    POSITION_ATTRIBUTES.filter(([attribute]) => hasAttribute(tag, attribute)).map(
        ([attribute]) => attribute,
    )

/** Every `<div className="combobox-empty">` opening tag in `source`. */
const comboboxEmptyNotes = (source: string): string[] =>
    openingTags(source, "div").filter((tag) => hasClass(tag, COMBOBOX_EMPTY_CLASS))

/**
 * The map call, {@link dense}, pinned in FULL rather than as `filtered.map`.
 *
 * The parameter list is part of the pin because `i` is the identifier
 * `aria-posinset` is built from: a map rewritten as `filtered.map((name) =>`
 * with the index taken from somewhere else is a different rule about a different
 * number, and it should read as red here rather than quietly satisfy a scan for
 * the bare method name.
 */
const OPTION_MAP_CALL = "filtered.map((name,i)=>"

/**
 * Everything about a listbox slice that would stop `i + 1` being the real
 * 1-based position in the real set.
 *
 * TWO HALVES, because neither sees the other's mutation. The missing map call
 * catches a cap applied UPSTREAM (`visible.map(...)`, where `visible` was sliced
 * out of view); the `.slice(` catches one applied inline
 * (`filtered.slice(0, 50).map(...)`).
 *
 * DELIBERATELY BLUNT about the second half: ANY `.slice(` inside the popup block
 * trips it, including one that merely truncates a champion NAME for display.
 * That is a false red, and it is the cheap direction - the fix is to move the
 * truncation out of the block or to re-point this rule after checking the count
 * attributes still tell the truth, and both start with a human reading the map
 * source. Silence about a real cap would cost an announcement that lies.
 */
const cappedListIn = (markup: string): string[] => {
    const flat = dense(markup)
    return [
        ...(flat.includes(OPTION_MAP_CALL) ? [] : ["no filtered.map((name, i) =>"]),
        ...(flat.includes(".slice(") ? [".slice("] : []),
    ]
}

/* ==========================================================================
 * 21. Every option says how large the set is and where it sits in it.
 * ========================================================================== */

describe("every combobox option is counted", () => {
    it("has the component, the listbox and the options this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION - and the message must say so.
        // Every assertion in sections 21 to 24 is a loop or a filter over these
        // three reads, and each of them degrades to an EMPTY list rather than to
        // an error: a renamed file reads as "", listboxMarkup() returns "" for
        // an absent popup, and a loop over zero options passes every per-option
        // check in silence. Named markers rather than a bare count, per
        // CLAUDE.md "Quelltext-Scanner in Tests: Anti-Vakuositaet benennt
        // Dateien, nicht Zahlen".
        //
        // Red when: CHAMPION_COMBOBOX points at a file that does not exist, the
        // component is renamed, the <ul role="listbox"> moves out of the file,
        // or the options stop being <li>.
        const raw = read(CHAMPION_COMBOBOX)
        expect(
            raw.length,
            `src/${CHAMPION_COMBOBOX} read as empty. This is a SCANNER problem, not a rule ` +
                `violation: fix the path before touching the component.`,
        ).toBeGreaterThan(0)
        expect(
            raw,
            `src/${CHAMPION_COMBOBOX} does not contain "export function ChampionCombobox". This ` +
                `is a SCANNER problem, not a rule violation - the component was renamed or ` +
                `moved, and sections 21 to 24 are reading the wrong file.`,
        ).toContain("export function ChampionCombobox")

        const listbox = listboxMarkup(code(CHAMPION_COMBOBOX))
        expect(
            listbox.length,
            `No <ul ${LISTBOX_ROLE}> block sliced out of src/${CHAMPION_COMBOBOX}. This is a ` +
                `SCANNER problem, not a rule violation: an empty slice yields no options, and ` +
                `"every option carries aria-setsize" is trivially true of no options at all.`,
        ).toBeGreaterThan(0)
        expect(
            openingTags(listbox, "li").length,
            `No <li> inside the listbox slice of src/${CHAMPION_COMBOBOX}. SCANNER problem, not ` +
                `a rule violation, unless the options were deliberately rebuilt as some other ` +
                `element - in which case re-point sections 21 and 24 before trusting them, ` +
                `because their per-option loops are running over an empty list.`,
        ).toBeGreaterThan(0)

        // The two tags the NEGATIVE assertions of this section read. They need
        // their own anchor because `positionAttributesOn(undefined)` would not
        // throw: attributeValue() runs its regex over the string "undefined",
        // finds nothing, and reports every attribute as absent - so "the <ul>
        // carries no aria-setsize" would be perfectly green on a <ul> that was
        // never parsed. That is the exact failure this file's SCANNER anchors
        // exist for, on the exact assertions least able to notice it.
        const source = code(CHAMPION_COMBOBOX)
        expect(
            openingTags(source, "ul").length,
            `No <ul> parsed out of src/${CHAMPION_COMBOBOX}. SCANNER problem, not a rule ` +
                `violation: the "no position attributes on the listbox" check below would then ` +
                `be asserting the absence of two attributes on nothing at all.`,
        ).toBeGreaterThan(0)
        expect(
            comboboxInputs(source).length,
            `No <input role="combobox"> parsed out of src/${CHAMPION_COMBOBOX}. SCANNER problem, ` +
                `not a rule violation - same reason as the <ul> above, and section 24 reads this ` +
                `tag too.`,
        ).toBeGreaterThan(0)
    })

    it("binds aria-setsize on every option to the filtered total", () => {
        // Red when aria-setsize is deleted from the <li> (the options go back to
        // being uncounted, which is the whole defect 0.7.12 fixed), when it is
        // written as a literal such as aria-setsize="170" (it then keeps
        // announcing the UNFILTERED total after the user has typed the list down
        // to three), or when it is bound to champions.length instead of
        // filtered.length - the same lie, spelled as an expression.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        for (const tag of options) {
            const setsize = attributeValue(tag, "aria-setsize")
            expect(
                setsize.kind,
                `An option has no bound aria-setsize. Without it a screen reader in an ` +
                    `aria-activedescendant listbox has nothing to count: focus never enters the ` +
                    `list, so "5 of 170" is not something it can work out for itself. A LITERAL ` +
                    `value is the other half of the trap - it renders, and it announces the same ` +
                    `total no matter how far the query has narrowed the list. Tag as written: ` +
                    `${tag}`,
            ).toBe("expression")
            expect(
                dense(setsize.text),
                `aria-setsize is no longer bound to filtered.length, so it no longer describes ` +
                    `the set that is actually in the DOM. champions.length is the mutation to ` +
                    `look for: it renders, it is an expression, and it announces the full roster ` +
                    `while three filtered options are on screen. Expression as written: ` +
                    `${setsize.text}`,
            ).toBe("filtered.length")
        }
    })

    it("binds aria-posinset on every option to i + 1, never to i", () => {
        // THE MOST IMPORTANT SINGLE GUARD IN THIS FILE'S 0.7.12 half. Red when
        // aria-posinset is deleted or hardcoded, and red for the mutation that
        // will actually happen: aria-posinset={i}. `i` is 0-based and
        // aria-posinset is 1-based, so that mutant announces "0 of 170" for the
        // first option - out of range - and one short of the total for the last,
        // while compiling cleanly and looking identical on screen.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        for (const tag of options) {
            const posinset = attributeValue(tag, "aria-posinset")
            expect(
                posinset.kind,
                `An option has no bound aria-posinset. aria-setsize alone says how big the set ` +
                    `is and nothing about where the highlight sits in it, which is the half that ` +
                    `matters while arrowing. A LITERAL is worse than absent: every option would ` +
                    `announce the same position. Tag as written: ${tag}`,
            ).toBe("expression")
            expect(
                dense(posinset.text),
                `aria-posinset is not i + 1. If it is i, this is the classic off-by-one: ` +
                    `aria-posinset is 1-BASED while the map index is 0-based, so the first ` +
                    `option announces position 0 (out of range for its own aria-setsize) and the ` +
                    `last announces one short of the total. Nothing on screen changes. ` +
                    `Expression as written: ${posinset.text}`,
            ).toBe("i+1")

            // NO SECOND `.not.toBe("i")` HERE, deliberately. It reads well and
            // it could never fire: it is only reached when the comparison above
            // has already passed, so it would be an assertion that cannot go
            // red - the one thing this file refuses to ship (see section 20's
            // note on pinning a coupling that does not exist). The dense
            // comparison above carries the whole rule, and section 25 proves it
            // rejects a bare `i` by running it against that exact mutant.
        }
    })

    it("keeps both position attributes off the listbox and off the input", () => {
        // Red when aria-setsize or aria-posinset is moved up to the <ul> or on
        // to the input. Both describe a MEMBER of a set, so on the container
        // they are ignored outright: the options are uncounted again while the
        // markup of the fix appears to be present, and every "the attribute is
        // written somewhere in this file" check would still pass. Asserted per
        // TAG, not per file, for the reason the module header gives.
        const source = code(CHAMPION_COMBOBOX)

        const [list] = openingTags(source, "ul")
        expect(
            positionAttributesOn(list),
            `The popup <ul> carries a position attribute. aria-setsize and aria-posinset ` +
                `describe an OPTION's place in a set; on the listbox itself they mean nothing ` +
                `and are dropped, so the options end up uncounted with the fix seemingly in ` +
                `place. They belong on the <li role="option">. Tag as written: ${list}`,
        ).toEqual([])

        const [input] = comboboxInputs(source)
        expect(
            positionAttributesOn(input),
            `The combobox input carries a position attribute. The input is not a member of the ` +
                `list it controls; it points INTO the list via aria-activedescendant. Tag as ` +
                `written: ${input}`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 22. The "no match" note is a message about the list, not a member of it.
 *
 * It sits OUTSIDE the `<ul>`, so {@link listboxMarkup} cannot see it and section
 * 21's per-option loop never reads it. That is exactly why it needs its own
 * section: the element most likely to be "made consistent" with the options is
 * the one no option-scoped scan looks at.
 * ========================================================================== */

describe("the combobox no-match note is not a counted option", () => {
    it("has the empty-state note this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION: every assertion below is a
        // filter over this one tag, and a renamed class makes the filter return
        // an empty array - at which point "the note carries no aria-setsize" is
        // a statement about no note at all.
        //
        // Red when: the combobox-empty class is renamed, the note is rebuilt
        // with a computed className (classNames() then reports no tokens by
        // design), or the note is deleted outright.
        const notes = comboboxEmptyNotes(code(CHAMPION_COMBOBOX))
        expect(
            notes.length,
            `Expected exactly one <div className="${COMBOBOX_EMPTY_CLASS}"> in ` +
                `src/${CHAMPION_COMBOBOX}. Zero is a SCANNER problem, not a rule violation: the ` +
                `class was renamed or the className became a computed expression, and this ` +
                `section is then asserting things about nothing. More than one means the ` +
                `assertions below read an arbitrary one of them.`,
        ).toBe(1)
    })

    it("gives the note no role, no set size and no position", () => {
        // Red when somebody "makes the empty state consistent" by giving it
        // role="option", aria-setsize or aria-posinset. That is the tidy-looking
        // change and it is wrong in three ways at once: it announces a
        // selectable option that cannot be selected, it claims membership of a
        // listbox that is NOT RENDERED beside it (the <ul> and this note are
        // mutually exclusive branches), and it makes the count include a row
        // that holds no champion.
        const [note] = comboboxEmptyNotes(code(CHAMPION_COMBOBOX))

        expect(
            positionAttributesOn(note),
            `The no-match note carries a position attribute. It is a MESSAGE ABOUT the list, ` +
                `not a member of it - and there is no listbox rendered next to it to be a member ` +
                `of, because the <ul> renders only while something matched. Tag as written: ` +
                `${note}`,
        ).toEqual([])

        expect(
            attributeValue(note, "role").kind,
            `The no-match note gained a role. It had none on purpose: as a plain <div> it is ` +
                `read as the text it is. role="option" in particular would announce a selectable ` +
                `champion where there are none. Tag as written: ${note}`,
        ).toBe("none")

        // Stated separately from the "no role at all" check above, because
        // role="option" is the specific mutation and it deserves its own
        // message. Red when the note is dressed up as an option even if the
        // broader rule above is ever relaxed.
        expect(
            hasAttributeLiteral(note, "role", "option"),
            `The no-match note is marked up as role="option". Tag as written: ${note}`,
        ).toBe(false)
    })
})

/* ==========================================================================
 * 23. The assumption both numbers stand on: the whole filtered list renders.
 *
 * `aria-setsize={filtered.length}` and `aria-posinset={i + 1}` are only true
 * TOGETHER while the map runs over the entire filtered array. A cap breaks them
 * asymmetrically - which is what makes it worth a rule rather than a comment.
 * ========================================================================== */

describe("the combobox renders the whole filtered list", () => {
    it("maps over filtered itself and caps nothing", () => {
        // Red when the map source is capped, inline (filtered.slice(0, 50).map)
        // or upstream (visible.map, where visible was sliced elsewhere), and red
        // when the index parameter is dropped.
        //
        // WHY THIS IS A RULE AND NOT A COMMENT: with a cap the two attributes
        // start contradicting each other. aria-setsize would go on naming the
        // full total - that is what aria-setsize is FOR, it describes the SET,
        // not the rendered subset - while `i + 1` would index the SHORTENED
        // array, so the last rendered option announces "50 of 170" and nothing
        // anywhere says the other 120 are unreachable. A capped list needs
        // either a real virtualisation contract (positions computed from the
        // window offset) or no capping at all; what it must not have is the
        // present markup with a slice added to it.
        const listbox = listboxMarkup(code(CHAMPION_COMBOBOX))
        expect(
            cappedListIn(listbox),
            `The popup no longer renders the whole filtered list, and the two counting ` +
                `attributes on the options are now saying different things: aria-setsize names ` +
                `the full filtered total while aria-posinset counts positions inside a shortened ` +
                `array. Whoever added the cap has to revisit aria-posinset specifically - the ` +
                `index into a capped array is not the position in the set. Listbox block as ` +
                `written: ${listbox}`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 24. The 0.7.11 reference chain, re-read on the very tags 0.7.12 extended.
 *
 * Sections 15 and 16 own these rules and keep them. This section states them
 * again over the SAME tag list the new assertions loop over, so that a change
 * which trades one attribute for another on the `<li>` - dropping the id while
 * adding the position, say - is red in the section that is about that element
 * rather than only in a section somebody might read as legacy.
 * ========================================================================== */

describe("the combobox options kept their 0.7.11 semantics", () => {
    it("keeps role, id and aria-selected on every option", () => {
        // Red when role="option" is dropped (the position attributes then sit on
        // a generic list item and mean nothing), when the id stops being built
        // by comboboxOptionId(inputId, i) (aria-activedescendant dangles while
        // the list still renders perfectly), or when aria-selected is hardcoded.
        // THE FULL CALL is pinned, not the identifier: comboboxOptionId sits on
        // the import line, so toContain("comboboxOptionId") survives deleting
        // every use of it - the vacuity trap CLAUDE.md records four times over.
        const options = openingTags(listboxMarkup(code(CHAMPION_COMBOBOX)), "li")
        for (const tag of options) {
            expect(
                hasAttributeLiteral(tag, "role", "option"),
                `An option lost role="option". aria-setsize and aria-posinset describe a ` +
                    `position within a set of OPTIONS; on a generic list item they describe ` +
                    `nothing. Tag as written: ${tag}`,
            ).toBe(true)

            expect(
                dense(attributeValue(tag, "id").text),
                `The option id is no longer built by comboboxOptionId(inputId, i), so ` +
                    `aria-activedescendant on the input points at ids no option carries. Tag as ` +
                    `written: ${tag}`,
            ).toBe("comboboxOptionId(inputId,i)")

            const selected = attributeValue(tag, "aria-selected")
            expect(
                selected.kind,
                `An option's aria-selected is missing or hardcoded. A literal "true" announces ` +
                    `every option as selected at once, with no visual symptom. Tag as written: ` +
                    `${tag}`,
            ).toBe("expression")
            expect(
                selected.text,
                `aria-selected no longer depends on activeIndex, so it cannot follow the ` +
                    `highlight. Expression as written: ${selected.text}`,
            ).toContain("activeIndex")
        }
    })

    it("keeps the input pointing at the highlighted option", () => {
        // Red when aria-activedescendant is deleted or rebound, and red when
        // aria-controls loses its gate. The ungated {listboxId} is the subtle
        // one: still an expression, still green under any "is it hardcoded?"
        // check, and it names a <ul> that does not exist whenever the popup is
        // closed or the filter matched nothing.
        const [input] = comboboxInputs(code(CHAMPION_COMBOBOX))

        expect(
            input,
            `The input no longer carries aria-activedescendant={activeDescendantId} verbatim. ` +
                `Counting the options is worth nothing if nothing says which one is current.`,
        ).toContain("aria-activedescendant={activeDescendantId}")

        expect(
            dense(attributeValue(input, "aria-controls").text),
            `aria-controls is no longer gated on listboxRendered, so it names an element that is ` +
                `absent whenever the popup is closed or the query matched nothing. Tag as ` +
                `written: ${input}`,
        ).toBe("listboxRendered?listboxId:undefined")
    })

    it("keeps the listbox free of buttons and tab stops", () => {
        // Red when an option gains tabIndex={0} or role="button", or is rebuilt
        // as a <button>. Scoped to the <ul> on purpose: the same file holds a
        // legitimate <button className="combobox-clear" tabIndex={-1}>, and
        // section 19 proves the scoping works in both directions.
        expect(
            listboxTabStopsIn(listboxMarkup(code(CHAMPION_COMBOBOX))),
            `The listbox contains a tab stop. Options in an ARIA combobox are deliberately NOT ` +
                `focusable: focus stays on the input, which is the entire reason ` +
                `aria-activedescendant and the position attributes exist here. One tab stop per ` +
                `champion is ~170 of them. This scan covers the <ul> block only, so the clear ` +
                `button next to the input is not what tripped it.`,
        ).toEqual([])
    })
})

/* ==========================================================================
 * 25. Anti-vacuity for sections 21-24: the new predicates, proven able to go
 * red.
 *
 * Same device as sections 5, 9, 13 and 19, for the same reason: a scan whose
 * pattern has quietly stopped matching passes in silence, and only a known-bad
 * input tells "clean" from "blind". Every fixture below runs through the EXACT
 * helper the real assertions use, and each carries its INVERSE - the shape that
 * is really in the source and must NOT trip the rule - because a predicate that
 * fires on everything is as useless as one that fires on nothing.
 * ========================================================================== */

describe("the 0.7.12 guards can go red", () => {
    it("tells a bound aria-setsize from a hardcoded one and from a wrong one", () => {
        // The shape that is really there must stay clean, or section 21 would be
        // red on correct code and the tempting "fix" would be to loosen it.
        const real = openingTags(
            '<li role="option" aria-setsize={filtered.length} aria-posinset={i + 1}>',
            "li",
        )[0]
        expect(positionDefectsIn(real)).toEqual([])

        // THE LITERAL: it renders, and it announces the same total however far
        // the query has narrowed the list.
        const literal = openingTags(
            '<li role="option" aria-setsize="170" aria-posinset={i + 1}>',
            "li",
        )[0]
        expect(attributeValue(literal, "aria-setsize").kind).toBe("literal")
        expect(positionDefectsIn(literal)).toEqual(["aria-setsize"])

        // THE WRONG COUNT: the mutant no "is it hardcoded?" check can see.
        // champions.length is the unfiltered roster, announced while three
        // filtered options are on screen.
        const unfiltered = openingTags(
            '<li role="option" aria-setsize={champions.length} aria-posinset={i + 1}>',
            "li",
        )[0]
        expect(attributeValue(unfiltered, "aria-setsize").kind).toBe("expression")
        expect(positionDefectsIn(unfiltered)).toEqual(["aria-setsize"])
    })

    it("catches the off-by-one aria-posinset", () => {
        // THE MUTANT SECTION 21 EXISTS FOR. `{i}` compiles, renders identically,
        // and announces position 0 for the first option.
        const offByOne = openingTags(
            '<li role="option" aria-setsize={filtered.length} aria-posinset={i}>',
            "li",
        )[0]
        expect(attributeValue(offByOne, "aria-posinset").kind).toBe("expression")
        expect(dense(attributeValue(offByOne, "aria-posinset").text)).toBe("i")
        expect(positionDefectsIn(offByOne)).toEqual(["aria-posinset"])

        // The correct one must not trip.
        const correct = openingTags(
            '<li role="option" aria-setsize={filtered.length} aria-posinset={i + 1}>',
            "li",
        )[0]
        expect(dense(attributeValue(correct, "aria-posinset").text)).toBe("i+1")
        expect(positionDefectsIn(correct)).toEqual([])

        // A hardcoded position is the other half: every option would announce
        // the same place in the set.
        const pinned = openingTags(
            '<li role="option" aria-setsize={filtered.length} aria-posinset="1">',
            "li",
        )[0]
        expect(positionDefectsIn(pinned)).toEqual(["aria-posinset"])
    })

    it("catches an option that lost both attributes, and refuses a look-alike", () => {
        // The 0.7.11 option, unmodified: correct by that version's rules and
        // uncounted, which is precisely what 0.7.12 changed. Both attributes
        // report as defects, and they report BY NAME.
        const uncounted = openingTags(
            '<li id={comboboxOptionId(inputId, i)} role="option" aria-selected={i === activeIndex}>',
            "li",
        )[0]
        expect(positionDefectsIn(uncounted)).toEqual(["aria-setsize", "aria-posinset"])
        expect(positionAttributesOn(uncounted)).toEqual([])

        // THE LOOK-ALIKE. `data-aria-setsize` renders as inert markup and
        // announces nothing; the (?<![\w-]) boundary in attributeValue() is what
        // refuses to read it as the real attribute. Without that boundary this
        // tag would pass section 21 while being exactly as uncounted as the one
        // above - so it must read as ABSENT on one predicate and as DEFECTIVE on
        // the other.
        const dataOnly = openingTags(
            '<li role="option" data-aria-setsize={filtered.length} data-aria-posinset={i + 1}>',
            "li",
        )[0]
        expect(positionAttributesOn(dataOnly)).toEqual([])
        expect(positionDefectsIn(dataOnly)).toEqual(["aria-setsize", "aria-posinset"])
    })

    it("catches the position attributes moved up to the listbox", () => {
        // THE TIDY-LOOKING MUTANT: one aria-setsize on the container instead of
        // one per option. Both are ignored there, so the options are uncounted
        // again - and a file-wide toContain("aria-setsize") would be perfectly
        // green on it. Only the per-tag split sees it.
        const shifted =
            '<ul id={listboxId} role="listbox" aria-setsize={filtered.length}' +
            ' aria-posinset={i + 1}><li role="option" aria-selected={i === activeIndex}>{name}</li></ul>'

        const [shiftedList] = openingTags(shifted, "ul")
        expect(positionAttributesOn(shiftedList)).toEqual(["aria-setsize", "aria-posinset"])

        const [shiftedOption] = openingTags(listboxMarkup(shifted), "li")
        expect(positionDefectsIn(shiftedOption)).toEqual(["aria-setsize", "aria-posinset"])

        // ...and the real shape must read clean on BOTH halves, or section 21
        // would be red on correct code.
        const correct =
            '<ul id={listboxId} role="listbox"><li role="option" aria-setsize={filtered.length}' +
            " aria-posinset={i + 1}>{name}</li></ul>"
        expect(positionAttributesOn(openingTags(correct, "ul")[0])).toEqual([])
        expect(positionDefectsIn(openingTags(listboxMarkup(correct), "li")[0])).toEqual([])
    })

    it("catches a no-match note dressed up as an option", () => {
        // THE MUTANT SECTION 22 EXISTS FOR: the empty state "made consistent"
        // with the options. It sits outside the <ul>, so no option-scoped scan
        // would ever look at it.
        const dressed =
            '<div className="combobox-empty" role="option" aria-setsize={filtered.length}' +
            ' aria-posinset={1}>{t("common_noMatch")}</div>'
        const [dressedNote] = comboboxEmptyNotes(dressed)
        expect(positionAttributesOn(dressedNote)).toEqual(["aria-setsize", "aria-posinset"])
        expect(hasAttributeLiteral(dressedNote, "role", "option")).toBe(true)

        // The real note must stay clean on all three checks.
        const [plainNote] = comboboxEmptyNotes(
            '<div className="combobox-empty">{t("common_noMatch")}</div>',
        )
        expect(positionAttributesOn(plainNote)).toEqual([])
        expect(attributeValue(plainNote, "role").kind).toBe("none")

        // ...and the selector has to be selective, or "exactly one note" would
        // be counting something else. Tokens, not substrings: neither the
        // wrapper div nor a hypothetical -wrap class may answer for the note.
        expect(comboboxEmptyNotes('<div className="combobox">x</div>')).toEqual([])
        expect(comboboxEmptyNotes('<div className="combobox-empty-wrap">x</div>')).toEqual([])
        expect(comboboxEmptyNotes('<div className="combobox-empty">x</div>').length).toBe(1)
    })

    it("catches a capped map source, inline and upstream", () => {
        // The shape that is really there: uncapped, index in the parameter list.
        const whole =
            '<ul role="listbox">{filtered.map((name, i) => (<li role="option"' +
            " aria-setsize={filtered.length} aria-posinset={i + 1}>{name}</li>))}</ul>"
        expect(cappedListIn(listboxMarkup(whole))).toEqual([])

        // THE INLINE CAP, the mutation section 23 is really about. Both halves
        // fire: the full-call pin no longer matches, and the slice is right
        // there in the block.
        const inline =
            '<ul role="listbox">{filtered.slice(0, 50).map((name, i) => (<li role="option"' +
            " aria-setsize={filtered.length} aria-posinset={i + 1}>{name}</li>))}</ul>"
        expect(cappedListIn(listboxMarkup(inline))).toEqual([
            "no filtered.map((name, i) =>",
            ".slice(",
        ])

        // THE UPSTREAM CAP, which the .slice( half cannot see because the slice
        // happened outside the block. Only the full-call pin catches it - the
        // same reason sections 16 and 17 pin calls rather than identifiers.
        const upstream =
            '<ul role="listbox">{visible.map((name, i) => (<li role="option"' +
            " aria-setsize={filtered.length} aria-posinset={i + 1}>{name}</li>))}</ul>"
        expect(cappedListIn(listboxMarkup(upstream))).toEqual(["no filtered.map((name, i) =>"])

        // ...and the half that is deliberately BLUNT, pinned so the next reader
        // knows it is a documented false red rather than a bug: a .slice( that
        // only truncates a champion NAME trips the rule too. The fix is to move
        // the truncation out of the popup block, not to delete the rule.
        const nameTruncation =
            '<ul role="listbox">{filtered.map((name, i) => (<li role="option"' +
            " aria-posinset={i + 1}>{name.slice(0, 12)}</li>))}</ul>"
        expect(cappedListIn(listboxMarkup(nameTruncation))).toEqual([".slice("])
    })
})
