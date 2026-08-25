/**
 * Draft-Verfuegbarkeit im Ban-Plan (0.8.2, Epic C).
 *
 * Seit 0.8.2 blendet der Scout-Ban-Plan Champions aus, die im laufenden Draft
 * schon gepickt oder gebannt sind. Diese Datei prueft das VERHALTEN der
 * Kopplung, nicht den Quelltext: echte `BanCandidate`-Fixturen, ein echtes
 * `DraftBoard` aus `createDraftBoard()` plus `applyDraftAction()`, und dann
 * genau die Pipeline, die `ScoutBanPlanPanel` faehrt:
 *
 *   ranked    = rankBanCandidates(banPlan.prioritizedBans)
 *   available = filterAvailableBanCandidates(ranked, board, entry => …championName)
 *   takenByDraft = ranked.length - available.length
 *   options   = banPhaseFilterOptions(available, overlapOnly)
 *   overlap   = banOverlapFilterOption(available, phaseFilter, overlapOnly)
 *   visible   = filterBans(available, phaseFilter, overlapOnly)
 *
 * Vier Zusagen stehen dahinter, und jede hat hier ihren Test:
 *
 *  1. SICHTBARKEIT, sonst nichts. Ein im Draft vergebener Champion faellt aus
 *     der Liste; kein Score, kein Rang und keine Reihenfolge aendern sich.
 *     `analyzeScout` erfaehrt nie, dass es einen Draft gibt.
 *  2. Der RANG kommt weiterhin aus der VOLLEN Liste. "#7" heisst
 *     "siebtwichtigster Ban insgesamt", also hat die uebrig gebliebene Liste
 *     Luecken (2, 3, 4, 6, 7) und das ist gewollt.
 *  3. Zaehler und Liste kommen aus DERSELBEN Quelle, naemlich `available`.
 *     Kaemen die Zahlen aus `ranked`, versprachen die Chips mehr Zeilen, als
 *     die Liste zeigt. Genau dafuer steht unten eine Gegenprobe.
 *  4. Der DRAFT gewinnt im Leerzustand vor dem Overlap-Regler: hat der Draft
 *     alles genommen, bringt kein Chip einen Kandidaten zurueck.
 *
 * WAS DIESE DATEI NICHT BEWEISEN KANN, und das gehoert dazugesagt: Vitest
 * laeuft hier in Node ohne jsdom (`test.environment: 'node'`), es wird nichts
 * gerendert. `panelView()` unten ist eine REPLIK der Panel-Pipeline, kein
 * Auslesen davon. Sie pinnt die REGELN und ihre Reihenfolge; dass
 * `ScoutBanPlanPanel.tsx` sie auch wirklich so verdrahtet, pinnt ein
 * Quelltext-Scan an anderer Stelle. Wer hier gruen sieht, hat die Verdrahtung
 * nicht geprueft.
 *
 * ANTI-VAKUOSITAET: Die Fixture unten hat sieben Kandidaten in allen drei
 * Phasen, drei davon Mehrfachtreffer, und der Draft nimmt bewusst je einen
 * Mehrfach- und einen Einzeltreffer aus zwei verschiedenen Phasen. Eine
 * Fixture aus lauter gleichartigen Kandidaten waere von einem Filter, der gar
 * nichts tut, ebenso erfuellt.
 */

import { describe, expect, it } from "vitest"

import {
  SCOUT_BAN_PHASE_FILTERS,
  banOverlapFilterOption,
  banPhaseFilterOptions,
  filterBans,
  rankBanCandidates,
  scoutBanListEmptyKey,
} from "../src/components/scout/scoutUiHelpers"
import type {
  RankedBanCandidate,
  ScoutBanPhaseFilter,
} from "../src/components/scout/scoutUiHelpers"
import { filterAvailableBanCandidates } from "../src/draft/draftAvailability"
import { applyDraftAction, createDraftBoard } from "../src/draft/draftState"
import type { DraftSlot } from "../src/draft/draftState"
import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import type { BanCandidate, ScoutBanPhase } from "../src/scout/types"

