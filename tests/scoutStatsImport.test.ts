import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

import {
  applyImportRows,
  buildImportNote,
  detectStatsSource,
  importRowToManualEntry,
  isImportRowApplicable,
  parseScoutStats,
  resolveChampionName,
} from "../src/scout/statsImport"
import { SCOUT_IMPORT_APPLY_MODES } from "../src/scout/types"
import type {
  ManualChampionEntry,
  ScoutImportApplyMode,
  ScoutImportApplyOptions,
  ScoutImportApplyResult,
  ScoutImportRow,
  ScoutStatsImportOptions,
} from "../src/scout/types"

/* ==========================================================================
 * Every test in this file is offline and deterministic.
 *
 * `src/scout/statsImport.ts` is a pure module: no network, no wall clock, no
 * randomness, no storage (the last suite in this file asserts exactly that).
 * The same pasted string therefore always produces the same rows, the same row
 * ids and the same warnings — which is what makes these expectations exact
 * instead of "close enough".
 *
 * All pasted samples below are INVENTED. They imitate the *shape* of the four
 * scouting sites (tab-separated columns, a header row, percent signs, a KDA
 * column, thousands separators) without copying any real page content and
 * without naming any real player.
 * ========================================================================== */

const JUNGLE: ScoutStatsImportOptions = { role: "jungle" }
const SUPPORT: ScoutStatsImportOptions = { role: "support" }
const MID: ScoutStatsImportOptions = { role: "mid" }

const APPLY_JUNGLE: ScoutImportApplyOptions = {
  role: "jungle",
  source: "opgg",
  recency: "current",
  mode: "append",
}

/** Codes of every warning on the result, in result order. */
const codes = (warnings: readonly { code: string }[]): string[] =>
  warnings.map((warning) => warning.code)

const championsOf = (items: readonly { championName: string }[]): string[] =>
  items.map((item) => item.championName)

/** A fully specified row, so a test only states the field it is about. */
const makeRow = (overrides: Partial<ScoutImportRow>): ScoutImportRow => ({
  id: "row-0",
  raw: "",
  championName: "Lee Sin",
  championResolved: true,
  wins: null,
  losses: null,
  games: 10,
  winrate: 50,
  kda: null,
  csPerMin: null,
  killParticipation: null,
  damage: null,
  detectedRole: "unknown",
  roleMismatch: false,
  confidence: "medium",
  warnings: [],
  ...overrides,
})

/** A stored entry, so a test only states the fields it is about. */
const makeEntry = (overrides: Partial<ManualChampionEntry>): ManualChampionEntry => ({
  championName: "Lee Sin",
  games: 10,
  winrate: 50,
  note: "",
  source: "manual",
  recency: "current",
  role: "jungle",
  ...overrides,
})

/* ==========================================================================
 * 0b. Champion identity: names without a-z0-9 must not collapse
 *
 * A pre-existing defect, reproduced by the independent 0.7.0 review and fixed
 * here. `normalizeKey` strips everything outside `a-z0-9`, so a champion name
 * written in a non-Latin script, in fullwidth Latin or in pure punctuation
 * normalised to the EMPTY STRING. Every such name therefore compared equal to
 * every other, and the import used that comparison in three places: the
 * duplicate warning, the append-mode overwrite match, and the OP.GG
 * doubled-name pairing.
 * ========================================================================== */

describe("import champion identity — names without a-z0-9", () => {
  const KOREAN = ["아리", "야스오", "제드"] as const

  it("does not report three different champions as duplicates", () => {
    const rows = KOREAN.map((name, index) =>
      makeRow({ id: `row-${index}`, championName: name, championResolved: false }),
    )
    const result = applyImportRows([], rows, { role: "mid", mode: "append", source: "manual", recency: "current" })

    expect(result.addedRows).toBe(3)
    expect(championsOf(result.entries)).toEqual([...KOREAN])
  })

  it("keeps every non-Latin champion as its own entry", () => {
    // The destructive half: `applyImportRows` matched on the same empty key, so
    // the second row overwrote the first and the third overwrote that. Three
    // imported champions collapsed into one stored entry.
    const rows = KOREAN.map((name, index) =>
      makeRow({ id: `row-${index}`, championName: name, championResolved: false, games: 10 + index }),
    )
    const result = applyImportRows([], rows, { role: "mid", mode: "append", source: "manual", recency: "current" })

    expect(result.entries).toHaveLength(3)
    expect(result.overwrittenRows).toBe(0)
    // And the numbers stayed on the right champion.
    expect(result.entries.map((entry) => [entry.championName, entry.games])).toEqual([
      ["아리", 10],
      ["야스오", 11],
      ["제드", 12],
    ])
  })

  it("does not overwrite an existing entry with a different champion", () => {
    const existing = [makeEntry({ championName: "제드", games: 40, role: "mid" })]
    const result = applyImportRows(
      existing,
      [makeRow({ championName: "아리", championResolved: false, games: 12 })],
      { role: "mid", mode: "append", source: "manual", recency: "current" },
    )

    expect(result.overwrittenRows).toBe(0)
    expect(result.addedRows).toBe(1)
    expect(result.entries.map((entry) => [entry.championName, entry.games])).toEqual([
      ["제드", 40],
      ["아리", 12],
    ])
  })

  it("keeps fullwidth Latin apart from a non-Latin name", () => {
    const rows = [
      makeRow({ id: "a", championName: "Ａｈｒｉ", championResolved: false }),
      makeRow({ id: "b", championName: "아리", championResolved: false }),
    ]
    const result = applyImportRows([], rows, { role: "mid", mode: "append", source: "manual", recency: "current" })

    expect(result.entries).toHaveLength(2)
    expect(result.addedRows).toBe(2)
  })

  it("keeps two punctuation-only names apart", () => {
    // Unknown champion names are ALLOWED by this feature (stored verbatim with
    // an `unknown_champion` warning), so the fix is a stable key, not a new
    // rejection. Two different unusable names must still be two entries.
    const rows = [
      makeRow({ id: "a", championName: "---", championResolved: false }),
      makeRow({ id: "b", championName: "???", championResolved: false }),
    ]
    const result = applyImportRows([], rows, { role: "mid", mode: "append", source: "manual", recency: "current" })

    expect(result.entries).toHaveLength(2)
  })

  it("does not raise duplicate_champion for three different non-Latin names", () => {
    // The warning half of the defect, and the one the task names first. This
    // goes through `parseScoutStats` so `duplicateWarnings()` really runs;
    // asserting only on `applyImportRows` left that function untested.
    const paste = ["Champion\tGames\tWin Rate", "아리\t24\t62%", "야스오\t18\t55%", "제드\t12\t48%"].join(
      "\n",
    )
    const result = parseScoutStats(paste, MID)

    expect(result.rows).toHaveLength(3)
    expect(championsOf(result.rows)).toEqual(["아리", "야스오", "제드"])
    expect(codes(result.warnings)).not.toContain("duplicate_champion")
  })

  it("still raises duplicate_champion when a non-Latin name really repeats", () => {
    // Gegenprobe: the fix must not simply switch duplicate detection off for
    // these names.
    const paste = ["Champion\tGames\tWin Rate", "아리\t24\t62%", "아리\t18\t55%"].join("\n")
    const result = parseScoutStats(paste, MID)

    expect(codes(result.warnings)).toContain("duplicate_champion")
  })

  it("overwrites the SAME non-Latin champion instead of storing it twice", () => {
    // This is what catches a one-sided revert of the apply match: comparing a
    // bare lookup key against an identity key never matches, so a genuine
    // duplicate would be appended instead of replaced.
    const result = applyImportRows(
      [makeEntry({ championName: "아리", games: 40, role: "mid" })],
      [makeRow({ championName: "아리", championResolved: false, games: 12 })],
      { role: "mid", mode: "append", source: "manual", recency: "current" },
    )

    expect(result.entries).toHaveLength(1)
    expect(result.overwrittenRows).toBe(1)
    expect(result.addedRows).toBe(0)
    expect(result.entries[0].games).toBe(12)
  })

  it("still reports a real duplicate, and still overwrites it", () => {
    // Gegenprobe. Fixing the collapse must not disable duplicate detection.
    const rows = [
      makeRow({ id: "a", championName: "Kai'Sa" }),
      makeRow({ id: "b", championName: "KaiSa" }),
    ]
    const parsedDuplicate = applyImportRows([], rows, {
      role: "bot",
      mode: "append",
      source: "manual",
      recency: "current",
    })

    // One champion, so the second row overwrites the first.
    expect(parsedDuplicate.entries).toHaveLength(1)
    expect(parsedDuplicate.overwrittenRows).toBe(1)
  })

  it("still canonicalises the ASCII spellings 0.7.0 merged", () => {
    for (const [a, b] of [
      ["Kai'Sa", "KaiSa"],
      ["Lee Sin", "LeeSin"],
      ["kaisa", "KAI SA"],
    ] as const) {
      const result = applyImportRows(
        [makeEntry({ championName: a, games: 40, role: "mid" })],
        [makeRow({ championName: b, games: 12 })],
        { role: "mid", mode: "append", source: "manual", recency: "current" },
      )
      expect(result.entries, `${a} / ${b}`).toHaveLength(1)
      expect(result.overwrittenRows, `${a} / ${b}`).toBe(1)
    }
  })
})

/* ==========================================================================
 * 1. Tab separated table with a recognised header (OP.GG-shaped)
 * ========================================================================== */

describe("parseScoutStats — tab separated table with a header", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA",
    "Lee Sin\t24\t62%\t3.1",
    "Viego\t18\t55.5%\t2.8",
    "Karma\t6\t50%\t4.0",
  ].join("\n")

  it("reads every data line and reports the layout as tabular_with_header", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.layout).toBe("tabular_with_header")
    expect(result.rows).toHaveLength(3)
    expect(result.rows.map((row) => row.championName)).toEqual(["Lee Sin", "Viego", "Karma"])
  })

  it("maps the four header columns in the canonical column order", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.columns).toEqual(["champion", "games", "winrate", "kda"])
  })

  it("extracts the values of the first row exactly", () => {
    const result = parseScoutStats(PASTE, JUNGLE)
    const row = result.rows[0]

    expect(row.id).toBe("row-0")
    expect(row.raw).toBe("Lee Sin\t24\t62%\t3.1")
    expect(row.championResolved).toBe(true)
    expect(row.games).toBe(24)
    expect(row.winrate).toBe(62)
    expect(row.kda).toBeCloseTo(3.1, 5)
    expect(row.csPerMin).toBeNull()
    expect(row.killParticipation).toBeNull()
    expect(row.damage).toBeNull()
    expect(row.detectedRole).toBe("unknown")
    expect(row.roleMismatch).toBe(false)
    expect(row.confidence).toBe("high")
    expect(row.warnings).toEqual([])
  })

  it("keeps the header line as an unparsed line with reason header", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.unparsedLines).toEqual([
      { raw: "Champion\tGames\tWin Rate\tKDA", reason: "header" },
    ])
  })

  it("emits no warning at all for a clean table", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.warnings).toEqual([])
    expect(result.confidence).toBe("high")
  })

  it("gives every row a deterministic row-<index> id", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows.map((row) => row.id)).toEqual(["row-0", "row-1", "row-2"])
  })
})

/* ==========================================================================
 * 2. Different column order (League-of-Graphs-shaped)
 * ========================================================================== */

describe("parseScoutStats — header driven mapping, not position", () => {
  const PASTE = [
    "Champion\tWinrate\tGames\tKDA",
    "Twisted Fate\t61%\t33\t3.4",
    "Karma\t48%\t12\t2.1",
  ].join("\n")

  it("does not swap games and winrate when the source orders them differently", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.layout).toBe("tabular_with_header")
    expect(result.rows[0].championName).toBe("Twisted Fate")
    expect(result.rows[0].games).toBe(33)
    expect(result.rows[0].winrate).toBe(61)
    expect(result.rows[1].games).toBe(12)
    expect(result.rows[1].winrate).toBe(48)
  })

  it("still reports the columns in the canonical order, not the pasted one", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.columns).toEqual(["champion", "games", "winrate", "kda"])
  })
})

/* ==========================================================================
 * 3. CS/min and KP columns (DeepLoL-shaped)
 * ========================================================================== */

