# Riot Account Linking + Ranked Match Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users link their Riot ID in the Team Dashboard and automatically fetch/display their SoloQ and FlexQ matches via a Supabase Edge Function that holds the Riot API key securely.

**Architecture:** Edge Function `riot-sync` handles `link` (resolve PUUID) and `sync` (fetch matches) actions. Frontend service `riotService.ts` calls the edge function and reads stored data from Supabase. `RiotAccountPanel` component is mounted in `TeamDashboard` below `TeamMembersPanel`.

**Tech Stack:** Vite + React + TypeScript, Supabase (Edge Functions, Postgres RLS), Riot API (ACCOUNT-V1, Match-V5), Vitest

---

### Task 1: Extend schema.sql with player_accounts and ranked_matches

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Append new tables + grants + RLS to schema.sql**

Open `supabase/schema.sql` and append the following block at the very end (after the last existing policy):

```sql
-- ============================================================
-- 13. player_accounts
-- One Riot account per user per team.
-- ============================================================

create table if not exists public.player_accounts (
    id              uuid primary key default gen_random_uuid(),
    team_id         uuid not null references public.teams(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    region          text not null default 'euw1',
    routing_region  text not null default 'europe',
    riot_game_name  text not null,
    riot_tag_line   text not null,
    puuid           text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (team_id, user_id),
    unique (team_id, puuid)
);

grant select, insert, update, delete on public.player_accounts to authenticated;

alter table public.player_accounts enable row level security;

drop policy if exists "player_accounts_select" on public.player_accounts;
drop policy if exists "player_accounts_insert" on public.player_accounts;
drop policy if exists "player_accounts_update" on public.player_accounts;
drop policy if exists "player_accounts_delete" on public.player_accounts;

-- Team members can read all linked accounts of their team
create policy "player_accounts_select" on public.player_accounts
    for select
    using (public.is_team_member(team_id));

-- Users can only create their own account entry
create policy "player_accounts_insert" on public.player_accounts
    for insert
    with check (user_id = auth.uid() and public.is_team_member(team_id));

-- Users can only update their own entry
create policy "player_accounts_update" on public.player_accounts
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Users can only delete their own entry
create policy "player_accounts_delete" on public.player_accounts
    for delete
    using (user_id = auth.uid());

-- ============================================================
-- 14. ranked_matches
-- SoloQ (420) and FlexQ (440) results, written by Edge Function.
-- No direct write policies — only service_role via Edge Function.
-- ============================================================

create table if not exists public.ranked_matches (
    id            uuid primary key default gen_random_uuid(),
    team_id       uuid not null references public.teams(id) on delete cascade,
    puuid         text not null,
    match_id      text not null,
    queue_id      int  not null,
    champion_name text not null,
    win           boolean not null,
    kills         int  not null default 0,
    deaths        int  not null default 0,
    assists       int  not null default 0,
    game_duration int  not null,
    game_start    timestamptz not null,
    role          text,
    lane          text,
    created_at    timestamptz not null default now(),
    unique (puuid, match_id)
);

grant select on public.ranked_matches to authenticated;

alter table public.ranked_matches enable row level security;

drop policy if exists "ranked_matches_select" on public.ranked_matches;

create policy "ranked_matches_select" on public.ranked_matches
    for select
    using (public.is_team_member(team_id));
```

- [ ] **Step 2: Verify schema.sql has no syntax errors by reviewing appended block**

Check that:
- `player_accounts` has `unique (team_id, user_id)` and `unique (team_id, puuid)`
- `ranked_matches` has `unique (puuid, match_id)`
- No `using(true)` policies

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add player_accounts and ranked_matches tables to schema"
```

---

### Task 2: Create Edge Function riot-sync

**Files:**
- Create: `supabase/functions/riot-sync/index.ts`

- [ ] **Step 1: Create the file**

Create `supabase/functions/riot-sync/index.ts` with the following content:

```typescript
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

        // Skip IDs we already have
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/riot-sync/index.ts
git commit -m "feat: add riot-sync edge function (link + sync actions)"
```

---

### Task 3: Create riotService.ts with tests

**Files:**
- Create: `src/teams/riotService.ts`
- Create: `tests/riotService.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/riotService.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
    parseRiotId,
    getMyPlayerAccount,
    getTeamRankedMatches,
} from "../src/teams/riotService"

