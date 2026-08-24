import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import { normalizeScoutState } from "../src/scout/storage"
import { SCOUT_RANK_TIERS, SCOUT_SCHEMA_VERSION } from "../src/scout/types"
import type { ScoutPlayer, ScoutState } from "../src/scout/types"
import {
  SCOUT_RANK_VALUES,
  carryOverPlayerHandiwork,
  localizeScoutParams,
  scoutRankKey,
  translateScoutReason,
} from "../src/components/scout/scoutUiHelpers"

/**
 * Rank persistence and rank labels.
 *
 * The scoring half lives in tests/scoutRankWeighting.test.ts. This file covers
 * the two places a rank can quietly disappear:
 *
 *  (1) STORAGE. `saveScoutState()` normalises BEFORE writing, and
 *      `normalizePlayer()` rebuilds a player field by field without ever
 *      spreading the input. A field the normaliser does not read is therefore
 *      stripped on every save: it would work for a whole session and vanish on
 *      reload, which is the most misleading failure mode available.
 *  (2) THE CATALOGUES. A tier with no label would render as an empty option.
 *
 * Vitest runs in Node with no jsdom, so nothing here renders. The dropdown is
 * covered as far as it can be: the value tuple it maps over, and the label each
 * value resolves to.
 */

const tDe = (key: TranslationKey): string => de[key]
const tEn = (key: TranslationKey): string => en[key]
const LANGS = [
  ["de", tDe, de as Record<string, string>],
  ["en", tEn, en as Record<string, string>],
] as const

function storedPlayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p1",
    riotName: "Agurin",
    tagline: "EUW",
    region: "EUW",
    displayName: "Agurin#EUW",
    role: "jungle",
    sources: [],
    ...overrides,
  }
}

function stateWith(player: Record<string, unknown>): unknown {
  return {
    schemaVersion: SCOUT_SCHEMA_VERSION,
    players: [player],
    playerData: {},
    lineup: { starters: {}, substitutes: {} },
    includeSubstitutes: false,
    removedPlayers: {},
  }
}

const firstPlayer = (state: ScoutState): ScoutPlayer => {
  const player = state.players[0]
  // Guard, not decoration: every assertion below reads a field off this, and a
  // dropped player would make them all vacuous.
  expect(player, "the player was dropped entirely").toBeDefined()
  return player
}

/* -------------------------------------------------------------------------
 * 1. storage
 * ------------------------------------------------------------------------- */

describe("scout storage — rank tier", () => {
  it("keeps every valid tier through a normalise round trip", () => {
    for (const tier of SCOUT_RANK_TIERS) {
      const state = normalizeScoutState(stateWith(storedPlayer({ rankTier: tier })))
      expect(firstPlayer(state).rankTier, tier).toBe(tier)
    }
  })

  it("omits the key entirely when nobody stated a rank", () => {
    const state = normalizeScoutState(stateWith(storedPlayer()))
    const player = firstPlayer(state)

    // Omitted, not `null`. That is what keeps an untouched player byte-identical
    // through a load/save cycle, so no stored state grows a key nobody set.
    expect("rankTier" in player).toBe(false)
    expect(player.rankTier).toBeUndefined()
  })

  it("neutralises a junk rank instead of trusting it or destroying the player", () => {
    const junk = [
      "Challenger",
      "CHALLENGER",
      "challengerr",
      "",
      "  master  ",
      42,
      true,
      null,
      {},
      [],
      "unranked ",
    ]

    for (const value of junk) {
      const state = normalizeScoutState(stateWith(storedPlayer({ rankTier: value })))
      const player = firstPlayer(state)

      expect("rankTier" in player, JSON.stringify(value)).toBe(false)
      // Everything else about the player must survive untouched. A bad rank is
      // never a reason to lose a player or a state.
      expect(player.id).toBe("p1")
      expect(player.riotName).toBe("Agurin")
      expect(player.role).toBe("jungle")
    }
  })

  it("never invents a tier as a fallback", () => {
    // `"unranked"` would be a claim the user never made, and any other tier
    // would silently reweigh their data.
    const state = normalizeScoutState(stateWith(storedPlayer({ rankTier: "nonsense" })))
    expect(firstPlayer(state).rankTier).not.toBe("unranked")
    expect(firstPlayer(state).rankTier).toBeUndefined()
  })

  it("keeps the explicit unranked statement, which is not the same as silence", () => {
    const stated = normalizeScoutState(stateWith(storedPlayer({ rankTier: "unranked" })))
    const silent = normalizeScoutState(stateWith(storedPlayer()))

    expect(firstPlayer(stated).rankTier).toBe("unranked")
    expect("rankTier" in firstPlayer(silent)).toBe(false)
  })

  it("does not need a schema bump", () => {
    // Deliberately still 2. The version gate discards anything HIGHER than the
    // running build understands and falls back to an empty state, so a bump
    // would make every still-open older tab lose its whole scout dataset. An
    // older build loading this data just drops the unknown key.
    expect(SCOUT_SCHEMA_VERSION).toBe(2)

    const loadedByOldBuild = normalizeScoutState(
      stateWith(storedPlayer({ rankTier: "master", someFutureField: "ignored" })),
    )
    const player = firstPlayer(loadedByOldBuild)
    expect(player.rankTier).toBe("master")
    expect("someFutureField" in player).toBe(false)
  })

  it("does not touch the champion rows", () => {
    const state = normalizeScoutState({
      schemaVersion: SCOUT_SCHEMA_VERSION,
      players: [storedPlayer({ rankTier: "diamond" })],
      playerData: {
        p1: {
          playerId: "p1",
          entries: [
            {
              championName: "Lee Sin",
              games: 30,
              winrate: 62,
              kda: 0,
              note: "",
              source: "manual",
              recency: "current",
              role: "jungle",
            },
          ],
        },
      },
      lineup: { starters: {}, substitutes: {} },
      includeSubstitutes: false,
      removedPlayers: {},
    })

    const entry = state.playerData.p1?.entries[0]
    expect(entry?.championName).toBe("Lee Sin")
    expect(entry?.games).toBe(30)
    expect(entry?.winrate).toBe(62)
    // The 0.5.x rule still holds: a stated 0 is a real value, not "not stated".
    expect(entry?.kda).toBe(0)
    expect(Object.keys(entry ?? {})).toContain("kda")
  })
})

