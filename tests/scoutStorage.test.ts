import { beforeEach, describe, expect, it } from "vitest"

import {
  SCOUT_STORAGE_KEY,
  clearScoutState,
  createEmptyScoutLineup,
  createEmptyScoutState,
  loadScoutState,
  normalizeScoutState,
  saveScoutState,
} from "../src/scout/storage"
import {
  SCOUT_LINEUP_SLOTS,
  SCOUT_REMOVED_PLAYERS_MAX,
  SCOUT_SCHEMA_VERSION,
  SCOUT_SUBSTITUTE_SLOTS,
} from "../src/scout/types"
import type {
  ManualChampionEntry,
  ScoutLineup,
  ScoutPlayer,
  ScoutRemovedPlayer,
  ScoutState,
  ScoutStateV1,
} from "../src/scout/types"
import { withKdaValue } from "../src/components/scout/ScoutDataEditor"
import { parseKdaInput } from "../src/components/scout/scoutUiHelpers"

/* ==========================================================================
 * localStorage mock
 *
 * Vitest runs in `environment: 'node'` (see vite.config.ts) - there is no jsdom
 * and no real Web Storage. tests/championNotes.test.ts already establishes the
 * pattern of defining `globalThis.localStorage` by hand; this file extends it
 * with a failure mode, because src/scout/storage.ts explicitly promises to
 * survive a storage that throws.
 *
 * The property is defined as a *getter* on purpose: in a private-mode or
 * blocked-cookies browser, merely touching the `localStorage` global throws a
 * SecurityError. Only a getter can reproduce that; a plain value could not.
 * ========================================================================== */

type StorageMode = "ok" | "throwOnAccess" | "throwOnCall"

let store: Record<string, string> = {}
let mode: StorageMode = "ok"

const storageMock = {
  getItem: (key: string): string | null => {
    if (mode === "throwOnCall") throw new Error("SecurityError: getItem blocked")
    return store[key] ?? null
  },
  setItem: (key: string, value: string): void => {
    if (mode === "throwOnCall") throw new Error("QuotaExceededError: storage is full")
    store[key] = value
  },
  removeItem: (key: string): void => {
    if (mode === "throwOnCall") throw new Error("SecurityError: removeItem blocked")
    delete store[key]
  },
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  get: () => {
    if (mode === "throwOnAccess") throw new Error("SecurityError: storage is disabled")
    return storageMock
  },
})

/** Put a raw string under the scout key, exactly as a corrupt browser would. */
function seedRaw(raw: string): void {
  store[SCOUT_STORAGE_KEY] = raw
}

/** Put a JSON-serialisable value under the scout key. */
function seedJson(value: unknown): void {
  seedRaw(JSON.stringify(value))
}

beforeEach(() => {
  store = {}
  mode = "ok"
})

/* ==========================================================================
 * Fixtures
 *
 * The empty lineup is written out as a LITERAL here on purpose, even though
 * src/scout/storage.ts derives it from SCOUT_LINEUP_SLOTS / SCOUT_SUBSTITUTE_
 * SLOTS. The test states the contract ("these eight keys, all null"); deriving
 * it here too would make the assertion agree with the implementation by
 * construction and stop catching a dropped slot.
 * ========================================================================== */

function emptyLineup(): ScoutLineup {
  return {
    starters: { top: null, jungle: null, mid: null, bot: null, support: null },
    substitutes: { sub1: null, sub2: null, sub3: null },
  }
}

const EMPTY_STATE: ScoutState = {
  schemaVersion: 2,
  players: [],
  playerData: {},
  lineup: emptyLineup(),
  includeSubstitutes: false,
  removedPlayers: {},
}

const playerAgurin: ScoutPlayer = {
  id: "euw:agurin#euw",
  riotName: "Agurin",
  tagline: "EUW",
  region: "EUW",
  displayName: "Agurin#EUW",
  role: "jungle",
  sources: [
    {
      kind: "opgg",
      url: "https://www.op.gg/summoners/euw/Agurin-EUW",
      status: "parsed_from_url",
      noteCode: "identity_from_url",
    },
  ],
}

const playerCaps: ScoutPlayer = {
  id: "euw:caps#g2",
  riotName: "Caps",
  tagline: "G2",
  region: "EUW",
  displayName: "Caps#G2",
  role: "mid",
  sources: [],
}

const playerRekkles: ScoutPlayer = {
  id: "euw:rekkles#rkl",
  riotName: "Rekkles",
  tagline: "RKL",
  region: "EUW",
  displayName: "Rekkles#RKL",
  role: "bot",
  sources: [],
}

const entryLeeSin: ManualChampionEntry = {
  championName: "LeeSin",
  games: 42,
  winrate: 61.5,
  note: "first pick every time",
  source: "opgg",
  recency: "current",
  role: "jungle",
}

/** A minimal, valid archive entry for a player who is not in `players`. */
function removedPlayerFixture(
  player: ScoutPlayer,
  removedAtIso?: string,
): ScoutRemovedPlayer {
  const removed: ScoutRemovedPlayer = {
    player,
    data: { playerId: player.id, entries: [entryLeeSin] },
  }
  if (removedAtIso !== undefined) removed.removedAtIso = removedAtIso
  return removed
}

/* ==========================================================================
 * 1-6. Broken containers and schema version
 * ========================================================================== */

