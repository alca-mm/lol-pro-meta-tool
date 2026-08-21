/**
 * Unit tests for the pure parts of the Tournament Scout UI.
 *
 * These run in Vitest's Node environment (see vite.config.ts) — there is no
 * jsdom and no component rendering here on purpose. Everything tested lives in
 * src/components/scout/scoutUiHelpers.ts and src/components/scout/scoutExport.ts,
 * which is why that logic was pulled out of the React components in the first
 * place.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import { SCOUT_KDA_MAX_PLAUSIBLE, analyzeScout } from "../src/scout/analysis"
import { parseScoutInput } from "../src/scout/linkParser"
import { createEmptyScoutLineup, normalizeScoutState } from "../src/scout/storage"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_REMOVED_PLAYERS_MAX,
  SCOUT_SCHEMA_VERSION,
  SCOUT_SUBSTITUTE_SLOTS,
} from "../src/scout/types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutLineup,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutRemovedPlayer,
} from "../src/scout/types"
import {
  SCOUT_EXAMPLE_INPUT,
  SCOUT_MANUAL_SOURCE_VALUES,
  SCOUT_RECENCY_VALUES,
  SCOUT_ROLE_VALUES,
  archiveRemovedPlayers,
  assignPlayerToSlot,
  autofillLineupFromRoles,
  banCandidateKda,
  banRoleLabels,
  buildScoutLineupSummary,
  clearLineupSlot,
  compareChampionNames,
  createEntryId,
  defaultRoleForPlayer,
  fillPlaceholders,
  findDroppedPlayersWithData,
  findLineupTarget,
  formatLineupRoles,
  formatScoutNumber,
  hasScoutData,
  isLineupEmpty,
  lineupStarterSlot,
  liveScoutPlayerDataIds,
  localizeScoutParams,
  orderLineupRoles,
  kdaInputText,
  parseGamesInput,
  parseKdaInput,
  parseWinrateInput,
  pruneLineup,
  removePlayerFromLineup,
  scoutBanPriorityLabel,
  scoutBlockedKey,
  scoutConfidenceKey,
  scoutKdaLabel,
  scoutMembershipKey,
  scoutNoteKey,
  scoutReasonKey,
  scoutRecencyKey,
  scoutRestoreDecision,
  scoutRoleFitKey,
  scoutRoleKey,
  scoutRoleLabel,
  scoutSourceKey,
  scoutStatusKey,
  scoutSubstituteSlotKey,
  scoutUnparsedKey,
  scoutWarningKey,
  sortRemovedPlayers,
  translateCount,
  translateScoutReason,
  translateScoutWarning,
  withEntryIds,
} from "../src/components/scout/scoutUiHelpers"
import { buildScoutExportText } from "../src/components/scout/scoutExport"
// Read-only: the other half of the `lineupRole` contract lives here.
import { roleMismatchHint } from "../src/components/scout/ScoutDataEditor"

const t = (key: TranslationKey): string => de[key]

/* ==========================================================================
 * 1. Mechanical i18n key building
 * ========================================================================== */

describe("scout i18n key builders", () => {
  it("resolves every union value to an existing key in both languages", () => {
    const keys: TranslationKey[] = [
      ...SCOUT_ROLE_VALUES.map(scoutRoleKey),
      ...SCOUT_RECENCY_VALUES.map(scoutRecencyKey),
      ...SCOUT_MANUAL_SOURCE_VALUES.map(scoutSourceKey),
      scoutStatusKey("parsed_from_url"),
      scoutStatusKey("source_link_only"),
      scoutStatusKey("manual_required"),
      scoutStatusKey("not_supported_in_browser"),
      scoutStatusKey("error"),
      scoutConfidenceKey("high"),
      scoutConfidenceKey("medium"),
      scoutConfidenceKey("low"),
      scoutConfidenceKey("none"),
      scoutUnparsedKey("no_riot_id"),
      scoutUnparsedKey("invalid_riot_id"),
      scoutUnparsedKey("malformed_url"),
      scoutUnparsedKey("unknown_url_host"),
      scoutUnparsedKey("unsupported_url_shape"),
      scoutUnparsedKey("empty_multilink"),
      scoutReasonKey("high_winrate_many_games"),
      scoutReasonKey("one_trick"),
      scoutReasonKey("no_data"),
      scoutReasonKey("user_marked_priority"),
      scoutWarningKey("player_without_data"),
      scoutWarningKey("duplicate_players_merged"),
      scoutNoteKey("identity_from_url"),
      scoutNoteKey("unknown_url_shape"),
      scoutBlockedKey("no_public_api"),
      scoutBlockedKey("undocumented_private_api"),
      // Role awareness: every slot, seat, fit and membership must resolve.
      ...SCOUT_LINEUP_SLOTS.map(scoutRoleKey),
      ...SCOUT_SUBSTITUTE_SLOTS.map(scoutSubstituteSlotKey),
      scoutRoleFitKey("onrole"),
      scoutRoleFitKey("offrole"),
      scoutRoleFitKey("flex"),
      scoutRoleFitKey("unknown"),
      scoutMembershipKey("starter"),
      scoutMembershipKey("substitute"),
      scoutMembershipKey("unassigned"),
      scoutReasonKey("onrole_signal"),
      scoutReasonKey("offrole_signal"),
      scoutReasonKey("role_unknown_or_flex"),
      scoutReasonKey("substitute_risk"),
      scoutReasonKey("player_without_lineup_role"),
      scoutWarningKey("incomplete_starting_five"),
      scoutWarningKey("player_without_lineup_role"),
      scoutWarningKey("offrole_data_present"),
      scoutWarningKey("substitute_risk_active"),
      scoutWarningKey("data_loss_on_reparse"),
    ]

    for (const key of keys) {
      expect(typeof de[key], key).toBe("string")
      expect(de[key].length, key).toBeGreaterThan(0)
      expect(typeof en[key], key).toBe("string")
    }
  })

  it("builds the documented key shape", () => {
    expect(scoutRoleKey("jungle")).toBe("scout_role_jungle")
    expect(scoutSourceKey("manual")).toBe("scout_source_manual")
    expect(scoutReasonKey("signature_pick")).toBe("scout_reason_signature_pick")
    expect(scoutWarningKey("flex_pick_warning")).toBe("scout_warning_flex_pick_warning")
    expect(scoutRoleFitKey("offrole")).toBe("scout_rolefit_offrole")
    expect(scoutSubstituteSlotKey("sub2")).toBe("scout_lineup_sub2")
    expect(scoutMembershipKey("starter")).toBe("scout_membership_starter")
  })

  it("labels the bot slot ADC without inventing a second slot identifier", () => {
    // "ADC" is a label and lives only in i18n; the identifier stays "bot".
    expect(scoutRoleKey("bot")).toBe("scout_role_bot")
    expect(de.scout_role_bot).toBe("ADC")
    expect(SCOUT_LINEUP_SLOTS).toContain("bot")
    expect(SCOUT_LINEUP_SLOTS as readonly string[]).not.toContain("adc")
  })
})

/* ==========================================================================
 * 2. Placeholder substitution
 * ========================================================================== */

describe("formatScoutNumber", () => {
  it("keeps integers integral and rounds fractions to one decimal", () => {
    expect(formatScoutNumber(62)).toBe("62")
    expect(formatScoutNumber(62.4567)).toBe("62.5")
    expect(formatScoutNumber(0)).toBe("0")
  })

  it("returns an empty string for a non-finite number", () => {
    expect(formatScoutNumber(Number.NaN)).toBe("")
    expect(formatScoutNumber(Number.POSITIVE_INFINITY)).toBe("")
  })
})

describe("fillPlaceholders", () => {
  it("substitutes every placeholder", () => {
    expect(fillPlaceholders("{winrate}% auf {games} Games", { winrate: 62, games: 14 })).toBe(
      "62% auf 14 Games",
    )
  })

  it("never leaves a raw placeholder behind when a parameter is missing", () => {
    const out = fillPlaceholders("{winrate}% Winrate auf {games} Games — belastbar.", {})
    expect(out).not.toContain("{")
    expect(out).not.toContain("}")
    expect(out).toBe("Winrate auf Games — belastbar.")
  })

  it("leaves a fully substituted text untouched", () => {
    const template = de.scout_reason_high_winrate_many_games
    expect(fillPlaceholders(template, { winrate: 71, games: 42 })).toBe(
      "71% Winrate auf 42 Games, ein belastbares Sample.",
    )
  })

  it("handles a template without placeholders", () => {
    expect(fillPlaceholders(de.scout_reason_one_trick)).toBe(de.scout_reason_one_trick)
  })

  it("returns an empty string for an empty template", () => {
    expect(fillPlaceholders("")).toBe("")
  })
})

describe("localizeScoutParams", () => {
  it("translates role codes so no machine code reaches the screen", () => {
    const params = localizeScoutParams(t, { role: "mid" })
    expect(params?.role).toBe(de.scout_role_mid)
  })

  it("translates a comma separated role list", () => {
    const params = localizeScoutParams(t, { roles: "top,mid" })
    expect(params?.roles).toBe(`${de.scout_role_top}, ${de.scout_role_mid}`)
  })

  it("passes unknown role-ish values and all other params through", () => {
    const params = localizeScoutParams(t, { role: "coach", games: 12 })
    expect(params?.role).toBe("coach")
    expect(params?.games).toBe(12)
  })

  it("translates every *Role parameter the engine ships, not just {role}", () => {
    // `offrole_signal` carries both — untranslated they would read
    // "Auf mid gespielt, aufgestellt aber als jungle".
    const params = localizeScoutParams(t, { signalRole: "mid", lineupRole: "jungle" })
    expect(params?.signalRole).toBe(de.scout_role_mid)
    expect(params?.lineupRole).toBe(de.scout_role_jungle)
  })

  it("leaves a *Role parameter whose value is not a role untouched", () => {
    const params = localizeScoutParams(t, { signalRole: "coach", weight: 0.6 })
    expect(params?.signalRole).toBe("coach")
    expect(params?.weight).toBe(0.6)
  })

  it("returns undefined when there are no params", () => {
    expect(localizeScoutParams(t, undefined)).toBeUndefined()
  })
})

describe("compareChampionNames", () => {
  it("orders case-insensitively and reports equality for case-only differences", () => {
    expect(compareChampionNames("ahri", "Zed")).toBe(-1)
    expect(compareChampionNames("Zed", "ahri")).toBe(1)
    expect(compareChampionNames("Ahri", "ahri")).toBe(0)
  })

  it("sorts a list the same way regardless of the host locale", () => {
    // The point of not using localeCompare: this order is fixed by code units,
    // so it cannot change with the machine's ICU data.
    const sorted = ["Zed", "Ahri", "Vi", "aatrox"].sort(compareChampionNames)
    expect(sorted).toEqual(["aatrox", "Ahri", "Vi", "Zed"])
  })
})

describe("translateScoutReason / translateScoutWarning / translateCount", () => {
  it("renders a reason with its params", () => {
    const text = translateScoutReason(t, {
      code: "high_winrate_many_games",
      params: { winrate: 71, games: 42 },
    })
    expect(text).toBe("71% Winrate auf 42 Games, ein belastbares Sample.")
  })

  it("renders a role-bound reason with a translated role", () => {
    const text = translateScoutReason(t, {
      code: "role_specific_threat",
      params: { role: "support" },
    })
    expect(text).toContain(de.scout_role_support)
    expect(text).not.toContain("support")
  })

  it("renders a warning without leaking the severity into the text", () => {
    const text = translateScoutWarning(t, {
      code: "duplicate_players_merged",
      severity: "info",
      params: { count: 2 },
    })
    expect(text).toBe(de.scout_warning_duplicate_players_merged)
  })

  it("substitutes {count}", () => {
    expect(translateCount(t, "scout_countPlayers", 5)).toBe("Erkannte Spieler: 5")
    expect(translateCount(t, "scout_countUnparsed", 0)).toBe("Nicht erkannte Zeilen: 0")
  })
})

