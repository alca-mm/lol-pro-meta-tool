/**
 * Standing sweep: every clickable element under `src/` is either interactive by
 * nature, or allowlisted with a reason AND a keyboard model.
 *
 * WHAT THE 0.7.10 SWEEP FOUND
 *
 * All 122 `.ts`/`.tsx` files under `src/` (103 `onClick` sites) were walked for
 * pointer handlers sitting on tags the browser neither focuses nor wires to
 * Enter or Space. Four turned up. Three are deliberate and are listed in
 * {@link ALLOWLIST} with their reason and the key path that replaces the mouse.
 * The fourth was a real defect:
 *
 *   src/components/player-results/ChampionResultsTable.tsx sorted its columns
 *   through `<th onClick>` plus a `cursor: pointer` to advertise it. A table
 *   header takes no focus and answers to no key, so the whole table was
 *   unsortable without a mouse - the same defect the sibling ChampionStatsTable
 *   carried until 0.7.9, in the same shape. It now holds a real
 *   `<button type="button" className="results-sort-btn">`, and `aria-sort` sits
 *   on the `<th>`, which is the only kind of element ARIA defines it for.
 *
 * WHY A SWEEP RATHER THAN FOUR MORE NAMED ASSERTIONS
 *
 * tests/a11ySemantics.test.ts already pins, one element at a time and by name,
 * what 0.6.3, 0.7.8 and 0.7.9 changed. That protects what was fixed and says
 * nothing at all about what lands next week. `<div onClick>` is the cheapest
 * accessibility defect to write in this codebase: it renders identically, it
 * behaves identically under a mouse, and nothing on screen indicates it is
 * wrong. So this file is a rule rather than a list of repairs - a new clickable
 * `<div>`, `<span>`, `<tr>` or `<li>` fails the day it is written, and the
 * failure message offers exactly two ways out: make it a real `<button>`, or
 * write down why it may stay and how a keyboard reaches it.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`): no
 * jsdom, no document, no rendering. Every assertion below is a scan of source
 * TEXT, in the same spirit as tests/a11ySemantics.test.ts and
 * tests/scoutUxDeclutter.test.ts. A source scan proves that markup is WRITTEN.
 * It does NOT prove that:
 *
 *  - the element is reached at runtime (a `false && (...)`, an early
 *    `return null` or an unmet branch passes everything here),
 *  - the allowlisted keyboard path actually works. That an `<input
 *    role="combobox">` has a `handleKeyDown` is visible here; that the handler
 *    is correct, that focus goes where it should, and that a screen reader says
 *    something useful are manual tests in a real browser,
 *  - the focus ring is VISIBLE against what sits behind it. Section 7 checks
 *    that an `outline` is declared and is not one of the values that spell "no
 *    ring"; whether it can be seen is a manual test,
 *  - a `<button>` that exists is reachable in a sensible tab order.
 *
 * That honesty requirement is CLAUDE.md P4c, and the same caveat sits at the
 * top of every sibling guard file.
 */

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/* ==========================================================================
 * 0. Reading src/
 * ========================================================================== */

const SRC = fileURLToPath(new URL("../src/", import.meta.url))
const STYLESHEET = "index.css"

const readSrc = (rel: string): string => readFileSync(SRC + rel.split("/").join(sep), "utf8")

/**
 * Remove block and line comments, PRESERVING every newline.
 *
 * Two jobs, and the second one is why this differs from the strippers in
 * tests/a11ySemantics.test.ts and tests/scoutUxDeclutter.test.ts. The first is
 * the usual one: these components document their choices by writing out the
 * rejected markup, and ChampionResultsTable.tsx's header comment contains the
 * literal words `<th>`, `onClick` and `role="button"`. On raw source this sweep
 * would report the very prose that exists to stop the defect coming back, and
 * the obvious "fix" would be deleting it. CLAUDE.md says this outright: a source
 * scan without `stripComments` once let a whole feature be deleted while 2410
 * tests stayed green.
 *
 * The second job is the failure MESSAGE. A violation is reported with a line
 * number, and a stripper that collapses a 40-line block comment into one space
 * sends the reader to the wrong line - in a file whose comments are longer than
 * its markup, off by dozens. Block comments are therefore blanked character for
 * character with their newlines kept, and a line comment is cut without eating
 * its newline, so stripped line numbers equal raw line numbers exactly.
 *
 * The `(?<!:)` lookbehind before `//` is copied verbatim from
 * tests/appLocaleGuards.test.ts and is not decoration: without it a `https://`
 * inside a string literal reads as the start of a comment and the rest of that
 * line is deleted before the scanner sees it. Section 3 proves that with a
 * fixture rather than asserting it in prose.
 */
const stripComments = (source: string): string =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
        .replace(/(?<!:)\/\/[^\n]*/g, "")

/** Every `.ts`/`.tsx` under `src/`, relative to it, with `/` separators. */
const srcFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.tsx?$/.test(entry))

/**
 * The files this sweep's conclusions depend on, named rather than counted.
 *
 * Three of them hold the allowlisted elements, so if the walk loses them the
 * red guard in section 6 reports "this allowlist entry is obsolete" - which
 * reads as a real finding and sends the next reader off to delete a correct
 * entry. The fourth holds the defect 0.7.10 fixed. A count alone cannot tell
 * "the tree is clean" from "the walk returned the wrong twenty files".
 */
