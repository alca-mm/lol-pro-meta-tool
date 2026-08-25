/**
 * Behaviour tests for the draft board as DATA: src/draft/draftState.ts.
 *
 * WHY THIS FILE EXISTS. 0.8.0 starts the Draft War Room programme by pulling the
 * RULE of a draft out of the component that renders one. `DraftHelper.tsx` is
 * 2041 lines of JSX and state, and Vitest runs in Node here
 * (vite.config.ts, `test.environment: 'node'`) with no jsdom, so nothing inside
 * it can be tested at all. The extraction only buys something if the extracted
 * rule is actually pinned - otherwise it removes the drift risk this project has
 * hit repeatedly (`ScoutManualSource` in three places, `overwrittenRows` against
 * `removedExistingRows`, `banPhaseCounts()` against `prioritizedBans`) and
 * verifies nothing. Same argument as tests/championSelection.test.ts and
 * tests/comboboxIds.test.ts.
 *
 * WHAT IS AND IS NOT COVERED. This file covers the DECISION and nothing else:
 * given a board and a slot id and a champion name, what the next board is, or
 * why there is none. It renders no board, clicks no slot, and says nothing about
 * the existing draft UI, about slot activation, about focus or about what a
 * screen reader announces. Nobody should read this file as "the draft board
 * works" - it says "given an action, the right slot changes and the wrong ones
 * do not".
 *
 * THE ORDER IS NOT RESTATED HERE EITHER. The board's sequence is asserted
 * against {@link DRAFT_FLOW} itself, never against a copied twenty-line array.
 * A copy would be exactly the second source of truth the module was written to
 * avoid, and it would agree with a reordered `DRAFT_FLOW` as readily as with the
 * right one. What IS written out literally are the three landmarks of the real
 * tournament order - first slot Blue Ban 1, seventh slot Blue Pick 1, second ban
 * phase opening on Red Ban 4 - because those pin the flow itself, which the
 * derived comparison cannot.
 *
 * EVERY ASSERTION HERE HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the tests that turn red for each:
 *
 *   the duplicate guard in applyDraftAction removed
 *       -> "refuses a champion that is already banned somewhere else"
 *       -> "refuses a champion that is already picked somewhere else"
 *       -> "refuses the same champion under a different spelling"
 *   championIdentityKey() swapped for a raw === comparison
 *       -> "treats Kai'Sa, KaiSa and kai sa as one champion"
 *       -> "refuses the same champion under a different spelling"
 *   championIdentityKey() swapped for the bare championLookupKey()
 *       -> "does not merge two non-latin names into one champion"
 *   removeDraftAction clearing the wrong slot
 *       -> "clears the slot it was given and leaves its neighbours alone"
 *       -> "empties the right slot out of three filled ones"
 *   applyDraftAction mutating the board it was given
 *       -> "does not touch the board it was handed"
 *       -> "returns a new array rather than the one it was given"
 *   removeDraftAction mutating the board it was given
 *       -> "does not touch the board it was handed either"
 *   nextDraftAction reading the array position instead of `order`
 *       -> "reads `order`, not the position in the array"
 *   the slot id scheme changed
 *       -> "builds an id out of action, side and index"
 *       -> "gives every slot the id draftSlotId() would build for it"
 *   the self-replacement exception removed
 *       -> "lets a slot be set to the champion it already holds"
 *       -> "lets a slot be re-set under a different spelling of its own champion"
 */

import { describe, expect, it } from "vitest"

import { DRAFT_FLOW } from "../src/draft/constants"
import {
  applyDraftAction,
  createDraftBoard,
  draftSlotId,
  isChampionTaken,
  nextDraftAction,
  removeDraftAction,
} from "../src/draft/draftState"
import type { DraftActionResult, DraftBoard, DraftSlot } from "../src/draft/draftState"

/* ------------------------------------------------------------------ helpers */

/**
 * Unwrap a result that is expected to have succeeded.
 *
 * Throws rather than returning something wrong, so a refusal shows up as a
 * named reason instead of as a confusing assertion three lines later.
 */
function boardAfter(result: DraftActionResult): DraftSlot[] {
  if (!result.ok) {
    throw new Error(`expected the action to succeed, but it was refused: ${result.reason}`)
  }
  return result.board
}

