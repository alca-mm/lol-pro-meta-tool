# Team Champion Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Champion Notes rating into a Team Champion Pool score that feeds into Draft Recommendations with configurable weight (default 30%).

**Architecture:** Team pool scoring lives in `DraftHelper.tsx` (UI layer) — the pure `draftHelper.ts` analysis module only adds `teamPoolScore: null` as a placeholder. DraftHelper loads team notes via `useEffect`, builds a `teamPoolMap`, and passes it into `weightedRecommendations` which injects it before scoring. `ratingToTeamPoolScore` is a pure function in DraftHelper.tsx and is exported for testing.

**Tech Stack:** TypeScript, React (useState/useMemo/useEffect), Vitest, Supabase (existing champion_notes table)

---

### Task 1: Add `needs_practice` rating + translations + ChampionNotesPanel + test

**Files:**
- Modify: `src/notes/types.ts`
- Modify: `src/i18n/de.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/components/draft/ChampionNotesPanel.tsx`
- Modify: `tests/championNotes.test.ts`

- [ ] **Step 1: Update `src/notes/types.ts`**

Replace the entire file:

```ts
export type ChampionNoteRating =
    | "comfort"
    | "blind"
    | "pocket"
    | "situational"
    | "needs_practice"
    | "avoid"

export type TeamChampionRating = ChampionNoteRating

export interface ChampionNote {
    championName: string
    note: string
    tags: string[]
    rating: ChampionNoteRating | null
    updatedAt: string
}
```

- [ ] **Step 2: Add translation keys to `src/i18n/de.ts`**

After `cn_rating_pocket: "Pocket Pick",` add:

```ts
    cn_rating_needs_practice: "Braucht Übung",
```

- [ ] **Step 3: Add translation keys to `src/i18n/en.ts`**

After `cn_rating_pocket: "Pocket Pick",` add:

```ts
    cn_rating_needs_practice: "Needs Practice",
```

- [ ] **Step 4: Add `needs_practice` to RATINGS array in `src/components/draft/ChampionNotesPanel.tsx`**

Find the line:
```ts
const RATINGS: ChampionNoteRating[] = ["comfort", "blind", "pocket", "situational", "avoid"]
```
Replace with:
```ts
const RATINGS: ChampionNoteRating[] = ["comfort", "blind", "pocket", "situational", "needs_practice", "avoid"]
```

- [ ] **Step 5: Update the test in `tests/championNotes.test.ts`**

Find the `validRatings` array in the `ChampionNoteRating values` describe block:
```ts
const validRatings = ["comfort", "situational", "avoid", "blind", "pocket"] as const
```
Replace with:
```ts
const validRatings = ["comfort", "situational", "avoid", "blind", "pocket", "needs_practice"] as const
```

- [ ] **Step 6: Run tests to verify they pass**

```
npm test -- --reporter=verbose tests/championNotes.test.ts
```

Expected: all tests pass (including new `needs_practice` in round-trip test).

- [ ] **Step 7: Commit**

```
git add src/notes/types.ts src/i18n/de.ts src/i18n/en.ts src/components/draft/ChampionNotesPanel.tsx tests/championNotes.test.ts
git commit -m "feat: add needs_practice to ChampionNoteRating"
```

---

### Task 2: Add `teamPool` WeightKey + `DraftRecommendation` fields + constants

**Files:**
- Modify: `src/draft/types.ts`
- Modify: `src/analysis/draftHelper.ts`
- Modify: `src/draft/constants.ts`
- Modify: `tests/draftRecommendations.test.ts`

- [ ] **Step 1: Add `teamPool` to `WeightKey` in `src/draft/types.ts`**

Find:
```ts
export type WeightKey = "draftPriority" | "roleStats" | "synergy" | "matchup" | "winRate" | "sampleSize"
```
Replace with:
```ts
export type WeightKey = "draftPriority" | "roleStats" | "synergy" | "matchup" | "winRate" | "sampleSize" | "teamPool"
```

- [ ] **Step 2: Add `teamPoolScore` and `teamPoolRating` to `DraftRecommendation` in `src/analysis/draftHelper.ts`**

At the top of the file, add import:
```ts
import type { ChampionNoteRating } from "../notes/types"
```