const REQUIRED_SRC_FILES: readonly string[] = [
    "components/ChampionStatsTable.tsx",
    "components/player-results/ChampionResultsTable.tsx",
    "components/common/ChampionCombobox.tsx",
    "components/scout/ScoutReparseDialog.tsx",
]

/* ==========================================================================
 * 1. The scanner
 *
 * Every rule below is a pure function, declared once and used BOTH by the real
 * sweep and by the synthetic fixtures in section 3. That is the whole
 * anti-vacuity mechanism: a scan whose regex has quietly stopped matching
 * reports the same clean tree as a correct one, and only a known-bad input
 * tells "clean" from "blind".
 * ========================================================================== */

interface JsxTag {
    /** The lowercase tag name, e.g. `div`, `tr`, `a`. */
    readonly name: string
    /** The complete opening tag, whitespace collapsed to single spaces. */
    readonly text: string
    /** 1-based line of the `<`, in the ORIGINAL file. */
    readonly line: number
}

const lineOf = (source: string, index: number): number =>
    source.slice(0, index).split("\n").length

/**
 * Every opening tag with a LOWERCASE name, as one string each.
 *
 * Lowercase only, because `<Foo …>` is a React component and not a DOM element:
 * a clickable `<ChampionIcon onClick>` says nothing about focusability until you
 * look inside the component, and guessing would produce noise this sweep cannot
 * act on. That is a real limit and it is stated rather than hidden - a component
 * that renders `<div {...props}>` around its props hides a violation from this
 * file.
 *
 * WHY THE TAG IS WALKED CHARACTER BY CHARACTER instead of `/<div\b[^>]*>/`: a
 * `[^>]*` truncates at the first `>` in the attribute run, and this project
 * writes both inline arrow handlers (`onClick={() => f(a > b)}`) and inline
 * `style={{…}}` objects on exactly these elements. A truncated tag loses the
 * attributes that come after the arrow, so `onClick` would be seen and `href`
 * would not. The walk therefore tracks brace depth and quote state, and stops
 * only at a `>` that is at depth 0 and outside any string literal.
 *
 * DELIBERATELY NAIVE about backslash escapes inside a string literal
 * (`title="a\"b"`), like its sibling in tests/a11ySemantics.test.ts. Nothing in
 * `src/` writes that, and the failure direction is safe: a mis-read quote makes
 * the tag run LONG, which surfaces as a loud mismatch rather than a silent pass.
 *
 * A generic (`useState<string>`) also matches `<string`. Harmless by
 * construction: such a pseudo-tag carries no pointer handler, and because every
 * regex match is walked independently it cannot swallow a real tag that follows.
 */
function openingTags(source: string): JsxTag[] {
    const found: JsxTag[] = []
    for (const match of source.matchAll(/<([a-z][a-zA-Z0-9-]*)\b/g)) {
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
        found.push({
            name: match[1],
            text: source
                .slice(from, Math.min(index + 1, source.length))
                .replace(/\s+/g, " ")
                .trim(),
            line: lineOf(source, from),
        })
    }
    return found
}

/**
 * The value of `attribute` on one opening tag, classified.
 *
 * `kind` is the point: `"literal"` means a quoted string was written where React
 * expects a value - `aria-sort="none"`, the mutant that reports every column as
 * unsorted forever - and `"expression"` means `{…}`, brace balanced so a nested
 * ternary or object does not truncate the text. `"none"` means absent, which is
 * the other way to satisfy a naive "no hardcoded value" check: delete it.
 *
 * The `(?<![\w-])` boundary is load bearing in both directions used here: a
 * plain `\bhref\s*=` reads `data-href="x"` as a real `href` and would let an
 * `<a>` without a destination pass as a link, and a plain `\boutline\b` reads
 * `outline-offset` as `outline` in section 7.
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
        return {
            kind: "expression",
            text: tag.slice(start + 1, depth === 0 ? index - 1 : index).trim(),
        }
    }

    // `aria-sort=none` without quotes or braces is not valid JSX and cannot
    // compile, so this branch is unreachable in real source. Reported rather
    // than swallowed: a helper that quietly calls an unknown shape "none" would
    // let a future JSX dialect walk straight past.
    return { kind: "literal", text: tag.slice(start).split(/\s/)[0] ?? "" }
}

const hasAttribute = (tag: string, attribute: string): boolean =>
    attributeValue(tag, attribute).kind !== "none"

/**
 * True when `tag` carries `className` as a literal containing `className` as a
 * whole token.
 *
 * Tokens, not a substring: `"results-sort-btn-wide".includes("results-sort-btn")`
 * is true and would let a different element answer for the one being guarded.
 * A runtime-assembled `className={…}` yields false, which is the point rather
 * than an oversight - the element goes INVISIBLE to the filter, so the "exactly
 * one such button" assertions go red with a loud count instead of quietly
 * passing on nothing.
 */
const hasClass = (tag: string, className: string): boolean => {
    const found = attributeValue(tag, "className")
    return found.kind === "literal" && found.text.split(/\s+/).includes(className)
}

