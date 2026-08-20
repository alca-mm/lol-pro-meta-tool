/**
 * Unit tests for the pure parts of the Team tab's Riot-account UI.
 *
 * Written BEFORE src/components/team/teamUiHelpers.ts exists. Two visible
 * defects are pinned down here:
 *
 *  1. The German plural bug in the sync confirmation. Both components built
 *     the sentence inline as
 *         `${r.imported} neue Match${r.imported === 1 ? "" : "es"} gespeichert.`
 *     which renders "1 neue Match gespeichert." for a single match. German
 *     declines the adjective, not just the noun: it has to be "1 neues Match".
 *  2. RiotAccountPanel.tsx and RiotAccountSummary.tsx were hardcoded German in
 *     an app that ships DE and EN.
 *
 * Sections 8 and 9 were added later, for three more instances of the very
 * same defect class in the same folder:
 *
 *  3. The dashboard header rendered "1 Mitglieder" / "1 Members" and
 *     "1 Champion-Notizen" / "1 Champion Notes", because it put a bare count
 *     in front of a noun that only existed in its plural form.
 *  4. TeamMembersPanel.tsx marked the own row with a hardcoded English
 *     "(you)".
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) - no
 * jsdom, no document, no window. That is exactly why the logic moves into a
 * pure helper module: as an `if` inside the JSX the rule would not be testable
 * at all. Same reasoning as src/components/scout/scoutUiHelpers.ts.
 *
 * Almost everything below is a PROPERTY test - wording stays a product
 * decision and must remain changeable without a red run. The one deliberate
 * exception are the four core sentences in sections 1 and 2: those strings ARE
 * the requirement, so they are quoted verbatim.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import {
  RIOT_SYNC_ERROR_CODES,
  TEAM_MEMBER_COUNT_KEYS,
  TEAM_NOTE_COUNT_KEYS,
  TEAM_RIOT_SYNCED_KEYS,
  isRiotSyncErrorCode,
  pluralMessage,
  riotErrorMessage,
  riotSyncErrorKey,
  riotSyncSuccessMessage,
} from "../src/components/team/teamUiHelpers"
import type {
  PluralKeys,
  RiotSyncErrorCode,
  RiotSyncMessageVariant,
  TeamTranslate,
} from "../src/components/team/teamUiHelpers"

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

/**
 * `de` is a const object literal and `en` is typed `Translations`; neither can
 * be indexed with a plain `string` under `strict`. These two views exist only
 * so the generic loops below can walk the catalogues by key name. The values
 * really are all strings - the mapped type in src/i18n/types.ts guarantees it.
 */
const DE: Record<string, string> = de
const EN: Record<string, string> = en

const tDe: TeamTranslate = (key) => de[key]
const tEn: TeamTranslate = (key) => en[key]

const LANGS: ReadonlyArray<readonly [string, TeamTranslate, Record<string, string>]> = [
  ["de", tDe, DE],
  ["en", tEn, EN],
]

const VARIANTS: readonly RiotSyncMessageVariant[] = ["panel", "summary"]

/** Convenience wrapper so the call sites below read as sentences. */
function success(
  t: TeamTranslate,
  imported: number,
  variant: RiotSyncMessageVariant,
  moreMayBeAvailable = false,
): string {
  return riotSyncSuccessMessage(t, { imported, moreMayBeAvailable }, variant)
}

/** The prefix that marks a string belonging to the Riot-account UI. */
const TEAM_RIOT_PREFIX = "team_riot_"

const teamRiotKeys = (dict: Record<string, string>): string[] =>
  Object.keys(dict).filter((key) => key.startsWith(TEAM_RIOT_PREFIX))

/**
 * The literal chunks of a catalogue value, with `{placeholders}` cut out.
 *
 * Used to ask "did this sentence come out of the catalogue?" without pinning
 * down the key name (the implementation is free to name its keys) and without
 * quoting the German wording. Short fragments are dropped: a chunk like ":" or
 * "Sync" would match almost any message and make the check vacuous.
 */
const MIN_CHUNK_LENGTH = 8

