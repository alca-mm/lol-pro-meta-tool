import { useState } from "react"
import type { RoleMatchupStats, Role } from "../domain/types"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"

interface RoleMatchupTableProps {
  matchups: RoleMatchupStats[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

export function RoleMatchupTable({ matchups }: RoleMatchupTableProps) {
  const { t } = useTranslation()
  const [selectedRole, setSelectedRole] = useState<Role>("top")
  const [showAll, setShowAll] = useState(false)

  const filtered = matchups
    .filter((m) => m.role === selectedRole)
    .sort((a, b) => Math.abs(b.matchupScore) - Math.abs(a.matchupScore))

  const displayed = showAll ? filtered : filtered.slice(0, 10)

  return (
    <div>
      <div className="role-filter-tabs">
        {ROLES.map((r) => (
          <button
            key={r}
            className={`role-tab${selectedRole === r ? " role-tab-active" : ""}`}
            onClick={() => { setSelectedRole(r); setShowAll(false) }}
          >
            {r}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">{t("tbl_noRoleMatchupsFor")} {selectedRole}.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th><span className="sort-btn">Champion A</span></th>
                  <th><span className="sort-btn">Champion B</span></th>
                  <th><span className="sort-btn">{t("tbl_games")}</span></th>
                  <th><span className="sort-btn">{t("tbl_wrForA")}</span></th>
                  <th><span className="sort-btn">Score</span></th>
                  <th>{t("tbl_confidence")}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((m) => (
                  <tr key={`${m.role}|${m.championA}|${m.championB}`}>
                    <td>{m.championA}</td>
                    <td>{m.championB}</td>
                    <td>{m.gamesAgainst}</td>
                    <td>{pct(m.winRateForA)}</td>
                    <td className={m.matchupScore > 0 ? "score-pos" : "score-neg"}>
                      {m.matchupScore > 0 ? "+" : ""}{m.matchupScore.toFixed(3)}
                    </td>
                    <td className="sample-label">{t(m.sampleSizeLabel as TranslationKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 10 && (
            <button className="btn-toggle" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t("tbl_showLess") : `${t("tbl_showAll")} (${filtered.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
