# Design Spec: LoL Pro Meta Analysis Tool — MVP

**Datum:** 2026-05-12  
**Status:** Bestätigt, bereit zur Implementierung  
**Scaffolding:** Option C — `npm create vite@latest` + sofortiges Bereinigen von Boilerplate

---

## 1. Projektziel

Internes Werkzeug für Draft-Vorbereitung auf Basis von Pro-Play-Matchdaten.  
Berechnet und zeigt: Pickrate, Banrate, Presence, Winrate, Rollenverteilung, Champion-Synergien, Champion-Matchups.

**Abgrenzung:**
- Ausschließlich Pro-Play-Daten — keine SoloQ-, FlexQ- oder normalen Ranked-Daten.
- Keine externen APIs, kein Backend, keine Datenbank, kein Web-Scraping.
- Demo-Daten sind eindeutig als Sample-/Fiktionsdaten gekennzeichnet.

---

## 2. Tech-Stack

| Bereich | Technologie |
|---|---|
| Build | Vite |
| UI | React + TypeScript |
| Tests | Vitest |
| Styling | Reines CSS (`index.css`) |
| Daten | Lokale JSON-Datei (`sampleMatches.json`) |
| State | React Context (Filter), useState (selectedChampion) |

Kein Tailwind, keine UI-Library, kein Redux/Zustand, kein Router.

---

## 3. Projektstruktur

```
src/
  analysis/
    championStats.ts
    synergyStats.ts
    matchupStats.ts
    sampleSize.ts
    filters.ts

  components/
    Dashboard.tsx
    ChampionStatsTable.tsx
    ChampionDetail.tsx
    SynergyTable.tsx
    MatchupTable.tsx
    Filters.tsx

  context/
    FilterContext.tsx

  data/
    sampleMatches.json

  domain/
    types.ts

  import/
    parseMatches.ts
    validateMatches.ts

  App.tsx
  main.tsx
  index.css

tests/
  championStats.test.ts
  synergyStats.test.ts
  matchupStats.test.ts
  filters.test.ts

docs/
  superpowers/specs/
    2026-05-12-lol-meta-tool-design.md

README.md
```

---

## 4. Datenmodell (`src/domain/types.ts`)

```typescript
type Side = "blue" | "red"
type Role = "top" | "jungle" | "mid" | "bot" | "support"

interface ChampionPick {
  championName: string
  team: string
  side: Side
  role: Role
  playerName?: string
  won: boolean
}

interface ChampionBan {
  championName: string
  team: string
  side: Side
  banOrder?: number
}

interface Match {
  matchId: string
  date: string          // ISO 8601: "2024-03-15"
  tournament: string
  patch: string         // z.B. "14.4"
  region: string        // z.B. "LEC", "LCK", "LCS"
  blueTeam: string
  redTeam: string
  winningTeam: string   // muss blueTeam oder redTeam entsprechen
  picks: ChampionPick[] // idealerweise 10 Einträge (5 pro Team)
  bans: ChampionBan[]
}

interface ChampionStats {
  championName: string
  games: number
  picks: number
  bans: number
  wins: number
  losses: number
  pickRate: number              // 0–1
  banRate: number               // 0–1
  presence: number              // 0–1
  winRate: number | null        // null wenn picks = 0
  roleDistribution: Record<Role, number>  // Anteile 0–1, Summe = 1
  sampleSizeLabel: string
}

interface SynergyStats {
  championA: string
  championB: string
  gamesTogether: number
  winsTogether: number
  winRateTogether: number       // 0–1
  synergyScore: number
  sampleSizeLabel: string
}

interface MatchupStats {
  championA: string             // lexikografisch kleinerer Name
  championB: string
  gamesAgainst: number
  winsForA: number              // Siege aus Sicht von championA
  lossesForA: number
  winRateForA: number           // 0–1, Perspektive championA
  matchupScore: number
  sampleSizeLabel: string
}

interface FilterState {
  patch: string | null
  region: string | null
  tournament: string | null
  role: Role | null
  minPicks: number              // Standard: 1
}
```

