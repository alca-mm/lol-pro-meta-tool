import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { MockInstance } from "vitest"

import { analyzeScout } from "../src/scout/analysis"
import { parseScoutInput } from "../src/scout/linkParser"
import { applyImportRows, parseScoutStats } from "../src/scout/statsImport"
import {
  createEmptyScoutLineup,
  createEmptyScoutState,
  normalizeScoutState,
} from "../src/scout/storage"
import {
  defaultSelectedRowIds,
  resolveApplyStatus,
  selectedImportRows,
  summarizeSkippedLines,
  suggestImportRole,
} from "../src/components/scout/scoutImportHelpers"
import { assignPlayerToSlot, isLineupEmpty } from "../src/components/scout/scoutUiHelpers"
import { SCOUT_SUBSTITUTE_WEIGHT } from "../src/scout/types"
import type {
  BanCandidate,
  ChampionSignal,
  ManualChampionEntry,
  ScoutAnalysisResult,
  ScoutImportApplyMode,
  ScoutImportApplyOptions,
  ScoutImportRole,
  ScoutImportRow,
  ScoutLineup,
  ScoutLineupSlot,
  ScoutPlayer,
  ScoutPlayerData,
  ScoutPlayerId,
  ScoutStatsImportResult,
  ScoutSubstituteSlot,
  ScoutWarningCode,
} from "../src/scout/types"

/* ==========================================================================
 * END-TO-END over the PURE chain the Tournament Scout container walks:
 *
 *   parseScoutInput  →  lineup  →  parseScoutStats  →  applyImportRows
 *                                                   →  analyzeScout
 *
 * Every module in that chain has its own unit suite already
 * (tests/scoutLinkParser, tests/scoutStatsImport, tests/scoutAnalysis,
 * tests/scoutStorage). What none of them can show is whether the *handover*
 * between two of them is intact: whether the role the user picked in the
 * import panel is still the role the ban plan reasons about five function
 * calls later. That is what this file asserts.
 *
 * Vitest runs in Node here (`environment: 'node'`, no jsdom), so nothing below
 * renders a component — it exercises the pure functions the container calls,
 * in the order the container calls them.
 *
 * Offline and deterministic by construction: no network, no clock, no
 * randomness. `parseScoutInput` derives player ids from the text,
 * `parseScoutStats` derives row ids from the row index, and `analyzeScout` is
 * pure arithmetic over what it is handed.
 *
 * ALL FIXTURES ARE INVENTED. The profile links point at made-up Riot IDs and
 * the pasted tables imitate the *shape* of a scouting site without copying any
 * real page or naming any real player.
 * ========================================================================== */

/* -------------------------------------------------------------------------
 * builders — every fixture goes through the real functions, never through a
 * hand-written object literal, so a drift in any of them fails this file too.
 * ------------------------------------------------------------------------- */

/** Invented profile links. `Wardhopper` and `Lanternpick` are not real users. */
const JUNGLE_LINK = "https://www.op.gg/summoners/euw/Wardhopper-EUW"
const SUPPORT_LINK = "https://www.op.gg/summoners/euw/Lanternpick-EUW"

/** The id `buildScoutPlayerId()` derives from `JUNGLE_LINK`. */
const JUNGLE_ID: ScoutPlayerId = "euw:wardhopper#euw"
const SUPPORT_ID: ScoutPlayerId = "euw:lanternpick#euw"

/** A pasted block, joined the way a clipboard would deliver it. */
function paste(...lines: readonly string[]): string {
  return lines.join("\n")
}

function applyOptions(
  role: ScoutImportRole,
  mode: ScoutImportApplyMode = "append",
): ScoutImportApplyOptions {
  return { role, source: "opgg", recency: "current", mode }
}

/** Assign to a starting slot and fail loudly instead of silently continuing. */
function starter(
  lineup: ScoutLineup,
  slot: ScoutLineupSlot,
  playerId: ScoutPlayerId,
): ScoutLineup {
  const result = assignPlayerToSlot(lineup, { kind: "starter", slot }, playerId)
  expect(result.error).toBeNull()
  return result.lineup
}

/** Same for a bench seat. */
function bench(
  lineup: ScoutLineup,
  slot: ScoutSubstituteSlot,
  playerId: ScoutPlayerId,
): ScoutLineup {
  const result = assignPlayerToSlot(lineup, { kind: "substitute", slot }, playerId)
  expect(result.error).toBeNull()
  return result.lineup
}

function dataOf(
  ...pairs: readonly (readonly [ScoutPlayerId, readonly ManualChampionEntry[]])[]
): Record<ScoutPlayerId, ScoutPlayerData> {
  const result: Record<ScoutPlayerId, ScoutPlayerData> = {}
  for (const [playerId, entries] of pairs) result[playerId] = { playerId, entries: [...entries] }
  return result
}

/** Parse a paste and apply every row it produced, in one step. */
function importInto(
  existing: readonly ManualChampionEntry[],
  text: string,
  role: ScoutImportRole,
  mode: ScoutImportApplyMode = "append",
): ManualChampionEntry[] {
  const parsed = parseScoutStats(text, { role })
  return applyImportRows(existing, parsed.rows, applyOptions(role, mode)).entries
}

function signalFor(
  signals: readonly ChampionSignal[],
  championName: string,
): ChampionSignal | undefined {
  return signals.find((signal) => signal.championName === championName)
}

function candidateFor(
  candidates: readonly BanCandidate[],
  championName: string,
): BanCandidate | undefined {
  return candidates.find((candidate) => candidate.championName === championName)
}

function codesOf(items: readonly { code: string }[]): string[] {
  return items.map((item) => item.code)
}

function championsOf(items: readonly { championName: string }[]): string[] {
  return items.map((item) => item.championName)
}

/** The four warnings that only a supplied lineup may ever produce. */
const LINEUP_WARNING_CODES: readonly ScoutWarningCode[] = [
  "incomplete_starting_five",
  "player_without_lineup_role",
  "offrole_data_present",
  "substitute_risk_active",
]

/* -------------------------------------------------------------------------
 * shared pastes — invented, OP.GG-shaped tab separated tables
 * ------------------------------------------------------------------------- */

const JUNGLE_TABLE = paste(
  "Champion\tGames\tWin Rate\tKDA",
  "Lee Sin\t31\t64%\t3.4",
  "Viego\t22\t59%\t3",
  "Elise\t12\t50%\t2.4",
)

/** Deliberately *strong*: 80 games at 72 % is the best data in the session. */
const KARMA_SUPPORT_TABLE = paste("Champion\tGames\tWin Rate", "Karma\t80\t72%")

/* ==========================================================================
 * 1. The workflow the feature was built for, end to end
 * ========================================================================== */

describe("scout import integration — link, lineup, paste, analyse", () => {
  it("recognises the player from a pasted profile link", () => {
    const parsed = parseScoutInput(JUNGLE_LINK)

    expect(parsed.unparsedLines).toEqual([])
    expect(parsed.duplicatesMerged).toBe(0)
    expect(parsed.players).toHaveLength(1)
    expect(parsed.players[0]).toMatchObject({
      id: JUNGLE_ID,
      riotName: "Wardhopper",
      tagline: "EUW",
      region: "EUW",
      displayName: "Wardhopper#EUW",
      // Nothing in the link says which lane this is — the parser does not guess.
      role: "unknown",
    })
  })

  it("takes the import role from the slot the user assigned, not from the link", () => {
    const player = parseScoutInput(JUNGLE_LINK).players[0]
    const empty = createEmptyScoutLineup()

    expect(isLineupEmpty(empty)).toBe(true)
    // No slot, no parser guess: the user must answer the role question.
    expect(suggestImportRole(empty, player)).toBeNull()

    const lineup = starter(empty, "jungle", player.id)

    expect(isLineupEmpty(lineup)).toBe(false)
    expect(lineup.starters.jungle).toBe(JUNGLE_ID)
    expect(suggestImportRole(lineup, player)).toBe("jungle")
  })

  it("turns the pasted table into jungle entries for that player", () => {
    const parsed = parseScoutStats(JUNGLE_TABLE, { role: "jungle" })

    expect(parsed.layout).toBe("tabular_with_header")
    expect(parsed.columns).toEqual(["champion", "games", "winrate", "kda"])
    expect(parsed.warnings).toEqual([])
    expect(championsOf(parsed.rows)).toEqual(["Lee Sin", "Viego", "Elise"])

    const applied = applyImportRows([], parsed.rows, applyOptions("jungle"))

    expect(applied.addedRows).toBe(3)
    expect(applied.overwrittenRows).toBe(0)
    expect(applied.skippedRows).toBe(0)
    expect(applied.entries).toEqual([
      {
        championName: "Lee Sin",
        games: 31,
        winrate: 64,
        note: "KDA 3.4",
        source: "opgg",
        recency: "current",
        role: "jungle",
      },
      {
        championName: "Viego",
        games: 22,
        winrate: 59,
        note: "KDA 3",
        source: "opgg",
        recency: "current",
        role: "jungle",
      },
      {
        championName: "Elise",
        games: 12,
        winrate: 50,
        note: "KDA 2.4",
        source: "opgg",
        recency: "current",
        role: "jungle",
      },
    ])
  })

  it("produces an on-role jungle signal per imported champion", () => {
    const parsed = parseScoutInput(JUNGLE_LINK)
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], JUNGLE_TABLE, "jungle")
    const analysis = analyzeScout(parsed.players, dataOf([JUNGLE_ID, entries]), { lineup })

    const signals = analysis.players[0].signals

    expect(championsOf(signals)).toEqual(["Lee Sin", "Viego", "Elise"])
    for (const signal of signals) {
      expect(signal.role).toBe("jungle")
      expect(signal.roleFit).toBe("onrole")
      expect(signal.lineupRole).toBe("jungle")
      expect(signal.fromSubstitute).toBe(false)
      expect(signal.sources).toEqual(["opgg"])
      expect(codesOf(signal.reasons)).toContain("onrole_signal")
    }

    // The numbers survive the whole chain unchanged.
    expect(signalFor(signals, "Lee Sin")).toMatchObject({ games: 31, winrate: 64 })
    expect(signalFor(signals, "Viego")).toMatchObject({ games: 22, winrate: 59 })
    expect(signalFor(signals, "Elise")).toMatchObject({ games: 12, winrate: 50 })
  })

  it("aims the resulting ban candidates at the jungle slot", () => {
    const parsed = parseScoutInput(JUNGLE_LINK)
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], JUNGLE_TABLE, "jungle")
    const analysis = analyzeScout(parsed.players, dataOf([JUNGLE_ID, entries]), { lineup })

    const bans = analysis.banPlan.prioritizedBans

    expect(championsOf(bans)).toEqual(["Lee Sin", "Viego", "Elise"])
    for (const candidate of bans) {
      expect(candidate.targetPlayerId).toBe(JUNGLE_ID)
      expect(candidate.targetRole).toBe("jungle")
      expect(candidate.lineupRoles).toEqual(["jungle"])
      expect(candidate.roleFit).toBe("onrole")
      expect(candidate.isOverlap).toBe(false)
      expect(candidate.substituteOnly).toBe(false)
    }

    expect(bans[0].championName).toBe("Lee Sin")
    expect(bans[0].confidence).toBe("high")
    expect(bans[0].phase).toBe("safe")
    expect(analysis.banPlan.phases?.safe.map((c) => c.championName)).toContain("Lee Sin")
  })

  it("reports the lineup it reasoned about", () => {
    const parsed = parseScoutInput(JUNGLE_LINK)
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], JUNGLE_TABLE, "jungle")
    const analysis = analyzeScout(parsed.players, dataOf([JUNGLE_ID, entries]), { lineup })

    expect(analysis.lineup).not.toBeNull()
    expect(analysis.lineup?.starterPlayerIds).toEqual([JUNGLE_ID])
    expect(analysis.lineup?.missingStarterSlots).toEqual(["top", "mid", "bot", "support"])
    expect(analysis.lineup?.isStartingFiveComplete).toBe(false)
    expect(analysis.lineup?.unassignedPlayerIds).toEqual([])
    expect(analysis.players[0].lineup).toEqual({
      playerId: JUNGLE_ID,
      membership: "starter",
      starterSlot: "jungle",
      substituteSlot: null,
    })
  })
})

