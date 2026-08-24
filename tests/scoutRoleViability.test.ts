import { describe, expect, it } from "vitest"

import {
  analyzeScout,
  buildChampionRoleIndex,
  championRoleViability,
} from "../src/scout/analysis"
import { championLookupKey } from "../src/scout/championIdentity"
import { SCOUT_REASON_PREVIEW_COUNT } from "../src/components/scout/scoutUiHelpers"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS } from "../src/scout/types"
import type { ChampionStats, Role } from "../src/domain/types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutRankTier,
  ScoutRole,
  ScoutSubstituteSlot,
} from "../src/scout/types"

/**
 * The role gate.
 *
 * THE BUG THIS FILE EXISTS FOR: a support main is moved into the jungle, and the
 * scout offers his support champions as jungle ban priorities.
 *
 * The cause is not weak off-role damping. `importRowToManualEntry()` stamps
 * every imported row with the role the USER picked ("die gewaehlte Rolle gewinnt
 * immer"), so a support pool imported under role `jungle` carries
 * `role: "jungle"` and reads perfectly `onrole` at FULL weight. Comparing the
 * entry role against the lineup role therefore cannot catch it. The only thing
 * that can is asking whether the champion is played in that lane at all.
 *
 * Offline and deterministic: the reference data is handed in as plain objects.
 * No network, no clock, no file system, and no Riot anything.
 */

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
  for (const [id, entries] of pairs) {
    result[id] = { playerId: id, entries: [...entries] }
  }
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

function names(candidates: readonly BanCandidate[]): string[] {
  return candidates.map((candidate) => candidate.championName)
}

function signalFor(
  signals: readonly ChampionSignal[],
  championName: string,
): ChampionSignal | undefined {
  return signals.find((signal) => signal.championName === championName)
}

function codesOf(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code)
}

/**
 * A reference row. `picks` is absolute and `shares` is that champion's
 * per-role share of those picks, which is exactly the shape
 * `calculateChampionStats()` produces.
 */
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

/**
 * The real numbers this feature was tuned against, measured over the repo's
 * dataset (24,978 matches / 249,780 picks).
 */
const REAL_REFERENCE: readonly ChampionStats[] = [
  // Karma: 2254 picks, support 67.35 %, mid 29.02 %, top 3.46 %, bot 0.13 %,
  // jungle 0.04 % (ONE pick in 24,978 matches).
  reference("Karma", 2254, { support: 0.6735, mid: 0.2902, top: 0.0346, bot: 0.0013, jungle: 0.0004 }),
  // Lulu: 1705 picks, essentially support only.
  reference("Lulu", 1705, { support: 0.9953, mid: 0.0023, bot: 0.0012, top: 0.0012 }),
  // Lee Sin: 1889 picks, jungle 97.19 %, top 1.43 % (27 picks, 20 players).
  reference("Lee Sin", 1889, { jungle: 0.9719, top: 0.0143, mid: 0.0079, support: 0.0032, bot: 0.0026 }),
  // Nautilus: 7024 picks, support 99.40 %, jungle 0.21 %. Note it fails BOTH
  // floors (0.21 % of 7024 is 14.75 picks), so it does NOT discriminate the
  // share term on its own. K'Sante below does.
  reference("Nautilus", 7024, { support: 0.994, bot: 0.0024, jungle: 0.0021, top: 0.001, mid: 0.0004 }),
  // K'Sante: 6667 picks, top 99.4 %, mid 0.57 % = 38 picks. THIS is the share
  // discriminator: 38 picks sails past the 15-pick floor, and only the 1.25 %
  // share floor rejects it. Drop the share term and this verdict flips.
  reference("K'Sante", 6667, { top: 0.994, mid: 0.0057, jungle: 0.0003 }),
  // Evelynn: 12 picks, 100 % jungle. Under the pick floor, saved by the
  // primary-role fallback.
  reference("Evelynn", 12, { jungle: 1 }),
  // Heimerdinger: 57 picks in the real data, i.e. BELOW the total-sample floor,
  // so the gate refuses to judge it at all. Kept as the fixture for exactly
  // that rule.
  reference("Heimerdinger", 57, { mid: 0.789, bot: 0.193, top: 0.018 }),
  // CONSTRUCTED, not measured: 100 total picks clears the 75-pick total floor,
  // and the secondary role holds 12 % of them, i.e. 12 picks. A fat share on a
  // sample that is still one pick short of the 15-pick role floor. This is the
  // only fixture here that isolates the ROLE-pick floor from both the share
  // floor and the total floor.
  reference("Ziggs", 100, { mid: 0.88, bot: 0.12 }),
  // CONSTRUCTED for the float boundary. 88 total picks with exactly 15 in the
  // secondary role: `roleDistribution` stores `15 / 88` and multiplying back by
  // 88 yields 14.999999999999998, one ULP under the 15-pick floor. This is the
  // shape that made a real count of 15 flip to `implausible` for 11 % of
  // possible pick totals.
  reference("Zilean", 88, { support: 15 / 88, mid: 73 / 88 }),
]

