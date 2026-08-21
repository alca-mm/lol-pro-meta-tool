/**
 * Unit tests for the number, date and plural rules of the Player Results tab.
 *
 * WHY THIS LOGIC LIVES IN A HELPER MODULE AT ALL: vitest runs in Node here
 * (vite.config.ts, `test.environment: 'node'`) - no jsdom, no document, no
 * component rendering. A `toLocaleDateString("de-DE", ...)` sitting inside a
 * .tsx file is therefore invisible to the whole suite, which is exactly how
 * the tab came to print German dates and German thousands separators to
 * English users without a single test going red. Same argument as
 * src/components/scout/scoutImportHelpers.ts and
 * src/components/team/teamUiHelpers.ts.
 *
 * EVERY TEST BELOW HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the test that turns red for each one:
 *
 *   localeForLang returns "de-DE" for both languages
 *       -> "maps each app language to its own BCP-47 locale"
 *   LOCALE_BY_LANG maps both languages to the same locale
 *       -> "the two locales really are different"
 *   a hardcoded "de-DE" back inside formatWholeNumber
 *       -> "German groups with a dot, English with a comma"
 *       -> "damagePerMinute and goldPerMinute follow the language"
 *   a hardcoded "de-DE" back inside formatMatchDate
 *       -> "the same timestamp renders in a different ORDER per language"
 *   Math.round dropped from formatWholeNumber
 *       -> "rounds before it formats"
 *   a falsy guard (`if (!value)`) eating a real zero
 *       -> "zero is a value, not an empty cell"
 *       -> "a zero win rate is 0.0 percent, not an empty cell"
 *   formatRatio / formatWinRatePercent made locale-aware
 *       -> "the ratio and percent formatters stay locale-neutral"
 *   the two halves of the match-count key pair swapped
 *       -> "the pair names the two real catalogue keys"
 *       -> "pluralKey picks the singular for 1 and the plural for everything else"
 *       -> "the four counted sentences read correctly in both languages"
 *
 * The four counted sentences are pinned VERBATIM on purpose: those strings ARE
 * the requirement (CLAUDE.md, "Numerus: nie per Suffix basteln"). Everything
 * else is asserted as a property so wording stays a product decision.
 *
 * No clock is read anywhere in this file. Both date fixtures are fixed ISO
 * strings; see the comments next to them for the timezone reasoning.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import { LOCALE_BY_LANG, localeForLang } from "../src/i18n/locale"
import { pluralKey } from "../src/i18n/plural"
import type { Lang } from "../src/i18n/types"
import { pluralMessage } from "../src/components/team/teamUiHelpers"
import type { TeamTranslate } from "../src/components/team/teamUiHelpers"
import {
  EMPTY_CELL,
  PLAYER_RESULTS_MATCH_COUNT_KEYS,
  formatChampionStatCell,
  formatKdaTriple,
  formatLastNLabel,
  formatMatchDate,
  formatRatio,
  formatWholeNumber,
  formatWinRatePercent,
  formatWinRatePercentShort,
} from "../src/components/player-results/playerResultsFormat"
import type { PlayerResultsTranslate } from "../src/components/player-results/playerResultsFormat"
import type { PlayerChampionResultStats } from "../src/teams/playerResultsAnalytics"

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

const LANGS: readonly Lang[] = ["de", "en"]

/**
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. These two views exist only
 * so the catalogue lookups below can use a key name held in a variable.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const tDe: TeamTranslate = (key) => de[key]
const tEn: TeamTranslate = (key) => en[key]

/**
 * The date fixture that can NEVER be timezone-flaky.
 *
 * An ISO date-time WITHOUT an offset is parsed as LOCAL time per the ECMAScript
 * spec, so the calendar day is 2026-08-21 on every machine on earth - UTC+14
 * and UTC-12 included. The strongest assertion in this file (the day/month
 * ORDER) hangs off this one for that reason.
 *
 * Day 21 is deliberately greater than 12: with a day like the 8th, `08.09.26`
 * and `09/08/26` would be indistinguishable from a mere separator swap, and a
 * hardcoded-locale mutant could survive. 21 cannot be read as a month.
 */
const MATCH_ISO_LOCAL = "2026-08-21T12:00:00"

