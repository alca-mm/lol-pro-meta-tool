import { useState, useMemo } from "react"
import {
    computeChampionStats,
    type PlayerChampionResultStats,
} from "../../teams/playerResultsAnalytics"
import type { RankedMatch } from "../../teams/riotService"
import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import { formatChampionStatCell } from "./playerResultsFormat"

type SortKey = keyof PlayerChampionResultStats

interface Col {
    key: SortKey
    /**
     * The header text. Deliberately NOT translated: these are LoL stat tokens
     * (`Win%`, `KDA`, `CS/min`, `SoloQ`) that a German player reads exactly as
     * written. The tooltip below carries the explanation instead.
     */
    label: string
    /**
     * The i18n KEY of the tooltip, not the tooltip text.
     *
     * COLUMNS is a module-level constant, evaluated once at import time, where
     * `t()` does not exist yet. Baking the sentence in here is what made these
     * tooltips English-only. Holding the key and resolving it inside the
     * component keeps the column list single and module-scoped while letting
     * the text follow the language switch on re-render.
     */
    titleKey?: TranslationKey
    numeric?: boolean
}

const COLUMNS: Col[] = [
    { key: "championName",    label: "Champion" },
    { key: "games",           label: "G",        titleKey: "playerResults_tipGames",           numeric: true },
    { key: "wins",            label: "W",        titleKey: "playerResults_tipWins",            numeric: true },
    { key: "losses",          label: "L",        titleKey: "playerResults_tipLosses",          numeric: true },
    { key: "winRate",         label: "Win%",     titleKey: "playerResults_tipWinRate",         numeric: true },
    { key: "avgKda",          label: "KDA",      titleKey: "playerResults_tipAvgKda",          numeric: true },
    { key: "avgKills",        label: "K",        titleKey: "playerResults_tipAvgKills",        numeric: true },
    { key: "avgDeaths",       label: "D",        titleKey: "playerResults_tipAvgDeaths",       numeric: true },
    { key: "avgAssists",      label: "A",        titleKey: "playerResults_tipAvgAssists",      numeric: true },
    { key: "csPerMinute",     label: "CS/min",   titleKey: "playerResults_tipCsPerMinute",     numeric: true },
    { key: "damagePerMinute", label: "Dmg/min",  titleKey: "playerResults_tipDamagePerMinute", numeric: true },
    { key: "goldPerMinute",   label: "Gold/min", titleKey: "playerResults_tipGoldPerMinute",   numeric: true },
    { key: "soloqGames",      label: "SoloQ",    titleKey: "playerResults_tipSoloqGames",      numeric: true },
    { key: "flexqGames",      label: "FlexQ",    titleKey: "playerResults_tipFlexqGames",      numeric: true },
]

interface Props {
    matches: RankedMatch[]
}

export function ChampionResultsTable({ matches }: Props) {
    const { t, lang } = useTranslation()
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
                                {/*
                                  THE SORT CONTROL IS THE BUTTON, NOT THE CELL.

                                  Until 0.7.10 the `onClick` sat on the `<th>`
                                  itself with a `cursor: pointer` to advertise
                                  it. A table header is not focusable and answers
                                  to no key, so sorting this table was impossible
                                  without a mouse. Same defect the champion stats
                                  table had, found by the same sweep.

                                  A real `<button>` in the cell rather than
                                  `role="button"` plus `tabIndex` on the `<th>`:
                                  the browser supplies focus, Enter and Space,
                                  and the header keeps its `columnheader`
                                  semantics, which `role="button"` would have
                                  replaced.

                                  `aria-sort` belongs on the `<th>`, never on the
                                  button inside it - ARIA defines it only for
                                  `columnheader`/`rowheader`/`gridcell`, so on a
                                  button it is silently dropped. That is the
                                  0.7.9 lesson from ChampionStatsTable, applied
                                  here before it could be repeated.

                                  The cell gives up its padding to the button so
                                  the click target stays the whole header, not
                                  just the text.
                                */}
                                {COLUMNS.map((col) => (
                                    <th
                                        key={col.key}
                                        title={col.titleKey ? t(col.titleKey) : undefined}
                                        className={col.numeric ? "numeric" : undefined}
                                        aria-sort={
                                            sortKey === col.key
                                                ? (sortAsc ? "ascending" : "descending")
                                                : "none"
                                        }
                                        style={{
                                            ...thStyle,
                                            padding: 0,
                                            userSelect: "none",
                                            color: sortKey === col.key
                                                ? "var(--text)"
                                                : "var(--text-dim)",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="results-sort-btn"
                                            onClick={() => handleSort(col.key)}
                                        >
                                            {col.label}
                                            {sortKey === col.key && (
                                                <span style={{ marginLeft: "0.2em" }}>
                                                    {sortAsc ? "▲" : "▼"}
                                                </span>
                                            )}
                                        </button>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((row) => (
                                <tr key={row.championName}>
                                    {COLUMNS.map((col) => {
                                        const val = row[col.key]
                                        const text = formatChampionStatCell(col.key, val, lang)
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