Find the `DraftRecommendation` type definition and add two fields at the end:
```ts
export type DraftRecommendation = {
    championName: string
    role: Role
    totalScore: number
    draftPriorityScore: number
    roleStatsScore: number
    synergyScore: number
    matchupScore: number
    games: number
    winRate: number | null
    sampleSizeLabel: string
    reasons: string[]
    teamPoolScore: number | null
    teamPoolRating: ChampionNoteRating | null
}
```

In `calculateDraftRecommendations`, find the `recommendations.push({...})` call and add the two new fields:
```ts
        recommendations.push({
            championName,
            role,
            totalScore,
            draftPriorityScore: priority,
            roleStatsScore: roleScore,
            synergyScore,
            matchupScore,
            games: roleStat.picks,
            winRate: roleStat.winRate,
            sampleSizeLabel: sampleSizeLabel(roleStat.picks),
            reasons: buildReasons({
                draftPriorityScore: priority,
                roleStatsScore: roleScore,
                synergyScore,
                matchupScore,
                games: roleStat.picks,
            }),
            teamPoolScore: null,
            teamPoolRating: null,
        })
```

- [ ] **Step 3: Add `teamPool` to `DEFAULT_WEIGHTS` and all `WEIGHT_PRESETS` in `src/draft/constants.ts`**

Find `DEFAULT_WEIGHTS` and add `teamPool: 30`:
```ts
export const DEFAULT_WEIGHTS: WeightConfig = {
    draftPriority: 40,
    roleStats: 20,
    synergy: 15,
    matchup: 20,
    winRate: 5,
    sampleSize: 0,
    teamPool: 30,
}
```

Update `WEIGHT_PRESETS` to add `teamPool` to every preset:
```ts
export const WEIGHT_PRESETS: Record<DraftAiPresetKey, { label: string; weights: WeightConfig }> = {
    balanced: {
        label: "Balanced",
        weights: { draftPriority: 40, roleStats: 20, synergy: 15, matchup: 20, winRate: 5, sampleSize: 0, teamPool: 30 },
    },
    counterpick: {
        label: "Counterpick",
        weights: { draftPriority: 20, roleStats: 15, synergy: 10, matchup: 45, winRate: 5, sampleSize: 5, teamPool: 15 },
    },
    synergy: {
        label: "Synergy",
        weights: { draftPriority: 20, roleStats: 15, synergy: 45, matchup: 10, winRate: 5, sampleSize: 5, teamPool: 20 },
    },
    meta: {
        label: "Meta Priority",
        weights: { draftPriority: 60, roleStats: 20, synergy: 5, matchup: 10, winRate: 5, sampleSize: 0, teamPool: 10 },
    },
    safe: {
        label: "Safe / High Confidence",
        weights: { draftPriority: 25, roleStats: 25, synergy: 10, matchup: 10, winRate: 10, sampleSize: 20, teamPool: 25 },
    },
}
```

- [ ] **Step 4: Add teamPool assertions to `tests/draftRecommendations.test.ts`**

After the last `it(...)` block, add:
```ts
    it("calculateDraftRecommendations initializes teamPoolScore to null", () => {
        const recs = calculateDraftRecommendations(ahriVsViktor, createEmptyDraftState())
        const ahriRec = recs.find((r) => r.championName === "Ahri" && r.role === "mid")!
        expect(ahriRec).toBeDefined()
        expect(ahriRec.teamPoolScore).toBeNull()
        expect(ahriRec.teamPoolRating).toBeNull()
    })
```

- [ ] **Step 5: Run tests**

```
npm test -- --reporter=verbose tests/draftRecommendations.test.ts
```

Expected: all tests pass including the new null-initialization test.

- [ ] **Step 6: Commit**

```
git add src/draft/types.ts src/analysis/draftHelper.ts src/draft/constants.ts tests/draftRecommendations.test.ts
git commit -m "feat: add teamPool weight key and DraftRecommendation pool fields"
```

---

### Task 3: `ratingToTeamPoolScore` + updated `calculateWeightedScore` + weight label + new tests

**Files:**
- Modify: `src/components/DraftHelper.tsx`
- Modify: `src/components/draft/ScoreWeightPanel.tsx`
- Modify: `src/i18n/de.ts`
- Modify: `src/i18n/en.ts`
- Create: `tests/teamChampionPool.test.ts`

- [ ] **Step 1: Export `ratingToTeamPoolScore` from `src/components/DraftHelper.tsx`**

After the import block (before the first function definition, around line 82), add:

