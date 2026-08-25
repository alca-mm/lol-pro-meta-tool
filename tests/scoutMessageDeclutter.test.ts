import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import {
  SCOUT_LIST_PREVIEW_COUNT,
  SCOUT_REASON_PREVIEW_COUNT,
  banPhaseFilterOptions,
  fillPlaceholders,
  filterBans,
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

/** How often `needle` occurs. For guards that are about a COUNT, not presence. */
const occurrences = (source: string, needle: string): number => source.split(needle).length - 1

/**
 * Jeder oeffnende `<tag …>` als EIN String, Zeilenumbrueche zu Leerzeichen
 * normalisiert.
 *
 * Uebernommen aus tests/a11ySemantics.test.ts, wo derselbe Helfer aus genau
 * diesem Grund steht: `role="group"` und `aria-label` einzeln ueber die ganze
 * Datei zu suchen belegt NICHT, dass sie auf demselben Element stehen. Die
 * Filtergruppe koennte namenlos bleiben, waehrend ein beliebiges anderes <div>
 * beide Treffer liefert. Ein einzeiliges Regex taugt dafuer nicht, weil die
 * Gruppen hier ueber vier Zeilen aufgeschrieben sind.
 */
function openingTags(source: string, tagName: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(new RegExp(`<${tagName}\\b`, "g"))) {
    const from = match.index ?? 0
    let index = from + match[0].length
    let depth = 0
    let quote: string | null = null
    while (index < source.length) {
      const character = source[index]
      if (quote !== null) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'" || character === "`") {
        quote = character
      } else if (character === "{") {
        depth += 1
      } else if (character === "}") {
        if (depth > 0) depth -= 1
      } else if (character === ">" && depth === 0) {
        break
      }
      index += 1
    }
    found.push(source.slice(from, Math.min(index + 1, source.length)).replace(/\s+/g, " ").trim())
  }
  return found
}

/**
 * Der Quelltext GENAU EINES JSX-Elements: vom `<tag`, das `marker` traegt, bis
 * zu dessen zugehoerigem `</tag>`.
 *
 * Ersetzt das frueher hier stehende 1400-Zeichen-Fenster. Diese Magic Number
 * endete zufaellig kurz vor dem schliessenden `</div>` der Filtergruppe: waechst
 * der Block um ein paar Zeilen, rutscht genau der Teil aus dem Fenster, den die
 * Negativ-Assertions pruefen sollen, und der Guard wird still vakuos.
 *
 * Gibt bei einem fehlenden Marker den LEEREN String zurueck. Jeder Aufrufer muss
 * das pruefen, sonst sind seine `not.toContain`-Assertions beweisfrei.
 */
function jsxElement(source: string, tagName: string, marker: string): string {
  const markerAt = source.indexOf(marker)
  if (markerAt < 0) return ""
  const from = source.lastIndexOf(`<${tagName}`, markerAt)
  if (from < 0) return ""
  const scanner = new RegExp(`<${tagName}\\b|</${tagName}\\s*>`, "g")
  scanner.lastIndex = from
  let depth = 0
  for (let hit = scanner.exec(source); hit !== null; hit = scanner.exec(source)) {
    depth += hit[0].startsWith("</") ? -1 : 1
    if (depth === 0) return source.slice(from, hit.index + hit[0].length)
  }
  return source.slice(from)
}

/**
 * Der Rumpf der CSS-Regel, deren Selektorliste `selector` enthaelt.
 *
 * Noetig, weil `toContain(".foo::before")` nur belegt, dass die ZEICHENKETTE im
 * CSS steht. Eine Regel mit leerem `content` oder ohne `content` haette den
 * frueheren Guard erfuellt, und der Marker waere unsichtbar gewesen.
 */
const cssRuleBody = (css: string, selector: string): string => {
  const at = css.indexOf(selector)
  if (at < 0) return ""
  const open = css.indexOf("{", at)
  const close = css.indexOf("}", open)
  if (open < 0 || close < 0) return ""
  return css.slice(open + 1, close)
}

const IMPORT_PANEL = "src/components/scout/ScoutStatsImportPanel.tsx"
const SHARED = "src/components/scout/ScoutShared.tsx"
const INPUT_PANEL = "src/components/scout/ScoutInputPanel.tsx"
const PLAYER_CARD = "src/components/scout/ScoutPlayerCard.tsx"
const ANALYSIS_PANEL = "src/components/scout/ScoutAnalysisPanel.tsx"
const BAN_PANEL = "src/components/scout/ScoutBanPlanPanel.tsx"

/**
 * Der VOLLSTAENDIGE Verfuegbarkeitsschritt des Ban-Panels (0.8.2).
 *
 * Als Regex und nicht als `toContain`, weil der Aufruf im Panel ueber vier
 * Zeilen steht. Gepinnt wird nicht der Bezeichner, sondern was er filtert:
 *
 *  - `ranked` als ERSTES Argument. Steht dort `banPlan.prioritizedBans`, laeuft
 *    die Verfuegbarkeit VOR dem Ranken und ein vom Draft genommener Champion
 *    nummeriert die uebrigen um.
 *  - `draftBoard ?? []` als zweites. Der Fallback IST die Zusage, dass ein
 *    Scout-Tab ohne geoeffneten Draft weiterarbeitet, statt jeden Kandidaten
 *    fuer genommen zu halten.
 *
 * Ein blosser Bezeichner taugt hier nicht: `filterAvailableBanCandidates` steht
 * auch in der Importzeile, und genau diese Vakuositaetsfalle hat dieses Modul
 * schon dreimal produziert (scoutBanPhaseKey, scoutPluralMessage,
 * banPhaseFilterOptions).
 */
