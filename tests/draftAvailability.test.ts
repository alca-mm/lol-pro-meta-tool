/**
 * Behaviour tests for draft availability: src/draft/draftAvailability.ts.
 *
 * WHY THIS FILE EXISTS. 0.8.0 built src/draft/draftState.ts as a pure
 * foundation and deliberately did not wire it up; 0.8.1 wires it. The wiring
 * carries one real behaviour change: the existing board compared champions with
 * `normalizeChampionName()` (`trim().toLowerCase()`, src/draft/helpers.ts) while
 * the rest of the app compares them with `championIdentityKey()`, which also
 * resolves against the champion catalogue and ignores punctuation and spacing.
 * `draftAvailabilityKey` moves the board onto the stronger rule. That change is
 * only safe because of a measured fact - neither rule ever merges two DIFFERENT
 * champions - and it is only worth anything because of a second one: the
 * stronger rule catches 19 spelling pairs the weaker one lets through. Both
 * facts are pinned here, because a change nobody can see is a change somebody
 * will quietly revert.
 *
 * WHAT IS AND IS NOT COVERED. Vitest runs in Node here (vite.config.ts,
 * `test.environment: 'node'`) with no jsdom, so this file covers the DECISION
 * and nothing else: given four arrays out of the existing board, what the
 * derived `DraftBoard` is; given a board, which champion keys it has taken; and
 * given a board and a name, whether that name is still available. It renders no
 * board, greys out no champion tile and clicks no slot. Nobody should read this
 * file as "the draft board blocks duplicates" - it says "given a board, the rule
 * underneath it answers the way it is documented to".
 *
 * ONE THING WORTH KNOWING BEFORE CHANGING ANYTHING HERE. `isBanCandidateAvailable`
 * and `filterAvailableBanCandidates` are PREPARED, not wired (see the module
 * header). Their tests therefore pin a rule that nothing renders yet. That is
 * on purpose: the point of pinning it now is that whoever wires it later finds
 * out immediately if the rule shifted underneath them.
 *
 * EVERY ASSERTION HERE HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the tests that turn red for each:
 *
 *   draftAvailabilityKey() reverted to normalizeChampionName()
 *       -> "treats Kai'Sa, KaiSa, kai sa and KAI'SA as one champion"
 *       -> "merges exactly the spellings normalizeChampionName keeps apart"
 *       -> "a banned Kai'Sa also blocks the spelling KaiSa"
 *   draftAvailabilityKey() collapsing everything (e.g. a constant key)
 *       -> "gives two different champions two different keys"
 *       -> "merges no two different champions in the whole catalogue"
 *   draftAvailabilityKey() swapped for the bare championLookupKey()
 *       -> "does not merge two non-latin names into one champion"
 *   takenChampionKeys() skipping bans
 *       -> "counts bans and picks alike"
 *       -> "agrees with isChampionTaken, case by case"
 *   takenChampionKeys() skipping picks
 *       -> "counts bans and picks alike"
 *       -> "a champion already picked is no longer available"
 *   takenChampionKeys() dropping the empty-key guard
 *       -> "never puts an empty key in the set"
 *   draftBoardFromSlots() swapping blue and red
 *       -> "puts each array entry in the slot named after it"
 *       -> "keeps the two sides apart"
 *   draftBoardFromSlots() not trimming
 *       -> "stores champion names trimmed"
 *       -> "turns a whitespace-only entry into an empty slot"
 *   draftBoardFromSlots() writing "" instead of null
 *       -> "turns a whitespace-only entry into an empty slot"
 *       -> "builds twenty empty slots in DRAFT_FLOW order"
 *   draftBoardFromSlots() indexing a short array without a guard
 *       -> "survives arrays shorter than the board"
 *   draftBoardFromSlots() spreading the pick slot into the board slot
 *       -> "does not carry PickSlot.role into the board"
 *   filterAvailableBanCandidates() reordering (e.g. sorting)
 *       -> "keeps the candidate order it was given"
 *   filterAvailableBanCandidates() mutating its input
 *       -> "does not touch the candidate list it was handed"
 *   isBanCandidateAvailable() always returning true
 *       -> "a champion already banned is no longer available"
 *       -> "a champion already picked is no longer available"
 *       -> "a banned Kai'Sa also blocks the spelling KaiSa"
 *   isBanCandidateAvailable() treating an empty name as taken
 *       -> "an empty name is available, because it is not a champion"
 */

