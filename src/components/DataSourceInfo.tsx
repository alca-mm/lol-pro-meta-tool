import type { Match } from "../domain/types"

interface DataSourceInfoProps {
  isUsingSampleData: boolean
  matches: Match[]
  lastSyncDate?: string
}

function dateRange(matches: Match[]): string {
  const dates = matches.map((m) => m.date).filter(Boolean).sort()
  if (dates.length === 0) return "—"
  if (dates[0] === dates[dates.length - 1]) return dates[0]
  return `${dates[0]} – ${dates[dates.length - 1]}`
}

export function DataSourceInfo({ isUsingSampleData, matches, lastSyncDate }: DataSourceInfoProps) {
  const patches = [...new Set(matches.map((m) => m.patch))].sort().join(", ")
  const regions = [...new Set(matches.map((m) => m.region))].sort().join(", ")

  if (isUsingSampleData) {
    return (
      <div className="datasource-badge sample">
        SAMPLE-DATEN — keine echten Pro-Play-Daten. Führe <code>npm run sync:data</code> aus, um echte Daten zu laden.
      </div>
    )
  }

  return (
    <div className="datasource-badge synced">
      Synchronisierte Pro-Play-Daten aktiv
      <span className="datasource-meta">
        {matches.length} Matches · {dateRange(matches)} · Patches: {patches} · Regionen: {regions}
        {lastSyncDate ? ` · Sync: ${lastSyncDate}` : ""}
      </span>
    </div>
  )
}
