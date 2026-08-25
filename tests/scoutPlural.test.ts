/**
 * Singular/plural correctness of the visible Tournament Scout copy.
 *
 * THE DEFECT THIS FILE FREEZES: at a count of exactly 1 the Scout wrote
 * "Übernommen: 1 Champion-Zeilen.", "betroffen sind 1 Einträge" and
 * "Nur 1 Games, kleine Sample Size." The same class of error had already been
 * fixed on the team dashboard with `One`/`Many` key pairs
 * (`team_membersOne`/`team_membersMany`, see tests/teamUiHelpers.test.ts);
 * this is the Scout half of that rule.
 *
 * A fourth sentence of the same class, "Ohne Referenzdaten beurteilt:
 * 1 Champions.", survived until 0.7.6 — not because anyone decided it was
 * acceptable, but because every section of this file worked from a hand-written
 * list and `scout_roleGate_unjudged` was on none of them. It did not appear
 * anywhere under tests/ at all. Section 9 is the answer to that, and section 4
 * is the sentence itself.
 *
 * The mechanism under test:
 *  - src/i18n/plural.ts holds the neutral rule — `PluralKeys` and
 *    `pluralKey(count, keys)`. `count === 1` picks `one`, everything else
 *    (0, 2, negative, fractional) picks `many`.
 *  - src/components/scout/scoutUiHelpers.ts holds the Scout bindings:
 *    `scoutPluralMessage()` plus the four exported `PluralKeys` constants for
 *    the import panel, and a table that maps the *mechanical* families
 *    (`scout_reason_*`, `scout_warning_*`) onto their `...One` siblings so
 *    `translateScoutReason()` / `translateScoutWarning()` pick by themselves.
 *
 * How the assertions are split, on purpose:
 *  - Sections 1 to 4 pin four sentences WORD FOR WORD in both languages: the
 *    three that were reported, plus the one section 9 turned up. Those exact
 *    forms are the requirement itself, so this file breaks the project's usual
 *    "never assert on wording" rule for them and for nothing else.
 *  - Section 5 loops over the remaining five fixed keys and checks the
 *    *properties* that make a sentence singular (no plural noun, singular
 *    verb) rather than the full sentence, so re-wording stays free.
 *  - Sections 7 and 8 are the guards in the other direction: keys that must
 *    NOT have grown a sibling, and hygiene for the ones that did.
 *  - Section 9 is the completeness sweep. Sections 1 to 8 are only ever as
 *    good as the lists they were handed; the sweep walks the catalogue itself
 *    and insists that every counted key carry exactly one classification.
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) — no
 * jsdom, no document, no window. Everything below is a pure function over the
 * two catalogue objects, exactly like tests/scoutUiHelpers.test.ts.
 */

import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import { pluralKey } from "../src/i18n/plural"
import type { PluralKeys } from "../src/i18n/plural"
import type { TranslationKey } from "../src/i18n/types"
import { SCOUT_REMOVED_PLAYERS_MAX } from "../src/scout/types"
import type { ScoutTranslate } from "../src/components/scout/scoutUiHelpers"
import {
  SCOUT_IMPORT_APPLIED_KEYS,
  SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS,
  SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS,
  SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS,
  SCOUT_MORE_BANS_KEYS,
  SCOUT_MORE_COMFORT_KEYS,
  SCOUT_MORE_THREATS_KEYS,
  SCOUT_MORE_WEAKNESSES_KEYS,
  SCOUT_ROLE_GATE_UNJUDGED_KEYS,
  fillPlaceholders,
  scoutPluralMessage,
  translateCount,
  translateScoutReason,
  translateScoutWarning,
} from "../src/components/scout/scoutUiHelpers"

/* --------------------------------------------------------------------------
 * Test fixtures: the two real catalogues, wired the way the app wires them.
 *
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. The two `Record` views
 * exist so the generic loops below can walk the catalogues by computed name
 * (`${base}One`) — the same device tests/i18nScoutCopy.test.ts uses.
 * ------------------------------------------------------------------------ */

const tDe: ScoutTranslate = (key: TranslationKey): string => de[key]
const tEn: ScoutTranslate = (key: TranslationKey): string => en[key]

const DE: Record<string, string> = de
const EN: Record<string, string> = en

type Lang = "de" | "en"

const LANGS: ReadonlyArray<readonly [Lang, ScoutTranslate, Record<string, string>]> = [
  ["de", tDe, DE],
  ["en", tEn, EN],
]

/** Trim a value for a failure label so a long paragraph stays readable. */
const preview = (value: string): string => (value.length <= 160 ? value : `${value.slice(0, 160)}…`)

/* ==========================================================================
 * 1. The import success line — `scout_import_applied`
 *
 * The reported sentence. "Übernommen: 1 Champion-Zeilen." is what the user
 * saw after applying a single row.
 * ========================================================================== */

describe("scout_import_applied is declined for the count", () => {
  it("DE says 1 Champion-Zeile in the singular", () => {
    const text = scoutPluralMessage(tDe, 1, SCOUT_IMPORT_APPLIED_KEYS)

    expect(text, `de: "${text}"`).toContain("1 Champion-Zeile")
    // THE GEGENPROBE. "1 Champion-Zeile" is a prefix of "1 Champion-Zeilen",
    // so the `toContain` above passes on the broken text too — this line is
    // the one that actually discriminates. "Übernommen: 1 Champion-Zeilen."
    // is verbatim what was on screen and what must never come back.
    expect(text, `de: "${text}"`).not.toContain("Champion-Zeilen")
  })

  it("DE says 2 Champion-Zeilen in the plural", () => {
    const text = scoutPluralMessage(tDe, 2, SCOUT_IMPORT_APPLIED_KEYS)
    expect(text, `de: "${text}"`).toContain("2 Champion-Zeilen")
  })

  it("EN says 1 champion row in the singular", () => {
    const text = scoutPluralMessage(tEn, 1, SCOUT_IMPORT_APPLIED_KEYS)

    expect(text, `en: "${text}"`).toContain("1 champion row")
    // Same Gegenprobe as above: "1 champion rows applied." was the English
    // half of the defect, and "1 champion row" is a prefix of it.
    expect(text, `en: "${text}"`).not.toContain("champion rows")
  })

  it("EN says 2 champion rows in the plural", () => {
    const text = scoutPluralMessage(tEn, 2, SCOUT_IMPORT_APPLIED_KEYS)
    expect(text, `en: "${text}"`).toContain("2 champion rows")
  })

  it("counts 0 as a plural, not a singular", () => {
    // Zero is a plural in both languages this app ships: "0 Champion-Zeilen"
    // and "0 champion rows" are correct.
    expect(scoutPluralMessage(tDe, 0, SCOUT_IMPORT_APPLIED_KEYS)).toContain("0 Champion-Zeilen")
    expect(scoutPluralMessage(tEn, 0, SCOUT_IMPORT_APPLIED_KEYS)).toContain("0 champion rows")
  })
})

