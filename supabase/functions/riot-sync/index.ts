import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const RIOT_BASE: Record<string, string> = {
    europe:   "https://europe.api.riotgames.com",
    americas: "https://americas.api.riotgames.com",
    asia:     "https://asia.api.riotgames.com",
}

const MAX_CONCURRENCY = 3
const BATCH_PAUSE_MS  = 750  // pause between detail-fetch batches
const RANKED_QUEUES   = new Set([420, 440])
const RANKED_QUEUES_LIST = [420, 440] as const
const SYNC_COUNT: Record<"quick" | "deep", number> = { quick: 10, deep: 30 }

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
        return json({ error: "Missing authorization" }, 401)
    }

    const supabaseUrl    = Deno.env.get("SUPABASE_URL") ?? ""
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceRoleKey = Deno.env.get("DELETE_ACCOUNT_SERVICE_ROLE_KEY") ?? ""
    const riotApiKey     = Deno.env.get("RIOT_API_KEY") ?? ""

    if (!riotApiKey) {
        return json({ error: "RIOT_API_KEY not configured" }, 500)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
        return json({ error: "Invalid token" }, 401)
    }

    let body: Record<string, unknown>
    try {
        body = await req.json() as Record<string, unknown>
    } catch {
        return json({ error: "Invalid JSON body" }, 400)
    }

    const { action, team_id } = body as { action?: string; team_id?: string }
    if (!team_id) return json({ error: "team_id required" }, 400)

    // Verify membership via user client (respects RLS)
    const { data: member } = await userClient
        .from("team_members")
        .select("user_id")
        .eq("team_id", team_id)
        .eq("user_id", user.id)
        .maybeSingle()

    if (!member) return json({ error: "Not a team member" }, 403)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // ── action: link ──────────────────────────────────────────────
    if (action === "link") {
        const { game_name, tag_line, region = "euw1", routing_region = "europe" } =
            body as { game_name?: string; tag_line?: string; region?: string; routing_region?: string }

        if (!game_name || !tag_line) {
            return json({ error: "game_name and tag_line required" }, 400)
        }

        const base = RIOT_BASE[routing_region as string] ?? RIOT_BASE.europe
        const accountRes = await fetch(
            `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(game_name)}/${encodeURIComponent(tag_line)}`,
            { headers: { "X-Riot-Token": riotApiKey } },
        )

        if (!accountRes.ok) {
            if (accountRes.status === 404) return json({ error: "riot_account_not_found" }, 404)
            if (accountRes.status === 429) return json({ error: "riot_rate_limited" }, 429)
            return json({ error: `Riot API error: ${accountRes.status}` }, 502)
        }

        const { puuid } = await accountRes.json() as { puuid: string }

        const { error: upsertErr } = await adminClient
            .from("player_accounts")
            .upsert(
                {
                    team_id,
                    user_id: user.id,
                    region,
                    routing_region,
                    riot_game_name: game_name,
                    riot_tag_line: tag_line,
                    puuid,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "team_id,user_id" },
            )

        if (upsertErr) return json({ error: upsertErr.message }, 500)
        return json({ success: true, puuid })
    }

    // ── action: sync ──────────────────────────────────────────────
    if (action === "sync") {
        const { data: account } = await adminClient
            .from("player_accounts")
            .select("puuid, routing_region")
            .eq("team_id", team_id)
            .eq("user_id", user.id)
            .maybeSingle()

        if (!account) return json({ error: "riot_account_not_linked" }, 404)

        const { puuid, routing_region } = account as { puuid: string; routing_region: string }
        const base = RIOT_BASE[routing_region] ?? RIOT_BASE.europe

        const mode = (body.mode === "deep" ? "deep" : "quick") as "quick" | "deep"
        const countPerQueue = SYNC_COUNT[mode]

        // ── 1. Fetch match IDs for each ranked queue (2 requests total) ──────
        const allMatchIds: string[] = []
        let pagesFetched = 0
        let moreMayBeAvailable = false

        for (const queue of RANKED_QUEUES_LIST) {
            const idsRes = await fetch(
                `${base}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&start=0&count=${countPerQueue}`,
                { headers: { "X-Riot-Token": riotApiKey } },
            )
            if (!idsRes.ok) {
                if (idsRes.status === 429) return json({ error: "riot_rate_limited" }, 429)
                continue
            }
            const ids = await idsRes.json() as string[]
            pagesFetched++
            allMatchIds.push(...ids)
            if (ids.length >= countPerQueue) moreMayBeAvailable = true
        }
        const maxPagesReached = moreMayBeAvailable

        if (allMatchIds.length === 0) {
            return json({ success: true, imported: 0, skipped: 0, alreadyKnown: 0, pagesFetched, maxPagesReached, moreMayBeAvailable, mode, detailRequests: 0 })
        }

        // ── 2. Bulk existence check + backfill detection ──────────────────────
        const uniqueMatchIds = [...new Set(allMatchIds)]
        const { data: existing } = await adminClient
            .from("ranked_matches")
            .select("match_id")
            .eq("puuid", puuid)
            .in("match_id", uniqueMatchIds)

        const knownIds = new Set((existing ?? []).map((r: { match_id: string }) => r.match_id))

        // Re-fetch known rows with missing extended stats (gold_earned=0 is impossible in real ranked).
        let incompleteIds: string[] = []
        if (knownIds.size > 0) {
            const { data: incomplete } = await adminClient
                .from("ranked_matches")
                .select("match_id")
                .eq("puuid", puuid)
                .in("match_id", [...knownIds])
                .eq("gold_earned", 0)
            incompleteIds = (incomplete ?? []).map((r: { match_id: string }) => r.match_id)
        }

        const trulyNewIds  = uniqueMatchIds.filter((id) => !knownIds.has(id))
        const idsToFetch   = [...new Set([...trulyNewIds, ...incompleteIds])]
        const alreadyKnown = knownIds.size - incompleteIds.length

        // ── 3. Fetch match details (max 3 concurrent, 300ms pause between batches) ──
        interface Participant {
            puuid: string; championName: string; win: boolean
            kills: number; deaths: number; assists: number
            role?: string; lane?: string
            totalMinionsKilled?: number; neutralMinionsKilled?: number
            visionScore?: number; totalDamageDealtToChampions?: number
            goldEarned?: number; teamId?: number
        }
        interface MatchInfo {
            queueId: number; gameDuration: number; gameStartTimestamp: number
            participants: Participant[]
        }
        interface MatchData { info: MatchInfo }

        const rows: Record<string, unknown>[] = []
        const participantRows: Record<string, unknown>[] = []
        let skipped = 0
        let detailRequests = 0

        for (let i = 0; i < idsToFetch.length; i += MAX_CONCURRENCY) {
            if (i > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, BATCH_PAUSE_MS))
            }

            const batch = idsToFetch.slice(i, i + MAX_CONCURRENCY)
            detailRequests += batch.length
            const results = await Promise.all(
                batch.map(async (matchId) => {
                    const res = await fetch(`${base}/lol/match/v5/matches/${matchId}`, {
                        headers: { "X-Riot-Token": riotApiKey },
                    })
                    return {
                        matchId,
                        ok:     res.ok,
                        status: res.status,
                        data:   res.ok ? await res.json() as MatchData : null,
                    }
                }),
            )

            for (const { matchId, ok, status, data } of results) {
                if (!ok) {
                    if (status === 429) return json({ error: "riot_rate_limited" }, 429)
                    continue
                }
                if (!data) continue

                // Filter: only store ranked queues (420 SoloQ, 440 FlexQ)
                if (!RANKED_QUEUES.has(data.info.queueId)) {
                    skipped++
                    continue
                }

                const p = data.info.participants.find((x) => x.puuid === puuid)
                if (!p) continue

                const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)

                rows.push({
                    team_id,
                    puuid,
                    match_id:          matchId,
                    queue_id:          data.info.queueId,
                    champion_name:     p.championName,
                    win:               p.win,
                    kills:             p.kills,
                    deaths:            p.deaths,
                    assists:           p.assists,
                    game_duration:     data.info.gameDuration,
                    game_start:        new Date(data.info.gameStartTimestamp).toISOString(),
                    role:              p.role ?? null,
                    lane:              p.lane ?? null,
                    cs,
                    vision_score:      p.visionScore ?? 0,
                    damage_to_champs:  p.totalDamageDealtToChampions ?? 0,
                    gold_earned:       p.goldEarned ?? 0,
                })

                // Store up to 4 same-team teammates (excluding the tracked player)
                const myTeamId = p.teamId
                const teammates = data.info.participants
                    .filter((x) => x.puuid !== puuid && x.teamId === myTeamId)
                    .slice(0, 4)

                for (const t of teammates) {
                    const tCs = (t.totalMinionsKilled ?? 0) + (t.neutralMinionsKilled ?? 0)
                    participantRows.push({
                        team_id,
                        match_id:      matchId,
                        puuid:         t.puuid,
                        champion_name: t.championName,
                        role:          t.role ?? null,
                        lane:          t.lane ?? null,
                        win:           t.win,
                        kills:         t.kills,
                        deaths:        t.deaths,
                        assists:       t.assists,
                        cs:            tCs,
                    })
                }
            }
        }

        if (rows.length > 0) {
            await adminClient
                .from("ranked_matches")
                .upsert(rows, { onConflict: "puuid,match_id" })
        }

        if (participantRows.length > 0) {
            await adminClient
                .from("ranked_match_participants")
                .upsert(participantRows, { onConflict: "match_id,puuid" })
        }

        return json({
            success: true,
            imported: rows.length,
            skipped,
            alreadyKnown,
            pagesFetched,
            maxPagesReached,
            moreMayBeAvailable,
            mode,
            detailRequests,
        })
    }

    return json({ error: "Unknown action" }, 400)
})

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}