/* -------------------------------------------------------------------------
 * 1. the verdict function
 * ------------------------------------------------------------------------- */

describe("championRoleViability", () => {
  const index = buildChampionRoleIndex(REAL_REFERENCE)

  it("accepts a champion's primary role", () => {
    expect(championRoleViability(index, championLookupKey("Karma"), "support")).toBe("viable")
    expect(championRoleViability(index, championLookupKey("Lee Sin"), "jungle")).toBe("viable")
  })

  it("accepts a real secondary role above both thresholds", () => {
    // Karma mid: 654 picks, 29 %.
    expect(championRoleViability(index, championLookupKey("Karma"), "mid")).toBe("viable")
    // Karma top: 78 picks, 3.46 %. Thin but real.
    expect(championRoleViability(index, championLookupKey("Karma"), "top")).toBe("viable")
    // Lee Sin top: 27 picks, 1.43 %. Just above the share floor.
    expect(championRoleViability(index, championLookupKey("Lee Sin"), "top")).toBe("viable")
  })

  it("rejects the case this feature was built for: Karma jungle", () => {
    // One pick in 24,978 matches.
    expect(championRoleViability(index, championLookupKey("Karma"), "jungle")).toBe("implausible")
    expect(championRoleViability(index, championLookupKey("Lulu"), "jungle")).toBe("implausible")
  })

  it("rejects a thin spray of wrong-role picks on a very popular champion", () => {
    // A mutation probe caught this test being vacuous: Nautilus jungle is
    // 0.21 % of 7024 picks = 14.75, so it fails the PICK floor as well and
    // proved nothing about the share floor.
    //
    // K'Sante mid is the honest discriminator: 0.57 % of 6667 picks = 38, well
    // clear of the 15-pick floor, rejected by the share floor alone. Very
    // popular champions accumulate a thin spray of wrong-role picks that clears
    // any absolute floor, which is precisely why a share term is needed.
    expect(championRoleViability(index, championLookupKey("K'Sante"), "mid")).toBe("implausible")
    expect(championRoleViability(index, championLookupKey("K'Sante"), "top")).toBe("viable")

    // Still asserted, just no longer load-bearing for the share term.
    expect(championRoleViability(index, championLookupKey("Nautilus"), "jungle")).toBe("implausible")
  })

  it("rejects a fat share on a thin role sample", () => {
    // 12 % share, comfortably above the 1.25 % floor, but 12 picks against a
    // 15-pick floor, on a champion whose 100 total picks clear the total floor.
    // Remove the role-pick threshold and this verdict flips to viable.
    expect(championRoleViability(index, championLookupKey("Ziggs"), "bot")).toBe("implausible")
    // Its main role is untouched.
    expect(championRoleViability(index, championLookupKey("Ziggs"), "mid")).toBe("viable")
  })

  it("does not lose a role to a floating point round trip", () => {
    // REGRESSION. `picksByRole` is `share * picks`, the lossy inverse of the
    // `roleCount / picks` the reference stores, so an exact count of 15 can come
    // back as 14.999999999999998 and fail a `>= 15` test by one ULP. The
    // champion with the LARGER share was the one being rejected.
    const evidenceShare = 15 / 88
    expect(evidenceShare * 88, "fixture no longer exercises the undershoot").toBeLessThan(15)

    expect(championRoleViability(index, championLookupKey("Zilean"), "support")).toBe("viable")
  })

  it("refuses to judge a champion the reference barely covers", () => {
    // THE REGRESSION THIS EXISTS FOR, found in review. The reference is PRO
    // play while the scouted numbers are solo queue, so a champion that is rare
    // in pro says nothing about which roles a solo-queue player can fill. Before
    // the total-sample floor the gate happily called Warwick jungle (39 picks
    // total, 18 % share), Talon mid (34, 21 %) and Kayle mid (44, 16 %)
    // implausible and silently removed them from the ban plan. Every one of
    // those is a standard solo-queue role.
    for (const role of SCOUT_LINEUP_SLOTS) {
      expect(
        championRoleViability(index, championLookupKey("Heimerdinger"), role),
        `Heimerdinger ${role}`,
      ).toBe("unknown")
      expect(
        championRoleViability(index, championLookupKey("Evelynn"), role),
        `Evelynn ${role}`,
      ).toBe("unknown")
    }
  })

  it("still judges the popular champions the gate exists for", () => {
    // The floor must not blunt the gate where it earns its keep: every champion
    // it targets is a heavily played one.
    expect(championRoleViability(index, championLookupKey("Karma"), "jungle")).toBe("implausible")
    expect(championRoleViability(index, championLookupKey("Lulu"), "jungle")).toBe("implausible")
    expect(championRoleViability(index, championLookupKey("Nautilus"), "jungle")).toBe(
      "implausible",
    )
  })

  it("never erases a champion whose whole sample is tiny", () => {
    // Evelynn has 12 picks. Two independent rules protect her, and the total
    // floor is the stronger: the gate does not judge her at all, so she can
    // neither be erased nor endorsed. The primary-role fallback below covers
    // champions that clear the total floor but whose secondary roles are thin.
    for (const role of SCOUT_LINEUP_SLOTS) {
      expect(championRoleViability(index, championLookupKey("Evelynn"), role), role).not.toBe(
        "implausible",
      )
    }
  })

  it("keeps the primary role viable for a champion that clears the total floor", () => {
    // This is what the argmax fallback is for: Ziggs bot is one pick short of
    // the role floor, but its own main role must never be rejected.
    expect(championRoleViability(index, championLookupKey("Ziggs"), "mid")).toBe("viable")
    expect(championRoleViability(index, championLookupKey("Lee Sin"), "jungle")).toBe("viable")
  })

  it("never leaves a champion judged but unplayable everywhere", () => {
    // A champion is either judged, and then it has at least one viable role, or
    // it is not judged at all. What must never happen is a champion that is
    // `implausible` in every lane: that would delete it from the ban plan
    // outright, whatever the user typed.
    for (const stats of REAL_REFERENCE) {
      const key = championLookupKey(stats.championName)
      const verdicts = SCOUT_LINEUP_SLOTS.map((role) => championRoleViability(index, key, role))
      const judged = verdicts.some((verdict) => verdict !== "unknown")
      const viable = verdicts.filter((verdict) => verdict === "viable").length

      if (judged) {
        expect(viable, `${stats.championName} is judged but has no viable role`).toBeGreaterThan(0)
      } else {
        expect(
          verdicts.every((verdict) => verdict === "unknown"),
          `${stats.championName} is judged in some lanes but not others`,
        ).toBe(true)
      }
    }
  })

  it("answers unknown whenever no verdict is possible", () => {
    const empty = buildChampionRoleIndex(undefined)

    // No reference data at all: this is the pre-0.7.0 behaviour and must stay
    // completely silent rather than guess in either direction.
    expect(championRoleViability(empty, championLookupKey("Karma"), "jungle")).toBe("unknown")
    // A champion the reference does not cover.
    expect(championRoleViability(index, championLookupKey("Ahri"), "jungle")).toBe("unknown")
    // No role to judge against.
    expect(championRoleViability(index, championLookupKey("Karma"), "unknown")).toBe("unknown")
  })

  it("ignores reference rows that carry no evidence", () => {
    // A champion with zero picks says nothing about any role, so it must not
    // become a source of `implausible` verdicts.
    const index0 = buildChampionRoleIndex([reference("Locke", 0, {})])
    expect(championRoleViability(index0, championLookupKey("Locke"), "mid")).toBe("unknown")
  })

  it("survives junk in the reference without throwing", () => {
    const junk = [
      null,
      undefined,
      {},
      { championName: 42 },
      { championName: "Broken", picks: Number.NaN, roleDistribution: null },
      reference("Karma", 2254, { support: 0.6735, jungle: 0.0004 }),
    ] as unknown as readonly ChampionStats[]

    const built = buildChampionRoleIndex(junk)
    expect(championRoleViability(built, championLookupKey("Karma"), "jungle")).toBe("implausible")
    expect(championRoleViability(built, championLookupKey("Broken"), "mid")).toBe("unknown")
  })

  it("resolves the champion through the shared identity, so spelling does not matter", () => {
    for (const spelling of ["Lee Sin", "LeeSin", "leesin", "LEE SIN"]) {
      expect(championRoleViability(index, championLookupKey(spelling), "jungle"), spelling).toBe(
        "viable",
      )
    }
  })
})

