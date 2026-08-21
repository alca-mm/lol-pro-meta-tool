/**
 * Unit tests for src/i18n/format.ts - the app-wide number and date formatters.
 *
 * WHY THIS FILE EXISTS: format.ts is the module every panel now calls instead
 * of writing "de-DE" into a toLocaleString by hand. If it silently answers
 * German for both languages, nothing in the app crashes and no other test goes
 * red - the English build just quietly prints 1.234 and 21.08.2026 again,
 * which is exactly the defect this module was carved out to end. Vitest runs
 * in Node here (vite.config.ts, `test.environment: 'node'`) with no jsdom, so
 * a formatter left inside a .tsx file would be untestable; that is why the
 * logic sits in a plain module and why this file can pin it.
 *
 * ITS SIBLING is tests/playerResultsFormat.test.ts, which covers
 * playerResultsFormat.ts (the player-results LAYER: the em-dash empty cell,
 * rounding, plurals). The two modules deliberately disagree in three places,
 * and all three are pinned below so neither can drift into the other:
 *
 *   input            | i18n/format               | player-results
 *   ---------------- | ------------------------- | -----------------------------
 *   1234.5           | "1.234,5"  (keeps it)     | "1.235"  (Math.round first)
 *   NaN / Infinity   | "NaN" / "Infinity"        | the em-dash EMPTY_CELL
 *   the year         | "2026"     (4 digits)     | "26"     (formatMatchDate)
 *
 * EVERY TEST BELOW HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the test that turns red for each one:
 *
 *   a hardcoded "de-DE" inside formatNumber
 *       -> "German groups with a dot, English with a comma"
 *       -> "every function moves when the language moves"
 *   a hardcoded "de-DE" inside formatDateNumeric
 *       -> "the same day renders in a different ORDER per language"
 *   a hardcoded "de-DE" inside formatDateTimeNumeric
 *       -> "German prints a 24-hour clock, English a 12-hour clock with AM/PM"
 *       -> "a morning time differs by the AM tag alone"
 *   a hardcoded "de-DE" inside formatDateMedium
 *       -> "the month NAME itself is translated"
 *   localeForLang returning the same locale for both languages
 *       -> "every function moves when the language moves" (plus all four above)
 *   any other locale, or a fall back to the host locale
 *       -> "routes through the same locale mapping the rest of the app uses"
 *   the isValidDate guard deleted
 *       -> "renders as empty, never as the words Invalid Date" (the guardless
 *          version either returns the literal "Invalid Date" or throws a
 *          RangeError out of Intl - both fail that test)
 *   an isValidDate that rejects everything
 *       -> "has a control: a VALID Date is never empty"
 *   formatNumber gaining a Math.round
 *       -> "does NOT round: a fractional value keeps its fraction"
 *   a falsy guard (`if (!value)`) eating a real zero
 *       -> "zero is a value, not a blank"
 *   the non-finite branch returning "" or "0" instead of String(value)
 *       -> "a broken number stays visibly broken"
 *
 * NO CLOCK IS READ ANYWHERE IN THIS FILE: no `new Date()` without arguments,
 * no Date.now(), no fake timers. See the fixture comments for the timezone
 * reasoning.
 */

import { describe, expect, it } from "vitest"

import {
  formatDateMedium,
  formatDateNumeric,
  formatDateTimeNumeric,
  formatNumber,
} from "../src/i18n/format"
import type { Lang } from "../src/i18n/types"

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

const LANGS: readonly Lang[] = ["de", "en"]