/* -------------------------------------------------------------------------
 * 2. the dropdown's values and labels
 * ------------------------------------------------------------------------- */

describe("scout rank labels", () => {
  it("offers every tier the contract defines, in the contract's order", () => {
    // The tuple order IS the contract: users pick a rank by position, and the
    // weighting is asserted monotonic along the same order.
    expect(SCOUT_RANK_VALUES).toEqual([...SCOUT_RANK_TIERS])
    expect(SCOUT_RANK_VALUES).toHaveLength(11)
  })

  it("resolves a non-empty label for every tier in both languages", () => {
    for (const tier of SCOUT_RANK_TIERS) {
      for (const [lang, t] of LANGS) {
        const label = t(scoutRankKey(tier))
        expect(typeof label, `${lang}.${tier}`).toBe("string")
        expect(label.trim().length, `${lang}.${tier} is empty`).toBeGreaterThan(0)
        // A raw key on screen is the classic symptom of a missing translation.
        expect(label, `${lang}.${tier} leaked its key`).not.toContain("scout_rank_")
      }
    }
  })

  it("labels the two tiers a German reader would notice most", () => {
    // Pinned verbatim because a machine translation gets these wrong: the German
    // client says Smaragd and Herausforderer, not "Emerald" and "Challenger".
    expect(de.scout_rank_emerald).toBe("Smaragd")
    expect(de.scout_rank_challenger).toBe("Herausforderer")
    expect(en.scout_rank_emerald).toBe("Emerald")
    expect(en.scout_rank_challenger).toBe("Challenger")
  })

  it("gives every tier a distinct label, so the dropdown is unambiguous", () => {
    for (const [lang, t] of LANGS) {
      const labels = SCOUT_RANK_TIERS.map((tier) => t(scoutRankKey(tier)))
      expect(new Set(labels).size, `${lang}: ${labels.join(", ")}`).toBe(labels.length)
    }
  })

  it("names the empty option without pretending it is a rank", () => {
    for (const [lang, , dict] of LANGS) {
      const label = dict.scout_player_rankUnknown
      expect(typeof label, lang).toBe("string")
      expect(label.trim().length, lang).toBeGreaterThan(0)
      // It must not read as the tier `unranked`, which is a different statement.
      expect(label, lang).not.toBe(dict.scout_rank_unranked)
    }
    expect(de.scout_player_rankUnknown).toBe("Rang unbekannt")
    expect(en.scout_player_rankUnknown).toBe("Unknown rank")
  })

  it("has a field label in both languages", () => {
    expect(de.scout_player_rank.trim().length).toBeGreaterThan(0)
    expect(en.scout_player_rank.trim().length).toBeGreaterThan(0)
  })
})