**Invarianten:**
- `winningTeam` muss `blueTeam` oder `redTeam` entsprechen (Validierung).
- `role` nur aus dem Union-Typ `Role`.
- `side` nur `"blue"` oder `"red"`.
- Prozentwerte intern immer `0–1`, in der UI formatiert als Prozent.
- `winRate: null` bedeutet "nie gepickt", wird in der UI als `—` angezeigt.

---

## 5. Datenfluss

```
sampleMatches.json
      │
      ▼
parseMatches.ts → validateMatches.ts
      │  (fehlerhafte Matches werden mit console.warn entfernt, App stürzt nicht ab)
      ▼
Match[]  ←── geprüfte Matchdaten
      │
      ├──► calculateChampionStats(matches)  → ChampionStats[]
      ├──► calculateSynergyStats(matches)   → SynergyStats[]
      └──► calculateMatchupStats(matches)   → MatchupStats[]
                    │
             alle pure functions,
             React-unabhängig, voll testbar
                    │
                    ▼
         FilterContext (UI-State)
         { patch, region, tournament, role, minPicks }
                    │
                    ▼
         App.tsx
         ├── selectedChampion: string | null  (useState)
         ├── <Filters />         (liest/schreibt FilterContext)
         ├── <Dashboard />
         ├── <ChampionStatsTable />
         ├── <ChampionDetail />  (nur wenn selectedChampion gesetzt)
         ├── <SynergyTable />
         └── <MatchupTable />
```

**Filterreihenfolge:**
1. `applyFilters(matches, filters)` → filtert Match[] nach patch/region/tournament
2. Statistikberechnung auf gefiltertem Match[]
3. role- und minPicks-Filter auf ChampionStats[] nach Berechnung

---

## 6. Statistiklogik

### 6.1 Champion Stats

```
totalGames = matches.length
picks      = Anzahl ChampionPick-Einträge für diesen Champion
bans       = Anzahl ChampionBan-Einträge für diesen Champion
wins       = picks.filter(p => p.won).length

pickRate   = picks / totalGames        (0 wenn totalGames = 0)
banRate    = bans / totalGames         (0 wenn totalGames = 0)
presence   = (picks + bans) / totalGames
winRate    = wins / picks              (null wenn picks = 0)
```

### 6.2 Synergy Score

Formel: `score = winRateTogether × log(1 + gamesTogether)`

- Belohnt höhere Winrate
- Bestraft kleine Samples logarithmisch
- Deterministisch, keine Zufallskomponente
- Kanonischer Paar-Key: `[a, b].sort().join('|')` → keine Duplikate

### 6.3 Matchup Score

Formel: `score = (winRateForA - 0.5) × log(1 + gamesAgainst)`

- Positiv = championA hat Vorteil
- Negativ = championA hat Nachteil
- championA = lexikografisch kleinerer Championname (konsistente Sortierung)
- `winsForA` wird pro Match geprüft: auf welcher Seite spielte championA? Hat dessen Team gewonnen?

### 6.4 Sample Size Labels

```
n < 5   → "sehr geringe Aussagekraft"
n < 10  → "geringe Aussagekraft"
n < 25  → "brauchbarer Trend"
n >= 25 → "stabilerer Trend"
```

---

## 7. UI-Struktur

```
┌────────────────────────────────────────────┐
│  Header: "LoL Pro Meta Tool"               │
│  [⚠ SAMPLE DATA — keine echten Daten]     │
├──────────────┬─────────────────────────────┤
│  Filters     │  Dashboard                  │
│  (sidebar)   │  ───────────────────────    │
│              │  ChampionStatsTable         │
│  Patch ▼     │  [ChampionDetail]           │
│  Region ▼    │  SynergyTable               │
│  Turnier ▼   │  MatchupTable               │
│  Rolle ▼     │                             │
│  Min Picks ─ │                             │
└──────────────┴─────────────────────────────┘
```

