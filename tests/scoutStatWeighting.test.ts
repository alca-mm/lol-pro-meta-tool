/**
 * The champion stat weighting: games, winrate and KDA as one bounded factor on
 * the Tournament Scout's ban score.
 *
 * WHAT THE USER ASKED FOR, and what this file therefore has to protect:
 * a champion the opponent has simply played a lot at a NEUTRAL winrate must not
 * outrank a champion they play less but demonstrably better. Before the
 * weighting the ban plan ranked purely on volume plus a damped winrate, and a
 * 72-game 50 % pick led a 32-game 63 % pick by 0.008 — see the
 * `STAT_WEIGHTING_ORDER` block in tests/scoutImportIntegration.test.ts, which
 * pins the same reversal end to end on a real paste.
 *
 * HOW THIS FILE IS SPLIT, and why:
 *  - Sections 1 to 5 test the four exported pure functions DIRECTLY, as
 *    properties (neutral, monotone, saturating, sample-scaled, bounded) rather
 *    than as copied numbers. A property survives a re-tuned constant; a copied
 *    number turns every tuning into a test edit and teaches nobody anything.
 *  - Sections 6 to 12 go through the real `analyzeScout` chain, because the
 *    factor only matters where it lands: in a score, a confidence and an order.
 *
 * ONE HARNESS LIMIT WORTH KNOWING BEFORE READING FURTHER: `soloSignal` below
 * builds exactly ONE row for exactly one player, which pins `shareScore` to
 * `NEUTRAL_SHARE` for every case that goes through it. The `WEIGHT_SHARE`
 * component is therefore constant in sections 6, 7, 9 and 10 — and that
 * component is precisely where the reported defect lived. Section 7b is the one
 * that builds a real pool (two rows, real 69 %/31 % split) and is consequently
 * the only place in this file that fails if `* statStrength` is reverted out of
 * the score line.
 *
 * THE ONE PLACE THIS FILE DELIBERATELY PINS LITERAL NUMBERS: the four scenarios
 * in section 6 and the four orderings in section 7. Those four are not an
 * implementation detail that happens to fall out of the constants — they ARE
 * the requirement, stated by the user as concrete cases, so they are frozen as
 * concrete cases.
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) — no
 * jsdom, no document, no window. Everything below is pure arithmetic over
 * objects built in this file: no network, no clock, no randomness, no fixture
 * copied from any real site or naming any real player.
 */

import { describe, expect, it } from "vitest"

import {
  SCOUT_KDA_MAX_PLAUSIBLE,
  analyzeScout,
  championStatStrengthMultiplier,
  gamesImpactMultiplier,
  kdaImpactMultiplier,
  winrateImpactMultiplier,
} from "../src/scout/analysis"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS } from "../src/scout/types"
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

/* -------------------------------------------------------------------------
 * The two module-private bounds, restated.
 *
 * `SCOUT_STAT_MULTIPLIER_MIN` / `_MAX` are not exported — they are internal
 * tuning, and exporting them just so a test could read them would make the
 * test a mirror of the implementation instead of a statement about it. The
 * literals below are the CONTRACT the module documents; if a future change
 * moves them, this file is supposed to fail and force the decision to be made
 * consciously.
 * ------------------------------------------------------------------------- */

/** Mirrors `SCOUT_STAT_MULTIPLIER_MIN` in src/scout/analysis.ts. */
const STAT_MULTIPLIER_MIN = 0.75
/** Mirrors `SCOUT_STAT_MULTIPLIER_MAX` in src/scout/analysis.ts. */
const STAT_MULTIPLIER_MAX = 1.2

/** Mirrors `SCOUT_GAMES_IMPACT_NEUTRAL_GAMES` — where the games factor is 1.0. */
const GAMES_NEUTRAL = 20

/* -------------------------------------------------------------------------
 * builders — the same shapes tests/scoutAnalysis.test.ts uses, so a drift in
 * the domain types fails here too.
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

function lineupOf(starters: Partial<Record<ScoutLineupSlot, ScoutPlayerId>> = {}): ScoutLineup {
  const starterSlots = {} as Record<ScoutLineupSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_LINEUP_SLOTS) starterSlots[slot] = starters[slot] ?? null

  const substituteSlots = {} as Record<ScoutSubstituteSlot, ScoutPlayerId | null>
  for (const slot of SCOUT_SUBSTITUTE_SLOTS) substituteSlots[slot] = null

  return { starters: starterSlots, substitutes: substituteSlots }
}

/**
 * The signal one champion produced, wherever the engine filed it.
 *
 * A poor winrate on many games is not a ban target but a WEAKNESS, and
 * `analyzeScout` moves it into `weaknesses` instead of `signals`. Both lists
 * carry the same `ChampionSignal` with the same score, so a helper that looks
 * in both is what lets the four user scenarios be compared on one scale —
 * reading only `signals[0]` would silently return `undefined` for the
 * "150 games at 42 %" case and turn every assertion about it into a no-op.
 */
function soloSignal(
  games: number,
  winrate: number,
  kda?: number | null,
  role: ScoutRole = "mid",
): ChampionSignal {
  const result = analyzeScout(
    [player("solo", "mid")],
    dataOf(["solo", [entry("Ahri", games, winrate, { role, kda })]]),
  )
  const analysis = result.players[0]
  const found = [...analysis.signals, ...analysis.weaknesses][0]

  // Guard, not decoration: every caller below asserts on the score, and a
  // missing signal would make `?.score` undefined and the comparison vacuous.
  expect(found, `no signal for ${games}g / ${winrate}% / kda ${String(kda)}`).toBeDefined()
  return found
}

const soloScore = (games: number, winrate: number, kda?: number | null): number =>
  soloSignal(games, winrate, kda).score

/** One row of a pool: champion, games, winrate percent, KDA (or `null`). */
type PoolRow = readonly [string, number, number, (number | null)?]

/**
 * The counterpart to {@link soloSignal}: ONE player with SEVERAL rows.
 *
 * That difference is not cosmetic, it is the whole reason this helper exists.
 * With two or more rows `playerEntryCount >= SHARE_MIN_ENTRIES`, so `shareScore`
 * becomes the champion's real share of the player's tracked games instead of the
 * constant `NEUTRAL_SHARE` — and `WEIGHT_SHARE` is exactly the component that
 * let a big pile of games at 50 % outrank a smaller, better pick. Anything that
 * wants to test that defect has to go through here.
 *
 * Several rows may name the SAME champion; the engine groups them, which is how
 * the aggregation sections below reach `aggregateKda` without exporting it.
 * No lineup is supplied, so every role weight is the identity 1.
 */
function pool(...rows: readonly PoolRow[]) {
  const result = analyzeScout(
    [player("solo", "mid")],
    dataOf([
      "solo",
      rows.map(([championName, games, winrate, kda = null]) =>
        entry(championName, games, winrate, { role: "mid", kda }),
      ),
    ]),
  )
  const analysis = result.players[0]
  const all = [...analysis.signals, ...analysis.weaknesses]

  /** The one signal for that champion, wherever the engine filed it. */
  const signal = (championName: string): ChampionSignal => {
    const found = all.find((item) => item.championName === championName)
    // Guard, not decoration — see soloSignal: a missing signal would turn
    // every score comparison below into `undefined > undefined`.
    expect(found, `no signal for ${championName}`).toBeDefined()
    return found as ChampionSignal
  }

  return {
    result,
    signal,
    score: (championName: string): number => signal(championName).score,
    banOrder: (): string[] =>
      result.banPlan.prioritizedBans.map((candidate) => candidate.championName),
  }
}