/** The slot with this id, or a loud failure. */
function slotOf(board: DraftBoard, slotId: string): DraftSlot {
  const found = board.find((slot) => slot.id === slotId)
  if (found === undefined) throw new Error(`the board has no slot ${slotId}`)
  return found
}

/** What the slot with this id holds. */
function championIn(board: DraftBoard, slotId: string): string | null {
  return slotOf(board, slotId).championName
}

/** Apply a list of `[slotId, championName]` pairs in order, all expected to succeed. */
function fill(board: DraftBoard, entries: ReadonlyArray<readonly [string, string]>): DraftBoard {
  let current: DraftBoard = board
  for (const [slotId, championName] of entries) {
    current = boardAfter(applyDraftAction(current, slotId, championName))
  }
  return current
}

/** A deep copy, for a real before/after comparison rather than a reference check. */
function deepCopy(board: DraftBoard): DraftSlot[] {
  return board.map((slot) => ({ ...slot }))
}

/** How many slots hold a champion. */
function filledCount(board: DraftBoard): number {
  return board.filter((slot) => slot.championName !== null).length
}

/**
 * Twenty distinct champions, enough to fill a whole board.
 *
 * Catalog spellings on purpose: `championIdentityKey()` resolves through the
 * catalog, so these are twenty genuinely different identities and not twenty
 * strings that happen to differ.
 */
const TWENTY_CHAMPIONS: readonly string[] = [
  "Aatrox",
  "Ahri",
  "Akali",
  "Akshan",
  "Alistar",
  "Ambessa",
  "Amumu",
  "Anivia",
  "Annie",
  "Aphelios",
  "Ashe",
  "Aurelion Sol",
  "Aurora",
  "Azir",
  "Bard",
  "Bel'Veth",
  "Blitzcrank",
  "Brand",
  "Braum",
  "Briar",
]

/* --------------------------------------------------------- board creation */

