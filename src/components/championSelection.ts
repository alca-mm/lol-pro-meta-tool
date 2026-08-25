/**
 * Which champion the stats table should have selected after a click.
 *
 * WHY THIS IS A FUNCTION AND NOT A TERNARY IN THE JSX
 *
 * Two controls now trigger the same selection: the row itself, which stays
 * clickable for the mouse, and the real `<button>` in the champion cell, which
 * is what a keyboard reaches. Written inline they would be two copies of the
 * same rule, and this repo has been bitten by exactly that shape three times
 * (`ScoutManualSource` in three places, `overwrittenRows` against
 * `removedExistingRows`, `banPhaseCounts()` against `prioritizedBans`). One of
 * the copies drifts, and the two controls disagree about what a second click
 * does.
 *
 * The second reason is testability: Vitest runs in Node here with no jsdom
 * (`vite.config.ts`, `test.environment: 'node'`), so a rule living inside JSX
 * cannot be tested at all. Same argument as `scoutImportHelpers.ts`,
 * `scoutUiHelpers.ts` and `pluralMessage()`.
 *
 * THE RULE: clicking the champion that is already open closes it, clicking any
 * other champion opens that one. `null` means "nothing expanded".
 *
 * Pure, total, and it never throws: an empty `clicked` is returned as-is rather
 * than guessed at, because inventing a selection would be worse than showing
 * none.
 */
export function nextChampionSelection(
  current: string | null,
  clicked: string,
): string | null {
  return current === clicked ? null : clicked
}
