import { useMemo } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { calculateRecentForm } from "../../teams/playerResultsAnalytics"
import type { RankedMatch } from "../../teams/riotService"
import { pluralMessage } from "../team/teamUiHelpers"
import {
    formatRatio,
    formatWholeNumber,
    formatWinRatePercentShort,
    PLAYER_RESULTS_MATCH_COUNT_KEYS,
} from "./playerResultsFormat"

interface Props {
    matches: RankedMatch[]
    count?: number
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <span
                className="muted"
                style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
                {label}
            </span>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: color ?? "var(--text)" }}>
                {value}
            </span>
        </div>
    )
}

export function RecentFormCards({ matches, count = 10 }: Props) {
    const { t, lang } = useTranslation()
    const form = useMemo(() => calculateRecentForm(matches, count), [matches, count])

    if (form.games === 0) return null

    // "Aktuelle Form · 10 Matches". Two keys plus the separator that was already
    // here, so neither half has to repeat the other language's word order.
    //
    // THE COUNT IS DECLINED, not suffixed. `form.games` is `recent.length`, so
    // a player with a single stored match really does reach 1, and "Letzte 1"
    // was the same numerus defect the project banned after "1 neue Match
    // gespeichert.". The Last-N buttons keep `formatLastNLabel`: their values
    // are 10/20/50 and cannot be 1.
    const title = [
        t("playerResults_recentForm"),
        pluralMessage(t, form.games, PLAYER_RESULTS_MATCH_COUNT_KEYS),
    ].join(" · ")

    return (
        <div className="section-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <span className="section-title">{title}</span>

            {/* W/L pill strip. The letters are data from calculateRecentForm(), not copy. */}
            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap" }}>
                {form.form.map((result, i) => (
                    <span
                        key={i}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.5rem",
                            height: "1.5rem",
                            borderRadius: "3px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            background: result === "W"
                                ? "rgba(76,175,130,0.15)"
                                : "rgba(224,79,79,0.12)",
                            color: result === "W" ? "var(--green)" : "var(--red)",
                            border: `1px solid ${result === "W"
                                ? "rgba(76,175,130,0.3)"
                                : "rgba(224,79,79,0.25)"}`,
                        }}
                    >
                        {result}
                    </span>
                ))}
            </div>

            {/* Summary stats. The labels are LoL stat tokens and stay as they are. */}
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <StatItem
                    label="Win%"
                    value={formatWinRatePercentShort(form.winRate)}
                    color={form.winRate >= 0.5 ? "var(--green)" : "var(--red)"}
                />
                <StatItem label="W/L" value={`${form.wins}W ${form.losses}L`} />
                <StatItem label="KDA" value={formatRatio(form.avgKda, 2)} />
                <StatItem label="CS/min" value={formatRatio(form.csPerMinute, 1)} />
                <StatItem label="Dmg/min" value={formatWholeNumber(form.damagePerMinute, lang)} />
            </div>
        </div>
    )
}