describe("createDraftBoard: twenty slots, in tournament order", () => {
  it("hands out twenty slots: ten bans, ten picks, five per side per action", () => {
    const board = createDraftBoard()

    expect(board).toHaveLength(20)
    expect(board.filter((slot) => slot.action === "ban")).toHaveLength(10)
    expect(board.filter((slot) => slot.action === "pick")).toHaveLength(10)

    for (const action of ["ban", "pick"] as const) {
      for (const side of ["blue", "red"] as const) {
        expect(
          board.filter((slot) => slot.action === action && slot.side === side),
          `${side} ${action}s`,
        ).toHaveLength(5)
      }
    }

    // And the indices inside each of those four groups are 0..4 without a gap,
    // so "five slots" cannot be five copies of the same coordinates.
    for (const action of ["ban", "pick"] as const) {
      for (const side of ["blue", "red"] as const) {
        const indices = board
          .filter((slot) => slot.action === action && slot.side === side)
          .map((slot) => slot.index)
          .sort((a, b) => a - b)
        expect(indices, `${side} ${action} indices`).toEqual([0, 1, 2, 3, 4])
      }
    }
  })

  it("follows DRAFT_FLOW itself, not a second copy of the sequence", () => {
    const board = createDraftBoard()

    // Compared against the canonical flow, never against a transcribed array:
    // a transcription would be the two-sources-of-truth defect the module
    // header calls out by name.
    expect(board.map((slot) => [slot.action, slot.side, slot.index])).toEqual(
      DRAFT_FLOW.map((step) => [step.type, step.visualSide, step.index]),
    )

    // ANTI-VACUITY: the comparison above is satisfied by two empty arrays.
    expect(DRAFT_FLOW, "an emptied DRAFT_FLOW would make the comparison prove nothing").toHaveLength(
      20,
    )
  })

  it("opens on Blue Ban 1, which the derived comparison above cannot prove", () => {
    const board = createDraftBoard()

    expect(board[0].action).toBe("ban")
    expect(board[0].side).toBe("blue")
    expect(board[0].index).toBe(0)
    expect(board[0].order).toBe(0)
    expect(board[0].id).toBe("ban-blue-0")
  })

  it("puts Blue Pick 1 seventh, right after the first ban phase", () => {
    const board = createDraftBoard()

    expect(board[6].action).toBe("pick")
    expect(board[6].side).toBe("blue")
    expect(board[6].index).toBe(0)
    expect(board[6].order).toBe(6)
    expect(board[6].id).toBe("pick-blue-0")

    // The slot before it is still a ban, so "seventh" really is the boundary.
    expect(board[5].action).toBe("ban")
  })

  it("opens the second ban phase on Red Ban 4, thirteenth in the draft", () => {
    const board = createDraftBoard()

    expect(board[12].action).toBe("ban")
    expect(board[12].side).toBe("red")
    expect(board[12].index).toBe(3)
    expect(board[12].order).toBe(12)
    expect(board[12].id).toBe("ban-red-3")

    // Red bans first in this phase, blue bans first in the opening one. That
    // asymmetry is the whole point of pinning this landmark.
    expect(board[13].side).toBe("blue")
    expect(board[13].action).toBe("ban")
  })

  it("numbers the slots 0 to 19 with no gap and no repeat", () => {
    const board = createDraftBoard()

    expect(board.map((slot) => slot.order)).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it("builds an id out of action, side and index", () => {
    // The scheme itself, written out. Without these literals the test below is
    // circular: it would compare draftSlotId() against itself.
    expect(draftSlotId("ban", "blue", 0)).toBe("ban-blue-0")
    expect(draftSlotId("ban", "red", 4)).toBe("ban-red-4")
    expect(draftSlotId("pick", "blue", 0)).toBe("pick-blue-0")
    expect(draftSlotId("pick", "red", 4)).toBe("pick-red-4")
  })

  it("gives every slot the id draftSlotId() would build for it, and no two the same", () => {
    const board = createDraftBoard()
    const ids = board.map((slot) => slot.id)

    expect(new Set(ids).size, "two slots sharing an id would make them one slot").toBe(20)

    let checked = 0
    for (const slot of board) {
      expect(slot.id, `slot at order ${slot.order}`).toBe(
        draftSlotId(slot.action, slot.side, slot.index),
      )
      checked += 1
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(20)
  })

  it("starts every slot empty, with null rather than an empty string", () => {
    const board = createDraftBoard()

    expect(board.map((slot) => slot.championName)).toEqual(Array.from({ length: 20 }, () => null))
    expect(filledCount(board)).toBe(0)
  })

  it("shares nothing between two boards: neither the array nor a single slot", () => {
    const first = createDraftBoard()
    const second = createDraftBoard()

    expect(first).not.toBe(second)
    expect(first, "they still have to be equal, only not the same objects").toEqual(second)

    let checked = 0
    for (let i = 0; i < first.length; i += 1) {
      expect(
        first[i],
        `slot ${i} is the same object in both boards; filling one would fill the other`,
      ).not.toBe(second[i])
      checked += 1
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(20)
  })
})

/* ------------------------------------------------------- isChampionTaken */

describe("isChampionTaken: is this champion anywhere on the board", () => {
  it("finds nothing on an empty board", () => {
    const board = createDraftBoard()

    expect(isChampionTaken(board, "Ahri")).toBe(false)
    expect(isChampionTaken(board, "Zed")).toBe(false)
  })

  it("finds a champion that was banned", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])

    expect(isChampionTaken(board, "Ahri")).toBe(true)
  })

  it("finds a champion that was picked", () => {
    const board = fill(createDraftBoard(), [["pick-red-2", "Zed"]])

    expect(isChampionTaken(board, "Zed")).toBe(true)
  })

  it("leaves every other champion alone", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])

    // The other half of the previous two tests: "always true" would pass them.
    expect(isChampionTaken(board, "Zed")).toBe(false)
    expect(isChampionTaken(board, "Jinx")).toBe(false)
  })

  it("treats Kai'Sa, KaiSa and kai sa as one champion", () => {
    // THE LOAD-BEARING TEST OF THIS SECTION. A raw `===` comparison passes every
    // other test in this file's isChampionTaken section and fails this one.
    const board = fill(createDraftBoard(), [["ban-blue-0", "Kai'Sa"]])

    expect(isChampionTaken(board, "Kai'Sa"), "the spelling that was stored").toBe(true)
    expect(isChampionTaken(board, "KaiSa"), "apostrophe dropped").toBe(true)
    expect(isChampionTaken(board, "kai sa"), "apostrophe turned into a space, lower case").toBe(true)
    expect(isChampionTaken(board, "KAI SA"), "upper case").toBe(true)

    // And the other direction: stored without the apostrophe, asked with it.
    const boardStoredPlain = fill(createDraftBoard(), [["ban-blue-0", "KaiSa"]])
    expect(isChampionTaken(boardStoredPlain, "Kai'Sa")).toBe(true)

    // ANTI-VACUITY: the merge must not be "everything is taken".
    expect(isChampionTaken(board, "Kalista")).toBe(false)
  })

  it("does not merge two non-latin names into one champion", () => {
    // P4e: championLookupKey() strips everything outside a-z0-9, so a Korean
    // name reduces to the EMPTY STRING and every such name compares equal to
    // every other. championIdentityKey() falls back to the lower-cased name for
    // exactly this case. Routed through the bare lookup key instead, the first
    // expectation below goes false (an empty key is never "taken") and the
    // second could go true.
    const board = fill(createDraftBoard(), [["ban-blue-0", "아리"]])

    expect(isChampionTaken(board, "아리"), "the very name that was stored").toBe(true)
    expect(isChampionTaken(board, "야스오"), "a completely different champion").toBe(false)
  })

  it("never counts an empty or whitespace-only name as taken", () => {
    // Checked on a board that DOES hold champions, so this is not the trivial
    // "an empty board holds nothing".
    const board = fill(createDraftBoard(), [
      ["ban-blue-0", "Ahri"],
      ["pick-blue-0", "Zed"],
    ])

    expect(isChampionTaken(board, "")).toBe(false)
    expect(isChampionTaken(board, " ")).toBe(false)
    expect(isChampionTaken(board, "   \t\n  ")).toBe(false)

    // The board really is populated, so the three answers above are decisions
    // and not an artefact of an empty board.
    expect(isChampionTaken(board, "Ahri")).toBe(true)
    expect(isChampionTaken(board, "Zed")).toBe(true)
  })

  it("does not report a hand-built empty-string slot as a champion", () => {
    // `applyDraftAction` can never store `""` (it refuses blank names), so this
    // state has to be built by hand - and it is what makes the empty-name guard
    // observable at all. `isChampionTaken` takes any `DraftBoard`, so a caller
    // holding one really can hand it this. Without the guard, `""` matches `""`
    // and the board reports a champion whose name is nothing.
    const handBuilt: DraftBoard = createDraftBoard().map((slot) =>
      slot.id === "ban-blue-0" ? { ...slot, championName: "" } : slot,
    )

    expect(championIn(handBuilt, "ban-blue-0"), "the board really does hold an empty name").toBe("")
    expect(isChampionTaken(handBuilt, "")).toBe(false)
    expect(isChampionTaken(handBuilt, "   ")).toBe(false)
    expect(isChampionTaken(handBuilt, "Ahri")).toBe(false)
  })

  it("ignores surrounding whitespace on the name it is asked about", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])

    expect(isChampionTaken(board, "  Ahri  ")).toBe(true)
    expect(isChampionTaken(board, "  Zed  ")).toBe(false)
  })

  it("stops finding a champion once its slot is cleared", () => {
    const banned = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    expect(isChampionTaken(banned, "Ahri")).toBe(true)

    const cleared = boardAfter(removeDraftAction(banned, "ban-blue-0"))
    expect(isChampionTaken(cleared, "Ahri")).toBe(false)
  })
})

