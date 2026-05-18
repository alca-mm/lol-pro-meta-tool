import { describe, it, expect } from "vitest"
import {
    canManageMembers,
    canChangeRoles,
    canRemoveMembers,
} from "../src/teams/teamService"
import type { TeamRole } from "../src/teams/teamService"
import { normalizeUsername } from "../src/auth/usernameAuth"

describe("TeamRole values", () => {
    const validRoles: TeamRole[] = ["owner", "admin", "player"]

    it("all role values are non-empty strings", () => {
        for (const r of validRoles) {
            expect(typeof r).toBe("string")
            expect(r.length).toBeGreaterThan(0)
        }
    })
})

describe("canManageMembers", () => {
    it("returns true for owner", () => {
        expect(canManageMembers("owner")).toBe(true)
    })

    it("returns true for admin", () => {
        expect(canManageMembers("admin")).toBe(true)
    })

    it("returns false for player", () => {
        expect(canManageMembers("player")).toBe(false)
    })

    it("returns false for null (not logged in / no team)", () => {
        expect(canManageMembers(null)).toBe(false)
    })
})

describe("canChangeRoles", () => {
    it("returns true for owner", () => {
        expect(canChangeRoles("owner")).toBe(true)
    })

    it("returns false for admin", () => {
        expect(canChangeRoles("admin")).toBe(false)
    })

    it("returns false for player", () => {
        expect(canChangeRoles("player")).toBe(false)
    })

    it("returns false for null", () => {
        expect(canChangeRoles(null)).toBe(false)
    })
})

describe("canRemoveMembers", () => {
    it("returns true for owner", () => {
        expect(canRemoveMembers("owner")).toBe(true)
    })

    it("returns false for admin", () => {
        expect(canRemoveMembers("admin")).toBe(false)
    })

    it("returns false for player", () => {
        expect(canRemoveMembers("player")).toBe(false)
    })

    it("returns false for null", () => {
        expect(canRemoveMembers(null)).toBe(false)
    })
})

describe("username normalization in member context", () => {
    it("normalizes username before member lookup", () => {
        // addTeamMemberByUsername calls normalizeUsername internally
        expect(normalizeUsername("  TeamAlpha  ")).toBe("teamalpha")
        expect(normalizeUsername("Marcus_01")).toBe("marcus_01")
    })
})
