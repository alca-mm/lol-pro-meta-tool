import type { Match } from "../domain/types"

interface DashboardProps {
  totalMatches: number
  filteredMatches: number
  allMatches: Match[]
}

export function Dashboard({ totalMatches, filteredMatches, allMatches }: DashboardProps) {
  const patches = [...new Set(allMatches.map((m) => m.patch))].sort().join(", ")
  const regions = [...new Set(allMatches.map((m) => m.region))].sort().join(", ")

  return (
    <div className="dashboard-stats">
      <div className="stat-card">
        <span className="stat-value">{filteredMatches}</span>
        <span className="stat-label">Matches (gefiltert)</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{totalMatches}</span>
        <span className="stat-label">Matches gesamt</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{patches}</span>
        <span className="stat-label">Patches</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{regions}</span>
        <span className="stat-label">Regionen</span>
      </div>
    </div>
  )
}