/**
 * The handlers that make an element a MOUSE target.
 *
 * Only pointer handlers, deliberately. `onChange`, `onFocus` and `onKeyDown` on
 * a non-interactive element are a different question with different answers -
 * `onKeyDown` on a `<div>` is usually part of the FIX, not the defect - and
 * sweeping them in here would bury the signal this file exists for.
 * `onMouseEnter` is likewise absent: hover is not activation.
 */
const POINTER_HANDLERS = ["onClick", "onMouseDown", "onMouseUp", "onDoubleClick"] as const

const pointerHandlersOn = (tag: string): string[] =>
    POINTER_HANDLERS.filter((handler) =>
        new RegExp(`(?<![\\w-])${handler}\\s*=`).test(tag),
    ) as string[]

/**
 * Tags the browser focuses and activates by itself.
 *
 * `a` is NOT in this set and is handled separately: an `<a>` without `href` maps
 * to role `generic`, takes no focus and answers to no key - it is a `<div>` that
 * looks like a link, and it is one of the two shapes this sweep most wants to
 * catch. `details` and `summary` are in because a disclosure is keyboard
 * operable natively; `label` is in because a click on it activates the control
 * it labels, which is itself focusable.
 */
const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "details",
    "option",
    "label",
    "iframe",
    "audio",
    "video",
])

const isInteractiveTag = (tag: JsxTag): boolean =>
    INTERACTIVE_TAGS.has(tag.name) || (tag.name === "a" && hasAttribute(tag.text, "href"))

/**
 * Clickable, but not something a keyboard can reach on its own.
 *
 * Deliberately blind to `tabIndex` and `role="button"`. That pair is the FAKE
 * FIX tests/a11ySemantics.test.ts names by name: it satisfies any check that
 * only asks "is there a role?" while getting Space, the disabled semantics or
 * the announcement subtly wrong, and on a `<tr>` it additionally REPLACES the
 * row's table semantics. Treating it as a pass would turn this sweep into an
 * invitation to write it.
 */
const isClickableNonInteractive = (tag: JsxTag): boolean =>
    pointerHandlersOn(tag.text).length > 0 && !isInteractiveTag(tag)

/** The whole pipeline, comment stripping included, over one RAW source text. */
const clickableNonInteractiveTags = (rawSource: string): JsxTag[] =>
    openingTags(stripComments(rawSource)).filter(isClickableNonInteractive)

interface Violation extends JsxTag {
    readonly file: string
}

/**
 * The sweep, memoised because five tests below run it and it reads 122 files.
 *
 * Memoising is safe here only because nothing in this suite writes to `src/`.
 */
let sweepCache: Violation[] | null = null

const sweep = (): Violation[] => {
    if (sweepCache !== null) return sweepCache
    sweepCache = srcFiles().flatMap((file) =>
        clickableNonInteractiveTags(readSrc(file)).map((tag) => ({ ...tag, file })),
    )
    return sweepCache
}

const describeViolation = (violation: Violation): string =>
    `src/${violation.file}:${violation.line}  <${violation.name}>  ${violation.text}`

/* ==========================================================================
 * 2. The allowlist
 *
 * An entry is a CLAIM with two halves, and both are mandatory. `why` says the
 * pointer handler is intentional; `keyboard` says how the same function is
 * reached without a mouse. An entry that carries only the first half is the
 * defect with a note attached, which is why section 6 makes a thin `keyboard`
 * fail rather than pass.
 *
 * `marker` is the discriminator. Without it an entry would exempt the whole FILE
 * for that tag name, so a second, genuinely broken `<div onClick>` in
 * ScoutReparseDialog.tsx would be absorbed by the entry that covers the
 * backdrop. It is pinned as a full attribute or a full call, never as a bare
 * identifier: this repo has been caught four times by a `toContain("name")` that
 * an IMPORT line already satisfied.
 * ========================================================================== */

interface AllowedClickTarget {
    /** Path under `src/`, `/` separators. */
    readonly file: string
    /** Lowercase tag name the handler sits on. */
    readonly element: string
    /** A distinctive substring of that opening tag. */
    readonly marker: string
    /** Why the pointer handler may stay on a non-interactive element. */
    readonly why: string
    /** How the same function is reached without a mouse. */
    readonly keyboard: string
}