describe("loadScoutState - empty and unreadable storage", () => {
  it("returns a well-formed empty state when nothing is stored", () => {
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("returns an empty state when the stored value is an empty string", () => {
    seedRaw("")
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("returns an empty state on corrupt JSON without throwing", () => {
    seedRaw("{oops")
    expect(() => loadScoutState()).not.toThrow()
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("returns an empty state when the stored JSON is an array", () => {
    seedJson([{ schemaVersion: 2, players: [] }])
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("returns an empty state when the stored JSON is null, a number or a string", () => {
    seedRaw("null")
    expect(loadScoutState()).toEqual(EMPTY_STATE)

    seedRaw("42")
    expect(loadScoutState()).toEqual(EMPTY_STATE)

    seedRaw('"a string"')
    expect(loadScoutState()).toEqual(EMPTY_STATE)

    seedRaw("true")
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("createEmptyScoutState returns a fresh object every call (no shared mutable default)", () => {
    const first = createEmptyScoutState()
    const second = createEmptyScoutState()
    expect(first).toEqual(EMPTY_STATE)
    expect(first).not.toBe(second)
    expect(first.players).not.toBe(second.players)
    expect(first.playerData).not.toBe(second.playerData)
    expect(first.lineup).not.toBe(second.lineup)
    expect(first.lineup.starters).not.toBe(second.lineup.starters)
    expect(first.lineup.substitutes).not.toBe(second.lineup.substitutes)
    expect(first.removedPlayers).not.toBe(second.removedPlayers)
  })

  it("createEmptyScoutState uses the current schema version", () => {
    expect(createEmptyScoutState().schemaVersion).toBe(SCOUT_SCHEMA_VERSION)
    expect(SCOUT_SCHEMA_VERSION).toBe(2)
  })
})

describe("createEmptyScoutLineup", () => {
  it("has exactly the eight canonical slots, all empty", () => {
    const lineup = createEmptyScoutLineup()

    expect(lineup).toEqual(emptyLineup())
    expect(Object.keys(lineup.starters).sort()).toEqual([...SCOUT_LINEUP_SLOTS].sort())
    expect(Object.keys(lineup.substitutes).sort()).toEqual([...SCOUT_SUBSTITUTE_SLOTS].sort())
  })

  it("returns a fresh object every call, so the UI can reset without aliasing", () => {
    const first = createEmptyScoutLineup()
    const second = createEmptyScoutLineup()

    first.starters.mid = playerCaps.id

    expect(second.starters.mid).toBeNull()
    expect(createEmptyScoutState().lineup.starters.mid).toBeNull()
  })
})

describe("normalizeScoutState - non-object input", () => {
  it("maps every non-record input to the empty state", () => {
    for (const raw of [null, undefined, 42, 0, "", "state", true, [], [1, 2], NaN]) {
      expect(normalizeScoutState(raw)).toEqual(EMPTY_STATE)
    }
  })
})

describe("normalizeScoutState - schemaVersion gate", () => {
  const payload = {
    players: [playerAgurin],
    playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries: [entryLeeSin] } },
    rawInput: "Agurin#EUW",
  }

  it("returns the empty state when schemaVersion is missing", () => {
    expect(normalizeScoutState(payload)).toEqual(EMPTY_STATE)
  })

  it("returns the empty state for an unknown HIGHER schemaVersion (no guessing, no migration)", () => {
    const future = normalizeScoutState({ ...payload, schemaVersion: 99 })
    expect(future).toEqual(EMPTY_STATE)
    // The point of the test: nothing at all is carried over from a schema this
    // build does not understand - not even the players that happen to look V2.
    expect(future.players).toEqual([])
    expect(future.rawInput).toBeUndefined()
  })

  it("returns the empty state for a non-numeric or non-integer schemaVersion", () => {
    for (const version of ["1", "2", 1.5, 0, -1, null, true, [2]]) {
      expect(normalizeScoutState({ ...payload, schemaVersion: version })).toEqual(EMPTY_STATE)
    }
  })

  it("accepts exactly schemaVersion 2", () => {
    const state = normalizeScoutState({ ...payload, schemaVersion: 2 })
    expect(state.schemaVersion).toBe(2)
    expect(state.players).toHaveLength(1)
  })

  it("accepts the legacy schemaVersion 1 and migrates it instead of discarding it", () => {
    const state = normalizeScoutState({ ...payload, schemaVersion: 1 })
    expect(state.schemaVersion).toBe(2)
    expect(state.players).toHaveLength(1)
  })

  it("loadScoutState applies the same gate to stored data", () => {
    seedJson({ ...payload, schemaVersion: 3 })
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })
})

/* ==========================================================================
 * 7. V1 -> V2 migration
 * ========================================================================== */

describe("normalizeScoutState - V1 to V2 migration", () => {
  const v1State: ScoutStateV1 = {
    schemaVersion: 1,
    players: [playerAgurin, playerCaps],
    playerData: {
      [playerAgurin.id]: {
        playerId: playerAgurin.id,
        entries: [entryLeeSin],
        note: "always jungle",
        updatedAtIso: "2026-01-01T00:00:00.000Z",
      },
    },
    rawInput: "Agurin#EUW\nCaps#G2",
  }

  it("carries players, playerData and rawInput over unchanged", () => {
    const state = normalizeScoutState(v1State)

    expect(state.players).toEqual([playerAgurin, playerCaps])
    expect(state.playerData).toEqual(v1State.playerData)
    expect(state.rawInput).toBe("Agurin#EUW\nCaps#G2")
  })

  it("default-initialises everything V2 added", () => {
    const state = normalizeScoutState(v1State)

    expect(state.schemaVersion).toBe(2)
    expect(state.lineup).toEqual(emptyLineup())
    expect(state.includeSubstitutes).toBe(false)
    expect(state.removedPlayers).toEqual({})
  })

  it("does NOT pre-fill the lineup from the detected player roles", () => {
    // playerAgurin.role === "jungle" and playerCaps.role === "mid" - a guess read
    // out of a URL. Promoting it into the lineup would present it as the user's
    // own decision.
    const state = normalizeScoutState(v1State)

    expect(state.lineup.starters.jungle).toBeNull()
    expect(state.lineup.starters.mid).toBeNull()
  })

  it("never invents an updatedAtIso, and keeps a real one", () => {
    expect(normalizeScoutState(v1State).updatedAtIso).toBeUndefined()

    const stamped = normalizeScoutState({ ...v1State, updatedAtIso: "2026-02-02T10:00:00.000Z" })
    expect(stamped.updatedAtIso).toBe("2026-02-02T10:00:00.000Z")

    const blank = normalizeScoutState({ ...v1State, updatedAtIso: "   " })
    expect(blank.updatedAtIso).toBeUndefined()
  })

  it("applies the same validation as the V2 reader to the carried-over data", () => {
    const state = normalizeScoutState({
      schemaVersion: 1,
      players: [playerAgurin, null, { id: "  ", riotName: "Blank" }],
      playerData: {
        [playerAgurin.id]: {
          playerId: playerAgurin.id,
          entries: [entryLeeSin, { championName: "Ghost", games: -1, winrate: 500 }],
        },
        "euw:orphan#euw": { playerId: "euw:orphan#euw", entries: [entryLeeSin] },
      },
    })

    expect(state.players).toEqual([playerAgurin])
    expect(Object.keys(state.playerData)).toEqual([playerAgurin.id])
    expect(state.playerData[playerAgurin.id].entries).toEqual([entryLeeSin])
  })

  it("ignores V2-shaped fields that a V1 blob has no business carrying", () => {
    // schemaVersion is the contract, not the field list: a blob claiming V1 is
    // read with V1 rules, so its "lineup" is not interpreted.
    const state = normalizeScoutState({
      ...v1State,
      lineup: {
        starters: { jungle: playerAgurin.id, top: null, mid: null, bot: null, support: null },
        substitutes: { sub1: null, sub2: null, sub3: null },
      },
      includeSubstitutes: true,
      removedPlayers: { [playerRekkles.id]: removedPlayerFixture(playerRekkles) },
    })

    expect(state.lineup).toEqual(emptyLineup())
    expect(state.includeSubstitutes).toBe(false)
    expect(state.removedPlayers).toEqual({})
  })

  it("migrates a V1 blob that is actually sitting in localStorage", () => {
    seedJson(v1State)
    const loaded = loadScoutState()

    expect(loaded.schemaVersion).toBe(2)
    expect(loaded.players).toEqual([playerAgurin, playerCaps])
    expect(loaded.playerData[playerAgurin.id].entries).toEqual([entryLeeSin])
    expect(loaded.lineup).toEqual(emptyLineup())
  })

  it("does not write the migration back to storage on its own", () => {
    seedJson(v1State)
    loadScoutState()

    // Reading is not saving: the V1 blob is still there until the caller saves.
    expect(JSON.parse(store[SCOUT_STORAGE_KEY]).schemaVersion).toBe(1)
  })

  it("stores V2 once the migrated state is saved, and never V1 again", () => {
    seedJson(v1State)
    saveScoutState(loadScoutState())

    expect(JSON.parse(store[SCOUT_STORAGE_KEY]).schemaVersion).toBe(2)
    expect(loadScoutState().players).toEqual([playerAgurin, playerCaps])
  })
})

/* ==========================================================================
 * 8-9. players
 * ========================================================================== */

describe("normalizeScoutState - players", () => {
  it("treats a non-array players field as 'no players' instead of discarding everything", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: "Agurin#EUW",
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries: [entryLeeSin] } },
      rawInput: "Agurin#EUW",
    })

    expect(state.players).toEqual([])
    // No players means every playerData key is orphaned -> dropped.
    expect(state.playerData).toEqual({})
    // The user's pasted text is a plain string and survives on its own.
    expect(state.rawInput).toBe("Agurin#EUW")
  })

  it("is the plain empty state when players is broken and nothing else is stored", () => {
    expect(normalizeScoutState({ schemaVersion: 2, players: 5, playerData: 7 })).toEqual(EMPTY_STATE)
  })

  it("skips broken player objects and keeps the good ones in order", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [
        null,
        "Agurin#EUW",
        42,
        [],
        playerAgurin,
        { riotName: "NoId", tagline: "EUW", region: "EUW" },
        { id: "euw:noname#euw", tagline: "EUW", region: "EUW" },
        { id: "   ", riotName: "Blank", tagline: "", region: "EUW" },
        playerCaps,
      ],
      playerData: {},
    })

    expect(state.players.map((player) => player.id)).toEqual([playerAgurin.id, playerCaps.id])
  })

  it("drops duplicate player ids, keeping the first occurrence", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin, { ...playerAgurin, displayName: "Impostor#EUW" }],
      playerData: {},
    })

    expect(state.players).toHaveLength(1)
    expect(state.players[0].displayName).toBe("Agurin#EUW")
  })

  it("fills cosmetic player fields default-safe and never invents an identity", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [
        { id: "euw:nemesis#euw", riotName: "  Nemesis  ", tagline: " EUW ", role: "captain" },
        { id: "unknown:solo#", riotName: "Solo" },
      ],
      playerData: {},
    })

    expect(state.players[0]).toEqual({
      id: "euw:nemesis#euw",
      riotName: "Nemesis",
      tagline: "EUW",
      region: "UNKNOWN",
      displayName: "Nemesis#EUW",
      role: "unknown",
      sources: [],
    })
    expect(state.players[1].displayName).toBe("Solo")
    expect(state.players[1].tagline).toBe("")
  })

  it("keeps an unrecognised region verbatim instead of flattening it to UNKNOWN", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [{ id: "x:y#z", riotName: "Y", tagline: "Z", region: "PBE" }],
      playerData: {},
    })

    expect(state.players[0].region).toBe("PBE")
  })

  it("drops invalid source refs, dedupes by kind and keeps valid optional fields", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [
        {
          ...playerAgurin,
          sources: [
            null,
            { kind: "twitch", url: "https://twitch.tv/x", status: "parsed_from_url" },
            { kind: "opgg", url: "", status: "parsed_from_url" },
            { kind: "opgg", url: "https://op.gg/a", status: "made_up_status" },
            { kind: "opgg", url: "https://op.gg/a", status: "parsed_from_url", noteCode: "nope" },
            { kind: "opgg", url: "https://op.gg/second", status: "source_link_only" },
            {
              kind: "deeplol",
              url: "https://deeplol.gg/a",
              status: "source_link_only",
              note: "dev only",
              noteCode: "profile_link_generated",
            },
          ],
        },
      ],
      playerData: {},
    })

    expect(state.players[0].sources).toEqual([
      { kind: "opgg", url: "https://op.gg/a", status: "parsed_from_url" },
      {
        kind: "deeplol",
        url: "https://deeplol.gg/a",
        status: "source_link_only",
        note: "dev only",
        noteCode: "profile_link_generated",
      },
    ])
  })
})