/* ==========================================================================
 * 2. THE CORE REQUIREMENT — off-role data stays off-role
 *
 * This is the protection against "Karma support numbers get counted as a
 * jungle ban". The jungler below is a starter on JUNGLE; the Karma table was
 * imported as SUPPORT, and it carries the strongest numbers in the whole
 * session on purpose (80 games at 72 %, more than any jungle row). Raw score
 * alone would therefore put Karma at the top of the ban list.
 *
 * Two mechanisms stop that, and both are asserted here:
 *   - the 0.4 off-role score weight, and
 *   - the confidence CAP at `low` — which is the structural half: `resolvePhase()`
 *     demands at least `medium` for `safe`/`target`, so no amount of games can
 *     lift a purely off-role candidate into a ban recommendation.
 * ========================================================================== */

describe("scout import integration — support data never becomes a jungle ban", () => {
  function offroleSetup(): ScoutAnalysisResult {
    const parsed = parseScoutInput(JUNGLE_LINK)
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)

    // Two imports for one player: their jungle pool, then a support table the
    // user deliberately filed as support.
    const jungleEntries = importInto([], JUNGLE_TABLE, "jungle")
    const entries = importInto(jungleEntries, KARMA_SUPPORT_TABLE, "support")

    expect(entries.map((entry) => entry.role)).toEqual([
      "jungle",
      "jungle",
      "jungle",
      "support",
    ])

    return analyzeScout(parsed.players, dataOf([JUNGLE_ID, entries]), { lineup })
  }

  it("marks the support signal of a jungle starter as offrole", () => {
    const karma = signalFor(offroleSetup().players[0].signals, "Karma")

    expect(karma).toBeDefined()
    expect(karma?.role).toBe("support")
    expect(karma?.lineupRole).toBe("jungle")
    expect(karma?.roleFit).toBe("offrole")
    expect(codesOf(karma?.reasons ?? [])).toContain("offrole_signal")
  })

  it("caps that signal at low confidence even with the best numbers in the session", () => {
    const signals = offroleSetup().players[0].signals
    const karma = signalFor(signals, "Karma")
    const leeSin = signalFor(signals, "Lee Sin")

    // 80 games would be `high` on its own — `SIGNAL_CONF_HIGH_GAMES` is 15.
    expect(karma?.games).toBe(80)
    expect(karma?.winrate).toBe(72)
    expect(karma?.confidence).toBe("low")

    // …while the weaker on-role row keeps its confidence and outscores it.
    expect(leeSin?.confidence).toBe("high")
    expect(karma?.score ?? 1).toBeLessThan(leeSin?.score ?? 0)
  })

  it("keeps the off-role candidate out of the safe and target ban phases", () => {
    const analysis = offroleSetup()
    const karma = candidateFor(analysis.banPlan.prioritizedBans, "Karma")

    expect(karma).toBeDefined()
    expect(karma?.confidence).toBe("low")
    expect(karma?.roleFit).toBe("offrole")
    // No on-role signal behind it, so no lane is claimed in the headline.
    expect(karma?.targetRole).toBeNull()
    expect(karma?.phase).toBe("situational")

    expect(championsOf(analysis.banPlan.phases?.safe ?? [])).not.toContain("Karma")
    expect(championsOf(analysis.banPlan.phases?.target ?? [])).not.toContain("Karma")
    expect(championsOf(analysis.banPlan.phases?.situational ?? [])).toContain("Karma")
    // The safe phase is built purely from the on-role jungle rows.
    expect(championsOf(analysis.banPlan.phases?.safe ?? [])).toEqual(["Lee Sin", "Viego"])
  })

  it("says out loud that off-role data is in play", () => {
    const analysis = offroleSetup()

    expect(codesOf(analysis.warnings)).toContain("offrole_data_present")
    expect(codesOf(analysis.banPlan.warnings)).toContain("offrole_data_present")

    const warning = analysis.warnings.find((entry) => entry.code === "offrole_data_present")
    expect(warning?.severity).toBe("warning")
    expect(warning?.params).toEqual({ count: 1 })
  })

  it("proves the demotion comes from the lineup: the same paste ranks first without one", () => {
    // Identical entries, identical engine — the ONLY difference is that no
    // lineup is supplied, so nothing can be judged off-role. Karma then wins
    // the ban list outright. That contrast is exactly the regression this
    // whole feature guards: without the role check, support numbers would be
    // recommended as the first ban against a jungler.
    const parsed = parseScoutInput(JUNGLE_LINK)
    const entries = importInto(importInto([], JUNGLE_TABLE, "jungle"), KARMA_SUPPORT_TABLE, "support")
    const data = dataOf([JUNGLE_ID, entries])

    const withoutLineup = analyzeScout(parsed.players, data, {})
    const withLineup = analyzeScout(parsed.players, data, {
      lineup: starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID),
    })

    expect(withoutLineup.banPlan.prioritizedBans[0].championName).toBe("Karma")
    expect(withoutLineup.banPlan.prioritizedBans[0].phase).toBe("safe")
    expect(withoutLineup.banPlan.prioritizedBans[0].confidence).toBe("high")

    expect(withLineup.banPlan.prioritizedBans[0].championName).toBe("Lee Sin")
    expect(candidateFor(withLineup.banPlan.prioritizedBans, "Karma")?.phase).toBe("situational")
  })
})

/* ==========================================================================
 * 3. The selected role wins over the role printed in the source
 * ========================================================================== */

describe("scout import integration — the user's role beats the pasted one", () => {
  const ROLE_COLUMN_TABLE = paste("Champion\tRole\tGames\tWin Rate", "Karma\tSupport\t22\t61%")

  it("reports the contradiction instead of resolving it silently", () => {
    const parsed = parseScoutStats(ROLE_COLUMN_TABLE, { role: "jungle" })

    expect(parsed.columns).toEqual(["champion", "games", "winrate", "role"])
    expect(parsed.rows[0].detectedRole).toBe("support")
    expect(parsed.rows[0].roleMismatch).toBe(true)
    expect(codesOf(parsed.rows[0].warnings)).toContain("role_mismatch")

    const warning = parsed.warnings.find((entry) => entry.code === "role_mismatch")
    expect(warning?.severity).toBe("warning")
    expect(warning?.rowIndex).toBe(0)
    expect(warning?.params).toEqual({ detectedRole: "support", selectedRole: "jungle" })
  })

  it("stores the selected role on the entry", () => {
    const parsed = parseScoutStats(ROLE_COLUMN_TABLE, { role: "jungle" })
    const applied = applyImportRows([], parsed.rows, applyOptions("jungle"))

    expect(applied.addedRows).toBe(1)
    expect(applied.skippedRows).toBe(0)
    expect(applied.entries[0]).toMatchObject({
      championName: "Karma",
      games: 22,
      winrate: 61,
      role: "jungle",
    })
  })

  it("makes the analysis treat it as a jungle threat", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], ROLE_COLUMN_TABLE, "jungle")
    const analysis = analyzeScout(players, dataOf([JUNGLE_ID, entries]), { lineup })

    const karma = signalFor(analysis.players[0].signals, "Karma")
    expect(karma?.role).toBe("jungle")
    expect(karma?.roleFit).toBe("onrole")
    expect(karma?.lineupRole).toBe("jungle")
    expect(karma?.confidence).toBe("high")

    const candidate = candidateFor(analysis.banPlan.prioritizedBans, "Karma")
    expect(candidate?.targetRole).toBe("jungle")
    expect(candidate?.lineupRoles).toEqual(["jungle"])
  })
})

/* ==========================================================================
 * 4. Parsing alone changes nothing — applying is a separate, explicit step
 * ========================================================================== */

describe("scout import integration — no import without confirmation", () => {
  it("leaves the player data and the analysis untouched while only parsing", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const data = dataOf([JUNGLE_ID, []])

    const before = analyzeScout(players, data, { lineup })
    const snapshot = JSON.parse(JSON.stringify(data)) as unknown

    const parsedOnce: ScoutStatsImportResult = parseScoutStats(JUNGLE_TABLE, { role: "jungle" })
    const parsedTwice: ScoutStatsImportResult = parseScoutStats(JUNGLE_TABLE, { role: "jungle" })

    expect(parsedOnce.rows).toHaveLength(3)
    // Parsing is a report, not a mutation: same map object, same content.
    expect(data[JUNGLE_ID].entries).toEqual([])
    expect(data).toEqual(snapshot)
    expect(parsedTwice.rows).toEqual(parsedOnce.rows)

    const after = analyzeScout(players, data, { lineup })
    expect(after).toEqual(before)
    expect(after.players[0].signals).toEqual([])
    expect(after.banPlan.prioritizedBans).toEqual([])
    expect(codesOf(after.players[0].dataQuality.notes)).not.toContain("small_sample")
  })

  it("creates the entries only once applyImportRows runs", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const existing: ManualChampionEntry[] = []

    const parsed = parseScoutStats(JUNGLE_TABLE, { role: "jungle" })
    const applied = applyImportRows(existing, parsed.rows, applyOptions("jungle"))

    // The array handed in is never mutated — the UI may still be rendering it.
    expect(existing).toEqual([])
    expect(applied.entries).not.toBe(existing)
    expect(applied.entries).toHaveLength(3)

    const analysis = analyzeScout(players, dataOf([JUNGLE_ID, applied.entries]), { lineup })
    expect(analysis.players[0].signals).toHaveLength(3)
  })
})

/* ==========================================================================
 * 5. Imported rows really are scout data — they survive persistence
 *
 * Regression guard against silent loss in `normalizeManualEntry()`: an entry
 * that storage rejects would look imported until the next page load and then
 * vanish without a trace.
 * ========================================================================== */

describe("scout import integration — imported entries survive the storage round trip", () => {
  it("keeps every applied row, byte for byte, through normalizeScoutState", () => {
    const players: ScoutPlayer[] = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto(importInto([], JUNGLE_TABLE, "jungle"), KARMA_SUPPORT_TABLE, "support")

    expect(entries).toHaveLength(4)

    const state = {
      ...createEmptyScoutState(),
      players,
      playerData: dataOf([JUNGLE_ID, entries]),
      lineup,
    }
    const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

    expect(round.schemaVersion).toBe(2)
    expect(round.playerData[JUNGLE_ID]).toBeDefined()
    expect(round.playerData[JUNGLE_ID].entries).toHaveLength(entries.length)
    expect(round.playerData[JUNGLE_ID].entries).toEqual(entries)
    expect(championsOf(round.playerData[JUNGLE_ID].entries)).toEqual([
      "Lee Sin",
      "Viego",
      "Elise",
      "Karma",
    ])
    // The KDA note the importer built is stored verbatim, not dropped.
    expect(round.playerData[JUNGLE_ID].entries[0].note).toBe("KDA 3.4")
    expect(round.lineup.starters.jungle).toBe(JUNGLE_ID)
  })

  it("analyses the reloaded state exactly like the freshly imported one", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], JUNGLE_TABLE, "jungle")

    const state = {
      ...createEmptyScoutState(),
      players,
      playerData: dataOf([JUNGLE_ID, entries]),
      lineup,
    }
    const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

    const fresh = analyzeScout(players, state.playerData, { lineup: state.lineup })
    const reloaded = analyzeScout(round.players, round.playerData, { lineup: round.lineup })

    expect(reloaded).toEqual(fresh)
  })
})