/**
 * The same instant in the shape the stored Riot data actually uses (UTC, `Z`).
 *
 * NOON was chosen so the local calendar day does not shift: 12:00Z stays on the
 * 21st for every UTC offset strictly between -12:00 and +12:00, which covers
 * the dev machine (Europe/Berlin, +02:00) and CI (UTC). A midnight fixture
 * would render as the 22nd in Berlin and the 20th in New York.
 */
const MATCH_ISO_UTC = "2026-08-21T12:00:00Z"

/**
 * Every field of `PlayerChampionResultStats`, as a record rather than an array,
 * so ADDING a field to the analytics type is a compile error here
 * (`npm run typecheck:tests`) instead of a silently unchecked new column.
 */
const ALL_STAT_KEYS: Record<keyof PlayerChampionResultStats, true> = {
  championName: true,
  games: true,
  wins: true,
  losses: true,
  winRate: true,
  kills: true,
  deaths: true,
  assists: true,
  avgKills: true,
  avgDeaths: true,
  avgAssists: true,
  avgKda: true,
  csPerMinute: true,
  damagePerMinute: true,
  goldPerMinute: true,
  soloqGames: true,
  flexqGames: true,
  lastPlayedAt: true,
}

const STAT_KEYS = Object.keys(ALL_STAT_KEYS) as Array<keyof PlayerChampionResultStats>

/* ==========================================================================
 * 0. The empty cell
 * ========================================================================== */

describe("EMPTY_CELL", () => {
  it("is the em-dash placeholder the tables have always used", () => {
    // Written as an escape so no editor or git filter can quietly turn it into
    // a hyphen. CLAUDE.md P4a explicitly keeps this one standalone dash.
    expect(EMPTY_CELL).toBe("—")
  })
})

/* ==========================================================================
 * 1. Locale mapping - src/i18n/locale.ts
 * ========================================================================== */

describe("localeForLang", () => {
  it("maps each app language to its own BCP-47 locale", () => {
    expect(localeForLang("de")).toBe("de-DE")
    expect(
      localeForLang("en"),
      "en must NOT resolve to a German locale - that was the original defect: " +
        "every caller answered de-DE for itself, English build included.",
    ).toBe("en-US")
  })

  it("agrees with the map it projects", () => {
    for (const lang of LANGS) {
      expect(localeForLang(lang)).toBe(LOCALE_BY_LANG[lang])
    }
  })
})

describe("LOCALE_BY_LANG", () => {
  it("holds exactly the two Lang members and nothing else", () => {
    expect(Object.keys(LOCALE_BY_LANG).sort()).toEqual(["de", "en"])
  })

  it("the two locales really are different", () => {
    // Stated outright and on its own, because it is the one property the rest
    // of the file leans on everywhere: every "German differs from English"
    // assertion below is only meaningful while these two strings differ.
    expect(
      LOCALE_BY_LANG.de,
      "de and en must resolve to different locales, otherwise the whole " +
        "language-aware formatting below is decoration.",
    ).not.toBe(LOCALE_BY_LANG.en)
  })
})

/* ==========================================================================
 * 2. formatWholeNumber - the heart of the change
 * ========================================================================== */

