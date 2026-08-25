/**
 * Behaviour tests for the combobox id rule.
 *
 * WHY THIS FILE EXISTS. The 0.7.10 sweep found a real gap: ChampionCombobox
 * moves a highlight with ArrowDown/ArrowUp, but focus stays on the
 * `<input role="combobox">` (that is the listbox pattern), so without
 * `aria-activedescendant` a screen reader user heard the popup open and then
 * nothing at all while arrowing through it. 0.7.11 adds the attribute, and the
 * rule for WHEN it may be set moved into src/components/common/comboboxIds.ts
 * rather than staying as three template literals in the JSX. This file is the
 * coverage that makes that move worth anything - the same argument as
 * tests/championSelection.test.ts, tests/radioGroupNavigation.test.ts and the
 * reason scoutImportHelpers.ts and pluralMessage() live outside their
 * components.
 *
 * WHAT IS AND IS NOT COVERED. Vitest runs in Node here (vite.config.ts,
 * `test.environment: 'node'`) with no jsdom, so this file covers the DECISION
 * and nothing else: given a base id, whether the popup is on the page, how many
 * options are being rendered and which one is highlighted, what string (if any)
 * may go into `aria-activedescendant`. It renders no combobox, presses no key,
 * and says nothing about whether the attribute is wired to the input, whether
 * `<li id=...>` is actually emitted, whether focus stays put, or what NVDA
 * announces. Nobody should read this file as "the combobox is accessible" - it
 * says "given a render, the reference is either right or absent".
 *
 * THE ONE THING WORTH KNOWING BEFORE CHANGING ANYTHING HERE. The component
 * clamps `activeIndex` in a `useEffect`, and an effect runs AFTER the render
 * that scheduled it. So in the render in which the filter has just got
 * narrower, the state still holds the OLD, now-out-of-range index while the
 * `<ul>` already renders the SHORT list. That single render is the whole reason
 * `comboboxActiveDescendantId` re-checks the range against the count it is
 * handed - see "the render window" section, which is the load-bearing part of
 * this file.
 *
 * EVERY ASSERTION HERE HAS TO DISCRIMINATE. The mutants this file was written
 * against, and the tests that turn red for each:
 *
 *   the range check dropped (`activeIndex < 0 || activeIndex >= optionCount`)
 *       -> "drops the reference while the state is still the pre-clamp index"
 *       -> "an index one past the last option is out of range"
 *       -> "walks the shrink the way the component would"
 *   `!open` no longer short-circuiting
 *       -> "a closed popup has no options, so nothing may point at them"
 *       -> "refuses the same regardless of which base id is asking"
 *       -> "returns undefined and never the empty string"
 *   the whole `optionCount` guard dropped
 *       -> "a nonsense option count is refused, it is not compared against"
 *       -> "returns undefined and never the empty string"
 *          (NaN and 2.5 are the only two inputs that survive the range check;
 *          `optionCount <= 0` on its own is redundant, see the note on
 *          "a negative option count is refused")
 *   `!Number.isInteger(activeIndex)` dropped
 *       -> "a fractional index is refused rather than rendered into an id"
 *       -> "NaN is refused rather than rendered into an id"
 *   `undefined` replaced by `""`
 *       -> "returns undefined and never the empty string"
 *          (every other refusal test uses toBeUndefined(), never toBeFalsy())
 *   `baseId` dropped from the option scheme (`option-${index}`)
 *       -> "two comboboxes on one page cannot produce the same option id"
 *       -> "builds the exact id the markup has to carry"
 *   listbox and option sharing one scheme
 *       -> "the popup id collides with none of its own option ids"
 *       -> "builds the exact id the markup has to carry"
 *   the index dropped from the option scheme
 *       -> "different positions get different ids"
 *       -> "the popup id collides with none of its own option ids"
 *   a champion name folded into the id
 *       -> "the id at a position does not depend on which champion sits there"
 *       -> "takes two arguments, and neither of them is a champion name"
 *   a module-level cache, counter or any other hidden state
 *       -> "keeps no state between calls"
 */

import { describe, expect, it } from "vitest"

import {
  comboboxActiveDescendantId,
  comboboxListboxId,
  comboboxOptionId,
} from "../src/components/common/comboboxIds"
import { championLookupKey } from "../src/scout/championIdentity"

