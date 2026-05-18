# Team Champion Pool — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

## Overview

Extends the existing Champion Notes rating system into a full Team Champion Pool that feeds into Draft Recommendations. No new Supabase table — `champion_notes.rating` is the single source of truth.

## Rating Values

```ts
export type ChampionNoteRating =
  | "comfort"
  | "blind"
  | "pocket"
  | "situational"
  | "needs_practice"   // NEW
  | "avoid"
```

`TeamChampionRating` is a re-export alias of `ChampionNoteRating`.

**Score mapping (0–1):**

| Rating         | Score | Badge |
|----------------|-------|-------|
| comfort        | 1.00  | C     |
| blind          | 0.95  | B     |
| pocket         | 0.90  | P     |
| situational    | 0.65  | S     |
| needs_practice | 0.25  | !     |
| avoid          | 0.00  | X     |
| null (none)    | 0.50  | —     |

## Architecture: Approach A

Team pool scoring lives in `DraftHelper.tsx`, not in the pure `draftHelper.ts` analysis module.

```
champion_notes (Supabase / localStorage)
    ↓ loadTeamNotes / loadNotes
DraftHelper.tsx (useEffect on activeTeam)
    → teamPoolMap: Map<normalizedName, { score, rating }>
    ↓
weightedRecommendations(matches, draftState, weights, teamPoolMap)
    ↓ per recommendation
    → entry.teamPoolScore  (number | null)
    → entry.teamPoolRating (ChampionNoteRating | null)
    → totalScore = calculateWeightedScore(entry, weights, teamPoolScore)
```

When no team is active or no rating exists: `teamPoolScore = null` → treated as neutral 0.50.

## Weight Configuration

`WeightKey` gains `"teamPool"`.

**DEFAULT_WEIGHTS:**

| Key           | Value |
|---------------|-------|
| draftPriority | 40    |
| roleStats     | 20    |
| synergy       | 15    |
| matchup       | 20    |
| winRate       | 5     |
| sampleSize    | 0     |
| teamPool      | 30    |

Total = 130 (normalized via `totalWeight` division — no breaking change).

**Presets:**

| Preset      | teamPool |
|-------------|----------|
| balanced    | 30       |
| counterpick | 15       |
| synergy     | 20       |
| meta        | 10       |
| safe        | 25       |

## Files Changed

### Types
- `src/notes/types.ts` — add `needs_practice`, export `TeamChampionRating`
- `src/draft/types.ts` — add `teamPool` to `WeightKey`; add `teamPoolScore: number | null`, `teamPoolRating: ChampionNoteRating | null` to `DraftRecommendation`

### Analysis
- `src/analysis/draftHelper.ts` — `calculateDraftRecommendations` initializes `teamPoolScore: null, teamPoolRating: null`

### Constants
- `src/draft/constants.ts` — add `teamPool` to `DEFAULT_WEIGHTS` and all `WEIGHT_PRESETS`

### DraftHelper (UI layer — scoring)
- `src/components/DraftHelper.tsx`:
  - New exported `ratingToTeamPoolScore(rating: ChampionNoteRating | null): number` pure function
  - `useEffect` loads notes when `activeTeam` changes, builds `teamPoolMap`
  - `calculateWeightedScore` gains third param `teamPoolScore: number | null`
  - `weightedRecommendations` gains `teamPoolMap` param, sets `teamPoolScore/teamPoolRating` on each entry
  - `renderRecommendationButton` shows rating badge pill when `teamPoolRating !== null`
  - Best Picks table gets a "Pool" column

### UI Components
- `src/components/draft/ScoreWeightPanel.tsx` — add `teamPool` to `WEIGHT_LABELS`
- `src/components/ChampionPortraitGrid.tsx` — optional `teamRatings?: Map<string, ChampionNoteRating>` prop; colored dot on rated champions
- `src/components/draft/ChampionPoolPanel.tsx` — pass `teamRatings` down
- `src/components/draft/ChampionNotesPanel.tsx` — add `needs_practice` to `RATINGS` array

### i18n
- `src/i18n/de.ts` — `cn_rating_needs_practice`, `dh_wLabel_teamPool`
- `src/i18n/en.ts` — same keys

### Tests
- `tests/championNotes.test.ts` — add `needs_practice` to `validRatings`
- `tests/draftRecommendations.test.ts` — assert `teamPoolScore: null`, `teamPoolRating: null`
- `tests/teamChampionPool.test.ts` (new) — score mapping, `calculateWeightedScore` with teamPool

## SQL / Schema

No new table, no new RLS policy. `champion_notes.rating` is `text null` with no CHECK constraint — no schema migration required.
