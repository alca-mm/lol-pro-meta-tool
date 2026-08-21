import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { nextRadioValue, radioTabIndex } from "../src/components/draft/radioGroupNavigation"

/**
 * WHAT THESE TESTS DO AND DO NOT COVER.
 *
 * vitest runs in Node here (vite.config.ts, `test.environment: 'node'`) with no
 * jsdom. So the DECISION - which option an Arrow-Right should select, and which
 * option owns the tab stop - is covered exhaustively below, because it was
 * deliberately extracted into a pure module for that reason.
 *
 * What is NOT covered, and stays a manual check: that the handler is wired to
 * the wrapper, that `preventDefault` suppresses page scroll, that `.focus()`
 * actually moves focus, and that a screen reader announces any of it. The last
 * section pins the WIRING as source text, which proves the call sites exist and
 * nothing more. Nobody should read these tests as "keyboard navigation works" -
 * they say "given a key, the right option is chosen".
 */

const SIDES = ["blue", "red"] as const
const ROLES = ["all", "top", "jungle", "mid", "bot", "support"] as const

describe("nextRadioValue: the keys it claims", () => {
    it("moves forward on ArrowDown and ArrowRight", () => {
        expect(nextRadioValue(ROLES, "top", "ArrowRight")).toBe("jungle")
        expect(nextRadioValue(ROLES, "top", "ArrowDown")).toBe("jungle")
    })

    it("moves backward on ArrowUp and ArrowLeft", () => {
        expect(nextRadioValue(ROLES, "mid", "ArrowLeft")).toBe("jungle")
        expect(nextRadioValue(ROLES, "mid", "ArrowUp")).toBe("jungle")
    })

    it("jumps to the ends on Home and End", () => {
        expect(nextRadioValue(ROLES, "mid", "Home")).toBe("all")
        expect(nextRadioValue(ROLES, "mid", "End")).toBe("support")
    })

    it("wraps in both directions, as the APG specifies", () => {
        expect(nextRadioValue(ROLES, "support", "ArrowRight")).toBe("all")
        expect(nextRadioValue(ROLES, "all", "ArrowLeft")).toBe("support")
    })

    it("makes either arrow direction a toggle in a two-option group", () => {
        for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
            expect(nextRadioValue(SIDES, "blue", key)).toBe("red")
            expect(nextRadioValue(SIDES, "red", key)).toBe("blue")
        }
    })
})

describe("nextRadioValue: the keys it must NOT claim", () => {
    /**
     * THE LOAD-BEARING TEST OF THIS FILE. The caller does
     * `if (next === null) return` before `preventDefault()`, so every key that
     * yields non-null gets its default behaviour suppressed. A key wrongly
     * claimed here is a key the browser stops handling: Tab would no longer
     * leave the group, Space and Enter would no longer activate the button.
     * That would be a WORSE keyboard defect than the one this module fixes.
     */
    const UNCLAIMED = [
        "Tab",
        " ",
        "Spacebar",
        "Enter",
        "Escape",
        "a",
        "A",
        "5",
        "F5",
        "PageUp",
        "PageDown",
        "Shift",
        "Backspace",
    ]

    it.each(UNCLAIMED)("leaves %j to the browser", (key) => {
        expect(nextRadioValue(SIDES, "blue", key)).toBeNull()
    })

    it("is case-sensitive, matching KeyboardEvent.key exactly", () => {
        // `event.key` is "ArrowRight", never "arrowright". Accepting the
        // lowercase form would claim a key no browser sends, and would invite
        // the reader to assume some normalisation happens. It does not.
        expect(nextRadioValue(SIDES, "blue", "arrowright")).toBeNull()
        expect(nextRadioValue(SIDES, "blue", "ARROWRIGHT")).toBeNull()
    })
})

describe("nextRadioValue: the no-op cases", () => {
    it("returns null rather than the value it is already on", () => {
        // Home while first, End while last. Returning the current value would
        // fire a pointless state update and a pointless focus jump.
        expect(nextRadioValue(ROLES, "all", "Home")).toBeNull()
        expect(nextRadioValue(ROLES, "support", "End")).toBeNull()
    })

    it("returns null when current is not one of the options", () => {
        expect(nextRadioValue(SIDES, "green" as never, "ArrowRight")).toBeNull()
    })

    it("returns null for an empty option list", () => {
        expect(nextRadioValue([] as readonly string[], "blue", "ArrowRight")).toBeNull()
    })

    it("returns null for a single-option group on every key it otherwise claims", () => {
        for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
            expect(nextRadioValue(["only"], "only", key)).toBeNull()
        }
    })

    it("never returns a value outside the option list", () => {
        // Property-style sweep: no key, from no starting point, can invent an
        // option. `onChange` is typed to the union, so an escape here would be a
        // state the rest of the draft tab cannot represent.
        for (const start of ROLES) {
            for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "Tab", "x"]) {
                const result = nextRadioValue(ROLES, start, key)
                if (result !== null) expect(ROLES).toContain(result)
            }
        }
    })

    it("terminates a full cycle back to the start", () => {
        let current: (typeof ROLES)[number] = "all"
        for (let step = 0; step < ROLES.length; step += 1) {
            current = nextRadioValue(ROLES, current, "ArrowRight") ?? current
        }
        expect(current).toBe("all")
    })
})

describe("radioTabIndex: one tab stop per group", () => {
    it("gives the checked option 0 and the others -1", () => {
        expect(radioTabIndex(SIDES, "blue", "blue")).toBe(0)
        expect(radioTabIndex(SIDES, "blue", "red")).toBe(-1)
    })

    it("gives exactly one option a tab stop, for every checked value", () => {
        for (const checked of ROLES) {
            const stops = ROLES.filter((option) => radioTabIndex(ROLES, checked, option) === 0)
            expect(stops).toEqual([checked])
        }
    })

    it("degrades to all-reachable, never to none-reachable, on an unknown current", () => {
        // The failure that matters. If a bad state made every option -1, the
        // group would drop out of the tab order entirely and no keyboard user
        // could reach it - strictly worse than having no roving tabindex at all.
        const stops = ROLES.filter((option) => radioTabIndex(ROLES, "bogus" as never, option) === 0)
        expect(stops).toEqual([...ROLES])
    })
})

describe("the wiring exists (source scan, not behaviour)", () => {
    const source = readFileSync("src/components/draft/RecommendationSideToggle.tsx", "utf8")

    it("routes keydown through the helper and guards before preventDefault", () => {
        expect(source).toContain("onKeyDown={handleKeyDown}")
        expect(source).toContain("nextRadioValue(SIDES, recommendationSide, event.key)")
        // Order is the point: the early return must precede the suppression.
        expect(source.indexOf("if (next === null) return")).toBeLessThan(
            source.indexOf("event.preventDefault()"),
        )
    })

    it("pairs the roving tabindex with the arrow keys, never alone", () => {
        // These two must land together. A roving tabindex without arrow keys
        // makes the unchecked option unreachable by keyboard; arrow keys without
        // it merely leave two tab stops. If someone strips the handler, this
        // demands they strip the tabIndex with it.
        const hasRoving = source.includes("radioTabIndex(SIDES")
        const hasKeys = source.includes("onKeyDown={handleKeyDown}")
        expect(hasRoving).toBe(hasKeys)
        expect(source.match(/tabIndex=\{radioTabIndex\(/g)).toHaveLength(2)
    })

    it("moves focus to the newly selected option", () => {
        expect(source).toContain("target?.focus()")
    })
})