/* ==========================================================================
 * 10. ManualChampionEntry
 * ========================================================================== */

describe("normalizeScoutState - manual champion entries", () => {
  function entriesOf(rawEntries: unknown): ManualChampionEntry[] {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries: rawEntries } },
    })
    return state.playerData[playerAgurin.id]?.entries ?? []
  }

  it("reads a numeric string sample size ('12' -> 12)", () => {
    const entries = entriesOf([{ ...entryLeeSin, games: "12", winrate: "55.5" }])
    expect(entries).toHaveLength(1)
    expect(entries[0].games).toBe(12)
    expect(entries[0].winrate).toBe(55.5)
  })

  it("floors a fractional sample size", () => {
    expect(entriesOf([{ ...entryLeeSin, games: 12.7 }])[0].games).toBe(12)
  })

  it("keeps the boundary values 0 games and 0 % / 100 % winrate", () => {
    const entries = entriesOf([
      { ...entryLeeSin, championName: "Zero", games: 0, winrate: 0 },
      { ...entryLeeSin, championName: "Perfect", games: 3, winrate: 100 },
    ])
    expect(entries.map((entry) => entry.championName)).toEqual(["Zero", "Perfect"])
  })

  it("drops rows with an unusable winrate instead of clamping them", () => {
    const broken = [
      { ...entryLeeSin, championName: "NullWr", winrate: null },
      { ...entryLeeSin, championName: "NaNWr", winrate: Number.NaN },
      { ...entryLeeSin, championName: "NegWr", winrate: -5 },
      { ...entryLeeSin, championName: "TooHigh", winrate: 105 },
      { ...entryLeeSin, championName: "TextWr", winrate: "sixty" },
      { ...entryLeeSin, championName: "InfWr", winrate: Number.POSITIVE_INFINITY },
      { ...entryLeeSin, championName: "MissingWr", winrate: undefined },
    ]
    expect(entriesOf(broken)).toEqual([])
  })

  it("drops rows with an unusable sample size instead of faking a 0", () => {
    const broken = [
      { ...entryLeeSin, championName: "NullGames", games: null },
      { ...entryLeeSin, championName: "NaNGames", games: Number.NaN },
      { ...entryLeeSin, championName: "NegGames", games: -3 },
      { ...entryLeeSin, championName: "TextGames", games: "many" },
      { ...entryLeeSin, championName: "BoolGames", games: true },
      { ...entryLeeSin, championName: "MissingGames", games: undefined },
    ]
    expect(entriesOf(broken)).toEqual([])
  })

  it("drops rows without a champion name and rows that are not objects", () => {
    expect(
      entriesOf([null, 7, "LeeSin", [], { ...entryLeeSin, championName: "   " }, { games: 3, winrate: 50 }]),
    ).toEqual([])
  })

  it("keeps the good rows of a partly broken list, in order", () => {
    const entries = entriesOf([
      { ...entryLeeSin, championName: "Broken", winrate: 150 },
      entryLeeSin,
      null,
      { ...entryLeeSin, championName: "Viego", games: "7", winrate: 71 },
    ])
    expect(entries.map((entry) => entry.championName)).toEqual(["LeeSin", "Viego"])
  })

  it("fills the non-numeric fields default-safe (unknown source -> other, unknown recency -> old)", () => {
    const entries = entriesOf([
      {
        championName: "Nidalee",
        games: 5,
        winrate: 40,
        source: "some-random-site",
        recency: "yesterday",
        role: "adc-ish",
        id: 17,
      },
    ])

    expect(entries[0]).toEqual({
      championName: "Nidalee",
      games: 5,
      winrate: 40,
      note: "",
      source: "other",
      recency: "old",
      role: "unknown",
    })
    expect(entries[0].id).toBeUndefined()
  })

  it("keeps a note verbatim, including surrounding whitespace", () => {
    expect(entriesOf([{ ...entryLeeSin, note: "  smurfs on this  " }])[0].note).toBe(
      "  smurfs on this  ",
    )
  })

  it("keeps a non-empty entry id", () => {
    expect(entriesOf([{ ...entryLeeSin, id: "row-1" }])[0].id).toBe("row-1")
  })

  it("treats a non-array entries field as no entries", () => {
    expect(entriesOf("LeeSin 42 61%")).toEqual([])
    expect(entriesOf(undefined)).toEqual([])
    expect(entriesOf({ 0: entryLeeSin })).toEqual([])
  })
})

/* ==========================================================================
 * 11. playerData map
 * ========================================================================== */

