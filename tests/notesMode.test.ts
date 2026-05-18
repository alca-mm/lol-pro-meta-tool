import { describe, it, expect } from "vitest"
import { isTeamModeActive } from "../src/notes/notesMode"

describe("isTeamModeActive", () => {
    it("returns false when supabase is not configured", () => {
        expect(isTeamModeActive(false, "user-1", "team-1")).toBe(false)
    })

    it("returns false when no user is logged in", () => {
        expect(isTeamModeActive(true, null, "team-1")).toBe(false)
    })

    it("returns false when no active team is set", () => {
        expect(isTeamModeActive(true, "user-1", null)).toBe(false)
    })

    it("returns true when supabase configured, user logged in, and team active", () => {
        expect(isTeamModeActive(true, "user-1", "team-1")).toBe(true)
    })
})
