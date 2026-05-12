import { useState } from "react"
import type { SynergyStats } from "../domain/types"

interface SynergyTableProps {
  synergies: SynergyStats[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function SynergyTable({ synergies }: SynergyTableProps) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...synergies].sort((a, b) => b.synergyScore - a.synergyScore)
  const displayed = showAll ? sorted : sorted.slice(0, 10)

  if (sorted.length === 0) {
    return <p className="empty-state">Keine Synergiedaten für die aktuellen Filter.</p>
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
              <th>Siege</th>
              <th>Winrate</th>
              <th>Synergy Score</th>
              <th>Aussagekraft</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((s) => (
              <tr key={`${s.championA}|${s.championB}`}>
                <td>{s.championA}</td>
                <td>{s.championB}</td>
                <td>{s.gamesTogether}</td>
                <td>{s.winsTogether}</td>
                <td>{pct(s.winRateTogether)}</td>
                <td>{s.synergyScore.toFixed(3)}</td>
                <td className="sample-label">{s.sampleSizeLabel}</td>
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