/* ------------------------------------------------------- nextDraftAction */

describe("nextDraftAction: the slot the draft is waiting on", () => {
  it("waits on Blue Ban 1 at the start", () => {
    const next = nextDraftAction(createDraftBoard())

    expect(next).not.toBeNull()
    expect(next?.order).toBe(0)
    expect(next?.id).toBe("ban-blue-0")
  })

  it("moves on once the first slot is filled", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const next = nextDraftAction(board)

    expect(next?.order).toBe(1)
    expect(next?.id, "Red Ban 1 answers the first blue ban").toBe("ban-red-0")
  })

  it("goes back to a gap rather than carrying on from the last filled slot", () => {
    // The mutant this is aimed at is "resume after the highest filled order",
    // or a counter of how many slots are filled. Both would answer order 3 here.
    // It does NOT discriminate "the first empty entry in the array": on a board
    // in natural order that answer coincides. The test below is what separates
    // those two.
    const filled = fill(createDraftBoard(), [
      ["ban-blue-0", "Ahri"],
      ["ban-red-0", "Zed"],
      ["ban-blue-1", "Jinx"],
    ])
    expect(nextDraftAction(filled)?.order, "three in a row, so the fourth is next").toBe(3)

    const gapped = boardAfter(removeDraftAction(filled, "ban-red-0"))
    const next = nextDraftAction(gapped)

    expect(next?.order, "the hole is served before the untouched tail").toBe(1)
    expect(next?.id).toBe("ban-red-0")
  })

  it("reads `order`, not the position in the array", () => {
    // THE DISCRIMINATOR for `board.find(slot => slot.championName === null)`.
    // Handed a reordered copy, a position-reading version answers Red Pick 5.
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const reversed = [...board].reverse()

    expect(reversed[0].order, "the reversed board really does start at the end").toBe(19)

    const next = nextDraftAction(reversed)
    expect(next?.order).toBe(1)
    expect(next?.id).toBe("ban-red-0")
  })

  it("answers null on a full board", () => {
    let board: DraftBoard = createDraftBoard()
    for (let i = 0; i < 20; i += 1) {
      board = boardAfter(applyDraftAction(board, board[i].id, TWENTY_CHAMPIONS[i]))
    }

    expect(filledCount(board), "the board really is full").toBe(20)
    expect(nextDraftAction(board)).toBeNull()

    // And one clear brings the waiting slot straight back, so "null" is a state
    // and not a latch.
    const cleared = boardAfter(removeDraftAction(board, "pick-blue-3"))
    expect(nextDraftAction(cleared)?.id).toBe("pick-blue-3")
  })

  it("keeps answering the same slot until that slot is filled", () => {
    const board = createDraftBoard()

    expect(nextDraftAction(board)?.id).toBe("ban-blue-0")
    expect(nextDraftAction(board)?.id, "asking twice must not advance anything").toBe("ban-blue-0")

    // Filling some LATER slot does not move the pointer either.
    const later = fill(board, [["pick-red-4", "Ahri"]])
    expect(nextDraftAction(later)?.id).toBe("ban-blue-0")
  })
})