import { describe, expect, it } from "vitest"

import { ALL_CHAMPIONS } from "../src/analysis/championCatalog"
import { DRAFT_FLOW } from "../src/draft/constants"
import {
  draftAvailabilityKey,
  draftBoardFromSlots,
  filterAvailableBanCandidates,
  isBanCandidateAvailable,
  takenChampionKeys,
} from "../src/draft/draftAvailability"
import type { DraftHelperSlots } from "../src/draft/draftAvailability"
import { draftSlotId, isChampionTaken } from "../src/draft/draftState"
import type { DraftSlot } from "../src/draft/draftState"
import { normalizeChampionName } from "../src/draft/helpers"
import type { PickSlot } from "../src/draft/types"

/* ------------------------------------------------------------------ helpers */

/** One of the existing board's pick slots. */
function pickSlot(championName: string, role: PickSlot["role"] = null): PickSlot {
  return { championName, role }
}

/** Five empty pick slots, the shape DraftHelper actually holds. */
function emptyPickSlots(): PickSlot[] {
  return [pickSlot(""), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")]
}

/** Five empty ban strings. */
function emptyBans(): string[] {
  return ["", "", "", "", ""]
}

/** A full, empty set of the four arrays, with only the named parts replaced. */
function helperSlots(partial: Partial<DraftHelperSlots> = {}): DraftHelperSlots {
  return {
    bluePickSlots: emptyPickSlots(),
    redPickSlots: emptyPickSlots(),
    blueBans: emptyBans(),
    redBans: emptyBans(),
    ...partial,
  }
}

/** A board with these blue bans and blue picks, everything else empty. */
function boardWith(bans: readonly string[], picks: readonly string[]): DraftSlot[] {
  return draftBoardFromSlots(
    helperSlots({ blueBans: [...bans], bluePickSlots: picks.map((name) => pickSlot(name)) }),
  )
}

/** The slot with this id, or a loud failure. */
function slotOf(board: readonly DraftSlot[], slotId: string): DraftSlot {
  const found = board.find((slot) => slot.id === slotId)
  if (found === undefined) throw new Error(`the board has no slot ${slotId}`)
  return found
}

/** What the slot with this id holds. */
function championIn(board: readonly DraftSlot[], slotId: string): string | null {
  return slotOf(board, slotId).championName
}

/** The ids of every slot that holds a champion, in board order. */
function filledSlotIds(board: readonly DraftSlot[]): string[] {
  return board.filter((slot) => slot.championName !== null).map((slot) => slot.id)
}

/** A deep copy of the four arrays, for a real before/after comparison. */
function copyHelperSlots(slots: DraftHelperSlots): DraftHelperSlots {
  return {
    bluePickSlots: slots.bluePickSlots.map((slot) => ({ ...slot })),
    redPickSlots: slots.redPickSlots.map((slot) => ({ ...slot })),
    blueBans: [...slots.blueBans],
    redBans: [...slots.redBans],
  }
}

/** A ban candidate, in the minimal shape filterAvailableBanCandidates accepts. */
interface BanCandidate {
  readonly championName: string
  readonly score: number
}

function candidate(championName: string, score: number): BanCandidate {
  return { championName, score }
}

/* ------------------------------------------------------- draftAvailabilityKey */

describe("draftAvailabilityKey: one basis for 'the same champion'", () => {
  it("treats Kai'Sa, KaiSa, kai sa and KAI'SA as one champion", () => {
    // The literal key is pinned, not just the equality: four calls returning
    // the same wrong value (or the same empty string) would satisfy equality.
    expect(draftAvailabilityKey("Kai'Sa")).toBe("kaisa")
    expect(draftAvailabilityKey("KaiSa")).toBe("kaisa")
    expect(draftAvailabilityKey("kai sa")).toBe("kaisa")
    expect(draftAvailabilityKey("KAI'SA")).toBe("kaisa")
  })

  it("gives two different champions two different keys", () => {
    expect(draftAvailabilityKey("Ahri")).toBe("ahri")
    expect(draftAvailabilityKey("Akali")).toBe("akali")
    expect(draftAvailabilityKey("Ahri")).not.toBe(draftAvailabilityKey("Akali"))

    // The two that look most alike after punctuation is stripped, so this is
    // not a comparison between two obviously unrelated words.
    expect(draftAvailabilityKey("Nunu & Willump")).not.toBe(draftAvailabilityKey("Nautilus"))
    expect(draftAvailabilityKey("Lee Sin")).not.toBe(draftAvailabilityKey("Master Yi"))
  })

  it("does not merge two non-latin names into one champion", () => {
    // The reason draftAvailabilityKey delegates to championIdentityKey and not
    // to the bare championLookupKey (module header, and P4e in CLAUDE.md):
    // the lookup key strips everything outside a-z0-9, so a Korean name reduces
    // to the EMPTY STRING - and the empty string is a perfectly good Map key,
    // so every such champion would compare equal to every other.
    expect(draftAvailabilityKey("아리")).not.toBe("")
    expect(draftAvailabilityKey("아리")).not.toBe(draftAvailabilityKey("야스오"))

    // And the consequence on a board, which is what the defect would look like:
    // banning one Korean name would block every other.
    const board = boardWith(["아리"], [])
    expect(isBanCandidateAvailable("아리", board), "the very name that was banned").toBe(false)
    expect(isBanCandidateAvailable("야스오", board), "a different champion").toBe(true)
  })

  it("gives an empty or whitespace-only name an empty key", () => {
    expect(draftAvailabilityKey("")).toBe("")
    expect(draftAvailabilityKey("   ")).toBe("")
    expect(draftAvailabilityKey("\t\n ")).toBe("")
  })

  it("merges exactly the spellings normalizeChampionName keeps apart", () => {
    // THE documented behaviour change of 0.8.1, written out on BOTH sides. If
    // draftAvailabilityKey is ever pointed back at normalizeChampionName, the
    // second half of every pair below fails - which is the whole point of
    // pinning the old rule here rather than only the new one.
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["Kai'Sa", "KaiSa"],
      ["Dr. Mundo", "Dr Mundo"],
      ["Nunu & Willump", "Nunu Willump"],
      ["Lee Sin", "LeeSin"],
      ["K'Sante", "KSante"],
    ]

    for (const [written, typed] of pairs) {
      expect(
        normalizeChampionName(written),
        `normalizeChampionName was expected to keep ${written} and ${typed} apart`,
      ).not.toBe(normalizeChampionName(typed))

      expect(
        draftAvailabilityKey(written),
        `draftAvailabilityKey was expected to merge ${written} and ${typed}`,
      ).toBe(draftAvailabilityKey(typed))
    }

    // The merged keys, literally, so "both sides return the same empty string"
    // cannot pass for a merge.
    expect(draftAvailabilityKey("Dr Mundo")).toBe("drmundo")
    expect(draftAvailabilityKey("Nunu Willump")).toBe("nunuwillump")
    expect(draftAvailabilityKey("LeeSin")).toBe("leesin")
    expect(draftAvailabilityKey("KSante")).toBe("ksante")

    // ANTI-VACUITY: normalizeChampionName is not simply blind. It merges case
    // and surrounding whitespace perfectly well - what it cannot do is
    // punctuation and inner spacing, which is exactly the gap above.
    expect(normalizeChampionName("  AHRI ")).toBe("ahri")
    expect(normalizeChampionName("Ahri")).toBe("ahri")
  })

  it("merges no two different champions in the whole catalogue", () => {
    // THE COUNTER-PROOF to the test above. Without this, a key function that
    // returned a constant would pass every merge assertion in this file.
    const byKey = new Map<string, Set<string>>()
    for (const champion of ALL_CHAMPIONS) {
      const key = draftAvailabilityKey(champion)
      const bucket = byKey.get(key) ?? new Set<string>()
      bucket.add(champion)
      byKey.set(key, bucket)
    }

    const collisions = [...byKey.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([key, names]) => `${key}: ${[...names].join(" / ")}`)

    expect(collisions).toEqual([])
    expect(collisions.length).toBe(0)

    // Same statement from the other side: every catalogue champion still has
    // its own key.
    expect(byKey.size).toBe(new Set(ALL_CHAMPIONS).size)

    // And no champion reduced to the empty key, which is the failure mode
    // CLAUDE.md records for the bare championLookupKey.
    expect([...byKey.keys()].filter((key) => key === "")).toEqual([])

    // ANTI-VACUITY: an emptied catalogue would make all of the above trivially
    // true, and the five names of the previous test have to be in the scan.
    expect(ALL_CHAMPIONS.length).toBeGreaterThanOrEqual(150)
    for (const champion of ["Kai'Sa", "Dr. Mundo", "Nunu & Willump", "Lee Sin", "K'Sante"]) {
      expect(ALL_CHAMPIONS, `${champion} has to be part of the scan`).toContain(champion)
    }
  })
})