/* ==========================================================================
 * 6. Rows without games or without a winrate are not applied
 *
 * `games: 0` is never invented — a row that cannot supply both numbers simply
 * does not become an entry, and it is counted as skipped instead of silently
 * disappearing.
 * ========================================================================== */

describe("scout import integration — incomplete rows are skipped, never faked", () => {
  const PARTIAL_TABLE = paste(
    "Champion\tGames\tWin Rate",
    "Lee Sin\t31\t64%",
    "Nidalee\t\t57%",
    "Sejuani\t14\t",
  )

  it("keeps the incomplete rows visible in the preview with their reason", () => {
    const parsed = parseScoutStats(PARTIAL_TABLE, { role: "jungle" })

    expect(championsOf(parsed.rows)).toEqual(["Lee Sin", "Nidalee", "Sejuani"])
    expect(parsed.rows[1]).toMatchObject({ championName: "Nidalee", games: null, winrate: 57 })
    expect(codesOf(parsed.rows[1].warnings)).toEqual(["missing_games"])
    expect(parsed.rows[2]).toMatchObject({ championName: "Sejuani", games: 14, winrate: null })
    expect(codesOf(parsed.rows[2].warnings)).toEqual(["missing_winrate"])
  })

  it("counts them as skipped and never turns them into entries", () => {
    const parsed = parseScoutStats(PARTIAL_TABLE, { role: "jungle" })
    const applied = applyImportRows([], parsed.rows, applyOptions("jungle"))

    expect(applied.addedRows).toBe(1)
    expect(applied.overwrittenRows).toBe(0)
    expect(applied.skippedRows).toBe(2)
    expect(championsOf(applied.entries)).toEqual(["Lee Sin"])
    // No `games: 0` was invented for the rows that had no games column.
    expect(applied.entries.every((entry) => entry.games > 0)).toBe(true)
  })

  it("produces no signal for a row that was never applied", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    const entries = importInto([], PARTIAL_TABLE, "jungle")
    const analysis = analyzeScout(players, dataOf([JUNGLE_ID, entries]), { lineup })

    expect(championsOf(analysis.players[0].signals)).toEqual(["Lee Sin"])
    expect(signalFor(analysis.players[0].signals, "Nidalee")).toBeUndefined()
    expect(signalFor(analysis.players[0].signals, "Sejuani")).toBeUndefined()
    expect(championsOf(analysis.banPlan.prioritizedBans)).toEqual(["Lee Sin"])
    expect(analysis.players[0].dataQuality.entryCount).toBe(1)
    expect(analysis.players[0].dataQuality.totalGames).toBe(31)
  })
})

/* ==========================================================================
 * 7. Substitutes keep behaving like substitutes after an import
 * ========================================================================== */

describe("scout import integration — substitute handling is unchanged by the import", () => {
  /** This link carries a role hint, which is what gives a bench player a
   *  comparable reference role at all. */
  const BENCH_LINK = `${JUNGLE_LINK} jungle`

  function benchSetup(includeSubstitutes: boolean): ScoutAnalysisResult {
    const players = parseScoutInput(BENCH_LINK).players
    expect(players[0].role).toBe("jungle")

    const lineup = bench(createEmptyScoutLineup(), "sub1", JUNGLE_ID)
    const entries = importInto([], JUNGLE_TABLE, "jungle")

    return analyzeScout(players, dataOf([JUNGLE_ID, entries]), { lineup, includeSubstitutes })
  }

  it("scores nothing at all while substitutes are excluded", () => {
    const analysis = benchSetup(false)

    expect(analysis.players[0].lineup.membership).toBe("substitute")
    expect(analysis.players[0].signals).toEqual([])
    expect(analysis.banPlan.prioritizedBans).toEqual([])
    expect(codesOf(analysis.warnings)).not.toContain("substitute_risk_active")
  })

  it("marks every signal as coming from the bench once they are included", () => {
    const analysis = benchSetup(true)
    const signals = analysis.players[0].signals

    expect(championsOf(signals)).toEqual(["Lee Sin", "Viego", "Elise"])
    for (const signal of signals) {
      expect(signal.fromSubstitute).toBe(true)
      // A bench seat is not a starting slot, so there is no lineup role to name.
      expect(signal.lineupRole).toBeNull()
      expect(signal.roleFit).toBe("onrole")
      expect(codesOf(signal.reasons)).toContain("substitute_risk")
    }

    expect(codesOf(analysis.warnings)).toContain("substitute_risk_active")
    expect(analysis.banPlan.prioritizedBans[0].substituteOnly).toBe(true)
  })

  it("weights the bench score down by exactly the substitute weight", () => {
    const players = parseScoutInput(BENCH_LINK).players
    const entries = importInto([], JUNGLE_TABLE, "jungle")
    const data = dataOf([JUNGLE_ID, entries])

    const asStarter = analyzeScout(players, data, {
      lineup: starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID),
    })
    const asSubstitute = analyzeScout(players, data, {
      lineup: bench(createEmptyScoutLineup(), "sub1", JUNGLE_ID),
      includeSubstitutes: true,
    })

    for (const championName of ["Lee Sin", "Viego", "Elise"]) {
      const starterScore = signalFor(asStarter.players[0].signals, championName)?.score ?? 0
      const benchScore = signalFor(asSubstitute.players[0].signals, championName)?.score ?? 0

      expect(starterScore).toBeGreaterThan(0)
      expect(benchScore).toBeLessThan(starterScore)
      expect(benchScore).toBeCloseTo(starterScore * SCOUT_SUBSTITUTE_WEIGHT, 2)
    }
  })
})

/* ==========================================================================
 * 8. Two players, one champion — the overlap is recognised across imports
 * ========================================================================== */

describe("scout import integration — a champion imported for two players overlaps", () => {
  function overlapAnalysis(): ScoutAnalysisResult {
    const parsed = parseScoutInput(paste(JUNGLE_LINK, SUPPORT_LINK))
    expect(parsed.players.map((player) => player.id)).toEqual([JUNGLE_ID, SUPPORT_ID])

    let lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)
    lineup = starter(lineup, "support", SUPPORT_ID)

    const jungleEntries = importInto(
      [],
      paste("Champion\tGames\tWin Rate", "Karma\t26\t60%"),
      "jungle",
    )
    const supportEntries = importInto(
      [],
      paste("Champion\tGames\tWin Rate", "Karma\t34\t63%"),
      "support",
    )

    return analyzeScout(
      parsed.players,
      dataOf([JUNGLE_ID, jungleEntries], [SUPPORT_ID, supportEntries]),
      { lineup },
    )
  }

  it("merges both imports into one ban candidate that hits two lanes", () => {
    const candidate = candidateFor(overlapAnalysis().banPlan.prioritizedBans, "Karma")

    expect(candidate).toBeDefined()
    expect(candidate?.isOverlap).toBe(true)
    expect(candidate?.affectedPlayerIds).toHaveLength(2)
    expect([...(candidate?.affectedPlayerIds ?? [])].sort()).toEqual(
      [JUNGLE_ID, SUPPORT_ID].sort(),
    )
    expect(candidate?.lineupRoles).toEqual(["jungle", "support"])
    expect(codesOf(candidate?.reasons ?? [])).toContain("hits_multiple_players")
  })

  it("names the strongest on-role signal as the primary target", () => {
    const analysis = overlapAnalysis()
    const candidate = candidateFor(analysis.banPlan.prioritizedBans, "Karma")

    // 34 games at 63 % (support) beats 26 games at 60 % (jungle), and both are
    // on-role, so the support seat is the honest headline.
    expect(candidate?.targetPlayerId).toBe(SUPPORT_ID)
    expect(candidate?.targetRole).toBe("support")
    expect(candidate?.roleFit).toBe("onrole")
    expect(analysis.banPlan.overlapBans.map((c) => c.championName)).toEqual(["Karma"])
  })
})

/* ==========================================================================
 * 9. Apply modes as the analysis sees them
 * ========================================================================== */

describe("scout import integration — append and replace through to the analysis", () => {
  it("append of the same champion and role updates the row instead of doubling it", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)

    const firstPaste = paste("Champion\tGames\tWin Rate", "Lee Sin\t10\t50%")
    const secondPaste = paste("Champion\tGames\tWin Rate", "Lee Sin\t40\t70%")

    const afterFirst = importInto([], firstPaste, "jungle")
    const parsedSecond = parseScoutStats(secondPaste, { role: "jungle" })
    const applied = applyImportRows(afterFirst, parsedSecond.rows, applyOptions("jungle"))

    expect(applied.addedRows).toBe(0)
    expect(applied.overwrittenRows).toBe(1)
    expect(applied.skippedRows).toBe(0)
    expect(applied.entries).toHaveLength(1)

    const analysis = analyzeScout(players, dataOf([JUNGLE_ID, applied.entries]), { lineup })
    const signals = analysis.players[0].signals

    expect(signals).toHaveLength(1)
    // The second import's numbers, not a sum and not the first import's.
    expect(signals[0]).toMatchObject({ championName: "Lee Sin", games: 40, winrate: 70 })
    expect(analysis.players[0].dataQuality.totalGames).toBe(40)
  })

  it("replace removes only the imported role and leaves the other role's signal alive", () => {
    const players = parseScoutInput(JUNGLE_LINK).players
    const lineup = starter(createEmptyScoutLineup(), "jungle", JUNGLE_ID)

    const withJungle = importInto([], paste("Champion\tGames\tWin Rate", "Lee Sin\t20\t60%"), "jungle")
    const withSupport = importInto(
      withJungle,
      paste("Champion\tGames\tWin Rate", "Karma\t30\t65%"),
      "support",
    )

    const parsed = parseScoutStats(paste("Champion\tGames\tWin Rate", "Elise\t18\t61%"), {
      role: "jungle",
    })
    const applied = applyImportRows(withSupport, parsed.rows, applyOptions("jungle", "replace"))

    expect(applied.removedExistingRows).toBe(1)
    expect(applied.addedRows).toBe(1)
    expect(applied.skippedRows).toBe(0)
    expect(applied.entries.map((entry) => [entry.championName, entry.role])).toEqual([
      ["Karma", "support"],
      ["Elise", "jungle"],
    ])

    const analysis = analyzeScout(players, dataOf([JUNGLE_ID, applied.entries]), { lineup })
    const signals = analysis.players[0].signals

    expect(championsOf(signals)).toEqual(["Elise", "Karma"])
    expect(signalFor(signals, "Lee Sin")).toBeUndefined()
    // The surviving support row is still judged off-role for a jungle starter.
    expect(signalFor(signals, "Karma")).toMatchObject({
      games: 30,
      winrate: 65,
      roleFit: "offrole",
      confidence: "low",
    })
    expect(signalFor(signals, "Elise")).toMatchObject({ roleFit: "onrole", confidence: "high" })
  })
})

