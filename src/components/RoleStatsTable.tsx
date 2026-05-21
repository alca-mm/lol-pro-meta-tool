import { useState } from "react"
import type { RoleChampionStats, Role } from "../domain/types"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"

interface RoleStatsTableProps {
  stats: RoleChampionStats[]
  filterRole?: Role | null
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

export function RoleStatsTable({ stats, filterRole }: RoleStatsTableProps) {
  const { t } = useTranslation()
  const [selectedRole, setSelectedRole] = useState<Role | null>(filterRole ?? null)

  const displayed = stats
    .filter((s) => !selectedRole || s.role === selectedRole)
    .sort((a, b) => b.picks - a.picks)

  return (
    <div>
      <div className="role-filter-tabs">
        <button
          className={`role-tab${!selectedRole ? " role-tab-active" : ""}`}
          onClick={() => setSelectedRole(null)}
        >
          {t("filter_all")}
        </button>
        {ROLES.map((r) => (
          <button
            key={r}
            className={`role-tab${selectedRole === r ? " role-tab-active" : ""}`}
            onClick={() => setSelectedRole(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <p className="empty-state">{t("tbl_noRoleData")}</p>
      ) : (
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th><span className="sort-btn">Champion</span></th>
                <th><span className="sort-btn">{t("filter_role")}</span></th>
                <th><span className="sort-btn">Picks</span></th>
                <th><span className="sort-btn">{t("tbl_wins")}</span></th>
                <th><span className="sort-btn">Winrate</span></th>
                <th>{t("tbl_confidence")}</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((s) => (
                <tr key={`${s.championName}|${s.role}`}>
                  <td>{s.championName}</td>
                  <td>{s.role}</td>
                  <td>{s.picks}</td>
                  <td>{s.wins}</td>
                  <td>{s.winRate !== null ? pct(s.winRate) : "—"}</td>
                  <td className="sample-label">{t(s.sampleSizeLabel as TranslationKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
