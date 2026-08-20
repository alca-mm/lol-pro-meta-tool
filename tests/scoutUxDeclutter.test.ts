/**
 * Structural guards for the decluttered Tournament Scout.
 *
 * The tab was rewritten to read like a tool rather than like documentation.
 * Two blocks of prose that used to sit in the default view now sit behind a
 * collapsed `<details>`: the "why is there no automatic fetch" block in
 * ScoutStatsImportPanel.tsx, and the "how this tab works" honesty statement in
 * TournamentScout.tsx. Neither was deleted — collapsing them was the whole
 * point, and CLAUDE.md (P4) explicitly forbids removing the auto-fetch status
 * functions as dead code, because they are what makes that block tell the
 * truth the day a provider becomes fetchable.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`): no
 * jsdom, no document, no window, no rendering. Everything below is therefore a
 * scan of the component *source text*, in the same spirit as the umlaut scan in
 * tests/teamUiHelpers.test.ts and the purity scan in
 * tests/scoutStatsImport.test.ts.
 *
 * A source scan proves STRUCTURE and nothing else. It establishes that the
 * markup exists, that it is a `<details>`, that the summary references the
 * intended key, and that no `open` attribute is written anywhere. It does NOT
 * establish that:
 *
 *  - the block is actually reached at runtime (a `false && (...)` around it, an
 *    early `return null`, or an unmet condition would still pass every test
 *    here),
 *  - the blocks appear in a sensible order, or above/below the paste field,
 *  - CSS does not force the collapsed content visible anyway
 *    (`.scout-details > summary` lives in src/index.css and is untested here),
 *  - the result looks good, reads well, or is shorter *in practice*.
 *
 * Those four remain manual checks. What this file buys is the cheap half: the
 * `<details>` cannot silently turn back into a plain paragraph, and it cannot
 * silently gain `open`.
 */

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/* ==========================================================================
 * Reading the components
 * ========================================================================== */

const SCOUT_DIR = fileURLToPath(new URL("../src/components/scout/", import.meta.url))

const scoutComponentFiles = (): string[] =>
    readdirSync(SCOUT_DIR).filter((name) => name.endsWith(".tsx"))

const readScoutComponent = (name: string): string => readFileSync(`${SCOUT_DIR}${name}`, "utf8")

/**
 * Comments are stripped before every scan below. Without this, the long comment
 * above the auto-fetch block — which names `<details>` and explains why it is
 * collapsed — would satisfy the very assertions it describes, and this whole
 * file would pass on prose alone. Same helper and same reasoning as
 * tests/teamUiHelpers.test.ts.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

/**
 * Splits a source into its `<details>` elements.
 *
 * The lazy `[\s\S]*?` stops at the FIRST `</details>`, so this is only correct
 * while no `<details>` is nested inside another. That premise is asserted
 * separately below rather than assumed — if nesting is ever introduced, the
 * balance test fails loudly instead of this helper quietly mis-slicing.
 *
 * `[^>]*` for the attributes likewise assumes no `>` inside the opening tag,
 * which rules out an inline arrow function (`onToggle={() => ...}`). The scout
 * components use plain `className` today; an arrow there would make the tag
 * invisible to this helper, so the element count is cross-checked against a
 * raw `<details` count.
 */
interface DetailsElement {
    readonly attributes: string
    readonly inner: string
}

const detailsElements = (source: string): DetailsElement[] =>
    [...source.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)].map((match) => ({
        attributes: match[1],
        inner: match[2],
    }))

const summaryOf = (element: DetailsElement): string =>
    element.inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? ""

/** A `<details open>` / `<details open={...}>`, however it is spelled. */
const isOpen = (element: DetailsElement): boolean => /\bopen\b/.test(element.attributes)

/** Counts references to an i18n key without matching a longer key that starts with it. */
const referenceCount = (source: string, key: string): number =>
    source.match(new RegExp(`${key}(?![A-Za-z0-9_])`, "g"))?.length ?? 0

/* ==========================================================================
 * 0. The scanner itself
 *
 * Every assertion in this file is only as trustworthy as the four helpers
 * above, and a source scan that silently matches nothing is the classic way a
 * guard test turns vacuous. These run against synthetic strings, so they stay
 * true no matter what the components do.
 * ========================================================================== */

