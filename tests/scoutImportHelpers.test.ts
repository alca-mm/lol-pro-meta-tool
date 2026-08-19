/**
 * Unit tests for the pure helpers of the Tournament Scout stats import.
 *
 * Vitest runs in Node here (see vite.config.ts) — there is no jsdom, so this
 * file tests src/components/scout/scoutImportHelpers.ts only and never renders
 * ScoutStatsImportPanel. That split is exactly why the panel's rules (which
 * role is suggested, which rows are preselected, how a missing value is
 * printed) live in a helper module instead of inside the component.
 */

import { describe, expect, it } from "vitest"

import {
  SCOUT_IMPORT_ROLE_VALUES,
  SCOUT_IMPORT_SOURCE_VALUES,
  appliedRowCount,
  applicableRowIds,
  countUnparsedByReason,
  defaultSelectedRowIds,
  formatImportColumns,
  importValueLabel,
  isOpggRawResult,
  manualSourceForImport,
  resolveApplyStatus,
  scoutImportColumnKey,
  scoutImportLayoutKey,
  scoutImportModeKey,
  scoutImportSourceKey,
  scoutImportUnparsedKey,
  scoutImportWarningKey,
  selectedImportRows,
  suggestImportRole,
  summarizeSkippedLines,
  translateScoutImportWarning,
} from "../src/components/scout/scoutImportHelpers"
import { fillPlaceholders } from "../src/components/scout/scoutUiHelpers"
import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import { createEmptyScoutLineup } from "../src/scout/storage"
import { applyImportRows, parseScoutStats } from "../src/scout/statsImport"
import {
  SCOUT_IMPORT_COLUMNS,
  SCOUT_IMPORT_MODES,
  SCOUT_LINEUP_SLOTS,
} from "../src/scout/types"
import type {
  ManualChampionEntry,
  ScoutImportApplyMode,
  ScoutImportApplyResult,
  ScoutImportColumn,
  ScoutImportLayout,
  ScoutImportRow,
  ScoutImportUnparsedLine,
  ScoutImportUnparsedReason,
  ScoutImportWarningCode,
  ScoutLineup,
  ScoutPlayer,
  ScoutRole,
  ScoutStatsImportResult,
} from "../src/scout/types"

const t = (key: TranslationKey): string => de[key]

/** Every member of the union, spelled out so a new code fails this file. */
const ALL_WARNING_CODES: readonly ScoutImportWarningCode[] = [
  "empty_input",
  "no_rows_detected",
  "header_not_recognized",
  "columns_guessed",
  "unknown_champion",
  "missing_games",
  "missing_winrate",
  "value_out_of_range",
  "duplicate_champion",
  "role_mismatch",
  "row_not_parsed",
  "source_mismatch",
  // Arrived with the raw OP.GG champions-page copy: the page prints wins and
  // losses next to a winrate, so the two can disagree — and the parser reports
  // that rather than recomputing it away.
  "winrate_mismatch",
]

/**
 * Every `ScoutImportUnparsedReason`, hand-written for the same reason as
 * ALL_LAYOUTS below: src/scout/types.ts exports no runtime tuple for this union
 * (only `SCOUT_IMPORT_COLUMNS` and `SCOUT_IMPORT_MODES` have one, and those two
 * are imported instead of retyped). It has to be pulled along by hand whenever
 * the union grows — the length assertion in "covers the complete unions" is the
 * tripwire, and EVERY_UNPARSED_REASON further down turns a forgotten member
 * into a compile error instead of a silently unchecked i18n key.
 *
 * The last four arrived with the raw OP.GG champions-page copy: they are the
 * categories that page contributes and that must never become rows.
 * `page_noise` is the youngest — the structural "-" / dash / marker lines that
 * a raw copy produces by the dozen and that the skip summary counts instead of
 * listing, which is why its i18n key has to be covered here like every other.
 */
const ALL_UNPARSED_REASONS: readonly ScoutImportUnparsedReason[] = [
  "header",
  "no_champion",
  "no_numbers",
  "noise",
  "matchup_row",
  "recommended_champion",
  "aggregate_row",
  "page_noise",
]

/**
 * The same union again — but as a `Record` keyed ON it, so TypeScript itself
 * demands completeness: a new member that nobody adds here is a compile error
 * in this file, which is a stronger guarantee than any length assertion can
 * give (a list can be short and still typecheck).
 *
 * Derived from the union, never from a literal list of strings: the test below
 * walks `Object.keys()` of this record, so the set it checks cannot drift away
 * from `ScoutImportUnparsedReason` without the compiler saying so first.
 */
const EVERY_UNPARSED_REASON: Readonly<Record<ScoutImportUnparsedReason, true>> = {
  header: true,
  no_champion: true,
  no_numbers: true,
  noise: true,
  matchup_row: true,
  recommended_champion: true,
  aggregate_row: true,
  page_noise: true,
}

const UNPARSED_REASONS_FROM_UNION = Object.keys(
  EVERY_UNPARSED_REASON,
) as ScoutImportUnparsedReason[]

/**
 * Every `ScoutImportLayout`, hand-written because src/scout/types.ts exports no
 * `SCOUT_IMPORT_LAYOUTS` tuple to derive it from (unlike `SCOUT_IMPORT_COLUMNS`
 * / `SCOUT_IMPORT_MODES`, which are derived above and below).
 *
 * MUST BE KEPT IN STEP WITH THE UNION IN BOTH DIRECTIONS: a new member missing
 * from this list would still typecheck and the suite would still pass, while
 * its `scout_import_layout_<member>` key went unchecked in de *and* en — which
 * is exactly what happened when the (since removed) `"riot_api"` was added. The
 * length assertion in "covers the complete unions" is the tripwire; keep the
 * two in sync.
 */
const ALL_LAYOUTS: readonly ScoutImportLayout[] = [
  "tabular_with_header",
  "tabular_no_header",
  "loose_lines",
  "unrecognized",
  // The raw browser copy of the OP.GG champions page — the one layout that is
  // not made of columns; its values arrive one per line.
  "opgg_raw_champion_page",
]

function makeRow(overrides: Partial<ScoutImportRow> & { id: string }): ScoutImportRow {
  return {
    raw: `${overrides.championName ?? "Karma"} 12 55%`,
    championName: "Karma",
    championResolved: true,
    games: 12,
    // `null`, not `0`: only the raw OP.GG copy states wins and losses
    // separately, and "the text did not say" is a different fact from "zero
    // wins". Every case below that cares about the split overrides them.
    wins: null,
    losses: null,
    winrate: 55,
    kda: null,
    csPerMin: null,
    killParticipation: null,
    damage: null,
    detectedRole: "unknown",
    roleMismatch: false,
    confidence: "medium",
    warnings: [],
    ...overrides,
  }
}

