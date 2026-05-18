import { describe, it, expect } from "vitest"
import { isSupabaseConfigured, supabase } from "../src/lib/supabase"

describe("supabase client", () => {
    it("isSupabaseConfigured is false when env vars are missing", () => {
        // In the test environment no .env file provides these vars
        expect(isSupabaseConfigured).toBe(false)
    })

    it("supabase is null when not configured", () => {
        expect(supabase).toBeNull()
    })
})
