import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import {
  SCOUT_LIST_PREVIEW_COUNT,
  SCOUT_REASON_PREVIEW_COUNT,
  banPhaseFilterOptions,
  fillPlaceholders,
  filterBansByPhase,
  isBanPhaseFilterEnabled,
  rankBanCandidates,
  splitScoutList,
  splitScoutReasons,
  summarizeBanCandidate,
} from "../src/components/scout/scoutUiHelpers"
import type { BanCandidate, ScoutReason } from "../src/scout/types"

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
const ANALYSIS_PANEL = "src/components/scout/ScoutAnalysisPanel.tsx"
const BAN_PANEL = "src/components/scout/ScoutBanPlanPanel.tsx"

const reason = (code: string): ScoutReason => ({ code }) as ScoutReason

/**
 * Ein Ban-Kandidat mit tragbaren Vorgabewerten.
 *
 * Auf Modulebene, weil ihn seit 0.7.5 zwei describe-Bloecke brauchen: die
 * Zeilen-Projektion und der Phasenfilter. Eine zweite Fabrik waere eine zweite
 * Stelle, an der ein neues Pflichtfeld vergessen wird.
 */
const candidate = (overrides: Partial<BanCandidate> = {}): BanCandidate =>
  ({
    championName: "Karma",
    championKey: "karma",
    priority: 0.8,
    confidence: "high",
    reasons: [],
    signals: [],
    roles: [],
    affectedPlayerIds: ["p1"],
    isOverlap: false,
    isFlex: false,
    targetPlayerId: null,
    targetRole: null,
    lineupRoles: [],
    roleFit: "unknown",
    substituteOnly: false,
    ...overrides,
  }) as BanCandidate

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

