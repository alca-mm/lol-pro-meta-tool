import type { Match, ChampionStats, Role } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

function draftPriority(
  presence: number,
  banRate: number,
  pickRate: number,
  winRate: number | null,
  picks: number
): number {
  const winRateComponent = picks >= 5 && winRate !== null ? winRate : 0.5
  return presence * 0.5 + banRate * 0.2 + pickRate * 0.2 + winRateComponent * 0.1
}

export function calculateChampionStats(matches: Match[]): ChampionStats[] {
  const totalGames = matches.length
  const statsMap = new Map<string, {
    picks: number
    bans: number
    wins: number
    roleCount: Record<Role, number>
  }>()

  function ensure(name: string) {
    if (!statsMap.has(name)) {
      statsMap.set(name, {
        picks: 0,
        bans: 0,
        wins: 0,
        roleCount: { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 },
      })
    }
    return statsMap.get(name)!
  }

  for (const match of matches) {
    for (const pick of match.picks) {
      const s = ensure(pick.championName)
      s.picks++
      s.roleCount[pick.role]++
      if (pick.won) s.wins++
    }
    for (const ban of match.bans) {
      ensure(ban.championName).bans++
    }
  }

  const results: ChampionStats[] = []

  for (const [championName, s] of statsMap) {
    const picks = s.picks
    const bans = s.bans
    const wins = s.wins
    const losses = picks - wins

    const pickRate = totalGames > 0 ? picks / totalGames : 0
    const banRate = totalGames > 0 ? bans / totalGames : 0
    const presence = totalGames > 0 ? (picks + bans) / totalGames : 0
    const winRate = picks > 0 ? wins / picks : null

    const roleDistribution: Record<Role, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 }
    if (picks > 0) {
      for (const role of ROLES) {
        roleDistribution[role] = s.roleCount[role] / picks
      }
    }

    results.push({
      championName,
      games: totalGames,
      picks,
      bans,
      wins,
      losses,
      pickRate,
      banRate,
      presence,
      winRate,
      roleDistribution,
      sampleSizeLabel: sampleSizeLabel(picks),
      draftPriorityScore: draftPriority(presence, banRate, pickRate, winRate, picks),
    })
  }

  return results
}

export function primaryRole(stats: ChampionStats): Role | null {
  if (stats.picks === 0) return null
  return ROLES.reduce((best, role) =>
    stats.roleDistribution[role] > stats.roleDistribution[best] ? role : best
  )
}