```ts
export function ratingToTeamPoolScore(rating: ChampionNoteRating | null): number {
    switch (rating) {
        case "comfort": return 1.00
        case "blind": return 0.95
        case "pocket": return 0.90
        case "situational": return 0.65
        case "needs_practice": return 0.25
        case "avoid": return 0.00
        default: return 0.50
    }
}
```

Also add the import for `ChampionNoteRating` at the top of DraftHelper.tsx:
```ts
import type { ChampionNote, ChampionNoteRating } from "../notes/types"
```

- [ ] **Step 2: Export and update `calculateWeightedScore` in `src/components/DraftHelper.tsx`**

Find the `calculateWeightedScore` function (around line 175) and replace it:

```ts
export function calculateWeightedScore(
    entry: DraftRecommendation,
    weights: WeightConfig,
    teamPoolScore: number | null = null,
): number {
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0)

    if (totalWeight <= 0) return entry.totalScore

    const winRateScore = entry.winRate === null ? 0 : (entry.winRate - 0.5) * 2
    const sampleSizeScore = Math.min(entry.games / 25, 1)
    const effectiveTeamPoolScore = teamPoolScore ?? 0.5

    const weightedSum =
        entry.draftPriorityScore * weights.draftPriority +
        entry.roleStatsScore * weights.roleStats +
        entry.synergyScore * weights.synergy +
        entry.matchupScore * weights.matchup +
        winRateScore * weights.winRate +
        sampleSizeScore * weights.sampleSize +
        effectiveTeamPoolScore * weights.teamPool

    return (weightedSum / totalWeight) * sampleConfidence(entry.games)
}
```

- [ ] **Step 3: Add `teamPool` weight label to `src/i18n/de.ts`**

After `dh_wLabel_sampleSize: "Sample Size",` add:
```ts
    dh_wLabel_teamPool: "Team Pool",
```

- [ ] **Step 4: Add `teamPool` weight label to `src/i18n/en.ts`**

After `dh_wLabel_sampleSize: "Sample Size",` add:
```ts
    dh_wLabel_teamPool: "Team Pool",
```

- [ ] **Step 5: Add `teamPool` to WEIGHT_LABELS in `src/components/draft/ScoreWeightPanel.tsx`**

Find the `WEIGHT_LABELS` object and add the `teamPool` entry:

```ts
    const WEIGHT_LABELS: Record<WeightKey, string> = {
        draftPriority: t("dh_wLabel_draftPriority"),
        roleStats: t("dh_wLabel_roleStats"),
        synergy: t("dh_wLabel_synergy"),
        matchup: t("dh_wLabel_matchup"),
        winRate: t("dh_wLabel_winRate"),
        sampleSize: t("dh_wLabel_sampleSize"),
        teamPool: t("dh_wLabel_teamPool"),
    }
```

