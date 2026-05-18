import { describe, it, expect, beforeEach } from "vitest"
import { getActiveTeamId, setActiveTeamId, mergeTeamMembersWithProfiles } from "../src/teams/teamService"
import type { TeamRole } from "../src/teams/teamService"

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

describe("mergeTeamMembersWithProfiles", () => {
    const role: TeamRole = "player"

    it("merges username from profiles into member list", () => {
        const members = [{ user_id: "u1", team_id: "t1", role }]
        const profiles = [{ user_id: "u1", username: "alice" }]
        const result = mergeTeamMembersWithProfiles(members, profiles)
        expect(result[0].username).toBe("alice")
        expect(result[0].role).toBe("player")
    })

    it("uses first 8 chars of user_id as fallback when profile is missing", () => {
        const members = [{ user_id: "abcdefgh-xxxx", team_id: "t1", role }]
        const result = mergeTeamMembersWithProfiles(members, [])
        expect(result[0].username).toBe("abcdefgh")
    })

    it("returns empty array for empty members input", () => {
        expect(mergeTeamMembersWithProfiles([], [])).toEqual([])
    })

    it("does not crash when profiles array is empty", () => {
        const members = [{ user_id: "u1", team_id: "t1", role }]
        expect(() => mergeTeamMembersWithProfiles(members, [])).not.toThrow()
    })

    it("merges multiple members with their respective profiles", () => {
        const members = [
            { user_id: "u1", team_id: "t1", role: "owner" as TeamRole },
            { user_id: "u2", team_id: "t1", role: "player" as TeamRole },
        ]
        const profiles = [
            { user_id: "u1", username: "alice" },
            { user_id: "u2", username: "bob" },
        ]
        const result = mergeTeamMembersWithProfiles(members, profiles)
        expect(result[0].username).toBe("alice")
        expect(result[1].username).toBe("bob")
    })

    it("handles partial profiles — known users get username, unknown get id fallback", () => {
        const members = [
            { user_id: "known-user", team_id: "t1", role },
            { user_id: "unknown-xyz", team_id: "t1", role },
        ]
        const profiles = [{ user_id: "known-user", username: "charlie" }]
        const result = mergeTeamMembersWithProfiles(members, profiles)
        expect(result[0].username).toBe("charlie")
        expect(result[1].username).toBe("unknown-")   // first 8 chars
    })
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
