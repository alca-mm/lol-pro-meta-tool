import type { Match, PatchComparisonEntry } from "../domain/types"
import { calculateChampionStats } from "./championStats"
import { applyFilters } from "./filters"

export function comparePatchs(
  matches: Match[],
  patch1: string,
  patch2: string
): PatchComparisonEntry[] {
  const noFilter = { patch: null, region: null, tournament: null, role: null, minPicks: 0 }
  const m1 = applyFilters(matches, { ...noFilter, patch: patch1 })
  const m2 = applyFilters(matches, { ...noFilter, patch: patch2 })

  const stats1 = new Map(calculateChampionStats(m1).map((s) => [s.championName, s]))
  const stats2 = new Map(calculateChampionStats(m2).map((s) => [s.championName, s]))

  const allChamps = new Set([...stats1.keys(), ...stats2.keys()])
  const zero = { presence: 0, pickRate: 0, banRate: 0 }

  const results: PatchComparisonEntry[] = []

  for (const name of allChamps) {
    const s1 = stats1.get(name) ?? zero
    const s2 = stats2.get(name) ?? zero

    results.push({
      championName: name,
      presencePatch1: s1.presence,
      presencePatch2: s2.presence,
      presenceDelta: s2.presence - s1.presence,
      pickRatePatch1: s1.pickRate,
      pickRatePatch2: s2.pickRate,
      pickRateDelta: s2.pickRate - s1.pickRate,
      banRatePatch1: s1.banRate,
      banRatePatch2: s2.banRate,
      banRateDelta: s2.banRate - s1.banRate,
    })
  }

  return results.sort((a, b) => Math.abs(b.presenceDelta) - Math.abs(a.presenceDelta))
}

export function getAvailablePatches(matches: Match[]): string[] {
  return [...new Set(matches.map((m) => m.patch))].sort()
}
