/**
 * The DOM ids a combobox needs to point at its own popup, and the rule for when
 * `aria-activedescendant` may be set at all.
 *
 * WHY THIS IS A MODULE AND NOT THREE TEMPLATE LITERALS IN THE JSX
 *
 * Vitest runs in Node here with no jsdom (`vite.config.ts`,
 * `test.environment: 'node'`), so a rule written inline in a component cannot be
 * tested at all. The same argument as `scoutUiHelpers.ts`, `scoutImportHelpers.ts`
 * and `championSelection.ts`. And the rule below is genuinely worth testing: it
 * is the difference between a screen reader announcing the highlighted champion
 * and it pointing at an element that is not on the page.
 *
 * WHY THE IDS ARE BUILT FROM AN INDEX AND NOT FROM THE CHAMPION NAME
 *
 * A name-derived id looks tidier and is a trap this repo has already documented.
 * `championLookupKey()` strips everything outside `a-z0-9`, which makes the id
 * for a Korean name, a fullwidth-latin name or a punctuation-only string the
 * EMPTY STRING - so several options would share one id and
 * `aria-activedescendant` would resolve to whichever came first (see the
 * "Champion-Identitaet" section in CLAUDE.md, where the same class of bug merged
 * three champions into one during a stats import). Raw names are no better:
 * `Nunu & Willump` and `Kai'Sa` would go into the markup unescaped.
 *
 * The index sidesteps all of it. It is stable for a given rendered list, which
 * is the only thing an `aria-activedescendant` reference has to survive, and it
 * cannot collide with anything.
 */

/** The popup's own id, so the input can point `aria-controls` at it. */
export function comboboxListboxId(baseId: string): string {
  return `${baseId}-listbox`
}

/**
 * The id of the option at `index`.
 *
 * Namespaced by `baseId`, which is the input's id: two comboboxes on one page
 * therefore cannot produce the same option id. The component feeds this either
 * the caller's `id` prop or React's `useId()`, and both are unique per instance
 * and stable across renders.
 */
export function comboboxOptionId(baseId: string, index: number): string {
  return `${baseId}-option-${index}`
}

/**
 * The value for `aria-activedescendant`, or `undefined` when there must not be
 * one.
 *
 * `undefined` rather than `""`: React drops the attribute entirely for
 * `undefined`, while an empty string would render `aria-activedescendant=""`,
 * which is a dangling reference rather than an absent one.
 *
 * THE RANGE CHECK IS NOT DEFENSIVE PADDING, IT IS THE POINT. The component
 * clamps `activeIndex` to the filtered list inside a `useEffect`, so during the
 * render in which the list has just got shorter the state is still the OLD,
 * now-out-of-range index. Trusting it for one render would emit a reference to
 * an option that is not in the DOM, which is exactly the failure this attribute
 * exists to avoid. Reading the count that is actually being rendered, right
 * here, closes that window.
 *
 * Pure and total: no DOM, no clock, and it never throws.
 */
export function comboboxActiveDescendantId(
  baseId: string,
  open: boolean,
  optionCount: number,
  activeIndex: number,
): string | undefined {
  // Closed popup: the options do not exist, so nothing may point at them.
  if (!open) return undefined
  // Nothing matched the query. The component renders an empty-state note here,
  // not a listbox, so again there is no option to reference.
  if (!Number.isInteger(optionCount) || optionCount <= 0) return undefined
  // Out of range, negative, fractional or NaN - see the note above.
  if (!Number.isInteger(activeIndex)) return undefined
  if (activeIndex < 0 || activeIndex >= optionCount) return undefined

  return comboboxOptionId(baseId, activeIndex)
}
