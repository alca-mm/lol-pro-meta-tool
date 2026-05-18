import { describe, it, expect } from "vitest"
import { getChampionNotesCount } from "../src/notes/teamNotesService"

// supabase is null in the test environment (MODE === "test")
// so all service functions that guard with `if (!supabase)` return their safe default

describe("getChampionNotesCount", () => {
    it("returns 0 when supabase is not configured", async () => {
        const count = await getChampionNotesCount("any-team-id")
        expect(count).toBe(0)
    })

    it("returns a number (not undefined or null)", async () => {
        const count = await getChampionNotesCount("any-team-id")
        expect(typeof count).toBe("number")
    })

    it("handles empty string teamId without throwing", async () => {
        await expect(getChampionNotesCount("")).resolves.toBe(0)
    })
})