/* ------------------------------------------------------ applyDraftAction */

describe("applyDraftAction: putting a champion into a slot", () => {
  it("fills the slot it was given and leaves the other nineteen alone", () => {
    const board = createDraftBoard()
    const result = applyDraftAction(board, "ban-red-2", "Ahri")
    const next = boardAfter(result)

    expect(championIn(next, "ban-red-2")).toBe("Ahri")
    expect(filledCount(next), "exactly one slot changed").toBe(1)

    let checked = 0
    for (const slot of next) {
      if (slot.id === "ban-red-2") continue
      expect(slot, `slot ${slot.id} was touched`).toEqual(slotOf(board, slot.id))
      checked += 1
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(19)
  })

  it("keeps the coordinates of the slot it fills", () => {
    const board = createDraftBoard()
    const next = boardAfter(applyDraftAction(board, "pick-blue-2", "Ahri"))
    const slot = slotOf(next, "pick-blue-2")

    expect(slot.id).toBe("pick-blue-2")
    expect(slot.action).toBe("pick")
    expect(slot.side).toBe("blue")
    expect(slot.index).toBe(2)
    expect(slot.order).toBe(slotOf(board, "pick-blue-2").order)
  })

  it("refuses a slot id the board does not know", () => {
    const board = createDraftBoard()

    // A perfectly good champion name every time, so the refusal can only be
    // about the slot. A test that broke two rules at once would prove neither.
    for (const unknown of ["ban-blue-5", "pick-purple-0", "ban_blue_0", "", "Ahri"]) {
      const result = applyDraftAction(board, unknown, "Ahri")
      expect(result.ok, `slot id ${JSON.stringify(unknown)}`).toBe(false)
      expect(result.ok ? null : result.reason, `slot id ${JSON.stringify(unknown)}`).toBe(
        "unknown_slot",
      )
    }

    // The other side of the boundary: the well-formed id right next to the
    // rejected out-of-range one is accepted.
    expect(applyDraftAction(board, "ban-blue-4", "Ahri").ok).toBe(true)
  })

  it("refuses an empty or whitespace-only champion name", () => {
    const board = createDraftBoard()

    // A real slot every time, so the refusal can only be about the name.
    for (const blank of ["", " ", "   ", "\t", "\n", " \t\n "]) {
      const result = applyDraftAction(board, "ban-blue-0", blank)
      expect(result.ok, `name ${JSON.stringify(blank)}`).toBe(false)
      expect(result.ok ? null : result.reason, `name ${JSON.stringify(blank)}`).toBe(
        "empty_champion",
      )
    }

    // The other side: one non-space character is enough to be a name.
    expect(applyDraftAction(board, "ban-blue-0", "x").ok).toBe(true)
  })

  it("reports the unknown slot first when the name is blank as well", () => {
    // A precedence pin, and nothing more: this case breaks two rules at once,
    // so it proves neither of them on its own. It exists because the two tests
    // above would both stay green if the checks swapped places, and the caller
    // has to be able to rely on one answer.
    const result = applyDraftAction(createDraftBoard(), "ban-blue-9", "   ")

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toBe("unknown_slot")
  })

  it("refuses a champion that is already banned somewhere else", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const result = applyDraftAction(board, "ban-red-0", "Ahri")

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.reason).toBe("champion_taken")

    // The other side: a different champion goes into that same slot fine, so
    // this is about the champion and not about the slot.
    expect(applyDraftAction(board, "ban-red-0", "Zed").ok).toBe(true)
  })

  it("refuses a champion that is already picked somewhere else", () => {
    // Bans and picks share one pool: banned then picked is refused, and picked
    // then banned is refused too.
    const picked = fill(createDraftBoard(), [["pick-blue-0", "Ahri"]])
    const banAfterPick = applyDraftAction(picked, "ban-red-3", "Ahri")
    expect(banAfterPick.ok).toBe(false)
    expect(banAfterPick.ok ? null : banAfterPick.reason).toBe("champion_taken")

    const banned = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const pickAfterBan = applyDraftAction(banned, "pick-red-0", "Ahri")
    expect(pickAfterBan.ok).toBe(false)
    expect(pickAfterBan.ok ? null : pickAfterBan.reason).toBe("champion_taken")
  })

  it("refuses the same champion under a different spelling", () => {
    // THE LOAD-BEARING TEST OF THIS SECTION. With a raw `===` comparison the
    // ban and the pick below are two different strings, and Kai'Sa gets banned
    // and picked in the same draft.
    const board = fill(createDraftBoard(), [["ban-blue-0", "Kai'Sa"]])

    for (const spelling of ["KaiSa", "kai sa", "KAI'SA", "  KaiSa  "]) {
      const result = applyDraftAction(board, "pick-blue-0", spelling)
      expect(result.ok, `spelling ${JSON.stringify(spelling)}`).toBe(false)
      expect(result.ok ? null : result.reason, `spelling ${JSON.stringify(spelling)}`).toBe(
        "champion_taken",
      )
    }

    // ANTI-VACUITY: the slot is not simply blocked for everyone.
    expect(applyDraftAction(board, "pick-blue-0", "Kalista").ok).toBe(true)
  })

  it("lets a slot be set to the champion it already holds", () => {
    // Documented on purpose in the module header: re-confirming the same pick
    // must not report `champion_taken` against itself. A guard without the
    // `slot.id !== slotId` exception fails right here.
    const board = fill(createDraftBoard(), [["pick-blue-0", "Ahri"]])
    const result = applyDraftAction(board, "pick-blue-0", "Ahri")

    expect(result.ok).toBe(true)
    expect(championIn(boardAfter(result), "pick-blue-0")).toBe("Ahri")
    expect(filledCount(boardAfter(result)), "and it stays one champion, not two").toBe(1)
  })

  it("lets a slot be re-set under a different spelling of its own champion", () => {
    const board = fill(createDraftBoard(), [["pick-blue-0", "Kai'Sa"]])
    const result = applyDraftAction(board, "pick-blue-0", "KaiSa")

    expect(result.ok).toBe(true)
    expect(
      championIn(boardAfter(result), "pick-blue-0"),
      "the name is stored as it was typed, it is not rewritten to the catalog spelling",
    ).toBe("KaiSa")
  })

  it("replaces the champion a slot already holds with another one", () => {
    const board = fill(createDraftBoard(), [["pick-blue-0", "Ahri"]])
    const next = boardAfter(applyDraftAction(board, "pick-blue-0", "Zed"))

    expect(championIn(next, "pick-blue-0")).toBe("Zed")
    expect(isChampionTaken(next, "Ahri"), "the replaced champion is free again").toBe(false)
    expect(filledCount(next)).toBe(1)
  })

  it("stores the name trimmed", () => {
    const board = createDraftBoard()
    const next = boardAfter(applyDraftAction(board, "ban-blue-0", "   Ahri   "))

    expect(championIn(next, "ban-blue-0")).toBe("Ahri")
    expect(isChampionTaken(next, "Ahri")).toBe(true)

    // Inner spacing is NOT collapsed - only the ends are trimmed.
    const spaced = boardAfter(applyDraftAction(board, "ban-blue-0", "  Lee  Sin  "))
    expect(championIn(spaced, "ban-blue-0")).toBe("Lee  Sin")
  })

  it("does not touch the board it was handed", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const before = deepCopy(board)

    boardAfter(applyDraftAction(board, "pick-blue-0", "Zed"))

    // A real deep comparison, not a reference check: a mutating implementation
    // would hand back the same array AND have changed it, and `not.toBe` alone
    // would say nothing about the second half.
    expect(board, "the input board was modified in place").toEqual(before)
    expect(championIn(board, "pick-blue-0")).toBeNull()
    expect(filledCount(board)).toBe(1)
  })

  it("leaves the board alone on every refusal too", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const before = deepCopy(board)

    expect(applyDraftAction(board, "ban-blue-9", "Zed").ok).toBe(false)
    expect(applyDraftAction(board, "ban-red-0", "   ").ok).toBe(false)
    expect(applyDraftAction(board, "ban-red-0", "Ahri").ok).toBe(false)

    expect(board).toEqual(before)
  })

  it("returns a new array rather than the one it was given", () => {
    const board = createDraftBoard()
    const next = boardAfter(applyDraftAction(board, "ban-blue-0", "Ahri"))

    expect(next).not.toBe(board)
    expect(next).toHaveLength(20)
  })

  it("chains: a whole ban phase applied one action at a time", () => {
    let board: DraftBoard = createDraftBoard()
    const names = ["Ahri", "Zed", "Jinx", "Thresh", "Nautilus", "Karma"]

    for (let i = 0; i < names.length; i += 1) {
      board = boardAfter(applyDraftAction(board, board[i].id, names[i]))
    }

    expect(board.slice(0, 6).map((slot) => slot.championName)).toEqual(names)
    expect(filledCount(board)).toBe(6)
  })
})

