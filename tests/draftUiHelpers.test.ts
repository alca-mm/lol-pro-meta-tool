/**
 * Unit tests for the patch line under the draft recommendations.
 *
 * WHY THIS FILE EXISTS AT ALL: `formatPatchWindowSummary` had never had a
 * single test. tests/draftPatchWindow.test.ts imports `parsePatchParts`,
 * `comparePatch` and `weightedPatchWindow` from the module the formatter used
 * to share - and nothing else. That is exactly how a hardcoded German
 * `"keine Patchdaten"`, a hardcoded English noun `" Games"` and an ungrouped
 * `4821` survived two whole locale passes and shipped into the English build.
 * Same argument as src/components/player-results/playerResultsFormat.ts and
 * tests/playerResultsFormat.test.ts: vitest runs in Node here
 * (vite.config.ts, `test.environment: 'node'`) with no jsdom, so a sentence
 * assembled inside a component is invisible to the suite. Moving the function
 * into a helper module is what makes the assertions below possible; this file
 * is the coverage that should have existed all along.
 *
 * EVERY TEST BELOW HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the test that turns red for each one:
 *
 *   the German literal back in the empty branch (`return "keine Patchdaten"`)
 *       -> "answers in the language of the caller, not always in German"
 *   the empty branch returning ""
 *       -> "answers in the language of the caller, not always in German"
 *       -> "never answers with an empty string"
 *   `formatNumber` dropped, `${summary.rawMatches}` interpolated raw
 *       -> "renders the complete segment in the language of the caller"
 *       -> "German groups with a dot, English with a comma"
 *   a hardcoded `lang` ("de") inside the formatter
 *       -> "German groups with a dot, English with a comma"
 *   the counted noun welded back in (`${n} Games`) instead of the
 *   `dh_gamesCount*` pair
 *       -> "the counted noun comes from the catalogue, not from the code"
 *       -> "renders the complete segment in the language of the caller"
 *   the ` · ` separator changed, or a trailing one appended
 *       -> "joins two summaries with a middle dot and keeps their order"
 *       -> "a single summary carries no separator at all"
 *   the summaries rendered in reverse order
 *       -> "joins two summaries with a middle dot and keeps their order"
 *   `summary.weightedMatches` rendered instead of `summary.rawMatches`
 *       -> "prints the raw match count, not the weighted one"
 *   `summary.weight` routed through `formatNumber`
 *       -> "the percentage stays locale-neutral and ungrouped"
 *   a `{placeholder}` key introduced for the segment
 *       -> "leaves no placeholder behind, in any branch or language"
 *
 * And the mutants of the two counted-noun helpers added in 0.6.1 (sections 8
 * and 9) and made to agree on their number format in 0.6.2 (section 10), each
 * with the assertion that turns red:
 *
 *   the singular/plural pair swapped (`one` <-> `many`)
 *       -> "one game reads as a singular in both languages"
 *       -> "two games read as a plural in both languages"
 *       -> "zero games read as a plural in both languages"
 *       -> the same three for picks
 *   `pluralKey` replaced by `count === 0 ? one : many`
 *       -> "one game reads as a singular in both languages" (renders the
 *          plural) AND "zero games read as a plural in both languages"
 *          (renders the singular). Either half alone catches it.
 *   the plural bodged as a suffix (`count === 1 ? "" : "s"`) on one key
 *       -> "one game reads as a singular in both languages": the English
 *          output would carry the German capital, "1 Game" instead of
 *          "1 game", because a suffix can only decline the ending
 *       -> "the counted noun comes from the catalogue, not from the code"
 *   `{count}` never substituted
 *       -> "leaves no {count} behind, in any language or count"
 *       -> and every full-string pin in sections 8 and 9
 *   `formatNumber` dropped from `formatDraftPicksCount` (a revert of 0.6.2, or
 *   `String(count)` put back)
 *       -> "groups the pick count the way the language does" (renders
 *          "1234 Picks", the string this test used to REQUIRE)
 *       -> "takes the plural for a fractional count, and now spells it in
 *          German" (German falls back to the English decimal point)
 *       -> "spells the same count identically in both helpers, in both
 *          languages", because only ONE side lost the formatter
 *   `formatNumber` dropped from `formatDraftGamesCount`
 *       -> "groups the game count the way the language does"
 *       -> the section 2/3 segment pins
 *       -> and again the symmetry test, from the other side
 *   `formatNumber` dropped from BOTH helpers at once
 *       -> the four full-string pins in "agrees on a number that the two
 *          languages spell differently". The symmetry test alone would SURVIVE
 *          this - two wrongs agree with each other - which is why that
 *          describe carries literals as well as a comparison.
 *   `lang` ignored inside either helper (hardcoded "de")
 *       -> the English half of every full-string pin in sections 8, 9 and 10,
 *          and the explicit `not.toBe` between the two languages
 *
 * THE TWO PINS 0.6.2 TURNED OVER, since a reader will want the direction of
 * travel: "does not group the pick count, in either language" asserted
 * `1234 Picks` / `1234 picks`, and the fractional case asserted `1.5 Picks` in
 * German. Both were deliberate freezes written by 0.6.1 so that the follow-up
 * would have to come back to this file. Both are now inverted rather than
 * deleted, and each states its former expectation as a `not.toBe` so the
 * reversal cannot quietly reverse itself.
 *
 * WHY THE `1` CASES ARE NOT OPTIONAL: CLAUDE.md says it outright, and this
 * module is the proof. The shipped defect was `1 Games` / `1 Picks`; the
 * two-case renders identically before and after the fix, so a test that only
 * checks `2` stays green through the whole bug and proves nothing.
 *
 * The four DE/EN x normal/empty strings are pinned VERBATIM with `toBe` on the
 * whole string, never `toContain` on the number. A `toContain("4.821")` would
 * stay green on an English build printing German separators, because "4.821"
 * is a substring of nothing it would produce - but the test would also stay
 * green if the noun, the order or the separator broke. The whole string is the
 * requirement.
 *
 * No clock is read anywhere in this file, and no fixture comes out of
 * `weightedPatchWindow`: coupling the formatting tests to the engine would make
 * a maths change look like a formatting failure.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { Lang } from "../src/i18n/types"
import {
  formatDraftGamesCount,
  formatDraftPicksCount,
  formatPatchWindowSummary,
} from "../src/components/draft/draftUiHelpers"
import type { DraftTranslate } from "../src/components/draft/draftUiHelpers"
import type { PatchWindowData, PatchWindowSummary } from "../src/draft/types"

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

const tDe: DraftTranslate = (key) => de[key]
const tEn: DraftTranslate = (key) => en[key]

/**
 * The two languages the app ships, each paired with ITS OWN `t`.
 *
 * Deliberately not a `t` stubbed as `(key) => key`: that reads as a tidy unit
 * test and makes every assertion in this file vacuous for the one question it
 * exists to answer. The real catalogues are the subject.
 */
