import { supabase } from "../lib/supabase"
import { isRecord } from "../lib/isRecord"
import type { PickSlot } from "../draft/types"
import type { TeamRole } from "./teamService"

export interface SavedTeamDraft {
    id: string
    teamId: string
    name: string
    note: string
    patch: string | null
    bluePicks: PickSlot[]
    redPicks: PickSlot[]
    blueBans: string[]
    redBans: string[]
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

export interface SaveTeamDraftInput {
    teamId: string
    name: string
    note: string
    patch: string | null
    bluePicks: PickSlot[]
    redPicks: PickSlot[]
    blueBans: string[]
    redBans: string[]
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function normalizeDraftName(name: string): string {
    return name.trim().replace(/\s+/g, " ")
}

export function parsePickSlots(value: unknown): PickSlot[] {
    if (!Array.isArray(value)) return []
    return value.map((item) => {
        if (!isRecord(item)) return { championName: "", role: null }
        const obj = item
        return {
            championName: typeof obj.championName === "string" ? obj.championName : "",
            role: typeof obj.role === "string" ? (obj.role as PickSlot["role"]) : null,
        }
    })
}

export function parseBans(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === "string")
}

export function mapTeamDraftRow(row: unknown): SavedTeamDraft {
    if (!isRecord(row)) throw new Error("Invalid row")
    const r = row
    return {
        id: typeof r.id === "string" ? r.id : "",
        teamId: typeof r.team_id === "string" ? r.team_id : "",
        name: typeof r.name === "string" ? r.name : "",
        note: typeof r.note === "string" ? r.note : "",
        patch: typeof r.patch === "string" ? r.patch : null,
        bluePicks: parsePickSlots(r.blue_picks),
        redPicks: parsePickSlots(r.red_picks),
        blueBans: parseBans(r.blue_bans),
        redBans: parseBans(r.red_bans),
        createdBy: typeof r.created_by === "string" ? r.created_by : null,
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
        updatedAt: typeof r.updated_at === "string" ? r.updated_at : "",
    }
}

export function sortDraftsByUpdatedAt(drafts: SavedTeamDraft[]): SavedTeamDraft[] {
    return [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function canDeleteDraft(role: TeamRole | null): boolean {
    return role === "owner" || role === "admin"
}

export function buildTeamDraftPayload(input: SaveTeamDraftInput): Record<string, unknown> {
    return {
        team_id: input.teamId,
        name: normalizeDraftName(input.name),
        note: input.note,
        patch: input.patch,
        blue_picks: input.bluePicks,
        red_picks: input.redPicks,
        blue_bans: input.blueBans,
        red_bans: input.redBans,
        updated_at: new Date().toISOString(),
    }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function fetchTeamDrafts(teamId: string): Promise<SavedTeamDraft[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("team_drafts")
        .select("id, team_id, name, note, patch, blue_picks, red_picks, blue_bans, red_bans, created_by, created_at, updated_at")
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false })
    if (error || !data) return []
    return data.map(mapTeamDraftRow)
}

export async function saveTeamDraft(input: SaveTeamDraftInput): Promise<SavedTeamDraft> {
    if (!supabase) throw new Error("Supabase not configured")
    const payload = buildTeamDraftPayload(input)
    const { data, error } = await supabase
        .from("team_drafts")
        .insert(payload)
        .select()
        .single()
    if (error || !data) throw new Error(error?.message ?? "Failed to save draft")
    return mapTeamDraftRow(data)
}

export async function updateTeamDraft(id: string, input: Partial<SaveTeamDraftInput>): Promise<SavedTeamDraft> {
    if (!supabase) throw new Error("Supabase not configured")
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) payload.name = normalizeDraftName(input.name)
    if (input.note !== undefined) payload.note = input.note
    if (input.patch !== undefined) payload.patch = input.patch
    if (input.bluePicks !== undefined) payload.blue_picks = input.bluePicks
    if (input.redPicks !== undefined) payload.red_picks = input.redPicks
    if (input.blueBans !== undefined) payload.blue_bans = input.blueBans
    if (input.redBans !== undefined) payload.red_bans = input.redBans
    const { data, error } = await supabase
        .from("team_drafts")
        .update(payload)
        .eq("id", id)
        .select()
        .single()
    if (error || !data) throw new Error(error?.message ?? "Failed to update draft")
    return mapTeamDraftRow(data)
}

export async function deleteTeamDraft(id: string): Promise<void> {
    if (!supabase) return
    await supabase.from("team_drafts").delete().eq("id", id)
}

export async function getTeamDraftsCount(teamId: string): Promise<number> {
    if (!supabase) return 0
    const { count, error } = await supabase
        .from("team_drafts")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
    if (error || count === null) return 0
    return count
}
