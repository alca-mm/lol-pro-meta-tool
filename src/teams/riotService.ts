import { supabase } from "../lib/supabase"

export interface PlayerAccount {
    id: string
    team_id: string
    user_id: string
    region: string
    routing_region: string
    riot_game_name: string
    riot_tag_line: string
    puuid: string
    created_at: string
    updated_at: string
}

export interface RankedMatch {
    id: string
    team_id: string
    puuid: string
    match_id: string
    queue_id: number
    champion_name: string
    win: boolean
    kills: number
    deaths: number
    assists: number
    game_duration: number
    game_start: string
    role: string | null
    lane: string | null
    created_at: string
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
    const idx = input.indexOf("#")
    if (idx === -1) return null
    const gameName = input.slice(0, idx)
    const tagLine = input.slice(idx + 1)
    if (!gameName || !tagLine) return null
    return { gameName, tagLine }
}

async function callEdgeFunction(
    accessToken: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${supabaseUrl}/functions/v1/riot-sync`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    })
    return res.json() as Promise<Record<string, unknown>>
}

export async function linkRiotAccount(
    accessToken: string,
    teamId: string,
    gameName: string,
    tagLine: string,
): Promise<string | null> {
    const result = await callEdgeFunction(accessToken, {
        action: "link",
        team_id: teamId,
        game_name: gameName,
        tag_line: tagLine,
    })
    return (result.error as string | undefined) ?? null
}

export async function syncRiotMatches(
    accessToken: string,
    teamId: string,
): Promise<{ synced: number } | string> {
    const result = await callEdgeFunction(accessToken, {
        action: "sync",
        team_id: teamId,
    })
    if (result.error) return result.error as string
    return { synced: result.synced as number }
}

export async function getMyPlayerAccount(
    teamId: string,
    userId: string,
): Promise<PlayerAccount | null> {
    if (!supabase) return null
    const { data } = await supabase
        .from("player_accounts")
        .select("*")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle()
    return (data as PlayerAccount | null) ?? null
}

export async function getTeamRankedMatches(
    teamId: string,
    puuid: string,
    limit = 20,
): Promise<RankedMatch[]> {
    if (!supabase) return []
    const { data } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("team_id", teamId)
        .eq("puuid", puuid)
        .order("game_start", { ascending: false })
        .limit(limit)
    return (data as RankedMatch[] | null) ?? []
}