/**
 * The date fixture that can NEVER be timezone-flaky: a LOCAL-TIME constructor.
 *
 * `new Date(2026, 7, 21, 14, 30)` means "the 21st of August 2026 at 14:30, in
 * whatever zone this machine is in". `Intl.DateTimeFormat` without an explicit
 * `timeZone` renders in that same zone, so the two cancel out exactly: the
 * output reads 21 / 08 / 2026 / 14:30 on a machine at UTC-12 and on one at
 * UTC+14 alike. Offset-independent by construction - no `timeZone` option, no
 * fake timers, no UTC arithmetic to get wrong.
 *
 * The sibling file reasons its way to a noon-UTC ISO string instead, because
 * the function it tests takes a STRING and has to accept the `Z` shape the
 * stored Riot data uses. These four functions take a `Date`, so the stronger
 * construction is available here and is used.
 *
 * Day 21 is deliberately greater than 12. With the 8th of September,
 * `08.09.2026` and `09/08/2026` would differ only in the separator and a
 * hardcoded-locale mutant could survive the ORDER assertion. 21 cannot be
 * misread as a month.
 *
 * 14:30 is deliberately in the afternoon: it is the only way to see that
 * en-US switches to a 12-hour clock (`02:30 PM`) while de-DE stays at 24
 * (`14:30`).
 */
const AFTERNOON = new Date(2026, 7, 21, 14, 30)

/**
 * The same calendar day at 09:05, where BOTH languages print the digits
 * "09:05". Whatever separates the two outputs at this time cannot be the clock
 * digits, which isolates the AM tag and the date order.
 */
const MORNING = new Date(2026, 7, 21, 9, 5)

/**
 * A single-digit day in a different month, for the two padding rules. January
 * rather than September on purpose: `09.09.2026` and `09/09/2026` are the same
 * string in both languages, so a September fixture would quietly stop
 * discriminating if it were ever reused for a locale assertion.
 */
const SINGLE_DIGIT_DAY = new Date(2026, 0, 9, 12, 0)

/** `new Date("nonsense")` is a real Date object; every formatter on it says "Invalid Date". */
const INVALID = new Date("nonsense")

/** The three date functions, so the shared rules are stated once for all of them. */
const DATE_FORMATTERS: ReadonlyArray<readonly [string, (date: Date, lang: Lang) => string]> = [
  ["formatDateNumeric", formatDateNumeric],
  ["formatDateTimeNumeric", formatDateTimeNumeric],
  ["formatDateMedium", formatDateMedium],
]

/**
 * ICU prints the gap before AM/PM as U+0020 on the runtime these strings were
 * pinned against (Node 24.15, ICU 78.2, CLDR 48) but has shipped U+202F, a
 * narrow no-break space, for en-US in other CLDR generations. That character
 * is not part of any contract this app has, and normalising it keeps a CI
 * image with a different ICU from painting a false red. Everything that
 * matters (12-hour versus 24-hour, the date order, the presence of the day
 * period) is untouched by the normalisation, and the raw codepoint is
 * characterised in its own test below.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/[  ]/g, " ")
}

/* ==========================================================================
 * 0. The fixtures themselves
 * ========================================================================== */

describe("the date fixtures", () => {
  it("say the same thing on every machine, at every UTC offset", () => {
    // If this ever failed, every pinned string below would be meaningless - so
    // it is asserted first and on its own. A local-time constructor round-trips
    // through the local-time getters by definition, which is precisely why it
    // was chosen over an ISO string carrying a `Z`.
    expect(AFTERNOON.getFullYear()).toBe(2026)
    expect(AFTERNOON.getMonth(), "0-based: 7 is August").toBe(7)
    expect(AFTERNOON.getDate(), "> 12, so the day cannot be mistaken for a month").toBe(21)
    expect(AFTERNOON.getHours(), "afternoon, so the 12-hour clock is observable").toBe(14)
    expect(AFTERNOON.getMinutes()).toBe(30)

    expect(MORNING.getDate()).toBe(21)
    expect(MORNING.getHours()).toBe(9)
    expect(MORNING.getMinutes()).toBe(5)

    expect(SINGLE_DIGIT_DAY.getDate()).toBe(9)
    expect(SINGLE_DIGIT_DAY.getMonth(), "January, so day and month differ").toBe(0)

    expect(Number.isNaN(INVALID.getTime()), "the invalid fixture must really be invalid").toBe(true)
  })
})

/* ==========================================================================
 * 1. formatNumber
 * ========================================================================== */

