import { supabase } from "../lib/supabase"

export interface Team {
    id: string
    name: string
    owner_id: string
    created_at: string
}

const ACTIVE_TEAM_KEY = "lol_active_team_id"

export function getActiveTeamId(): string | null {
    try {
        return localStorage.getItem(ACTIVE_TEAM_KEY)
    } catch {
        return null
    }
}

export function setActiveTeamId(teamId: string | null): void {
    try {
        if (teamId) {
            localStorage.setItem(ACTIVE_TEAM_KEY, teamId)
        } else {
            localStorage.removeItem(ACTIVE_TEAM_KEY)
        }
    } catch {}
}

export async function fetchUserTeams(userId: string): Promise<Team[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("team_members")
        .select("teams(id, name, owner_id, created_at)")
        .eq("user_id", userId)
    if (error || !data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => row.teams).filter(Boolean) as Team[]
}

export async function createTeam(userId: string, name: string): Promise<Team | null> {
    if (!supabase) return null

    const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ name, owner_id: userId })
        .select()
        .single()

    if (teamError || !team) return null

    const { error: memberError } = await supabase
        .from("team_members")
        .insert({ team_id: (team as Team).id, user_id: userId, role: "owner" })

    if (memberError) return null

    return team as Team
}