/* ==========================================================================
 * 3. Input validation — the gate in front of the storage layer
 * ========================================================================== */

describe("parseGamesInput", () => {
  it("accepts non-negative integers", () => {
    expect(parseGamesInput("0")).toBe(0)
    expect(parseGamesInput("14")).toBe(14)
    expect(parseGamesInput("  7 ")).toBe(7)
  })

  it("rejects everything storage would silently drop", () => {
    expect(parseGamesInput("")).toBeNull()
    expect(parseGamesInput("-1")).toBeNull()
    expect(parseGamesInput("12.5")).toBeNull()
    expect(parseGamesInput("abc")).toBeNull()
    expect(parseGamesInput("1e3")).toBeNull()
  })
})

describe("parseWinrateInput", () => {
  it("accepts 0 to 100 with decimals and a comma separator", () => {
    expect(parseWinrateInput("0")).toBe(0)
    expect(parseWinrateInput("100")).toBe(100)
    expect(parseWinrateInput("62.5")).toBe(62.5)
    expect(parseWinrateInput("62,5")).toBe(62.5)
  })

  it("rejects values outside 0-100 and non-numbers", () => {
    expect(parseWinrateInput("")).toBeNull()
    expect(parseWinrateInput("-1")).toBeNull()
    expect(parseWinrateInput("100.1")).toBeNull()
    expect(parseWinrateInput("0.62")).toBe(0.62)
    expect(parseWinrateInput("abc")).toBeNull()
  })
})

/**
 * The KDA field is the one OPTIONAL number in a champion row, and that makes it
 * a different kind of gate from `parseGamesInput` / `parseWinrateInput`. Those
 * two answer a single question ("is this a usable number?") and can therefore
 * fold "empty" and "nonsense" into one `null`: an empty games field IS nonsense,
 * because `normalizeManualEntry()` drops the whole row over it.
 *
 * KDA cannot do that. An empty KDA field is a legitimate and very common state
 * meaning "not stated", which `ManualChampionEntry.kda` scores NEUTRALLY on
 * purpose, while `0` is a real and genuinely bad value (no kills, no assists).
 * Three outcomes have to stay apart, so this parser returns a result object
 * instead of `number | null`:
 *
 *   ""     -> { ok: true, value: null }   not stated, scored neutrally
 *   "0"    -> { ok: true, value: 0 }      stated and bad
 *   "abc"  -> { ok: false }               refuse, keep the draft on screen
 *
 * Folding the first two together is precisely the `!kda` / `kda ?? 0` mistake
 * the field doc in src/scout/types.ts forbids, so it is pinned here twice.
 */
describe("parseKdaInput", () => {
  it("reads an empty field as 'not stated', never as a refusal", () => {
    expect(parseKdaInput("")).toEqual({ ok: true, value: null })
    expect(parseKdaInput("   ")).toEqual({ ok: true, value: null })
  })

  it("keeps 0 apart from an empty field — both usable, only one stated", () => {
    expect(parseKdaInput("0")).toEqual({ ok: true, value: 0 })
    expect(parseKdaInput("0,0")).toEqual({ ok: true, value: 0 })
    // Same `ok`, different `value`. A parser returning `number | null` could not
    // express this pair at all, which is the reason for the result object.
    expect(parseKdaInput("")).toEqual({ ok: true, value: null })
  })

  it("accepts decimals with either separator, like the winrate field", () => {
    expect(parseKdaInput("2.5")).toEqual({ ok: true, value: 2.5 })
    expect(parseKdaInput("3,2")).toEqual({ ok: true, value: 3.2 })
    expect(parseKdaInput("1")).toEqual({ ok: true, value: 1 })
    expect(parseKdaInput("  4.75 ")).toEqual({ ok: true, value: 4.75 })
  })

  it("refuses anything that is not a plain non-negative number", () => {
    const refused = ["-1", "-0.5", "abc", "NaN", "Infinity", "-Infinity", "1e3", "3.", ".5", "2..5", "4/1", "3:1", "+2", "2 5"]
    for (const raw of refused) {
      expect(parseKdaInput(raw), raw).toEqual({ ok: false })
    }
  })

  it("refuses a value the scoring would not believe anyway", () => {
    // Same bound `normalizeKda()` uses in src/scout/analysis.ts, imported rather
    // than repeated: a number above it is a typo or a parse accident, and the
    // scoring would silently treat it as "not stated". Refusing it in the editor
    // means the user sees the problem instead of a value that quietly does
    // nothing. The bound itself stays valid input.
    expect(parseKdaInput(String(SCOUT_KDA_MAX_PLAUSIBLE))).toEqual({
      ok: true,
      value: SCOUT_KDA_MAX_PLAUSIBLE,
    })
    expect(parseKdaInput(String(SCOUT_KDA_MAX_PLAUSIBLE + 1))).toEqual({ ok: false })
    expect(parseKdaInput("999")).toEqual({ ok: false })
  })
})

/**
 * The bound lives in the code, the number lives in the sentence the user reads.
 * Nothing connected the two until this test: `scout_manual_kdaInvalid` spells
 * out "between 0 and 100" while `parseKdaInput()` reads
 * {@link SCOUT_KDA_MAX_PLAUSIBLE}. Re-tune the constant and the error message
 * starts lying, silently and in both languages at once.
 *
 * A guard rather than a `{max}` placeholder on purpose: the placeholder would
 * buy the same safety at the price of routing this one short string through
 * `fillPlaceholders`, and the constant has not moved since it was written. If
 * it ever does move, this test says so and the fix is two words in two files.
 *
 * The word boundaries matter. A plain `includes(String(bound))` would still
 * pass for a bound of 10 against the sentence "between 0 and 100", which is the
 * exact drift the test exists to catch.
 */
describe("the KDA error message and the parser agree on the bound", () => {
  const mentionsBound = new RegExp(`\\b${SCOUT_KDA_MAX_PLAUSIBLE}\\b`)

  it("names the very number the parser enforces, in both languages", () => {
    for (const [lang, message] of [
      ["de", de.scout_manual_kdaInvalid],
      ["en", en.scout_manual_kdaInvalid],
    ] as const) {
      expect(
        message,
        `${lang}: scout_manual_kdaInvalid must name ${SCOUT_KDA_MAX_PLAUSIBLE}, the bound ` +
          "parseKdaInput() actually enforces. Update the copy, or the sentence lies.",
      ).toMatch(mentionsBound)
    }
  })

  it("draws the line where the message says it does", () => {
    // Both halves of the promise, so the sentence is checked against behaviour
    // and not just against itself.
    expect(parseKdaInput(String(SCOUT_KDA_MAX_PLAUSIBLE)).ok).toBe(true)
    expect(parseKdaInput(String(SCOUT_KDA_MAX_PLAUSIBLE + 1)).ok).toBe(false)
    expect(parseKdaInput("0").ok).toBe(true)
  })
})

describe("kdaInputText", () => {
  it("shows an empty field for a row that states no KDA", () => {
    expect(kdaInputText(undefined)).toBe("")
    expect(kdaInputText(null)).toBe("")
  })

  it("shows a stated 0 rather than an empty field", () => {
    // The falsiness trap in its display form: `kda ? String(kda) : ""` would
    // blank out a real 0 and the user would retype nothing, losing the value.
    expect(kdaInputText(0)).toBe("0")
  })

  it("round-trips every value the parser accepts", () => {
    for (const value of [0, 1, 2.5, 3.2, 12, 47.75, SCOUT_KDA_MAX_PLAUSIBLE]) {
      expect(parseKdaInput(kdaInputText(value)), String(value)).toEqual({ ok: true, value })
    }
  })
})

/**
 * `kdaInputText()` above renders a KDA back into the *editor field*;
 * `scoutKdaLabel()` renders it into the *read-only* surfaces — the signal rows,
 * the ban plan and the export. The two answer different questions and must not
 * be confused: the field has to show something for every state (an empty string
 * is a legitimate, editable value), while a read-only surface has to show
 * *nothing at all* when nothing was stated. That is why this one returns
 * `string | null` and not `string`: the `null` is the instruction to the caller
 * to omit the whole segment, so a KDA-less champion carries no "KDA unbekannt"
 * noise on every single row (project rule P4c).
 *
 * The `0` case is the discriminating one and is pinned twice, here and in the
 * export below. The KDA is the one displayed number where a falsy check hides
 * exactly the worst value in the list while the 0.5.0 scoring is busy punishing
 * it — screen and ban order would then tell two different stories about the
 * same champion.
 */
describe("scoutKdaLabel", () => {
  const tEn = (key: TranslationKey): string => en[key]

  it("uses one shared i18n key, spelled identically in both catalogues", () => {
    // "KDA" is an acronym, not copy. A translated variant would make the two
    // languages disagree about a number that is the same number.
    expect(de.scout_kdaValue).toBe("KDA {kda}")
    expect(en.scout_kdaValue).toBe(de.scout_kdaValue)
  })

  it("states a KDA with one decimal, identically in both languages", () => {
    expect(scoutKdaLabel(t, 3.2)).toBe("KDA 3.2")
    expect(scoutKdaLabel(tEn, 3.2)).toBe("KDA 3.2")
    // Through `formatScoutNumber`, so the same rounding the rest of the tab uses.
    expect(scoutKdaLabel(t, 3.167)).toBe("KDA 3.2")
    expect(scoutKdaLabel(tEn, 3.167)).toBe("KDA 3.2")
    expect(scoutKdaLabel(t, 4)).toBe("KDA 4")
  })

  it("prints a stated 0 instead of swallowing it", () => {
    // `!kda` and `kda ?? 0` both collapse "stated 0" into "not stated" — the
    // mistake src/scout/types.ts forbids in so many words. `"KDA 0"` is the
    // only answer that keeps the two apart on screen.
    expect(scoutKdaLabel(t, 0)).toBe("KDA 0")
    expect(scoutKdaLabel(tEn, 0)).toBe("KDA 0")
    expect(scoutKdaLabel(t, 0)).not.toBeNull()
    expect(scoutKdaLabel(t, 0)).not.toBe("")
  })

  it("says nothing at all when there is nothing to state", () => {
    for (const translate of [t, tEn]) {
      expect(scoutKdaLabel(translate, null)).toBeNull()
      expect(scoutKdaLabel(translate, undefined)).toBeNull()
      // Not stated is the honest reading of a value the scoring counts as
      // neutral — printing it would advertise a figure that changes nothing.
      expect(scoutKdaLabel(translate, Number.NaN)).toBeNull()
      expect(scoutKdaLabel(translate, Number.POSITIVE_INFINITY)).toBeNull()
      expect(scoutKdaLabel(translate, Number.NEGATIVE_INFINITY)).toBeNull()
    }
  })

  it("never lets a machine value or a raw placeholder reach the label", () => {
    for (const translate of [t, tEn]) {
      for (const kda of [0, 0.5, 2, 3.2, 12.75, SCOUT_KDA_MAX_PLAUSIBLE]) {
        const label = scoutKdaLabel(translate, kda)
        expect(label, String(kda)).not.toBeNull()

        const text = label ?? ""
        expect(text, String(kda)).toMatch(/^KDA \d/)
        expect(text, String(kda)).not.toContain("undefined")
        expect(text, String(kda)).not.toContain("null")
        expect(text, String(kda)).not.toContain("NaN")
        expect(text, String(kda)).not.toMatch(/\{[a-z]+\}/i)
      }
    }
  })
})

describe("withEntryIds / createEntryId", () => {
  const base: ManualChampionEntry = {
    championName: "Ahri",
    games: 10,
    winrate: 60,
    note: "",
    source: "manual",
    recency: "current",
    role: "mid",
  }

  it("adds an id only where one is missing", () => {
    const out = withEntryIds([base, { ...base, id: "keep-me" }])
    expect(out[0].id).toBeTruthy()
    expect(out[1].id).toBe("keep-me")
  })

  it("returns the same array instance when nothing changed", () => {
    const input: ManualChampionEntry[] = [{ ...base, id: "a" }]
    expect(withEntryIds(input)).toBe(input)
  })

  it("never repeats an id", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 200; i += 1) ids.add(createEntryId())
    expect(ids.size).toBe(200)
  })
})

