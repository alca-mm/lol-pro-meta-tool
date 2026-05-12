import { useState } from "react"
import type { ChampionStats } from "../domain/types"

type SortKey = "championName" | "picks" | "bans" | "pickRate" | "banRate" | "presence" | "winRate" | "draftPriorityScore"

interface ChampionStatsTableProps {
  stats: ChampionStats[]
  selectedChampion: string | null
  onSelectChampion: (name: string | null) => void
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function ChampionStatsTable({ stats, selectedChampion, onSelectChampion }: ChampionStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("draftPriorityScore")
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...stats].sort((a, b) => {
    const aVal = sortKey === "winRate" ? (a.winRate ?? -1) : a[sortKey]
    const bVal = sortKey === "winRate" ? (b.winRate ?? -1) : b[sortKey]
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  function colBtn(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th>
        <button
          className={`sort-btn${active ? " sort-active" : ""}`}
          onClick={() => handleSort(key)}
          aria-sort={active ? (sortAsc ? "ascending" : "descending") : "none"}
        >
          {label}{active ? (sortAsc ? " ▲" : " ▼") : ""}
        </button>
      </th>
    )
  }

  if (sorted.length === 0) {
    return <p className="empty-state">Keine Champions für die aktuellen Filter.</p>
  }

  return (
    <div className="table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {colBtn("championName", "Champion")}
            {colBtn("picks", "Picks")}
            {colBtn("bans", "Bans")}
            {colBtn("pickRate", "Pickrate")}
            {colBtn("banRate", "Banrate")}
            {colBtn("presence", "Presence")}
            {colBtn("winRate", "Winrate")}
            {colBtn("draftPriorityScore", "Draft Priority")}
            <th>Aussagekraft</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.championName}
              className={s.championName === selectedChampion ? "row-selected" : ""}
              onClick={() => onSelectChampion(s.championName === selectedChampion ? null : s.championName)}
              style={{ cursor: "pointer" }}
            >
              <td>{s.championName}</td>
              <td>{s.picks}</td>
              <td>{s.bans}</td>
              <td>{pct(s.pickRate)}</td>
              <td>{pct(s.banRate)}</td>
              <td>{pct(s.presence)}</td>
              <td>{s.winRate !== null ? pct(s.winRate) : "—"}</td>
              <td className="priority-score">{s.draftPriorityScore.toFixed(3)}</td>
              <td className="sample-label">{s.sampleSizeLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
