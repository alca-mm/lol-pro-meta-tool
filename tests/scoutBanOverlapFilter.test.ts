/**
 * Der Overlap-Filter des Ban-Plans (0.7.6).
 *
 * Neben den Phasen-Chips aus 0.7.5 steht seit 0.7.6 ein zweiter Schalter:
 * "Nur Mehrfachtreffer". Er GRUPPIERT nicht und er oeffnet keine zweite Liste,
 * er verengt dieselbe priorisierte Liste. Genau das unterscheidet ihn von der
 * `overlapBans`-Liste, die 0.7.4 entfernt hat, und deshalb pinnt diese Datei
 * vor allem zwei Dinge:
 *
 *  1. Der ORIGINALRANG ueberlebt jede Filterung. "#7" heisst weiterhin
 *     "siebtwichtigster Ban insgesamt", nicht "dritte Zeile auf dem Schirm",
 *     also hat die gefilterte Liste Luecken (1, 4, 7) und das ist gewollt.
 *  2. Zaehler und Liste kommen aus DERSELBEN Funktion (`filterBans`). Ein Chip
 *     darf keine Zahl versprechen, die die Liste dann nicht zeigt. Genau diese
 *     Form von Defekt hat das Modul schon dreimal produziert
 *     (`ScoutManualSource` an drei Stellen, `overwrittenRows` gegen
 *     `removedExistingRows`, `banPhaseCounts()` gegen `prioritizedBans`).
 *
 * Alles hier sind reine Funktionen aus src/components/scout/scoutUiHelpers.ts.
 * Vitest laeuft in Node ohne jsdom (vite.config.ts, `test.environment: 'node'`),
 * es wird nichts gerendert und nichts ueber den Quelltext gescannt.
 *
 * ANTI-VAKUOSITAET: Jede Fixture unten enthaelt BEIDE Sorten von Kandidaten,
 * Mehrfachtreffer und Einzeltreffer, und in jeder Phase. Eine Fixture aus lauter
 * Overlap-Kandidaten waere von einem Filter, der gar nichts tut, ebenso erfuellt.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import type { BanCandidate, ScoutBanPhase } from "../src/scout/types"
import {
  SCOUT_BAN_PHASE_FILTERS,
  banOverlapFilterOption,
  banPhaseFilterOptions,
  fillPlaceholders,
  filterBans,
  filterBansByOverlap,
  filterBansByPhase,
  isBanOverlapFilterEnabled,
  rankBanCandidates,
  scoutBanListEmptyKey,
} from "../src/components/scout/scoutUiHelpers"
import type { RankedBanCandidate } from "../src/components/scout/scoutUiHelpers"

/* --------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

/**
 * Ein Ban-Kandidat mit tragbaren Vorgabewerten.
 *
 * `isOverlap` steht bewusst NICHT auf einem abgeleiteten Wert: die Engine setzt
 * es als `affectedPlayerIds.length > 1`, aber der Filter liest das Flag, nicht
 * die Ids. Die Fixture haelt beides normalerweise konsistent, damit sie echte
 * Daten abbildet; genau ein Test unten bricht das absichtlich auf.
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
  phase: ScoutBanPhase | undefined,
  isOverlap: boolean,
): BanCandidate =>
  candidate({
    championName,
    ...(phase === undefined ? {} : { phase }),
    isOverlap,
    affectedPlayerIds: isOverlap ? ["p1", "p2"] : ["p1"],
  })

/**
 * Die priorisierte Liste, in Prioritaetsreihenfolge.
 *
 * Bewusst so gebaut, dass jeder Test etwas beweisen KANN:
 *  - jede Phase enthaelt genau einen Mehrfachtreffer und mindestens einen
 *    Einzeltreffer, sonst waere "hat gefiltert" von einem Filter erfuellt, der
 *    nichts tut;
 *  - die Mehrfachtreffer sitzen auf den Raengen 1, 4 und 7, also mit Luecken;
 *  - `all` und `target` haben VERSCHIEDENE Overlap-Zahlen (3 gegen 1), sonst
 *    koennte der phasenbezogene Zaehler nicht von einem globalen unterschieden
 *    werden.
 *
 * Rang · Champion · Phase · Mehrfachtreffer
 *   1  · Ahri     · safe        · ja
 *   2  · Zed      · target      · nein
 *   3  · Karma    · safe        · nein
 *   4  · Yasuo    · situational · ja
 *   5  · Lee Sin  · target      · nein
 *   6  · Jinx     · situational · nein
 *   7  · Vi       · target      · ja
 */