describe("formatNumber", () => {
  it("German groups with a dot, English with a comma", () => {
    const german = formatNumber(1234, "de")
    const english = formatNumber(1234, "en")

    expect(german).toBe("1.234")
    expect(
      english,
      "1,234 with a COMMA. A German 1.234 here means formatNumber has a " +
        "hardcoded de-DE again, which is the exact defect this module replaced.",
    ).toBe("1,234")
    expect(
      german,
      "THE point of the whole change: the two languages must not agree on this " +
        "value. This is the assertion that dies if a hardcoded locale comes back.",
    ).not.toBe(english)

    // A second magnitude, so this is about grouping and not about one lucky
    // four-digit string.
    expect(formatNumber(1234567, "de")).toBe("1.234.567")
    expect(formatNumber(1234567, "en")).toBe("1,234,567")
  })

  it("leaves numbers below a thousand without any separator", () => {
    for (const lang of LANGS) {
      expect(formatNumber(999, lang), `lang: ${lang}`).toBe("999")
      expect(formatNumber(42, lang), `lang: ${lang}`).toBe("42")
      expect(formatNumber(7, lang), `lang: ${lang}`).toBe("7")
    }
  })

  it("zero is a value, not a blank", () => {
    for (const lang of LANGS) {
      expect(
        formatNumber(0, lang),
        "THE discriminating case against a falsy guard: `if (!value) return ''` " +
          "would print nothing where a panel genuinely counted 0 matches.",
      ).toBe("0")
    }
  })

  it("formats a negative number with a leading ASCII minus and the same grouping", () => {
    expect(formatNumber(-1234, "de")).toBe("-1.234")
    expect(formatNumber(-1234, "en")).toBe("-1,234")

    // By codepoint, not by eye: U+002D HYPHEN-MINUS and not U+2212 MINUS SIGN,
    // which other locales and other ICU builds do use and which no editor
    // renders differently enough to catch in a review.
    for (const lang of LANGS) {
      expect(formatNumber(-1234, lang).codePointAt(0), `lang: ${lang}`).toBe(0x2d)
      expect(formatNumber(-1234, lang).codePointAt(0), `lang: ${lang}`).not.toBe(0x2212)
    }
  })

  it("does NOT round: a fractional value keeps its fraction", () => {
    // THE CONTRACT DIFFERENCE from playerResultsFormat.formatWholeNumber, which
    // does Math.round(value) first and would answer "1.235" / "1,235" here.
    // format.ts leaves that decision where the meaning is: a caller holding a
    // float rounds before it calls. If a Math.round ever appears in
    // formatNumber, these four lines go red.
    expect(formatNumber(1234.5, "de")).toBe("1.234,5")
    expect(formatNumber(1234.5, "en")).toBe("1,234.5")
    expect(formatNumber(0.5, "de")).toBe("0,5")
    expect(formatNumber(0.5, "en")).toBe("0.5")

    // The decimal MARK follows the language too, not only the grouping mark.
    expect(formatNumber(1234.5, "de")).not.toBe(formatNumber(1234.5, "en"))

    // Honest characterisation of the one rounding that DOES happen and that
    // formatNumber never asked for: Intl.NumberFormat defaults to
    // maximumFractionDigits 3, so a fourth decimal is dropped by the platform.
    // "Does not round" means "does not round to an integer"; it is not a
    // promise of unlimited precision. Pinned so the distinction stays visible.
    expect(formatNumber(1234.567, "de")).toBe("1.234,567")
    expect(formatNumber(1234.5678, "de")).toBe("1.234,568")
    expect(formatNumber(1234.5678, "en")).toBe("1,234.568")
  })

  it("a broken number stays visibly broken", () => {
    for (const lang of LANGS) {
      // DELIBERATE, and documented in the module header of format.ts: a
      // non-finite value is stringified as-is so that somebody sees it and
      // reports it. A blank or a 0 here would be a LIE about the data - the
      // reader would take an invented value for a measured one. A future "fix"
      // that returns "" has to go red, which is why the negative form is
      // stated as well and not left implied.
      expect(formatNumber(Number.NaN, lang), `lang: ${lang}`).toBe("NaN")
      expect(formatNumber(Number.POSITIVE_INFINITY, lang), `lang: ${lang}`).toBe("Infinity")
      expect(formatNumber(Number.NEGATIVE_INFINITY, lang), `lang: ${lang}`).toBe("-Infinity")

      expect(formatNumber(Number.NaN, lang), `lang: ${lang}`).not.toBe("")
      expect(
        formatNumber(Number.NaN, lang),
        "a zero here would be the worst outcome of the three: an invented " +
          "number that reads exactly like a measured one.",
      ).not.toBe("0")
      expect(formatNumber(Number.POSITIVE_INFINITY, lang), `lang: ${lang}`).not.toBe("")
    }
  })
})

