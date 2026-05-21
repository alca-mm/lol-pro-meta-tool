import { useFilters } from "../context/FilterContext"
import { useTranslation } from "../i18n/LanguageContext"
import { MultiSelectDropdown } from "./common/MultiSelectDropdown"
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

      <label>{t("filter_patch")}</label>
      <MultiSelectDropdown
        label={t("filter_patch")}
        options={patches.map((p) => ({ value: p, label: p }))}
        selectedValues={filters.patches}
        onChange={(next) => setFilter("patches", next)}
        summaryAllLabel={t("filter_all")}
        selectedSummary={(n) =>
          n <= 2
            ? filters.patches.join(", ")
            : `${n} Patches`
        }
        actions={[
          { label: t("filter_all"), onClick: () => setFilter("patches", []) },
        ]}
      />

      <label>{t("filter_region")}</label>
      <MultiSelectDropdown
        label={t("filter_region")}
        options={regions.map((r) => ({ value: r, label: r }))}
        selectedValues={filters.regions}
        onChange={(next) => setFilter("regions", next)}
        summaryAllLabel={t("filter_all")}
        selectedSummary={(n) =>
          n <= 2
            ? filters.regions.join(", ")
            : `${n} Regions`
        }
        actions={[
          { label: t("filter_all"), onClick: () => setFilter("regions", []) },
        ]}
      />

      <label htmlFor="filter-tournament">{t("filter_tournament")}</label>
      <div className="filter-select-wrap">
        <select
          id="filter-tournament"
          className="filter-control filter-select"
          value={filters.tournament ?? ""}
          onChange={(e) => setFilter("tournament", e.target.value || null)}
        >
          <option value="">{t("filter_all")}</option>
          {tournaments.map((tournament) => <option key={tournament} value={tournament}>{tournament}</option>)}
        </select>
      </div>

      <label htmlFor="filter-role">{t("filter_role")}</label>
      <div className="filter-select-wrap">
        <select
          id="filter-role"
          className="filter-control filter-select"
          value={filters.role ?? ""}
          onChange={(e) => setFilter("role", (e.target.value as Role) || null)}
        >
          <option value="">{t("filter_all")}</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <label htmlFor="filter-minpicks">{t("filter_minPicks")}</label>
      <input
        id="filter-minpicks"
        className="filter-control"
        type="number"
        min={1}
        max={50}
        value={filters.minPicks}
        onChange={(e) => setFilter("minPicks", Math.max(1, parseInt(e.target.value) || 1))}
      />
    </aside>
  )
}