describe("SCOUT_EXAMPLE_INPUT", () => {
  it("is input structure only and carries no numbers to analyse", () => {
    expect(SCOUT_EXAMPLE_INPUT).toContain("#EUW")
    expect(SCOUT_EXAMPLE_INPUT.split("\n").length).toBeGreaterThan(1)
    expect(SCOUT_EXAMPLE_INPUT.toLowerCase()).toContain("demo")
  })

  it("carries no German text — an English user sees the same block", () => {
    // The block goes straight into the visible textarea for every language, so
    // a German word in it is a bug for half the users. `Beispiel` was that word.
    expect(SCOUT_EXAMPLE_INPUT.toLowerCase()).not.toContain("beispiel")
    expect(SCOUT_EXAMPLE_INPUT.toLowerCase()).not.toContain("spieler")
  })

  it("still parses into the five players it demonstrates", () => {
    // The reason the block was NOT moved into src/i18n: it is parser input, and
    // this is the check that keeps it honest after any rename.
    //
    // The roles ARE asserted: the block teaches the "Bot: Name#EUW" and
    // "Support Name#EUW" syntax in the visible textarea, and `parseRiotIdChunk()`
    // consumes a leading role label since 2026-08-18. An example that no longer
    // produces the role it advertises is a bug in the example, not a detail.
    const result = parseScoutInput(SCOUT_EXAMPLE_INPUT)

    expect(result.players.length).toBe(5)
    expect(result.unparsedLines).toEqual([])
    expect(result.duplicatesMerged).toBe(0)

    const roleByName = new Map(result.players.map((player) => [player.riotName, player.role]))
    expect(roleByName.get("DemoBot")).toBe("bot")
    expect(roleByName.get("DemoSupport")).toBe("support")
  })
})

/* ==========================================================================
 * 4. Export text
 * ========================================================================== */

function player(id: string, name: string, role: ScoutPlayer["role"]): ScoutPlayer {
  return {
    id,
    riotName: name,
    tagline: "EUW",
    region: "EUW",
    displayName: `${name}#EUW`,
    role,
    sources: [],
  }
}

function entry(overrides: Partial<ManualChampionEntry>): ManualChampionEntry {
  return {
    championName: "Ahri",
    games: 20,
    winrate: 65,
    note: "",
    source: "opgg",
    recency: "current",
    role: "mid",
    ...overrides,
  }
}

describe("buildScoutExportText", () => {
  it("returns a header-only skeleton when nothing was entered", () => {
    const analysis = analyzeScout([], {})
    const text = buildScoutExportText(t, analysis)

    expect(text.split("\n")[0]).toBe(de.scout_export_header)
    expect(text).toContain(de.scout_teamPlanTitle)
    expect(text).toContain(de.scout_teamPlanEmpty)
    expect(text).toContain(de.scout_sourceHint)
  })

  it("lists bans, per-player picks, weaknesses and warnings", () => {
    const players = [player("euw:mid#euw", "Mid", "mid"), player("euw:top#euw", "Top", "top")]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: [
          entry({ championName: "Ahri", games: 30, winrate: 68 }),
          entry({ championName: "Yone", games: 12, winrate: 40 }),
        ],
      },
      "euw:top#euw": {
        playerId: "euw:top#euw",
        entries: [entry({ championName: "Ahri", games: 18, winrate: 61, role: "top" })],
      },
    }

    const analysis = analyzeScout(players, playerData, { duplicatesMerged: 1 })
    const text = buildScoutExportText(t, analysis)

    expect(text).toContain("Mid#EUW")
    expect(text).toContain("Top#EUW")
    expect(text).toContain("Ahri")
    expect(text).toContain(de.scout_topThreats)
    // Yone: 12 games at 40 % is a weakness, not a threat.
    expect(text).toContain(de.scout_weaknesses)
    expect(text).toContain("Yone")
    // duplicatesMerged was handed through, so the warning must show up.
    expect(text).toContain(de.scout_warning_duplicate_players_merged)
  })

  it("respects the ban and pick limits", () => {
    const players = [player("euw:mid#euw", "Mid", "mid")]
    const champions = ["Ahri", "Yone", "Zed", "Sylas", "Viktor", "Orianna"]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: champions.map((championName, index) =>
          entry({ championName, games: 30 - index, winrate: 70 - index }),
        ),
      },
    }

    const analysis = analyzeScout(players, playerData)
    const text = buildScoutExportText(t, analysis, { maxBans: 2, maxPicksPerPlayer: 1 })

    expect(text).toContain("1. ")
    expect(text).toContain("2. ")
    expect(text).not.toContain("3. ")
    expect(text.split("\n").filter((line) => line.startsWith("- ")).length).toBe(1)
  })

  it("never leaks a raw placeholder or a machine code", () => {
    const players = [player("euw:mid#euw", "Mid", "mid")]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: [entry({ championName: "Ahri", games: 40, winrate: 72 })],
      },
    }

    const text = buildScoutExportText(t, analyzeScout(players, playerData))
    expect(text).not.toMatch(/\{[a-z]+\}/i)
    expect(text).not.toContain("undefined")
    expect(text).not.toMatch(/high_winrate|signature_pick|one_trick/)
  })

  it("says so instead of inventing a recommendation for a player without data", () => {
    const players = [player("euw:mid#euw", "Mid", "mid"), player("euw:top#euw", "Top", "top")]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: [entry({ championName: "Ahri", games: 25, winrate: 64 })],
      },
    }

    const text = buildScoutExportText(t, analyzeScout(players, playerData))
    expect(text).toContain(de.scout_noAnalysis)
    expect(text).toContain(de.scout_warning_player_without_data)
  })

  /**
   * The export is text the user copies out and reads, so it follows the same
   * copy rule as the UI: no dash asides. Its separators live in
   * src/components/scout/scoutExport.ts, NOT in the i18n catalogues, so
   * tests/i18nScoutCopy.test.ts cannot see them -- and that blind spot is
   * exactly how the export ended up mixing " \u2014 " with " \u00b7 " for a
   * while. This asserts the finished text, which covers both the separators
   * written here and every i18n fragment that flows into it.
   */
  it("writes no em dash or en dash into the finished export", () => {
    const players = [player("euw:mid#euw", "Mid", "mid"), player("euw:bot#euw", "Bot", "bot")]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: [
          entry({ championName: "Ahri", games: 30, winrate: 68 }),
          entry({ championName: "Yone", games: 12, winrate: 40 }),
        ],
      },
      "euw:bot#euw": {
        playerId: "euw:bot#euw",
        entries: [entry({ championName: "Kaisa", games: 22, winrate: 64 })],
      },
    }
    const text = buildScoutExportText(t, analyzeScout(players, playerData))

    // Non-empty first: an export that silently became "" would pass any
    // "contains no dash" check without proving anything.
    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toMatch(/[\u2014\u2013]/)
  })

  /* ------------------------------------------------------------------------
   * The KDA in the export.
   *
   * It has weighted the ban score since 0.5.0 and appeared nowhere in the text,
   * so one champion could outrank another for a reason the exported plan never
   * stated. What these tests pin is WHERE the number goes, because the position
   * carries the meaning:
   *
   *  - inside the champion parenthesis it is a third fact about the champion,
   *    and therefore takes the `", "` of this file's separator rule;
   *  - in the ban head it is its own `" \u00b7 "` segment behind the target player,
   *    because `banCandidateKda()` reads it off exactly that player's signal;
   *  - never behind the `[confidence]` bracket, which closes the line as the
   *    verdict over everything in front of it.
   *
   * A "does the text contain KDA 3.2" check would be green for all three
   * layouts, so every one of them is asserted against the surrounding
   * characters instead.
   * ---------------------------------------------------------------------- */

  const KDA_ROSTER = [player("euw:mid#euw", "Mid", "mid")]

  function midData(entries: ManualChampionEntry[]): Record<ScoutPlayerId, ScoutPlayerData> {
    return { "euw:mid#euw": { playerId: "euw:mid#euw", entries } }
  }

  it("adds a stated KDA to the champion parenthesis, behind the winrate", () => {
    const text = buildScoutExportText(
      t,
      analyzeScout(
        KDA_ROSTER,
        midData([entry({ championName: "Ahri", games: 30, winrate: 68, kda: 2.6 })]),
      ),
    )

    // One parenthesis, one separator: `", "`, never the middot. The positive
    // assertion already fixes that (a middot join would not produce this exact
    // string), the negative one names the mutant it rules out.
    expect(text).toContain(`Ahri (30 ${de.common_games}, 68%, KDA 2.6)`)
    expect(text).not.toContain("68% \u00b7 KDA 2.6")
    // And not in front of the winrate either.
    expect(text).not.toContain("KDA 2.6, 68%")
  })

  it("carries the KDA into the weakness line too", () => {
    const text = buildScoutExportText(
      t,
      analyzeScout(
        KDA_ROSTER,
        midData([
          entry({ championName: "Ahri", games: 30, winrate: 68 }),
          entry({ championName: "Yone", games: 12, winrate: 40, kda: 1.2 }),
        ]),
      ),
    )

    expect(text).toContain(`${de.scout_weaknesses}: Yone (12 ${de.common_games}, 40%, KDA 1.2)`)
  })

  it("gives a ban its own KDA segment between the target player and the confidence", () => {
    const analysis = analyzeScout(
      KDA_ROSTER,
      midData([entry({ championName: "Karma", games: 40, winrate: 72, kda: 3.2 })]),
    )
    const text = buildScoutExportText(t, analysis)
    const banLine = text.split("\n").find((line) => line.startsWith("1. "))

    expect(banLine).toBeDefined()
    const line = banLine ?? ""
    const top = analysis.banPlan.prioritizedBans[0]

    // The whole head, spelled out \u2014 this is the assertion that fixes the order.
    expect(line).toBe(`1. Karma \u00b7 Mid#EUW \u00b7 KDA 3.2 \u00b7 [${de[scoutConfidenceKey(top.confidence)]}]`)
    // And the order again on its own, so a failure says *which* half moved.
    expect(line.indexOf("KDA 3.2")).toBeGreaterThan(line.indexOf("Mid#EUW"))
    expect(line.indexOf("KDA 3.2")).toBeLessThan(line.indexOf("["))
  })

  it("prints a stated 0 in the export as well", () => {
    const analysis = analyzeScout(
      KDA_ROSTER,
      midData([entry({ championName: "Ahri", games: 30, winrate: 68, kda: 0 })]),
    )
    const text = buildScoutExportText(t, analysis)

    expect(text).toContain(`Ahri (30 ${de.common_games}, 68%, KDA 0)`)
    expect(text).toContain("\u00b7 KDA 0 \u00b7 [")
    // Neither dropped as falsy nor dressed up as a decimal.
    expect(text).not.toContain("KDA 0.0")
  })

  it("says nothing about a champion whose rows stated no KDA", () => {
    const text = buildScoutExportText(
      t,
      analyzeScout(
        KDA_ROSTER,
        midData([
          entry({ championName: "Ahri", games: 30, winrate: 68, kda: 2.6 }),
          entry({ championName: "Zed", games: 25, winrate: 66 }),
        ]),
      ),
    )

    const threats = text.split("\n").filter((line) => line.startsWith("- "))
    const ahri = threats.find((line) => line.includes("Ahri")) ?? ""
    const zed = threats.find((line) => line.includes("Zed")) ?? ""
    const zedBan = text.split("\n").find((line) => /^\d+\. Zed\b/.test(line)) ?? ""

    expect(ahri).toContain("KDA 2.6")
    // The discriminating half: `kda ?? 0` would print "KDA 0" on both of these
    // and claim a number nobody ever entered.
    expect(zed.length).toBeGreaterThan(0)
    expect(zed).toContain(`Zed (25 ${de.common_games}, 66%)`)
    expect(zed).not.toContain("KDA")
    expect(zedBan.length).toBeGreaterThan(0)
    expect(zedBan).not.toContain("KDA")
  })

  it("leaves an export built from KDA-less data exactly as it was", () => {
    // The "old data" case, and by far the common one: every row saved before
    // 0.5.0 carries no KDA at all. The 0.5.1 text has to come back unchanged,
    // down to the closing bracket of the parenthesis.
    const players = [player("euw:mid#euw", "Mid", "mid"), player("euw:top#euw", "Top", "top")]
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      "euw:mid#euw": {
        playerId: "euw:mid#euw",
        entries: [
          entry({ championName: "Ahri", games: 30, winrate: 68 }),
          entry({ championName: "Yone", games: 12, winrate: 40 }),
        ],
      },
      "euw:top#euw": {
        playerId: "euw:top#euw",
        entries: [entry({ championName: "Sett", games: 18, winrate: 61, role: "top" })],
      },
    }
    const text = buildScoutExportText(t, analyzeScout(players, playerData))

    expect(text).toContain(`Ahri (30 ${de.common_games}, 68%)`)
    expect(text).toContain(`Sett (18 ${de.common_games}, 61%)`)
    expect(text).toContain(`${de.scout_weaknesses}: Yone (12 ${de.common_games}, 40%)`)
    // Not one mention, not even an empty stub.
    expect(text).not.toContain("KDA")
    expect(text).not.toContain("undefined")
    expect(text).not.toContain("null")
    expect(text).not.toContain("NaN")
  })

  it("writes no bare KDA stub and no machine value, in either language", () => {
    const tEn = (key: TranslationKey): string => en[key]
    const analysis = analyzeScout(
      KDA_ROSTER,
      midData([
        entry({ championName: "Karma", games: 40, winrate: 72, kda: 3.2 }),
        entry({ championName: "Ahri", games: 30, winrate: 68, kda: 0 }),
        entry({ championName: "Zed", games: 25, winrate: 66 }),
        entry({ championName: "Yone", games: 12, winrate: 40, kda: 1.2 }),
      ]),
    )

    for (const [lang, translate, games] of [
      ["de", t, de.common_games],
      ["en", tEn, en.common_games],
    ] as const) {
      const text = buildScoutExportText(translate, analysis)
      const banLine = text.split("\n").find((line) => line.startsWith("1. ")) ?? ""

      expect(text, lang).toContain(`Karma (40 ${games}, 72%, KDA 3.2)`)
      expect(text, lang).toContain(`Ahri (30 ${games}, 68%, KDA 0)`)
      expect(text, lang).toContain(`Zed (25 ${games}, 66%)`)
      expect(banLine, lang).toContain(" \u00b7 KDA 3.2 \u00b7 [")

      expect(text, lang).not.toContain("undefined")
      expect(text, lang).not.toContain("NaN")
      expect(text, lang).not.toMatch(/\{[a-z]+\}/i)
      // "KDA" with nothing behind it \u2014 the shape a `null` would leave once the
      // label was pushed into the line unconditionally.
      expect(text, lang).not.toMatch(/KDA\s*(?=[\u00b7,)\n]|$)/)
      // The separator rule of scoutExport.ts survives the extra segment.
      expect(text, lang).not.toMatch(/[\u2014\u2013]/)
      expect(text, lang).not.toContain("--")
    }
  })
})