describe("normalizeScoutState - playerData map", () => {
  it("drops keys that belong to no known player", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: {
        [playerAgurin.id]: { playerId: playerAgurin.id, entries: [entryLeeSin] },
        "euw:ghost#euw": { playerId: "euw:ghost#euw", entries: [entryLeeSin] },
      },
    })

    expect(Object.keys(state.playerData)).toEqual([playerAgurin.id])
  })

  it("drops values that are not objects", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin, playerCaps],
      playerData: {
        [playerAgurin.id]: "entries",
        [playerCaps.id]: { playerId: playerCaps.id, entries: [] },
      },
    })

    expect(Object.keys(state.playerData)).toEqual([playerCaps.id])
  })

  it("treats a non-object playerData as an empty map", () => {
    for (const playerData of [null, [], "x", 3, undefined]) {
      const state = normalizeScoutState({ schemaVersion: 2, players: [playerAgurin], playerData })
      expect(state.playerData).toEqual({})
    }
  })

  it("rewrites a playerId field that disagrees with its key (the key is authoritative)", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: "euw:someone-else#euw", entries: [] } },
    })

    expect(state.playerData[playerAgurin.id].playerId).toBe(playerAgurin.id)
  })

  it("keeps an optional note and updatedAtIso, and omits them when unusable", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin, playerCaps],
      playerData: {
        [playerAgurin.id]: {
          playerId: playerAgurin.id,
          entries: [],
          note: "hard flex",
          updatedAtIso: "2026-01-01T00:00:00.000Z",
        },
        [playerCaps.id]: { playerId: playerCaps.id, entries: [], note: 5, updatedAtIso: "   " },
      },
    })

    expect(state.playerData[playerAgurin.id].note).toBe("hard flex")
    expect(state.playerData[playerAgurin.id].updatedAtIso).toBe("2026-01-01T00:00:00.000Z")
    expect(state.playerData[playerCaps.id].note).toBeUndefined()
    expect(state.playerData[playerCaps.id].updatedAtIso).toBeUndefined()
  })

  it("never lets a __proto__ key touch the prototype chain", () => {
    const state = normalizeScoutState(
      JSON.parse(
        '{"schemaVersion":2,"players":[{"id":"__proto__","riotName":"Evil","tagline":"X","region":"EUW","displayName":"Evil#X","role":"top","sources":[]}],"playerData":{"__proto__":{"playerId":"__proto__","entries":[],"polluted":true}}}',
      ) as unknown,
    )

    expect(state.players).toEqual([])
    expect(state.playerData).toEqual({})
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

/* ==========================================================================
 * 12. lineup
 * ========================================================================== */

describe("normalizeScoutState - lineup", () => {
  function lineupOf(rawLineup: unknown, players: unknown = [playerAgurin, playerCaps]): ScoutLineup {
    return normalizeScoutState({
      schemaVersion: 2,
      players,
      playerData: {},
      lineup: rawLineup,
    }).lineup
  }

  it("keeps valid assignments in both halves", () => {
    const lineup = lineupOf({
      starters: { jungle: playerAgurin.id, mid: playerCaps.id },
      substitutes: { sub2: playerRekkles.id },
    }, [playerAgurin, playerCaps, playerRekkles])

    expect(lineup.starters.jungle).toBe(playerAgurin.id)
    expect(lineup.starters.mid).toBe(playerCaps.id)
    expect(lineup.starters.top).toBeNull()
    expect(lineup.substitutes.sub2).toBe(playerRekkles.id)
    expect(lineup.substitutes.sub1).toBeNull()
  })

  it("returns the empty lineup when the field is missing or not an object", () => {
    for (const raw of [undefined, null, "top", 5, true, [], [{ top: playerAgurin.id }]]) {
      expect(lineupOf(raw)).toEqual(emptyLineup())
    }
  })

  it("returns the empty lineup when starters/substitutes are not objects", () => {
    expect(lineupOf({ starters: [playerAgurin.id], substitutes: "sub1" })).toEqual(emptyLineup())
  })

  it("still reads the half that is intact when the other half is broken", () => {
    const lineup = lineupOf({ starters: 42, substitutes: { sub1: playerCaps.id } })

    expect(lineup.starters).toEqual(emptyLineup().starters)
    expect(lineup.substitutes.sub1).toBe(playerCaps.id)
  })

  it("ignores unknown slot keys, including 'adc' and a fourth substitute", () => {
    const lineup = lineupOf({
      starters: { adc: playerCaps.id, botlane: playerCaps.id, "": playerCaps.id },
      substitutes: { sub4: playerAgurin.id },
    })

    expect(lineup).toEqual(emptyLineup())
    expect("adc" in lineup.starters).toBe(false)
    expect("sub4" in lineup.substitutes).toBe(false)
  })

  it("empties a slot whose id belongs to no known player", () => {
    const lineup = lineupOf({
      starters: { jungle: "euw:ghost#euw", mid: playerCaps.id },
      substitutes: { sub1: "euw:ghost#euw" },
    })

    expect(lineup.starters.jungle).toBeNull()
    expect(lineup.starters.mid).toBe(playerCaps.id)
    expect(lineup.substitutes.sub1).toBeNull()
  })

  it("empties a slot whose value is not a usable id", () => {
    const lineup = lineupOf({
      starters: { top: null, jungle: 42, mid: "", bot: "   ", support: true },
      substitutes: { sub1: {} },
    })

    expect(lineup).toEqual(emptyLineup())
  })

  it("enforces the duplicate invariant: the first hit in CANONICAL slot order wins", () => {
    // "mid" comes first in key order, "top" first in canonical order.
    const lineup = lineupOf({
      starters: { mid: playerAgurin.id, top: playerAgurin.id, support: playerAgurin.id },
      substitutes: {},
    })

    expect(lineup.starters.top).toBe(playerAgurin.id)
    expect(lineup.starters.mid).toBeNull()
    expect(lineup.starters.support).toBeNull()
  })

  it("lets a starter beat a substitute entry for the same player", () => {
    const lineup = lineupOf({
      starters: { support: playerCaps.id },
      substitutes: { sub1: playerCaps.id },
    })

    expect(lineup.starters.support).toBe(playerCaps.id)
    expect(lineup.substitutes.sub1).toBeNull()
  })

  it("keeps the first substitute slot when a player sits on the bench twice", () => {
    const lineup = lineupOf({
      starters: {},
      substitutes: { sub3: playerCaps.id, sub2: playerCaps.id },
    })

    expect(lineup.substitutes.sub2).toBe(playerCaps.id)
    expect(lineup.substitutes.sub3).toBeNull()
  })

  it("never lets a __proto__ slot key touch the prototype chain", () => {
    const lineup = normalizeScoutState(
      JSON.parse(
        '{"schemaVersion":2,"players":[],"playerData":{},"lineup":{"starters":{"__proto__":{"polluted":true}},"substitutes":{"constructor":"x"}}}',
      ) as unknown,
    ).lineup

    expect(lineup).toEqual(emptyLineup())
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

/* ==========================================================================
 * 13. includeSubstitutes
 * ========================================================================== */

describe("normalizeScoutState - includeSubstitutes", () => {
  function includeSubstitutesOf(raw: unknown): boolean {
    return normalizeScoutState({
      schemaVersion: 2,
      players: [],
      playerData: {},
      includeSubstitutes: raw,
    }).includeSubstitutes
  }

  it("keeps a real boolean in both directions", () => {
    expect(includeSubstitutesOf(true)).toBe(true)
    expect(includeSubstitutesOf(false)).toBe(false)
  })

  it("falls back to false for a string, a number, null or a missing field", () => {
    for (const raw of ["true", "false", "1", 1, 0, null, undefined, [], {}]) {
      expect(includeSubstitutesOf(raw)).toBe(false)
    }
    expect(normalizeScoutState({ schemaVersion: 2, players: [], playerData: {} }).includeSubstitutes)
      .toBe(false)
  })
})

/* ==========================================================================
 * 14. removedPlayers
 * ========================================================================== */

describe("normalizeScoutState - removedPlayers", () => {
  function archiveOf(
    rawRemoved: unknown,
    players: unknown = [],
    playerData: unknown = {},
  ): Record<string, ScoutRemovedPlayer> {
    return normalizeScoutState({
      schemaVersion: 2,
      players,
      playerData,
      removedPlayers: rawRemoved,
    }).removedPlayers
  }

  it("keeps a valid archive entry for a player who is no longer in players", () => {
    const removed = removedPlayerFixture(playerRekkles, "2026-03-03T12:00:00.000Z")
    const archive = archiveOf({ [playerRekkles.id]: removed })

    expect(archive).toEqual({ [playerRekkles.id]: removed })
    // The whole point of the archive: this data is unreachable via playerData
    // (orphan rule) and would be gone without it.
    expect(archive[playerRekkles.id].data.entries).toEqual([entryLeeSin])
  })

  it("treats a non-object removedPlayers as an empty archive", () => {
    for (const raw of [undefined, null, [], "x", 7, true]) {
      expect(archiveOf(raw)).toEqual({})
    }
  })

  it("drops an entry whose key does not match player.id", () => {
    const archive = archiveOf({
      "euw:someone-else#euw": removedPlayerFixture(playerRekkles),
      [playerCaps.id]: removedPlayerFixture(playerCaps),
    })

    expect(Object.keys(archive)).toEqual([playerCaps.id])
  })

  it("drops an entry whose id is also live in playerData", () => {
    const archive = archiveOf(
      {
        [playerAgurin.id]: removedPlayerFixture(playerAgurin),
        [playerRekkles.id]: removedPlayerFixture(playerRekkles),
      },
      [playerAgurin],
      { [playerAgurin.id]: { playerId: playerAgurin.id, entries: [entryLeeSin] } },
    )

    expect(Object.keys(archive)).toEqual([playerRekkles.id])
  })

  it("drops entries without a usable player record or data container", () => {
    const archive = archiveOf({
      a: null,
      b: "removed",
      c: { data: { playerId: "c", entries: [] } },
      d: { player: { riotName: "NoId" }, data: { entries: [] } },
      [playerRekkles.id]: { player: playerRekkles },
      [playerCaps.id]: { player: playerCaps, data: "gone" },
    })

    expect(archive).toEqual({})
  })

  it("validates the archived rows exactly like live data, keeping an empty list", () => {
    const archive = archiveOf({
      [playerRekkles.id]: {
        player: playerRekkles,
        data: {
          playerId: "euw:wrong#id",
          entries: [entryLeeSin, { championName: "Ghost", games: -1, winrate: 500 }, null],
          note: "picked up by another team",
        },
      },
      [playerCaps.id]: { player: playerCaps, data: { entries: "nonsense" } },
    })

    expect(archive[playerRekkles.id].data.entries).toEqual([entryLeeSin])
    // The container is authoritative here too.
    expect(archive[playerRekkles.id].data.playerId).toBe(playerRekkles.id)
    expect(archive[playerRekkles.id].data.note).toBe("picked up by another team")
    expect(archive[playerCaps.id].data.entries).toEqual([])
  })

  it("keeps a usable removedAtIso and omits a blank one", () => {
    const archive = archiveOf({
      [playerRekkles.id]: { ...removedPlayerFixture(playerRekkles), removedAtIso: "2026-03-03T12:00:00.000Z" },
      [playerCaps.id]: { ...removedPlayerFixture(playerCaps), removedAtIso: "   " },
    })

    expect(archive[playerRekkles.id].removedAtIso).toBe("2026-03-03T12:00:00.000Z")
    expect(archive[playerCaps.id].removedAtIso).toBeUndefined()
  })

  it("never lets a __proto__ key touch the prototype chain", () => {
    const archive = normalizeScoutState(
      JSON.parse(
        '{"schemaVersion":2,"players":[],"playerData":{},"removedPlayers":{"__proto__":{"player":{"id":"__proto__","riotName":"Evil"},"data":{"entries":[],"polluted":true}}}}',
      ) as unknown,
    ).removedPlayers

    expect(archive).toEqual({})
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("caps the archive at SCOUT_REMOVED_PLAYERS_MAX, dropping the oldest first", () => {
    const total = SCOUT_REMOVED_PLAYERS_MAX + 10
    const raw: Record<string, ScoutRemovedPlayer> = {}
    for (let index = 0; index < total; index += 1) {
      const player: ScoutPlayer = {
        ...playerRekkles,
        id: `euw:sub${index}#euw`,
        riotName: `Sub${index}`,
        displayName: `Sub${index}#RKL`,
      }
      const minute = String(index).padStart(2, "0")
      raw[player.id] = removedPlayerFixture(player, `2026-01-01T00:${minute}:00.000Z`)
    }

    const archive = archiveOf(raw)
    const keys = Object.keys(archive)

    expect(keys).toHaveLength(SCOUT_REMOVED_PLAYERS_MAX)
    // The ten oldest stamps are gone, the newest survive, order stays input order.
    expect(keys[0]).toBe("euw:sub10#euw")
    expect(keys[keys.length - 1]).toBe(`euw:sub${total - 1}#euw`)
    expect(archive["euw:sub0#euw"]).toBeUndefined()
    expect(archive["euw:sub9#euw"]).toBeUndefined()
  })

  it("drops entries without a removedAtIso before stamped ones when capping", () => {
    const raw: Record<string, ScoutRemovedPlayer> = {}
    for (let index = 0; index <= SCOUT_REMOVED_PLAYERS_MAX; index += 1) {
      const player: ScoutPlayer = {
        ...playerRekkles,
        id: `euw:sub${index}#euw`,
        riotName: `Sub${index}`,
        displayName: `Sub${index}#RKL`,
      }
      // Exactly one entry (the very last, newest-looking one) has no stamp.
      const minute = String(index).padStart(2, "0")
      raw[player.id] =
        index === SCOUT_REMOVED_PLAYERS_MAX
          ? removedPlayerFixture(player)
          : removedPlayerFixture(player, `2026-01-01T00:${minute}:00.000Z`)
    }

    const archive = archiveOf(raw)

    expect(Object.keys(archive)).toHaveLength(SCOUT_REMOVED_PLAYERS_MAX)
    expect(archive[`euw:sub${SCOUT_REMOVED_PLAYERS_MAX}#euw`]).toBeUndefined()
    expect(archive["euw:sub0#euw"]).toBeDefined()
  })
})

/* ==========================================================================
 * 15-16. Round trip, rawInput, clear
 * ========================================================================== */

describe("saveScoutState / loadScoutState round trip", () => {
  const state: ScoutState = {
    schemaVersion: 2,
    players: [playerAgurin, playerCaps],
    playerData: {
      [playerAgurin.id]: {
        playerId: playerAgurin.id,
        entries: [entryLeeSin, { ...entryLeeSin, championName: "Viego", games: 7, winrate: 71 }],
        note: "always jungle",
        updatedAtIso: "2026-01-01T00:00:00.000Z",
      },
      [playerCaps.id]: { playerId: playerCaps.id, entries: [] },
    },
    lineup: {
      starters: {
        top: null,
        jungle: playerAgurin.id,
        mid: playerCaps.id,
        bot: null,
        support: null,
      },
      substitutes: { sub1: null, sub2: null, sub3: null },
    },
    includeSubstitutes: true,
    removedPlayers: {
      [playerRekkles.id]: removedPlayerFixture(playerRekkles, "2026-02-02T09:00:00.000Z"),
    },
    rawInput: "https://www.op.gg/multisearch/euw?summoners=Agurin%23EUW,Caps%23G2",
  }

  it("returns semantically the same state", () => {
    saveScoutState(state)
    expect(loadScoutState()).toEqual(state)
  })

  it("is stable across repeated save/load cycles", () => {
    saveScoutState(state)
    const once = loadScoutState()
    saveScoutState(once)
    expect(loadScoutState()).toEqual(once)
  })

  it("writes to the documented storage key", () => {
    saveScoutState(state)
    expect(Object.keys(store)).toEqual([SCOUT_STORAGE_KEY])
  })

  it("does not invent an updatedAtIso timestamp", () => {
    saveScoutState(state)
    expect(loadScoutState().updatedAtIso).toBeUndefined()
  })

  it("stamps updatedAtIso only from the injected clock", () => {
    saveScoutState(state, { nowIso: "2026-08-18T11:00:00.000Z" })
    expect(loadScoutState().updatedAtIso).toBe("2026-08-18T11:00:00.000Z")
  })

  it("ignores a blank injected timestamp", () => {
    saveScoutState(state, { nowIso: "   " })
    expect(loadScoutState().updatedAtIso).toBeUndefined()
  })

  it("normalises on write, so a state built by the UI cannot poison storage", () => {
    const dirty = {
      schemaVersion: 2,
      players: [playerAgurin, null],
      playerData: {
        [playerAgurin.id]: {
          playerId: playerAgurin.id,
          entries: [entryLeeSin, { championName: "Ghost", games: -1, winrate: 500 }],
        },
        "euw:orphan#euw": { playerId: "euw:orphan#euw", entries: [entryLeeSin] },
      },
      lineup: {
        starters: { jungle: playerAgurin.id, mid: "euw:orphan#euw" },
        substitutes: { sub1: playerAgurin.id },
      },
      includeSubstitutes: "yes",
      removedPlayers: { "euw:mismatch#euw": removedPlayerFixture(playerRekkles) },
    } as unknown as ScoutState

    saveScoutState(dirty)
    const loaded = loadScoutState()

    expect(loaded.players).toEqual([playerAgurin])
    expect(Object.keys(loaded.playerData)).toEqual([playerAgurin.id])
    expect(loaded.playerData[playerAgurin.id].entries).toEqual([entryLeeSin])
    expect(loaded.lineup.starters.jungle).toBe(playerAgurin.id)
    expect(loaded.lineup.starters.mid).toBeNull()
    expect(loaded.lineup.substitutes.sub1).toBeNull()
    expect(loaded.includeSubstitutes).toBe(false)
    expect(loaded.removedPlayers).toEqual({})
  })

  it("preserves an empty rawInput string but omits a non-string one", () => {
    saveScoutState({ ...state, rawInput: "" })
    expect(loadScoutState().rawInput).toBe("")

    saveScoutState({ ...state, rawInput: 5 as unknown as string })
    expect(loadScoutState().rawInput).toBeUndefined()
  })
})

describe("clearScoutState", () => {
  it("removes the stored state", () => {
    saveScoutState({ ...EMPTY_STATE, players: [playerAgurin] })
    expect(loadScoutState().players).toHaveLength(1)

    clearScoutState()

    expect(store[SCOUT_STORAGE_KEY]).toBeUndefined()
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("is a safe no-op when nothing is stored", () => {
    expect(() => clearScoutState()).not.toThrow()
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })

  it("leaves foreign keys alone", () => {
    store["lol_champion_notes"] = '{"Garen":{}}'
    saveScoutState({ ...EMPTY_STATE, players: [playerAgurin] })

    clearScoutState()

    expect(store["lol_champion_notes"]).toBe('{"Garen":{}}')
  })
})

/* ==========================================================================
 * 17. Hostile localStorage
 * ========================================================================== */

describe("storage failures never escape", () => {
  it("survives a localStorage whose methods throw (read, write and remove)", () => {
    mode = "throwOnCall"

    expect(() => loadScoutState()).not.toThrow()
    expect(loadScoutState()).toEqual(EMPTY_STATE)
    expect(() => saveScoutState({ ...EMPTY_STATE, players: [playerAgurin] })).not.toThrow()
    expect(() => clearScoutState()).not.toThrow()
  })

  it("survives a QuotaExceededError on a very large state", () => {
    const huge: ScoutState = {
      ...EMPTY_STATE,
      players: [playerAgurin],
      playerData: {
        [playerAgurin.id]: {
          playerId: playerAgurin.id,
          entries: Array.from({ length: 5000 }, (_unused, index) => ({
            ...entryLeeSin,
            championName: `Champ${index}`,
            note: "x".repeat(200),
          })),
        },
      },
    }

    mode = "throwOnCall"
    expect(() => saveScoutState(huge)).not.toThrow()

    mode = "ok"
    saveScoutState(huge)
    expect(loadScoutState().playerData[playerAgurin.id].entries).toHaveLength(5000)
  })

  it("survives a localStorage global that throws on property access (private mode)", () => {
    mode = "throwOnAccess"

    expect(loadScoutState()).toEqual(EMPTY_STATE)
    expect(() => saveScoutState({ ...EMPTY_STATE, players: [playerAgurin] })).not.toThrow()
    expect(() => clearScoutState()).not.toThrow()
  })

  it("survives a runtime without localStorage at all", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
    delete (globalThis as { localStorage?: unknown }).localStorage

    try {
      expect(loadScoutState()).toEqual(EMPTY_STATE)
      expect(() => saveScoutState({ ...EMPTY_STATE, players: [playerAgurin] })).not.toThrow()
      expect(() => clearScoutState()).not.toThrow()
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor)
    }

    // The mock is back and still usable.
    expect(loadScoutState()).toEqual(EMPTY_STATE)
  })
})

/* ==========================================================================
 * 18. Forward compatibility
 * ========================================================================== */

describe("unknown extra fields", () => {
  it("ignores unknown top-level, player and entry fields without breaking anything", () => {
    seedJson({
      schemaVersion: 2,
      players: [{ ...playerAgurin, favouriteColour: "blue" }],
      playerData: {
        [playerAgurin.id]: {
          playerId: playerAgurin.id,
          entries: [{ ...entryLeeSin, kdaRatio: 4.2 }],
          futureField: { nested: true },
        },
      },
      lineup: {
        starters: { jungle: playerAgurin.id },
        substitutes: {},
        coach: "someone",
      },
      includeSubstitutes: false,
      removedPlayers: {},
      rawInput: "Agurin#EUW",
      analysisCache: { bans: ["LeeSin"] },
      updatedAtIso: "2026-08-18T11:00:00.000Z",
    })

    const state = loadScoutState()

    expect(state).toEqual({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: {
        [playerAgurin.id]: { playerId: playerAgurin.id, entries: [entryLeeSin] },
      },
      lineup: {
        starters: {
          top: null,
          jungle: playerAgurin.id,
          mid: null,
          bot: null,
          support: null,
        },
        substitutes: { sub1: null, sub2: null, sub3: null },
      },
      includeSubstitutes: false,
      removedPlayers: {},
      rawInput: "Agurin#EUW",
      updatedAtIso: "2026-08-18T11:00:00.000Z",
    })
    expect("analysisCache" in state).toBe(false)
    expect("coach" in state.lineup).toBe(false)
  })
})

/* ==========================================================================
 * 19. LEGACY provenance `source: "riot"` (the removed Riot auto-import)
 *
 * WHAT HAPPENED: for a short while `ScoutManualSource` carried a `"riot"`
 * member, written by an optional Riot auto-import that went through a backend
 * proxy. That import was deliberately removed on 2026-08-19 (the app must not
 * depend on a Riot key, an edge function, a login or a proxy), and `"riot"`
 * went with it. It was never part of a public deployment, so the only browser
 * that can still hold such a row is one that ran the auto-import locally.
 *
 * WHAT THIS SECTION PINS DOWN — the *reverse* of what it used to assert:
 *   1. a stored `"riot"` row still loads, without a crash and WITHOUT LOSING
 *      DATA: champion, games, winrate, note, role and recency all survive
 *      unchanged, and only the provenance *label* degrades to `"other"`. That
 *      is `readManualSource()`'s ordinary unknown-value path, and it is the
 *      wanted behaviour — a mislabelled source chip, not a dropped row;
 *   2. {@link SCOUT_SCHEMA_VERSION} stays at 2 across that load. Bumping it
 *      would make every still-open older tab reject the whole blob and fall
 *      back to an EMPTY state — trading one wrong chip for the user's entire
 *      scouting session;
 *   3. removing the member did not turn the closed set into a sieve: every
 *      near miss (`"riot-api"`, `"RIOT"`, `" riot"`, `7`, `null`, …) still
 *      degrades to `"other"` too — `"riot"` itself is now simply one of them.
 * ========================================================================== */

/**
 * A row exactly as the removed auto-import wrote it into localStorage.
 *
 * Deliberately NOT typed as `ManualChampionEntry`: `"riot"` is not a member of
 * `ScoutManualSource` any more, so this is legacy JSON from an older bundle,
 * not data this build could construct. Typing it would be a compile error —
 * which is the point.
 */
const legacyRiotKarmaRow: Readonly<Record<string, unknown>> = {
  championName: "Karma",
  games: 17,
  winrate: 64.7,
  note: "flexed to support in game 2",
  source: "riot",
  recency: "current",
  role: "support",
}

/** What the loader must make of it: the same row, with the label degraded. */
const migratedKarmaEntry: ManualChampionEntry = {
  championName: "Karma",
  games: 17,
  winrate: 64.7,
  note: "flexed to support in game 2",
  source: "other",
  recency: "current",
  role: "support",
}

describe('legacy manual entry provenance "riot"', () => {
  /** Normalise one raw entry for `playerRekkles` and hand back what survived. */
  function firstEntry(rawEntry: unknown): ManualChampionEntry | undefined {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerRekkles],
      playerData: { [playerRekkles.id]: { playerId: playerRekkles.id, entries: [rawEntry] } },
    })
    return state.playerData[playerRekkles.id]?.entries[0]
  }

  it("loads without crashing and keeps every field except the source label", () => {
    expect(firstEntry(legacyRiotKarmaRow)).toEqual(migratedKarmaEntry)
  })

  it("survives a real JSON blob written by the older bundle (load from storage)", () => {
    // A browser holds a STRING, not an object graph. Seeding the raw blob is
    // the only faithful reproduction of the legacy situation - the in-memory
    // check above would still pass if the JSON path lost the row entirely.
    seedJson({
      schemaVersion: 2,
      players: [playerRekkles],
      playerData: {
        [playerRekkles.id]: {
          playerId: playerRekkles.id,
          entries: [legacyRiotKarmaRow],
        },
      },
      lineup: emptyLineup(),
      includeSubstitutes: false,
      removedPlayers: {},
    })

    const loaded = loadScoutState()
    expect(loaded.players).toEqual([playerRekkles])
    expect(loaded.playerData[playerRekkles.id].entries).toEqual([migratedKarmaEntry])
    // Spelled out field by field: `toEqual` above would also pass if BOTH
    // sides were wrong in the same way, and "no data loss" is the whole claim.
    const entry = loaded.playerData[playerRekkles.id].entries[0]
    expect(entry.championName).toBe("Karma")
    expect(entry.games).toBe(17)
    expect(entry.winrate).toBe(64.7)
    expect(entry.note).toBe("flexed to support in game 2")
    expect(entry.role).toBe("support")
    expect(entry.recency).toBe("current")
    expect(entry.source).toBe("other")
  })

  it("keeps the schema version at 2 across that load", () => {
    seedJson({
      schemaVersion: 2,
      players: [playerRekkles],
      playerData: {
        [playerRekkles.id]: { playerId: playerRekkles.id, entries: [legacyRiotKarmaRow] },
      },
      lineup: emptyLineup(),
      includeSubstitutes: false,
      removedPlayers: {},
    })

    expect(SCOUT_SCHEMA_VERSION).toBe(2)
    expect(loadScoutState().schemaVersion).toBe(2)

    // And a save right after the load still writes version 2 - the degraded
    // row must not push the blob onto a version older tabs would reject.
    saveScoutState(loadScoutState())
    expect(store[SCOUT_STORAGE_KEY]).toContain('"schemaVersion":2')
    expect(store[SCOUT_STORAGE_KEY]).not.toContain('"source":"riot"')
  })

  it("mixes freely with rows from the paste import and from memory", () => {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerRekkles],
      playerData: {
        [playerRekkles.id]: {
          playerId: playerRekkles.id,
          entries: [
            legacyRiotKarmaRow,
            { ...legacyRiotKarmaRow, championName: "Lulu", source: "opgg" },
            { ...legacyRiotKarmaRow, championName: "Nami", source: "manual" },
          ],
        },
      },
    })

    // Three rows in, three rows out: the legacy one is relabelled, not dropped.
    expect(state.playerData[playerRekkles.id].entries.map((entry) => entry.championName)).toEqual([
      "Karma",
      "Lulu",
      "Nami",
    ])
    expect(state.playerData[playerRekkles.id].entries.map((entry) => entry.source)).toEqual([
      "other",
      "opgg",
      "manual",
    ])
  })

  it("degrades every unrecognised source to other, near misses and riot itself", () => {
    const unknownSources: readonly unknown[] = [
      "riot",
      "riot-api",
      "riotgames",
      "riot_api",
      "RIOT",
      "Riot",
      " riot",
      "riot ",
      "",
      null,
      7,
      { source: "riot" },
    ]

    for (const source of unknownSources) {
      const entry = firstEntry({ ...legacyRiotKarmaRow, source })
      expect(entry?.source, JSON.stringify(source)).toBe("other")
    }
  })
})

/* ==========================================================================
 * 20. ManualChampionEntry.kda — "a broken KDA costs the KDA, never the row"
 *
 * WHY THIS SECTION EXISTS: `normalizeManualEntry()` in src/scout/storage.ts
 * makes three promises about `kda` in a long comment, and until this section
 * none of them was pinned by a test — the whole guard could be reduced to
 * `if (kda !== null)` without turning a single test red.
 *
 * THE THREE PROMISES, each asserted below:
 *   1. AN UNUSABLE KDA NEVER DROPS THE ROW. `games` and `winrate` are the only
 *      two fields that may remove a champion row; a KDA is extra context, so a
 *      missing, unreadable, non-finite or negative one costs the KDA alone.
 *   2. `0` IS A REAL VALUE AND IS KEPT. "no kills, no assists" is something the
 *      source actually printed and has to stay distinguishable from "not
 *      stated" — this is exactly where a falsy check (`if (kda)`) would lie.
 *   3. UNUSABLE MEANS THE KEY IS ABSENT, NOT `null`. A row without a KDA has to
 *      serialise exactly as it did before the field existed, so an untouched
 *      state still round-trips to the same JSON and an older bundle reading it
 *      sees nothing new. The assertions therefore test for the *key* (`in`,
 *      `Object.hasOwn`, `Object.keys`) and for the absence of `"kda"` in the
 *      written JSON — `toBeUndefined()` alone would happily accept a stored
 *      `"kda":null`, which is the very thing promise (3) forbids.
 *
 * NOTE ON THE NUMERIC STRING `"3.2"`: it is NOT in the unusable table. `kda` is
 * read with the same `readFiniteNumber()` as `games` and `winrate`, which
 * documents and tests the numeric-string path ("reads a numeric string sample
 * size ('12' -> 12)"). Treating a numeric string as unusable here would assert
 * the opposite of the shared reader; `"-1"` still drops out, because the sign
 * rule applies after parsing. Both are spelled out in their own test.
 * ========================================================================== */

/** The Lee Sin fixture as the stats import writes it: with a stated KDA. */
const entryLeeSinWithKda: ManualChampionEntry = { ...entryLeeSin, kda: 3.2 }

describe("normalizeScoutState - ManualChampionEntry.kda", () => {
  /** Normalise raw rows for `playerAgurin` and hand back what survived. */
  function entriesOf(rawEntries: unknown): ManualChampionEntry[] {
    const state = normalizeScoutState({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries: rawEntries } },
    })
    return state.playerData[playerAgurin.id]?.entries ?? []
  }

  /** The single surviving row for one raw row. */
  function firstEntry(rawEntry: unknown): ManualChampionEntry {
    return entriesOf([rawEntry])[0]
  }

  /**
   * The same, but through a real JSON blob in storage. A browser holds a
   * STRING, not an object graph, so this is the only faithful reproduction of
   * what actually happens to `undefined` and `null` on the way out and back.
   */
  function loadedEntry(rawEntry: unknown): ManualChampionEntry {
    seedJson({
      schemaVersion: 2,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries: [rawEntry] } },
      lineup: emptyLineup(),
      includeSubstitutes: false,
      removedPlayers: {},
    })
    return loadScoutState().playerData[playerAgurin.id].entries[0]
  }

  /** Builds a savable state around a list of rows this build can construct. */
  function stateWithEntries(entries: ManualChampionEntry[]): ScoutState {
    return {
      ...EMPTY_STATE,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries } },
    }
  }

  it("keeps a stated KDA through save -> load, to the exact value", () => {
    saveScoutState(stateWithEntries([entryLeeSinWithKda]))

    const entry = loadScoutState().playerData[playerAgurin.id].entries[0]
    expect(entry).toEqual(entryLeeSinWithKda)
    expect(entry.kda).toBe(3.2)
    // Not just "loads back": it has to be *written* as a number, so an older
    // bundle sees a plain extra key and a newer one reads the same ratio.
    expect(store[SCOUT_STORAGE_KEY]).toContain('"kda":3.2')
  })

  it("keeps a KDA of 0 - a real, bad value, not 'not stated'", () => {
    const entry = firstEntry({ ...entryLeeSin, kda: 0 })

    expect(entry).toBeDefined()
    expect(entry.kda).toBe(0)
    // The key must be PRESENT with the value 0. This is the assertion a falsy
    // check (`if (kda)`) or a `> 0` bound would fail.
    expect("kda" in entry).toBe(true)
    expect(Object.hasOwn(entry, "kda")).toBe(true)
    expect(Object.keys(entry)).toContain("kda")
  })

  it("writes a KDA of 0 into storage instead of dropping it", () => {
    saveScoutState(stateWithEntries([{ ...entryLeeSin, kda: 0 }]))

    expect(store[SCOUT_STORAGE_KEY]).toContain('"kda":0')
    expect(loadScoutState().playerData[playerAgurin.id].entries[0].kda).toBe(0)
  })

  it("omits the key for every unusable KDA and keeps the row intact", () => {
    // Each pair is (label for the failure message, stored kda value).
    const unusable: readonly (readonly [string, unknown])[] = [
      ["negative", -1],
      ["negative fraction", -0.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["null", null],
      ["undefined", undefined],
      ["true", true],
      ["false", false],
      ["non-numeric string", "excellent"],
      ["empty string", ""],
      ["blank string", "   "],
      ["negative numeric string", "-1"],
      ["object", { ratio: 3.2 }],
      ["array", [3.2]],
    ]

    for (const [label, kda] of unusable) {
      const entry = firstEntry({ ...entryLeeSin, kda })

      // (1) the row survives, untouched apart from the KDA.
      expect(entry, label).toBeDefined()
      expect(entry.championName, label).toBe("LeeSin")
      expect(entry.games, label).toBe(42)
      expect(entry.winrate, label).toBe(61.5)
      expect(entry.note, label).toBe("first pick every time")
      expect(entry.source, label).toBe("opgg")
      expect(entry.recency, label).toBe("current")
      expect(entry.role, label).toBe("jungle")

      // (3) the KEY is gone - not present with the value `null`.
      expect("kda" in entry, label).toBe(false)
      expect(Object.hasOwn(entry, "kda"), label).toBe(false)
      expect(Object.keys(entry), label).not.toContain("kda")
    }
  })

  it("omits the key when the stored row never carried one", () => {
    const entry = firstEntry({ ...entryLeeSin })

    expect(entry.championName).toBe("LeeSin")
    expect("kda" in entry).toBe(false)
    expect(Object.keys(entry)).not.toContain("kda")
  })

  it('never writes "kda":null into storage', () => {
    saveScoutState(
      stateWithEntries([
        { ...entryLeeSin, championName: "NullKda", kda: null },
        { ...entryLeeSin, championName: "NegKda", kda: -1 },
        { ...entryLeeSin, championName: "NoKda" },
      ]),
    )

    const written = store[SCOUT_STORAGE_KEY]
    // The strongest form of promise (3): the substring must not occur at all.
    expect(written).not.toContain('"kda"')

    const entries = loadScoutState().playerData[playerAgurin.id].entries
    expect(entries.map((entry) => entry.championName)).toEqual(["NullKda", "NegKda", "NoKda"])
    for (const entry of entries) expect("kda" in entry, entry.championName).toBe(false)
  })

  it("round-trips a state without any KDA to byte-identical JSON", () => {
    saveScoutState(stateWithEntries([entryLeeSin]))
    const first = store[SCOUT_STORAGE_KEY]

    saveScoutState(loadScoutState())
    const second = store[SCOUT_STORAGE_KEY]

    expect(second).toBe(first)
    expect(first).not.toContain("kda")
  })

  it("loses only the broken row's KDA, never the row and never a neighbour's", () => {
    const entries = entriesOf([
      { ...entryLeeSin, championName: "Good", kda: 4.1 },
      { ...entryLeeSin, championName: "Broken", kda: -2 },
      { ...entryLeeSin, championName: "Zero", kda: 0 },
      { ...entryLeeSin, championName: "Silent" },
    ])

    expect(entries.map((entry) => entry.championName)).toEqual([
      "Good",
      "Broken",
      "Zero",
      "Silent",
    ])
    expect(entries[0].kda).toBe(4.1)
    expect("kda" in entries[1]).toBe(false)
    expect(entries[2].kda).toBe(0)
    expect("kda" in entries[3]).toBe(false)
  })

  it("reads a numeric string KDA, exactly like games and winrate ('3.2' -> 3.2)", () => {
    // Same `readFiniteNumber()` as the two mandatory fields - see the section
    // header for why this is deliberately NOT in the unusable table above.
    const entry = firstEntry({ ...entryLeeSin, kda: "3.2" })
    expect(entry.kda).toBe(3.2)
    expect(Object.hasOwn(entry, "kda")).toBe(true)

    // The sign rule still applies after parsing, so a negative string drops.
    expect("kda" in firstEntry({ ...entryLeeSin, kda: "-1" })).toBe(false)
  })

  it("survives a real JSON blob: 0 stays 0, null loads as an absent key", () => {
    expect(loadedEntry({ ...entryLeeSin, kda: 0 }).kda).toBe(0)

    const fromNull = loadedEntry({ ...entryLeeSin, kda: null })
    expect(fromNull.championName).toBe("LeeSin")
    expect(fromNull.games).toBe(42)
    expect(fromNull.winrate).toBe(61.5)
    expect("kda" in fromNull).toBe(false)

    // `undefined` does not even survive JSON.stringify, so this is what a row
    // written with an explicit `kda: undefined` really looks like on reload.
    expect("kda" in loadedEntry({ ...entryLeeSin, kda: undefined })).toBe(false)
  })
})

