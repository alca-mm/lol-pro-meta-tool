import { supabase } from "../lib/supabase"
import type { ChampionNote } from "./types"

interface NoteRow {
    champion_name: string
    note: string
    tags: string[]
    rating: string | null
    updated_at: string
}

export async function loadTeamNotes(
    teamId: string,
): Promise<Record<string, ChampionNote>> {
    if (!supabase) return {}
    const { data, error } = await supabase
        .from("champion_notes")
        .select("champion_name, note, tags, rating, updated_at")
        .eq("team_id", teamId)
    if (error || !data) return {}

    const result: Record<string, ChampionNote> = {}
    for (const row of data as NoteRow[]) {
        result[row.champion_name] = {
            championName: row.champion_name,
            note: row.note,
            tags: row.tags ?? [],
            rating: (row.rating as ChampionNote["rating"]) ?? null,
            updatedAt: row.updated_at,
        }
    }
    return result
}

export async function saveTeamNote(
    teamId: string,
    note: ChampionNote,
    userId: string,
): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase.from("champion_notes").upsert(
        {
            team_id: teamId,
            champion_name: note.championName,
            note: note.note,
            tags: note.tags,
            rating: note.rating,
            updated_at: note.updatedAt,
            updated_by: userId,
        },
        { onConflict: "team_id,champion_name" },
    )
    return error?.message ?? null
}

export async function deleteTeamNote(
    teamId: string,
    championName: string,
): Promise<string | null> {
    if (!supabase) return "Not configured"
    const { error } = await supabase
        .from("champion_notes")
        .delete()
        .eq("team_id", teamId)
        .eq("champion_name", championName)
    return error?.message ?? null
}