/* ==========================================================================
 * 2. The substitute warning — `scout_warning_substitute_risk_active`
 *
 * "Substitutes werden mitgewertet, betroffen sind 1 Einträge." Two things are
 * wrong at once here, and the verb is the harder one: a test that only looked
 * at the noun would happily accept "betroffen sind 1 Eintrag".
 * ========================================================================== */

describe("scout_warning_substitute_risk_active agrees with its count", () => {
  const warn = (t: ScoutTranslate, count: number): string =>
    translateScoutWarning(t, {
      code: "substitute_risk_active",
      severity: "warning",
      params: { count },
    })

  it("DE uses the singular noun AND the singular verb at 1", () => {
    const text = warn(tDe, 1)

    expect(text, `de: "${text}"`).toContain("1 Eintrag")
    expect(text, `de: "${text}"`).not.toContain("Einträge")
    // The point of this test. "betroffen sind 1 Eintrag" would satisfy the two
    // lines above and still be wrong, so the verb is asserted on its own with
    // word boundaries rather than as part of a pinned sentence.
    expect(text, `de: "${text}"`).toMatch(/\bist\b/)
    expect(text, `de: "${text}"`).not.toMatch(/\bsind\b/)
  })

  it("DE uses the plural noun and the plural verb at 2", () => {
    const text = warn(tDe, 2)

    expect(text, `de: "${text}"`).toContain("2 Einträge")
    expect(text, `de: "${text}"`).toMatch(/\bsind\b/)
  })

  it("EN uses the singular noun AND the singular verb at 1", () => {
    const text = warn(tEn, 1)

    expect(text, `en: "${text}"`).toContain("1 entry")
    expect(text, `en: "${text}"`).not.toContain("entries")
    expect(text, `en: "${text}"`).toMatch(/\bis\b/)
    // NOTE — no `not.toMatch(/\bare\b/)` here, deliberately. The sentence opens
    // with "Substitutes are being scored", which is a correct plural about the
    // feature and has nothing to do with the entry count. Forbidding "are"
    // outright would fail a perfectly good singular rendering.
  })

  it("EN uses the plural noun and the plural verb at 2", () => {
    const text = warn(tEn, 2)

    expect(text, `en: "${text}"`).toContain("2 entries")
    // A bare /\bare\b/ would be VACUOUS here, and a mutation probe proved it:
    // the sentence already opens with "Substitutes are being scored", so it
    // matched even on the mutant that rendered "2 entry is affected".
    // Asserting the noun and its verb ADJACENT is what checks the agreement.
    expect(text, `en: "${text}"`).toMatch(/\b2 entries are\b/)
  })
})

/* ==========================================================================
 * 3. The thin-sample reason — `scout_reason_small_sample`
 *
 * "Nur 1 Games, kleine Sample Size." The count travels in `{games}`, not in
 * `{count}`, which is why the mapping table in scoutUiHelpers.ts has to name
 * the counting parameter per code instead of assuming one.
 * ========================================================================== */

describe("scout_reason_small_sample is declined for {games}", () => {
  const reason = (t: ScoutTranslate, games: number): string =>
    translateScoutReason(t, { code: "small_sample", params: { games } })

  it("DE says 1 Game, never 1 Games", () => {
    const text = reason(tDe, 1)

    expect(text, `de: "${text}"`).toContain("1 Game")
    // "1 Game" is a prefix of "1 Games" — this is the discriminating line.
    expect(text, `de: "${text}"`).not.toContain("Games")
  })

  it("DE says 2 Games", () => {
    expect(reason(tDe, 2)).toContain("2 Games")
  })

  it("EN says 1 game, never 1 games", () => {
    const text = reason(tEn, 1)

    expect(text, `en: "${text}"`).toContain("1 game")
    expect(text, `en: "${text}"`).not.toContain("games")
  })

  it("EN says 2 games", () => {
    expect(reason(tEn, 2)).toContain("2 games")
  })

  it("falls back to the plural form when the engine ships no count at all", () => {
    // `params` is optional on ScoutReason. A missing count must not be read as
    // "one" — that would put the singular sentence on screen for a reason that
    // never stated a number. With no `{games}` to substitute,
    // `fillPlaceholders()` removes the placeholder, so the plural noun is what
    // is left over and what proves which template was picked.
    const text = translateScoutReason(tDe, { code: "small_sample" })
    expect(text, `de: "${text}"`).toContain("Games")
  })
})

/* ==========================================================================
 * 4. The role-gate note — `scout_roleGate_unjudged`
 *
 * "Ohne Referenzdaten beurteilt: 1 Champions." Nobody reported this one and no
 * test looked at it; the completeness sweep in section 9 is what found it, in
 * 0.7.6. The number is `analysis.roleGate.unjudgedChampions`, which is the size
 * of `unjudgedChampionKeys` and can be 1 as easily as any other value, and
 * ScoutBanPlanPanel.tsx renders it inside the collapsed role-gate details.
 *
 * Pinned WORD FOR WORD like sections 1 to 3. The sentence is short and has no
 * moving part except the number, and which of the two nouns follows that number
 * is the entire fix, so there is nothing here that a property assertion would
 * express more robustly than the sentence itself.
 * ========================================================================== */