/* ==========================================================================
 * 10. Without a lineup the engine claims nothing about roles
 * ========================================================================== */

describe("scout import integration — no lineup, no role claims", () => {
  function noLineupAnalysis(): ScoutAnalysisResult {
    const players = parseScoutInput(JUNGLE_LINK).players
    const entries = importInto(importInto([], JUNGLE_TABLE, "jungle"), KARMA_SUPPORT_TABLE, "support")
    return analyzeScout(players, dataOf([JUNGLE_ID, entries]), {})
  }

  it("reports every signal as role-unknown", () => {
    const analysis = noLineupAnalysis()
    const signals = analysis.players[0].signals

    expect(signals).toHaveLength(4)
    for (const signal of signals) {
      expect(signal.roleFit).toBe("unknown")
      expect(signal.lineupRole).toBeNull()
      expect(signal.fromSubstitute).toBe(false)
      expect(codesOf(signal.reasons)).not.toContain("offrole_signal")
      expect(codesOf(signal.reasons)).not.toContain("onrole_signal")
    }
  })

  it("returns no lineup summary and raises none of the lineup warnings", () => {
    const analysis = noLineupAnalysis()

    expect(analysis.lineup).toBeNull()
    expect(analysis.players[0].lineup).toEqual({
      playerId: JUNGLE_ID,
      membership: "unassigned",
      starterSlot: null,
      substituteSlot: null,
    })

    for (const code of LINEUP_WARNING_CODES) {
      expect(codesOf(analysis.warnings)).not.toContain(code)
      expect(codesOf(analysis.banPlan.warnings)).not.toContain(code)
    }
  })

  it("names no lane on any ban candidate", () => {
    for (const candidate of noLineupAnalysis().banPlan.prioritizedBans) {
      expect(candidate.targetRole).toBeNull()
      expect(candidate.lineupRoles).toEqual([])
      expect(candidate.roleFit).toBe("unknown")
      expect(candidate.substituteOnly).toBe(false)
    }
  })
})

/* ==========================================================================
 * 11. THE OP.GG RAW CHAMPION-PAGE COPY, THROUGH THE WHOLE CHAIN
 *
 * Everything above pastes a *table*: the values of one champion sit side by
 * side on one line. This section pastes what a browser actually puts on the
 * clipboard when somebody selects the OP.GG summoner "Champions" panel and
 * hits copy — every value on its own line, as a repeating block:
 *
 *     1          <- rank index
 *     Ahri       <- champion, printed twice (icon caption + label)
 *     Ahri
 *     36S        <- wins   (DE "S" = Siege)
 *     36N        <- losses (DE "N" = Niederlagen)
 *     50%        <- winrate, exactly as the site printed it
 *     2.60:1     <- KDA ratio
 *
 * The chain under test is the same one as above —
 *   parseScoutStats → applyImportRows → analyzeScout
 * — but the parser now has to recognise a line-block pattern instead of
 * columns, and it has to *refuse* three kinds of line that carry champion-
 * shaped numbers and are not champion rows: the "Alle Champions" total, the
 * `vs …` matchup sub-blocks, and the recommendation widget above the list.
 *
 * NOTHING HERE IS FETCHED. `parseScoutStats` reads a string the user pasted;
 * no page is loaded and no markup is read (see the "NOT A SCRAPER" note on
 * `ScoutImportLayout` in src/scout/types.ts). The `fetch` spy installed below
 * asserts exactly that after every single test in this section.
 *
 * ALL FIXTURES ARE INVENTED, like the rest of this file: `Runecarver` is not a
 * real user, and the numbers were chosen to make the assertions readable — not
 * copied off anybody's profile.
 * ========================================================================== */

/** Another invented profile link — this one belongs to a mid laner. */
const MID_LINK = "https://www.op.gg/summoners/euw/Runecarver-EUW"
const MID_ID: ScoutPlayerId = "euw:runecarver#euw"

/**
 * One champion block of the raw copy, built structurally instead of typed out,
 * so the *shape* of a block is stated once and every fixture below inherits it.
 */
function opggBlock(
  rank: number,
  championName: string,
  wins: number,
  losses: number,
  winratePercent: number,
  kdaRatio: string,
): string[] {
  return [
    String(rank),
    championName,
    championName,
    `${wins}S`,
    `${losses}N`,
    `${winratePercent}%`,
    kdaRatio,
  ]
}

/**
 * The clean case: three champions, nothing around them.
 * Ahri 36+36 = 72 games at 50 %, Lux 23+15 = 38 at 61 %, Milio 20+12 = 32 at 63 %.
 */
const OPGG_RAW_COPY = paste(
  ...opggBlock(1, "Ahri", 36, 36, 50, "2.60:1"),
  ...opggBlock(2, "Lux", 23, 15, 61, "3.10:1"),
  ...opggBlock(3, "Milio", 20, 12, 63, "4.20:1"),
)

/**
 * Exactly what `OPGG_RAW_COPY` must become once applied as mid data.
 *
 * The `W… · L…` prefix of the note is not decoration: `ManualChampionEntry`
 * deliberately gains no `wins`/`losses` field (that would need a schema bump and
 * a migration), so the note is the one place the win/loss split behind `games`
 * survives the apply — see the contract on `ScoutImportRow.wins`. Asserting it
 * here is what keeps that evidence from being dropped as "just a note".
 */
const EXPECTED_MID_ENTRIES: readonly ManualChampionEntry[] = [
  {
    championName: "Ahri",
    games: 72,
    winrate: 50,
    note: "W36 · L36 · KDA 2.6",
    source: "opgg",
    recency: "current",
    role: "mid",
  },
  {
    championName: "Lux",
    games: 38,
    winrate: 61,
    note: "W23 · L15 · KDA 3.1",
    source: "opgg",
    recency: "current",
    role: "mid",
  },
  {
    championName: "Milio",
    games: 32,
    winrate: 63,
    note: "W20 · L12 · KDA 4.2",
    source: "opgg",
    recency: "current",
    role: "mid",
  },
]

/**
 * The same page as a user really copies it: the recommendation widget above the
 * list, the "Alle Champions" total with its own numbers, and a `vs …` matchup
 * sub-block behind each champion. Only Ahri and Lux are champion-pool rows.
 */
const OPGG_RAW_COPY_WITH_NOISE = paste(
  "Empfohlene Champions",
  "Sett",
  "Gwen",
  "Alle Champions",
  "128S",
  "110N",
  "54%",
  "2.90:1",
  ...opggBlock(1, "Ahri", 36, 36, 50, "2.60:1"),
  "vs Zed",
  "12S",
  "8N",
  "60%",
  ...opggBlock(2, "Lux", 23, 15, 61, "3.10:1"),
  "vs Syndra",
  "9S",
  "11N",
  "45%",
)

/**
 * Every name in `OPGG_RAW_COPY_WITH_NOISE` that must never reach the data: two
 * recommendations, two matchup opponents, and the total row's own caption.
 */
const SKIPPED_NAMES: readonly string[] = ["Sett", "Gwen", "Zed", "Syndra", "Alle Champions"]

/** 20 wins, 20 losses — but the site printed 62 %. Contradicts itself on purpose. */
const OPGG_RAW_COPY_MISMATCH = paste(...opggBlock(1, "Ahri", 20, 20, 62, "2.10:1"))

/** A classic tab-separated table for the same player; `Ahri` overlaps the raw copy. */
const MID_TABLE = paste(
  "Champion\tGames\tWin Rate\tKDA",
  "Ahri\t10\t40%\t2.1",
  "Orianna\t25\t56%\t3.2",
)

/** The control for the mismatch case: the winrate the win/loss counts imply. */
const MID_TABLE_40_AT_50 = paste("Champion\tGames\tWin Rate\tKDA", "Ahri\t40\t50%\t2.1")

