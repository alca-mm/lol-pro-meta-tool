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
-- All SECURITY DEFINER with explicit search_path to prevent
-- privilege escalation. Avoids policy recursion.
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

-- Returns the current user's role in a team, or NULL if not a member.
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

-- True if the current user can add/manage members (owner or admin).
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
-- RLS still controls row-level access. These grants only allow
-- authenticated users to access the tables through the API.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles       to authenticated;
grant select, insert, update, delete on public.teams          to authenticated;
grant select, insert, update, delete on public.team_members   to authenticated;
grant select, insert, update, delete on public.champion_notes to authenticated;

-- ============================================================
-- 4. Enable RLS
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.champion_notes enable row level security;

-- ============================================================
-- 5. Drop old policies (idempotent re-run)
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
-- Any authenticated user can read profiles (needed for username lookup).
-- Each user can only write their own profile.
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
-- Owner can always see their own team, even before/if membership
-- rows are missing. Members can see teams they belong to.
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
--
-- SELECT:
--   Team members can see memberships of their team.
--   A user can always see their own membership rows.
--
-- INSERT:
--   Owner can insert owner/admin/player.
--   Admin can insert only player.
--   This also supports owner bootstrap because is_team_owner(team_id)
--   checks teams.owner_id and does not depend on an existing member row.
--
-- UPDATE:
--   Only owner can change roles.
--
-- DELETE:
--   Only owner can remove members.
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
-- All team members can read and write notes.
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