const CASES: ReadonlyArray<{ readonly name: Lang; readonly t: DraftTranslate; readonly lang: Lang }> =
  [
    { name: "de", t: tDe, lang: "de" },
    { name: "en", t: tEn, lang: "en" },
  ]

/**
 * Every field of `PatchWindowSummary`, as a record rather than an array, so
 * ADDING a field to the draft type is a compile error here
 * (`npm run typecheck:tests`) instead of a silently unrendered new value.
 */
const ALL_SUMMARY_KEYS: Record<keyof PatchWindowSummary, true> = {
  patch: true,
  rawMatches: true,
  weight: true,
  weightedMatches: true,
}

/**
 * A `PatchWindowData` built by hand, never by `weightedPatchWindow`.
 *
 * `matches` and `rawMatches` stay empty on purpose. The formatter reads
 * `summaries` and nothing else, and an empty match array beside a summary
 * claiming 4821 matches is what proves it: a version that counted
 * `patchData.rawMatches.length` would print 0 and every pinned string below
 * would go red. The arrays are `Match[]`, so filling them would mean dragging
 * a whole match fixture into a formatting test for no assertion.
 *
 * `patches`, `rawSample` and `weightedSample` are derived from the summaries
 * so the object stays internally consistent with what the engine would build.
 */
function patchWindow(...summaries: PatchWindowSummary[]): PatchWindowData {
  return {
    patches: summaries.map((summary) => summary.patch),
    matches: [],
    rawMatches: [],
    rawSample: summaries.reduce((sum, summary) => sum + summary.rawMatches, 0),
    weightedSample: summaries.reduce((sum, summary) => sum + summary.weightedMatches, 0),
    summaries,
  }
}

/** The live patch at full weight. Four digits, so the grouping question is real. */
const CURRENT: PatchWindowSummary = {
  patch: "14.16",
  rawMatches: 4821,
  weight: 100,
  weightedMatches: 4821,
}

/**
 * The patch before it, at 60 %. `rawMatches` and `weightedMatches` differ here
 * on purpose (1200 vs 720) - that is what tells the two fields apart in the
 * rendered string.
 */
const PREVIOUS: PatchWindowSummary = {
  patch: "14.15",
  rawMatches: 1200,
  weight: 60,
  weightedMatches: 720,
}

/** Below a thousand, where neither language groups anything. */
const SMALL: PatchWindowSummary = {
  patch: "14.14",
  rawMatches: 842,
  weight: 30,
  weightedMatches: 253,
}

const EMPTY = patchWindow()
const ONE = patchWindow(CURRENT)
const TWO = patchWindow(CURRENT, PREVIOUS)
const BELOW_THOUSAND = patchWindow(SMALL)

/* The four strings the whole change is about, written out once. */
const ONE_DE = "14.16 (100%, 4.821 Games)"
const ONE_EN = "14.16 (100%, 4,821 games)"
const EMPTY_DE = "keine Patchdaten"
const EMPTY_EN = "no patch data"

/* ==========================================================================
 * 0. The two catalogue keys this module leans on
 *
 * Control assertions. Every "German differs from English" claim below is only
 * meaningful while these values differ; if a catalogue edit ever makes them
 * equal, the failure should read as "the discriminator is gone", not as a
 * confusing formatter failure three describes further down.
 * ========================================================================== */