/**
 * Real `useId()` output, not "a"/"b".
 *
 * React 18 wraps generated ids in colons precisely so nobody hand-writes one,
 * and the component feeds `id ?? useId()` straight into these functions. Using
 * tidy single letters here would leave the colon-shaped case - the one that
 * actually ships - untested.
 */
const BASE_A = ":r0:"
const BASE_B = ":r1:"

/** A caller-supplied `id` prop, the other half of `id ?? generatedId`. */
const BASE_EXPLICIT = "champion-filter"

/** Every index a real filtered champion list would ever reach, and then some. */
const INDICES = [0, 1, 2, 3, 7, 12, 41, 168]

describe("comboboxOptionId: the id scheme", () => {
  it("builds the exact id the markup has to carry", () => {
    // Pinned as literals on purpose. A test that recomputed
    // `${baseId}-option-${index}` would agree with a mutant that dropped the
    // base or merged the two schemes exactly as readily as with the real one.
    expect(comboboxOptionId(BASE_A, 0)).toBe(":r0:-option-0")
    expect(comboboxOptionId(BASE_A, 7)).toBe(":r0:-option-7")
    expect(comboboxOptionId(BASE_B, 0)).toBe(":r1:-option-0")
    expect(comboboxOptionId(BASE_EXPLICIT, 3)).toBe("champion-filter-option-3")
  })

  it("answers the same for the same position, however often it is asked", () => {
    // The reference has to survive re-renders: the input's attribute and the
    // `<li>`'s `id` are computed in two separate expressions of the same
    // render, and they must agree.
    const first = comboboxOptionId(BASE_A, 4)
    const second = comboboxOptionId(BASE_A, 4)
    const third = comboboxOptionId(BASE_A, 4)

    expect(first).toBe(":r0:-option-4")
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it("different positions get different ids", () => {
    const seen = new Set<string>()
    let checked = 0

    for (const index of INDICES) {
      const id = comboboxOptionId(BASE_A, index)
      expect(seen.has(id), `index ${index} reused the id ${id}`).toBe(false)
      seen.add(id)
      checked += 1
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(INDICES.length)
    expect(seen.size).toBe(INDICES.length)

    // And the sharp pair, so this is not merely "the set grew": two adjacent
    // positions, which is what an arrow keypress moves between.
    expect(comboboxOptionId(BASE_A, 3)).not.toBe(comboboxOptionId(BASE_A, 4))
  })
})

describe("comboboxOptionId: two comboboxes on one page", () => {
  it("two comboboxes on one page cannot produce the same option id", () => {
    // The whole reason the base is in the scheme. ChampionCombobox is used more
    // than once per screen, and a DOM id is global: two options sharing one id
    // would make `aria-activedescendant` resolve to whichever came first in the
    // document, so arrowing in the second combobox would announce an option
    // from the first.
    let checked = 0

    for (const index of INDICES) {
      expect(
        comboboxOptionId(BASE_A, index),
        `index ${index} produced the same id for two different comboboxes`,
      ).not.toBe(comboboxOptionId(BASE_B, index))
      checked += 1
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(INDICES.length)

    // Both halves pinned, so this cannot pass by both sides being nonsense.
    expect(comboboxOptionId(BASE_A, 2)).toBe(":r0:-option-2")
    expect(comboboxOptionId(BASE_B, 2)).toBe(":r1:-option-2")
  })

  it("keeps a generated base and a caller-supplied base apart too", () => {
    // `id ?? generatedId` means both shapes are live at once: one combobox may
    // carry an explicit `id` prop while its neighbour falls back to useId().
    expect(comboboxOptionId(BASE_EXPLICIT, 0)).not.toBe(comboboxOptionId(BASE_A, 0))
    expect(comboboxOptionId(BASE_EXPLICIT, 0)).toBe("champion-filter-option-0")
  })
})

describe("comboboxListboxId: the popup's own id", () => {
  it("builds the exact id the markup has to carry", () => {
    expect(comboboxListboxId(BASE_A)).toBe(":r0:-listbox")
    expect(comboboxListboxId(BASE_B)).toBe(":r1:-listbox")
    expect(comboboxListboxId(BASE_EXPLICIT)).toBe("champion-filter-listbox")
  })

  it("answers the same for the same base, however often it is asked", () => {
    // `aria-controls` on the input and `id` on the `<ul>` are two separate
    // expressions in the same render. If this drifted, `aria-controls` would
    // dangle.
    expect(comboboxListboxId(BASE_A)).toBe(":r0:-listbox")
    expect(comboboxListboxId(BASE_A)).toBe(":r0:-listbox")
    expect(comboboxListboxId(BASE_A)).toBe(":r0:-listbox")
  })

  it("the popup id collides with none of its own option ids", () => {
    // Checked across a range of indices rather than against index 0 alone: a
    // mutant that merged the two schemes at some other position - say
    // `${baseId}-listbox` for every option - would slip past a single-index
    // check depending on which index it was given.
    const listboxId = comboboxListboxId(BASE_A)
    let checked = 0

    for (const index of INDICES) {
      expect(
        comboboxOptionId(BASE_A, index),
        `option ${index} collided with the listbox id ${listboxId}`,
      ).not.toBe(listboxId)
      checked += 1
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(INDICES.length)
    expect(listboxId, "and the listbox id itself is still the real one").toBe(":r0:-listbox")
  })

  it("keeps two comboboxes' popups apart as well", () => {
    expect(comboboxListboxId(BASE_A)).not.toBe(comboboxListboxId(BASE_B))
  })
})

describe("the ids carry no champion name, which is the point", () => {
  /**
   * WHY AN INDEX AND NOT THE NAME. A name-derived id looks tidier and is a trap
   * this repo has already paid for. CLAUDE.md, section "Champion-Identitaet":
   * `championLookupKey()` strips everything outside `a-z0-9`, so a Korean name,
   * a fullwidth-latin name or a punctuation-only string all come out as the
   * EMPTY STRING - and the empty string is a valid Map key, which is how a
   * stats-import paste of three different champions once collapsed into one
   * entry. The same class of bug in a DOM id is worse, not better: several
   * `<li>` elements would share one id and `aria-activedescendant` would
   * resolve to whichever came first, so arrowing onto 야스오 would announce
   * 아리. Raw, unstripped names are no better - `Nunu & Willump` and `Kai'Sa`
   * would go into the markup unescaped.
   *
   * The index sidesteps all of it. It is stable for a given rendered list,
   * which is the only thing an `aria-activedescendant` reference has to
   * survive.
   */

  /** Five ordinary champions. */
  const CALM_LIST = ["Ahri", "Zed", "Yasuo", "Ashe", "Garen"]

  /**
   * Five champions whose names are exactly what breaks a name-derived scheme.
   * Same length as CALM_LIST so the two produce comparable id lists.
   */
  const AWKWARD_LIST = ["아리", "Ａｈｒｉ", "---", "Nunu & Willump", "Kai'Sa"]

  it("proves the collision a name-derived id would have had", () => {
    // Not prose: the actual function CLAUDE.md warns about, run on the actual
    // names. Three of the five collapse to "" together, so a scheme built on it
    // would have handed out one id for three different options.
    const keys = AWKWARD_LIST.map((name) => championLookupKey(name))

    expect(keys[0], "a Korean name strips to nothing").toBe("")
    expect(keys[1], "fullwidth latin strips to nothing").toBe("")
    expect(keys[2], "punctuation strips to nothing").toBe("")
    expect(new Set(keys).size, "so five names would have produced three ids").toBe(3)

    // The two that do survive still lose their punctuation, which is the other
    // half of why raw names were never an option either.
    expect(keys[3]).toBe("nunuwillump")
    expect(keys[4]).toBe("kaisa")
  })

  it("the id at a position does not depend on which champion sits there", () => {
    // THE ASSERTION THAT MATTERS. Two completely different champion lists, and
    // position for position the ids are identical - because the name never
    // reaches the function.
    const calmIds = CALM_LIST.map((_name, index) => comboboxOptionId(BASE_A, index))
    const awkwardIds = AWKWARD_LIST.map((_name, index) => comboboxOptionId(BASE_A, index))

    expect(awkwardIds).toEqual(calmIds)
    expect(calmIds).toEqual([
      ":r0:-option-0",
      ":r0:-option-1",
      ":r0:-option-2",
      ":r0:-option-3",
      ":r0:-option-4",
    ])

    // And all five stay distinct, which is exactly what the name-derived
    // version above fails to do.
    expect(new Set(awkwardIds).size).toBe(5)
  })

  it("takes two arguments, and neither of them is a champion name", () => {
    // The structural half of the claim above. If someone later threads the name
    // in as a third parameter "just for readability", the ids stop being
    // name-free and this fails before any behaviour test notices.
    expect(comboboxOptionId.length).toBe(2)
    expect(comboboxListboxId.length).toBe(1)
  })

  it("emits nothing a champion name could have smuggled into the markup", () => {
    // A DOM id carrying a space, an ampersand or an apostrophe is a selector
    // and escaping problem on top of the collision problem. The generated shape
    // is narrow enough to state outright.
    let checked = 0

    for (const index of INDICES) {
      expect(comboboxOptionId(BASE_A, index)).toMatch(/^:r0:-option-\d+$/)
      checked += 1
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(INDICES.length)
    expect(comboboxListboxId(BASE_A)).toMatch(/^:r0:-listbox$/)
  })
})

describe("comboboxActiveDescendantId: when there may be a reference", () => {
  it("points at the highlighted option while the popup is open", () => {
    // The ordinary case, and the anti-vacuity anchor for every refusal below:
    // without it, "always undefined" would pass the whole section.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 0)).toBe(":r0:-option-0")
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 4)).toBe(":r0:-option-4")
    expect(comboboxActiveDescendantId(BASE_B, true, 10, 4)).toBe(":r1:-option-4")
  })

  it("agrees with the id the option itself carries", () => {
    // The two halves of the reference are computed in different places in the
    // component (`aria-activedescendant` on the input, `id` on the `<li>`).
    // Drift between them is a dangling reference that renders perfectly.
    for (const index of [0, 1, 5, 9]) {
      expect(comboboxActiveDescendantId(BASE_A, true, 10, index)).toBe(
        comboboxOptionId(BASE_A, index),
      )
    }
  })

  it("a closed popup has no options, so nothing may point at them", () => {
    // Both sides of the `open` flag, with a count and index that are otherwise
    // perfectly valid. A closed case that ALSO had a bad index would prove
    // nothing about `open` - it would fail for two reasons at once (the
    // "Nautilus Jungle" lesson in CLAUDE.md P4e).
    expect(comboboxActiveDescendantId(BASE_A, false, 10, 4)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 4)).toBe(":r0:-option-4")

    // Index 0 too, so this is not "only the middle of the list is refused".
    expect(comboboxActiveDescendantId(BASE_A, false, 10, 0)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 0)).toBe(":r0:-option-0")
  })

  it("an empty option list is refused", () => {
    // `open` with nothing matching renders the "no match" note, not a listbox,
    // so there is no `<li>` to reference. Paired with the one-option case so
    // the boundary is checked from both sides.
    expect(comboboxActiveDescendantId(BASE_A, true, 0, 0)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 1, 0)).toBe(":r0:-option-0")
  })

  it("an index one past the last option is out of range", () => {
    // THE BOUNDARY PAIR. `optionCount` and `optionCount - 1` differ by one, and
    // only one of them is a real option. A test that checked either alone would
    // pass against an off-by-one.
    expect(comboboxActiveDescendantId(BASE_A, true, 5, 5)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 5, 4)).toBe(":r0:-option-4")

    // Same pair at a list of one, where the two are 1 and 0.
    expect(comboboxActiveDescendantId(BASE_A, true, 1, 1)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 1, 0)).toBe(":r0:-option-0")
  })

  it("an index far past the end is refused as well", () => {
    expect(comboboxActiveDescendantId(BASE_A, true, 5, 6)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 5, 168)).toBeUndefined()
  })

  it("a negative index is refused", () => {
    // The other boundary pair: -1 and 0.
    expect(comboboxActiveDescendantId(BASE_A, true, 5, -1)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 5, 0)).toBe(":r0:-option-0")

    expect(comboboxActiveDescendantId(BASE_A, true, 5, -168)).toBeUndefined()
  })

  it("a fractional index is refused rather than rendered into an id", () => {
    // 1.5 sits comfortably inside the range, so the range check alone lets it
    // through and the result would be an id ending "-option-1.5", which matches
    // no element. Only the integer check catches this, and the 1/2 pair either
    // side keeps the case honest.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 1.5)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 1)).toBe(":r0:-option-1")
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 2)).toBe(":r0:-option-2")

    expect(comboboxActiveDescendantId(BASE_A, true, 10, 0.5)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 9.999)).toBeUndefined()
  })

  it("NaN is refused rather than rendered into an id", () => {
    // NaN survives every comparison: `NaN < 0` is false and `NaN >= 10` is
    // false, so the range check waves it through and the id would end
    // "-option-NaN". Same for the infinities, which are not integers either.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, Number.NaN)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, 10, Number.NEGATIVE_INFINITY)).toBeUndefined()
  })

  it("a nonsense option count is refused, it is not compared against", () => {
    // The two counts that get past the range check on their own:
    //   2.5 - the index 1 is a real option and 1 < 2.5 holds, so without the
    //         integer check on the COUNT this returns ":r0:-option-1" from a
    //         count that cannot describe a rendered list.
    //   NaN - `1 >= NaN` is false and `1 < 0` is false, so the range check
    //         waves it through entirely.
    expect(comboboxActiveDescendantId(BASE_A, true, 2.5, 1)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, Number.NaN, 1)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, Number.POSITIVE_INFINITY, 1)).toBeUndefined()

    // The honest counterpart, so this is not "any count is refused": the same
    // index against the nearest sane counts.
    expect(comboboxActiveDescendantId(BASE_A, true, 2, 1)).toBe(":r0:-option-1")
    expect(comboboxActiveDescendantId(BASE_A, true, 3, 1)).toBe(":r0:-option-1")
  })

  it("a negative option count is refused", () => {
    expect(comboboxActiveDescendantId(BASE_A, true, -1, 0)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, true, -5, 0)).toBeUndefined()

    // NOTE for whoever mutates this: `optionCount <= 0` is redundant given the
    // range check, because no integer `activeIndex >= 0` can satisfy
    // `activeIndex < optionCount` when the count is zero or below. It is kept
    // because it states the contract at the top of the function rather than
    // leaving it as a consequence three lines down, and because it is the only
    // clause that survives if the range check is ever narrowed. The `-1` case
    // above is therefore a contract test, not a mutant killer; the killers for
    // that guard line are the NaN and 2.5 counts in the test above it.
    expect(comboboxActiveDescendantId(BASE_A, true, -1, -1)).toBeUndefined()
  })

  it("refuses the same regardless of which base id is asking", () => {
    // A refusal that only held for one base would mean the guard was reading
    // the base somehow. It is not, and this pins that.
    for (const base of [BASE_A, BASE_B, BASE_EXPLICIT]) {
      expect(comboboxActiveDescendantId(base, false, 10, 4)).toBeUndefined()
      expect(comboboxActiveDescendantId(base, true, 0, 0)).toBeUndefined()
      expect(comboboxActiveDescendantId(base, true, 5, 5)).toBeUndefined()
      expect(comboboxActiveDescendantId(base, true, 5, -1)).toBeUndefined()
    }
  })
})

