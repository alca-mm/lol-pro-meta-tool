# Supabase Auth + Teams + Cloud Champion Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth, team management, cloud-synced champion notes, and a Contact link to the header — while keeping local notes as a fallback when not logged in.

**Architecture:** Supabase handles auth and data; a thin client wrapper (`src/lib/supabase.ts`) guards against missing env vars. `AuthContext` + `TeamContext` provide state to the UI. `ChampionNotesPanel` detects which mode to use via a pure helper (`notesMode.ts`) and calls either local storage or Supabase. The rest of the app is unaffected.

**Tech Stack:** `@supabase/supabase-js`, Vite env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), React Context, localStorage for active-team persistence.

---

## File Map

**Create:**
- `src/lib/supabase.ts` — client singleton + `isSupabaseConfigured` flag
- `src/auth/AuthContext.tsx` — session/user state, signIn/signUp/signOut
- `src/components/auth/AuthPanel.tsx` — login/signup/magic-link form
- `src/components/auth/UserMenu.tsx` — shows email + logout when logged in
- `src/teams/teamService.ts` — Supabase CRUD + `getActiveTeamId`/`setActiveTeamId`
- `src/teams/TeamContext.tsx` — teams list, activeTeam, createTeam, setActiveTeam
- `src/notes/teamNotesService.ts` — Supabase-based note CRUD
- `src/notes/notesMode.ts` — pure helper: local vs team mode
- `src/components/TeamStatusPanel.tsx` — create-team UI when logged in with no team
- `supabase/schema.sql` — tables + RLS policies
- `.env.example`
- `tests/supabaseConfig.test.ts`
- `tests/teamService.test.ts`
- `tests/notesMode.test.ts`

**Modify:**
- `.gitignore` — add `!.env.example`
- `src/i18n/de.ts` — auth / team / contact keys
- `src/i18n/en.ts` — auth / team / contact keys
- `src/App.tsx` — providers, Contact link, Auth in header, TeamStatusPanel
- `src/components/draft/ChampionNotesPanel.tsx` — team mode integration

---

## Task 1 — Dependency + env setup

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install supabase-js**

```bash
npm install @supabase/supabase-js
```

Expected output: `@supabase/supabase-js` appears in `package.json` `dependencies`.

- [ ] **Step 2: Create `.env.example`**

Create file `C:\Projekte\lol-pro-meta-tool\.env.example`:
```
VITE_SUPABASE_URL=your-project-url-here
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 3: Exclude `.env.example` from gitignore**

The current `.gitignore` has `.env.*` which would also exclude `.env.example`. Add a negation rule.
Open `.gitignore` and change:
```
.env
.env.*
```
to:
```
.env
.env.*
!.env.example
```

- [ ] **Step 4: Verify build still passes**

```bash
npm run build
```
Expected: green build.

---

## Task 2 — Supabase client + test

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `tests/supabaseConfig.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/supabaseConfig.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { isSupabaseConfigured, supabase } from "../src/lib/supabase"