/* ==========================================================================
 * 5. Lineup arithmetic
 *
 * The duplicate invariant of `ScoutLineup` is enforced where a lineup is
 * *written*. These tests are that enforcement's only automated proof — the
 * builder UI itself is not rendered anywhere in this suite.
 * ========================================================================== */

const TOP = player("euw:top#euw", "Top", "top")
const JGL = player("euw:jgl#euw", "Jgl", "jungle")
const MID = player("euw:mid2#euw", "Mid2", "mid")
const ADC = player("euw:adc#euw", "Adc", "bot")
const SUP = player("euw:sup#euw", "Sup", "support")
const NOBODY = player("euw:nobody#euw", "Nobody", "unknown")

const ROSTER: ScoutPlayer[] = [TOP, JGL, MID, ADC, SUP, NOBODY]

describe("isLineupEmpty", () => {
  it("is true for a fresh lineup and false after a single assignment", () => {
    const empty = createEmptyScoutLineup()
    expect(isLineupEmpty(empty)).toBe(true)

    const filled = assignPlayerToSlot(empty, { kind: "starter", slot: "mid" }, MID.id).lineup
    expect(isLineupEmpty(filled)).toBe(false)
  })

  it("counts a bench-only lineup as touched", () => {
    const bench = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "substitute", slot: "sub1" },
      MID.id,
    ).lineup
    expect(isLineupEmpty(bench)).toBe(false)
  })
})

describe("assignPlayerToSlot", () => {
  it("places a pool player and leaves the input lineup untouched", () => {
    const before = createEmptyScoutLineup()
    const { lineup, error } = assignPlayerToSlot(before, { kind: "starter", slot: "top" }, TOP.id)

    expect(error).toBeNull()
    expect(lineup.starters.top).toBe(TOP.id)
    expect(before.starters.top).toBeNull()
  })

  it("REFUSES a second seat for the same player instead of moving them", () => {
    const first = assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "mid" }, MID.id)
      .lineup
    const second = assignPlayerToSlot(first, { kind: "starter", slot: "top" }, MID.id)

    expect(second.error).toBe("already_assigned")
    expect(second.lineup).toBe(first)
    expect(second.lineup.starters.top).toBeNull()
    expect(second.lineup.starters.mid).toBe(MID.id)
  })

  it("refuses a bench seat for a player who already starts", () => {
    const starting = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "starter", slot: "mid" },
      MID.id,
    ).lineup
    const benched = assignPlayerToSlot(starting, { kind: "substitute", slot: "sub1" }, MID.id)

    expect(benched.error).toBe("already_assigned")
    expect(benched.lineup.substitutes.sub1).toBeNull()
  })

  it("treats re-assigning to the very same seat as a no-op, not an error", () => {
    const first = assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "mid" }, MID.id)
      .lineup
    const again = assignPlayerToSlot(first, { kind: "starter", slot: "mid" }, MID.id)

    expect(again.error).toBeNull()
    expect(again.lineup).toBe(first)
  })

  it("replaces the occupant of the targeted seat, who returns to the pool", () => {
    const first = assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "mid" }, MID.id)
      .lineup
    const swapped = assignPlayerToSlot(first, { kind: "starter", slot: "mid" }, NOBODY.id)

    expect(swapped.error).toBeNull()
    expect(swapped.lineup.starters.mid).toBe(NOBODY.id)
    expect(findLineupTarget(swapped.lineup, MID.id)).toBeNull()
  })

  it("never lets a player id occupy two of the eight seats", () => {
    let lineup: ScoutLineup = createEmptyScoutLineup()
    for (const slot of SCOUT_LINEUP_SLOTS) {
      lineup = assignPlayerToSlot(lineup, { kind: "starter", slot }, MID.id).lineup
    }
    for (const slot of SCOUT_SUBSTITUTE_SLOTS) {
      lineup = assignPlayerToSlot(lineup, { kind: "substitute", slot }, MID.id).lineup
    }

    const seats = [
      ...SCOUT_LINEUP_SLOTS.map((slot) => lineup.starters[slot]),
      ...SCOUT_SUBSTITUTE_SLOTS.map((slot) => lineup.substitutes[slot]),
    ].filter((id) => id === MID.id)
    expect(seats.length).toBe(1)
  })
})

describe("clearLineupSlot / removePlayerFromLineup", () => {
  it("empties a seat and returns its player to the pool", () => {
    const filled = assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "top" }, TOP.id)
      .lineup
    const cleared = clearLineupSlot(filled, { kind: "starter", slot: "top" })

    expect(cleared.starters.top).toBeNull()
    expect(buildScoutLineupSummary(cleared, ROSTER).unassignedPlayerIds).toContain(TOP.id)
  })

  it("finds a player wherever they sit and is a no-op for a pool player", () => {
    const benched = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "substitute", slot: "sub3" },
      SUP.id,
    ).lineup

    expect(removePlayerFromLineup(benched, SUP.id).substitutes.sub3).toBeNull()
    expect(removePlayerFromLineup(benched, NOBODY.id)).toBe(benched)
  })
})

describe("autofillLineupFromRoles", () => {
  it("fills free slots from the parsed roles, in canonical order", () => {
    const filled = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)

    expect(filled.starters.top).toBe(TOP.id)
    expect(filled.starters.jungle).toBe(JGL.id)
    expect(filled.starters.mid).toBe(MID.id)
    expect(filled.starters.bot).toBe(ADC.id)
    expect(filled.starters.support).toBe(SUP.id)
  })

  it("NEVER overwrites a slot the user already filled", () => {
    const manual = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "starter", slot: "mid" },
      NOBODY.id,
    ).lineup
    const filled = autofillLineupFromRoles(manual, ROSTER)

    expect(filled.starters.mid).toBe(NOBODY.id)
    // The mid-role player stays in the pool rather than being forced elsewhere.
    expect(findLineupTarget(filled, MID.id)).toBeNull()
  })

  it("leaves a player with an unknown role in the pool and never benches anyone", () => {
    const filled = autofillLineupFromRoles(createEmptyScoutLineup(), [NOBODY])
    expect(isLineupEmpty(filled)).toBe(true)

    const full = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)
    for (const slot of SCOUT_SUBSTITUTE_SLOTS) expect(full.substitutes[slot]).toBeNull()
  })

  it("is idempotent", () => {
    const once = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)
    const twice = autofillLineupFromRoles(once, ROSTER)
    expect(twice).toEqual(once)
  })

  it("gives a slot to the first matching player in input order", () => {
    const otherMid = player("euw:mid3#euw", "Mid3", "mid")
    const filled = autofillLineupFromRoles(createEmptyScoutLineup(), [MID, otherMid])
    expect(filled.starters.mid).toBe(MID.id)
    expect(findLineupTarget(filled, otherMid.id)).toBeNull()
  })
})

describe("pruneLineup", () => {
  it("drops every seat whose player no longer exists", () => {
    const filled = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)
    const pruned = pruneLineup(filled, new Set([TOP.id, JGL.id]))

    expect(pruned.starters.top).toBe(TOP.id)
    expect(pruned.starters.jungle).toBe(JGL.id)
    expect(pruned.starters.mid).toBeNull()
    expect(pruned.starters.bot).toBeNull()
    expect(pruned.starters.support).toBeNull()
  })

  it("clears bench seats too", () => {
    const benched = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "substitute", slot: "sub1" },
      SUP.id,
    ).lineup
    expect(pruneLineup(benched, new Set<ScoutPlayerId>()).substitutes.sub1).toBeNull()
  })
})

