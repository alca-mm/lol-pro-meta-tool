import { describe, it, expect } from "vitest"
import { generateInviteCode, formatExpiry } from "../src/teams/teamService"

// XXXX-XXXX-XXXX — only allowed chars (no I, O, 0, 1)
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

describe("generateInviteCode", () => {
    it("produces the correct XXXX-XXXX-XXXX format", () => {
        expect(generateInviteCode()).toMatch(CODE_RE)
    })

    it("has length 14", () => {
        expect(generateInviteCode().length).toBe(14)
    })

    it("is uppercase", () => {
        const code = generateInviteCode("testname")
        expect(code).toBe(code.toUpperCase())
    })

    it("uses the first 4 safe letters of the team name as prefix", () => {
        // "LUNA" — all chars are in the allowed charset
        const code = generateInviteCode("LUNA")
        expect(code.startsWith("LUNA-")).toBe(true)
    })

    it("strips numbers and special chars from team name prefix", () => {
        // "TEAM 123!" → only T, E, A, M pass the filter
        const code = generateInviteCode("TEAM 123!")
        expect(code.startsWith("TEAM-")).toBe(true)
    })

    it("strips ambiguous chars I and O from team name prefix", () => {
        // "LION" → I and O are filtered out → L, N → pad to 4 random
        const code = generateInviteCode("LION")
        expect(code.startsWith("LN")).toBe(true)
        expect(code).toMatch(CODE_RE)
    })

    it("pads short team names with random chars to reach 4", () => {
        const code = generateInviteCode("AB")
        expect(code.substring(0, 2)).toBe("AB")
        expect(code.length).toBe(14)
        expect(code).toMatch(CODE_RE)
    })

    it("works with no team name (fully random prefix)", () => {
        const code = generateInviteCode()
        expect(code).toMatch(CODE_RE)
    })

    it("works with undefined team name", () => {
        const code = generateInviteCode(undefined)
        expect(code).toMatch(CODE_RE)
    })

    it("never contains I, O, 0 or 1 in 200 samples", () => {
        for (let i = 0; i < 200; i++) {
            const chars = generateInviteCode().replace(/-/g, "")
            expect(chars).not.toMatch(/[IO01]/)
        }
    })

    it("different calls produce different codes (probabilistic)", () => {
        const codes = new Set(Array.from({ length: 10 }, () => generateInviteCode()))
        expect(codes.size).toBeGreaterThan(1)
    })
})

describe("formatExpiry", () => {
    const now = new Date("2026-05-18T12:00:00.000Z")

    it("returns empty string for null", () => {
        expect(formatExpiry(null, now)).toBe("")
    })

    it("returns empty string for already-expired timestamp", () => {
        expect(formatExpiry("2026-05-18T11:00:00.000Z", now)).toBe("")
    })

    it("returns empty string for exactly-now timestamp", () => {
        expect(formatExpiry("2026-05-18T12:00:00.000Z", now)).toBe("")
    })

    it("returns minutes for codes expiring within the hour", () => {
        const expires = new Date(now.getTime() + 28 * 60_000).toISOString()
        expect(formatExpiry(expires, now)).toBe("28m")
    })

    it("rounds up partial minutes", () => {
        // 28 minutes and 30 seconds remaining → ceil to 29m
        const expires = new Date(now.getTime() + 28 * 60_000 + 30_000).toISOString()
        expect(formatExpiry(expires, now)).toBe("29m")
    })

    it("returns hours and minutes for multi-hour expiry", () => {
        const expires = new Date(now.getTime() + 90 * 60_000).toISOString()
        expect(formatExpiry(expires, now)).toBe("1h 30m")
    })

    it("returns only hours when minutes are zero", () => {
        const expires = new Date(now.getTime() + 60 * 60_000).toISOString()
        expect(formatExpiry(expires, now)).toBe("1h")
    })

    it("returns 30m for a fresh invite (default expiry)", () => {
        const expires = new Date(now.getTime() + 30 * 60_000).toISOString()
        expect(formatExpiry(expires, now)).toBe("30m")
    })
})
