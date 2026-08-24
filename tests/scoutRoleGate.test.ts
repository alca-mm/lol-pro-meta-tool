import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  analyzeScout,
  buildChampionRoleIndex,
  evaluateChampionRoleViability,
} from "../src/scout/analysis"
import { championLookupKey } from "../src/scout/championIdentity"
import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import {
  describeRoleViabilityEvidence,
  formatScoutPercent,
  scoutRoleGateStatusKey,
} from "../src/components/scout/scoutUiHelpers"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS } from "../src/scout/types"
import type { ChampionStats, Role } from "../src/domain/types"
import type {
  ChampionSignal,
  ManualChampionEntry,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutRole,
  ScoutSubstituteSlot,
} from "../src/scout/types"

/**
 * Role-gate transparency.
 *
 * 0.7.0 made the ban plan better and less explainable at the same time: a
 * champion simply stopped appearing, and the only trace was one reason line.
 * Two things were invisible. First, whether the gate ran at all — with no
 * reference data every verdict is `"unknown"` and the plan silently falls back
 * to pre-0.7.0 behaviour, which looks exactly like a working gate. Second, what
 * the verdict rested on: the user was told "practically never played there" and
 * had to take it on faith.
 *
 * Nothing here changes a score. The evidence is diagnosis; the thresholds, the
 * rank weighting and the ban formula are untouched, and a separate test below
 * pins that.
 */

const tDe = (key: TranslationKey): string => de[key]
const tEn = (key: TranslationKey): string => en[key]
const LANGS = [
  ["de", tDe],
  ["en", tEn],
] as const

/* -------------------------------------------------------------------------
 * builders
 * ------------------------------------------------------------------------- */

function player(id: string, role: ScoutRole = "unknown"): ScoutPlayer {
  return {
    id,
    riotName: id,
    tagline: "EUW",
    region: "EUW",
    displayName: id + "#EUW",
    role,
    sources: [],
  }
}

function entry(
  championName: string,
  games: number,
  winrate: number,
  overrides: Partial<ManualChampionEntry> = {},
): ManualChampionEntry {
  return {
    championName,
    games,
    winrate,
    note: "",
    source: "manual",
    recency: "current",
    role: "unknown",
    ...overrides,
  }
}

function dataOf(
  ...pairs: readonly (readonly [string, readonly ManualChampionEntry[]])[]
): Record<ScoutPlayerId, ScoutPlayerData> {
  const result: Record<ScoutPlayerId, ScoutPlayerData> = {}
  for (const [id, entries] of pairs) result[id] = { playerId: id, entries: [...entries] }
  return result
}

function lineupOf(
  starters: Partial<Record<ScoutLineupSlot, ScoutPlayerId>> = {},
  substitutes: Partial<Record<ScoutSubstituteSlot, ScoutPlayerId>> = {},
): ScoutLineup {
  const starterSlots = {} as Record<ScoutLineupSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_LINEUP_SLOTS) starterSlots[slot] = starters[slot] ?? null
  const substituteSlots = {} as Record<ScoutSubstituteSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) substituteSlots[slot] = substitutes[slot] ?? null
  return { starters: starterSlots, substitutes: substituteSlots }
}

function signalFor(
  signals: readonly ChampionSignal[],
  championName: string,
): ChampionSignal | undefined {
  return signals.find((signal) => signal.championName === championName)
}

function reference(
  championName: string,
  picks: number,
  shares: Partial<Record<Role, number>>,
): ChampionStats {
  const roleDistribution = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 } as Record<Role, number>
  for (const role of SCOUT_LINEUP_SLOTS) roleDistribution[role] = shares[role] ?? 0
  return {
    championName,
    games: 1000,
    picks,
    bans: 0,
    wins: Math.round(picks * 0.5),
    losses: picks - Math.round(picks * 0.5),
    pickRate: 0.1,
    banRate: 0,
    presence: 0.1,
    winRate: 0.5,
    roleDistribution,
    sampleSizeLabel: "sample_good",
    draftPriorityScore: 0.5,
  }
}

/** The real measured numbers, same fixtures as tests/scoutRoleViability.test.ts. */
const REFERENCE: readonly ChampionStats[] = [
  reference("Karma", 2254, { support: 0.6735, mid: 0.2902, top: 0.0346, bot: 0.0013, jungle: 0.0004 }),
  reference("Lee Sin", 1889, { jungle: 0.9719, top: 0.0143, mid: 0.0079, support: 0.0032, bot: 0.0026 }),
  // 12 picks, far under the total-sample floor.
  reference("Evelynn", 12, { jungle: 1 }),
]