describe("comboboxActiveDescendantId: the render window after the list shrinks", () => {
  /**
   * THE LOAD-BEARING SECTION OF THIS FILE.
   *
   * ChampionCombobox clamps the highlight in an effect:
   *
   *     useEffect(() => {
   *       setActiveIndex(prev => Math.min(prev, Math.max(0, filtered.length - 1)))
   *     }, [filtered.length])
   *
   * An effect runs AFTER the render that scheduled it. So there is exactly one
   * render in which `filtered` is already the SHORT list - it is what the `<ul>`
   * maps over - while `activeIndex` is still the index from before the query got
   * narrower. The user typed one more letter; ten options became two; the
   * highlight still says 7.
   *
   * Without the range check inside this function, that render would emit
   * `aria-activedescendant=":r0:-option-7"` while the DOM holds ids 0 and 1.
   * That is a dangling reference, and it is a WORSE outcome than the bug
   * 0.7.11 set out to fix: no attribute at all makes a screen reader fall back
   * to announcing the input, while a reference to a missing element is
   * undefined behaviour that AT vendors handle differently and none of them
   * handle usefully. One render is enough - it is the render the user is
   * looking at while typing.
   *
   * The function reads the count it is HANDED (`filtered.length`, the list
   * actually being rendered) rather than trusting the state, which is what
   * closes the window.
   */

  it("drops the reference while the state is still the pre-clamp index", () => {
    // Ten options, highlight on 7, user types one more letter: two options
    // left, highlight still 7 for one render.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 7)).toBe(":r0:-option-7")
    expect(
      comboboxActiveDescendantId(BASE_A, true, 2, 7),
      "the list is down to 2 options but the state still says 7: the reference " +
        "has to disappear, not point at an option that is not in the DOM",
    ).toBeUndefined()

    // And the render after the effect has run, where the clamp has landed on
    // the last real option. The reference comes back on its own.
    expect(comboboxActiveDescendantId(BASE_A, true, 2, 1)).toBe(":r0:-option-1")
  })

  it("walks the shrink the way the component would", () => {
    // The state the component actually keeps, clamped the way its effect does
    // it, so the sequence below is the real one and not a hand-picked pair.
    const clamp = (prev: number, count: number) => Math.min(prev, Math.max(0, count - 1))

    let activeIndex = 7

    // Render N: the full list, highlight valid.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, activeIndex)).toBe(":r0:-option-7")

    // Render N+1: the query narrowed. `filtered` is already short, the state is
    // not yet - this is the window.
    expect(
      comboboxActiveDescendantId(BASE_A, true, 2, activeIndex),
      "the window render must not reference option 7",
    ).toBeUndefined()

    // The effect from render N+1 now runs and clamps.
    activeIndex = clamp(activeIndex, 2)
    expect(activeIndex, "the clamp lands on the last real option").toBe(1)

    // Render N+2: consistent again.
    expect(comboboxActiveDescendantId(BASE_A, true, 2, activeIndex)).toBe(":r0:-option-1")
  })

  it("covers the shrink all the way to nothing matching", () => {
    // The end of the same typing sequence: one more letter and nothing matches
    // at all, so the component renders the "no match" note instead of a
    // listbox. `listboxRendered` is false there, and the count is 0 - both
    // reasons agree, and the function is handed both.
    expect(comboboxActiveDescendantId(BASE_A, true, 0, 7)).toBeUndefined()
    expect(comboboxActiveDescendantId(BASE_A, false, 0, 7)).toBeUndefined()

    // Deleting the letter again restores the full list and a working reference.
    expect(comboboxActiveDescendantId(BASE_A, true, 10, 7)).toBe(":r0:-option-7")
  })

  it("refuses every stale index the shrink can leave behind", () => {
    // The full window for one shrink: ten options down to three. Indices 0..2
    // survive, 3..9 are stale and every one of them has to go quiet.
    let survived = 0
    let refused = 0

    for (let stale = 0; stale < 10; stale += 1) {
      const result = comboboxActiveDescendantId(BASE_A, true, 3, stale)
      if (stale < 3) {
        expect(result, `index ${stale} is still a real option`).toBe(`:r0:-option-${stale}`)
        survived += 1
      } else {
        expect(result, `index ${stale} no longer exists in a 3-option list`).toBeUndefined()
        refused += 1
      }
    }

    expect(survived, "guard against a loop that only ever took one branch").toBe(3)
    expect(refused, "guard against a loop that only ever took one branch").toBe(7)
  })
})

