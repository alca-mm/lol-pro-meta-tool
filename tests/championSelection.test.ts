/**
 * Behaviour tests for the champion selection rule of the stats table.
 *
 * WHY THIS FILE EXISTS. 0.7.8 gave ChampionStatsTable.tsx a second control: the
 * row stays clickable for the mouse, and a real `<button>` in the champion cell
 * is what a keyboard can reach. Two controls, one rule - so the rule moved out
 * of the JSX into src/components/championSelection.ts, and this file is the
 * coverage that makes that move worth anything. Without it the extraction only
 * removes the drift risk (`ScoutManualSource` in three places,
 * `overwrittenRows` against `removedExistingRows`, `banPhaseCounts()` against
 * `prioritizedBans`) and buys no verification at all.
 *
 * WHAT IS AND IS NOT COVERED. Vitest runs in Node here (vite.config.ts,
 * `test.environment: 'node'`) with no jsdom, so this file covers the DECISION
 * and nothing else: given the champion that is open and the champion that was
 * clicked, which champion is open next. It renders no table, clicks nothing,
 * and says nothing about focus, Enter, Space, `aria-expanded` or screen reader
 * output. Same boundary as tests/radioGroupNavigation.test.ts, and the same
 * reason scoutImportHelpers.ts, scoutUiHelpers.ts and pluralMessage() live
 * outside their components. Nobody should read this file as "the table is
 * keyboard operable" - it says "given a click, the right champion is open".
 *
 * WHAT THE stopPropagation() SECTION DOES AND DOES NOT PROVE. Section 2 proves
 * a property of the FUNCTION: applying it twice with the same `clicked` lands
 * back on `null`. That is the arithmetic behind the `event.stopPropagation()`
 * in ChampionStatsTable.tsx, because the button sits inside the clickable row,
 * so one activation reaches two handlers that both run this rule for the same
 * champion.
 *
 * It does NOT prove what React does with those two dispatches, and the honest
 * answer for today's wiring is "less than it looks": App.tsx passes
 * `setSelectedChampion` straight in, and both handlers close over the SAME
 * `selectedChampion` prop of the current render (React 18 batches one event, it
 * does not re-render between two handlers on one propagation path). Two
 * dispatches would set the same value twice, not cancel. The cancellation
 * pinned below is what happens the moment those two dispatches ever see
 * different state, and a functional updater
 * (`setSelectedChampion(prev => nextChampionSelection(prev, name))`) is the
 * ordinary one-line change that makes it true. That is the point of keeping the
 * guard and of pinning this property: it is the difference between a harmless
 * duplicate set and a button that visibly does nothing, and only the parent's
 * wiring decides which one you get.
 *
 * EVERY ASSERTION HERE HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the tests that turn red for each:
 *
 *   the condition flipped (`current !== clicked ? null : clicked`)
 *       -> "opens a champion that is not the open one"
 *       -> "closes the champion that is already open"
 *       -> "walks a whole click sequence the way the table would"
 *       -> "answers every known pair the way the table expects"
 *   `return clicked` always, closing lost
 *       -> "closes the champion that is already open"
 *       -> "a second application of the same champion undoes the first"
 *       -> "answers every known pair the way the table expects"
 *   `return null` always, opening lost
 *       -> "opens a champion that is not the open one"
 *       -> "opens a champion from a closed table"
 *       -> "two applications with different champions keep the second one"
 *   `return current` in the else branch
 *       -> "opens a champion that is not the open one"
 *       -> "opens a champion from a closed table"
 *       -> "answers with null or with exactly the clicked champion"
 *   a `toLowerCase()` normalisation on either side
 *       -> "does not normalise case, and a later toLowerCase() fix would show here"
 *       -> "answers every known pair the way the table expects"
 *   a `trim()` on either side
 *       -> "does not trim either", and that test alone. The pair table below
 *          carries no whitespace variant, on purpose: one test that only this
 *          mutant can fail is worth more than a row that fails for four
 *          different reasons.
 *   the comparison routed through championIdentityKey() or championLookupKey()
 *       -> "compares the display name verbatim, it is not championIdentityKey"
 *       -> "does not normalise case, and a later toLowerCase() fix would show here"
 *       -> "answers every known pair the way the table expects"
 *   an empty `clicked` special-cased to null
 *       -> "hands an empty clicked champion back as-is instead of guessing"
 *       -> "tells an empty selection apart from no selection"
 *       -> "answers every known pair the way the table expects"
 *   `current` tested for falsiness instead of compared
 *       -> "tells an empty selection apart from no selection"
 *       -> "answers every known pair the way the table expects"
 *   a module-level cache, counter or any other hidden state
 *       -> "keeps no state between calls"
 *       -> "answers the same for the same pair, however often it is asked"
 */