describe("the catalogue values behind the patch line", () => {
  it("dh_noPatchData really says something different in each language", () => {
    expect(de.dh_noPatchData).toBe(EMPTY_DE)
    expect(en.dh_noPatchData).toBe(EMPTY_EN)
    expect(
      de.dh_noPatchData,
      "control assertion: while these two are equal, the empty-branch test " +
        "below cannot tell a translated branch from a hardcoded German one.",
    ).not.toBe(en.dh_noPatchData)
  })

  it("the dh_gamesCount pair really says something different in each language", () => {
    // Was `dh_games` until 0.6.1. That key was a TABLE HEADER borrowed as a
    // counted noun, it could not decline, and it is now DELETED - keeping it
    // around would have left the next person a trap to fall into. The two
    // languages differ only in case here, which is enough, and is why the noun
    // test below asserts on `Games` with a capital G specifically.
    expect(de.dh_gamesCountOne).toBe("{count} Game")
    expect(de.dh_gamesCountMany).toBe("{count} Games")
    expect(en.dh_gamesCountOne).toBe("{count} game")
    expect(en.dh_gamesCountMany).toBe("{count} games")

    expect(
      de.dh_gamesCountMany,
      "control assertion: same reasoning as dh_noPatchData.",
    ).not.toBe(en.dh_gamesCountMany)
    expect(
      de.dh_gamesCountOne,
      "control assertion: while singular and plural are equal in a language, " +
        "every plural test below stops discriminating in that language.",
    ).not.toBe(de.dh_gamesCountMany)
    expect(en.dh_gamesCountOne).not.toBe(en.dh_gamesCountMany)
  })

  it("the dh_picksCount pair really says something different in each language", () => {
    expect(de.dh_picksCountOne).toBe("{count} Pick")
    expect(de.dh_picksCountMany).toBe("{count} Picks")
    expect(en.dh_picksCountOne).toBe("{count} pick")
    expect(en.dh_picksCountMany).toBe("{count} picks")

    expect(de.dh_picksCountMany, "control assertion.").not.toBe(en.dh_picksCountMany)
    expect(de.dh_picksCountOne, "control assertion.").not.toBe(de.dh_picksCountMany)
    expect(en.dh_picksCountOne).not.toBe(en.dh_picksCountMany)
  })

  it("carries {count} on BOTH halves of both pairs, the singular included", () => {
    // CLAUDE.md: baking the "1" into the singular would break the DE/EN
    // placeholder parity that tests/i18nScoutCopy.test.ts checks over every
    // key, and would hide the number from whoever rewords the string next.
    // Asserted here as well because that guard covers `scout_` keys only.
    const halves: ReadonlyArray<readonly [string, string]> = [
      ["de.dh_gamesCountOne", de.dh_gamesCountOne],
      ["de.dh_gamesCountMany", de.dh_gamesCountMany],
      ["de.dh_picksCountOne", de.dh_picksCountOne],
      ["de.dh_picksCountMany", de.dh_picksCountMany],
      ["en.dh_gamesCountOne", en.dh_gamesCountOne],
      ["en.dh_gamesCountMany", en.dh_gamesCountMany],
      ["en.dh_picksCountOne", en.dh_picksCountOne],
      ["en.dh_picksCountMany", en.dh_picksCountMany],
    ]

    for (const [label, value] of halves) {
      expect(value, label).toContain("{count}")
    }
    expect(halves).toHaveLength(8)
  })
})

/* ==========================================================================
 * 1. The empty branch - the defect that actually shipped
 * ========================================================================== */

describe("formatPatchWindowSummary with no summaries", () => {
  it("answers in the language of the caller, not always in German", () => {
    const german = formatPatchWindowSummary(EMPTY, tDe, "de")
    const english = formatPatchWindowSummary(EMPTY, tEn, "en")

    expect(german).toBe(EMPTY_DE)
    expect(
      english,
      "THE test this file exists for. A German 'keine Patchdaten' here is the " +
        "string that shipped: drag all six patch weights to zero, or filter " +
        "down to no matches, and an English user read 'Recommendations use a " +
        "weighted patch selection: keine Patchdaten'. A test that only checked " +
        "German would have stayed green through the entire bug.",
    ).toBe(EMPTY_EN)

    expect(german).not.toBe(english)
  })

  it("never answers with an empty string", () => {
    // Separate from the pinned strings above so the intent survives a future
    // copy change: the line must say SOMETHING, because it sits after a colon
    // in the surrounding sentence and a blank there reads as a rendering fault.
    for (const { name, t, lang } of CASES) {
      const rendered = formatPatchWindowSummary(EMPTY, t, lang)
      expect(rendered, `lang: ${name}`).not.toBe("")
      expect(rendered.trim().length, `lang: ${name}`).toBeGreaterThan(0)
    }
  })

  it("reads the emptiness off the summaries, not off the patch list", () => {
    // `patches` is derived from `summaries` in the engine, so this pair can
    // never diverge in production; the assertion pins WHICH field decides, so
    // that a refactor to `patchData.patches.length` or `rawSample` is a visible
    // change of contract rather than an invisible one.
    expect(EMPTY.summaries).toHaveLength(0)
    expect(EMPTY.patches).toHaveLength(0)
    expect(formatPatchWindowSummary(EMPTY, tEn, "en")).toBe(EMPTY_EN)
  })
})

/* ==========================================================================
 * 2. One summary - the whole segment, both languages
 * ========================================================================== */

describe("formatPatchWindowSummary with one summary", () => {
  it("renders the complete segment in the language of the caller", () => {
    const german = formatPatchWindowSummary(ONE, tDe, "de")
    const english = formatPatchWindowSummary(ONE, tEn, "en")

    expect(german).toBe(ONE_DE)
    expect(
      english,
      "the whole string, not just the number: an English build that printed " +
        "'4.821' or a capital 'Games' is the shipped defect, and only a full " +
        "comparison catches both at once.",
    ).toBe(ONE_EN)

    expect(
      german,
      "if these two are equal the formatter is ignoring either `lang` or `t`.",
    ).not.toBe(english)
  })

  it("a single summary carries no separator at all", () => {
    for (const { name, t, lang } of CASES) {
      const rendered = formatPatchWindowSummary(ONE, t, lang)
      expect(
        rendered,
        `lang: ${name} - a per-segment suffix instead of a join would leave a ` +
          "dangling ' · ' at the end of the line.",
      ).not.toContain("·")
      expect(rendered.endsWith(")"), `lang: ${name}`).toBe(true)
    }
  })

  it("prints the raw match count, not the weighted one", () => {
    // PREVIOUS is the only fixture where the two differ: 1200 raw, 720
    // weighted. The line describes the SAMPLE the recommendations drew from,
    // so the raw count is the honest number to show.
    const german = formatPatchWindowSummary(patchWindow(PREVIOUS), tDe, "de")
    const english = formatPatchWindowSummary(patchWindow(PREVIOUS), tEn, "en")

    expect(german).toBe("14.15 (60%, 1.200 Games)")
    expect(english).toBe("14.15 (60%, 1,200 games)")
    expect(german, "720 is `weightedMatches` and must not reach the screen").not.toContain("720")
    expect(english).not.toContain("720")
  })
})