describe("buildScoutLineupSummary", () => {
  it("always returns five starter rows and three bench rows in canonical order", () => {
    const summary = buildScoutLineupSummary(createEmptyScoutLineup(), ROSTER)

    expect(summary.starters.map((row) => row.slot)).toEqual([...SCOUT_LINEUP_SLOTS])
    expect(summary.substitutes.map((row) => row.slot)).toEqual([...SCOUT_SUBSTITUTE_SLOTS])
    expect(summary.missingStarterSlots).toEqual([...SCOUT_LINEUP_SLOTS])
    expect(summary.isStartingFiveComplete).toBe(false)
    expect(summary.unassignedPlayerIds).toEqual(ROSTER.map((entry) => entry.id))
  })

  it("reports a complete starting five and the leftover pool", () => {
    const summary = buildScoutLineupSummary(
      autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER),
      ROSTER,
    )

    expect(summary.isStartingFiveComplete).toBe(true)
    expect(summary.missingStarterSlots).toEqual([])
    expect(summary.starterPlayerIds).toEqual([TOP.id, JGL.id, MID.id, ADC.id, SUP.id])
    expect(summary.unassignedPlayerIds).toEqual([NOBODY.id])
    expect(summary.byPlayerId[TOP.id].membership).toBe("starter")
    expect(summary.byPlayerId[TOP.id].starterSlot).toBe("top")
    expect(summary.byPlayerId[NOBODY.id].membership).toBe("unassigned")
  })

  it("keeps the first hit in canonical order when a stored lineup has duplicates", () => {
    // Only reachable from a hand-edited or legacy blob — readers must resolve
    // it deterministically instead of trusting key order.
    const broken: ScoutLineup = {
      starters: { top: MID.id, jungle: null, mid: MID.id, bot: null, support: null },
      substitutes: { sub1: MID.id, sub2: null, sub3: null },
    }
    const summary = buildScoutLineupSummary(broken, ROSTER)

    expect(summary.starterPlayerIds).toEqual([MID.id])
    expect(summary.byPlayerId[MID.id].starterSlot).toBe("top")
    expect(summary.substitutePlayerIds).toEqual([])
  })

  it("reports an id without a player as dangling and its seat as empty", () => {
    const stale: ScoutLineup = {
      ...createEmptyScoutLineup(),
      starters: { top: "euw:ghost#euw", jungle: null, mid: null, bot: null, support: null },
    }
    const summary = buildScoutLineupSummary(stale, ROSTER)

    expect(summary.danglingPlayerIds).toEqual(["euw:ghost#euw"])
    expect(summary.starters[0].playerId).toBeNull()
    expect(summary.missingStarterSlots).toContain("top")
  })

  it("agrees with the analysis engine's own derivation", () => {
    const lineup = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)
    const analysis = analyzeScout(ROSTER, {}, { lineup })

    expect(analysis.lineup).toEqual(buildScoutLineupSummary(lineup, ROSTER))
  })
})

describe("defaultRoleForPlayer", () => {
  it("prefers the declared starting slot over the parsed role", () => {
    const lineup = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "starter", slot: "support" },
      NOBODY.id,
    ).lineup
    expect(defaultRoleForPlayer(lineup, NOBODY)).toBe("support")
  })

  it("falls back to the parsed role for bench and pool players", () => {
    const bench = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "substitute", slot: "sub1" },
      MID.id,
    ).lineup
    expect(defaultRoleForPlayer(bench, MID)).toBe("mid")
    expect(defaultRoleForPlayer(createEmptyScoutLineup(), NOBODY)).toBe("unknown")
  })
})

/**
 * The value TournamentScout hands to `ScoutPlayerCard.lineupRole`, checked
 * against what `roleMismatchHint()` does with it.
 *
 * There is no jsdom here, so the components themselves are not rendered — but
 * the wiring is exactly `lineupStarterSlot(lineup, player.id) ?? undefined`
 * feeding `roleMismatchHint()`, and both halves are pure. The failure mode this
 * guards against is silent in every other way: `lineupRole` is optional, so
 * leaving it unset compiles, renders and produces no hint for anybody — the
 * defect merely changes from "wrong statement" to "no statement".
 */
describe("lineupRole handed to the row hint", () => {
  const starterLineup = assignPlayerToSlot(
    createEmptyScoutLineup(),
    { kind: "starter", slot: "mid" },
    MID.id,
  ).lineup

  it("gives a starter with an off-role row the hint back", () => {
    const lineupRole = lineupStarterSlot(starterLineup, MID.id) ?? undefined
    expect(lineupRole).toBe("mid")

    const hint = roleMismatchHint(t, "top", lineupRole)
    expect(hint).not.toBeNull()
    expect(hint).toContain(de.scout_role_top)
    expect(hint).toContain(de.scout_role_mid)
  })

  it("says nothing for a starter whose row matches their slot", () => {
    const lineupRole = lineupStarterSlot(starterLineup, MID.id) ?? undefined
    expect(roleMismatchHint(t, "mid", lineupRole)).toBeNull()
  })

  it("stays silent for a bench or pool player, whatever the parser guessed", () => {
    const bench = assignPlayerToSlot(
      createEmptyScoutLineup(),
      { kind: "substitute", slot: "sub1" },
      ADC.id,
    ).lineup

    // ADC.role is "bot", but a bench seat is not a declared starting slot —
    // passing `player.role` here is exactly what the contract forbids.
    expect(lineupStarterSlot(bench, ADC.id) ?? undefined).toBeUndefined()
    expect(roleMismatchHint(t, "top", lineupStarterSlot(bench, ADC.id) ?? undefined)).toBeNull()
    expect(lineupStarterSlot(createEmptyScoutLineup(), MID.id) ?? undefined).toBeUndefined()
  })
})

/* ==========================================================================
 * 6. Role-aware ban labels
 * ========================================================================== */

function candidate(overrides: Partial<BanCandidate>): BanCandidate {
  return {
    championName: "Karma",
    priority: 0.7,
    confidence: "high",
    reasons: [],
    affectedPlayerIds: [],
    roles: [],
    signals: [],
    isOverlap: false,
    isFlex: false,
    targetPlayerId: null,
    targetRole: null,
    lineupRoles: [],
    roleFit: "unknown",
    substituteOnly: false,
    ...overrides,
  }
}

describe("orderLineupRoles / formatLineupRoles", () => {
  it("returns canonical order and drops duplicates", () => {
    expect(orderLineupRoles(["support", "top", "support"])).toEqual(["top", "support"])
  })

  it("translates every role and never leaks a code", () => {
    const text = formatLineupRoles(t, ["support", "mid"])
    expect(text).toBe(`${de.scout_role_mid}, ${de.scout_role_support}`)
    expect(text).not.toContain("mid")
  })
})

describe("banRoleLabels", () => {
  it('reads as "Karma gegen Mid" — a suffix, not a sentence', () => {
    const labels = banRoleLabels(t, candidate({ targetRole: "mid", lineupRoles: ["mid"] }))
    expect(labels).toEqual([`gegen ${de.scout_role_mid}`])
    expect(`Karma ${labels[0]}`).toBe("Karma gegen Mid")
  })

  it("adds the hit lanes when a ban denies more than the target lane", () => {
    const labels = banRoleLabels(
      t,
      candidate({ targetRole: "mid", lineupRoles: ["support", "mid"] }),
    )
    expect(labels[0]).toBe(`gegen ${de.scout_role_mid}`)
    expect(labels[1]).toBe(`trifft ${de.scout_role_mid}, ${de.scout_role_support}`)
  })

  it("names a single lane once, never twice", () => {
    const labels = banRoleLabels(t, candidate({ targetRole: null, lineupRoles: ["top"] }))
    expect(labels).toEqual([`trifft ${de.scout_role_top}`])
  })

  it("says nothing at all without a lineup", () => {
    expect(banRoleLabels(t, candidate({}))).toEqual([])
  })
})

/**
 * Which KDA a ban row shows.
 *
 * `BanCandidate` carries one signal per affected player, and the engine has
 * already named the one the recommendation is aimed at (`targetPlayerId`: the
 * strongest ON-role signal, and only failing that the strongest signal at all).
 * `banCandidateKda()` reads the number off exactly that signal, which is what
 * keeps the figure under the headline attached to the player in the headline.
 *
 * The overlap case below is the one that discriminates: it is built so the
 * target is deliberately NOT the first-listed and NOT the highest-scoring
 * signal, because an off-role signal is only weighted down by 0.4 and can still
 * outscore a genuine on-role one. `signals[0].kda` and "the biggest score wins"
 * both look correct on a single-player candidate and both quote the wrong
 * player here.
 *
 * That target rule is only HALF the contract, and the other half is the one
 * that broke: the very same candidate is rendered again under the heading of
 * every player it affects, because `targetBansByPlayer` filters on
 * `affectedPlayerIds` and not on the target. A row under player B that read its
 * KDA off `targetPlayerId` printed a number B never posted, and without a
 * lineup there is not even a lane suffix to hint at it. `forPlayerId` is what
 * the per-player lists pass; the team-wide plan and the export keep the target
 * semantics and omit it. Both halves are pinned below, against one shared
 * overlap fixture so "whose number is it" is always asked of the same numbers.
 */
