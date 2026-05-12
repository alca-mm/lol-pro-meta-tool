import type { Match, FilterState } from "../domain/types"

export function applyFilters(matches: Match[], filters: FilterState): Match[] {
  return matches.filter((m) => {
    if (filters.patch !== null && m.patch !== filters.patch) return false
    if (filters.region !== null && m.region !== filters.region) return false
    if (filters.tournament !== null && m.tournament !== filters.tournament) return false
    return true
  })
}
