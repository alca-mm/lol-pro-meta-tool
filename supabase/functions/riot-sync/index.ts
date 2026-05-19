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

        const matchIds: string[] = []
        for (const queue of [420, 440]) {
            const res = await fetch(
                `${base}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&count=10`,
                { headers: { "X-Riot-Token": riotApiKey } },
            )
            if (res.ok) {
                const ids = await res.json() as string[]
                matchIds.push(...ids)
            }
        }

        if (matchIds.length === 0) return json({ success: true, synced: 0 })

        // Skip match IDs already stored
        const { data: existing } = await adminClient
            .from("ranked_matches")
            .select("match_id")
            .eq("puuid", puuid)
            .in("match_id", matchIds)

        const knownIds = new Set((existing ?? []).map((r: { match_id: string }) => r.match_id))
        const newIds = matchIds.filter((id) => !knownIds.has(id))

        interface Participant {
            puuid: string
            championName: string
            win: boolean
            kills: number
            deaths: number
            assists: number
            role?: string
            lane?: string
        }
        interface MatchInfo {
            queueId: number
            gameDuration: number
            gameStartTimestamp: number
            participants: Participant[]
        }
        interface MatchData { info: MatchInfo }

        const rows: Record<string, unknown>[] = []
        for (const matchId of newIds) {
            const res = await fetch(
                `${base}/lol/match/v5/matches/${matchId}`,
                { headers: { "X-Riot-Token": riotApiKey } },
            )
            if (!res.ok) continue
            const data = await res.json() as MatchData
            const p = data.info.participants.find((x) => x.puuid === puuid)
            if (!p) continue
            rows.push({
                team_id,
                puuid,
                match_id:      matchId,
                queue_id:      data.info.queueId,
                champion_name: p.championName,
                win:           p.win,
                kills:         p.kills,
                deaths:        p.deaths,
                assists:       p.assists,
                game_duration: data.info.gameDuration,
                game_start:    new Date(data.info.gameStartTimestamp).toISOString(),
                role:          p.role ?? null,
                lane:          p.lane ?? null,
            })
        }

        if (rows.length > 0) {
            await adminClient
                .from("ranked_matches")
                .upsert(rows, { onConflict: "puuid,match_id" })
        }

        return json({ success: true, synced: rows.length })
    }

    return json({ error: "Unknown action" }, 400)
})

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}
