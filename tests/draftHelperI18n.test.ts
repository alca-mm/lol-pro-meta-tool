/**
 * Guards for the Draft Helper i18n pass: 0.5.5 -> 0.5.6 (Draft Cockpit headings
 * and one aria-label), 0.5.6 -> 0.5.7 (the recommendations table header row),
 * 0.5.7 -> 0.6.0 (the UI-copy completion pack), 0.6.0 -> 0.6.1 (the counted
 * nouns "Games" and "Picks") and 0.6.1 -> 0.6.2 (the picks count grouped by
 * locale, and the pin that kept breaking on signature changes).
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
 * 0.6.0 - BOTH REMAINING PINS WERE PAID OFF, AND BOTH WERE TURNED AROUND
 *
 * The UI-copy completion pack translated the recommendation subtitle and all
 * five remaining `aria-label` literals, so the two known-issues pins this file
 * carried had to go. They were REPLACED, not deleted, exactly the way the 0.5.6
 * pins were:
 *
 *  - section 4b used to assert that `· Score ` and `} Picks` were STILL written
 *    into DraftHelper.tsx. It now asserts they are gone, AND that the six
 *    subtitle labels are rendered through t() OUTSIDE the header row. That
 *    second half is not padding: the same six keys also name six `<th>`, so a
 *    plain "the key is mentioned in the file" would have been satisfied by the
 *    header row alone and the subtitle could have been deleted outright,
 *  - ARIA_LABEL_LITERALS is now EMPTY. Its rot check and its count pin were
 *    deleted rather than left standing, because an empty list makes the rot
 *    loop run zero times and turns the count pin into `0 === 0` - two green
 *    assertions that prove nothing. Their anti-vacuity job moved to the file
 *    walker (a floor on the file count, and App.tsx by name) plus six per-site
 *    anti-deletion pins.
 *
 * The pack also widened section 3 from `src/components/**` to all of `src/`.
 * That is the scope `src/App.tsx:266` had been sitting just outside of: its
 * `aria-label="Ansichten"` was named in the old known-issues comment as "not
 * covered", and it stayed German for every English screen-reader user for as
 * long as the scan stopped one directory short. It is covered now, and
 * translated.
 *
 * 0.6.1 - THE COUNTED NOUNS, AND TWO MORE PINS TURNED AROUND
 *
 * The recommendation subtitle rendered `{entry.games} {t("dh_recoTablePicks")}`
 * and four more draft sites rendered `{n} {t("dh_games")}`: a number followed
 * by a TABLE-HEADER key. That is the `{zahl} {t("substantiv_im_plural")}` shape
 * CLAUDE.md banned after "1 neue Match gespeichert.", and it was reachable
 * rather than theoretical - the min-picks filter is `min={1}`, so a one-pick
 * champion really did read "1 Picks", and a patch enters the weight summary
 * only once it has matches, so "1 Games" sat one filter away.
 *
 * Five call sites now go through `formatDraftGamesCount()` and
 * `formatDraftPicksCount()` in src/components/draft/draftUiHelpers.ts, which
 * choose between `dh_gamesCountOne`/`dh_gamesCountMany` and
 * `dh_picksCountOne`/`dh_picksCountMany` through `pluralKey()`. `dh_games` was
 * DELETED: every use of it was a counted noun, so it had no label use left and
 * keeping it would have left the trap in the catalogue. `dh_recoTablePicks`
 * SURVIVES and is pinned as a header key exactly as before - it is still the
 * `<th>` of column 8, and only its COUNT use moved.
 *
 * Two assertions here went red the moment that landed, and both were pins on
 * the old SHAPE rather than tests of the rule:
 *
 *  - section 4b listed six subtitle labels and looked for six `t()` calls. The
 *    sixth is no longer a `t()` call at the call site, it is a helper call. It
 *    is now five keys plus a pin on the `formatDraftPicksCount(t, …)` call,
 *    which says MORE than the assertion it replaces: the old one was satisfied
 *    by any mention of the key outside the header row, wherever it sat,
 *  - the section 6 probe reverted `{entry.games} {t("dh_recoTablePicks")}`, a
 *    string that no longer exists. Its `.replace()` matched nothing, so it
 *    "mutated" an unchanged file and only its own did-anything-change guard
 *    fired - and that guard was satisfied by the OTHER replacement on the same
 *    chain. It reverts the helper call now, and each of its two patterns is
 *    asserted separately, because one combined check is exactly how the probe
 *    went half blind.
 *
 * Section 7 is new and holds the rule itself: `dh_recoTablePicks` may appear in
 * DraftHelper.tsx ONLY inside a `<th>`, `dh_games` may not appear under `src/`
 * at all, no `{n} {t(noun)}` shape may come back anywhere in `src/components/`,
 * and no `Pick${…}` suffix may be spliced on instead. That last rule is not
 * padding: a suffix is the obvious "fix" for "1 Picks", and a suffix is exactly
 * what produced "1 neue Match" - it declines the noun and leaves the adjective,
 * the article and the verb behind.
 *
 * 0.6.2 - THE PIN THAT KEPT BREAKING, AND WHAT REPLACED IT
 *
 * `formatDraftPicksCount` gained a third parameter, `lang`, so it groups its
 * thousands through `formatNumber` the way `formatDraftGamesCount` beside it
 * already did. One argument, one call site, no key touched, no header touched.
 * FIVE assertions in this file went red.
 *
 * All five traced to one constant that spelled the call out in full,
 * `"formatDraftPicksCount(t, entry.games)"`, used as an exact-substring pin and
 * as the `.replace()` pattern of four section 6 probes. When it stopped
 * matching, the pin failed and the four probes quietly stopped mutating - which
 * their own did-anything-change guards caught, so they failed too. That part
 * worked exactly as designed.
 *
 * THE POINT IS THAT NOTHING HAD REGRESSED. 0.6.1 had already paid this toll
 * once, on `\{entry\.games\}\s*\{t\("dh_recoTablePicks"\)\}`. Twice in two
 * versions, both times on an improvement, is not maintenance - it is a guard
 * teaching the next author that it is an obstacle, and this file already knows
 * where that ends: "a guard that forbids reasonable refactors is a guard
 * somebody eventually deletes".
 *
 * So the pin was LOOSENED to a shape - a `formatDraftPicksCount(…)` call, in
 * JSX braces, whose first argument is `t`, outside the header row - and the
 * argument that actually mattered was pinned SEPARATELY and BY NAME. Section 7
 * now asserts that both count helpers declare a `lang: Lang` parameter and that
 * every caller passes a `lang`, with a message that says why: without the
 * language the two counts in one subtitle spell a thousand two different ways
 * (`1.234 Games` next to `1234 Picks`). That is strictly more than the literal
 * pin ever said. It named every argument and explained none of them.
 *
 * WHAT WAS GIVEN UP, stated plainly: the pin no longer notices a change to
 * WHICH value is counted. That was never real protection - a source scan cannot
 * see what renders - and section 6 carries a probe for each way back that does
 * matter, including a new one for the dropped `lang`.
 *
 * WHY AN aria-label IS THE ONE WORTH A WIDE GUARD
 *
 * A hardcoded heading is visible: flip the language switch and it stands out.
 * A hardcoded `aria-label` is untranslated BY CONSTRUCTION and invisible to
 * everyone who does not use a screen reader, so it can sit there for years -
 * and `aria-label="Ansichten"` did. Section 3 therefore scans every `.ts`/
 * `.tsx` under `src/`, with an EMPTY allowlist: there is no longer a single
 * file in which a string literal there is tolerated.
 *
 * WHY "NO LITERAL" IS NEVER ASSERTED ON ITS OWN
 *
 * Deleting the attribute satisfies "hands aria-label no string literal"
 * perfectly, and leaves the control with no accessible name at all - a worse
 * outcome for exactly the user the rule exists for. Every site the pack fixed
 * therefore carries a second, opposite assertion: the element still HAS an
 * `aria-label`, and that label still resolves to the agreed key. Those pins
 * deliberately tolerate hoisting the call into a local `const` first. A regex
 * demanding `aria-label={t("key")}` inline would forbid a perfectly reasonable
 * refactor, and a guard that forbids reasonable refactors is a guard somebody
 * eventually deletes.
 *
 * WHY COMMENTS ARE STRIPPED BEFORE EVERY SOURCE SCAN
 *
 * Same decision, for the same reason, as tests/appLocaleGuards.test.ts and
 * tests/playerResultsI18n.test.ts: a module header that documents a rule by
 * QUOTING the wrong code (`<h3>Draft Edge</h3>`, `aria-label="Close"`) would
 * fail a raw scan, and the obvious "fix" would be deleting the prose that
 * exists to stop the next person reintroducing the bug. A file allowlist would
 * be worse - it would exempt the files most likely to break the rule. So every
 * scan strips line and block comments first.
 *
 * That stripper carried a real defect until 0.6.0. It matched `//` anywhere, so
 * a `https://` inside a string literal ate the rest of its line and everything
 * after it went unscanned. All four sibling guard files (appLocaleGuards,
 * playerResultsI18n, scoutUxDeclutter, scoutKdaVisibility) carry a `(?<!:)`
 * lookbehind for precisely that; this file claimed parity with them in prose
 * and did not have it - while running the WIDEST scan in the suite, so it had
 * the most lines to lose. Hiding a match is the one failure mode a guard cannot
 * afford, and section 5 now proves a URL no longer swallows an `aria-label`
 * written after it on the same line.
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
 *
 * The `(?<!:)` lookbehind is not decoration and it is not copied for symmetry.
 * Without it a `https://` inside a string literal is read as the start of a
 * comment and the rest of that line is deleted before any predicate sees it -
 * so `const HELP = "https://x" // …` would hide anything written after it, and
 * this file scans every `.ts`/`.tsx` in `src/`. The four sibling guard files
 * all have it; this one did not, which was a live vacuity bug rather than a
 * theoretical one. A single slash (`"CS/min"`) is untouched: the pattern needs
 * two.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, " ")

/**
 * The stripper as it stood BEFORE 0.6.0, kept solely as a mutant.
 *
 * Section 5 runs both over the same input and asserts they disagree. Without a
 * mutant, "the lookbehind is there" is a claim about a regex; with one, the
 * lost `aria-label` is on the screen in the failure message.
 */
const NAIVE_STRIP_COMMENTS = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")

const code = (rel: string): string => stripComments(readComponent(rel))

/**
 * Every `.ts`/`.tsx` under `src/`, relative to it, with `/` separators.
 *
 * WHY THIS IS WIDER THAN componentFiles(): the aria-label rule in section 3
 * used to stop at `src/components/**`, and `src/App.tsx` sits one directory
 * above that line. Its tab nav carried `aria-label="Ansichten"` - German read
 * out to every English screen-reader user - and the scan that existed to catch
 * exactly that could not see it. Nothing about the defect is specific to the
 * components directory, so neither is the scan any more.
 *
 * `src/i18n/` is INCLUDED here on purpose, unlike in srcOutsideI18n() below.
 * That exclusion exists because a dead-key check must not count a key's own
 * definition as a reference; an aria-label literal in a catalogue file would be
 * a real finding, so there is no reason to look away from it.
 */
const srcFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.tsx?$/.test(entry))

const readSrc = (rel: string): string => readFileSync(SRC + rel.split("/").join(sep), "utf8")

const srcCode = (rel: string): string => stripComments(readSrc(rel))

/** The two files the 0.5.6/0.5.7 changes touched, relative to `src/components/`. */
const DRAFT_HELPER = "DraftHelper.tsx"
const PATCH_WEIGHT_PANEL = "draft/PatchWeightPanel.tsx"

/** `src/App.tsx`, relative to `src/`: the file the old scope missed. */
const APP_ENTRY = "App.tsx"

/**
 * Files every `src/` scan must have seen, relative to `src/`.
 *
 * A count threshold is a weak anti-vacuity proof. `src/` holds 121 `.ts`/`.tsx`
 * files today, so a walk could drop twenty of them — including every file the
 * rules below are actually about — and still clear `> 100`. Worse, when it did
 * fail, the message said only "found almost no TypeScript files", which sends
 * the reader looking for a broken walk instead of a missing file.
 *
 * These four carry the keys and the call sites the draft-i18n rules police, so
 * a scan that cannot see them cannot judge anything.
 */
const REQUIRED_SRC_FILES: readonly string[] = [
    APP_ENTRY,
    "components/DraftHelper.tsx",
    "components/draft/draftUiHelpers.ts",
    "i18n/de.ts",
    "i18n/en.ts",
]

/**
 * Assert that a `src/` scan really saw the files the rule depends on.
 *
 * Named rather than counted, and it reports the missing paths, so a partial
 * walk is diagnosed as a partial walk instead of being mistaken for a clean
 * tree or for a reintroduced key.
 */
function expectCompleteSrcScan(scanned: readonly string[], rule: string): void {
    const missing = REQUIRED_SRC_FILES.filter((file) => !scanned.includes(file))

    expect(
        missing,
        `${rule}: the src/ walk did not return ${missing.join(", ")}. The scan is incomplete, ` +
            "so whatever it reports about these rules is meaningless. This is a scanner " +
            "problem, not a violation of the rule.",
    ).toEqual([])

    // Kept as a second, weaker signal: it catches a walk that lost files this
    // list does not name.
    expect(
        scanned.length,
        `${rule}: the src/ walk returned ${scanned.length} files, far fewer than this tree has.`,
    ).toBeGreaterThan(100)
}

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

/**
 * `source` with every `<th>…</th>` element replaced by a space.
 *
 * The same regex `thChildren()` uses, hoisted because THREE rules need it and a
 * fourth copy is how they drift apart: section 4b looks for the subtitle labels
 * outside the header row, section 7 asserts `dh_recoTablePicks` appears nowhere
 * BUT the header row, and the section 6 probe proves the strip really removes
 * something. All three would be satisfied by the header row alone if the strip
 * silently stopped matching, so each of them asserts that it did strip.
 */
const withoutHeaderCells = (source: string): string =>
    source.replace(/<th\b[^>]*>[\s\S]*?<\/th>/g, " ")

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