/* ==========================================================================
 * 2. formatDateNumeric
 * ========================================================================== */

describe("formatDateNumeric", () => {
  it("the same day renders in a different ORDER per language", () => {
    const german = formatDateNumeric(AFTERNOON, "de")
    const english = formatDateNumeric(AFTERNOON, "en")

    expect(german).toBe("21.08.2026")
    expect(english, "en-US puts the MONTH first and separates with slashes").toBe("08/21/2026")
    expect(german).not.toBe(english)

    // ORDER, not merely separators. The leading pair is the DAY in German and
    // the MONTH in English, and 21 cannot be a month.
    expect(german.slice(0, 2), "German leads with the day").toBe("21")
    expect(english.slice(0, 2), "English leads with the month").toBe("08")

    // Neither output wears the other's punctuation either.
    expect(german).not.toContain("/")
    expect(english).not.toContain(".")
  })

  it("pads day and month to two digits and prints a four-digit year", () => {
    // day "2-digit", month "2-digit", year "numeric" - the width is fixed so a
    // column of dates lines up. A single-digit day in a single-digit month
    // proves both pads at once.
    expect(formatDateNumeric(SINGLE_DIGIT_DAY, "de")).toBe("09.01.2026")
    expect(formatDateNumeric(SINGLE_DIGIT_DAY, "en")).toBe("01/09/2026")

    // Four digits, unlike playerResultsFormat.formatMatchDate which uses a
    // 2-digit year ("21.08.26"). The spec keeps those two formats separate on
    // purpose; pinning the length here is what stops them merging by accident.
    expect(formatDateNumeric(AFTERNOON, "de")).toHaveLength(10)
    expect(formatDateNumeric(AFTERNOON, "de").endsWith("2026")).toBe(true)
    expect(formatDateNumeric(AFTERNOON, "en").endsWith("2026")).toBe(true)
  })
})

/* ==========================================================================
 * 3. formatDateTimeNumeric
 * ========================================================================== */