/* ------------------------------------------------------- draftBoardFromSlots */

describe("draftBoardFromSlots: the bridge from the existing board", () => {
  it("builds twenty empty slots in DRAFT_FLOW order", () => {
    const board = draftBoardFromSlots(helperSlots())

    expect(board).toHaveLength(20)

    // Compared against the canonical flow, never against a transcribed array:
    // a transcription is the second source of truth both modules were written
    // to avoid, and it would agree with a reordered DRAFT_FLOW just as readily.
    expect(board.map((slot) => [slot.action, slot.side, slot.index])).toEqual(
      DRAFT_FLOW.map((step) => [step.type, step.visualSide, step.index]),
    )
    expect(board.map((slot) => slot.id)).toEqual(
      DRAFT_FLOW.map((step) => draftSlotId(step.type, step.visualSide, step.index)),
    )
    expect(board.map((slot) => slot.order)).toEqual(DRAFT_FLOW.map((_step, index) => index))

    // Empty means null, never the empty string - DraftSlot.championName says so.
    expect(board.map((slot) => slot.championName)).toEqual(DRAFT_FLOW.map(() => null))

    // ANTI-VACUITY: an emptied DRAFT_FLOW would satisfy every comparison above.
    expect(DRAFT_FLOW).toHaveLength(20)
  })

  it("puts each array entry in the slot named after it", () => {
    const board = draftBoardFromSlots(
      helperSlots({
        blueBans: ["Ahri", "", "Zed", "", ""],
        redBans: ["", "", "", "", "Yasuo"],
        bluePickSlots: [
          pickSlot(""),
          pickSlot(""),
          pickSlot(""),
          pickSlot("Lulu"),
          pickSlot(""),
        ],
        redPickSlots: [
          pickSlot("Jinx"),
          pickSlot(""),
          pickSlot("Sett"),
          pickSlot(""),
          pickSlot(""),
        ],
      }),
    )

    expect(championIn(board, "ban-blue-0")).toBe("Ahri")
    expect(championIn(board, "ban-blue-2")).toBe("Zed")
    expect(championIn(board, "ban-red-4")).toBe("Yasuo")
    expect(championIn(board, "pick-blue-3")).toBe("Lulu")
    expect(championIn(board, "pick-red-0")).toBe("Jinx")
    expect(championIn(board, "pick-red-2")).toBe("Sett")

    // And nothing else was filled, so "writes the name everywhere" cannot pass.
    expect(filledSlotIds(board).sort()).toEqual(
      ["ban-blue-0", "ban-blue-2", "ban-red-4", "pick-blue-3", "pick-red-0", "pick-red-2"].sort(),
    )
  })

  it("keeps the two sides apart", () => {
    // Same index on both sides, different champion, so a blue/red swap cannot
    // hide behind a symmetric fixture.
    const board = draftBoardFromSlots(
      helperSlots({
        blueBans: ["Ahri", "", "", "", ""],
        redBans: ["Zed", "", "", "", ""],
        bluePickSlots: [pickSlot("Lulu"), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
        redPickSlots: [pickSlot("Jinx"), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
      }),
    )

    expect(championIn(board, "ban-blue-0")).toBe("Ahri")
    expect(championIn(board, "ban-red-0")).toBe("Zed")
    expect(championIn(board, "pick-blue-0")).toBe("Lulu")
    expect(championIn(board, "pick-red-0")).toBe("Jinx")
  })

  it("turns a whitespace-only entry into an empty slot", () => {
    const board = draftBoardFromSlots(
      helperSlots({
        blueBans: ["  ", "\t", "", "", ""],
        bluePickSlots: [pickSlot("   "), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
      }),
    )

    expect(championIn(board, "ban-blue-0")).toBeNull()
    expect(championIn(board, "ban-blue-1")).toBeNull()
    expect(championIn(board, "pick-blue-0")).toBeNull()

    // Explicitly not the string it was given, and explicitly not "".
    expect(championIn(board, "ban-blue-0")).not.toBe("  ")
    expect(championIn(board, "pick-blue-0")).not.toBe("")
    expect(filledSlotIds(board)).toEqual([])
  })

  it("stores champion names trimmed", () => {
    const board = draftBoardFromSlots(
      helperSlots({
        blueBans: ["  Ahri  ", "", "", "", ""],
        redPickSlots: [pickSlot("\tJinx\n"), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
      }),
    )

    expect(championIn(board, "ban-blue-0")).toBe("Ahri")
    expect(championIn(board, "pick-red-0")).toBe("Jinx")
  })

  it("survives arrays shorter than the board", () => {
    // A short array is a caller's bug; crashing the draft board over it would
    // be worse than showing an empty slot (module header).
    const board = draftBoardFromSlots({
      blueBans: ["Ahri", "Zed"],
      redBans: [],
      bluePickSlots: [pickSlot("Lulu")],
      redPickSlots: [],
    })

    expect(board).toHaveLength(20)
    expect(championIn(board, "ban-blue-0")).toBe("Ahri")
    expect(championIn(board, "ban-blue-1")).toBe("Zed")
    expect(championIn(board, "ban-blue-2")).toBeNull()
    expect(championIn(board, "ban-blue-4")).toBeNull()
    expect(championIn(board, "ban-red-0")).toBeNull()
    expect(championIn(board, "pick-blue-0")).toBe("Lulu")
    expect(championIn(board, "pick-blue-4")).toBeNull()
    expect(championIn(board, "pick-red-4")).toBeNull()
    expect(filledSlotIds(board)).toEqual(["ban-blue-0", "ban-blue-1", "pick-blue-0"])
  })

  it("does not touch the arrays it was handed", () => {
    const slots = helperSlots({
      blueBans: ["  Ahri  ", "", "", "", ""],
      bluePickSlots: [pickSlot("  Lulu  ", "mid"), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
    })
    const before = copyHelperSlots(slots)

    draftBoardFromSlots(slots)

    // A real before/after comparison, not a reference check: trimming in place
    // would keep every reference and still be a mutation.
    expect(slots).toEqual(before)
    expect(slots.blueBans[0]).toBe("  Ahri  ")
    expect(slots.bluePickSlots[0]).toEqual({ championName: "  Lulu  ", role: "mid" })
  })

  it("does not carry PickSlot.role into the board", () => {
    // A DELIBERATE BOUNDARY, not an oversight: DraftSlot has no role field, so
    // the bridge drops it. Pinned so nobody reads the absence as a bug and
    // "fixes" it by spreading the PickSlot into the board slot.
    const board = draftBoardFromSlots(
      helperSlots({
        bluePickSlots: [pickSlot("Lulu", "support"), pickSlot(""), pickSlot(""), pickSlot(""), pickSlot("")],
      }),
    )

    const slot = slotOf(board, "pick-blue-0")

    expect(Object.keys(slot).sort()).toEqual(
      ["action", "championName", "id", "index", "order", "side"].sort(),
    )
    expect("role" in slot).toBe(false)

    // ANTI-VACUITY: the champion itself IS carried, so this is not "nothing
    // crosses the bridge".
    expect(slot.championName).toBe("Lulu")
  })
})

/* ---------------------------------------------------------- takenChampionKeys */

describe("takenChampionKeys: what the champion grid greys out against", () => {
  it("finds nothing on an empty board", () => {
    const keys = takenChampionKeys(draftBoardFromSlots(helperSlots()))

    expect(keys.size).toBe(0)
    expect([...keys]).toEqual([])
  })

  it("counts bans and picks alike", () => {
    const keys = takenChampionKeys(boardWith(["Ahri"], ["Zed"]))

    expect([...keys].sort()).toEqual(["ahri", "zed"])
    expect(keys.has("ahri")).toBe(true)
    expect(keys.has("zed")).toBe(true)
    expect(keys.size).toBe(2)
  })

  it("counts two spellings of one champion once", () => {
    const keys = takenChampionKeys(boardWith(["Kai'Sa"], ["KaiSa"]))

    expect([...keys]).toEqual(["kaisa"])
    expect(keys.size).toBe(1)
  })

  it("never puts an empty key in the set", () => {
    const board = draftBoardFromSlots(
      helperSlots({ blueBans: ["Ahri", "  ", "", "", ""] }),
    )
    const keys = takenChampionKeys(board)

    expect(keys.has("")).toBe(false)
    expect([...keys]).toEqual(["ahri"])
    expect(keys.size).toBe(1)

    // AND the guard inside takenChampionKeys, which the board above cannot
    // reach: draftBoardFromSlots writes null for an empty entry, so the only
    // way to hand the helper a non-null name with an empty identity key is to
    // build the slot by hand. DraftSlot.championName says "never ''", so this
    // is a slot the contract forbids - which is exactly the case the guard is
    // there for. Without asserting it here, removing the guard changes nothing
    // any test can see.
    const malformed: DraftSlot[] = board.map((slot) =>
      slot.id === "ban-red-0"
        ? { ...slot, championName: "" }
        : slot.id === "ban-red-1"
          ? { ...slot, championName: "   " }
          : slot,
    )
    const malformedKeys = takenChampionKeys(malformed)

    expect(malformedKeys.has("")).toBe(false)
    expect([...malformedKeys]).toEqual(["ahri"])
    expect(malformedKeys.size).toBe(1)
  })
})

/* ------------------------------- isBanCandidateAvailable / filterAvailableBans */

describe("isBanCandidateAvailable: prepared for the ban plan, not yet wired", () => {
  it("a champion already banned is no longer available", () => {
    const board = boardWith(["Ahri"], [])

    expect(isBanCandidateAvailable("Ahri", board)).toBe(false)
  })

  it("a champion already picked is no longer available", () => {
    const board = boardWith([], ["Zed"])

    expect(isBanCandidateAvailable("Zed", board)).toBe(false)
  })

  it("a champion nobody touched stays available", () => {
    const board = boardWith(["Ahri"], ["Zed"])

    expect(isBanCandidateAvailable("Yasuo", board)).toBe(true)
  })

  it("a banned Kai'Sa also blocks the spelling KaiSa", () => {
    const board = boardWith(["Kai'Sa"], [])

    expect(isBanCandidateAvailable("KaiSa", board)).toBe(false)
    expect(isBanCandidateAvailable("kai sa", board)).toBe(false)

    // And the other way round, so the merge is not one-directional.
    const typedBoard = boardWith(["KaiSa"], [])
    expect(isBanCandidateAvailable("Kai'Sa", typedBoard)).toBe(false)
  })

  it("an empty name is available, because it is not a champion", () => {
    const board = boardWith(["Ahri"], ["Zed"])

    expect(isBanCandidateAvailable("", board)).toBe(true)
    expect(isBanCandidateAvailable("   ", board)).toBe(true)
  })

  it("everything is available on an empty board", () => {
    const board = draftBoardFromSlots(helperSlots())

    for (const champion of ["Ahri", "Zed", "Kai'Sa", "Nunu & Willump"]) {
      expect(isBanCandidateAvailable(champion, board), champion).toBe(true)
    }
  })
})

describe("filterAvailableBanCandidates: filters, never reorders", () => {
  it("keeps the candidate order it was given", () => {
    // Deliberately not alphabetical and not sorted by score, so a sort mutant
    // cannot pass by accident.
    const candidates = [
      candidate("Zed", 0.4),
      candidate("Ahri", 0.9),
      candidate("Yasuo", 0.7),
      candidate("Kai'Sa", 0.5),
    ]

    const untouched = filterAvailableBanCandidates(candidates, draftBoardFromSlots(helperSlots()))
    expect(untouched.map((entry) => entry.championName)).toEqual([
      "Zed",
      "Ahri",
      "Yasuo",
      "Kai'Sa",
    ])

    const filtered = filterAvailableBanCandidates(candidates, boardWith(["Ahri"], []))
    expect(filtered.map((entry) => entry.championName)).toEqual(["Zed", "Yasuo", "Kai'Sa"])

    // The survivors come back as the very objects that went in: the helper
    // filters, it does not rebuild.
    expect(filtered[0]).toBe(candidates[0])
  })

  it("drops a candidate a spelling variant of which is on the board", () => {
    const candidates = [candidate("Kai'Sa", 0.8), candidate("Zed", 0.6)]

    const filtered = filterAvailableBanCandidates(candidates, boardWith([], ["KaiSa"]))

    expect(filtered.map((entry) => entry.championName)).toEqual(["Zed"])
  })

  it("keeps a candidate with an empty name, which no board can take", () => {
    const candidates = [candidate("", 0.1), candidate("Ahri", 0.9)]

    const filtered = filterAvailableBanCandidates(candidates, boardWith(["Ahri"], []))

    expect(filtered.map((entry) => entry.championName)).toEqual([""])
  })

  it("does not touch the candidate list it was handed", () => {
    const candidates = [candidate("Zed", 0.4), candidate("Ahri", 0.9), candidate("Yasuo", 0.7)]
    const before = candidates.map((entry) => ({ ...entry }))

    const filtered = filterAvailableBanCandidates(candidates, boardWith(["Ahri"], []))

    // A real before/after comparison, not a reference check.
    expect(candidates).toEqual(before)
    expect(candidates).toHaveLength(3)
    expect(candidates.map((entry) => entry.championName)).toEqual(["Zed", "Ahri", "Yasuo"])
    expect(filtered).not.toBe(candidates)
  })
})

/* ---------------------------------------------- the invariant with the board */

describe("takenChampionKeys and isChampionTaken never disagree", () => {
  it("agrees with isChampionTaken, case by case", () => {
    // THE invariant that holds display and decision together. If it breaks, the
    // champion grid greys out something other than what the board refuses, and
    // nothing on screen explains it (draftAvailability.ts module header).
    const board = boardWith(["Kai'Sa", "Ahri"], ["Zed"])
    const keys = takenChampionKeys(board)

    const cases: ReadonlyArray<readonly [string, boolean]> = [
      ["Ahri", true], // banned
      ["Zed", true], // picked
      ["Yasuo", false], // uninvolved
      ["KaiSa", true], // spelling variant of a banned champion
      ["kai sa", true], // and another one
      ["ahri", true], // case only
      ["", false], // not a champion
      ["   ", false], // still not a champion
    ]

    for (const [championName, expected] of cases) {
      const label = championName === "" ? "(empty)" : championName

      // The literal expectation is pinned as well: without it, two functions
      // that both answered "false" always would satisfy the agreement.
      expect(isChampionTaken(board, championName), `isChampionTaken ${label}`).toBe(expected)
      expect(keys.has(draftAvailabilityKey(championName)), `takenChampionKeys ${label}`).toBe(
        expected,
      )

      // And the prepared ban-plan rule is the exact negation of the same
      // answer, so it cannot drift away from either.
      expect(isBanCandidateAvailable(championName, board), `available ${label}`).toBe(!expected)
    }
  })
})