import { describe, expect, it } from "vitest"

import { nextChampionSelection } from "../src/components/championSelection"

/**
 * `[current, clicked, expected]`.
 *
 * Deliberately a hand-written table and NOT a second copy of the rule. An
 * oracle that recomputed `current === clicked ? null : clicked` would agree
 * with a flipped implementation as readily as with the real one; these literals
 * cannot.
 */
const CASES: ReadonlyArray<readonly [string | null, string, string | null]> = [
  [null, "Ahri", "Ahri"],
  ["Ahri", "Ahri", null],
  ["Ahri", "Zed", "Zed"],
  ["Zed", "Ahri", "Ahri"],
  ["", "", null],
  [null, "", ""],
  ["", "Ahri", "Ahri"],
  ["Ahri", "", ""],
  ["Ahri", "ahri", "ahri"],
  ["ahri", "Ahri", "Ahri"],
  ["Kai'Sa", "KaiSa", "KaiSa"],
  ["Kai'Sa", "Kai'Sa", null],
  ["Nunu & Willump", "Nunu & Willump", null],
]

describe("nextChampionSelection: the one rule", () => {
  it("opens a champion that is not the open one", () => {
    expect(nextChampionSelection("Ahri", "Zed")).toBe("Zed")
  })

  it("closes the champion that is already open", () => {
    expect(nextChampionSelection("Ahri", "Ahri")).toBeNull()
  })

  it("opens a champion from a closed table", () => {
    expect(nextChampionSelection(null, "Ahri")).toBe("Ahri")
  })

  it("walks a whole click sequence the way the table would", () => {
    // The state the table actually keeps, fed back in the way the component
    // does it.
    let selected: string | null = null

    selected = nextChampionSelection(selected, "Ahri")
    expect(selected, "first click opens Ahri").toBe("Ahri")

    selected = nextChampionSelection(selected, "Zed")
    expect(selected, "a different champion takes over, it does not close").toBe("Zed")

    selected = nextChampionSelection(selected, "Zed")
    expect(selected, "the open champion clicked again closes").toBeNull()

    selected = nextChampionSelection(selected, "Zed")
    expect(selected, "and opens again, so it is a toggle and not a latch").toBe("Zed")

    selected = nextChampionSelection(selected, "Ahri")
    expect(selected, "back to another champion").toBe("Ahri")
  })
})