describe("scout_roleGate_unjudged is declined for the count", () => {
  const note = (t: ScoutTranslate, count: number): string =>
    scoutPluralMessage(t, count, SCOUT_ROLE_GATE_UNJUDGED_KEYS)

  it("DE says 1 Champion in the singular", () => {
    // THE ONLY DISCRIMINATOR IN THIS BLOCK. At 2 the broken catalogue and the
    // fixed one render the identical sentence, so the two plural tests below
    // would have stayed green on "Ohne Referenzdaten beurteilt: 1 Champions."
    // for as long as it was on screen. `toBe` on the whole sentence rather than
    // `toContain`: "... 1 Champion." is a prefix of "... 1 Champions.", so
    // anything weaker passes on the broken text too.
    expect(note(tDe, 1)).toBe("Ohne Referenzdaten beurteilt: 1 Champion.")
  })

  it("DE says 2 Champions in the plural", () => {
    expect(note(tDe, 2)).toBe("Ohne Referenzdaten beurteilt: 2 Champions.")
  })

  it("EN says 1 champion in the singular", () => {
    // Same discriminator, English half: "1 champions." was what shipped.
    expect(note(tEn, 1)).toBe("Judged without reference data: 1 champion.")
  })

  it("EN says 2 champions in the plural", () => {
    expect(note(tEn, 2)).toBe("Judged without reference data: 2 champions.")
  })
})

/* ==========================================================================
 * 5. The other five fixed keys
 *
 * A loop rather than five copied blocks: every case answers the same two
 * questions ("what must the text say at 1" / "at 2"), and writing them as a
 * table keeps the intent visible instead of burying it in repetition.
 *
 * The expectations are properties, not sentences — a plural noun that must be
 * absent, a verb that must agree. Re-wording any of these strings stays free
 * as long as the grammar stays right.
 * ========================================================================== */

type Pattern = string | RegExp

interface LangExpectation {
  /** Must appear in the singular (count = 1) rendering. */
  readonly one: readonly Pattern[]
  /** Must NOT appear in the singular rendering — the discriminating half. */
  readonly notOne: readonly Pattern[]
  /** Must appear in the plural (count = 2) rendering. */
  readonly many: readonly Pattern[]
}

interface CountedCase {
  readonly label: string
  readonly render: (t: ScoutTranslate, count: number) => string
  readonly de: LangExpectation
  readonly en: LangExpectation
}

function expectAll(text: string, patterns: readonly Pattern[], label: string): void {
  for (const pattern of patterns) {
    if (typeof pattern === "string") expect(text, `${label}: "${preview(text)}"`).toContain(pattern)
    else expect(text, `${label}: "${preview(text)}"`).toMatch(pattern)
  }
}

function expectNone(text: string, patterns: readonly Pattern[], label: string): void {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      expect(text, `${label}: "${preview(text)}"`).not.toContain(pattern)
    } else {
      expect(text, `${label}: "${preview(text)}"`).not.toMatch(pattern)
    }
  }
}

const COUNTED_CASES: readonly CountedCase[] = [
  {
    label: "scout_reason_high_winrate_small_sample",
    // Counts through `{games}`, like small_sample. `{winrate}` rides along and
    // must not disturb the choice.
    render: (t, count) =>
      translateScoutReason(t, {
        code: "high_winrate_small_sample",
        params: { winrate: 80, games: count },
      }),
    de: { one: ["1 Game"], notOne: ["Games"], many: ["2 Games"] },
    en: { one: ["1 game"], notOne: ["games"], many: ["2 games"] },
  },
  {
    label: "scout_import_opggRawChampions",
    render: (t, count) => scoutPluralMessage(t, count, SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS),
    de: { one: ["1 Champion"], notOne: ["Champions"], many: ["2 Champions"] },
    en: { one: ["1 champion"], notOne: ["champions"], many: ["2 champions"] },
  },
  {
    label: "scout_import_skippedMatchups",
    render: (t, count) => scoutPluralMessage(t, count, SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS),
    de: {
      // The follow-up sentence declines too: "Sie gehören zu einem Champion"
      // has to become "Er gehört zu einem Champion". The verb is asserted, not
      // the pronoun, so the wording stays the copywriter's choice.
      one: ["1 Matchup-Block", /\bgehört\b/],
      notOne: ["Matchup-Blöcke", /\bgehören\b/],
      many: ["2 Matchup-Blöcke", /\bgehören\b/],
    },
    en: {
      one: ["1 matchup block", /\bbelongs\b/],
      // `\bbelong\b` cannot match inside "belongs" (the trailing s is a word
      // character), so this really does forbid only the plural verb.
      notOne: ["matchup blocks", /\bbelong\b/],
      many: ["2 matchup blocks", /\bbelong\b/],
    },
  },
  {
    label: "scout_import_skippedRecommended",
    render: (t, count) => scoutPluralMessage(t, count, SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS),
    de: {
      // "Es sind Vorschläge von OP.GG" becomes "Es ist ein Vorschlag von
      // OP.GG". The adjective declines as well ("empfohlene Champions" ->
      // "empfohlener Champion"), which is exactly why this needs two whole
      // sentences and not a pluralised noun.
      one: [/\bVorschlag\b/],
      notOne: ["Champions", /\bVorschläge\b/, "Es sind"],
      many: ["2 ", "Champions", /\bVorschläge\b/],
    },
    en: {
      one: [/\bsuggestion\b/],
      notOne: ["champions", /\bsuggestions\b/],
      many: ["2 recommended champions", /\bsuggestions\b/],
    },
  },
  {
    label: "scout_warning_data_loss_on_reparse",
    render: (t, count) =>
      translateScoutWarning(t, {
        code: "data_loss_on_reparse",
        severity: "warning",
        params: { count },
      }),
    // ASYMMETRIC ON PURPOSE. Only the English half was broken ("1 players with
    // scouting data"); German "Spieler" is invariant, so "1 Spieler" was
    // already correct and the DE pair must keep saying exactly that at both
    // counts. Asserting DE anyway is what proves the fix did not "helpfully"
    // invent a German singular that differs.
    de: { one: ["1 Spieler"], notOne: [], many: ["2 Spieler"] },
    en: { one: ["1 player"], notOne: ["players"], many: ["2 players"] },
  },
]

describe("the remaining counted Scout strings decline in both languages", () => {
  for (const testCase of COUNTED_CASES) {
    for (const [lang, t] of LANGS) {
      const expectation = lang === "de" ? testCase.de : testCase.en

      it(`${testCase.label} (${lang}) reads as a singular at 1`, () => {
        const text = testCase.render(t, 1)

        expect(text.length, `${lang}.${testCase.label} rendered empty`).toBeGreaterThan(0)
        expectAll(text, expectation.one, `${lang}.${testCase.label} @1`)
        expectNone(text, expectation.notOne, `${lang}.${testCase.label} @1 (plural leaked)`)
        // A raw placeholder would make every other assertion here meaningless.
        expect(text, `${lang}.${testCase.label} @1`).not.toMatch(/\{\w+\}/)
      })

      it(`${testCase.label} (${lang}) reads as a plural at 2`, () => {
        const text = testCase.render(t, 2)

        expectAll(text, expectation.many, `${lang}.${testCase.label} @2`)
        expect(text, `${lang}.${testCase.label} @2`).not.toMatch(/\{\w+\}/)
      })
    }
  }
})

