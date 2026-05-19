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
    numeric?: boolean
}

const COLUMNS: Col[] = [
    { key: "championName",    label: "Champion" },
    { key: "games",           label: "G",        title: "Games",                              numeric: true },
    { key: "wins",            label: "W",        title: "Wins",                               numeric: true },
    { key: "losses",          label: "L",        title: "Losses",                             numeric: true },
    { key: "winRate",         label: "Win%",     title: "Win Rate",                           numeric: true },
    { key: "avgKda",          label: "KDA",      title: "Avg KDA (kills+assists)/deaths",      numeric: true },
    { key: "avgKills",        label: "K",        title: "Avg Kills",                          numeric: true },
    { key: "avgDeaths",       label: "D",        title: "Avg Deaths",                         numeric: true },
    { key: "avgAssists",      label: "A",        title: "Avg Assists",                        numeric: true },
    { key: "csPerMinute",     label: "CS/min",   title: "CS per minute",                      numeric: true },
    { key: "damagePerMinute", label: "Dmg/min",  title: "Damage per minute",                  numeric: true },
    { key: "goldPerMinute",   label: "Gold/min", title: "Gold per minute",                    numeric: true },
    { key: "soloqGames",      label: "SoloQ",    title: "Solo Queue games",                   numeric: true },
    { key: "flexqGames",      label: "FlexQ",    title: "Flex Queue games",                   numeric: true },
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
                <div className="table-card">
                    <table className="stats-table" style={{ fontSize: "0.8rem" }}>
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
                                            textAlign: col.numeric ? "right" : "left",
                                            color: sortKey === col.key
                                                ? "var(--text)"
                                                : "var(--text-dim)",
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
                                                    textAlign: col.numeric ? "right" : "left",
                                                    color: isWinRate
                                                        ? (row.winRate >= 0.5
                                                            ? "var(--green)"
                                                            : "var(--red)")
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
    whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = {
    whiteSpace:    "nowrap",
    verticalAlign: "top",
}