describe("parseRiotId", () => {
    it("parses valid Riot ID into gameName and tagLine", () => {
        const result = parseRiotId("mmmmicrocontroler#EUW")
        expect(result).toEqual({ gameName: "mmmmicrocontroler", tagLine: "EUW" })
    })

    it("returns null for input without #", () => {
        expect(parseRiotId("nohashtag")).toBeNull()
    })

    it("returns null for empty string", () => {
        expect(parseRiotId("")).toBeNull()
    })

    it("returns null when gameName is empty", () => {
        expect(parseRiotId("#EUW")).toBeNull()
    })

    it("returns null when tagLine is empty", () => {
        expect(parseRiotId("Player#")).toBeNull()
    })

    it("handles spaces around # correctly", () => {
        const result = parseRiotId("My Player#EUW1")
        expect(result).toEqual({ gameName: "My Player", tagLine: "EUW1" })
    })
})

describe("getMyPlayerAccount", () => {
    it("returns null when supabase is not configured", async () => {
        const result = await getMyPlayerAccount("team-id", "user-id")
        expect(result).toBeNull()
    })
})

describe("getTeamRankedMatches", () => {
    it("returns empty array when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123")
        expect(result).toEqual([])
    })

    it("returns empty array with custom limit when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123", 5)
        expect(result).toEqual([])
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/riotService.test.ts
```

Expected: FAIL — `parseRiotId` not found (module does not exist yet)

- [ ] **Step 3: Create src/teams/riotService.ts**

```typescript
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
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npm test -- tests/riotService.test.ts
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/teams/riotService.ts tests/riotService.test.ts
git commit -m "feat: add riotService with parseRiotId, getMyPlayerAccount, getTeamRankedMatches"
```

---

### Task 4: Create RiotAccountPanel component

**Files:**
- Create: `src/components/team/RiotAccountPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/team/RiotAccountPanel.tsx`:

```typescript
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import {
    parseRiotId,
    linkRiotAccount,
    syncRiotMatches,
    getMyPlayerAccount,
    getTeamRankedMatches,
    type PlayerAccount,
    type RankedMatch,
} from "../../teams/riotService"

const QUEUE_LABELS: Record<number, string> = {
    420: "SoloQ",
    440: "FlexQ",
}

