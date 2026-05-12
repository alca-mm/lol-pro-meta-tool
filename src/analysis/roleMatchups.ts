import type { Match, Role, RoleMatchupStats } from "../domain/types"
import { sampleSizeLabel } from "./sampleSize"

export function calculateRoleMatchups(matches: Match[]): RoleMatchupStats[] {
  const pairMap = new Map<string, {
    role: Role
    gamesAgainst: number
    winsForA: number
  }>()

  for (const match of matches) {
    const blueWon = match.winningTeam === match.blueTeam

    // Index red picks by role for fast lookup
    const redByRole = new Map<Role, typeof match.picks[number][]>()
    for (const pick of match.picks) {
      if (pick.side === "red") {
        if (!redByRole.has(pick.role)) redByRole.set(pick.role, [])
        redByRole.get(pick.role)!.push(pick)
      }
    }

    for (const bluePick of match.picks) {
      if (bluePick.side !== "blue") continue
      const opponents = redByRole.get(bluePick.role) ?? []

      for (const redPick of opponents) {
        const [nameA, nameB] = [bluePick.championName, redPick.championName].sort()
        const aIsBlue = bluePick.championName === nameA
        const winsForA = aIsBlue ? blueWon : !blueWon

        const k = `${bluePick.role}|${nameA}|${nameB}`
        if (!pairMap.has(k)) {
          pairMap.set(k, { role: bluePick.role, gamesAgainst: 0, winsForA: 0 })
        }
        const s = pairMap.get(k)!
        s.gamesAgainst++
        if (winsForA) s.winsForA++
      }
    }
  }

  const results: RoleMatchupStats[] = []
  for (const [key, s] of pairMap) {
    const parts = key.split("|")
    const championA = parts[1]
    const championB = parts[2]
    const winRateForA = s.gamesAgainst > 0 ? s.winsForA / s.gamesAgainst : 0
    const matchupScore = (winRateForA - 0.5) * Math.log(1 + s.gamesAgainst)

    results.push({
      role: s.role,
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
