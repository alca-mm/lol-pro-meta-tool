/**
 * Three CSS classes that outlived the markup they styled, and the one thing
 * that made removing them risky.
 *
 * `.panel-actions`, `.recommendation-side-toggle` and `.side-toggle-active`
 * were found during the 0.7.6 review: nothing under `src/` rendered any of
 * them. `.recommendation-side-toggle` in particular is a fossil of an earlier
 * shape of `RecommendationSideToggle.tsx`, which today renders
 * `role-filter-tabs` / `role-tab` / `role-tab-active` instead. The component
 * kept its NAME; only its class names moved on, which is exactly why a
 * grep for the component would have said "still in use".
 *
 * THE TRAP, and the reason this file exists rather than a one-line diff:
 * two of the dead rules were GROUPED with a live one.
 *
 *     .role-filter-tabs .role-tab,
 *     .recommendation-side-toggle button { ... }
 *
 * Deleting "the dead rule" there would have taken `.role-filter-tabs .role-tab`
 * with it and restyled a control that is on screen today. Only the dead half of
 * each selector list was removed. The assertions below therefore come in pairs:
 * the dead class is gone AND its live neighbour is still there. The second half
 * is the one that would have caught the mistake.
 *
 * Vitest runs in Node with no jsdom, so this is a source scan. It proves the
 * rules are absent from the stylesheet and unreferenced in the components; it
 * cannot prove the page still looks right. That stays a manual check.
 */

import { readFileSync, readdirSync } from "node:fs"

import { describe, expect, it } from "vitest"

const SRC = new URL("../src/", import.meta.url)

const readSrc = (relative: string): string =>
  readFileSync(new URL(relative, SRC), "utf8")

/** Comments removed. A rule that only survives as prose is not a live rule. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

/** Every `.ts`/`.tsx` under `src/`, so "unreferenced" means all of it. */
function componentSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
    const path = entry.replace(/\\/g, "/")
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue
    out.push({ path, text: stripComments(readSrc(path)) })
  }
  return out
}

/** The three that went. */
const REMOVED_CLASSES = [
  "panel-actions",
  "recommendation-side-toggle",
  "side-toggle-active",
] as const

/**
 * Live neighbours that shared a selector list with a removed class, or sat
 * beside one. Each is rendered by a real component today.
 */
const SURVIVING_NEIGHBOURS: readonly (readonly [selector: string, renderedBy: string])[] = [
  [".role-filter-tabs .role-tab {", "src/components/draft/RecommendationSideToggle.tsx"],
  [".role-filter-tabs .role-tab:hover {", "src/components/draft/RecommendationSideToggle.tsx"],
  [".role-filter-tabs .role-tab-active {", "src/components/draft/RecommendationSideToggle.tsx"],
  [".panel-title {", "src/components/team/TeamMembersPanel.tsx and six others"],
]

describe("the three dead CSS classes stay removed", () => {
  const css = stripComments(readSrc("index.css"))

  it("read a stylesheet that is actually the stylesheet", () => {
    // SCANNER PROBLEM guard. Every assertion below except the neighbour pairs
    // is negative, so an empty or wrongly resolved file would pass them all.
    expect(
      css.length,
      "SCANNER PROBLEM: src/index.css came back nearly empty. Fix the read before reading " +
        "anything here as a verdict about dead CSS.",
    ).toBeGreaterThan(10000)
    expect(css, "SCANNER PROBLEM: this does not look like the app stylesheet").toContain(
      ".scout-ban-phase-chip",
    )
  })

  it("has no rule for any of them left", () => {
    for (const name of REMOVED_CLASSES) {
      expect(
        css,
        `.${name} is back in src/index.css. It was removed in 0.7.7 because nothing under src/ ` +
          "renders it. If a component needs it again, add the class to that component in the " +
          "same change, or this guard is the only thing standing between the stylesheet and " +
          "another fossil.",
      ).not.toContain(`.${name}`)
    }
  })

  it("kept every live rule that shared a selector list with them", () => {
    // THE HALF THAT MATTERS. Two of the removed selectors were grouped with
    // `.role-filter-tabs .role-tab`, which is on screen today. Deleting the
    // whole rule would have passed the guard above and silently restyled a
    // live control.
    for (const [selector, renderedBy] of SURVIVING_NEIGHBOURS) {
      expect(
        css,
        `${selector} is gone from src/index.css. It shared a selector list with one of the ` +
          `removed classes and is rendered by ${renderedBy}, so removing it is a visual ` +
          "regression, not a cleanup.",
      ).toContain(selector)
    }
  })

  it("is referenced by no component under src/", () => {
    const sources = componentSources()

    // Anti-vacuity, and it names files rather than trusting a count: twenty
    // files can vanish from a walk without the number looking wrong.
    expect(
      sources.length,
      "SCANNER PROBLEM: found almost no TypeScript files under src/",
    ).toBeGreaterThan(80)
    for (const required of [
      "components/draft/RecommendationSideToggle.tsx",
      "components/scout/ScoutBanPlanPanel.tsx",
    ]) {
      expect(
        sources.some((file) => file.path === required),
        `SCANNER PROBLEM: ${required} was not walked, so this scan proves nothing about it.`,
      ).toBe(true)
    }

    for (const name of REMOVED_CLASSES) {
      const users = sources.filter((file) => file.text.includes(name))
      expect(
        users.map((file) => file.path),
        `${name} is referenced again under src/, but src/index.css no longer styles it. ` +
          "Either the class name is a typo for a live one, or the rule has to come back.",
      ).toEqual([])
    }
  })

  it("still renders the toggle through the class names that survived", () => {
    // The other direction: proving the class is unused is only reassuring if
    // the component that used to use it is still rendering SOMETHING.
    const toggle = stripComments(readSrc("components/draft/RecommendationSideToggle.tsx"))
    expect(toggle).toContain('className="role-filter-tabs"')
    expect(toggle).toContain('"role-tab"')
    expect(toggle).toContain('"role-tab-active"')
  })
})