describe("banCandidateKda", () => {
  function signal(overrides: Partial<ChampionSignal>): ChampionSignal {
    return {
      championName: "Karma",
      playerId: MID.id,
      role: "mid",
      games: 20,
      winrate: 60,
      kda: null,
      recency: "current",
      score: 0.5,
      confidence: "medium",
      reasons: [],
      sources: ["opgg"],
      roleFit: "unknown",
      lineupRole: null,
      fromSubstitute: false,
      ...overrides,
    }
  }

  /**
   * Two players on one champion, with the numbers arranged so that every wrong
   * answer is a different number: TOP's off-role signal is listed FIRST and
   * scores HIGHER (6.4), and the engine still aimed the ban at MID (2.1).
   * `signals[0]`, "the strongest one" and "the target" therefore all disagree.
   */
  function overlapCandidate(): BanCandidate {
    return candidate({
      isOverlap: true,
      affectedPlayerIds: [TOP.id, MID.id],
      // The engine picked the on-role player, even though the off-role signal
      // in front of them scores higher.
      targetPlayerId: MID.id,
      targetRole: "mid",
      lineupRoles: ["mid"],
      roleFit: "flex",
      signals: [
        signal({ playerId: TOP.id, role: "mid", roleFit: "offrole", score: 0.91, kda: 6.4 }),
        signal({
          playerId: MID.id,
          role: "mid",
          roleFit: "onrole",
          score: 0.62,
          kda: 2.1,
          lineupRole: "mid",
        }),
      ],
    })
  }

  it("reads the KDA off the signal the ban is aimed at", () => {
    const aimed = candidate({
      targetPlayerId: MID.id,
      affectedPlayerIds: [MID.id],
      signals: [signal({ playerId: MID.id, kda: 3.2 })],
    })

    expect(banCandidateKda(aimed)).toBe(3.2)
    expect(scoutKdaLabel(t, banCandidateKda(aimed))).toBe("KDA 3.2")
  })

  it("keeps a stated 0 apart from 'no KDA stated'", () => {
    const zero = candidate({
      targetPlayerId: MID.id,
      affectedPlayerIds: [MID.id],
      signals: [signal({ playerId: MID.id, kda: 0 })],
    })

    expect(banCandidateKda(zero)).toBe(0)
    expect(banCandidateKda(zero)).not.toBeNull()
    // And the row really renders it, rather than falling into the "omit" branch.
    expect(scoutKdaLabel(t, banCandidateKda(zero))).toBe("KDA 0")
  })

  it("returns null for every shape that states nothing", () => {
    // No target and no signals at all.
    expect(banCandidateKda(candidate({}))).toBeNull()

    // Signals, but the engine named no target — nothing may be quoted then.
    const untargeted = candidate({
      targetPlayerId: null,
      signals: [signal({ playerId: MID.id, kda: 3.2 })],
    })
    expect(banCandidateKda(untargeted)).toBeNull()

    // A target whose signal is not in the list (a hand-edited or stale blob).
    const mismatched = candidate({
      targetPlayerId: MID.id,
      signals: [signal({ playerId: TOP.id, kda: 4.4 })],
    })
    expect(banCandidateKda(mismatched)).toBeNull()

    // The matching signal simply never stated one.
    const silent = candidate({
      targetPlayerId: MID.id,
      signals: [signal({ playerId: MID.id, kda: null })],
    })
    expect(banCandidateKda(silent)).toBeNull()

    // Which is the instruction to the ban row to print no KDA segment at all.
    for (const c of [candidate({}), untargeted, mismatched, silent]) {
      expect(scoutKdaLabel(t, banCandidateKda(c))).toBeNull()
    }
  })

  it("follows targetPlayerId on an overlap, not the first or the strongest signal", () => {
    const overlap = overlapCandidate()

    expect(banCandidateKda(overlap)).toBe(2.1)
    // Spelled out: quoting 6.4 would put a number under the headline that the
    // named player never posted.
    expect(banCandidateKda(overlap)).not.toBe(6.4)
    expect(scoutKdaLabel(t, banCandidateKda(overlap))).toBe("KDA 2.1")
  })

  /* ------------------------------------------------------------------------
   * `forPlayerId` — whose KDA the row is actually about.
   * ---------------------------------------------------------------------- */

  it("answers for the player it was ASKED about, not the one the ban is aimed at", () => {
    const overlap = overlapCandidate()

    // The row as it appears under TOP's heading. TOP is not the target, and
    // their signal is precisely the one the engine passed over.
    expect(banCandidateKda(overlap, TOP.id)).toBe(6.4)
    expect(scoutKdaLabel(t, banCandidateKda(overlap, TOP.id))).toBe("KDA 6.4")
    // The defect this pins: both headings used to print 2.1, so TOP's row
    // stated a number TOP never posted.
    expect(banCandidateKda(overlap, TOP.id)).not.toBe(2.1)
    // ...and asking about the target still yields the target's own number, so
    // the fix is an extra answer rather than a different one.
    expect(banCandidateKda(overlap, MID.id)).toBe(2.1)
  })

  it("returns a stated 0 for the asked player instead of falling through", () => {
    const zeroed = candidate({
      isOverlap: true,
      affectedPlayerIds: [TOP.id, MID.id],
      targetPlayerId: MID.id,
      signals: [signal({ playerId: TOP.id, kda: 0 }), signal({ playerId: MID.id, kda: 2.1 })],
    })

    // The discriminating case, as everywhere the KDA is touched: `0` is a real
    // and genuinely bad value, not "nothing stated". A falsy check anywhere on
    // this path would hand back the target's 2.1 or a bare `null`, and TOP's
    // row would look better than TOP played.
    expect(banCandidateKda(zeroed, TOP.id)).toBe(0)
    expect(banCandidateKda(zeroed, TOP.id)).not.toBeNull()
    expect(banCandidateKda(zeroed, TOP.id)).not.toBe(2.1)
    expect(scoutKdaLabel(t, banCandidateKda(zeroed, TOP.id))).toBe("KDA 0")
  })

  it("stays silent for a player with no signal, rather than quoting somebody else", () => {
    const overlap = overlapCandidate()

    // SUP is on neither signal of this candidate. A wrong id must degrade to
    // silence; degrading to the target would be the original bug wearing a
    // different hat, because it is exactly the number that does not belong to
    // the heading the row sits under.
    expect(banCandidateKda(overlap, SUP.id)).toBeNull()
    expect(banCandidateKda(overlap, SUP.id)).not.toBe(2.1)
    expect(banCandidateKda(overlap, SUP.id)).not.toBe(6.4)
    // `toBeNull()` already refuses an `undefined`; naming it separately says
    // which of the two a failure means. The caller cannot tell them apart --
    // `scoutKdaLabel()` omits the segment for both -- so the contract has to be
    // pinned here or not at all.
    expect(banCandidateKda(overlap, SUP.id)).not.toBeUndefined()
    expect(scoutKdaLabel(t, banCandidateKda(overlap, SUP.id))).toBeNull()
  })

  it("returns null when the asked player's own signal states no KDA", () => {
    const partial = candidate({
      isOverlap: true,
      affectedPlayerIds: [TOP.id, MID.id],
      targetPlayerId: MID.id,
      signals: [signal({ playerId: TOP.id, kda: null }), signal({ playerId: MID.id, kda: 2.1 })],
    })

    expect(banCandidateKda(partial, TOP.id)).toBeNull()
    // Not the target's number: a fallback placed AFTER the lookup instead of
    // before it would substitute 2.1 here, which reads as data and is not.
    expect(banCandidateKda(partial, TOP.id)).not.toBe(2.1)
    expect(scoutKdaLabel(t, banCandidateKda(partial, TOP.id))).toBeNull()
    // The other heading is untouched and still states its own.
    expect(banCandidateKda(partial, MID.id)).toBe(2.1)
  })

  it("falls back to the target when no player is named, in both spellings", () => {
    const overlap = overlapCandidate()

    // How the team-wide plan and the export call it.
    expect(banCandidateKda(overlap)).toBe(2.1)
    // And the spelling an optional prop produces once it is threaded through a
    // component that has nothing to pass. TypeScript allows both, so both are
    // pinned rather than assumed equivalent.
    expect(banCandidateKda(overlap, undefined)).toBe(2.1)

    // `??`, never `||`. An empty id is a value, not an absence, and it names
    // nobody -- so it has to be looked up and come back empty-handed. Under
    // `||` it would quietly become the target and print 2.1 for a player who
    // does not exist.
    expect(banCandidateKda(overlap, "")).toBeNull()
  })

  it("has no answer without a target, and the right one as soon as a player is named", () => {
    const untargeted = candidate({
      affectedPlayerIds: [TOP.id, MID.id],
      targetPlayerId: null,
      signals: [signal({ playerId: TOP.id, kda: 6.4 }), signal({ playerId: MID.id, kda: 2.1 })],
    })

    // The team-wide row: the engine named nobody, so nothing may be quoted --
    // even though two perfectly good numbers are sitting right there.
    expect(banCandidateKda(untargeted)).toBeNull()
    // The per-player rows each state their own regardless. Together with the
    // line above this is what fixes the ORDER of the two steps: the argument is
    // consulted first and the `null` check runs on the result, not the reverse.
    expect(banCandidateKda(untargeted, TOP.id)).toBe(6.4)
    expect(banCandidateKda(untargeted, MID.id)).toBe(2.1)
  })

  /**
   * Every fixture above hands the helper a candidate this file built, which
   * makes the one invariant it leans on true by construction: that the target
   * player's signal is really among `candidate.signals`. Nothing here would
   * notice if `analyzeScout()` stopped shipping it -- the ban plan would simply
   * lose its KDA, in silence, in both languages.
   *
   * So the last one runs against a candidate the ENGINE built, with the setup
   * of section 23 in tests/scoutAnalysis.test.ts: the starting jungler carries
   * strong Karma numbers in the WRONG lane, the benched support weak ones in
   * the right lane. The engine lists the jungler first because he scores
   * higher, and still aims the ban at the support because that signal is
   * onrole. `signals[0]`, "the strongest" and "the target" therefore point at
   * three different things again, this time without anybody arranging it.
   */
  it("quotes the right KDA on an overlap the engine really built", () => {
    const analysis = analyzeScout(
      [JGL, SUP],
      {
        [JGL.id]: {
          playerId: JGL.id,
          entries: [entry({ championName: "Karma", games: 40, winrate: 80, role: "support", kda: 6.4 })],
        },
        [SUP.id]: {
          playerId: SUP.id,
          entries: [entry({ championName: "Karma", games: 6, winrate: 45, role: "support", kda: 2.1 })],
        },
      },
      {
        lineup: assignPlayerToSlot(
          assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "jungle" }, JGL.id)
            .lineup,
          { kind: "substitute", slot: "sub1" },
          SUP.id,
        ).lineup,
        includeSubstitutes: true,
      },
    )

    const karma = analysis.banPlan.prioritizedBans.find((ban) => ban.championName === "Karma")
    expect(karma).toBeDefined()
    const ban = karma as BanCandidate

    // The setup, restated from the engine's own output, so a failure below says
    // whether the helper broke or the engine's target rule moved.
    expect(ban.isOverlap).toBe(true)
    expect(ban.signals[0].playerId).toBe(JGL.id)
    expect(ban.targetPlayerId).toBe(SUP.id)

    // The team-wide plan and the export: the target's number, not the first
    // and higher-scoring one sitting in front of it.
    expect(banCandidateKda(ban)).toBe(2.1)
    expect(banCandidateKda(ban)).not.toBe(6.4)

    // The per-player lists, end to end on real engine output: under the
    // jungler's heading the row states what the JUNGLER posted.
    expect(banCandidateKda(ban, JGL.id)).toBe(6.4)
    expect(banCandidateKda(ban, SUP.id)).toBe(2.1)
    expect(scoutKdaLabel(t, banCandidateKda(ban, JGL.id))).toBe("KDA 6.4")
  })
})

/**
 * The OTHER number in the same ban row head.
 *
 * The priority used to render bare, and that was defensible while it was the
 * only figure on the line: one number, nothing to confuse it with. Since the
 * KDA moved in beside it the run reads `Priorität 67% · KDA 3.2`, and a bare
 * percentage sitting next to a labelled one invites being read as more of the
 * same kind — a winrate above all, which is the one number in this tab a
 * percentage plausibly could be. So the priority names itself now too.
 *
 * WHAT THAT MAKES THIS BLOCK ABOUT: the label as much as the number. A test
 * asking whether the row contains "67%" stays green on precisely the
 * regression that would undo this change, so every case below pins the whole
 * string, and one of them says separately that the output is not a bare
 * percentage.
 *
 * Unlike {@link scoutKdaLabel} there is NO `null` case here, and the
 * difference is not an oversight on either side. A KDA is a value a source may
 * simply never have stated; a priority is computed for every candidate the
 * engine emits, so "nothing to state" cannot arise. That makes `0` a real
 * value — the lowest possible ranking — rather than an absence, which is the
 * same falsy trap the KDA keeps setting, in its third form.
 */
describe("scoutBanPriorityLabel", () => {
  const tEn = (key: TranslationKey): string => en[key]

  it("states a labelled whole percent, in both languages", () => {
    const ban = candidate({ priority: 0.67 })

    expect(scoutBanPriorityLabel(t, ban)).toBe("Priorität 67%")
    expect(scoutBanPriorityLabel(tEn, ban)).toBe("Priority 67%")
  })

  it("rounds to a whole percent instead of printing a decimal", () => {
    // Two values that both land on 67, approached from opposite sides. The
    // pair is what pins `Math.round` specifically: `Math.floor` turns the first
    // into 66, `Math.ceil` the second into 68, and dropping the rounding
    // altogether prints "66.6" and "67.4" — `fillPlaceholders()` formats
    // numbers through `formatScoutNumber()`, which keeps one decimal.
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0.666 }))).toBe("Priorität 67%")
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0.674 }))).toBe("Priorität 67%")
    expect(scoutBanPriorityLabel(tEn, candidate({ priority: 0.666 }))).toBe("Priority 67%")
    // A ranking is not a measurement; one decimal would claim a precision the
    // score does not have.
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0.666 }))).not.toContain("66.6")
  })

  it("prints a priority of 0 rather than blanking it", () => {
    // The discriminating case. A falsy guard that skipped the parameter would
    // leave `fillPlaceholders()` to strip the placeholder and `tidyText()` to
    // pull the percent sign back against the word, so the row would read
    // "Priorität%" — and there is no `null` branch to fall into either, because
    // this helper does not have one.
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0 }))).toBe("Priorität 0%")
    expect(scoutBanPriorityLabel(tEn, candidate({ priority: 0 }))).toBe("Priority 0%")
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0 }))).not.toBe("")
    expect(scoutBanPriorityLabel(t, candidate({ priority: 0 }))).not.toBe("Priorität%")
  })

  it("prints a full priority as 100%", () => {
    expect(scoutBanPriorityLabel(t, candidate({ priority: 1 }))).toBe("Priorität 100%")
    expect(scoutBanPriorityLabel(tEn, candidate({ priority: 1 }))).toBe("Priority 100%")
    // The fraction-instead-of-percent mutant: handing `candidate.priority`
    // straight to the template renders "1%" here and "0.7%" for the 0.67 case
    // above, both of which look like perfectly ordinary numbers on screen.
    expect(scoutBanPriorityLabel(t, candidate({ priority: 1 }))).not.toBe("Priorität 1%")
  })

  it("labels the number instead of printing a bare percentage", () => {
    // The whole point of the change, asserted on its own so a failure says the
    // label went missing rather than that some number moved.
    for (const [lang, translate, word] of [
      ["de", t, "Priorität"],
      ["en", tEn, "Priority"],
    ] as const) {
      const label = scoutBanPriorityLabel(translate, candidate({ priority: 0.67 }))

      expect(label, lang).not.toBe("67%")
      expect(label, lang).not.toMatch(/^\s*\d+\s*%\s*$/)
      // And the word leads the figure, rather than trailing it or being lost to
      // a template that kept only the placeholder.
      expect(label, lang).toContain(word)
      expect(label.indexOf(word), lang).toBe(0)
      expect(label.indexOf(word), lang).toBeLessThan(label.indexOf("67"))
    }
  })

  it("never lets a machine value or a raw placeholder reach the label", () => {
    for (const translate of [t, tEn]) {
      for (const priority of [0, 0.004, 0.5, 0.666, 0.674, 0.999, 1]) {
        const label = scoutBanPriorityLabel(translate, candidate({ priority }))

        // Word, then whole number, then the percent sign — the shape rules out
        // a bare "67%" and a stray decimal in one expression.
        expect(label, String(priority)).toMatch(/^\D+\d+%$/)
        expect(label, String(priority)).not.toContain("undefined")
        expect(label, String(priority)).not.toContain("null")
        expect(label, String(priority)).not.toContain("NaN")
        expect(label, String(priority)).not.toMatch(/\{[a-z]+\}/i)
      }
    }
  })

  it("really is translated, so a German string left in the English catalogue goes red", () => {
    // Spelled out rather than derived from the catalogue: comparing the helper
    // against the very key it renders would be true by construction and would
    // catch nothing at all.
    expect(de.scout_banPriorityValue).toBe("Priorität {priority}%")
    expect(en.scout_banPriorityValue).toBe("Priority {priority}%")
    expect(en.scout_banPriorityValue).not.toBe(de.scout_banPriorityValue)

    const ban = candidate({ priority: 0.42 })
    expect(scoutBanPriorityLabel(tEn, ban)).not.toBe(scoutBanPriorityLabel(t, ban))
    expect(scoutBanPriorityLabel(tEn, ban)).not.toContain("Priorität")
    expect(scoutBanPriorityLabel(t, ban)).not.toContain("Priority")
  })
})