/* ==========================================================================
 * 3. Grouping follows the language
 * ========================================================================== */

describe("the thousands separator follows the language", () => {
  it("German groups with a dot, English with a comma", () => {
    // CONTROL: prove the assertions below are not statements about the number
    // 4821. The two locales really do disagree about this one.
    expect(
      (4821).toLocaleString("de-DE"),
      "control assertion: if German ever stops grouping with a dot, the checks " +
        "below stop discriminating and need rethinking.",
    ).toBe("4.821")
    expect((4821).toLocaleString("en-US")).toBe("4,821")

    const german = formatPatchWindowSummary(ONE, tDe, "de")
    const english = formatPatchWindowSummary(ONE, tEn, "en")

    // The full segment, deliberately. `toContain("4.821")` on the English
    // output would stay green on a build printing German separators for the
    // parts of the string it does not look at.
    expect(german).toBe("14.16 (100%, 4.821 Games)")
    expect(
      english,
      "an English '4.821' means `lang` never reached formatNumber - which is " +
        "how the raw, ungrouped '4821' sat under a neighbouring line printing " +
        "'10.054' in the first place.",
    ).toBe("14.16 (100%, 4,821 games)")

    expect(german).not.toBe(english)
  })

  it("leaves counts below a thousand without any separator", () => {
    expect(formatPatchWindowSummary(BELOW_THOUSAND, tDe, "de")).toBe("14.14 (30%, 842 Games)")
    expect(formatPatchWindowSummary(BELOW_THOUSAND, tEn, "en")).toBe("14.14 (30%, 842 games)")

    // Stated the other way round too: no grouping mark of either language may
    // appear next to the count. The patch NUMBER carries a dot ("14.14"), so
    // this is checked on the digits, not on the whole string.
    for (const { name, t, lang } of CASES) {
      const rendered = formatPatchWindowSummary(BELOW_THOUSAND, t, lang)
      expect(rendered, `lang: ${name}`).toContain(" 842 ")
      expect(rendered, `lang: ${name}`).not.toContain("0.842")
      expect(rendered, `lang: ${name}`).not.toContain("0,842")
    }
  })
})

/* ==========================================================================
 * 4. The noun
 * ========================================================================== */

describe("the counted noun comes from the catalogue, not from the code", () => {
  it("renders dh_gamesCountMany, capitalised in German and lower case in English", () => {
    // SAME INTENT AS BEFORE 0.6.1, retargeted: this test proves the noun is
    // looked up rather than welded into the segment. Only the key changed
    // (`dh_games` -> the `dh_gamesCount*` pair); the assertion that carries the
    // weight is still `english` NOT containing a capital `Games`, because that
    // is what a hardcoded noun coming back looks like - including a hardcoded
    // noun with a `count === 1 ? "" : "s"` suffix bolted on, which cannot fix
    // the case.
    const german = formatPatchWindowSummary(ONE, tDe, "de")
    const english = formatPatchWindowSummary(ONE, tEn, "en")

    expect(german).toContain(" Games)")
    expect(
      english,
      "a capital 'Games' in the English output is the hardcoded noun coming " +
        "back: the segment used to end in a welded-in ' Games' while the " +
        "catalogue already owned the noun.",
    ).not.toContain("Games")
    expect(english).toContain(" games)")

    // And the values really are the catalogue's, not a coincidence of spelling.
    // Built from the raw catalogue string rather than from the helper, so this
    // stays an independent check instead of comparing the code to itself.
    const germanSegment = de.dh_gamesCountMany.split("{count}").join("4.821")
    const englishSegment = en.dh_gamesCountMany.split("{count}").join("4,821")

    expect(germanSegment, "sanity: the fixture count really is four digits").toContain("4.821")
    expect(german.endsWith(`${germanSegment})`)).toBe(true)
    expect(english.endsWith(`${englishSegment})`)).toBe(true)
  })

  it("takes the SINGULAR from the catalogue when a patch has exactly one match", () => {
    // The reachable case, and the reason 0.6.1 happened at all: a patch enters
    // `summaries` only if it has matches, so `rawMatches` starts at 1. The
    // segment read "14.16 (100%, 1 Games)" in German and "1 games" in English.
    const one = patchWindow({ patch: "14.16", rawMatches: 1, weight: 100, weightedMatches: 1 })

    expect(formatPatchWindowSummary(one, tDe, "de")).toBe("14.16 (100%, 1 Game)")
    expect(
      formatPatchWindowSummary(one, tEn, "en"),
      "the whole point of the change: '1 games' is what shipped.",
    ).toBe("14.16 (100%, 1 game)")
  })
})

/* ==========================================================================
 * 4b. Nothing else about the segment moved
 * ========================================================================== */

describe("the patch segment is byte-identical to 0.6.0 for every count except 1", () => {
  it("renders the pre-0.6.1 wording for 0, 2 and every larger count", () => {
    // THE DESIGN GOAL OF THE CHANGE, asserted rather than assumed. Until 0.6.1
    // the segment was assembled as
    //
    //     `${formatNumber(n, lang)} ${t("dh_games")}`
    //
    // with dh_games = "Games" / "games". Those two literals are reconstructed
    // here - the key itself is gone - so the old sentence is rebuilt from the
    // outside and compared against what the new pair produces. Every pinned
    // string elsewhere in this file is a four-, three- or one-thousand-and-
    // something count and was written before the change, which is the other
    // half of the same proof; this test states it in one place and covers the
    // boundary neighbours 0 and 2 explicitly.
    const legacyNoun: Record<Lang, string> = { de: "Games", en: "games" }
    const counts = [0, 2, 3, 842, 1200, 4821] as const

    let checked = 0
    for (const count of counts) {
      for (const { name, t, lang } of CASES) {
        const legacy = `${count.toLocaleString(lang === "de" ? "de-DE" : "en-US")} ${legacyNoun[lang]}`
        expect(formatDraftGamesCount(t, count, lang), `${count} / ${name}`).toBe(legacy)
        checked += 1
      }
    }

    expect(checked).toBe(12)

    // 1 is the ONE count that deliberately differs, and it must.
    expect(formatDraftGamesCount(tDe, 1, "de")).not.toBe(`1 ${legacyNoun.de}`)
    expect(formatDraftGamesCount(tEn, 1, "en")).not.toBe(`1 ${legacyNoun.en}`)
  })
})