const chunksOf = (value: string): string[] =>
  value
    .split(/\{\w+\}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= MIN_CHUNK_LENGTH)

/** True when some `team_riot_` value is fully present in `message`. */
const containsTeamRiotCopy = (dict: Record<string, string>, message: string): boolean =>
  teamRiotKeys(dict).some((key) => {
    const chunks = chunksOf(dict[key])
    return chunks.length > 0 && chunks.every((chunk) => message.includes(chunk))
  })

/* ==========================================================================
 * 1. German declension - the reported defect
 * ========================================================================== */

describe("riotSyncSuccessMessage: German declension", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: writes "1 neues Match gespeichert." for a single match`, () => {
      expect(success(tDe, 1, variant)).toContain("1 neues Match gespeichert.")
    })

    it(`${variant}: never writes "1 neue Match" again`, () => {
      // THE reported bug, frozen. The old inline expression pluralised only
      // the noun ("Match" -> "Matches") and left the adjective in its plural
      // form, so a single imported match read "1 neue Match gespeichert.".
      // Note this is a real counter-check, not a tautology: "1 neues Match"
      // does not contain "1 neue Match" as a substring (an "s" sits where the
      // space would have to be).
      expect(success(tDe, 1, variant)).not.toContain("1 neue Match")
    })

    it(`${variant}: writes "2 neue Matches gespeichert." for two`, () => {
      expect(success(tDe, 2, variant)).toContain("2 neue Matches gespeichert.")
    })

    it(`${variant}: uses the plural for zero, which is correct in German`, () => {
      // "0 neues Match" would be wrong; German counts zero as a plural.
      expect(success(tDe, 0, variant)).toContain("0 neue Matches gespeichert.")
    })
  }
})

/* ==========================================================================
 * 2. English plural
 * ========================================================================== */

describe("riotSyncSuccessMessage: English plural", () => {
  for (const variant of VARIANTS) {
    it(`${variant}: writes "1 new match saved." for a single match`, () => {
      expect(success(tEn, 1, variant)).toContain("1 new match saved.")
    })

    it(`${variant}: writes "2 new matches saved." for two`, () => {
      expect(success(tEn, 2, variant)).toContain("2 new matches saved.")
    })

    it(`${variant}: never writes "2 new match saved."`, () => {
      expect(success(tEn, 2, variant)).not.toContain("2 new match saved.")
    })

    it(`${variant}: uses the plural for zero`, () => {
      expect(success(tEn, 0, variant)).toContain("0 new matches saved.")
    })
  }
})

/* ==========================================================================
 * 3. The two variants and the "more may be available" hint
 *
 * Deliberately no quoted sentences here: which words the hint uses is a copy
 * decision. What is asserted is the SHAPE - something is appended, it comes
 * out of the catalogue, and `panel` says more than `summary`.
 * ========================================================================== */

describe("riotSyncSuccessMessage: variants and the more-available hint", () => {
  for (const [lang, t] of LANGS) {
    for (const variant of VARIANTS) {
      it(`${lang}/${variant}: appends a hint when more matches may be available`, () => {
        const plain = success(t, 3, variant, false)
        const more = success(t, 3, variant, true)

        expect(plain.length, `${lang}/${variant}: empty base message`).toBeGreaterThan(0)
        expect(more.length, `${lang}/${variant}: nothing was appended`).toBeGreaterThan(plain.length)
        // Appended, not replaced: the counting sentence survives untouched.
        expect(more, `${lang}/${variant}: the base message was rewritten`).toContain(plain)
      })
    }

    it(`${lang}: takes the appended hint from i18n, not from a literal in the code`, () => {
      // Property, not wording: SOME team_riot_ value must be fully present in
      // the long form and absent from the short one. A hardcoded German hint
      // would satisfy neither half.
      const plain = success(t, 3, "panel", false)
      const more = success(t, 3, "panel", true)
      const dict = lang === "de" ? DE : EN

      const fromCatalogue = teamRiotKeys(dict).some((key) => {
        const chunks = chunksOf(dict[key])
        return (
          chunks.length > 0 &&
          chunks.every((chunk) => more.includes(chunk)) &&
          chunks.some((chunk) => !plain.includes(chunk))
        )
      })

      expect(fromCatalogue, `${lang}: the extra sentence is in no team_riot_ key`).toBe(true)
    })
  }

  for (const moreMayBeAvailable of [false, true]) {
    it(`panel is the verbose variant, summary the compact one (more=${moreMayBeAvailable})`, () => {
      for (const [lang, t] of LANGS) {
        const panel = success(t, 1, "panel", moreMayBeAvailable)
        const summary = success(t, 1, "summary", moreMayBeAvailable)
        expect(panel.length, `${lang}: panel is not longer than summary`).toBeGreaterThan(
          summary.length,
        )
      }
    })
  }

  it("says the same thing about the count in both variants", () => {
    // The variants differ in framing, never in the number they report.
    for (const [lang, t] of LANGS) {
      for (const imported of [0, 1, 2, 37]) {
        const summary = success(t, imported, "summary")
        expect(success(t, imported, "panel"), `${lang}/${imported}`).toContain(summary)
      }
    }
  })
})

/* ==========================================================================
 * 4. Error codes
 * ========================================================================== */

/**
 * Spelled out as a literal on purpose: deriving the expectation from
 * `RIOT_SYNC_ERROR_CODES` would make the assertion true by construction and
 * stop it catching the very drift it exists to catch. The annotation is the
 * second half of the check - a code that is not in the union is a compile
 * error here, so union and array cannot part ways silently.
 */
const EXPECTED_CODES: readonly RiotSyncErrorCode[] = [
  // Three from the edge function: the server's contract.
  "riot_account_not_found",
  "riot_account_not_linked",
  "riot_rate_limited",
  // Four the client transport layer produces itself, added 2026-08-20 when
  // riotService stopped treating a Supabase gateway body as a success.
  "riot_invalid_response",
  "riot_network_error",
  "riot_not_configured",
  "riot_unauthorized",
]

describe("RIOT_SYNC_ERROR_CODES", () => {
  it("covers the union exactly, without duplicates", () => {
    expect(RIOT_SYNC_ERROR_CODES).toHaveLength(7)
    expect(new Set(RIOT_SYNC_ERROR_CODES).size).toBe(RIOT_SYNC_ERROR_CODES.length)
    expect([...RIOT_SYNC_ERROR_CODES].sort()).toEqual([...EXPECTED_CODES].sort())
  })

  it("builds the documented key shape, resolvable in both languages", () => {
    for (const code of RIOT_SYNC_ERROR_CODES) {
      const key = riotSyncErrorKey(code)
      expect(key).toBe(`team_riot_error_${code}`)

      for (const [lang, , dict] of LANGS) {
        expect(typeof dict[key], `${lang}.${key} is missing`).toBe("string")
        expect(dict[key].length, `${lang}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe("isRiotSyncErrorCode", () => {
  it("accepts every code in RIOT_SYNC_ERROR_CODES, edge and transport alike", () => {
    for (const code of RIOT_SYNC_ERROR_CODES) expect(isRiotSyncErrorCode(code), code).toBe(true)
  })

  it("rejects anything else the edge function may return", () => {
    const foreign = [
      "",
      "   ",
      "Invalid token",
      "Riot API error: 502",
      "riot_account", // a prefix is not a code
      "riot_account_not_found_v2", // nor is an extension of one
      "RIOT_RATE_LIMITED", // matching is exact, not case-insensitive
      "team_riot_error_riot_rate_limited", // the i18n key is not the code
    ]
    for (const value of foreign) expect(isRiotSyncErrorCode(value), value).toBe(false)
  })
})

describe("riotErrorMessage", () => {
  it("returns the translated sentence for every known code", () => {
    for (const [lang, t, dict] of LANGS) {
      for (const code of RIOT_SYNC_ERROR_CODES) {
        expect(riotErrorMessage(t, code), `${lang}.${code}`).toBe(dict[riotSyncErrorKey(code)])
      }
    }
  })

  it("never hands an unknown raw error to the user naked", () => {
    // The old components did exactly that: `: err` / `: result`, so a user
    // could be shown "Invalid token" or a bare HTTP status.
    for (const [lang, t, dict] of LANGS) {
      for (const raw of ["Invalid token", "Riot API error: 502"]) {
        const text = riotErrorMessage(t, raw)
        const label = `${lang}: "${raw}" -> "${text}"`

        expect(text, label).not.toBe(raw)
        // The raw text MAY travel along as a detail, so the result has to be
        // strictly longer than it, never a truncation.
        expect(text.length, label).toBeGreaterThan(raw.length)
        expect(containsTeamRiotCopy(dict, text), `${label}: no catalogue text in it`).toBe(true)
      }
    }
  })

  it("translates the fallback instead of hardcoding one language", () => {
    // The cheapest possible proof that the collective sentence really goes
    // through i18n: a hardcoded German fallback would be byte-identical in EN.
    for (const raw of ["Invalid token", "Riot API error: 502"]) {
      expect(riotErrorMessage(tDe, raw), raw).not.toBe(riotErrorMessage(tEn, raw))
    }
  })

  it("does not mistake a lookalike for a known code", () => {
    // Guards against a `startsWith`/`includes` implementation of the lookup.
    // Note the raw text does contain a machine code as a substring - that is
    // the documented exception to section 5's "no code in the text" rule,
    // because the fallback quotes what it was given.
    const lookalike = "riot_account_not_found_v2"
    expect(riotErrorMessage(tDe, lookalike)).not.toBe(
      DE[riotSyncErrorKey("riot_account_not_found")],
    )
  })
})

/* ==========================================================================
 * 5. Nothing raw reaches the screen
 * ========================================================================== */

describe("no machine code and no unsubstituted placeholder reaches the screen", () => {
  /** Every message the two components can produce from a well-formed input. */
  const allMessages = (): string[] => {
    const messages: string[] = []
    for (const [, t] of LANGS) {
      for (const variant of VARIANTS) {
        for (const imported of [0, 1, 2, 42]) {
          for (const moreMayBeAvailable of [false, true]) {
            messages.push(riotSyncSuccessMessage(t, { imported, moreMayBeAvailable }, variant))
          }
        }
      }
      for (const code of RIOT_SYNC_ERROR_CODES) messages.push(riotErrorMessage(t, code))
    }
    return messages
  }

  it("holds for every success and every known-error message in both languages", () => {
    const messages = allMessages()
    // 2 languages * (2 variants * 4 counts * 2 hint states + 7 codes) = 46.
    expect(messages).toHaveLength(46)

    for (const message of messages) {
      expect(message, "empty message").not.toBe("")
      expect(message, `unsubstituted placeholder in "${message}"`).not.toMatch(/\{\w+\}/)
      expect(message, `"undefined" leaked into "${message}"`).not.toContain("undefined")
      expect(message, `stray whitespace in "${message}"`).toBe(message.trim())
      expect(message, `doubled space in "${message}"`).not.toMatch(/ {2}/)

      for (const code of RIOT_SYNC_ERROR_CODES) {
        expect(message, `machine code ${code} in "${message}"`).not.toContain(code)
      }
    }
  })

  it("holds for the unknown-error fallback too, apart from the detail it quotes", () => {
    // The raw text chosen here is deliberately NOT code-shaped, so even the
    // quoted detail must stay free of machine codes.
    for (const [lang, t] of LANGS) {
      const text = riotErrorMessage(t, "Riot API error: 502")
      expect(text, `${lang}: placeholder in "${text}"`).not.toMatch(/\{\w+\}/)
      expect(text, `${lang}: "undefined" in "${text}"`).not.toContain("undefined")
      expect(text, `${lang}: stray whitespace in "${text}"`).toBe(text.trim())

      for (const code of RIOT_SYNC_ERROR_CODES) {
        expect(text, `${lang}: machine code ${code} in "${text}"`).not.toContain(code)
      }
    }
  })
})

/* ==========================================================================
 * 6. The components carry no German text any more
 *
 * There is no jsdom in this suite, so this cannot be checked by rendering. It
 * is checked against the SOURCE instead - the same move tests/scoutStatsImport
 * .test.ts makes for the purity of statsImport.ts (section 21 there).
 *
 * How the heuristic works, and where it is fuzzy:
 *
 *  - Comments are removed first. A German comment is fine and expected; only
 *    what can reach the screen counts. Block comments go first, then `//` to
 *    end of line, with a lookbehind so that "https://" survives. Two known
 *    imprecisions, both in the harmless direction: a `//` INSIDE a string
 *    literal would truncate that line, and a block-comment terminator inside a
 *    string would end a "comment" early. Both can only hide a German word
 *    (false negative), never invent one (false alarm).
 *  - The remaining source is then checked for German-only letters as a WHOLE,
 *    not only inside string literals. That is on purpose and it is broader
 *    than "no string literal": the worst offender in the old code was
 *    `<button>Ändern</button>`, and a JSX text node is not a string literal at
 *    all. Any hit is therefore reported, whether it sits in "…", '…', `…` or
 *    between two tags.
 *  - Identifiers with umlauts would also be flagged. None exist, and none
 *    should - so that is a rule, not a false alarm.
 * ========================================================================== */

const COMPONENT_FILES = ["RiotAccountPanel.tsx", "RiotAccountSummary.tsx"] as const

const readComponent = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/components/team/${name}`, import.meta.url)), "utf8")

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

/** Letters that exist in German but not in English. */
const GERMAN_ONLY_LETTERS = /[äöüÄÖÜß]/

describe("comment stripper", () => {
  // The scan below is only as trustworthy as this helper, so it is checked.
  it("drops comments, keeps code, and does not choke on a URL", () => {
    expect(stripComments('const a = "x" // Änderung\n')).not.toContain("Änderung")
    expect(stripComments("/* Änderung */ const a = 1")).not.toContain("Änderung")
    expect(stripComments("{/* Änderung */}")).not.toContain("Änderung")
    expect(stripComments('const a = "ü"')).toContain("ü")
    expect(stripComments('const u = "https://example.test/ü"')).toContain("ü")
  })
})

describe("RiotAccount components are free of hardcoded German", () => {
  for (const name of COMPONENT_FILES) {
    it(`${name} holds no German-only letter outside comments`, () => {
      const source = readComponent(name)
      // Guard against a silently empty or moved file making this vacuous.
      expect(source.length, `${name} looks empty`).toBeGreaterThan(200)

      const hits = stripComments(source)
        .split("\n")
        .map((line, index) => `${index + 1}: ${line.trim()}`)
        .filter((line) => GERMAN_ONLY_LETTERS.test(line))

      expect(hits, `${name} still carries German text:\n${hits.join("\n")}`).toEqual([])
    })

    it(`${name} no longer builds the broken plural inline`, () => {
      // The exact fragment of the old expression. Checked on the stripped
      // source so that a comment documenting the old bug does not trip it.
      expect(stripComments(readComponent(name))).not.toContain("neue Match")
    })
  }
})

/* ==========================================================================
 * 7. i18n consistency of the new keys
 *
 * tests/i18nScoutCopy.test.ts enforces these properties for `scout_` keys and
 * catalogue-wide hygiene; this section applies the same rules to the
 * `team_riot_` family that the helper module introduces.
 * ========================================================================== */

describe("team_riot_ copy", () => {
  const deKeys = teamRiotKeys(DE)
  const enKeys = teamRiotKeys(EN)

  it("exists at all", () => {
    // Without this the whole section would pass vacuously on an empty family -
    // which is exactly the state before the keys are added.
    expect(deKeys.length, "no team_riot_ key in de.ts").toBeGreaterThan(0)
  })

  it("exposes the same keys in both languages, none of them empty", () => {
    expect([...enKeys].sort()).toEqual([...deKeys].sort())

    for (const key of deKeys) {
      for (const [lang, , dict] of LANGS) {
        expect(typeof dict[key], `${lang}.${key} is missing`).toBe("string")
        expect(dict[key].trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it("uses the same {placeholders} in DE and EN", () => {
    const placeholdersOf = (value: string): string[] =>
      [...new Set(value.match(/\{\w+\}/g) ?? [])].sort()

    for (const key of deKeys) {
      expect(placeholdersOf(EN[key] ?? ""), `${key}: placeholders differ`).toEqual(
        placeholdersOf(DE[key]),
      )
    }
  })

  it("counts through {count} in both counting keys", () => {
    for (const key of ["team_riot_syncedOne", "team_riot_syncedMany"]) {
      for (const [lang, , dict] of LANGS) {
        expect(typeof dict[key], `${lang}.${key} is missing`).toBe("string")
        expect(dict[key], `${lang}.${key} does not carry {count}`).toContain("{count}")
      }
    }
  })

  it("follows the project copy rule", () => {
    for (const key of deKeys) {
      for (const [lang, , dict] of LANGS) {
        const value = dict[key]
        const label = `${lang}.${key}: "${value}"`

        expect(value, `${label} contains a dash aside`).not.toMatch(/[—–]/)
        expect(value, `${label} contains "--"`).not.toContain("--")
        expect(value, `${label} contains a doubled space`).not.toMatch(/ {2}/)
        expect(value, `${label} has leading or trailing whitespace`).toBe(value.trim())
      }
    }
  })

  /**
   * The sentence-length half of the same rule (CLAUDE.md P4a).
   *
   * It needs its own test because the catalogue-wide length check in
   * tests/i18nScoutCopy.test.ts filters on `scout_` keys, so the `team_riot_`
   * family was covered for dashes and whitespace but NOT for length. Without
   * this, the rule was documented and unenforced for exactly the keys added
   * last.
   *
   * Splitting on `.`/`!`/`?` FOLLOWED BY WHITESPACE, the same heuristic the
   * scout test uses: the whitespace requirement keeps `OP.GG` and decimals in
   * one piece. It over-splits on "z. B." and on step numbers, which can only
   * ever make a fragment shorter, never invent a long one.
   */
  it("keeps every sentence under the length limit", () => {
    const MAX_SENTENCE_LENGTH = 200

    for (const key of deKeys) {
      for (const [lang, , dict] of LANGS) {
        for (const line of dict[key].split("\n")) {
          for (const sentence of line.split(/(?<=[.!?])\s+/)) {
            expect(
              sentence.trim().length,
              `${lang}.${key} has a sentence of ${sentence.trim().length} chars: "${sentence.trim()}"`,
            ).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH)
          }
        }
      }
    }
  })
})

/* ==========================================================================
 * 8. pluralMessage - the same defect class, three more places
 *
 * The Riot sync line was not the only counted string in the team tab. The
 * dashboard header glued a bare number in front of a fixed plural noun:
 *
 *     {members.length} {t("team_members")}   -> "1 Mitglieder" / "1 Members"
 *     {notesCount} {t("team_notesSummary")}  -> "1 Champion-Notizen"
 *                                              / "1 Champion Notes"
 *
 * Both are reachable: a solo team has exactly one member, and the notes line
 * is only guarded by `notesCount > 0`. pluralMessage() is that rule written
 * once; riotSyncSuccessMessage() now goes through it too.
 *
 * Wording stays a product decision, so almost nothing here quotes a sentence.
 * What is quoted are the four broken renderings - those are the requirement.
 * ========================================================================== */

/** Every counted key pair the team tab ships, with a label for failure output. */
const PLURAL_PAIRS: ReadonlyArray<readonly [string, PluralKeys]> = [
  ["members", TEAM_MEMBER_COUNT_KEYS],
  ["notes", TEAM_NOTE_COUNT_KEYS],
  ["riotSynced", TEAM_RIOT_SYNCED_KEYS],
]

/**
 * The exact strings the two dashboard defects put on screen for a count of 1.
 * Frozen here so a plural form can never creep back into a singular slot.
 */
const SINGULAR_DEFECTS: readonly string[] = [
  "1 Mitglieder", // de, from {members.length} {t("team_members")}
  "1 Members", // en, same line
  "1 Champion-Notizen", // de, from {notesCount} {t("team_notesSummary")}
  "1 Champion Notes", // en, same line
]

describe("pluralMessage: key selection", () => {
  for (const [label, keys] of PLURAL_PAIRS) {
    for (const [lang, t, dict] of LANGS) {
      it(`${lang}/${label}: a count of 1 takes the singular key`, () => {
        expect(pluralMessage(t, 1, keys)).toBe(dict[keys.one].split("{count}").join("1"))
      })

      it(`${lang}/${label}: a count of 2 takes the plural key`, () => {
        expect(pluralMessage(t, 2, keys)).toBe(dict[keys.many].split("{count}").join("2"))
      })

      it(`${lang}/${label}: a count of 0 takes the plural key, not the singular`, () => {
        // "0 Mitglieder" / "0 Members" is correct in both languages,
        // "0 Mitglied" is not. Zero belongs in the plural branch.
        expect(pluralMessage(t, 0, keys)).toBe(dict[keys.many].split("{count}").join("0"))
        expect(pluralMessage(t, 0, keys)).not.toBe(pluralMessage(t, 1, keys))
      })

      it(`${lang}/${label}: singular and plural really differ in wording`, () => {
        // Not just in the number: with the digits removed the two forms must
        // still be different text. A pair whose halves point at the same
        // string would satisfy every other test in this section.
        const stripDigits = (value: string): string => value.replace(/\d+/g, "")
        expect(stripDigits(pluralMessage(t, 1, keys))).not.toBe(
          stripDigits(pluralMessage(t, 2, keys)),
        )
      })
    }
  }
})

describe("pluralMessage: the count reaches the screen", () => {
  for (const [label, keys] of PLURAL_PAIRS) {
    for (const [lang, t] of LANGS) {
      for (const count of [0, 1, 2, 37]) {
        it(`${lang}/${label}/${count}: substitutes {count} and leaves nothing raw`, () => {
          const message = pluralMessage(t, count, keys)
          const context = `${lang}/${label}/${count}: "${message}"`

          expect(message, `${context} is empty`).not.toBe("")
          expect(message, `${context} misses the number`).toContain(String(count))
          expect(message, `${context} has an unsubstituted placeholder`).not.toMatch(/\{\w+\}/)
          expect(message, `${context} contains a brace`).not.toContain("{")
          expect(message, `${context} leaked "undefined"`).not.toContain("undefined")
          expect(message, `${context} has stray whitespace`).toBe(message.trim())
          expect(message, `${context} has a doubled space`).not.toMatch(/ {2}/)
        })
      }
    }
  }
})

describe("pluralMessage: the reported dashboard defects stay fixed", () => {
  for (const [label, keys] of PLURAL_PAIRS) {
    for (const [lang, t] of LANGS) {
      it(`${lang}/${label}: a count of 1 renders none of the broken forms`, () => {
        // THE reported bug, frozen. The dashboard header used to read
        // "1 Mitglieder", "1 Members", "1 Champion-Notizen" and
        // "1 Champion Notes" - a bare count in front of a noun that only ever
        // existed in its plural form.
        //
        // Real counter-checks, not tautologies: "1 Mitglied" does not contain
        // "1 Mitglieder" (nothing follows the "d"), "1 Member" does not
        // contain "1 Members", and "1 Champion Note" does not contain
        // "1 Champion Notes".
        const message = pluralMessage(t, 1, keys)
        for (const defect of SINGULAR_DEFECTS) {
          expect(message, `${lang}/${label}: "${message}" still reads "${defect}"`).not.toContain(
            defect,
          )
        }
      })
    }
  }
})

describe("pluralMessage: the key pairs resolve in both catalogues", () => {
  for (const [label, keys] of PLURAL_PAIRS) {
    it(`${label}: both keys exist, carry {count}, and are not the same key`, () => {
      expect(keys.one, `${label}: one and many are the same key`).not.toBe(keys.many)

      for (const key of [keys.one, keys.many]) {
        for (const [lang, , dict] of LANGS) {
          const value = dict[key]
          const where = `${lang}.${key}`

          expect(typeof value, `${where} is missing`).toBe("string")
          expect(value.trim().length, `${where} is empty`).toBeGreaterThan(0)
          // Both halves carry the placeholder, the singular one included. A
          // baked in "1" would break DE/EN placeholder parity and would hide
          // the number from whoever re-words the string next.
          expect(value, `${where} does not carry {count}`).toContain("{count}")

          // The project copy rule, the same way section 7 applies it to the
          // team_riot_ family.
          expect(value, `${where} contains a dash aside`).not.toMatch(/[—–]/)
          expect(value, `${where} contains "--"`).not.toContain("--")
          expect(value, `${where} contains a doubled space`).not.toMatch(/ {2}/)
          expect(value, `${where} has leading or trailing whitespace`).toBe(value.trim())
          expect(value.length, `${where} is longer than 200 characters`).toBeLessThanOrEqual(200)
        }
      }
    })
  }
})

describe("riotSyncSuccessMessage still counts through pluralMessage", () => {
  // Moving the sync line onto the generic helper must not change what the two
  // Riot panels print. Sections 1 and 2 already quote the four sentences; this
  // states the relationship, so a later change to pluralMessage cannot
  // silently split the sync line off from the shared rule.
  for (const [lang, t] of LANGS) {
    for (const variant of VARIANTS) {
      for (const imported of [0, 1, 2, 42]) {
        it(`${lang}/${variant}/${imported}: embeds the pluralMessage output verbatim`, () => {
          expect(success(t, imported, variant)).toContain(
            pluralMessage(t, imported, TEAM_RIOT_SYNCED_KEYS),
          )
        })
      }
    }
  }
})

/* ==========================================================================
 * 9. The dashboard components take their text from i18n too
 *
 * The same source-level scan as section 6, applied to the two components this
 * change touched. Neither was ever fully hardcoded German, so the umlaut scan
 * is a regression guard rather than a fix being pinned down - it was verified
 * to run clean before it was added here.
 *
 * The "(you)" check is the actual defect: TeamMembersPanel.tsx marked the own
 * row with a literal English "(you)" in an app that ships DE and EN.
 * ========================================================================== */

const DASHBOARD_FILES = ["TeamDashboard.tsx", "TeamMembersPanel.tsx"] as const

describe("team dashboard components take their text from i18n", () => {
  for (const name of DASHBOARD_FILES) {
    it(`${name} holds no German-only letter outside comments`, () => {
      const source = readComponent(name)
      // Guard against a silently empty or moved file making this vacuous.
      expect(source.length, `${name} looks empty`).toBeGreaterThan(200)

      const hits = stripComments(source)
        .split("\n")
        .map((line, index) => `${index + 1}: ${line.trim()}`)
        .filter((line) => GERMAN_ONLY_LETTERS.test(line))

      expect(hits, `${name} carries German text:\n${hits.join("\n")}`).toEqual([])
    })
  }

  it("TeamMembersPanel.tsx no longer marks the own row with a literal (you)", () => {
    // Checked on the stripped source, so the comment that documents the old
    // text does not trip it.
    expect(stripComments(readComponent("TeamMembersPanel.tsx"))).not.toContain("(you)")
  })

  it("team_youMarker is really translated, not English in both catalogues", () => {
    // The cheapest proof that the marker went through i18n rather than just
    // moving the English literal into a key: a key that carries "(you)" in
    // both languages would satisfy the source scan above and still ship
    // English to a German user.
    for (const [lang, , dict] of LANGS) {
      expect(typeof dict.team_youMarker, lang + ": team_youMarker is missing").toBe("string")
      expect(dict.team_youMarker.trim().length, lang + ": team_youMarker is empty").toBeGreaterThan(0)
      expect(dict.team_youMarker, lang + ": stray whitespace").toBe(dict.team_youMarker.trim())
    }
    expect(DE.team_youMarker, "DE and EN carry the same marker").not.toBe(EN.team_youMarker)
  })

  it("TeamDashboard.tsx no longer glues a number in front of a plural noun", () => {
    // The two defective expressions, verbatim. Both are gone; the header
    // counts through the helper now.
    const source = stripComments(readComponent("TeamDashboard.tsx"))
    expect(source).not.toContain('{members.length} {t("team_members")}')
    expect(source).not.toContain('{notesCount} {t("team_notesSummary")}')
    expect(source, "the header does not call the helper").toContain("pluralMessage")
  })
})
