import type { Match, MatchupStats } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

export function calculateMatchupStats(matches: Match[]): MatchupStats[] {
  const pairMap = new Map<string, { gamesAgainst: number; winsForA: number }>()

  for (const match of matches) {
    // split picks by side
    const blue = match.picks.filter((p) => p.side === "blue")
    const red = match.picks.filter((p) => p.side === "red")

    const blueWon = match.winningTeam === match.blueTeam

    for (const b of blue) {
      for (const r of red) {
        const [nameA, nameB] = [b.championName, r.championName].sort()
        // determine if nameA was on blue or red side
        const aIsBlue = b.championName === nameA
        const winsForA = aIsBlue ? blueWon : !blueWon

        const key = `${nameA}|${nameB}`
        if (!pairMap.has(key)) pairMap.set(key, { gamesAgainst: 0, winsForA: 0 })
        const s = pairMap.get(key)!
        s.gamesAgainst++
        if (winsForA) s.winsForA++
      }
    }
  }

  const results: MatchupStats[] = []

  for (const [key, s] of pairMap) {
    const [championA, championB] = key.split("|")
    const winRateForA = s.gamesAgainst > 0 ? s.winsForA / s.gamesAgainst : 0
    const matchupScore = (winRateForA - 0.5) * Math.log(1 + s.gamesAgainst)

    results.push({
      championA,
      championB,
      gamesAgainst: s.gamesAgainst,
      winsForA: s.winsForA,
      lossesForA: s.gamesAgainst - s.winsForA,
      winRateForA,
      matchupScore,
      sampleSizeLabel: sampleSizeLabel(s.gamesAgainst),
    })
  }

  return results
}
