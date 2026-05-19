# Riot Account Linking + Ranked Match Results MVP

**Date:** 2026-05-19  
**Status:** Approved

## Summary

Users link their Riot ID (gameName#tagLine) in the Team Dashboard. A Supabase Edge Function resolves the PUUID via Riot ACCOUNT-V1 and fetches recent SoloQ/FlexQ matches via Match-V5. Results are stored in Supabase and displayed in the dashboard. The Riot API key never reaches the frontend.

## Architecture

```
Riot API (ACCOUNT-V1, Match-V5)
   ↑ only inside Edge Function
supabase/functions/riot-sync/index.ts
   ↓ upsert via service_role (DELETE_ACCOUNT_SERVICE_ROLE_KEY)
player_accounts + ranked_matches (Supabase DB, RLS)
   ↑ read via anon key (authenticated user)
src/teams/riotService.ts
   ↑
src/components/team/RiotAccountPanel.tsx
   ↑
TeamDashboard (added below TeamMembersPanel)
```

## Edge Function: riot-sync

Single function, `action` discriminator in request body.

| action | Input | Behavior |
|--------|-------|----------|
| `link` | `team_id, game_name, tag_line, region?, routing_region?` | Resolve PUUID via ACCOUNT-V1, upsert player_accounts |
| `sync` | `team_id` | Fetch last 10 SoloQ + 10 FlexQ matches for the calling user, upsert ranked_matches |

Secrets:
- `RIOT_API_KEY` — set manually: `supabase secrets set RIOT_API_KEY=<key>`
- `DELETE_ACCOUNT_SERVICE_ROLE_KEY` — already working, used for DB upserts that bypass RLS

## Schema

### player_accounts
```sql
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
```

### ranked_matches
```sql
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
```

## RLS

- `player_accounts`: SELECT for team members; INSERT/UPDATE/DELETE only own row
- `ranked_matches`: SELECT for team members; no direct write (Edge Function uses service_role)

## Frontend

`RiotAccountPanel` in TeamDashboard, below TeamMembersPanel:
1. If linked: show `gameName#tagLine` + Sync button
2. If not linked: show input for Riot ID + Link button
3. Match list: queue (SoloQ/FlexQ), champion, W/L, KDA, date — max 20 rows

Each user manages only their own account. No team-wide sync in MVP.

## Pragmatic Decisions

- `DELETE_ACCOUNT_SERVICE_ROLE_KEY` — existing secret name, already proven to work
- Region defaults: `euw1` / `europe`
- 10 matches per queue per sync
- No i18n for new panel strings (German inline, consistent with app style)
- No updated_at trigger — set explicitly on upsert
