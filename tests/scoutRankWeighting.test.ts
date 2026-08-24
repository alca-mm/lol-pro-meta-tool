import { describe, expect, it } from "vitest"

import { analyzeScout, rankImpactMultiplier } from "../src/scout/analysis"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_RANK_TIERS,
  SCOUT_SUBSTITUTE_SLOTS,
} from "../src/scout/types"
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
 * Rank weighting.
 *
 * A higher-ranked opponent's numbers mean more, so they weigh more. Three
 * properties matter far more than the exact weights:
 *
 *  (1) NEUTRALITY. No rank stated means EXACTLY 1.0, so every session scouted
 *      before 0.7.0 scores bit-for-bit as it did. `"unranked"` is also 1.0 but
 *      arrives as a different value, because it is the user SAYING there is no
 *      rank while absence is nobody saying anything.
 *  (2) THE BRACKETING. Rank is folded into the inner clamp, before the role
 *      weight, so the off-role ratio stays exactly `roleAdjustment.weight`.
 *      Getting this wrong is a mistake this project already made once with the
 *      stat factor, where the documented 0.4 silently became 0.477.
 *  (3) MODULATION, NOT SUBSTITUTION. Rank nudges; it never replaces games,
 *      winrate or KDA, and it can never rescue a champion the role gate holds
 *      back (that half is proven in tests/scoutRoleViability.test.ts).
 */

/* -------------------------------------------------------------------------
 * builders
 * ------------------------------------------------------------------------- */

function player(id: string, role: ScoutRole = "unknown", rankTier?: ScoutRankTier): ScoutPlayer {
  const built: ScoutPlayer = {
    id,
    riotName: id,
    tagline: "EUW",
    region: "EUW",
    displayName: id + "#EUW",
    role,
    sources: [],
  }
  // Written only when asked for, so the "nobody said" case really is an ABSENT
  // key and not an explicit undefined dressed up as one.
  return rankTier === undefined ? built : { ...built, rankTier }
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

function codesOf(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code)
}

/** One signal for one player, so the rank is the only thing that varies. */
function soloSignal(rankTier?: ScoutRankTier): ChampionSignal {
  const result = analyzeScout(
    [player("p1", "mid", rankTier)],
    dataOf(["p1", [entry("Ahri", 30, 62, { role: "mid" })]]),
    { lineup: lineupOf({ mid: "p1" }) },
  )
  const signal = result.players[0]?.signals[0]
  // Guard, not decoration: every caller below reads `.score`, and a missing
  // signal would make the comparison vacuous.
  expect(signal, `no signal for rank ${String(rankTier)}`).toBeDefined()
  return signal
}

const soloScore = (rankTier?: ScoutRankTier): number => soloSignal(rankTier).score

/* -------------------------------------------------------------------------
 * 1. the pure factor
 * ------------------------------------------------------------------------- */

describe("rankImpactMultiplier", () => {
  it("is exactly neutral when nobody stated a rank", () => {
    // Not "close to 1" — exactly 1, so a pre-0.7.0 score cannot move at all.
    expect(rankImpactMultiplier(undefined)).toBe(1)
    expect(rankImpactMultiplier(null)).toBe(1)
  })

  it("is exactly neutral for an explicitly unranked player", () => {
    expect(rankImpactMultiplier("unranked")).toBe(1)
  })

  it("keeps absence and unranked apart even though both weigh 1", () => {
    // They must not be collapsed in code. The same discipline as kda 0 vs null:
    // a value and the absence of a value are different statements.
    const absent = player("a", "mid")
    const stated = player("b", "mid", "unranked")

    expect("rankTier" in absent).toBe(false)
    expect(stated.rankTier).toBe("unranked")
    expect(rankImpactMultiplier(absent.rankTier)).toBe(rankImpactMultiplier(stated.rankTier))
  })

  it("neutralises junk instead of trusting it", () => {
    for (const junk of ["", "Challenger", "CHALLENGER", "kaiser", 5, {}, []]) {
      expect(rankImpactMultiplier(junk as unknown as ScoutRankTier), JSON.stringify(junk)).toBe(1)
    }
  })

  it("never decreases along SCOUT_RANK_TIERS", () => {
    // The tuple order is the contract, so the weights must agree with it.
    const weights = SCOUT_RANK_TIERS.filter((tier) => tier !== "unranked").map(rankImpactMultiplier)
    for (let index = 1; index < weights.length; index += 1) {
      expect(weights[index], `tier ${index}`).toBeGreaterThanOrEqual(weights[index - 1])
    }
  })

  it("orders the tiers users actually care about", () => {
    expect(rankImpactMultiplier("challenger")).toBeGreaterThan(rankImpactMultiplier("diamond"))
    expect(rankImpactMultiplier("diamond")).toBeGreaterThan(rankImpactMultiplier("gold"))
    expect(rankImpactMultiplier("gold")).toBeGreaterThan(rankImpactMultiplier("bronze"))
    expect(rankImpactMultiplier("bronze")).toBeGreaterThan(rankImpactMultiplier("iron"))
  })

  it("stays inside the documented 0.80 to 1.25 band", () => {
    for (const tier of SCOUT_RANK_TIERS) {
      const weight = rankImpactMultiplier(tier)
      expect(weight, tier).toBeGreaterThanOrEqual(0.8)
      expect(weight, tier).toBeLessThanOrEqual(1.25)
    }
  })

  it("covers every tier, so a new one cannot silently score neutral", () => {
    // A tier missing from the weight table would come back 1.0 and look fine.
    // Only `unranked` and `platinum` are allowed to be exactly 1.
    const neutral = SCOUT_RANK_TIERS.filter((tier) => rankImpactMultiplier(tier) === 1)
    expect([...neutral].sort()).toEqual(["platinum", "unranked"])
  })
})

