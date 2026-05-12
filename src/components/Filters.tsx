import { useFilters } from "../context/FilterContext"
import type { Match, Role } from "../domain/types"

interface FiltersProps {
  matches: Match[]
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

export function Filters({ matches }: FiltersProps) {
  const { filters, setFilter, resetFilters } = useFilters()

  const patches = [...new Set(matches.map((m) => m.patch))].sort()
  const regions = [...new Set(matches.map((m) => m.region))].sort()
  const tournaments = [...new Set(matches.map((m) => m.tournament))].sort()

  return (
    <aside className="filters">
      <div className="filters-header">
        <h2>Filter</h2>
        <button onClick={resetFilters} className="btn-reset">Zurücksetzen</button>
      </div>

      <label htmlFor="filter-patch">Patch</label>
      <select
        id="filter-patch"
        value={filters.patch ?? ""}
        onChange={(e) => setFilter("patch", e.target.value || null)}
      >
        <option value="">Alle</option>
        {patches.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <label htmlFor="filter-region">Region</label>
      <select
        id="filter-region"
        value={filters.region ?? ""}
        onChange={(e) => setFilter("region", e.target.value || null)}
      >
        <option value="">Alle</option>
        {regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <label htmlFor="filter-tournament">Turnier</label>
      <select
        id="filter-tournament"
        value={filters.tournament ?? ""}
        onChange={(e) => setFilter("tournament", e.target.value || null)}
      >
        <option value="">Alle</option>
        {tournaments.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <label htmlFor="filter-role">Rolle</label>
      <select
        id="filter-role"
        value={filters.role ?? ""}
        onChange={(e) => setFilter("role", (e.target.value as Role) || null)}
      >
        <option value="">Alle</option>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <label htmlFor="filter-minpicks">Min. Picks</label>
      <input
        id="filter-minpicks"
        type="number"
        min={1}
        max={50}
        value={filters.minPicks}
        onChange={(e) => setFilter("minPicks", Math.max(1, parseInt(e.target.value) || 1))}
      />
    </aside>
  )
}