const PLAN: readonly BanCandidate[] = [
  banOf("Ahri", "safe", true),
  banOf("Zed", "target", false),
  banOf("Karma", "safe", false),
  banOf("Yasuo", "situational", true),
  banOf("Lee Sin", "target", false),
  banOf("Jinx", "situational", false),
  banOf("Vi", "target", true),
]

const RANKED: readonly RankedBanCandidate[] = rankBanCandidates(PLAN)

const names = (entries: readonly RankedBanCandidate[]): string[] =>
  entries.map((entry) => entry.candidate.championName)

const ranks = (entries: readonly RankedBanCandidate[]): number[] =>
  entries.map((entry) => entry.rank)

const ALL_NAMES = ["Ahri", "Zed", "Karma", "Yasuo", "Lee Sin", "Jinx", "Vi"]

/* ==========================================================================
 * 1. filterBansByOverlap — was der Schalter selbst tut
 * ========================================================================== */

describe("filterBansByOverlap", () => {
  it("gibt bei false ALLE Eintraege zurueck, in unveraenderter Reihenfolge", () => {
    expect(names(filterBansByOverlap(RANKED, false))).toEqual(ALL_NAMES)
    expect(filterBansByOverlap(RANKED, false)).toHaveLength(7)
  })

  it("gibt bei true NUR Mehrfachtreffer zurueck", () => {
    // Die Fixture enthaelt vier Einzeltreffer, also faellt hier wirklich etwas
    // weg. Die konkreten Namen, nicht bloss die Laenge: ein Filter, der die
    // falschen vier wegwirft, haette dieselbe Laenge.
    expect(names(filterBansByOverlap(RANKED, true))).toEqual(["Ahri", "Yasuo", "Vi"])
    for (const entry of filterBansByOverlap(RANKED, true)) {
      expect(entry.candidate.isOverlap, entry.candidate.championName).toBe(true)
    }
  })

  it("behaelt die Reihenfolge der priorisierten Liste in beiden Zustaenden", () => {
    // Nicht sortiert, nicht umgedreht: die Prioritaet der Engine ist die einzige
    // Ordnung, die dieser Filter kennt.
    expect(names(filterBansByOverlap(RANKED, false))).toEqual(ALL_NAMES)
    expect(names(filterBansByOverlap(RANKED, true))).toEqual(["Ahri", "Yasuo", "Vi"])
  })

  it("behaelt den ORIGINALRANG mit Luecken bei, statt neu zu nummerieren", () => {
    // Der Kern der Nummerierungsentscheidung. Wuerde die gefilterte Liste bei 1
    // neu beginnen, saehe sie wie eine zweite, eigene Liste aus und "#7" saegte
    // nichts mehr ausser "dritte Zeile auf dem Schirm".
    expect(ranks(filterBansByOverlap(RANKED, true))).toEqual([1, 4, 7])
    expect(ranks(filterBansByOverlap(RANKED, false))).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("mutiert die Eingabe nicht und gibt auch bei false eine KOPIE zurueck", () => {
    const before = JSON.stringify(PLAN)
    const passthrough = filterBansByOverlap(RANKED, false)
    const filtered = filterBansByOverlap(RANKED, true)

    expect(JSON.stringify(PLAN)).toBe(before)
    expect(RANKED).toHaveLength(7)
    // Kein Alias auf die Eingabe: der Aufrufer darf das Ergebnis anfassen.
    expect(passthrough).not.toBe(RANKED)
    expect(passthrough).toEqual(RANKED)
    // Die Eintraege selbst werden durchgereicht, nicht kopiert, damit der Rang
    // und der Kandidat identisch bleiben.
    expect(passthrough[0]).toBe(RANKED[0])
    expect(filtered[0]).toBe(RANKED[0])
    expect(filtered[1]).toBe(RANKED[3])
  })

  it("liest das Engine-Flag, nicht die Zahl der betroffenen Ids", () => {
    // Von der Engine nicht erzeugbar (`isOverlap = affectedPlayerIds.length > 1`),
    // aber es pinnt, WELCHES Feld gelesen wird. Ein Nachzaehlen der Ids waere
    // die naheliegende Umschreibung, und sie waere an einer Spielerkarte falsch:
    // dort wird gar keine Namensaufloesung uebergeben.
    const flagged = rankBanCandidates([
      candidate({ championName: "Flagged", isOverlap: true, affectedPlayerIds: ["p1"] }),
      candidate({ championName: "Unflagged", isOverlap: false, affectedPlayerIds: ["p1", "p2"] }),
    ])

    expect(names(filterBansByOverlap(flagged, true))).toEqual(["Flagged"])
  })

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(filterBansByOverlap([], false)).toEqual([])
    expect(filterBansByOverlap([], true)).toEqual([])
  })
})

