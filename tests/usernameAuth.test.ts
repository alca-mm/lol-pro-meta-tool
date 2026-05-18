import { describe, it, expect } from "vitest"
import {
    normalizeUsername,
    usernameToAuthEmail,
    authEmailToUsername,
    isValidUsername,
} from "../src/auth/usernameAuth"

describe("normalizeUsername", () => {
    it("trims whitespace", () => {
        expect(normalizeUsername("  marcus  ")).toBe("marcus")
    })

    it("lowercases input", () => {
        expect(normalizeUsername("Marcus_01")).toBe("marcus_01")
    })

    it("trims and lowercases combined", () => {
        expect(normalizeUsername("  Team_Alpha  ")).toBe("team_alpha")
    })
})

describe("usernameToAuthEmail", () => {
    it("produces the correct technical email", () => {
        expect(usernameToAuthEmail("marcus")).toBe("marcus@moon-mothlings.example.com")
    })

    it("normalizes before generating email", () => {
        expect(usernameToAuthEmail("Marcus_01")).toBe("marcus_01@moon-mothlings.example.com")
    })

    it("handles hyphens and underscores", () => {
        expect(usernameToAuthEmail("team-alpha_2")).toBe("team-alpha_2@moon-mothlings.example.com")
    })
})

describe("authEmailToUsername", () => {
    it("extracts username from technical email", () => {
        expect(authEmailToUsername("marcus_01@moon-mothlings.example.com")).toBe("marcus_01")
    })

    it("falls back to original email for non-technical emails", () => {
        expect(authEmailToUsername("user@gmail.com")).toBe("user@gmail.com")
    })

    it("returns empty string for null", () => {
        expect(authEmailToUsername(null)).toBe("")
    })

    it("returns empty string for undefined", () => {
        expect(authEmailToUsername(undefined)).toBe("")
    })

    it("returns empty string for empty string", () => {
        expect(authEmailToUsername("")).toBe("")
    })
})

describe("isValidUsername", () => {
    it("accepts valid lowercase username", () => {
        expect(isValidUsername("marcus")).toBe(true)
    })

    it("accepts username with digits, underscore, hyphen", () => {
        expect(isValidUsername("team_alpha-2")).toBe(true)
    })

    it("accepts username that needs normalization (uppercase)", () => {
        expect(isValidUsername("Marcus")).toBe(true)
    })

    it("accepts 3-character username (minimum)", () => {
        expect(isValidUsername("abc")).toBe(true)
    })

    it("accepts 32-character username (maximum)", () => {
        expect(isValidUsername("a".repeat(32))).toBe(true)
    })

    it("rejects username with spaces", () => {
        expect(isValidUsername("marcus wolf")).toBe(false)
    })

    it("rejects username with special characters", () => {
        expect(isValidUsername("marc@us")).toBe(false)
        expect(isValidUsername("marc.us")).toBe(false)
        expect(isValidUsername("märcus")).toBe(false)
    })

    it("rejects username shorter than 3 characters", () => {
        expect(isValidUsername("ab")).toBe(false)
        expect(isValidUsername("a")).toBe(false)
        expect(isValidUsername("")).toBe(false)
    })

    it("rejects username longer than 32 characters", () => {
        expect(isValidUsername("a".repeat(33))).toBe(false)
    })
})