describe("formatWholeNumber", () => {
  it("German groups with a dot, English with a comma", () => {
    const german = formatWholeNumber(1234, "de")
    const english = formatWholeNumber(1234, "en")

    expect(german).toBe("1.234")
    expect(
      english,
      "1,234 with a COMMA. If this reads 1.234 the function has a hardcoded " +
        "de-DE again - pass `lang` through localeForLang().",
    ).toBe("1,234")
    expect(german).not.toBe(english)

    // A second magnitude, so the assertion is about grouping and not about one
    // lucky four-digit string.
    expect(formatWholeNumber(1234567, "de")).toBe("1.234.567")
    expect(formatWholeNumber(1234567, "en")).toBe("1,234,567")
  })

  it("rounds before it formats", () => {
    for (const lang of LANGS) {
      expect(
        formatWholeNumber(1234.6, lang),
        "a per-minute figure arrives as a float; without Math.round Intl would " +
          "print decimals nobody reads.",
      ).toBe(formatWholeNumber(1235, lang))
    }
    expect(formatWholeNumber(1234.6, "de")).toBe("1.235")
    expect(formatWholeNumber(1234.6, "en")).toBe("1,235")
    // Half-up, which is what Math.round does. Pinned so a swap to a
    // "round half to even" helper is visible.
    expect(formatWholeNumber(1234.5, "de")).toBe("1.235")
  })

  it("leaves numbers below a thousand without any separator", () => {
    for (const lang of LANGS) {
      expect(formatWholeNumber(999, lang)).toBe("999")
      expect(formatWholeNumber(7, lang)).toBe("7")
    }
  })

  it("renders a non-finite value as the empty cell, never as NaN or Infinity", () => {
    for (const lang of LANGS) {
      expect(formatWholeNumber(Number.NaN, lang)).toBe(EMPTY_CELL)
      expect(formatWholeNumber(Number.POSITIVE_INFINITY, lang)).toBe(EMPTY_CELL)
      expect(formatWholeNumber(Number.NEGATIVE_INFINITY, lang)).toBe(EMPTY_CELL)
    }
    // Stated the other way round too: the literal strings must never appear.
    expect(formatWholeNumber(Number.NaN, "de")).not.toContain("NaN")
    expect(formatWholeNumber(Number.POSITIVE_INFINITY, "en")).not.toContain("∞")
  })

  it("zero is a value, not an empty cell", () => {
    for (const lang of LANGS) {
      expect(
        formatWholeNumber(0, lang),
        "THE discriminating case: a falsy guard (`if (!value)`) would eat a " +
          "real 0 and print a dash where the player genuinely did 0 damage.",
      ).toBe("0")
    }
  })

  it("formats a negative number with a leading ASCII minus and the same grouping", () => {
    // Observed behaviour of Node's ICU for these two locales: U+002D, not the
    // typographic U+2212 some locales use. Pinned so a locale change surfaces.
    expect(formatWholeNumber(-1234, "de")).toBe("-1.234")
    expect(formatWholeNumber(-1234, "en")).toBe("-1,234")
    expect(formatWholeNumber(-1234.6, "de")).toBe("-1.235")
  })
})

/* ==========================================================================
 * 3. formatMatchDate
 * ========================================================================== */

describe("formatMatchDate", () => {
  it("the same timestamp renders in a different ORDER per language", () => {
    const german = formatMatchDate(MATCH_ISO_LOCAL, "de")
    const english = formatMatchDate(MATCH_ISO_LOCAL, "en")

    expect(german).toBe("21.08.26")
    expect(
      english,
      "en-US puts the MONTH first: 08/21/26. A German 21.08.26 here means " +
        "formatMatchDate ignores `lang` - the exact bug this module was cut " +
        "out of the JSX to prevent.",
    ).toBe("08/21/26")

    expect(german).not.toBe(english)
    // Order, not just separators: the leading pair is the day in German and
    // the month in English. Day 21 cannot be mistaken for a month.
    expect(german.slice(0, 2)).toBe("21")
    expect(english.slice(0, 2)).toBe("08")
  })

  it("formats the UTC shape the stored matches actually use", () => {
    // Same instant as above, written the way Riot data stores it. See the
    // MATCH_ISO_UTC comment: noon UTC keeps the local calendar day on the 21st
    // for every offset between -12:00 and +12:00.
    expect(
      formatMatchDate(MATCH_ISO_UTC, "de"),
      "if this fails while the fixture above passes, the machine running the " +
        "suite is at a UTC offset of +12:00 or beyond and the instant has " +
        "rolled into the next calendar day.",
    ).toBe("21.08.26")
    expect(formatMatchDate(MATCH_ISO_UTC, "en")).toBe("08/21/26")
  })

  it("renders an unparsable timestamp as the empty cell, not as Invalid Date", () => {
    for (const lang of LANGS) {
      expect(
        formatMatchDate("not a date", lang),
        "`new Date('nonsense').toLocaleDateString()` is the literal string " +
          "'Invalid Date', which would sit in the column looking like a value.",
      ).toBe(EMPTY_CELL)
      expect(formatMatchDate("", lang)).toBe(EMPTY_CELL)
    }
    expect(formatMatchDate("not a date", "en")).not.toContain("Invalid")
  })
})

/* ==========================================================================
 * 4. The locale-NEUTRAL formatters
 *
 * These three take no `lang` on purpose. The asymmetry (thousands separators
 * and dates follow the language, ratios and percentages do not) is pre-existing
 * and documented in the module header of playerResultsFormat.ts. A future
 * "fix" that makes them locale-aware has to go red here.
 * ========================================================================== */