/**
 * Every mention of `key` in `source`, as a whole word, with up to 50 characters
 * of context on each side.
 *
 * THE WORD BOUNDARY IS THE WHOLE POINT and it is not defensive tidiness. The
 * key this file must prove is GONE is `dh_games`, and the four keys that
 * replaced it are `dh_gamesCountOne`, `dh_gamesCountMany`, `dh_picksCountOne`
 * and `dh_picksCountMany`. A plain `source.includes("dh_games")` matches
 * `dh_gamesCountOne` and would report the deleted key as still present in the
 * two files that are supposed to carry its replacement - a permanently red
 * guard, which gets deleted rather than believed. `\b` after the name refuses
 * that, because the next character there is a word character.
 *
 * The context is returned rather than a boolean so the failure message can show
 * WHERE, which is the difference between a guard someone acts on and one they
 * have to go hunting for.
 */
const mentionsOfKey = (source: string, key: string): string[] =>
    [...source.matchAll(new RegExp(`.{0,50}\\b${key}\\b.{0,50}`, "g"))].map((match) =>
        match[0].replace(/\s+/g, " ").trim(),
    )

/**
 * The argument text of every `name(...)` call in `source`, whitespace-collapsed,
 * in source order. `formatDraftPicksCount(t, entry.games, lang)` yields
 * `"t, entry.games, lang"`.
 *
 * WHY THE ARGUMENTS RATHER THAN THE WHOLE CALL: a pin written as one literal
 * string names the entire argument list, so it goes red on ANY signature
 * change - including a pure improvement. This file has now paid that twice in
 * two versions, and the second time the change was `formatDraftPicksCount`
 * gaining a `lang` so it could group its number the way the games count next to
 * it already did. Reading the arguments out lets an assertion ask about ONE of
 * them by name and stay quiet about the rest.
 *
 * ONE LEVEL OF NESTING is allowed inside the list (`(?:[^()]|\([^()]*\))*`), so
 * `formatDraftPicksCount(t, countOf(entry), lang)` is still read as one call
 * rather than truncated at the inner `)`. Two levels are not, and that is the
 * documented limit: the failure direction is a call that reads as absent, which
 * fails loudly, rather than one that reads as present with the wrong arguments.
 *
 * The alternation cannot backtrack pathologically - `[^()]` and `\(` are
 * disjoint at their first character, so at every position exactly one branch can
 * apply.
 */
const callArguments = (source: string, name: string): string[] =>
    [...source.matchAll(new RegExp(`\\b${name}\\(((?:[^()]|\\([^()]*\\))*)\\)`, "g"))].map((match) =>
        match[1].replace(/\s+/g, " ").trim(),
    )

/**
 * The `lang` argument, as a whole word.
 *
 * DELIBERATELY TOLERANT of `props.lang` or a `lang` reached through one hop -
 * the question this asks is whether the active language reaches the helper at
 * all, not how the caller happens to spell its way to it. The same reasoning,
 * and the same trade-off, as the one-hop tolerance in `ariaLabelUsesKey()`: a
 * guard that forbids a reasonable refactor is a guard somebody eventually
 * deletes. No `g` flag, so `.test()` here is stateless.
 */
const LANG_ARGUMENT = /\blang\b/

/**
 * Occurrences of a VALUE immediately followed by `t("key")` - the
 * `{zahl} {t("substantiv_im_plural")}` shape CLAUDE.md bans.
 *
 * Matches all three ways this project could write it: JSX (`{n} {t("k")}`), a
 * template literal (`${n} ${t("k")}`) and a plain number typed in (`41
 * {t("k")}`). Whitespace between the two is `\s*`, so a reformat across two
 * lines cannot hide it.
 *
 * WHAT IT DELIBERATELY DOES NOT MATCH, because these are correct:
 *
 *  - `{t("k")} {formatScore(x)}` - a LABEL in front of a value is a caption,
 *    not a declined noun. `dh_recoTableTotal` is used that way in the very same
 *    subtitle and must stay legal,
 *  - `<th>{t("k")}</th>` next to another `<th>` - the intervening `</th><th>`
 *    is not whitespace, so two adjacent header cells are not the shape.
 *
 * The key is a parameter rather than baked in: the rule is about the KEY being
 * a bare noun label, and only the caller knows which keys those are.
 */
const numberBeforeTranslationCall = (source: string, key: string): string[] => {
    const re = new RegExp(
        `(?:\\$?\\{[^{}]*\\}|\\b\\d[\\d.,]*)\\s*\\$?\\{\\s*t\\(\\s*"${key}"\\s*\\)\\s*\\}`,
        "g",
    )
    return [...source.matchAll(re)].map((match) => match[0].replace(/\s+/g, " "))
}

/**
 * The suffix-plural heuristic, in the two forms this repository has actually
 * shipped as a bug.
 *
 * WHY THIS IS BANNED RATHER THAN JUST DISCOURAGED: `` `${n} neue Match${n === 1
 * ? "" : "es"}` `` is the string that started the whole rule. The suffix
 * declined the NOUN and left the adjective behind, so the UI read "1 neue
 * Match" - and no suffix can ever fix that, because the article, the adjective
 * ending and the verb agreement are all outside the noun. Two i18n keys are the
 * only shape that works, which is what `pluralKey()` selects between.
 *
 *  1. A noun with the expression spliced straight onto it (`Game${…}`,
 *     `Picks${…}`). Deliberately NO `\s*` before the `${`: `` `Picks ${n}` ``
 *     is a caption and perfectly fine, and a rule that fails on it would be
 *     switched off within the week.
 *  2. A ternary that picks between "" and an inflection. Only `s` and `es` are
 *     listed - the two this project has produced. A wider list (`e`, `n`, `en`)
 *     would start firing on ordinary code without catching anything that has
 *     ever happened here.
 *
 * The first pattern is scoped to games and picks, which is what 0.6.1 fixed.
 * The second is not scoped to a noun at all: the count and the suffix are not
 * reliably on the same line, and there is no legitimate use of it anywhere in
 * `src/components/` today.
 */
const SUFFIX_PLURAL_PATTERNS: ReadonlyArray<readonly [what: string, source: string]> = [
    ["a games/picks noun with a suffix spliced onto it", "\\b(?:[Gg]ames?|[Pp]icks?)\\$\\{"],
    [
        'an inflection chosen by a ternary, e.g. `n === 1 ? "" : "s"`',
        "\\?\\s*(?:\"\"|'')\\s*:\\s*(?:\"e?s\"|'e?s')|\\?\\s*(?:\"e?s\"|'e?s')\\s*:\\s*(?:\"\"|'')",
    ],
]

const suffixPluralHits = (source: string): string[] =>
    SUFFIX_PLURAL_PATTERNS.flatMap(([what, pattern]) =>
        [...source.matchAll(new RegExp(pattern, "g"))].map(
            (match) => `${match[0].replace(/\s+/g, " ")}   (${what})`,
        ),
    )

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

/**
 * The expression text inside every `aria-label={…}` in `source`, brace-balanced
 * so a nested object or template literal does not truncate it.
 *
 * This is the OPPOSITE question to ariaLabelLiterals(): that one asks whether a
 * label is hardcoded, this one asks whether a label exists at all. Deleting the
 * attribute is the cheapest way to satisfy "no string literal" and the worst
 * possible outcome, so both questions have to be asked at every site.
 */
const ariaLabelExpressions = (source: string): string[] => {
    const found: string[] = []
    for (const match of source.matchAll(/\baria-label\s*=\s*\{/g)) {
        const start = (match.index ?? 0) + match[0].length
        let depth = 1
        let index = start
        while (index < source.length && depth > 0) {
            if (source[index] === "{") depth += 1
            else if (source[index] === "}") depth -= 1
            index += 1
        }
        found.push(source.slice(start, depth === 0 ? index - 1 : index).trim())
    }
    return found
}

/**
 * Local `const`/`let` names on ONE line whose initialiser contains `needle`.
 *
 * The name pattern excludes `$` deliberately. It is spliced into a `\b…\b`
 * regex below, and `\b` before a `$` can never match - a `$`-prefixed name
 * would silently read as unresolved. Leaving it out means such a name fails the
 * pin loudly instead, which is the direction a guard should fail in.
 */
const localsHolding = (source: string, needle: string): string[] =>
    [...source.matchAll(/\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=\n]+)?=([^\n]*)/g)]
        .filter((match) => match[2].includes(needle))
        .map((match) => match[1])

/**
 * True when some `aria-label` in `source` resolves to `t("key")` - written
 * inline, or hoisted into a local `const` one hop earlier.
 *
 * The one hop is the whole point. Requiring `aria-label={t("key")}` verbatim
 * would go red on
 *
 *   const navLabel = t("app_navAriaLabel")
 *   …
 *   <nav aria-label={navLabel}>
 *
 * which is a refactor nobody should have to argue with a test about. Requiring
 * only that the file mentions the key somewhere would go green on a file that
 * deleted the attribute and still used the key for a tooltip. This asks the
 * question that actually matters: is THIS element's accessible name that key.
 *
 * Deliberately one hop and one line - a value threaded through two variables or
 * built across three lines reads as unresolved and fails loudly. That is the
 * safe direction: a false alarm gets looked at, a silent pass does not.
 */
const ariaLabelUsesKey = (source: string, key: string): boolean => {
    const call = `t("${key}")`
    const expressions = ariaLabelExpressions(source)
    if (expressions.some((expression) => expression.includes(call))) return true

    return localsHolding(source, call).some((name) =>
        expressions.some((expression) => new RegExp(`\\b${name}\\b`).test(expression)),
    )
}

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
 * The keys the 0.6.0 UI-copy completion pack minted
 * ========================================================================== */

/**
 * Key, DE value, EN value for every key of the completion pack that falls in
 * this file's remit - the Draft Helper, the accessible names, and the two
 * shared `common_*`/`cd_*`/`tbl_*` labels the pack had to mint to finish them.
 *
 * Written out rather than read from the catalogue, for the same reason as
 * NEW_KEYS and RECO_TABLE_KEYS: a test that asks de.ts what de.ts says agrees
 * with any edit, including a bad one.
 *
 * Four of these are accessible names (`*AriaLabel`, `cd_close`, `common_clear`)
 * and one is a `<option>` label, which is the same thing - an option's text IS
 * its accessible name. Those five are the ones nothing on screen would have
 * shown to be wrong, which is why they are spelled out here as data as well as
 * pinned at their call sites in section 3.
 *
 * NOT ON THIS LIST, and deliberately: `dh_noPatchData`. It belongs to the patch
 * window summary helper, which lives in src/components/draft/draftUiHelpers.ts
 * and has its own guard file. Pinning it here too would mean two files own one
 * value, and the second owner is the one that goes stale.
 */
const COMPLETION_PACK_KEYS: ReadonlyArray<readonly [key: string, dePrompt: string, enPrompt: string]> =
    [
        ["app_navAriaLabel", "Ansichten", "Views"],
        ["cd_close", "Detailansicht schließen", "Close details"],
        ["cn_tagsPlaceholder", "z. B. Top, Carry, Peel", "e.g. top, carry, peel"],
        ["common_clear", "Eingabe leeren", "Clear input"],
        ["common_noMatch", "Keine Treffer", "No matches"],
        ["dh_flowComplete", "Draft abgeschlossen", "Draft complete"],
        ["dh_flowControlsAriaLabel", "Draft-Flow-Steuerung", "Draft flow controls"],
        ["dh_recoSideAriaLabel", "Seite für Empfehlungen", "Recommendation side"],
        ["dh_rolePlaceholder", "Rolle?", "Role?"],
        ["dh_statBans", "Bans gesamt", "Bans total"],
        ["dh_title_draftEdgeBlue", "Blue Draft-Edge", "Blue Draft Edge"],
        ["dh_title_draftEdgeRed", "Red Draft-Edge", "Red Draft Edge"],
        ["dh_wPreset_balanced", "Ausgewogen", "Balanced"],
        ["dh_wPreset_counterpick", "Counterpick", "Counterpick"],
        ["dh_wPreset_synergy", "Synergie", "Synergy"],
        ["dh_wPreset_meta", "Meta zuerst", "Meta first"],
        ["dh_wPreset_safe", "Sicher, hohe Aussagekraft", "Safe, high confidence"],
        ["dh_wPresetsAriaLabel", "Wichtungs-Presets", "Weighting presets"],
        ["tbl_draftPriority", "Draft-Priorität", "Draft Priority"],
    ]

/**
 * The completion-pack keys that read the SAME in de.ts and en.ts, each with the
 * reason it is a loanword rather than a missed translation - and, like
 * IDENTICAL_BY_DESIGN above, checked in both directions so the exemption cannot
 * outlive its reason.
 *
 * Exactly one key qualifies, and it is worth stating why the rest do not.
 * `dh_title_draftEdgeBlue` and `dh_title_draftEdgeRed` look like candidates -
 * "Blue"/"Red" and "Draft Edge" are all English - but German spells the feature
 * `Draft-Edge`, hyphenated, the way this catalogue already spells
 * `Draft-Cockpit` and `Draft-Empfehlungen`. So they differ, and the DE/EN check
 * covers them properly.
 *
 * `dh_statBans` was on this list until a copy review pointed out that the card
 * counts BOTH teams (`allBans` = blue + red, rendered `{n}/10`) while sitting
 * between "Eigene Picks" and "Gegner Picks" - so a bare "Bans" reads as "my
 * bans". It is now "Bans gesamt" / "Bans total", a genuine translation, and the
 * DE/EN difference check covers it. The noun "Bans" itself stays, which is what
 * kept faith with `dh_bestBansTitle` ("Best Bans gegen"),
 * `similarDrafts_matchedBans` ("Gemeinsame Bans") and `scout_bansByPlayer`
 * ("Bans nach Spieler") - "Sperren" would have desynced this card from four
 * screens. That last citation used to be `scout_safeBans` ("Sichere Bans"),
 * which the 0.7.4 ban-plan de-duplication deleted along with its heading; the
 * point it made is unchanged, only the surviving example moved.
 *
 * `dh_wPreset_counterpick` is the one that qualifies now: "Counterpick" is the
 * German word in this domain, and the catalogue's own `dh_wLabel_matchup`
 * ("Matchup / Counter") already leans on it.
 */