/* ==========================================================================
 * 2. filterBans — die eine Komposition beider Filter
 * ========================================================================== */

describe("filterBans", () => {
  it("kombiniert Phase UND Overlap", () => {
    // Der entscheidende Fall: die Phase target enthaelt drei Bans, davon ist
    // genau einer ein Mehrfachtreffer, und er sitzt am ENDE der Liste. Ein
    // Filter, der nur die Phase anwendet, liefert hier drei Namen; einer, der
    // nur den Overlap anwendet, liefert Ahri und Yasuo mit.
    expect(names(filterBans(RANKED, "target", true))).toEqual(["Vi"])
    expect(ranks(filterBans(RANKED, "target", true))).toEqual([7])
  })

  it("ist bei ausgeschaltetem Schalter identisch zum reinen Phasenfilter", () => {
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      expect(names(filterBans(RANKED, filter, false)), filter).toEqual(
        names(filterBansByPhase(RANKED, filter)),
      )
    }
  })

  it("liefert je Phase genau die erwarteten Mehrfachtreffer", () => {
    expect(names(filterBans(RANKED, "all", true))).toEqual(["Ahri", "Yasuo", "Vi"])
    expect(names(filterBans(RANKED, "safe", true))).toEqual(["Ahri"])
    expect(names(filterBans(RANKED, "target", true))).toEqual(["Vi"])
    expect(names(filterBans(RANKED, "situational", true))).toEqual(["Yasuo"])
  })

  it("behaelt auch nach beiden Filtern den Rang aus der VOLLEN Liste", () => {
    expect(ranks(filterBans(RANKED, "all", true))).toEqual([1, 4, 7])
    expect(ranks(filterBans(RANKED, "safe", false))).toEqual([1, 3])
    expect(ranks(filterBans(RANKED, "situational", true))).toEqual([4])
  })

  it("mutiert die Eingabe nicht", () => {
    const before = JSON.stringify(PLAN)
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      for (const overlapOnly of [false, true]) {
        filterBans(RANKED, filter, overlapOnly)
      }
    }
    expect(JSON.stringify(PLAN)).toBe(before)
    expect(RANKED).toHaveLength(7)
  })

  it("zeigt einen Kandidaten OHNE Phase nur unter all, auch mit Overlap-Filter", () => {
    // Die Engine erzeugt das nicht (`resolvePhase()` ist total), der Contract
    // laesst `phase` aber optional. Ihn ueberall zu verstecken hiesse, einen Ban
    // lautlos zu verlieren, und mit gedruecktem Overlap-Schalter waere das
    // besonders unauffaellig.
    const withGap = rankBanCandidates([
      banOf("Ahri", "safe", true),
      banOf("Mystery", undefined, true),
      banOf("Zed", "target", false),
    ])

    expect(names(filterBans(withGap, "all", true))).toEqual(["Ahri", "Mystery"])
    expect(names(filterBans(withGap, "all", false))).toEqual(["Ahri", "Mystery", "Zed"])
    for (const phase of ["safe", "target", "situational"] as const) {
      expect(names(filterBans(withGap, phase, true)), phase).not.toContain("Mystery")
      expect(names(filterBans(withGap, phase, false)), phase).not.toContain("Mystery")
    }
  })

  it("kommt mit einer leeren Liste zurecht", () => {
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      expect(filterBans([], filter, false), filter).toEqual([])
      expect(filterBans([], filter, true), filter).toEqual([])
    }
  })
})

/* ==========================================================================
 * 3. Zaehler == Liste — die Kerninvariante
 * ========================================================================== */

