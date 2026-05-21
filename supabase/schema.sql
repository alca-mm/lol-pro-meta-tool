-- ============================================================
-- LoL Pro Meta Tool — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================
--
-- IMPORTANT — after running this schema:
--   Authentication → Providers → Email → "Confirm email" → OFF
--
-- Users register with a technical email (@moon-mothlings.example.com).
-- That domain is not real, so confirmation emails can never be
-- delivered. With email confirmation ON, sign-up succeeds but
-- login is blocked until the undeliverable email is confirmed.
--
-- NOTE on last-owner removal:
--   This schema does not hard-enforce "cannot remove last owner" in SQL.
--   The application layer must check that at least one owner remains
--   before calling removeTeamMember. A trigger could enforce this
--   strictly, but is omitted here to keep the schema simple.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.profiles (
                                               user_id    uuid primary key references auth.users(id) on delete cascade,
    username   text not null unique,
    created_at timestamptz not null default now()
    );

create table if not exists public.teams (
                                            id         uuid primary key default gen_random_uuid(),
    name       text not null,
    owner_id   uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
    );

create table if not exists public.team_members (
                                                   team_id    uuid not null references public.teams(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null default 'player',
    created_at timestamptz not null default now(),
    primary key (team_id, user_id),
    constraint valid_role check (role in ('owner', 'admin', 'player'))
    );

create table if not exists public.champion_notes (
                                                     id             uuid primary key default gen_random_uuid(),
    team_id        uuid not null references public.teams(id) on delete cascade,
    champion_name  text not null,
    note           text not null default '',
    tags           text[] not null default '{}',
    rating         text null,
    updated_at     timestamptz not null default now(),
    updated_by     uuid references auth.users(id),
    unique (team_id, champion_name)
    );

-- ============================================================
-- 2. Helper functions for RLS
-- ============================================================

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = auth.uid()
);
$$;

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
select exists (
    select 1
    from public.teams
    where id = p_team_id
      and owner_id = auth.uid()
);
$$;