/* ==========================================================================
 * 21. The editor writes, the storage reads - the seam between them
 *
 * WHY THIS SECTION EXISTS: section 20 above proves what src/scout/storage.ts
 * does with a `kda` it FINDS in a blob, and tests/scoutDataEditor.test.ts
 * proves what `withKdaValue()` BUILDS. Neither of them puts the two together,
 * so the one step nobody asserted is the handover: that the row the editor
 * hands over is still the same row after `saveScoutState()` -> localStorage ->
 * `loadScoutState()`. That step is also the only one the user ever sees. A KDA
 * lost there is indistinguishable from a KDA that was never typed.
 *
 * WHAT THIS PINS DOWN AND THE TWO NEIGHBOURING SECTIONS DO NOT:
 *   1. a stated value survives the handover to the exact number, `0` included.
 *      Losing a `0` is the expensive direction: "not stated" is scored
 *      NEUTRALLY, so the champion the user marked as their worst would come
 *      back looking average;
 *   2. clearing the field leaves no `"kda"` in the written JSON at all. That is
 *      the byte-for-byte promise of `ManualChampionEntry.kda`, and it is
 *      asserted on the editor's own object BEFORE saving, because that is the
 *      half storage cannot make for it - see the comment in that test;
 *   3. the comma a German keyboard produces travels all the way into storage.
 *      `parseKdaInput()` is the only place `,` is understood, and a test that
 *      stops at the parser cannot tell whether the number it returned ever
 *      reached the disk;
 *   4. writing a KDA does not move SCOUT_SCHEMA_VERSION.
 * ========================================================================== */

