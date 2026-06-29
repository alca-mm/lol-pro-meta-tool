import { describe, it, expect } from "vitest"
import {
    normalizeDraftName,
    parsePickSlots,
    parseBans,
    mapTeamDraftRow,
    sortDraftsByUpdatedAt,
    canDeleteDraft,
    buildTeamDraftPayload,
    fetchTeamDrafts,
    getTeamDraftsCount,
} from "../src/teams/teamDraftsService"

// supabase is null in test environment (MODE === "test")

describe("normalizeDraftName", () => {
    it("trims whitespace", () => {
        expect(normalizeDraftName("  My Draft  ")).toBe("My Draft")
    })

    it("collapses internal spaces", () => {
        expect(normalizeDraftName("My   Draft  Name")).toBe("My Draft Name")
    })

    it("returns empty string for blank input", () => {
        expect(normalizeDraftName("   ")).toBe("")
    })
})

describe("parsePickSlots", () => {
    it("parses valid pick slots", () => {
        const input = [{ championName: "Zed", role: "mid" }, { championName: "Jinx", role: "bot" }]
        const result = parsePickSlots(input)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ championName: "Zed", role: "mid" })
        expect(result[1]).toEqual({ championName: "Jinx", role: "bot" })
    })

    it("handles null role", () => {
        const input = [{ championName: "Zed", role: null }]
        expect(parsePickSlots(input)[0].role).toBeNull()
    })

    it("returns empty array for non-array input", () => {
        expect(parsePickSlots(null)).toEqual([])
        expect(parsePickSlots("x")).toEqual([])
        expect(parsePickSlots(42)).toEqual([])
        expect(parsePickSlots({})).toEqual([])
    })

    it("returns safe default for invalid items", () => {
        expect(parsePickSlots([null, "bad", 42])).toEqual([
            { championName: "", role: null },
            { championName: "", role: null },
            { championName: "", role: null },
        ])
    })

    it("returns default slot for an array element (arrays are not records)", () => {
        expect(parsePickSlots([[], ["x"], [{ championName: "Zed" }]])).toEqual([
            { championName: "", role: null },
            { championName: "", role: null },
            { championName: "", role: null },
        ])
    })
})

describe("parseBans", () => {
    it("returns only strings from an array", () => {
        expect(parseBans(["Zed", "Jinx"])).toEqual(["Zed", "Jinx"])
    })

    it("filters out non-string values", () => {
        expect(parseBans(["Zed", null, 42, "Jinx"])).toEqual(["Zed", "Jinx"])
    })

    it("returns empty array for non-array input", () => {
        expect(parseBans(null)).toEqual([])
        expect(parseBans({})).toEqual([])
    })
})

