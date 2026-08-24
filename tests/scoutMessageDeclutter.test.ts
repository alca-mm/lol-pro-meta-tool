import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import {
  SCOUT_REASON_PREVIEW_COUNT,
  fillPlaceholders,
  splitScoutReasons,
} from "../src/components/scout/scoutUiHelpers"
import type { ScoutReason } from "../src/scout/types"

/**
 * Message declutter (0.7.0).
 *
 * The user's complaint was that the scout shows too many messages a player does
 * not need. The measured floods were: 34 identical flex warnings per session
 * (fixed in the engine, pinned in tests/scoutAnalysis.test.ts), 275 reason lines
 * across 40 rows, 60 lines of per-source diagnosis on the player cards, one
 * uncapped bullet per rejected input line, and 40 repetitions of a sentence step
 * 2 already states once.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. Vitest runs in Node with no jsdom, so
 * nothing here renders. The pure-function part is real proof. The source scans
 * below prove STRUCTURE only: that a block sits inside a `details`, that a guard
 * is present. They do not prove a block is reached at runtime, its position on
 * screen, that CSS does not undo the collapse, or that the result looks calmer.
 * That stays a manual check, and the change file says so.
 */

/**
 * Comments are stripped before every scan below.
 *
 * WITHOUT THIS THE WHOLE STRUCTURAL HALF OF THIS FILE IS WORTHLESS, and that is
 * not a hypothetical: a review deleted the entire reason collapse from
 * ScoutShared.tsx, left `splitScoutReasons`, `visible.map`, `collapsed.map` and
 * `scout-reason-details` standing in a COMMENT, and the suite stayed green. The
 * components here carry long explanatory comments naming the very identifiers
 * these tests look for, so prose alone satisfied them.
 *
 * Same helper and same reasoning as tests/scoutUxDeclutter.test.ts.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

const read = (path: string): string => stripComments(readFileSync(path, "utf8"))

/** The raw file, for the rare assertion that really is about the whole text. */
const readRaw = (path: string): string => readFileSync(path, "utf8")

const IMPORT_PANEL = "src/components/scout/ScoutStatsImportPanel.tsx"
const SHARED = "src/components/scout/ScoutShared.tsx"
const INPUT_PANEL = "src/components/scout/ScoutInputPanel.tsx"
const PLAYER_CARD = "src/components/scout/ScoutPlayerCard.tsx"

const reason = (code: string): ScoutReason => ({ code }) as ScoutReason

/* -------------------------------------------------------------------------
 * 1. the reason split — the only part that is genuinely testable
 * ------------------------------------------------------------------------- */

describe("splitScoutReasons", () => {
  it("keeps the leading reasons visible", () => {
    const reasons = [reason("onrole_signal"), reason("strong_kda"), reason("small_sample")]
    const { visible } = splitScoutReasons(reasons)

    expect(visible).toHaveLength(SCOUT_REASON_PREVIEW_COUNT)
    expect(visible[0]).toBe(reasons[0])
    expect(visible[1]).toBe(reasons[1])
  })

  it("loses nothing: the two halves are the input, in order", () => {
    // The property that matters most. A "cap" that dropped reasons would be
    // hiding evidence, not decluttering.
    const reasons = [
      reason("onrole_signal"),
      reason("strong_kda"),
      reason("small_sample"),
      reason("played_recently"),
      reason("manual_entry_only"),
    ]
    const { visible, collapsed } = splitScoutReasons(reasons)

    expect([...visible, ...collapsed]).toEqual(reasons)
    expect(visible.length + collapsed.length).toBe(reasons.length)
  })

  it("produces an empty tail for a short list, so no empty block is rendered", () => {
    for (const size of [0, 1, SCOUT_REASON_PREVIEW_COUNT]) {
      const reasons = Array.from({ length: size }, (_, index) => reason(`r${index}`))
      const { visible, collapsed } = splitScoutReasons(reasons)

      expect(collapsed, `size ${size}`).toEqual([])
      expect(visible, `size ${size}`).toHaveLength(size)
    }
  })

  it("collapses the tail as soon as there is one", () => {
    const reasons = Array.from({ length: SCOUT_REASON_PREVIEW_COUNT + 1 }, (_, index) =>
      reason(`r${index}`),
    )
    expect(splitScoutReasons(reasons).collapsed).toHaveLength(1)
  })

  it("does not mutate its input", () => {
    const reasons = [reason("a"), reason("b"), reason("c")]
    splitScoutReasons(reasons)
    expect(reasons).toHaveLength(3)
  })

  it("previews at least one reason, so a recommendation is never unexplained", () => {
    // Every recommendation carries at least one reason by contract. A preview
    // count of 0 would hide all of them and silently break that promise.
    expect(SCOUT_REASON_PREVIEW_COUNT).toBeGreaterThanOrEqual(1)
  })

  it("has a summary label in both languages", () => {
    for (const [lang, dict] of [["de", de], ["en", en]] as const) {
      expect(dict.scout_moreReasons.trim().length, lang).toBeGreaterThan(0)
      expect(dict.scout_moreReasons, lang).not.toContain("scout_")
    }
  })
})