const codesOf = (signal: ChampionSignal): string[] => signal.reasons.map((item) => item.code)

/** The two reason codes the weighting introduced. */
const STAT_REASON_CODES = ["strong_kda", "many_games_on_champion"] as const

const statReasonsOf = (signal: ChampionSignal): string[] =>
  codesOf(signal).filter((code) => (STAT_REASON_CODES as readonly string[]).includes(code))

/* ==========================================================================
 * 1. Neutrality — the rule that must never be softened
 *
 * THE MOST IMPORTANT SECTION IN THIS FILE. Every scout entry saved before
 * 2026-08-20 has no KDA at all, and many pasted rows have no winrate. If
 * "not stated" were read as "bad", the weighting would quietly demote the
 * entire existing database the day it shipped.
 * ========================================================================== */

describe("a value that was never stated is exactly neutral", () => {
  it("returns exactly 1.0 for a KDA that is null or undefined, at every sample size", () => {
    for (const games of [0, 1, 5, 10, 20, 50, 200, 1000]) {
      expect(kdaImpactMultiplier(null, games), `null @${games}`).toBe(1)
      expect(kdaImpactMultiplier(undefined, games), `undefined @${games}`).toBe(1)
    }
  })

  it("returns exactly 1.0 for a KDA that is not a usable number", () => {
    // Negative and implausibly large are parse accidents, not statements:
    // OP.GG prints "Perfect KDA" for a deathless record, and a stray `999`
    // must not become the strongest signal in the pool.
    const broken = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0.1,
      -5,
      101,
      1_000_000,
    ]
    for (const value of broken) {
      expect(kdaImpactMultiplier(value, 50), `kda=${value}`).toBe(1)
    }
  })

  it("returns exactly 1.0 for a winrate that is missing or outside 0 to 100", () => {
    for (const value of [null, undefined]) {
      expect(winrateImpactMultiplier(value, 50), `winrate=${String(value)}`).toBe(1)
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3, -0.5, 100.5, 150]) {
      expect(winrateImpactMultiplier(value, 50), `winrate=${value}`).toBe(1)
    }
  })

  it("returns exactly 1.0 for a games count that is zero or junk", () => {
    // "No games" is not "few games", it is "no evidence" — and a signal
    // without evidence is already zeroed by the base score.
    for (const value of [0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(gamesImpactMultiplier(value), `games=${value}`).toBe(1)
    }
  })

  it("returns exactly 1.0 for winrate and KDA when the sample is empty", () => {
    // The sample scaling has to survive its own zero point: at 0 games the
    // confidence is 0, and a factor scaled by 0 must land on 1, not on 0.
    expect(winrateImpactMultiplier(100, 0)).toBe(1)
    expect(kdaImpactMultiplier(9, 0)).toBe(1)
  })

  it("leaves the combined factor at exactly 1.0 when nothing usable was stated", () => {
    expect(championStatStrengthMultiplier({ games: GAMES_NEUTRAL })).toBe(1)
    expect(championStatStrengthMultiplier({ games: GAMES_NEUTRAL, winrate: null, kda: null })).toBe(
      1,
    )
    expect(championStatStrengthMultiplier({ games: 0, winrate: null, kda: null })).toBe(1)
  })

  it("does not demote a legacy entry that carries no KDA", () => {
    // End to end, through the real engine: an entry without a KDA scores
    // exactly like the same entry with a neutral one. This is the assertion
    // that fails if anybody ever writes `kda ?? 0`.
    const stored = soloScore(40, 55, undefined)

    expect(soloScore(40, 55, null)).toBe(stored)
    expect(soloScore(40, 55, 2.5)).toBe(stored)
    expect(soloScore(40, 55, Number.NaN)).toBe(stored)

    // NOT VACUOUS: "everything is neutral" would satisfy every line above.
    // These two say the factor is neutral where it should be AND alive where
    // it should be — a `kdaImpactMultiplier` stubbed to `return 1` fails here.
    expect(soloScore(40, 55, 4.5)).toBeGreaterThan(stored)
    expect(soloScore(40, 55, 0.5)).toBeLessThan(stored)
  })

  it("does not demote an entry that carries no winrate", () => {
    const withoutWinrate = championStatStrengthMultiplier({ games: 60, winrate: null, kda: 3.1 })
    const withNeutralWinrate = championStatStrengthMultiplier({ games: 60, winrate: 50, kda: 3.1 })

    expect(withoutWinrate).toBe(withNeutralWinrate)
  })
})

/* ==========================================================================
 * 2. A stated 0 is a real, bad value — and `null` is not
 *
 * `!kda` and `kda ?? 0` are the two obvious implementations, and both collapse
 * exactly these two cases into one. This section freezes the difference.
 * ========================================================================== */

describe("a KDA of 0 is a bad value, not a missing one", () => {
  it("scores a stated 0 below a KDA that was never stated", () => {
    const stated = kdaImpactMultiplier(0, 50)
    const unstated = kdaImpactMultiplier(null, 50)

    // `kda ?? 0` would make the second line equal the first.
    expect(unstated).toBe(1)
    // `!kda` would make the first line equal the second.
    expect(stated).toBeLessThan(1)
    expect(stated).not.toBe(unstated)
  })

  it("keeps the two apart in the combined factor", () => {
    const stated = championStatStrengthMultiplier({ games: 50, winrate: 55, kda: 0 })
    const unstated = championStatStrengthMultiplier({ games: 50, winrate: 55, kda: null })

    expect(stated).toBeLessThan(unstated)
  })

  it("keeps the two apart all the way through analyzeScout", () => {
    const stated = soloScore(40, 55, 0)
    const unstated = soloScore(40, 55, null)

    expect(stated).toBeLessThan(unstated)
    // Not a rounding difference: `round3` would hide anything smaller.
    expect(unstated - stated).toBeGreaterThan(0.01)
  })

  it("treats a stated 0 like the documented worst case, not like an outlier", () => {
    // 0 and 1.0 are both simply "bad" — the module says so — so the penalty is
    // at its floor for both and does not keep growing below 0.
    expect(kdaImpactMultiplier(0, 100)).toBe(kdaImpactMultiplier(1, 100))
    expect(kdaImpactMultiplier(0, 100)).toBeGreaterThanOrEqual(0.9)
  })
})

/* ==========================================================================
 * 3. Saturation — more games help, but less and less
 * ========================================================================== */