/* -------------------------------------------------------------------------
 * 2. THE CORE REQUIREMENT: a support main in the jungle
 * ------------------------------------------------------------------------- */

describe("analyzeScout — a support pool filed under jungle", () => {
  const players = [player("sup", "support"), player("jgl", "jungle")]

  /**
   * Exactly what the import produces: the user picked role `jungle`, so EVERY
   * row says `jungle`, including the support champions. Nothing here is
   * off-role by the old definition.
   */
  const supportPoolAsJungle = dataOf([
    "sup",
    [
      entry("Karma", 80, 72, { role: "jungle" }),
      entry("Lulu", 60, 68, { role: "jungle" }),
      entry("Lee Sin", 30, 60, { role: "jungle" }),
    ],
  ])

  const lineup = lineupOf({ jungle: "sup" })

  it("keeps support champions out of the jungle ban plan", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    const banned = names(result.banPlan.prioritizedBans)
    expect(banned).not.toContain("Karma")
    expect(banned).not.toContain("Lulu")

    // Not in any phase either, and not in the per-player target list.
    for (const [label, list] of [
      ["safe", result.banPlan.phases?.safe ?? []],
      ["target", result.banPlan.phases?.target ?? []],
      ["situational", result.banPlan.phases?.situational ?? []],
      ["overlap", result.banPlan.overlapBans],
      ["targetBansByPlayer.sup", result.banPlan.targetBansByPlayer.sup ?? []],
    ] as const) {
      expect(names(list), label).not.toContain("Karma")
    }
  })

  it("still offers the champion he really can play in that lane", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    // Lee Sin is 97 % jungle. The gate must not become a blanket mute.
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Lee Sin"])
  })

  it("would have offered the support champions WITHOUT the reference data", () => {
    // The Gegenprobe. Without it this file would pass even if the gate did
    // nothing but drop every champion below Lee Sin's score.
    const result = analyzeScout(players, supportPoolAsJungle, { lineup })

    const banned = names(result.banPlan.prioritizedBans)
    expect(banned).toContain("Karma")
    expect(banned).toContain("Lulu")
    // And Karma outranked the legitimate pick, which is the reported bug.
    expect(banned[0]).toBe("Karma")
  })

  it("keeps the data, it only withholds the recommendation", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    const karma = signalFor(result.players[0].signals, "Karma")
    expect(karma).toBeDefined()
    // Every number the user typed is still there and still exact.
    expect(karma?.games).toBe(80)
    expect(karma?.winrate).toBe(72)
    expect(karma?.roleViability).toBe("implausible")
    // And it says why.
    expect(codesOf(karma?.reasons ?? [])).toContain("champion_not_playable_in_role")
    expect(karma?.confidence).toBe("low")
  })

  it("damps the withheld signal instead of leaving it at full strength", () => {
    // `ROLE_NOT_PLAYABLE_SCORE_WEIGHT` was asserted nowhere: no test read the
    // score of an implausible signal, so the damping could have been dropped
    // entirely while every other test stayed green. The signal keeps its data,
    // but it must not still read as a top threat inside the player's own list.
    const gated = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })
    const ungated = analyzeScout(players, supportPoolAsJungle, { lineup })

    const gatedKarma = signalFor(gated.players[0].signals, "Karma")?.score ?? -1
    const ungatedKarma = signalFor(ungated.players[0].signals, "Karma")?.score ?? -1

    expect(ungatedKarma).toBeGreaterThan(0)
    expect(gatedKarma).toBeGreaterThan(0)
    // Damped hard, and well below the champion he really can play there.
    expect(gatedKarma).toBeLessThan(ungatedKarma * 0.25)
    expect(gatedKarma).toBeLessThan(signalFor(gated.players[0].signals, "Lee Sin")?.score ?? 0)
  })

  it("names the champion and the lane in the reason params", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    const reason = signalFor(result.players[0].signals, "Karma")?.reasons.find(
      (item) => item.code === "champion_not_playable_in_role",
    )
    expect(reason?.params).toEqual({ champion: "Karma", role: "jungle" })
  })

  it("says once, with a count, that something was held back", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    const filtered = result.warnings.filter((item) => item.code === "role_not_playable_filtered")
    expect(filtered).toHaveLength(1)
    // Karma and Lulu, not Lee Sin.
    expect(filtered[0]?.params).toEqual({ count: 2 })
  })

  it("marks a viable signal as viable rather than leaving it unknown", () => {
    const result = analyzeScout(players, supportPoolAsJungle, {
      lineup,
      championRoleReference: REAL_REFERENCE,
    })

    expect(signalFor(result.players[0].signals, "Lee Sin")?.roleViability).toBe("viable")
  })

  it("leaves every verdict unknown when no reference is supplied", () => {
    const result = analyzeScout(players, supportPoolAsJungle, { lineup })

    for (const signal of result.players[0].signals) {
      expect(signal.roleViability, signal.championName).toBe("unknown")
    }
    expect(codesOf(result.warnings)).not.toContain("role_not_playable_filtered")
  })

  it("does not judge a player who sits in no lineup slot", () => {
    // No slot means no lane to judge against. Inventing one here would be the
    // same mistake `resolveRoleFit` already refuses to make.
    const result = analyzeScout(players, supportPoolAsJungle, {
      championRoleReference: REAL_REFERENCE,
    })

    expect(signalFor(result.players[0].signals, "Karma")?.roleViability).toBe("unknown")
    expect(names(result.banPlan.prioritizedBans)).toContain("Karma")
  })

  it("keeps the champion in the plan when another player really plays it there", () => {
    // Karma is implausible for the jungler, but the support plays her on
    // support. The candidate must survive, and the warning must not claim she
    // was withheld.
    const result = analyzeScout(
      [player("sup", "support"), player("jgl", "jungle")],
      dataOf(
        ["jgl", [entry("Karma", 40, 70, { role: "jungle" })]],
        ["sup", [entry("Karma", 50, 66, { role: "support" })]],
      ),
      {
        lineup: lineupOf({ jungle: "jgl", support: "sup" }),
        championRoleReference: REAL_REFERENCE,
      },
    )

    expect(names(result.banPlan.prioritizedBans)).toContain("Karma")
    expect(codesOf(result.warnings)).not.toContain("role_not_playable_filtered")
  })

  it("puts a player back on his own role and gets his champions back", () => {
    const result = analyzeScout(players, dataOf([
      "sup",
      [entry("Karma", 80, 72, { role: "support" }), entry("Lulu", 60, 68, { role: "support" })],
    ]), {
      lineup: lineupOf({ support: "sup" }),
      championRoleReference: REAL_REFERENCE,
    })

    const banned = names(result.banPlan.prioritizedBans)
    expect(banned).toContain("Karma")
    expect(banned).toContain("Lulu")
    expect(signalFor(result.players[0].signals, "Karma")?.roleViability).toBe("viable")
  })
})

