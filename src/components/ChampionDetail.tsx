import type { ChampionStats, SynergyStats, MatchupStats, Role } from "../domain/types"

interface ChampionDetailProps {
  stats: ChampionStats
  synergies: SynergyStats[]
  matchups: MatchupStats[]
  onClose: () => void
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function ChampionDetail({ stats, synergies, matchups, onClose }: ChampionDetailProps) {
  const relatedSynergies = synergies
    .filter((s) => s.championA === stats.championName || s.championB === stats.championName)
    .sort((a, b) => b.synergyScore - a.synergyScore)
    .slice(0, 5)

  const relatedMatchups = matchups
    .filter((m) => m.championA === stats.championName || m.championB === stats.championName)
    .map((m) => {
      if (m.championA === stats.championName) return m
      return {
        ...m,
        championA: m.championB,
        championB: m.championA,
        winsForA: m.lossesForA,
        lossesForA: m.winsForA,
        winRateForA: 1 - m.winRateForA,
        matchupScore: -m.matchupScore,
      }
    })
    .sort((a, b) => b.matchupScore - a.matchupScore)
    .slice(0, 5)

  return (
    <div className="champion-detail">
      <div className="detail-header">
        <h3>{stats.championName}</h3>
        <button onClick={onClose} className="btn-close" aria-label="Detail schließen">✕</button>
      </div>

      <div className="detail-grid">
        <div className="detail-section">
          <h4>Rollenverteilung</h4>
          <ul className="role-list">
            {ROLES.filter((r) => stats.roleDistribution[r] > 0).map((r) => (
              <li key={r}>{r}: {pct(stats.roleDistribution[r])}</li>
            ))}
            {ROLES.every((r) => stats.roleDistribution[r] === 0) && <li>Keine Picks</li>}
          </ul>
        </div>

        <div className="detail-section">
          <h4>Top Synergien</h4>
          {relatedSynergies.length === 0 ? (
            <p className="empty-state">Keine Daten</p>
          ) : (
            <ul className="synergy-list">
              {relatedSynergies.map((s) => {
                const partner = s.championA === stats.championName ? s.championB : s.championA
                return (
                  <li key={partner}>
                    {partner} — {pct(s.winRateTogether)} ({s.gamesTogether} Spiele)
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="detail-section">
          <h4>Top Matchups (für {stats.championName})</h4>
          {relatedMatchups.length === 0 ? (
            <p className="empty-state">Keine Daten</p>
          ) : (
            <ul className="matchup-list">
              {relatedMatchups.map((m) => (
                <li key={m.championB}>
                  vs {m.championB} — {pct(m.winRateForA)} ({m.gamesAgainst} Spiele)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