describe("the games factor saturates instead of rewarding volume without end", () => {
  const SWEEP = [1, 2, 3, 5, 8, 13, 20, 30, 44, 60, 80, 120, 200, 300, 500, 1000] as const

  it("never decreases as the game count grows", () => {
    for (let index = 1; index < SWEEP.length; index += 1) {
      const previous = gamesImpactMultiplier(SWEEP[index - 1])
      const current = gamesImpactMultiplier(SWEEP[index])
      expect(current, `${SWEEP[index - 1]} -> ${SWEEP[index]}`).toBeGreaterThanOrEqual(previous)
    }
  })

  it("is exactly 1.0 at the neutral game count", () => {
    // Exactly, not approximately: this is the seam where `volumeScore` stops
    // rewarding more games and this curve takes over. A step here would be a
    // visible jump in the ban order.
    expect(gamesImpactMultiplier(GAMES_NEUTRAL)).toBe(1)
  })

  it("makes 300 games only marginally stronger than 80", () => {
    const at80 = gamesImpactMultiplier(80)
    const at300 = gamesImpactMultiplier(300)

    expect(at300).toBeGreaterThan(at80)
    // Measured: +0.047 for nearly four times the games. The point of the test
    // is the ORDER OF MAGNITUDE — a linear factor would put this near 0.4.
    expect(at300 - at80).toBeCloseTo(0.047, 3)
    expect(at300 - at80).toBeLessThan(0.05)
  })

  it("is clamped on both sides", () => {
    expect(gamesImpactMultiplier(1)).toBeGreaterThanOrEqual(0.9)
    expect(gamesImpactMultiplier(1)).toBeLessThan(1)
    expect(gamesImpactMultiplier(100_000)).toBeLessThanOrEqual(1.1)
    // Above the cap the curve is flat, so two absurd counts are identical.
    expect(gamesImpactMultiplier(1e9)).toBe(gamesImpactMultiplier(1e12))
  })
})

/* ==========================================================================
 * 4. Sample weighting — a thin sample says less, in both directions
 * ========================================================================== */

describe("winrate and KDA count only as far as the sample carries them", () => {
  it("gives the same winrate a smaller bonus on a thin sample", () => {
    const thin = winrateImpactMultiplier(61, 5)
    const solid = winrateImpactMultiplier(61, 70)

    expect(thin).toBeGreaterThan(1)
    expect(thin).toBeLessThan(solid)
  })

  it("gives the same winrate a smaller PENALTY on a thin sample too", () => {
    // The symmetric half. A brake that only damps good news would turn every
    // five-game disaster into a scouting conclusion.
    const thin = winrateImpactMultiplier(35, 5)
    const solid = winrateImpactMultiplier(35, 70)

    expect(thin).toBeLessThan(1)
    expect(thin).toBeGreaterThan(solid)
  })

  it("does the same for KDA in both directions", () => {
    expect(kdaImpactMultiplier(4.2, 5)).toBeLessThan(kdaImpactMultiplier(4.2, 70))
    expect(kdaImpactMultiplier(0.5, 5)).toBeGreaterThan(kdaImpactMultiplier(0.5, 70))
  })

  it("never lets a thin sample flip the sign of the statement", () => {
    // Damped, not inverted: a good winrate on 2 games is still a (weak) plus,
    // a bad one still a (weak) minus.
    for (const games of [1, 2, 3, 5, 8, 20, 100]) {
      expect(winrateImpactMultiplier(75, games), `good @${games}`).toBeGreaterThanOrEqual(1)
      expect(winrateImpactMultiplier(25, games), `bad @${games}`).toBeLessThanOrEqual(1)
      expect(kdaImpactMultiplier(6, games), `good kda @${games}`).toBeGreaterThanOrEqual(1)
      expect(kdaImpactMultiplier(0.4, games), `bad kda @${games}`).toBeLessThanOrEqual(1)
    }
  })

  it("keeps the sample brake out of the games factor itself", () => {
    // The games factor is the ONE of the three that is not sample-scaled: it
    // already is a statement about the sample, so damping it by the sample
    // would be circular. Its signature has no `games` confidence argument at
    // all, and this asserts the consequence — it is a pure function of one
    // number, identical however it is reached.
    expect(gamesImpactMultiplier(44)).toBe(gamesImpactMultiplier(44))
    expect(championStatStrengthMultiplier({ games: 44, winrate: null, kda: null })).toBe(
      gamesImpactMultiplier(44),
    )
  })
})

/* ==========================================================================
 * 5. Bounds — the product can never run away
 * ========================================================================== */

