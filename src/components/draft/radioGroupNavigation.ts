/**
 * Arrow-key resolution for ARIA radio groups.
 *
 * WHY THIS IS A MODULE AND NOT AN `onKeyDown` BODY: vitest runs in Node here
 * (vite.config.ts, `test.environment: 'node'`) with no jsdom, so a handler
 * written inside a component cannot be asserted at all. The same reasoning put
 * every other piece of testable display logic in this project into a helper
 * next to its components - draftUiHelpers.ts, scoutUiHelpers.ts,
 * teamUiHelpers.ts, playerResultsFormat.ts. This is that pattern applied to
 * keyboard behaviour: the DECISION ("which option should Arrow-Right land on?")
 * is pure and fully covered by tests; only the two lines that call `onChange`
 * and `.focus()` remain untestable here, and those are named in the manual
 * checklist instead of being quietly assumed.
 *
 * WHY IT EXISTS AT ALL: `role="radiogroup"` is not just a label. Once a control
 * reports that role, NVDA switches to focus mode on it and both NVDA and JAWS
 * read out canned group guidance that tells the user to use the arrow keys. A
 * radiogroup without arrow keys therefore does not merely fall short of the
 * APG - it makes assistive technology advertise a behaviour the page ignores,
 * after which the user has to discover Tab plus Space on their own. The role
 * and the keys belong together.
 *
 * Follows the WAI-ARIA Authoring Practices radio group pattern: Down and Right
 * move to the next option, Up and Left to the previous, both WRAPPING; Home and
 * End jump to the ends. Selection follows focus, which is what makes a single
 * `onChange` enough. Space and Enter need no handling - the options are real
 * `<button>` elements, so the browser still synthesises a click from them.
 *
 * Pure: no React, no DOM, no I/O.
 */

/** Keys this module answers to. Anything else yields `null`, meaning "not ours". */
const PREVIOUS_KEYS = ["ArrowUp", "ArrowLeft"]
const NEXT_KEYS = ["ArrowDown", "ArrowRight"]

/**
 * The option an arrow/Home/End press should move to, or `null` to leave the
 * event alone.
 *
 * `null` is the important half of the contract: the caller must not
 * `preventDefault()` on a key this function did not claim, or it would swallow
 * Tab, Space, Enter and every browser and screen-reader shortcut that passes
 * through the group.
 *
 * Also returns `null` when the move would be a no-op - `current` is unknown to
 * `options`, or Home is pressed while already on the first option. That keeps
 * the caller from firing a state update and a focus jump that change nothing.
 *
 * Wrapping is deliberate and is what the APG specifies. For the two-option
 * group this was written for it means either arrow direction simply toggles,
 * which is the behaviour a sighted keyboard user expects from a pair.
 */
export function nextRadioValue<T>(options: readonly T[], current: T, key: string): T | null {
    if (options.length === 0) return null

    const index = options.indexOf(current)
    if (index === -1) return null

    const target = resolveTargetIndex(options.length, index, key)
    if (target === null || target === index) return null

    return options[target]
}

function resolveTargetIndex(length: number, index: number, key: string): number | null {
    if (PREVIOUS_KEYS.includes(key)) return (index - 1 + length) % length
    if (NEXT_KEYS.includes(key)) return (index + 1) % length
    if (key === "Home") return 0
    if (key === "End") return length - 1
    return null
}

/**
 * The `tabIndex` an option should carry, implementing a roving tabindex.
 *
 * The whole group is ONE tab stop: the checked option is reachable with Tab,
 * the others are reached with the arrow keys. That is the APG pattern, and it
 * is only safe BECAUSE {@link nextRadioValue} exists - a roving tabindex
 * shipped without arrow keys would leave every unchecked option unreachable by
 * keyboard, which is a far worse defect than the one this fixes. The two must
 * land together, and a test pins that they did.
 *
 * FALLBACK THAT MATTERS: if `current` matches no option, every option gets `0`
 * rather than every option getting `-1`. A group in an unexpected state
 * degrades to "all options are tab stops", never to "nothing here can be
 * focused".
 */
export function radioTabIndex<T>(options: readonly T[], current: T, option: T): number {
    if (options.indexOf(current) === -1) return 0
    return option === current ? 0 : -1
}