describe("scout import integration — the OP.GG raw champion-page copy", () => {
  /* Proof of the "not a scraper" rule: `fetch` is watched for this whole
   * section and asserted untouched after every test in it, so a future "let's
   * just pull the page ourselves" cannot slip in behind these assertions. */
  let fetchSpy: MockInstance<typeof globalThis.fetch>

  beforeAll(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  /* ------------------------------------------------------------------
   * 11.1 The workflow the layout was built for
   * ------------------------------------------------------------------ */

  describe("happy path — a mid laner's champion page", () => {
    it("reads the line blocks as one row per champion, without inventing columns", () => {
      const parsed = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })

      expect(parsed.layout).toBe("opgg_raw_champion_page")
      // Not a table: there is no column structure to report at all.
      expect(parsed.columns).toEqual([])
      expect(parsed.warnings).toEqual([])
      expect(parsed.unparsedLines).toEqual([])
      expect(championsOf(parsed.rows)).toEqual(["Ahri", "Lux", "Milio"])

      // `games` is wins + losses. The rounded percentage is never used to
      // reconstruct a game count.
      expect(parsed.rows.map((row) => [row.wins, row.losses, row.games, row.winrate])).toEqual([
        [36, 36, 72, 50],
        [23, 15, 38, 61],
        [20, 12, 32, 63],
      ])
      for (const row of parsed.rows) {
        expect(row.championResolved).toBe(true)
        expect(row.confidence).toBe("high")
        expect(row.warnings).toEqual([])
      }
    })

    it("applies them as mid entries for the mid starter", () => {
      const player = parseScoutInput(MID_LINK).players[0]
      const lineup = starter(createEmptyScoutLineup(), "mid", player.id)

      expect(player.id).toBe(MID_ID)
      expect(suggestImportRole(lineup, player)).toBe("mid")

      const parsed = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })
      const applied = applyImportRows([], parsed.rows, applyOptions("mid"))

      expect(applied.addedRows).toBe(3)
      expect(applied.overwrittenRows).toBe(0)
      expect(applied.skippedRows).toBe(0)
      expect(applied.entries).toEqual(EXPECTED_MID_ENTRIES)
    })

    it("turns them into on-role mid signals and a mid-aimed ban plan", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const entries = importInto([], OPGG_RAW_COPY, "mid")
      const analysis = analyzeScout(players, dataOf([MID_ID, entries]), { lineup })

      const signals = analysis.players[0].signals
      expect(championsOf(signals)).toEqual(["Ahri", "Lux", "Milio"])
      for (const signal of signals) {
        expect(signal.role).toBe("mid")
        expect(signal.roleFit).toBe("onrole")
        expect(signal.lineupRole).toBe("mid")
        expect(signal.fromSubstitute).toBe(false)
        expect(signal.sources).toEqual(["opgg"])
        expect(codesOf(signal.reasons)).toContain("onrole_signal")
      }

      // The wins/losses arithmetic survives to the far end of the chain.
      expect(signalFor(signals, "Ahri")).toMatchObject({ games: 72, winrate: 50 })
      expect(signalFor(signals, "Lux")).toMatchObject({ games: 38, winrate: 61 })
      expect(signalFor(signals, "Milio")).toMatchObject({ games: 32, winrate: 63 })
      expect(analysis.players[0].dataQuality.totalGames).toBe(142)

      const bans = analysis.banPlan.prioritizedBans
      expect(championsOf(bans)).toEqual(["Ahri", "Lux", "Milio"])
      for (const candidate of bans) {
        expect(candidate.targetPlayerId).toBe(MID_ID)
        expect(candidate.targetRole).toBe("mid")
        expect(candidate.lineupRoles).toEqual(["mid"])
        expect(candidate.roleFit).toBe("onrole")
        expect(candidate.substituteOnly).toBe(false)
      }
      expect(championsOf(analysis.banPlan.phases?.safe ?? [])).toEqual(["Ahri", "Lux", "Milio"])
    })
  })

  /* ------------------------------------------------------------------
   * 11.2 The selected role wins — because the page states none
   * ------------------------------------------------------------------ */

  describe("the chosen role wins because the page claims none", () => {
    it("claims no role at all: every row is detectedRole unknown and never a mismatch", () => {
      for (const role of ["mid", "support"] as const) {
        const parsed = parseScoutStats(OPGG_RAW_COPY, { role })

        expect(parsed.rows).toHaveLength(3)
        for (const row of parsed.rows) {
          // The champions list of a summoner page prints no lane per champion,
          // so the parser must not derive one — not even from the champion's
          // usual role. A claimed role here would raise `role_mismatch` against
          // a user choice that is in fact uncontradicted.
          expect(row.detectedRole).toBe("unknown")
          expect(row.roleMismatch).toBe(false)
          expect(codesOf(row.warnings)).not.toContain("role_mismatch")
        }
        expect(codesOf(parsed.warnings)).not.toContain("role_mismatch")
      }
    })

    it("stamps exactly the role the user picked onto every entry", () => {
      const asMid = importInto([], OPGG_RAW_COPY, "mid")
      const asSupport = importInto([], OPGG_RAW_COPY, "support")

      expect(asMid).toEqual(EXPECTED_MID_ENTRIES)
      expect(asMid.map((entry) => entry.role)).toEqual(["mid", "mid", "mid"])
      expect(asSupport.map((entry) => entry.role)).toEqual(["support", "support", "support"])

      // Same paste, same numbers, same notes — the role is the ONLY difference.
      expect(asSupport).toEqual(asMid.map((entry) => ({ ...entry, role: "support" })))
    })
  })

  /* ------------------------------------------------------------------
   * 11.3 Off-role protection holds for this layout too
   * ------------------------------------------------------------------ */

  describe("a raw copy filed under the wrong lane stays off-role", () => {
    /** The player is a JUNGLE starter; the paste is deliberately filed as SUPPORT. */
    function offroleAnalysis(): ScoutAnalysisResult {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "jungle", MID_ID)
      const entries = importInto([], OPGG_RAW_COPY, "support")

      expect(entries.map((entry) => entry.role)).toEqual(["support", "support", "support"])
      return analyzeScout(players, dataOf([MID_ID, entries]), { lineup })
    }

    it("caps the strongest signal at low confidence and marks it off-role", () => {
      const strongest = offroleAnalysis().players[0].signals[0]

      // 72 games would be `high` on its own — `SIGNAL_CONF_HIGH_GAMES` is 15.
      expect(strongest.championName).toBe("Ahri")
      expect(strongest.games).toBe(72)
      expect(strongest.winrate).toBe(50)
      expect(strongest.role).toBe("support")
      expect(strongest.lineupRole).toBe("jungle")
      expect(strongest.roleFit).toBe("offrole")
      expect(strongest.confidence).toBe("low")
      expect(codesOf(strongest.reasons)).toContain("offrole_signal")
    })

    it("keeps it out of the safe and the target ban phase, and says so out loud", () => {
      const analysis = offroleAnalysis()
      const ahri = candidateFor(analysis.banPlan.prioritizedBans, "Ahri")

      expect(ahri?.confidence).toBe("low")
      expect(ahri?.roleFit).toBe("offrole")
      // No on-role signal behind it, so no lane is claimed in the headline.
      expect(ahri?.targetRole).toBeNull()
      expect(ahri?.phase).toBe("situational")

      expect(championsOf(analysis.banPlan.phases?.safe ?? [])).not.toContain("Ahri")
      expect(championsOf(analysis.banPlan.phases?.target ?? [])).not.toContain("Ahri")
      // All three rows are off-role, so no recommendation survives at all.
      expect(championsOf(analysis.banPlan.phases?.safe ?? [])).toEqual([])
      expect(championsOf(analysis.banPlan.phases?.target ?? [])).toEqual([])
      expect(championsOf(analysis.banPlan.phases?.situational ?? [])).toEqual([
        "Ahri",
        "Lux",
        "Milio",
      ])

      expect(codesOf(analysis.warnings)).toContain("offrole_data_present")
      expect(codesOf(analysis.banPlan.warnings)).toContain("offrole_data_present")
      expect(
        analysis.warnings.find((entry) => entry.code === "offrole_data_present")?.params,
      ).toEqual({ count: 3 })
    })

    it("proves the demotion is the lineup's doing: the same entries reach `safe` without one", () => {
      // Identical entries, identical engine — the ONLY difference is that no
      // lineup is supplied, so nothing can be judged off-role and the very same
      // paste is recommended as a safe ban. Without this contrast the test
      // above would also pass if the numbers were simply too weak to be
      // recommended in the first place.
      const players = parseScoutInput(MID_LINK).players
      const entries = importInto([], OPGG_RAW_COPY, "support")
      const analysis = analyzeScout(players, dataOf([MID_ID, entries]), {})

      const top = analysis.banPlan.prioritizedBans[0]
      expect(top.championName).toBe("Ahri")
      expect(top.confidence).toBe("high")
      expect(top.phase).toBe("safe")
      expect(top.roleFit).toBe("unknown")
      expect(championsOf(analysis.banPlan.phases?.safe ?? [])).toContain("Ahri")
      expect(codesOf(analysis.warnings)).not.toContain("offrole_data_present")
    })
  })

  /* ------------------------------------------------------------------
   * 11.4 Parsing is a preview, not an import
   * ------------------------------------------------------------------ */

  describe("no data before the user confirms", () => {
    it("leaves the player data and the analysis untouched while only parsing", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const data = dataOf([MID_ID, []])

      const before = analyzeScout(players, data, { lineup })
      const snapshot = JSON.parse(JSON.stringify(data)) as unknown

      const parsedOnce = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })
      const parsedTwice = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })

      expect(parsedOnce.rows).toHaveLength(3)
      // Parsing is a report, not a mutation: same map object, same content.
      expect(data[MID_ID].entries).toEqual([])
      expect(data).toEqual(snapshot)
      expect(parsedTwice.rows).toEqual(parsedOnce.rows)

      const after = analyzeScout(players, data, { lineup })
      expect(after).toEqual(before)
      expect(after.players[0].signals).toEqual([])
      expect(after.banPlan.prioritizedBans).toEqual([])
    })

    it("creates the entries only once applyImportRows runs", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const existing: ManualChampionEntry[] = []

      const parsed = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })
      const applied = applyImportRows(existing, parsed.rows, applyOptions("mid"))

      // The array handed in is never mutated — the UI may still be rendering it.
      expect(existing).toEqual([])
      expect(applied.entries).not.toBe(existing)
      expect(championsOf(applied.entries)).toEqual(["Ahri", "Lux", "Milio"])

      const analysis = analyzeScout(players, dataOf([MID_ID, applied.entries]), { lineup })
      expect(analysis.players[0].signals).toHaveLength(3)
    })
  })

  /* ------------------------------------------------------------------
   * 11.5 What else is on that page, and why none of it may become data
   * ------------------------------------------------------------------ */

  describe("recommendations, the total row and matchups produce no data", () => {
    it("keeps only the two real champion rows out of the whole page", () => {
      const parsed = parseScoutStats(OPGG_RAW_COPY_WITH_NOISE, { role: "mid" })

      expect(parsed.layout).toBe("opgg_raw_champion_page")
      expect(championsOf(parsed.rows)).toEqual(["Ahri", "Lux"])
      expect(parsed.rows.map((row) => [row.games, row.winrate])).toEqual([
        [72, 50],
        [38, 61],
      ])

      // Each skipped line is reported under its own reason — never as anonymous
      // `noise`, so the preview can say *what* it left out.
      expect(parsed.unparsedLines).toEqual([
        { raw: "Sett", reason: "recommended_champion" },
        { raw: "Gwen", reason: "recommended_champion" },
        { raw: "Alle Champions", reason: "aggregate_row" },
        { raw: "vs Zed", reason: "matchup_row" },
        { raw: "vs Syndra", reason: "matchup_row" },
      ])
      // All three kinds are deliberate skips, so no "a row could not be read".
      expect(codesOf(parsed.warnings)).not.toContain("row_not_parsed")
    })

    it("creates an entry for neither a recommendation, the total nor a matchup opponent", () => {
      const entries = importInto([], OPGG_RAW_COPY_WITH_NOISE, "mid")

      // The concrete list, not just its length: a phantom "Alle Champions" row
      // carrying the player's whole game count would keep a count-only check
      // green as long as a real champion was dropped in exchange.
      expect(championsOf(entries)).toEqual(["Ahri", "Lux"])
      for (const skipped of SKIPPED_NAMES) {
        expect(championsOf(entries)).not.toContain(skipped)
      }
      expect(entries.map((entry) => [entry.championName, entry.games, entry.winrate])).toEqual([
        ["Ahri", 72, 50],
        ["Lux", 38, 61],
      ])
    })

    it("gives the analysis nothing to reason about beyond those two", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const entries = importInto([], OPGG_RAW_COPY_WITH_NOISE, "mid")
      const analysis = analyzeScout(players, dataOf([MID_ID, entries]), { lineup })

      expect(championsOf(analysis.players[0].signals)).toEqual(["Ahri", "Lux"])
      expect(championsOf(analysis.banPlan.prioritizedBans)).toEqual(["Ahri", "Lux"])
      for (const skipped of SKIPPED_NAMES) {
        expect(signalFor(analysis.players[0].signals, skipped)).toBeUndefined()
        expect(candidateFor(analysis.banPlan.prioritizedBans, skipped)).toBeUndefined()
      }
      // 72 + 38 — the 238 games of the "Alle Champions" total are nowhere.
      expect(analysis.players[0].dataQuality.totalGames).toBe(110)
      expect(analysis.players[0].dataQuality.entryCount).toBe(2)
    })
  })

  /* ------------------------------------------------------------------
   * 11.6 The imported rows are ordinary scout data — they persist
   * ------------------------------------------------------------------ */

  describe("imported raw-copy rows survive the storage round trip", () => {
    it("keeps every applied row, its source and the schema version", () => {
      const players: ScoutPlayer[] = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const entries = importInto([], OPGG_RAW_COPY, "mid")

      const state = {
        ...createEmptyScoutState(),
        players,
        playerData: dataOf([MID_ID, entries]),
        lineup,
      }
      const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

      expect(round.schemaVersion).toBe(2)
      expect(round.playerData[MID_ID]).toBeDefined()
      expect(round.playerData[MID_ID].entries).toHaveLength(entries.length)
      expect(round.playerData[MID_ID].entries).toEqual(EXPECTED_MID_ENTRIES)
      for (const entry of round.playerData[MID_ID].entries) {
        expect(entry.source).toBe("opgg")
        expect(entry.role).toBe("mid")
        expect(entry.recency).toBe("current")
      }
      // The KDA note the importer built is stored verbatim, not dropped.
      expect(round.playerData[MID_ID].entries[0].note).toBe("W36 · L36 · KDA 2.6")
      expect(round.lineup.starters.mid).toBe(MID_ID)
    })

    it("analyses the reloaded state exactly like the freshly imported one", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const entries = importInto([], OPGG_RAW_COPY, "mid")

      const state = {
        ...createEmptyScoutState(),
        players,
        playerData: dataOf([MID_ID, entries]),
        lineup,
      }
      const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

      expect(analyzeScout(round.players, round.playerData, { lineup: round.lineup })).toEqual(
        analyzeScout(players, state.playerData, { lineup: state.lineup }),
      )
    })
  })

  /* ------------------------------------------------------------------
   * 11.7 A raw copy on top of a hand-pasted table
   * ------------------------------------------------------------------ */

  describe("mixed operation with a classic table for the same player", () => {
    it("updates the champion both pastes contain and leaves the other one alone", () => {
      const fromTable = importInto([], MID_TABLE, "mid")

      expect(fromTable.map((entry) => [entry.championName, entry.games, entry.winrate])).toEqual([
        ["Ahri", 10, 40],
        ["Orianna", 25, 56],
      ])

      const parsed = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })
      const applied = applyImportRows(fromTable, parsed.rows, applyOptions("mid", "append"))

      // Ahri is in both pastes at the same role, so it is updated in place.
      // Appending it a second time would make every consumer that sums `games`
      // — the ban priority above all — count that champion twice.
      expect(applied.overwrittenRows).toBe(1)
      expect(applied.addedRows).toBe(2)
      expect(applied.skippedRows).toBe(0)
      expect(championsOf(applied.entries)).toEqual(["Ahri", "Orianna", "Lux", "Milio"])

      // The overlapping champion carries the raw copy's numbers — not the sum,
      // and not the table's.
      expect(applied.entries[0]).toEqual(EXPECTED_MID_ENTRIES[0])
      // The table-only champion is untouched, note and all.
      expect(applied.entries[1]).toEqual(fromTable[1])
      expect(applied.entries[2]).toEqual(EXPECTED_MID_ENTRIES[1])
      expect(applied.entries[3]).toEqual(EXPECTED_MID_ENTRIES[2])
    })

    it("lets the analysis see one Ahri, with the raw copy's numbers", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const entries = importInto(importInto([], MID_TABLE, "mid"), OPGG_RAW_COPY, "mid")
      const analysis = analyzeScout(players, dataOf([MID_ID, entries]), { lineup })

      const signals = analysis.players[0].signals
      expect(signals.filter((signal) => signal.championName === "Ahri")).toHaveLength(1)
      expect(signalFor(signals, "Ahri")).toMatchObject({ games: 72, winrate: 50 })
      expect(signalFor(signals, "Orianna")).toMatchObject({ games: 25, winrate: 56 })
      // 72 + 25 + 38 + 32 — not 82, which is what a doubled Ahri would produce.
      expect(analysis.players[0].dataQuality.totalGames).toBe(167)
      expect(analysis.players[0].dataQuality.entryCount).toBe(4)
    })
  })

  /* ------------------------------------------------------------------
   * 11.8 A stated winrate that contradicts its own win/loss counts
   * ------------------------------------------------------------------ */

  describe("a contradicting winrate is reported, never corrected", () => {
    it("raises winrate_mismatch and keeps both numbers as the page printed them", () => {
      const parsed = parseScoutStats(OPGG_RAW_COPY_MISMATCH, { role: "mid" })
      const row = parsed.rows[0]

      expect(row.championName).toBe("Ahri")
      expect([row.wins, row.losses]).toEqual([20, 20])
      // `games` from the two counted integers, `winrate` from the page — the
      // parser recomputes neither of them away.
      expect(row.games).toBe(40)
      expect(row.winrate).toBe(62)
      expect(codesOf(row.warnings)).toContain("winrate_mismatch")

      const warning = parsed.warnings.find((entry) => entry.code === "winrate_mismatch")
      expect(warning?.severity).toBe("warning")
      expect(warning?.rowIndex).toBe(0)
      // Both numbers travel so the UI can show them side by side.
      expect(warning?.params).toEqual({ champion: "Ahri", stated: 62, computed: 50 })
    })

    it("still applies the row, with 62 and not with 50", () => {
      const entries = importInto([], OPGG_RAW_COPY_MISMATCH, "mid")

      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        championName: "Ahri",
        games: 40,
        winrate: 62,
        note: "W20 · L20 · KDA 2.1",
        source: "opgg",
        recency: "current",
        role: "mid",
      })
    })

    it("makes the analysis reason with 62 — provably, not by assertion", () => {
      const players = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)

      const stated = analyzeScout(
        players,
        dataOf([MID_ID, importInto([], OPGG_RAW_COPY_MISMATCH, "mid")]),
        { lineup },
      )
      // The same champion and the same 40 games, but carrying the winrate the
      // win/loss counts imply. If the importer had "corrected" 62 to 50, the
      // two analyses below would be indistinguishable.
      const recomputed = analyzeScout(
        players,
        dataOf([MID_ID, importInto([], MID_TABLE_40_AT_50, "mid")]),
        { lineup },
      )

      expect(signalFor(stated.players[0].signals, "Ahri")).toMatchObject({
        games: 40,
        winrate: 62,
      })
      expect(signalFor(recomputed.players[0].signals, "Ahri")).toMatchObject({
        games: 40,
        winrate: 50,
      })

      const statedScore = signalFor(stated.players[0].signals, "Ahri")?.score ?? 0
      const recomputedScore = signalFor(recomputed.players[0].signals, "Ahri")?.score ?? 0
      expect(statedScore).toBeGreaterThan(recomputedScore)
      expect(stated.players[0].dataQuality.totalGames).toBe(40)
    })
  })

  /* ------------------------------------------------------------------
   * 11.9 The whole section ran without touching the network
   * ------------------------------------------------------------------ */

  it("never fetches anything — the text came out of the user's clipboard", () => {
    parseScoutStats(OPGG_RAW_COPY_WITH_NOISE, { role: "mid" })
    applyImportRows([], parseScoutStats(OPGG_RAW_COPY, { role: "mid" }).rows, applyOptions("mid"))
    analyzeScout(
      parseScoutInput(MID_LINK).players,
      dataOf([MID_ID, importInto([], OPGG_RAW_COPY, "mid")]),
      { lineup: starter(createEmptyScoutLineup(), "mid", MID_ID) },
    )

    expect(fetchSpy.mock.calls).toEqual([])
  })
})