const COMPLETION_PACK_IDENTICAL_BY_DESIGN: ReadonlyArray<readonly [key: string, why: string]> = [
    [
        "dh_wPreset_counterpick",
        'League jargon; "Konterpick" is not what German players say, and ' +
            'dh_wLabel_matchup already ships "Matchup / Counter"',
    ],
]

const COMPLETION_PACK_IDENTICAL_KEYS = new Set(
    COMPLETION_PACK_IDENTICAL_BY_DESIGN.map(([key]) => key),
)

/**
 * The six `aria-label` sites the pack fixed, as `[file relative to src/, key,
 * what the label names]`.
 *
 * Every one of these held a string literal until 0.6.0 and five of them were in
 * ARIA_LABEL_LITERALS as known issues; the sixth, App.tsx, was outside the old
 * scan's scope entirely and was named only in a comment. The list now serves
 * the opposite purpose: it is what section 3 walks to prove each attribute is
 * still THERE, because "hands aria-label no string literal" is also satisfied
 * by deleting it.
 *
 * HISTORY, because this block used to describe a gap and the gap is closed:
 * when this pack landed, THREE of these six sat on a plain
 * `<div className="role-filter-tabs">` - DraftFlowPanel,
 * RecommendationSideToggle and ScoreWeightPanel - with a fourth such div
 * predating it (PatchWeightPanel.tsx, dh_pPresetsAriaLabel, from 0.5.6). An
 * `aria-label` on an element that maps to role `generic` is PROHIBITED by
 * ARIA 1.2 and dropped by every current browser, so all four were inert:
 * translating them removed a wrong-language string without making the label
 * audible. The other three DID work: App.tsx is a <nav> (role navigation),
 * ChampionDetail and ChampionCombobox are <button>s.
 *
 * 0.6.3 CARRIED OUT THE FOLLOW-UP this note prescribed. All four divs now
 * carry a role, so all four labels are exposed, and RecommendationSideToggle
 * became a role="radiogroup" with role="radio" options and aria-checked - not
 * the blanket role="group" the naive fix would have used, which would have
 * announced the group without announcing which side is active. The semantics
 * themselves are pinned in tests/a11ySemantics.test.ts; this file keeps owning
 * the LABELS, and the two must not start asserting the same thing.
 *
 * WHAT IS STILL OPEN, and belongs in a future pack rather than here: the two
 * radios render `Blue Side` / `Red Side` as bare English literals, so the
 * accessible name of each option is untranslated in the German build; the
 * group is named twice, once by aria-label and once by a visible span, where
 * aria-labelledby on the span would be strictly better; and three larger
 * exclusive choosers (ChampionPoolPanel, RoleStatsTable, RoleMatchupTable)
 * still have no group role, no name and no checked state at all.
 */
const ARIA_LABEL_SITES: ReadonlyArray<readonly [file: string, key: string, what: string]> = [
    [APP_ENTRY, "app_navAriaLabel", "the top-level tab nav; was German, and outside the old scan"],
    ["components/ChampionDetail.tsx", "cd_close", "the modal close button; was English"],
    ["components/common/ChampionCombobox.tsx", "common_clear", "the clear-input button; was English"],
    [
        "components/draft/DraftFlowPanel.tsx",
        "dh_flowControlsAriaLabel",
        "the draft flow controls; was the German compound `Draft-Flow`",
    ],
    [
        "components/draft/RecommendationSideToggle.tsx",
        "dh_recoSideAriaLabel",
        "the recommendation side toggle; was the German `Empfehlungsseite`",
    ],
    [
        "components/draft/ScoreWeightPanel.tsx",
        "dh_wPresetsAriaLabel",
        "the weighting presets; was the German `Wichtungs-Presets`",
    ],
]

/**
 * FIVE of the six subtitle labels under each recommendation - the ones the line
 * still renders as a bare `t()` call.
 *
 * All five are REUSED `dh_recoTable*` keys, which is the interesting part: each
 * one also names a `<th>` in the same file, so a pin that merely looks for
 * `t("dh_recoTableTotal")` in DraftHelper.tsx is satisfied by the header row
 * and would stay green if the whole subtitle were deleted. Section 4b therefore
 * strips the `<th>` elements out before it looks.
 *
 * `dh_recoTablePicks` USED TO BE THE SIXTH ENTRY and was removed from this list
 * in 0.6.1 - not because the label went away, but because it stopped being a
 * label at this call site. The subtitle wrote `{entry.games}
 * {t("dh_recoTablePicks")}`, i.e. a number in front of a table-header key, and
 * a one-pick champion read "1 Picks". The count now comes from
 * `formatDraftPicksCount()`, which selects between two keys, so the sixth label
 * is pinned as {@link RECO_SUBTITLE_PICKS_CALL_PATTERN} instead of as a key.
 *
 * Removing it here is only half the change. Section 7 holds the other half: the
 * key must appear in DraftHelper.tsx ONLY inside a `<th>` from now on, so
 * dropping it from this list cannot quietly permit the old shape to return.
 */
const RECO_SUBTITLE_KEYS: readonly string[] = [
    "dh_recoTableTotal",
    "dh_recoTablePool",
    "dh_recoTableRoleStrength",
    "dh_recoTableSynergy",
    "dh_recoTableMatchup",
]

/**
 * The sixth subtitle label: a `formatDraftPicksCount(…)` call, in JSX braces,
 * whose FIRST ARGUMENT IS `t`. Section 4b applies it to the body with the `<th>`
 * elements stripped out, so "not inside a header cell" is part of the rule
 * without being part of the regex.
 *
 * WHY THIS IS A SHAPE AND NOT THE EXACT CALL ANY MORE - decided in 0.6.2, after
 * the second breakage in two versions.
 *
 * It used to read `"formatDraftPicksCount(t, entry.games)"`, a literal string
 * naming the whole argument list. 0.6.2 added a third parameter so the picks
 * count groups its thousands like the games count beside it, and five
 * assertions in this file went red - not because anything regressed, but
 * because a pin that spells out every argument cannot survive a signature
 * change of any kind, improvements included. 0.6.1 had already paid the same
 * toll on `\{entry\.games\}\s*\{t\("dh_recoTablePicks"\)\}`. Twice is a pattern,
 * and this file already records the lesson in another voice: "a guard that
 * forbids reasonable refactors is a guard somebody eventually deletes".
 *
 * WHAT THE LOOSENED PIN STILL CATCHES, which is everything it was ever for:
 *
 *  - the call being DELETED. The pattern matches nothing, section 4b goes red,
 *    and each section 6 probe trips its own did-anything-change guard,
 *  - a REVERT TO RAW JSX (`{entry.games} {t("dh_recoTablePicks")}`) or to a
 *    spliced suffix. Neither is a call to this helper, so neither matches -
 *    proven on synthetic sources in section 5 and on the real file in section 6,
 *  - the helper being swapped for something that is not fed the component's
 *    `t`. `formatDraftPicksCount(translate, …)` does not match, and that is
 *    deliberate: `t` is what carries the language switch.
 *
 * WHAT IT NO LONGER CATCHES, stated plainly rather than left to be discovered:
 * a change to WHICH value is counted, e.g. `entry.games` becoming
 * `entry.picks`. That was never a real protection - this file cannot see what
 * renders (see the module header) - and the argument that does matter is pinned
 * by name instead: section 7 asserts `lang` is passed, which says WHY it must
 * be there. One named requirement beats one opaque spelling.
 *
 * Still pinned as a CALL rather than as "the file mentions
 * formatDraftPicksCount somewhere", because the import statement mentions it
 * too - and an import with no call site is precisely what a deleted subtitle
 * looks like.
 */
const RECO_SUBTITLE_PICKS_CALL_PATTERN =
    /\{\s*formatDraftPicksCount\(\s*t\s*,(?:[^()]|\([^()]*\))*\)\s*\}/

/**
 * The same shape in prose, for failure messages.
 *
 * The `…` is load-bearing: it makes the constant impossible to misuse as a
 * literal needle. `body.includes(RECO_SUBTITLE_PICKS_CALL_SHAPE)` can never be
 * true of real source, so the next person reaching for the old
 * `.toContain(…)` form finds out immediately instead of pinning a spelling
 * again.
 */
const RECO_SUBTITLE_PICKS_CALL_SHAPE = "{formatDraftPicksCount(t, …)}"

/**
 * Every `{formatDraftPicksCount(t, …)}` in `source`, whitespace-collapsed.
 *
 * Derived from {@link RECO_SUBTITLE_PICKS_CALL_PATTERN} rather than written out
 * a second time, so the two cannot drift.
 *
 * THE `g` FLAG LIVES HERE AND NOT ON THE PATTERN, deliberately. The pattern is
 * also handed to `.replace()` by the section 6 probes, where first-match is
 * what they want, and it is the obvious thing to reach for with
 * `expect(…).toMatch(re)` - which calls `re.test()`. A global regex carries
 * `lastIndex` from one `.test()` to the next, so it would answer differently
 * depending on what ran before it: a test that passes alone and fails in a
 * suite, which is the worst failure mode a guard can have.
 */
const picksCountCalls = (source: string): string[] =>
    [...source.matchAll(new RegExp(RECO_SUBTITLE_PICKS_CALL_PATTERN.source, "g"))].map((match) =>
        match[0].replace(/\s+/g, " "),
    )

/**
 * The two literals that used to be welded into that subtitle. A German user
 * read "Mid · Score 0.82 · 41 Picks" in an otherwise translated line.
 *
 * Kept as markers rather than as a text-run scan for the reason the old pin
 * recorded: the trailing `Picks` ended its JSX line, and jsxTextRuns() needs a
 * following `<` or `{` to close a run, so the run scan could never see it.
 */
const FORMER_SUBTITLE_LITERALS = ["· Score ", "} Picks"] as const

/** The table whose Draft Priority heading the pack translated, under src/components/. */
const CHAMPION_STATS_TABLE = "ChampionStatsTable.tsx"

/* ==========================================================================
 * The counted nouns 0.6.1 minted, and the shapes it banned
 * ========================================================================== */

/**
 * The four keys, with the exact copy that was agreed - written out rather than
 * read from the catalogue, for the same reason as every other list here.
 *
 * BOTH HALVES CARRY `{count}`, THE SINGULAR INCLUDED. That is not redundancy
 * and it is not an oversight waiting to be tidied: baking the "1" into
 * `dh_gamesCountOne` would break the DE/EN placeholder parity that
 * tests/i18nScoutCopy.test.ts checks over every key, and it would hide the
 * number from whoever rewords the string next. src/i18n/plural.ts states the
 * same rule at the point where the key is chosen; this list is where it is
 * checked against the actual text.
 *
 * These are the FIRST `dh_` keys in this file's remit that carry a placeholder
 * at all, which is why they are their own list rather than an addition to
 * NEW_KEYS, RECO_TABLE_KEYS or COMPLETION_PACK_KEYS - each of those is looped
 * by a "carries no {placeholder}" assertion that these four are meant to fail.
 * See COUNTED_NOUN_FREE_LISTS below, which asserts they stay off all three.
 */
const COUNTED_NOUN_KEYS: ReadonlyArray<readonly [key: string, dePrompt: string, enPrompt: string]> =
    [
        ["dh_gamesCountOne", "{count} Game", "{count} game"],
        ["dh_gamesCountMany", "{count} Games", "{count} games"],
        ["dh_picksCountOne", "{count} Pick", "{count} pick"],
        ["dh_picksCountMany", "{count} Picks", "{count} picks"],
    ]

/** The two pairs, so a half-added pair is a failure rather than a silent gap. */
const COUNTED_NOUN_PAIRS: ReadonlyArray<readonly [what: string, one: string, many: string]> = [
    ["games", "dh_gamesCountOne", "dh_gamesCountMany"],
    ["picks", "dh_picksCountOne", "dh_picksCountMany"],
]

/**
 * The three key lists in this file that a "carries no {placeholder}" assertion
 * loops over. The four counted nouns must stay OFF all of them.
 *
 * Stated as an assertion rather than left to luck. Adding `dh_picksCountMany`
 * to COMPLETION_PACK_KEYS looks like tidying - it is a Draft Helper key, and
 * that list is where Draft Helper keys go - and it would turn a correct
 * placeholder into a test failure whose message says the opposite of the truth
 * ("nothing substitutes one here, so it would render literally"). The next
 * person would then be one keystroke away from deleting the `{count}`.
 */
const COUNTED_NOUN_FREE_LISTS: ReadonlyArray<readonly [name: string, keys: readonly string[]]> = [
    ["NEW_KEYS", NEW_KEYS.map(([key]) => key)],
    ["RECO_TABLE_KEYS", RECO_TABLE_KEYS.map(([key]) => key)],
    ["RECO_TABLE_HEADER_KEYS", RECO_TABLE_HEADER_KEYS],
    ["COMPLETION_PACK_KEYS", COMPLETION_PACK_KEYS.map(([key]) => key)],
]

/**
 * `src/components/draft/draftUiHelpers.ts`, relative to `src/components/`, and
 * the two helpers it owns with the files that must call each of them.
 *
 * The callers are named because "the helper exists" is not the fix. A helper
 * nobody calls is a dead export, and the call sites are the thing that stopped
 * rendering "1 Picks". PatchWeightPanel is on the games list and NOT on the
 * picks list on purpose: it renders a match count per patch and has no picks.
 *
 * NEITHER HELPER'S ARITY WAS PINNED ANYWHERE until 0.6.2, and that gap is what
 * made the third parameter a silent change. `formatDraftPicksCount` gained a
 * `lang` so it could group its thousands like the games count beside it; the
 * only thing that would have objected to dropping the argument again was tsc,
 * and tsc says "expected 3 arguments" without saying that a German user would
 * read `1234 Picks` under a line that reads `1.234 Games`. Both helpers are now
 * asserted to DECLARE a `lang: Lang` parameter and every caller to PASS one -
 * the property, not the spelling, so a fourth parameter or a reordering would
 * not go red.
 */
const DRAFT_UI_HELPERS = "draft/draftUiHelpers.ts"