describe("banPhaseFilterOptions", () => {
  it("liefert alle vier in Anzeigereihenfolge, all zuerst", () => {
    expect(banPhaseFilterOptions(RANKED, false).map((option) => option.filter)).toEqual([
      "all",
      "safe",
      "target",
      "situational",
    ])
  })

  it("zaehlt bei ausgeschaltetem Schalter die volle Phase", () => {
    expect(banPhaseFilterOptions(RANKED, false)).toEqual([
      { filter: "all", count: 7 },
      { filter: "safe", count: 2 },
      { filter: "target", count: 3 },
      { filter: "situational", count: 2 },
    ])
  })

  it("SCHRUMPFT jeden Zaehler, solange der Overlap-Schalter an ist", () => {
    // Das ist der Grund, warum `overlapOnly` ein Pflichtparameter ist. Ein Chip
    // mit "Gezielt: 3" wuerde sonst eine Liste mit einem einzigen Eintrag
    // oeffnen.
    expect(banPhaseFilterOptions(RANKED, true)).toEqual([
      { filter: "all", count: 3 },
      { filter: "safe", count: 1 },
      { filter: "target", count: 1 },
      { filter: "situational", count: 1 },
    ])
  })

  it("die Zahl auf dem Chip IST die Laenge der Liste, die er oeffnet", () => {
    // Die eigentliche Zusage, und zwar fuer JEDE Phase in BEIDEN Zustaenden.
    // Zaehler und Liste kommen aus derselben Funktion, sie koennen sich also
    // nicht widersprechen.
    for (const overlapOnly of [false, true]) {
      const options = banPhaseFilterOptions(RANKED, overlapOnly)
      expect(options).toHaveLength(SCOUT_BAN_PHASE_FILTERS.length)
      options.forEach((option, index) => {
        expect(option.filter, `${overlapOnly}`).toBe(SCOUT_BAN_PHASE_FILTERS[index])
        expect(option.count, `${option.filter}/${overlapOnly}`).toBe(
          filterBans(RANKED, option.filter, overlapOnly).length,
        )
      })
    }
  })

  it("meldet eine leere Phase mit 0, statt sie wegzulassen", () => {
    const single = rankBanCandidates([banOf("Ahri", "safe", false)])

    expect(banPhaseFilterOptions(single, false).map((option) => option.count)).toEqual([1, 1, 0, 0])
    // Mit Schalter faellt der einzige Ban ebenfalls raus: viermal 0, aber immer
    // noch vier Chips.
    expect(banPhaseFilterOptions(single, true).map((option) => option.count)).toEqual([0, 0, 0, 0])
    expect(banPhaseFilterOptions(single, true)).toHaveLength(4)
  })

  it("meldet bei leerem Plan viermal 0", () => {
    expect(banPhaseFilterOptions([], false).map((option) => option.count)).toEqual([0, 0, 0, 0])
    expect(banPhaseFilterOptions([], true).map((option) => option.count)).toEqual([0, 0, 0, 0])
  })
})

/* ==========================================================================
 * 4. banOverlapFilterOption — die Zahl springt beim Druecken nicht
 * ========================================================================== */