/* ==========================================================================
 * 5. The separator and the ordering
 * ========================================================================== */

describe("formatPatchWindowSummary with several summaries", () => {
  it("joins two summaries with a middle dot and keeps their order", () => {
    expect(formatPatchWindowSummary(TWO, tDe, "de")).toBe(
      "14.16 (100%, 4.821 Games) · 14.15 (60%, 1.200 Games)",
    )
    expect(
      formatPatchWindowSummary(TWO, tEn, "en"),
      "order matters as much as the separator: the newest patch is first in " +
        "`summaries` and must stay first on screen.",
    ).toBe("14.16 (100%, 4,821 games) · 14.15 (60%, 1,200 games)")

    expect(formatPatchWindowSummary(TWO, tDe, "de")).not.toBe(
      formatPatchWindowSummary(TWO, tEn, "en"),
    )
  })

  it("uses exactly one separator between three summaries and none at the ends", () => {
    const three = patchWindow(CURRENT, PREVIOUS, SMALL)
    const rendered = formatPatchWindowSummary(three, tEn, "en")

    expect(rendered).toBe(
      "14.16 (100%, 4,821 games) · 14.15 (60%, 1,200 games) · 14.14 (30%, 842 games)",
    )
    expect(rendered.split(" · ")).toHaveLength(3)
    expect(rendered.startsWith("14.16")).toBe(true)
    expect(rendered.endsWith(")")).toBe(true)
  })
})

/* ==========================================================================
 * 6. The percentage
 * ========================================================================== */

describe("the percentage stays locale-neutral and ungrouped", () => {
  it("prints a whole weight plainly, with the sign attached", () => {
    expect(formatPatchWindowSummary(ONE, tDe, "de")).toContain("(100%,")
    expect(formatPatchWindowSummary(ONE, tEn, "en")).toContain("(100%,")
    expect(formatPatchWindowSummary(TWO, tEn, "en")).toContain("(60%,")
  })

  it("does not run the weight through the number formatter", () => {
    // CHARACTERISATION, and honestly labelled: `weight` is 0-100 and the slider
    // only produces integers, so a fractional weight cannot arise today. It is
    // asserted anyway because it is the ONLY input that tells a plain
    // `${weight}` from a `formatNumber(weight, lang)` - German would render
    // "12,5%" through the formatter and "12.5%" without it. A future edit that
    // routes the percentage "through the same helper for consistency" has to
    // go red here.
    const fractional = patchWindow({
      patch: "14.16",
      rawMatches: 4821,
      weight: 12.5,
      weightedMatches: 603,
    })

    expect(formatPatchWindowSummary(fractional, tDe, "de")).toBe("14.16 (12.5%, 4.821 Games)")
    expect(formatPatchWindowSummary(fractional, tEn, "en")).toBe("14.16 (12.5%, 4,821 games)")
  })

  it("a weight of zero renders the zero, it does not render blank", () => {
    // Also characterisation: `weightedPatchWindow` skips a patch at weight <= 0,
    // so this summary cannot be produced today. Pinned for the same reason the
    // rest of the project pins its zeroes - a falsy guard added later would eat
    // a real 0 and print "(%," on screen.
    const zero = patchWindow({ patch: "14.10", rawMatches: 4821, weight: 0, weightedMatches: 0 })

    expect(formatPatchWindowSummary(zero, tDe, "de")).toBe("14.10 (0%, 4.821 Games)")
    expect(formatPatchWindowSummary(zero, tEn, "en")).toBe("14.10 (0%, 4,821 games)")
  })
})

/* ==========================================================================
 * 7. Placeholders and the shape of the summary type
 * ========================================================================== */

describe("formatPatchWindowSummary leaves no placeholder behind", () => {
  it("prints no braces, in any branch or language", () => {
    const fixtures: ReadonlyArray<readonly [string, PatchWindowData]> = [
      ["empty", EMPTY],
      ["one", ONE],
      ["two", TWO],
      ["below a thousand", BELOW_THOUSAND],
    ]

    let checked = 0
    for (const [label, data] of fixtures) {
      for (const { name, t, lang } of CASES) {
        const rendered = formatPatchWindowSummary(data, t, lang)
        expect(
          rendered,
          `${label} / ${name}: there is no app-wide substitution layer in this ` +
            "project and no guard that a placeholder was filled, so a key " +
            "written as '{patch} ({weight}%, {games} Games)' would render " +
            "literal braces on screen while every other test stayed green.",
        ).not.toContain("{")
        expect(rendered, `${label} / ${name}`).not.toContain("}")
        checked += 1
      }
    }

    // A guard against an empty loop: without this the block above would pass
    // while asserting nothing if a fixture list were ever emptied.
    expect(checked).toBe(8)
  })
})

describe("PatchWindowSummary", () => {
  it("has exactly the four fields the segment was written against", () => {
    // `weightedMatches` is deliberately NOT rendered (see "prints the raw match
    // count" above). If a fifth field appears, the compile error on
    // ALL_SUMMARY_KEYS lands first; this assertion is the runtime half, so the
    // decision to leave a field out stays a decision rather than an oversight.
    expect(Object.keys(ALL_SUMMARY_KEYS).sort()).toEqual([
      "patch",
      "rawMatches",
      "weight",
      "weightedMatches",
    ])
  })
})