/* ==========================================================================
 * 6. `pluralKey()` itself
 * ========================================================================== */

describe("pluralKey", () => {
  /**
   * A narrow literal pair. Its second job is a compile-time one: the
   * annotation below only type-checks if `pluralKey` really is generic in `K`
   * and narrows its return type to the union of the two keys it was given. A
   * `pluralKey(): TranslationKey` would fail `npm run typecheck:tests`, which
   * is where that half of the contract is verified.
   */
  const NARROW = { one: "scout_countPlayers", many: "scout_countUnparsed" } as const

  it("picks `one` for exactly 1", () => {
    expect(pluralKey(1, SCOUT_IMPORT_APPLIED_KEYS)).toBe(SCOUT_IMPORT_APPLIED_KEYS.one)

    const narrowed: "scout_countPlayers" | "scout_countUnparsed" = pluralKey(1, NARROW)
    expect(narrowed).toBe("scout_countPlayers")
  })

  it("picks `many` for everything else, 0 included", () => {
    // 0 IS A PLURAL, deliberately: "0 Champion-Zeilen" and "0 champion rows"
    // are correct in both languages this app ships, "0 Champion-Zeile" is not.
    // The other three cases are the ones a "count > 1" or an `Math.abs()`
    // implementation would get wrong.
    for (const count of [0, 2, -1, 1.5]) {
      expect(pluralKey(count, SCOUT_IMPORT_APPLIED_KEYS), `count=${count}`).toBe(
        SCOUT_IMPORT_APPLIED_KEYS.many,
      )
    }
  })

  it("treats a non-finite count as a plural rather than throwing", () => {
    // Not a case the engine produces, but the honest answer for "not 1".
    expect(pluralKey(Number.NaN, SCOUT_IMPORT_APPLIED_KEYS)).toBe(SCOUT_IMPORT_APPLIED_KEYS.many)
    expect(pluralKey(Number.POSITIVE_INFINITY, SCOUT_IMPORT_APPLIED_KEYS)).toBe(
      SCOUT_IMPORT_APPLIED_KEYS.many,
    )
  })

  it("is pure: no mutation of the pair, same answer every time", () => {
    const pair: PluralKeys = { one: "scout_countPlayers", many: "scout_countUnparsed" }
    const snapshot = { ...pair }

    expect(pluralKey(1, pair)).toBe(pluralKey(1, pair))
    expect(pluralKey(7, pair)).toBe(pluralKey(7, pair))
    expect(pair).toEqual(snapshot)
  })

  it("is the rule scoutPluralMessage builds on", () => {
    // Not a re-implementation check: it states that the visible message and the
    // key chooser cannot disagree, which is the whole reason the rule was
    // extracted into src/i18n/plural.ts instead of being inlined twice.
    for (const [lang, t, dict] of LANGS) {
      for (const count of [0, 1, 2, 11]) {
        const key = pluralKey(count, SCOUT_IMPORT_APPLIED_KEYS)
        expect(scoutPluralMessage(t, count, SCOUT_IMPORT_APPLIED_KEYS), `${lang} @${count}`).toBe(
          fillPlaceholders(dict[key], { count }),
        )
      }
    }
  })
})

/* ==========================================================================
 * 7. The keys that were deliberately NOT touched
 *
 * The regression guard pointing the other way. Every key below either cannot
 * reach a count of 1 or is already correct at 1, so giving it a `...One`
 * sibling would create a string no user can ever see — dead copy that two
 * translators still have to maintain. This test is what stops the next person
 * from adding them "for completeness".
 * ========================================================================== */

/** key -> why a count of 1 is unreachable or harmless. */
const UNTOUCHED_COUNT_KEYS: ReadonlyArray<readonly [key: string, why: string]> = [
  ["scout_reason_high_winrate_many_games", "only raised for games >= 10"],
  ["scout_reason_high_games_low_winrate", "only raised for games >= 8"],
  // Stat weighting, added 2026-08-20. `{games}` counts, but the reason only
  // fires from 44 games up (the threshold analysis.ts derives from
  // SCOUT_STAT_REASON_MIN_IMPACT), so a singular is structurally unreachable.
  // `strong_kda` is absent from this list on purpose: it renders no number at
  // all, so it never enters the plural discussion in the first place.
  [
    "scout_reason_many_games_on_champion",
    "only raised from 44 games up, so a singular is unreachable",
  ],
  ["scout_reason_hits_multiple_players", "by construction at least 2 players"],
  // The overlap badge, added 2026-08-24 with the ban-plan de-duplication. It
  // renders only when `isOverlap` is true, and the engine sets that from
  // `affectedPlayerIds.length > 1` - so a count of 1 is unreachable for exactly
  // the same reason as the reason code above it.
  ["scout_banOverlapBadge", "only rendered when isOverlap, which means at least 2 players"],
  ["scout_removedPlayersCapped", "{max} is the constant SCOUT_REMOVED_PLAYERS_MAX, never a count"],
  ["scout_countPlayers", 'the "Label: {count}" shape reads correctly at any number'],
  ["scout_countUnparsed", 'the "Label: {count}" shape reads correctly at any number'],
  ["scout_countDuplicates", 'the "Label: {count}" shape reads correctly at any number'],
  ["scout_import_rowsDetected", 'the "Label: {count}" shape reads correctly at any number'],
  // Der Phasenfilter-Chip, 0.7.5. Buchstaeblich die "Label: {count}"-Form, und
  // das Label kommt aus einem eigenen Key. "Sicher: 1" ist in beiden Sprachen
  // richtig, es gibt nichts zu deklinieren.
  ["scout_banPhaseFilterCount", 'the "Label: {count}" shape reads correctly at any number'],
  // Der Overlap-Filter-Chip, 0.7.6. Dieselbe Form wie der Phasenfilter-Chip
  // darueber, sogar woertlich derselbe Wert "{label}: {count}".
  ["scout_banOverlapFilterCount", 'the "{label}: {count}" shape, and the label is its own key'],
  // Die beiden Datenqualitaets-Warnungen. Ihre Zahl steht HINTER dem
  // Doppelpunkt, es folgt ihr also kein Wort, das sich nach ihr richten muesste.
  ["scout_warning_player_without_lineup_role", 'the "Label: {count}." shape puts the number last'],
  ["scout_warning_offrole_data_present", 'the "Label: {count}." shape puts the number last'],
]

