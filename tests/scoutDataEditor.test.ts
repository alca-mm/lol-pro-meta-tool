/**
 * Unit tests for the pure helpers of the manual scout data editor.
 *
 * Same rule as tests/scoutUiHelpers.test.ts: Node environment, no jsdom, no
 * component rendering. Only the exported pure functions of
 * src/components/scout/ScoutDataEditor.tsx are covered here — they are the ones
 * that decide whether a row survives a reload, so they are worth pinning down.
 */

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"
import type { TranslationKey } from "../src/i18n/types"
import {
  SCOUT_LINEUP_SLOTS,
  type ManualChampionEntry,
  type ScoutLineup,
  type ScoutPlayer,
  type ScoutRole,
} from "../src/scout/types"
import {
  SCOUT_ROLE_VALUES,
  defaultRoleForPlayer,
  lineupStarterSlot,
} from "../src/components/scout/scoutUiHelpers"
import {
  NEW_ENTRY_GAMES,
  NEW_ENTRY_WINRATE,
  createManualEntry,
  isManualEntryFilled,
  roleMismatchHint,
  withKdaValue,
} from "../src/components/scout/ScoutDataEditor"

const t = (key: TranslationKey): string => de[key]
const tEn = (key: TranslationKey): string => en[key]

/** Nobody is fielded — every starting slot is free. */
const emptyLineup = (): ScoutLineup => ({
  starters: { top: null, jungle: null, mid: null, bot: null, support: null },
  substitutes: { sub1: null, sub2: null, sub3: null },
})

/**
 * A player in the pool. `role` is what the *parser* guessed from the input,
 * not a position anybody declared for him.
 */
const benchPlayer: ScoutPlayer = {
  id: "euw:agurin#euw",
  riotName: "Agurin",
  tagline: "EUW",
  region: "EUW",
  displayName: "Agurin#EUW",
  role: "jungle",
  sources: [],
}

/* ==========================================================================
 * 1. createManualEntry — the role default
 * ========================================================================== */

describe("createManualEntry", () => {
  it("starts on the role it is handed, so the common case needs no extra click", () => {
    for (const role of SCOUT_ROLE_VALUES) {
      expect(createManualEntry(role).role).toBe(role)
    }
  })

  it("falls back to 'unknown' instead of guessing a lane", () => {
    // An invented role would be silently down-weighted as if it were confirmed
    // data; "unknown" is the honest value the analysis knows how to discount.
    expect(createManualEntry().role).toBe("unknown")
    expect(createManualEntry(undefined).role).toBe("unknown")
  })

  it("starts empty and neutral, with a fresh id per row", () => {
    const a = createManualEntry("mid")
    const b = createManualEntry("mid")

    expect(a.championName).toBe("")
    expect(a.note).toBe("")
    expect(a.games).toBe(NEW_ENTRY_GAMES)
    expect(a.winrate).toBe(NEW_ENTRY_WINRATE)
    expect(a.source).toBe("manual")
    expect(a.recency).toBe("current")
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })
})

/* ==========================================================================
 * 2. isManualEntryFilled — the delete guard
 * ========================================================================== */