describe("ManualChampionEntry.kda - editor to storage and back", () => {
  /**
   * A savable state around rows this build can construct. Deliberately a local
   * copy of the helper in section 20 rather than a shared one: both sections
   * are about `kda`, but they exercise opposite directions, and hoisting it
   * would tie a change in one to the other. The file already re-declares small
   * per-section helpers this way (`firstEntry` exists twice above).
   */
  function stateWithEntries(entries: ManualChampionEntry[]): ScoutState {
    return {
      ...EMPTY_STATE,
      players: [playerAgurin],
      playerData: { [playerAgurin.id]: { playerId: playerAgurin.id, entries } },
    }
  }

  /** Save one editor-built row and read back what a reload would show. */
  function roundTrip(entry: ManualChampionEntry): ManualChampionEntry {
    saveScoutState(stateWithEntries([entry]))
    return loadScoutState().playerData[playerAgurin.id].entries[0]
  }

  it("carries a KDA set in the editor into storage, to the exact value", () => {
    const loaded = roundTrip(withKdaValue(entryLeeSin, 2.5))

    expect(loaded.kda).toBe(2.5)
    // Nothing else about the row moved on the way. A KDA is additional context,
    // not a rewrite of the two numbers the ban plan is actually built from.
    expect(loaded).toEqual({ ...entryLeeSin, kda: 2.5 })
  })

  it("carries a KDA of 0 into storage instead of quietly improving the row", () => {
    const loaded = roundTrip(withKdaValue(entryLeeSin, 0))

    expect(loaded.kda).toBe(0)
    // Present WITH the value 0, not merely readable as 0. A dropped key reads
    // back as "not stated", which the analysis scores neutrally - i.e. better
    // than the terrible KDA the user actually entered.
    expect(Object.hasOwn(loaded, "kda")).toBe(true)
    expect(store[SCOUT_STORAGE_KEY]).toContain('"kda":0')
  })

  it("clears a KDA in the editor and leaves no trace of the key in storage", () => {
    const cleared = withKdaValue(entryLeeSinWithKda, null)

    // ASSERTED ON THE EDITOR'S OBJECT, BEFORE SAVING, AND THAT IS THE POINT:
    // `saveScoutState()` normalises on write and drops an unusable `kda` by
    // itself, so a `withKdaValue()` that returned `{ ...entry, kda: null }`
    // would still round-trip perfectly green. Only this line sees the
    // difference. Confirmed by mutation: replacing the `delete` in
    // `withKdaValue()` with `kda: null` turns exactly this test red, while
    // every round-trip assertion below stays green.
    expect(Object.hasOwn(cleared, "kda")).toBe(false)
    // The shape that mutant would produce, spelled out so the contrast is
    // visible rather than implied.
    expect(JSON.stringify(cleared)).not.toBe(
      JSON.stringify({ ...entryLeeSinWithKda, kda: null }),
    )

    saveScoutState(stateWithEntries([cleared]))
    expect(store[SCOUT_STORAGE_KEY]).not.toContain('"kda"')

    const loaded = loadScoutState().playerData[playerAgurin.id].entries[0]
    expect(loaded.kda).toBeUndefined()
    expect(Object.hasOwn(loaded, "kda")).toBe(false)
    // The row is back to exactly the fixture it started from - clearing a KDA
    // costs the KDA and nothing else.
    expect(loaded).toEqual(entryLeeSin)
  })

  it("serialises a row the editor never gave a KDA like a row from before the field", () => {
    // What the editor commits when the KDA field is left empty on a row that
    // never carried one: parse -> null -> the key that was never there stays
    // away.
    const throughEditor = JSON.stringify(roundTrip(withKdaValue(entryLeeSin, null)))
    // The same row as a bundle without the field would have written it.
    const beforeTheField = JSON.stringify(roundTrip(entryLeeSin))

    expect(throughEditor).toBe(beforeTheField)
    expect(throughEditor).not.toContain("kda")

    // HONEST LIMIT OF THIS TEST, so nobody reads more into it than it says:
    // both strings come out of `normalizeManualEntry()`, so their key ORDER
    // agrees by construction and the equality alone would survive an editor
    // that slipped a `null` in. The weight sits on the missing substring and on
    // the editor-side assertion in the test above. What it does buy is the
    // end-to-end half of the SCOUT_SCHEMA_VERSION argument: an older bundle
    // reading this blob finds a byte sequence it already understood.
  })

  it("carries what the user typed, comma included, from the field into storage", () => {
    // (typed text, what a reload has to show). Every row starts from a stated
    // 3.2 on purpose, so the empty field has something to CLEAR - starting from
    // a row without a KDA would let a `withKdaValue()` that ignores `null` pass.
    const typed: readonly (readonly [string, number | undefined])[] = [
      ["", undefined],
      ["0", 0],
      ["2.5", 2.5],
      ["3,2", 3.2],
    ]

    for (const [raw, expected] of typed) {
      const parsed = parseKdaInput(raw)
      // Thrown, not asserted and skipped: a loop that walks on after a rejected
      // input would report green while having checked nothing.
      if (!parsed.ok) throw new Error(`parseKdaInput rejected ${JSON.stringify(raw)}`)

      const loaded = roundTrip(withKdaValue(entryLeeSinWithKda, parsed.value))

      expect(loaded.kda, raw).toBe(expected)
      expect(Object.hasOwn(loaded, "kda"), raw).toBe(expected !== undefined)
      // The comma is a keyboard courtesy, never a stored value: `"3,2"` is not
      // a JSON number at all, and a stored string would make the scoring read
      // the row through a different path than the one it was tested on.
      expect(store[SCOUT_STORAGE_KEY], raw).not.toContain('"kda":"')
    }
  })

  it("keeps SCOUT_SCHEMA_VERSION at 2 across the round trip", () => {
    saveScoutState(stateWithEntries([withKdaValue(entryLeeSin, 2.5)]))

    expect(store[SCOUT_STORAGE_KEY]).toContain('"schemaVersion":2')
    expect(loadScoutState().schemaVersion).toBe(SCOUT_SCHEMA_VERSION)
    expect(SCOUT_SCHEMA_VERSION).toBe(2)

    // WHY A BUMP HERE WOULD BE ACTIVELY HARMFUL, not merely unnecessary: the
    // version gate discards a HIGHER version wholesale (see "returns the empty
    // state for an unknown HIGHER schemaVersion" in section 1-6). A still-open
    // older tab would therefore throw the user's entire scouting session away
    // the next time it read this blob - to protect it from one extra key it
    // simply ignores. Left at 2, the worst an older bundle can do is drop that
    // single KDA on its next save: `kda` is purely additive, and
    // `normalizeManualEntry()` builds its result field by field instead of
    // spreading the input, so no other field can travel out with it.
  })
})