const AVAILABILITY_CALL =
  /const\s+available\s*=\s*filterAvailableBanCandidates\(\s*ranked\s*,\s*draftBoard\s*\?\?\s*\[\]\s*,/

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
    // Eine Liste MIT Mehrfach-Bans. PLAN hat keine, dort waere jede
    // overlapOnly-Assertion nur "ueberall 0" und damit fast beweisfrei.
    const MIXED = rankBanCandidates([
      banOf("Ahri", "safe"),
      candidate({
        championName: "Zed",
        phase: "safe",
        isOverlap: true,
        affectedPlayerIds: ["p1", "p2"],
      }),
      candidate({
        championName: "Karma",
        phase: "target",
        isOverlap: true,
        affectedPlayerIds: ["p1", "p3"],
      }),
      banOf("Yasuo", "situational"),
    ])

    it("liefert alle vier in Anzeigereihenfolge, all zuerst", () => {
      expect(banPhaseFilterOptions(rankBanCandidates(PLAN), false)).toEqual([
        { filter: "all", count: 5 },
        { filter: "safe", count: 2 },
        { filter: "target", count: 2 },
        { filter: "situational", count: 1 },
      ])
    })

    it("meldet eine leere Phase mit 0, statt sie wegzulassen", () => {
      const options = banPhaseFilterOptions(rankBanCandidates([banOf("Ahri", "safe")]), false)
      expect(options.map((option) => option.filter)).toEqual([
        "all",
        "safe",
        "target",
        "situational",
      ])
      expect(options.map((option) => option.count)).toEqual([1, 1, 0, 0])
    })

    it("meldet bei leerem Plan viermal 0", () => {
      expect(banPhaseFilterOptions([], false).map((option) => option.count)).toEqual([0, 0, 0, 0])
    })

    it("zaehlt bei gedruecktem Overlap-Regler nur noch die Mehrfach-Bans", () => {
      // Der zweite Parameter ist seit 0.7.6 PFLICHT und bewusst nicht auf false
      // gedefaultet: sonst verspricht ein Chip "Sicher: 2" und oeffnet eine
      // Liste von einem. Ohne diesen Fall bliebe ein banPhaseFilterOptions, das
      // seinen zweiten Parameter schlicht ignoriert, in allen anderen Tests
      // dieser Datei gruen, weil die alle false uebergeben.
      expect(banPhaseFilterOptions(MIXED, false).map((option) => option.count)).toEqual([
        4, 2, 1, 1,
      ])
      expect(banPhaseFilterOptions(MIXED, true).map((option) => option.count)).toEqual([2, 1, 1, 0])
    })

    it("die Zahl auf dem Chip IST die Laenge der Liste, die er oeffnet", () => {
      // Die eigentliche Zusage dieses Helfers. Frueher kam die Zahl aus
      // TeamBanPlan.phases und die Liste waere aus prioritizedBans gekommen:
      // zwei Quellen fuer eine Aussage, genau die Form von Defekt, die dieses
      // Modul schon zweimal produziert hat.
      //
      // Seit 0.7.6 gilt die Zusage in BEIDEN Reglerstellungen, und gemessen wird
      // gegen `filterBans` — dieselbe Funktion, aus der das Panel die Liste
      // baut. Gegen `filterBansByPhase` zu messen waere der Rueckfall in zwei
      // Quellen: die Zahl beruecksichtigte den Overlap-Regler, die Liste nicht.
      for (const overlapOnly of [false, true]) {
        for (const option of banPhaseFilterOptions(MIXED, overlapOnly)) {
          expect(
            filterBans(MIXED, option.filter, overlapOnly),
            `${option.filter} / overlapOnly=${overlapOnly}`,
          ).toHaveLength(option.count)
        }
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

  it("der Quelltext-Scanner selbst liest, was er zu lesen behauptet", () => {
    // Selbsttest fuer die beiden Helfer, auf denen die Filter-Guards stehen.
    // jsxElement() gibt bei einem fehlenden Marker den LEEREN String zurueck,
    // und auf dem leeren String ist jedes `not.toContain` erfuellt: ein
    // umbenanntes className wuerde die Element-Guards also nicht rot machen,
    // sondern lautlos entwerten.
    const sample = [
      '<div className="a" role="group">',
      '  <button type="button">x</button>',
      "</div>",
      '<div className="b"><span onClick={f}>y</span></div>',
    ].join("\n")

    expect(jsxElement(sample, "div", 'className="a"')).toContain("<button")
    expect(jsxElement(sample, "div", 'className="a"')).not.toMatch(/<span[^>]*onClick/)
    expect(jsxElement(sample, "div", 'className="b"')).toMatch(/<span[^>]*onClick/)
    expect(jsxElement(sample, "div", 'className="gibtEsNicht"')).toBe("")

    expect(openingTags(sample, "div")).toHaveLength(2)
    expect(openingTags(sample, "div")[0]).toContain('role="group"')
    expect(openingTags(sample, "div")[1]).not.toContain('role="group"')

    // Und cssRuleBody liest den RUMPF, nicht nur den Selektor.
    expect(cssRuleBody('.a::before,\n.b::before {\n  content: "x";\n}', ".b::before")).toContain(
      'content: "x"',
    )
    expect(cssRuleBody(".a { color: red }", ".gibtEsNicht")).toBe("")
  })

  it("das Verfuegbarkeits-Muster erkennt genau den einen richtigen Aufruf", () => {
    // Fixture-Selbsttest fuer AVAILABILITY_CALL, das mit 0.8.2 neu dazukommt.
    // Ein Muster, das auf der Importzeile oder auf der falschen Eingabe
    // anschlaegt, waere als Reihenfolge-Guard wertlos, und ein zu strenges
    // wuerde bei einem Reformat rot ohne dass sich etwas geaendert haette.
    const real = [
      "    const available = filterAvailableBanCandidates(",
      "        ranked,",
      "        draftBoard ?? [],",
      "        (entry) => entry.candidate.championName,",
      "    )",
    ].join("\n")
    expect(AVAILABILITY_CALL.test(real), "das Muster liest den echten Aufruf nicht").toBe(true)
    // Einzeilig geschrieben ebenfalls, sonst waere der Guard ein Formatwaechter.
    expect(
      AVAILABILITY_CALL.test(
        "const available = filterAvailableBanCandidates(ranked, draftBoard ?? [], nameOf)",
      ),
    ).toBe(true)

    // Und die drei Mutanten, die es fangen muss.
    expect(
      AVAILABILITY_CALL.test(
        'import { filterAvailableBanCandidates } from "../../draft/draftAvailability"',
      ),
      "die Importzeile erfuellt das Muster - als Guard waere es vakuos",
    ).toBe(false)
    expect(
      AVAILABILITY_CALL.test(
        "const available = filterAvailableBanCandidates(banPlan.prioritizedBans, draftBoard ?? [], nameOf)",
      ),
      "die Verfuegbarkeit vor dem Ranken erfuellt das Muster - der Rang wuerde umnummeriert",
    ).toBe(false)
    expect(
      AVAILABILITY_CALL.test(
        "const available = filterAvailableBanCandidates(ranked, [], nameOf)",
      ),
      "ein fest leeres Board erfuellt das Muster - der Draft erreichte den Plan nie",
    ).toBe(false)
  })

  it("die Phasenanzeige sind echte Buttons, keine statische Textzeile", () => {
    // Bis 0.7.4 stand hier eine reine Zaehlzeile. Sie ist jetzt bedienbar, und
    // zwar als <button>: Tastatur, Fokus und Aktivierung kommen dann vom
    // Browser, nicht aus nachgebautem Klickverhalten auf einem <span>.
    const source = read(BAN_PANEL)

    // role und aria-label auf DEMSELBEN oeffnenden Tag. Als zwei getrennte
    // toContain ueber die ganze Datei war das erfuellt, sobald die Attribute
    // irgendwo standen: das Label haette auf der Overlap-Gruppe sitzen koennen
    // und die Phasengruppe waere namenlos geblieben.
    const groupTags = openingTags(source, "div").filter((tag) =>
      tag.includes('className="scout-ban-phase-filter"'),
    )
    expect(groupTags, "die Phasen-Filtergruppe fehlt").toHaveLength(1)
    expect(groupTags[0], "die Phasengruppe ist keine Gruppe mehr").toContain('role="group"')
    expect(groupTags[0], "die Phasengruppe hat kein Label mehr").toContain(
      'aria-label={t("scout_banPhaseFilterLabel")}',
    )

    expect(source).toContain("onClick={() => setPhaseFilter(option.filter)}")
    expect(source, "die Phasenzeile ist wieder statisch").not.toContain(
      "scout-ban-phase-summary",
    )

    // DAS ELEMENT, nicht nur seine Attribute. Eine Mutationsprobe hat `<button`
    // durch `<span` ersetzt und dieser Test blieb gruen: `type="button"`,
    // `onClick` und `aria-pressed` standen ja alle noch da. Ein klickbares
    // <span> ist aber nicht fokussierbar und reagiert weder auf Enter noch auf
    // Leertaste, und genau das ist der Unterschied, um den es hier geht.
    //
    // Gelesen wird bis zum echten `</div>` der Gruppe. Das frueher hier
    // stehende 1400-Zeichen-Fenster endete kurz vor dem Gruppenende, also
    // haetten ein paar zusaetzliche Zeilen die Negativ-Assertions still
    // entwertet.
    const group = jsxElement(source, "div", 'className="scout-ban-phase-filter"')
    expect(group, "die Filtergruppe fehlt").not.toBe("")
    expect(group.endsWith("</div>"), "die Gruppe wurde nicht bis zum Ende gelesen").toBe(true)

    expect(group, "die Chips sind keine <button> mehr").toContain("<button")
    expect(group).toContain('type="button"')
    expect(group, "ein Chip ist ein klickbares <span> geworden").not.toMatch(
      /<span[^>]*onClick/,
    )
    expect(group, "ein Chip ist ein klickbares <div> geworden").not.toMatch(/<div[^>]*onClick/)
  })

  it("der Overlap-Regler ist ein echter Button in einer eigenen Gruppe", () => {
    // Der zweite Regler von 0.7.6. Er verdient dieselbe Pruefung wie die
    // Phasenchips: Attribute belegen kein Element, und ein klickbares <span>
    // traegt `type`, `onClick` und `aria-pressed` genauso.
    const source = read(BAN_PANEL)

    const groupTags = openingTags(source, "div").filter((tag) =>
      tag.includes('className="scout-ban-overlap-filter"'),
    )
    expect(groupTags, "die Overlap-Filtergruppe fehlt").toHaveLength(1)
    expect(groupTags[0], "die Overlap-Gruppe ist keine Gruppe mehr").toContain('role="group"')
    expect(groupTags[0], "die Overlap-Gruppe hat kein Label, sie klingt wie eine Phase").toContain(
      'aria-label={t("scout_banOverlapFilterLabel")}',
    )

    const group = jsxElement(source, "div", 'className="scout-ban-overlap-filter"')
    expect(group, "die Overlap-Gruppe fehlt").not.toBe("")
    expect(group.endsWith("</div>"), "die Gruppe wurde nicht bis zum Ende gelesen").toBe(true)

    expect(group, "der Overlap-Regler ist kein <button> mehr").toContain("<button")
    expect(group).toContain('type="button"')
    expect(group, "der Regler ist ein klickbares <span> geworden").not.toMatch(
      /<span[^>]*onClick/,
    )
    expect(group, "der Regler ist ein klickbares <div> geworden").not.toMatch(/<div[^>]*onClick/)
    expect(group, "der Regler schaltet nichts mehr um").toContain(
      "onClick={() => setOverlapOnly(!overlapOnly)}",
    )
  })

  it("der aktive Filter wird angesagt und nicht nur eingefaerbt", () => {
    const source = read(BAN_PANEL)

    // aria-pressed IN der jeweiligen Gruppe, nicht irgendwo in der Datei: sonst
    // deckte ein einziges aria-pressed beide Regler ab.
    const phaseGroup = jsxElement(source, "div", 'className="scout-ban-phase-filter"')
    const overlapGroup = jsxElement(source, "div", 'className="scout-ban-overlap-filter"')
    expect(phaseGroup, "die Phasengruppe fehlt").not.toBe("")
    expect(overlapGroup, "die Overlap-Gruppe fehlt").not.toBe("")

    expect(phaseGroup, "aria-pressed fehlt, der gedrueckte Chip ist nur sichtbar").toContain(
      "aria-pressed={active}",
    )
    expect(overlapGroup, "aria-pressed fehlt, der gedrueckte Regler ist nur sichtbar").toContain(
      "aria-pressed={overlapOnly}",
    )

    // Und die nicht-farbliche Haelfte: der aktive Chip traegt eine eigene
    // Klasse, an der das CSS eine Markierung haengt.
    expect(phaseGroup).toContain("scout-ban-phase-chip-active")
    expect(overlapGroup).toContain("scout-ban-overlap-chip-active")

    // Kommentar-gestrippt gelesen: die Regel auszukommentieren muss rot werden.
    // Und geprueft wird der RUMPF, nicht nur der Selektor. Ein
    // `content: ""` oder eine Regel ohne `content` haette den frueheren
    // toContain-Guard erfuellt, und der Marker waere trotzdem unsichtbar.
    const css = read("src/index.css")
    expect(css.length, "src/index.css wurde nicht gelesen").toBeGreaterThan(10000)
    for (const [chip, selector] of [
      ["Phase", ".scout-ban-phase-chip-active::before"],
      ["Overlap", ".scout-ban-overlap-chip-active::before"],
    ] as const) {
      expect(css, `${chip}: der aktive Chip hat keine Markierung ausser Farbe`).toContain(selector)
      const body = cssRuleBody(css, selector)
      const content = /content\s*:\s*("[^"]*"|'[^']*')/.exec(body)
      expect(content, `${chip}: die Markierungsregel hat kein content-Literal`).not.toBeNull()
      expect(content?.[1].slice(1, -1).trim(), `${chip}: der Marker ist leer`).not.toBe("")
    }
  })

  it("der Hover ueberschreibt den gedrueckten Zustand nicht", () => {
    // EIN ECHTER DEFEKT AUS 0.7.5, hier eingefroren. Die Hover-Regel lautete
    // `.scout-ban-phase-chip:hover:not(:disabled)` und wiegt damit (0,3,0),
    // die Aktiv-Regel `.scout-ban-phase-chip-active` nur (0,1,0). Auf den
    // BEREITS gedrueckten Chip zu zeigen faerbte seinen Rahmen also von
    // `--accent` zurueck auf `--accent-dim`: der ausgewaehlte Chip sah
    // schwaecher aus als ein nicht ausgewaehlter, solange die Maus darauf
    // stand. Die Reihenfolge im Stylesheet kann das nicht heilen, nur die
    // Spezifitaet, deshalb das `:not(...-active)`.
    const css = read("src/index.css")
    expect(css.length, "src/index.css wurde nicht gelesen").toBeGreaterThan(10000)

    for (const chip of ["scout-ban-phase-chip", "scout-ban-overlap-chip"] as const) {
      expect(
        css,
        `${chip}: die Hover-Regel nimmt den aktiven Chip nicht aus und ueberschreibt ihn ` +
          "deshalb wieder (Spezifitaet 0,3,0 gegen 0,1,0).",
      ).toContain(`.${chip}:hover:not(:disabled):not(.${chip}-active)`)

      // Die Gegenrichtung: die nackte Form darf NICHT als eigener Selektor
      // zurueckkommen. Ohne sie bliebe der Guard gruen, wenn jemand die
      // ausgenommene Regel behaelt und die alte daneben wieder einfuehrt.
      expect(
        new RegExp(`\\.${chip}:hover:not\\(:disabled\\)\\s*[,{]`).test(css),
        `${chip}: die alte, nicht ausgenommene Hover-Regel steht wieder im Stylesheet.`,
      ).toBe(false)
    }
  })

  it("eine leere Phase ist gesperrt, all und der aktive Chip nie", () => {
    // Option A der Produktentscheidung. Die Regel selbst ist oben als reine
    // Funktion getestet; hier wird gepinnt, dass das Panel sie auch benutzt.
    const source = read(BAN_PANEL)
    expect(source).toContain("disabled={!isBanPhaseFilterEnabled(option, phaseFilter)}")
    // Dasselbe fuer den Overlap-Regler: 0 Mehrfach-Bans heisst garantiert leere
    // Liste, der GEDRUECKTE Regler bleibt aber bedienbar, sonst verliert er den
    // Tastaturfokus, sobald sich die Daten unter ihm aendern.
    expect(source, "der Overlap-Regler laesst sich in eine garantierte Leere klicken").toContain(
      "disabled={!isBanOverlapFilterEnabled(overlapOption)}",
    )
  })

  it("rankt, entfernt Gedraftetes, filtert, kappt - in genau dieser Reihenfolge", () => {
    // VIER Stufen seit 0.8.2, und jede der drei Grenzen dazwischen ist eine
    // eigene Zusage. Deshalb wird jede einzeln und mit eigener Begruendung
    // gepinnt statt "irgendwie in dieser Reihenfolge":
    //
    // (1) GERANKT WIRD ZUERST, aus der vollen Liste. Ein vom Draft genommener
    //     Champion darf die uebrigen nicht umnummerieren, sonst heisst "#7"
    //     nicht mehr "siebtwichtigster Ban insgesamt", sondern nur noch
    //     "siebte Zeile, die gerade uebrig ist".
    // (2) VERFUEGBARKEIT VOR PHASE UND OVERLAP. Sonst zaehlen die Chips
    //     Kandidaten mit, die die Liste gar nicht mehr zeigt: "Gezielt: 4"
    //     oeffnet eine Liste von zwei.
    // (3) GEKAPPT WIRD ZULETZT. Andersherum wuerde die volle Liste bei acht
    //     gekappt und ERST DANN gesiebt: "Gezielt" zeigte dann die gezielten
    //     Bans, die zufaellig in die ersten acht gefallen sind, und
    //     verschwiege den Rest, ohne dass die Klappe etwas davon sagt.
    //
    // Seit 0.7.6 sieben ZWEI Regler, und beide laufen durch `filterBans`. Ein
    // Panel, das hier wieder nur `filterBansByPhase` aufruft, kappt die
    // Overlap-Auswahl erneut vor dem Filtern; deshalb ist ueberall der
    // VOLLSTAENDIGE Aufruf gepinnt und nicht der Bezeichner.
    const source = read(BAN_PANEL)
    const rankAt = source.indexOf("rankBanCandidates(banPlan.prioritizedBans)")
    const availableAt = source.search(AVAILABILITY_CALL)
    const optionsAt = source.indexOf("banPhaseFilterOptions(available, overlapOnly)")
    const filterAt = source.indexOf("filterBans(available, phaseFilter, overlapOnly)")
    const splitAt = source.indexOf("splitScoutList(visibleBans, MAX_PRIORITIZED)")

    expect(rankAt, "der Rang kommt nicht mehr aus der vollen Liste").toBeGreaterThan(-1)
    expect(
      availableAt,
      "der Verfuegbarkeitsschritt fehlt. Der Ban-Plan empfiehlt damit wieder Champions, die " +
        "im laufenden Draft schon gepickt oder gebannt sind.",
    ).toBeGreaterThan(-1)
    expect(optionsAt, "die Phasenchips zaehlen nicht mehr aus der Liste").toBeGreaterThan(-1)
    expect(filterAt, "die beiden Filter werden nicht mehr gemeinsam angewandt").toBeGreaterThan(-1)
    expect(splitAt, "die Liste wird nicht mehr gekappt").toBeGreaterThan(-1)

    expect(
      rankAt,
      "die Verfuegbarkeit greift VOR dem Ranken. Ein vom Draft genommener Champion " +
        "nummeriert damit alle uebrigen um, und '#7' heisst nicht mehr 'siebtwichtigster Ban " +
        "insgesamt'.",
    ).toBeLessThan(availableAt)
    expect(
      availableAt,
      "die Verfuegbarkeit greift NACH den Chips. Die Chips zaehlen dann Kandidaten mit, die " +
        "die Liste gar nicht zeigt: 'Gezielt: 4' oeffnet eine Liste von zwei.",
    ).toBeLessThan(optionsAt)
    expect(
      availableAt,
      "die Verfuegbarkeit greift NACH dem Phasen-/Overlap-Filter. Zaehler und Liste kaemen " +
        "damit aus zwei verschiedenen Mengen.",
    ).toBeLessThan(filterAt)
    expect(splitAt, "gekappt wird vor dem Filtern").toBeGreaterThan(filterAt)

    // Die naheliegenden Rueckfaelle, jeder einzeln benannt. Alle lassen eine
    // Stufe aus, ohne dass eine Zeile geloescht werden muesste.
    for (const [call, why] of [
      [
        "filterBans(ranked",
        "der Phasen-/Overlap-Filter laeuft wieder auf der ungefilterten Liste, also auf " +
          "Kandidaten, die der Draft bereits genommen hat",
      ],
      [
        "banPhaseFilterOptions(ranked",
        "die Phasenchips zaehlen wieder aus `ranked` und versprechen damit eine Zahl, die " +
          "die Liste nicht zeigt",
      ],
      [
        "banOverlapFilterOption(ranked",
        "der Overlap-Chip zaehlt wieder aus `ranked` - dieselbe Zusage, dieselbe Luecke",
      ],
      ["splitScoutList(ranked", "gekappt wird weiterhin die ungefilterte Liste"],
      [
        "splitScoutList(available",
        "gekappt wird vor dem Phasen-/Overlap-Filter. Die Klappe zeigte dann nur die Treffer " +
          "aus den ersten acht und verschwiege den Rest.",
      ],
      [
        "filterBansByOverlap(prioritized",
        "der Overlap-Filter laeuft auf der bereits gekappten Liste",
      ],
    ] as const) {
      expect(source, why).not.toContain(call)
    }
  })

  it("Liste und beide Zaehler starten von DERSELBEN Menge", () => {
    // DIE inhaltlich wichtigste Zusage von 0.8.2, und sie ist genau die Form
    // von Defekt, die dieses Modul schon dreimal produziert hat: ein Wert wird
    // aus einer Quelle gezaehlt und aus einer anderen gerendert
    // (`ScoutManualSource` an drei Stellen, `overwrittenRows` gegen
    // `removedExistingRows`, `banPhaseCounts` gegen `prioritizedBans`).
    //
    // Der Draft nimmt Kandidaten weg. Zaehlte auch nur EINE der drei Stellen
    // weiter aus `ranked`, verspraeche ein Chip eine Zahl, die die Liste nicht
    // einloest, und der Nutzer haette keinen Weg, den Unterschied zu sehen.
    //
    // VOLLSTAENDIGE Aufrufe, nicht Bezeichner: alle drei stehen ausserdem in
    // der Importzeile des Panels.
    const source = read(BAN_PANEL)
    for (const call of [
      "banPhaseFilterOptions(available, overlapOnly)",
      "banOverlapFilterOption(available, phaseFilter, overlapOnly)",
      "filterBans(available, phaseFilter, overlapOnly)",
    ]) {
      expect(source, `${call} fehlt: Zaehler und Liste kommen aus zwei Quellen`).toContain(call)
    }

    // Die Gegenrichtung. Ein Zaehler auf der bereits gesiebten oder gekappten
    // Liste ist der andere Weg in dieselbe Luecke: der Chip zeigte dann immer
    // die Laenge der gerade sichtbaren Auswahl statt die seiner eigenen.
    for (const call of [
      "banPhaseFilterOptions(visibleBans",
      "banOverlapFilterOption(visibleBans",
      "banPhaseFilterOptions(prioritized",
      "banOverlapFilterOption(prioritized",
    ]) {
      expect(
        source,
        `${call}: der Chip zaehlt die schon gefilterte oder gekappte Liste`,
      ).not.toContain(call)
    }
  })

  it("waehlt den Leerzustand ueber die Regel, nicht ueber ein inline ? :", () => {
    // Welcher Satz erscheint, ist eine Regel: bei gedruecktem Overlap-Regler
    // muss der Satz DIESEN Regler nennen, sonst wird jemand auf "Alle"
    // geschickt und landet in einer genauso leeren Liste. Als Ternaer im JSX
    // waere die Regel nicht testbar, Vitest laeuft hier ohne jsdom.
    // Seit 0.8.2 gibt es DREI Saetze und damit erst recht keinen Ternaer: hat
    // der Draft jeden Kandidaten genommen, hilft weder "schalte auf Alle" noch
    // "schalte den Overlap-Regler aus", beide fuehren in eine genauso leere
    // Liste. Der VOLLSTAENDIGE Aufruf ist gepinnt, weil das zweite Argument die
    // Regel ueberhaupt erst entscheidbar macht.
    const source = read(BAN_PANEL)
    expect(source).toContain(
      "t(scoutBanListEmptyKey(overlapOnly, available.length === 0 && takenByDraft > 0))",
    )
    // Und woher die Draft-Haelfte dieser Bedingung kommt. `takenByDraft` ist
    // die Differenz DERSELBEN zwei Listen, nicht etwa die Zahl der belegten
    // Draft-Slots: ein Draft, der zwei von neun nimmt, laesst sieben uebrig,
    // und dann sind wirklich die Filter schuld.
    expect(
      source,
      "takenByDraft wird nicht mehr aus ranked und available berechnet - der Leerzustand " +
        "begruendet sich dann mit einem Draft, der die Liste gar nicht geleert hat",
    ).toContain("const takenByDraft = ranked.length - available.length")
    // Ein inline `? :` nennt die Schluessel woertlich. Das Panel darf keinen
    // von den dreien kennen.
    for (const key of [
      "scout_banPhaseFilterEmpty",
      "scout_banOverlapFilterEmpty",
      "scout_banDraftEmpty",
    ]) {
      expect(source, `das Panel entscheidet den Leerzustand wieder selbst (${key})`).not.toContain(
        key,
      )
    }
  })

  it("der Leerzustand meldet sich, und nur er", () => {
    // 0.7.7. Der Leerzustand entsteht durch einen Tastendruck: ein sehender
    // Nutzer sieht die Zeilen verschwinden, ein Screenreader-Nutzer hoerte
    // vorher nur "gedrueckt" und sonst nichts. `role="status"` traegt genau
    // diese eine Tatsache nach.
    const source = read(BAN_PANEL)

    // GENAU DAS <p>, nicht irgendwo in der Datei. Ohne die Eingrenzung waere
    // ein role="status" an der Ban-Liste von diesem Guard mitgedeckt.
    const emptyState = jsxElement(source, "p", "scoutBanListEmptyKey(overlapOnly,")
    expect(
      emptyState,
      "der Leerzustand des Ban-Plans wurde nicht gefunden, die Assertions unten sind beweisfrei",
    ).not.toBe("")
    expect(emptyState, "der Leerzustand meldet sich nicht mehr").toContain('role="status"')
    expect(emptyState, "der Leerzustand ist nicht mehr die scout-nodata-Zeile").toContain(
      'className="scout-nodata"',
    )

    // Und NUR er. Eine Live-Region ueber der ganzen Liste laese bei jedem
    // Chipdruck saemtliche Zeilen erneut vorlesen, also genau die Unordnung,
    // die 0.7.0 aus diesem Panel entfernt hat.
    const banList = jsxElement(source, "ol", 'className="scout-ban-list"')
    expect(banList, "die Ban-Liste wurde nicht gefunden").not.toBe("")
    expect(banList, "die ganze Ban-Liste ist eine Live-Region geworden").not.toContain("role=")
    expect(banList, "die ganze Ban-Liste ist eine Live-Region geworden").not.toContain("aria-live")

    expect(
      occurrences(source, 'role="status"'),
      "das Panel hat mehr als eine Live-Region. Genau eine Aussage ist es wert, angesagt zu " +
        "werden: dass der Filter die Liste geleert hat.",
    ).toBe(1)
  })

  it("meldet den Leerzustand hoeflich, nie assertiv", () => {
    // `role="status"` ist von sich aus polite und atomic. `assertive` wuerde
    // dem Nutzer ins Wort fallen, und ein Filterergebnis ist kein Notfall.
    // Der restliche Scout nutzt ebenfalls das nackte role="status".
    const source = read(BAN_PANEL)
    expect(
      source,
      'aria-live="assertive" im Ban-Plan: ein leeres Filterergebnis unterbricht damit die ' +
        'laufende Ausgabe. role="status" allein ist hoeflich und reicht.',
    ).not.toContain("assertive")
  })

  it("die Filter beruehren den Export nicht", () => {
    // Der Export kopiert den vollen Plan. Ihn an den Panel-Zustand zu haengen
    // hiesse, dass der kopierte Text davon abhaengt, welcher Chip gerade
    // gedrueckt war und ob der Overlap-Regler an war.
    //
    // `ScoutBanPhaseFilter` steht ausdruecklich mit auf der Liste: das
    // vorhandene `phaseFilter` deckt den Typnamen wegen des grossen P NICHT ab.
    //
    // Seit 0.8.2 ist die Aussage SCHAERFER: der Export ist nicht nur
    // filter-unabhaengig, sondern draft-unabhaengig. Der kopierte Text ist der
    // volle Plan, und was im laufenden Draft schon liegt, ist eine Frage der
    // Sichtbarkeit im Panel. Wuerde der Export sie mitbeantworten, haenge der
    // Inhalt der Zwischenablage davon ab, wie weit der Draft gerade ist - und
    // ein Team, das den Plan VOR dem Draft teilt, bekaeme einen anderen Text
    // als eines, das ihn mittendrin kopiert. Deshalb stehen der Filter, sein
    // Modul, das Prop und der Slot-Typ alle vier auf der Liste.
    const exportSource = read("src/components/scout/scoutExport.ts")
    expect(exportSource.length, "scoutExport.ts wurde nicht gelesen").toBeGreaterThan(1000)
    for (const forbidden of [
      "phaseFilter",
      "ScoutBanPhaseFilter",
      "filterBans",
      "filterBansByPhase",
      "filterBansByOverlap",
      "banPhaseFilterOptions",
      "banOverlapFilterOption",
      "isBanPhaseFilterEnabled",
      "isBanOverlapFilterEnabled",
      "scoutBanListEmptyKey",
      "overlapOnly",
      "rankBanCandidates",
      "filterAvailableBanCandidates",
      "draftAvailability",
      "draftBoard",
      "DraftSlot",
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
    // Since 0.8.2 there is a third list-shaped local to bypass the cap with,
    // and it is the most plausible one: `available` reads like "the list".
    expect(source, "the cap and both filters are bypassed in the open half").not.toContain(
      "teamRows(available)",
    )
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
    //
    // WHOLE CALLS, not identifiers. `banPhaseFilterOptions` was already
    // satisfied by the IMPORT line, so the panel could stop building chips
    // altogether and stay green; `displayNameById` was already satisfied by the
    // local `const displayNameById`, so deleting the PROP would silently drop
    // the "Betrifft:" line from every team-plan row.
    // Seit 0.8.2 zaehlen die Chips aus `available`, nicht aus `ranked`: der
    // Draft nimmt Kandidaten weg, und ein Chip darf keine Zahl versprechen, die
    // die Liste darunter nicht zeigt.
    expect(source, "die Chips werden nicht mehr aus der Liste gezaehlt").toContain(
      "banPhaseFilterOptions(available, overlapOnly)",
    )
    expect(source, "die Zeile bekommt die Namen nicht mehr").toContain(
      "displayNameById={displayNameById}",
    )
    // And the phase chips FILTER the one list, they do not open a second one.
    expect(source, "a chip renders its own ban list again").not.toContain(
      "teamRows(filterBansByPhase",
    )

    const row = read(SHARED)
    expect(row).toContain("scoutBanPhaseKey")
    expect(row).toContain("scout_banAffectedPlayers")
    expect(row).toContain("summarizeBanCandidate")
  })

  it("ruft die eine Zeilen-Renderstelle genau zweimal auf", () => {
    // DER GUARD, DEN DIE ANDEREN NICHT ERSETZEN. "Ein Kandidat, eine Zeile" war
    // bisher als RENDERSTELLE gezaehlt, und `<ScoutBanRow` kommt im Panel nur
    // einmal vor, weil die Stelle in der lokalen Helferfunktion teamRows()
    // sitzt. Eine Schleife, die teamRows() je Phase noch einmal aufruft, holt
    // damit die 0.7.4-Phasenlisten zurueck, OHNE eine zweite Renderstelle
    // anzulegen: jeder bisherige Guard blieb dabei gruen. Das vorhandene
    // `not.toContain("teamRows(filterBansByPhase")` ist ausserdem mit einer
    // Zwischenvariablen zu umgehen. Gezaehlt werden deshalb die AUFRUFE.
    const source = read(BAN_PANEL)
    expect(occurrences(source, "<ScoutBanRow"), "eine zweite Ban-Zeilen-Renderstelle").toBe(1)
    expect(
      occurrences(source, "teamRows("),
      "die eine Liste wird oefter als offen-plus-eingeklappt gerendert",
    ).toBe(2)
    expect(source).toContain("teamRows(prioritized.visible)")
    expect(source).toContain("teamRows(prioritized.collapsed)")
  })

  it("die vier Gruppierungen von 0.7.4 sind und bleiben geloescht", () => {
    // `BanGroup` ist oben gepinnt, `PHASE_HEADINGS` war es repo-weit NICHT: die
    // Konstante konnte samt Ueberschriftszeile zurueckkommen, ohne dass
    // irgendetwas rot wird. Dasselbe gilt fuer die vier i18n-Keys, die 0.7.4
    // mit den Listen entfernt hat.
    const panel = read(BAN_PANEL)
    expect(panel, "PHASE_HEADINGS ist zurueck").not.toContain("PHASE_HEADINGS")

    const DELETED_KEYS = [
      "scout_safeBans",
      "scout_targetBans",
      "scout_situationalBans",
      "scout_overlapBans",
    ]
    for (const [lang, path] of [
      ["de", "src/i18n/de.ts"],
      ["en", "src/i18n/en.ts"],
    ] as const) {
      const dict = read(path)
      // Anti-Vakuositaet: belegt, dass hier das richtige, nicht leergestrippte
      // Woerterbuch gelesen wird. Ohne das waere jede Abwesenheit trivial wahr.
      expect(dict.length, `${lang}: das Woerterbuch wurde nicht gelesen`).toBeGreaterThan(10000)
      expect(dict, `${lang}: das ist nicht das Scout-Woerterbuch`).toContain(
        "scout_banPhaseFilterLabel",
      )
      for (const key of DELETED_KEYS) {
        expect(dict, `${lang}: ${key} ist wieder da`).not.toContain(key)
      }
    }
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