/* -------------------------------------------------------------------------
 * 2. the truncated-sentence defect
 * ------------------------------------------------------------------------- */

describe("the import preview never renders a truncated sentence", () => {
  it("shows what a missing role param actually produced", () => {
    // This is the defect, reproduced at the layer where it is reproducible.
    // `fillPlaceholders` replaces a missing param with "" and `tidyText` trims,
    // so the row did not print the word "undefined" — it printed a sentence with
    // a dangling colon and nothing after it. The role select could be cleared
    // while a parsed preview was still on screen, so every row read like this.
    expect(fillPlaceholders(de.scout_import_row_appliedRole, { role: "" })).toBe(
      "Wird übernommen als:",
    )
    expect(fillPlaceholders(en.scout_import_row_appliedRole, { role: "" })).toBe("Recorded as:")
  })

  it("builds the sentence only from a role that really is selected", () => {
    const source = read(IMPORT_PANEL)
    expect(source.length).toBeGreaterThan(2000)

    // A review found the two earlier assertions here VACUOUS: both survived
    // replacing the JSX guard with `{true && (`, because the strings they
    // looked for appear elsewhere in the file. These pin the single expression
    // that actually produces the label.
    expect(source).toContain("const appliedRoleLabel =")
    expect(source).toContain("selectedRole === null")
    expect(source).toContain("{ role: appliedRoleLabel }")
  })

  it("decides from the LIVE role, never from the parse-time snapshot", () => {
    const source = read(IMPORT_PANEL)

    // `row.roleMismatch` is fixed when the paste is parsed, while
    // `selectedRole` keeps changing afterwards: re-seating the player flips the
    // selection without clearing the preview, and for the OP.GG raw layout
    // `detectedRole` is always "unknown" so the flag is permanently false. A
    // guard built on it hid the line exactly where it was needed.
    expect(source).toContain('row.detectedRole !== "unknown"')
    expect(source).toContain("row.detectedRole !== selectedRole")
    expect(source).not.toContain("row.roleMismatch &&")
  })
})

/* -------------------------------------------------------------------------
 * 3. structure scans — diagnosis sits one click away, and is not deleted
 * ------------------------------------------------------------------------- */

