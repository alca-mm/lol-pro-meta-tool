interface DashboardProps {
    totalMatches: number
    filteredMatches: number
}

export function Dashboard({ totalMatches, filteredMatches }: DashboardProps) {
    return (
        <div className="dashboard-stats compact">
            <div className="stat-card">
                <span className="stat-value">{filteredMatches}</span>
                <span className="stat-label">Matches gefiltert</span>
            </div>

            <div className="stat-card">
                <span className="stat-value">{totalMatches}</span>
                <span className="stat-label">Matches gesamt</span>
            </div>
        </div>
    )
}