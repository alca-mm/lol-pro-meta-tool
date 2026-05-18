-- ============================================================
-- LoL Pro Meta Tool — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.
-- ============================================================

-- 1. Teams
create table if not exists teams (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    owner_id   uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table teams enable row level security;

-- Members can read their own teams
create policy "teams_select" on teams
    for select using (
        id in (
            select team_id from team_members where user_id = auth.uid()
        )
    );

-- Owners can create teams (insert assigns owner_id = current user)
create policy "teams_insert" on teams
    for insert with check (owner_id = auth.uid());

-- Owners can update their teams
create policy "teams_update" on teams
    for update using (owner_id = auth.uid());

-- Owners can delete their teams
create policy "teams_delete" on teams
    for delete using (owner_id = auth.uid());


-- 2. Team members
create table if not exists team_members (
    team_id    uuid not null references teams(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null default 'owner',
    created_at timestamptz not null default now(),
    primary key (team_id, user_id)
);

alter table team_members enable row level security;

-- Members can read memberships for teams they belong to
create policy "team_members_select" on team_members
    for select using (user_id = auth.uid());

-- Only owners of a team can add members
create policy "team_members_insert" on team_members
    for insert with check (
        user_id = auth.uid()
        or
        team_id in (
            select id from teams where owner_id = auth.uid()
        )
    );

-- Owners can remove members from their teams
create policy "team_members_delete" on team_members
    for delete using (
        team_id in (
            select id from teams where owner_id = auth.uid()
        )
    );


-- 3. Champion notes (per team)
create table if not exists champion_notes (
    id             uuid primary key default gen_random_uuid(),
    team_id        uuid not null references teams(id) on delete cascade,
    champion_name  text not null,
    note           text not null default '',
    tags           text[] not null default '{}',
    rating         text null,
    updated_at     timestamptz not null default now(),
    updated_by     uuid references auth.users(id),
    unique (team_id, champion_name)
);

alter table champion_notes enable row level security;

-- Members can read notes for their teams
create policy "champion_notes_select" on champion_notes
    for select using (
        team_id in (
            select team_id from team_members where user_id = auth.uid()
        )
    );

-- Members can insert notes for their teams
create policy "champion_notes_insert" on champion_notes
    for insert with check (
        team_id in (
            select team_id from team_members where user_id = auth.uid()
        )
    );

-- Members can update notes for their teams
create policy "champion_notes_update" on champion_notes
    for update using (
        team_id in (
            select team_id from team_members where user_id = auth.uid()
        )
    );

-- Members can delete notes for their teams
create policy "champion_notes_delete" on champion_notes
    for delete using (
        team_id in (
            select team_id from team_members where user_id = auth.uid()
        )
    );