function makePlayer(id: string, role: ScoutRole): ScoutPlayer {
  return {
    id,
    riotName: id,
    tagline: "EUW",
    region: "EUW",
    displayName: `${id}#EUW`,
    role,
    sources: [],
  }
}

function lineupWith(slot: "top" | "jungle" | "mid" | "bot" | "support", playerId: string): ScoutLineup {
  const lineup = createEmptyScoutLineup()
  lineup.starters[slot] = playerId
  return lineup
}

/* ==========================================================================
 * 1. Mechanical i18n key building
 * ========================================================================== */

describe("scout import i18n key builders", () => {
  it("resolves every union value to an existing key in both languages", () => {
    const keys: TranslationKey[] = [
      ...ALL_WARNING_CODES.map(scoutImportWarningKey),
      ...ALL_UNPARSED_REASONS.map(scoutImportUnparsedKey),
      ...SCOUT_IMPORT_COLUMNS.map(scoutImportColumnKey),
      ...ALL_LAYOUTS.map(scoutImportLayoutKey),
      ...SCOUT_IMPORT_MODES.map(scoutImportModeKey),
      ...SCOUT_IMPORT_SOURCE_VALUES.map(scoutImportSourceKey),
    ]

    for (const key of keys) {
      expect(typeof de[key], key).toBe("string")
      expect(de[key].length, key).toBeGreaterThan(0)
      expect(typeof en[key], key).toBe("string")
      expect(en[key].length, key).toBeGreaterThan(0)
    }
  })

  it("covers the complete unions, not a hand-picked subset", () => {
    // 13 since `winrate_mismatch` joined with the raw OP.GG copy.
    expect(ALL_WARNING_CODES).toHaveLength(13)
    // 7 since `matchup_row`, `recommended_champion` and `aggregate_row` joined
    // with the raw OP.GG copy; 8 since `page_noise` joined with the compact
    // skip summary. Bumping this number without adding the member to
    // ALL_UNPARSED_REASONS *and* EVERY_UNPARSED_REASON is what the assertion is
    // here to prevent.
    expect(ALL_UNPARSED_REASONS).toHaveLength(8)
    expect(SCOUT_IMPORT_COLUMNS).toHaveLength(9)
    // Was 4 after the Riot auto-import — and with it `"riot_api"` — was
    // removed; 5 since `opgg_raw_champion_page`. See ALL_LAYOUTS.
    expect(ALL_LAYOUTS).toHaveLength(5)
    // `manual_paste` and `source_links`; `riot_api` went with the auto-import.
    expect(SCOUT_IMPORT_MODES).toHaveLength(2)
  })

  it("has a key in de and en for EVERY unparsed reason of the union", () => {
    // Derived from `ScoutImportUnparsedReason` itself (see
    // EVERY_UNPARSED_REASON) rather than from a literal list, so the three
    // reasons the raw OP.GG copy added — and any future one — are covered
    // whether or not somebody remembers to extend ALL_UNPARSED_REASONS.
    expect(UNPARSED_REASONS_FROM_UNION).toHaveLength(8)
    expect([...UNPARSED_REASONS_FROM_UNION].sort()).toEqual([...ALL_UNPARSED_REASONS].sort())

    for (const reason of UNPARSED_REASONS_FROM_UNION) {
      const key = scoutImportUnparsedKey(reason)
      expect(key).toBe(`scout_import_unparsed_${reason}`)
      expect(typeof de[key], key).toBe("string")
      expect(de[key].length, key).toBeGreaterThan(0)
      expect(typeof en[key], key).toBe("string")
      expect(en[key].length, key).toBeGreaterThan(0)
    }
  })

  it("covers the three reasons the raw OP.GG copy skips on purpose", () => {
    // These are the categories that must never become rows: enemy matchups,
    // OP.GG's own recommendations (which nobody played) and the "All champions"
    // total. Each says WHAT was skipped instead of a flat "noise".
    for (const reason of ["matchup_row", "recommended_champion", "aggregate_row"] as const) {
      const key = scoutImportUnparsedKey(reason)
      expect(UNPARSED_REASONS_FROM_UNION).toContain(reason)
      expect(de[key].length, key).toBeGreaterThan(0)
      expect(en[key].length, key).toBeGreaterThan(0)
    }
  })

  it("builds the documented key shape", () => {
    expect(scoutImportWarningKey("role_mismatch")).toBe("scout_import_warning_role_mismatch")
    expect(scoutImportUnparsedKey("no_numbers")).toBe("scout_import_unparsed_no_numbers")
    expect(scoutImportColumnKey("csPerMin")).toBe("scout_import_column_csPerMin")
    expect(scoutImportLayoutKey("tabular_with_header")).toBe(
      "scout_import_layout_tabular_with_header",
    )
    expect(scoutImportModeKey("manual_paste")).toBe("scout_import_mode_manual_paste")
  })

  it("maps import sources onto the provider labels, with its own key for unknown", () => {
    expect(scoutImportSourceKey("unknown")).toBe("scout_import_source_unknown")
    expect(scoutImportSourceKey("opgg")).toBe("scout_source_opgg")
    expect(scoutImportSourceKey("leagueofgraphs")).toBe("scout_source_leagueofgraphs")
    expect(scoutImportSourceKey("deeplol")).toBe("scout_source_deeplol")
    expect(scoutImportSourceKey("dpm")).toBe("scout_source_dpm")
  })
})

/* ==========================================================================
 * 2. Warning text
 * ========================================================================== */