**Responsiveness:**
- Sidebar auf kleinen Screens über dem Inhalt (Stack-Layout)
- Tabellen horizontal scrollbar

**Accessibility-Basis:**
- Echte `<button>`-Elemente für Sortier-Controls
- `<label>`-Elemente für alle Formfelder
- Aktive Sortierung visuell markiert
- Ausgewählte Tabellenzeile visuell hervorgehoben
- Ausreichende Farbkontraste

**Fehlerbehandlung in der UI:**
- `winRate: null` → `—`
- Leere Tabellen → verständlicher Empty State
- Alle Matches ungültig → Hinweis in der UI
- Kein Absturz bei leerer/unvollständiger/teilweise ungültiger `sampleMatches.json`

---

## 8. Validierung (`src/import/validateMatches.ts`)

Prüft pro Match:
- `matchId`, `date`, `tournament`, `patch`, `region` vorhanden
- `winningTeam` ∈ {`blueTeam`, `redTeam`}
- `picks[].role` ∈ Role-Union
- `picks[].side` ∈ Side-Union
- `bans[].side` ∈ Side-Union

Fehlerhafte Matches: `console.warn` mit Match-ID und Fehlergrund, Match wird aus dem Array entfernt. Keine sensiblen Daten in Logs.

---

## 9. Tests

| Datei | Kernfälle |
|---|---|
| `championStats.test.ts` | Pickrate/Banrate/Presence/Winrate korrekt; winRate=null bei picks=0; keine Division durch 0 |
| `synergyStats.test.ts` | Paare im selben Team; Spiele/Siege korrekt; Score deterministisch; kleine Samples markiert |
| `matchupStats.test.ts` | Gegnerische Paare; canonische Sortierung; winsForA korrekt (egal welche Seite); kleine Samples markiert |
| `filters.test.ts` | Patch-, Region-, Turnier-, minPicks-Filter |

- Alle Tests mit Vitest, Inline-Fixtures (2–5 Matches), kein Import von `sampleMatches.json`
- Nur pure functions getestet — kein React, kein jsdom nötig
- `vitest run` (kein Watch-Modus)

---

## 10. Build & Scripts

```json
{
  "scripts": {
    "dev":     "vite",
    "build":   "tsc && vite build",
    "preview": "vite preview",
    "test":    "vitest run"
  }
}
```

---

## 11. Sample-Daten (`src/data/sampleMatches.json`)

- Ca. 20 fiktive Matches
- 3 Patches, 2 Regionen, 2 Turniere
- 10 Picks pro Match (5 pro Team), vollständig
- Bans optional, aber wo vorhanden valide
- Datei beginnt mit Kommentar-Feld `"_notice"` oder ähnlichem, das auf Demo-Natur hinweist
- Keine echten Spielerdaten, keine echten Turniernamen ohne Erlaubnis

---

## 12. Bekannte Einschränkungen (MVP)

- Role-Filter in der Champion-Tabelle filtert nur ChampionStats nach Haupt-Rolle (häufigste Rolle). Champions, die eine Rolle manchmal gespielt haben, können herausfallen.
- Keine echten Pro-Play-Daten — nur Demo-/Sample-Daten.
- Keine Persistenz: Filter-State wird beim Reload zurückgesetzt.
- Kein Import-UI für eigene JSON-Dateien (nächster sinnvoller Schritt).
- Matchup-Berechnung berücksichtigt keine Rollen — nur reine Champion-vs-Champion-Stats.

---

## 13. Nächste sinnvolle Schritte (post-MVP)

1. Import-UI: eigene JSON-Datei per Drag & Drop laden
2. Persistenz: Filter-State in localStorage
3. Rollen-Kontext für Matchups (nur Matchups in derselben Rolle)
4. Patch-over-Patch-Vergleich
5. Export-Funktion (CSV, PDF)