- [ ] **Step 6: Write failing tests — create `tests/teamChampionPool.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { ratingToTeamPoolScore, calculateWeightedScore } from "../src/components/DraftHelper"
import { DEFAULT_WEIGHTS } from "../src/draft/constants"
import type { DraftRecommendation } from "../src/analysis/draftHelper"

const baseRec: DraftRecommendation = {
    championName: "Ahri",
    role: "mid",
    totalScore: 0.6,
    draftPriorityScore: 0.6,
    roleStatsScore: 0.6,
    synergyScore: 0.5,
    matchupScore: 0.5,
    games: 25,
    winRate: 0.55,
    sampleSizeLabel: "Good",
    reasons: [],
    teamPoolScore: null,
    teamPoolRating: null,
}

describe("ratingToTeamPoolScore", () => {
    it("comfort returns 1.00", () => {
        expect(ratingToTeamPoolScore("comfort")).toBe(1.00)
    })

    it("blind returns 0.95", () => {
        expect(ratingToTeamPoolScore("blind")).toBe(0.95)
    })

    it("pocket returns 0.90", () => {
        expect(ratingToTeamPoolScore("pocket")).toBe(0.90)
    })

    it("situational returns 0.65", () => {
        expect(ratingToTeamPoolScore("situational")).toBe(0.65)
    })

    it("needs_practice returns 0.25", () => {
        expect(ratingToTeamPoolScore("needs_practice")).toBe(0.25)
    })

    it("avoid returns 0.00", () => {
        expect(ratingToTeamPoolScore("avoid")).toBe(0.00)
    })

    it("null returns neutral 0.50", () => {
        expect(ratingToTeamPoolScore(null)).toBe(0.50)
    })

    it("ordering: comfort > blind > pocket > situational > needs_practice > avoid", () => {
        expect(ratingToTeamPoolScore("comfort")).toBeGreaterThan(ratingToTeamPoolScore("blind"))
        expect(ratingToTeamPoolScore("blind")).toBeGreaterThan(ratingToTeamPoolScore("pocket"))
        expect(ratingToTeamPoolScore("pocket")).toBeGreaterThan(ratingToTeamPoolScore("situational"))
        expect(ratingToTeamPoolScore("situational")).toBeGreaterThan(ratingToTeamPoolScore("needs_practice"))
        expect(ratingToTeamPoolScore("needs_practice")).toBeGreaterThan(ratingToTeamPoolScore("avoid"))
    })
})

describe("calculateWeightedScore with teamPool", () => {
    const weightsWithPool = { ...DEFAULT_WEIGHTS, teamPool: 30 }

    it("comfort score is higher than avoid score for same recommendation", () => {
        const comfortScore = calculateWeightedScore(baseRec, weightsWithPool, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, weightsWithPool, 0.00)
        expect(comfortScore).toBeGreaterThan(avoidScore)
    })

    it("null (no rating) yields same score as neutral 0.5", () => {
        const nullScore = calculateWeightedScore(baseRec, weightsWithPool, null)
        const neutralScore = calculateWeightedScore(baseRec, weightsWithPool, 0.5)
        expect(nullScore).toBeCloseTo(neutralScore, 10)
    })

    it("avoid with high teamPool weight significantly reduces score vs comfort", () => {
        const highPoolWeights = { ...DEFAULT_WEIGHTS, teamPool: 80 }
        const comfortScore = calculateWeightedScore(baseRec, highPoolWeights, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, highPoolWeights, 0.00)
        // With weight=80 the gap should be notable
        expect(comfortScore - avoidScore).toBeGreaterThan(0.15)
    })

    it("teamPool weight=0 means pool score does not affect result", () => {
        const noPoolWeights = { ...DEFAULT_WEIGHTS, teamPool: 0 }
        const comfortScore = calculateWeightedScore(baseRec, noPoolWeights, 1.00)
        const avoidScore = calculateWeightedScore(baseRec, noPoolWeights, 0.00)
        expect(comfortScore).toBeCloseTo(avoidScore, 10)
    })

    it("result is always between 0 and 1", () => {
        for (const score of [0, 0.25, 0.5, 0.65, 0.9, 0.95, 1.0]) {
            const result = calculateWeightedScore(baseRec, weightsWithPool, score)
            expect(result).toBeGreaterThanOrEqual(0)
            expect(result).toBeLessThanOrEqual(1)
        }
    })
})
```

- [ ] **Step 7: Run the new tests to verify they pass**

```
npm test -- --reporter=verbose tests/teamChampionPool.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 8: Commit**

```
git add src/components/DraftHelper.tsx src/components/draft/ScoreWeightPanel.tsx src/i18n/de.ts src/i18n/en.ts tests/teamChampionPool.test.ts
git commit -m "feat: add ratingToTeamPoolScore and teamPool weight in scoring"
```

---

### Task 4: Load team notes in DraftHelper + wire teamPoolMap into recommendations

**Files:**
- Modify: `src/components/DraftHelper.tsx`

- [ ] **Step 1: Add `loadTeamNotes` import**

The file already imports from various sources. Add to the import section:
```ts
import { loadTeamNotes } from "../notes/teamNotesService"
```

- [ ] **Step 2: Add `teamNoteMap` state and loading effect inside the `DraftHelper` component**

After the `const [copyStatus, setCopyStatus] = useState("")` line (around line 861), add:

```ts
    const [teamNoteMap, setTeamNoteMap] = useState<Record<string, ChampionNote>>({})

    useEffect(() => {
        if (!activeTeam) {
            setTeamNoteMap({})
            return
        }
        void loadTeamNotes(activeTeam.id).then(setTeamNoteMap)
    }, [activeTeam])
```

- [ ] **Step 3: Add `teamPoolMap` memo**

After the `teamNoteMap` state declaration (and its useEffect), add:

```ts
    const teamPoolMap = useMemo(() => {
        const map = new Map<string, { score: number; rating: ChampionNoteRating }>()
        for (const [name, note] of Object.entries(teamNoteMap)) {
            if (note.rating) {
                map.set(normalizeChampionName(name), {
                    score: ratingToTeamPoolScore(note.rating),
                    rating: note.rating,
                })
            }
        }
        return map
    }, [teamNoteMap])