/* ----------------------------------------------------- removeDraftAction */

describe("removeDraftAction: emptying a slot", () => {
  it("clears the slot it was given and leaves its neighbours alone", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const next = boardAfter(removeDraftAction(board, "ban-blue-0"))

    expect(championIn(next, "ban-blue-0")).toBeNull()
    expect(filledCount(next)).toBe(0)

    let checked = 0
    for (const slot of next) {
      if (slot.id === "ban-blue-0") continue
      expect(slot, `slot ${slot.id} was touched`).toEqual(slotOf(board, slot.id))
      checked += 1
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(19)
  })

  it("empties the right slot out of three filled ones", () => {
    // THE TEST AGAINST "clears the wrong slot". Three filled slots, the middle
    // one removed: an off-by-one or an index/order mix-up empties a neighbour,
    // and one of the two survivors below goes null.
    const board = fill(createDraftBoard(), [
      ["ban-blue-0", "Ahri"],
      ["ban-red-0", "Zed"],
      ["ban-blue-1", "Jinx"],
    ])
    const next = boardAfter(removeDraftAction(board, "ban-red-0"))

    expect(championIn(next, "ban-red-0"), "the slot that was asked for").toBeNull()
    expect(championIn(next, "ban-blue-0"), "the one before it keeps its champion").toBe("Ahri")
    expect(championIn(next, "ban-blue-1"), "the one after it keeps its champion").toBe("Jinx")
    expect(filledCount(next), "exactly one champion left the board").toBe(2)

    // And the freed champion is the right one: Zed is available again, the
    // other two are not.
    expect(isChampionTaken(next, "Zed")).toBe(false)
    expect(isChampionTaken(next, "Ahri")).toBe(true)
    expect(isChampionTaken(next, "Jinx")).toBe(true)
  })

  it("treats clearing an already-empty slot as a no-op, not as a failure", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const result = removeDraftAction(board, "pick-red-4")

    expect(result.ok, "pressing clear twice is not an error worth a message").toBe(true)
    expect(boardAfter(result)).toEqual(board)

    // Twice in a row on the same slot, which is the case the module header
    // describes.
    const once = boardAfter(removeDraftAction(board, "ban-blue-0"))
    const twiceResult = removeDraftAction(once, "ban-blue-0")
    expect(twiceResult.ok).toBe(true)
    expect(boardAfter(twiceResult)).toEqual(once)
  })

  it("refuses a slot id the board does not know", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])

    for (const unknown of ["ban-blue-5", "pick-purple-0", "ban_blue_0", "", "Ahri"]) {
      const result = removeDraftAction(board, unknown)
      expect(result.ok, `slot id ${JSON.stringify(unknown)}`).toBe(false)
      expect(result.ok ? null : result.reason, `slot id ${JSON.stringify(unknown)}`).toBe(
        "unknown_slot",
      )
    }

    // The other side of the boundary: the last valid index is accepted.
    expect(removeDraftAction(board, "ban-blue-4").ok).toBe(true)
  })

  it("does not touch the board it was handed either", () => {
    const board = fill(createDraftBoard(), [
      ["ban-blue-0", "Ahri"],
      ["ban-red-0", "Zed"],
    ])
    const before = deepCopy(board)

    boardAfter(removeDraftAction(board, "ban-blue-0"))

    expect(board, "the input board was modified in place").toEqual(before)
    expect(championIn(board, "ban-blue-0")).toBe("Ahri")
    expect(filledCount(board)).toBe(2)
  })

  it("returns a new array, and leaves the board alone on a refusal", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    const before = deepCopy(board)

    expect(boardAfter(removeDraftAction(board, "ban-blue-0"))).not.toBe(board)

    expect(removeDraftAction(board, "ban-blue-9").ok).toBe(false)
    expect(board).toEqual(before)
  })

  it("frees the champion for a different slot", () => {
    const board = fill(createDraftBoard(), [["ban-blue-0", "Ahri"]])
    expect(applyDraftAction(board, "pick-blue-0", "Ahri").ok, "blocked while banned").toBe(false)

    const cleared = boardAfter(removeDraftAction(board, "ban-blue-0"))
    const picked = applyDraftAction(cleared, "pick-blue-0", "Ahri")

    expect(picked.ok, "and allowed once the ban is gone").toBe(true)
    expect(championIn(boardAfter(picked), "pick-blue-0")).toBe("Ahri")
  })
})