const ALLOWLIST: readonly AllowedClickTarget[] = [
    {
        file: "components/ChampionStatsTable.tsx",
        element: "tr",
        marker: "nextChampionSelection(selectedChampion, s.championName)",
        why:
            "Mouse convenience on a wide, forgiving target. The row click is NOT the only way " +
            "in, and removing it would be a regression for everyone who already uses it: 0.7.8 " +
            "deliberately kept it and added the keyboard path beside it rather than replacing " +
            "one with the other. Both paths call the same nextChampionSelection() rule, so they " +
            "cannot drift apart.",
        keyboard:
            'The champion cell in the same row holds a real <button type="button"> with ' +
            "aria-expanded bound to the selection, calling event.stopPropagation() so the click " +
            "does not bubble on into this row handler and toggle the selection twice. " +
            "tests/a11ySemantics.test.ts pins that button, its aria-expanded and the " +
            "stopPropagation call by name.",
    },
    {
        file: "components/common/ChampionCombobox.tsx",
        element: "li",
        marker: 'role="option"',
        why:
            "The ARIA combobox pattern. The options are intentionally not tab stops: in a " +
            "listbox exactly one element owns the focus, and that is the input. A <button> per " +
            "option would destroy the listbox semantics, put every champion in the tab order, " +
            "and make aria-activedescendant meaningless. onMouseDown rather than onClick is " +
            "also deliberate, because it commits before the input loses focus and closes the " +
            "list.",
        keyboard:
            'The whole keyboard model sits on the <input role="combobox">: handleKeyDown ' +
            "handles ArrowDown and ArrowUp to move activeIndex, Enter to commit the active " +
            "option, and Escape to close. Every option is reachable and selectable without ever " +
            "touching the pointer.",
    },
    {
        file: "components/scout/ScoutReparseDialog.tsx",
        element: "div",
        marker: 'className="scout-dialog-backdrop"',
        why:
            "The modal backdrop. Click-outside-to-cancel is a redundant SECOND route to an " +
            "action that already has a labelled button inside the dialog, and the handler is " +
            "guarded by event.target === event.currentTarget so a click inside the panel does " +
            "not dismiss it. A backdrop that were a <button> would announce itself as a control " +
            "and land in the tab order in front of the dialog it is behind.",
        keyboard:
            'The dialog is role="alertdialog" with aria-modal, a document-level keydown ' +
            "listener that calls onCancel() on Escape, and an initial focus placed on the safe " +
            "option via keepButtonRef. Cancel is additionally a normal <button> inside the " +
            "panel, so the backdrop adds no function that the keyboard lacks.",
    },
]

const coveringEntry = (violation: Violation): AllowedClickTarget | undefined =>
    ALLOWLIST.find(
        (entry) =>
            entry.file === violation.file &&
            entry.element === violation.name &&
            violation.text.includes(entry.marker),
    )

/* ==========================================================================
 * 3. The scanner, proven against known inputs
 *
 * This section comes first because everything after it is a filter over
 * clickableNonInteractiveTags(). A scanner that matches nothing reports the
 * same clean tree as a correct one, and the red guard in section 6 would then
 * declare all three allowlist entries obsolete - a failure that reads like a
 * finding and invites deleting three correct entries.
 * ========================================================================== */

/** `[source, expected number of hits]`, each naming the shape it pins down. */
const FIXTURES: ReadonlyArray<readonly [what: string, source: string, hits: number]> = [
    ["a clickable div", "const a = <div onClick={x}>t</div>", 1],
    ["a clickable span", "const a = <span onClick={x}>t</span>", 1],
    ["a clickable table row", "const a = <tr onClick={x}><td>t</td></tr>", 1],
    ["a clickable list item", "const a = <li onClick={x}>t</li>", 1],
    ["a real button", "const a = <button onClick={x}>t</button>", 0],
    ["a link with a destination", 'const a = <a href="/x" onClick={x}>t</a>', 0],
    ["an anchor without href", "const a = <a onClick={x}>t</a>", 1],
    ["an input with a change handler", "const a = <input onChange={x} />", 0],
    ["a div with a change handler but no pointer handler", "const a = <div onChange={x} />", 0],
    ["a React component", "const a = <Foo onClick={x}>t</Foo>", 0],
    ["a block comment", "/* <div onClick={x}>t</div> */\nconst a = 1", 0],
    ["a line comment", "// <div onClick={x}>t</div>\nconst a = 1", 0],
    ["a JSX comment", "const a = <p>{/* <div onClick={x}/> */}</p>", 0],
    ["an arrow inside the attributes", "const a = <div onClick={() => f(a > b)}>t</div>", 1],
    ["a greater-than inside a string", 'const a = <div title="a > b" onClick={x}>t</div>', 1],
]