/* --------------------------------------------------------------------------
 * Fixturen
 * ------------------------------------------------------------------------ */

/**
 * Ein Ban-Kandidat mit tragbaren Vorgabewerten.
 *
 * `isOverlap` ist das Engine-Flag und wird hier konsistent zu
 * `affectedPlayerIds` gehalten, damit die Fixture echte Daten abbildet.
 */
const candidate = (overrides: Partial<BanCandidate> = {}): BanCandidate => ({
  championName: "Karma",
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
})

const banOf = (
  championName: string,
  phase: ScoutBanPhase,
  isOverlap: boolean,
  priority: number,
): BanCandidate =>
  candidate({
    championName,
    phase,
    isOverlap,
    priority,
    affectedPlayerIds: isOverlap ? ["p1", "p2"] : ["p1"],
    reasons: [{ code: "high_winrate_many_games", params: { games: 12 } }],
  })

/**
 * Die priorisierte Liste, in Prioritaetsreihenfolge.
 *
 * Rang · Champion · Phase       · Mehrfachtreffer
 *   1  · Ahri     · safe        · ja
 *   2  · Zed      · target      · nein
 *   3  · Karma    · safe        · nein
 *   4  · Yasuo    · situational · ja
 *   5  · Lee Sin  · target      · nein
 *   6  · Jinx     · situational · nein
 *   7  · Vi       · target      · ja
 */
const PLAN: readonly BanCandidate[] = [
  banOf("Ahri", "safe", true, 0.95),
  banOf("Zed", "target", false, 0.9),
  banOf("Karma", "safe", false, 0.85),
  banOf("Yasuo", "situational", true, 0.8),
  banOf("Lee Sin", "target", false, 0.75),
  banOf("Jinx", "situational", false, 0.7),
  banOf("Vi", "target", true, 0.65),
]

const RANKED: readonly RankedBanCandidate[] = rankBanCandidates(PLAN)

const ALL_NAMES = ["Ahri", "Zed", "Karma", "Yasuo", "Lee Sin", "Jinx", "Vi"]

const names = (entries: readonly RankedBanCandidate[]): string[] =>
  entries.map((entry) => entry.candidate.championName)

const ranks = (entries: readonly RankedBanCandidate[]): number[] =>
  entries.map((entry) => entry.rank)

const counts = (
  entries: readonly RankedBanCandidate[],
  overlapOnly: boolean,
): number[] => banPhaseFilterOptions(entries, overlapOnly).map((option) => option.count)

/**
 * Ein echtes Draft-Board, Zug fuer Zug ueber die Domain-API gebaut.
 *
 * WIRFT bei einem abgelehnten Zug, statt still das unveraenderte Board
 * weiterzureichen. Eine Fixture, die den Champion nie gesetzt hat, wuerde jeden
 * Sichtbarkeitstest hier gruen faerben, ohne dass der Verfuegbarkeitsfilter
 * irgendetwas getan haette.
 */
const boardWith = (moves: readonly (readonly [string, string])[]): DraftSlot[] => {
  let board: DraftSlot[] = createDraftBoard()
  for (const [slotId, championName] of moves) {
    const result = applyDraftAction(board, slotId, championName)
    if (!result.ok) {
      throw new Error(`applyDraftAction(${slotId}, ${championName}) -> ${result.reason}`)
    }
    board = result.board
  }
  return board
}

const occupied = (board: readonly DraftSlot[]): string[] =>
  board.filter((slot) => slot.championName !== null).map((slot) => slot.championName as string)

/**
 * Der Verfuegbarkeitsfilter genau so aufgerufen, wie das Panel ihn aufruft:
 * dreiargumentig, weil der Name bei einem `RankedBanCandidate` unter
 * `entry.candidate.championName` sitzt und nicht oben.
 */
const availableOf = (
  entries: readonly RankedBanCandidate[],
  board: readonly DraftSlot[],
): RankedBanCandidate[] =>
  filterAvailableBanCandidates(entries, board, (entry) => entry.candidate.championName)

