import { describe, it, expect, beforeEach } from "vitest"
import { canDeleteTeam } from "../src/teams/teamService"
import type { TeamRole } from "../src/teams/teamService"
import { getActiveTeamId, setActiveTeamId } from "../src/teams/teamService"

// minimal localStorage mock
const store: Record<string, string> = {}
Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: (key: string): string | null => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    },
    writable: true,
})

describe("canDeleteTeam", () => {
    it("returns true for owner", () => {
        expect(canDeleteTeam("owner")).toBe(true)
    })

    it("returns false for admin", () => {
        expect(canDeleteTeam("admin")).toBe(false)
    })

    it("returns false for player", () => {
        expect(canDeleteTeam("player")).toBe(false)
    })

    it("returns false for null", () => {
        expect(canDeleteTeam(null)).toBe(false)
    })

    it("covers all TeamRole values", () => {
        const roles: TeamRole[] = ["owner", "admin", "player"]
        const results = roles.map(canDeleteTeam)
        expect(results).toEqual([true, false, false])
    })
})

describe("localStorage cleanup after team deletion", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("active team id can be cleared after deletion", () => {
        setActiveTeamId("team-to-delete")
        expect(getActiveTeamId()).toBe("team-to-delete")
        setActiveTeamId(null)
        expect(getActiveTeamId()).toBeNull()
    })

    it("switching to next team after deletion works", () => {
        setActiveTeamId("team-deleted")
        setActiveTeamId("team-next")
        expect(getActiveTeamId()).toBe("team-next")
    })

    it("null id after deletion when no teams remain", () => {
        setActiveTeamId("last-team")
        setActiveTeamId(null)
        expect(getActiveTeamId()).toBeNull()
    })
})