describe("source scanner", () => {
    it("drops comments, keeps code, and does not choke on a URL", () => {
        expect(stripComments("const a = 1 // <details open>\n")).not.toContain("details")
        expect(stripComments("/* <details open> */ const a = 1")).not.toContain("details")
        expect(stripComments("{/* <details open> */}")).not.toContain("details")
        expect(stripComments('const u = "https://example.test/x"')).toContain("example.test")
    })

    it("finds details elements and reads their summary", () => {
        const elements = detailsElements(
            '<details className="x"><summary>{t("k_title")}</summary><p>body</p></details>',
        )

        expect(elements).toHaveLength(1)
        expect(summaryOf(elements[0])).toContain("k_title")
        expect(elements[0].inner).toContain("body")
        expect(isOpen(elements[0])).toBe(false)
    })

    it("recognises an open attribute in both spellings", () => {
        // This is the mutation the file exists to catch, proven on a fixture:
        // if `isOpen` could not see it, the assertions further down would be
        // green for a permanently expanded block.
        expect(detailsElements("<details open><summary>s</summary></details>").map(isOpen)).toEqual([
            true,
        ])
        expect(
            detailsElements('<details className="x" open={true}><summary>s</summary></details>').map(
                isOpen,
            ),
        ).toEqual([true])
    })

    it("finds nothing in a source without a details element", () => {
        expect(detailsElements("<section><p>plain</p></section>")).toEqual([])
    })

    it("does not confuse a key with a longer key sharing its prefix", () => {
        // `scout_dataHonestySummary` starts with `scout_dataHonesty`; a plain
        // `includes` would count the summary as a body reference and hide a
        // duplicated paragraph.
        expect(referenceCount('t("scout_dataHonestySummary")', "scout_dataHonesty")).toBe(0)
        expect(referenceCount('t("scout_dataHonesty")', "scout_dataHonesty")).toBe(1)
    })
})

/* ==========================================================================
 * 1. Every details element in the scout components is collapsed
 * ========================================================================== */

describe("scout components ship no expanded details element", () => {
    const files = scoutComponentFiles()

    it("found the component folder at all", () => {
        // Guards against a moved or renamed folder making the loop below run
        // zero times and report success.
        expect(files.length, "no .tsx file in src/components/scout/").toBeGreaterThan(5)
        expect(files).toContain("ScoutStatsImportPanel.tsx")
        expect(files).toContain("TournamentScout.tsx")
    })

    for (const name of files) {
        it(`${name}: no <details> carries an open attribute`, () => {
            const source = stripComments(readScoutComponent(name))
            const opened = detailsElements(source)
                .filter(isOpen)
                .map((element) => `<details${element.attributes}>`)

            expect(
                opened,
                `${name} ships an expanded details element:\n${opened.join("\n")}\n` +
                    "Collapsed is the point - the block is reference material, not a step.",
            ).toEqual([])
        })

        it(`${name}: every <details> is closed and none is nested`, () => {
            // The slicing helper relies on this. Unbalanced or nested tags would
            // make `detailsElements` mis-slice, and a mis-sliced element cannot
            // be trusted to report an `open` attribute.
            const source = stripComments(readScoutComponent(name))
            const opens = source.match(/<details\b/g)?.length ?? 0
            const closes = source.match(/<\/details>/g)?.length ?? 0
            const parsed = detailsElements(source).length

            expect(closes, `${name}: <details> and </details> counts differ`).toBe(opens)
            expect(
                parsed,
                `${name}: ${opens} <details> in the source but ${parsed} parsed - ` +
                    "nested elements, or a > inside the opening tag.",
            ).toBe(opens)
        })
    }
})

/* ==========================================================================
 * 2. The auto-fetch justification is collapsed, not deleted
 *
 * CLAUDE.md, P4: the four auto-fetch status functions in src/scout/sources.ts
 * survived the Riot auto-import rollback on purpose. They render the honest
 * "these four sites cannot be read from the browser" block, which is the reason
 * the user is asked to copy and paste at all. Deleting them as dead code is
 * explicitly forbidden - so the declutter has to be a collapse, and this
 * section is what tells the two apart.
 * ========================================================================== */

