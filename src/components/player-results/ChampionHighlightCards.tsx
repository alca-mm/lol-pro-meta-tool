import { useMemo } from "react"
import {
    computeChampionStats,
    getBestChampionStats,
    getNeedsReviewChampionStats,
    type PlayerChampionResultStats,
} from "../../teams/playerResultsAnalytics"
import type { RankedMatch } from "../../teams/riotService"
import { useTranslation } from "../../i18n/LanguageContext"

interface CardProps {
    stat: PlayerChampionResultStats
    accent: "pos" | "neg"
}

function ChampionCard({ stat, accent }: CardProps) {
    const winColor = stat.winRate >= 0.5 ? "var(--green)" : "var(--red)"
    const borderColor = accent === "pos"
        ? "rgba(76,175,130,0.25)"
        : "rgba(224,79,79,0.2)"

    return (
        <div
            style={{
                border: `1px solid ${borderColor}`,
                borderRadius: "8px",
                background: "rgba(10,12,18,0.5)",
                padding: "0.55rem 0.7rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                minWidth: "110px",
                flex: "1 1 110px",
            }}
        >
            <span style={{ fontWeight: 700, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {stat.championName}
            </span>
            <span style={{ color: winColor, fontWeight: 700, fontSize: "0.85rem" }}>
                {(stat.winRate * 100).toFixed(0)}%
                <span className="muted" style={{ fontWeight: 400, fontSize: "0.75rem", marginLeft: "0.35rem" }}>
                    {stat.wins}W {stat.losses}L
                </span>
            </span>
            <span className="muted" style={{ fontSize: "0.75rem" }}>
                {stat.avgKda.toFixed(2)} KDA · {stat.games}G
            </span>
        </div>
    )
}

interface Props {
    matches: RankedMatch[]
}

export function ChampionHighlightCards({ matches }: Props) {
    const { t } = useTranslation()
    const stats        = useMemo(() => computeChampionStats(matches), [matches])
    const best         = useMemo(() => getBestChampionStats(stats), [stats])
    const needsReview  = useMemo(() => getNeedsReviewChampionStats(stats), [stats])

    if (stats.length === 0) return null

    const bestNames = new Set(best.map((s) => s.championName))
    const filteredNeedsReview = needsReview.filter((s) => !bestNames.has(s.championName))

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="section-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span className="section-title">{t("playerResults_bestChampions")}</span>
                {best.length === 0 ? (
                    <p className="empty-state">{t("playerResults_noData")}</p>
                ) : (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {best.map((s) => <ChampionCard key={s.championName} stat={s} accent="pos" />)}
                    </div>
                )}
            </div>

            <div className="section-card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span className="section-title">{t("playerResults_needsReview")}</span>
                {filteredNeedsReview.length === 0 ? (
                    <p className="empty-state">{t("playerResults_noData")}</p>
                ) : (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {filteredNeedsReview.map((s) => <ChampionCard key={s.championName} stat={s} accent="neg" />)}
                    </div>
                )}
            </div>
        </div>
    )
}
