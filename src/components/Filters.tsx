import { useFilters } from "../context/FilterContext"
import { useTranslation } from "../i18n/LanguageContext"
import type { Match, Role } from "../domain/types"

interface FiltersProps {
  matches: Match[]
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

function parsePatchParts(patch: string): number[] {
  return patch
    .split(".")
    .map((part) => Number(part.replace(/[^\d]/g, "")))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function comparePatchNewestFirst(a: string, b: string): number {
  const aParts = parsePatchParts(a)
  const bParts = parsePatchParts(b)
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (bParts[index] ?? 0) - (aParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return b.localeCompare(a)
}

export function Filters({ matches }: FiltersProps) {
  const { filters, setFilter, resetFilters } = useFilters()
  const { t } = useTranslation()

  const patches = [...new Set(matches.map((m) => m.patch).filter(Boolean))].sort(comparePatchNewestFirst)
  const regions = [...new Set(matches.map((m) => m.region))].sort()
  const tournaments = [...new Set(matches.map((m) => m.tournament))].sort()

  return (
    <aside className="filters">
      <div className="filters-header">
        <h2>{t("filter_title")}</h2>
        <button onClick={resetFilters} className="btn-reset">{t("filter_reset")}</button>
      </div>

      <label htmlFor="filter-patch">{t("filter_patch")}</label>
      <select
        id="filter-patch"
        value={filters.patch ?? ""}
        onChange={(e) => setFilter("patch", e.target.value || null)}
      >
        <option value="">{t("filter_all")}</option>
        {patches.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <label htmlFor="filter-region">{t("filter_region")}</label>
      <select
        id="filter-region"
        value={filters.region ?? ""}
        onChange={(e) => setFilter("region", e.target.value || null)}
      >
        <option value="">{t("filter_all")}</option>
        {regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <label htmlFor="filter-tournament">{t("filter_tournament")}</label>
      <select
        id="filter-tournament"
        value={filters.tournament ?? ""}
        onChange={(e) => setFilter("tournament", e.target.value || null)}
      >
        <option value="">{t("filter_all")}</option>
        {tournaments.map((tournament) => <option key={tournament} value={tournament}>{tournament}</option>)}
      </select>

      <label htmlFor="filter-role">{t("filter_role")}</label>
      <select
        id="filter-role"
        value={filters.role ?? ""}
        onChange={(e) => setFilter("role", (e.target.value as Role) || null)}
      >
        <option value="">{t("filter_all")}</option>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <label htmlFor="filter-minpicks">{t("filter_minPicks")}</label>
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