describe("isManualEntryFilled", () => {
  it("treats a fresh row as empty, so removing it must not nag", () => {
    expect(isManualEntryFilled(createManualEntry("top"))).toBe(false)
    expect(isManualEntryFilled(createManualEntry())).toBe(false)
  })

  it("reports a row as filled for every single field the user can touch", () => {
    const cases: Array<[string, Partial<ManualChampionEntry>]> = [
      ["champion", { championName: "Karma" }],
      ["games", { games: NEW_ENTRY_GAMES + 1 }],
      ["winrate", { winrate: NEW_ENTRY_WINRATE + 1 }],
      ["note", { note: "smurf" }],
      ["kda", { kda: 3.2 }],
    ]

    for (const [label, patch] of cases) {
      const entry = { ...createManualEntry("mid"), ...patch }
      expect(isManualEntryFilled(entry), label).toBe(true)
    }
  })

  it("ignores whitespace-only text, which the loader would drop anyway", () => {
    const base = createManualEntry("mid")
    expect(isManualEntryFilled({ ...base, championName: "   " })).toBe(false)
    expect(isManualEntryFilled({ ...base, note: "  \t " })).toBe(false)
  })

  it("counts a winrate of 0 as filled — it is a real result, not a default", () => {
    expect(isManualEntryFilled({ ...createManualEntry("bot"), winrate: 0 })).toBe(true)
  })

  it("counts a KDA of 0 as filled, but an absent KDA as empty", () => {
    // Two different statements that a falsy check would merge: 0 means "no
    // kills and no assists", absent means "nobody stated one". Only the first
    // is something the user would miss on an accidental delete.
    expect(isManualEntryFilled({ ...createManualEntry("bot"), kda: 0 })).toBe(true)
    expect(isManualEntryFilled({ ...createManualEntry("bot"), kda: 3.2 })).toBe(true)
    expect(isManualEntryFilled({ ...createManualEntry("bot"), kda: null })).toBe(false)
    expect(isManualEntryFilled(createManualEntry("bot"))).toBe(false)
  })

  it("does not depend on role, source or recency alone", () => {
    // Those three always carry a value; if they counted, every untouched row
    // would ask for a confirmation on delete.
    const entry: ManualChampionEntry = {
      ...createManualEntry("mid"),
      role: "jungle" as ScoutRole,
      recency: "old",
      source: "opgg",
    }
    expect(isManualEntryFilled(entry)).toBe(false)
  })
})

/* ==========================================================================
 * 3. withKdaValue — "not stated" is an ABSENT key, never a stored null
 *
 * `ManualChampionEntry.kda` promises (src/scout/types.ts) that a row without a
 * usable KDA serialises exactly as it did before the field existed. That is
 * what lets SCOUT_SCHEMA_VERSION stay at 2: an older build reading such a state
 * finds nothing new, and a newer build reading an older one finds no `kda` and
 * reads that as "not stated".
 *
 * `normalizeManualEntry()` already keeps that promise on load and on save. This
 * helper keeps it one layer earlier, in the editor's own state, so the promise
 * holds even between two saves — and so `JSON.stringify` of an untouched row is
 * byte-for-byte what it was. `{ ...entry, kda: null }` would look harmless and
 * break exactly that.
 * ========================================================================== */

describe("withKdaValue", () => {
  const filled: ManualChampionEntry = {
    ...createManualEntry("mid"),
    championName: "Ahri",
    games: 12,
    winrate: 58,
    note: "smurf",
  }

  it("writes a stated number onto the row", () => {
    expect(withKdaValue(filled, 3.2).kda).toBe(3.2)
    expect(withKdaValue(filled, 12).kda).toBe(12)
  })

  it("keeps a stated 0 — a real bad value, not an empty field", () => {
    const out = withKdaValue(filled, 0)
    expect(out.kda).toBe(0)
    // The falsiness trap: `if (kda)` here would drop a genuine 0 and turn the
    // worst KDA in the list into "not stated", which scores NEUTRALLY.
    expect(Object.hasOwn(out, "kda")).toBe(true)
    expect(Object.keys(out)).toContain("kda")
  })

  it("REMOVES the key for 'not stated' instead of storing null", () => {
    const stated = withKdaValue(filled, 4.1)
    const cleared = withKdaValue(stated, null)

    expect(cleared.kda).toBeUndefined()
    expect("kda" in cleared).toBe(false)
    expect(Object.hasOwn(cleared, "kda")).toBe(false)
    expect(Object.keys(cleared)).not.toContain("kda")
    // The reason the three checks above are not just style: only this one fails
    // for `{ ...entry, kda: null }`, and that is the whole point of the helper.
    expect(JSON.stringify(cleared)).not.toContain("kda")
  })

  it("leaves a row that never had a KDA byte-for-byte unchanged", () => {
    const fresh = createManualEntry("top")
    expect(JSON.stringify(withKdaValue(fresh, null))).toBe(JSON.stringify(fresh))
  })

  it("touches no other field", () => {
    for (const value of [3.2, 0, null] as const) {
      const out = withKdaValue(filled, value)
      expect(out.championName, String(value)).toBe("Ahri")
      expect(out.games, String(value)).toBe(12)
      expect(out.winrate, String(value)).toBe(58)
      expect(out.note, String(value)).toBe("smurf")
      expect(out.role, String(value)).toBe(filled.role)
      expect(out.source, String(value)).toBe(filled.source)
      expect(out.recency, String(value)).toBe(filled.recency)
      expect(out.id, String(value)).toBe(filled.id)
    }
  })

  it("does not mutate the row it is handed", () => {
    const before = JSON.stringify(filled)
    withKdaValue(filled, 5)
    withKdaValue({ ...filled, kda: 5 }, null)
    expect(JSON.stringify(filled)).toBe(before)
    expect(filled.kda).toBeUndefined()
  })
})

