import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "../lib/supabase"

interface AuthContextValue {
    session: Session | null
    user: User | null
    loading: boolean
    signInWithEmail: (email: string, password: string) => Promise<string | null>
    signUpWithEmail: (email: string, password: string) => Promise<string | null>
    signInWithMagicLink: (email: string) => Promise<string | null>
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

    async function signInWithEmail(email: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
    }

    async function signUpWithEmail(email: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signUp({ email, password })
        return error?.message ?? null
    }

    async function signInWithMagicLink(email: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signInWithOtp({ email })
        return error?.message ?? null
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
                signInWithEmail,
                signUpWithEmail,
                signInWithMagicLink,
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