/* -------------------------------------------------------------------------
 * 2b. the rank reaches the screen as words, never as a code
 * ------------------------------------------------------------------------- */

describe("localizeScoutParams — {rank}", () => {
  it("turns every tier code into its German label", () => {
    // Asserted in GERMAN on purpose: the English labels are the codes modulo
    // case, so an English-only check would pass on a raw code.
    for (const tier of SCOUT_RANK_TIERS) {
      const localised = localizeScoutParams(tDe, { rank: tier })
      expect(localised?.rank, tier).toBe(de[scoutRankKey(tier)])
      expect(localised?.rank, tier).not.toBe(tier)
    }
  })

  it("renders the finished reason without a raw code", () => {
    const text = translateScoutReason(tDe, {
      code: "high_rank_player",
      params: { rank: "grandmaster" },
    })

    expect(text).toContain("Großmeister")
    expect(text).not.toContain("grandmaster")
    expect(text).not.toContain("{rank}")
  })

  it("leaves a non-tier {rank} value alone", () => {
    // `rank` is also an ordinary word. A number or an unrelated string must
    // pass through untouched rather than be bent onto a tier label.
    expect(localizeScoutParams(tDe, { rank: 3 })?.rank).toBe(3)
    expect(localizeScoutParams(tDe, { rank: "12" })?.rank).toBe("12")
  })
})

/* -------------------------------------------------------------------------
 * 3. the re-parse carry-over
 * ------------------------------------------------------------------------- */

describe("carryOverPlayerHandiwork", () => {
  const parsedFresh = (overrides: Partial<ScoutPlayer> = {}): ScoutPlayer => ({
    id: "p1",
    riotName: "Agurin",
    tagline: "EUW",
    region: "EUW",
    displayName: "Agurin#EUW",
    role: "unknown",
    sources: [],
    ...overrides,
  })

  it("keeps a rank the parser can never produce", () => {
    // THE REGRESSION THIS EXISTS FOR. `parseScoutInput()` rebuilds every player
    // from the pasted text, so without this the rank silently resets to
    // "unknown" every single time the user re-parses.
    const carried = carryOverPlayerHandiwork(
      [parsedFresh()],
      [parsedFresh({ rankTier: "diamond", role: "jungle" })],
    )

    expect(carried[0].rankTier).toBe("diamond")
  })

  it("keeps an explicit unranked statement too", () => {
    const carried = carryOverPlayerHandiwork(
      [parsedFresh()],
      [parsedFresh({ rankTier: "unranked" })],
    )
    expect(carried[0].rankTier).toBe("unranked")
  })

  it("adds no rank when there never was one", () => {
    const carried = carryOverPlayerHandiwork([parsedFresh()], [parsedFresh()])
    expect("rankTier" in carried[0]).toBe(false)
  })

  it("lets a freshly detected role win, unlike the rank", () => {
    // The asymmetry is deliberate: a role IS in the input, a rank never is. A
    // corrected paste must be able to fix a wrong role.
    const carried = carryOverPlayerHandiwork(
      [parsedFresh({ role: "mid" })],
      [parsedFresh({ role: "jungle", rankTier: "master" })],
    )

    expect(carried[0].role).toBe("mid")
    expect(carried[0].rankTier).toBe("master")
  })

  it("falls back to the old role only when the parse found none", () => {
    const carried = carryOverPlayerHandiwork(
      [parsedFresh({ role: "unknown" })],
      [parsedFresh({ role: "support" })],
    )
    expect(carried[0].role).toBe("support")
  })

  it("invents nothing for a player who is new to the roster", () => {
    const fresh = parsedFresh({ id: "p2", riotName: "Caps", displayName: "Caps#EUW" })
    const carried = carryOverPlayerHandiwork(
      [fresh],
      [parsedFresh({ rankTier: "challenger", role: "jungle" })],
    )

    expect(carried[0].id).toBe("p2")
    expect("rankTier" in carried[0]).toBe(false)
    expect(carried[0].role).toBe("unknown")
  })

  it("does not mutate its inputs", () => {
    const parsed = [parsedFresh()]
    const previous = [parsedFresh({ rankTier: "gold", role: "bot" })]
    carryOverPlayerHandiwork(parsed, previous)

    expect("rankTier" in parsed[0]).toBe(false)
    expect(parsed[0].role).toBe("unknown")
  })
})