describe("parseScoutStats — CS/min and kill participation columns", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA\tCS/min\tKP",
    "Kai'Sa\t41\t57%\t3.9\t8.4\t64%",
    "Jarvan IV\t15\t60%\t3.2\t5.9\t71%",
  ].join("\n")

  it("maps both extra columns and keeps their units apart", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.columns).toEqual([
      "champion",
      "games",
      "winrate",
      "kda",
      "csPerMin",
      "killParticipation",
    ])
    expect(result.rows[0].csPerMin).toBeCloseTo(8.4, 5)
    expect(result.rows[0].killParticipation).toBe(64)
    expect(result.rows[1].csPerMin).toBeCloseTo(5.9, 5)
    expect(result.rows[1].killParticipation).toBe(71)
  })

  it("does not put a CS/min value into the winrate field", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].winrate).toBe(57)
    expect(result.rows[1].winrate).toBe(60)
  })

  it("reports an absolute CS column as found but never converts it", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tCS", "Karma\t9\t55%\t212"].join("\n"),
      SUPPORT,
    )

    expect(result.columns).toContain("cs")
    // `cs` has no home on ScoutImportRow — converting 212 CS into a per-minute
    // rate would need a game length nobody pasted.
    expect(result.rows[0].csPerMin).toBeNull()
  })
})

/* ==========================================================================
 * 4. Damage column with thousands separators (DPM-shaped)
 * ========================================================================== */

describe("parseScoutStats — damage column", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA\tDPM",
    "Ahri\t31\t58%\t3.4\t21,345",
    "Zed\t12\t50%\t2.6\t1.234",
  ].join("\n")

  it("maps a DPM header onto the damage column", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.columns).toContain("damage")
  })

  it("reads thousands separators in both notations", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].damage).toBe(21345)
    expect(result.rows[1].damage).toBe(1234)
  })

  it("does not mistake the damage figure for a games count", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].games).toBe(31)
    expect(result.rows[1].games).toBe(12)
  })
})

/* ==========================================================================
 * 5. Loose lines without any header
 * ========================================================================== */

describe("parseScoutStats — loose lines", () => {
  const PASTE = ["Lee Sin 24 62% 3.1", "Viego 18 55% 2.8", "Karma 6 50%"].join("\n")

  it("recognises the loose layout and says out loud that columns were guessed", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.layout).toBe("loose_lines")
    expect(result.columns).toEqual([])
    expect(codes(result.warnings)).toContain("columns_guessed")
  })

  it("assigns games, winrate and kda by value shape", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].games).toBe(24)
    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[0].kda).toBeCloseTo(3.1, 5)
    expect(result.rows[1].games).toBe(18)
    expect(result.rows[1].winrate).toBe(55)
    expect(result.rows[1].kda).toBeCloseTo(2.8, 5)
  })

  it("leaves a missing kda null instead of carrying the neighbour value over", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[2].championName).toBe("Karma")
    expect(result.rows[2].games).toBe(6)
    expect(result.rows[2].winrate).toBe(50)
    expect(result.rows[2].kda).toBeNull()
  })

  it("caps a guessed row at medium confidence", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows.map((row) => row.confidence)).toEqual(["medium", "medium", "medium"])
    expect(result.confidence).toBe("medium")
  })

  it("understands a games suffix instead of a bare number", () => {
    const result = parseScoutStats(
      ["Karma 34 games 61%", "Lulu 12 Spiele 58%", "Nami 9G 44%"].join("\n"),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.games)).toEqual([34, 12, 9])
    expect(result.rows.map((row) => row.winrate)).toEqual([61, 58, 44])
  })
})

/* ==========================================================================
 * 6. Percent notations
 * ========================================================================== */

describe("parseScoutStats — percent notations", () => {
  it("accepts a percent sign with and without a space and with decimals", () => {
    const result = parseScoutStats(
      ["Ahri 20 62 % 3.1", "Zed 15 58.5% 2.4", "Sett 9 47,5 % 1.9"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[1].winrate).toBeCloseTo(58.5, 5)
    expect(result.rows[2].winrate).toBeCloseTo(47.5, 5)
  })

  it("reads a second percent value as kill participation", () => {
    const result = parseScoutStats("Ahri 20 62% 3.4 64%", JUNGLE)

    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[0].killParticipation).toBe(64)
  })

  it("accepts a winrate without a percent sign when the header says so", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Ahri\t20\t62"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].winrate).toBe(62)
  })
})

/* ==========================================================================
 * 7. Decimal comma and thousands separators
 * ========================================================================== */

describe("parseScoutStats — number formats", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA\tDamage",
    "Viego\t18\t55%\t2,8\t21,345",
    "Zed\t9\t50%\t3.1\t1.234",
  ].join("\n")

  it("reads a comma as a decimal separator when one or two digits follow", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].kda).toBeCloseTo(2.8, 5)
    expect(result.rows[1].kda).toBeCloseTo(3.1, 5)
  })

  it("reads a separator with exactly three following digits as a thousands separator", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].damage).toBe(21345)
    expect(result.rows[1].damage).toBe(1234)
  })

  it("treats four following digits as decimals again", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tCS/min", "Ahri\t20\t60%\t7.1416"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].csPerMin).toBeCloseTo(7.1416, 5)
  })

  it("treats all but the last separator as thousands separators", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tDamage", "Ahri\t20\t60%\t1.234,56"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].damage).toBeCloseTo(1234.56, 5)
  })
})

/* ==========================================================================
 * 8. KDA notations
 * ========================================================================== */

describe("parseScoutStats — kda notations", () => {
  it("computes (K + A) / D from the triple notation", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tKDA", "Ahri\t20\t60%\t5.2/3.1/8.4"].join("\n"),
      JUNGLE,
    )

    // (5.2 + 8.4) / 3.1 = 13.6 / 3.1 = 4.387...
    expect(result.rows[0].kda).toBeCloseTo(4.39, 2)
  })

  it("treats zero deaths as a perfect KDA instead of dividing by zero", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tKDA", "Zed\t10\t55%\t4/0/6"].join("\n"),
      JUNGLE,
    )

    // (4 + 6) / max(0, 1) = 10 — finite, never Infinity, never NaN.
    expect(result.rows[0].kda).toBe(10)
    expect(Number.isFinite(result.rows[0].kda ?? Number.NaN)).toBe(true)
  })

  it("accepts the spaced triple notation in loose text", () => {
    const result = parseScoutStats("Ahri 20 60% 5.2 / 3.1 / 8.4", JUNGLE)

    expect(result.rows[0].kda).toBeCloseTo(4.39, 2)
    expect(result.rows[0].games).toBe(20)
  })

  it("accepts the x:1 ratio notation", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tKDA", "Ahri\t20\t60%\t3.1:1", "Zed\t8\t50%\t2.87:1"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].kda).toBeCloseTo(3.1, 5)
    expect(result.rows[1].kda).toBeCloseTo(2.87, 5)
  })
})

/* ==========================================================================
 * 9. Unreadable header
 * ========================================================================== */

describe("parseScoutStats — header that cannot be mapped", () => {
  const PASTE = ["Pick\tCount\tSuccess\tRatio", "Lee Sin\t24\t62%\t3.1", "Viego\t18\t55%\t2.8"].join(
    "\n",
  )

  it("says the header was not understood and keeps parsing", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(codes(result.warnings)).toContain("header_not_recognized")
    expect(codes(result.warnings)).toContain("columns_guessed")
    expect(result.layout).toBe("tabular_no_header")
    expect(result.columns).toEqual([])
  })

  it("still extracts the rows behind the unknown header", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].championName).toBe("Lee Sin")
    expect(result.rows[0].games).toBe(24)
    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[0].kda).toBeCloseTo(3.1, 5)
  })

  it("keeps the unreadable header line as an unparsed header line", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.unparsedLines).toEqual([{ raw: "Pick\tCount\tSuccess\tRatio", reason: "header" }])
  })
})

/* ==========================================================================
 * 10. Empty input
 * ========================================================================== */

describe("parseScoutStats — empty input", () => {
  it("reports empty_input for an empty string", () => {
    const result = parseScoutStats("", JUNGLE)

    expect(result.rows).toEqual([])
    expect(result.unparsedLines).toEqual([])
    expect(result.layout).toBe("unrecognized")
    expect(result.columns).toEqual([])
    expect(result.confidence).toBe("none")
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe("empty_input")
    expect(result.warnings[0].severity).toBe("info")
  })

  it("reports empty_input for whitespace only, without throwing", () => {
    const result = parseScoutStats("   \n\t\n  \r\n ", JUNGLE)

    expect(result.rows).toEqual([])
    expect(codes(result.warnings)).toEqual(["empty_input"])
  })

  it("reports no_rows_detected when there was text but no row", () => {
    const result = parseScoutStats("Show more\nLoad more results", JUNGLE)

    expect(result.rows).toEqual([])
    expect(result.layout).toBe("unrecognized")
    expect(codes(result.warnings)).toContain("no_rows_detected")
    expect(result.unparsedLines).toHaveLength(2)
  })
})

/* ==========================================================================
 * 11. Lines that produce no row
 * ========================================================================== */

describe("parseScoutStats — unparsed lines", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate",
    "Lee Sin\t24\t62%",
    "Show more",
    "Viego\t18\t55%",
  ].join("\n")

  it("keeps copied navigation chrome as noise and keeps the real rows", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows.map((row) => row.championName)).toEqual(["Lee Sin", "Viego"])
    expect(result.unparsedLines).toEqual([
      { raw: "Champion\tGames\tWin Rate", reason: "header" },
      { raw: "Show more", reason: "noise" },
    ])
  })

  it("adds row_not_parsed once a real line could not be read", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(codes(result.warnings)).toContain("row_not_parsed")
  })

  it("does not add row_not_parsed when only the header was skipped", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Lee Sin\t24\t62%"].join("\n"),
      JUNGLE,
    )

    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("separates a champion without numbers from text without a champion", () => {
    const result = parseScoutStats("Lee Sin\nfilter by queue", JUNGLE)

    expect(result.unparsedLines).toEqual([
      { raw: "Lee Sin", reason: "no_numbers" },
      { raw: "filter by queue", reason: "noise" },
    ])
  })

  it("reports a line whose champion column is empty as no_champion", () => {
    // The leading tab is gone once the line is trimmed, so the champion cell of
    // this line is the bare number 18 — a rank index with nothing behind it.
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "\t18\t55%", "Viego\t18\t55%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.unparsedLines).toContainEqual({ raw: "18\t55%", reason: "no_champion" })
  })

  it("accounts for every non-empty line either as a row or as an unparsed line", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows.length + result.unparsedLines.length).toBe(4)
  })
})

/* ==========================================================================
 * 12. Champion name resolution
 * ========================================================================== */

describe("resolveChampionName", () => {
  it("resolves names with spaces, dots, apostrophes and ampersands", () => {
    expect(resolveChampionName("Lee Sin")).toEqual({ name: "Lee Sin", resolved: true })
    expect(resolveChampionName("Twisted Fate")).toEqual({ name: "Twisted Fate", resolved: true })
    expect(resolveChampionName("Jarvan IV")).toEqual({ name: "Jarvan IV", resolved: true })
    expect(resolveChampionName("Dr. Mundo")).toEqual({ name: "Dr. Mundo", resolved: true })
    expect(resolveChampionName("Nunu & Willump")).toEqual({
      name: "Nunu & Willump",
      resolved: true,
    })
  })

  it("normalises punctuation and case to the catalog spelling", () => {
    expect(resolveChampionName("kaisa")).toEqual({ name: "Kai'Sa", resolved: true })
    expect(resolveChampionName("Kai'sa")).toEqual({ name: "Kai'Sa", resolved: true })
    expect(resolveChampionName("KSANTE")).toEqual({ name: "K'Sante", resolved: true })
    expect(resolveChampionName("leblanc")).toEqual({ name: "LeBlanc", resolved: true })
    expect(resolveChampionName("  wukong  ")).toEqual({ name: "Wukong", resolved: true })
    expect(resolveChampionName("renata glasc")).toEqual({ name: "Renata Glasc", resolved: true })
  })

  it("returns the trimmed input unresolved instead of guessing a near match", () => {
    expect(resolveChampionName("  Zzzfake ")).toEqual({ name: "Zzzfake", resolved: false })
    // One letter away from "Ahri" — a fuzzy match here would silently invent data.
    expect(resolveChampionName("Ahrii")).toEqual({ name: "Ahrii", resolved: false })
    expect(resolveChampionName("")).toEqual({ name: "", resolved: false })
  })
})

describe("parseScoutStats — champion names inside a paste", () => {
  it("keeps multi-word champion names together and writes them canonically", () => {
    const result = parseScoutStats(
      [
        "Lee Sin 24 62%",
        "Twisted Fate 18 55%",
        "Jarvan IV 12 50%",
        "Dr. Mundo 9 44%",
        "Nunu & Willump 7 57%",
        "kaisa 30 61%",
      ].join("\n"),
      JUNGLE,
    )

    expect(result.rows.map((row) => row.championName)).toEqual([
      "Lee Sin",
      "Twisted Fate",
      "Jarvan IV",
      "Dr. Mundo",
      "Nunu & Willump",
      "Kai'Sa",
    ])
    expect(result.rows.every((row) => row.championResolved)).toBe(true)
  })
})