describe("applying it twice: the arithmetic behind stopPropagation()", () => {
  /**
   * THE LOAD-BEARING SECTION OF THIS FILE. The button in the champion cell
   * lives inside the clickable row, so one activation - mouse click, Enter or
   * Space - runs the button handler and then bubbles into the row handler.
   * Both handlers apply THIS rule with the same clicked champion. Applied
   * twice, the rule returns to `null`, which is why the button calls
   * `event.stopPropagation()` before doing its work.
   *
   * The header of this file spells out the limit of the claim: with today's
   * `onSelectChampion={setSelectedChampion}` the two dispatches read the same
   * prop and would write the same value, so what you would see is a redundant
   * set rather than a dead button. The composition below is what turns that
   * into a dead button as soon as the second dispatch sees the first one's
   * result, which a functional state updater in App.tsx would do. The guard is
   * what makes that difference not matter.
   */
  it("a second application of the same champion undoes the first, which is what stopPropagation() prevents", () => {
    const afterButtonHandler = nextChampionSelection("Ahri", "Zed")
    expect(afterButtonHandler, "the button's own handler opens Zed").toBe("Zed")

    const afterRowHandler = nextChampionSelection(afterButtonHandler, "Zed")
    expect(
      afterRowHandler,
      "the same activation bubbling into the row handler closes Zed again: " +
        "one click, nothing opened. Without stopPropagation() the button " +
        "would be a control that appears to do nothing.",
    ).toBeNull()
  })

  it("cancels the same way from a closed table, where the button is the only way in", () => {
    // The worse of the two cases: with nothing expanded there is no visible
    // change at all to hint that the click was even received.
    const afterButtonHandler = nextChampionSelection(null, "Zed")
    expect(afterButtonHandler).toBe("Zed")
    expect(nextChampionSelection(afterButtonHandler, "Zed")).toBeNull()
  })

  it("opens again on a third application, so the rule toggles rather than latches", () => {
    const once = nextChampionSelection(null, "Zed")
    const twice = nextChampionSelection(once, "Zed")
    const thrice = nextChampionSelection(twice, "Zed")

    expect(once).toBe("Zed")
    expect(twice).toBeNull()
    expect(
      thrice,
      "a 'return null always' mutant would stop at null here and never reopen",
    ).toBe("Zed")
  })

  it("two applications with different champions keep the second one", () => {
    // ANTI-VACUITY for the three tests above. On their own they are also
    // satisfied by "two calls always end at null". They do not: what decides
    // the outcome is whether the second click names the champion the first one
    // opened.
    const openedAhri = nextChampionSelection(null, "Ahri")
    expect(openedAhri).toBe("Ahri")
    expect(nextChampionSelection(openedAhri, "Zed")).toBe("Zed")

    const openedZed = nextChampionSelection("Ahri", "Zed")
    expect(openedZed).toBe("Zed")
    expect(nextChampionSelection(openedZed, "Ahri")).toBe("Ahri")
  })

  it("depends on the previous answer, not on the number of applications", () => {
    // The two sequences below are the same length and start from the same
    // place. Only the names differ, and that is the whole rule.
    expect(nextChampionSelection(nextChampionSelection(null, "Zed"), "Zed")).toBeNull()
    expect(nextChampionSelection(nextChampionSelection(null, "Ahri"), "Zed")).toBe("Zed")
  })
})

