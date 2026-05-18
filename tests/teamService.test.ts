import { describe, it, expect, beforeEach } from "vitest"
import { getActiveTeamId, setActiveTeamId } from "../src/teams/teamService"

// minimal localStorage mock (same pattern as championNotes.test.ts)
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

describe("getActiveTeamId / setActiveTeamId", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("returns null when nothing saved", () => {
        expect(getActiveTeamId()).toBeNull()
    })

    it("returns stored team id after setActiveTeamId", () => {
        setActiveTeamId("team-abc-123")
        expect(getActiveTeamId()).toBe("team-abc-123")
    })

    it("clears team id when called with null", () => {
        setActiveTeamId("team-abc-123")
        setActiveTeamId(null)
        expect(getActiveTeamId()).toBeNull()
    })

    it("overwrites previous team id", () => {
        setActiveTeamId("team-aaa")
        setActiveTeamId("team-bbb")
        expect(getActiveTeamId()).toBe("team-bbb")
    })
})