describe("the clickable-element scanner", () => {
    it("classifies every known shape correctly", () => {
        // Mutation that turns this red: drop `a` from the href special case, or
        // add `div` to INTERACTIVE_TAGS - either flips one of these counts.
        for (const [what, source, hits] of FIXTURES) {
            expect(
                clickableNonInteractiveTags(source).length,
                `${what}: expected ${hits} hit(s) in ${JSON.stringify(source)}`,
            ).toBe(hits)
        }
    })

    it("reads a tag whose attributes contain an arrow, without truncating it", () => {
        // Mutation that turns this red: replace the character walk in
        // openingTags() with /<([a-z][a-zA-Z0-9-]*)\b[^>]*>/, which stops at the
        // `>` of the arrow and reports `<div onClick={() =>`.
        const [tag] = clickableNonInteractiveTags("const a = <div onClick={() => f(a > b)}>t</div>")
        expect(tag.text).toBe("<div onClick={() => f(a > b)}>")
    })

    it("reads a tag whose attributes contain a greater-than inside a string", () => {
        // Mutation that turns this red: drop the quote tracking from
        // openingTags(), which then ends the tag at the `>` inside the title and
        // never sees the onClick that follows it.
        const [tag] = clickableNonInteractiveTags('const a = <div title="a > b" onClick={x}>t</div>')
        expect(tag.text).toBe('<div title="a > b" onClick={x}>')
    })

    it("does not let a URL in a line comment eat the code beneath it", () => {
        // Mutation that turns this red: remove the (?<!:) lookbehind, and the
        // stripper starts at the `//` of `https://`, deleting the rest of that
        // line and - with a naive `[\s\S]*` - everything after it.
        const source = "// see https://example.test/a\nconst a = <div onClick={x}>t</div>"
        expect(clickableNonInteractiveTags(source)).toHaveLength(1)
        expect(stripComments('const u = "https://example.test/x"')).toContain("example.test")
    })

    it("keeps line numbers aligned with the original file", () => {
        // Mutation that turns this red: strip block comments to a single space
        // (the sibling files' spelling), which collapses the four comment lines
        // and reports the div on line 2.
        const source = ["/*", " * prose", " */", "const a = <div onClick={x}>t</div>"].join("\n")
        expect(clickableNonInteractiveTags(source)[0].line).toBe(4)
    })

    it("reports the pointer handler it matched, and only pointer handlers", () => {
        // Mutation that turns this red: widen the boundary to /onClick\s*=/,
        // which then reads onClickCapture and data-onClick as the real thing.
        expect(pointerHandlersOn("<div onDoubleClick={x}>")).toEqual(["onDoubleClick"])
        expect(pointerHandlersOn("<div onMouseUp={x} onMouseDown={y}>").sort()).toEqual([
            "onMouseDown",
            "onMouseUp",
        ])
        expect(pointerHandlersOn("<div onMouseEnter={x} onKeyDown={y}>")).toEqual([])
        expect(pointerHandlersOn("<div data-onClick={x}>")).toEqual([])
    })

    it("does not read data-href as a destination", () => {
        // Mutation that turns this red: drop the (?<![\w-]) boundary from
        // attributeValue(), and a decorative <a data-href> passes as a link.
        expect(hasAttribute('<a data-href="/x" onClick={x}>', "href")).toBe(false)
        expect(hasAttribute('<a href="/x" onClick={x}>', "href")).toBe(true)
    })
})

/* ==========================================================================
 * 4. The sweep really walked the tree
 * ========================================================================== */

describe("the src/ sweep is complete", () => {
    it("walked the files every conclusion in this file depends on", () => {
        // Mutation that turns this red: point SRC at a subdirectory, or filter
        // the walk down to `.tsx` - either drops named files and every
        // "nothing found" below would become an artefact of the walk.
        const scanned = srcFiles()
        const missing = REQUIRED_SRC_FILES.filter((file) => !scanned.includes(file))

        expect(
            missing,
            `The src/ walk did not return ${missing.join(", ")}. This is a SCANNER PROBLEM, ` +
                "not a rule violation: the sweep below reports on files it never read, and the " +
                "allowlist red guard is about to call correct entries obsolete. Fix the walk " +
                "before believing anything else in this file.",
        ).toEqual([])

        // Kept as a second, weaker signal: it catches a walk that lost files
        // this list does not name. 122 at the time of writing.
        expect(
            scanned.length,
            `The src/ walk returned ${scanned.length} files, far fewer than this tree has ` +
                "(122 when this guard was written). SCANNER PROBLEM, not a rule violation.",
        ).toBeGreaterThan(100)
    })

    it("finds JSX in each of those files", () => {
        // Mutation that turns this red: break the `<([a-z]…)` pattern in
        // openingTags(), which then returns [] everywhere and makes the sweep
        // report a spotless tree.
        for (const file of REQUIRED_SRC_FILES) {
            expect(
                openingTags(stripComments(readSrc(file))).length,
                `src/${file}: the scanner found no lowercase opening tag at all. SCANNER ` +
                    "PROBLEM, not a rule violation - openingTags() is returning nothing, so " +
                    "every clean result in this file is meaningless.",
            ).toBeGreaterThan(0)
        }
    })

    it("finds the pointer handlers this codebase actually has", () => {
        // Mutation that turns this red: make stripComments() blank the whole
        // file, which silences the sweep completely while every other
        // assertion here still passes.
        const clickSites = srcFiles()
            .map((file) => stripComments(readSrc(file)).match(/(?<![\w-])onClick\s*=/g)?.length ?? 0)
            .reduce((sum, count) => sum + count, 0)

        expect(
            clickSites,
            `Only ${clickSites} onClick sites found under src/ (103 when this guard was ` +
                "written). SCANNER PROBLEM, not a rule violation: the sweep is reading empty " +
                "or comment-stripped-to-nothing sources.",
        ).toBeGreaterThan(50)
    })
})

/* ==========================================================================
 * 5. The rule
 * ========================================================================== */