describe("splitScoutList", () => {
  const items = ["a", "b", "c", "d", "e"]

  it("loses nothing: the two halves are the input, in order", () => {
    // The property that separates this from the `slice()` calls it replaced.
    // A cap that drops its tail tells the reader the list was short.
    for (const preview of [0, 1, 2, 3, 5, 9]) {
      const { visible, collapsed } = splitScoutList(items, preview)
      expect([...visible, ...collapsed], `preview ${preview}`).toEqual(items)
    }
  })

  it("counts the tail so a summary never has to recount it", () => {
    for (const preview of [0, 1, 3, 5, 9]) {
      const split = splitScoutList(items, preview)
      expect(split.collapsedCount, `preview ${preview}`).toBe(split.collapsed.length)
    }
  })

  it("collapses nothing when everything fits", () => {
    for (const preview of [items.length, items.length + 1, 99]) {
      const split = splitScoutList(items, preview)
      expect(split.collapsed, `preview ${preview}`).toEqual([])
      expect(split.collapsedCount).toBe(0)
      expect(split.visible).toEqual(items)
    }
  })

  it("handles the empty list without inventing a summary", () => {
    const split = splitScoutList([], SCOUT_LIST_PREVIEW_COUNT)
    expect(split.visible).toEqual([])
    expect(split.collapsed).toEqual([])
    expect(split.collapsedCount).toBe(0)
  })

  it("treats a broken preview count as zero rather than throwing", () => {
    // A panel that shows everything collapsed is survivable; a panel that
    // crashes is not.
    for (const bad of [-1, -99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const split = splitScoutList(items, bad)
      expect([...split.visible, ...split.collapsed], String(bad)).toEqual(items)
    }
    expect(splitScoutList(items, Number.NaN).visible).toEqual([])
  })

  it("does not mutate its input", () => {
    const original = [...items]
    splitScoutList(items, 2)
    expect(items).toEqual(original)
  })

  it("previews at least one row, so a list is never entirely hidden", () => {
    expect(SCOUT_LIST_PREVIEW_COUNT).toBeGreaterThanOrEqual(1)
  })

  it("is what splitScoutReasons is built from, so there is one rule", () => {
    const reasons = [reason("a"), reason("b"), reason("c"), reason("d")]
    const viaList = splitScoutList(reasons, SCOUT_REASON_PREVIEW_COUNT)
    const viaReasons = splitScoutReasons(reasons)

    expect(viaReasons.visible).toEqual(viaList.visible)
    expect(viaReasons.collapsed).toEqual(viaList.collapsed)
  })
})

describe("summarizeBanCandidate", () => {
  const NAMES = { p1: "Alice#EUW", p2: "Bob#EUW", p3: "Cara#EUW" }

  it("reports the phase the engine assigned", () => {
    for (const phase of ["safe", "target", "situational"] as const) {
      expect(summarizeBanCandidate(candidate({ phase }), NAMES).phase, phase).toBe(phase)
    }
  })

  it("reports no phase when the engine assigned none", () => {
    // `phase` is optional on the contract. Inventing one would put a badge on a
    // row the engine never classified.
    expect(summarizeBanCandidate(candidate(), NAMES).phase).toBeUndefined()
  })

  it("names every affected player, in the candidate's own order", () => {
    // The engine sorts `affectedPlayerIds` by descending signal strength, and
    // that order is the useful one: the player the ban hurts most comes first.
    const context = summarizeBanCandidate(
      candidate({ affectedPlayerIds: ["p3", "p1", "p2"], isOverlap: true }),
      NAMES,
    )

    expect(context.affectedPlayerNames).toEqual(["Cara#EUW", "Alice#EUW", "Bob#EUW"])
    expect(context.affectedPlayerCount).toBe(3)
    expect(context.isOverlap).toBe(true)
  })

  it("does not put an overlap badge on a single-player candidate", () => {
    const context = summarizeBanCandidate(candidate({ affectedPlayerIds: ["p1"] }), NAMES)

    expect(context.isOverlap).toBe(false)
    expect(context.affectedPlayerCount).toBe(1)
    expect(context.affectedPlayerNames).toEqual(["Alice#EUW"])
  })

  it("counts the ids, not the names it could resolve", () => {
    // A missing name must never make a ban look like it hits fewer players than
    // it does. The count is the truth; the names are the presentation.
    const context = summarizeBanCandidate(
      candidate({ affectedPlayerIds: ["p1", "ghost"], isOverlap: true }),
      NAMES,
    )

    expect(context.affectedPlayerCount).toBe(2)
    expect(context.affectedPlayerNames).toEqual(["Alice#EUW"])
  })

  it("prints no raw id when a name is unknown", () => {
    const context = summarizeBanCandidate(candidate({ affectedPlayerIds: ["ghost"] }), NAMES)
    expect(context.affectedPlayerNames).toEqual([])
  })

  it("survives an empty name lookup without inventing anything", () => {
    const context = summarizeBanCandidate(candidate({ affectedPlayerIds: ["p1", "p2"] }))

    expect(context.affectedPlayerNames).toEqual([])
    expect(context.affectedPlayerCount).toBe(2)
    expect(context.targetPlayerName).toBeUndefined()
  })

  it("names the target only when the engine named one", () => {
    expect(summarizeBanCandidate(candidate({ targetPlayerId: "p2" }), NAMES).targetPlayerName).toBe(
      "Bob#EUW",
    )
    expect(summarizeBanCandidate(candidate(), NAMES).targetPlayerName).toBeUndefined()
  })

  it("does not mutate the candidate", () => {
    const subject = candidate({ affectedPlayerIds: ["p1", "p2"], isOverlap: true })
    const before = JSON.stringify(subject)
    summarizeBanCandidate(subject, NAMES)
    expect(JSON.stringify(subject)).toBe(before)
  })
})

describe("der Phasenfilter des Ban-Plans", () => {
  const banOf = (championName: string, phase?: "safe" | "target" | "situational"): BanCandidate =>
    candidate({ championName, ...(phase === undefined ? {} : { phase }) })

  // Eine priorisierte Liste in Prioritaetsreihenfolge, Phasen bewusst gemischt,
  // damit "Reihenfolge bleibt erhalten" ueberhaupt etwas beweisen kann.
  const PLAN: readonly BanCandidate[] = [
    banOf("Ahri", "safe"),
    banOf("Zed", "target"),
    banOf("Karma", "safe"),
    banOf("Yasuo", "situational"),
    banOf("Lee Sin", "target"),
  ]

  const names = (entries: readonly { candidate: BanCandidate }[]): string[] =>
    entries.map((entry) => entry.candidate.championName)

  describe("rankBanCandidates", () => {
    it("nummeriert ab 1 in der Reihenfolge der priorisierten Liste", () => {
      expect(rankBanCandidates(PLAN).map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5])
      expect(names(rankBanCandidates(PLAN))).toEqual([
        "Ahri",
        "Zed",
        "Karma",
        "Yasuo",
        "Lee Sin",
      ])
    })

    it("mutiert die Eingabe nicht", () => {
      const before = JSON.stringify(PLAN)
      rankBanCandidates(PLAN)
      expect(JSON.stringify(PLAN)).toBe(before)
    })

    it("kommt mit einer leeren Liste zurecht", () => {
      expect(rankBanCandidates([])).toEqual([])
    })
  })

  describe("filterBansByPhase", () => {
    const ranked = rankBanCandidates(PLAN)

    it("gibt bei all alles zurueck, in unveraenderter Reihenfolge", () => {
      expect(names(filterBansByPhase(ranked, "all"))).toEqual([
        "Ahri",
        "Zed",
        "Karma",
        "Yasuo",
        "Lee Sin",
      ])
    })

    it("gibt bei safe NUR safe zurueck", () => {
      expect(names(filterBansByPhase(ranked, "safe"))).toEqual(["Ahri", "Karma"])
    })

    it("gibt bei target NUR target zurueck", () => {
      expect(names(filterBansByPhase(ranked, "target"))).toEqual(["Zed", "Lee Sin"])
    })

    it("gibt bei situational NUR situational zurueck", () => {
      expect(names(filterBansByPhase(ranked, "situational"))).toEqual(["Yasuo"])
    })

    it("behaelt den Rang aus der VOLLEN Liste bei", () => {
      // Der Kern der Nummerierungsentscheidung: "#5" heisst weiterhin
      // "fuenftwichtigster Ban insgesamt", nicht "zweite Zeile auf dem Schirm".
      expect(filterBansByPhase(ranked, "target").map((entry) => entry.rank)).toEqual([2, 5])
      expect(filterBansByPhase(ranked, "safe").map((entry) => entry.rank)).toEqual([1, 3])
    })

    it("mutiert weder Eingabe noch Kandidaten", () => {
      const before = JSON.stringify(PLAN)
      filterBansByPhase(ranked, "safe")
      filterBansByPhase(ranked, "all")
      expect(JSON.stringify(PLAN)).toBe(before)
      // `all` gibt eine KOPIE zurueck, kein Alias auf die Eingabe.
      const copy = filterBansByPhase(ranked, "all")
      expect(copy).not.toBe(ranked)
      expect(copy).toEqual(ranked)
    })

    it("zeigt einen Kandidaten ohne Phase nur unter all", () => {
      // Kann die Engine nicht erzeugen: resolvePhase() ist total und faellt auf
      // situational zurueck. Der Contract laesst `phase` aber optional, und ihn
      // ueberall zu verstecken hiesse, einen Ban lautlos zu verlieren.
      const withGap = rankBanCandidates([banOf("Ahri", "safe"), banOf("Mystery")])

      expect(names(filterBansByPhase(withGap, "all"))).toEqual(["Ahri", "Mystery"])
      for (const phase of ["safe", "target", "situational"] as const) {
        expect(names(filterBansByPhase(withGap, phase)), phase).not.toContain("Mystery")
      }
    })
  })

  describe("banPhaseFilterOptions", () => {
    it("liefert alle vier in Anzeigereihenfolge, all zuerst", () => {
      expect(banPhaseFilterOptions(rankBanCandidates(PLAN))).toEqual([
        { filter: "all", count: 5 },
        { filter: "safe", count: 2 },
        { filter: "target", count: 2 },
        { filter: "situational", count: 1 },
      ])
    })

    it("meldet eine leere Phase mit 0, statt sie wegzulassen", () => {
      const options = banPhaseFilterOptions(rankBanCandidates([banOf("Ahri", "safe")]))
      expect(options.map((option) => option.filter)).toEqual([
        "all",
        "safe",
        "target",
        "situational",
      ])
      expect(options.map((option) => option.count)).toEqual([1, 1, 0, 0])
    })

    it("meldet bei leerem Plan viermal 0", () => {
      expect(banPhaseFilterOptions([]).map((option) => option.count)).toEqual([0, 0, 0, 0])
    })

    it("die Zahl auf dem Chip IST die Laenge der Liste, die er oeffnet", () => {
      // Die eigentliche Zusage dieses Helfers. Frueher kam die Zahl aus
      // TeamBanPlan.phases und die Liste waere aus prioritizedBans gekommen:
      // zwei Quellen fuer eine Aussage, genau die Form von Defekt, die dieses
      // Modul schon zweimal produziert hat.
      const ranked = rankBanCandidates(PLAN)
      for (const option of banPhaseFilterOptions(ranked)) {
        expect(filterBansByPhase(ranked, option.filter), option.filter).toHaveLength(option.count)
      }
    })
  })

  describe("isBanPhaseFilterEnabled", () => {
    it("laesst eine gefuellte Phase anklicken", () => {
      expect(isBanPhaseFilterEnabled({ filter: "safe", count: 3 }, "all")).toBe(true)
    })

    it("sperrt eine leere Phase", () => {
      // Ein Klick auf eine Null fuehrt garantiert zu einer leeren Liste, und die
      // Null auf dem Chip sagt bereits alles.
      expect(isBanPhaseFilterEnabled({ filter: "safe", count: 0 }, "all")).toBe(false)
      expect(isBanPhaseFilterEnabled({ filter: "target", count: 0 }, "all")).toBe(false)
      expect(isBanPhaseFilterEnabled({ filter: "situational", count: 0 }, "all")).toBe(false)
    })

    it("sperrt all NIEMALS, auch nicht bei 0", () => {
      // all ist der Rueckweg und muss erreichbar bleiben.
      expect(isBanPhaseFilterEnabled({ filter: "all", count: 0 }, "safe")).toBe(true)
    })

    it("sperrt den AKTIVEN Chip niemals, auch nicht bei 0", () => {
      // Daten koennen sich unter einem gesetzten Filter aendern. Den gedrueckten
      // Button zu deaktivieren wuerde den Tastaturfokus verlieren und
      // aria-pressed auf ein totes Element setzen.
      expect(isBanPhaseFilterEnabled({ filter: "safe", count: 0 }, "safe")).toBe(true)
      expect(isBanPhaseFilterEnabled({ filter: "safe", count: 0 }, "target")).toBe(false)
    })
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
    for (const path of [SHARED, INPUT_PANEL, PLAYER_CARD, ANALYSIS_PANEL, BAN_PANEL]) {
      // Raw on purpose: an `open` inside a commented-out block is still a
      // mistake waiting to be uncommented.
      expect(readRaw(path), path).not.toMatch(/<details[^>]*\bopen\b/)
    }
  })

  it("collapses the tail of the weaknesses list", () => {
    const source = read(ANALYSIS_PANEL)

    // It was the one list in this panel that rendered every item: measured on a
    // real session it reached 30 rows carrying 135 reason lines.
    expect(source).toContain("splitScoutList")
    expect(source).toContain("SCOUT_MORE_WEAKNESSES_KEYS")
    expect(source).toContain("scout-list-details")
    // And the raw map over the full list is gone.
    expect(source).not.toContain("player.weaknesses.map")
  })

  it("collapses the tail of the one remaining ban list", () => {
    const source = read(BAN_PANEL)

    // The phase groups and the overlap group are gone: they repeated the
    // prioritised candidates instead of adding anything. What is left is the
    // one canonical list, and it still caps.
    expect(source).toContain("splitScoutList")
    expect(source).toContain("SCOUT_MORE_BANS_KEYS")
    expect(source).toContain("scout-list-details")
  })

  it("die Phasenanzeige sind echte Buttons, keine statische Textzeile", () => {
    // Bis 0.7.4 stand hier eine reine Zaehlzeile. Sie ist jetzt bedienbar, und
    // zwar als <button>: Tastatur, Fokus und Aktivierung kommen dann vom
    // Browser, nicht aus nachgebautem Klickverhalten auf einem <span>.
    const source = read(BAN_PANEL)
    expect(source).toContain('role="group"')
    expect(source).toContain('aria-label={t("scout_banPhaseFilterLabel")}')
    expect(source).toContain("onClick={() => setPhaseFilter(option.filter)}")
    expect(source, "die Phasenzeile ist wieder statisch").not.toContain(
      "scout-ban-phase-summary",
    )

    // DAS ELEMENT, nicht nur seine Attribute. Eine Mutationsprobe hat `<button`
    // durch `<span` ersetzt und dieser Test blieb gruen: `type="button"`,
    // `onClick` und `aria-pressed` standen ja alle noch da. Ein klickbares
    // <span> ist aber nicht fokussierbar und reagiert weder auf Enter noch auf
    // Leertaste, und genau das ist der Unterschied, um den es hier geht.
    const groupAt = source.indexOf('className="scout-ban-phase-filter"')
    expect(groupAt, "die Filtergruppe fehlt").toBeGreaterThan(-1)
    const group = source.slice(groupAt, groupAt + 1400)

    expect(group, "die Chips sind keine <button> mehr").toContain("<button")
    expect(group).toContain('type="button"')
    expect(group, "ein Chip ist ein klickbares <span> geworden").not.toMatch(
      /<span[^>]*onClick/,
    )
    expect(group, "ein Chip ist ein klickbares <div> geworden").not.toMatch(/<div[^>]*onClick/)
  })

  it("der aktive Filter wird angesagt und nicht nur eingefaerbt", () => {
    const source = read(BAN_PANEL)
    expect(source, "aria-pressed fehlt, der gedrueckte Zustand ist nur sichtbar").toContain(
      "aria-pressed={active}",
    )
    // Und die nicht-farbliche Haelfte: der aktive Chip traegt eine eigene Klasse,
    // an der das CSS eine Markierung haengt.
    expect(source).toContain("scout-ban-phase-chip-active")
    const css = readRaw("src/index.css")
    expect(css, "der aktive Chip hat keine Markierung ausser Farbe").toContain(
      ".scout-ban-phase-chip-active::before",
    )
  })

  it("eine leere Phase ist gesperrt, all und der aktive Chip nie", () => {
    // Option A der Produktentscheidung. Die Regel selbst ist oben als reine
    // Funktion getestet; hier wird gepinnt, dass das Panel sie auch benutzt.
    const source = read(BAN_PANEL)
    expect(source).toContain("disabled={!isBanPhaseFilterEnabled(option, phaseFilter)}")
  })

  it("filtert VOR dem Kappen, nicht danach", () => {
    // Andersherum wuerde die volle Liste bei acht gekappt und ERST DANN nach
    // Phase gesiebt: "Gezielt" zeigte dann die gezielten Bans, die zufaellig in
    // die ersten acht gefallen sind, und verschwiege den Rest.
    const source = read(BAN_PANEL)
    const filterAt = source.indexOf("filterBansByPhase(ranked, phaseFilter)")
    const splitAt = source.indexOf("splitScoutList(visibleBans, MAX_PRIORITIZED)")

    expect(filterAt, "der Filter wird gar nicht angewandt").toBeGreaterThan(-1)
    expect(splitAt, "die Liste wird nicht mehr gekappt").toBeGreaterThan(-1)
    expect(splitAt, "gekappt wird vor dem Filtern").toBeGreaterThan(filterAt)
    expect(source, "gekappt wird weiterhin die ungefilterte Liste").not.toContain(
      "splitScoutList(ranked",
    )
  })

  it("der Filter beruehrt den Export nicht", () => {
    // Der Export kopiert den vollen Plan. Ihn an den Panel-Zustand zu haengen
    // hiesse, dass der kopierte Text davon abhaengt, welcher Chip gerade
    // gedrueckt war.
    const exportSource = read("src/components/scout/scoutExport.ts")
    for (const forbidden of [
      "phaseFilter",
      "filterBansByPhase",
      "banPhaseFilterOptions",
      "rankBanCandidates",
    ]) {
      expect(exportSource, `scoutExport.ts kennt jetzt ${forbidden}`).not.toContain(forbidden)
    }
  })

  it("keeps the ban numbering continuous across the fold", () => {
    // Restarting at 1 inside the collapsed block would read as a second,
    // separate list rather than the rest of this one.
    //
    // Since 0.7.5 the rank travels ON the candidate instead of being computed
    // from the loop index, because the phase filter makes the positions
    // non-contiguous. Continuity across the fold is a consequence of that, and
    // what has to be pinned is where the rank comes from.
    const source = read(BAN_PANEL)
    expect(source).toContain("rankBanCandidates(banPlan.prioritizedBans)")
    expect(source).toContain("rank={entry.rank}")
    expect(source, "the rank is being recomputed from the visible position").not.toContain(
      "index + 1",
    )
    expect(source).toContain("teamRows(prioritized.collapsed)")
  })

  it("puts a count in every collapse summary", () => {
    // A bare "show more" hides how much more.
    //
    // The whole CALL, not the identifier: a probe showed
    // `toContain("scoutPluralMessage")` was already satisfied by the import
    // line, so the summary could drop back to a countless label and stay green.
    expect(read(ANALYSIS_PANEL)).toContain(
      "<summary>{scoutPluralMessage(t, collapsedCount, moreKeys)}</summary>",
    )
    expect(read(BAN_PANEL)).toContain(
      "scoutPluralMessage(\n                                            t,\n                                            prioritized.collapsedCount,",
    )
  })

  it("opens only the head of the ban list, not the whole thing", () => {
    // Rendering the full list in the open block and the tail again in the fold
    // shows everything twice and caps nothing, and no `.map` guard notices
    // because the mapping lives in a helper.
    const source = read(BAN_PANEL)
    expect(source).toContain("teamRows(prioritized.visible)")
    expect(source, "the whole list is rendered open again").not.toContain("teamRows(ranked)")
    expect(source, "the filter is bypassed in the open half").not.toContain("teamRows(visibleBans)")
  })

  it("no longer cuts a list without saying so", () => {
    // THE POINT OF THIS CHANGE. Five lists used to end on `.slice(0, n)`, which
    // shows n rows and drops the rest with no trace: at 40 champions the user
    // saw five threats and had no way to know 35 existed. The preview sizes are
    // unchanged; what is new is that the remainder is reachable.
    //
    // The literal slice calls are asserted gone, because that is the shape the
    // defect had, and a reader adding a sixth list will copy what is here.
    for (const [path, cuts] of [
      [ANALYSIS_PANEL, [".slice(0, MAX_THREATS)", ".slice(0, MAX_BANS)", ".slice(0, MAX_COMFORT)"]],
      [BAN_PANEL, [".slice(0, MAX_PRIORITIZED)", "MAX_TARGET_PER_PLAYER,\n"]],
    ] as const) {
      const source = read(path)
      for (const cut of cuts) {
        expect(source, `${path} still cuts with ${cut}`).not.toContain(cut)
      }
    }
  })

  it("keeps every preview at the size it always had", () => {
    // The change is transparency, not a different amount of open content. If a
    // preview size moved, the panel would look different for a reason nobody
    // asked for.
    const analysis = read(ANALYSIS_PANEL)
    expect(analysis).toContain("const MAX_THREATS = 5")
    expect(analysis).toContain("const MAX_BANS = 3")
    expect(analysis).toContain("const MAX_COMFORT = 3")
    expect(analysis).toContain("previewCount={MAX_THREATS}")
    expect(analysis).toContain("previewCount={MAX_COMFORT}")
    expect(analysis).toContain("splitScoutList(player.targetBans, MAX_BANS)")

    const ban = read(BAN_PANEL)
    expect(ban).toContain("const MAX_PRIORITIZED = 8")
    expect(ban).toContain("const MAX_TARGET_PER_PLAYER = 3")
    // Since 0.7.5 the cap sits on the FILTERED list, not on the raw plan. The
    // preview size is unchanged; capping before filtering would show whichever
    // targeted bans happened to fall inside the first eight and hide the rest.
    expect(ban).toContain("splitScoutList(visibleBans, MAX_PRIORITIZED)")
    // The per-player section is a name list now, so its cap is a slice on names
    // rather than a collapsible row list. Nothing is hidden that a full row
    // would have shown: the same candidates sit in the canonical list above,
    // and ScoutAnalysisPanel still renders them per player with that player's
    // own numbers.
    expect(ban).toContain(".slice(0, MAX_TARGET_PER_PLAYER)")
  })

  it("names the cut in the per-player overview instead of hiding it", () => {
    // The per-player line ends after three names because a player can be hit by
    // a dozen candidates. An UNMARKED cut claims to be the whole story, which is
    // exactly the silent-slice defect 0.7.3 spent a whole pass removing.
    const source = read(BAN_PANEL)
    expect(source).toContain("own.length > MAX_TARGET_PER_PLAYER &&")
    expect(source).toContain("own.length - MAX_TARGET_PER_PLAYER")
  })

  it("says `keine` rather than the panel-wide empty state per player", () => {
    // `scout_teamPlanEmpty` is a whole sentence about the panel having no data
    // at all. Printed after "Alice - Mid: " it reads as a non sequitur, and it
    // says the wrong thing: the plan is fine, this one player is simply not
    // targeted by anything.
    const source = read(BAN_PANEL)
    expect(source).toContain('t("scout_bansByPlayerNone")')
    // Still used for the real empty state, once.
    expect(source.split('t("scout_teamPlanEmpty")')).toHaveLength(2)
  })

  it("puts the phase on the row instead of in a heading", () => {
    // Asserted on the CALL, not the identifier: `scoutBanPhaseKey` also appears
    // in the import list, so a bare toContain would survive deleting the badge.
    const row = read(SHARED)
    expect(row).toContain("context.phase !== undefined &&")
    expect(row).toContain("t(scoutBanPhaseKey(context.phase))")
  })

  it("puts the overlap fact on the row instead of in a second list", () => {
    // The overlap group is gone. What it said - "this ban hurts more than one
    // of them" - has to still be visible, or the deletion lost information
    // rather than removing a repeat.
    const row = read(SHARED)
    expect(row).toContain("context.isOverlap &&")
    expect(row).toContain('t("scout_banOverlapBadge")')
    expect(row).toContain("count: context.affectedPlayerCount")
  })

  it("drives the overlap badge off the engine flag, not off resolved names", () => {
    // A per-player card passes no name lookup at all. Gating the badge on
    // `affectedPlayerNames.length` would silently drop it there, in the one
    // place where "this also hits someone else" is most worth knowing.
    const row = read(SHARED)
    const badgeAt = row.indexOf("scout_banOverlapBadge")
    expect(badgeAt, "the overlap badge is gone entirely").toBeGreaterThan(-1)

    // The condition the badge actually hangs off, read from the source right
    // in front of it rather than from anywhere in the file.
    const guard = row.slice(Math.max(0, badgeAt - 220), badgeAt)
    expect(guard, "the overlap badge lost its engine-flag guard").toContain("context.isOverlap")
    expect(guard, "the overlap badge was re-gated on resolved names").not.toContain(
      "affectedPlayerNames",
    )
  })

  it("names the affected players under the row", () => {
    const row = read(SHARED)
    expect(row).toContain("context.affectedPlayerNames.length > 1 &&")
    expect(row).toContain('t("scout_banAffectedPlayers")')
    expect(row).toContain("context.affectedPlayerNames.join")
  })

  it("shows each ban candidate once, not once per grouping", () => {
    // THE POINT OF THIS REFACTOR. A champion used to occupy up to four full
    // rows: the prioritised list, its phase, the overlap list, and every
    // player it hits.
    const source = read(BAN_PANEL)

    expect(source, "BanGroup is back").not.toContain("function BanGroup")
    expect(source, "a second ban list is being rendered").not.toContain("<BanGroup")
    // The context those lists carried now rides on the row itself.
    expect(source).toContain("banPhaseFilterOptions")
    expect(source).toContain("displayNameById")
    // And the phase chips FILTER the one list, they do not open a second one.
    expect(source, "a chip renders its own ban list again").not.toContain(
      "teamRows(filterBansByPhase",
    )

    const row = read(SHARED)
    expect(row).toContain("scoutBanPhaseKey")
    expect(row).toContain("scout_banAffectedPlayers")
    expect(row).toContain("summarizeBanCandidate")
  })

  it("numbers the newly collapsed ban lists continuously", () => {
    for (const [path, call] of [
      [ANALYSIS_PANEL, "banRows(bans.collapsed, bans.visible.length)"],
      // The ban panel carries the rank on the entry instead, see above.
      [BAN_PANEL, "teamRows(prioritized.collapsed)"],
    ] as const) {
      expect(read(path), path).toContain(call)
    }
  })

  it("opens only the head of each newly capped list", () => {
    // The trap the 0.7.2 probes found: passing the FULL list to the open half
    // renders everything and the tail again, and no `.map` guard notices.
    expect(read(ANALYSIS_PANEL)).toContain("banRows(bans.visible, 0)")
    expect(read(BAN_PANEL)).toContain("teamRows(prioritized.visible)")
    expect(read(ANALYSIS_PANEL)).not.toContain("banRows(player.targetBans, 0)")
    expect(read(BAN_PANEL)).not.toContain("teamRows(ranked)")
  })

  it("counts every new summary", () => {
    // Whole calls, not identifiers: a probe showed the identifier alone is
    // already satisfied by the import line.
    expect(read(ANALYSIS_PANEL)).toContain(
      "scoutPluralMessage(t, collapsedCount, moreKeys)",
    )
    expect(read(ANALYSIS_PANEL)).toContain("bans.collapsedCount")
    expect(read(BAN_PANEL)).toContain("prioritized.collapsedCount")
  })

  it("leaves the export alone", () => {
    // The export has its own, documented limit and must not inherit a UI cap.
    const exportSource = read("src/components/scout/scoutExport.ts")
    expect(exportSource).not.toContain("splitScoutList")
    expect(exportSource).toContain("prioritizedBans.slice(0, maxBans)")
    expect(exportSource).toContain("player.signals.slice(0, maxPicks)")
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
