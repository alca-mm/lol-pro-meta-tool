import type { Match, Role, RoleChampionStats } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

export function calculateRoleStats(matches: Match[]): RoleChampionStats[] {
  const key = (name: string, role: Role) => `${name}|${role}`
  const statsMap = new Map<string, { picks: number; wins: number; role: Role; championName: string }>()

  for (const match of matches) {
    for (const pick of match.picks) {
      const k = key(pick.championName, pick.role)
      if (!statsMap.has(k)) {
        statsMap.set(k, { picks: 0, wins: 0, role: pick.role, championName: pick.championName })
      }
      const s = statsMap.get(k)!
      s.picks++
      if (pick.won) s.wins++
    }
  }

  const results: RoleChampionStats[] = []
  for (const s of statsMap.values()) {
    const winRate = s.picks > 0 ? s.wins / s.picks : null
    results.push({
      championName: s.championName,
      role: s.role,
      picks: s.picks,
      wins: s.wins,
      losses: s.picks - s.wins,
      winRate,
      sampleSizeLabel: sampleSizeLabel(s.picks),
    })
  }

  return results
}
