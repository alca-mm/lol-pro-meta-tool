import { describe, it, expect } from "vitest"
import { canDeleteAccount, mapDeleteAccountError } from "../src/auth/accountService"

describe("canDeleteAccount", () => {
    it("returns true when user owns no teams", () => {
        expect(canDeleteAccount(0)).toBe(true)
    })

    it("returns false when user owns one team", () => {
        expect(canDeleteAccount(1)).toBe(false)
    })

    it("returns false when user owns multiple teams", () => {
        expect(canDeleteAccount(3)).toBe(false)
    })
})

describe("mapDeleteAccountError", () => {
    it("maps owns_teams error to the correct i18n key", () => {
        expect(mapDeleteAccountError("owns_teams")).toBe("auth_deleteAccountOwnsTeams")
    })

    it("maps unknown errors to generic error key", () => {
        expect(mapDeleteAccountError("some unexpected error")).toBe("auth_deleteAccountError")
    })

    it("maps empty string to generic error key", () => {
        expect(mapDeleteAccountError("")).toBe("auth_deleteAccountError")
    })

    it("owns_teams substring match works", () => {
        expect(mapDeleteAccountError("user owns_teams and cannot be deleted")).toBe("auth_deleteAccountOwnsTeams")
    })
})