/* -------------------------------------------------------------------------
 * 2b. what the review found
 * ------------------------------------------------------------------------- */

describe("analyzeScout — defects found in review", () => {
  it("never judges a player who holds no lineup slot", () => {
    // REGRESSION. `referenceRole` falls back to `ScoutPlayer.role` for anyone
    // who is not a starter, and for a pool player that is nothing but the link
    // parser's GUESS. The gate judged against it while
    // `resolveRoleAdjustment` returned early for an unassigned player, so the
    // champion vanished from the ban plan with NO reason attached and full
    // confidence intact. `resolveRoleFit` refuses to judge such a player; the
    // gate now refuses too.
    const pool = { ...player("pool", "jungle") }
    const result = analyzeScout(
      [pool, player("other", "top")],
      dataOf(["pool", [entry("Karma", 80, 72, { role: "jungle" })]]),
      {
        // A lineup exists, but `pool` sits in no slot.
        lineup: lineupOf({ top: "other" }),
        championRoleReference: REAL_REFERENCE,
      },
    )

    const karma = signalFor(result.players[0].signals, "Karma")
    expect(karma?.roleViability).toBe("unknown")
    expect(names(result.banPlan.prioritizedBans)).toContain("Karma")
    expect(codesOf(karma?.reasons ?? [])).not.toContain("champion_not_playable_in_role")
    expect(codesOf(result.warnings)).not.toContain("role_not_playable_filtered")
  })

  it("does not blame the gate for champions it never held back", () => {
    // REGRESSION. The viability check ran BEFORE the `score <= 0` guard, so a
    // champion with no games at all was counted as "held back by the gate"
    // although it could never have been a candidate under any configuration.
    const result = analyzeScout(
      [player("sup", "support")],
      dataOf([
        "sup",
        [
          entry("Karma", 0, 72, { role: "jungle" }),
          entry("Lulu", 0, 68, { role: "jungle" }),
          entry("Lee Sin", 30, 60, { role: "jungle" }),
        ],
      ]),
      { lineup: lineupOf({ jungle: "sup" }), championRoleReference: REAL_REFERENCE },
    )

    // The gate removed nothing: the plan is identical with and without it.
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Lee Sin"])
    expect(codesOf(result.warnings)).not.toContain("role_not_playable_filtered")
  })

  it("still counts a champion the gate really did hold back", () => {
    // The Gegenprobe to the test above: with games, the count reappears. Without
    // this, "no warning" would pass for the wrong reason.
    const result = analyzeScout(
      [player("sup", "support")],
      dataOf([
        "sup",
        [entry("Karma", 80, 72, { role: "jungle" }), entry("Lee Sin", 30, 60, { role: "jungle" })],
      ]),
      { lineup: lineupOf({ jungle: "sup" }), championRoleReference: REAL_REFERENCE },
    )

    const filtered = result.warnings.filter((item) => item.code === "role_not_playable_filtered")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.params).toEqual({ count: 1 })
  })

  it("says the champion is not a ban BEFORE it praises its winrate", () => {
    // REGRESSION. `roleAdjustment.reasons` were appended, and the UI shows the
    // leading reasons and collapses the tail. A champion the gate had WITHHELD
    // therefore showed two open lines of pure praise, with the exclusion hidden
    // behind "Weitere Gruende".
    const result = analyzeScout(
      [player("sup", "support")],
      dataOf(["sup", [entry("Karma", 80, 72, { role: "jungle", kda: 4.5 })]]),
      { lineup: lineupOf({ jungle: "sup" }), championRoleReference: REAL_REFERENCE },
    )

    const codes = codesOf(signalFor(result.players[0].signals, "Karma")?.reasons ?? [])
    expect(codes[0]).toBe("champion_not_playable_in_role")
    // And it must be inside the preview the UI actually renders.
    expect(codes.indexOf("champion_not_playable_in_role")).toBeLessThan(
      SCOUT_REASON_PREVIEW_COUNT,
    )
  })

  it("does not claim the lane is right and wrong in the same breath", () => {
    // REGRESSION. `onrole_signal` renders "Ein Ban trifft genau diese Lane."
    // next to "zaehlt aber nicht als Ban fuer diese Rolle". Both were true of
    // different things, but as UI copy they simply argue with each other.
    const result = analyzeScout(
      [player("sup", "support")],
      dataOf(["sup", [entry("Karma", 80, 72, { role: "jungle" })]]),
      { lineup: lineupOf({ jungle: "sup" }), championRoleReference: REAL_REFERENCE },
    )

    const codes = codesOf(signalFor(result.players[0].signals, "Karma")?.reasons ?? [])
    expect(codes).toContain("champion_not_playable_in_role")
    expect(codes).not.toContain("onrole_signal")
  })

  it("keeps the onrole reason when the champion IS playable there", () => {
    // Gegenprobe: the suppression must be tied to the verdict, not blanket.
    const result = analyzeScout(
      [player("jgl", "jungle")],
      dataOf(["jgl", [entry("Lee Sin", 40, 62, { role: "jungle" })]]),
      { lineup: lineupOf({ jungle: "jgl" }), championRoleReference: REAL_REFERENCE },
    )

    const codes = codesOf(signalFor(result.players[0].signals, "Lee Sin")?.reasons ?? [])
    expect(codes).toContain("onrole_signal")
  })
})