create or replace function public.get_team_role(p_team_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
select role
from public.team_members
where team_id = p_team_id
  and user_id = auth.uid()
    limit 1;
$$;

create or replace function public.can_manage_team_members(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
);
$$;

grant execute on function public.is_team_member(uuid)          to authenticated;
grant execute on function public.is_team_owner(uuid)           to authenticated;
grant execute on function public.get_team_role(uuid)           to authenticated;
grant execute on function public.can_manage_team_members(uuid) to authenticated;

-- ============================================================
-- 3. Grants
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.profiles       to authenticated;
grant select, insert, update, delete on public.teams          to authenticated;
grant select, insert, update, delete on public.team_members   to authenticated;
grant select, insert, update, delete on public.champion_notes to authenticated;

grant select, insert, update, delete on public.profiles       to service_role;
grant select, insert, update, delete on public.teams          to service_role;
grant select, insert, update, delete on public.team_members   to service_role;
grant select, insert, update, delete on public.champion_notes to service_role;

-- ============================================================
-- 4. Enable RLS
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.champion_notes enable row level security;

-- ============================================================
-- 5. Drop old policies
-- ============================================================

drop policy if exists "profiles_select"          on public.profiles;
drop policy if exists "profiles_insert"          on public.profiles;
drop policy if exists "profiles_update"          on public.profiles;

drop policy if exists "teams_select"             on public.teams;
drop policy if exists "teams_insert"             on public.teams;
drop policy if exists "teams_update"             on public.teams;
drop policy if exists "teams_delete"             on public.teams;

drop policy if exists "team_members_select"      on public.team_members;
drop policy if exists "team_members_insert"      on public.team_members;
drop policy if exists "team_members_update"      on public.team_members;
drop policy if exists "team_members_delete"      on public.team_members;

drop policy if exists "champion_notes_select"    on public.champion_notes;
drop policy if exists "champion_notes_insert"    on public.champion_notes;
drop policy if exists "champion_notes_update"    on public.champion_notes;
drop policy if exists "champion_notes_delete"    on public.champion_notes;

-- ============================================================
-- 6. Policies: profiles
-- ============================================================

create policy "profiles_select" on public.profiles
    for select
                                                                                              using (
                                                                                              auth.role() = 'authenticated'
                                                                                              );

create policy "profiles_insert" on public.profiles
    for insert
    with check (
        user_id = auth.uid()
    );

create policy "profiles_update" on public.profiles
    for update
                          using (
                          user_id = auth.uid()
                          )
        with check (
                          user_id = auth.uid()
                          );

-- ============================================================
-- 7. Policies: teams
-- ============================================================

create policy "teams_select" on public.teams
    for select
                   using (
                   owner_id = auth.uid()
                   or public.is_team_member(id)
                   );

create policy "teams_insert" on public.teams
    for insert
    with check (
        owner_id = auth.uid()
    );

create policy "teams_update" on public.teams
    for update
                          using (
                          public.is_team_owner(id)
                          )
        with check (
                          public.is_team_owner(id)
                          );

create policy "teams_delete" on public.teams
    for delete
using (
        public.is_team_owner(id)
    );

-- ============================================================
-- 8. Policies: team_members
-- ============================================================

create policy "team_members_select" on public.team_members
    for select
                   using (
                   public.is_team_member(team_id)
                   or user_id = auth.uid()
                   );

create policy "team_members_insert" on public.team_members
    for insert
    with check (
        (
            public.is_team_owner(team_id)
            and role in ('owner', 'admin', 'player')
        )
        or
        (
            public.can_manage_team_members(team_id)
            and not public.is_team_owner(team_id)
            and role = 'player'
        )
    );

create policy "team_members_update" on public.team_members
    for update
                          using (
                          public.is_team_owner(team_id)
                          )
        with check (
                          public.is_team_owner(team_id)
                          );

create policy "team_members_delete" on public.team_members
    for delete
using (
        public.is_team_owner(team_id)
    );

-- ============================================================
-- 9. Policies: champion_notes
-- ============================================================

create policy "champion_notes_select" on public.champion_notes
    for select
                   using (
                   public.is_team_member(team_id)
                   );

create policy "champion_notes_insert" on public.champion_notes
    for insert
    with check (
        public.is_team_member(team_id)
    );

create policy "champion_notes_update" on public.champion_notes
    for update
                          using (
                          public.is_team_member(team_id)
                          )
        with check (
                          public.is_team_member(team_id)
                          );

create policy "champion_notes_delete" on public.champion_notes
    for delete
using (
        public.is_team_member(team_id)
    );

-- Backfill owner membership rows for teams created before team_members existed
insert into public.team_members (team_id, user_id, role)
select id, owner_id, 'owner'
from public.teams
    on conflict (team_id, user_id)
do update set role = 'owner';

-- ============================================================
-- 10. team_invites
-- ============================================================

create table if not exists public.team_invites (
                                                   id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    code        text not null unique,
    created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz null default (now() + interval '30 minutes'),
    revoked_at  timestamptz null
    );

alter table if exists public.team_invites
alter column expires_at set default (now() + interval '30 minutes');

update public.team_invites
set expires_at = created_at + interval '30 minutes'
where expires_at is null;

grant select, insert, update, delete on public.team_invites to authenticated;
grant select, insert, update, delete on public.team_invites to service_role;

alter table public.team_invites enable row level security;

drop policy if exists "team_invites_select" on public.team_invites;
drop policy if exists "team_invites_insert" on public.team_invites;
drop policy if exists "team_invites_update" on public.team_invites;
drop policy if exists "team_invites_delete" on public.team_invites;

create policy "team_invites_select" on public.team_invites
    for select
                                       using (
                                       public.is_team_member(team_id)
                                       );

create policy "team_invites_insert" on public.team_invites
    for insert
    with check (
        public.can_manage_team_members(team_id)
    );

create policy "team_invites_update" on public.team_invites
    for update
                          using (
                          public.can_manage_team_members(team_id)
                          )
        with check (
                          public.can_manage_team_members(team_id)
                          );

create policy "team_invites_delete" on public.team_invites
    for delete
using (
        public.can_manage_team_members(team_id)
    );

-- ============================================================
-- 11. join_team_with_invite
-- ============================================================

create or replace function public.join_team_with_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
v_team_id uuid;
begin
select team_id into v_team_id
from public.team_invites
where code = upper(trim(p_code))
  and revoked_at is null
  and expires_at > now()
    limit 1;

if v_team_id is null then
        raise exception 'invalid_invite';
end if;

insert into public.team_members (team_id, user_id, role)
values (v_team_id, auth.uid(), 'player')
    on conflict (team_id, user_id) do nothing;

return v_team_id;
end;
$$;

grant execute on function public.join_team_with_invite(text) to authenticated;

-- ============================================================
-- 12. team_drafts
-- ============================================================

create table if not exists public.team_drafts (
                                                  id          uuid primary key default gen_random_uuid(),
    team_id     uuid not null references public.teams(id) on delete cascade,
    name        text not null,
    note        text not null default '',
    patch       text null,
    blue_picks  jsonb not null default '[]'::jsonb,
    red_picks   jsonb not null default '[]'::jsonb,
    blue_bans   text[] not null default '{}',
    red_bans    text[] not null default '{}',
    created_by  uuid references auth.users(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
    );

create index if not exists team_drafts_team_updated_idx
    on public.team_drafts (team_id, updated_at desc);

grant select, insert, update, delete on public.team_drafts to authenticated;
grant select, insert, update, delete on public.team_drafts to service_role;

alter table public.team_drafts enable row level security;

drop policy if exists "team_drafts_select" on public.team_drafts;
drop policy if exists "team_drafts_insert" on public.team_drafts;
drop policy if exists "team_drafts_update" on public.team_drafts;
drop policy if exists "team_drafts_delete" on public.team_drafts;

create policy "team_drafts_select" on public.team_drafts
    for select
                                       using (
                                       public.is_team_member(team_id)
                                       );

create policy "team_drafts_insert" on public.team_drafts
    for insert
    with check (
        public.is_team_member(team_id)
    );

create policy "team_drafts_update" on public.team_drafts
    for update
                          using (
                          public.is_team_member(team_id)
                          )
        with check (
                          public.is_team_member(team_id)
                          );

create policy "team_drafts_delete" on public.team_drafts
    for delete
using (
        public.can_manage_team_members(team_id)
    );

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

create index if not exists player_accounts_team_idx
    on public.player_accounts (team_id);

grant select, insert, update, delete on public.player_accounts to authenticated;
grant select, insert, update, delete on public.player_accounts to service_role;

alter table public.player_accounts enable row level security;

drop policy if exists "player_accounts_select" on public.player_accounts;
drop policy if exists "player_accounts_insert" on public.player_accounts;
drop policy if exists "player_accounts_update" on public.player_accounts;
drop policy if exists "player_accounts_delete" on public.player_accounts;

create policy "player_accounts_select" on public.player_accounts
    for select
                                       using (
                                       public.is_team_member(team_id)
                                       );

create policy "player_accounts_insert" on public.player_accounts
    for insert
    with check (
        user_id = auth.uid()
        and public.is_team_member(team_id)
    );

create policy "player_accounts_update" on public.player_accounts
    for update
                          using (
                          user_id = auth.uid()
                          and public.is_team_member(team_id)
                          )
        with check (
                          user_id = auth.uid()
                          and public.is_team_member(team_id)
                          );

create policy "player_accounts_delete" on public.player_accounts
    for delete
using (
        user_id = auth.uid()
        or public.can_manage_team_members(team_id)
    );

-- ============================================================
-- 14. ranked_matches
-- SoloQ (420) and FlexQ (440) results, written by Edge Function.
-- No direct authenticated write policies — writes use service_role.
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
    unique (team_id, puuid, match_id)
    );

create index if not exists ranked_matches_team_time_idx
    on public.ranked_matches (team_id, game_start desc);

create index if not exists ranked_matches_puuid_time_idx
    on public.ranked_matches (puuid, game_start desc);

grant select on public.ranked_matches to authenticated;
grant select, insert, update, delete on public.ranked_matches to service_role;

alter table public.ranked_matches enable row level security;

drop policy if exists "ranked_matches_select" on public.ranked_matches;

create policy "ranked_matches_select" on public.ranked_matches
    for select
                        using (
                        public.is_team_member(team_id)
                        );

-- ============================================================
-- 15. ranked_matches — extended stats columns
-- ============================================================

alter table public.ranked_matches
    add column if not exists cs int not null default 0,
    add column if not exists vision_score int not null default 0,
    add column if not exists damage_to_champs int not null default 0,
    add column if not exists gold_earned int not null default 0;

-- ============================================================
-- 16. ranked_match_participants
-- Up to 4 same-team teammates per match, written by Edge Function.
-- ============================================================

create table if not exists public.ranked_match_participants (
                                                                id            uuid primary key default gen_random_uuid(),
    team_id       uuid not null references public.teams(id) on delete cascade,
    match_id      text not null,
    puuid         text not null,
    champion_name text not null,
    role          text,
    lane          text,
    win           boolean not null,
    kills         int not null default 0,
    deaths        int not null default 0,
    assists       int not null default 0,
    cs            int not null default 0,
    unique (team_id, match_id, puuid)
    );

create index if not exists ranked_match_participants_match_idx
    on public.ranked_match_participants (match_id);

create index if not exists ranked_match_participants_team_idx
    on public.ranked_match_participants (team_id);

grant select on public.ranked_match_participants to authenticated;
grant select, insert, update, delete on public.ranked_match_participants to service_role;

alter table public.ranked_match_participants enable row level security;

drop policy if exists "ranked_match_participants_select" on public.ranked_match_participants;

create policy "ranked_match_participants_select" on public.ranked_match_participants
    for select
                        using (
                        public.is_team_member(team_id)
                        );

-- ============================================================
-- Migration: fix unique constraints to be team-scoped
-- Safe for Supabase/Postgres.
--
-- Why:
-- Older DBs may still have non-team-scoped unique constraints:
--   ranked_matches:             unique (puuid, match_id)
--   ranked_match_participants:  unique (match_id, puuid)
--
-- That breaks when the same Riot ID / PUUID is used in different teams.
-- ============================================================

-- Drop old non-team-scoped constraints if they exist
alter table public.ranked_matches
drop constraint if exists ranked_matches_puuid_match_id_key;

alter table public.ranked_match_participants
drop constraint if exists ranked_match_participants_match_id_puuid_key;

-- Add team-scoped constraint for ranked_matches only if no equivalent unique constraint exists
do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'ranked_matches'
          and c.contype = 'u'
          and (
              select array_agg(a.attname::text order by cols.ord)
              from unnest(c.conkey) with ordinality as cols(attnum, ord)
              join pg_attribute a
                on a.attrelid = c.conrelid
               and a.attnum = cols.attnum
          ) = array['team_id', 'puuid', 'match_id']
    ) then
alter table public.ranked_matches
    add constraint ranked_matches_team_puuid_match_id_key
        unique (team_id, puuid, match_id);
end if;
end $$;

-- Add team-scoped constraint for ranked_match_participants only if no equivalent unique constraint exists
do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'ranked_match_participants'
          and c.contype = 'u'
          and (
              select array_agg(a.attname::text order by cols.ord)
              from unnest(c.conkey) with ordinality as cols(attnum, ord)
              join pg_attribute a
                on a.attrelid = c.conrelid
               and a.attnum = cols.attnum
          ) = array['team_id', 'match_id', 'puuid']
    ) then
alter table public.ranked_match_participants
    add constraint ranked_match_participants_team_match_puuid_key
        unique (team_id, match_id, puuid);
end if;
end $$;