describe("comboboxActiveDescendantId: undefined, not the empty string", () => {
  /**
   * WHY THIS IS ITS OWN SECTION. React drops an attribute whose value is
   * `undefined` and RENDERS one whose value is `""`. So `aria-activedescendant`
   * returning `""` would put `aria-activedescendant=""` into the markup, which
   * is a dangling reference rather than an absent one - the exact failure the
   * range check exists to prevent, reintroduced by the return value.
   *
   * `toBeFalsy()` cannot tell the two apart. Every refusal in this file uses
   * `toBeUndefined()`, and this section says why out loud.
   */

  const REFUSALS: ReadonlyArray<readonly [string, boolean, number, number]> = [
    ["closed popup", false, 10, 4],
    ["closed popup, index 0", false, 10, 0],
    ["closed popup, empty list", false, 0, 0],
    ["no options", true, 0, 0],
    ["index one past the end", true, 5, 5],
    ["index far past the end", true, 5, 168],
    ["negative index", true, 5, -1],
    ["fractional index", true, 10, 1.5],
    ["NaN index", true, 10, Number.NaN],
    ["infinite index", true, 10, Number.POSITIVE_INFINITY],
    ["fractional option count", true, 2.5, 1],
    ["NaN option count", true, Number.NaN, 1],
    ["negative option count", true, -1, 0],
    ["stale index after the list shrank", true, 2, 7],
  ]

  it("returns undefined and never the empty string", () => {
    let checked = 0

    for (const [label, open, optionCount, activeIndex] of REFUSALS) {
      const result = comboboxActiveDescendantId(BASE_A, open, optionCount, activeIndex)

      expect(result, `${label} did not return undefined`).toBeUndefined()
      expect(result, `${label} returned the empty string, which React renders`).not.toBe("")
      expect(typeof result, `${label} returned something other than undefined`).toBe("undefined")
      checked += 1
    }

    expect(checked, "guard against an emptied table asserting nothing").toBe(REFUSALS.length)
    expect(REFUSALS.length, "and against the table being trimmed to the easy rows").toBe(14)
  })

  it("returns a non-empty string when it does return one", () => {
    // The other half: a refusal test alone is satisfied by "always undefined".
    const result = comboboxActiveDescendantId(BASE_A, true, 10, 4)

    expect(typeof result).toBe("string")
    expect(result).toBe(":r0:-option-4")
    expect(result).not.toBe("")
  })
})