/* ==========================================================================
 * 13. Unknown champion
 * ========================================================================== */

describe("parseScoutStats — unknown champion", () => {
  const PASTE = ["Champion\tGames\tWin Rate", "Zzzfake\t24\t62%"].join("\n")

  it("keeps the row, keeps the pasted spelling and flags it", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].championName).toBe("Zzzfake")
    expect(result.rows[0].championResolved).toBe(false)
    expect(codes(result.rows[0].warnings)).toContain("unknown_champion")
  })

  it("names the champion in the warning params and anchors it to the row", () => {
    const result = parseScoutStats(PASTE, JUNGLE)
    const warning = result.warnings.find((entry) => entry.code === "unknown_champion")

    expect(warning?.params?.champion).toBe("Zzzfake")
    expect(warning?.rowIndex).toBe(0)
    expect(warning?.severity).toBe("warning")
  })

  it("caps an unresolved row at low confidence even with complete numbers", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].confidence).toBe("low")
    expect(result.confidence).toBe("low")
  })
})

/* ==========================================================================
 * 14. Leading rank index
 * ========================================================================== */

describe("parseScoutStats — leading rank index", () => {
  it("drops a leading rank number when a champion follows it", () => {
    const result = parseScoutStats(["1 Lee Sin 24 62%", "2 Viego 18 55%"].join("\n"), JUNGLE)

    expect(result.rows.map((row) => row.championName)).toEqual(["Lee Sin", "Viego"])
    expect(result.rows[0].games).toBe(24)
    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[1].games).toBe(18)
  })

  it("drops a leading rank index inside a champion cell too", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "1 Lee Sin\t24\t62%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].championName).toBe("Lee Sin")
    expect(result.rows[0].games).toBe(24)
  })

  it("does not eat a leading number when no champion follows it", () => {
    const result = parseScoutStats("12 34 56", JUNGLE)

    expect(result.rows).toEqual([])
    expect(result.unparsedLines).toEqual([{ raw: "12 34 56", reason: "no_champion" }])
  })
})

/* ==========================================================================
 * 15. Role column and role mismatch
 * ========================================================================== */

describe("parseScoutStats — role detection", () => {
  const PASTE = ["Champion\tRole\tGames\tWin Rate", "Karma\tSupport\t22\t61%"].join("\n")

  it("reads the role column and reports the conflict with the selected role", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.columns).toEqual(["champion", "games", "winrate", "role"])
    expect(result.rows[0].detectedRole).toBe("support")
    expect(result.rows[0].roleMismatch).toBe(true)
    expect(codes(result.rows[0].warnings)).toContain("role_mismatch")
  })

  it("puts both roles into the warning params", () => {
    const result = parseScoutStats(PASTE, JUNGLE)
    const warning = result.warnings.find((entry) => entry.code === "role_mismatch")

    expect(warning?.params).toEqual({ detectedRole: "support", selectedRole: "jungle" })
  })

  it("caps a conflicting row at medium confidence", () => {
    const result = parseScoutStats(PASTE, JUNGLE)

    expect(result.rows[0].confidence).toBe("medium")
  })

  it("never lets the source overwrite the role the user selected", () => {
    const result = parseScoutStats(PASTE, JUNGLE)
    const entry = importRowToManualEntry(result.rows[0], APPLY_JUNGLE)

    expect(entry).not.toBeNull()
    expect(entry?.role).toBe("jungle")
    expect(entry?.championName).toBe("Karma")
  })

  it("reports no mismatch when the role column agrees with the selection", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows[0].detectedRole).toBe("support")
    expect(result.rows[0].roleMismatch).toBe(false)
    expect(codes(result.warnings)).not.toContain("role_mismatch")
    expect(result.rows[0].confidence).toBe("high")
  })

  it("leaves the role unknown when the text says nothing about it", () => {
    const result = parseScoutStats("Lee Sin 24 62%", JUNGLE)

    expect(result.rows[0].detectedRole).toBe("unknown")
    expect(result.rows[0].roleMismatch).toBe(false)
  })

  it("reads a single unambiguous role word out of loose text", () => {
    const result = parseScoutStats("Karma Support 22 61%", JUNGLE)

    expect(result.rows[0].championName).toBe("Karma")
    expect(result.rows[0].detectedRole).toBe("support")
    expect(result.rows[0].roleMismatch).toBe(true)
  })
})

/* ==========================================================================
 * 16. Applicability and out-of-range values
 * ========================================================================== */

describe("isImportRowApplicable", () => {
  it("accepts a row with a champion, games and a winrate in range", () => {
    expect(isImportRowApplicable(makeRow({}))).toBe(true)
    expect(isImportRowApplicable(makeRow({ games: 0, winrate: 0 }))).toBe(true)
    expect(isImportRowApplicable(makeRow({ winrate: 100 }))).toBe(true)
  })

  it("rejects a row that storage would silently drop on the next load", () => {
    expect(isImportRowApplicable(makeRow({ games: null }))).toBe(false)
    expect(isImportRowApplicable(makeRow({ winrate: null }))).toBe(false)
    expect(isImportRowApplicable(makeRow({ games: -1 }))).toBe(false)
    expect(isImportRowApplicable(makeRow({ winrate: 101 }))).toBe(false)
    expect(isImportRowApplicable(makeRow({ winrate: -0.5 }))).toBe(false)
    expect(isImportRowApplicable(makeRow({ championName: "   " }))).toBe(false)
  })

  it("does not block a row only because the champion did not resolve", () => {
    expect(isImportRowApplicable(makeRow({ championName: "Zzzfake", championResolved: false }))).toBe(
      true,
    )
  })
})

describe("parseScoutStats — missing and impossible values", () => {
  it("flags a missing winrate and a missing games value per row", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Ahri\t12", "Zed\t\t55%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].winrate).toBeNull()
    expect(codes(result.rows[0].warnings)).toContain("missing_winrate")
    expect(result.rows[0].warnings[0].params?.champion).toBe("Ahri")
    expect(result.rows[1].games).toBeNull()
    expect(codes(result.rows[1].warnings)).toContain("missing_games")
    expect(isImportRowApplicable(result.rows[0])).toBe(false)
    expect(isImportRowApplicable(result.rows[1])).toBe(false)
  })

  it("gives a row with one of the two values low confidence and none without both", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tKDA", "Ahri\t12", "Zed\t\t\t2.4"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].confidence).toBe("low")
    expect(result.rows[1].confidence).toBe("none")
    expect(result.confidence).toBe("none")
  })

  it("nulls an impossible winrate and reports it instead of clamping", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Sett\t12\t101%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].winrate).toBeNull()
    expect(codes(result.rows[0].warnings)).toContain("value_out_of_range")
    expect(isImportRowApplicable(result.rows[0])).toBe(false)
  })

  it("nulls a negative games count and reports it", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Yone\t-3\t55%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].games).toBeNull()
    expect(codes(result.rows[0].warnings)).toContain("value_out_of_range")
    expect(isImportRowApplicable(result.rows[0])).toBe(false)
  })

  it("nulls a kill participation above 100 percent", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate\tKP", "Ahri\t12\t55%\t140%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows[0].killParticipation).toBeNull()
    expect(codes(result.rows[0].warnings)).toContain("value_out_of_range")
    // The row itself stays applicable — KP is a review aid, not stored data.
    expect(isImportRowApplicable(result.rows[0])).toBe(true)
  })
})

/* ==========================================================================
 * Duplicate champions and source mismatch
 * ========================================================================== */

describe("parseScoutStats — duplicates and provenance", () => {
  it("reports a duplicated champion once and keeps both rows", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Ahri\t12\t55%", "ahri\t8\t62%", "Zed\t4\t50%"].join("\n"),
      JUNGLE,
    )

    expect(result.rows).toHaveLength(3)
    const duplicates = result.warnings.filter((entry) => entry.code === "duplicate_champion")
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].params?.champion).toBe("Ahri")
    expect(duplicates[0].severity).toBe("warning")
  })

  it("reports a disagreement between the detected and the selected source", () => {
    const result = parseScoutStats(
      ["https://www.op.gg/summoners/euw/Testname-EUW", "Ahri\t12\t55%"].join("\n"),
      { role: "jungle", source: "deeplol" },
    )

    const warning = result.warnings.find((entry) => entry.code === "source_mismatch")
    expect(warning?.severity).toBe("info")
    expect(warning?.params).toEqual({ detected: "opgg", selected: "deeplol" })
  })

  it("stays silent when the user made no claim about the source", () => {
    const result = parseScoutStats(
      ["https://www.op.gg/summoners/euw/Testname-EUW", "Ahri\t12\t55%"].join("\n"),
      JUNGLE,
    )

    expect(result.detectedSource).toBe("opgg")
    expect(codes(result.warnings)).not.toContain("source_mismatch")
  })
})

/* ==========================================================================
 * 17. applyImportRows
 * ========================================================================== */