describe("banOverlapFilterOption", () => {
  it("zaehlt immer, WAS der Schalter oeffnen wuerde, in beiden Zustaenden gleich", () => {
    // Der Wert wird mit `overlapOnly = true` gerechnet, egal wie der Schalter
    // gerade steht. Eine Zahl, die beim Druecken von 7 auf 3 springt, waere die
    // Antwort auf zwei verschiedene Fragen.
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      const off = banOverlapFilterOption(RANKED, filter, false)
      const on = banOverlapFilterOption(RANKED, filter, true)
      const expected = filterBans(RANKED, filter, true).length

      expect(off.count, filter).toBe(expected)
      expect(on.count, filter).toBe(expected)
      expect(off.count, filter).toBe(on.count)
    }
  })

  it("meldet den Schalterzustand unveraendert zurueck", () => {
    expect(banOverlapFilterOption(RANKED, "all", false).active).toBe(false)
    expect(banOverlapFilterOption(RANKED, "all", true).active).toBe(true)
  })

  it("ist PHASENBEZOGEN, nicht global", () => {
    // Die diskriminierende Fixture-Eigenschaft: all hat drei Mehrfachtreffer,
    // target genau einen. Ein Zaehler, der immer die ganze Liste liest, meldete
    // unter target ebenfalls 3 und der Chip loege ueber die Liste, die er
    // oeffnet.
    expect(banOverlapFilterOption(RANKED, "all", false).count).toBe(3)
    expect(banOverlapFilterOption(RANKED, "target", false).count).toBe(1)
    expect(banOverlapFilterOption(RANKED, "safe", false).count).toBe(1)
    expect(banOverlapFilterOption(RANKED, "situational", false).count).toBe(1)
    // Und noch einmal als Ungleichheit, damit ein Fehlschlag sagt, WAS kollabiert
    // ist.
    expect(banOverlapFilterOption(RANKED, "all", false).count).not.toBe(
      banOverlapFilterOption(RANKED, "target", false).count,
    )
  })

  it("meldet 0 fuer eine Phase ohne Mehrfachtreffer und fuer einen leeren Plan", () => {
    const noOverlap = rankBanCandidates([
      banOf("Ahri", "safe", false),
      banOf("Zed", "target", false),
    ])

    expect(banOverlapFilterOption(noOverlap, "all", false).count).toBe(0)
    expect(banOverlapFilterOption(noOverlap, "safe", true).count).toBe(0)
    expect(banOverlapFilterOption([], "all", false)).toEqual({ count: 0, active: false })
    expect(banOverlapFilterOption([], "target", true)).toEqual({ count: 0, active: true })
  })
})

/* ==========================================================================
 * 5. isBanOverlapFilterEnabled — der aktive Schalter wird nie gesperrt
 * ========================================================================== */

describe("isBanOverlapFilterEnabled", () => {
  it("sperrt den Schalter, wenn es nichts zu oeffnen gibt", () => {
    // Ein Klick auf eine Null fuehrt garantiert zu einer leeren Liste, und die
    // Null auf dem Chip sagt bereits alles.
    expect(isBanOverlapFilterEnabled({ count: 0, active: false })).toBe(false)
  })

  it("sperrt den AKTIVEN Schalter niemals, auch nicht bei 0", () => {
    // Daten koennen sich unter einem gedrueckten Schalter aendern: eine
    // Bearbeitung der Scout-Daten rechnet neu. Ihn dann zu deaktivieren wuerde
    // den Tastaturfokus verlieren und aria-pressed auf ein totes Element setzen.
    // Er ist ausserdem sein eigener Rueckweg, es gaebe also keinen anderen.
    expect(isBanOverlapFilterEnabled({ count: 0, active: true })).toBe(true)
  })

  it("laesst einen gefuellten Schalter anklicken", () => {
    expect(isBanOverlapFilterEnabled({ count: 3, active: false })).toBe(true)
    expect(isBanOverlapFilterEnabled({ count: 1, active: false })).toBe(true)
    expect(isBanOverlapFilterEnabled({ count: 3, active: true })).toBe(true)
  })

  it("passt zu dem, was banOverlapFilterOption fuer diesen Plan liefert", () => {
    // Gegenprobe an echten Daten statt nur an Handattrappen: unter jeder Phase
    // gibt es hier Mehrfachtreffer, der Schalter ist also ueberall erreichbar.
    for (const filter of SCOUT_BAN_PHASE_FILTERS) {
      expect(isBanOverlapFilterEnabled(banOverlapFilterOption(RANKED, filter, false)), filter).toBe(
        true,
      )
    }
    // Und ein Plan ohne einen einzigen Mehrfachtreffer sperrt ihn, solange er
    // aus ist.
    const noOverlap = rankBanCandidates([banOf("Ahri", "safe", false)])
    expect(isBanOverlapFilterEnabled(banOverlapFilterOption(noOverlap, "all", false))).toBe(false)
    expect(isBanOverlapFilterEnabled(banOverlapFilterOption(noOverlap, "all", true))).toBe(true)
  })
})

/* ==========================================================================
 * 6. Leerzustand und i18n
 * ========================================================================== */