const COUNT_HELPERS: ReadonlyArray<readonly [name: string, callers: readonly string[]]> = [
    ["formatDraftGamesCount", [DRAFT_HELPER, PATCH_WEIGHT_PANEL]],
    ["formatDraftPicksCount", [DRAFT_HELPER]],
]

/**
 * The key that was DELETED in 0.6.1, and must not come back.
 *
 * `dh_games` was a bare noun label with four call sites, every one of them a
 * count. Once those moved to the two-key pairs it had no use left, so it was
 * removed from both catalogues rather than kept around -
 * a spare plural noun sitting in the catalogue is an invitation to write
 * `{n} {t("dh_games")}` again, and that is exactly how it was used before.
 *
 * The scan for it runs over ALL of `src/` (the catalogues included) and over
 * comment-stripped source, because src/components/draft/draftUiHelpers.ts
 * mentions the name three times in its own prose while explaining why it is
 * gone. Failing on the explanation would teach the next person to delete the
 * explanation.
 */
const DELETED_GAMES_KEY = "dh_games"

/**
 * The keys that name a bare noun and must therefore never sit behind a number.
 *
 * `dh_recoTablePicks` SURVIVES as a column heading and is pinned as one in
 * sections 1 and 4 - it is `<th>` number eight, it is on the loanword list, and
 * nothing about 0.6.1 touched that. What it may not do is be borrowed for a
 * count again. `dh_games` is on the list too even though it no longer exists:
 * belt and braces, so a reintroduction that is ALSO used in the banned shape
 * fails on both rules rather than on whichever one is checked first.
 */