/* ==========================================================================
 * 12. THE NUMBER THE USER IS TOLD == THE ROWS THAT WERE ACTUALLY STORED
 *
 * THE BUG THIS SECTION EXISTS FOR. The panel announced
 *
 *     "Übernommen: 72 Zeilen."
 *
 * while 36 rows had been stored. It printed the sum of the two counters that
 * were then called `added` and `replaced` — and `replaced` MEANT TWO DIFFERENT
 * THINGS depending on the apply mode: in `append` "an existing entry was
 * overwritten in place", in `replace` "an existing entry was DELETED"
 * (`replaced = existing.length - kept.length`, the user's OWN OLD ENTRIES
 * thrown away, not rows that came in). 36 stored rows replaced by 36 pasted
 * ones therefore summed to exactly the 72 of the report, and no amount of
 * staring at the preview could reconcile it.
 *
 * THAT AMBIGUITY IS GONE — that is what this cleanup was for.
 * {@link ScoutImportApplyResult} now answers exactly one question per counter
 * (its JSDoc in src/scout/types.ts is the contract):
 *
 *   importedRows         rows that actually became entries. Mode-independent,
 *                        and THE number the success message prints.
 *   addedRows            imported rows that became NEW entries.
 *   overwrittenRows      imported rows that overwrote a same-champion,
 *                        same-role entry IN PLACE. `append` only — 0 in
 *                        `replace` by construction.
 *   removedExistingRows  the user's OWN stored rows that this apply DELETED.
 *                        `replace` only — 0 in `append` by construction.
 *   skippedRows          offered rows that were not applied.
 *
 * `importedRows` also REPLACES the helper `appliedRowCount(selected, result)`
 * (`selected.length - result.skipped`, deleted from
 * src/components/scout/scoutImportHelpers.ts): the number belongs on the result
 * itself, not on two arguments a call site has to pair up correctly.
 *
 * SO WHY DOES THIS SECTION STILL FORM THE OLD SUM? Because a rename only fixes
 * the bug for as long as nobody adds the two numbers up again. The tests below
 * deliberately compute `addedRows + removedExistingRows`, pin it to the
 * historical 72 (and 46, and 39), and assert that it is NEITHER the reported
 * number NOR the stored row count. It is a tripwire, not a formula — and with
 * the new name the mistake is legible in the source: `removedExistingRows` says
 * "deletions" out loud, and deletions are never something to report as a
 * success. A unit test structurally cannot show what the user complained about:
 * that the SENTENCE and the STORED DATA agree.
 *
 * So every test below asserts an IDENTITY, never just a number: the reported
 * count against the rows that really came out of the apply, counted from
 * `result.entries` — and once, at the far end, from the persisted state after a
 * JSON round trip. This is the test that would have caught the bug.
 *
 * Fixtures go through the real chain
 *   parseScoutStats → defaultSelectedRowIds/selectedImportRows
 *                   → applyImportRows → result.importedRows
 * and never through a hand-written `ScoutImportRow`: a literal could not have
 * produced this bug and therefore cannot prove it gone.
 *
 * ALL FIXTURES ARE INVENTED, like the rest of this file. The champion names are
 * catalog entries (they have to resolve), the numbers were chosen to make the
 * arithmetic of the old formula visible, and no real profile was copied.
 * ========================================================================== */

/**
 * A tab-separated champion table, built from a name list so the ROW COUNT of a
 * fixture is a number this file states rather than a line count somebody has to
 * recount by hand.
 */
function championTable(
  names: readonly string[],
  games: (index: number) => number,
  winrate: (index: number) => number,
): string {
  return paste(
    "Champion\tGames\tWin Rate",
    ...names.map((name, index) => `${name}\t${games(index)}\t${winrate(index)}%`),
  )
}

/**
 * 36 champions — the size of the pool behind the bug report.
 *
 * The number is not decoration: 36 stored rows replaced by 36 pasted ones is
 * the constellation whose historical `added + replaced` — today
 * `addedRows + removedExistingRows` — is exactly the 72 the user read on
 * screen. A shorter list would still catch the defect, but it would no longer
 * reproduce the reported number, and the next reader could not match this test
 * to the report.
 */
const THIRTY_SIX_CHAMPIONS: readonly string[] = [
  "Aatrox",
  "Ahri",
  "Akali",
  "Alistar",
  "Amumu",
  "Anivia",
  "Annie",
  "Ashe",
  "Azir",
  "Bard",
  "Blitzcrank",
  "Brand",
  "Braum",
  "Caitlyn",
  "Camille",
  "Cassiopeia",
  "Corki",
  "Darius",
  "Diana",
  "Draven",
  "Ekko",
  "Elise",
  "Evelynn",
  "Ezreal",
  "Fiora",
  "Fizz",
  "Galio",
  "Gangplank",
  "Garen",
  "Gnar",
  "Gragas",
  "Graves",
  "Gwen",
  "Hecarim",
  "Heimerdinger",
  "Illaoi",
]

/** The player's stored pool before the second import: 36 mid rows at 50 %. */
const STORED_36_TABLE = championTable(
  THIRTY_SIX_CHAMPIONS,
  (index) => 10 + index,
  () => 50,
)