describe("scoutRoleLabel", () => {
  it("prints a declared starting slot plain", () => {
    const label = scoutRoleLabel(t, "mid", "top")

    expect(label.text).toBe(de.scout_role_mid)
    expect(label.isGuess).toBe(false)
    // The slot wins over the parsed role, and nothing hints at a guess.
    expect(label.text).not.toContain("vermutet")
  })

  it("marks a role that is only the parser's guess", () => {
    const label = scoutRoleLabel(t, null, "mid")

    expect(label.isGuess).toBe(true)
    expect(label.text).toContain(de.scout_role_mid)
    expect(label.text).not.toBe(de.scout_role_mid)
    expect(label.text).toBe(fillPlaceholders(de.scout_roleGuessed, { role: de.scout_role_mid }))
  })

  it("does not claim a guess that was never made", () => {
    // `unknown` is the absence of a guess — "Unbekannt (vermutet)" would invent one.
    const label = scoutRoleLabel(t, null, "unknown")

    expect(label.text).toBe(de.scout_role_unknown)
    expect(label.isGuess).toBe(false)
  })

  it("never leaks a machine code or a raw placeholder, in either language", () => {
    const tEn = (key: TranslationKey): string => en[key]
    for (const role of SCOUT_ROLE_VALUES) {
      for (const translate of [t, tEn]) {
        for (const slot of [null, "top"] as const) {
          const label = scoutRoleLabel(translate, slot, role)
          expect(label.text).not.toMatch(/\{[a-z]+\}/i)
          expect(label.text.length).toBeGreaterThan(0)
        }
      }
      // The raw code only ever reaches the screen through the i18n texts.
      expect(scoutRoleLabel(t, null, role).text).not.toMatch(/\bjungle\b/)
    }
  })
})

/* ==========================================================================
 * 7. Re-parse protection
 * ========================================================================== */

describe("hasScoutData / findDroppedPlayersWithData", () => {
  const withRows: ScoutPlayerData = { playerId: MID.id, entries: [entry({})] }
  const noteOnly: ScoutPlayerData = { playerId: TOP.id, entries: [], note: "spielt Ranked" }
  const blank: ScoutPlayerData = { playerId: SUP.id, entries: [], note: "   " }

  it("counts rows and a non-blank note as data", () => {
    expect(hasScoutData(withRows)).toBe(true)
    expect(hasScoutData(noteOnly)).toBe(true)
    expect(hasScoutData(blank)).toBe(false)
    expect(hasScoutData(undefined)).toBe(false)
  })

  it("reports only dropped players that actually carry work", () => {
    const data: Record<ScoutPlayerId, ScoutPlayerData> = {
      [MID.id]: withRows,
      [TOP.id]: noteOnly,
      [SUP.id]: blank,
    }
    const dropped = findDroppedPlayersWithData([MID, TOP, SUP, JGL], data, [JGL])

    expect(dropped.map((entry) => entry.id)).toEqual([MID.id, TOP.id])
  })

  it("stays silent for an ordinary roster change without data", () => {
    expect(findDroppedPlayersWithData([MID, TOP], {}, [TOP])).toEqual([])
  })

  it("catches the corrected-typo case, where the id itself changes", () => {
    // Same human, one letter fixed: region + name + tagline build the id, so
    // the old player is dropped and their rows would be orphaned.
    const typo = player("euw:mdi#euw", "Mdi", "mid")
    const fixed = player("euw:mid#euw", "Mid", "mid")
    const data: Record<ScoutPlayerId, ScoutPlayerData> = {
      [typo.id]: { playerId: typo.id, entries: [entry({})] },
    }

    expect(findDroppedPlayersWithData([typo], data, [fixed]).map((p) => p.id)).toEqual([typo.id])
  })
})

describe("archiveRemovedPlayers / sortRemovedPlayers", () => {
  const data: Record<ScoutPlayerId, ScoutPlayerData> = {
    [MID.id]: { playerId: MID.id, entries: [entry({})], note: "hi" },
  }
  const NOTHING_LIVE = new Set<ScoutPlayerId>()

  it("keeps the player and their rows, stamped with the given time", () => {
    const archive = archiveRemovedPlayers({}, [MID], data, "2026-01-01T00:00:00.000Z", NOTHING_LIVE)

    expect(Object.keys(archive)).toEqual([MID.id])
    expect(archive[MID.id].player).toEqual(MID)
    expect(archive[MID.id].data.entries.length).toBe(1)
    expect(archive[MID.id].removedAtIso).toBe("2026-01-01T00:00:00.000Z")
  })

  it("archives a player with no data container as an empty record", () => {
    const archive = archiveRemovedPlayers({}, [TOP], {}, "2026-01-01T00:00:00.000Z", NOTHING_LIVE)
    expect(archive[TOP.id].data.entries).toEqual([])
  })

  it("replaces an existing entry instead of duplicating the id", () => {
    const first = archiveRemovedPlayers({}, [MID], data, "2026-01-01T00:00:00.000Z", NOTHING_LIVE)
    const second = archiveRemovedPlayers(
      first,
      [MID],
      data,
      "2026-02-01T00:00:00.000Z",
      NOTHING_LIVE,
    )

    expect(Object.keys(second)).toEqual([MID.id])
    expect(second[MID.id].removedAtIso).toBe("2026-02-01T00:00:00.000Z")
  })

  it("caps at SCOUT_REMOVED_PLAYERS_MAX and drops the oldest first", () => {
    const many: ScoutPlayer[] = []
    let archive: Record<ScoutPlayerId, ScoutRemovedPlayer> = {}
    for (let i = 0; i < SCOUT_REMOVED_PLAYERS_MAX + 5; i += 1) {
      const p = player(`euw:p${i}#euw`, `P${i}`, "mid")
      many.push(p)
      // Strictly ascending stamps: p0 is the oldest.
      const stamp = `2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z`
      archive = archiveRemovedPlayers(archive, [p], {}, stamp, NOTHING_LIVE)
    }

    expect(Object.keys(archive).length).toBe(SCOUT_REMOVED_PLAYERS_MAX)
    expect(archive[many[0].id]).toBeUndefined()
    expect(archive[many[many.length - 1].id]).toBeDefined()
  })

  it("lists the archive newest first", () => {
    let archive = archiveRemovedPlayers({}, [MID], data, "2026-01-01T00:00:00.000Z", NOTHING_LIVE)
    archive = archiveRemovedPlayers(archive, [TOP], {}, "2026-03-01T00:00:00.000Z", NOTHING_LIVE)

    expect(sortRemovedPlayers(archive).map((removed) => removed.player.id)).toEqual([
      TOP.id,
      MID.id,
    ])
  })

  it("returns an empty list for an empty archive", () => {
    expect(sortRemovedPlayers({})).toEqual([])
  })

  /* ------------------------------------------------------------------------
   * The rule the UI copy of the archive used to be missing: an id that carries
   * live playerData is not archived. src/scout/storage.ts enforces it on every
   * save, so without it the panel kept a "restore" button for something the
   * next write had already deleted.
   * ---------------------------------------------------------------------- */

  it("drops an archive entry whose id carries live scout data again", () => {
    const before = archiveRemovedPlayers({}, [MID], data, "2026-01-01T00:00:00.000Z", NOTHING_LIVE)
    expect(Object.keys(before)).toEqual([MID.id])

    // Same human is back in the roster and has rows again.
    const after = archiveRemovedPlayers(
      before,
      [TOP],
      {},
      "2026-02-01T00:00:00.000Z",
      new Set([MID.id]),
    )

    expect(Object.keys(after)).toEqual([TOP.id])
  })

  it("does not archive a player whose id is live either", () => {
    const archive = archiveRemovedPlayers(
      {},
      [MID],
      data,
      "2026-01-01T00:00:00.000Z",
      new Set([MID.id]),
    )

    expect(archive).toEqual({})
  })
})

describe("liveScoutPlayerDataIds", () => {
  it("reports only ids that are in the roster AND carry a data container", () => {
    const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      [MID.id]: { playerId: MID.id, entries: [entry({})] },
      // Orphan: no ScoutPlayer, so saveScoutState() will not keep it.
      "euw:ghost#euw": { playerId: "euw:ghost#euw", entries: [entry({})] },
    }

    const live = liveScoutPlayerDataIds([MID, TOP], playerData)

    expect([...live]).toEqual([MID.id])
  })

  it("counts an empty container as live, exactly as the storage layer does", () => {
    // normalizePlayerDataMap() keeps `{entries: []}`; the archive rule keys off
    // the *presence* of the container, not off whether work is in it.
    const live = liveScoutPlayerDataIds([MID], { [MID.id]: { playerId: MID.id, entries: [] } })
    expect(live.has(MID.id)).toBe(true)
  })
})

/**
 * Cross-check: the UI archive and the persisted archive must agree.
 *
 * `archiveRemovedPlayers()` re-implements the rules of `normalizeRemovedPlayers()`
 * in src/scout/storage.ts, because the UI has to apply them to live React state
 * before anything is written. Two implementations of one rule set drift apart
 * silently — the "id is live in playerData" rule was missing here for exactly
 * that reason — so this feeds the same input to both and compares the answers.
 */
