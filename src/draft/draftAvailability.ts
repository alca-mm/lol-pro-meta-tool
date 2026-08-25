/**
 * "Is this champion still available in the current draft?" - asked in ONE place.
 *
 * WHY THIS MODULE EXISTS (Epic C, 0.8.1)
 *
 * The draft board answered that question in eight places, all of them keyed by
 * `normalizeChampionName()`, which is only `trim().toLowerCase()`. That is a
 * weaker rule than the rest of the app uses: `championIdentityKey()` also
 * resolves against the champion catalogue and ignores punctuation and spacing.
 *
 * MEASURED, not assumed, over the real 173-champion catalogue:
 *
 *  - Neither rule ever merges two DIFFERENT champions (0 collisions each), so
 *    moving to the stronger one cannot wrongly block anybody.
 *  - Spelling variants recognised as the same champion: `normalizeChampionName`
 *    154 of 173, `championIdentityKey` 173 of 173.
 *  - The 19 that differ are exactly the punctuated and spaced ones: `Kai'Sa`,
 *    `Cho'Gath`, `Kha'Zix`, `Kog'Maw`, `Bel'Veth`, `Rek'Sai`, `K'Sante`,
 *    `Dr. Mundo`, `Nunu & Willump`, `Lee Sin`, `Master Yi`, `Miss Fortune`,
 *    `Aurelion Sol`, `Jarvan IV`, `Renata Glasc` and four more.
 *
 * So the switch can only ever CATCH a duplicate that used to slip through -
 * `Kai'Sa` on the board and `KaiSa` from a recommendation were two champions
 * before and are one now. It can never free a champion and never block a
 * different one.
 *
 * WHY A KEY FUNCTION AND NOT JUST `isChampionTaken` EVERYWHERE
 *
 * The board needs the answer in two shapes: as a decision ("may I put this
 * champion here?", which is `isChampionTaken`) and as a `Set` the champion grid
 * greys out against. If those two used different bases the grid would offer a
 * champion the board then silently refuses - a worse bug than the one being
 * fixed, because nothing on screen would explain it. `draftAvailabilityKey` is
 * the one basis; `isChampionTaken` uses `championIdentityKey` internally, which
 * is the same function.
 */

import { championIdentityKey } from "../scout/championIdentity"
import { DRAFT_FLOW } from "./constants"
import { createEmptyPickSlots } from "./helpers"
import { draftSlotId, type DraftSlot } from "./draftState"
import type { PickSlot } from "./types"

/**
 * THE comparison basis for draft availability.
 *
 * A named indirection rather than eight direct calls, so "what counts as the
 * same champion here" has exactly one definition and one place to change. It
 * deliberately delegates to `championIdentityKey` rather than reimplementing it:
 * `championLookupKey` alone returns the EMPTY STRING for a Korean name,
 * fullwidth Latin or pure punctuation, which would make every such champion
 * compare equal to every other (CLAUDE.md, "Champion-Identitaet").
 */
export function draftAvailabilityKey(championName: string): string {
  return championIdentityKey(championName)
}

/** The board state the existing DraftHelper holds, in its own shape. */
export interface DraftHelperSlots {
  readonly bluePickSlots: readonly PickSlot[]
  readonly redPickSlots: readonly PickSlot[]
  readonly blueBans: readonly string[]
  readonly redBans: readonly string[]
}

/**
 * The same four arrays, mutable, as a single piece of state.
 *
 * ONE object rather than four `useState` hooks, because 0.8.2 lifted them into
 * `App.tsx`: four separate setters would let a caller update the picks and
 * forget the bans, and the draft would be half-applied for a render. As one
 * value they move together or not at all.
 *
 * It lives HERE rather than in the component so that `App.tsx`, `DraftHelper`
 * and the tests all name the same shape, and so the empty board has exactly one
 * definition.
 */
export interface DraftSlotsState {
  bluePickSlots: PickSlot[]
  redPickSlots: PickSlot[]
  blueBans: string[]
  redBans: string[]
}

/** How many bans each side gets. Mirrors the five ban steps per side in DRAFT_FLOW. */
const BANS_PER_SIDE = 5

/**
 * An empty draft.
 *
 * A factory, never a shared constant: two callers must not end up mutating one
 * another's arrays. `createEmptyPickSlots()` is the existing helper the board
 * already used, so "what is an empty pick slot" is not answered twice.
 */