/** The fresh paste: the same 36 champions, different numbers. */
const FRESH_36_TABLE = championTable(
  THIRTY_SIX_CHAMPIONS,
  (index) => 40 + index,
  () => 60,
)

/** A shorter fresh paste — 10 rows onto 36 stored ones. Old formula: 46. */
const FRESH_10_TABLE = championTable(
  THIRTY_SIX_CHAMPIONS.slice(0, 10),
  (index) => 40 + index,
  () => 60,
)

/** Three support champions, so a role-scoped replace has something to spare. */
const SUPPORT_TABLE_3 = championTable(["Thresh", "Leona", "Rakan"], (index) => 20 + index, () => 55)

/**
 * Four rows, one of which storage would refuse: `Zed` states a winrate and no
 * games at all. `isImportRowApplicable()` rejects it, `applyImportRows()` counts
 * it in `skippedRows`, and the reported number must not include it.
 */
const TABLE_WITH_ONE_UNAPPLICABLE = paste(
  "Champion\tGames\tWin Rate",
  "Ahri\t30\t55%",
  "Zed\t\t61%",
  "Lux\t24\t58%",
  "Milio\t18\t52%",
)

/**
 * The raw OP.GG copy as it really arrives: a recommendation widget, the
 * "Alle Champions" total, a `vs …` sub-block behind two of the champions — and
 * the empty-column `-` the page prints everywhere.
 *
 * Only Ahri, Lux and Milio are champion-pool rows, and the numbers are the ones
 * of `OPGG_RAW_COPY`, so the applied result must equal `EXPECTED_MID_ENTRIES`
 * despite all the noise around it.
 */
const OPGG_RAW_COPY_WITH_DASHES = paste(
  "Empfohlene Champions",
  "Sett",
  "-",
  "Gwen",
  "-",
  "Alle Champions",
  "128S",
  "110N",
  "54%",
  "2.90:1",
  "1",
  "-",
  "Ahri",
  "-",
  "Ahri",
  "36S",
  "36N",
  "50%",
  "2.60:1",
  "-",
  "vs Zed",
  "3S",
  "1N",
  "75%",
  "2",
  "-",
  "Lux",
  "-",
  "Lux",
  "23S",
  "15N",
  "61%",
  "3.10:1",
  "-",
  "vs Syndra",
  "9S",
  "11N",
  "45%",
  "3",
  "-",
  "Milio",
  "-",
  "Milio",
  "20S",
  "12N",
  "63%",
  "4.20:1",
  "-",
)

/** Parse, then tick exactly what the panel ticks for the user. */
function parseAndPreselect(text: string, role: ScoutImportRole): {
  parsed: ScoutStatsImportResult
  selected: ScoutImportRow[]
} {
  const parsed = parseScoutStats(text, { role })
  const selected = selectedImportRows(parsed.rows, new Set(defaultSelectedRowIds(parsed.rows)))
  return { parsed, selected }
}

/** Parse, then tick EVERY row — including ones the apply will skip. */
function parseAndSelectAll(text: string, role: ScoutImportRole): {
  parsed: ScoutStatsImportResult
  selected: ScoutImportRow[]
} {
  const parsed = parseScoutStats(text, { role })
  const selected = selectedImportRows(parsed.rows, new Set(parsed.rows.map((row) => row.id)))
  return { parsed, selected }
}

/** The stored rows of one role — the "what really landed" side of the identity. */
function entriesOfRole(
  entries: readonly ManualChampionEntry[],
  role: ScoutImportRole,
): ManualChampionEntry[] {
  return entries.filter((entry) => entry.role === role)
}