```

- [ ] **Step 4: Update `weightedRecommendations` function to accept and apply `teamPoolMap`**

Find the `weightedRecommendations` function (around line 195) and replace it:

```ts
function weightedRecommendations(
    matches: Match[],
    draftState: DraftState,
    weights: WeightConfig,
    teamPoolMap: Map<string, { score: number; rating: ChampionNoteRating }>,
): DraftRecommendation[] {
    return calculateDraftRecommendations(matches, draftState)
        .map((entry) => {
            const normalized = normalizeChampionName(entry.championName)
            const poolEntry = teamPoolMap.get(normalized)
            const teamPoolScore = poolEntry?.score ?? null
            const teamPoolRating = poolEntry?.rating ?? null
            return {
                ...entry,
                teamPoolScore,
                teamPoolRating,
                totalScore: calculateWeightedScore(entry, weights, teamPoolScore),
            }
        })
        .sort((a, b) => b.totalScore - a.totalScore)
}
```

- [ ] **Step 5: Update both `blueWeightedRecommendations` and `redWeightedRecommendations` useMemo calls**

Find the two `useMemo` calls (around lines 908 and 913) and update each to pass `teamPoolMap`:

```ts
    const blueWeightedRecommendations = useMemo(
        () => weightedRecommendations(recentPatchData.matches, blueRecommendationDraftState, weights, teamPoolMap),
        [recentPatchData.matches, blueRecommendationDraftState, weights, teamPoolMap],
    )

    const redWeightedRecommendations = useMemo(
        () => weightedRecommendations(recentPatchData.matches, redRecommendationDraftState, weights, teamPoolMap),
        [recentPatchData.matches, redRecommendationDraftState, weights, teamPoolMap],
    )
```

- [ ] **Step 6: Add `teamRatingsMap` memo for passing to ChampionPool UI**

After the `teamPoolMap` memo, add:

```ts
    const teamRatingsMap = useMemo(() => {
        const map = new Map<string, ChampionNoteRating>()
        for (const [name, entry] of teamPoolMap) {
            map.set(name, entry.rating)
        }
        return map
    }, [teamPoolMap])
```

- [ ] **Step 7: Run full test suite**

```
npm test
```

Expected: all existing tests pass (the DraftHelper changes are internal — no test directly exercises the useEffect note loading).

- [ ] **Step 8: Commit**

```
git add src/components/DraftHelper.tsx
git commit -m "feat: load team notes into DraftHelper and wire teamPoolMap into scoring"
```

---

### Task 5: Champion Pool rating dots

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/ChampionPortraitGrid.tsx`
- Modify: `src/components/draft/ChampionPoolPanel.tsx`
- Modify: `src/components/draft/DraftBoard.tsx`
- Modify: `src/components/DraftHelper.tsx`

- [ ] **Step 1: Add `position: relative` to `.champion-portrait-button` base style in `src/index.css`**

Find the `.champion-portrait-button` rule (around line 839):
```css
.champion-portrait-button {
  display: grid;
  place-items: center;
```

Add `position: relative;` inside the block so it becomes:
```css
.champion-portrait-button {
  position: relative;
  display: grid;
  place-items: center;
```

(The existing mobile-breakpoint override that already sets `position: relative` remains unchanged — no conflict.)

- [ ] **Step 2: Update `src/components/ChampionPortraitGrid.tsx`**

Add import at the top:
```ts
import type { ChampionNoteRating } from "../notes/types"
```

Add the `teamRatings` prop to the interface and destructure it:
```ts
interface ChampionPortraitGridProps {
    champions: string[]
    selectedChampions: Set<string>
    bannedChampions: Set<string>
    searchQuery: string
    onSearchQueryChange: (value: string) => void
    onSelectChampion: (championName: string) => void
    teamRatings?: Map<string, ChampionNoteRating>
}
```

Update the function signature:
```ts
export function ChampionPortraitGrid({
    champions,
    selectedChampions,
    bannedChampions,
    searchQuery,
    onSearchQueryChange,
    onSelectChampion,
    teamRatings,
}: ChampionPortraitGridProps) {
```