const NOUN_LABEL_KEYS: readonly string[] = ["dh_recoTablePicks", DELETED_GAMES_KEY]

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

    it("walks all of src/, App.tsx included, for the widened aria-label scan", () => {
        // THIS IS THE ANTI-VACUITY THAT REPLACED THE ARIA COUNT PIN. Until
        // 0.6.0, section 3 proved it had not gone blind by asserting the number
        // of known violators it found. There are no violators left, so `0 === 0`
        // was all that assertion had to say and it was deleted. What is left to
        // protect is the scan's REACH: a mis-globbed walk reads nothing, finds
        // nothing, and reports a clean tree.
        //
        // App.tsx by name, not just a count, because the count would still be
        // comfortably over the floor with the whole of src/ minus App.tsx - and
        // App.tsx is the exact file the old `src/components/**` scope missed.
        const files = srcFiles()

        expect(
            files.length,
            "the src/ walk found almost no TypeScript files. Every aria-label assertion in " +
                "section 3 became vacuous at the same moment.",
        ).toBeGreaterThan(100)
        expect(
            files,
            `${APP_ENTRY} is missing from the src/ walk. It is the file the old ` +
                "src/components/** scope could not see, and widening the scope to reach it is " +
                "the point of this scan.",
        ).toContain(APP_ENTRY)

        for (const [file] of ARIA_LABEL_SITES) {
            expect(
                files,
                `${file} carries one of the six accessible names this pack fixed, and the walk ` +
                    "no longer reaches it. It was renamed or moved; update ARIA_LABEL_SITES.",
            ).toContain(file)
        }

        expect(
            srcCode(APP_ENTRY).length,
            `${APP_ENTRY} came back empty after comment stripping`,
        ).toBeGreaterThan(500)
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

describe("the 0.6.0 completion-pack keys are in both catalogues", () => {
    it("still names every key of the pack that this file owns", () => {
        // Every assertion below is a loop over COMPLETION_PACK_KEYS, so an
        // emptied list turns five tests green at once. The pack minted twenty
        // keys; nineteen are here and `dh_noPatchData` is the twentieth, owned
        // by the patch-window helper's own guard file. Five of the nineteen
        // (dh_wPreset_*) were added after a copy review found the score-weight
        // panel still rendering its preset labels from src/draft/constants.ts,
        // i.e. five English words in the German build, inside the very div this
        // pack had just given a translated aria-label.
        expect(
            COMPLETION_PACK_KEYS.map(([key]) => key),
            "COMPLETION_PACK_KEYS no longer holds the nineteen keys this file pins. If a key was " +
                "genuinely dropped from the catalogues, delete its call site in the same change - " +
                "the dead-key check below will not notice a key that is not on this list.",
        ).toHaveLength(19)
    })

    it("holds the exact agreed value in de.ts and en.ts", () => {
        for (const [key, dePrompt, enPrompt] of COMPLETION_PACK_KEYS) {
            expect(DE[key], `de.ts has no ${key}`).toBe(dePrompt)
            expect(EN[key], `en.ts has no ${key}`).toBe(enPrompt)
        }
    })

    it("is present in both catalogues, in both directions", () => {
        const keys = COMPLETION_PACK_KEYS.map(([key]) => key)
        const onlyInDe = keysMissingFrom(keys, DE, EN)
        const onlyInEn = keysMissingFrom(keys, EN, DE)

        expect(onlyInDe, `in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
    })

    it("carries no {placeholder} - every one is a whole-word label", () => {
        // There is no app-wide substitution layer and no guard that a
        // placeholder was ever filled, so a `{…}` in any of these ships to the
        // screen as a hole in the label. On the four accessible names it would
        // ship as a hole nobody can see: a screen reader would read the braces
        // out and no sighted reviewer would ever notice.
        for (const [lang, dict] of LANGS) {
            for (const [key] of COMPLETION_PACK_KEYS) {
                expect(
                    placeholdersOf(dict[key] ?? ""),
                    `${lang}.${key} carries a placeholder: "${dict[key]}". Nothing substitutes ` +
                        "one here, so it would render literally.",
                ).toEqual([])
            }
        }
    })

    it("says something different in DE and EN, apart from the one loanword", () => {
        // Fifteen keys added to two files in one sitting is exactly where the
        // German text ends up in the English catalogue, and tsc cannot see it.
        // `dh_statBans` genuinely reads the same in both, so it is named rather
        // than the check being loosened for all fourteen.
        const translated = COMPLETION_PACK_KEYS.filter(
            ([key]) => !COMPLETION_PACK_IDENTICAL_KEYS.has(key),
        )
        const identical = translated.filter(([key]) => sameSentence(DE[key] ?? "", EN[key] ?? ""))

        expect(
            translated.length,
            "COMPLETION_PACK_IDENTICAL_BY_DESIGN now covers every completion-pack key, so this " +
                "check compares nothing at all. Either a real translation was reverted or the " +
                "list has grown past what it was for.",
        ).toBe(COMPLETION_PACK_KEYS.length - COMPLETION_PACK_IDENTICAL_BY_DESIGN.length)
        expect(
            identical.map(([key]) => `${key}: both say "${EN[key]}"`),
            "these keys hold the same sentence in both catalogues and are not on the loanword " +
                "list, which means one was pasted into the other. Translate the German one.",
        ).toEqual([])
    })

    it("still reads identically in both catalogues for exactly that loanword", () => {
        // The other half of the exemption, and the half that makes it honest -
        // the same two-way rot check IDENTICAL_BY_DESIGN carries. An entry that
        // HAS been translated must leave the list, or the exemption outlives its
        // reason and silently covers the next paste-in.
        for (const [key, why] of COMPLETION_PACK_IDENTICAL_BY_DESIGN) {
            expect(
                COMPLETION_PACK_KEYS.map(([entry]) => entry),
                `COMPLETION_PACK_IDENTICAL_BY_DESIGN lists ${key}, which is not a ` +
                    "completion-pack key.",
            ).toContain(key)
            expect(
                sameSentence(DE[key] ?? "", EN[key] ?? ""),
                `COMPLETION_PACK_IDENTICAL_BY_DESIGN says ${key} is a loanword (${why}), but ` +
                    `de.ts says "${DE[key]}" and en.ts says "${EN[key]}". If that is a deliberate ` +
                    "translation, delete the entry; the DE/EN difference check will then cover it.",
            ).toBe(true)
        }
    })

    it("is referenced from src/ outside src/i18n/, so none is dead", () => {
        const { files, text } = srcOutsideI18n()

        expect(files.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no dh_ reference at all").toContain("dh_patchWeightTitle")

        const unreferenced = COMPLETION_PACK_KEYS.map(([key]) => key).filter(
            (key) => !text.includes(key),
        )

        expect(
            unreferenced,
            `these keys are in the catalogues but nowhere in src/: ${unreferenced.join(", ")}\n` +
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
 * The `aria-label` string literals that are tolerated anywhere under `src/`.
 *
 * IT IS EMPTY, AND THAT IS THE ASSERTION. Until 0.6.0 this held five entries -
 * `ChampionDetail.tsx` "Close", `common/ChampionCombobox.tsx` "Clear",
 * `draft/DraftFlowPanel.tsx` "Draft-Flow", `draft/RecommendationSideToggle.tsx`
 * "Empfehlungsseite", `draft/ScoreWeightPanel.tsx` "Wichtungs-Presets" - each
 * announced to a screen reader in whatever language it happened to be typed in,
 * three of them German for every English user. A sixth,
 * `src/App.tsx` "Ansichten", was not even on the list: the scan stopped at
 * `src/components/**` and App.tsx sits one directory above it, so the old
 * comment here could only NAME it as uncovered.
 *
 * The completion pack fixed all six and widened the scan, so the list emptied
 * and the scope grew in the same change - which is the only safe order. Fixing
 * App.tsx without widening the scan would have left the next App.tsx literal
 * unguarded; widening the scan without fixing it would have gone red on a
 * defect nobody had signed up to fix that day.
 *
 * THE RULE: this list may shrink, never grow. Adding an entry is not how a new
 * hardcoded `aria-label` gets merged - translating it is. The check below
 * asserts it is still empty for exactly that reason, so re-opening the
 * exemption mechanism has to be a deliberate, visible act.
 *
 * Two assertions that used to live here are GONE rather than kept: the rot
 * check that every entry still had its literal, and the pin on how many
 * violators the scan found. With an empty list the first loops zero times and
 * the second asserts `0 === 0` - two green tests that prove nothing at all. The
 * work they did is now done by the src/ walk in section 0 and by the six
 * per-site anti-deletion pins below.
 */
const ARIA_LABEL_LITERALS: ReadonlyArray<readonly [file: string, label: string, why: string]> = []

const ARIA_ALLOWLIST = new Map(ARIA_LABEL_LITERALS.map(([file, label]) => [file, label]))

/**
 * Every file the aria-label rule looks at, with the string literals found in
 * it - violators and clean files alike.
 *
 * WHY THE CLEAN FILES ARE RETURNED TOO: there are no violators left, so a scan
 * narrowed back to `src/components/**` would report exactly the same empty
 * result as the correct one and nothing would go red. Returning the whole
 * scanned set lets the test assert the scan's REACH through the same function
 * the violator check uses, rather than through a second walk that could drift
 * away from it.
 */
const ariaLabelScan = (): ReadonlyArray<readonly [file: string, labels: string[]]> =>
    srcFiles().map((rel) => [rel, ariaLabelLiterals(srcCode(rel))] as const)

/** Every file under `src/` that hands `aria-label` a string literal, with its labels. */
const ariaLabelOffenders = (): ReadonlyArray<readonly [file: string, labels: string[]]> =>
    ariaLabelScan().filter(([, labels]) => labels.length > 0)

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

describe("nothing in src/ hands aria-label a string literal", () => {
    it("actually looks at every .ts/.tsx under src/, App.tsx included", () => {
        // THE SCOPE PIN, and it has to go through ariaLabelScan() rather than
        // through srcFiles() directly. With zero violators left, narrowing the
        // scan back to `src/components/**` produces the identical empty result
        // and nothing else in this section would notice - so the thing to assert
        // is what the scan READ, not what it found.
        const scanned = ariaLabelScan().map(([file]) => file)

        expect(
            scanned.length,
            "the aria-label scan reads almost no files. Every assertion in this section became " +
                "vacuous at the same moment.",
        ).toBeGreaterThan(100)
        expect(
            scanned,
            `the aria-label scan no longer reads ${APP_ENTRY}. That is the file the pre-0.6.0 ` +
                "src/components/** scope could not see, and it carried a German aria-label for " +
                "as long as the scan stopped one directory short. Do not narrow this back.",
        ).toContain(APP_ENTRY)
        for (const [file] of ARIA_LABEL_SITES) {
            expect(scanned, `the aria-label scan no longer reads ${file}`).toContain(file)
        }
    })

    it("has no violator anywhere under src/", () => {
        const unexpected = ariaLabelOffenders()
            .filter(([file]) => !ARIA_ALLOWLIST.has(file))
            .map(([file, labels]) => `${file}: ${labels.map((l) => `"${l}"`).join(", ")}`)

        expect(
            unexpected,
            `these files hand aria-label a string literal:\n${unexpected.join("\n")}\n` +
                'Use an expression: aria-label={t("some_key")}. An aria-label is untranslated by ' +
                "construction and a screen reader is the one place nobody notices, which is why " +
                "this rule covers every .ts/.tsx under src/ rather than the directory that " +
                "happened to be in scope on the day it was written.\n" +
                "ARIA_LABEL_LITERALS is empty and is meant to stay empty. Adding an entry is not " +
                "how a hardcoded label gets merged.",
        ).toEqual([])
    })

    it("keeps the exemption list empty", () => {
        // Not a tautology, and not the deleted count pin in disguise. The count
        // pin said "the scan found N violators" and became `0 === 0`; this says
        // "no file is exempt from being scanned", which stays a real statement
        // however many violators exist. Six literals were fixed to get here, and
        // an allowlist is the cheapest way to put one back without anyone
        // noticing - so re-opening it has to fail loudly first.
        expect(
            ARIA_LABEL_LITERALS.map(([file, label]) => `${file}: "${label}"`),
            "ARIA_LABEL_LITERALS has entries again. Every aria-label under src/ goes through " +
                "t(); if one cannot, that is a conversation, not an allowlist entry. Deleting " +
                "this assertion to add one is the failure mode it exists to make visible.",
        ).toEqual([])
    })

    it("still labels all six of the sites the pack fixed, through t()", () => {
        // THE ANTI-DELETION HALF, and the reason the rule is never asserted on
        // its own. "Hands aria-label no string literal" is satisfied perfectly by
        // deleting the attribute, which leaves the control with no accessible
        // name at all - strictly worse for the one user this whole section is
        // for, and completely invisible on screen. Six literals were removed in
        // one change; without this, six deletions would have been just as green.
        //
        // Tolerant about HOW the key gets there: inline, or hoisted into a local
        // const one line earlier. See ariaLabelUsesKey().
        //
        // The count first, because everything below it is a loop: emptying
        // ARIA_LABEL_SITES would turn this test green while removing every
        // protection it provides - the same failure the deleted rot check and
        // count pin ran into from the other direction.
        expect(
            ARIA_LABEL_SITES.map(([file]) => file),
            "ARIA_LABEL_SITES no longer names the six sites the pack fixed, so the loop below " +
                "protects fewer of them than it claims. Removing a site is only correct if the " +
                "element itself is gone.",
        ).toHaveLength(6)

        for (const [file, key, what] of ARIA_LABEL_SITES) {
            const source = srcCode(file)

            expect(
                ariaLabelExpressions(source).length,
                `${file} no longer has an aria-label at all (it labelled ${what}). Deleting the ` +
                    "attribute is not the fix for a hardcoded one - it trades a wrong-language " +
                    "name for no name.",
            ).toBeGreaterThan(0)

            expect(
                ariaLabelUsesKey(source, key),
                `${file} has an aria-label, but none of them resolves to t("${key}") - the key ` +
                    `minted for ${what}. Write it inline as aria-label={t("${key}")}, or hoist ` +
                    "it into a local const on one line and pass that const.",
            ).toBe(true)
        }
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
 * 4b. The recommendation subtitle, which used to be pinned as broken
 *
 * Until 0.6.0 this section asserted that `· Score ` and `} Picks` were STILL
 * hardcoded in DraftHelper.tsx. It was a known-issues pin, held at its current
 * extent so the line could not be copied into a second place while somebody got
 * around to it, and its own failure message said what to do on the day it went
 * red: "If you translated the recommendation subtitle, delete this assertion."
 *
 * 0.6.0 translated it. The assertion was turned around rather than deleted, for
 * the same reason the 0.5.6 pins were: a pin simply removed on the day it is
 * satisfied leaves nothing behind that remembers the line was ever wrong, and
 * the next person to add a value to that subtitle has no reason not to type its
 * label straight into the JSX next to it.
 *
 * The subtitle reuses six existing `dh_recoTable*` keys rather than minting six
 * more, which is right - it labels the same six quantities the table columns do
 * - and is also what makes a naive pin useless here. See below.
 * ========================================================================== */

describe("the recommendation subtitle comes from the catalogue", () => {
    it("no longer writes the 'Score …' / '… Picks' literals", () => {
        // The direct form of the bug:
        //
        //   {ROLE_LABELS[entry.role]} · Score {formatScore(…)} · {entry.games} Picks
        //
        // Two English words welded into a JSX line that otherwise renders
        // translated values, so a German user read "Mid · Score 0.82 · 41 Picks".
        //
        // Checked as markers rather than through jsxTextRuns() for the reason
        // the old pin recorded: the trailing `Picks` ended its line, and a
        // per-line run needs a following `<` or `{` to close, so the run scan
        // never saw it. A guard that cannot see half of what it guards is worse
        // than none.
        const source = code(DRAFT_HELPER)

        const reintroduced = FORMER_SUBTITLE_LITERALS.filter((marker) => source.includes(marker))

        expect(
            reintroduced,
            `these subtitle literals are back in ${DRAFT_HELPER}: ${reintroduced.join(", ")}\n` +
                "They became t(\"dh_recoTableTotal\") and t(\"dh_recoTablePicks\") in 0.6.0. Words " +
                "typed into JSX cannot follow the language switch, and this line renders " +
                "translated values on either side of them.",
        ).toEqual([])
    })

    it("renders all six subtitle labels outside the header row: five keys and one count", () => {
        // ANTI-VACUITY, and it needs more care here than anywhere else in this
        // file. "The literals are gone" is satisfied by deleting the subtitle -
        // and the obvious pin against that, "the file contains
        // t(\"dh_recoTableTotal\")", is satisfied by the HEADER ROW, because all
        // six of these labels also name a <th> a few hundred lines further down.
        // So the header cells are stripped out before looking.
        //
        // What survives the strip is the subtitle itself (`· {t(…)} {formatScore
        // (…)}`) and the score-detail line below it (`${t(…)} ${formatScore
        // Percent(…)}`), which is exactly the copy this section owns.
        //
        // FIVE KEYS AND ONE COUNT since 0.6.1. The sixth label was
        // `{entry.games} {t("dh_recoTablePicks")}` - a number in front of a
        // header key, which read "1 Picks" for a one-pick champion - and it is
        // now a call to formatDraftPicksCount(t, entry.games, lang). Section 7
        // owns the rule that the key itself may no longer appear outside a
        // <th>, and the rule that the call is handed the active language; this
        // half owns the opposite question, which is whether the label is still
        // rendered at all.
        const body = withoutHeaderCells(code(DRAFT_HELPER))

        // The count first: this is a filter, and an emptied RECO_SUBTITLE_KEYS
        // would pass it without checking anything.
        expect(
            RECO_SUBTITLE_KEYS,
            "RECO_SUBTITLE_KEYS no longer holds the five key-rendered labels of the " +
                "recommendation subtitle. The sixth is the picks count and is pinned separately.",
        ).toHaveLength(5)

        const missing = RECO_SUBTITLE_KEYS.filter((key) => !body.includes(`t("${key}")`))

        expect(
            missing,
            `${DRAFT_HELPER} renders these keys in its <th> row but nowhere else: ` +
                `${missing.join(", ")}\n` +
                "They also label the subtitle under each recommendation. If that line was " +
                "removed, say so and update RECO_SUBTITLE_KEYS; if it was rewritten with the " +
                "words typed back in, the assertion above is the one that should have caught it.",
        ).toEqual([])

        // The sixth label, which is a counted noun rather than a key. A pin on
        // the CALL, not on the helper's name: the import line names it too, and
        // an import with no call site is what a deleted subtitle looks like.
        //
        // A pin on the call's SHAPE, not on its exact text - see
        // RECO_SUBTITLE_PICKS_CALL_PATTERN for why that changed in 0.6.2. The
        // short version: the literal form named every argument, so it went red
        // when the helper gained `lang`, which was an improvement rather than a
        // regression. What must not change is that a call is here at all and
        // that it is fed the component's `t`.
        expect(
            picksCountCalls(body),
            `${DRAFT_HELPER} no longer renders ${RECO_SUBTITLE_PICKS_CALL_SHAPE} outside its ` +
                "header row. That call IS the sixth subtitle label - it replaced " +
                '`{entry.games} {t("dh_recoTablePicks")}` in 0.6.1, which read "1 Picks" for a ' +
                "one-pick champion. If the count was dropped from the line, say so here; if it " +
                "was written back as a number in front of a header key, section 7 is the " +
                "assertion that should have caught it. Note this pin does NOT care what is " +
                "counted or how many arguments follow `t` - only that the call is here.",
        ).toHaveLength(1)

        // Anti-vacuity for the strip itself: if the regex ever ate the whole
        // file, `missing` would list all five and this test would fail loudly
        // rather than pass - but if it ate NOTHING, the test would be back to
        // being satisfied by the header row. So: the strip must actually remove
        // the header cells.
        expect(
            thChildren(body),
            "stripping the <th> elements out left some behind, so this check is back to being " +
                "satisfied by the header row alone.",
        ).toEqual([])
        expect(body.length, "stripping the <th> elements emptied the file").toBeGreaterThan(5000)
    })
})

/* ==========================================================================
 * 4c. ChampionStatsTable's Draft Priority heading
 *
 * The pack translated one heading in this table and deliberately left the other
 * six (`Champion`, `Picks`, `Bans`, `Pickrate`, `Banrate`, `Presence`,
 * `Winrate`) alone: they are the house convention across five sibling tables and
 * changing them is a separate, wider job.
 *
 * The reason it is guarded HERE rather than in a table-specific file is the
 * confidence column. `tbl_confidence` is the key six tables share, and section 1
 * already leans on this file still writing it as a literal substring.
 * ========================================================================== */

describe("ChampionStatsTable takes its Draft Priority heading from the catalogue", () => {
    it("renders tbl_draftPriority", () => {
        expect(
            code(CHAMPION_STATS_TABLE),
            `${CHAMPION_STATS_TABLE} no longer renders t("tbl_draftPriority"). The heading was ` +
                'the hardcoded English "Draft Priority" until 0.6.0; it must not go back.',
        ).toContain('t("tbl_draftPriority")')
    })

    it("still writes t(\"tbl_confidence\") as a literal substring", () => {
        // NOT redundant with the CONFIDENCE_COLUMN_SIBLINGS check in section 1 -
        // this states the coupling that check depends on. The sibling scan looks
        // for the exact text `t("tbl_confidence")`, so refactoring colBtn() to
        // take a TranslationKey and building the call from a variable would
        // break five assertions at once with a message about shared vocabulary
        // that says nothing about what actually changed. Left as its own
        // assertion so the next person reading that failure finds this note.
        expect(
            code(CHAMPION_STATS_TABLE),
            `${CHAMPION_STATS_TABLE} no longer contains the literal text t("tbl_confidence"). ` +
                "Five sibling tables are pinned on that exact substring in section 1; if the call " +
                "is now built from a variable, that scan has to be rewritten in the same change " +
                "rather than left to fail with a misleading message.",
        ).toContain('t("tbl_confidence")')
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

    it("catches a number written in front of a noun label, in all three spellings", () => {
        const key = "dh_recoTablePicks"

        expect(numberBeforeTranslationCall(`{entry.games} {t("${key}")}`, key)).toHaveLength(1)
        expect(numberBeforeTranslationCall("`${n} ${t(\"" + key + "\")}`", key)).toHaveLength(1)
        expect(numberBeforeTranslationCall(`41 {t("${key}")}`, key)).toHaveLength(1)
        // Reformatted across two lines, which a per-line scan would miss.
        expect(
            numberBeforeTranslationCall(`{entry.games}\n    {t("${key}")}`, key),
        ).toHaveLength(1)
        // Padding inside the call does not hide it either.
        expect(numberBeforeTranslationCall(`{n} { t( "${key}" ) }`, key)).toHaveLength(1)
    })

    it("does NOT fire on a caption, a header cell or the helper call", () => {
        const key = "dh_recoTablePicks"

        // A LABEL in front of a value is a caption, not a declined noun. This
        // is the shape dh_recoTableTotal uses in the very same subtitle, and a
        // rule that forbade it would be wrong rather than strict.
        expect(numberBeforeTranslationCall(`{t("${key}")} {formatScore(x)}`, key)).toEqual([])
        expect(numberBeforeTranslationCall(`<th>{t("${key}")}</th>`, key)).toEqual([])
        // Two adjacent header cells: the `</th><th>` between them is not
        // whitespace, so the pair is not the banned shape.
        expect(
            numberBeforeTranslationCall(
                `<th>{t("dh_recoTableMatchup")}</th>\n<th>{t("${key}")}</th>`,
                key,
            ),
        ).toEqual([])
        // The fix itself.
        expect(
            numberBeforeTranslationCall("{formatDraftPicksCount(t, entry.games, lang)}", key),
        ).toEqual([])
        // A different key is a different question.
        expect(numberBeforeTranslationCall(`{entry.games} {t("${key}")}`, "dh_games")).toEqual([])
    })

    it("recognises the picks call by shape, and still refuses a raw-JSX revert", () => {
        // THE FIXTURE THE LOOSENING OWES, and the reason it is safe to loosen.
        //
        // RECO_SUBTITLE_PICKS_CALL_PATTERN stopped naming the argument list in
        // 0.6.2 because a literal pin broke on two consecutive signature
        // changes, both of them improvements. The bargain only holds if the
        // shape still refuses everything the literal refused, so both halves
        // are spelled out here rather than argued for in prose.
        //
        // What it MUST match - the call as it is written today, as 0.6.1 wrote
        // it, reformatted, and with a nested call in the argument list:
        expect(picksCountCalls("· {formatDraftPicksCount(t, entry.games, lang)}")).toHaveLength(1)
        expect(picksCountCalls("{formatDraftPicksCount(t, entry.games)}")).toHaveLength(1)
        expect(picksCountCalls("{ formatDraftPicksCount( t , entry.games , lang ) }")).toHaveLength(
            1,
        )
        expect(picksCountCalls("{formatDraftPicksCount(t, countOf(entry), lang)}")).toHaveLength(1)

        // What it MUST NOT match. These are the three ways back, and the whole
        // point of keeping a pin here at all:
        //
        //  1. the raw JSX this replaced, which read "1 Picks",
        expect(picksCountCalls('{entry.games} {t("dh_recoTablePicks")}')).toEqual([])
        //  2. a suffix spliced onto the noun instead,
        expect(picksCountCalls('{`${entry.games} Pick${entry.games === 1 ? "" : "s"}`}')).toEqual([])
        //  3. the call deleted outright, or reduced to the import line.
        expect(picksCountCalls("import { formatDraftPicksCount } from './draftUiHelpers'")).toEqual(
            [],
        )
        expect(picksCountCalls("")).toEqual([])

        // The first argument must be `t`: that is what carries the language
        // switch, and a helper handed something else is not this call.
        expect(picksCountCalls("{formatDraftPicksCount(translate, entry.games, lang)}")).toEqual([])

        // The braces are part of the shape - a bare mention in prose or in a
        // type position is not a rendered call.
        expect(picksCountCalls("formatDraftPicksCount(t, entry.games, lang)")).toEqual([])
    })

    it("reads a call's arguments out, and sees a dropped lang", () => {
        // The predicate behind the 0.6.2 rule. It answers "what is passed",
        // which is the question a literal pin answered only by accident and
        // could not be asked about one argument at a time.
        expect(
            callArguments("{formatDraftPicksCount(t, entry.games, lang)}", "formatDraftPicksCount"),
        ).toEqual(["t, entry.games, lang"])
        // Reformatted across two lines, collapsed on the way out.
        expect(
            callArguments(
                "formatDraftGamesCount(\n    t,\n    summary.rawMatches,\n    lang,\n)",
                "formatDraftGamesCount",
            ),
        ).toEqual(["t, summary.rawMatches, lang,"])
        // One level of nesting stays one call rather than truncating.
        expect(
            callArguments("formatDraftPicksCount(t, countOf(entry), lang)", "formatDraftPicksCount"),
        ).toEqual(["t, countOf(entry), lang"])
        // Two calls on one line are two findings.
        expect(callArguments("f(t, a, lang) + f(t, b, lang)", "f")).toHaveLength(2)
        // The import line has no parentheses after the name, so it is not a call.
        expect(
            callArguments('import { formatDraftPicksCount } from "./x"', "formatDraftPicksCount"),
        ).toEqual([])

        // And the rule itself: the 0.6.2 mutation is a dropped third argument,
        // which every other assertion in this file survives.
        expect(
            callArguments("{formatDraftPicksCount(t, entry.games)}", "formatDraftPicksCount").filter(
                (args) => LANG_ARGUMENT.test(args),
            ),
        ).toEqual([])
        expect(LANG_ARGUMENT.test("t, entry.games, lang")).toBe(true)
        expect(LANG_ARGUMENT.test("t, entry.games")).toBe(false)
        // Tolerated on purpose: one hop to reach the language. Rejected: a
        // different word that merely starts the same way.
        expect(LANG_ARGUMENT.test("t, n, props.lang")).toBe(true)
        expect(LANG_ARGUMENT.test("t, n, language")).toBe(false)
    })

    it("catches a suffix-plural heuristic in both of its shapes", () => {
        // The noun with the expression spliced on.
        expect(suffixPluralHits("`${n} Pick${suffix}`")).toHaveLength(1)
        expect(suffixPluralHits("`${n} Games${suffix}`")).toHaveLength(1)
        expect(suffixPluralHits("`${n} game${suffix}`")).toHaveLength(1)
        // The ternary, in both orders, both quote styles, and with the German
        // "es" that actually shipped as "1 neue Match".
        expect(suffixPluralHits('n === 1 ? "" : "s"')).toHaveLength(1)
        expect(suffixPluralHits('n !== 1 ? "s" : ""')).toHaveLength(1)
        expect(suffixPluralHits("n === 1 ? '' : 'es'")).toHaveLength(1)
        // Both at once is two findings, which is what the real mutation looks
        // like: `Pick${n === 1 ? "" : "s"}`.
        expect(suffixPluralHits('`${n} Pick${n === 1 ? "" : "s"}`')).toHaveLength(2)
    })

    it("does NOT fire on a caption, a plural key or an ordinary ternary", () => {
        // A space between the noun and the value makes it a caption. A rule
        // that failed on this would be switched off within the week.
        expect(suffixPluralHits("`Picks ${n}`")).toEqual([])
        expect(suffixPluralHits("`${picks}${separator}`")).toEqual([])
        // The fix, and the keys it selects between.
        expect(suffixPluralHits("formatDraftPicksCount(t, entry.games, lang)")).toEqual([])
        expect(suffixPluralHits('t(pluralKey(count, { one: "dh_picksCountOne" }))')).toEqual([])
        // An ordinary ternary that picks between two real words is not this.
        expect(suffixPluralHits('cond ? "blue" : "red"')).toEqual([])
        expect(suffixPluralHits('cond ? "" : "muted"')).toEqual([])
    })

    it("refuses to read a longer key as the deleted one", () => {
        // THE WORD BOUNDARY, on its own, because the whole `dh_games` rule
        // rests on it: the four keys that replaced the deleted one all begin
        // with its name and live in the same file as the rule's own prose.
        expect(mentionsOfKey('const k = "dh_gamesCountOne"', "dh_games")).toEqual([])
        expect(mentionsOfKey('one: "dh_gamesCountMany",', "dh_gamesCountMany")).toHaveLength(1)
        expect(mentionsOfKey('{t("dh_games")}', "dh_games")).toHaveLength(1)
        expect(mentionsOfKey("dh_games: \"Games\",", "dh_games")).toHaveLength(1)
        // Context is returned, not just a count, so the failure says where.
        expect(mentionsOfKey('  {n} {t("dh_games")}  ', "dh_games")[0]).toBe('{n} {t("dh_games")}')
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

    it("reads an aria-label expression out, braces and all", () => {
        expect(ariaLabelExpressions('<nav aria-label={t("app_navAriaLabel")}>')).toEqual([
            't("app_navAriaLabel")',
        ])
        // A template literal's `${…}` must not truncate the expression.
        expect(ariaLabelExpressions('<i aria-label={`${t("dh_removeBan")} ${name}`} />')).toEqual([
            '`${t("dh_removeBan")} ${name}`',
        ])
        // Whitespace and two on one line.
        expect(
            ariaLabelExpressions("<a aria-label = { first } /><b aria-label={second} />"),
        ).toEqual(["first", "second"])
        // A string literal is not an expression - that is the other predicate's
        // job, and neither of them should answer for both.
        expect(ariaLabelExpressions('<button aria-label="Close" />')).toEqual([])
        expect(ariaLabelExpressions('<div aria-labelledby="x" />')).toEqual([])
    })

    it("catches a DELETED aria-label, and tolerates one hoisted into a const", () => {
        // The mutation the six per-site pins exist for. All three sources below
        // pass "hands aria-label no string literal" - only one of them actually
        // labels the nav.
        const inline = '<nav className="tab-nav" aria-label={t("app_navAriaLabel")}>'
        const hoisted = [
            '    const navLabel = t("app_navAriaLabel")',
            '    return <nav className="tab-nav" aria-label={navLabel}>',
        ].join("\n")
        const deleted = [
            '    const navLabel = t("app_navAriaLabel")',
            '    return <nav className="tab-nav">',
        ].join("\n")

        expect(ariaLabelUsesKey(inline, "app_navAriaLabel")).toBe(true)
        expect(ariaLabelUsesKey(hoisted, "app_navAriaLabel")).toBe(true)
        // The key is still in the file. The attribute is not, and that is the
        // whole point: a file-wide `includes(key)` would call this fixed.
        expect(deleted).toContain('t("app_navAriaLabel")')
        expect(ariaLabelExpressions(deleted)).toEqual([])
        expect(ariaLabelUsesKey(deleted, "app_navAriaLabel")).toBe(false)

        // A typed const still resolves; an unrelated const does not stand in.
        expect(
            ariaLabelUsesKey(
                'const label: string = t("cd_close")\n<button aria-label={label} />',
                "cd_close",
            ),
        ).toBe(true)
        const elsewhere = [
            'const tooltip = t("cd_close")',
            '<button title={tooltip} aria-label={t("common_clear")} />',
        ].join("\n")
        expect(ariaLabelUsesKey(elsewhere, "common_clear")).toBe(true)
        expect(ariaLabelUsesKey(elsewhere, "cd_close")).toBe(false)
    })

    it("does not let a URL in a string literal swallow the rest of its line", () => {
        // THE REAL VACUITY BUG THIS FILE CARRIED UNTIL 0.6.0, and the reason
        // the `(?<!:)` lookbehind went into stripComments(). The `//` of a
        // `https://` inside a string literal was read as the start of a line
        // comment, so everything written after it on that line was deleted
        // before a single predicate saw it - in the file with the widest scan
        // in the suite.
        const line = 'const HELP = "https://op.gg/champions"; <button aria-label="Clear" />'

        expect(stripComments(line)).toContain('aria-label="Clear"')
        expect(ariaLabelLiterals(stripComments(line))).toEqual(["Clear"])

        // The pre-0.6.0 stripper, so the fix is provably worth something rather
        // than asserted to be. This is the mutant.
        expect(NAIVE_STRIP_COMMENTS(line)).not.toContain("aria-label")
        expect(ariaLabelLiterals(NAIVE_STRIP_COMMENTS(line))).toEqual([])

        // It swallowed headings and header cells just as happily.
        const heading = 'const DOCS = "https://x.test"\n<h3>Draft Edge</h3>'
        expect(headingsWithBareText(stripComments(heading))).toHaveLength(1)
        const cell = 'const U = "https://x.test/a" // note\n<th>Winrate</th>'
        expect(elementsWithBareText(stripComments(cell), "th")).toHaveLength(1)

        // …and a REAL line comment is still removed, on its own line and after
        // code, while a single slash is not two.
        expect(stripComments('// <h3>Draft Edge</h3>\n')).not.toContain("Draft Edge")
        expect(stripComments('const a = 1 // aria-label="Close"\n')).not.toContain("aria-label")
        expect(stripComments('const label = "CS/min"')).toContain("CS/min")
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

/* ==========================================================================
 * 6. The same mutations, applied to the REAL files in memory
 *
 * Section 5 proves the predicates fire on synthetic strings. That is necessary
 * and it is not sufficient: a fixture is written to match the predicate, so a
 * predicate that has drifted away from what the real files look like can still
 * pass every fixture in the file. These probes read the actual sources, break
 * them the way a future edit plausibly would, and assert the guard notices.
 *
 * Nothing here writes to src/. The mutation happens to a string.
 *
 * A probe has its own vacuity problem - a `.replace()` whose pattern no longer
 * matches mutates nothing and then "proves" the guard fires on an unmodified
 * file. Every probe below therefore asserts that the mutation CHANGED something
 * before asserting anything about the guard.
 * ========================================================================== */

describe("the guards go red on mutated copies of the real files", () => {
    it("notices when a real aria-label attribute is deleted outright", () => {
        // The mutation the six per-site pins exist for, and the one a
        // "no string literal" rule invites: removing the attribute instead of
        // translating it. Applied to each of the six real files in turn.
        for (const [file, key, what] of ARIA_LABEL_SITES) {
            const source = srcCode(file)
            const mutant = source.replace(/\baria-label\s*=\s*\{[^{}]*\}/g, " ")

            expect(mutant, `no aria-label attribute was found to delete in ${file}`).not.toBe(
                source,
            )
            expect(
                ariaLabelUsesKey(source, key),
                `${file} should label ${what} with ${key} before the mutation`,
            ).toBe(true)
            expect(
                ariaLabelUsesKey(mutant, key),
                `deleting every aria-label from ${file} left the per-site pin green. The pin is ` +
                    "not protecting the attribute.",
            ).toBe(false)
            // And the literal rule stays quiet on the mutant, which is exactly
            // why the two are always asserted together.
            expect(ariaLabelLiterals(mutant)).toEqual([])
        }
    })

    it("notices a real aria-label turned back into a German string literal", () => {
        // The original defect, restored in App.tsx - and App.tsx is the file the
        // pre-0.6.0 `src/components/**` scope could not reach, so this probe is
        // also what the widening bought.
        const source = readSrc(APP_ENTRY)
        const mutant = source.replace(
            /aria-label=\{t\("app_navAriaLabel"\)\}/,
            'aria-label="Ansichten"',
        )

        expect(mutant, `${APP_ENTRY} no longer writes aria-label={t("app_navAriaLabel")}`).not.toBe(
            source,
        )
        expect(ariaLabelLiterals(stripComments(mutant))).toContain("Ansichten")
        expect(ariaLabelLiterals(stripComments(source))).toEqual([])

        // The scope, stated as the two file lists rather than as prose.
        expect(
            componentFiles(),
            `${APP_ENTRY} is somehow inside src/components/ now, which would make the widening ` +
                "unnecessary rather than wrong - but the comments above need updating.",
        ).not.toContain(APP_ENTRY)
        expect(srcFiles()).toContain(APP_ENTRY)
    })

    it("notices a URL swallowing a real violator on the same line", () => {
        // Both defects at once, which is how this one would actually arrive: a
        // source line that holds a link AND a label. Under the pre-0.6.0
        // stripper the whole line vanished and the scan reported a clean file.
        const source = readSrc(APP_ENTRY)
        const mutant = source.replace(
            /aria-label=\{t\("app_navAriaLabel"\)\}/,
            'title={"https://op.gg/champions"} aria-label="Ansichten"',
        )

        expect(mutant, "the App.tsx aria-label call was not found to mutate").not.toBe(source)
        expect(
            ariaLabelLiterals(stripComments(mutant)),
            "the fixed stripper must still see a violator written after a URL",
        ).toContain("Ansichten")
        expect(
            ariaLabelLiterals(NAIVE_STRIP_COMMENTS(mutant)),
            "the pre-0.6.0 stripper is supposed to MISS this. If it does not, the fixture no " +
                "longer reproduces the bug and proves nothing.",
        ).not.toContain("Ansichten")
    })

    it("notices the subtitle literals coming back to DraftHelper", () => {
        // EACH PATTERN IS ASSERTED ON ITS OWN, and 0.6.1 is why. Until then both
        // replacements were chained and only the combined result was compared to
        // `source`. When the second pattern went stale - the subtitle stopped
        // writing `{entry.games} {t("dh_recoTablePicks")}` and started calling
        // formatDraftPicksCount() - it silently matched nothing, while the FIRST
        // replacement kept the "did anything change?" guard green. The probe was
        // half blind and said so only through a later assertion about the
        // markers. One combined check over two mutations is exactly that trap.
        const source = code(DRAFT_HELPER)

        const scoreMutant = source.replace(/·\s*\{t\("dh_recoTableTotal"\)\}\s*/, "· Score ")

        expect(
            scoreMutant,
            `the '· {t("dh_recoTableTotal")}' half of the recommendation subtitle in ` +
                `${DRAFT_HELPER} no longer matches the pattern this probe reverts. Update it so ` +
                "the probe keeps mutating something.",
        ).not.toBe(source)

        const mutant = scoreMutant.replace(RECO_SUBTITLE_PICKS_CALL_PATTERN, "{entry.games} Picks")

        expect(
            mutant,
            `${RECO_SUBTITLE_PICKS_CALL_SHAPE} was not found in ${DRAFT_HELPER}, so the ` +
                "'} Picks' half of this probe mutated nothing. That is the exact failure 0.6.1 " +
                "hit, and 0.6.2 hit again: the shape moved, the pattern went stale, and the " +
                "combined check above stayed green on the other replacement alone. The pattern " +
                "no longer names the argument list for precisely that reason, so if it has gone " +
                "stale a THIRD time, something bigger changed than an argument.",
        ).not.toBe(scoreMutant)
        expect(FORMER_SUBTITLE_LITERALS.filter((marker) => mutant.includes(marker))).toEqual([
            ...FORMER_SUBTITLE_LITERALS,
        ])
        expect(FORMER_SUBTITLE_LITERALS.filter((marker) => source.includes(marker))).toEqual([])
    })

    it("proves the header row alone cannot satisfy the subtitle check", () => {
        // THE PROBE THAT MATTERS MOST IN THIS SECTION, because it is the trap a
        // reasonable author walks into: all six subtitle keys also name a <th>,
        // so `source.includes('t("dh_recoTableTotal")')` is true even in a file
        // whose subtitle has been deleted entirely.
        //
        // Built out of the real header row rather than a fixture, so it stays
        // true of whatever that row actually says.
        const headerOnly = [...code(DRAFT_HELPER).matchAll(/<th\b[^>]*>[\s\S]*?<\/th>/g)]
            .map((match) => match[0])
            .join("\n")

        expect(
            RECO_SUBTITLE_KEYS.filter((key) => headerOnly.includes(`t("${key}")`)),
            "the six subtitle keys are supposed to ALSO be header cells - that is what makes a " +
                "naive file-wide check useless here. If they are not, the strip is unnecessary " +
                "and the comment in section 4b is wrong.",
        ).toEqual([...RECO_SUBTITLE_KEYS])

        const stripped = headerOnly.replace(/<th\b[^>]*>[\s\S]*?<\/th>/g, " ")
        expect(
            RECO_SUBTITLE_KEYS.filter((key) => stripped.includes(`t("${key}")`)),
            "stripping the <th> elements did not remove the header row's own references, so the " +
                "section-4b check is still satisfied by the header alone.",
        ).toEqual([])
    })

    it("notices the banned `{n} {t(header key)}` shape coming back to the subtitle", () => {
        // THE MUTATION 0.6.1 EXISTS TO PREVENT, applied to the real file: the
        // helper call reverted to a number in front of the table-header key.
        // That is the shape that read "1 Picks", and it is the shape a future
        // author reaches for because the key is right there in the same file,
        // eight columns up.
        const source = code(DRAFT_HELPER)
        const mutant = source.replace(
            RECO_SUBTITLE_PICKS_CALL_PATTERN,
            '{entry.games} {t("dh_recoTablePicks")}',
        )

        expect(
            mutant,
            `${RECO_SUBTITLE_PICKS_CALL_SHAPE} was not found in ${DRAFT_HELPER} to revert. The ` +
                "probe mutated nothing and everything below it proves nothing.",
        ).not.toBe(source)

        // Rule one: the shape scan sees it, and says nothing about the real file.
        expect(numberBeforeTranslationCall(mutant, "dh_recoTablePicks")).toHaveLength(1)
        expect(numberBeforeTranslationCall(source, "dh_recoTablePicks")).toEqual([])

        // Rule two, from the other direction: the key is now outside a <th>.
        expect(mentionsOfKey(withoutHeaderCells(mutant), "dh_recoTablePicks")).toHaveLength(1)
        expect(mentionsOfKey(withoutHeaderCells(source), "dh_recoTablePicks")).toEqual([])

        // …and the subtitle pin in section 4b goes red as well, because the
        // helper call it names is what the mutation replaced. Three independent
        // assertions catch this one edit, which is the intended overlap: the
        // shape rule is the general one, and the other two are specific enough
        // to say what to do about it.
        //
        // THIS PAIR IS WHAT KEEPS THE 0.6.2 LOOSENING HONEST against the real
        // file rather than against a fixture: a pattern that had drifted into
        // matching raw JSX too would report a call in the mutant and this would
        // go red.
        expect(picksCountCalls(withoutHeaderCells(mutant))).toEqual([])
        expect(picksCountCalls(withoutHeaderCells(source))).toHaveLength(1)
    })

    it("notices the lang argument being dropped from the real picks call", () => {
        // THE 0.6.2 MUTATION, and the one this file could not see at all until
        // now: drop the third argument and every assertion here stayed green,
        // because none of them asked what was passed. Only tsc would have
        // objected, and it would have said "expected 3 arguments" rather than
        // "the two counts in this line now spell a thousand differently".
        //
        // Deliberately mutated with a replacement that still COMPILES as far as
        // this file's scans are concerned - it is a real call to a real helper,
        // just one argument short.
        const source = code(DRAFT_HELPER)
        const mutant = source.replace(
            RECO_SUBTITLE_PICKS_CALL_PATTERN,
            "{formatDraftPicksCount(t, entry.games)}",
        )

        expect(
            mutant,
            `${RECO_SUBTITLE_PICKS_CALL_SHAPE} was not found to shorten`,
        ).not.toBe(source)

        // The shape pin in section 4b deliberately does NOT fire: the call is
        // still there and still fed `t`, which is all that pin claims. Stated
        // rather than left implicit, because it is the cost of loosening it and
        // the reason the argument rule below had to exist.
        expect(picksCountCalls(withoutHeaderCells(mutant))).toHaveLength(1)

        // The argument rule does fire, on the mutant only.
        expect(
            callArguments(mutant, "formatDraftPicksCount").filter((args) =>
                LANG_ARGUMENT.test(args),
            ),
            "dropping lang from the real call left the argument rule green, so it is not " +
                "protecting the language after all.",
        ).toEqual([])
        expect(
            callArguments(source, "formatDraftPicksCount").filter((args) =>
                LANG_ARGUMENT.test(args),
            ),
        ).toHaveLength(1)
    })

    it("notices dh_games being put back into a real file", () => {
        // The deleted key, reintroduced at the call site it used to have.
        const source = code(DRAFT_HELPER)
        const mutant = source.replace(
            RECO_SUBTITLE_PICKS_CALL_PATTERN,
            `{entry.games} {t("${DELETED_GAMES_KEY}")}`,
        )

        expect(mutant, `${RECO_SUBTITLE_PICKS_CALL_SHAPE} was not found to revert`).not.toBe(
            source,
        )
        expect(mentionsOfKey(mutant, DELETED_GAMES_KEY)).toHaveLength(1)
        expect(mentionsOfKey(source, DELETED_GAMES_KEY)).toEqual([])

        // THE TWO THINGS THAT MAKE THE REAL SCAN HONEST, both proven against
        // real files rather than fixtures:
        //
        //  - comment stripping. draftUiHelpers.ts names `dh_games` three times
        //    in the prose that explains why it is gone. A raw scan would fail
        //    on the explanation, and the obvious "fix" is deleting it.
        //  - the word boundary. The four keys that replaced it all begin with
        //    its name, and they live in that same file, so a substring scan
        //    would report the deleted key as present and stay red forever.
        expect(
            mentionsOfKey(readComponent(DRAFT_UI_HELPERS), DELETED_GAMES_KEY).length,
            `${DRAFT_UI_HELPERS} no longer explains why ${DELETED_GAMES_KEY} was deleted. That ` +
                "prose is what makes comment stripping load-bearing for this rule.",
        ).toBeGreaterThan(0)
        expect(mentionsOfKey(code(DRAFT_UI_HELPERS), DELETED_GAMES_KEY)).toEqual([])
        expect(mentionsOfKey(code(DRAFT_UI_HELPERS), "dh_gamesCountMany")).not.toEqual([])
    })

    it("notices a suffix-plural heuristic written into a real file", () => {
        // The wrong fix for "1 Picks", applied to the real file. It is the fix
        // that looks smallest, and it is the one CLAUDE.md bans by name: a
        // suffix declines the noun and leaves the article, the adjective ending
        // and the verb agreement behind, which is how "1 neue Match" happened.
        const source = code(DRAFT_HELPER)
        const mutant = source.replace(
            RECO_SUBTITLE_PICKS_CALL_PATTERN,
            '{`${entry.games} Pick${entry.games === 1 ? "" : "s"}`}',
        )

        expect(mutant, `${RECO_SUBTITLE_PICKS_CALL_SHAPE} was not found to replace`).not.toBe(
            source,
        )
        // Both halves of the pattern list fire on it: the spliced noun and the
        // ternary. Either one alone would be enough; the message names both.
        expect(suffixPluralHits(mutant)).toHaveLength(2)
        expect(suffixPluralHits(source)).toEqual([])
        // And the whole components tree is clean today, which is what the
        // section 7 assertion says with a nicer message.
        expect(componentFiles().flatMap((rel) => suffixPluralHits(code(rel)))).toEqual([])
    })
})

/* ==========================================================================
 * 7. The counted nouns: "1 Picks" cannot come back
 *
 * WHY THIS SECTION IS NUMBERED LAST RATHER THAN NEXT TO THE OTHER RULES: this
 * file grows by appending (4b in 0.6.0, 4c with it), and sections 5 and 6 are
 * referenced by number from a dozen comments above. Renumbering them to slot a
 * rule section into the middle would rewrite prose that has nothing to do with
 * this change. The predicates these assertions use are declared at the top with
 * all the others, so "every predicate above" in section 5 still covers them and
 * their fixtures are up there with the rest.
 *
 * WHAT THE RULE IS. Until 0.6.1 the draft area wrote a number and then a
 * table-header key: `{entry.games} {t("dh_recoTablePicks")}` under every
 * recommendation, `{n} {t("dh_games")}` in three more places. CLAUDE.md bans
 * that shape - it is what produced "1 neue Match gespeichert." - and it was
 * reachable here, not theoretical: the min-picks filter is `min={1}`.
 *
 * FOUR RULES, because there are four ways back:
 *
 *  1. borrow the header key for a count again (the shape scan, plus the
 *     stronger local rule that `dh_recoTablePicks` may only appear inside a
 *     `<th>` in DraftHelper.tsx),
 *  2. put `dh_games` back and use it the same way,
 *  3. splice a suffix onto the noun instead of selecting a key - the fix that
 *     looks smallest and cannot ever be right,
 *  4. keep the helpers and stop calling them, which is what a "simplifying"
 *     edit to a JSX line does without meaning to.
 *
 * The keys are checked as catalogue data first, for the same reason every other
 * key family in this file is: a source scan cannot tell whether `{count}` is
 * still in the text.
 * ========================================================================== */

describe("the counted-noun keys are in both catalogues", () => {
    it("holds the exact agreed value in de.ts and en.ts", () => {
        for (const [key, dePrompt, enPrompt] of COUNTED_NOUN_KEYS) {
            expect(DE[key], `de.ts has no ${key}`).toBe(dePrompt)
            expect(EN[key], `en.ts has no ${key}`).toBe(enPrompt)
        }
    })

    it("is present in both catalogues, in both directions", () => {
        const keys = COUNTED_NOUN_KEYS.map(([key]) => key)
        const onlyInDe = keysMissingFrom(keys, DE, EN)
        const onlyInEn = keysMissingFrom(keys, EN, DE)

        expect(onlyInDe, `in de.ts but missing in en.ts: ${onlyInDe.join(", ")}`).toEqual([])
        expect(onlyInEn, `in en.ts but missing in de.ts: ${onlyInEn.join(", ")}`).toEqual([])
    })

    it("keeps both halves of both pairs, so a pair cannot go half-missing", () => {
        // A pair with only its plural half compiles, passes every value check
        // above, and renders "1 Games" at runtime through pluralKey()'s fallback
        // to… nothing: `t()` would be handed an undefined key. The pairing is
        // therefore asserted as its own statement rather than inferred from the
        // list having four entries.
        const declared = COUNTED_NOUN_KEYS.map(([key]) => key)

        expect(
            COUNTED_NOUN_PAIRS.flatMap(([, one, many]) => [one, many]).sort(),
            "COUNTED_NOUN_PAIRS and COUNTED_NOUN_KEYS no longer describe the same four keys.",
        ).toEqual([...declared].sort())

        for (const [what, one, many] of COUNTED_NOUN_PAIRS) {
            for (const [lang, dict] of LANGS) {
                expect(dict[one], `${lang}.ts has no singular for ${what} (${one})`).toBeTruthy()
                expect(dict[many], `${lang}.ts has no plural for ${what} (${many})`).toBeTruthy()
                expect(
                    dict[one],
                    `${lang}.ts gives ${what} the same text for one and many ("${dict[one]}"). ` +
                        "Then the pair is pointless and the singular is not doing its job.",
                ).not.toBe(dict[many])
            }
        }
    })

    it("carries {count} on BOTH halves, the singular included", () => {
        // THE RULE CLAUDE.md STATES, checked against the actual text. The
        // singular's number can only ever be 1, so writing "1 Game" and dropping
        // the placeholder looks like a simplification. It is not: DE/EN
        // placeholder parity is checked over every key in
        // tests/i18nScoutCopy.test.ts, and a singular without `{count}` breaks
        // it - while also hiding the number from whoever rewords the line next.
        for (const [lang, dict] of LANGS) {
            for (const [key] of COUNTED_NOUN_KEYS) {
                expect(
                    placeholdersOf(dict[key] ?? ""),
                    `${lang}.${key} does not carry exactly one {count}: "${dict[key]}". Both ` +
                        "halves of a plural pair take the same placeholder, the singular " +
                        "included - see src/i18n/plural.ts.",
                ).toEqual(["{count}"])
            }
        }
    })

    it("stays off the three key lists that forbid a placeholder", () => {
        // These four are the FIRST keys in this file's remit that carry a
        // placeholder at all. Every other list here is looped by a "carries no
        // {placeholder}" assertion, so adding one of these to NEW_KEYS or
        // COMPLETION_PACK_KEYS - which looks like tidying, they are Draft Helper
        // keys - would go red with a message saying the exact opposite of the
        // truth: "nothing substitutes one here, so it would render literally".
        // Somebody would then be one keystroke from deleting the {count}.
        const counted = new Set(COUNTED_NOUN_KEYS.map(([key]) => key))

        for (const [name, keys] of COUNTED_NOUN_FREE_LISTS) {
            const overlap = keys.filter((key) => counted.has(key))

            expect(
                overlap,
                `${name} now lists ${overlap.join(", ")}, which carries {count}. That list is ` +
                    "looped by a placeholder-free assertion. The counted nouns have their own " +
                    "list, COUNTED_NOUN_KEYS, precisely because they must carry one.",
            ).toEqual([])
        }
    })

    it("differs from the English only in the capital letter, which is the point", () => {
        // NOT run through the blanket DE/EN copy-paste check, and this is where
        // that is justified rather than waved through. "Game" and "Pick" are
        // loanwords in German League jargon - dh_recoTablePicks is on
        // IDENTICAL_BY_DESIGN for exactly that reason - so the words are the
        // same in both catalogues. What is NOT the same is the capital: German
        // capitalises every noun, English does not capitalise one mid-sentence.
        //
        // That difference is the whole argument for minting these four keys
        // instead of reusing dh_recoTablePicks, which reads "Picks" in both. A
        // Title Case noun is right above a column and wrong inside a sentence:
        // an English user would have read "41 Picks" in running text.
        for (const [key] of COUNTED_NOUN_KEYS) {
            expect(
                DE[key],
                `de.${key} and en.${key} are now byte-identical ("${DE[key]}"). German ` +
                    "capitalises its nouns; if the English one grew a capital it is Title Case " +
                    "inside a sentence, which is what borrowing the header key did wrong.",
            ).not.toBe(EN[key])
            expect(
                sameSentence(DE[key] ?? "", EN[key] ?? ""),
                `de.${key} ("${DE[key]}") and en.${key} ("${EN[key]}") now differ by more than ` +
                    'capitalisation. "Game" and "Pick" are loanwords in German League jargon. If ' +
                    "one was genuinely translated, that is a deliberate act - update this " +
                    "assertion and say which word was chosen.",
            ).toBe(true)
        }
    })

    it("is referenced from src/ outside src/i18n/, so none is dead", () => {
        const { files, text } = srcOutsideI18n()

        expect(files.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no dh_ reference at all").toContain("dh_patchWeightTitle")

        const unreferenced = COUNTED_NOUN_KEYS.map(([key]) => key).filter(
            (key) => !text.includes(key),
        )

        expect(
            unreferenced,
            `these keys are in the catalogues but nowhere in src/: ${unreferenced.join(", ")}\n` +
                "A dead key is a promise the app does not keep. Both halves of a pair are " +
                "referenced from the same object literal in draftUiHelpers.ts, so a missing one " +
                "means the pair was dismantled.",
        ).toEqual([])
    })
})

describe("the draft area counts games and picks through the helpers", () => {
    it("defines both helpers and calls them from the components that render a count", () => {
        // Rule 4: keeping the helpers and quietly stopping to call them. A
        // helper nobody calls is a dead export, and every assertion about the
        // keys above would stay green while the JSX went back to concatenating.
        const helpers = code(DRAFT_UI_HELPERS)

        for (const [name, callers] of COUNT_HELPERS) {
            expect(
                helpers,
                `${DRAFT_UI_HELPERS} no longer exports ${name}. It is the only place that runs ` +
                    "the count through pluralKey(); without it every call site is back to " +
                    "picking a noun by hand.",
            ).toContain(`export function ${name}(`)

            for (const caller of callers) {
                const source = code(caller)

                expect(
                    source,
                    `${caller} no longer calls ${name}(...). If the line it formatted was ` +
                        "removed, say so here; if it now builds the string itself, that is the " +
                        "regression this section exists for.",
                ).toContain(`${name}(`)

                // Named at least twice: once imported, once called. One mention
                // is an import with no call site, which is exactly what a JSX
                // line reverted by hand leaves behind.
                expect(
                    source.split(name).length - 1,
                    `${caller} mentions ${name} only once. That is an import with no call site.`,
                ).toBeGreaterThanOrEqual(2)
                expect(
                    source,
                    `${caller} calls ${name} but no longer imports it from draftUiHelpers.`,
                ).toContain("draftUiHelpers")
            }
        }
    })

    it("hands both count helpers the active language, at the declaration and at every call", () => {
        // THE 0.6.2 RULE, and the one thing in this change that is behaviour
        // rather than housekeeping.
        //
        // `formatDraftPicksCount` gained a third parameter so it groups its
        // thousands through formatNumber(count, lang), the way
        // `formatDraftGamesCount` beside it already did. Before this assertion
        // existed, nothing in this file said so: the only objection to dropping
        // the argument again would have come from tsc, and "expected 3
        // arguments, but got 2" does not tell anybody that the recommendation
        // subtitle would then spell one thousand two different ways in the same
        // line - `1.234 Games` next to `1234 Picks` in German, `1,234 games`
        // next to `1234 picks` in English.
        //
        // WHY IT IS WRITTEN AS "an argument named lang" AND NOT AS THE
        // SIGNATURE: the literal-call pin this file used to carry broke on two
        // consecutive signature changes, both improvements
        // (RECO_SUBTITLE_PICKS_CALL_PATTERN records both). A fourth parameter,
        // a reordering, or a rename of `count` would leave this green, because
        // none of those is the regression. Dropping the language is.
        const helpers = code(DRAFT_UI_HELPERS)

        for (const [name, callers] of COUNT_HELPERS) {
            const declaration = new RegExp(`export function ${name}\\(([^)]*)\\)`).exec(helpers)

            expect(
                declaration,
                `${DRAFT_UI_HELPERS} no longer declares ${name} with a parameter list this scan ` +
                    "can read. The check below became vacuous at the same moment.",
            ).not.toBeNull()
            expect(
                declaration?.[1] ?? "",
                `${DRAFT_UI_HELPERS} declares ${name} without a \`lang: Lang\` parameter. Both ` +
                    "count helpers run their number through formatNumber(count, lang); without " +
                    "the language they would fall back to one locale's separators for every " +
                    "user, and the two counts in one subtitle would disagree with each other.",
            ).toMatch(/\blang\s*:\s*Lang\b/)

            for (const caller of callers) {
                const calls = callArguments(code(caller), name)

                expect(
                    calls.length,
                    `${caller} makes no readable ${name}(...) call, so this rule checks nothing ` +
                        "there. The helper-call assertion above is the one that explains it.",
                ).toBeGreaterThan(0)

                const withoutLang = calls.filter((args) => !LANG_ARGUMENT.test(args))

                expect(
                    withoutLang,
                    `${caller} calls ${name} without passing lang: ${withoutLang.join(" | ")}\n` +
                        "The count is grouped by formatNumber(count, lang), so dropping the " +
                        "language drops the thousands separator for one of the two counts in the " +
                        "same line. That is the whole of 0.6.2, and tsc alone would have said " +
                        "only 'expected 3 arguments'.",
                ).toEqual([])
            }
        }
    })

    it("keeps dh_recoTablePicks inside a <th> and nowhere else in DraftHelper", () => {
        // Rule 1, stated locally and strictly. The key SURVIVES - it is column
        // eight's heading and sections 1 and 4 pin it as one. What it may not do
        // is be borrowed for a count again, and "only inside a <th>" is the
        // robust way to say that: it does not care how the number is written,
        // whether it is before or after, on the same line or three lines up.
        const source = code(DRAFT_HELPER)

        // Anti-vacuity first, from both ends: the header cell must still be
        // there (otherwise "nowhere else" is satisfied by "nowhere at all"),
        // and the strip must actually remove something.
        expect(
            thTranslationKeys(source),
            `${DRAFT_HELPER} no longer renders dh_recoTablePicks in a <th>. The column heading is ` +
                "the key's one remaining job; if the column went away, this rule and the " +
                "twelve-column pins in section 4 all need revisiting together.",
        ).toContain("dh_recoTablePicks")

        const body = withoutHeaderCells(source)

        expect(thChildren(body), "stripping the <th> elements left some behind").toEqual([])
        expect(body.length, "stripping the <th> elements emptied the file").toBeGreaterThan(5000)

        const outside = mentionsOfKey(body, "dh_recoTablePicks")

        expect(
            outside,
            `${DRAFT_HELPER} names dh_recoTablePicks outside its header row:\n` +
                `${outside.join("\n")}\n` +
                "That key is a COLUMN HEADING. It carries no number and cannot decline, and in " +
                "English it is Title Case, which is right above a column and wrong inside a " +
                'sentence. The subtitle borrowed it as `{entry.games} {t("dh_recoTablePicks")}` ' +
                'until 0.6.1 and a one-pick champion read "1 Picks". Use ' +
                "formatDraftPicksCount(t, n, lang), which selects between dh_picksCountOne and " +
                "dh_picksCountMany.",
        ).toEqual([])
    })

    it("has no dh_games left anywhere under src/", () => {
        // Rule 2. The key was deleted rather than left in the catalogue, because
        // a spare plural noun sitting there is an invitation to write
        // `{n} {t("dh_games")}` again - which is precisely what its four call
        // sites did.
        const scanned = srcFiles()
        expectCompleteSrcScan(scanned, DELETED_GAMES_KEY)

        const offenders = scanned
            .map((rel) => [rel, mentionsOfKey(srcCode(rel), DELETED_GAMES_KEY)] as const)
            .filter(([, hits]) => hits.length > 0)
            .map(([rel, hits]) => `${rel}: ${hits.join(" | ")}`)

        expect(
            offenders,
            `${DELETED_GAMES_KEY} is back in src/:\n${offenders.join("\n")}\n` +
                "It was deleted in 0.6.1 because all four of its uses were counted nouns and it " +
                "had no label use left. If something needs to say 'Games' with a number in " +
                "front, that is formatDraftGamesCount(t, n, lang). If something needs it as a " +
                "bare label, that is a new key with a new name and a reason written down.",
        ).toEqual([])

        // ANTI-VACUITY, and it is doing two jobs. A scan that reads nothing, or
        // a `\b` that never matches, reports the same clean tree as a correct
        // one - so the SAME predicate, over the same files, must find the keys
        // that replaced it. That also proves the word boundary works in the one
        // direction that matters: `dh_gamesCountMany` starts with `dh_games`.
        const withReplacements = scanned.filter(
            (rel) => mentionsOfKey(srcCode(rel), "dh_gamesCountMany").length > 0,
        )

        expect(
            withReplacements.length,
            "the same scan cannot find dh_gamesCountMany either, so it is blind rather than " +
                "clean. It should be named in both catalogues and in draftUiHelpers.ts.",
        ).toBeGreaterThan(2)

        expect(
            DE[DELETED_GAMES_KEY] ?? EN[DELETED_GAMES_KEY],
            `${DELETED_GAMES_KEY} is back in a catalogue. Deleting it from src/ and leaving it ` +
                "in de.ts is the half-fix that puts the trap back within reach.",
        ).toBeUndefined()
    })

    it("only passes because the comment stripper works, and that is checked", () => {
        // THE FRAGILITY BEHIND THE RULE ABOVE, made explicit.
        //
        // `dh_games` is not absent from src/. It appears four times in the JSDoc
        // of draftUiHelpers.ts, explaining why the key was deleted. The rule
        // above is green only because `srcCode()` strips comments first, and
        // nothing tested that. If the stripper ever mishandles that file — a
        // `*/` inside a string, a reformatted block — the rule goes red saying
        // "dh_games is back in src/", and the next reader hunts a reintroduction
        // that never happened.
        //
        // Asserting BOTH directions is the point: raw must contain it, stripped
        // must not. Either half alone would pass on a stripper that deletes
        // everything, or on a file that lost its explanation.
        const documented = "components/draft/draftUiHelpers.ts"
        expect(srcFiles()).toContain(documented)

        const raw = readSrc(documented)
        expect(
            mentionsOfKey(raw, DELETED_GAMES_KEY).length,
            `${documented} no longer explains why ${DELETED_GAMES_KEY} was deleted. If that ` +
                "prose moved on purpose, this guard can go; if it vanished by accident, the " +
                "reason the key must not come back went with it.",
        ).toBeGreaterThan(0)

        expect(
            mentionsOfKey(srcCode(documented), DELETED_GAMES_KEY),
            `stripComments() no longer removes the ${DELETED_GAMES_KEY} mentions from the JSDoc ` +
                `of ${documented}. The rule above will now report a reintroduced key that is ` +
                "only a comment. Fix the stripper, not the comment.",
        ).toEqual([])
    })

    it("writes no `{n} {t(noun)}` shape anywhere in src/components/", () => {
        // Rule 1 again, as the general statement. The <th> rule above is local
        // and strict; this one is wide and shape-based, and it is the half that
        // would catch the same mistake made with a DIFFERENT noun key in a
        // different component.
        const files = componentFiles()

        expect(files.length, "src/components/ scan found no files").toBeGreaterThan(20)

        const offenders = files.flatMap((rel) =>
            NOUN_LABEL_KEYS.flatMap((key) =>
                numberBeforeTranslationCall(code(rel), key).map((hit) => `${rel}: ${hit}`),
            ),
        )

        expect(
            offenders,
            `these lines put a number in front of a bare noun label:\n${offenders.join("\n")}\n` +
                "That is the `{zahl} {t(\"substantiv_im_plural\")}` shape CLAUDE.md bans after " +
                '"1 neue Match gespeichert." A label key cannot decline. Use two keys and ' +
                "pluralKey(), the way formatDraftGamesCount and formatDraftPicksCount do.",
        ).toEqual([])
    })

    it("writes no suffix-plural heuristic anywhere in src/components/", () => {
        // Rule 3, and the one worth stating loudest, because it is the fix that
        // looks smallest. `Pick${n === 1 ? "" : "s"}` renders "1 Pick" correctly
        // and is still wrong: the suffix reaches the noun and nothing else, so
        // the article, the adjective ending and the verb agreement stay in the
        // singular or the plural regardless. "1 neue Match gespeichert." passed
        // its own suffix check too.
        const files = componentFiles()

        expect(files.length, "src/components/ scan found no files").toBeGreaterThan(20)

        const offenders = files.flatMap((rel) =>
            suffixPluralHits(code(rel)).map((hit) => `${rel}: ${hit}`),
        )

        expect(
            offenders,
            `these lines inflect a noun with a suffix:\n${offenders.join("\n")}\n` +
                "A suffix declines the noun and leaves the article, the adjective ending and the " +
                "verb behind - that is how the UI came to read \"1 neue Match gespeichert.\" Two " +
                "i18n keys chosen by pluralKey() are the only shape that works; see " +
                "src/i18n/plural.ts.",
        ).toEqual([])
    })
})
