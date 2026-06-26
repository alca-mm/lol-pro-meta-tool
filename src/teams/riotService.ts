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
    cs: number
    vision_score: number
    damage_to_champs: number
    gold_earned: number
    created_at: string
}

export interface MatchParticipant {
    id: string
    team_id: string
    match_id: string
    puuid: string
    champion_name: string
    role: string | null
    lane: string | null
    win: boolean
    kills: number
    deaths: number
    assists: number
    cs: number
}

export type SyncMode = "quick" | "deep"

export const SYNC_MODE_CONFIG: Record<SyncMode, { countPerQueue: number }> = {
    quick: { countPerQueue: 10 },
    deep:  { countPerQueue: 30 },
}

export function isRankedQueue(queueId: number): boolean {
    return queueId === 420 || queueId === 440
}

export function buildMatchIdsUrl(
    base: string,
    puuid: string,
    queue: 420 | 440,
    start: number,
    count: number,
): string {
    return `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${queue}&start=${start}&count=${count}`
}

/** Returns the start-offsets for paginated Riot match-ID requests. */
export function buildPageStarts(maxPages: number, pageSize: number): number[] {
    return Array.from({ length: maxPages }, (_, i) => i * pageSize)
}

/**
 * Decides whether there may be more matches beyond what was synced.
 * True only when max pages were reached, the last page was full, and it
 * contained at least one match ID not yet stored in the DB.
 */
export function computeMoreMayBeAvailable(
    maxPagesReached: boolean,
    lastPageCount: number,
    pageSize: number,
    unknownOnLastPage: number,
): boolean {
    if (!maxPagesReached) return false
    if (lastPageCount < pageSize) return false
    return unknownOnLastPage > 0
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
    if (!res.ok) {
        // Log status only — never the body, which may echo request details.
        console.error("riot-sync edge function returned non-OK status:", res.status)
    }
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

export interface SyncResult {
    imported: number
    skipped: number
    alreadyKnown: number
    pagesFetched: number
    maxPagesReached: boolean
    moreMayBeAvailable: boolean
    mode?: SyncMode
    detailRequests?: number
}

export async function syncRiotMatches(
    accessToken: string,
    teamId: string,
    mode: SyncMode = "quick",
): Promise<SyncResult | string> {
    const result = await callEdgeFunction(accessToken, {
        action: "sync",
        team_id: teamId,
        mode,
    })
    if (result.error) return result.error as string
    return {
        imported:           result.imported as number,
        skipped:            result.skipped as number,
        alreadyKnown:       result.alreadyKnown as number,
        pagesFetched:       result.pagesFetched as number,
        maxPagesReached:    result.maxPagesReached as boolean,
        moreMayBeAvailable: result.moreMayBeAvailable as boolean,
        mode:               result.mode as SyncMode | undefined,
        detailRequests:     result.detailRequests as number | undefined,
    }
}

export async function getMyPlayerAccount(
    teamId: string,
    userId: string,
): Promise<PlayerAccount | null> {
    if (!supabase) return null
    const { data, error } = await supabase
        .from("player_accounts")
        .select("*")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle()
    if (error) console.error("getMyPlayerAccount failed:", error.message)
    return (data as PlayerAccount | null) ?? null
}

export async function getTeamRankedMatches(
    teamId: string,
    puuid: string,
    limit = 20,
): Promise<RankedMatch[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("team_id", teamId)
        .eq("puuid", puuid)
        .order("game_start", { ascending: false })
        .limit(limit)
    if (error) console.error("getTeamRankedMatches failed:", error.message)
    return (data as RankedMatch[] | null) ?? []
}

export async function getAllTeamRankedMatches(
    teamId: string,
    limit = 200,
): Promise<RankedMatch[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("team_id", teamId)
        .order("game_start", { ascending: false })
        .limit(limit)
    if (error) console.error("getAllTeamRankedMatches failed:", error.message)
    return (data as RankedMatch[] | null) ?? []
}

export async function getTeamPlayerAccounts(teamId: string): Promise<PlayerAccount[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("player_accounts")
        .select("*")
        .eq("team_id", teamId)
    if (error) console.error("getTeamPlayerAccounts failed:", error.message)
    return (data as PlayerAccount[] | null) ?? []
}

export async function getMatchParticipants(
    teamId: string,
    matchIds: string[],
): Promise<MatchParticipant[]> {
    if (!supabase || matchIds.length === 0) return []
    const { data, error } = await supabase
        .from("ranked_match_participants")
        .select("*")
        .eq("team_id", teamId)
        .in("match_id", matchIds)
    if (error) console.error("getMatchParticipants failed:", error.message)
    return (data as MatchParticipant[] | null) ?? []
}

/** Formats seconds into "mm:ss". */
export function formatGameDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, "0")}`
}

export interface MatchFilter {
    queueId?: number
    puuid?: string
    win?: boolean
}

export function filterMatches(matches: RankedMatch[], filter: MatchFilter): RankedMatch[] {
    return matches.filter((m) => {
        if (filter.queueId !== undefined && m.queue_id !== filter.queueId) return false
        if (filter.puuid !== undefined && m.puuid !== filter.puuid) return false
        if (filter.win !== undefined && m.win !== filter.win) return false
        return true
    })
}
