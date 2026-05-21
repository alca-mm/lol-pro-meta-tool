import { useState, useMemo } from "react"
import {
    computeChampionStats,
    type PlayerChampionResultStats,
} from "../../teams/playerResultsAnalytics"
import type { RankedMatch } from "../../teams/riotService"
import { useTranslation } from "../../i18n/LanguageContext"

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
}

export function ChampionResultsTable({ matches }: Props) {
    const { t } = useTranslation()
    const [sortKey, setSortKey] = useState<SortKey>("games")
    const [sortAsc, setSortAsc] = useState(false)

    const stats = useMemo(() => computeChampionStats(matches), [matches])

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
            {sorted.length === 0 ? (
                <p className="empty-state">{t("playerResults_noData")}</p>
            ) : (
                <div className="table-card">
                    <table className="stats-table" style={{ fontSize: "0.8rem" }}>
                        <thead>
                            <tr>
                                {COLUMNS.map((col) => (
                                    <th
                                        key={col.key}
                                        title={col.title}
                                        className={col.numeric ? "numeric" : undefined}
                                        style={{
                                            ...thStyle,
                                            cursor: "pointer",
                                            userSelect: "none",
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
                                                className={col.numeric ? "numeric" : undefined}
                                                style={{
                                                    ...tdStyle,
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