/** Die ganze Panel-Pipeline als reine Funktion, in der Reihenfolge des Panels. */
const panelView = (
  plan: readonly BanCandidate[],
  board: readonly DraftSlot[],
  phaseFilter: ScoutBanPhaseFilter,
  overlapOnly: boolean,
) => {
  const ranked = rankBanCandidates(plan)
  const available = availableOf(ranked, board)
  const takenByDraft = ranked.length - available.length
  return {
    ranked,
    available,
    takenByDraft,
    visible: filterBans(available, phaseFilter, overlapOnly),
    // Exakt der Ausdruck aus ScoutBanPlanPanel.tsx: "der Draft hat Kandidaten
    // genommen UND es ist keiner uebrig", nicht blosses "ein Draft existiert".
    emptyKey: scoutBanListEmptyKey(overlapOnly, available.length === 0 && takenByDraft > 0),
  }
}

/**
 * Das Standard-Draft dieser Datei.
 *
 * Nimmt zwei Kandidaten aus zwei verschiedenen Phasen und mit verschiedenem
 * Overlap-Status: Ahri (Rang 1, safe, Mehrfachtreffer) als BAN und Lee Sin
 * (Rang 5, target, Einzeltreffer) als PICK. Damit sind Ban- und Pick-Pfad
 * gleichzeitig abgedeckt, und beide Zaehlervektoren aendern sich messbar.
 */
const BOARD = boardWith([
  ["ban-blue-0", "Ahri"],
  ["pick-blue-0", "Lee Sin"],
])

const AVAILABLE = availableOf(RANKED, BOARD)

/* ==========================================================================
 * 1. Sichtbarkeit
 * ========================================================================== */