describe("the untouched counted keys stayed single", () => {
  it("still exist in both languages", () => {
    for (const [key] of UNTOUCHED_COUNT_KEYS) {
      for (const [lang, , dict] of LANGS) {
        expect(typeof dict[key], `${lang}.${key} is missing`).toBe("string")
        expect(dict[key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it("grew no One or Many sibling", () => {
    for (const [key, why] of UNTOUCHED_COUNT_KEYS) {
      for (const [lang, , dict] of LANGS) {
        expect(
          dict[`${key}One`],
          `${lang}.${key}One exists, but ${key} does not need a singular: ${why}`,
        ).toBeUndefined()
        expect(
          dict[`${key}Many`],
          `${lang}.${key}Many exists, but ${key} was never split: ${why}`,
        ).toBeUndefined()
      }
    }
  })

  it("still renders from its one and only template at a count of 1", () => {
    // The behavioural half: existence of a sibling is one failure mode, a
    // mapping table that quietly redirects an untouched code is another.
    expect(translateScoutReason(tDe, { code: "high_winrate_many_games", params: { winrate: 71, games: 1 } })).toBe(
      fillPlaceholders(de.scout_reason_high_winrate_many_games, { winrate: 71, games: 1 }),
    )
    expect(translateScoutReason(tEn, { code: "high_games_low_winrate", params: { games: 1, winrate: 41 } })).toBe(
      fillPlaceholders(en.scout_reason_high_games_low_winrate, { games: 1, winrate: 41 }),
    )
    expect(translateScoutReason(tDe, { code: "hits_multiple_players", params: { count: 1 } })).toBe(
      fillPlaceholders(de.scout_reason_hits_multiple_players, { count: 1 }),
    )

    for (const key of [
      "scout_countPlayers",
      "scout_countUnparsed",
      "scout_countDuplicates",
      "scout_import_rowsDetected",
    ] as const) {
      for (const [lang, t, dict] of LANGS) {
        expect(translateCount(t, key, 1), `${lang}.${key}`).toBe(
          fillPlaceholders(dict[key], { count: 1 }),
        )
      }
    }
  })

  it("keeps {max} out of the plural discussion entirely", () => {
    // `scout_removedPlayersCapped` has no count at all: `{max}` is a constant,
    // and 50 is not 1. If the constant ever became 1 this test says so, which
    // is the only situation in which the key would need a second form.
    expect(SCOUT_REMOVED_PLAYERS_MAX).toBeGreaterThan(1)
    for (const [lang, , dict] of LANGS) {
      expect(dict.scout_removedPlayersCapped, `${lang}`).toContain("{max}")
      expect(dict.scout_removedPlayersCapped, `${lang}`).not.toContain("{count}")
    }
  })
})

/* ==========================================================================
 * 8. i18n hygiene of the new keys
 *
 * tests/i18nScoutCopy.test.ts already enforces catalogue-wide parity and the
 * copy rules. This section re-states them for the fifteen pairs so a failure
 * names the pair that broke, and adds the one rule the generic tests cannot
 * express: a singular and its plural must carry the SAME placeholders.
 * ========================================================================== */

/**
 * The four mechanical families keep the PLURAL text on the base key and gain a
 * `...One` sibling — that is what lets `scout_reason_${code}` stay a template
 * literal that the compiler checks.
 */
const MECHANICAL_PLURAL_BASES = [
  "scout_reason_small_sample",
  "scout_reason_high_winrate_small_sample",
  "scout_warning_substitute_risk_active",
  "scout_warning_data_loss_on_reparse",
  // Added in 0.7.0. Both warnings became count-bearing because the engine now
  // states each of them ONCE per session with a number instead of once per
  // champion, so both can legitimately render a 1.
  "scout_warning_flex_pick_warning",
  "scout_warning_role_not_playable_filtered",
] as const

/**
 * The fifteen pairs. The nine constant-backed pairs are read off the exported constants
 * rather than spelled out, so this file cannot drift from the names the UI
 * actually uses.
 */
const NEW_KEY_PAIRS: ReadonlyArray<readonly [one: string, many: string]> = [
  [SCOUT_IMPORT_APPLIED_KEYS.one, SCOUT_IMPORT_APPLIED_KEYS.many],
  [SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS.one, SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS.many],
  [SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS.one, SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS.many],
  [SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS.one, SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS.many],
  [SCOUT_MORE_WEAKNESSES_KEYS.one, SCOUT_MORE_WEAKNESSES_KEYS.many],
  [SCOUT_MORE_BANS_KEYS.one, SCOUT_MORE_BANS_KEYS.many],
  [SCOUT_MORE_THREATS_KEYS.one, SCOUT_MORE_THREATS_KEYS.many],
  [SCOUT_MORE_COMFORT_KEYS.one, SCOUT_MORE_COMFORT_KEYS.many],
  // Added in 0.7.6. Note the shape: `many` is the PRE-EXISTING base key
  // `scout_roleGate_unjudged`, exactly like the mechanical families below, so
  // nothing that renders the note changes at any count except 1.
  [SCOUT_ROLE_GATE_UNJUDGED_KEYS.one, SCOUT_ROLE_GATE_UNJUDGED_KEYS.many],
  ...MECHANICAL_PLURAL_BASES.map((base) => [`${base}One`, base] as const),
]

const placeholdersOf = (value: string): string[] =>
  [...new Set(value.match(/\{\w+\}/g) ?? [])].sort()

describe("the warnings that became count-bearing in 0.7.0 render both forms", () => {
  // Registering a base in MECHANICAL_PLURAL_BASES only satisfies key hygiene.
  // A review showed that deleting both COUNT_SENSITIVE_WARNINGS entries broke
  // nothing at all, because nothing rendered these two through the real
  // translator. Noun AND verb are asserted together: "1 Champion" is a prefix
  // of "1 Champions", so checking the noun alone is vacuous.
  const CASES = [
    {
      code: "flex_pick_warning" as const,
      one: { de: /\b1 Champion taucht\b/, en: /\b1 champion shows up\b/ },
      many: { de: /\b2 Champions tauchen\b/, en: /\b2 champions show up\b/ },
    },
    {
      code: "role_not_playable_filtered" as const,
      one: { de: /\b1 Champion wurde\b/, en: /\b1 champion is not\b/ },
      many: { de: /\b2 Champions wurden\b/, en: /\b2 champions are not\b/ },
    },
  ]

  for (const testCase of CASES) {
    it(`${testCase.code} agrees in number in both languages`, () => {
      for (const [lang, t] of [
        ["de", tDe],
        ["en", tEn],
      ] as const) {
        const singular = translateScoutWarning(t, {
          code: testCase.code,
          severity: "warning",
          params: { count: 1 },
        })
        const plural = translateScoutWarning(t, {
          code: testCase.code,
          severity: "warning",
          params: { count: 2 },
        })

        expect(singular, `${lang} singular: ${singular}`).toMatch(testCase.one[lang])
        expect(plural, `${lang} plural: ${plural}`).toMatch(testCase.many[lang])
        expect(singular).not.toBe(plural)
        for (const text of [singular, plural]) {
          expect(text).not.toContain("{count}")
        }
      }
    })
  }
})

describe("the collapse summaries agree in number", () => {
  // Registering a pair in NEW_KEY_PAIRS only satisfies key hygiene: it proves
  // the keys exist and match placeholders, not that either sentence reads.
  // These render them through the real helper. Noun AND the word in front of it
  // are asserted together, because "1 weitere Schwäche" is a prefix of nothing
  // useful on its own and the German article/adjective is what actually
  // declines.
  const CASES = [
    {
      name: "weaknesses",
      keys: SCOUT_MORE_WEAKNESSES_KEYS,
      one: { de: /\b1 weitere Schwäche\b/, en: /\bShow 1 more weakness\b/ },
      many: { de: /\b4 weitere Schwächen\b/, en: /\bShow 4 more weaknesses\b/ },
    },
    {
      name: "bans",
      keys: SCOUT_MORE_BANS_KEYS,
      one: { de: /\b1 weiteren Ban\b/, en: /\bShow 1 more ban\b/ },
      many: { de: /\b4 weitere Bans\b/, en: /\bShow 4 more bans\b/ },
    },
    {
      name: "threats",
      keys: SCOUT_MORE_THREATS_KEYS,
      one: { de: /\b1 weitere Bedrohung\b/, en: /\bShow 1 more threat\b/ },
      many: { de: /\b4 weitere Bedrohungen\b/, en: /\bShow 4 more threats\b/ },
    },
    {
      name: "comfort picks",
      keys: SCOUT_MORE_COMFORT_KEYS,
      one: { de: /\b1 weiteren Comfort Pick\b/, en: /\bShow 1 more comfort pick\b/ },
      many: { de: /\b4 weitere Comfort Picks\b/, en: /\bShow 4 more comfort picks\b/ },
    },
  ]

  for (const testCase of CASES) {
    it(`${testCase.name} reads correctly at 1 and at 4`, () => {
      for (const [lang, t] of [
        ["de", tDe],
        ["en", tEn],
      ] as const) {
        const singular = scoutPluralMessage(t, 1, testCase.keys)
        const plural = scoutPluralMessage(t, 4, testCase.keys)

        expect(singular, `${lang} singular: ${singular}`).toMatch(testCase.one[lang])
        expect(plural, `${lang} plural: ${plural}`).toMatch(testCase.many[lang])
        expect(singular).not.toBe(plural)
        for (const text of [singular, plural]) {
          expect(text).not.toContain("{count}")
          expect(text).not.toContain("undefined")
        }
      }
    })
  }
})

describe("the new plural keys are well formed", () => {
  it("are fifteen distinct pairs, and no pair points at one key twice", () => {
    expect(NEW_KEY_PAIRS.length).toBe(15)
    // A pair whose halves are the same key would silently disable the whole
    // feature: every count would render the same sentence and every assertion
    // about the singular above would fail with a confusing message instead of
    // this one.
    for (const [one, many] of NEW_KEY_PAIRS) {
      expect(one, `pair ${one}/${many} names the same key twice`).not.toBe(many)
    }
    expect(new Set(NEW_KEY_PAIRS.flatMap(([one, many]) => [one, many])).size).toBe(30)
  })

  it("exist in both languages and are not empty", () => {
    for (const [one, many] of NEW_KEY_PAIRS) {
      for (const key of [one, many]) {
        for (const [lang, , dict] of LANGS) {
          expect(typeof dict[key], `${lang}.${key} is missing`).toBe("string")
          expect(dict[key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
        }
      }
    }
  })

  it("carry the same {placeholders} as their plural counterpart", () => {
    for (const [one, many] of NEW_KEY_PAIRS) {
      for (const [lang, , dict] of LANGS) {
        expect(
          placeholdersOf(dict[one] ?? ""),
          `${lang}: ${one} and ${many} disagree on placeholders. The number must stay a ` +
            "placeholder in the singular too, never be baked into the word.",
        ).toEqual(placeholdersOf(dict[many] ?? ""))
      }
    }
  })

  it("use the same {placeholders} in DE and EN", () => {
    for (const [one] of NEW_KEY_PAIRS) {
      expect(placeholdersOf(EN[one] ?? ""), `${one}: placeholders differ between DE and EN`).toEqual(
        placeholdersOf(DE[one] ?? ""),
      )
    }
  })

  it("follow the project copy rule", () => {
    // Same four rules tests/i18nScoutCopy.test.ts applies to every scout_ key,
    // restated so a broken new key fails with its own name attached.
    for (const [one] of NEW_KEY_PAIRS) {
      for (const [lang, , dict] of LANGS) {
        const value = dict[one] ?? ""
        const label = `${lang}.${one}: "${preview(value)}"`

        expect(value, `${label} contains an em dash or en dash`).not.toMatch(/[—–]/)
        expect(value, `${label} contains "--"`).not.toContain("--")
        expect(value, `${label} contains a doubled space`).not.toMatch(/ {2}/)
        expect(value, `${label} has leading or trailing whitespace`).toBe(value.trim())
        expect(value.length, `${label} is ${value.length} characters long`).toBeLessThanOrEqual(220)
      }
    }
  })

  it("added no One key beyond the fifteen", () => {
    // The ballast guard from section 7, generalised: nobody may quietly grow a
    // sixteenth singular for a string that never counts to one. Section 9 is
    // the same guard pointing the other way round.
    const expected = new Set(NEW_KEY_PAIRS.map(([one]) => one))

    for (const [lang, , dict] of LANGS) {
      const found = Object.keys(dict).filter(
        (key) => key.startsWith("scout_") && key.endsWith("One"),
      )
      for (const key of found) {
        expect(
          expected.has(key),
          `${lang}.${key} is a singular sibling nobody asked for. Only these fifteen keys count ` +
            `to one: ${[...expected].join(", ")}`,
        ).toBe(true)
      }
    }
  })
})

/* ==========================================================================
 * 9. The completeness sweep
 *
 * WHY THIS SECTION EXISTS. Every section above works from a HAND-WRITTEN LIST:
 * COUNTED_CASES, UNTOUCHED_COUNT_KEYS, NEW_KEY_PAIRS. A counted key that nobody
 * remembered to enter in one of them is not merely untested here, it is
 * invisible here, and that is the entire history of `scout_roleGate_unjudged`:
 * it rendered "1 Champions." from the day it was written until 0.7.6, and in
 * between it did not occur once anywhere under tests/.
 *
 * So this walks the two catalogues instead of a list and asks one question of
 * every `scout_` key whose German OR English text renders `{count}`: how is it
 * classified? There are two legal answers, and a key must give EXACTLY ONE:
 *
 *  (a) it is one half of a complete singular/plural pair, or
 *  (b) it is entered in UNTOUCHED_COUNT_KEYS together with the reason a count
 *      of 1 needs no second form.
 *
 * (a) only asks whether the sibling EXISTS. That the pair is also registered in
 * NEW_KEY_PAIRS, and therefore actually rendered and pinned, is what section 8
 * enforces from the other side: it rejects any `scout_*One` key that is not in
 * that list. Neither guard is complete alone; together they close the circle.
 *
 * THE LIMIT OF THIS SWEEP, stated plainly because a guard trusted for more than
 * it does is worse than none: it looks at `{count}` and at nothing else. The
 * other numeric placeholders are not swept, because they are not reliably
 * counts. `{max}` is a constant, `{winrate}` is a percentage, `{label}` is a
 * word. `{games}` genuinely does count, and its keys are handled BY NAME
 * instead: on the source side by COUNT_SENSITIVE_REASONS, here by COUNTED_CASES
 * and by three entries in UNTOUCHED_COUNT_KEYS. If a future key counts through
 * a new placeholder, that name has to be added below or it passes unlooked at.
 * ========================================================================== */

/** Every key either catalogue knows, so a key missing from one is still swept. */
const ALL_KEYS: readonly string[] = [...new Set([...Object.keys(DE), ...Object.keys(EN)])].sort()

const keyExists = (key: string): boolean => typeof DE[key] === "string" || typeof EN[key] === "string"

/** The placeholders this sweep reads as a count. See the limit above. */
const COUNT_PLACEHOLDERS: readonly string[] = ["{count}"]

const rendersACount = (key: string): boolean =>
  COUNT_PLACEHOLDERS.some(
    (placeholder) => (DE[key] ?? "").includes(placeholder) || (EN[key] ?? "").includes(placeholder),
  )

const COUNT_BEARING_KEYS: readonly string[] = ALL_KEYS.filter(
  (key) => key.startsWith("scout_") && rendersACount(key),
)

/**
 * The other half of `key`'s pair, or `null` when it has none.
 *
 * COMPLETENESS IS THE POINT, so a lone half does not count as classified: a
 * `scout_fooMany` whose `scout_fooOne` was never written renders the plural at
 * every count, which is this file's defect wearing a pair's name. The three
 * shapes the project actually uses:
 *  - `scout_fooOne` beside the base `scout_foo` (the mechanical families, and
 *    `scout_roleGate_unjudged`: the base keeps the plural text so the compiler
 *    can go on building `scout_reason_${code}` as a template literal),
 *  - `scout_fooOne` beside `scout_fooMany` (the collapse summaries),
 *  - a base key whose `...One` sibling exists.
 */
function pairPartnerOf(key: string): string | null {
  if (key.endsWith("One")) {
    const base = key.slice(0, -"One".length)
    if (keyExists(base)) return base
    return keyExists(`${base}Many`) ? `${base}Many` : null
  }
  if (key.endsWith("Many")) {
    const base = key.slice(0, -"Many".length)
    return keyExists(`${base}One`) ? `${base}One` : null
  }
  return keyExists(`${key}One`) ? `${key}One` : null
}

const UNTOUCHED_KEY_SET = new Set(UNTOUCHED_COUNT_KEYS.map(([key]) => key))

/**
 * Keys the sweep MUST have seen, one per shape it has to be able to reach.
 *
 * A bare `COUNT_BEARING_KEYS.length > n` proves the loop ran, not that it ran
 * over the right things: at 36 keys a threshold of 20 would let sixteen vanish,
 * including every one this file cares about. CLAUDE.md makes the same point
 * about `scanned.length > 100` over 121 source files, and the answer there is
 * the answer here: name the things that have to be in the scan.
 */
const REQUIRED_COUNT_KEYS: ReadonlyArray<readonly [key: string, why: string]> = [
  ["scout_roleGate_unjudged", "the 0.7.6 defect; a sweep that cannot see this one is pointless"],
  ["scout_banOverlapFilterCount", "the newest counted key, added with the overlap filter"],
  ["scout_import_applied", "the originally reported sentence, section 1"],
  ["scout_countPlayers", "an untouched chip, so both buckets are proven reachable"],
]

describe("every counted Scout key carries exactly one classification", () => {
  it("swept the catalogues and found the keys it has to find", () => {
    for (const [key, why] of REQUIRED_COUNT_KEYS) {
      expect(
        COUNT_BEARING_KEYS,
        `SCANNER PROBLEM, not a rule violation: the sweep never saw ${key} (${why}). Either the ` +
          "walk over the two catalogues broke, or that key stopped rendering {count} for a good " +
          "reason, in which case drop it from REQUIRED_COUNT_KEYS. Do NOT relax the sweep.",
      ).toContain(key)
    }

    // The weaker, second signal. It cannot stand in for the named keys above,
    // but it does catch a walk that came back with almost nothing at all.
    expect(
      COUNT_BEARING_KEYS.length,
      `SCANNER PROBLEM, not a rule violation: only ${COUNT_BEARING_KEYS.length} counted scout_ ` +
        "keys were found, and there were 36 when this sweep was written.",
    ).toBeGreaterThanOrEqual(30)
  })

  it("has a classifier that actually discriminates", () => {
    // Without this the sweep could be vacuous in the worst way: a
    // `pairPartnerOf` that answered every key would report a fully classified
    // catalogue while classifying nothing. One key of each shape, pinned to the
    // answer it has to give, and two that must come back empty-handed.
    expect(pairPartnerOf("scout_roleGate_unjudged")).toBe("scout_roleGate_unjudgedOne")
    expect(pairPartnerOf("scout_roleGate_unjudgedOne")).toBe("scout_roleGate_unjudged")
    expect(pairPartnerOf("scout_moreBansOne")).toBe("scout_moreBansMany")
    expect(pairPartnerOf("scout_moreBansMany")).toBe("scout_moreBansOne")
    expect(pairPartnerOf("scout_banOverlapFilterCount")).toBeNull()
    expect(pairPartnerOf("scout_countPlayers")).toBeNull()
  })

  it("leaves no counted key unclassified", () => {
    for (const key of COUNT_BEARING_KEYS) {
      const partner = pairPartnerOf(key)
      const listedAsUntouched = UNTOUCHED_KEY_SET.has(key)

      expect(
        partner !== null || listedAsUntouched,
        `${key} renders {count} and is classified neither way, so nothing in this file has ever ` +
          `looked at how it reads at 1. Its German text is "${preview(DE[key] ?? "(missing)")}". ` +
          "There are two ways out and one of them is right for it. EITHER give it a `...One` " +
          "sibling and register the pair in NEW_KEY_PAIRS through a PluralKeys constant in " +
          "scoutUiHelpers.ts, so the singular is really rendered and really pinned. OR enter it " +
          "in UNTOUCHED_COUNT_KEYS with the reason a count of 1 needs no second form: the count " +
          'is unreachable, or the text has the "Label: {count}" shape where no word follows the ' +
          "number.",
      ).toBe(true)
    }
  })

  it("leaves no counted key classified twice", () => {
    // This half deliberately overlaps the sibling guard in section 7. Computing
    // "how many classifications" and then only ever reporting the empty case
    // would leave the sweep's own verdict half stated. What differs is the
    // message: it names the contradiction rather than the stray key.
    for (const key of COUNT_BEARING_KEYS) {
      if (!UNTOUCHED_KEY_SET.has(key)) continue
      const partner = pairPartnerOf(key)

      expect(
        partner,
        `${key} is entered in UNTOUCHED_COUNT_KEYS as a key that never needs a singular, and yet ` +
          `${partner} exists. Both cannot be true. Either it counts to one, then remove the ` +
          "UNTOUCHED entry and register the pair, or it does not, then delete the sibling.",
      ).toBeNull()
    }
  })
})

/* ==========================================================================
 * 10. The call site
 *
 * Sections 1 to 9 are about the CATALOGUE. They stay green even if the panel
 * stops asking for the singular altogether, because Vitest runs in Node with
 * no jsdom and nothing here renders a component.
 *
 * That gap is not hypothetical. Reverting ScoutBanPlanPanel to
 * `fillPlaceholders(t("scout_roleGate_unjudged"), { count })` reinstates
 * "Ohne Referenzdaten beurteilt: 1 Champions." word for word, and every
 * assertion above survives it untouched. The only thing that would have
 * noticed is `noUnusedLocals` tripping over the orphaned import, and only
 * until whoever did the revert deletes that import too.
 *
 * So this section pins the CALL rather than the key. A source scan is a weak
 * instrument; it is the strongest one available in a suite without a DOM, and
 * it says so here rather than implying otherwise.
 * ========================================================================== */

/** Source with comments removed, so prose can neither satisfy nor break a scan. */
const readPanelSource = (): string =>
  readFileSync(
    new URL("../src/components/scout/ScoutBanPlanPanel.tsx", import.meta.url),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

/** Whitespace collapsed, so a formatter reflowing the call cannot break a pin. */
const collapse = (source: string): string => source.replace(/\s+/g, " ")

describe("the role-gate note asks for the singular where it is rendered", () => {
  const panel = readPanelSource()
  const flat = collapse(panel)

  it("read a panel that still looks like the ban plan", () => {
    // The anti-vacuity half. Most assertions below are negative, so they would
    // all pass on an empty string, and the message has to send the next reader
    // at the SCANNER rather than at a rule they did not break.
    expect(
      panel.length,
      "SCANNER PROBLEM: ScoutBanPlanPanel.tsx came back nearly empty. Fix the path before " +
        "reading anything in this section as a verdict about the copy.",
    ).toBeGreaterThan(2000)
    expect(flat, "SCANNER PROBLEM: this is not the ban plan panel").toContain(
      "scout_teamPlanTitle",
    )
    expect(
      flat,
      "SCANNER PROBLEM: the comment stripper ate the code, not just the prose",
    ).toContain("export function ScoutBanPlanPanel")
    expect(flat, "the role-gate note is gone from the panel entirely").toContain(
      "analysis.roleGate.unjudgedChampions",
    )
  })

  it("renders it through the pair, not through the plural key alone", () => {
    // The WHOLE call, not the identifier: `SCOUT_ROLE_GATE_UNJUDGED_KEYS` also
    // stands in the import list, so a bare toContain survives the revert. This
    // is the same import-line trap the ban-plan guards were caught by twice.
    expect(
      flat,
      "the role-gate note no longer renders through scoutPluralMessage, so it is back to one " +
        'fixed form at every count. That is exactly how "Ohne Referenzdaten beurteilt: ' +
        '1 Champions." reached production and stayed there until 0.7.6.',
    ).toContain(
      "scoutPluralMessage( t, analysis.roleGate.unjudgedChampions, SCOUT_ROLE_GATE_UNJUDGED_KEYS, )",
    )
  })

  it("never fills either half of the pair directly", () => {
    // The revert, spelled out, in both spellings it could take.
    expect(
      flat,
      'the plural key is being filled directly again, which prints "1 Champions." at a count ' +
        "of 1. Render it through SCOUT_ROLE_GATE_UNJUDGED_KEYS and scoutPluralMessage.",
    ).not.toContain('t("scout_roleGate_unjudged")')
    expect(
      flat,
      "the singular key is being rendered unconditionally, which prints \"4 Champion.\" at a " +
        "count of 4. It is one half of a pair and only pluralKey() may choose it.",
    ).not.toContain('t("scout_roleGate_unjudgedOne")')
  })
})