describe("archiveRemovedPlayers agrees with normalizeRemovedPlayers", () => {
  const rows: ScoutPlayerData = { playerId: MID.id, entries: [entry({})], note: "hi" }

  function persisted(
    players: readonly ScoutPlayer[],
    playerData: Record<ScoutPlayerId, ScoutPlayerData>,
    removedPlayers: Record<ScoutPlayerId, ScoutRemovedPlayer>,
  ): string[] {
    const state = normalizeScoutState({
      schemaVersion: SCOUT_SCHEMA_VERSION,
      players,
      playerData,
      removedPlayers,
    })
    return Object.keys(state.removedPlayers).sort()
  }

  it("keeps the same ids for a plain re-parse archive", () => {
    // MID fell out of the roster, TOP stayed and has rows.
    const nextPlayers = [TOP]
    const playerDataBefore: Record<ScoutPlayerId, ScoutPlayerData> = {
      [MID.id]: rows,
      [TOP.id]: { playerId: TOP.id, entries: [entry({ championName: "Sett" })] },
    }
    const live = liveScoutPlayerDataIds(nextPlayers, playerDataBefore)

    const ui = archiveRemovedPlayers(
      {},
      [MID],
      playerDataBefore,
      "2026-01-01T00:00:00.000Z",
      live,
    )

    // What the container will actually persist: playerData pruned to the roster.
    const nextPlayerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      [TOP.id]: playerDataBefore[TOP.id],
    }

    expect(Object.keys(ui).sort()).toEqual(persisted(nextPlayers, nextPlayerData, ui))
    expect(Object.keys(ui)).toEqual([MID.id])
  })

  it("drops the same id when the archived player is live again", () => {
    // MID is back in the roster with fresh rows while still sitting in the archive.
    const stale: Record<ScoutPlayerId, ScoutRemovedPlayer> = {
      [MID.id]: { player: MID, data: rows, removedAtIso: "2026-01-01T00:00:00.000Z" },
    }
    const nextPlayers = [MID, TOP]
    const nextPlayerData: Record<ScoutPlayerId, ScoutPlayerData> = {
      [MID.id]: { playerId: MID.id, entries: [entry({ championName: "Sett" })] },
    }
    const live = liveScoutPlayerDataIds(nextPlayers, nextPlayerData)

    const ui = archiveRemovedPlayers(stale, [], nextPlayerData, "2026-02-01T00:00:00.000Z", live)

    expect(Object.keys(ui)).toEqual([])
    expect(persisted(nextPlayers, nextPlayerData, stale)).toEqual([])
  })

  it("keeps an id that is back in the roster but carries no data container", () => {
    // storage.ts is explicit about this: a player in `players` without a
    // playerData entry does NOT lose their archive, because the UI can still
    // restore it.
    const stale: Record<ScoutPlayerId, ScoutRemovedPlayer> = {
      [MID.id]: { player: MID, data: rows, removedAtIso: "2026-01-01T00:00:00.000Z" },
    }
    const nextPlayers = [MID]
    const live = liveScoutPlayerDataIds(nextPlayers, {})

    const ui = archiveRemovedPlayers(stale, [], {}, "2026-02-01T00:00:00.000Z", live)

    expect(Object.keys(ui)).toEqual([MID.id])
    expect(persisted(nextPlayers, {}, ui)).toEqual([MID.id])
  })
})

describe("scoutRestoreDecision", () => {
  it("restores without asking when nothing would be overwritten", () => {
    expect(scoutRestoreDecision(undefined)).toBe("restore")
    expect(scoutRestoreDecision({ playerId: MID.id, entries: [] })).toBe("restore")
    // A blank note is not work — prompting for it would train the click away.
    expect(scoutRestoreDecision({ playerId: MID.id, entries: [], note: "   " })).toBe("restore")
  })

  it("asks first when live rows or a real note would be replaced", () => {
    expect(scoutRestoreDecision({ playerId: MID.id, entries: [entry({})] })).toBe(
      "confirm_overwrite",
    )
    expect(scoutRestoreDecision({ playerId: MID.id, entries: [], note: "spielt Ranked" })).toBe(
      "confirm_overwrite",
    )
  })

  it("uses the same 'is this work' rule as the re-parse protection", () => {
    // One predicate for both data-loss paths: a divergence here would mean the
    // tab guards a re-parse but not a restore, which is how this bug started.
    const cases: (ScoutPlayerData | undefined)[] = [
      undefined,
      { playerId: MID.id, entries: [] },
      { playerId: MID.id, entries: [], note: "  " },
      { playerId: MID.id, entries: [entry({})] },
      { playerId: MID.id, entries: [], note: "x" },
    ]
    for (const data of cases) {
      expect(scoutRestoreDecision(data)).toBe(hasScoutData(data) ? "confirm_overwrite" : "restore")
    }
  })

  it("has a confirm text in both languages that names the loss", () => {
    expect(de.scout_restoreOverwriteConfirm.length).toBeGreaterThan(0)
    expect(en.scout_restoreOverwriteConfirm.length).toBeGreaterThan(0)
    expect(de.scout_restoreOverwriteConfirm).not.toMatch(/\{[a-z]+\}/i)
    expect(en.scout_restoreOverwriteConfirm).not.toMatch(/\{[a-z]+\}/i)
  })
})

/* ==========================================================================
 * 8. Export — the role-aware half
 * ========================================================================== */

describe("buildScoutExportText with a lineup", () => {
  const roster = [MID, ADC]
  const lineup = (): ScoutLineup => {
    let next = assignPlayerToSlot(createEmptyScoutLineup(), { kind: "starter", slot: "mid" }, MID.id)
      .lineup
    next = assignPlayerToSlot(next, { kind: "substitute", slot: "sub1" }, ADC.id).lineup
    return next
  }

  const playerData: Record<ScoutPlayerId, ScoutPlayerData> = {
    [MID.id]: {
      playerId: MID.id,
      entries: [entry({ championName: "Ahri", games: 30, winrate: 68, role: "mid" })],
    },
    [ADC.id]: {
      playerId: ADC.id,
      entries: [entry({ championName: "Kaisa", games: 22, winrate: 64, role: "bot" })],
    },
  }

  it("prints the starting five with every slot, empty ones included", () => {
    const analysis = analyzeScout(roster, playerData, { lineup: lineup() })
    const text = buildScoutExportText(t, analysis)

    expect(text).toContain(de.scout_lineupTitle)
    expect(text).toContain(`${de.scout_role_mid}: ${MID.displayName}`)
    // The four unfilled lanes are stated, not omitted.
    expect(text).toContain(`${de.scout_role_top}: ${de.scout_lineupEmptySlot}`)
    expect(text).toContain(de.scout_lineupIncomplete)
  })

  it("confirms a complete starting five", () => {
    const full = autofillLineupFromRoles(createEmptyScoutLineup(), ROSTER)
    const text = buildScoutExportText(t, analyzeScout(ROSTER, {}, { lineup: full }))

    expect(text).toContain(de.scout_lineupComplete)
    expect(text).not.toContain(de.scout_lineupIncomplete)
  })

  it("names the bench and states the substitute switch only when it is on", () => {
    const off = buildScoutExportText(t, analyzeScout(roster, playerData, { lineup: lineup() }))
    expect(off).toContain(`${de.scout_lineup_sub1}: ${ADC.displayName}`)
    expect(off).not.toContain(de.scout_includeSubstitutes)

    const on = buildScoutExportText(
      t,
      analyzeScout(roster, playerData, { lineup: lineup(), includeSubstitutes: true }),
      { includeSubstitutes: true },
    )
    expect(on).toContain(de.scout_includeSubstitutes)
  })

  it("gives every ban its lane, its target player, its confidence and its reasons", () => {
    const analysis = analyzeScout(roster, playerData, { lineup: lineup() })
    const text = buildScoutExportText(t, analysis)
    const banLine = text.split("\n").find((line) => line.startsWith("1. "))

    expect(banLine).toBeDefined()
    expect(banLine).toContain("Ahri")
    expect(banLine).toContain(`gegen ${de.scout_role_mid}`)
    expect(banLine).toContain(MID.displayName)

    const top = analysis.banPlan.prioritizedBans[0]
    expect(banLine).toContain(de[scoutConfidenceKey(top.confidence)])
    // Every justification travels with the recommendation, not just the first.
    expect(top.reasons.length).toBeGreaterThan(0)
    for (const reason of top.reasons) {
      expect(text).toContain(translateScoutReason(t, reason))
    }
  })

  it("carries the lineup warnings the engine raised", () => {
    const analysis = analyzeScout(roster, playerData, {
      lineup: lineup(),
      includeSubstitutes: true,
    })
    const text = buildScoutExportText(t, analysis, { includeSubstitutes: true })

    const codes = analysis.warnings.map((warning) => warning.code)
    expect(codes).toContain("incomplete_starting_five")
    expect(codes).toContain("substitute_risk_active")
    // Compared against the *filled* text: the raw templates still carry
    // `{missing}` / `{count}`, and a placeholder must never reach the export.
    for (const warning of analysis.warnings) {
      expect(text).toContain(translateScoutWarning(t, warning))
    }
  })

  it("marks a bench-only ban as one", () => {
    const benchOnly: Record<ScoutPlayerId, ScoutPlayerData> = {
      [ADC.id]: {
        playerId: ADC.id,
        entries: [entry({ championName: "Kaisa", games: 30, winrate: 70, role: "bot" })],
      },
    }
    const analysis = analyzeScout(roster, benchOnly, {
      lineup: lineup(),
      includeSubstitutes: true,
    })
    const text = buildScoutExportText(t, analysis, { includeSubstitutes: true })

    expect(text).toContain(de.scout_banSubstituteOnly)
  })

  it("stays silent about roles when no lineup was supplied", () => {
    const text = buildScoutExportText(t, analyzeScout(roster, playerData))

    expect(text).not.toContain(de.scout_lineupTitle)
    expect(text).not.toContain(de.scout_lineupIncomplete)
    expect(text).not.toContain("gegen ")
  })

  it("never leaks a machine code or a raw placeholder with a lineup either", () => {
    const analysis = analyzeScout(roster, playerData, {
      lineup: lineup(),
      includeSubstitutes: true,
    })
    const text = buildScoutExportText(t, analysis, { includeSubstitutes: true })

    expect(text).not.toMatch(/\{[a-z]+\}/i)
    expect(text).not.toContain("undefined")
    expect(text).not.toMatch(/\b(onrole_signal|offrole_signal|substitute_risk|sub1)\b/)
    // Role codes must be translated, never printed raw.
    expect(text).not.toMatch(/\bjungle\b/)
  })
})
/* ==========================================================================
 * 10. The source dropdown after the Riot auto-import was removed
 *
 * `ScoutManualSource` briefly carried a seventh member, `"riot"`, added with
 * the optional Riot auto-import. That import was removed on 2026-08-19, and
 * the member with it: with nothing able to produce a fetched row any more, an
 * option labelled "Riot API" in the source dropdown would offer a provenance
 * the user cannot honestly claim.
 *
 * Two things have to hold, and neither is covered by the generic "every union
 * value resolves" test above:
 *  - `"riot"` is really gone from the list the editor offers;
 *  - removing it did not disturb the six values that were there before it. The
 *    array *is* the visual order of the select, and a dropdown whose entries
 *    move between releases is how a row ends up tagged with the wrong source.
 *
 * A stored `"riot"` row is not this file's problem: `readManualSource()` in
 * src/scout/storage.ts degrades it to `"other"` on load, keeping every number
 * and losing only the label (see section 19 of tests/scoutStorage.test.ts).
 * ========================================================================== */

describe("SCOUT_MANUAL_SOURCE_VALUES without riot", () => {
  it("does not offer riot any more", () => {
    expect(SCOUT_MANUAL_SOURCE_VALUES).not.toContain("riot")
  })

  it("keeps the six remaining values in unchanged order", () => {
    // Spelled out as a literal on purpose: deriving the expectation from the
    // implementation would make this assertion true by construction and stop it
    // catching exactly the reordering it exists to catch.
    expect(SCOUT_MANUAL_SOURCE_VALUES).toEqual([
      "opgg",
      "leagueofgraphs",
      "deeplol",
      "dpm",
      "manual",
      "other",
    ])
    expect(SCOUT_MANUAL_SOURCE_VALUES).toHaveLength(6)
  })

  it("still ends on other, the fallback a legacy riot row degrades to", () => {
    expect(SCOUT_MANUAL_SOURCE_VALUES[SCOUT_MANUAL_SOURCE_VALUES.length - 1]).toBe("other")
    expect(scoutSourceKey("other")).toBe("scout_source_other")
  })
})