describe("the three functions: purity", () => {
  /** Every shape the callers can produce, sane and otherwise. */
  const OPTION_COUNTS = [0, 1, 2, 5, 10, 168, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]
  const ACTIVE_INDICES = [0, 1, 4, 9, 168, -1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY]

  it("never throws, whatever it is handed", () => {
    let checked = 0

    for (const base of [BASE_A, BASE_B, BASE_EXPLICIT, ""]) {
      for (const open of [true, false]) {
        for (const optionCount of OPTION_COUNTS) {
          for (const activeIndex of ACTIVE_INDICES) {
            const result = comboboxActiveDescendantId(base, open, optionCount, activeIndex)
            expect(
              result === undefined || typeof result === "string",
              `${base}/${String(open)}/${optionCount}/${activeIndex} produced ` +
                `${String(result)}, which is neither a reference nor an absence`,
            ).toBe(true)
            checked += 1
          }
        }
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(
      4 * 2 * OPTION_COUNTS.length * ACTIVE_INDICES.length,
    )
  })

  it("answers the same for the same arguments, however often it is asked", () => {
    let checked = 0

    for (const open of [true, false]) {
      for (const optionCount of OPTION_COUNTS) {
        for (const activeIndex of ACTIVE_INDICES) {
          const first = comboboxActiveDescendantId(BASE_A, open, optionCount, activeIndex)
          const second = comboboxActiveDescendantId(BASE_A, open, optionCount, activeIndex)
          const third = comboboxActiveDescendantId(BASE_A, open, optionCount, activeIndex)

          expect(second).toBe(first)
          expect(third).toBe(first)
          checked += 1
        }
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(
      2 * OPTION_COUNTS.length * ACTIVE_INDICES.length,
    )
  })

  it("keeps no state between calls", () => {
    // The mutant this is aimed at is a module-level `let lastIndex` or a memo
    // keyed on something other than the arguments. Such a version passes every
    // straight-line test in this file, because the sequences above happen to
    // walk forwards. Interleaving unrelated calls is what separates "reads its
    // arguments" from "remembers what it was told last".
    const PAIRS: ReadonlyArray<readonly [number, number, string | undefined]> = [
      [10, 4, ":r0:-option-4"],
      [10, 0, ":r0:-option-0"],
      [2, 7, undefined],
      [5, 5, undefined],
      [1, 0, ":r0:-option-0"],
      [0, 0, undefined],
    ]

    let checked = 0

    for (const [optionCount, activeIndex, expected] of PAIRS) {
      for (const [otherCount, otherIndex] of PAIRS) {
        // Unrelated call first, including the other two functions, which share
        // the module and could share a cache with it.
        comboboxActiveDescendantId(BASE_B, false, otherCount, otherIndex)
        comboboxOptionId(BASE_B, otherIndex)
        comboboxListboxId(BASE_B)

        expect(
          comboboxActiveDescendantId(BASE_A, true, optionCount, activeIndex),
          `count ${optionCount} + index ${activeIndex} changed its answer after ` +
            `an unrelated count ${otherCount} + index ${otherIndex}`,
        ).toBe(expected)
        checked += 1
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(
      PAIRS.length * PAIRS.length,
    )
  })

  it("the id builders keep no state either", () => {
    let checked = 0

    for (const index of INDICES) {
      for (const other of INDICES) {
        comboboxOptionId(BASE_B, other)
        comboboxListboxId(BASE_B)

        expect(comboboxOptionId(BASE_A, index)).toBe(`:r0:-option-${index}`)
        expect(comboboxListboxId(BASE_A)).toBe(":r0:-listbox")
        checked += 1
      }
    }

    expect(checked, "guard against an emptied loop asserting nothing").toBe(
      INDICES.length * INDICES.length,
    )
  })
})
