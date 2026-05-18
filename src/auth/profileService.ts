import { supabase } from "../lib/supabase"
import { normalizeUsername } from "./usernameAuth"

export async function upsertProfile(userId: string, username: string): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase
        .from("profiles")
        .upsert({ user_id: userId, username: normalizeUsername(username) }, { onConflict: "user_id" })
    return error?.message ?? null
}

export async function findUserIdByUsername(username: string): Promise<string | null> {
    if (!supabase) return null
    const { data, error } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", normalizeUsername(username))
        .single()
    if (error || !data) return null
    return (data as { user_id: string }).user_id
}