export function createEmptyDraftSlots(): DraftSlotsState {
  return {
    bluePickSlots: createEmptyPickSlots(),
    redPickSlots: createEmptyPickSlots(),
    blueBans: Array.from({ length: BANS_PER_SIDE }, () => ""),
    redBans: Array.from({ length: BANS_PER_SIDE }, () => ""),
  }
}

/**
 * The existing board's four arrays, as the domain's `DraftBoard`.
 *
 * THE BRIDGE, and the reason 0.8.1 needs no second draft state. `DraftHelper`
 * keeps five bans and five pick slots per side; `DRAFT_FLOW` describes exactly
 * those twenty positions. This reads the one into the other rather than storing
 * anything twice.
 *
 * Slots are produced in `DRAFT_FLOW` order and never in an order written out
 * here - the same rule `createDraftBoard` follows, and for the same reason.
 *
 * An empty or whitespace-only entry becomes `null`, because that is what an
 * empty slot is. A missing array entry is treated as empty rather than throwing:
 * a short array is a caller's bug, and crashing the draft board over it would be
 * a worse outcome than showing an empty slot.
 *
 * Pure: reads the input, builds new objects, mutates nothing.
 */
export function draftBoardFromSlots(slots: DraftHelperSlots): DraftSlot[] {
  return DRAFT_FLOW.map((step, order) => {
    const raw =
      step.type === "ban"
        ? (step.visualSide === "blue" ? slots.blueBans : slots.redBans)[step.index]
        : (step.visualSide === "blue" ? slots.bluePickSlots : slots.redPickSlots)[step.index]
            ?.championName

    const championName = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null

    return {
      id: draftSlotId(step.type, step.visualSide, step.index),
      side: step.visualSide,
      action: step.type,
      index: step.index,
      order,
      championName,
    }
  })
}

/**
 * Every champion the current draft has taken, as comparison keys.
 *
 * What the champion grid greys out against. Built from the same board and the
 * same key function the decision uses, so the two cannot disagree.
 */
export function takenChampionKeys(board: readonly DraftSlot[]): Set<string> {
  const keys = new Set<string>()
  for (const slot of board) {
    if (slot.championName === null) continue
    const key = draftAvailabilityKey(slot.championName)
    if (key !== "") keys.add(key)
  }
  return keys
}

/**
 * Is this ban candidate still worth recommending?
 *
 * PREPARED FOR THE BAN PLAN, NOT YET WIRED. Banning or picking a champion in the
 * draft does not make the scout's analysis wrong, it makes one of its
 * suggestions unusable - so this belongs to VISIBILITY, never to the score. It
 * takes a board and a name and returns a boolean; it cannot reach a score, a
 * rank or the role gate even if someone wanted it to.
 *
 * Wiring it needs the draft state to reach the scout tab, which today it cannot:
 * the two tabs hold separate state and the lift belongs in its own change. See
 * the 0.8.1 change note.
 */
export function isBanCandidateAvailable(
  championName: string,
  board: readonly DraftSlot[],
): boolean {
  const key = draftAvailabilityKey(championName)
  if (key === "") return true
  return !takenChampionKeys(board).has(key)
}

/**
 * The candidates that are still available, in unchanged order.
 *
 * Filters, never reorders and never rescores - the ban plan's ranking is
 * `analyzeScout`'s business and stays untouched. Same shape of rule as
 * `filterBansByPhase`.
 */
export function filterAvailableBanCandidates<T extends { readonly championName: string }>(
  candidates: readonly T[],
  board: readonly DraftSlot[],
): T[]
export function filterAvailableBanCandidates<T>(
  candidates: readonly T[],
  board: readonly DraftSlot[],
  championNameOf: (candidate: T) => string,
): T[]
export function filterAvailableBanCandidates<T>(
  candidates: readonly T[],
  board: readonly DraftSlot[],
  /*
    WHERE THE CHAMPION NAME LIVES, because it is not always the same place.

    A plain ban candidate carries it at the top level, but the ban panel filters
    `RankedBanCandidate`, which wraps the candidate to keep its rank - there the
    name sits at `entry.candidate.championName`. The selector is how the caller
    says which, instead of this function guessing and quietly filtering nothing
    when it guesses wrong.

    The default covers the first shape and is the only place a cast appears; the
    overloads above are what make that cast safe for callers.
  */
  championNameOf: (candidate: T) => string = (candidate) =>
    (candidate as { championName: string }).championName,
): T[] {
  const taken = takenChampionKeys(board)
  return candidates.filter((candidate) => {
    const key = draftAvailabilityKey(championNameOf(candidate))
    return key === "" || !taken.has(key)
  })
}