describe("applyImportRows", () => {
  /* ------------------------------------------------------------------------
   * On the five counters, and why every test below states more than one:
   *
   * `overwrittenRows` and `removedExistingRows` are the two halves of the old,
   * ambiguous `replaced` field — "an entry was overwritten in place" (append)
   * versus "an existing entry was DELETED" (replace). Each is structurally 0 in
   * the other mode, so a test that asserts only the non-zero one would still
   * pass if the two were swapped. Every test therefore pins the mode's zero
   * counter as well, which makes the asymmetry visible instead of merely
   * documented. See the JSDoc of `ScoutImportApplyResult` in src/scout/types.ts.
   * ---------------------------------------------------------------------- */

  /** The five counters as one object, so a test can state the whole outcome. */
  const counters = (result: ScoutImportApplyResult) => ({
    importedRows: result.importedRows,
    addedRows: result.addedRows,
    overwrittenRows: result.overwrittenRows,
    removedExistingRows: result.removedExistingRows,
    skippedRows: result.skippedRows,
  })

  it("appends a champion the player does not have yet", () => {
    const existing = [makeEntry({ championName: "Lee Sin", role: "jungle" })]
    const result = applyImportRows(existing, [makeRow({ championName: "Viego", games: 18 })], {
      ...APPLY_JUNGLE,
      mode: "append",
    })

    expect(result.importedRows).toBe(1)
    expect(result.addedRows).toBe(1)
    expect(result.overwrittenRows).toBe(0)
    // `append` never deletes: structurally 0 in this mode.
    expect(result.removedExistingRows).toBe(0)
    expect(result.skippedRows).toBe(0)
    expect(result.entries.map((entry) => entry.championName)).toEqual(["Lee Sin", "Viego"])
    expect(result.entries[1].role).toBe("jungle")
    expect(result.entries[1].source).toBe("opgg")
    expect(result.entries[1].recency).toBe("current")
  })

  it("replaces an existing champion of the same role in place instead of duplicating it", () => {
    const existing = [
      makeEntry({ championName: "Lee Sin", role: "jungle", games: 5, winrate: 40 }),
      makeEntry({ championName: "Ahri", role: "mid" }),
    ]
    const result = applyImportRows(
      existing,
      [makeRow({ championName: "Lee Sin", games: 24, winrate: 62 })],
      { ...APPLY_JUNGLE, mode: "append" },
    )

    expect(result.importedRows).toBe(1)
    expect(result.addedRows).toBe(0)
    // append → an in-place overwrite, NOT a deletion.
    expect(result.overwrittenRows).toBe(1)
    expect(result.removedExistingRows).toBe(0)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].championName).toBe("Lee Sin")
    expect(result.entries[0].games).toBe(24)
    expect(result.entries[0].winrate).toBe(62)
    expect(result.entries[1].championName).toBe("Ahri")
  })

  it("matches an existing champion regardless of its pasted spelling", () => {
    const existing = [makeEntry({ championName: "Kai'Sa", role: "bot", games: 3 })]
    const result = applyImportRows(existing, [makeRow({ championName: "kaisa", games: 30 })], {
      ...APPLY_JUNGLE,
      role: "bot",
      mode: "append",
    })

    expect(result.importedRows).toBe(1)
    expect(result.overwrittenRows).toBe(1)
    expect(result.removedExistingRows).toBe(0)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].games).toBe(30)
  })

  it("keeps the same champion when it belongs to another role", () => {
    const existing = [makeEntry({ championName: "Karma", role: "support", games: 40 })]
    const result = applyImportRows(existing, [makeRow({ championName: "Karma", games: 9 })], {
      ...APPLY_JUNGLE,
      mode: "append",
    })

    expect(result.importedRows).toBe(1)
    expect(result.addedRows).toBe(1)
    // The role differs, so there was nothing to overwrite — and append deletes
    // nothing either.
    expect(result.overwrittenRows).toBe(0)
    expect(result.removedExistingRows).toBe(0)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].role).toBe("support")
    expect(result.entries[0].games).toBe(40)
    expect(result.entries[1].role).toBe("jungle")
    expect(result.entries[1].games).toBe(9)
  })

  it("replace mode removes only the rows of the imported role", () => {
    const existing = [
      makeEntry({ championName: "Lee Sin", role: "jungle" }),
      makeEntry({ championName: "Ahri", role: "mid" }),
      makeEntry({ championName: "Viego", role: "jungle" }),
      makeEntry({ championName: "Karma", role: "unknown" }),
    ]
    const result = applyImportRows(existing, [makeRow({ championName: "Elise", games: 11 })], {
      ...APPLY_JUNGLE,
      mode: "replace",
    })

    // replace → the two jungle rows are DELETED, which is not an import: they
    // stay out of `importedRows` (the "72 rows" bug in miniature).
    expect(result.removedExistingRows).toBe(2)
    expect(result.importedRows).toBe(1)
    expect(result.addedRows).toBe(1)
    // The role was cleared first, so nothing was left to overwrite in place.
    expect(result.overwrittenRows).toBe(0)
    expect(result.skippedRows).toBe(0)
    expect(result.entries.map((entry) => entry.championName)).toEqual(["Ahri", "Karma", "Elise"])
  })

  it("counts rows that cannot become entries as skipped", () => {
    const existing = [makeEntry({ championName: "Lee Sin", role: "jungle" })]
    const result = applyImportRows(
      existing,
      [
        makeRow({ championName: "Viego", games: null }),
        makeRow({ championName: "Elise", winrate: null }),
        makeRow({ championName: "Nidalee", games: 7, winrate: 57 }),
      ],
      { ...APPLY_JUNGLE, mode: "append" },
    )

    expect(result.skippedRows).toBe(2)
    expect(result.importedRows).toBe(1)
    expect(result.addedRows).toBe(1)
    expect(result.overwrittenRows).toBe(0)
    expect(result.removedExistingRows).toBe(0)
    expect(result.entries.map((entry) => entry.championName)).toEqual(["Lee Sin", "Nidalee"])
  })

  it("never mutates the entries it was given", () => {
    const existing = [
      makeEntry({ championName: "Lee Sin", role: "jungle", games: 5 }),
      makeEntry({ championName: "Ahri", role: "mid" }),
    ]
    const snapshot = JSON.stringify(existing)

    applyImportRows(existing, [makeRow({ championName: "Lee Sin", games: 24 })], {
      ...APPLY_JUNGLE,
      mode: "append",
    })
    applyImportRows(existing, [makeRow({ championName: "Elise", games: 24 })], {
      ...APPLY_JUNGLE,
      mode: "replace",
    })

    expect(JSON.stringify(existing)).toBe(snapshot)
    expect(existing).toHaveLength(2)
  })

  it("floors a fractional games value so the stored row stays an integer", () => {
    const result = applyImportRows([], [makeRow({ championName: "Elise", games: 11.8 })], {
      ...APPLY_JUNGLE,
      mode: "append",
    })

    expect(result.entries[0].games).toBe(11)
  })

  /* ========================================================================
   * 17b. The counters themselves — one full tuple per scenario.
   * ====================================================================== */

  describe("counter semantics", () => {
    it("reports a single new append as exactly one added import", () => {
      const result = applyImportRows(
        [],
        [makeRow({ championName: "Elise", games: 11, winrate: 48 })],
        { ...APPLY_JUNGLE, mode: "append" },
      )

      expect(counters(result)).toEqual({
        importedRows: 1,
        addedRows: 1,
        overwrittenRows: 0,
        removedExistingRows: 0,
        skippedRows: 0,
      })
      expect(result.entries).toHaveLength(1)
    })

    it("reports an append onto an existing champion+role as an overwrite, not an add", () => {
      const existing = [makeEntry({ championName: "Elise", role: "jungle", games: 4, winrate: 25 })]
      const result = applyImportRows(
        existing,
        [makeRow({ championName: "Elise", games: 11, winrate: 48 })],
        { ...APPLY_JUNGLE, mode: "append" },
      )

      expect(counters(result)).toEqual({
        importedRows: 1,
        addedRows: 0,
        overwrittenRows: 1,
        // The old row was overwritten, never deleted — `append` cannot delete.
        removedExistingRows: 0,
        skippedRows: 0,
      })
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].games).toBe(11)
    })

    it("counts deleted existing rows apart from the imported ones in replace mode", () => {
      // Five existing rows against two imported ones — deliberately DIFFERENT
      // numbers, so a swap of `removedExistingRows` and `importedRows` cannot
      // slip through unnoticed. Summing them would announce "7 rows applied"
      // for the 2 rows that were actually stored.
      const existing = [
        makeEntry({ championName: "Lee Sin", role: "jungle" }),
        makeEntry({ championName: "Viego", role: "jungle" }),
        makeEntry({ championName: "Elise", role: "jungle" }),
        makeEntry({ championName: "Nidalee", role: "jungle" }),
        makeEntry({ championName: "Kha'Zix", role: "jungle" }),
      ]
      const rows = [
        makeRow({ championName: "Graves", games: 12, winrate: 58 }),
        makeRow({ championName: "Maokai", games: 9, winrate: 44 }),
      ]
      const result = applyImportRows(existing, rows, { ...APPLY_JUNGLE, mode: "replace" })

      expect(counters(result)).toEqual({
        importedRows: 2,
        addedRows: 2,
        overwrittenRows: 0,
        removedExistingRows: 5,
        skippedRows: 0,
      })
      expect(result.entries.map((entry) => entry.championName)).toEqual(["Graves", "Maokai"])
    })

    it("lowers importedRows by exactly the number of unapplicable rows, in both modes", () => {
      const rows = [
        makeRow({ championName: "Viego", games: null }),
        makeRow({ championName: "Elise", winrate: null }),
        makeRow({ championName: "Nidalee", games: 7, winrate: 57 }),
      ]

      for (const mode of SCOUT_IMPORT_APPLY_MODES) {
        const result = applyImportRows([], rows, { ...APPLY_JUNGLE, mode })

        expect(result.skippedRows, mode).toBe(2)
        expect(result.importedRows, mode).toBe(rows.length - result.skippedRows)
        expect(result.importedRows, mode).toBe(1)
        expect(
          result.entries.map((entry) => entry.championName),
          mode,
        ).toEqual(["Nidalee"])
      }
    })

    it("merges a champion listed twice in one paste into a single entry in append mode", () => {
      // EXISTING BEHAVIOUR, deliberately NOT changed by the counter rename: the
      // second row finds the entry the first one just created and overwrites it,
      // so TWO imported rows leave ONE entry behind.
      const result = applyImportRows(
        [],
        [
          makeRow({ championName: "Viego", games: 18, winrate: 52 }),
          makeRow({ championName: "Viego", games: 25, winrate: 61 }),
        ],
        { ...APPLY_JUNGLE, mode: "append" },
      )

      expect(counters(result)).toEqual({
        importedRows: 2,
        addedRows: 1,
        overwrittenRows: 1,
        removedExistingRows: 0,
        skippedRows: 0,
      })
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].games).toBe(25)
      expect(result.entries[0].winrate).toBe(61)
    })

    it("keeps a champion listed twice in one paste as two entries in replace mode", () => {
      // The mirror image of the test above, and the documented asymmetry: the
      // role is cleared FIRST, so nothing is left to overwrite and both rows are
      // appended. Also existing behaviour that this cleanup does not touch — if
      // it ever changes, that is a product decision, not a rename.
      const result = applyImportRows(
        [],
        [
          makeRow({ championName: "Viego", games: 18, winrate: 52 }),
          makeRow({ championName: "Viego", games: 25, winrate: 61 }),
        ],
        { ...APPLY_JUNGLE, mode: "replace" },
      )

      expect(counters(result)).toEqual({
        importedRows: 2,
        addedRows: 2,
        overwrittenRows: 0,
        removedExistingRows: 0,
        skippedRows: 0,
      })
      expect(result.entries).toHaveLength(2)
      expect(result.entries.map((entry) => entry.games)).toEqual([18, 25])
    })

    it("keeps both counter invariants in every apply mode", () => {
      // Iterates the runtime projection of the union, not a hand-written list:
      // a third mode would be covered here the day it is added.
      const existing = [
        makeEntry({ championName: "Lee Sin", role: "jungle", games: 5 }),
        makeEntry({ championName: "Ahri", role: "mid" }),
      ]
      const rows = [
        makeRow({ championName: "Lee Sin", games: 24, winrate: 62 }), // already stored, jungle
        makeRow({ championName: "Elise", games: 11, winrate: 48 }), // new
        makeRow({ championName: "Nidalee", games: null }), // not applicable
      ]

      const byMode = new Map<ScoutImportApplyMode, ScoutImportApplyResult>()
      for (const mode of SCOUT_IMPORT_APPLY_MODES) {
        const result = applyImportRows(existing, rows, { ...APPLY_JUNGLE, mode })
        byMode.set(mode, result)

        expect(result.importedRows, mode).toBe(result.addedRows + result.overwrittenRows)
        expect(result.importedRows, mode).toBe(rows.length - result.skippedRows)
        // `removedExistingRows` stands outside both equations on purpose.
        expect(result.skippedRows, mode).toBe(1)
      }

      // Guards against a vacuous loop, and against a scenario that would
      // exercise neither mode-specific counter.
      expect(byMode.size).toBe(SCOUT_IMPORT_APPLY_MODES.length)
      expect(byMode.size).toBeGreaterThanOrEqual(2)
      expect(byMode.get("append")?.overwrittenRows).toBe(1)
      expect(byMode.get("append")?.removedExistingRows).toBe(0)
      expect(byMode.get("replace")?.removedExistingRows).toBe(1)
      expect(byMode.get("replace")?.overwrittenRows).toBe(0)
    })
  })
})

describe("importRowToManualEntry", () => {
  it("refuses a row that is not applicable", () => {
    expect(importRowToManualEntry(makeRow({ games: null }), APPLY_JUNGLE)).toBeNull()
    expect(importRowToManualEntry(makeRow({ winrate: 101 }), APPLY_JUNGLE)).toBeNull()
  })

  it("takes role, source and recency from the apply options, never from the row", () => {
    const entry = importRowToManualEntry(
      makeRow({ championName: "Karma", detectedRole: "support", roleMismatch: true }),
      { role: "jungle", source: "other", recency: "old", mode: "append" },
    )

    expect(entry?.role).toBe("jungle")
    expect(entry?.source).toBe("other")
    expect(entry?.recency).toBe("old")
  })

  it("does not invent an id — the UI assigns React keys", () => {
    const entry = importRowToManualEntry(makeRow({}), APPLY_JUNGLE)

    expect(entry).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(entry ?? {}, "id")).toBe(false)
  })

  it("carries the extra metrics into the note", () => {
    const entry = importRowToManualEntry(makeRow({ kda: 3.1, csPerMin: 7.2 }), APPLY_JUNGLE)

    expect(entry?.note).toBe("KDA 3.1 · CS/min 7.2")
  })
})

/* ==========================================================================
 * 18. buildImportNote
 * ========================================================================== */

describe("buildImportNote", () => {
  it("joins every present metric with a middle dot", () => {
    const note = buildImportNote(
      makeRow({ kda: 3.1, csPerMin: 7.2, killParticipation: 62, damage: 21345 }),
    )

    expect(note).toBe("KDA 3.1 · CS/min 7.2 · KP 62% · DMG 21345")
  })

  it("omits every metric the paste did not contain", () => {
    expect(buildImportNote(makeRow({ killParticipation: 62 }))).toBe("KP 62%")
    expect(buildImportNote(makeRow({ kda: 4, damage: 900 }))).toBe("KDA 4 · DMG 900")
  })

  it("returns an empty string when there is nothing to say", () => {
    expect(buildImportNote(makeRow({}))).toBe("")
  })

  it("rounds to at most two decimals and drops trailing zeros", () => {
    expect(buildImportNote(makeRow({ kda: 4.3870967741935485 }))).toBe("KDA 4.39")
    expect(buildImportNote(makeRow({ csPerMin: 7.0 }))).toBe("CS/min 7")
    expect(buildImportNote(makeRow({ csPerMin: 7.5 }))).toBe("CS/min 7.5")
  })

  it("stays language neutral so a language switch cannot make it wrong", () => {
    const note = buildImportNote(makeRow({ kda: 3.1, killParticipation: 62 }))

    expect(note).not.toMatch(/[a-z]{4,}/)
    expect(note).toBe("KDA 3.1 · KP 62%")
  })
})