Add the rating-to-color helper inside the component body (before the return):
```ts
    function ratingDotColor(rating: ChampionNoteRating): string {
        switch (rating) {
            case "comfort":
            case "blind":
            case "pocket":
                return "var(--green)"
            case "situational":
                return "var(--accent)"
            case "needs_practice":
                return "var(--text-dim)"
            case "avoid":
                return "var(--red)"
        }
    }
```

In the champion button render, after the `<img>` tag and before the closing `</button>`, add the rating dot:
```tsx
                        {teamRatings?.has(normalized) && (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: "absolute",
                                    bottom: 2,
                                    right: 2,
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: ratingDotColor(teamRatings.get(normalized)!),
                                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                                    pointerEvents: "none",
                                }}
                            />
                        )}
```

- [ ] **Step 3: Update `src/components/draft/ChampionPoolPanel.tsx`**

Add import:
```ts
import type { ChampionNoteRating } from "../../notes/types"
```

Add `teamRatings` to the props interface:
```ts
interface ChampionPoolPanelProps {
    activeDraftSlot: ActiveDraftSlot | null
    championPool: string[]
    selectedChampionSet: Set<string>
    bannedChampionSet: Set<string>
    championSearch: string
    poolRoleFilter: Role | null
    onSetPoolRoleFilter: (role: Role | null) => void
    onChampionSearchChange: (query: string) => void
    onSelectChampion: (championName: string) => void
    teamRatings?: Map<string, ChampionNoteRating>
}
```

Update the function signature to destructure `teamRatings`:
```ts
export function ChampionPoolPanel({
    activeDraftSlot,
    championPool,
    selectedChampionSet,
    bannedChampionSet,
    championSearch,
    poolRoleFilter,
    onSetPoolRoleFilter,
    onChampionSearchChange,
    onSelectChampion,
    teamRatings,
}: ChampionPoolPanelProps) {
```

Pass `teamRatings` to `ChampionPortraitGrid`:
```tsx
            <ChampionPortraitGrid
                champions={championPool}
                selectedChampions={selectedChampionSet}
                bannedChampions={bannedChampionSet}
                searchQuery={championSearch}
                onSearchQueryChange={onChampionSearchChange}
                onSelectChampion={onSelectChampion}
                teamRatings={teamRatings}
            />
```

- [ ] **Step 4: Update `src/components/draft/DraftBoard.tsx`**

Add import:
```ts
import type { ChampionNoteRating } from "../../notes/types"
```

Add `teamRatings` to `DraftBoardProps`:
```ts
interface DraftBoardProps {
    // ... existing props ...
    teamRatings?: Map<string, ChampionNoteRating>
}
```

Destructure it in the function:
```ts
export function DraftBoard({
    // ... existing props ...
    teamRatings,
}: DraftBoardProps) {
```

Pass it to `ChampionPoolPanel`:
```tsx
            <ChampionPoolPanel
                activeDraftSlot={activeDraftSlot}
                championPool={championPool}
                selectedChampionSet={selectedChampionSet}
                bannedChampionSet={bannedChampionSet}
                championSearch={championSearch}
                poolRoleFilter={poolRoleFilter}
                onSetPoolRoleFilter={onSetPoolRoleFilter}
                onChampionSearchChange={onChampionSearchChange}
                onSelectChampion={onSelectChampion}
                teamRatings={teamRatings}
            />
```

- [ ] **Step 5: Pass `teamRatingsMap` from DraftHelper to DraftBoard**

In `src/components/DraftHelper.tsx`, find the `<DraftBoard` opening tag (around line 1739) and add `teamRatings={teamRatingsMap}` as a new prop — do not change any existing props:

```tsx
            <DraftBoard
                bluePickSlots={bluePickSlots}
                blueBans={blueBans}
                redPickSlots={redPickSlots}
                redBans={redBans}
                activeDraftSlot={activeDraftSlot}
                flexChampionCatalog={flexChampionCatalog}
                championPool={championPool}
                selectedChampionSet={selectedChampionSet}
                bannedChampionSet={bannedChampionSet}
                championSearch={championSearch}
                poolRoleFilter={poolRoleFilter}
                teamRatings={teamRatingsMap}
                onActivateBanSlot={(visualSide, index) => {
                    setActiveDraftSlot({ type: "ban", visualSide, index })
                    setRecommendationSide(visualSide)
                }}
                onActivatePickSlot={(visualSide, index) => {
                    setActiveDraftSlot({ type: "pick", visualSide, index })
                    setRecommendationSide(visualSide)
                }}
                onClearBan={clearBan}
                onClearPick={clearPick}
                onUpdatePickRole={updatePickRole}
                onSetPoolRoleFilter={setPoolRoleFilter}
                onChampionSearchChange={setChampionSearch}
                onSelectChampion={handleChampionGridSelect}
            />
```