describe("diagnostic blocks are collapsed, not removed", () => {
  /** Anti-vacuity gate: prove we read real files AND that prose cannot pass. */
  it("reads real component sources", () => {
    for (const path of [IMPORT_PANEL, SHARED, INPUT_PANEL, PLAYER_CARD]) {
      expect(read(path).length, path).toBeGreaterThan(1000)
    }
  })

  it("cannot be satisfied by a comment", () => {
    // The scanner self-test. Every structural assertion below runs on
    // `read()`, so this proves what those assertions are actually looking at.
    const disguised = [
      "// splitScoutReasons scout-reason-details visible.map collapsed.map",
      "/* scout_moreReasons scout-source-details scout-unparsed-details */",
      "const real = 1",
    ].join("\n")

    const scanned = stripComments(disguised)
    for (const token of [
      "splitScoutReasons",
      "scout-reason-details",
      "visible.map",
      "collapsed.map",
      "scout_moreReasons",
      "scout-source-details",
      "scout-unparsed-details",
    ]) {
      expect(scanned, token).not.toContain(token)
    }
    expect(scanned).toContain("const real = 1")
    // A `//` inside a URL must survive, or the stripper would eat real code.
    expect(stripComments('const u = "https://a.example"')).toContain("https://a.example")
  })

  it("puts the reason tail behind a details block", () => {
    const source = read(SHARED)
    expect(source).toContain("splitScoutReasons")
    expect(source).toContain("scout_moreReasons")
    expect(source).toContain("scout-reason-details")
    // Both halves are still rendered, so nothing is hidden for good.
    expect(source).toContain("visible.map")
    expect(source).toContain("collapsed.map")
  })

  it("puts the rejected input lines behind a details block but keeps the hint", () => {
    const source = read(INPUT_PANEL)
    expect(source).toContain("scout-unparsed-details")
    expect(source).toContain("scout_unparsedLines")
    // The actionable half stays in the open.
    expect(source).toContain("scout_unparsedHint")
    // And the evidence itself is still there.
    expect(source).toContain("unparsedLines.map")
  })

  it("puts the per-source diagnosis behind a details block but keeps the link", () => {
    const source = read(PLAYER_CARD)
    expect(source).toContain("scout-source-details")
    expect(source).toContain("scout_player_sourceDetails")
    // The prose that moved: status, note, and the reason a site cannot be read.
    expect(source).toContain("scoutStatusKey")
    expect(source).toContain("scoutNoteKey")
    expect(source).toContain("scoutBlockedKey")
    // The link is the action and must stay in the open, so it may NOT be inside
    // the details element.
    const detailsStart = source.indexOf("<details")
    expect(detailsStart).toBeGreaterThan(0)
    expect(source.indexOf("scout-source-link")).toBeLessThan(detailsStart)
  })

  it("never opens any of them by default", () => {
    // tests/scoutUxDeclutter.test.ts owns this rule catalogue-wide; restated
    // here for the blocks this change introduced, so a failure names them.
    for (const path of [SHARED, INPUT_PANEL, PLAYER_CARD]) {
      // Raw on purpose: an `open` inside a commented-out block is still a
      // mistake waiting to be uncommented.
      expect(readRaw(path), path).not.toMatch(/<details[^>]*\bopen\b/)
    }
  })

  it("says the same empty-state sentence only once per screen", () => {
    const source = read(IMPORT_PANEL)
    const occurrences = source.split('t("scout_import_playerNone")').length - 1
    expect(occurrences).toBe(1)
  })
})

/* -------------------------------------------------------------------------
 * 4. what must stay loud
 * ------------------------------------------------------------------------- */

describe("nothing actionable was quietened", () => {
  it("keeps every per-row import warning", () => {
    const source = read(IMPORT_PANEL)
    // These are the warnings that stop wrong data being applied. They are
    // rendered per row on purpose and must not move behind a details block.
    expect(source).toContain("row.warnings.map")
    expect(source).toContain("translateScoutImportWarning")
  })

  it("keeps the blocking messages and their live regions", () => {
    const source = read(IMPORT_PANEL)
    expect(source).toContain("scout_import_applyBlocked")
    expect(source).toContain("scout_import_roleRequired")
    expect(source).toContain('role="alert"')
    expect(source).toContain('role="status"')
  })

  it("keeps the editor's field-level validation visible", () => {
    const source = read("src/components/scout/ScoutDataEditor.tsx")
    for (const key of [
      "scout_manual_championInvalid",
      "scout_manual_gamesInvalid",
      "scout_manual_winrateInvalid",
      "scout_manual_kdaInvalid",
    ]) {
      expect(source, key).toContain(key)
    }
    // None of it behind a details block: an invalid field needs fixing now.
    expect(source).not.toContain("<details")
  })

  it("keeps the data-loss warning in the open", () => {
    const source = read("src/components/scout/ScoutRemovedPlayersPanel.tsx")
    expect(source).toContain("data_loss_on_reparse")
    expect(source).not.toContain("<details")
  })
})