/* ==========================================================================
 * 19. detectStatsSource
 * ========================================================================== */

describe("detectStatsSource", () => {
  it("recognises each provider by an unambiguous marker", () => {
    expect(detectStatsSource("https://www.op.gg/summoners/euw/Testname-EUW")).toBe("opgg")
    expect(detectStatsSource("copied from League of Graphs")).toBe("leagueofgraphs")
    expect(detectStatsSource("https://www.leagueofgraphs.com/summoner/euw/Testname")).toBe(
      "leagueofgraphs",
    )
    expect(detectStatsSource("https://www.deeplol.gg/summoner/euw/Testname-EUW")).toBe("deeplol")
    expect(detectStatsSource("https://dpm.lol/Testname-EUW")).toBe("dpm")
  })

  it("answers unknown when the paste carries no marker", () => {
    expect(detectStatsSource("Champion\tGames\tWin Rate\nAhri\t12\t55%")).toBe("unknown")
    expect(detectStatsSource("")).toBe("unknown")
  })

  it("answers unknown rather than picking a winner when markers disagree", () => {
    expect(detectStatsSource("op.gg and deeplol.gg in one paste")).toBe("unknown")
  })

  it("does not read a DPM stat column as the dpm.lol provider", () => {
    // "DPM" is the standard abbreviation for damage per minute and appears as a
    // column header on every provider — it is not provenance.
    expect(detectStatsSource("Champion\tGames\tWin Rate\tDPM\nAhri\t12\t55%\t21,345")).toBe(
      "unknown",
    )
  })
})

/* ==========================================================================
 * 20. Determinism
 * ========================================================================== */

describe("parseScoutStats — determinism", () => {
  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA",
    "Lee Sin\t24\t62%\t3.1",
    "Zzzfake\t3\t33%\t1.0",
    "Show more",
  ].join("\n")

  it("returns exactly the same result for the same input", () => {
    const first = parseScoutStats(PASTE, JUNGLE)
    const second = parseScoutStats(PASTE, JUNGLE)

    expect(second).toEqual(first)
    expect(second.rows.map((row) => row.id)).toEqual(first.rows.map((row) => row.id))
  })

  it("normalises \\r\\n exactly like \\n", () => {
    const withCrLf = parseScoutStats(PASTE.split("\n").join("\r\n"), JUNGLE)
    const withLf = parseScoutStats(PASTE, JUNGLE)

    expect(withCrLf.rows).toEqual(withLf.rows)
    expect(withCrLf.unparsedLines).toEqual(withLf.unparsedLines)
  })
})

/* ==========================================================================
 * 21. No network, no clock, no randomness
 * ========================================================================== */

describe("statsImport module purity", () => {
  const MODULE_SOURCE = readFileSync(
    fileURLToPath(new URL("../src/scout/statsImport.ts", import.meta.url)),
    "utf8",
  )

  const PASTE = [
    "Champion\tGames\tWin Rate\tKDA",
    "Lee Sin\t24\t62%\t3.1",
    "Zzzfake\t3\t33%\t1.0",
  ].join("\n")

  it("contains no network, clock, randomness or storage access at all", () => {
    expect(MODULE_SOURCE).not.toMatch(/\bfetch\s*\(/)
    expect(MODULE_SOURCE).not.toMatch(/XMLHttpRequest/)
    expect(MODULE_SOURCE).not.toMatch(/\bDate\b/)
    expect(MODULE_SOURCE).not.toMatch(/Math\s*\.\s*random/)
    expect(MODULE_SOURCE).not.toMatch(/localStorage|sessionStorage/)
    expect(MODULE_SOURCE).not.toMatch(/\bhttps?:\/\//)
  })

  it("does not touch the clock or the random generator while parsing and applying", () => {
    const now = vi.spyOn(Date, "now")
    const random = vi.spyOn(Math, "random")

    try {
      const result = parseScoutStats(PASTE, JUNGLE)
      applyImportRows([], result.rows, APPLY_JUNGLE)
      result.rows.forEach((row) => buildImportNote(row))

      expect(now).not.toHaveBeenCalled()
      expect(random).not.toHaveBeenCalled()
    } finally {
      now.mockRestore()
      random.mockRestore()
    }
  })
})

/* ==========================================================================
 * 22. OP.GG raw champion page — the pasted block layout
 *
 * The user selects the OP.GG summoner "Champions" panel from "Alle Champions"
 * downwards and pastes it. A browser copy loses every column boundary, so each
 * value arrives on its OWN LINE and there is no header at all. The layout is
 * therefore recognised by a repeating LINE BLOCK, never by a column mapping,
 * and `columns` stays empty exactly as it does for `loose_lines`.
 *
 * Every fixture below is INVENTED. They imitate the *shape* of that copy (a
 * rank number, the champion name printed twice, `36S` / `36N`, a percentage, a
 * `x:1` KDA ratio, a kills/deaths/assists triple) without reproducing any real
 * page and without naming any real player.
 *
 * Nothing here is fetched. These strings exist because a human copied them.
 * ========================================================================== */

/** Join invented block lines into one paste. */
const opgg = (...lines: readonly string[]): string => lines.join("\n")

/** The aggregate heading plus its own value lines, which belong to no champion. */
const AGGREGATE = ["Alle Champions", "256S", "256N", "50%", "2.57:1", "3.9 / 5.4 / 9.9 (45%)"]

describe("parseScoutStats — OP.GG raw champion page, one block", () => {
  it("reads rank, doubled name, wins, losses, winrate and KDA out of one block", () => {
    const result = parseScoutStats(opgg("1", "Ahri", "Ahri", "36S", "36N", "50%", "2.60:1"), SUPPORT)

    expect(result.layout).toBe("opgg_raw_champion_page")
    expect(result.columns).toEqual([])
    expect(result.detectedSource).toBe("opgg")
    expect(result.rows).toHaveLength(1)

    const [ahri] = result.rows
    expect(ahri.id).toBe("row-0")
    expect(ahri.raw).toBe("Ahri")
    expect(ahri.championName).toBe("Ahri")
    expect(ahri.championResolved).toBe(true)
    expect(ahri.wins).toBe(36)
    expect(ahri.losses).toBe(36)
    expect(ahri.games).toBe(72)
    expect(ahri.winrate).toBe(50)
    expect(ahri.kda).toBe(2.6)
    expect(ahri.detectedRole).toBe("unknown")
    expect(ahri.roleMismatch).toBe(false)
    expect(ahri.confidence).toBe("high")
  })

  it("never claims a guessed column mapping — the block pattern was recognised", () => {
    const result = parseScoutStats(opgg("1", "Ahri", "Ahri", "36S", "36N", "50%", "2.60:1"), SUPPORT)

    expect(codes(result.warnings)).not.toContain("columns_guessed")
    expect(codes(result.warnings)).not.toContain("header_not_recognized")
    expect(result.confidence).toBe("high")
  })

  it("leaves the column-shaped metrics null — the copy carries none of them", () => {
    const [ahri] = parseScoutStats(
      opgg("1", "Ahri", "Ahri", "36S", "36N", "50%", "2.60:1", "5 / 4.8 / 7.4 (40%)"),
      SUPPORT,
    ).rows

    // The `(40%)` inside the triple is very probably kill participation, but that
    // is NOT verified — a mislabelled value is worse than a missing one.
    expect(ahri.killParticipation).toBeNull()
    expect(ahri.csPerMin).toBeNull()
    expect(ahri.damage).toBeNull()
  })

  it("sums games from wins + losses for a second block shape", () => {
    const [lux] = parseScoutStats(opgg("2", "Lux", "Lux", "23S", "15N", "61%", "2.90:1"), SUPPORT)
      .rows

    expect(lux.championName).toBe("Lux")
    expect(lux.wins).toBe(23)
    expect(lux.losses).toBe(15)
    expect(lux.games).toBe(38)
    expect(lux.winrate).toBe(61)
    expect(lux.kda).toBe(2.9)
  })

  it("sums games from wins + losses for a third block shape", () => {
    const [milio] = parseScoutStats(
      opgg("3", "Milio", "Milio", "20S", "12N", "63%", "4.00:1"),
      SUPPORT,
    ).rows

    expect(milio.championName).toBe("Milio")
    expect(milio.wins).toBe(20)
    expect(milio.losses).toBe(12)
    expect(milio.games).toBe(32)
    expect(milio.winrate).toBe(63)
    expect(milio.kda).toBe(4)
  })

  it("tolerates a block without a rank number", () => {
    const result = parseScoutStats(opgg("Ahri", "Ahri", "36S", "36N", "50%", "2.60:1"), SUPPORT)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].games).toBe(72)
  })
})