describe("ScoutStatsImportPanel keeps the auto-fetch block behind a summary", () => {
    const source = stripComments(readScoutComponent("ScoutStatsImportPanel.tsx"))

    it("looks like the panel and not an empty file", () => {
        expect(source.length, "ScoutStatsImportPanel.tsx looks empty").toBeGreaterThan(2000)
    })

    it("renders scout_import_autoFetchTitle as the summary of a details element", () => {
        const carriers = detailsElements(source).filter((element) =>
            summaryOf(element).includes("scout_import_autoFetchTitle"),
        )

        expect(
            carriers,
            "no <details> whose <summary> renders scout_import_autoFetchTitle - the " +
                "auto-fetch justification is either expanded again or gone.",
        ).toHaveLength(1)
    })

    it("keeps the title inside a summary and nowhere else", () => {
        // A leftover heading next to the collapsed block would put the same
        // question back into the default view.
        const summaries = detailsElements(source).map(summaryOf).join("\n")
        const inSummary = referenceCount(summaries, "scout_import_autoFetchTitle")
        const inFile = referenceCount(source, "scout_import_autoFetchTitle")

        expect(inSummary, "scout_import_autoFetchTitle is in no <summary>").toBeGreaterThan(0)
        expect(
            inFile,
            `scout_import_autoFetchTitle appears ${inFile} times but only ${inSummary} of ` +
                "them are inside a <summary> - the question is back in the default view.",
        ).toBe(inSummary)
    })

    it("still renders the status functions inside that block", () => {
        const block = detailsElements(source).find((element) =>
            summaryOf(element).includes("scout_import_autoFetchTitle"),
        )

        expect(block, "the auto-fetch details element is missing entirely").toBeDefined()
        // Property, not wording: the block must be driven by SCOUT_DIRECT_FETCH_INFO
        // through the status helpers, so it stops claiming "not fetchable" by
        // itself the day that changes.
        expect(block?.inner, "autoFetchStatuses no longer feeds the block").toContain(
            "autoFetchStatuses",
        )
        expect(block?.inner, "scoutBlockedKey no longer names the reason").toContain(
            "scoutBlockedKey",
        )
    })

    it("still imports the status helpers from src/scout/sources.ts", () => {
        // The stricter half of the P4 rule: keeping the identifiers but pointing
        // them at a local constant would defeat the whole arrangement.
        expect(source).toContain("getAllScoutAutoFetchStatuses")
        expect(source).toContain("isAutoFetchUnavailableForAll")
        expect(source).toMatch(/from\s+"[^"]*scout\/sources"/)
    })
})

/* ==========================================================================
 * 3. The honesty statement is collapsed, not deleted
 * ========================================================================== */

describe("TournamentScout keeps the honesty statement behind a summary", () => {
    const source = stripComments(readScoutComponent("TournamentScout.tsx"))

    it("looks like the tab and not an empty file", () => {
        expect(source.length, "TournamentScout.tsx looks empty").toBeGreaterThan(2000)
    })

    it("renders scout_dataHonestySummary as the summary of a details element", () => {
        const carriers = detailsElements(source).filter((element) =>
            summaryOf(element).includes("scout_dataHonestySummary"),
        )

        expect(
            carriers,
            "no <details> whose <summary> renders scout_dataHonestySummary",
        ).toHaveLength(1)
    })

    it("keeps scout_dataHonesty inside that element and only there", () => {
        const carrier = detailsElements(source).find((element) =>
            summaryOf(element).includes("scout_dataHonestySummary"),
        )

        expect(carrier, "the honesty details element is missing entirely").toBeDefined()
        expect(referenceCount(carrier?.inner ?? "", "scout_dataHonesty")).toBe(1)
        // One reference in the whole file means the paragraph exists exactly
        // once, and the previous assertion places that one inside the element.
        expect(
            referenceCount(source, "scout_dataHonesty"),
            "scout_dataHonesty is rendered more than once - a copy of it is " +
                "standing outside the collapsed block again.",
        ).toBe(1)
    })
})