describe("formatDateTimeNumeric", () => {
  it("German prints a 24-hour clock, English a 12-hour clock with AM/PM", () => {
    const german = formatDateTimeNumeric(AFTERNOON, "de")
    const english = normalizeSpaces(formatDateTimeNumeric(AFTERNOON, "en"))

    // Pinned from the real runtime rather than from expectation: en-US with
    // hour "2-digit" yields a PADDED 12-hour clock plus a day period, which is
    // not what the option name suggests at a glance.
    expect(german).toBe("21.08.2026, 14:30")
    expect(english).toBe("08/21/2026, 02:30 PM")
    expect(german).not.toBe(english)

    // Neither contains the other's shape. These survive even if ICU changes
    // its punctuation someday, so the intent is not carried by the two pins
    // alone.
    expect(german, "de-DE has no day period at all").not.toContain("PM")
    expect(german).not.toContain("AM")
    expect(german).not.toContain("/")
    expect(english, "en-US must never print the 24-hour reading").not.toContain("14:30")
    expect(english).not.toContain("21.08.")
    expect(english).toContain("PM")
  })

  it("a morning time differs by the AM tag alone", () => {
    // At 09:05 BOTH languages print the digits "09:05", so the clock digits
    // cannot be doing the work here: what is left is the date order and the
    // day period. The afternoon test above catches a formatter stuck on 24
    // hours; this one catches the reverse, a formatter that drops the day
    // period entirely and would still look correct at 14:30.
    const german = formatDateTimeNumeric(MORNING, "de")
    const english = normalizeSpaces(formatDateTimeNumeric(MORNING, "en"))

    expect(german).toBe("21.08.2026, 09:05")
    expect(english).toBe("08/21/2026, 09:05 AM")

    expect(german).toContain("09:05")
    expect(english).toContain("09:05")
    expect(german, "the German reading of 09:05 carries no AM").not.toContain("AM")
    expect(english).toContain("AM")
    expect(german).not.toBe(english)
  })

  it("is the numeric date plus a time, not a second date format", () => {
    // Stated as a relation between the two functions so they cannot drift
    // apart: whatever formatDateNumeric decides about order and padding,
    // formatDateTimeNumeric repeats verbatim and only appends.
    for (const lang of LANGS) {
      const withTime = normalizeSpaces(formatDateTimeNumeric(AFTERNOON, lang))
      const dateOnly = formatDateNumeric(AFTERNOON, lang)
      expect(withTime.startsWith(dateOnly), `lang: ${lang}`).toBe(true)
      expect(withTime.length, `lang: ${lang}`).toBeGreaterThan(dateOnly.length)
    }
  })

  it("separates the English day period with a plain or a no-break space", () => {
    // CHARACTERISATION, not a requirement - labelled so nobody reads it as
    // one. ICU 78.2 / CLDR 48, the runtime this file was pinned against, uses
    // U+0020 here; other CLDR generations ship U+202F for en-US. The exact
    // codepoint is not part of any contract, which is why the assertions above
    // normalise it. This records what it actually is on the machine at hand.
    const english = formatDateTimeNumeric(AFTERNOON, "en")
    const gap = english.charAt(english.indexOf("PM") - 1)
    expect(
      [" ", " ", " "],
      `observed codepoint before PM: U+${gap.codePointAt(0)?.toString(16)}`,
    ).toContain(gap)
  })
})

/* ==========================================================================
 * 4. formatDateMedium
 * ========================================================================== */

describe("formatDateMedium", () => {
  it("the month NAME itself is translated", () => {
    const german = formatDateMedium(AFTERNOON, "de")
    const english = formatDateMedium(AFTERNOON, "en")

    // This is the one format where the language does more than move separators
    // around: it changes a WORD. Pinned from the real runtime - the German
    // abbreviation carries a trailing dot and so does the day number, the
    // English one carries neither.
    expect(german).toBe("21. Aug. 2026")
    expect(english).toBe("Aug 21, 2026")
    expect(german).not.toBe(english)

    // The month tokens differ on their own, independently of the surrounding
    // order and punctuation.
    expect(german, "de-DE abbreviates August with a trailing dot").toContain("Aug.")
    expect(english, "en-US does not").not.toContain("Aug.")
    expect(english).toContain("Aug ")

    // And a month whose two languages spell out differently, so this does not
    // rest on punctuation alone. Also proves the month name comes from ICU and
    // not from a hand-built English list.
    const march = new Date(2026, 2, 21, 12, 0)
    expect(formatDateMedium(march, "de")).toBe("21. März 2026")
    expect(formatDateMedium(march, "en")).toBe("Mar 21, 2026")
    expect(formatDateMedium(march, "de")).not.toBe(formatDateMedium(march, "en"))
  })

  it("puts the day first in German and the month first in English", () => {
    const german = formatDateMedium(AFTERNOON, "de")
    const english = formatDateMedium(AFTERNOON, "en")

    expect(german.indexOf("21")).toBeLessThan(german.indexOf("Aug"))
    expect(
      english.indexOf("Aug"),
      "if the month stops leading in English, the language never reached localeForLang().",
    ).toBeLessThan(english.indexOf("21"))
  })

  it("prints the day without a leading zero", () => {
    // day "numeric" here, unlike the two numeric formats above which pad to
    // "2-digit". Pinned so the difference between the two shapes stays a
    // deliberate choice rather than an accident nobody noticed.
    const ninthOfSeptember = new Date(2026, 8, 9, 12, 0)
    expect(formatDateMedium(ninthOfSeptember, "de")).toBe("9. Sept. 2026")
    expect(formatDateMedium(ninthOfSeptember, "en")).toBe("Sep 9, 2026")
    expect(formatDateMedium(SINGLE_DIGIT_DAY, "de")).toBe("9. Jan. 2026")
    expect(formatDateMedium(SINGLE_DIGIT_DAY, "en")).toBe("Jan 9, 2026")
  })
})

