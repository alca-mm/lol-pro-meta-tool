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