/* -------------------------------------------------------------------------
 * 3. rank must not be able to overrule the gate
 * ------------------------------------------------------------------------- */

describe("analyzeScout — the gate outranks every other factor", () => {
  function withRank(rankTier: ScoutRankTier) {
    const scout: ScoutPlayer = { ...player("sup", "support"), rankTier }
    return analyzeScout(
      [scout],
      dataOf([
        "sup",
        [
          entry("Karma", 200, 100, { role: "jungle", kda: 12 }),
          // POSITIVE CONTROL. Without a champion that must survive, every
          // assertion below would also pass if `analyzeScout` returned nothing
          // at all.
          entry("Lee Sin", 30, 60, { role: "jungle" }),
        ],
      ]),
      {
        lineup: lineupOf({ jungle: "sup" }),
        championRoleReference: REAL_REFERENCE,
      },
    )
  }

  it("cannot be bought back by a Challenger rank, a huge sample or a dream KDA", () => {
    // Every dial turned to maximum at once: 200 games, 100 % winrate, KDA 12,
    // Challenger. The champion still never becomes a ban for that lane, and it
    // is structural: the signal never reaches the candidate stage at all.
    const result = withRank("challenger")

    // The control proves the engine produced a plan at all.
    expect(names(result.banPlan.prioritizedBans)).toEqual(["Lee Sin"])
    for (const phase of ["safe", "target", "situational"] as const) {
      expect(names(result.banPlan.phases?.[phase] ?? []), phase).not.toContain("Karma")
    }
  })

  it("holds for every rank tier", () => {
    for (const tier of ["unranked", "iron", "gold", "diamond", "grandmaster", "challenger"] as const) {
      expect(names(withRank(tier).banPlan.prioritizedBans), tier).toEqual(["Lee Sin"])
    }
  })
})