const INDEX = buildChampionRoleIndex(REFERENCE)
const key = championLookupKey

/* -------------------------------------------------------------------------
 * 1. the evidence itself
 * ------------------------------------------------------------------------- */

describe("evaluateChampionRoleViability", () => {
  it("reports the numbers behind a withheld champion", () => {
    const evidence = evaluateChampionRoleViability(INDEX, key("Karma"), "jungle")

    expect(evidence.status).toBe("implausible")
    expect(evidence.reason).toBe("below_threshold")
    expect(evidence.evaluatedRole).toBe("jungle")
    // 0.04 % of 2254 picks is one single game.
    expect(evidence.picksInRole).toBe(1)
    expect(evidence.roleShare).toBeCloseTo(0.0004, 6)
    expect(evidence.totalPicks).toBe(2254)
    expect(evidence.primaryRole).toBe("support")
    expect(evidence.minPicksInRole).toBe(15)
    expect(evidence.minRoleShare).toBe(0.0125)
  })

  it("marks the champion's own main lane as the fallback that carried it", () => {
    const evidence = evaluateChampionRoleViability(INDEX, key("Lee Sin"), "jungle")

    expect(evidence.status).toBe("viable")
    expect(evidence.reason).toBe("primary_role_fallback")
    expect(evidence.primaryRole).toBe("jungle")
  })

  it("separates a real secondary lane from the fallback", () => {
    // Karma mid clears both thresholds on its own, without being the main lane.
    const evidence = evaluateChampionRoleViability(INDEX, key("Karma"), "mid")

    expect(evidence.status).toBe("viable")
    expect(evidence.reason).toBe("viable")
    expect(evidence.primaryRole).toBe("support")
    expect(evidence.picksInRole).toBe(654)
  })

  it("says the sample is too small rather than calling the lane unplayable", () => {
    const evidence = evaluateChampionRoleViability(INDEX, key("Evelynn"), "support")

    expect(evidence.status).toBe("unknown")
    expect(evidence.reason).toBe("sample_too_small")
    expect(evidence.totalPicks).toBe(12)
    // Nothing was measured about the lane, so nothing is claimed about it.
    expect(evidence.picksInRole).toBeUndefined()
    expect(evidence.roleShare).toBeUndefined()
  })

  it("distinguishes the three ways a verdict can be impossible", () => {
    expect(evaluateChampionRoleViability(buildChampionRoleIndex(undefined), key("Karma"), "jungle"))
      .toMatchObject({ status: "unknown", reason: "reference_missing" })
    expect(evaluateChampionRoleViability(INDEX, key("Ahri"), "jungle")).toMatchObject({
      status: "unknown",
      reason: "champion_missing",
    })
    expect(evaluateChampionRoleViability(INDEX, key("Karma"), "unknown")).toMatchObject({
      status: "unknown",
      reason: "role_unknown",
    })
  })

  it("never reports a measurement it did not take", () => {
    // "not measured" and "measured as zero" are different statements, the same
    // discipline `kda: null` vs `kda: 0` follows.
    for (const evidence of [
      evaluateChampionRoleViability(buildChampionRoleIndex(undefined), key("Karma"), "jungle"),
      evaluateChampionRoleViability(INDEX, key("Ahri"), "jungle"),
      evaluateChampionRoleViability(INDEX, key("Karma"), "unknown"),
    ]) {
      expect(evidence.picksInRole, evidence.reason).toBeUndefined()
      expect(evidence.roleShare, evidence.reason).toBeUndefined()
      expect(evidence.totalPicks, evidence.reason).toBeUndefined()
    }
  })

  it("agrees with the verdict function it projects", () => {
    // One rule, not two. If these ever disagree the UI explains a decision the
    // engine did not make.
    for (const champion of ["Karma", "Lee Sin", "Evelynn", "Ahri"]) {
      for (const role of [...SCOUT_LINEUP_SLOTS, "unknown"] as const) {
        const evidence = evaluateChampionRoleViability(INDEX, key(champion), role)
        expect(evidence.status, `${champion} ${role}`).toBe(
          evaluateChampionRoleViability(INDEX, key(champion), role).status,
        )
      }
    }
  })
})

