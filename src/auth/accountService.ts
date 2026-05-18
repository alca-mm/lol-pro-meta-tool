import { supabase } from "../lib/supabase"

const DELETE_ACCOUNT_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/delete-account`

export function canDeleteAccount(ownedTeamCount: number): boolean {
    return ownedTeamCount === 0
}

export function mapDeleteAccountError(raw: string): string {
    if (raw.includes("owns_teams")) return "auth_deleteAccountOwnsTeams"
    return "auth_deleteAccountError"
}

export async function deleteOwnAccount(): Promise<string | null> {
    if (!supabase) return "auth_deleteAccountError"

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return "auth_deleteAccountError"

    const res = await fetch(DELETE_ACCOUNT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
        },
    })

    if (!res.ok) {
        try {
            const body = (await res.json()) as { error?: string }
            return mapDeleteAccountError(body.error ?? "")
        } catch {
            return "auth_deleteAccountError"
        }
    }

    return null
}