describe("the combined factor stays inside its documented bounds", () => {
  const GAMES = [-5, 0, 1, 2, 5, 10, 20, 44, 80, 150, 300, 1000, Number.NaN, Number.POSITIVE_INFINITY]
  const WINRATES = [null, undefined, Number.NaN, -3, 0, 20, 42, 50, 55, 61, 65, 80, 100, 150]
  const KDAS = [null, undefined, Number.NaN, -1, 0, 0.5, 1, 1.6, 2.5, 3.1, 4.2, 4.5, 8, 99, 101, 1e6]

  function sweep(): number[] {
    const values: number[] = []
    for (const games of GAMES) {
      for (const winrate of WINRATES) {
        for (const kda of KDAS) {
          values.push(championStatStrengthMultiplier({ games, winrate, kda }))
        }
      }
    }
    return values
  }

  it("returns a finite number inside [MIN, MAX] for every input, junk included", () => {
    const offenders: string[] = []
    let index = 0

    for (const games of GAMES) {
      for (const winrate of WINRATES) {
        for (const kda of KDAS) {
          const value = championStatStrengthMultiplier({ games, winrate, kda })
          const label = `g=${games} w=${String(winrate)} k=${String(kda)} -> ${value}`
          if (!Number.isFinite(value)) offenders.push("not finite: " + label)
          else if (value < STAT_MULTIPLIER_MIN || value > STAT_MULTIPLIER_MAX) {
            offenders.push("out of bounds: " + label)
          }
          index += 1
        }
      }
    }

    expect(offenders).toEqual([])
    // The fuzz has to actually run, or the empty list above proves nothing.
    expect(index).toBe(GAMES.length * WINRATES.length * KDAS.length)
    expect(index).toBeGreaterThan(3000)
  })

  it("really reaches both ends of the range it is measured against", () => {
    // Without this the bounds test above would also pass if every input
    // happened to land on 1.0. Measured effective range: 0.765 to 1.200 — the
    // upper clamp binds, the lower one is a safety net that does not.
    const values = sweep()

    expect(Math.min(...values)).toBeCloseTo(0.765, 3)
    expect(Math.max(...values)).toBe(STAT_MULTIPLIER_MAX)
    expect(Math.min(...values)).toBeGreaterThan(STAT_MULTIPLIER_MIN)
  })

  it("keeps every single factor inside its own band", () => {
    const offenders: string[] = []

    for (const games of GAMES) {
      const value = gamesImpactMultiplier(games)
      if (!Number.isFinite(value) || value < 0.9 || value > 1.1) {
        offenders.push(`games ${games} -> ${value}`)
      }
      for (const winrate of WINRATES) {
        const w = winrateImpactMultiplier(winrate, games)
        if (!Number.isFinite(w) || w < 0.85 || w > 1.12) {
          offenders.push(`winrate ${String(winrate)}@${games} -> ${w}`)
        }
      }
      for (const kda of KDAS) {
        const k = kdaImpactMultiplier(kda, games)
        if (!Number.isFinite(k) || k < 0.9 || k > 1.1) {
          offenders.push(`kda ${String(kda)}@${games} -> ${k}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

/* ==========================================================================
 * 6. The four scenarios the user named
 *
 * Literal numbers on purpose — see the file header. These four cases ARE the
 * requirement, so they are frozen as cases and not paraphrased as properties.
 * ========================================================================== */

const USER_SCENARIOS = [
  ["a solid, well rounded main", 70, 61, 3.2, 0.901],
  ["a five game flash in the pan", 5, 80, 4.5, 0.648],
  ["a heavily played pick that keeps losing", 150, 42, 1.6, 0.65],
  ["a single game", 1, 100, 8.0, 0.398],
] as const

describe("the four scenarios score the way the user specified", () => {
  for (const [label, games, winrate, kda, expected] of USER_SCENARIOS) {
    it(`${label}: ${games} games / ${winrate}% / KDA ${kda} -> ${expected}`, () => {
      expect(soloScore(games, winrate, kda)).toBeCloseTo(expected, 3)
    })
  }
})

/* ==========================================================================
 * 7. The four orderings between them
 *
 * The scores above are a measurement; THESE are the statement. Written as
 * comparisons so a future re-tuning that keeps the ranking intact stays free.
 *
 * WHAT THIS SECTION DOES **NOT** DO — read this before trusting it as a guard:
 * all four cases run through `soloSignal`, i.e. one row for one player, so
 * `playerEntryCount` is 1, `shareScore` is `NEUTRAL_SHARE` for every one of
 * them, and the volume pick never collects the pool-share advantage that made
 * it win in the first place. Measured: delete `* statStrength` from the score
 * line in src/scout/analysis.ts and all five tests below stay GREEN — the
 * quality pick already leads on the base score once the share component is
 * constant. Section 7b is where the "volume beats quality" hole is actually
 * pinned; keep these four as the user's stated cases, not as the safety net.
 * ========================================================================== */

describe("the four scenarios rank the way the user asked for", () => {
  const solidMain = (): number => soloScore(70, 61, 3.2)
  const flashInThePan = (): number => soloScore(5, 80, 4.5)
  const losingComfortPick = (): number => soloScore(150, 42, 1.6)
  const singleGame = (): number => soloScore(1, 100, 8.0)

  it("puts the solid 70 game main above the flashy 5 game sample", () => {
    // 80 % and KDA 4.5 look better on paper. They are five games.
    expect(solidMain()).toBeGreaterThan(flashInThePan())
  })

  it("puts the solid 70 game main above the 150 game losing pick", () => {
    // Twice the games do NOT beat a real winrate. Careful with the wording:
    // in the solo harness this holds even WITHOUT the stat factor (see the
    // section comment), so it restates the user's case — it does not guard the
    // regression. Section 7b does that.
    expect(solidMain()).toBeGreaterThan(losingComfortPick())
  })

  it("puts the 150 game losing pick above the single game", () => {
    // Volume still counts for something — the fix was meant to bound it, not
    // to delete it. One game at 100 % is worth less than 150 games at 42 %.
    expect(losingComfortPick()).toBeGreaterThan(singleGame())
  })

  it("puts the 5 game sample above the single game", () => {
    expect(flashInThePan()).toBeGreaterThan(singleGame())
  })

  it("keeps the whole chain consistent in one comparison", () => {
    const chain = [solidMain(), losingComfortPick(), flashInThePan(), singleGame()]
    expect(chain).toEqual([...chain].sort((a, b) => b - a))
  })
})

/* ==========================================================================
 * 7b. Volume vs. quality inside a REAL pool — the case the feature was built for
 *
 * THE REGRESSION GUARD OF THIS FILE. Everything above runs one row per player,
 * which freezes `shareScore` at `NEUTRAL_SHARE` and quietly removes the very
 * component that produced the defect: a champion with twice the games collects
 * `WEIGHT_SHARE` (0.2) times a much larger pool share, and that is what let it
 * lead on the base score despite a flat 50 % winrate.
 *
 * The pool below reproduces the reported shape (the numbers of the real paste
 * pinned in tests/scoutImportIntegration.test.ts, not a real player's data):
 *   - 72 games at 50 %, no KDA  -> base 0.763, share 69 %
 *   - 32 games at 63 %, KDA 4.5 -> base 0.732, share 31 %
 * Before the stat weighting the first one wins. It must not.
 * ========================================================================== */

/** The pile of games with nothing to show for it. */
const VOLUME_PICK = ["Ahri", 72, 50, null] as const
/** Fewer games, but a real winrate and a real KDA. */
const QUALITY_PICK = ["Lux", 32, 63, 4.5] as const

describe("with a real pool share, volume alone still does not beat quality", () => {
  it("really exercises the share component, unlike the solo harness", () => {
    // `one_trick` / `signature_pick` require `playerEntryCount >=
    // SHARE_MIN_ENTRIES`, so their presence is the observable proof that
    // `shareScore` here is the champion's real 69 % and not `NEUTRAL_SHARE`.
    // Without this the section below could silently degrade into section 7.
    expect(codesOf(pool(VOLUME_PICK, QUALITY_PICK).signal("Ahri"))).toContain("one_trick")

    // The counter-proof: the identical stat line alone can never say that.
    expect(codesOf(soloSignal(72, 50, null))).not.toContain("one_trick")
  })

  it("ranks the smaller, better pick above the bigger pile of games", () => {
    const analysis = pool(VOLUME_PICK, QUALITY_PICK)

    expect(analysis.score("Lux")).toBeGreaterThan(analysis.score("Ahri"))
  })

  it("is the stat factor that flips the order, not the base score", () => {
    // THE ASSERTION THAT MAKES THIS SECTION NON-VACUOUS. `score =
    // round3(clamp01(clamp01(base * statStrength) * roleWeight))`, and here
    // `roleWeight` is 1 (no lineup) while neither product reaches the clamp
    // (both scores are below 1, asserted). Dividing the score by the exported
    // factor therefore reconstructs the base score the engine had BEFORE the
    // weighting — the only place in this file that needs to do that, and only
    // because the claim is about the difference between the two.
    const analysis = pool(VOLUME_PICK, QUALITY_PICK)
    const volume = analysis.signal("Ahri")
    const quality = analysis.signal("Lux")

    expect(volume.score).toBeLessThan(1)
    expect(quality.score).toBeLessThan(1)

    const volumeBase =
      volume.score / championStatStrengthMultiplier({ games: 72, winrate: 50, kda: null })
    const qualityBase =
      quality.score / championStatStrengthMultiplier({ games: 32, winrate: 63, kda: 4.5 })

    // Before the factor: the pile of games leads. THIS IS THE DEFECT.
    expect(volumeBase).toBeGreaterThan(qualityBase)
    // After it: the ranking the user asked for.
    expect(quality.score).toBeGreaterThan(volume.score)
  })

  it("puts the better pick first in the ban plan, not just first on the score", () => {
    // The score is internal; the ban order is what the user reads.
    expect(pool(VOLUME_PICK, QUALITY_PICK).banOrder()).toEqual(["Lux", "Ahri"])
  })

  it("still lets volume win when the quality pick has nothing to show", () => {
    // The fix bounds volume, it does not delete it: at an equal winrate and no
    // KDA anywhere, more games (and the larger pool share) is the better guess
    // again. Without this the section would also pass for an engine that simply
    // inverted the ranking.
    const analysis = pool(["Ahri", 72, 50, null], ["Lux", 32, 50, null])

    expect(analysis.score("Ahri")).toBeGreaterThan(analysis.score("Lux"))
    expect(analysis.banOrder()).toEqual(["Ahri", "Lux"])
  })
})

/* ==========================================================================
 * 8. Off-role stays capped — the weighting must not punch through it
 *
 * The stat factor multiplies AFTER the off-role damping precisely so that no
 * amount of games, winrate or KDA can lift an off-role signal past a
 * comparable on-role one. On top of the score there is a hard confidence cap:
 * `resolvePhase()` needs `medium` for `safe`/`target`, so a pure off-role
 * candidate cannot reach a ban recommendation structurally.
 * ========================================================================== */

describe("a dream stat line off-role still loses to a solid on-role signal", () => {
  const players = [player("onrole", "mid"), player("offrole", "jungle")]
  const lineup = lineupOf({ mid: "onrole", jungle: "offrole" })

  function analysis() {
    return analyzeScout(
      players,
      dataOf(
        // Solid, unremarkable, on-role.
        ["onrole", [entry("Ahri", 40, 60, { role: "mid", kda: 3.0 })]],
        // Better on every single axis — and recorded on a role this player
        // does not hold in the lineup.
        ["offrole", [entry("Karma", 60, 70, { role: "support", kda: 6.0 })]],
      ),
      { lineup },
    )
  }

  it("scores the off-role dream line below the on-role routine one", () => {
    const bans = analysis().banPlan.prioritizedBans
    const onrole = bans.find((candidate) => candidate.championName === "Ahri")
    const offrole = bans.find((candidate) => candidate.championName === "Karma")

    expect(offrole?.priority).toBeLessThan(onrole?.priority ?? 0)
    // More games, higher winrate, double the KDA — and still not close.
    expect(offrole?.priority).toBeLessThan((onrole?.priority ?? 0) * 0.6)
  })

  it("caps its confidence at low and keeps it out of the recommendation", () => {
    const bans = analysis().banPlan.prioritizedBans
    const onrole = bans.find((candidate) => candidate.championName === "Ahri")
    const offrole = bans.find((candidate) => candidate.championName === "Karma")

    expect(onrole?.confidence).toBe("high")
    expect(onrole?.phase).toBe("safe")
    expect(offrole?.confidence).toBe("low")
    expect(offrole?.roleFit).toBe("offrole")
    expect(offrole?.phase).toBe("situational")
  })

  it("keeps the cap even at an absurd stat line", () => {
    // The cap is a cap, not a steep slope: 200 games at 100 % with KDA 10 is
    // the strongest input the normalisers accept, and it still cannot buy
    // `medium`.
    const extreme = analyzeScout(
      [player("solo", "mid")],
      dataOf(["solo", [entry("Karma", 200, 100, { role: "support", kda: 10 })]]),
      { lineup: lineupOf({ mid: "solo" }) },
    )
    const signal = extreme.players[0].signals[0]

    expect(signal.roleFit).toBe("offrole")
    expect(signal.confidence).toBe("low")
    expect(extreme.banPlan.prioritizedBans[0]?.phase).toBe("situational")
    expect(extreme.banPlan.phases?.safe ?? []).toEqual([])
    expect(extreme.banPlan.phases?.target ?? []).toEqual([])
  })

  it("leaves the off-role ratio untouched, whatever the stat line is", () => {
    // Multiplicative, applied after the role weight — so the ratio between the
    // same entry judged on-role and off-role is the role weight and nothing
    // else. It is checked to two decimals because both scores are rounded to
    // three before anybody can divide them.
    for (const [games, winrate, kda] of [
      [40, 60, 3],
      [70, 61, 3.2],
      [12, 55, 2],
      [100, 70, 5],
    ] as const) {
      const onrole = analyzeScout(
        [player("solo", "mid")],
        dataOf(["solo", [entry("Ahri", games, winrate, { role: "mid", kda })]]),
        { lineup: lineupOf({ mid: "solo" }) },
      ).players[0].signals[0]
      const offrole = analyzeScout(
        [player("solo", "mid")],
        dataOf(["solo", [entry("Ahri", games, winrate, { role: "support", kda })]]),
        { lineup: lineupOf({ mid: "solo" }) },
      ).players[0].signals[0]

      expect(offrole.score / onrole.score, `${games}g/${winrate}%/kda ${kda}`).toBeCloseTo(0.4, 2)
    }
  })
})

/* ==========================================================================
 * 9. The reason ladder — at most one stat reason, KDA before games
 * ========================================================================== */

describe("the stat reasons form a strict ladder", () => {
  it("emits at most one stat reason, over the whole input matrix", () => {
    const offenders: string[] = []
    let sawGamesReason = 0
    let sawKdaReason = 0

    for (const games of [1, 5, 9, 10, 20, 43, 44, 60, 120, 400]) {
      for (const winrate of [10, 30, 40, 45, 50, 55, 62, 75, 95]) {
        for (const kda of [null, 0, 1, 2.5, 3.0, 3.1, 3.3, 4.5, 9]) {
          const codes = statReasonsOf(soloSignal(games, winrate, kda))
          if (codes.length > 1) offenders.push(`${games}g/${winrate}%/kda ${String(kda)}: ${codes}`)
          if (codes.includes("many_games_on_champion")) sawGamesReason += 1
          if (codes.includes("strong_kda")) sawKdaReason += 1
        }
      }
    }

    expect(offenders).toEqual([])
    // Both halves of the ladder have to be reachable, or "at most one" is
    // satisfied trivially by never emitting any.
    expect(sawGamesReason).toBeGreaterThan(0)
    expect(sawKdaReason).toBeGreaterThan(0)
  })

  it("lets KDA win over games when both would qualify", () => {
    // 60 games is far past the 44 the games reason needs, and the KDA
    // qualifies as well — only `strong_kda` is emitted.
    const signal = soloSignal(60, 52, 4.5)

    expect(statReasonsOf(signal)).toEqual(["strong_kda"])
    expect(codesOf(signal)).not.toContain("many_games_on_champion")
  })

  it("falls back to the games reason when no KDA was stated", () => {
    const signal = soloSignal(60, 52, null)

    expect(statReasonsOf(signal)).toEqual(["many_games_on_champion"])
  })

  it("draws the games threshold between 43 and 44", () => {
    // The threshold is derived, not configured (`SCOUT_STAT_REASON_MIN_IMPACT`
    // = 1.03, reached between 43 and 44 games), so it is pinned at its edges
    // rather than restated as a constant.
    expect(statReasonsOf(soloSignal(43, 52, null))).toEqual([])
    expect(statReasonsOf(soloSignal(44, 52, null))).toEqual(["many_games_on_champion"])
  })

  it("gates the KDA reason on a solid sample, not on the KDA alone", () => {
    // At 9 games the KDA factor is ~1.076, comfortably past the 1.03 an
    // impact needs to earn a line — and the reason still does not fire,
    // because `SOLID_SAMPLE_GAMES` is 10. That gap is what makes this test
    // about the gate and not about the threshold.
    expect(kdaImpactMultiplier(8, 9)).toBeGreaterThan(1.03)
    expect(statReasonsOf(soloSignal(9, 52, 8))).toEqual([])
    expect(statReasonsOf(soloSignal(10, 52, 8))).toEqual(["strong_kda"])
  })

  it("never claims experience about a weakness", () => {
    // A comfort pick with 60 games at 40 % is a weakness to exploit. Telling
    // the user "a lot of games on this champion" right next to
    // `high_games_low_winrate` would read as a reason to ban it.
    const weakness = soloSignal(60, 40, null)

    expect(codesOf(weakness)).toContain("high_games_low_winrate")
    expect(codesOf(weakness)).not.toContain("many_games_on_champion")
    expect(statReasonsOf(weakness)).toEqual([])
  })

  it("ships the parameters the two reason texts render", () => {
    const games = soloSignal(44, 52, null).reasons.find(
      (item) => item.code === "many_games_on_champion",
    )
    const kda = soloSignal(60, 52, 4.512345).reasons.find((item) => item.code === "strong_kda")

    // `{games}` is the only placeholder either text uses; the KDA text renders
    // no number at all, which is why it needs no `...One` sibling.
    expect(games?.params).toEqual({ games: 44 })
    // Rounded to three decimals like every other number the engine ships, so
    // a raw float never reaches the screen.
    expect(kda?.params).toEqual({ games: 60, kda: 4.512 })
  })
})

/* ==========================================================================
 * 10. The score contract survives the extra factor
 * ========================================================================== */

describe("the weighted score is still a rounded 0 to 1 value", () => {
  it("stays inside 0 to 1 and stays round3 exact across a wide sweep", () => {
    const offenders: string[] = []
    let count = 0

    for (const games of [1, 3, 5, 8, 10, 17, 20, 29, 40, 44, 55, 70, 90, 150, 300]) {
      for (const winrate of [0, 17, 33, 42, 50, 55, 61, 66, 73, 88, 100]) {
        for (const kda of [null, 0, 0.7, 1.3, 2.5, 3.1, 4.2, 7.7]) {
          const score = soloSignal(games, winrate, kda).score
          const label = `${games}g/${winrate}%/kda ${String(kda)} -> ${score}`
          if (!(score >= 0 && score <= 1)) offenders.push("out of 0..1: " + label)
          if (Math.round(score * 1000) / 1000 !== score) offenders.push("not round3: " + label)
          count += 1
        }
      }
    }

    expect(offenders).toEqual([])
    expect(count).toBe(15 * 11 * 8)
  })

  it("still reaches the top of the range without merging everything there", () => {
    // `SCOUT_STAT_MULTIPLIER_MAX` is set below the product of the three single
    // caps so that the realistic top end stays under the `clamp01` ceiling and
    // ranking information survives up there.
    const strong = soloScore(120, 66, 4.5)
    const stronger = soloScore(300, 73, 7.7)

    expect(strong).toBeLessThanOrEqual(1)
    expect(stronger).toBeLessThanOrEqual(1)
    expect(stronger).toBeGreaterThan(strong)
  })
})

/* ==========================================================================
 * 11. Several rows for one champion — how the KDA is aggregated
 *
 * `aggregateKda` is module-private (correctly so: it is not part of any
 * contract), so it is pinned through the real chain, which is where its result
 * matters anyway. Everything here needs TWO rows for the same champion, which
 * is what `pool` provides and `soloSignal` structurally cannot.
 *
 * THE MUTATION THIS SECTION EXISTS FOR: replacing the `if (entry.kda === null)
 * continue` skip with `const k = entry.kda ?? 0` — the same "missing means bad"
 * collapse sections 1 and 2 guard at the single-row level, one layer deeper. It
 * survived the entire suite before these tests existed.
 *
 * WHY SOME CASES CARRY A THIRD, UNRELATED CHAMPION: with a single champion the
 * pool share is 100 %, the base score sits at the top of the range and strong
 * lines merge at the `clamp01` ceiling of 1.000 — where two different
 * aggregates produce the SAME score and every comparison below would be
 * vacuous. The extra row keeps the scores off the ceiling. Do not remove it.
 * ========================================================================== */

describe("the KDA of a champion is aggregated over its rows", () => {
  /** Keeps the pool share (and with it the score) away from the clamp ceiling. */
  const FILLER = ["Lux", 20, 50, null] as const

  it("skips a row that states no KDA instead of counting it as 0", () => {
    // The example from the function's own doc: 40 games at KDA 4.2 plus a
    // hand-typed row with no KDA aggregates to 4.2 — not to (4.2*40)/50 = 3.36.
    const mixed = pool(["Ahri", 40, 55, 4.2], ["Ahri", 10, 55, null])
    const bothStated = pool(["Ahri", 40, 55, 4.2], ["Ahri", 10, 55, 4.2])

    expect(mixed.score("Ahri")).toBe(bothStated.score("Ahri"))

    // NOT VACUOUS: a row that really states 0 does pull the aggregate down, so
    // "the second row is ignored either way" does not explain the line above.
    const secondStatesZero = pool(["Ahri", 40, 55, 4.2], ["Ahri", 10, 55, 0])

    expect(secondStatesZero.score("Ahri")).toBeLessThan(mixed.score("Ahri"))
  })

  it("weights the rows by their games, not by their count", () => {
    const heavyRowIsGood = pool(["Ahri", 90, 50, 5], ["Ahri", 10, 50, 1], FILLER)
    const heavyRowIsBad = pool(["Ahri", 10, 50, 5], ["Ahri", 90, 50, 1], FILLER)

    // Same two KDAs, same two game counts, swapped: a plain mean would score
    // these identically (both (5+1)/2 = 3).
    expect(heavyRowIsGood.score("Ahri")).toBeGreaterThan(heavyRowIsBad.score("Ahri"))

    // And it is the exact games-weighted mean, not merely "somewhere above":
    // (5*90 + 1*10)/100 = 4.6.
    const weightedMean = pool(["Ahri", 90, 50, 4.6], ["Ahri", 10, 50, 4.6], FILLER)
    expect(heavyRowIsGood.score("Ahri")).toBeCloseTo(weightedMean.score("Ahri"), 6)

    // The plain mean would be 3.0 — measurably lower, so the line above is a
    // statement about the averaging convention and not about rounding.
    const plainMean = pool(["Ahri", 90, 50, 3], ["Ahri", 10, 50, 3], FILLER)
    expect(plainMean.score("Ahri")).toBeLessThan(heavyRowIsGood.score("Ahri"))
  })

  it("is exactly neutral when NO row states a KDA", () => {
    // `aggregateKda` returns null, and `kdaImpactMultiplier(null, …)` is
    // exactly 1 — so the score has to equal the one a stated, exactly neutral
    // KDA produces. `SCOUT_KDA_NEUTRAL` is 2.5, and the first line pins that
    // the control really is the neutral point rather than merely close to it.
    expect(kdaImpactMultiplier(2.5, 50)).toBe(1)

    const noRowStatesOne = pool(["Ahri", 40, 55, null], ["Ahri", 10, 55, null])
    const everyRowIsNeutral = pool(["Ahri", 40, 55, 2.5], ["Ahri", 10, 55, 2.5])

    expect(noRowStatesOne.score("Ahri")).toBe(everyRowIsNeutral.score("Ahri"))

    // NOT VACUOUS: the aggregate is alive in both directions around that point.
    expect(pool(["Ahri", 40, 55, 4.5], ["Ahri", 10, 55, 4.5]).score("Ahri")).toBeGreaterThan(
      noRowStatesOne.score("Ahri"),
    )
    expect(pool(["Ahri", 40, 55, 0.5], ["Ahri", 10, 55, 0.5]).score("Ahri")).toBeLessThan(
      noRowStatesOne.score("Ahri"),
    )
  })

  it("keeps a KDA whose row carries no games at all", () => {
    // The games-weighted sum has no weight here: the only row with a KDA has 0
    // games. The `plainCount` fallback is what stops that 5.0 from vanishing —
    // a 0-games row is already scored down by the base score and must not lose
    // its value a second time.
    const zeroGamesRowCarriesTheKda = pool(["Ahri", 30, 55, null], ["Ahri", 0, 55, 5])
    const nothingStatesAKda = pool(["Ahri", 30, 55, null], ["Ahri", 0, 55, null])

    expect(zeroGamesRowCarriesTheKda.score("Ahri")).toBeGreaterThan(nothingStatesAKda.score("Ahri"))
  })
})

/* ==========================================================================
 * 12. `strong_kda` is NOT suppressed on a weakness — the deliberate asymmetry
 *
 * src/scout/analysis.ts states this in the reason ladder and names this file as
 * the place that pins it. It is the sibling of the "never claims experience
 * about a weakness" test in section 9, and the two must disagree on purpose:
 *
 *   - `many_games_on_champion` is suppressed, because it would reprint the very
 *     game count `high_games_low_winrate` just printed — pure redundancy, and
 *     next to a weakness it reads like an argument to ban after all.
 *   - `strong_kda` is kept, because it says something no other line says: "60
 *     games, 40 % winrate, KDA 4.5" is not a contradiction but a profile — dies
 *     rarely, still does not win. The lane is played safely and passively, so
 *     it is unlikely to crack open on its own.
 *
 * WHERE TO LOOK FOR IT: a weakness never reaches `banPlan.prioritizedBans`. It
 * is rendered from `players[].weaknesses` (ScoutAnalysisPanel.tsx, the
 * "Schwachstellen"/"Weaknesses" list) and collected again in the top-level
 * `weaknesses`, so that is where these assertions read.
 * ========================================================================== */

describe("a weakness keeps its strong_kda line", () => {
  /**
   * 60 games, 40 %, KDA 4.5: past `WEAKNESS_MIN_GAMES`, under
   * `WEAKNESS_MAX_WINRATE_PERCENT` — a weakness by definition — with a KDA that
   * clears the reason threshold on a solid sample.
   */
  const analyzeWeakness = () =>
    analyzeScout(
      [player("solo", "mid")],
      dataOf(["solo", [entry("Ahri", 60, 40, { role: "mid", kda: 4.5 })]]),
    )

  it("is filed as a weakness and never as a ban candidate", () => {
    const result = analyzeWeakness()

    expect(result.players[0].signals).toEqual([])
    expect(result.players[0].weaknesses.map((signal) => signal.championName)).toEqual(["Ahri"])
    expect(result.weaknesses.map((signal) => signal.championName)).toEqual(["Ahri"])
    expect(result.banPlan.prioritizedBans).toEqual([])
  })

  it("carries strong_kda next to high_games_low_winrate", () => {
    const signal = analyzeWeakness().players[0].weaknesses[0]
    const codes = codesOf(signal)

    expect(codes).toContain("high_games_low_winrate")
    expect(codes).toContain("strong_kda")
    // The other half of the asymmetry, in the same breath, so a "cleanup" that
    // makes the two symmetric fails here whichever way it goes.
    expect(codes).not.toContain("many_games_on_champion")
    expect(statReasonsOf(signal)).toEqual(["strong_kda"])
  })

  it("ships the numbers behind the claim even here", () => {
    const strongKda = analyzeWeakness().players[0].weaknesses[0].reasons.find(
      (item) => item.code === "strong_kda",
    )

    expect(strongKda?.params).toEqual({ games: 60, kda: 4.5 })
  })

  it("still weights the weakness itself by that KDA", () => {
    // The weakness list is ordered by score, so the factor has to reach a
    // weakness too — of two equally losing lanes the one that dies rarely is
    // the harder to crack, and it belongs further up.
    const withStrongKda = analyzeWeakness().players[0].weaknesses[0]
    const withoutAnyKda = soloSignal(60, 40, null)

    expect(withStrongKda.score).toBeGreaterThan(withoutAnyKda.score)
    expect(codesOf(withoutAnyKda)).not.toContain("strong_kda")
  })
})

/* ==========================================================================
 * 13. A hand-typed KDA takes exactly the same path as an imported one
 *
 * WHY THIS SECTION EXISTS: until 0.5.0 `ManualChampionEntry.kda` could only ever
 * be written by the OP.GG stats import. The data editor now offers the field as
 * well, so the same number can arrive from a keyboard. Nothing in the scoring
 * was changed for that — and this section is the PROOF of that claim rather than
 * a restatement of it: the engine reads `source` only to decide whether to add
 * the `manual_entry_only` reason, never to weigh a number, so a typed 6.0 has to
 * move the score exactly as far as an imported 6.0 does.
 *
 * WHY IT GOES THROUGH `analyzeScout` AND NOT THROUGH THE FOUR MULTIPLIERS:
 * `championStatStrengthMultiplier` never sees a `ManualChampionEntry` at all —
 * it takes a bare `{ games, winrate, kda }`. The part that can break when the
 * editor starts writing this field is the chain IN FRONT of it: the editor's row
 * → `normalizeEntries()` → `aggregateKda()` → the factor → `ChampionSignal.score`.
 * A test on the pure functions stays green even if that chain drops the field on
 * the floor, which is exactly the regression worth guarding.
 *
 * MEASURED against the 40 games / 55 % row every test below uses (run once
 * through the real engine before these assertions were written):
 *   no KDA at all ....... 0.793   — missing key, `null` and `undefined` alike
 *   KDA 6.0 typed ....... 0.872   — +0.079
 *   KDA 6.0 imported .... 0.872   — identical, not merely close
 *   KDA 0 typed ......... 0.713   — −0.080 against "no KDA"
 * All four sit well clear of the `clamp01` ceiling, and that is what makes the
 * comparisons below say anything at all: on a saturating stat line (say 200
 * games / 100 % / KDA 10) every one of them reads 1.000 and every `toBeLessThan`
 * passes without testing a thing. The explicit headroom assertions keep this row
 * honest if somebody ever "improves" the numbers.
 *
 * WHAT IS DELIBERATELY **NOT** REPEATED HERE:
 *  - the off-role cap under a dream stat line. Section 8 already pins the ratio
 *    `score(offrole) / score(onrole)` at exactly 0.4 across four stat lines
 *    (KDA included), the `low` confidence cap, `roleFit: "offrole"` and the
 *    `situational` phase, up to 200 games / 100 % / KDA 10 — and its rows are
 *    built by the same `entry()` builder, i.e. with `source: "manual"`.
 *  - the "at most one stat reason, `strong_kda` before `many_games_on_champion`"
 *    ladder. Section 9 already walks an 810-combination matrix for it, likewise
 *    on manual rows.
 * Both already hold for a typed value for the very reason this section proves:
 * the engine cannot tell a typed number from an imported one. Copying them here
 * would add runtime and a second place to edit while proving nothing new.
 * ========================================================================== */

/** The row all of section 13 varies: solid sample, mildly positive winrate. */
const EDITOR_GAMES = 40
const EDITOR_WINRATE = 55

/**
 * One signal from ONE row whose fields the caller controls completely.
 *
 * `soloSignal` cannot serve here: it always passes `{ role, kda }`, so the `kda`
 * key is PRESENT (holding `undefined`) even when the caller omits the argument.
 * Telling "key absent" from "key present, value undefined" is half of what this
 * section is about, so it needs a builder that can actually leave the key out.
 */
function editorSignal(overrides: Partial<ManualChampionEntry>): ChampionSignal {
  const result = analyzeScout(
    [player("solo", "mid")],
    dataOf(["solo", [entry("Ahri", EDITOR_GAMES, EDITOR_WINRATE, { role: "mid", ...overrides })]]),
  )
  const analysis = result.players[0]
  const found = [...analysis.signals, ...analysis.weaknesses][0]

  // Guard, not decoration — see soloSignal: a missing signal would make every
  // `.score` below `undefined` and every comparison vacuous.
  expect(found, `no signal for ${JSON.stringify(overrides)}`).toBeDefined()
  return found
}

const editorScore = (overrides: Partial<ManualChampionEntry>): number =>
  editorSignal(overrides).score

describe("a KDA typed into the editor scores exactly like an imported one", () => {
  it("changes the score at all when the user types one", () => {
    // The first thing that has to be true, and the one a broken editor→engine
    // wiring breaks first: a value the user entered by hand is READ.
    const typed = editorScore({ kda: 6 })
    const fieldLeftEmpty = editorScore({})

    expect(typed).toBeGreaterThan(fieldLeftEmpty)
    // Measured +0.079, so this is a real effect and not `round3` noise — the
    // rounding could only ever hide a difference below 0.001.
    expect(typed - fieldLeftEmpty).toBeGreaterThan(0.05)
  })

  it("scores the same number identically whoever wrote it", () => {
    // Provenance must not be worth a single point in either direction. If this
    // ever fails, somebody started treating hand-typed data as less (or more)
    // trustworthy inside the scoring, where that decision does not belong.
    for (const kda of [0, 1.2, 2.5, 4.5, 6, 9]) {
      expect(editorScore({ kda, source: "manual" }), `kda ${kda}`).toBe(
        editorScore({ kda, source: "opgg" }),
      )
    }

    // NOT VACUOUS, twice over. First: the loop above would also pass on an
    // engine that ignored `kda` entirely and returned one constant.
    expect(editorScore({ kda: 6, source: "opgg" })).toBeGreaterThan(
      editorScore({ kda: 1, source: "opgg" }),
    )
    // Second: the two rows really ARE different rows and not the same object
    // compared with itself — the engine notices the source, it just does not
    // let it near the score. `manual_entry_only` is the observable difference.
    expect(codesOf(editorSignal({ kda: 6, source: "manual" }))).toContain("manual_entry_only")
    expect(codesOf(editorSignal({ kda: 6, source: "opgg" }))).not.toContain("manual_entry_only")
  })

  it("treats an empty field as neutral however it reaches the engine", () => {
    // THREE SPELLINGS OF "the user stated nothing", all of which really occur:
    // a row saved before 0.5.0 has no `kda` KEY at all, the editor writes `null`
    // when the field is cleared, and a spread of a row that never had one can
    // hand `undefined` down. `Object.hasOwn`-style or `in`-style guards separate
    // exactly these, so they are tested separately rather than assumed equal.
    const keyAbsent = editorScore({})

    expect(editorScore({ kda: null })).toBe(keyAbsent)
    expect(editorScore({ kda: undefined })).toBe(keyAbsent)

    // The three inputs are genuinely three shapes, or the two lines above are
    // one assertion written out twice.
    expect("kda" in entry("Ahri", EDITOR_GAMES, EDITOR_WINRATE, { role: "mid" })).toBe(false)
    expect(
      "kda" in entry("Ahri", EDITOR_GAMES, EDITOR_WINRATE, { role: "mid", kda: undefined }),
    ).toBe(true)

    // NOT VACUOUS: neutral where nothing was stated AND alive where something
    // was — "every score is equal" does not explain this pair.
    expect(editorScore({ kda: 6 })).toBeGreaterThan(keyAbsent)
    expect(editorScore({ kda: 0.5 })).toBeLessThan(keyAbsent)
  })

  it("scores a typed 0 strictly below an empty field", () => {
    // THE ONE THE OBVIOUS IMPLEMENTATIONS GET WRONG. `!kda` reads the typed 0 as
    // "nothing stated" and makes these two equal; `kda ?? 0` reads the empty
    // field as a typed 0 and makes them equal from the other side. The editor
    // makes this reachable by hand for the first time: 0 is a value a user can
    // now type, and it means "no kills, no assists", not "I did not look".
    const typedZero = editorScore({ kda: 0 })
    const fieldLeftEmpty = editorScore({})

    expect(typedZero).toBeLessThan(fieldLeftEmpty)
    // Measured 0.080 apart, far above the 0.001 `round3` could account for.
    expect(fieldLeftEmpty - typedZero).toBeGreaterThan(0.05)

    // THE ANTI-VACUITY GUARD, and the reason this row is 40 games / 55 % and
    // not something impressive: at the top of the range `clamp01` saturates both
    // sides to 1.000 and `toBeLessThan` above would compare 1.000 with 1.000
    // forever. Both values have to keep visible headroom at both ends.
    expect(fieldLeftEmpty).toBeLessThan(0.99)
    expect(typedZero).toBeGreaterThan(0)
  })

  it("believes exactly the values the editor lets through", () => {
    // The editor refuses anything above SCOUT_KDA_MAX_PLAUSIBLE (`parseKdaInput`
    // in src/components/scout/scoutUiHelpers.ts imports this very constant), and
    // it does so BECAUSE the scoring would read such a value as "not stated".
    // tests/scoutUiHelpers.test.ts pins the editor half of that bargain; this is
    // the engine half, at the boundary itself. A typed 100 that silently scored
    // as nothing would leave a number sitting in the row that does not count.
    const fieldLeftEmpty = editorScore({})

    expect(editorScore({ kda: SCOUT_KDA_MAX_PLAUSIBLE })).toBeGreaterThan(fieldLeftEmpty)
    expect(editorScore({ kda: SCOUT_KDA_MAX_PLAUSIBLE + 1 })).toBe(fieldLeftEmpty)
  })
})