/* -------------------------------------------------------------------------
 * 2. the session status
 * ------------------------------------------------------------------------- */

describe("analyzeScout — role gate status", () => {
  const players = [player("sup", "support")]
  const supportPoolAsJungle = dataOf([
    "sup",
    [entry("Karma", 80, 72, { role: "jungle" }), entry("Lee Sin", 30, 60, { role: "jungle" })],
  ])
  const lineup = lineupOf({ jungle: "sup" })

  it("reports unavailable when no reference reached the engine", () => {
    // THE POINT OF THIS FEATURE. Without the reference the plan quietly behaves
    // like it did before 0.7.0, and that is indistinguishable from a gate that
    // simply found nothing to remove.
    const result = analyzeScout(players, supportPoolAsJungle, { lineup })

    expect(result.roleGate.status).toBe("unavailable")
    expect(result.roleGate.filteredChampions).toBe(0)
  })

  it("reports active when the gate judged everything it was asked about", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REFERENCE,
    })

    expect(result.roleGate.status).toBe("active")
    expect(result.roleGate.unjudgedChampions).toBe(0)
    expect(result.roleGate.filteredChampions).toBe(1)
  })

  it("reports partial when a champion is missing from the reference", () => {
    const result = analyzeScout(
      players,
      dataOf(["sup", [entry("Lee Sin", 30, 60, { role: "jungle" }), entry("Ahri", 20, 60, { role: "jungle" })]]),
      { lineup, championRoleReference: REFERENCE },
    )

    expect(result.roleGate.status).toBe("partial")
    expect(result.roleGate.unjudgedChampions).toBe(1)
  })

  it("reports partial when a champion's own sample is too thin", () => {
    const result = analyzeScout(
      players,
      dataOf(["sup", [entry("Evelynn", 30, 60, { role: "jungle" })]]),
      { lineup, championRoleReference: REFERENCE },
    )

    expect(result.roleGate.status).toBe("partial")
    expect(result.roleGate.unjudgedChampions).toBe(1)
  })

  it("does not blame the reference for a player who holds no lane", () => {
    // `role_unknown` is an unfinished lineup, not a gap in the data. Counting it
    // as one would tell the user to fix the wrong thing.
    const result = analyzeScout(
      [player("pool", "jungle"), player("top", "top")],
      dataOf(["pool", [entry("Karma", 80, 72, { role: "jungle" })]]),
      { lineup: lineupOf({ top: "top" }), championRoleReference: REFERENCE },
    )

    expect(result.roleGate.status).toBe("active")
    expect(result.roleGate.unjudgedChampions).toBe(0)
  })

  it("stays unavailable even when nothing would have been filtered anyway", () => {
    // Derived from the INPUT, not from the counters: a session with nothing to
    // remove must not look like a healthy gate.
    const result = analyzeScout(players, dataOf(["sup", [entry("Lee Sin", 30, 60, { role: "jungle" })]]), {
      lineup,
    })

    expect(result.roleGate.status).toBe("unavailable")
    expect(result.roleGate.filteredChampions).toBe(0)
  })

  it("attaches the evidence to every signal", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REFERENCE,
    })

    for (const signal of result.players[0].signals) {
      expect(signal.roleViabilityEvidence, signal.championName).toBeDefined()
      expect(signal.roleViabilityEvidence?.status).toBe(signal.roleViability)
    }
    expect(signalFor(result.players[0].signals, "Karma")?.roleViabilityEvidence?.reason).toBe(
      "below_threshold",
    )
  })

  it("changes no score", () => {
    // The evidence is diagnosis, so the numbers must be exactly what the engine
    // produced before it. MEASURED, not chosen: my first draft of this test
    // invented 0.593 and 0.116, and the engine returned 0.784 and 0.15.
    //
    // What this pins is drift from here on. That the 0.7.0 numbers themselves
    // are untouched is proven elsewhere and better: the literal ban priorities
    // frozen in tests/scoutImportIntegration.test.ts (0.859 / 0.823 / 0.766)
    // pass unchanged, and they would move on any change to the scoring path.
    const withReference = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REFERENCE,
    })
    const scores = withReference.players[0].signals.map((signal) => [
      signal.championName,
      signal.score,
    ])

    expect(scores).toEqual([
      ["Lee Sin", 0.784],
      // Withheld from the plan, but the row keeps its damped score and its data.
      ["Karma", 0.15],
    ])
    expect(withReference.banPlan.prioritizedBans.map((c) => [c.championName, c.priority])).toEqual([
      ["Lee Sin", 0.784],
    ])
  })

  it("produces the same scores with and without the evidence being read", () => {
    // The stronger statement, and it needs no literal: supplying the reference
    // changes WHICH champions reach the plan, never the arithmetic behind a
    // champion the gate did not touch.
    const gated = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REFERENCE,
    })
    const ungated = analyzeScout(players, supportPoolAsJungle, { lineup })

    expect(signalFor(gated.players[0].signals, "Lee Sin")?.score).toBe(
      signalFor(ungated.players[0].signals, "Lee Sin")?.score,
    )
  })
})

