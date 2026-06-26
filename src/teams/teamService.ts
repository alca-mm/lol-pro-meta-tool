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
    if (error) console.error("fetchUserTeams failed:", error.message)
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

    if (memberError) console.error("getTeamMembers failed:", memberError.message)
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

// ── Invite codes ─────────────────────────────────────────────────────────────

export interface TeamInvite {
    id: string
    team_id: string
    code: string
    created_by: string
    created_at: string
    expires_at: string | null
    revoked_at: string | null
}

// Charset excludes visually ambiguous characters I, O (no 0 or 1 either)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randSegment(n: number): string {
    return Array.from({ length: n }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join("")
}

export function generateInviteCode(teamName?: string): string {
    // Only keep chars that are already in the allowed charset (no I, O)
    const letters = teamName
        ? (teamName.toUpperCase().match(/[ABCDEFGHJKLMNPQRSTUVWXYZ]/g) ?? []).slice(0, 4).join("")
        : ""
    const needed = 4 - letters.length
    const prefix = letters + (needed > 0 ? randSegment(needed) : "")
    return `${prefix}-${randSegment(4)}-${randSegment(4)}`
}

export async function createInvite(teamId: string, teamName?: string): Promise<{ code: string } | string> {
    if (!supabase) return "Not configured"
    const code = generateInviteCode(teamName)
    const { error } = await supabase.from("team_invites").insert({ team_id: teamId, code })
    if (error) return error.message
    return { code }
}

export async function fetchTeamInvites(teamId: string): Promise<TeamInvite[]> {
    if (!supabase) return []
    const now = new Date().toISOString()
    const { data, error } = await supabase
        .from("team_invites")
        .select("id, team_id, code, created_by, created_at, expires_at, revoked_at")
        .eq("team_id", teamId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at", { ascending: false })
    if (error) console.error("fetchTeamInvites failed:", error.message)
    if (error || !data) return []
    return data as TeamInvite[]
}

export function formatExpiry(expiresAt: string | null, now = new Date()): string {
    if (!expiresAt) return ""
    const ms = new Date(expiresAt).getTime() - now.getTime()
    if (ms <= 0) return ""
    const totalMinutes = Math.ceil(ms / 60_000)
    if (totalMinutes >= 60) {
        const h = Math.floor(totalMinutes / 60)
        const m = totalMinutes % 60
        return m > 0 ? `${h}h ${m}m` : `${h}h`
    }
    return `${totalMinutes}m`
}

export async function revokeInvite(inviteId: string): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase
        .from("team_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
    return error?.message ?? null
}

export async function joinTeamWithInvite(code: string): Promise<{ teamId: string } | string> {
    if (!supabase) return "invite_invalidCode"
    const { data, error } = await supabase.rpc("join_team_with_invite", {
        p_code: code.trim().toUpperCase(),
    })
    if (error) {
        if (error.message.includes("invalid_invite")) return "invite_invalidCode"
        return error.message
    }
    return { teamId: data as string }
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
