import { useState } from "react"
import type { MatchupStats } from "../domain/types"

interface MatchupTableProps {
  matchups: MatchupStats[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function MatchupTable({ matchups }: MatchupTableProps) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...matchups].sort((a, b) => Math.abs(b.matchupScore) - Math.abs(a.matchupScore))
  const displayed = showAll ? sorted : sorted.slice(0, 10)

  if (sorted.length === 0) {
    return <p className="empty-state">Keine Matchup-Daten für die aktuellen Filter.</p>
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Champion A</th>
              <th>Champion B</th>
              <th>Spiele</th>
              <th>WR für A</th>
              <th>Matchup Score</th>
              <th>Aussagekraft</th>
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
                <td className="sample-label">{m.sampleSizeLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 10 && (
        <button className="btn-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Weniger anzeigen" : `Alle ${sorted.length} anzeigen`}
        </button>
      )}
    </div>
  )
}