describe("formatWinRatePercent", () => {
  it("prints one decimal and a percent sign", () => {
    expect(formatWinRatePercent(0.5234)).toBe("52.3%")
    expect(formatWinRatePercent(1)).toBe("100.0%")
  })

  it("renders a non-finite fraction as the empty cell", () => {
    expect(formatWinRatePercent(Number.NaN)).toBe(EMPTY_CELL)
    expect(formatWinRatePercent(Number.POSITIVE_INFINITY)).toBe(EMPTY_CELL)
  })
})

describe("formatWinRatePercentShort", () => {
  it("drops the decimal for the highlight cards", () => {
    expect(formatWinRatePercentShort(0.5234)).toBe("52%")
    expect(formatWinRatePercentShort(0.5)).toBe("50%")
  })

  it("renders a non-finite fraction as the empty cell", () => {
    expect(formatWinRatePercentShort(Number.NaN)).toBe(EMPTY_CELL)
    expect(formatWinRatePercentShort(Number.NEGATIVE_INFINITY)).toBe(EMPTY_CELL)
  })
})

describe("formatRatio", () => {
  it("honours the requested number of decimals", () => {
    expect(formatRatio(2.345, 2)).toBe("2.35")
    expect(formatRatio(7.26, 1)).toBe("7.3")
    expect(formatRatio(3, 2)).toBe("3.00")
  })

  it("renders a non-finite value as the empty cell", () => {
    expect(formatRatio(Number.NaN, 2)).toBe(EMPTY_CELL)
    expect(formatRatio(Number.POSITIVE_INFINITY, 1)).toBe(EMPTY_CELL)
  })
})

describe("the ratio and percent formatters stay locale-neutral", () => {
  it("uses an ASCII dot and never a comma, in every language the app ships", () => {
    // CONTROL: prove the assertion below is not vacuous. The German locale
    // really would put a comma here, so "contains no comma" is a statement
    // about this code and not about the number 2.345.
    expect(
      (2.345).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      "control assertion: if German ever stops using a decimal comma, the " +
        "checks below stop discriminating and need rethinking.",
    ).toContain(",")

    const rendered = [
      formatRatio(2.345, 2),
      formatRatio(7.26, 1),
      formatWinRatePercent(0.5234),
      formatWinRatePercentShort(0.5234),
    ]

    for (const value of rendered) {
      expect(
        value,
        "These four helpers deliberately take no `lang`. Ratios and " +
          "percentages have always been printed with an ASCII dot, app-wide " +
          "(formatScoutNumber does the same), and a comma here would collide " +
          "with the k/d/a triples and the comma-joined lists beside them. If " +
          "you are making them locale-aware, that is a product decision - " +
          "change playerResultsFormat.ts's module header first, then this test.",
      ).not.toContain(",")
    }

    expect(rendered[0]).toBe("2.35")
    expect(rendered[2]).toBe("52.3%")
  })
})

describe("formatKdaTriple", () => {
  it("joins the three counts with slashes", () => {
    expect(formatKdaTriple(12, 3, 7)).toBe("12/3/7")
  })

  it("keeps a zero-death game readable", () => {
    // A perfect game is a real result, and the triple must show the 0 rather
    // than hide it or collapse to a dash.
    expect(formatKdaTriple(5, 0, 9)).toBe("5/0/9")
    expect(formatKdaTriple(0, 0, 0)).toBe("0/0/0")
  })
})

/* ==========================================================================
 * 5. formatChampionStatCell - the replacement for the old inline fCell()
 * ========================================================================== */