/* ==========================================================================
 * 4. roleMismatchHint — only speaks about a slot the player really holds
 * ========================================================================== */

describe("roleMismatchHint", () => {
  it("stays silent when there is nothing to warn about", () => {
    expect(roleMismatchHint(t, "mid", "mid")).toBeNull()
    // `undefined` is the bench/pool case: no slot, so nothing to contradict.
    expect(roleMismatchHint(t, "mid", undefined)).toBeNull()
    expect(roleMismatchHint(t, "unknown", undefined)).toBeNull()
  })

  it("explains an off-role row with both role labels filled in", () => {
    const hint = roleMismatchHint(t, "mid", "jungle")

    expect(hint).toBe(
      "Auf Mid gespielt, aufgestellt aber als Jungle. Ein Ban trifft die geplante Lane möglicherweise nicht.",
    )
    expect(hint).not.toContain("{")
  })

  it("uses the unknown/flex wording when the row's own role is unknown", () => {
    const hint = roleMismatchHint(t, "unknown", "support")

    expect(hint).toContain("Rolle unklar oder Flex")
    expect(hint).toContain("Unbekannt")
    expect(hint).toContain("Support")
    expect(hint).not.toContain("{")
  })

  it("renders 'bot' with its ADC label, never the internal identifier", () => {
    const hint = roleMismatchHint(t, "bot", "top")

    expect(hint).toContain("ADC")
    expect(hint).not.toContain("bot")
  })

  it("works in English too — no German text leaks through", () => {
    const hint = roleMismatchHint(tEn, "mid", "jungle")

    expect(hint).toBe(
      "Played in Mid but fielded as Jungle. A ban may not hit the lane you are planning for.",
    )
  })

  it("says nothing about a player who holds no starting slot", () => {
    const lineup = emptyLineup()

    // A new row may still start on the parser's guess — a pre-selected dropdown
    // claims nothing. The hint does claim something ("fielded as Jungle"), so it
    // is fed from the lineup instead, which knows this player from nowhere.
    expect(defaultRoleForPlayer(lineup, benchPlayer)).toBe("jungle")
    expect(lineupStarterSlot(lineup, benchPlayer.id)).toBeNull()

    const lineupRole = lineupStarterSlot(lineup, benchPlayer.id) ?? undefined
    expect(roleMismatchHint(t, "support", lineupRole)).toBeNull()
  })

  it("cannot be handed a role that was only guessed", () => {
    // Compile-time half of the rule above — checked by npm run typecheck:tests,
    // not by vitest. Widening the parameter back to ScoutRole would let
    // ScoutPlayer.role (and with it defaultRole) through again, and the false
    // "fielded as …" sentence would return for every bench and pool player.
    type LineupParam = Parameters<typeof roleMismatchHint>[2]
    const accepted: LineupParam[] = [...SCOUT_LINEUP_SLOTS, undefined]
    // @ts-expect-error "unknown" is a ScoutRole, never a starting slot
    const rejected: LineupParam = "unknown"

    expect(accepted).toHaveLength(SCOUT_LINEUP_SLOTS.length + 1)
    expect(rejected).toBe("unknown")
  })

  it("never leaves a placeholder unresolved for any role pair", () => {
    const lineupRoles = [...SCOUT_LINEUP_SLOTS, undefined] as const

    for (const signalRole of SCOUT_ROLE_VALUES) {
      for (const lineupRole of lineupRoles) {
        const hint = roleMismatchHint(t, signalRole, lineupRole)
        if (hint === null) continue
        expect(hint, `${signalRole}/${lineupRole ?? "no slot"}`).not.toMatch(/[{}]/)
      }
    }
  })
})
