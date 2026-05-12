import { useState } from "react"
import type { RoleChampionStats, Role } from "../domain/types"

interface RoleStatsTableProps {
  stats: RoleChampionStats[]
  filterRole?: Role | null
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

export function RoleStatsTable({ stats, filterRole }: RoleStatsTableProps) {
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
          Alle
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
        <p className="empty-state">Keine Daten für diese Rolle.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th><span className="sort-btn">Champion</span></th>
                <th><span className="sort-btn">Rolle</span></th>
                <th><span className="sort-btn">Picks</span></th>
                <th><span className="sort-btn">Siege</span></th>
                <th><span className="sort-btn">Winrate</span></th>
                <th>Aussagekraft</th>
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
                  <td className="sample-label">{s.sampleSizeLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