/* ------------------------------------------------------------ the whole run */

describe("a real opening: six bans, then the first pick", () => {
  it("walks the first ban phase and lands on Blue Pick 1", () => {
    // The slot ids come from the board, which comes from DRAFT_FLOW. Nothing
    // about the sequence is transcribed here either.
    const empty = createDraftBoard()
    const banned = ["Ahri", "Zed", "Jinx", "Thresh", "Nautilus", "Karma"]

    let board: DraftBoard = empty
    for (let i = 0; i < banned.length; i += 1) {
      const waiting = nextDraftAction(board)
      expect(waiting, `the draft stalled at ban ${i + 1}`).not.toBeNull()
      expect(waiting?.action, `step ${i + 1} of a tournament draft is a ban`).toBe("ban")
      board = boardAfter(applyDraftAction(board, waiting?.id ?? "", banned[i]))
    }

    expect(filledCount(board)).toBe(6)

    const next = nextDraftAction(board)
    expect(next?.id).toBe("pick-blue-0")
    expect(next?.action).toBe("pick")
    expect(next?.side).toBe("blue")
    expect(next?.index).toBe(0)
    expect(next?.order).toBe(6)

    let checked = 0
    for (const champion of banned) {
      expect(isChampionTaken(board, champion), `${champion} was banned`).toBe(true)
      checked += 1
    }
    expect(checked, "guard against an emptied loop asserting nothing").toBe(6)

    // ANTI-VACUITY: a champion nobody banned is still free.
    expect(isChampionTaken(board, "Kai'Sa")).toBe(false)

    // And the bans really did land on the six flow slots, in flow order.
    expect(board.slice(0, 6).map((slot) => slot.championName)).toEqual(banned)
    expect(board.slice(6).every((slot) => slot.championName === null)).toBe(true)
  })
})