- [ ] **Step 6: Run tests**

```
npm test
```

Expected: all tests pass (no test covers ChampionPortraitGrid rendering).

- [ ] **Step 7: Commit**

```
git add src/index.css src/components/ChampionPortraitGrid.tsx src/components/draft/ChampionPoolPanel.tsx src/components/draft/DraftBoard.tsx src/components/DraftHelper.tsx
git commit -m "feat: show team pool rating dots on champion portraits"
```

---

### Task 6: Recommendation button badges + Best Picks Pool column

**Files:**
- Modify: `src/components/DraftHelper.tsx`

- [ ] **Step 1: Add `ratingBadge` helper function in `src/components/DraftHelper.tsx`**

After `ratingToTeamPoolScore`, add:

```ts
function ratingBadge(rating: ChampionNoteRating): string {
    switch (rating) {
        case "comfort": return "C"
        case "blind": return "B"
        case "pocket": return "P"
        case "situational": return "S"
        case "needs_practice": return "!"
        case "avoid": return "X"
    }
}
```

- [ ] **Step 2: Update `renderRecommendationButton` to show badge**

Find `renderRecommendationButton` and update the inner `<span>` block. Find:
```tsx
                <span>
                    <strong>
                        {index + 1}. {entry.championName}
                    </strong>
                    <span className="muted" style={{ display: "block" }}>
```

Replace with:
```tsx
                <span>
                    <strong>
                        {index + 1}. {entry.championName}
                    </strong>
                    {entry.teamPoolRating && (
                        <span
                            title={t(`cn_rating_${entry.teamPoolRating}` as TranslationKey)}
                            style={{
                                marginLeft: "0.4rem",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: "var(--surface2)",
                                color: entry.teamPoolRating === "avoid"
                                    ? "var(--red)"
                                    : entry.teamPoolRating === "needs_practice"
                                        ? "var(--text-dim)"
                                        : entry.teamPoolRating === "situational"
                                            ? "var(--accent)"
                                            : "var(--green)",
                            }}
                        >
                            {ratingBadge(entry.teamPoolRating)}
                        </span>
                    )}
                    <span className="muted" style={{ display: "block" }}>
```

- [ ] **Step 3: Add "Pool" column header to the Best Picks table**

Find the `<thead>` row in the Best Picks table section and add the column:
```tsx
                            <tr>
                                <th>Champion</th>
                                <th>Rolle</th>
                                <th>Total</th>
                                <th>Priority</th>
                                <th>Role</th>
                                <th>Synergy</th>
                                <th>Matchup</th>
                                <th>Picks</th>
                                <th>Winrate</th>
                                <th>Sample</th>
                                <th>Pool</th>
                                <th>{t("dh_tableReasons")}</th>
                            </tr>
```

- [ ] **Step 4: Add Pool column cell to each table row**

Find the table row render in the `<tbody>` and add the cell after the `<td className="muted">{entry.sampleSizeLabel}</td>` cell:
```tsx
                                <td>{entry.teamPoolRating ? ratingBadge(entry.teamPoolRating) : "—"}</td>
```

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src/components/DraftHelper.tsx
git commit -m "feat: show team pool rating badge in recommendations and Best Picks table"
```

---

### Task 7: Final test run + build

- [ ] **Step 1: Run the complete test suite**

```
npm test
```

Expected: all tests pass with 0 failures.

- [ ] **Step 2: Run the TypeScript build**

```
npm run build
```

Expected: build succeeds with 0 errors.

- [ ] **Step 3: Verify no unintended regressions**

Check that:
- Existing `WeightConfig` presets still work (balanced, counterpick, synergy, meta, safe)
- `ChampionNoteRating` values `comfort | blind | pocket | situational | needs_practice | avoid` are all valid
- `DraftRecommendation.teamPoolScore` and `teamPoolRating` are null when no team is active
- No existing test file was deleted

---

## SQL / Schema Note

`champion_notes.rating` is `text null` with **no CHECK constraint** in `supabase/schema.sql`. No schema migration is required for `needs_practice`. You do NOT need to re-run `schema.sql` in Supabase.