describe("Draft-Verfuegbarkeit: was aus der Kandidatenliste faellt", () => {
  it("setzt die Fixture ueberhaupt auf das Board", () => {
    // Vorbedingung, ohne die alle folgenden Tests vakuos waeren: ein
    // abgelehnter Zug haette ein leeres Board hinterlassen und der Filter
    // haette nichts zu tun gehabt.
    expect(occupied(BOARD)).toEqual(["Ahri", "Lee Sin"])
    expect(BOARD).toHaveLength(20)
  })

  it("entfernt einen im Draft GEPICKTEN Champion", () => {
    const board = boardWith([["pick-red-2", "Yasuo"]])
    const available = availableOf(RANKED, board)

    expect(names(available)).toEqual(["Ahri", "Zed", "Karma", "Lee Sin", "Jinx", "Vi"])
    expect(names(available)).not.toContain("Yasuo")
    expect(available).toHaveLength(6)
  })

  it("entfernt einen im Draft GEBANNTEN Champion", () => {
    const board = boardWith([["ban-red-4", "Zed"]])
    const available = availableOf(RANKED, board)

    expect(names(available)).toEqual(["Ahri", "Karma", "Yasuo", "Lee Sin", "Jinx", "Vi"])
    expect(names(available)).not.toContain("Zed")
    expect(available).toHaveLength(6)
  })

  it("laesst einen Champion stehen, der im Draft gar nicht vorkommt", () => {
    // Der Draft nimmt hier einen Champion, der im Plan nicht auftaucht. Ein
    // Filter, der pauschal etwas wegwirft, faellt hier auf.
    const board = boardWith([["ban-blue-1", "Teemo"]])
    const available = availableOf(RANKED, board)

    expect(names(available)).toEqual(ALL_NAMES)
    expect(ranks(available)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("aendert bei LEEREM Draft-Board gar nichts", () => {
    const available = availableOf(RANKED, createDraftBoard())

    // Gleichheit ueber die ganze Liste, nicht bloss ueber die Laenge: ein
    // Filter, der den falschen Eintrag durch einen anderen ersetzt, haette
    // dieselbe Laenge.
    expect(names(available)).toEqual(ALL_NAMES)
    expect(ranks(available)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(available).toEqual(RANKED)
    available.forEach((entry, index) => {
      expect(entry, `#${index}`).toBe(RANKED[index])
    })
    // Und ein leeres Board ist eben nicht "alles genommen".
    expect(available).toHaveLength(RANKED.length)
  })

  it("behandelt ein fehlendes Board wie ein leeres (das Panel reicht `[]` durch)", () => {
    expect(availableOf(RANKED, [])).toEqual(RANKED)
    expect(availableOf(RANKED, [])).toHaveLength(7)
  })

  it("vergleicht ueber die Champion-IDENTITAET, nicht ueber den rohen String", () => {
    /*
      Die Schreibvariante ist der eigentliche Diskriminator. `Kai'Sa` auf dem
      Board und `KaiSa` im Ban-Plan sind derselbe Champion; ein `===` oder ein
      `trim().toLowerCase()` wuerde das nicht sehen und den Ban weiter
      empfehlen, obwohl er nicht mehr spielbar ist.
    */
    const plan = rankBanCandidates([
      banOf("KaiSa", "safe", false, 0.9),
      banOf("Jinx", "target", false, 0.8),
    ])
    const board = boardWith([["ban-blue-0", "Kai'Sa"]])

    // Die beiden Schreibweisen sind wirklich verschieden, der Test haengt also
    // nicht an einem versehentlich identischen String.
    expect("KaiSa").not.toBe("Kai'Sa")
    expect(occupied(board)).toEqual(["Kai'Sa"])

    expect(names(availableOf(plan, board))).toEqual(["Jinx"])
  })

  it("nimmt in der zweiargumentigen Form die Kandidaten direkt", () => {
    // Dieselbe Regel ohne Wrapper: `BanCandidate` traegt `championName` oben,
    // also braucht es keinen Selektor.
    const board = boardWith([["ban-blue-0", "Ahri"]])
    const available = filterAvailableBanCandidates(PLAN, board)

    expect(available.map((entry) => entry.championName)).toEqual([
      "Zed",
      "Karma",
      "Yasuo",
      "Lee Sin",
      "Jinx",
      "Vi",
    ])
    expect(available[0]).toBe(PLAN[1])
  })
})

/* ==========================================================================
 * 2. Der Rang bleibt der aus der VOLLEN Liste
 * ========================================================================== */

describe("Draft-Verfuegbarkeit: der Originalrang ueberlebt", () => {
  it("laesst Luecken in der Nummerierung stehen, statt neu zu nummerieren", () => {
    /*
      Die Kernzusage. Ahri (#1) und Lee Sin (#5) sind im Draft vergeben, also
      traegt die uebrige Liste die Raenge 2, 3, 4, 6, 7. Wuerde nach dem
      Entfernen neu gezaehlt, saege dort 1..5 und "#7" hiesse nur noch
      "fuenfte Zeile auf dem Schirm".
    */
    expect(ranks(AVAILABLE)).toEqual([2, 3, 4, 6, 7])
    expect(ranks(AVAILABLE)).not.toEqual([1, 2, 3, 4, 5])
  })

  it("behaelt die Reihenfolge der priorisierten Liste bei", () => {
    expect(names(AVAILABLE)).toEqual(["Zed", "Karma", "Yasuo", "Jinx", "Vi"])
  })

  it("haelt Rang und Champion zusammen", () => {
    // Nicht bloss "die Raenge stimmen als Menge": ein Filter, der die Raenge
    // gegen die falschen Kandidaten schiebt, waere davon erfuellt.
    expect(
      AVAILABLE.map((entry) => `${entry.rank}:${entry.candidate.championName}`),
    ).toEqual(["2:Zed", "3:Karma", "4:Yasuo", "6:Jinx", "7:Vi"])
  })

  it("nummeriert auch nach Phasen- und Overlap-Filter nicht neu", () => {
    expect(ranks(filterBans(AVAILABLE, "target", false))).toEqual([2, 7])
    expect(ranks(filterBans(AVAILABLE, "all", true))).toEqual([4, 7])
    expect(ranks(filterBans(AVAILABLE, "situational", false))).toEqual([4, 6])
  })
})

/* ==========================================================================
 * 3. Zaehler und Liste kommen aus derselben Quelle
 * ========================================================================== */

describe("Draft-Verfuegbarkeit: Chip-Zahl == Listenlaenge", () => {
  it("die Zahl auf jedem Chip IST die Laenge der Liste, die er oeffnet", () => {
    // Die Invariante, fuer alle vier Phasen in beiden Overlap-Zustaenden.
    //
    // Fuer sich genommen ist dieser Test schwach: `banPhaseFilterOptions` ist
    // aus `filterBans` abgeleitet, die Gleichheit ist also solange tautologisch,
    // wie beide dieselbe EINGABE bekommen. Genau darum geht es hier auch nicht.
    // Was er sichert, ist die Eingabe: beide Seiten lesen `AVAILABLE`. Die
    // beiden Gegenproben weiter unten sind der Teil, der das beweist.
    for (const overlapOnly of [false, true]) {
      const options = banPhaseFilterOptions(AVAILABLE, overlapOnly)
      expect(options, `${overlapOnly}`).toHaveLength(SCOUT_BAN_PHASE_FILTERS.length)
      options.forEach((option, index) => {
        expect(option.filter, `${overlapOnly}/${index}`).toBe(SCOUT_BAN_PHASE_FILTERS[index])
        expect(option.count, `${option.filter}/${overlapOnly}`).toBe(
          filterBans(AVAILABLE, option.filter, overlapOnly).length,
        )
      })
    }
  })

  it("nennt die konkreten Zahlen dieses Plans nach dem Draft", () => {
    // Ausgeschrieben, damit ein Fehlschlag sagt, WAS sich verschoben hat.
    expect(counts(AVAILABLE, false)).toEqual([5, 1, 2, 2])
    expect(counts(AVAILABLE, true)).toEqual([2, 0, 1, 1])
  })

  it("haelt dieselbe Invariante fuer den Overlap-Schalter", () => {
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      for (const overlapOnly of [false, true]) {
        const option = banOverlapFilterOption(AVAILABLE, filter, overlapOnly)
        expect(option.count, `${filter}/${overlapOnly}`).toBe(
          filterBans(AVAILABLE, filter, true).length,
        )
        expect(option.active, `${filter}/${overlapOnly}`).toBe(overlapOnly)
      }
    }
  })

  it("nennt die konkreten Overlap-Zahlen dieses Plans nach dem Draft", () => {
    expect(banOverlapFilterOption(AVAILABLE, "all", false).count).toBe(2)
    expect(banOverlapFilterOption(AVAILABLE, "safe", false).count).toBe(0)
    expect(banOverlapFilterOption(AVAILABLE, "target", false).count).toBe(1)
    expect(banOverlapFilterOption(AVAILABLE, "situational", false).count).toBe(1)
  })

  it("GEGENPROBE: aus `ranked` gezaehlt waeren die Chips zu gross", () => {
    /*
      Ohne diesen Test beweist die Invariante oben nichts ueber die QUELLE:
      `banPhaseFilterOptions(ranked, …)` waere mit sich selbst genauso
      konsistent, nur eben mit Zahlen, die die Liste nie zeigt.

      Ahri (safe, Mehrfachtreffer) und Lee Sin (target) sind vergeben, also
      muessen sich beide Vektoren unterscheiden.
    */
    const fromRanked = counts(RANKED, false)
    const fromAvailable = counts(AVAILABLE, false)

    expect(fromRanked).toEqual([7, 2, 3, 2])
    expect(fromAvailable).toEqual([5, 1, 2, 2])
    // Ausdrueckliche Ungleichheit, sonst waere die Gegenprobe wertlos.
    expect(fromRanked).not.toEqual(fromAvailable)

    const fromRankedOverlap = counts(RANKED, true)
    const fromAvailableOverlap = counts(AVAILABLE, true)

    expect(fromRankedOverlap).toEqual([3, 1, 1, 1])
    expect(fromAvailableOverlap).toEqual([2, 0, 1, 1])
    expect(fromRankedOverlap).not.toEqual(fromAvailableOverlap)
  })

  it("GEGENPROBE: eine aus `ranked` gezaehlte Zahl verspricht mehr Zeilen als da sind", () => {
    // Genau der Defekt, den die Quelle verhindert: der Chip "Alle: 7" wuerde
    // eine Liste mit fuenf Zeilen oeffnen.
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      const promised = banPhaseFilterOptions(RANKED, false).find(
        (option) => option.filter === filter,
      )
      const shown = filterBans(AVAILABLE, filter, false).length
      expect(promised, filter).toBeDefined()
      expect(promised?.count ?? -1, filter).toBeGreaterThanOrEqual(shown)
    }
    expect(banPhaseFilterOptions(RANKED, false)[0].count).toBeGreaterThan(
      filterBans(AVAILABLE, "all", false).length,
    )
    // Und derselbe Bruch beim Overlap-Schalter: "safe" haette 1 versprochen,
    // gezeigt wird nichts.
    expect(banOverlapFilterOption(RANKED, "safe", false).count).toBe(1)
    expect(banOverlapFilterOption(AVAILABLE, "safe", false).count).toBe(0)
    expect(filterBans(AVAILABLE, "safe", true)).toEqual([])
  })
})

/* ==========================================================================
 * 4. Der Leerzustand: der Draft gewinnt
 * ========================================================================== */

describe("scoutBanListEmptyKey", () => {
  it("nennt ohne Draft-Ursache den Phasenfilter", () => {
    expect(scoutBanListEmptyKey(false, false)).toBe("scout_banPhaseFilterEmpty")
  })

  it("nennt ohne Draft-Ursache den Overlap-Schalter, solange er an ist", () => {
    expect(scoutBanListEmptyKey(true, false)).toBe("scout_banOverlapFilterEmpty")
  })

  it("nennt den Draft, wenn er die Liste geleert hat", () => {
    expect(scoutBanListEmptyKey(false, true)).toBe("scout_banDraftEmpty")
  })

  it("laesst den DRAFT vor dem Overlap-Regler gewinnen", () => {
    /*
      Der wichtigste der vier Faelle. Hat der Draft alle Kandidaten genommen,
      bringt KEIN Chip einen zurueck: "schalte den Filter aus" oder "wechsle auf
      Alle" waere ein falscher Rat, weil beide Ansichten genauso leer sind. Das
      ist derselbe Fehler, den die Overlap-Meldung eine Version frueher
      vermeiden sollte, nur eine Ebene hoeher.
    */
    expect(scoutBanListEmptyKey(true, true)).toBe("scout_banDraftEmpty")
    expect(scoutBanListEmptyKey(true, true)).not.toBe("scout_banOverlapFilterEmpty")
  })

  it("hat fuer den zweiten Parameter einen Default", () => {
    // Aeltere Aufrufstellen (und der Overlap-Test aus 0.7.6) rufen die Funktion
    // einargumentig auf; das muss weiterhin "kein Draft im Spiel" heissen.
    expect(scoutBanListEmptyKey(false)).toBe(scoutBanListEmptyKey(false, false))
    expect(scoutBanListEmptyKey(true)).toBe(scoutBanListEmptyKey(true, false))
    expect(scoutBanListEmptyKey(false)).toBe("scout_banPhaseFilterEmpty")
    expect(scoutBanListEmptyKey(true)).toBe("scout_banOverlapFilterEmpty")
  })
})

describe("Leerzustand am ganzen Pipeline-Durchlauf", () => {
  it("meldet den Draft, wenn er JEDEN Kandidaten genommen hat", () => {
    const board = boardWith([
      ["ban-blue-0", "Ahri"],
      ["ban-red-0", "Zed"],
      ["ban-blue-1", "Karma"],
      ["ban-red-1", "Yasuo"],
      ["ban-blue-2", "Lee Sin"],
      ["ban-red-2", "Jinx"],
      ["pick-blue-0", "Vi"],
    ])

    for (const overlapOnly of [false, true]) {
      const view = panelView(PLAN, board, "all", overlapOnly)
      expect(view.available, `${overlapOnly}`).toEqual([])
      expect(view.takenByDraft, `${overlapOnly}`).toBe(7)
      expect(view.visible, `${overlapOnly}`).toEqual([])
      expect(view.emptyKey, `${overlapOnly}`).toBe("scout_banDraftEmpty")
    }
  })

  it("meldet den Filter, wenn der Draft nur einen TEIL genommen hat", () => {
    /*
      Der Fall, den `emptiedByDraft` von "ein Draft existiert" unterscheidet:
      Ahri ist weg, aber sechs Kandidaten sind uebrig. Dass unter safe kein
      Mehrfachtreffer mehr steht, liegt dann wirklich an den Reglern, und der
      Rat "schalte den Filter aus" ist richtig.
    */
    const board = boardWith([["ban-blue-0", "Ahri"]])
    const view = panelView(PLAN, board, "safe", true)

    expect(view.takenByDraft).toBe(1)
    expect(view.available).toHaveLength(6)
    expect(view.visible).toEqual([])
    expect(view.emptyKey).toBe("scout_banOverlapFilterEmpty")
  })

  it("meldet den Phasenfilter, wenn gar kein Draft im Spiel ist", () => {
    const onlySafe: readonly BanCandidate[] = [
      banOf("Ahri", "safe", true, 0.9),
      banOf("Karma", "safe", false, 0.8),
      banOf("Jinx", "safe", false, 0.7),
    ]
    const view = panelView(onlySafe, createDraftBoard(), "target", false)

    expect(view.takenByDraft).toBe(0)
    expect(view.available).toHaveLength(3)
    expect(view.visible).toEqual([])
    expect(view.emptyKey).toBe("scout_banPhaseFilterEmpty")
  })
})

/* ==========================================================================
 * 5. i18n der drei Leerzustaende
 * ========================================================================== */

describe("die i18n-Keys der Ban-Leerzustaende", () => {
  const EMPTY_KEYS: readonly TranslationKey[] = [
    "scout_banPhaseFilterEmpty",
    "scout_banOverlapFilterEmpty",
    "scout_banDraftEmpty",
  ]

  const placeholders = (text: string): string[] => (text.match(/\{(\w+)\}/g) ?? []).sort()

  it("deckt genau die Keys ab, die scoutBanListEmptyKey erzeugen kann", () => {
    const produced = new Set<TranslationKey>()
    for (const overlapOnly of [false, true]) {
      for (const emptiedByDraft of [false, true]) {
        produced.add(scoutBanListEmptyKey(overlapOnly, emptiedByDraft))
      }
    }
    expect([...produced].sort()).toEqual([...EMPTY_KEYS].sort())
  })

  it("existieren in DE UND EN und sind nicht leer", () => {
    for (const key of EMPTY_KEYS) {
      expect(typeof de[key], `de/${key}`).toBe("string")
      expect(de[key].length, `de/${key}`).toBeGreaterThan(0)
      expect(typeof en[key], `en/${key}`).toBe("string")
      expect(en[key].length, `en/${key}`).toBeGreaterThan(0)
    }
  })

  it("tragen in DE und EN dieselben Platzhalter, naemlich keine", () => {
    // Alle drei sind vollstaendige Saetze ohne Zahl. Ein spaeter eingebauter
    // Platzhalter muesste in beiden Sprachen stehen, sonst verschwaende der
    // Wert in genau einer.
    for (const key of EMPTY_KEYS) {
      expect(placeholders(de[key]), `de/${key}`).toEqual([])
      expect(placeholders(en[key]), `en/${key}`).toEqual(placeholders(de[key]))
      expect(de[key], `de/${key}`).not.toMatch(/\{[a-z]+\}/i)
      expect(en[key], `en/${key}`).not.toMatch(/\{[a-z]+\}/i)
    }
  })

  it("sagt in beiden Sprachen etwas ANDERES als die beiden Filtermeldungen", () => {
    // Waere der Draft-Text eine Kopie, koennte der Nutzer die drei Ursachen
    // nicht unterscheiden und der dritte Fall waere sinnlos.
    expect(de.scout_banDraftEmpty).not.toBe(de.scout_banPhaseFilterEmpty)
    expect(de.scout_banDraftEmpty).not.toBe(de.scout_banOverlapFilterEmpty)
    expect(en.scout_banDraftEmpty).not.toBe(en.scout_banPhaseFilterEmpty)
    expect(en.scout_banDraftEmpty).not.toBe(en.scout_banOverlapFilterEmpty)
  })
})

/* ==========================================================================
 * 6. Verfuegbarkeit ist reine Sichtbarkeit
 * ========================================================================== */

describe("Draft-Verfuegbarkeit: nichts wird neu gerechnet", () => {
  it("reicht die ueberlebenden Eintraege per REFERENZ durch", () => {
    // `toBe`, nicht `toEqual`: das beweist, dass weder der Wrapper noch der
    // Kandidat kopiert oder neu gebaut wurde. Ein Filter, der neu rechnet,
    // koennte dieselben Werte liefern und faellt hier trotzdem auf.
    expect(AVAILABLE[0]).toBe(RANKED[1])
    expect(AVAILABLE[1]).toBe(RANKED[2])
    expect(AVAILABLE[2]).toBe(RANKED[3])
    expect(AVAILABLE[3]).toBe(RANKED[5])
    expect(AVAILABLE[4]).toBe(RANKED[6])

    expect(AVAILABLE[0].candidate).toBe(PLAN[1])
    expect(AVAILABLE[4].candidate).toBe(PLAN[6])
    expect(AVAILABLE[0].candidate.reasons).toBe(PLAN[1].reasons)
  })

  it("laesst priority, phase, confidence, isOverlap und reasons unveraendert", () => {
    const originalByName = new Map(PLAN.map((entry) => [entry.championName, entry]))

    for (const entry of AVAILABLE) {
      const original = originalByName.get(entry.candidate.championName)
      expect(original, entry.candidate.championName).toBeDefined()
      if (original === undefined) continue

      expect(entry.candidate, original.championName).toBe(original)
      expect(entry.candidate.priority, original.championName).toBe(original.priority)
      expect(entry.candidate.phase, original.championName).toBe(original.phase)
      expect(entry.candidate.confidence, original.championName).toBe(original.confidence)
      expect(entry.candidate.isOverlap, original.championName).toBe(original.isOverlap)
      expect(entry.candidate.reasons, original.championName).toBe(original.reasons)
    }
    // Und die konkreten Werte, damit ein Fehlschlag nicht nur "irgendwas ist
    // anders" sagt.
    expect(AVAILABLE.map((entry) => entry.candidate.priority)).toEqual([0.9, 0.85, 0.8, 0.7, 0.65])
    expect(AVAILABLE.map((entry) => entry.candidate.phase)).toEqual([
      "target",
      "safe",
      "situational",
      "situational",
      "target",
    ])
    expect(AVAILABLE.map((entry) => entry.candidate.isOverlap)).toEqual([
      false,
      false,
      true,
      false,
      true,
    ])
  })

  it("mutiert weder den Plan noch die gerankte Liste noch das Board", () => {
    const planBefore = JSON.stringify(PLAN)
    const rankedBefore = JSON.stringify(RANKED)
    const boardBefore = JSON.stringify(BOARD)

    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      for (const overlapOnly of [false, true]) {
        panelView(PLAN, BOARD, filter, overlapOnly)
      }
    }

    expect(JSON.stringify(PLAN)).toBe(planBefore)
    expect(JSON.stringify(RANKED)).toBe(rankedBefore)
    expect(JSON.stringify(BOARD)).toBe(boardBefore)
    expect(PLAN).toHaveLength(7)
    expect(RANKED).toHaveLength(7)
    expect(occupied(BOARD)).toEqual(["Ahri", "Lee Sin"])
  })

  it("gibt eine neue Liste zurueck, kein Alias auf die Eingabe", () => {
    // Der Aufrufer darf das Ergebnis anfassen, ohne die gerankte Liste zu
    // beschaedigen.
    const passthrough = availableOf(RANKED, createDraftBoard())
    expect(passthrough).not.toBe(RANKED)
    expect(passthrough).toEqual(RANKED)
  })
})
