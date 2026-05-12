import { useEffect, useState } from "react"
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
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false)
    }, 20_000)

    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) {
    return null
  }

  if (isUsingSampleData) {
    return (
        <div className="datasource-badge sample">
          <button
              type="button"
              className="datasource-close"
              onClick={() => setVisible(false)}
              aria-label="Datenhinweis schließen"
          >
            ×
          </button>
          SAMPLE-DATEN — keine echten Pro-Play-Daten. Führe <code>npm run sync:data</code> aus, um echte Daten zu laden.
        </div>
    )
  }

  return (
      <div className="datasource-badge synced">
        <button
            type="button"
            className="datasource-close"
            onClick={() => setVisible(false)}
            aria-label="Datenhinweis schließen"
        >
          ×
        </button>

        <strong>Synchronisierte Pro-Play-Daten aktiv</strong>

        <span className="datasource-meta">
        {matches.length} Matches · {dateRange(matches)}
          {lastSyncDate ? ` · Sync: ${lastSyncDate}` : ""}
      </span>
      </div>
  )
}