describe("every clickable element is interactive or allowlisted", () => {
    it("finds no unexplained clickable non-interactive element under src/", () => {
        // Mutation that turns this red: put an onClick back on any <div>,
        // <span>, <tr>, <li> or href-less <a> anywhere under src/.
        const offenders = sweep().filter((violation) => coveringEntry(violation) === undefined)

        expect(
            offenders.map(describeViolation),
            "These elements carry a pointer handler on a tag the browser neither focuses nor " +
                "activates with Enter or Space, so the function behind them cannot be reached " +
                `without a mouse:\n${offenders.map(describeViolation).join("\n")}\n\n` +
                "There are exactly two ways forward, and picking one is not optional:\n" +
                '  1. Use a real <button type="button">. The browser then supplies focus, ' +
                "Enter, Space and the button announcement for free. Prefer this. Do NOT reach " +
                'for role="button" plus tabIndex plus a hand-written key handler - that gets ' +
                "Space or the disabled semantics wrong, and on a <tr> or <li> it destroys the " +
                "table or listbox semantics of the element it sits on.\n" +
                "  2. If the pointer handler is genuinely a redundant convenience, add an entry " +
                "to ALLOWLIST in this file stating the file, the element, a marker, WHY it may " +
                "stay, and the KEYBOARD MODEL - the concrete control or handler through which " +
                "the same function is reached without a mouse. An entry without a real keyboard " +
                "model fails the structure test below.",
        ).toEqual([])
    })

    it("still sees the elements the allowlist is about", () => {
        // ANTI-VACUITY for the rule above: an empty sweep satisfies "no
        // offenders" perfectly. Mutation that turns this red: make
        // isClickableNonInteractive() return false unconditionally.
        //
        // GreaterThanOrEqual, not toBe: a genuinely new violation should be
        // reported by the rule above under its own name, with its file and
        // line, not echoed here under a "scanner problem" message that would
        // send the reader to fix the scanner.
        expect(
            sweep().length,
            `The sweep found ${sweep().length} clickable non-interactive elements under src/, ` +
                `fewer than the ${ALLOWLIST.length} the allowlist accounts for. That means the ` +
                "scanner is blind rather than the tree clean. SCANNER PROBLEM, not a rule " +
                "violation - unless an allowlisted element became a real control, in which case " +
                "the red guard below names it and the entry should go.",
        ).toBeGreaterThanOrEqual(ALLOWLIST.length)
    })
})

/* ==========================================================================
 * 6. The allowlist itself
 * ========================================================================== */

describe("the allowlist carries its reasons and stays current", () => {
    it("is not empty", () => {
        // Mutation that turns this red: empty ALLOWLIST, which would make every
        // structural assertion below iterate over nothing and pass.
        expect(ALLOWLIST.length, "the allowlist is empty").toBeGreaterThan(0)
    })

    it("states file, element, marker, reason and keyboard model for every entry", () => {
        // Mutation that turns this red: delete or shorten any entry's `why` or
        // `keyboard` - an exemption without a stated keyboard path is the
        // defect with a note attached.
        for (const entry of ALLOWLIST) {
            const where = `${entry.file} <${entry.element}>`

            expect(entry.file.trim(), `${where}: empty file path`).not.toBe("")
            expect(entry.element.trim(), `${where}: empty element name`).not.toBe("")
            expect(entry.marker.trim(), `${where}: empty marker`).not.toBe("")

            expect(
                entry.file,
                `${where}: the file path must be relative to src/ with / separators`,
            ).toMatch(/^[\w./-]+\.tsx?$/)
            expect(entry.element, `${where}: the element must be a lowercase DOM tag`).toMatch(
                /^[a-z][a-z0-9-]*$/,
            )

            expect(
                entry.why.length,
                `${where}: the reason is ${entry.why.length} characters. Write out why a ` +
                    "pointer handler on a non-interactive element is deliberate here, in " +
                    'sentences. "legacy" or "by design" is not a reason.',
            ).toBeGreaterThan(120)

            expect(
                entry.keyboard.length,
                `${where}: the keyboard model is ${entry.keyboard.length} characters. Name the ` +
                    "concrete control or handler that reaches this function without a mouse " +
                    "(a real <button> beside it, a key handler on the owning input, an Escape " +
                    "listener). If there is none, this is not an exemption - it is the defect.",
            ).toBeGreaterThan(80)
        }
    })

    it("names only files the sweep actually walked", () => {
        // Mutation that turns this red: rename or move an allowlisted component
        // without updating its entry, which would otherwise leave a dangling
        // exemption nobody notices.
        const scanned = srcFiles()
        for (const entry of ALLOWLIST) {
            expect(
                scanned,
                `${entry.file} is on the allowlist but is not among the files under src/. ` +
                    "Either the component moved and the entry needs its new path, or the entry " +
                    "should be deleted.",
            ).toContain(entry.file)
        }
    })

    it("RED GUARD: reports an entry that no longer matches anything in the code", () => {
        // Mutation that turns this red: turn any allowlisted element into a real
        // <button>, or change its marker attribute, and leave the entry
        // standing. An allowlist nobody prunes eventually hides something.
        const obsolete = ALLOWLIST.filter(
            (entry) =>
                !sweep().some(
                    (violation) =>
                        violation.file === entry.file &&
                        violation.name === entry.element &&
                        violation.text.includes(entry.marker),
                ),
        ).map((entry) => `${entry.file} <${entry.element}> marker: ${entry.marker}`)

        expect(
            obsolete,
            `These allowlist entries match nothing in src/ any more:\n${obsolete.join("\n")}\n` +
                "Either the element became a real control (then delete the entry - that is the " +
                "good outcome), or it moved, was renamed, or its marker attribute changed (then " +
                "re-point the entry). Do not leave it standing: a stale exemption silently " +
                "covers the next element that happens to match.",
        ).toEqual([])
    })
})

