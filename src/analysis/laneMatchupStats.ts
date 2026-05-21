import type { Match, LaneMatchupStat, Role } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

export function calculateLaneMatchupStats(matches: Match[]): LaneMatchupStat[] {
  const pairMap = new Map<string, { games: number; winsForA: number; lane: Role }>()

  for (const match of matches) {
    const blueWon = match.winningTeam === match.blueTeam
    const bluePicks = match.picks.filter((p) => p.side === "blue")
    const redPicks  = match.picks.filter((p) => p.side === "red")

    for (const bluePick of bluePicks) {
      const redPick = redPicks.find((r) => r.role === bluePick.role)
      if (!redPick) continue

      const [nameA, nameB] = [bluePick.championName, redPick.championName].sort()
      const aIsBlue = bluePick.championName === nameA
      const winsForA = aIsBlue ? blueWon : !blueWon

      const key = `${nameA}|${nameB}|${bluePick.role}`
      if (!pairMap.has(key)) pairMap.set(key, { games: 0, winsForA: 0, lane: bluePick.role })
      const s = pairMap.get(key)!
      s.games++
      if (winsForA) s.winsForA++
    }
  }

  const results: LaneMatchupStat[] = []
  for (const [key, s] of pairMap) {
    const [championA, championB] = key.split("|")
    const winRateForA = s.games > 0 ? s.winsForA / s.games : 0
    const matchupScore = (winRateForA - 0.5) * Math.log(1 + s.games)

    results.push({
      championA,
      championB,
      lane: s.lane,
      gamesAgainst: s.games,
      winsForA: s.winsForA,
      lossesForA: s.games - s.winsForA,
      winRateForA,
      matchupScore,
      sampleSizeLabel: sampleSizeLabel(s.games),
    })
  }

  return results
}