/* ==========================================================================
 * 5. The invalid Date guard - shared by all three date functions
 * ========================================================================== */

describe("an invalid Date", () => {
  it("renders as empty, never as the words Invalid Date", () => {
    for (const [name, format] of DATE_FORMATTERS) {
      for (const lang of LANGS) {
        expect(
          format(INVALID, lang),
          `${name} (${lang}): without the isValidDate guard this is either the ` +
            "literal string 'Invalid Date' sitting in the UI looking like data, " +
            "or a RangeError thrown out of Intl. The empty string is what lets " +
            "the caller fall back to its own raw input.",
        ).toBe("")
        expect(format(INVALID, lang), `${name} (${lang})`).not.toContain("Invalid")
        expect(format(INVALID, lang), `${name} (${lang})`).not.toContain("NaN")
      }
    }
  })

  it("is empty for a Date built from NaN as well, not only from a bad string", () => {
    // The same invalid state reached the other way: `new Date(NaN)` is what a
    // caller produces from a missing or unparsed timestamp field.
    const fromNaN = new Date(Number.NaN)
    for (const [name, format] of DATE_FORMATTERS) {
      for (const lang of LANGS) {
        expect(format(fromNaN, lang), `${name} (${lang})`).toBe("")
      }
    }
  })

  it("has a control: a VALID Date is never empty", () => {
    // Guards the opposite mutant, an isValidDate that answers false for
    // everything. Without this line the two blocks above would pass happily on
    // a module whose date functions returned "" unconditionally.
    for (const [name, format] of DATE_FORMATTERS) {
      for (const lang of LANGS) {
        expect(format(AFTERNOON, lang), `${name} (${lang})`).not.toBe("")
      }
    }
  })
})

/* ==========================================================================
 * 6. Locale coupling - the property that holds the whole module together
 * ========================================================================== */

describe("locale coupling", () => {
  it("every function moves when the language moves", () => {
    // The single statement of the module's purpose: for a value whose
    // rendering is locale-dependent there is NO function here on which German
    // and English agree. This is what dies if localeForLang is bypassed in one
    // function, or if it starts answering one locale for both languages.
    expect(
      formatNumber(1234, "de"),
      "formatNumber: de and en must not agree on a grouped number",
    ).not.toBe(formatNumber(1234, "en"))

    for (const [name, format] of DATE_FORMATTERS) {
      expect(
        format(AFTERNOON, "de"),
        `${name}: de and en must not agree on a formatted date`,
      ).not.toBe(format(AFTERNOON, "en"))
    }
  })

  it("routes through the same locale mapping the rest of the app uses", () => {
    // Behavioural rather than structural: instead of asserting that the source
    // contains a call to localeForLang, this asserts that the OUTPUT is the one
    // de-DE and en-US produce. A function that hardcoded "de-AT" or that fell
    // back to the host locale would satisfy "de differs from en" above and
    // still fail here.
    expect(formatNumber(1234.5, "de")).toBe((1234.5).toLocaleString("de-DE"))
    expect(formatNumber(1234.5, "en")).toBe((1234.5).toLocaleString("en-US"))

    for (const lang of LANGS) {
      const locale = lang === "de" ? "de-DE" : "en-US"
      expect(formatDateNumeric(AFTERNOON, lang), `lang: ${lang}`).toBe(
        new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(AFTERNOON),
      )
      expect(formatDateMedium(AFTERNOON, lang), `lang: ${lang}`).toBe(
        new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(AFTERNOON),
      )
    }
  })
})
