/**
 * The draft board as DATA: twenty slots in tournament order, and the four
 * operations that move a champion in or out of one.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 *
 * This is the foundation of the Draft War Room programme (0.8.0). It is a pure
 * domain module: no React, no DOM, no storage, no network. It deliberately does
 * NOT render anything and is NOT yet wired into the existing draft board.
 *
 * THE EXISTING BOARD STAYS THE ONE BOARD. `DraftHelper.tsx` plus
 * `DraftBoard`/`DraftTeamPanel`/`DraftBanSlot`/`DraftPickSlot` already render a
 * full draft with blue and red sides, ban and pick slots, slot activation,
 * clearing and duplicate prevention. Building a second board beside it would
 * repeat the defect 0.7.4 spent a whole release removing from the ban plan: two
 * views of the same thing, each with its own state, drifting apart. What was
 * missing was not a board, it was a testable RULE underneath one - Vitest runs
 * in Node here with no jsdom, so logic living inside a 2041-line component
 * cannot be tested at all.
 *
 * THE ORDER IS NOT RESTATED HERE. Every slot is derived from {@link DRAFT_FLOW},
 * which has been the canonical twenty-step tournament order since long before
 * this module. Writing the sequence out a second time would create exactly the
 * two-sources-of-truth defect this project has hit repeatedly (`ScoutManualSource`
 * in three places, `overwrittenRows` against `removedExistingRows`,
 * `banPhaseCounts()` against `prioritizedBans`). If the format ever changes, it
 * changes in one file and this module follows.
 */

import { championIdentityKey } from "../scout/championIdentity"
import { DRAFT_FLOW } from "./constants"
import type { DraftVisualSide } from "./types"

/** Ban or pick. The two things a draft slot can be. */
export type DraftActionType = "ban" | "pick"

/** One slot on the board, with its place in the draft. */
export interface DraftSlot {
  /**
   * Stable identity, `"ban-blue-0"` / `"pick-red-4"`.
   *
   * Built from action, side and index rather than from the position in the
   * order, so it survives a change to the draft format: if the sequence is ever
   * reordered, "Blue Ban 1" is still `ban-blue-0`. A caller may hold this id
   * across a re-render without it silently coming to mean another slot.
   */
  readonly id: string
  readonly side: DraftVisualSide
  readonly action: DraftActionType
  /** 0-based position among that side's slots of that action. */
  readonly index: number
  /** 0-based position in the whole draft, 0 to 19. Mirrors `DRAFT_FLOW`. */
  readonly order: number
  /** `null` for an empty slot. Never `""` - see `applyDraftAction`. */
  readonly championName: string | null
}

/** The whole board, in draft order. */
export type DraftBoard = readonly DraftSlot[]

/**
 * Why an action could not be applied.
 *
 * A result object rather than a thrown error or a silently unchanged board: the
 * caller has to decide what to say to the user, and "nothing happened" with no
 * reason is the shape that produces a dead-feeling button. Same contract as
 * `callEdgeFunction` in `src/teams/riotService.ts`.
 */
export type DraftActionFailure = "unknown_slot" | "champion_taken" | "empty_champion"

export type DraftActionResult =
  | { readonly ok: true; readonly board: DraftSlot[] }
  | { readonly ok: false; readonly reason: DraftActionFailure }

/** The id a slot with these coordinates has. Pure string building, no lookup. */
export function draftSlotId(
  action: DraftActionType,
  side: DraftVisualSide,
  index: number,
): string {
  return `${action}-${side}-${index}`
}

/**
 * A fresh board: twenty empty slots, in `DRAFT_FLOW` order.
 *
 * Returns a new array of new objects every call, so two boards can never share
 * a slot by reference.
 */
export function createDraftBoard(): DraftSlot[] {
  return DRAFT_FLOW.map((step, order) => ({
    id: draftSlotId(step.type, step.visualSide, step.index),
    side: step.visualSide,
    action: step.type,
    index: step.index,
    order,
    championName: null,
  }))
}

/**
 * Is this champion already somewhere on the board?
 *
 * COMPARES BY IDENTITY, NOT BY STRING. `championIdentityKey()` is what makes
 * `Kai'Sa`, `KaiSa` and `kai sa` one champion; a raw `===` would let the same
 * champion be banned and then picked because the two spellings differ by an
 * apostrophe. CLAUDE.md records the same rule for the stats import, where the
 * bare lookup key merged three Korean names into one - which is exactly why the
 * IDENTITY key is used here and not `championLookupKey`.
 *
 * An empty or whitespace-only name is never "taken": it is not a champion.
 */
export function isChampionTaken(board: DraftBoard, championName: string): boolean {
  const wanted = championIdentityKey(championName)
  if (wanted === "") return false

  return board.some(
    (slot) => slot.championName !== null && championIdentityKey(slot.championName) === wanted,
  )
}

/**
 * The slot the draft is waiting on: the first empty one in draft order.
 *
 * `null` when the board is full. Reads the order off `slot.order` rather than
 * assuming the array is sorted, so it stays correct even if a caller hands back
 * a reordered copy.
 */
export function nextDraftAction(board: DraftBoard): DraftSlot | null {
  let best: DraftSlot | null = null
  for (const slot of board) {
    if (slot.championName !== null) continue
    if (best === null || slot.order < best.order) best = slot
  }
  return best
}

/**
 * Put a champion into a slot.
 *
 * Refuses when the slot does not exist, when the name is empty, and when the
 * champion is already on the board ANYWHERE - a champion cannot be banned twice,
 * picked twice, or banned and then picked.
 *
 * REPLACING A SLOT WITH THE CHAMPION IT ALREADY HOLDS IS ALLOWED. Otherwise
 * re-confirming the same pick would report `champion_taken` against itself,
 * which reads as a bug to whoever clicks it.
 *
 * Never mutates: returns a new array with one new slot object; the other
 * nineteen are passed through by reference.
 */
export function applyDraftAction(
  board: DraftBoard,
  slotId: string,
  championName: string,
): DraftActionResult {
  const target = board.find((slot) => slot.id === slotId)
  if (target === undefined) return { ok: false, reason: "unknown_slot" }

  const trimmed = championName.trim()
  if (trimmed === "") return { ok: false, reason: "empty_champion" }

  const wanted = championIdentityKey(trimmed)
  const heldElsewhere = board.some(
    (slot) =>
      slot.id !== slotId &&
      slot.championName !== null &&
      championIdentityKey(slot.championName) === wanted,
  )
  if (heldElsewhere) return { ok: false, reason: "champion_taken" }

  return {
    ok: true,
    board: board.map((slot) => (slot.id === slotId ? { ...slot, championName: trimmed } : slot)),
  }
}

/**
 * Empty a slot.
 *
 * Clearing an already-empty slot is NOT a failure: it is a no-op that returns a
 * board equal to the one it was given. "Remove what is not there" is the user
 * pressing a clear button twice, not an error worth a message.
 *
 * Only `unknown_slot` can fail, and it is reported rather than ignored, because
 * an id the board does not know means the caller is out of sync - silently
 * clearing nothing would hide that.
 */
export function removeDraftAction(board: DraftBoard, slotId: string): DraftActionResult {
  const target = board.find((slot) => slot.id === slotId)
  if (target === undefined) return { ok: false, reason: "unknown_slot" }

  return {
    ok: true,
    board: board.map((slot) => (slot.id === slotId ? { ...slot, championName: null } : slot)),
  }
}
