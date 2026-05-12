export type Side = "blue" | "red"
export type Role = "top" | "jungle" | "mid" | "bot" | "support"

export interface ChampionPick {
  championName: string
  team: string
  side: Side
  role: Role
  playerName?: string
  won: boolean
}

export interface ChampionBan {
  championName: string
  team: string
  side: Side
  banOrder?: number
}

export interface Match {
  matchId: string
  date: string
  tournament: string
  patch: string
  region: string
  blueTeam: string
  redTeam: string
  winningTeam: string
  picks: ChampionPick[]
  bans: ChampionBan[]
}

export interface ChampionStats {
  championName: string
  games: number
  picks: number
  bans: number
  wins: number
  losses: number
  pickRate: number
  banRate: number
  presence: number
  winRate: number | null
  roleDistribution: Record<Role, number>
  sampleSizeLabel: string
  draftPriorityScore: number
}

export interface SynergyStats {
  championA: string
  championB: string
  gamesTogether: number
  winsTogether: number
  winRateTogether: number
  synergyScore: number
  sampleSizeLabel: string
}

export interface MatchupStats {
  championA: string
  championB: string
  gamesAgainst: number
  winsForA: number
  lossesForA: number
  winRateForA: number
  matchupScore: number
  sampleSizeLabel: string
}

export interface RoleChampionStats {
  championName: string
  role: Role
  picks: number
  wins: number
  losses: number
  winRate: number | null
  sampleSizeLabel: string
}

export interface RoleMatchupStats {
  role: Role
  championA: string
  championB: string
  gamesAgainst: number
  winsForA: number
  lossesForA: number
  winRateForA: number
  matchupScore: number
  sampleSizeLabel: string
}

export interface PatchComparisonEntry {
  championName: string
  presencePatch1: number
  presencePatch2: number
  presenceDelta: number
  pickRatePatch1: number
  pickRatePatch2: number
  pickRateDelta: number
  banRatePatch1: number
  banRatePatch2: number
  banRateDelta: number
}

export interface FilterState {
  patch: string | null
  region: string | null
  tournament: string | null
  role: Role | null
  minPicks: number
}

export interface SyncReport {
  syncStartedAt: string
  syncFinishedAt: string
  sourcesProcessed: number
  sourcesSucceeded: number
  sourcesFailed: number
  downloadedFiles: string[]
  rowsRead: number
  gamesDetected: number
  matchesImported: number
  matchesSkipped: number
  warnings: string[]
  errors: string[]
  detectedPatches: string[]
  detectedLeagues: string[]
  detectedTournaments: string[]
  dateRange: { from: string; to: string } | null
  bansDetected: boolean
  outputFile: string
}
