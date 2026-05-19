import { useState, useMemo } from "react"
import {
    computeChampionStats,
    type PlayerChampionResultStats,
} from "../../teams/playerResultsAnalytics"
import type { RankedMatch, PlayerAccount } from "../../teams/riotService"

type SortKey = keyof PlayerChampionResultStats

interface Col {
    key: SortKey
    label: string
    title?: string
}

const COLUMNS: Col[] = [
    { key: "championName",    label: "Champion" },
    { key: "games",           label: "G",        title: "Games" },
    { key: "wins",            label: "W",        title: "Wins" },
    { key: "losses",          label: "L",        title: "Losses" },
    { key: "winRate",         label: "Win%",     title: "Win Rate" },
    { key: "avgKda",          label: "KDA",      title: "Avg KDA (kills+assists)/deaths" },
    { key: "avgKills",        label: "K",        title: "Avg Kills" },
    { key: "avgDeaths",       label: "D",        title: "Avg Deaths" },
    { key: "avgAssists",      label: "A",        title: "Avg Assists" },
    { key: "csPerMinute",     label: "CS/min" },
    { key: "damagePerMinute", label: "Dmg/min" },
    { key: "goldPerMinute",   label: "Gold/min" },
    { key: "soloqGames",      label: "SoloQ" },
    { key: "flexqGames",      label: "FlexQ" },
]

function fCell(key: SortKey, value: PlayerChampionResultStats[SortKey]): string {
    if (value === null) return "—"
    switch (key) {
        case "winRate":         return `${((value as number) * 100).toFixed(1)}%`
        case "avgKda":
        case "avgKills":
        case "avgDeaths":
        case "avgAssists":      return (value as number).toFixed(2)
        case "csPerMinute":     return (value as number).toFixed(1)
        case "damagePerMinute":
        case "goldPerMinute":   return Math.round(value as number).toLocaleString("de-DE")
        default:                return String(value)
    }
}

interface Props {
    matches: RankedMatch[]
    accounts: PlayerAccount[]
}

export function ChampionResultsTable({ matches, accounts }: Props) {
    const [puuidFilter, setPuuidFilter] = useState("")
    const [sortKey, setSortKey]         = useState<SortKey>("games")
    const [sortAsc, setSortAsc]         = useState(false)

    const filtered = useMemo(
        () => puuidFilter ? matches.filter((m) => m.puuid === puuidFilter) : matches,
        [matches, puuidFilter],
    )

    const stats = useMemo(() => computeChampionStats(filtered), [filtered])

    const sorted = useMemo(() => {
        return [...stats].sort((a, b) => {
            const av = a[sortKey]
            const bv = b[sortKey]
            if (typeof av === "number" && typeof bv === "number") {
                return sortAsc ? av - bv : bv - av
            }
            const as = String(av ?? "")
            const bs = String(bv ?? "")
            return sortAsc ? as.localeCompare(bs) : bs.localeCompare(as)
        })
    }, [stats, sortKey, sortAsc])

    function handleSort(key: SortKey) {
        if (sortKey === key) setSortAsc((v) => !v)
        else { setSortKey(key); setSortAsc(false) }
    }

    return (
        <div>
            {/* Player filter */}
            {accounts.length > 1 && (
                <div style={{ marginBottom: "0.5rem" }}>
                    <select
                        value={puuidFilter}
                        onChange={(e) => setPuuidFilter(e.target.value)}
                        style={{ fontSize: "0.85rem" }}
                    >
                        <option value="">Alle Spieler</option>
                        {accounts.map((a) => (
                            <option key={a.puuid} value={a.puuid}>
                                {a.riot_game_name}#{a.riot_tag_line}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {sorted.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.8rem" }}>Keine Daten.</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                        <thead>
                            <tr>
                                {COLUMNS.map((col) => (
                                    <th
                                        key={col.key}
                                        title={col.title}
                                        style={{
                                            ...thStyle,
                                            cursor: "pointer",
                                            userSelect: "none",
                                            color: sortKey === col.key
                                                ? "var(--color-fg, inherit)"
                                                : "var(--color-muted, #888)",
                                        }}
                                        onClick={() => handleSort(col.key)}
                                    >
                                        {col.label}
                                        {sortKey === col.key && (
                                            <span style={{ marginLeft: "0.2em" }}>
                                                {sortAsc ? "▲" : "▼"}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((row) => (
                                <tr key={row.championName}>
                                    {COLUMNS.map((col) => {
                                        const val = row[col.key]
                                        const text = fCell(col.key, val)
                                        const isWinRate = col.key === "winRate"
                                        return (
                                            <td
                                                key={col.key}
                                                style={{
                                                    ...tdStyle,
                                                    color: isWinRate
                                                        ? (row.winRate >= 0.5
                                                            ? "var(--score-pos, #4ade80)"
                                                            : "var(--score-neg, #f87171)")
                                                        : undefined,
                                                    fontWeight: col.key === "championName" ? 500 : undefined,
                                                }}
                                            >
                                                {text}
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const thStyle: React.CSSProperties = {
    textAlign:   "left",
    paddingRight: "0.75rem",
    paddingBottom: "0.3rem",
    whiteSpace:  "nowrap",
    fontWeight:  500,
}

const tdStyle: React.CSSProperties = {
    paddingRight:  "0.75rem",
    paddingBottom: "0.2rem",
    whiteSpace:    "nowrap",
    verticalAlign: "top",
}
