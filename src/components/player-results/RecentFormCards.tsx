import { useMemo } from "react"
import { calculateRecentForm } from "../../teams/playerResultsAnalytics"
import type { RankedMatch } from "../../teams/riotService"

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
    const form = useMemo(() => calculateRecentForm(matches, count), [matches, count])

    if (form.games === 0) return null

    return (
        <div className="section-card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <span className="section-title">Recent Form · Last {form.games}</span>

            {/* W/L pill strip */}
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

            {/* Summary stats */}
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <StatItem
                    label="Win%"
                    value={`${(form.winRate * 100).toFixed(0)}%`}
                    color={form.winRate >= 0.5 ? "var(--green)" : "var(--red)"}
                />
                <StatItem label="W/L" value={`${form.wins}W ${form.losses}L`} />
                <StatItem label="KDA" value={form.avgKda.toFixed(2)} />
                <StatItem label="CS/min" value={form.csPerMinute.toFixed(1)} />
                <StatItem
                    label="Dmg/min"
                    value={Math.round(form.damagePerMinute).toLocaleString("de-DE")}
                />
            </div>
        </div>
    )
}