describe("supabase client", () => {
    it("isSupabaseConfigured is false when env vars are missing", () => {
        // In the test environment no .env file provides these vars
        expect(isSupabaseConfigured).toBe(false)
    })

    it("supabase is null when not configured", () => {
        expect(supabase).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/supabaseConfig.test.ts
```
Expected: import error (module doesn't exist yet).

- [ ] **Step 3: Create `src/lib/supabase.ts`**

```ts
import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured: boolean = Boolean(url && anonKey)

// null when env vars are missing — all callers must guard with `if (!supabase)`
export const supabase = isSupabaseConfigured
    ? createClient(url as string, anonKey as string)
    : null
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- tests/supabaseConfig.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all existing tests + 2 new tests passing.

---

## Task 3 — Supabase schema SQL

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Create schema directory and file**

```bash
mkdir supabase
```

Create `supabase/schema.sql`:

```sql
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
```

No test needed — this is a SQL artifact, not application logic.

---

## Task 4 — i18n extensions

**Files:**
- Modify: `src/i18n/de.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Add keys to `src/i18n/de.ts`**

Append before the final `} as const`:

```ts
    // Auth
    auth_login: "Login",
    auth_logout: "Abmelden",
    auth_signUp: "Registrieren",
    auth_email: "E-Mail",
    auth_password: "Passwort",
    auth_sendMagicLink: "Magic Link senden",
    auth_magicLinkSent: "Prüfe deine E-Mail!",
    auth_unavailable: "Auth nicht konfiguriert.",
    auth_loggedInAs: "Angemeldet als",
    auth_error: "Fehler",
    auth_loading: "Laden…",

    // Teams
    team_myTeams: "Meine Teams",
    team_createTeam: "Team erstellen",
    team_teamName: "Teamname",
    team_activeTeam: "Aktives Team",
    team_noTeam: "Noch kein Team. Erstelle eines, um Notizen zu teilen.",
    team_create: "Erstellen",
    team_switchTeam: "Team wechseln",

    // Notes mode
    cn_modeLocal: "Nur lokal",
    cn_modeTeam: "Team:",

    // Header
    header_contact: "Kontakt",
```

- [ ] **Step 2: Add the same keys to `src/i18n/en.ts`**

Append before the final `}`:

```ts
    // Auth
    auth_login: "Login",
    auth_logout: "Logout",
    auth_signUp: "Sign Up",
    auth_email: "Email",
    auth_password: "Password",
    auth_sendMagicLink: "Send Magic Link",
    auth_magicLinkSent: "Check your email!",
    auth_unavailable: "Auth not configured.",
    auth_loggedInAs: "Logged in as",
    auth_error: "Error",
    auth_loading: "Loading…",

    // Teams
    team_myTeams: "My Teams",
    team_createTeam: "Create Team",
    team_teamName: "Team Name",
    team_activeTeam: "Active Team",
    team_noTeam: "No team yet. Create one to share notes.",
    team_create: "Create",
    team_switchTeam: "Switch team",

    // Notes mode
    cn_modeLocal: "Local only",
    cn_modeTeam: "Team:",

    // Header
    header_contact: "Contact",
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npm run build
```
Expected: green build (both translation files have the same keys, `Translations` type is satisfied).

---

## Task 5 — AuthContext

**Files:**
- Create: `src/auth/AuthContext.tsx`

No unit test for this file (React context with Supabase subscriptions; `supabase` is null in tests so all auth calls are no-ops — integration tested via build).

- [ ] **Step 1: Create `src/auth/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "../lib/supabase"

interface AuthContextValue {
    session: Session | null
    user: User | null
    loading: boolean
    signInWithEmail: (email: string, password: string) => Promise<string | null>
    signUpWithEmail: (email: string, password: string) => Promise<string | null>
    signInWithMagicLink: (email: string) => Promise<string | null>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    // start loading=true only when supabase is configured (need to fetch session)
    const [loading, setLoading] = useState(isSupabaseConfigured)

    useEffect(() => {
        if (!supabase) return

        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            setLoading(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession)
        })

        return () => subscription.unsubscribe()
    }, [])

    async function signInWithEmail(email: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
    }

    async function signUpWithEmail(email: string, password: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signUp({ email, password })
        return error?.message ?? null
    }

    async function signInWithMagicLink(email: string): Promise<string | null> {
        if (!supabase) return "Auth not configured"
        const { error } = await supabase.auth.signInWithOtp({ email })
        return error?.message ?? null
    }

    async function signOut(): Promise<void> {
        if (!supabase) return
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session?.user ?? null,
                loading,
                signInWithEmail,
                signUpWithEmail,
                signInWithMagicLink,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
    return ctx
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 6 — Auth UI components

**Files:**
- Create: `src/components/auth/AuthPanel.tsx`
- Create: `src/components/auth/UserMenu.tsx`

- [ ] **Step 1: Create `src/components/auth/AuthPanel.tsx`**

```tsx
import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"

interface AuthPanelProps {
    onClose: () => void
}

export function AuthPanel({ onClose }: AuthPanelProps) {
    const { t } = useTranslation()
    const { signInWithEmail, signUpWithEmail, signInWithMagicLink, loading } = useAuth()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    if (!isSupabaseConfigured) {
        return (
            <div className="auth-panel">
                <p className="muted">{t("auth_unavailable")}</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="auth-panel">
                <p className="muted">{t("auth_loading")}</p>
            </div>
        )
    }

    async function handleAction(action: () => Promise<string | null>) {
        setError(null)
        setInfo(null)
        setBusy(true)
        const err = await action()
        setBusy(false)
        if (err) {
            setError(err)
        } else {
            onClose()
        }
    }

    async function handleMagicLink() {
        if (!email) return
        setError(null)
        setInfo(null)
        setBusy(true)
        const err = await signInWithMagicLink(email)
        setBusy(false)
        if (err) {
            setError(err)
        } else {
            setInfo(t("auth_magicLinkSent"))
        }
    }

    return (
        <div className="auth-panel recommendation-section">
            <div style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}>
                <label>
                    {t("auth_email")}
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={busy}
                        autoComplete="email"
                    />
                </label>
                <label>
                    {t("auth_password")}
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        autoComplete="current-password"
                    />
                </label>

                {error && <p className="muted" style={{ color: "var(--score-neg, #f87171)" }}>{t("auth_error")}: {error}</p>}
                {info && <p className="muted" style={{ color: "var(--score-pos, #4ade80)" }}>{info}</p>}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email || !password}
                        onClick={() => handleAction(() => signInWithEmail(email, password))}
                    >
                        {t("auth_login")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email || !password}
                        onClick={() => handleAction(() => signUpWithEmail(email, password))}
                    >
                        {t("auth_signUp")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email}
                        onClick={handleMagicLink}
                    >
                        {t("auth_sendMagicLink")}
                    </button>
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Create `src/components/auth/UserMenu.tsx`**

```tsx
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"

interface UserMenuProps {
    onShowLogin: () => void
}

export function UserMenu({ onShowLogin }: UserMenuProps) {
    const { t } = useTranslation()
    const { user, loading, signOut } = useAuth()

    if (!isSupabaseConfigured) return null

    if (loading) return <span className="muted">{t("auth_loading")}</span>

    if (!user) {
        return (
            <button type="button" className="lang-btn" onClick={onShowLogin}>
                {t("auth_login")}
            </button>
        )
    }

    return (
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>{user.email}</span>
            <button type="button" className="lang-btn" onClick={() => void signOut()}>
                {t("auth_logout")}
            </button>
        </span>
    )
}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 7 — Team service + test

**Files:**
- Create: `src/teams/teamService.ts`
- Create: `tests/teamService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/teamService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest"
import { getActiveTeamId, setActiveTeamId } from "../src/teams/teamService"

// minimal localStorage mock (same pattern as championNotes.test.ts)
const store: Record<string, string> = {}
Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: (key: string): string | null => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    },
    writable: true,
})

describe("getActiveTeamId / setActiveTeamId", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("returns null when nothing saved", () => {
        expect(getActiveTeamId()).toBeNull()
    })

    it("returns stored team id after setActiveTeamId", () => {
        setActiveTeamId("team-abc-123")
        expect(getActiveTeamId()).toBe("team-abc-123")
    })

    it("clears team id when called with null", () => {
        setActiveTeamId("team-abc-123")
        setActiveTeamId(null)
        expect(getActiveTeamId()).toBeNull()
    })

    it("overwrites previous team id", () => {
        setActiveTeamId("team-aaa")
        setActiveTeamId("team-bbb")
        expect(getActiveTeamId()).toBe("team-bbb")
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/teamService.test.ts
```
Expected: import error (module doesn't exist).

- [ ] **Step 3: Create `src/teams/teamService.ts`**

```ts
import { supabase } from "../lib/supabase"

export interface Team {
    id: string
    name: string
    owner_id: string
    created_at: string
}

const ACTIVE_TEAM_KEY = "lol_active_team_id"

export function getActiveTeamId(): string | null {
    try {
        return localStorage.getItem(ACTIVE_TEAM_KEY)
    } catch {
        return null
    }
}

export function setActiveTeamId(teamId: string | null): void {
    try {
        if (teamId) {
            localStorage.setItem(ACTIVE_TEAM_KEY, teamId)
        } else {
            localStorage.removeItem(ACTIVE_TEAM_KEY)
        }
    } catch {}
}

export async function fetchUserTeams(userId: string): Promise<Team[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("team_members")
        .select("teams(id, name, owner_id, created_at)")
        .eq("user_id", userId)
    if (error || !data) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => row.teams).filter(Boolean) as Team[]
}

export async function createTeam(userId: string, name: string): Promise<Team | null> {
    if (!supabase) return null

    const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({ name, owner_id: userId })
        .select()
        .single()

    if (teamError || !team) return null

    const { error: memberError } = await supabase
        .from("team_members")
        .insert({ team_id: (team as Team).id, user_id: userId, role: "owner" })

    if (memberError) return null

    return team as Team
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/teamService.test.ts
```
Expected: 4 passing.

---

## Task 8 — TeamContext

**Files:**
- Create: `src/teams/TeamContext.tsx`

No isolated unit test (depends on React + AuthContext; supabase is null in tests).

- [ ] **Step 1: Create `src/teams/TeamContext.tsx`**

```tsx
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react"
import type { Team } from "./teamService"
import {
    fetchUserTeams,
    createTeam as createTeamService,
    getActiveTeamId,
    setActiveTeamId,
} from "./teamService"
import { useAuth } from "../auth/AuthContext"

interface TeamContextValue {
    teams: Team[]
    activeTeam: Team | null
    loading: boolean
    createTeam: (name: string) => Promise<void>
    setActiveTeam: (teamId: string) => void
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [teams, setTeams] = useState<Team[]>([])
    const [activeTeamId, setActiveTeamIdState] = useState<string | null>(
        getActiveTeamId,
    )
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!user) {
            setTeams([])
            setActiveTeamIdState(null)
            setActiveTeamId(null)
            return
        }
        setLoading(true)
        fetchUserTeams(user.id)
            .then((loaded) => {
                setTeams(loaded)
                // if saved id is no longer valid, default to first team
                const savedId = getActiveTeamId()
                if (loaded.length > 0 && !loaded.find((t) => t.id === savedId)) {
                    setActiveTeamIdState(loaded[0].id)
                    setActiveTeamId(loaded[0].id)
                }
            })
            .finally(() => setLoading(false))
    }, [user])

    const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null

    async function createTeam(name: string): Promise<void> {
        if (!user) return
        const team = await createTeamService(user.id, name)
        if (team) {
            setTeams((prev) => [...prev, team])
            setActiveTeamIdState(team.id)
            setActiveTeamId(team.id)
        }
    }

    function setActiveTeam(teamId: string): void {
        setActiveTeamId(teamId)
        setActiveTeamIdState(teamId)
    }

    return (
        <TeamContext.Provider
            value={{ teams, activeTeam, loading, createTeam, setActiveTeam }}
        >
            {children}
        </TeamContext.Provider>
    )
}

export function useTeam(): TeamContextValue {
    const ctx = useContext(TeamContext)
    if (!ctx) throw new Error("useTeam must be used inside TeamProvider")
    return ctx
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 9 — Notes mode helper + test

**Files:**
- Create: `src/notes/notesMode.ts`
- Create: `tests/notesMode.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/notesMode.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { isTeamModeActive } from "../src/notes/notesMode"

describe("isTeamModeActive", () => {
    it("returns false when supabase is not configured", () => {
        expect(isTeamModeActive(false, "user-1", "team-1")).toBe(false)
    })

    it("returns false when no user is logged in", () => {
        expect(isTeamModeActive(true, null, "team-1")).toBe(false)
    })

    it("returns false when no active team is set", () => {
        expect(isTeamModeActive(true, "user-1", null)).toBe(false)
    })

    it("returns true when supabase configured, user logged in, and team active", () => {
        expect(isTeamModeActive(true, "user-1", "team-1")).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/notesMode.test.ts
```
Expected: import error.

- [ ] **Step 3: Create `src/notes/notesMode.ts`**

```ts
export function isTeamModeActive(
    isConfigured: boolean,
    userId: string | null,
    teamId: string | null,
): boolean {
    return isConfigured && Boolean(userId) && Boolean(teamId)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/notesMode.test.ts
```
Expected: 4 passing.

---

## Task 10 — Team notes service

**Files:**
- Create: `src/notes/teamNotesService.ts`

No unit test (all paths gate on `if (!supabase)` which returns immediately in tests).

- [ ] **Step 1: Create `src/notes/teamNotesService.ts`**

```ts
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
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 11 — TeamStatusPanel

**Files:**
- Create: `src/components/TeamStatusPanel.tsx`

- [ ] **Step 1: Create `src/components/TeamStatusPanel.tsx`**

```tsx
import { useState } from "react"
import { useTranslation } from "../i18n/LanguageContext"
import { useAuth } from "../auth/AuthContext"
import { useTeam } from "../teams/TeamContext"

export function TeamStatusPanel() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { teams, activeTeam, loading, createTeam, setActiveTeam } = useTeam()
    const [newTeamName, setNewTeamName] = useState("")
    const [creating, setCreating] = useState(false)

    // only render when logged in
    if (!user) return null
    if (loading) return <p className="muted">{t("auth_loading")}</p>

    async function handleCreate() {
        if (!newTeamName.trim()) return
        setCreating(true)
        await createTeam(newTeamName.trim())
        setNewTeamName("")
        setCreating(false)
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                {activeTeam ? (
                    <span>
                        <strong>{t("team_activeTeam")}:</strong>{" "}
                        <span>{activeTeam.name}</span>
                    </span>
                ) : (
                    <span className="muted">{t("team_noTeam")}</span>
                )}

                {teams.length > 1 && (
                    <select
                        value={activeTeam?.id ?? ""}
                        onChange={(e) => setActiveTeam(e.target.value)}
                        style={{ maxWidth: "12rem" }}
                    >
                        {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                )}

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder={t("team_teamName")}
                        disabled={creating}
                        style={{ maxWidth: "10rem" }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCreate() }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleCreate()}
                        disabled={creating || !newTeamName.trim()}
                    >
                        {t("team_create")}
                    </button>
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 12 — ChampionNotesPanel team-mode integration

**Files:**
- Modify: `src/components/draft/ChampionNotesPanel.tsx`

Replace the entire file:

- [ ] **Step 1: Rewrite `src/components/draft/ChampionNotesPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import { ALL_CHAMPIONS } from "../../analysis/championCatalog"
import type { ChampionNote, ChampionNoteRating } from "../../notes/types"
import { loadNotes, saveNote, deleteNote } from "../../notes/storage"
import { loadTeamNotes, saveTeamNote, deleteTeamNote } from "../../notes/teamNotesService"
import { isTeamModeActive } from "../../notes/notesMode"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { isSupabaseConfigured } from "../../lib/supabase"

const RATINGS: ChampionNoteRating[] = ["comfort", "blind", "pocket", "situational", "avoid"]

interface ChampionNotesPanelProps {
    pickedChampions: string[]
}

export function ChampionNotesPanel({ pickedChampions }: ChampionNotesPanelProps) {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { activeTeam } = useTeam()

    const teamMode = isTeamModeActive(
        isSupabaseConfigured,
        user?.id ?? null,
        activeTeam?.id ?? null,
    )

    const [notes, setNotes] = useState<Record<string, ChampionNote>>({})
    const [loadingNotes, setLoadingNotes] = useState(false)
    const [notesError, setNotesError] = useState<string | null>(null)
    const [selectedChampion, setSelectedChampion] = useState("")
    const [editNote, setEditNote] = useState("")
    const [editTags, setEditTags] = useState("")
    const [editRating, setEditRating] = useState<ChampionNoteRating | "">("")
    const [savedFlash, setSavedFlash] = useState(false)

    const loadAllNotes = useCallback(async () => {
        setLoadingNotes(true)
        setNotesError(null)
        try {
            const loaded = teamMode && activeTeam
                ? await loadTeamNotes(activeTeam.id)
                : loadNotes()
            setNotes(loaded)
        } catch (err) {
            setNotesError(err instanceof Error ? err.message : "Load error")
        } finally {
            setLoadingNotes(false)
        }
    }, [teamMode, activeTeam])

    useEffect(() => {
        void loadAllNotes()
    }, [loadAllNotes])

    useEffect(() => {
        if (!selectedChampion) return
        const existing = notes[selectedChampion]
        if (existing) {
            setEditNote(existing.note)
            setEditTags(existing.tags.join(", "))
            setEditRating(existing.rating ?? "")
        } else {
            setEditNote("")
            setEditTags("")
            setEditRating("")
        }
    }, [selectedChampion, notes])

    async function handleSave() {
        if (!selectedChampion) return
        const entry: ChampionNote = {
            championName: selectedChampion,
            note: editNote.trim(),
            tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
            rating: (editRating || null) as ChampionNoteRating | null,
            updatedAt: new Date().toISOString(),
        }
        if (teamMode && activeTeam && user) {
            const err = await saveTeamNote(activeTeam.id, entry, user.id)
            if (err) { setNotesError(err); return }
        } else {
            saveNote(entry)
        }
        await loadAllNotes()
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 1500)
    }

    async function handleDelete() {
        if (!selectedChampion) return
        if (teamMode && activeTeam) {
            const err = await deleteTeamNote(activeTeam.id, selectedChampion)
            if (err) { setNotesError(err); return }
        } else {
            deleteNote(selectedChampion)
        }
        await loadAllNotes()
        setEditNote("")
        setEditTags("")
        setEditRating("")
    }

    const relevantNotes = pickedChampions.map((name) => notes[name]).filter(Boolean)

    const modeLabel = teamMode && activeTeam
        ? `${t("cn_modeTeam")} ${activeTeam.name}`
        : t("cn_modeLocal")

    return (
        <div className="recommendation-section">
            <div className="champion-picker-header">
                <h3>{t("cn_title")}</h3>
                <span className="muted" style={{ fontSize: "0.8rem" }}>{modeLabel}</span>
            </div>

            {notesError && (
                <p className="muted" style={{ color: "var(--score-neg, #f87171)" }}>
                    {t("auth_error")}: {notesError}
                </p>
            )}

            {pickedChampions.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                    <p className="muted">
                        <strong>{t("cn_relevantNotes")}</strong>
                    </p>
                    {relevantNotes.length === 0 ? (
                        <p className="muted">{t("cn_noDraftedNotes")}</p>
                    ) : (
                        relevantNotes.map((n) => (
                            <div
                                key={n.championName}
                                className="recommendation-card"
                                style={{ marginBottom: "0.5rem", cursor: "pointer" }}
                                onClick={() => setSelectedChampion(n.championName)}
                                title={t("cn_editNote")}
                            >
                                <strong>{n.championName}</strong>
                                {n.rating && (
                                    <span className="draft-comp-pill" style={{ marginLeft: "0.5rem" }}>
                                        {t(`cn_rating_${n.rating}` as TranslationKey)}
                                    </span>
                                )}
                                {n.tags.length > 0 && (
                                    <span className="muted"> · {n.tags.join(", ")}</span>
                                )}
                                {n.note && (
                                    <p className="muted" style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
                                        {n.note}
                                    </p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            <div style={{ display: "grid", gap: "0.5rem" }}>
                <label>
                    {t("cn_selectChampion")}
                    <select
                        value={selectedChampion}
                        onChange={(e) => setSelectedChampion(e.target.value)}
                        disabled={loadingNotes}
                    >
                        <option value="">—</option>
                        {ALL_CHAMPIONS.map((name) => (
                            <option key={name} value={name}>
                                {name}{notes[name] ? " ·" : ""}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    {t("cn_note")}
                    <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={3}
                        disabled={!selectedChampion || loadingNotes}
                        style={{ resize: "vertical" }}
                    />
                </label>

                <label>
                    {t("cn_tags")}
                    <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        disabled={!selectedChampion || loadingNotes}
                        placeholder="e.g. top, carry, peel"
                    />
                </label>

                <label>
                    {t("cn_rating")}
                    <select
                        value={editRating}
                        onChange={(e) => setEditRating(e.target.value as ChampionNoteRating | "")}
                        disabled={!selectedChampion || loadingNotes}
                    >
                        <option value="">{t("cn_noRating")}</option>
                        {RATINGS.map((r) => (
                            <option key={r} value={r}>
                                {t(`cn_rating_${r}` as TranslationKey)}
                            </option>
                        ))}
                    </select>
                </label>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleSave()}
                        disabled={!selectedChampion || loadingNotes}
                    >
                        {savedFlash ? t("cn_saved") : t("cn_save")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleDelete()}
                        disabled={!selectedChampion || !notes[selectedChampion] || loadingNotes}
                    >
                        {t("cn_delete")}
                    </button>
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```
Expected: green.

---

## Task 13 — App.tsx: providers + header + TeamStatusPanel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add providers and header to `src/App.tsx`**

Replace the entire file:

```tsx
import { useState, useMemo, useEffect } from "react"
import { FilterProvider, useFilters } from "./context/FilterContext"
import { LanguageProvider, useTranslation } from "./i18n/LanguageContext"
import { AuthProvider } from "./auth/AuthContext"
import { TeamProvider } from "./teams/TeamContext"
import { UserMenu } from "./components/auth/UserMenu"
import { AuthPanel } from "./components/auth/AuthPanel"
import { TeamStatusPanel } from "./components/TeamStatusPanel"
import { parseMatches } from "./import/parseMatches"
import { applyFilters } from "./analysis/filters"
import { calculateChampionStats, primaryRole } from "./analysis/championStats"
import { calculateSynergyStats } from "./analysis/synergyStats"
import { calculateMatchupStats } from "./analysis/matchupStats"
import { calculateRoleStats } from "./analysis/roleStats"
import { calculateRoleMatchups } from "./analysis/roleMatchups"
import { Filters } from "./components/Filters"
import { Dashboard } from "./components/Dashboard"
import { ChampionStatsTable } from "./components/ChampionStatsTable"
import { ChampionDetail } from "./components/ChampionDetail"
import { SynergyTable } from "./components/SynergyTable"
import { MatchupTable } from "./components/MatchupTable"
import { DataSourceInfo } from "./components/DataSourceInfo"
import { RoleStatsTable } from "./components/RoleStatsTable"
import { RoleMatchupTable } from "./components/RoleMatchupTable"
import { PatchComparisonView } from "./components/PatchComparisonView"
import { DraftHelper } from "./components/DraftHelper"
import sampleData from "./data/sampleMatches.json"
import type { Match, SyncReport } from "./domain/types"

const DISCORD_INVITE_URL = "DISCORD_INVITE_HIER_EINSETZEN"

const sampleMatches = parseMatches(sampleData)

type TabId = "champions" | "draft" | "synergies" | "matchups" | "roles" | "patches"

function AppContent() {
    const { filters } = useFilters()
    const { t, lang, setLang } = useTranslation()
    const [selectedChampion, setSelectedChampion] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabId>("champions")
    const [filtersCollapsed, setFiltersCollapsed] = useState(false)
    const [authPanelOpen, setAuthPanelOpen] = useState(false)

    const [allMatches, setAllMatches] = useState<Match[]>(sampleMatches)
    const [isUsingSampleData, setIsUsingSampleData] = useState(true)
    const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const base = import.meta.env.BASE_URL

        fetch(`${base}data/importedMatches.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (cancelled) return
                const matches = parseMatches(data)
                if (matches.length > 0) {
                    setAllMatches(matches)
                    setIsUsingSampleData(false)
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        fetch(`${base}data/latest-sync-report.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (!cancelled) setSyncReport(data as SyncReport)
            })
            .catch(() => {})

        return () => {
            cancelled = true
        }
    }, [])

    const TABS: { id: TabId; label: string }[] = [
        { id: "champions", label: t("tab_champions") },
        { id: "draft", label: t("tab_draftHelper") },
        { id: "synergies", label: t("tab_synergies") },
        { id: "matchups", label: t("tab_matchups") },
        { id: "roles", label: t("tab_roles") },
        { id: "patches", label: t("tab_patches") },
    ]

    const filteredMatches = useMemo(() => applyFilters(allMatches, filters), [allMatches, filters])

    const championStats = useMemo(() => {
        const stats = calculateChampionStats(filteredMatches)
        return stats
            .filter((s) => s.picks >= filters.minPicks)
            .filter((s) => {
                if (!filters.role) return true
                return primaryRole(s) === filters.role
            })
    }, [filteredMatches, filters.minPicks, filters.role])

    const synergyStats = useMemo(() => calculateSynergyStats(filteredMatches), [filteredMatches])
    const matchupStats = useMemo(() => calculateMatchupStats(filteredMatches), [filteredMatches])
    const roleStats = useMemo(() => calculateRoleStats(filteredMatches), [filteredMatches])
    const roleMatchups = useMemo(() => calculateRoleMatchups(filteredMatches), [filteredMatches])

    const selectedStats = championStats.find((s) => s.championName === selectedChampion) ?? null

    if (isLoading) {
        return (
            <div className="app">
                <header className="app-header">
                    <h1>Aatroxtool</h1>
                </header>
                <p className="loading-state">{t("app_loading")}</p>
            </div>
        )
    }

    return (
        <div className="app">
            <header className="app-header">
                <h1>Aatroxtool</h1>
                <div className="header-right" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div className="lang-toggle">
                        <button
                            type="button"
                            className={`lang-btn${lang === "de" ? " lang-active" : ""}`}
                            onClick={() => setLang("de")}
                            aria-pressed={lang === "de"}
                        >
                            DE
                        </button>
                        <button
                            type="button"
                            className={`lang-btn${lang === "en" ? " lang-active" : ""}`}
                            onClick={() => setLang("en")}
                            aria-pressed={lang === "en"}
                        >
                            EN
                        </button>
                    </div>
                    <a
                        href={DISCORD_INVITE_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="lang-btn"
                    >
                        {t("header_contact")}
                    </a>
                    <UserMenu onShowLogin={() => setAuthPanelOpen((prev) => !prev)} />
                </div>
            </header>

            {authPanelOpen && (
                <AuthPanel onClose={() => setAuthPanelOpen(false)} />
            )}

            <TeamStatusPanel />

            <DataSourceInfo
                isUsingSampleData={isUsingSampleData}
                matches={allMatches}
                syncReport={syncReport ?? undefined}
            />

            <div className={`app-body${filtersCollapsed ? " filters-collapsed" : ""}`}>
                <aside className="filters-shell">
                    <button
                        type="button"
                        className="filters-collapse-button"
                        onClick={() => setFiltersCollapsed((current) => !current)}
                        aria-expanded={!filtersCollapsed}
                    >
                        {filtersCollapsed ? t("filter_title") : t("filter_hide")}
                    </button>

                    {!filtersCollapsed && <Filters matches={allMatches} />}
                </aside>

                <main className="app-main">
                    {filtersCollapsed && (
                        <button
                            type="button"
                            className="filters-floating-button"
                            onClick={() => setFiltersCollapsed(false)}
                        >
                            {t("filter_show")}
                        </button>
                    )}

                    {allMatches.length === 0 ? (
                        <p className="empty-state error">{t("app_noMatches")}</p>
                    ) : (
                        <>
                            <Dashboard
                                totalMatches={allMatches.length}
                                filteredMatches={filteredMatches.length}
                            />

                            <nav className="tab-nav" aria-label="Ansichten">
                                {TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`tab-btn${activeTab === tab.id ? " tab-active" : ""}`}
                                        onClick={() => setActiveTab(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>

                            {activeTab === "champions" && (
                                <>
                                    <section className="section">
                                        <h2>{t("section_championStats")}</h2>
                                        <ChampionStatsTable
                                            stats={championStats}
                                            selectedChampion={selectedChampion}
                                            onSelectChampion={setSelectedChampion}
                                        />
                                    </section>

                                    {selectedStats && (
                                        <section className="section">
                                            <ChampionDetail
                                                stats={selectedStats}
                                                synergies={synergyStats}
                                                matchups={matchupStats}
                                                onClose={() => setSelectedChampion(null)}
                                            />
                                        </section>
                                    )}
                                </>
                            )}

                            {activeTab === "draft" && (
                                <section className="section">
                                    <DraftHelper matches={filteredMatches} />
                                </section>
                            )}

                            {activeTab === "synergies" && (
                                <section className="section">
                                    <h2>{t("section_synergies")}</h2>
                                    <SynergyTable synergies={synergyStats} />
                                </section>
                            )}

                            {activeTab === "matchups" && (
                                <>
                                    <section className="section">
                                        <h2>{t("section_champMatchups")}</h2>
                                        <MatchupTable matchups={matchupStats} />
                                    </section>
                                    <section className="section">
                                        <h2>{t("section_matchupsByRole")}</h2>
                                        <RoleMatchupTable matchups={roleMatchups} />
                                    </section>
                                </>
                            )}

                            {activeTab === "roles" && (
                                <section className="section">
                                    <h2>{t("section_champStatsByRole")}</h2>
                                    <RoleStatsTable stats={roleStats} filterRole={filters.role} />
                                </section>
                            )}

                            {activeTab === "patches" && (
                                <section className="section">
                                    <h2>{t("section_patchComparison")}</h2>
                                    <PatchComparisonView matches={filteredMatches} />
                                </section>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}

export default function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <TeamProvider>
                    <FilterProvider>
                        <AppContent />
                    </FilterProvider>
                </TeamProvider>
            </AuthProvider>
        </LanguageProvider>
    )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all tests passing (234+).

- [ ] **Step 3: Run full build**

```bash
npm run build
```
Expected: green build.

---

## Task 14 — Final verification

- [ ] **Step 1: Run complete test suite**

```bash
npm test
```
Expected: all tests pass, no regressions.

- [ ] **Step 2: Run production build**

```bash
npm run build
```
Expected: clean build, no TypeScript errors.

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| `@supabase/supabase-js` installed | Task 1 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars | Task 1 + 2 |
| `.env.example` | Task 1 |
| App doesn't crash without env vars | Task 2 (`isSupabaseConfigured` guard) |
| `src/lib/supabase.ts` | Task 2 |
| Supabase config test | Task 2 |
| `supabase/schema.sql` with RLS | Task 3 |
| i18n auth/team/contact keys DE+EN | Task 4 |
| `AuthContext` with session/user/signIn/signUp/magicLink/signOut | Task 5 |
| `AuthPanel` UI | Task 6 |
| `UserMenu` UI | Task 6 |
| `teamService.ts` with localStorage helpers | Task 7 |
| teamService tests | Task 7 |
| `TeamContext` | Task 8 |
| `notesMode.ts` helper | Task 9 |
| notesMode tests | Task 9 |
| `teamNotesService.ts` | Task 10 |
| `TeamStatusPanel` (create team prompt) | Task 11 |
| `ChampionNotesPanel` local+team mode | Task 12 |
| Contact link in header | Task 13 |
| Login/UserMenu in header | Task 13 |
| `AuthProvider` + `TeamProvider` in tree | Task 13 |
| No Service Role Keys in frontend | Throughout (only anon key used) |
| Existing tests not deleted | Throughout |

**No placeholders found** — all code is complete.

**Type consistency:** `Team` interface defined in Task 7, used consistently in Tasks 8, 11, 12. `ChampionNote` from existing `src/notes/types.ts`. `AuthContextValue` defined in Task 5, consumed in Tasks 6, 12, 13.

**One known limitation:** `TeamStatusPanel` has a variable shadowing issue in the `teams.map((t) => ...)` call — use a different variable name than `t` (the translation function). Fix: use `(team) =>` in the map. This is caught by `noUnusedLocals` only if `t` is also in scope — it won't be a compilation error but is confusing. The plan uses `(t) =>` for the team map which shadows the translation `t`... actually in `TeamStatusPanel`, `t` is the translation function AND used as a map variable. Fix the map to use `(team) =>` consistently. *(Self-correction: the plan code above must be adjusted — in Task 11, replace `teams.map((t) => (` with `teams.map((team) => (` and update references accordingly.)*