/* -------------------------------------------------------------------------
 * 2. what it does to a score
 * ------------------------------------------------------------------------- */

describe("analyzeScout — rank moves the score, and only the score", () => {
  it("leaves a rankless player bit-for-bit unchanged", () => {
    expect(soloScore(undefined)).toBe(soloScore("unranked"))
    expect(soloScore(undefined)).toBe(soloScore("platinum"))
  })

  it("weighs a higher rank up and a lower rank down", () => {
    const base = soloScore(undefined)

    expect(soloScore("challenger")).toBeGreaterThan(base)
    expect(soloScore("diamond")).toBeGreaterThan(base)
    expect(soloScore("iron")).toBeLessThan(base)
    expect(soloScore("challenger")).toBeGreaterThan(soloScore("gold"))
  })

  it("reorders the ban plan between two otherwise identical players", () => {
    // Identical champions, identical games, identical winrate. Rank is the only
    // difference.
    //
    // The order is asserted BOTH WAYS because one direction alone is vacuous: a
    // mutation probe showed `["Ahri", "Sett"]` also passes when every tier
    // weighs 1.0, since `compareCandidates` then falls through to its
    // alphabetical tie-break and "A" precedes "S" anyway. Only the flip proves
    // the rank did the work.
    const planWith = (ahriRank: ScoutRankTier, settRank: ScoutRankTier) =>
      names(
        analyzeScout(
          [player("high", "mid", ahriRank), player("low", "top", settRank)],
          dataOf(
            ["high", [entry("Ahri", 30, 62, { role: "mid" })]],
            ["low", [entry("Sett", 30, 62, { role: "top" })]],
          ),
          { lineup: lineupOf({ mid: "high", top: "low" }) },
        ).banPlan.prioritizedBans,
      )

    expect(planWith("challenger", "silver")).toEqual(["Ahri", "Sett"])
    expect(planWith("silver", "challenger")).toEqual(["Sett", "Ahri"])
  })

  it("explains itself once, and only when it actually moved the score", () => {
    expect(codesOf(soloSignal("challenger").reasons)).toContain("high_rank_player")
    expect(codesOf(soloSignal("diamond").reasons)).toContain("high_rank_player")
    // Emerald weighs EXACTLY the threshold. Without it, flipping `>=` to `>`
    // changes who gets the reason and no test notices.
    expect(codesOf(soloSignal("emerald").reasons)).toContain("high_rank_player")
    // And exactly one line, never one per rank tier.
    expect(
      codesOf(soloSignal("challenger").reasons).filter((code) => code === "high_rank_player"),
    ).toHaveLength(1)

    // Neutral and below-neutral ranks say nothing: there is no good news to
    // report, and a reason on every signal is exactly the flood this release
    // set out to reduce.
    for (const tier of [undefined, "unranked", "platinum", "gold", "iron"] as const) {
      expect(codesOf(soloSignal(tier).reasons), String(tier)).not.toContain("high_rank_player")
    }
  })

  it("passes the rank as a code, never as pre-translated prose", () => {
    const reason = soloSignal("grandmaster").reasons.find(
      (item) => item.code === "high_rank_player",
    )
    // The UI localises it. A German or English word here would be a contract
    // violation (rule B in src/scout/types.ts).
    expect(reason?.params).toEqual({ rank: "grandmaster" })
  })

  it("does not touch the numbers the user typed", () => {
    const signal = soloSignal("challenger")

    expect(signal.games).toBe(30)
    expect(signal.winrate).toBe(62)
    expect(signal.kda).toBeNull()
    expect(signal.role).toBe("mid")
    expect(signal.roleFit).toBe("onrole")
  })

  it("cannot outweigh the evidence it is supposed to modulate", () => {
    // A Challenger with two games must still lose to a Gold player with forty.
    // `sampleConfidence` runs first and a 1.25 factor cannot undo it.
    const result = analyzeScout(
      [player("smurf", "mid", "challenger"), player("solid", "top", "gold")],
      dataOf(
        ["smurf", [entry("Ahri", 2, 100, { role: "mid" })]],
        ["solid", [entry("Sett", 40, 62, { role: "top" })]],
      ),
      { lineup: lineupOf({ mid: "smurf", top: "solid" }) },
    )

    expect(names(result.banPlan.prioritizedBans)).toEqual(["Sett", "Ahri"])
  })

  it("stays clamped to a valid score", () => {
    // Challenger on a maxed-out line: the factor exceeds 1, so the result has
    // to stay inside 0..1 rather than run off the top.
    const result = analyzeScout(
      [player("p1", "mid", "challenger")],
      dataOf(["p1", [entry("Ahri", 400, 100, { role: "mid", kda: 20 })]]),
      { lineup: lineupOf({ mid: "p1" }) },
    )
    const score = result.players[0]?.signals[0]?.score ?? -1

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe("analyzeScout — rank sharpens the order, it never flattens it", () => {
  /** A realistic strong pool, ordered by strength. */
  const POOL: readonly (readonly [string, number, number, number])[] = [
    ["Viego", 120, 71, 4.6],
    ["Aatrox", 90, 66, 3.4],
    ["Jinx", 80, 64, 4.1],
    ["Thresh", 70, 62, 3.0],
    ["Ahri", 60, 61, 3.2],
  ]

  const planFor = (rankTier?: ScoutRankTier) =>
    analyzeScout(
      [player("p1", "mid", rankTier)],
      dataOf([
        "p1",
        POOL.map(([name, games, winrate, kda]) =>
          entry(name, games, winrate, { role: "mid", kda }),
        ),
      ]),
      { lineup: lineupOf({ mid: "p1" }) },
    ).banPlan.prioritizedBans

  it("keeps the ban order identical at every rank", () => {
    // REGRESSION. Rank used to multiply an already near-1 base straight into
    // `clamp01`: measured over a 245-point grid, 87 % of a Challenger team's
    // signals pinned at exactly 1.000 and 53 % of a Diamond team's. Pinned
    // scores tie, and `compareCandidates` then falls through to its
    // alphabetical tie-break, so a strong team's ban plan came out sorted by
    // champion NAME. Viego, the clearly strongest pick, dropped to fourth
    // behind Aatrox, Jinx and Thresh.
    const baseline = planFor(undefined).map((candidate) => candidate.championName)
    expect(baseline[0]).toBe("Viego")

    for (const tier of ["gold", "emerald", "diamond", "master", "grandmaster", "challenger"] as const) {
      expect(
        planFor(tier).map((candidate) => candidate.championName),
        `rank ${tier}`,
      ).toEqual(baseline)
    }
  })

  it("never pins a signal to the ceiling", () => {
    for (const tier of ["diamond", "master", "grandmaster", "challenger"] as const) {
      const pinned = planFor(tier).filter((candidate) => candidate.priority >= 1)
      expect(pinned.map((c) => c.championName), `rank ${tier}`).toEqual([])
    }
  })

  it("keeps every score distinct where the input was distinct", () => {
    // The property the ordering rests on: the transform is strictly increasing,
    // so it cannot introduce a tie the data did not have.
    for (const tier of [undefined, "iron", "gold", "challenger"] as const) {
      const scores = planFor(tier).map((candidate) => candidate.priority)
      expect(new Set(scores).size, `rank ${String(tier)}`).toBe(scores.length)
    }
  })

  it("still moves the whole pool up and down with the rank", () => {
    // Gegenprobe: the fix must not have turned rank into a no-op.
    const base = planFor(undefined)[0]?.priority ?? 0
    expect(planFor("challenger")[0]?.priority ?? 0).toBeGreaterThan(base)
    expect(planFor("iron")[0]?.priority ?? 1).toBeLessThan(base)
  })
})

/* -------------------------------------------------------------------------
 * 3. THE BRACKETING — the off-role guarantee survives the new factor
 * ------------------------------------------------------------------------- */

describe("analyzeScout — rank does not loosen the off-role damping", () => {
  /** The same champion, judged on-role and off-role, at one rank. */
  function ratio(rankTier: ScoutRankTier | undefined, games: number, winrate: number, kda: number) {
    function scoreFor(slot: ScoutLineupSlot): number {
      const result = analyzeScout(
        [player("p1", "mid", rankTier)],
        dataOf(["p1", [entry("Ahri", games, winrate, { role: "mid", kda })]]),
        { lineup: lineupOf({ [slot]: "p1" }) },
      )
      const signal = result.players[0]?.signals[0]
      expect(signal, `no signal for ${slot} / ${String(rankTier)}`).toBeDefined()
      return signal.score
    }

    const off = scoreFor("top")
    const on = scoreFor("mid")
    return { ratio: off / on, on }
  }

  /**
   * The tolerance the rounding forces on us.
   *
   * `score` is `round3`-ed, so each side carries up to 0.0005 of error and the
   * quotient inherits `0.0005 / on * (1 + ratio)`. That is ~0.0008 on a strong
   * signal and ~0.004 on an 8-game one. The drift this guards against was
   * 0.077, so even the loosest bound here is an order of magnitude tighter.
   */
  const roundingTolerance = (on: number): number => (0.0005 / on) * 1.4

  it("keeps the ratio at exactly 0.4 for every rank, including a saturating one", () => {
    // THE REGRESSION THIS TEST EXISTS FOR. `rankStrength` reaches 1.25, so if it
    // were applied AFTER the role weight the outer clamp would bind on the
    // on-role side alone and this ratio would drift upward. That is precisely
    // how the documented 0.4 became 0.477 when the stat factor was added.
    //
    // Three decimals, not more, and the reason is arithmetic rather than
    // sloppiness: `score` is `round3`-ed for display, so the quotient of two
    // rounded scores carries a quantisation error of roughly 0.001/score. The
    // drift this guards against was 0.077, i.e. two orders of magnitude larger
    // than the tolerance, so the guard still bites hard.
    for (const tier of [undefined, "unranked", "iron", "gold", "diamond", "challenger"] as const) {
      // Deliberately a saturating line: high games, high winrate, high KDA, so
      // the score sits near the ceiling where a stray clamp would show.
      const { ratio: measured, on } = ratio(tier, 300, 95, 9)
      expect(
        Math.abs(measured - 0.4),
        `rank ${String(tier)}: ratio ${measured}`,
      ).toBeLessThanOrEqual(roundingTolerance(on))
    }
  })

  it("keeps the ratio at 0.4 across a spread of stat lines", () => {
    for (const [games, winrate, kda] of [
      [8, 55, 2],
      [30, 62, 3.5],
      [120, 78, 6],
      [400, 100, 20],
    ] as const) {
      const { ratio: measured, on } = ratio("challenger", games, winrate, kda)
      expect(
        Math.abs(measured - 0.4),
        `${games}g/${winrate}%/kda ${kda}: ratio ${measured}`,
      ).toBeLessThanOrEqual(roundingTolerance(on))
    }
  })

  it("still caps an off-role signal's confidence regardless of rank", () => {
    const result = analyzeScout(
      [player("p1", "mid", "challenger")],
      dataOf(["p1", [entry("Ahri", 200, 90, { role: "mid", kda: 8 })]]),
      { lineup: lineupOf({ top: "p1" }) },
    )
    const signal = result.players[0]?.signals[0]

    expect(signal?.roleFit).toBe("offrole")
    expect(signal?.confidence).toBe("low")
    expect(result.banPlan.prioritizedBans[0]?.phase).toBe("situational")
    expect(result.banPlan.phases?.safe ?? []).toEqual([])
    expect(result.banPlan.phases?.target ?? []).toEqual([])
  })
})