function formatKDA(kills: number, deaths: number, assists: number): string {
    return `${kills}/${deaths}/${assists}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    })
}

export function RiotAccountPanel() {
    const { user, session } = useAuth()
    const { activeTeam } = useTeam()

    const [account, setAccount] = useState<PlayerAccount | null>(null)
    const [matches, setMatches] = useState<RankedMatch[]>([])
    const [riotIdInput, setRiotIdInput] = useState("")
    const [busy, setBusy] = useState(false)
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

    function showFeedback(msg: string, ok: boolean) {
        setFeedback({ msg, ok })
        window.setTimeout(() => setFeedback(null), 3000)
    }

    const loadAccount = useCallback(async () => {
        if (!activeTeam || !user) return
        const acc = await getMyPlayerAccount(activeTeam.id, user.id)
        setAccount(acc)
        if (acc) {
            const m = await getTeamRankedMatches(activeTeam.id, acc.puuid)
            setMatches(m)
        } else {
            setMatches([])
        }
    }, [activeTeam, user])

    useEffect(() => {
        void loadAccount()
    }, [loadAccount])

    if (!user || !activeTeam || !session) return null

    async function handleLink() {
        const parsed = parseRiotId(riotIdInput)
        if (!parsed) {
            showFeedback("Format: SpielerName#TAG (z.B. mmmmicrocontroler#EUW)", false)
            return
        }
        setBusy(true)
        const err = await linkRiotAccount(
            session!.access_token,
            activeTeam!.id,
            parsed.gameName,
            parsed.tagLine,
        )
        setBusy(false)
        if (err) {
            const msg =
                err === "riot_account_not_found"
                    ? "Riot-Account nicht gefunden. Prüfe Schreibweise und Tag."
                    : err
            showFeedback(msg, false)
        } else {
            setRiotIdInput("")
            showFeedback("Riot-Account verknüpft!", true)
            void loadAccount()
        }
    }

    async function handleSync() {
        setBusy(true)
        const result = await syncRiotMatches(session!.access_token, activeTeam!.id)
        setBusy(false)
        if (typeof result === "string") {
            const msg =
                result === "riot_account_not_linked"
                    ? "Bitte zuerst Riot-Account verknüpfen."
                    : result
            showFeedback(msg, false)
        } else {
            showFeedback(
                `Sync abgeschlossen. ${result.synced} neue Match${result.synced === 1 ? "" : "es"} gespeichert.`,
                true,
            )
            void loadAccount()
        }
    }

    function handleEditAccount() {
        setAccount(null)
        setMatches([])
        setRiotIdInput("")
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <strong style={{ fontSize: "0.85rem" }}>Riot-Account</strong>

            {account ? (
                <div style={{ marginTop: "0.4rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 500 }}>
                        {account.riot_game_name}#{account.riot_tag_line}
                    </span>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy}
                        onClick={() => void handleSync()}
                    >
                        {busy ? "Lädt…" : "Matches syncen"}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy}
                        onClick={handleEditAccount}
                    >
                        Ändern
                    </button>
                </div>
            ) : (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                    <input
                        type="text"
                        value={riotIdInput}
                        onChange={(e) => setRiotIdInput(e.target.value)}
                        placeholder="SpielerName#EUW"
                        disabled={busy}
                        style={{ maxWidth: "14rem", fontSize: "0.85rem" }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleLink()
                        }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !riotIdInput.trim()}
                        onClick={() => void handleLink()}
                    >
                        Verknüpfen
                    </button>
                </div>
            )}

            {feedback && (
                <p
                    className="muted"
                    style={{
                        marginTop: "0.5rem",
                        color: feedback.ok
                            ? "var(--score-pos, #4ade80)"
                            : "var(--score-neg, #f87171)",
                    }}
                >
                    {feedback.msg}
                </p>
            )}

            {account && matches.length === 0 && !busy && (
                <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    Noch keine Matches gespeichert — klicke "Matches syncen".
                </p>
            )}

            {matches.length > 0 && (
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        marginTop: "0.75rem",
                        fontSize: "0.8rem",
                    }}
                >
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Queue</th>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Champion</th>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Ergebnis</th>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>KDA</th>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>Datum</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((m) => (
                            <tr key={m.id}>
                                <td style={{ paddingRight: "0.75rem", paddingBottom: "0.2rem" }}>
                                    {QUEUE_LABELS[m.queue_id] ?? String(m.queue_id)}
                                </td>
                                <td style={{ paddingRight: "0.75rem", paddingBottom: "0.2rem" }}>
                                    {m.champion_name}
                                </td>
                                <td
                                    style={{
                                        paddingRight: "0.75rem",
                                        paddingBottom: "0.2rem",
                                        color: m.win
                                            ? "var(--score-pos, #4ade80)"
                                            : "var(--score-neg, #f87171)",
                                    }}
                                >
                                    {m.win ? "Sieg" : "Niederlage"}
                                </td>
                                <td style={{ paddingRight: "0.75rem", paddingBottom: "0.2rem" }}>
                                    {formatKDA(m.kills, m.deaths, m.assists)}
                                </td>
                                <td className="muted" style={{ paddingBottom: "0.2rem" }}>
                                    {formatDate(m.game_start)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Run full test suite to make sure nothing is broken**

```bash
npm test
```

Expected: all existing tests pass, riotService tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/team/RiotAccountPanel.tsx
git commit -m "feat: add RiotAccountPanel component"
```

---

### Task 5: Wire RiotAccountPanel into TeamDashboard

**Files:**
- Modify: `src/components/team/TeamDashboard.tsx`

- [ ] **Step 1: Add import and component**

In `src/components/team/TeamDashboard.tsx`:

Add import after the last existing import:
```typescript
import { RiotAccountPanel } from "./RiotAccountPanel"
```

Add `<RiotAccountPanel />` directly after `<TeamMembersPanel />` in the JSX:

The `{/* ── Sections ───────────────────────────────────── */}` block should look like:
```tsx
{/* ── Sections ───────────────────────────────────── */}
<TeamMembersPanel />
<RiotAccountPanel />
<TeamInvitePanel />
<TeamCreatePanel />
<TeamDangerZone />
```

- [ ] **Step 2: Run full test suite and build**

```bash
npm test
```

Expected: all tests pass

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/team/TeamDashboard.tsx
git commit -m "feat: mount RiotAccountPanel in TeamDashboard below TeamMembersPanel"
```

---

## Self-Review

**Spec coverage:**
- ✅ Riot ID input in Team Dashboard
- ✅ PUUID resolution via ACCOUNT-V1
- ✅ SoloQ (420) + FlexQ (440) only
- ✅ Custom games excluded (only queue 420/440 fetched)
- ✅ Riot API key in Edge Function secret only (RIOT_API_KEY)
- ✅ Results stored in Supabase (ranked_matches)
- ✅ Service role key uses DELETE_ACCOUNT_SERVICE_ROLE_KEY
- ✅ No Discord bot, no scraping, no new dependencies
- ✅ RLS: no `using(true)` policies
- ✅ App starts without RIOT_API_KEY (edge function returns 500, frontend shows error)
- ✅ Edge function returns clear error codes (riot_account_not_found, riot_account_not_linked, etc.)

**Type consistency:**
- `PlayerAccount` interface defined in Task 3, imported in Task 4 ✅
- `RankedMatch` interface defined in Task 3, imported in Task 4 ✅
- `parseRiotId` defined in Task 3, used in Task 4 ✅
- `callEdgeFunction` internal helper, not exported ✅

**Placeholder scan:** No TBDs or TODOs found.