describe("scoutBanListEmptyKey", () => {
  it("nennt den Schalter, der die Zeilen tatsaechlich versteckt", () => {
    // "Wechsle auf Alle" waere falsch, solange der Overlap-Schalter leert: die
    // Ansicht Alle waere dann genauso leer.
    expect(scoutBanListEmptyKey(true)).toBe("scout_banOverlapFilterEmpty")
    expect(scoutBanListEmptyKey(false)).toBe("scout_banPhaseFilterEmpty")
  })

  it("liefert beide Male einen Key, den es in DE UND EN wirklich gibt", () => {
    for (const overlapOnly of [true, false]) {
      const key = scoutBanListEmptyKey(overlapOnly)
      for (const [lang, catalogue] of [
        ["de", de],
        ["en", en],
      ] as const) {
        expect(typeof catalogue[key], `${lang}/${key}`).toBe("string")
        expect(catalogue[key].length, `${lang}/${key}`).toBeGreaterThan(0)
      }
    }
  })
})

describe("die i18n-Keys des Overlap-Filters", () => {
  const NEW_KEYS: readonly TranslationKey[] = [
    "scout_banOverlapFilterLabel",
    "scout_banOverlapFilterOnly",
    "scout_banOverlapFilterCount",
    "scout_banOverlapFilterEmpty",
  ]

  const placeholders = (text: string): string[] =>
    (text.match(/\{(\w+)\}/g) ?? []).map((token) => token).sort()

  it("existieren in beiden Sprachen und sind nicht leer", () => {
    for (const key of NEW_KEYS) {
      expect(typeof de[key], `de/${key}`).toBe("string")
      expect(de[key].length, `de/${key}`).toBeGreaterThan(0)
      expect(typeof en[key], `en/${key}`).toBe("string")
      expect(en[key].length, `en/${key}`).toBeGreaterThan(0)
    }
  })

  it("tragen in DE und EN dieselben Platzhalter", () => {
    // Platzhalter-Paritaet ist die Falle, die genau ein Mal pro Sprache zuschlaegt:
    // fehlt {count} im englischen Text, verschwindet die Zahl nur dort.
    for (const key of NEW_KEYS) {
      expect(placeholders(en[key]), key).toEqual(placeholders(de[key]))
    }
    expect(placeholders(de.scout_banOverlapFilterCount)).toEqual(["{count}", "{label}"])
  })

  it("rendert die Beschriftung des Schalters in DE und EN vollstaendig", () => {
    // Der ganze beschriftete String, nicht bloss "enthaelt die Zahl": ein
    // toContain("3") waere schon von einer 30 erfuellt.
    expect(
      fillPlaceholders(de.scout_banOverlapFilterCount, {
        label: de.scout_banOverlapFilterOnly,
        count: 3,
      }),
    ).toBe("Nur Mehrfachtreffer: 3")
    expect(
      fillPlaceholders(en.scout_banOverlapFilterCount, {
        label: en.scout_banOverlapFilterOnly,
        count: 3,
      }),
    ).toBe("Multi-player only: 3")
  })

  it("laesst weder Platzhalter noch Maschinenwerte auf den Schalter durch", () => {
    for (const [lang, catalogue] of [
      ["de", de],
      ["en", en],
    ] as const) {
      for (const count of [0, 1, 3, 12]) {
        const text = fillPlaceholders(catalogue.scout_banOverlapFilterCount, {
          label: catalogue.scout_banOverlapFilterOnly,
          count,
        })

        expect(text.length, `${lang}/${count}`).toBeGreaterThan(0)
        expect(text, `${lang}/${count}`).toContain(catalogue.scout_banOverlapFilterOnly)
        expect(text, `${lang}/${count}`).toContain(`: ${count}`)
        expect(text, `${lang}/${count}`).not.toMatch(/\{[a-z]+\}/i)
        expect(text, `${lang}/${count}`).not.toContain("undefined")
        expect(text, `${lang}/${count}`).not.toContain("null")
        expect(text, `${lang}/${count}`).not.toContain("NaN")
      }
    }
  })

  it("rendert die echte Zahl dieses Plans, nicht irgendeine", () => {
    // Ende zu Ende durch beide Schichten: Zaehler aus `filterBans`, Text aus
    // i18n. Unter target ist es eine 1, unter all eine 3.
    const label = de.scout_banOverlapFilterOnly
    const render = (filter: "all" | "target"): string =>
      fillPlaceholders(de.scout_banOverlapFilterCount, {
        label,
        count: banOverlapFilterOption(RANKED, filter, false).count,
      })

    expect(render("all")).toBe("Nur Mehrfachtreffer: 3")
    expect(render("target")).toBe("Nur Mehrfachtreffer: 1")
  })
})