/* ==========================================================================
 * 23. The aggregate row, and champion order
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, aggregate row and order", () => {
  const PASTE = opgg(
    ...AGGREGATE,
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "50%",
    "2.60:1",
    "5 / 4.8 / 7.4 (40%)",
    "2",
    "Lux",
    "Lux",
    "23S",
    "15N",
    "61%",
    "2.90:1",
    "3",
    "Milio",
    "Milio",
    "20S",
    "12N",
    "63%",
    "4.00:1",
    "4",
    "Syndra",
    "Syndra",
    "14S",
    "10N",
    "58%",
    "2.10:1",
  )

  it("keeps the champions in the order OP.GG printed them", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux", "Milio", "Syndra"])
    expect(result.rows.map((row) => row.id)).toEqual(["row-0", "row-1", "row-2", "row-3"])
  })

  it("reports the aggregate heading once and never as a champion", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    const aggregate = result.unparsedLines.filter((line) => line.reason === "aggregate_row")
    expect(aggregate).toEqual([{ raw: "Alle Champions", reason: "aggregate_row" }])
    expect(result.rows.some((row) => row.championName === "Alle Champions")).toBe(false)
  })

  it("swallows the aggregate value lines instead of listing each one as unparsed", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    // 256S / 256N / 50% / 2.57:1 / the triple all belong to the aggregate.
    // Five unparsed lines per paste would drown the preview.
    expect(result.unparsedLines).toHaveLength(1)
  })

  it("never lets the aggregate totals leak into the first champion", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows[0].wins).toBe(36)
    expect(result.rows[0].losses).toBe(36)
    expect(result.rows[0].games).toBe(72)
  })

  it("does not report the deliberate non-rows as rows that failed to parse", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    // Same reasoning as for a table header: an aggregate row is a line we
    // understood and deliberately did not turn into a row.
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })
})

/* ==========================================================================
 * 24. Matchup sub-blocks — the single most important rule of this parser
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, matchup sub-blocks", () => {
  const PASTE = opgg(
    ...AGGREGATE,
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "50%",
    "2.60:1",
    "vs Mel",
    "3S",
    "1N",
    "75%",
    "vs Yasuo",
    "5S",
    "2N",
    "71%",
    "vs. Ryze",
    "2S",
    "4N",
    "33%",
    "2",
    "Lux",
    "Lux",
    "23S",
    "15N",
    "61%",
    "2.90:1",
  )

  it("reports every matchup line once and turns none of them into a champion", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(
      result.unparsedLines.filter((line) => line.reason === "matchup_row").map((line) => line.raw),
    ).toEqual(["vs Mel", "vs Yasuo", "vs. Ryze"])
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
  })

  /**
   * THE regression this parser exists for — and it only bites when the champion
   * leaves a slot free.
   *
   * `readOpggChampionBlock` writes each of its four values on the FIRST match
   * only, so a fixture whose champion already states wins, losses, winrate AND
   * kda is immune by accident: the matchup's numbers find every slot taken and
   * run into the void, and the test stays green even with the matchup rule
   * deleted outright. Ahri below deliberately prints no winrate and no KDA of
   * her own, so the opponent's 75 % and 2.50:1 have somewhere to land. The
   * opponent is also NAMED on its own line, which is the second half of the
   * defect: a resolvable name is what turns the sub-block into a row.
   */
  const OPEN_SLOTS = opgg(
    ...AGGREGATE,
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "vs Mel",
    "Mel",
    "3S",
    "1N",
    "75%",
    "2.50:1",
    "2",
    "Lux",
    "Lux",
    "23S",
    "15N",
    "61%",
    "2.90:1",
  )

  it("keeps a matchup win/loss count out of BOTH neighbouring champions", () => {
    const result = parseScoutStats(OPEN_SLOTS, SUPPORT)

    // Not the champion above, not the champion below, and not a third row
    // squeezed in between: the opponent's numbers must reach nobody at all.
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])

    const [ahri, lux] = result.rows

    expect({
      wins: ahri.wins,
      losses: ahri.losses,
      games: ahri.games,
      winrate: ahri.winrate,
      kda: ahri.kda,
    }).toEqual({ wins: 36, losses: 36, games: 72, winrate: null, kda: null })

    expect({
      wins: lux.wins,
      losses: lux.losses,
      games: lux.games,
      winrate: lux.winrate,
      kda: lux.kda,
    }).toEqual({ wins: 23, losses: 15, games: 38, winrate: 61, kda: 2.9 })
  })

  it("attributes nothing of the matchup even when the champion states all four values", () => {
    // The complementary case to OPEN_SLOTS, kept because it is the shape a real
    // paste usually has. On its own it proves little — see the note above.
    const result = parseScoutStats(PASTE, SUPPORT)
    const [ahri, lux] = result.rows

    expect({ wins: ahri.wins, losses: ahri.losses, winrate: ahri.winrate, kda: ahri.kda }).toEqual({
      wins: 36,
      losses: 36,
      winrate: 50,
      kda: 2.6,
    })
    expect({ wins: lux.wins, losses: lux.losses, winrate: lux.winrate, kda: lux.kda }).toEqual({
      wins: 23,
      losses: 15,
      winrate: 61,
      kda: 2.9,
    })
  })

  it("produces exactly one row per real champion, never one per matchup", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows).toHaveLength(2)
    expect(result.unparsedLines.filter((line) => line.reason === "matchup_row")).toHaveLength(3)
  })

  it("leaves a matchup block ONLY through a rank number, never through a bare champion name", () => {
    // The rule the parser settled on. In a real OP.GG list EVERY champion row
    // carries its rank number and a matchup sub-block carries none, so the rank
    // is the one dependable "a new block starts here" marker. A bare champion
    // name is not: the opponent of a matchup is a champion name too, and
    // trusting it is precisely how the opponent's 3S / 1N / 75 % used to become
    // a row of its own.
    const withRank = parseScoutStats(
      opgg(
        ...AGGREGATE,
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "vs Mel",
        "Mel",
        "3S",
        "1N",
        "75%",
        "2",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(withRank.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
    expect(withRank.rows[1].wins).toBe(23)
    expect(withRank.rows[1].losses).toBe(15)

    // Without the rank the following champion is LOST. That is the deliberately
    // accepted cost of the strict rule: a MISSING row is visible in the preview
    // and can be typed in by hand, an INVENTED row at 75 % winrate is not — it
    // looks exactly like a real one and flows straight into the ban plan.
    const withoutRank = parseScoutStats(
      opgg(
        ...AGGREGATE,
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "vs Mel",
        "Mel",
        "3S",
        "1N",
        "75%",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(withoutRank.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(withoutRank.rows[0].winrate).toBe(50)
  })

  it("does not let a matchup fill in a value the champion itself never stated", () => {
    // Ahri's own block prints no winrate; the matchup right below it does. The
    // block MUST end at the `vs` line, otherwise the 75 % of one opponent is
    // presented as Ahri's overall winrate — a wrong number that looks perfectly
    // plausible in the preview.
    const result = parseScoutStats(
      opgg(
        ...AGGREGATE,
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "vs Mel",
        "3S",
        "1N",
        "75%",
        "2.90:1",
        "2",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    const [ahri, lux] = result.rows
    expect(ahri.championName).toBe("Ahri")
    expect(ahri.winrate).toBeNull()
    expect(ahri.kda).toBeNull()
    expect(ahri.games).toBe(72)
    expect(lux.winrate).toBe(61)
    expect(codes(result.warnings)).toContain("missing_winrate")
  })

  it("keeps an opponent named inside the sub-block out of the champion pool", () => {
    // The opponent's name RESOLVES against the catalog — that is the whole
    // danger. An opponent the catalog does not know was never the problem: it
    // would at worst produce a row carrying a visible `unknown_champion`
    // warning at `low` confidence. A resolvable one produces a row that looks
    // completely ordinary, sits at `high` confidence, is pre-ticked in the
    // preview, and carries the OPPONENT's 3 wins / 1 loss into the scouted
    // player's pool at 75 % winrate.
    const result = parseScoutStats(
      opgg(
        ...AGGREGATE,
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2.60:1",
        "vs Zed",
        "Zed",
        "3S",
        "1N",
        "75%",
        "2",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
    expect(result.rows.map((row) => row.wins)).toEqual([36, 23])
    expect(result.rows.map((row) => row.winrate)).toEqual([50, 61])
    expect(result.unparsedLines).toContainEqual({ raw: "vs Zed", reason: "matchup_row" })
  })
})

/* ==========================================================================
 * 24b. The `vs` badge on a line of its own
 *
 * A browser copy does not reliably keep `vs` and the opponent on ONE line — the
 * badge is its own element, so it frequently arrives alone with the opponent's
 * name on the next line. All four shapes below are the same defect: the head of
 * the matchup goes unrecognised, the opponent's name resolves against the
 * catalog, and the sub-block's 3S / 1N / 75 % become a champion row that is
 * pre-ticked in the preview and lands in the ban plan.
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, a bare `vs` badge line", () => {
  const withBadge = (badge: string): string =>
    opgg(
      ...AGGREGATE,
      "1",
      "Ahri",
      "Ahri",
      "36S",
      "36N",
      "50%",
      "2.60:1",
      badge,
      "Mel",
      "3S",
      "1N",
      "75%",
      "2",
      "Lux",
      "Lux",
      "23S",
      "15N",
      "61%",
      "2.90:1",
    )

  for (const badge of ["vs Mel", "vs", "vs.", "VS"]) {
    it(`turns the opponent into no row at all when the badge reads ${JSON.stringify(badge)}`, () => {
      const result = parseScoutStats(withBadge(badge), SUPPORT)

      expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
      expect(result.rows.map((row) => [row.wins, row.losses, row.games, row.winrate])).toEqual([
        [36, 36, 72, 50],
        [23, 15, 38, 61],
      ])
      expect(result.unparsedLines).toContainEqual({ raw: badge, reason: "matchup_row" })
    })
  }

  it("ends the champion block above it as well, so a free slot stays free", () => {
    // Ahri prints no winrate. A bare `vs` that is not recognised lets her block
    // run on into the sub-block and the opponent's 75 % is presented as hers.
    const result = parseScoutStats(
      opgg(
        ...AGGREGATE,
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "vs",
        "Mel",
        "3S",
        "1N",
        "75%",
        "2",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
    expect(result.rows[0].winrate).toBeNull()
    expect(result.rows[0].games).toBe(72)
  })

  it("keeps the bare form anchored to the whole line", () => {
    // `vs` alone is a badge; letters that merely BEGIN with it are not. Without
    // the anchor a future champion whose name starts with those two letters
    // would silently swallow its own block and everything behind it.
    const result = parseScoutStats(
      opgg(...AGGREGATE, "1", "Vex", "Vex", "10S", "5N", "67%", "2.00:1"),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Vex"])
    expect(result.unparsedLines.filter((line) => line.reason === "matchup_row")).toEqual([])
  })
})

/* ==========================================================================
 * 25. The recommended-champions block above the list
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, recommended champions", () => {
  const PASTE = opgg(
    "Empfohlene Champions",
    "Vel'Koz",
    "Zed",
    "Gragas",
    "Alle Champions",
    "100S",
    "100N",
    "50%",
    "2.00:1",
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "50%",
    "2.60:1",
  )

  it("reports the recommended champions as unparsed, never as rows", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(
      result.unparsedLines
        .filter((line) => line.reason === "recommended_champion")
        .map((line) => line.raw),
    ).toEqual(["Vel'Koz", "Zed", "Gragas"])
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
  })

  it("still produces exactly one row when a recommended champion reappears in the list", () => {
    const result = parseScoutStats(
      opgg(
        "Empfohlene Champions",
        "Vel'Koz",
        "Zed",
        "Gragas",
        "Alle Champions",
        "100S",
        "100N",
        "50%",
        "2.00:1",
        "1",
        "Zed",
        "Zed",
        "20S",
        "10N",
        "67%",
        "3.00:1",
      ),
      SUPPORT,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].championName).toBe("Zed")
    expect(result.rows[0].wins).toBe(20)
    expect(result.rows[0].losses).toBe(10)
    expect(codes(result.warnings)).not.toContain("duplicate_champion")
  })

  it("has no recommended section at all when the paste starts in the list", () => {
    const result = parseScoutStats(opgg("1", "Ahri", "Ahri", "36S", "36N", "50%"), SUPPORT)

    expect(result.unparsedLines.filter((line) => line.reason === "recommended_champion")).toEqual([])
    expect(result.rows).toHaveLength(1)
  })

  it("reports a `vs` line that appears ABOVE the aggregate heading too", () => {
    // The module header promises an `unparsedLines` entry for every `vs …`
    // line. The recommendation area used to be the one place where that was
    // false: its branch ran first and consumed the line without a word.
    const result = parseScoutStats(
      opgg(
        "Empfohlene Champions",
        "Vel'Koz",
        "vs Zed",
        "Gragas",
        "Alle Champions",
        "100S",
        "100N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
      ),
      SUPPORT,
    )

    expect(result.unparsedLines).toContainEqual({ raw: "vs Zed", reason: "matchup_row" })
    // Reported, but the state is NOT entered: `Gragas` behind it is still
    // reported as a recommendation rather than swallowed as matchup interior.
    expect(
      result.unparsedLines
        .filter((line) => line.reason === "recommended_champion")
        .map((line) => line.raw),
    ).toEqual(["Vel'Koz", "Gragas"])
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("drops an unresolved line in the recommendation area, and says so in the header", () => {
    // The deliberate gap, stated instead of papered over. `Empfohlene
    // Champions` is itself such a line: page chrome that resolves to no
    // champion. Calling it a `recommended_champion` would be a false claim,
    // calling it `noise` would raise `row_not_parsed` on every ordinary paste.
    const result = parseScoutStats(
      opgg(
        "Empfohlene Champions",
        "Zzzfake",
        "Alle Champions",
        "100S",
        "100N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
      ),
      SUPPORT,
    )

    expect(result.unparsedLines.map((line) => line.raw)).toEqual(["Alle Champions"])
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
  })
})

/* ==========================================================================
 * 26. Champion names with spaces and punctuation
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, awkward champion names", () => {
  const PASTE = opgg(
    "Alle Champions",
    "100S",
    "100N",
    "50%",
    "2.00:1",
    "1",
    "Vel'Koz",
    "Vel'Koz",
    "10S",
    "5N",
    "67%",
    "2.50:1",
    "2",
    "Twisted Fate",
    "Twisted Fate",
    "9S",
    "6N",
    "60%",
    "2.20:1",
    "3",
    "Aurelion Sol",
    "Aurelion Sol",
    "8S",
    "7N",
    "53%",
    "2.10:1",
    "4",
    "LeBlanc",
    "LeBlanc",
    "7S",
    "8N",
    "47%",
    "1.90:1",
    "5",
    "Kai'Sa",
    "Kai'Sa",
    "6S",
    "9N",
    "40%",
    "1.70:1",
    "6",
    "Nunu & Willump",
    "Nunu & Willump",
    "5S",
    "10N",
    "33%",
    "1.50:1",
  )

  it("resolves every one of them to the catalog spelling", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows.map((row) => row.championName)).toEqual([
      "Vel'Koz",
      "Twisted Fate",
      "Aurelion Sol",
      "LeBlanc",
      "Kai'Sa",
      "Nunu & Willump",
    ])
    expect(result.rows.every((row) => row.championResolved)).toBe(true)
    expect(codes(result.warnings)).not.toContain("unknown_champion")
  })

  it("keeps each multi-word name attached to its own numbers", () => {
    const result = parseScoutStats(PASTE, SUPPORT)

    expect(result.rows.map((row) => row.wins)).toEqual([10, 9, 8, 7, 6, 5])
    expect(result.rows.map((row) => row.losses)).toEqual([5, 6, 7, 8, 9, 10])
    expect(result.rows.map((row) => row.games)).toEqual([15, 15, 15, 15, 15, 15])
  })

  it("keeps an unresolved name verbatim and flags it", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Zzzfake", "Zzzfake", "4S", "6N", "40%"),
      SUPPORT,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].championName).toBe("Zzzfake")
    expect(result.rows[0].championResolved).toBe(false)
    expect(result.rows[0].confidence).toBe("low")
    expect(codes(result.warnings)).toContain("unknown_champion")
  })
})

/* ==========================================================================
 * 27. German and English wordings, and the decimal comma
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, DE and EN wordings", () => {
  const german = opgg(
    "Alle Champions",
    "100S",
    "100N",
    "50%",
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "50%",
    "2.60:1",
  )
  const english = opgg(
    "All Champions",
    "100W",
    "100L",
    "50%",
    "1",
    "Ahri",
    "Ahri",
    "36W",
    "36L",
    "50%",
    "2.60:1",
  )
  const spelled = opgg(
    "All Champions",
    "100 Wins",
    "100 Losses",
    "50%",
    "1",
    "Ahri",
    "Ahri",
    "36 Wins",
    "36 Losses",
    "50%",
    "2.60:1",
  )

  it("reads S/N, W/L and the spelled-out words identically", () => {
    const fromGerman = parseScoutStats(german, SUPPORT)
    const fromEnglish = parseScoutStats(english, SUPPORT)
    const fromSpelled = parseScoutStats(spelled, SUPPORT)

    expect(fromEnglish.rows).toEqual(fromGerman.rows)
    expect(fromSpelled.rows).toEqual(fromGerman.rows)
    expect(fromGerman.rows[0].wins).toBe(36)
    expect(fromGerman.rows[0].losses).toBe(36)
    expect(fromGerman.rows[0].games).toBe(72)
  })

  it("recognises the layout in all three wordings", () => {
    expect(parseScoutStats(german, SUPPORT).layout).toBe("opgg_raw_champion_page")
    expect(parseScoutStats(english, SUPPORT).layout).toBe("opgg_raw_champion_page")
    expect(parseScoutStats(spelled, SUPPORT).layout).toBe("opgg_raw_champion_page")
  })

  it("reads a KDA ratio written with a decimal comma", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2,60:1",
      ),
      SUPPORT,
    )

    expect(result.rows[0].kda).toBe(2.6)
  })

  it("reads a winrate written with a decimal comma", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "36N", "50,5%"),
      SUPPORT,
    )

    expect(result.rows[0].winrate).toBe(50.5)
  })

  it("leaves an absent KDA null instead of inventing one", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "36N", "50%"),
      SUPPORT,
    )

    expect(result.rows[0].kda).toBeNull()
    expect(result.rows[0].confidence).toBe("high")
  })

  it("drops to medium confidence when the winrate line is missing", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "36N", "2.60:1"),
      SUPPORT,
    )

    expect(result.rows[0].winrate).toBeNull()
    expect(result.rows[0].games).toBe(72)
    expect(result.rows[0].confidence).toBe("medium")
    expect(codes(result.warnings)).toContain("missing_winrate")
  })
})

/* ==========================================================================
 * 28. winrate_mismatch — stated against recomputed
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, winrate plausibility", () => {
  const paste = (wins: string, losses: string, winrate: string): string =>
    opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", wins, losses, winrate)

  it("stays silent when the stated winrate matches exactly", () => {
    const result = parseScoutStats(paste("20S", "20N", "50%"), SUPPORT)

    expect(codes(result.warnings)).not.toContain("winrate_mismatch")
    expect(result.rows[0].warnings).toEqual([])
  })

  it("stays silent for a rounding-sized difference", () => {
    // 23 / 38 = 60.5 %, the page prints 61 %.
    const result = parseScoutStats(paste("23S", "15N", "61%"), SUPPORT)

    expect(codes(result.warnings)).not.toContain("winrate_mismatch")
    expect(result.rows[0].winrate).toBe(61)
  })

  it("raises the warning with both numbers when the two genuinely disagree", () => {
    const result = parseScoutStats(paste("20S", "20N", "62%"), SUPPORT)

    const mismatch = result.rows[0].warnings.find((entry) => entry.code === "winrate_mismatch")
    expect(mismatch).toBeDefined()
    expect(mismatch?.severity).toBe("warning")
    expect(mismatch?.params).toEqual({ champion: "Ahri", stated: 62, computed: 50 })
    expect(codes(result.warnings)).toContain("winrate_mismatch")
  })

  it("never corrects the stated winrate — it only states the disagreement", () => {
    const result = parseScoutStats(paste("20S", "20N", "62%"), SUPPORT)

    expect(result.rows[0].winrate).toBe(62)
    expect(result.rows[0].wins).toBe(20)
    expect(result.rows[0].losses).toBe(20)
    expect(result.rows[0].games).toBe(40)
  })

  it("cannot fire when no winrate was printed", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "20S", "20N"),
      SUPPORT,
    )

    expect(codes(result.warnings)).not.toContain("winrate_mismatch")
  })
})

/* ==========================================================================
 * 29. Doubled names and blocks without numbers
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, degenerate blocks", () => {
  it("reads the name printed twice as one champion, not two", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "36N", "50%"),
      SUPPORT,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].championName).toBe("Ahri")
    expect(codes(result.warnings)).not.toContain("duplicate_champion")
  })

  it("keeps a genuine second appearance of a champion as its own row", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2",
        "Ahri",
        "Ahri",
        "4S",
        "6N",
        "40%",
      ),
      SUPPORT,
    )

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row.wins)).toEqual([36, 4])
    expect(codes(result.warnings)).toContain("duplicate_champion")
  })

  it("reports a champion without wins and losses instead of inventing a row", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2",
        "Yasuo",
        "Yasuo",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(result.unparsedLines).toContainEqual({ raw: "Yasuo", reason: "no_numbers" })
    expect(codes(result.warnings)).toContain("row_not_parsed")
  })

  it("never emits a row whose wins or losses are null", () => {
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "50%", "2.60:1"),
      SUPPORT,
    )

    expect(result.rows.every((row) => row.wins !== null && row.losses !== null)).toBe(true)
  })
})

/* ==========================================================================
 * 30. Source detection, and the layouts that must NOT change
 * ========================================================================== */

describe("detectStatsSource — OP.GG raw champion page", () => {
  it("recognises the raw copy without any domain in the text", () => {
    const raw = opgg(
      "Alle Champions",
      "256S",
      "256N",
      "50%",
      "1",
      "Ahri",
      "Ahri",
      "36S",
      "36N",
      "50%",
    )

    expect(raw.toLowerCase()).not.toContain("op.gg")
    expect(detectStatsSource(raw)).toBe("opgg")
  })

  it("recognises the English wording too", () => {
    expect(
      detectStatsSource(
        opgg("All Champions", "100W", "100L", "50%", "Ahri", "Ahri", "36W", "36L", "50%"),
      ),
    ).toBe("opgg")
  })

  it("needs two independent markers — one alone is not enough", () => {
    // Champion names on their own lines, but no win/loss lines and no heading.
    expect(detectStatsSource(opgg("Ahri", "Lux", "Milio"))).toBe("unknown")
    // Win/loss lines, but nothing else that points at the champions page.
    expect(detectStatsSource(opgg("36S", "36N", "12S", "9N"))).toBe("unknown")
  })

  it("does not read an ordinary champion table as a raw page copy", () => {
    expect(detectStatsSource("Champion\tGames\tWin Rate\nAhri\t12\t55%\nLux\t9\t44%")).toBe(
      "unknown",
    )
  })
})

describe("parseScoutStats — the existing layouts are untouched", () => {
  it("still reads a tab separated table with a header as tabular_with_header", () => {
    const result = parseScoutStats(
      "Champion\tGames\tWin Rate\tKDA\nAhri\t12\t55%\t3.1\nLux\t9\t44%\t2.4",
      SUPPORT,
    )

    expect(result.layout).toBe("tabular_with_header")
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].games).toBe(12)
    expect(result.rows.every((row) => row.wins === null && row.losses === null)).toBe(true)
  })

  it("still reads prose lines as loose_lines", () => {
    const result = parseScoutStats("Karma 34 games 61% WR\nLee Sin 22 games 55% WR", SUPPORT)

    expect(result.layout).toBe("loose_lines")
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((row) => row.wins === null && row.losses === null)).toBe(true)
  })

  it("still reads a headerless table as tabular_no_header", () => {
    const result = parseScoutStats("Ahri\t12\t55%\nLux\t9\t44%", SUPPORT)

    expect(result.layout).toBe("tabular_no_header")
    expect(result.rows.every((row) => row.wins === null && row.losses === null)).toBe(true)
  })
})

/* ==========================================================================
 * 31. Determinism and purity of the new path
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page determinism and purity", () => {
  const PASTE = opgg(
    ...AGGREGATE,
    "1",
    "Ahri",
    "Ahri",
    "36S",
    "36N",
    "50%",
    "2.60:1",
    "vs Mel",
    "3S",
    "1N",
    "75%",
    "2",
    "Lux",
    "Lux",
    "23S",
    "15N",
    "61%",
    "2.90:1",
  )

  it("returns exactly the same result twice and does not touch its input", () => {
    const input = PASTE
    const options: ScoutStatsImportOptions = { role: "support" }

    const first = parseScoutStats(input, options)
    const second = parseScoutStats(input, options)

    expect(second).toEqual(first)
    expect(input).toBe(PASTE)
    expect(options).toEqual({ role: "support" })
  })

  it("normalises CRLF exactly like LF on the block layout", () => {
    expect(parseScoutStats(PASTE.split("\n").join("\r\n"), SUPPORT)).toEqual(
      parseScoutStats(PASTE, SUPPORT),
    )
  })

  it("ignores leading and trailing whitespace on every line", () => {
    const padded = PASTE.split("\n")
      .map((line) => `  ${line} `)
      .join("\n")

    expect(parseScoutStats(padded, SUPPORT).rows).toEqual(parseScoutStats(PASTE, SUPPORT).rows)
  })

  it("calls neither the clock, nor the random generator, nor fetch", () => {
    const now = vi.spyOn(Date, "now")
    const random = vi.spyOn(Math, "random")
    const originalFetch = globalThis.fetch
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    try {
      const result = parseScoutStats(PASTE, SUPPORT)
      applyImportRows([], result.rows, { ...APPLY_JUNGLE, role: "support" })
      result.rows.forEach((row) => buildImportNote(row))

      expect(now).not.toHaveBeenCalled()
      expect(random).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      now.mockRestore()
      random.mockRestore()
      globalThis.fetch = originalFetch
    }
  })
})

/* ==========================================================================
 * 32. buildImportNote carries the win and loss counts
 * ========================================================================== */

describe("buildImportNote — wins and losses", () => {
  it("puts W and L in front of the other metrics", () => {
    expect(buildImportNote(makeRow({ wins: 36, losses: 36, kda: 2.6 }))).toBe("W36 · L36 · KDA 2.6")
  })

  it("is unchanged for a row without win and loss counts", () => {
    expect(buildImportNote(makeRow({ wins: null, losses: null, kda: 3.1, csPerMin: 7.2 }))).toBe(
      "KDA 3.1 · CS/min 7.2",
    )
  })

  it("carries the counts through into the stored entry note", () => {
    const [row] = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2.60:1",
      ),
      SUPPORT,
    ).rows

    const entry = importRowToManualEntry(row, { ...APPLY_JUNGLE, role: "support" })
    expect(entry?.note).toBe("W36 · L36 · KDA 2.6")
    expect(entry?.games).toBe(72)
    expect(entry?.winrate).toBe(50)
    expect(entry?.role).toBe("support")
  })
})

/* ==========================================================================
 * 33. Page noise — the `-` flood of a real OP.GG copy
 *
 * OP.GG prints a bare `-` wherever a column has no value. A profile with a few
 * dozen champions therefore carries a few dozen of those lines, and every one
 * of them used to arrive in the preview as its own `noise` entry — plus a
 * permanent `row_not_parsed` warning about something that is completely normal.
 *
 * `page_noise` is the separate answer to that: "this was a dash". The UI counts
 * it instead of listing it, and it never raises `row_not_parsed`.
 *
 * Every fixture below is INVENTED. No real player, no real page.
 * ========================================================================== */

/** wins, losses, the winrate the site printed, and the KDA ratio. */
type NoisyBlock = readonly [string, string, string, string, string]

/**
 * 22 champion blocks — a normal, not an extreme, champion pool. Each stated
 * winrate agrees with its own win/loss counts inside the rounding tolerance, so
 * nothing here can raise `winrate_mismatch` and hide the point of the suite.
 */
const NOISY_BLOCKS: readonly NoisyBlock[] = [
  ["Ahri", "36S", "36N", "50%", "2.60:1"],
  ["Lux", "23S", "15N", "61%", "2.90:1"],
  ["Milio", "20S", "12N", "63%", "4.00:1"],
  ["Syndra", "14S", "10N", "58%", "2.10:1"],
  ["Karma", "18S", "12N", "60%", "3.10:1"],
  ["Morgana", "15S", "15N", "50%", "2.40:1"],
  ["Nami", "12S", "8N", "60%", "3.60:1"],
  ["Janna", "11S", "9N", "55%", "3.20:1"],
  ["Lulu", "10S", "10N", "50%", "2.80:1"],
  ["Sona", "9S", "6N", "60%", "3.40:1"],
  ["Soraka", "8S", "7N", "53%", "3.00:1"],
  ["Thresh", "7S", "5N", "58%", "2.20:1"],
  ["Leona", "7S", "3N", "70%", "2.50:1"],
  ["Nautilus", "6S", "6N", "50%", "2.00:1"],
  ["Rakan", "6S", "4N", "60%", "2.70:1"],
  ["Pyke", "5S", "5N", "50%", "1.90:1"],
  ["Bard", "5S", "3N", "63%", "2.30:1"],
  ["Braum", "4S", "4N", "50%", "2.60:1"],
  ["Zilean", "4S", "2N", "67%", "3.50:1"],
  ["Yuumi", "3S", "3N", "50%", "4.20:1"],
  ["Senna", "3S", "2N", "60%", "2.10:1"],
  ["Seraphine", "2S", "2N", "50%", "3.30:1"],
]

/**
 * One block in the shape a browser copy produces: the rank, the `-` OP.GG
 * prints for the empty column in front of the icon, the name twice, then the
 * four values.
 */
const noisyBlock = (rank: number, [name, wins, losses, winrate, kda]: NoisyBlock): string[] => [
  String(rank),
  "-",
  name,
  name,
  wins,
  losses,
  winrate,
  kda,
]

/**
 * The reported case, end to end: a recommendation area, the aggregate heading,
 * 22 champion blocks each preceded by a dash, and one matchup sub-block whose
 * `vs` badge sits on a line of its own.
 */
const NOISY_PAGE = opgg(
  "Empfohlene Champions",
  "Zyra",
  "Rell",
  ...AGGREGATE,
  ...noisyBlock(1, NOISY_BLOCKS[0]),
  "vs",
  "Mel",
  "3S",
  "1N",
  "75%",
  ...NOISY_BLOCKS.slice(1).flatMap((block, index) => noisyBlock(index + 2, block)),
)

/** How many unparsed lines carry each reason — the whole point of this suite. */
const reasonCounts = (lines: readonly { reason: string }[]): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {}
  for (const line of lines) counts[line.reason] = (counts[line.reason] ?? 0) + 1
  return counts
}

describe("parseScoutStats — OP.GG raw page, the `-` flood", () => {
  it("recognises every champion block, unchanged, despite the dashes", () => {
    const result = parseScoutStats(NOISY_PAGE, SUPPORT)

    expect(result.layout).toBe("opgg_raw_champion_page")
    expect(result.rows).toHaveLength(NOISY_BLOCKS.length)
    expect(result.rows.map((row) => row.championName)).toEqual(NOISY_BLOCKS.map(([name]) => name))
  })

  it("reads Ahri, Lux and Milio exactly as it does without any noise", () => {
    const [ahri, lux, milio] = parseScoutStats(NOISY_PAGE, SUPPORT).rows

    expect([ahri.wins, ahri.losses, ahri.games, ahri.winrate, ahri.kda]).toEqual([
      36, 36, 72, 50, 2.6,
    ])
    expect([lux.championName, lux.games, lux.winrate]).toEqual(["Lux", 38, 61])
    expect([milio.championName, milio.games, milio.winrate]).toEqual(["Milio", 32, 63])
  })

  it("counts the 22 dashes as page_noise and leaves no `noise` behind", () => {
    const result = parseScoutStats(NOISY_PAGE, SUPPORT)

    expect(reasonCounts(result.unparsedLines)).toEqual({
      recommended_champion: 2,
      aggregate_row: 1,
      page_noise: NOISY_BLOCKS.length,
      matchup_row: 1,
    })
  })

  it("keeps the dash lines verbatim, so the preview can still show one", () => {
    const result = parseScoutStats(NOISY_PAGE, SUPPORT)
    const dashes = result.unparsedLines.filter((line) => line.reason === "page_noise")

    expect(dashes).toHaveLength(NOISY_BLOCKS.length)
    expect(dashes.every((line) => line.raw === "-")).toBe(true)
  })

  it("does not raise row_not_parsed — a dash is not a row that failed", () => {
    const result = parseScoutStats(NOISY_PAGE, SUPPORT)

    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("still imports neither the matchup opponent nor the recommendations", () => {
    const names = parseScoutStats(NOISY_PAGE, SUPPORT).rows.map((row) => row.championName)

    expect(names).not.toContain("Mel")
    expect(names).not.toContain("Zyra")
    expect(names).not.toContain("Rell")
  })

  it("leaves the bare `vs` badge a matchup_row, never page_noise", () => {
    const result = parseScoutStats(NOISY_PAGE, SUPPORT)

    expect(result.unparsedLines).toContainEqual({ raw: "vs", reason: "matchup_row" })
  })

  it("is deterministic on the noisy paste", () => {
    expect(parseScoutStats(NOISY_PAGE, SUPPORT)).toEqual(parseScoutStats(NOISY_PAGE, SUPPORT))
  })
})

describe("parseScoutStats — what counts as page noise", () => {
  /** Every separator shape a copied page produces where a column is empty. */
  const MARKERS = ["-", "–", "—", "---", "- -", "•", "·", "|", "/", "___"]

  it.each(MARKERS)("classifies %s as page_noise", (marker) => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        marker,
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2.60:1",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(result.unparsedLines).toContainEqual({ raw: marker, reason: "page_noise" })
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("never calls a line with a letter or a digit page noise", () => {
    // `-5` and `36S` lead with a number, so they stay `no_champion`; `A-` reads
    // as a champion candidate the catalog does not know, so it stays `noise`.
    const result = parseScoutStats(["Karma 34 games 61% WR", "-5", "A-", "36S"].join("\n"), SUPPORT)

    expect(result.rows.map((row) => row.championName)).toEqual(["Karma"])
    expect(result.unparsedLines.some((line) => line.reason === "page_noise")).toBe(false)
    expect(result.unparsedLines).toEqual([
      { raw: "-5", reason: "no_champion" },
      { raw: "A-", reason: "noise" },
      { raw: "36S", reason: "no_champion" },
    ])
  })

  it("leaves `vs <Champion>` a matchup_row and `Alle Champions` an aggregate_row", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2.60:1",
        "vs Mel",
        "3S",
        "1N",
        "75%",
      ),
      SUPPORT,
    )

    expect(result.unparsedLines).toContainEqual({ raw: "vs Mel", reason: "matchup_row" })
    expect(result.unparsedLines).toContainEqual({ raw: "Alle Champions", reason: "aggregate_row" })
    expect(result.unparsedLines.some((line) => line.reason === "page_noise")).toBe(false)
  })
})

describe("parseScoutStats — page noise outside the OP.GG block layout", () => {
  it("classifies a dash line inside a tab separated table as page_noise", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Lee Sin\t24\t62%", "-", "Viego\t18\t55%"].join("\n"),
      JUNGLE,
    )

    expect(result.layout).toBe("tabular_with_header")
    expect(result.rows.map((row) => row.championName)).toEqual(["Lee Sin", "Viego"])
    expect(result.unparsedLines).toEqual([
      { raw: "Champion\tGames\tWin Rate", reason: "header" },
      { raw: "-", reason: "page_noise" },
    ])
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("classifies a dash line between loose lines as page_noise", () => {
    const result = parseScoutStats(
      ["Karma 34 games 61% WR", "—", "Lee Sin 22 games 55% WR"].join("\n"),
      JUNGLE,
    )

    expect(result.layout).toBe("loose_lines")
    expect(result.rows).toHaveLength(2)
    expect(result.unparsedLines).toEqual([{ raw: "—", reason: "page_noise" }])
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("still reports copied navigation chrome as noise, with row_not_parsed", () => {
    const result = parseScoutStats(
      ["Champion\tGames\tWin Rate", "Lee Sin\t24\t62%", "Show more", "-"].join("\n"),
      JUNGLE,
    )

    expect(result.unparsedLines).toEqual([
      { raw: "Champion\tGames\tWin Rate", reason: "header" },
      { raw: "Show more", reason: "noise" },
      { raw: "-", reason: "page_noise" },
    ])
    expect(codes(result.warnings)).toContain("row_not_parsed")
  })
})

/* ==========================================================================
 * 34. A dash BETWEEN the two name lines — the phantom entry
 *
 * OP.GG prints a champion's name twice (icon caption plus label). When the
 * empty-column dash lands between the two, the first name line used to end its
 * own block with no numbers in it and was reported as
 * `{ raw: "Ahri", reason: "no_numbers" }` — i.e. the preview told the user
 * "Ahri was not recognised" while a perfectly correct Ahri row sat right above
 * it, and `row_not_parsed` fired on top.
 *
 * That is worse than the dash flood itself: a false statement about a champion
 * that WAS recognised. The doubled-name pairing therefore looks past pure
 * separator lines.
 * ========================================================================== */

describe("parseScoutStats — OP.GG raw page, a dash between the doubled names", () => {
  const withSeparator = (separator: string): string =>
    opgg(
      "Alle Champions",
      "40S",
      "40N",
      "50%",
      "1",
      "Ahri",
      separator,
      "Ahri",
      "36S",
      "36N",
      "50%",
      "2.60:1",
    )

  it("still reads the block as one champion with its real numbers", () => {
    const result = parseScoutStats(withSeparator("-"), SUPPORT)

    expect(result.rows).toHaveLength(1)
    expect([
      result.rows[0].championName,
      result.rows[0].wins,
      result.rows[0].losses,
      result.rows[0].games,
      result.rows[0].winrate,
      result.rows[0].kda,
    ]).toEqual(["Ahri", 36, 36, 72, 50, 2.6])
  })

  it("never claims the recognised champion was not recognised", () => {
    const result = parseScoutStats(withSeparator("-"), SUPPORT)

    expect(result.unparsedLines.some((line) => line.raw === "Ahri")).toBe(false)
    expect(result.unparsedLines.some((line) => line.reason === "no_numbers")).toBe(false)
    expect(codes(result.warnings)).not.toContain("row_not_parsed")
  })

  it("behaves identically for an en dash and an em dash", () => {
    for (const separator of ["–", "—", "- -"]) {
      const result = parseScoutStats(withSeparator(separator), SUPPORT)

      expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
      expect(result.rows[0].games).toBe(72)
      expect(result.unparsedLines.some((line) => line.raw === "Ahri")).toBe(false)
    }
  })

  it("does not pair two DIFFERENT champions across a dash", () => {
    // The dash must not turn "Ahri … Lux" into one block: Lux carries her own
    // numbers and has to stay her own row.
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2",
        "-",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
    expect(result.rows.map((row) => row.games)).toEqual([72, 38])
    expect(result.unparsedLines).toContainEqual({ raw: "-", reason: "page_noise" })
  })

  it("still reports a real champion that carries no numbers at all", () => {
    // The guard above must not swallow the honest `no_numbers` case.
    const result = parseScoutStats(
      opgg("Alle Champions", "40S", "40N", "50%", "1", "Ahri", "Ahri", "36S", "36N", "50%", "2", "Yasuo", "-", "Yasuo"),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(result.unparsedLines).toContainEqual({ raw: "Yasuo", reason: "no_numbers" })
    expect(codes(result.warnings)).toContain("row_not_parsed")
  })
})

describe("parseScoutStats — page noise never silences a genuine failure", () => {
  it("keeps a foreign line between two blocks as noise and still warns", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "-",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
        "2",
        "Mehr anzeigen",
        "3",
        "-",
        "Lux",
        "Lux",
        "23S",
        "15N",
        "61%",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri", "Lux"])
    expect(result.unparsedLines).toContainEqual({ raw: "Mehr anzeigen", reason: "noise" })
    expect(result.unparsedLines.filter((line) => line.reason === "page_noise")).toHaveLength(2)
    // `noise` is deliberately NOT a deliberate non-row reason: a foreign line
    // that looked like data and produced none is worth a warning.
    expect(codes(result.warnings)).toContain("row_not_parsed")
  })

  it("collapses a run of dashes into a single page_noise entry", () => {
    const result = parseScoutStats(
      opgg(
        "Alle Champions",
        "40S",
        "40N",
        "50%",
        "1",
        "-",
        "-",
        "-",
        "Ahri",
        "Ahri",
        "36S",
        "36N",
        "50%",
      ),
      SUPPORT,
    )

    expect(result.rows.map((row) => row.championName)).toEqual(["Ahri"])
    expect(result.unparsedLines.filter((line) => line.reason === "page_noise")).toEqual([
      { raw: "-", reason: "page_noise" },
    ])
  })
})
