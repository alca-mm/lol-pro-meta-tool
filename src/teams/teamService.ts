import { supabase } from "../lib/supabase"
import { findUserIdByUsername } from "../auth/profileService"
import { normalizeUsername } from "../auth/usernameAuth"

export interface Team {
    id: string
    name: string
    owner_id: string
    created_at: string
}

export type TeamRole = "owner" | "admin" | "player"

export interface TeamMember {
    user_id: string
    team_id: string
    role: TeamRole
    username: string
}

const ACTIVE_TEAM_KEY = "lol_active_team_id"

// ── Pure role helpers ───────────────────────────────────────────────────────

export function canManageMembers(role: TeamRole | null): boolean {
    return role === "owner" || role === "admin"
}

export function canChangeRoles(role: TeamRole | null): boolean {
    return role === "owner"
}

export function canRemoveMembers(role: TeamRole | null): boolean {
    return role === "owner"
}

// ── localStorage ────────────────────────────────────────────────────────────

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

// ── Team CRUD ───────────────────────────────────────────────────────────────

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

// ── Member management ───────────────────────────────────────────────────────

interface RawMember { user_id: string; team_id: string; role: TeamRole }
interface RawProfile { user_id: string; username: string }

// Pure helper — exported for testing
export function mergeTeamMembersWithProfiles(
    members: RawMember[],
    profiles: RawProfile[],
): TeamMember[] {
    const byId = new Map(profiles.map((p) => [p.user_id, p.username]))
    return members.map((m) => ({
        user_id: m.user_id,
        team_id: m.team_id,
        role: m.role,
        // fallback: first 8 chars of user_id when no profile exists
        username: byId.get(m.user_id) ?? m.user_id.slice(0, 8),
    }))
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
    if (!supabase) return []

    // Step 1: load team_members rows (no embedded join)
    const { data: memberData, error: memberError } = await supabase
        .from("team_members")
        .select("user_id, team_id, role")
        .eq("team_id", teamId)

    if (memberError || !memberData || memberData.length === 0) return []

    // Step 2: load profiles for those user_ids
    const userIds = (memberData as RawMember[]).map((m) => m.user_id)
    const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds)

    // Step 3: merge — profiles query failure is non-fatal, members still shown
    return mergeTeamMembersWithProfiles(
        memberData as RawMember[],
        (profileData ?? []) as RawProfile[],
    )
}

export async function addTeamMemberByUsername(
    teamId: string,
    username: string,
): Promise<string | null> {
    if (!supabase) return "Not configured"
    const normalized = normalizeUsername(username)
    const userId = await findUserIdByUsername(normalized)
    if (!userId) return "team_memberNotFound"
    const { error } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, user_id: userId, role: "player" })
    return error?.message ?? null
}

export async function updateTeamMemberRole(
    teamId: string,
    userId: string,
    role: TeamRole,
): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase
        .from("team_members")
        .update({ role })
        .eq("team_id", teamId)
        .eq("user_id", userId)
    return error?.message ?? null
}

export async function removeTeamMember(
    teamId: string,
    userId: string,
): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", userId)
    return error?.message ?? null
}

// ── Team deletion ────────────────────────────────────────────────────────────

export function canDeleteTeam(role: TeamRole | null): boolean {
    return role === "owner"
}

export async function deleteTeam(teamId: string): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase.from("teams").delete().eq("id", teamId)
    return error?.message ?? null
}