describe("formatChampionStatCell", () => {
  it("renders null as the empty cell for every key of the stats record", () => {
    for (const key of STAT_KEYS) {
      for (const lang of LANGS) {
        expect(formatChampionStatCell(key, null, lang), `key: ${key}`).toBe(EMPTY_CELL)
      }
    }
    // A guard against an empty loop: if STAT_KEYS ever came back empty the
    // block above would pass without asserting anything.
    expect(STAT_KEYS.length).toBe(18)
  })

  it("prints the win rate with one decimal, in both languages alike", () => {
    for (const lang of LANGS) {
      expect(formatChampionStatCell("winRate", 0.5234, lang)).toBe("52.3%")
    }
  })

  it("prints the four average columns with two decimals", () => {
    const twoDecimals = ["avgKda", "avgKills", "avgDeaths", "avgAssists"] as const
    for (const key of twoDecimals) {
      for (const lang of LANGS) {
        expect(formatChampionStatCell(key, 2.345, lang), `key: ${key}`).toBe("2.35")
      }
    }
  })

  it("prints CS per minute with one decimal", () => {
    for (const lang of LANGS) {
      expect(formatChampionStatCell("csPerMinute", 7.26, lang)).toBe("7.3")
    }
  })

  it("damagePerMinute and goldPerMinute follow the language", () => {
    for (const key of ["damagePerMinute", "goldPerMinute"] as const) {
      expect(formatChampionStatCell(key, 1234.6, "de"), `key: ${key}`).toBe("1.235")
      expect(
        formatChampionStatCell(key, 1234.6, "en"),
        `key: ${key} - these are the only two cells with a thousands separator; ` +
          "an English 1.235 means the language never reached localeForLang().",
      ).toBe("1,235")
      expect(formatChampionStatCell(key, 1234.6, "de")).not.toBe(
        formatChampionStatCell(key, 1234.6, "en"),
      )
    }
  })

  it("passes the champion name and the plain counts through unformatted", () => {
    for (const lang of LANGS) {
      expect(formatChampionStatCell("championName", "Aatrox", lang)).toBe("Aatrox")

      for (const key of ["games", "wins", "losses", "soloqGames", "flexqGames"] as const) {
        expect(
          formatChampionStatCell(key, 1234, lang),
          `key: ${key} - a game COUNT is not a per-minute figure; it must not ` +
            "pick up a thousands separator.",
        ).toBe("1234")
      }

      // Observed, and worth knowing: lastPlayedAt falls through to String() in
      // this function. The date column formats through formatMatchDate, not
      // through the cell formatter.
      expect(formatChampionStatCell("lastPlayedAt", MATCH_ISO_UTC, lang)).toBe(MATCH_ISO_UTC)
    }
  })

  it("a zero win rate is 0.0 percent, not an empty cell", () => {
    for (const lang of LANGS) {
      expect(
        formatChampionStatCell("winRate", 0, lang),
        "0 % is a real, and painful, result. Only `null` means 'no value'; a " +
          "falsy guard here would hide a genuine zero.",
      ).toBe("0.0%")
      expect(formatChampionStatCell("games", 0, lang)).toBe("0")
      expect(formatChampionStatCell("avgKda", 0, lang)).toBe("0.00")
    }
  })
})

/* ==========================================================================
 * 6. formatLastNLabel - the one uncounted placeholder of the tab
 * ========================================================================== */

describe("formatLastNLabel", () => {
  it("fills the count and follows the language", () => {
    expect(formatLastNLabel(tDe, 10)).toBe("Letzte 10")
    expect(
      formatLastNLabel(tEn, 10),
      "a helper that ignored `t` and hardcoded one language would still pass a " +
        "German-only assertion - hence both, and hence the difference below.",
    ).toBe("Last 10")
    expect(formatLastNLabel(tDe, 10)).not.toBe(formatLastNLabel(tEn, 10))
  })

  it("leaves no placeholder behind", () => {
    for (const t of [tDe, tEn]) {
      for (const limit of [5, 10, 20]) {
        expect(
          formatLastNLabel(t, limit),
          "a literal {count} on a button is what the user would actually see; " +
            "this is the failure the helper exists to prevent.",
        ).not.toContain("{count}")
        expect(formatLastNLabel(t, limit)).toContain(String(limit))
      }
    }
  })

  it("a limit of zero renders the zero, it does not render blank", () => {
    expect(
      formatLastNLabel(tDe, 0),
      "same falsy-guard rule as everywhere else in this file: 0 is a value.",
    ).toBe("Letzte 0")
    expect(formatLastNLabel(tEn, 0)).toBe("Last 0")
  })

  it("prints the limit as plain digits, with no thousands separator", () => {
    // Deliberate: this labels a FILTER BUCKET, not a measured quantity, so it
    // uses String(limit) and not formatWholeNumber. Pinned so nobody routes it
    // through the locale-aware formatter "for consistency" later.
    expect(formatLastNLabel(tDe, 1000)).toBe("Letzte 1000")
    expect(formatLastNLabel(tEn, 1000)).toBe("Last 1000")
  })

  /* ------------------------------------------------------------------------
   * The two tests below are about the MECHANISM, not about today's inputs.
   * Neither situation can arise from a numeric `limit` and the two real
   * catalogue values. They are here on purpose, to freeze why the helper uses
   * split/join instead of String.replace, because a future edit that swaps in
   * `replace` would look harmless against the current data.
   * ---------------------------------------------------------------------- */

  it("substitutes EVERY occurrence of the placeholder, not just the first", () => {
    // `"a {count} b".replace("{count}", x)` fills exactly one. A translator who
    // writes the number twice would silently get one filled and one literal.
    const twice: PlayerResultsTranslate = () => "{count}/{count}"

    expect(
      formatLastNLabel(twice, 7),
      "split/join fills all occurrences; String.replace with a STRING pattern " +
        "fills only the first. This assertion is what tells the two apart.",
    ).toBe("7/7")
  })

  it("does not treat a $& in the catalogue text as a regex back-reference", () => {
    // HONEST NOTE, so nobody mistakes this for a discriminator: with a numeric
    // `limit` the replacement can never contain `$&`, so String.replace would
    // pass this too. It is a characterisation test - it records that dollar
    // sequences in the text come through verbatim, which is the second reason
    // split/join was chosen and the one that would bite if this helper were
    // ever generalised to substitute a caller-supplied string.
    const dollars: PlayerResultsTranslate = () => "$& {count} $$ $'"

    expect(formatLastNLabel(dollars, 3)).toBe("$& 3 $$ $'")
  })
})