describe("nextChampionSelection: edge cases it must not turn into guesses", () => {
  it("hands an empty clicked champion back as-is instead of guessing", () => {
    // The module comment commits to this: inventing a selection would be worse
    // than showing none, so an empty name is passed through rather than mapped
    // to null.
    expect(nextChampionSelection(null, "")).toBe("")
    expect(nextChampionSelection("Ahri", "")).toBe("")
  })

  it("tells an empty selection apart from no selection", () => {
    // "" and null are both falsy and mean different things: "" is a champion
    // whose name is empty, null is "nothing expanded". A `!current` test in
    // place of the comparison collapses them, and this pair splits again.
    expect(nextChampionSelection("", ""), "an empty name clicked while open closes").toBeNull()
    expect(nextChampionSelection(null, ""), "the same name clicked while closed opens").toBe("")
    expect(nextChampionSelection("", "Ahri")).toBe("Ahri")
  })

  it("does not normalise case, and a later toLowerCase() fix would show here", () => {
    // Pinned on purpose. The component decides which detail row to render with
    // `s.championName === selectedChampion`, a case-sensitive comparison on the
    // display name. A rule that folded case would hand back a value the table's
    // own equality never matches, and the row would stop expanding.
    expect(nextChampionSelection("Ahri", "ahri")).toBe("ahri")
    expect(nextChampionSelection("ahri", "Ahri")).toBe("Ahri")
    expect(nextChampionSelection("AHRI", "Ahri")).toBe("Ahri")

    // And the pair that must still close, so this is not merely "never null".
    expect(nextChampionSelection("Ahri", "Ahri")).toBeNull()
  })

  it("does not trim either", () => {
    expect(nextChampionSelection("Ahri", "Ahri ")).toBe("Ahri ")
    expect(nextChampionSelection(" Ahri", "Ahri")).toBe("Ahri")
    expect(nextChampionSelection(" Ahri", " Ahri")).toBeNull()
  })

  it("compares the display name verbatim, it is not championIdentityKey", () => {
    // P4e says every champion-to-champion comparison should go through
    // championIdentityKey(), and someone will eventually read that as applying
    // here. It does not: this compares a UI selection against the display name
    // the table renders, and folding names would break the component's own
    // equality check the same way a toLowerCase() would.
    expect(nextChampionSelection("Kai'Sa", "KaiSa")).toBe("KaiSa")
    expect(nextChampionSelection("Kai'Sa", "Kai'Sa")).toBeNull()

    // The sharper half: championLookupKey() strips everything but a-z0-9, so
    // non-latin names collapse to the empty string and compare equal to one
    // another (P4e). Routed through it, every Korean champion would be the same
    // champion, and clicking any of them would close the table.
    expect(nextChampionSelection("아리", "야스오")).toBe("야스오")
    expect(nextChampionSelection("아리", "아리")).toBeNull()
  })

  it("answers with null or with exactly the clicked champion, never a third value and never a throw", () => {
    const ODD_NAMES = [
      "",
      " ",
      "-",
      "아리",
      "Ａｈｒｉ",
      "Nunu & Willump",
      "K'Sante",
      "Dr. Mundo",
      "５",
    ]

    let checked = 0
    for (const current of [null, ...ODD_NAMES]) {
      for (const clicked of ODD_NAMES) {
        const result = nextChampionSelection(current, clicked)
        expect(
          result === null || result === clicked,
          `${String(current)} + ${clicked} produced ${String(result)}, which is ` +
            "neither 'nothing expanded' nor the champion that was clicked",
        ).toBe(true)
        checked += 1
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(90)
  })
})

describe("nextChampionSelection: the known pairs", () => {
  it("answers every known pair the way the table expects", () => {
    let checked = 0
    for (const [current, clicked, expected] of CASES) {
      expect(
        nextChampionSelection(current, clicked),
        `current ${String(current)} + clicked ${clicked}`,
      ).toBe(expected)
      checked += 1
    }

    expect(checked, "guard against an emptied table asserting nothing").toBe(CASES.length)
    expect(CASES.length, "and against the table being trimmed down to the easy rows").toBe(13)
  })
})

describe("nextChampionSelection: purity", () => {
  it("answers the same for the same pair, however often it is asked", () => {
    let checked = 0
    for (const [current, clicked, expected] of CASES) {
      expect(nextChampionSelection(current, clicked)).toBe(expected)
      expect(nextChampionSelection(current, clicked)).toBe(expected)
      expect(nextChampionSelection(current, clicked)).toBe(expected)
      checked += 3
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(CASES.length * 3)
  })

  it("keeps no state between calls", () => {
    // The mutant this is aimed at is a module-level `let last` that remembers
    // the previous click instead of reading `current`. Such a version passes
    // every straight-line test in this file, because the sequences above happen
    // to feed their own result back in. Interleaving unrelated calls is what
    // separates "reads its arguments" from "remembers what it was told last".
    let checked = 0
    for (const [current, clicked, expected] of CASES) {
      for (const [otherCurrent, otherClicked] of CASES) {
        nextChampionSelection(otherCurrent, otherClicked)
        expect(
          nextChampionSelection(current, clicked),
          `${String(current)} + ${clicked} changed its answer after an ` +
            `unrelated ${String(otherCurrent)} + ${otherClicked}`,
        ).toBe(expected)
        checked += 1
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(
      CASES.length * CASES.length,
    )
  })
})