/* ==========================================================================
 * 7. Regression: ChampionResultsTable sorts through a real button
 *
 * This is the defect the sweep found. It is pinned by name here, in addition to
 * being covered by the rule above, because the rule alone would also be
 * satisfied by an allowlist entry - and there is no honest keyboard model to
 * write for a sort control that has none.
 * ========================================================================== */

const RESULTS_TABLE = "components/player-results/ChampionResultsTable.tsx"
const SORT_BUTTON_CLASS = "results-sort-btn"
const SORT_CALL = "() => handleSort(col.key)"

/** The sort controls, selected by their class rather than by their position. */
const sortButtons = (): JsxTag[] =>
    openingTags(stripComments(readSrc(RESULTS_TABLE))).filter(
        (tag) => tag.name === "button" && hasClass(tag.text, SORT_BUTTON_CLASS),
    )

describe("ChampionResultsTable sorts through a real button", () => {
    it("has the component and the header cells this section reads", () => {
        // ANTI-VACUITY first: every assertion below is a filter over
        // openingTags(). Mutation that turns this red: rename or move the
        // component, or generate its headers some way this scan cannot see.
        const raw = readSrc(RESULTS_TABLE)
        expect(raw, "the component was renamed or moved").toContain(
            "export function ChampionResultsTable",
        )

        const tags = openingTags(stripComments(raw))
        expect(
            tags.filter((tag) => tag.name === "th").length,
            `src/${RESULTS_TABLE}: no <th> found. SCANNER PROBLEM, not a rule violation - the ` +
                "assertions below are reading an empty list.",
        ).toBeGreaterThan(0)
        expect(
            tags.filter((tag) => tag.name === "button").length,
            `src/${RESULTS_TABLE}: no <button> found at all. SCANNER PROBLEM, not a rule ` +
                "violation.",
        ).toBeGreaterThan(0)
    })

    it("puts no pointer handler on the header cell", () => {
        // Mutation that turns this red: move onClick={() => handleSort(...)}
        // back onto the <th>. It renders identically and is unreachable by
        // keyboard, which is exactly why nothing else would notice.
        const headers = openingTags(stripComments(readSrc(RESULTS_TABLE))).filter(
            (tag) => tag.name === "th",
        )
        const clickable = headers.filter((tag) => pointerHandlersOn(tag.text).length > 0)

        expect(
            clickable.map((tag) => tag.text),
            "A <th> in ChampionResultsTable carries a pointer handler again. A table header " +
                "takes no focus and answers to no key, so the column becomes unsortable without " +
                'a mouse. The sort control belongs in a <button type="button"> inside the cell.',
        ).toEqual([])
    })

    it("sorts through a real button that carries the whole handler", () => {
        // Mutation that turns this red: drop type="button" (a bare <button> in
        // a form submits), rename the class, or replace the handler with
        // anything other than the full handleSort call.
        const buttons = sortButtons()
        expect(
            buttons.length,
            `src/${RESULTS_TABLE} has ${buttons.length} <button className="${SORT_BUTTON_CLASS}">, ` +
                "expected exactly one. Either the class was renamed, the class is now assembled " +
                "at runtime, or the sort control is no longer a button at all.",
        ).toBe(1)

        const button = buttons[0].text

        expect(
            attributeValue(button, "type"),
            `The sort control lost type="button". Inside a <form> a bare <button> defaults to ` +
                `type="submit" and sorting a column would submit the form. Tag: ${button}`,
        ).toEqual({ kind: "literal", text: "button" })

        // Pinned as the WHOLE call rather than as the identifier `handleSort`,
        // which the function declaration in the same file already satisfies.
        const click = attributeValue(button, "onClick")
        expect(click.kind, `The sort button's onClick is not an expression. Tag: ${button}`).toBe(
            "expression",
        )
        expect(
            click.text,
            `The sort button no longer calls handleSort for its own column. Tag: ${button}`,
        ).toBe(SORT_CALL)
    })

    it("announces the sort state on the header cell, as a bound expression", () => {
        // Mutation that turns this red: write aria-sort="none" as a literal, or
        // move the attribute onto the <button>. Both compile, both render, and
        // both mean no column is ever announced as sorted.
        const headers = openingTags(stripComments(readSrc(RESULTS_TABLE))).filter(
            (tag) => tag.name === "th" && hasAttribute(tag.text, "aria-sort"),
        )
        expect(
            headers.length,
            `src/${RESULTS_TABLE} has ${headers.length} <th> carrying aria-sort, expected ` +
                "exactly one. ARIA defines aria-sort only for columnheader, rowheader and " +
                "gridcell, so the sortable header is the one and only place for it.",
        ).toBe(1)

        const sort = attributeValue(headers[0].text, "aria-sort")
        expect(
            sort.kind,
            `aria-sort is hardcoded instead of following the live sort key. Tag: ${headers[0].text}`,
        ).toBe("expression")
        expect(
            sort.text,
            `aria-sort no longer depends on the active column. Expression: ${sort.text}`,
        ).toContain("sortKey === col.key")
        for (const state of ["ascending", "descending"]) {
            expect(sort.text, `aria-sort never reports "${state}"`).toContain(state)
        }

        expect(
            sortButtons().filter((tag) => hasAttribute(tag.text, "aria-sort")),
            "aria-sort sits on the <button>. It typechecks there (ButtonHTMLAttributes extends " +
                "AriaAttributes too) and assistive technology drops it, which is the exact 0.7.9 " +
                "defect from ChampionStatsTable. It belongs on the <th>.",
        ).toEqual([])
    })
})

