import type { Match, SynergyStats } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

export function calculateSynergyStats(matches: Match[]): SynergyStats[] {
  const pairMap = new Map<string, { gamesTogether: number; winsTogether: number }>()

  for (const match of matches) {
    // group picks by team
    const teams = new Map<string, typeof match.picks>()
    for (const pick of match.picks) {
      if (!teams.has(pick.team)) teams.set(pick.team, [])
      teams.get(pick.team)!.push(pick)
    }

    for (const [, teamPicks] of teams) {
      const names = teamPicks.map((p) => p.championName)
      const won = teamPicks[0]?.won ?? false

      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const key = [names[i], names[j]].sort().join("|")
          if (!pairMap.has(key)) pairMap.set(key, { gamesTogether: 0, winsTogether: 0 })
          const s = pairMap.get(key)!
          s.gamesTogether++
          if (won) s.winsTogether++
        }
      }
    }
  }

  const results: SynergyStats[] = []

  for (const [key, s] of pairMap) {
    const [championA, championB] = key.split("|")
    const winRateTogether = s.gamesTogether > 0 ? s.winsTogether / s.gamesTogether : 0
    const synergyScore = winRateTogether * Math.log(1 + s.gamesTogether)

    results.push({
      championA,
      championB,
      gamesTogether: s.gamesTogether,
      winsTogether: s.winsTogether,
      winRateTogether,
      synergyScore,
      sampleSizeLabel: sampleSizeLabel(s.gamesTogether),
    })
  }

  return results
}