/* -------------------------------------------------------------------------
 * 3. how it reads
 * ------------------------------------------------------------------------- */

describe("formatScoutPercent", () => {
  it("keeps a share the user is meant to check", () => {
    // `formatScoutNumber` rounds to one decimal and renders this as "0", which
    // is why the display needed its own formatter.
    expect(formatScoutPercent(0.0004)).toBe("0.04")
    expect(formatScoutPercent(0.0125)).toBe("1.25")
    expect(formatScoutPercent(0.2902)).toBe("29.02")
  })

  it("drops trailing zeros instead of printing 25.00", () => {
    expect(formatScoutPercent(0.25)).toBe("25")
    expect(formatScoutPercent(1)).toBe("100")
  })

  it("uses a decimal point, like every other number in the scout", () => {
    expect(formatScoutPercent(0.0004)).not.toContain(",")
  })

  it("returns nothing for a non-number rather than NaN", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatScoutPercent(bad)).toBe("")
    }
  })
})

describe("describeRoleViabilityEvidence", () => {
  const linesFor = (
    t: (key: TranslationKey) => string,
    champion: string,
    role: ScoutRole,
  ): string[] => describeRoleViabilityEvidence(t, evaluateChampionRoleViability(INDEX, key(champion), role))

  it("says nothing when there is nothing to explain", () => {
    expect(describeRoleViabilityEvidence(tDe, undefined)).toEqual([])
  })

  it("shows lane, picks, share, total and the thresholds for a withheld champion", () => {
    const lines = linesFor(tDe, "Karma", "jungle")

    // Whole labelled lines, not loose substrings. A mutation probe showed the
    // earlier `toContain("1")` was satisfied by the "100" of a swapped share,
    // so picks and share could be exchanged without a single test noticing.
    expect(lines).toContain("Geprüfte Lane: Jungle")
    expect(lines).toContain("Picks auf dieser Lane: 1")
    expect(lines).toContain("Anteil an allen Picks: 0.04%")
    expect(lines).toContain("Picks insgesamt: 2254")
    expect(lines).toContain("Nötig wären mindestens 15 Picks und 1.25%.")
  })

  it("does not confuse the picks with the share", () => {
    // The discriminator: with the two swapped, the share line would read 100%
    // (one pick of one) and the picks line would carry a percentage.
    const lines = linesFor(tDe, "Karma", "jungle")
    const picksLine = lines.find((line) => line.startsWith("Picks auf dieser Lane:"))
    const shareLine = lines.find((line) => line.startsWith("Anteil an allen Picks:"))

    expect(picksLine).toBe("Picks auf dieser Lane: 1")
    expect(shareLine).toBe("Anteil an allen Picks: 0.04%")
    expect(shareLine).not.toContain("100")
  })

  it("does not print thresholds next to a verdict that met them", () => {
    // They only mean something beside a measurement that missed.
    const viable = linesFor(tDe, "Karma", "mid").join(" | ")
    expect(viable).not.toContain(tDe("scout_roleGate_thresholds").replace("{picks}", "15"))
  })

  it("explains each impossible verdict in its own words", () => {
    const cases = [
      [linesFor(tDe, "Evelynn", "support"), "zu wenige Referenzdaten"],
      [linesFor(tDe, "Ahri", "jungle"), "fehlt in den Referenzdaten"],
      [linesFor(tDe, "Karma", "unknown"), "keiner Lane"],
    ] as const

    for (const [lines, fragment] of cases) {
      expect(lines.join(" | "), fragment).toContain(fragment)
    }
    expect(
      describeRoleViabilityEvidence(
        tDe,
        evaluateChampionRoleViability(buildChampionRoleIndex(undefined), key("Karma"), "jungle"),
      ).join(" | "),
    ).toContain("keine Referenzdaten")
  })

  it("never leaks a raw code or an empty value, in either language", () => {
    for (const [lang, t] of LANGS) {
      for (const champion of ["Karma", "Lee Sin", "Evelynn", "Ahri"]) {
        for (const role of [...SCOUT_LINEUP_SLOTS, "unknown"] as const) {
          for (const line of describeRoleViabilityEvidence(
            t,
            evaluateChampionRoleViability(INDEX, key(champion), role),
          )) {
            const label = `${lang} ${champion} ${role}: ${line}`
            expect(line.trim().length, label).toBeGreaterThan(0)
            for (const leak of [
              "undefined",
              "null",
              "NaN",
              "scout_",
              "below_threshold",
              "sample_too_small",
              "primary_role_fallback",
              "{",
              "}",
            ]) {
              expect(line, label).not.toContain(leak)
            }
          }
        }
      }
    }
  })
})