/* ==========================================================================
 * 8. The button shows where the keyboard is
 * ========================================================================== */

/** One CSS rule: its selector list and its declaration block, both collapsed. */
interface CssRule {
    readonly selector: string
    readonly body: string
}

/**
 * Only BLOCK comments, because CSS has no line comments.
 *
 * Running the JS stripper over a stylesheet would treat `url(//cdn/x)` as a
 * comment and delete the rest of that line, so the two strippers are separate on
 * purpose rather than by oversight.
 */
const stripCssComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))

/**
 * Every `selector { … }` rule.
 *
 * DELIBERATELY FLAT, like its sibling in tests/a11ySemantics.test.ts: `[^{}]*`
 * cannot match a block containing another block, so an `@media` wrapper is
 * skipped and the rules inside it come back individually. That is precisely what
 * this section asks - whether SOME rule covers a selector, not where it nests.
 */
const cssRules = (source: string): CssRule[] =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        selector: match[1].replace(/\s+/g, " ").trim(),
        body: match[2].replace(/\s+/g, " ").trim(),
    }))

/** The individual selectors of a rule, so a comma-joined list still matches. */
const selectorsOf = (rule: CssRule): string[] =>
    rule.selector.split(",").map((selector) => selector.trim())

/**
 * The value of one declaration, or `null`.
 *
 * The `(?<![\w-])` boundary is doing real work: without it `outline-offset`
 * reads as `outline`, and a rule that sets only an offset looks like it draws a
 * ring.
 */
const declarationValue = (body: string, property: string): string | null => {
    const match = new RegExp(`(?<![\\w-])${property}\\s*:\\s*([^;}]*)`).exec(body)
    return match === null ? null : match[1].trim()
}

/** The values that spell "there is no focus ring" while an `outline:` is written. */
const DEAD_OUTLINE = /^(none|0|0px|initial|unset|revert)$/i

const FOCUS_SELECTOR = `.${SORT_BUTTON_CLASS}:focus-visible`

describe("the sort button has a visible focus ring", () => {
    it("reads outline without being fooled by outline-offset", () => {
        // ANTI-VACUITY for the rule below. Mutation that turns this red: drop
        // the (?<![\w-]) boundary, and `outline-offset: -2px` alone would count
        // as a drawn ring.
        expect(declarationValue("outline-offset: -2px;", "outline")).toBeNull()
        expect(declarationValue("outline: 2px solid red; outline-offset: -2px;", "outline")).toBe(
            "2px solid red",
        )
        expect(DEAD_OUTLINE.test("none")).toBe(true)
        expect(DEAD_OUTLINE.test("0")).toBe(true)
        expect(DEAD_OUTLINE.test("2px solid var(--accent)")).toBe(false)
    })

    it("has the stylesheet this section reads", () => {
        // SCANNER PROBLEM, NOT A RULE VIOLATION: rules are looked up by
        // selector, so a stylesheet that failed to parse reports "no rule covers
        // this class", which reads as a real finding. Mutation that turns this
        // red: move src/index.css, or break cssRules().
        const rules = cssRules(stripCssComments(readSrc(STYLESHEET)))

        expect(
            rules.length,
            `src/${STYLESHEET} parsed into ${rules.length} rules. SCANNER PROBLEM, not a rule ` +
                "violation.",
        ).toBeGreaterThan(100)
        expect(
            rules.some((rule) => selectorsOf(rule).includes(`.${SORT_BUTTON_CLASS}`)),
            `src/${STYLESHEET} holds no .${SORT_BUTTON_CLASS} base rule. Without it the button ` +
                "keeps the UA chrome, loses the padding the <th> gave up, and the click target " +
                "shrinks from the whole header cell to the label.",
        ).toBe(true)
    })

    it("draws a stated outline on :focus-visible", () => {
        // Mutation that turns this red: change the rule to `outline: none`, or
        // leave only `outline-offset`. The button sets background: none and
        // border: none, so it removes the surfaces a browser draws its default
        // indicator against - without a stated ring the keyboard user gets the
        // semantics and still cannot see where focus is.
        const focus = cssRules(stripCssComments(readSrc(STYLESHEET))).filter((rule) =>
            selectorsOf(rule).includes(FOCUS_SELECTOR),
        )

        expect(
            focus.length,
            `src/${STYLESHEET} has ${focus.length} rules for ${FOCUS_SELECTOR}, expected exactly ` +
                "one.",
        ).toBe(1)

        const outline = declarationValue(focus[0].body, "outline")
        expect(
            outline,
            `${FOCUS_SELECTOR} declares no outline at all. Rule body: ${focus[0].body}`,
        ).not.toBeNull()
        expect(
            DEAD_OUTLINE.test(outline ?? ""),
            `${FOCUS_SELECTOR} sets outline to "${outline ?? ""}", which draws nothing. Give it ` +
                "a real width, style and colour. Rule body: " +
                focus[0].body,
        ).toBe(false)
    })
})
