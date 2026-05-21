import type { Match, FilterState } from "../domain/types"

export function applyFilters(matches: Match[], filters: FilterState): Match[] {
  return matches.filter((m) => {
    if (filters.patches.length > 0 && !filters.patches.includes(m.patch)) return false
    if (filters.regions.length > 0 && !filters.regions.includes(m.region)) return false
    if (filters.tournament !== null && m.tournament !== filters.tournament) return false
    return true
  })
}