/* ==========================================================================
 * 8. formatDraftGamesCount - the counted noun, on its own
 *
 * The helper the patch segment above delegates to, and the one PatchWeightPanel
 * and the two sample lines in DraftHelper call directly. Tested here without a
 * PatchWindowData around it, because "1 Games" was a defect of the NOUN, not of
 * the segment, and those other three call sites carry it too.
 * ========================================================================== */

describe("formatDraftGamesCount", () => {
  it("one game reads as a singular in both languages", () => {
    // THE CASE THE BUG SHIPPED, and the only case that discriminates: 0, 2 and
    // 4821 render identically before and after the fix, so a suite that checked
    // only those stayed green through the entire defect. CLAUDE.md states this
    // twice, and this assertion is what it means.
    expect(formatDraftGamesCount(tDe, 1, "de")).toBe("1 Game")
    expect(
      formatDraftGamesCount(tEn, 1, "en"),
      "'1 games' is what a user actually read. A swapped key pair, a " +
        "`count === 0 ? one : many` rule and a plain plural key all land here.",
    ).toBe("1 game")
  })

  it("two games read as a plural in both languages", () => {
    expect(formatDraftGamesCount(tDe, 2, "de")).toBe("2 Games")
    expect(formatDraftGamesCount(tEn, 2, "en")).toBe("2 games")
  })

  it("zero games read as a plural in both languages", () => {
    // CLAUDE.md: `count === 1` takes the singular, EVERYTHING else including 0
    // takes the plural. "0 Games" and "0 games" are correct in both languages,
    // "0 Game" is not. This is the second half that kills a
    // `count === 0 ? one : many` rule, which renders the singular here.
    expect(formatDraftGamesCount(tDe, 0, "de")).toBe("0 Games")
    expect(formatDraftGamesCount(tEn, 0, "en")).toBe("0 games")
  })

  it("groups the game count the way the language does", () => {
    // GROUPED. All three call sites already ran the number through
    // `formatNumber` before 0.6.1, and keeping that is what makes the output
    // byte-identical for every count except 1. The picks helper below was the
    // odd one out for one version and caught up in 0.6.2; this side never
    // moved, which is why it is the reference in the symmetry test.
    expect(formatDraftGamesCount(tDe, 4821, "de")).toBe("4.821 Games")
    expect(formatDraftGamesCount(tEn, 4821, "en")).toBe("4,821 games")

    expect(
      formatDraftGamesCount(tDe, 4821, "de"),
      "if these two are equal the helper is ignoring either `lang` or `t`.",
    ).not.toBe(formatDraftGamesCount(tEn, 4821, "en"))

    // Stated the other way round as well: neither language may borrow the
    // other's separator. The full strings are pinned above, so this pair is
    // only about naming the failure clearly when it happens.
    expect(formatDraftGamesCount(tEn, 4821, "en")).not.toContain("4.821")
    expect(formatDraftGamesCount(tDe, 4821, "de")).not.toContain("4,821")
  })

  it("leaves no {count} behind, in any language or count", () => {
    // There is no app-wide substitution layer and no guard that a placeholder
    // was ever filled (see the header of src/i18n/plural.ts), so a helper that
    // forgot to substitute would print literal braces on screen. Every full
    // string above would go red too; this one names the cause.
    let checked = 0
    for (const count of [0, 1, 2, 42, 4821]) {
      for (const { name, t, lang } of CASES) {
        const rendered = formatDraftGamesCount(t, count, lang)
        expect(rendered, `${count} / ${name}`).not.toContain("{count}")
        expect(rendered, `${count} / ${name}`).not.toContain("{")
        expect(rendered, `${count} / ${name}`).not.toContain("}")
        checked += 1
      }
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(10)
  })

  it("takes the plural for a negative count", () => {
    // CHARACTERISATION, honestly labelled: NOT REACHABLE today. `rawMatches`,
    // `rawSample` and `weightedSample` all count array entries. Pinned because
    // `pluralKey` is documented as `=== 1` and nothing else, so a later
    // `Math.abs(count) === 1` would be a silent change of that rule.
    expect(formatDraftGamesCount(tDe, -1, "de")).toBe("-1 Games")
    expect(formatDraftGamesCount(tEn, -1, "en")).toBe("-1 games")
  })

  it("takes the plural for a fractional count", () => {
    // CHARACTERISATION, also unreachable: every caller passes an integer. The
    // load-bearing half is that 1.5 is NOT `=== 1` and so must not take the
    // singular. The decimal mark doubles as a second locale probe.
    expect(formatDraftGamesCount(tDe, 1.5, "de")).toBe("1,5 Games")
    expect(formatDraftGamesCount(tEn, 1.5, "en")).toBe("1.5 games")
  })
})

/* ==========================================================================
 * 9. formatDraftPicksCount - same rule, and since 0.6.2 the same number format
 *
 * The header of this section used to end "deliberately different number
 * format". That was true for exactly one version: 0.6.1 left the number raw so
 * its numerus fix would not also change what the recommendation row looked
 * like, and froze that in a test so the follow-up could not be forgotten. 0.6.2
 * is the follow-up. Section 10 below pins the agreement the two helpers now owe
 * each other.
 * ========================================================================== */

describe("formatDraftPicksCount", () => {
  it("one pick reads as a singular in both languages", () => {
    // Reachable, and it shipped: the min-picks input is `min={1}`, so a
    // champion with a single pick rendered "1 Picks" in BOTH languages. The
    // English build borrowed the German Title Case header key as well.
    //
    // UNTOUCHED BY 0.6.2 except for the new `lang` argument, and that is the
    // requirement, not a coincidence: grouping must not disturb the numerus.
    // This is also the ONLY case that kills a `count === 0 ? one : many` rule,
    // which renders the plural here while 2 and 1234 look identical either way.
    expect(formatDraftPicksCount(tDe, 1, "de")).toBe("1 Pick")
    expect(formatDraftPicksCount(tEn, 1, "en")).toBe("1 pick")
  })

  it("two picks read as a plural in both languages", () => {
    expect(formatDraftPicksCount(tDe, 2, "de")).toBe("2 Picks")
    expect(formatDraftPicksCount(tEn, 2, "en")).toBe("2 picks")
  })

  it("zero picks read as a plural in both languages", () => {
    // The second half that kills `count === 0 ? one : many`: it renders the
    // singular here. "0 Picks" and "0 picks" are correct in both languages.
    expect(formatDraftPicksCount(tDe, 0, "de")).toBe("0 Picks")
    expect(formatDraftPicksCount(tEn, 0, "en")).toBe("0 picks")
  })

  it("groups the pick count the way the language does", () => {
    // THIS PIN WAS TURNED OVER IN 0.6.2, and the direction of travel is the
    // point of the comment. It used to read "does not group the pick count, in
    // either language" and asserted `1234 Picks` / `1234 picks`.
    //
    // That was not an oversight and not a preference. 0.6.1 moved this call
    // site off a table-header key onto a plural pair and deliberately left the
    // number raw, because the old JSX rendered `{entry.games}` unformatted and
    // grouping would have been a visible change that fix had not been asked
    // for. So it FROZE the ungrouped output here on purpose, precisely so the
    // follow-up would have to come back to this test and turn it over rather
    // than let the two spellings drift apart unnoticed. That is what happened:
    // the helper now takes a `lang` and routes the number through
    // `formatNumber`, and the pin below is the inverse of the one it replaces.
    //
    // Read the pair of assertions as "1234 Picks is now WRONG". The old
    // expectation is asserted against explicitly two blocks down, so the
    // reversal cannot quietly reverse itself again.
    expect(formatDraftPicksCount(tDe, 1234, "de")).toBe("1.234 Picks")
    expect(formatDraftPicksCount(tEn, 1234, "en")).toBe("1,234 picks")

    expect(
      formatDraftPicksCount(tDe, 1234, "de"),
      "if these two are equal the helper is ignoring either `lang` or `t` - a " +
        "hardcoded 'de' inside it lands exactly here.",
    ).not.toBe(formatDraftPicksCount(tEn, 1234, "en"))

    // CONTROL: the two locales really do disagree about this number, so the
    // pair above is a statement about the formatter and not about 1234.
    expect((1234).toLocaleString("de-DE")).toBe("1.234")
    expect((1234).toLocaleString("en-US")).toBe("1,234")

    // Stated the other way round as well, mirroring the games helper: neither
    // language may borrow the other's separator, and neither may fall back to
    // the raw digits the previous version of this test pinned.
    expect(formatDraftPicksCount(tEn, 1234, "en")).not.toContain("1.234")
    expect(formatDraftPicksCount(tDe, 1234, "de")).not.toContain("1,234")
    expect(
      formatDraftPicksCount(tDe, 1234, "de"),
      "'1234 Picks' is the 0.6.1 output this test used to require.",
    ).not.toBe("1234 Picks")
    expect(formatDraftPicksCount(tEn, 1234, "en")).not.toBe("1234 picks")
  })

  it("leaves counts below a thousand without any separator", () => {
    // The other half of the grouping claim: 0.6.2 added a separator where one
    // belongs, it did not sprinkle punctuation into every number. 41 is below
    // the grouping threshold of both locales, so the digits stand alone in
    // German and in English alike.
    expect(formatDraftPicksCount(tDe, 41, "de")).toBe("41 Picks")
    expect(formatDraftPicksCount(tEn, 41, "en")).toBe("41 picks")

    for (const { name, t, lang } of CASES) {
      const rendered = formatDraftPicksCount(t, 41, lang)
      expect(rendered, `lang: ${name}`).not.toContain(".")
      expect(rendered, `lang: ${name}`).not.toContain(",")
    }

    // The boundary itself, so "below a thousand" is a claim about 1000 and not
    // about the two digits above.
    expect(formatDraftPicksCount(tDe, 999, "de")).toBe("999 Picks")
    expect(formatDraftPicksCount(tDe, 1000, "de")).toBe("1.000 Picks")
    expect(formatDraftPicksCount(tEn, 999, "en")).toBe("999 picks")
    expect(formatDraftPicksCount(tEn, 1000, "en")).toBe("1,000 picks")
  })

  it("leaves no {count} behind, in any language or count", () => {
    let checked = 0
    for (const count of [0, 1, 2, 41, 42, 1234, 4821, -1, 1.5]) {
      for (const { name, t, lang } of CASES) {
        const rendered = formatDraftPicksCount(t, count, lang)
        expect(rendered, `${count} / ${name}`).not.toContain("{count}")
        expect(rendered, `${count} / ${name}`).not.toContain("{")
        expect(rendered, `${count} / ${name}`).not.toContain("}")
        checked += 1
      }
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(18)
  })

  it("takes the plural for a negative count", () => {
    // CHARACTERISATION, unreachable: `entry.games` counts array entries.
    // RE-VERIFIED after 0.6.2 by running the helper: neither locale decorates a
    // single-digit negative, so the strings are the same as before the change.
    // Only the fractional sibling above moved.
    expect(formatDraftPicksCount(tDe, -1, "de")).toBe("-1 Picks")
    expect(formatDraftPicksCount(tEn, -1, "en")).toBe("-1 picks")
  })

  it("takes the plural for a fractional count, and now spells it in German", () => {
    // THE SECOND PIN TURNED OVER IN 0.6.2, and the more interesting of the two.
    // It used to assert `1.5 Picks` / `1.5 picks` - the SAME string in both
    // languages, because `String(1.5)` is locale-neutral. 0.6.1 wrote that down
    // as a wart of not grouping: a German user would have read an English
    // decimal point in German copy. Routing the helper through `formatNumber`
    // removed the wart as a side effect, so German now says `1,5 Picks` with a
    // comma, which is what German does with a decimal mark.
    //
    // Verified by running the helper, not by reasoning about `Intl`.
    expect(formatDraftPicksCount(tDe, 1.5, "de")).toBe("1,5 Picks")
    expect(formatDraftPicksCount(tEn, 1.5, "en")).toBe("1.5 picks")

    expect(
      formatDraftPicksCount(tDe, 1.5, "de"),
      "the wart itself: while these two are equal the German output is " +
        "carrying an English decimal point, which is the 0.6.1 behaviour.",
    ).not.toBe(formatDraftPicksCount(tEn, 1.5, "en"))
    expect(formatDraftPicksCount(tDe, 1.5, "de")).not.toBe("1.5 Picks")

    // STILL CHARACTERISATION, and still unreachable: `entry.games` counts array
    // entries. The load-bearing half is unchanged by the reversal - 1.5 is NOT
    // `=== 1`, so it must take the PLURAL noun, comma or no comma.
    expect(formatDraftPicksCount(tDe, 1.5, "de")).toContain("Picks")
    expect(formatDraftPicksCount(tEn, 1.5, "en")).toContain("picks")

    // CONTROL: the decimal mark really is the locale's, so the pair above is a
    // statement about the formatter rather than about 1.5.
    expect((1.5).toLocaleString("de-DE")).toBe("1,5")
    expect((1.5).toLocaleString("en-US")).toBe("1.5")
  })
})

/* ==========================================================================
 * 10. The two helpers spell their number the same way
 *
 * THE ACTUAL POINT OF 0.6.2, asserted directly instead of being implied by two
 * separate literals in two separate describes. One recommendation subtitle in
 * DraftHelper prints a pick count, and the sample line a few rows down prints a
 * game count; until 0.6.2 the same magnitude was spelled `1234` in one and
 * `1.234` in the other, one above the other on the same screen.
 *
 * This whole describe was RED before the change - `1234 Picks` against
 * `1.234 Games` - and that is what makes it a test rather than a restatement.
 * ========================================================================== */

describe("formatDraftPicksCount and formatDraftGamesCount", () => {
  /**
   * The rendered number, with the catalogue's noun peeled off.
   *
   * Derived from the catalogue template rather than from a `split(" ")`, so it
   * keeps working if a number ever contains a space (a narrow no-break space is
   * what `fr-FR` groups with) and so it cannot silently return the whole string
   * when the noun changes. The round-trip assertion is what enforces that.
   */
  function countPart(rendered: string, template: string, label: string): string {
    const [before, after] = template.split("{count}")
    expect(before, `${label}: template shape`).toBe("")
    expect(rendered.endsWith(after), `${label}: '${rendered}' should end in '${after}'`).toBe(true)

    const part = rendered.slice(0, rendered.length - after.length)
    expect(`${part}${after}`, `${label}: round-trip`).toBe(rendered)
    return part
  }

  it("spells the same count identically in both helpers, in both languages", () => {
    const counts = [0, 1, 2, 41, 999, 1000, 1234, 4821, -1, 1.5] as const

    let checked = 0
    for (const count of counts) {
      for (const { name, t, lang } of CASES) {
        const picksTemplate = count === 1 ? t("dh_picksCountOne") : t("dh_picksCountMany")
        const gamesTemplate = count === 1 ? t("dh_gamesCountOne") : t("dh_gamesCountMany")

        const picks = countPart(
          formatDraftPicksCount(t, count, lang),
          picksTemplate,
          `picks ${count} / ${name}`,
        )
        const games = countPart(
          formatDraftGamesCount(t, count, lang),
          gamesTemplate,
          `games ${count} / ${name}`,
        )

        expect(
          picks,
          `${count} / ${name}: the two counts sit on the same screen. Until ` +
            "0.6.2 this was '1234' against '1.234' for the same magnitude, " +
            "which is the defect 0.6.2 closed.",
        ).toBe(games)
        checked += 1
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(20)
  })

  it("agrees on a number that the two languages spell differently", () => {
    // ANTI-VACUITY for the loop above: agreement on '41' would hold even if
    // both helpers had lost the formatter. These four literals are what make
    // the agreement mean "both group", and they differ per language, so a
    // helper that agreed with the other by ignoring `lang` fails here too.
    expect(formatDraftPicksCount(tDe, 1234, "de")).toBe("1.234 Picks")
    expect(formatDraftGamesCount(tDe, 1234, "de")).toBe("1.234 Games")
    expect(formatDraftPicksCount(tEn, 1234, "en")).toBe("1,234 picks")
    expect(formatDraftGamesCount(tEn, 1234, "en")).toBe("1,234 games")

    // And the nouns still differ, so "identical number part" is not hiding two
    // identical strings.
    expect(formatDraftPicksCount(tDe, 1234, "de")).not.toBe(
      formatDraftGamesCount(tDe, 1234, "de"),
    )
  })

  it("still disagrees about the noun, and still agrees about the rule", () => {
    // The symmetry is about the NUMBER only. Picks stay picks.
    expect(formatDraftPicksCount(tDe, 1, "de")).toBe("1 Pick")
    expect(formatDraftGamesCount(tDe, 1, "de")).toBe("1 Game")
    expect(formatDraftPicksCount(tEn, 1, "en")).toBe("1 pick")
    expect(formatDraftGamesCount(tEn, 1, "en")).toBe("1 game")
  })
})