/* ==========================================================================
 * 7. The match-count plural pair
 *
 * CLAUDE.md, "Numerus: nie per Suffix basteln": the `1` case is the ONLY
 * discriminator. The old broken `${n} Match${n !== 1 ? "es" : ""}` already
 * produced the right string for n = 2, so a test that only checks the plural
 * proves nothing.
 * ========================================================================== */

describe("PLAYER_RESULTS_MATCH_COUNT_KEYS", () => {
  it("the pair names the two real catalogue keys", () => {
    expect(PLAYER_RESULTS_MATCH_COUNT_KEYS.one).toBe("playerResults_matchCountOne")
    expect(PLAYER_RESULTS_MATCH_COUNT_KEYS.many).toBe("playerResults_matchCountMany")
    expect(
      PLAYER_RESULTS_MATCH_COUNT_KEYS.one,
      "singular and plural must be two DIFFERENT keys - one key cannot decline.",
    ).not.toBe(PLAYER_RESULTS_MATCH_COUNT_KEYS.many)
  })

  it("both halves exist in both catalogues and both carry {count}", () => {
    for (const key of [
      PLAYER_RESULTS_MATCH_COUNT_KEYS.one,
      PLAYER_RESULTS_MATCH_COUNT_KEYS.many,
    ]) {
      for (const [name, catalogue] of [
        ["de", DE],
        ["en", EN],
      ] as const) {
        expect(typeof catalogue[key], `${name}.${key} is missing`).toBe("string")
        expect(
          catalogue[key],
          `${name}.${key} must keep the {count} placeholder - the singular one ` +
            "too, or DE/EN placeholder parity breaks (tests/i18nScoutCopy.test.ts).",
        ).toContain("{count}")
      }
    }
  })

  it("pluralKey picks the singular for 1 and the plural for everything else", () => {
    expect(
      pluralKey(1, PLAYER_RESULTS_MATCH_COUNT_KEYS),
      "the ONE case is the only discriminator here",
    ).toBe("playerResults_matchCountOne")

    for (const count of [0, 2, 11, 100]) {
      expect(pluralKey(count, PLAYER_RESULTS_MATCH_COUNT_KEYS), `count: ${count}`).toBe(
        "playerResults_matchCountMany",
      )
    }
  })

  it("the four counted sentences read correctly in both languages", () => {
    // Verbatim, number and noun TOGETHER. CLAUDE.md records a vacuous
    // assertion that matched a bare word which also occurred elsewhere in the
    // sentence; `toBe` on the whole string cannot go wrong that way.
    expect(pluralMessage(tDe, 1, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("1 Match")
    expect(pluralMessage(tDe, 2, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("2 Matches")
    expect(pluralMessage(tEn, 1, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("1 match")
    expect(pluralMessage(tEn, 2, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("2 matches")

    // Zero is a plural in both languages the app ships.
    expect(pluralMessage(tDe, 0, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("0 Matches")
    expect(pluralMessage(tEn, 0, PLAYER_RESULTS_MATCH_COUNT_KEYS)).toBe("0 matches")
  })
})