describe("mapTeamDraftRow", () => {
    const validRow = {
        id: "abc-123",
        team_id: "team-456",
        name: "My Draft",
        note: "Good draft",
        patch: "14.10",
        blue_picks: [{ championName: "Zed", role: "mid" }],
        red_picks: [],
        blue_bans: ["Jinx"],
        red_bans: [],
        created_by: "user-789",
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-02T12:00:00Z",
    }

    it("maps a valid row correctly", () => {
        const result = mapTeamDraftRow(validRow)
        expect(result.id).toBe("abc-123")
        expect(result.teamId).toBe("team-456")
        expect(result.name).toBe("My Draft")
        expect(result.note).toBe("Good draft")
        expect(result.patch).toBe("14.10")
        expect(result.bluePicks).toHaveLength(1)
        expect(result.blueBans).toEqual(["Jinx"])
        expect(result.createdBy).toBe("user-789")
    })

    it("returns null for patch when not a string", () => {
        const result = mapTeamDraftRow({ ...validRow, patch: null })
        expect(result.patch).toBeNull()
    })

    it("throws for non-object input", () => {
        expect(() => mapTeamDraftRow(null)).toThrow()
        expect(() => mapTeamDraftRow("bad")).toThrow()
    })

    it("throws for an array row (arrays are not valid records)", () => {
        expect(() => mapTeamDraftRow([])).toThrow("Invalid row")
        expect(() => mapTeamDraftRow([{ id: "x" }])).toThrow("Invalid row")
    })

    it("maps a fully valid row to the complete SavedTeamDraft (happy-path regression)", () => {
        expect(mapTeamDraftRow(validRow)).toEqual({
            id: "abc-123",
            teamId: "team-456",
            name: "My Draft",
            note: "Good draft",
            patch: "14.10",
            bluePicks: [{ championName: "Zed", role: "mid" }],
            redPicks: [],
            blueBans: ["Jinx"],
            redBans: [],
            createdBy: "user-789",
            createdAt: "2026-05-01T10:00:00Z",
            updatedAt: "2026-05-02T12:00:00Z",
        })
    })

    it("falls back to defaults for a partial object row without throwing", () => {
        const result = mapTeamDraftRow({ id: "only-id" })
        expect(result).toEqual({
            id: "only-id",
            teamId: "",
            name: "",
            note: "",
            patch: null,
            bluePicks: [],
            redPicks: [],
            blueBans: [],
            redBans: [],
            createdBy: null,
            createdAt: "",
            updatedAt: "",
        })
    })
})

describe("sortDraftsByUpdatedAt", () => {
    const makeDraft = (id: string, updatedAt: string) => ({
        id,
        teamId: "t",
        name: id,
        note: "",
        patch: null,
        bluePicks: [],
        redPicks: [],
        blueBans: [],
        redBans: [],
        createdBy: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt,
    })

    it("sorts most recently updated first", () => {
        const drafts = [
            makeDraft("old", "2026-01-01T00:00:00Z"),
            makeDraft("new", "2026-05-01T00:00:00Z"),
            makeDraft("mid", "2026-03-01T00:00:00Z"),
        ]
        const sorted = sortDraftsByUpdatedAt(drafts)
        expect(sorted.map((d) => d.id)).toEqual(["new", "mid", "old"])
    })

    it("does not mutate the original array", () => {
        const drafts = [makeDraft("a", "2026-01-01T00:00:00Z")]
        const sorted = sortDraftsByUpdatedAt(drafts)
        expect(sorted).not.toBe(drafts)
    })
})

describe("canDeleteDraft", () => {
    it("returns true for owner", () => {
        expect(canDeleteDraft("owner")).toBe(true)
    })

    it("returns true for admin", () => {
        expect(canDeleteDraft("admin")).toBe(true)
    })

    it("returns false for player", () => {
        expect(canDeleteDraft("player")).toBe(false)
    })

    it("returns false for null role", () => {
        expect(canDeleteDraft(null)).toBe(false)
    })
})

describe("buildTeamDraftPayload", () => {
    it("maps camelCase input to snake_case DB fields", () => {
        const input = {
            teamId: "t1",
            name: "  My Draft  ",
            note: "note",
            patch: "14.10",
            bluePicks: [{ championName: "Zed", role: null }],
            redPicks: [],
            blueBans: ["Jinx"],
            redBans: [],
        }
        const payload = buildTeamDraftPayload(input)
        expect(payload.team_id).toBe("t1")
        expect(payload.name).toBe("My Draft")
        expect(payload.blue_picks).toBe(input.bluePicks)
        expect(payload.blue_bans).toBe(input.blueBans)
        expect(typeof payload.updated_at).toBe("string")
    })
})

describe("fetchTeamDrafts (no supabase)", () => {
    it("returns empty array when supabase is not configured", async () => {
        const result = await fetchTeamDrafts("any-team-id")
        expect(result).toEqual([])
    })
})

describe("getTeamDraftsCount (no supabase)", () => {
    it("returns 0 when supabase is not configured", async () => {
        const count = await getTeamDraftsCount("any-team-id")
        expect(count).toBe(0)
    })
})
