import { useState } from "react"
import type { MatchupStats } from "../domain/types"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"

interface MatchupTableProps {
  matchups: MatchupStats[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function MatchupTable({ matchups }: MatchupTableProps) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const sorted = [...matchups].sort((a, b) => Math.abs(b.matchupScore) - Math.abs(a.matchupScore))
  const displayed = showAll ? sorted : sorted.slice(0, 10)

  if (sorted.length === 0) {
    return <p className="empty-state">{t("tbl_noMatchups")}</p>
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Champion A</th>
              <th>Champion B</th>
              <th>{t("tbl_games")}</th>
              <th>{t("tbl_wrForA")}</th>
              <th>Matchup Score</th>
              <th>{t("tbl_confidence")}</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((m) => (
              <tr key={`${m.championA}|${m.championB}`}>
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
      {sorted.length > 10 && (
        <button className="btn-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("tbl_showLess") : `${t("tbl_showAll")} (${sorted.length})`}
        </button>
      )}
    </div>
  )
}