describe("translateScoutImportWarning", () => {
  it("substitutes placeholders and leaves no raw {…} behind", () => {
    const text = translateScoutImportWarning(t, {
      code: "unknown_champion",
      severity: "warning",
      params: { champion: "Leee Sin" },
    })
    expect(text).toContain("Leee Sin")
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it("renders role params as role LABELS, never as the machine code", () => {
    const text = translateScoutImportWarning(t, {
      code: "role_mismatch",
      severity: "warning",
      params: { detectedRole: "bot", selectedRole: "support" },
    })
    // `scout_role_bot` is "ADC" — the whole reason this localisation exists.
    expect(text).toContain(de.scout_role_bot)
    expect(text).toContain(de.scout_role_support)
    expect(text).not.toContain("bot")
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it("renders source params as provider labels", () => {
    const text = translateScoutImportWarning(t, {
      code: "source_mismatch",
      severity: "warning",
      params: { detected: "opgg", selected: "deeplol" },
    })
    expect(text).toContain(de.scout_source_opgg)
    expect(text).toContain(de.scout_source_deeplol)
    expect(text).not.toContain("opgg")
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it("translates an unknown detected source to its own label", () => {
    const text = translateScoutImportWarning(t, {
      code: "source_mismatch",
      severity: "warning",
      params: { detected: "unknown", selected: "dpm" },
    })
    expect(text).toContain(de.scout_import_source_unknown)
    expect(text).toContain(de.scout_source_dpm)
  })

  it("states the winrate mismatch in both languages, with every value filled in", () => {
    // The raw OP.GG copy prints wins, losses AND a winrate, so the three can
    // disagree. The warning reports that disagreement — it is never resolved by
    // recomputing the winrate — so all three values have to reach the sentence.
    expect(typeof de.scout_import_warning_winrate_mismatch).toBe("string")
    expect(de.scout_import_warning_winrate_mismatch.length).toBeGreaterThan(0)
    expect(typeof en.scout_import_warning_winrate_mismatch).toBe("string")
    expect(en.scout_import_warning_winrate_mismatch.length).toBeGreaterThan(0)

    const text = translateScoutImportWarning(t, {
      code: "winrate_mismatch",
      severity: "warning",
      params: { champion: "Ahri", stated: 50, computed: 52.8 },
    })
    expect(text).toContain("Ahri")
    expect(text).toContain("50")
    // formatScoutNumber rounds to one decimal, like every other number in the
    // scout UI.
    expect(text).toContain("52.8")
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it("renders a warning without params without leaving a placeholder", () => {
    for (const code of ALL_WARNING_CODES) {
      const text = translateScoutImportWarning(t, { code, severity: "info" })
      expect(text.length, code).toBeGreaterThan(0)
      expect(text, code).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })
})

/* ==========================================================================
 * 3. Canonical value lists
 * ========================================================================== */

describe("SCOUT_IMPORT_ROLE_VALUES", () => {
  it("is exactly the five lineup slots, in the canonical order", () => {
    expect(SCOUT_IMPORT_ROLE_VALUES).toEqual(["top", "jungle", "mid", "bot", "support"])
    expect(SCOUT_IMPORT_ROLE_VALUES).toEqual([...SCOUT_LINEUP_SLOTS])
  })

  it("offers neither a role-less choice nor an invented 'adc' identifier", () => {
    expect(SCOUT_IMPORT_ROLE_VALUES).not.toContain("unknown")
    expect(SCOUT_IMPORT_ROLE_VALUES).not.toContain("adc")
    // "ADC" is a label of `bot`, not a second identifier.
    expect(de.scout_role_bot).toBe("ADC")
  })
})

describe("SCOUT_IMPORT_SOURCE_VALUES", () => {
  it("lists the four providers plus unknown", () => {
    expect(SCOUT_IMPORT_SOURCE_VALUES).toEqual([
      "opgg",
      "leagueofgraphs",
      "deeplol",
      "dpm",
      "unknown",
    ])
  })
})

/* ==========================================================================
 * 4. Role suggestion
 * ========================================================================== */

describe("suggestImportRole", () => {
  it("uses the starting slot of a player who holds one", () => {
    const player = makePlayer("p1", "top")
    // The declared seat wins over the parsed guess.
    expect(suggestImportRole(lineupWith("support", "p1"), player)).toBe("support")
  })

  it("falls back to the parsed role for a player without a starting seat", () => {
    const player = makePlayer("p2", "jungle")
    expect(suggestImportRole(createEmptyScoutLineup(), player)).toBe("jungle")
  })

  it("ignores a substitute seat and uses the parsed role instead", () => {
    const lineup = createEmptyScoutLineup()
    lineup.substitutes.sub1 = "p3"
    expect(suggestImportRole(lineup, makePlayer("p3", "mid"))).toBe("mid")
  })

  it("returns null — never a guessed role — when nothing is known", () => {
    const suggestion = suggestImportRole(createEmptyScoutLineup(), makePlayer("p4", "unknown"))
    expect(suggestion).toBeNull()
    expect(suggestion).not.toBe("top")
  })

  it("returns null for a benched player whose role was never detected", () => {
    const lineup = createEmptyScoutLineup()
    lineup.substitutes.sub2 = "p5"
    expect(suggestImportRole(lineup, makePlayer("p5", "unknown"))).toBeNull()
  })
})

/* ==========================================================================
 * 5. Row selection
 * ========================================================================== */

describe("applicableRowIds", () => {
  it("preselects only the rows that can become entries", () => {
    const rows: ScoutImportRow[] = [
      makeRow({ id: "row-0", championName: "Karma" }),
      makeRow({ id: "row-1", championName: "Lulu", games: null }),
      makeRow({ id: "row-2", championName: "Nami", winrate: null }),
      makeRow({ id: "row-3", championName: "Thresh" }),
    ]
    expect(applicableRowIds(rows)).toEqual(["row-0", "row-3"])
  })

  it("returns an empty list for an empty parse", () => {
    expect(applicableRowIds([])).toEqual([])
  })
})

describe("defaultSelectedRowIds", () => {
  it("preselects an applicable row whose champion the catalog knows", () => {
    const rows: ScoutImportRow[] = [
      makeRow({ id: "row-0", championName: "Karma" }),
      makeRow({ id: "row-1", championName: "Thresh" }),
    ]
    expect(defaultSelectedRowIds(rows)).toEqual(["row-0", "row-1"])
  })

  it("leaves an unresolved champion unticked while it stays applicable", () => {
    // The two questions the two functions answer are different:
    // "may this row be applied?" (yes — an unknown name is still storable, the
    // checkbox stays enabled) versus "should it be applied without the user
    // saying so?" (no — the user confirms an unknown name deliberately).
    const rows: ScoutImportRow[] = [
      makeRow({ id: "row-0", championName: "Karma" }),
      makeRow({ id: "row-1", championName: "Leee Sin", championResolved: false }),
    ]
    expect(applicableRowIds(rows)).toEqual(["row-0", "row-1"])
    expect(defaultSelectedRowIds(rows)).toEqual(["row-0"])
  })

  it("never preselects a row that cannot become an entry at all", () => {
    const rows: ScoutImportRow[] = [
      makeRow({ id: "row-0", championName: "Lulu", games: null }),
      makeRow({ id: "row-1", championName: "Nami", winrate: null }),
      // Not applicable AND unresolved — blocked twice over.
      makeRow({ id: "row-2", championName: "footer", championResolved: false, games: null }),
    ]
    expect(defaultSelectedRowIds(rows)).toEqual([])
  })

  it("keeps the parse order and returns nothing for an empty parse", () => {
    const rows: ScoutImportRow[] = [
      makeRow({ id: "row-2", championName: "Nami" }),
      makeRow({ id: "row-0", championName: "Karma" }),
      makeRow({ id: "row-1", championName: "Lulu" }),
    ]
    expect(defaultSelectedRowIds(rows)).toEqual(["row-2", "row-0", "row-1"])
    expect(defaultSelectedRowIds([])).toEqual([])
  })

  it("does not preselect a copied-along total line, through the real parser", () => {
    // The concrete regression: a pasted table whose last line is the site's
    // own summary row. `total` has real numbers, so it IS applicable — only
    // the unresolved champion name keeps it out of the preselection.
    const result = parseScoutStats(["Karma\t34\t61%", "Lulu\t18\t55%", "total\t42\t58%"].join("\n"), {
      role: "support",
      source: "unknown",
    })

    const totalRow = result.rows.find((row) => row.championName === "total")
    expect(totalRow, "the parser must still surface the total line as a row").toBeDefined()
    expect(totalRow?.championResolved).toBe(false)

    expect(applicableRowIds(result.rows)).toContain(totalRow?.id)
    expect(defaultSelectedRowIds(result.rows)).not.toContain(totalRow?.id)
    expect(defaultSelectedRowIds(result.rows)).toEqual(
      result.rows.filter((row) => row.championResolved).map((row) => row.id),
    )
  })
})

describe("selectedImportRows", () => {
  const rows: ScoutImportRow[] = [
    makeRow({ id: "row-0", championName: "Karma" }),
    makeRow({ id: "row-1", championName: "Lulu" }),
    makeRow({ id: "row-2", championName: "Nami" }),
  ]

  it("keeps the parse order, not the order the ids were ticked in", () => {
    const selected = selectedImportRows(rows, new Set(["row-2", "row-0"]))
    expect(selected.map((row) => row.id)).toEqual(["row-0", "row-2"])
  })

  it("ignores ids that match no row", () => {
    const selected = selectedImportRows(rows, new Set(["row-1", "row-99", ""]))
    expect(selected.map((row) => row.id)).toEqual(["row-1"])
  })

  it("returns nothing for an empty selection", () => {
    expect(selectedImportRows(rows, new Set())).toEqual([])
  })

  it("selects exactly the applicable rows when fed the preselection", () => {
    const mixed: ScoutImportRow[] = [
      makeRow({ id: "row-0" }),
      makeRow({ id: "row-1", games: null }),
      makeRow({ id: "row-2" }),
    ]
    const selected = selectedImportRows(mixed, new Set(applicableRowIds(mixed)))
    expect(selected.map((row) => row.id)).toEqual(["row-0", "row-2"])
  })
})

/* ==========================================================================
 * 6. Cell formatting
 * ========================================================================== */

describe("importValueLabel", () => {
  it("prints the missing-value label for null — never a zero", () => {
    const label = importValueLabel(t, null)
    expect(label).toBe(de.scout_import_rowMissing)
    expect(label).not.toBe("0")
  })

  it("keeps the missing-value label even when a suffix was asked for", () => {
    expect(importValueLabel(t, null, "%")).toBe(de.scout_import_rowMissing)
  })

  it("formats a real zero as a zero", () => {
    expect(importValueLabel(t, 0)).toBe("0")
  })

  it("formats numbers the way the rest of the scout does", () => {
    expect(importValueLabel(t, 24)).toBe("24")
    expect(importValueLabel(t, 62.4567)).toBe("62.5")
  })

  it("appends the suffix", () => {
    expect(importValueLabel(t, 61, "%")).toBe("61%")
  })
})

/* ==========================================================================
 * 7. Column list
 * ========================================================================== */

describe("formatImportColumns", () => {
  it("joins the translated names in the order it was given", () => {
    const columns: ScoutImportColumn[] = ["champion", "games", "winrate"]
    expect(formatImportColumns(t, columns)).toBe(
      `${de.scout_import_column_champion}, ${de.scout_import_column_games}, ${de.scout_import_column_winrate}`,
    )
  })

  it("does not re-sort into the canonical order", () => {
    expect(formatImportColumns(t, ["winrate", "champion"])).toBe(
      `${de.scout_import_column_winrate}, ${de.scout_import_column_champion}`,
    )
  })

  it("returns an empty string for no columns", () => {
    expect(formatImportColumns(t, [])).toBe("")
  })
})

/* ==========================================================================
 * 8. Provenance of the applied rows
 * ========================================================================== */

describe("manualSourceForImport", () => {
  it("maps the parser's unknown onto other", () => {
    // "unknown" is a legitimate PARSER answer but not a legitimate stored
    // provenance — ScoutManualSource has no such member, on purpose.
    expect(manualSourceForImport("loose_lines", "unknown")).toBe("other")
    expect(manualSourceForImport("unrecognized", "unknown")).toBe("other")
    expect(manualSourceForImport("tabular_with_header", "unknown")).toBe("other")
  })

  it("keeps the provider the user selected", () => {
    expect(manualSourceForImport("tabular_with_header", "opgg")).toBe("opgg")
    expect(manualSourceForImport("tabular_no_header", "deeplol")).toBe("deeplol")
    expect(manualSourceForImport("loose_lines", "leagueofgraphs")).toBe("leagueofgraphs")
    expect(manualSourceForImport("loose_lines", "dpm")).toBe("dpm")
  })

  it("never files anything as riot", () => {
    // There is no fetching import any more: every row in this feature was
    // copied out of a site by a human, so `"riot"` would claim a provenance
    // nobody stated. Walked over the FULL product of the signature — every
    // layout against every selectable source — so no layout can quietly bring
    // it back.
    for (const layout of ALL_LAYOUTS) {
      for (const source of SCOUT_IMPORT_SOURCE_VALUES) {
        expect(manualSourceForImport(layout, source), `${layout}/${source}`).not.toBe("riot")
      }
    }
  })

  it("answers the same for every layout — the dropdown is the only statement", () => {
    // No pasted layout knows better than the user where the text came from, so
    // none of them may override the dropdown behind their back.
    for (const layout of ALL_LAYOUTS) {
      expect(manualSourceForImport(layout, "opgg"), layout).toBe("opgg")
      expect(manualSourceForImport(layout, "unknown"), layout).toBe("other")
    }
  })
})

/* ==========================================================================
 * 9. The raw OP.GG champions-page copy
 * ========================================================================== */

function makeUnparsed(reason: ScoutImportUnparsedReason, raw?: string): ScoutImportUnparsedLine {
  return { raw: raw ?? `line for ${reason}`, reason }
}

function makeResult(overrides: Partial<ScoutStatsImportResult> = {}): ScoutStatsImportResult {
  return {
    rows: [],
    unparsedLines: [],
    layout: "tabular_with_header",
    columns: [],
    detectedSource: "unknown",
    warnings: [],
    confidence: "medium",
    ...overrides,
  }
}

describe("countUnparsedByReason", () => {
  const lines: ScoutImportUnparsedLine[] = [
    makeUnparsed("matchup_row", "vs Yasuo 4 50%"),
    makeUnparsed("recommended_champion", "Ahri"),
    makeUnparsed("matchup_row", "vs Zed 2 100%"),
    makeUnparsed("noise", "Mehr anzeigen"),
    makeUnparsed("matchup_row", "vs Sylas 7 42%"),
    makeUnparsed("aggregate_row", "Alle Champions 214 51%"),
  ]

  it("counts each reason on its own and ignores the others", () => {
    expect(countUnparsedByReason(lines, "matchup_row")).toBe(3)
    expect(countUnparsedByReason(lines, "recommended_champion")).toBe(1)
    expect(countUnparsedByReason(lines, "aggregate_row")).toBe(1)
    expect(countUnparsedByReason(lines, "noise")).toBe(1)
  })

  it("returns 0 for a reason nothing in the list carries", () => {
    // 0 is the honest answer here — there genuinely were none. This is NOT the
    // nullable-number case of ScoutImportRow, where 0 and "not stated" differ.
    expect(countUnparsedByReason(lines, "header")).toBe(0)
    expect(countUnparsedByReason(lines, "no_champion")).toBe(0)
    expect(countUnparsedByReason(lines, "no_numbers")).toBe(0)
  })

  it("returns 0 for an empty list", () => {
    for (const reason of UNPARSED_REASONS_FROM_UNION) {
      expect(countUnparsedByReason([], reason), reason).toBe(0)
    }
  })

  it("accounts for every line when summed over the whole union", () => {
    // The counters may summarise the skipped lines, but they must never lose
    // one: the per-reason counts add up to the full list.
    const total = UNPARSED_REASONS_FROM_UNION.reduce(
      (sum, reason) => sum + countUnparsedByReason(lines, reason),
      0,
    )
    expect(total).toBe(lines.length)
  })

  it("does not mutate or reorder the list it was given", () => {
    const input = [...lines]
    countUnparsedByReason(input, "matchup_row")
    expect(input).toEqual(lines)
  })
})

describe("isOpggRawResult", () => {
  it("is true for the raw OP.GG champions-page copy", () => {
    expect(isOpggRawResult(makeResult({ layout: "opgg_raw_champion_page" }))).toBe(true)
  })

  it("is false for every other layout", () => {
    // Walked over the full union minus the one true member, so a renamed or
    // added layout cannot quietly start claiming the OP.GG block.
    for (const layout of ALL_LAYOUTS) {
      if (layout === "opgg_raw_champion_page") continue
      expect(isOpggRawResult(makeResult({ layout })), layout).toBe(false)
    }
    expect(ALL_LAYOUTS.filter((layout) => layout !== "opgg_raw_champion_page")).toHaveLength(4)
  })

  it("looks at the layout only — not at the source the user picked", () => {
    // A user may well select "OP.GG" in the dropdown while pasting an ordinary
    // table off the same site. That is not a raw champions-page copy, and the
    // block that explains the skipped matchup lines must not appear for it.
    expect(
      isOpggRawResult(makeResult({ layout: "tabular_with_header", detectedSource: "opgg" })),
    ).toBe(false)
    // And the other way round: the layout stands even when detection could not
    // name a source.
    expect(
      isOpggRawResult(makeResult({ layout: "opgg_raw_champion_page", detectedSource: "unknown" })),
    ).toBe(true)
  })
})

/* ==========================================================================
 * 10. The apply step's single status
 *
 * THE BUG THIS SECTION EXISTS FOR: the panel rendered its two apply messages
 * from two independent conditions (`!canApply` and `appliedCount !== null`),
 * and those two are not mutually exclusive. `handleApply()` clears the row
 * selection so a double click cannot apply the same rows twice — which makes
 * `canApply` false in the very render that first carries an `appliedCount`.
 * The user saw "Übernahme gesperrt: …" and "Übernommen: 72 Zeilen." at the
 * same time, each contradicting the other.
 *
 * Vitest runs in Node without jsdom, so the panel cannot be rendered here.
 * That is exactly why the rule was moved into a pure function — otherwise this
 * regression would be untestable and could only be re-found by hand.
 * ========================================================================== */

describe("resolveApplyStatus", () => {
  it("reports the fresh success when a row was applied and the button is live", () => {
    expect(resolveApplyStatus({ canApply: true, appliedCount: 3 })).toEqual({
      kind: "applied",
      count: 3,
    })
  })

  it("REGRESSION: reports ONLY applied when the apply itself disabled the button", () => {
    // THE CASE THE USER REPORTED. Right after a successful apply the selection
    // is empty, so `canApply` is false while `appliedCount` is set. Before the
    // fix this rendered the blocked warning AND the success message side by
    // side. `applied` wins, and `blocked` must not appear at all.
    const status = resolveApplyStatus({ canApply: false, appliedCount: 3 })
    expect(status).toEqual({ kind: "applied", count: 3 })
    expect(status.kind).not.toBe("blocked")
  })

  it("reports blocked when nothing has been applied and nothing can be", () => {
    expect(resolveApplyStatus({ canApply: false, appliedCount: null })).toEqual({
      kind: "blocked",
    })
  })

  it("says nothing at all when the button is live and nothing was applied yet", () => {
    expect(resolveApplyStatus({ canApply: true, appliedCount: null })).toEqual({ kind: "idle" })
  })

  it("returns exactly ONE kind for every combination there is", () => {
    // The point of the function: two messages must be UNREPRESENTABLE, not
    // merely unlikely. Walked over both booleans and a spread of counts —
    // including 0, which is a legitimate applied count (every selected row was
    // skipped) and must NOT be confused with `null`.
    const counts: readonly (number | null)[] = [null, 0, 1, 3, 72]
    const seen = new Set<string>()

    for (const canApply of [true, false]) {
      for (const appliedCount of counts) {
        const status = resolveApplyStatus({ canApply, appliedCount })
        seen.add(status.kind)

        // Exactly one kind, and it is one of the three the union allows.
        expect(["applied", "blocked", "idle"], `${canApply}/${appliedCount}`).toContain(status.kind)

        // The discriminant decides everything: `count` exists on `applied` and
        // on nothing else, so no caller can read a stale number off a blocked
        // or idle status.
        if (status.kind === "applied") {
          expect(appliedCount, `${canApply}/${appliedCount}`).not.toBeNull()
          expect(status.count, `${canApply}/${appliedCount}`).toBe(appliedCount)
        } else {
          expect(appliedCount, `${canApply}/${appliedCount}`).toBeNull()
          expect(Object.keys(status), `${canApply}/${appliedCount}`).toEqual(["kind"])
        }
      }
    }

    // All three states are actually reachable — a function that only ever
    // returned `applied` would pass every assertion above.
    expect([...seen].sort()).toEqual(["applied", "blocked", "idle"])
  })

  it("passes a zero count through instead of falling back to blocked", () => {
    // 0 applied rows is a RESULT ("you selected rows, none of them could be
    // stored"), not the absence of one. Treating it as falsy would report the
    // situation as "not applicable yet" and hide what actually happened.
    expect(resolveApplyStatus({ canApply: false, appliedCount: 0 })).toEqual({
      kind: "applied",
      count: 0,
    })
  })

  it("does not read its answer off anything but its two inputs", () => {
    // Pure: same input, same answer, no accumulated state between calls.
    const first = resolveApplyStatus({ canApply: false, appliedCount: 5 })
    resolveApplyStatus({ canApply: true, appliedCount: null })
    const second = resolveApplyStatus({ canApply: false, appliedCount: 5 })
    expect(second).toEqual(first)
  })
})

/* ==========================================================================
 * 11. How many rows the apply really took over
 *
 * The success message says "n champion rows applied", so `n` has to be the
 * rows from the PASTE — not a games total, not the preview's row count, and
 * not the number of entries the merge touched.
 * ========================================================================== */

function importEntry(championName: string, games: number): ManualChampionEntry {
  return {
    championName,
    games,
    winrate: 50,
    note: "",
    source: "opgg",
    recency: "current",
    role: "mid",
  }
}

function applyRows(
  existing: readonly ManualChampionEntry[],
  rows: readonly ScoutImportRow[],
  mode: ScoutImportApplyMode,
): ScoutImportApplyResult {
  return applyImportRows(existing, rows, {
    role: "mid",
    source: "opgg",
    recency: "current",
    mode,
  })
}

describe("appliedRowCount", () => {
  /** `n` rows the catalog resolves, ready to be ticked. */
  function parsedRows(count: number): ScoutImportRow[] {
    const names = [
      "Ahri",
      "Lux",
      "Milio",
      "Zed",
      "Syndra",
      "Orianna",
      "Viktor",
      "Azir",
      "Sylas",
      "Yone",
      "Ryze",
      "Taliyah",
    ]
    return Array.from({ length: count }, (_unused, index) =>
      makeRow({
        id: `r${index}`,
        championName: names[index % names.length] + (index >= names.length ? String(index) : ""),
        games: 40 + index,
        winrate: 50,
      }),
    )
  }

  it("counts the SELECTED rows, not the parsed ones — 10 parsed, 3 ticked, 3 applied", () => {
    // The scenario from the bug report, run through the REAL applyImportRows.
    // The message must name the three rows the user ticked, never the ten the
    // preview listed.
    const parsed = parsedRows(10)
    const ticked = selectedImportRows(parsed, new Set(["r0", "r1", "r2"]))
    expect(parsed).toHaveLength(10)
    expect(ticked).toHaveLength(3)

    const result = applyRows([], ticked, "append")
    expect(appliedRowCount(ticked, result)).toBe(3)
    expect(appliedRowCount(ticked, result)).not.toBe(parsed.length)
  })

  it("counts three overwrites of existing entries as 3, not 6", () => {
    // `append` where all three ticked rows overwrite a stored entry of the same
    // champion and role: `added` 0, `replaced` 3 — three rows from the paste.
    const parsed = parsedRows(10)
    const ticked = selectedImportRows(parsed, new Set(["r0", "r1", "r2"]))
    const existing = ticked.map((row) => importEntry(row.championName, 5))

    const result = applyRows(existing, ticked, "append")
    expect(result.added).toBe(0)
    expect(result.replaced).toBe(3)
    expect(appliedRowCount(ticked, result)).toBe(3)
  })

  it("REGRESSION: replace, 36 stored / 36 selected → 36, not 72", () => {
    // THE 72 FROM THE BUG REPORT. In `replace` mode applyImportRows() drops the
    // whole role first and reports the count of the DELETED entries as
    // `replaced` (see the contract on ScoutImportApplyResult). `added +
    // replaced` therefore announced a deletion as an import.
    const ticked = parsedRows(36)
    const existing = Array.from({ length: 36 }, (_unused, index) =>
      importEntry(`Stored${index}`, 5),
    )

    const result = applyRows(existing, ticked, "replace")
    expect(result.added).toBe(36)
    expect(result.replaced).toBe(36)
    // What the panel used to print:
    expect(result.added + result.replaced).toBe(72)
    // What it prints now — and what actually got stored:
    expect(appliedRowCount(ticked, result)).toBe(36)
    expect(result.entries).toHaveLength(36)
  })

  it("REGRESSION: replace, 36 stored / 10 selected → 10, not 46", () => {
    const ticked = parsedRows(10)
    const existing = Array.from({ length: 36 }, (_unused, index) =>
      importEntry(`Stored${index}`, 5),
    )

    const result = applyRows(existing, ticked, "replace")
    expect(result.added + result.replaced).toBe(46)
    expect(appliedRowCount(ticked, result)).toBe(10)
    expect(result.entries).toHaveLength(10)
  })

  it("never lets a GAMES figure through — one row with 50 games counts as 1", () => {
    // The user's first suspicion was that the number was a games total. It
    // structurally cannot be: both operands are row counts.
    const ticked = [makeRow({ id: "a", championName: "Ahri", games: 50, winrate: 50 })]
    for (const mode of ["append", "replace"] as const) {
      const result = applyRows([], ticked, mode)
      expect(appliedRowCount(ticked, result), mode).toBe(1)
      expect(appliedRowCount(ticked, result), mode).not.toBe(50)
    }
  })

  it("does not count rows that could never become entries", () => {
    // A row without games and without winrate is reported as `skipped` and must
    // not be announced as applied.
    const ticked = [
      makeRow({ id: "a", championName: "Ahri", games: 72, winrate: 50 }),
      makeRow({ id: "b", championName: "Lux", games: null, winrate: null }),
      makeRow({ id: "c", championName: "Milio", games: 32, winrate: 63 }),
    ]
    for (const mode of ["append", "replace"] as const) {
      const result = applyRows([], ticked, mode)
      expect(result.skipped, mode).toBe(1)
      expect(appliedRowCount(ticked, result), mode).toBe(2)
    }
  })

  it("reports 0 when nothing was applicable — never a comforting number", () => {
    const ticked = [makeRow({ id: "a", championName: "Ahri", games: null, winrate: null })]
    for (const mode of ["append", "replace"] as const) {
      const result = applyRows([], ticked, mode)
      expect(appliedRowCount(ticked, result), mode).toBe(0)
    }
  })

  it("reports 0 for an empty selection", () => {
    const result = applyRows([importEntry("Ahri", 10)], [], "append")
    expect(appliedRowCount([], result)).toBe(0)
  })

  it("equals the number of entries the apply actually produced, in both modes", () => {
    // The invariant behind the formula: every non-skipped row becomes an entry,
    // because importRowToManualEntry() returns null for exactly the rows
    // isImportRowApplicable() rejects. Asserted against the stored result rather
    // than restated, so a change in that relationship fails here.
    const ticked = parsedRows(5)

    const appended = applyRows([], ticked, "append")
    expect(appliedRowCount(ticked, appended)).toBe(appended.entries.length)

    const existing = Array.from({ length: 12 }, (_unused, index) =>
      importEntry(`Stored${index}`, 5),
    )
    const replacedResult = applyRows(existing, ticked, "replace")
    expect(appliedRowCount(ticked, replacedResult)).toBe(replacedResult.entries.length)
  })
})

/* ==========================================================================
 * 12. The compact skip summary
 * ========================================================================== */

describe("summarizeSkippedLines", () => {
  const mixed: ScoutImportUnparsedLine[] = [
    makeUnparsed("aggregate_row", "Alle Champions"),
    makeUnparsed("matchup_row", "vs Zed"),
    makeUnparsed("matchup_row", "vs Syndra"),
    makeUnparsed("recommended_champion", "Sett"),
    makeUnparsed("page_noise", "-"),
    makeUnparsed("page_noise", "-"),
    makeUnparsed("page_noise", "—"),
    makeUnparsed("header", "Champion Spiele Winrate"),
    makeUnparsed("no_champion", "Rangliste 42"),
    makeUnparsed("no_numbers", "Ahri"),
    makeUnparsed("noise", "Mehr anzeigen"),
  ]

  it("counts the four categories the parser recognised positively", () => {
    const summary = summarizeSkippedLines(makeResult({ unparsedLines: mixed }))
    expect(summary.aggregateRows).toBe(1)
    expect(summary.matchupRows).toBe(2)
    expect(summary.recommendedChampions).toBe(1)
    expect(summary.pageNoise).toBe(3)
  })

  it("keeps the counted reasons OUT of the list", () => {
    const summary = summarizeSkippedLines(makeResult({ unparsedLines: mixed }))
    for (const reason of ["aggregate_row", "matchup_row", "recommended_champion", "page_noise"]) {
      expect(summary.listed.map((line) => line.reason), reason).not.toContain(reason)
    }
  })

  it("keeps header / no_champion / no_numbers / noise IN the list, verbatim", () => {
    // These four mean "something here looked like data and did not become
    // data" — the parser did NOT recognise what they were, so only the user can
    // judge whether a champion is hiding in one. They are never rolled into a
    // number.
    const summary = summarizeSkippedLines(makeResult({ unparsedLines: mixed }))
    expect(summary.listed.map((line) => line.reason)).toEqual([
      "header",
      "no_champion",
      "no_numbers",
      "noise",
    ])
    expect(summary.listed.map((line) => line.raw)).toEqual([
      "Champion Spiele Winrate",
      "Rangliste 42",
      "Ahri",
      "Mehr anzeigen",
    ])
  })

  it("accounts for every skipped line: the four counters plus the list", () => {
    // Nothing may vanish between the parser and the panel — the summary is a
    // rollup, not a filter that quietly loses lines.
    const summary = summarizeSkippedLines(makeResult({ unparsedLines: mixed }))
    const counted =
      summary.aggregateRows + summary.matchupRows + summary.recommendedChampions + summary.pageNoise
    expect(counted + summary.listed.length).toBe(mixed.length)
  })

  it("reports hasSkipped for any skipped line at all, counted or listed", () => {
    expect(summarizeSkippedLines(makeResult({ unparsedLines: mixed })).hasSkipped).toBe(true)
    expect(
      summarizeSkippedLines(makeResult({ unparsedLines: [makeUnparsed("page_noise", "-")] }))
        .hasSkipped,
    ).toBe(true)
    expect(
      summarizeSkippedLines(makeResult({ unparsedLines: [makeUnparsed("noise", "Werbung")] }))
        .hasSkipped,
    ).toBe(true)
  })

  it("returns four zeroes, an empty list and hasSkipped false for an empty result", () => {
    const summary = summarizeSkippedLines(makeResult({ unparsedLines: [] }))
    expect(summary.aggregateRows).toBe(0)
    expect(summary.matchupRows).toBe(0)
    expect(summary.recommendedChampions).toBe(0)
    expect(summary.pageNoise).toBe(0)
    expect(summary.listed).toEqual([])
    expect(summary.hasSkipped).toBe(false)
  })

  it("applies the same rule to every layout, not only to the OP.GG copy", () => {
    // The four counted reasons only ever arise where they make sense, so an
    // ordinary tabular paste simply reports zeroes and an unchanged list. No
    // per-layout branching, and no second definition of "skipped".
    for (const layout of ALL_LAYOUTS) {
      const summary = summarizeSkippedLines(makeResult({ layout, unparsedLines: mixed }))
      expect(summary.pageNoise, layout).toBe(3)
      expect(summary.listed, layout).toHaveLength(4)
    }
  })

  it("keeps parse order and does not mutate the result it was given", () => {
    const input = mixed.map((line) => ({ ...line }))
    const result = makeResult({ unparsedLines: input })
    const summary = summarizeSkippedLines(result)
    expect(input).toEqual(mixed)
    expect(result.unparsedLines).toBe(input)
    // The listed lines appear in the order the parser produced them.
    expect(summary.listed).toEqual(
      input.filter((line) =>
        (["header", "no_champion", "no_numbers", "noise"] as string[]).includes(line.reason),
      ),
    )
  })
})

/* ==========================================================================
 * 13. The summary against real pastes
 *
 * Through the REAL `parseScoutStats`, not a hand-built result: the complaint
 * was that a genuine browser copy floods the "unrecognised lines" block with
 * dozens of entries. What has to be shown is that the block the user READS is
 * short while the counters behind it are not.
 * ========================================================================== */

describe("summarizeSkippedLines against real pastes", () => {
  /** One champion block exactly as the raw champions page prints it. */
  function block(rank: number, champion: string, wins: number, losses: number, wr: number) {
    return [String(rank), champion, champion, `${wins}S`, `${losses}N`, `${wr}%`, "2.60:1"]
  }

  /**
   * The raw champions-page copy as a user really makes it: the recommendation
   * widget above the list, the "Alle Champions" total, a `vs …` matchup
   * sub-block behind each champion, and the bare `-` the page prints between
   * them. Only Ahri, Lux and Milio are champion-pool rows.
   */
  const RAW_PAGE_COPY = [
    "Empfohlene Champions",
    "Sett",
    "-",
    "Gwen",
    "-",
    "Alle Champions",
    "128S",
    "110N",
    "54%",
    "2.90:1",
    "-",
    ...block(1, "Ahri", 36, 36, 50),
    "-",
    "vs Zed",
    "12S",
    "8N",
    "60%",
    "-",
    ...block(2, "Lux", 23, 15, 61),
    "-",
    "vs Syndra",
    "9S",
    "11N",
    "45%",
    "-",
    ...block(3, "Milio", 20, 12, 63),
    "-",
    "-",
    "-",
  ].join("\n")

  /**
   * The other realistic copy off the same site: the champion TABLE, where OP.GG
   * prints a bare `-` for every column it has no value for. That is the paste
   * that flooded the block — a dozen separator lines around five real ones.
   */
  const TABLE_COPY = [
    "Champion\tSpiele\tWinrate\tKDA",
    "-",
    "Ahri\t72\t50%\t2.6",
    "-",
    "-",
    "Lux\t38\t61%\t3.1",
    "-",
    "•",
    "Milio\t32\t63%\t4.2",
    "-",
    "|",
    "—",
    "- -",
    "Mehr anzeigen",
    "Rangliste",
    "-",
    "-",
    "-",
  ].join("\n")

  it("leaves NOTHING to list for the raw champions-page copy", () => {
    const parsed = parseScoutStats(RAW_PAGE_COPY, { role: "mid" })
    const summary = summarizeSkippedLines(parsed)

    // The fixture really is the raw layout and really did produce three rows —
    // otherwise the numbers below would be measuring something else.
    expect(isOpggRawResult(parsed)).toBe(true)
    expect(parsed.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux", "Milio"])

    // Five skipped lines, every one of them a category the parser recognised.
    expect(parsed.unparsedLines).toHaveLength(5)
    expect(summary.recommendedChampions).toBe(2)
    expect(summary.aggregateRows).toBe(1)
    expect(summary.matchupRows).toBe(2)
    expect(summary.hasSkipped).toBe(true)

    // THE POINT: the block the user reads is empty; four sentences with numbers
    // replace what used to be five verbatim entries.
    expect(summary.listed).toEqual([])
  })

  it("turns a flooded table copy into 3 listed lines behind 12 counted ones", () => {
    const parsed = parseScoutStats(TABLE_COPY, { role: "mid" })
    const summary = summarizeSkippedLines(parsed)

    expect(parsed.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux", "Milio"])
    expect(parsed.unparsedLines).toHaveLength(15)

    // The concrete numbers, not a vague "fewer": 12 separator lines counted…
    expect(summary.pageNoise).toBe(12)
    // …and exactly the three lines that still say something are listed.
    expect(summary.listed).toHaveLength(3)
    expect(summary.listed.map((line) => line.reason)).toEqual(["header", "noise", "noise"])
    expect(summary.listed.map((line) => line.raw)).toEqual([
      "Champion\tSpiele\tWinrate\tKDA",
      "Mehr anzeigen",
      "Rangliste",
    ])

    // Not one dash, bullet, pipe or em dash survives into the visible list.
    for (const raw of summary.listed.map((line) => line.raw)) {
      expect(raw, raw).toMatch(/[a-zA-Z]/)
    }
    expect(summary.listed.length).toBeLessThan(parsed.unparsedLines.length / 4)
  })

  it("still accounts for every line the parser refused, in both pastes", () => {
    // Nothing may vanish between the parser and the panel: the four counters
    // plus the visible list add up to the full skip list.
    for (const paste of [RAW_PAGE_COPY, TABLE_COPY]) {
      const parsed = parseScoutStats(paste, { role: "mid" })
      const summary = summarizeSkippedLines(parsed)
      const counted =
        summary.aggregateRows +
        summary.matchupRows +
        summary.recommendedChampions +
        summary.pageNoise
      expect(counted + summary.listed.length).toBe(parsed.unparsedLines.length)
    }
  })
})

/* ==========================================================================
 * 14. The success sentence itself
 * ========================================================================== */

describe("scout_import_applied", () => {
  it("carries the {count} placeholder in both languages", () => {
    expect(de.scout_import_applied).toContain("{count}")
    expect(en.scout_import_applied).toContain("{count}")
  })

  it("renders without leaving a raw placeholder behind", () => {
    for (const text of [de.scout_import_applied, en.scout_import_applied]) {
      const rendered = fillPlaceholders(text, { count: 3 })
      expect(rendered).toContain("3")
      expect(rendered).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })

  it("renders a zero as a zero — never as an empty gap", () => {
    const rendered = fillPlaceholders(de.scout_import_applied, { count: 0 })
    expect(rendered).toContain("0")
    expect(rendered).not.toMatch(/\{[a-zA-Z]+\}/)
  })
})

/* ==========================================================================
 * 15. The four skip sentences — which of them may name a number
 *
 * `summarizeSkippedLines()` counts matchups, recommendations and the aggregate
 * row completely, so those three sentences carry their `{count}`. `pageNoise`
 * does NOT: it only sees a separator that sits at a block-START position, while
 * the very same `-` inside a champion block, inside a `vs` block or between the
 * two name lines is consumed by the parser without ever reaching the counter —
 * a paste with 15 separator lines reported "1". Nothing is lost by that (such a
 * line carries no datum), but the sentence must not claim a quantity it does not
 * know, so `scout_import_skippedNoise` states no number at all. These tests are
 * the guard against somebody "repairing" the placeholder back in.
 * ========================================================================== */

describe("the skipped-lines sentences", () => {
  const COUNTED_SKIP_KEYS = [
    "scout_import_skippedMatchups",
    "scout_import_skippedRecommended",
  ] as const

  it("states NO number for the page-noise lines, in both languages", () => {
    for (const text of [de.scout_import_skippedNoise, en.scout_import_skippedNoise]) {
      expect(text.length).toBeGreaterThan(0)
      // Not just "no {count}": no placeholder of any name, because the panel
      // renders this one through plain t() and would print a raw brace.
      expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })

  it("keeps the aggregate sentence numberless too — there is at most one such row", () => {
    for (const text of [de.scout_import_skippedAggregate, en.scout_import_skippedAggregate]) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })

  it("keeps the {count} of the two sentences whose counters ARE complete", () => {
    for (const key of COUNTED_SKIP_KEYS) {
      expect(de[key], key).toContain("{count}")
      expect(en[key], key).toContain("{count}")
    }
  })

  it("renders the counted sentences without leaving a raw placeholder behind", () => {
    for (const key of COUNTED_SKIP_KEYS) {
      for (const text of [de[key], en[key]]) {
        const rendered = fillPlaceholders(text, { count: 7 })
        expect(rendered, key).toContain("7")
        expect(rendered, key).not.toMatch(/\{[a-zA-Z]+\}/)
      }
    }
  })

  it("uses the same placeholders in de and en for every skip sentence", () => {
    const SKIP_KEYS = [
      "scout_import_skippedTitle",
      "scout_import_skippedAggregate",
      "scout_import_skippedMatchups",
      "scout_import_skippedRecommended",
      "scout_import_skippedNoise",
      "scout_import_skippedDetails",
    ] as const

    for (const key of SKIP_KEYS) {
      const placeholders = (text: string) => [...text.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0])
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]))
      expect(de[key].length, key).toBeGreaterThan(0)
      expect(en[key].length, key).toBeGreaterThan(0)
    }
  })
})
