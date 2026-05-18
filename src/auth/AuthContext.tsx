import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "../lib/supabase"
import { usernameToAuthEmail } from "./usernameAuth"
import { upsertProfile } from "./profileService"

interface AuthContextValue {
    session: Session | null
    user: User | null
    loading: boolean
    signInWithUsername: (username: string, password: string) => Promise<string | null>
    signUpWithUsername: (username: string, password: string) => Promise<string | null>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    // start loading=true only when supabase is configured (need to fetch session)
    const [loading, setLoading] = useState(isSupabaseConfigured)

    useEffect(() => {
        if (!supabase) return

        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession)
        })

        return () => subscription.unsubscribe()
    }, [])

    async function signInWithUsername(username: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const email = usernameToAuthEmail(username)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
    }

    async function signUpWithUsername(username: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const email = usernameToAuthEmail(username)
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) return error.message
        if (data.user) {
            await upsertProfile(data.user.id, username)
        }
        return null
    }

    async function signOut(): Promise<void> {
        if (!supabase) return
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session?.user ?? null,
                loading,
                signInWithUsername,
                signUpWithUsername,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
    return ctx
}
