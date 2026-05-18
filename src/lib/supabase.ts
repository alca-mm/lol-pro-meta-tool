import { createClient } from "@supabase/supabase-js"

const isTestEnvironment = import.meta.env.MODE === "test"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured: boolean =
    !isTestEnvironment && Boolean(url && anonKey)

// null when env vars are missing or in test environment — all callers must guard with `if (!supabase)`
export const supabase = isSupabaseConfigured
    ? createClient(url as string, anonKey as string)
    : null