describe("scout import integration — the reported count is the stored count", () => {
  /* The same "not a scraper" proof as section 11: counting rows must not start
   * loading pages either. Asserted after every test in this section. */
  let fetchSpy: MockInstance<typeof globalThis.fetch>

  beforeAll(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch")
  })

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  /* ------------------------------------------------------------------
   * 12.1 `replace` over an existing pool — the reported failure itself
   * ------------------------------------------------------------------ */

  describe("replace over existing data — the case from the bug report", () => {
    it("reports 36 for 36 rows replacing 36 stored ones, and stores exactly 36", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      expect(stored).toHaveLength(36)

      const { parsed, selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
      expect(parsed.layout).toBe("tabular_with_header")
      expect(parsed.warnings).toEqual([])
      expect(selected).toHaveLength(36)

      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      // THE IDENTITY. Left: what the user is told. Right: what is in the data.
      expect(reported).toBe(36)
      expect(result.entries).toHaveLength(reported)
      expect(entriesOfRole(result.entries, "mid")).toHaveLength(36)
      expect(result.skippedRows).toBe(0)

      // `replace` clears the role first, so nothing is left to overwrite in
      // place. Asserting this mode's structurally-zero counter is what makes
      // the two fields below unambiguous.
      expect(result.overwrittenRows).toBe(0)

      // THE HISTORICAL FAILURE, FROZEN ON PURPOSE. The panel used to print
      // `added + replaced`, which in this mode is `addedRows +
      // removedExistingRows` — 36 imported rows plus 36 DELETED stored ones —
      // and 72 is verbatim the "Übernommen: 72 Zeilen." of the bug report, twice
      // what was actually stored. THE SUM OF THESE TWO FIELDS MUST NEVER BE A
      // SUCCESS MESSAGE: `removedExistingRows` counts the user's own stored rows
      // that this apply THREW AWAY, and unlike the old `replaced` the name says
      // so right at the call site. The lines below are a tripwire, not a
      // formula — they exist so nobody re-derives 72 and calls it progress.
      expect(result.addedRows).toBe(36)
      expect(result.removedExistingRows).toBe(36)
      expect(result.addedRows + result.removedExistingRows).toBe(72)
      expect(result.addedRows + result.removedExistingRows).not.toBe(reported)
      expect(result.addedRows + result.removedExistingRows).not.toBe(result.entries.length)

      // The sentence the panel actually renders carries the corrected number.
      expect(resolveApplyStatus({ canApply: false, appliedCount: reported })).toEqual({
        kind: "applied",
        count: 36,
      })
    })

    it("really replaced the old numbers — the 36 stored rows are the new ones", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      const { selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))

      expect(championsOf(result.entries)).toEqual([...THIRTY_SIX_CHAMPIONS])
      // Old pool: 10 games at 50 %. New pool: 40 games at 60 %.
      expect(stored[0]).toEqual({
        championName: "Aatrox",
        games: 10,
        winrate: 50,
        note: "",
        source: "opgg",
        recency: "current",
        role: "mid",
      })
      expect(result.entries[0]).toEqual({
        championName: "Aatrox",
        games: 40,
        winrate: 60,
        note: "",
        source: "opgg",
        recency: "current",
        role: "mid",
      })
      expect(result.entries[35]).toMatchObject({ championName: "Illaoi", games: 75, winrate: 60 })
    })

    it("reports 10 for 10 rows onto 36 stored ones — the old formula said 46", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      const { selected } = parseAndPreselect(FRESH_10_TABLE, "mid")
      expect(selected).toHaveLength(10)

      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      expect(reported).toBe(10)
      expect(result.entries).toHaveLength(10)
      expect(entriesOfRole(result.entries, "mid")).toHaveLength(10)
      expect(result.overwrittenRows).toBe(0)
      // The 72-case at a different size: 10 imported + 36 DELETED = 46 — a
      // number that is neither the paste, nor the pool, nor anything the user
      // could point at in the preview. Frozen for the same reason as the 72:
      // the sum of an import counter and a deletion counter is never a result.
      expect(result.addedRows + result.removedExistingRows).toBe(46)
      expect(result.addedRows + result.removedExistingRows).not.toBe(reported)
      expect(championsOf(result.entries)).toEqual([...THIRTY_SIX_CHAMPIONS.slice(0, 10)])
    })
  })

  /* ------------------------------------------------------------------
   * 12.2 `append` — the mode the old formula got right, kept right
   * ------------------------------------------------------------------ */

  describe("append mode is a regression case, not a fix case", () => {
    it("matches the old formula on a fresh append into an empty pool", () => {
      const { selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      expect(reported).toBe(36)
      expect(result.entries).toHaveLength(reported)
      expect(result.addedRows).toBe(36)
      expect(result.overwrittenRows).toBe(0)
      // `append` deletes nothing, so this mode's structurally-zero counter is
      // the half of the old `replaced` that never applied here — asserted, not
      // assumed, because conflating the two halves is what produced the 72.
      expect(result.removedExistingRows).toBe(0)
      // Here the sum was always correct, and it is now a stated invariant:
      // `importedRows === addedRows + overwrittenRows`, in both modes.
      expect(result.addedRows + result.overwrittenRows).toBe(reported)
    })

    it("matches it when every selected row overwrites a same-champion, same-role entry", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      expect(stored).toHaveLength(36)

      const { selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
      const result = applyImportRows(stored, selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      // `append` never duplicates a champion in the same role, so all 36 rows
      // land on top of the stored ones: nothing is added, the pool stays 36.
      // They were OVERWRITTEN IN PLACE, not deleted — exactly the distinction
      // the single old `replaced` could not express.
      expect(result.addedRows).toBe(0)
      expect(result.overwrittenRows).toBe(36)
      expect(result.removedExistingRows).toBe(0)
      expect(result.addedRows + result.overwrittenRows).toBe(reported)
      expect(reported).toBe(36)
      expect(result.entries).toHaveLength(reported)
      expect(championsOf(result.entries)).toEqual([...THIRTY_SIX_CHAMPIONS])
      // Overwritten, not merely counted: the numbers are the fresh ones.
      expect(result.entries[0]).toMatchObject({ championName: "Aatrox", games: 40, winrate: 60 })
    })

    it("matches it on a partial overlap — 10 fresh rows onto 36 stored ones", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      const { selected } = parseAndPreselect(FRESH_10_TABLE, "mid")
      const result = applyImportRows(stored, selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      expect(reported).toBe(10)
      expect(result.addedRows).toBe(0)
      expect(result.overwrittenRows).toBe(10)
      expect(result.removedExistingRows).toBe(0)
      expect(result.addedRows + result.overwrittenRows).toBe(reported)
      // The pool did not grow — 10 of its 36 rows were refreshed.
      expect(result.entries).toHaveLength(36)
      expect(result.entries[0]).toMatchObject({ championName: "Aatrox", games: 40, winrate: 60 })
      expect(result.entries[10]).toMatchObject({ championName: "Blitzcrank", games: 20, winrate: 50 })
    })
  })

  /* ------------------------------------------------------------------
   * 12.3 A ticked row the apply refuses — counted on neither side
   * ------------------------------------------------------------------ */

  describe("a selected row without games is not counted and not stored", () => {
    it("reports 3 of 4 ticked rows in append mode, and stores 3", () => {
      const { parsed, selected } = parseAndSelectAll(TABLE_WITH_ONE_UNAPPLICABLE, "mid")

      expect(parsed.rows).toHaveLength(4)
      expect(selected).toHaveLength(4)
      // The row that cannot be stored: a winrate, no games, and nothing invented.
      const zed = parsed.rows[1]
      expect(zed.championName).toBe("Zed")
      expect(zed.games).toBeNull()
      expect(zed.winrate).toBe(61)
      expect(codesOf(zed.warnings)).toContain("missing_games")

      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      expect(result.skippedRows).toBe(1)
      expect(reported).toBe(3)
      expect(result.entries).toHaveLength(reported)
      expect(championsOf(result.entries)).toEqual(["Ahri", "Lux", "Milio"])
      // And the number is not the tick count either — 4 would be just as wrong
      // in the other direction.
      expect(reported).not.toBe(selected.length)
    })

    it("reports 3 of 4 ticked rows in replace mode over a stored pool, and stores 3", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      const { selected } = parseAndSelectAll(TABLE_WITH_ONE_UNAPPLICABLE, "mid")

      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      expect(result.skippedRows).toBe(1)
      expect(reported).toBe(3)
      expect(result.entries).toHaveLength(reported)
      expect(entriesOfRole(result.entries, "mid")).toHaveLength(3)
      expect(championsOf(result.entries)).toEqual(["Ahri", "Lux", "Milio"])
      expect(result.overwrittenRows).toBe(0)
      // The 72-case once more, now with a skip in it: the historical formula
      // was 3 imported + 36 DELETED = 39. Frozen, and never reportable.
      expect(result.addedRows).toBe(3)
      expect(result.removedExistingRows).toBe(36)
      expect(result.addedRows + result.removedExistingRows).toBe(39)
      expect(result.addedRows + result.removedExistingRows).not.toBe(reported)
    })
  })

  /* ------------------------------------------------------------------
   * 12.4 A GAMES total can never surface as the reported count
   *
   * The user's own first guess was that the "72" came from Ahri's 36 wins plus
   * 36 losses. It did not — it came from `added + replaced` — but the guess is
   * plausible enough that somebody will make it again, so it is written down
   * here as a test instead of as a sentence in a change log.
   * ------------------------------------------------------------------ */

  describe("a games total is never mistaken for a row count", () => {
    it("reports 1 for one selected row whose champion has 72 games", () => {
      const parsed = parseScoutStats(OPGG_RAW_COPY, { role: "mid" })
      const selected = selectedImportRows(parsed.rows, new Set([parsed.rows[0].id]))

      expect(selected).toHaveLength(1)
      expect(selected[0]).toMatchObject({
        championName: "Ahri",
        wins: 36,
        losses: 36,
        games: 72,
      })

      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      expect(reported).toBe(1)
      expect(reported).not.toBe(72)
      expect(result.entries).toHaveLength(reported)
      // The 72 is still there — where it belongs, on the entry.
      expect(result.entries[0]).toEqual(EXPECTED_MID_ENTRIES[0])
      expect(result.entries[0].games).toBe(72)
    })

    it("reports 3 for the whole raw copy, whose champions total 142 games", () => {
      const { parsed, selected } = parseAndPreselect(OPGG_RAW_COPY, "mid")
      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      // Three rows carrying 72, 38 and 32 games — none of those numbers, and
      // not their sum, may reach the count.
      expect(parsed.rows.map((row) => row.games)).toEqual([72, 38, 32])
      expect(reported).toBe(3)
      expect(result.entries).toHaveLength(reported)
      expect(result.entries).toEqual(EXPECTED_MID_ENTRIES)
      // `importedRows` counts ROWS and nothing else, so no sum of games can
      // reach it — stated as an assertion rather than as a promise.
      expect(result.entries.reduce((total, entry) => total + entry.games, 0)).toBe(142)
      expect(reported).not.toBe(142)
    })
  })

  /* ------------------------------------------------------------------
   * 12.5 `replace` is role-scoped, and so is the number
   * ------------------------------------------------------------------ */

  describe("replacing one role leaves the other roles and the count alone", () => {
    it("drops only the mid rows and reports only the mid rows that came in", () => {
      const withMid = importInto([], championTable(THIRTY_SIX_CHAMPIONS.slice(0, 6), (index) => 10 + index, () => 50), "mid")
      const stored = importInto(withMid, SUPPORT_TABLE_3, "support")

      expect(stored).toHaveLength(9)
      const storedSupport = entriesOfRole(stored, "support")
      expect(championsOf(storedSupport)).toEqual(["Thresh", "Leona", "Rakan"])

      const { selected } = parseAndPreselect(FRESH_10_TABLE, "mid")
      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      // The reported number is about the mid import and nothing else.
      expect(reported).toBe(10)
      expect(entriesOfRole(result.entries, "mid")).toHaveLength(reported)
      // The support rows survive untouched, byte for byte and in order.
      expect(entriesOfRole(result.entries, "support")).toEqual(storedSupport)
      expect(result.entries).toHaveLength(13)
      expect(result.overwrittenRows).toBe(0)
      // `removedExistingRows` counted the six deleted MID rows — never the
      // support ones. Same tripwire as the 72, at a smaller size: 10 + 6 = 16
      // is a number the user must never be shown.
      expect(result.removedExistingRows).toBe(6)
      expect(result.addedRows).toBe(10)
      expect(result.addedRows + result.removedExistingRows).toBe(16)
      expect(result.addedRows + result.removedExistingRows).not.toBe(reported)
    })
  })

  /* ------------------------------------------------------------------
   * 12.6 The identity survives persistence
   *
   * A number that matches `result.entries` and then loses rows in
   * `normalizeManualEntry()` would be just as wrong as the original bug — only
   * one page load later, which is worse because nothing points at the import
   * any more.
   * ------------------------------------------------------------------ */

  describe("the reported count still matches after a storage round trip", () => {
    it("keeps all 36 replaced rows through normalizeScoutState", () => {
      const players: ScoutPlayer[] = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const stored = importInto([], STORED_36_TABLE, "mid")

      const { selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      const state = {
        ...createEmptyScoutState(),
        players,
        playerData: dataOf([MID_ID, result.entries]),
        lineup,
      }
      const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

      expect(round.schemaVersion).toBe(2)
      expect(reported).toBe(36)
      expect(round.playerData[MID_ID].entries).toHaveLength(reported)
      expect(round.playerData[MID_ID].entries).toEqual(result.entries)
      expect(entriesOfRole(round.playerData[MID_ID].entries, "mid")).toHaveLength(reported)
      // And once more against the number the old formula would have printed.
      expect(round.playerData[MID_ID].entries).not.toHaveLength(72)
    })

    it("keeps the 3 of 4 that survived the skip, and no more", () => {
      const players: ScoutPlayer[] = parseScoutInput(MID_LINK).players
      const lineup = starter(createEmptyScoutLineup(), "mid", MID_ID)
      const { selected } = parseAndSelectAll(TABLE_WITH_ONE_UNAPPLICABLE, "mid")
      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      const state = {
        ...createEmptyScoutState(),
        players,
        playerData: dataOf([MID_ID, result.entries]),
        lineup,
      }
      const round = normalizeScoutState(JSON.parse(JSON.stringify(state)))

      expect(reported).toBe(3)
      expect(round.playerData[MID_ID].entries).toHaveLength(reported)
      expect(championsOf(round.playerData[MID_ID].entries)).toEqual(["Ahri", "Lux", "Milio"])
      // The refused row did not reappear from storage either.
      expect(championsOf(round.playerData[MID_ID].entries)).not.toContain("Zed")
    })
  })

  /* ------------------------------------------------------------------
   * 12.7 The compact skip summary, inside the same chain
   *
   * The raw copy floods `unparsedLines` with `-`, `vs …` and recommendation
   * entries. `summarizeSkippedLines()` rolls those four categories up into
   * numbers so the handful of lines that genuinely deserve a second look stay
   * readable — and the champions that reach the data are still only the pool.
   * ------------------------------------------------------------------ */

  describe("a noisy raw copy: counted skips, and only the pool imported", () => {
    it("rolls the dashes, matchups and recommendations up into four numbers", () => {
      const parsed = parseScoutStats(OPGG_RAW_COPY_WITH_DASHES, { role: "mid" })

      expect(parsed.layout).toBe("opgg_raw_champion_page")
      expect(parsed.detectedSource).toBe("opgg")
      // Every skipped line has a reason the parser recognised POSITIVELY, so
      // `row_not_parsed` must not fire on an ordinary paste like this one.
      expect(parsed.warnings).toEqual([])

      const summary = summarizeSkippedLines(parsed)

      expect(parsed.unparsedLines).toHaveLength(8)
      expect(summary.hasSkipped).toBe(true)
      expect(summary.recommendedChampions).toBe(2)
      expect(summary.aggregateRows).toBe(1)
      expect(summary.pageNoise).toBe(3)
      expect(summary.matchupRows).toBe(2)
      // 8 skipped lines, 0 of them worth printing verbatim: every one of them
      // is a category the parser named, so the block above the preview is four
      // numbers instead of eight lines of `-` and `vs …`.
      expect(summary.listed).toEqual([])
      expect(summary.listed).toHaveLength(0)
      expect(
        summary.aggregateRows +
          summary.matchupRows +
          summary.recommendedChampions +
          summary.pageNoise +
          summary.listed.length,
      ).toBe(parsed.unparsedLines.length)
    })

    it("imports exactly the three pool champions — no recommendation, no opponent", () => {
      const { parsed, selected } = parseAndPreselect(OPGG_RAW_COPY_WITH_DASHES, "mid")

      expect(championsOf(parsed.rows)).toEqual(["Ahri", "Lux", "Milio"])
      expect(selected).toHaveLength(3)

      const result = applyImportRows([], selected, applyOptions("mid", "append"))
      const reported = result.importedRows

      expect(reported).toBe(3)
      expect(result.entries).toHaveLength(reported)
      // Identical to the clean copy: the noise changed nothing about the data.
      expect(result.entries).toEqual(EXPECTED_MID_ENTRIES)

      const imported = championsOf(result.entries)
      for (const name of SKIPPED_NAMES) expect(imported).not.toContain(name)
      // Named explicitly as well, so a future change cannot quietly empty
      // `SKIPPED_NAMES` and keep this test green.
      expect(imported).not.toContain("Sett")
      expect(imported).not.toContain("Gwen")
      expect(imported).not.toContain("Zed")
      expect(imported).not.toContain("Syndra")
    })

    it("still reports 3 when the noisy copy replaces a stored 36-row pool", () => {
      const stored = importInto([], STORED_36_TABLE, "mid")
      const { selected } = parseAndPreselect(OPGG_RAW_COPY_WITH_DASHES, "mid")

      const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))
      const reported = result.importedRows

      expect(reported).toBe(3)
      expect(result.entries).toHaveLength(reported)
      expect(result.entries).toEqual(EXPECTED_MID_ENTRIES)
      expect(result.overwrittenRows).toBe(0)
      // 3 imported + 36 DELETED = 39 — the shape of the original bug, on a
      // three-row paste. Frozen, and never reportable.
      expect(result.addedRows + result.removedExistingRows).toBe(39)
      expect(result.addedRows + result.removedExistingRows).not.toBe(reported)
    })
  })

  /* ------------------------------------------------------------------
   * 12.8 Counting rows touched no network
   * ------------------------------------------------------------------ */

  it("never fetches anything while counting or applying", () => {
    const stored = importInto([], STORED_36_TABLE, "mid")
    const { selected } = parseAndPreselect(FRESH_36_TABLE, "mid")
    const result = applyImportRows(stored, selected, applyOptions("mid", "replace"))

    expect(result.importedRows).toBe(36)
    expect(summarizeSkippedLines(parseScoutStats(OPGG_RAW_COPY_WITH_DASHES, { role: "mid" }))
      .pageNoise).toBe(3)
    expect(fetchSpy.mock.calls).toEqual([])
  })
})