describe("scoutRoleGateStatusKey", () => {
  it("resolves a non-empty label for every status in both languages", () => {
    for (const status of ["active", "partial", "unavailable"] as const) {
      for (const [lang, t] of LANGS) {
        const label = t(scoutRoleGateStatusKey(status))
        expect(typeof label, `${lang} ${status}`).toBe("string")
        expect(label.trim().length, `${lang} ${status}`).toBeGreaterThan(0)
        expect(label, `${lang} ${status}`).not.toContain("scout_")
      }
    }
  })

  it("warns in the unavailable text and stays quiet in the active one", () => {
    // The whole reason the status is rendered: "off" has to read differently
    // from "on and found nothing".
    expect(de.scout_roleGate_unavailable.length).toBeGreaterThan(
      de.scout_roleGate_active.length * 2,
    )
    expect(de.scout_roleGate_unavailable).toContain("nicht verfügbar")
    expect(en.scout_roleGate_unavailable).toContain("unavailable")
  })

  it("gives the three statuses three distinct texts", () => {
    for (const [lang, t] of LANGS) {
      const texts = (["active", "partial", "unavailable"] as const).map((status) =>
        t(scoutRoleGateStatusKey(status)),
      )
      expect(new Set(texts).size, lang).toBe(3)
    }
  })
})

/* -------------------------------------------------------------------------
 * 4. where it sits — source scans, comments stripped
 * ------------------------------------------------------------------------- */

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

const read = (path: string): string => stripComments(readFileSync(path, "utf8"))

const BAN_PANEL = "src/components/scout/ScoutBanPlanPanel.tsx"
const SHARED = "src/components/scout/ScoutShared.tsx"

describe("the gate is visible without shouting", () => {
  it("scans real sources, and a comment cannot satisfy these", () => {
    expect(read(BAN_PANEL).length).toBeGreaterThan(1000)
    expect(stripComments("// scoutRoleGateStatusKey describeRoleViabilityEvidence")).not.toContain(
      "scoutRoleGateStatusKey",
    )
  })

  it("renders the status in the ban plan, where the consequence is", () => {
    const source = read(BAN_PANEL)

    // The whole call, not the identifier: a probe showed `toContain(
    // "scoutRoleGateStatusKey")` was already satisfied by the IMPORT line, so
    // the status could stop rendering entirely and this stayed green.
    expect(source).toContain("{t(scoutRoleGateStatusKey(analysis.roleGate.status))}")
  })

  it("keeps the honesty note and the count collapsed", () => {
    const source = read(BAN_PANEL)
    expect(source).toContain("scout_roleGate_details")
    expect(source).toContain("scout_roleGate_source")
    // Never open by default; the catalogue-wide rule is in scoutUxDeclutter.
    expect(source).not.toMatch(/<details[^>]*\bopen\b/)
  })

  it("puts the evidence in the SAME collapsed block as the reason tail", () => {
    // A second `details` per row would be the clutter 0.7.0 removed.
    const source = read(SHARED)
    expect(source).toContain("describeRoleViabilityEvidence")
    expect(source).toContain("evidenceLines")
    const detailsCount = (source.match(/<details/g) ?? []).length
    expect(detailsCount).toBe(1)
  })

  it("still opens the block when only evidence exists", () => {
    // With two reasons and no tail there would be no `details` at all, and the
    // numbers would have nowhere to go.
    expect(read(SHARED)).toContain("collapsed.length > 0 || evidenceLines.length > 0")
  })
})
