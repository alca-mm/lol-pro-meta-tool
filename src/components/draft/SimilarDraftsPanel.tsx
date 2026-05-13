import type { TranslationKey } from "../../i18n/types"
import type { SimilarDraftResult } from "../../draft/similarDrafts"

interface SimilarDraftsPanelProps {
    results: SimilarDraftResult[]
    hasInput: boolean
    t: (key: TranslationKey) => string
}

export function SimilarDraftsPanel({ results, hasInput, t }: SimilarDraftsPanelProps) {
    return (
        <div className="recommendation-section">
            <h3>{t("similarDrafts_title")}</h3>

            {!hasInput ? (
                <p className="empty-state">{t("similarDrafts_needMoreInput")}</p>
            ) : results.length === 0 ? (
                <p className="empty-state">{t("similarDrafts_noResults")}</p>
            ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                    {results.map((result) => (
                        <SimilarDraftCard key={result.match.matchId} result={result} t={t} />
                    ))}
                </div>
            )}
        </div>
    )
}

function SimilarDraftCard({
    result,
    t,
}: {
    result: SimilarDraftResult
    t: (key: TranslationKey) => string
}) {
    const { match, score, matchedBluePicks, matchedRedPicks, matchedBans } = result

    const bluePicks = match.picks.filter((p) => p.side === "blue")
    const redPicks = match.picks.filter((p) => p.side === "red")
    const blueWon = match.winningTeam === match.blueTeam

    const matchedSet = new Set([...matchedBluePicks, ...matchedRedPicks])

    return (
        <div
            className="stat-card"
            style={{ padding: "0.75rem 1rem", textAlign: "left" }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "0.2rem",
                }}
            >
                <span style={{ fontWeight: "bold", fontSize: "0.95rem" }}>
                    {match.blueTeam} vs {match.redTeam}
                </span>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {t("similarDrafts_similarity")}: {Math.round(score * 100)}%
                </span>
            </div>

            <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                {match.tournament} · Patch {match.patch} · {match.date}
                {" · "}
                <span style={{ color: blueWon ? "#5b9bd5" : "#c07070" }}>
                    {t("similarDrafts_winner")}:{" "}
                    {blueWon ? match.blueTeam : match.redTeam}
                </span>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.4rem",
                    fontSize: "0.82rem",
                }}
            >
                <div>
                    <span className="muted">🔵 {match.blueTeam}</span>
                    <div style={{ marginTop: "0.15rem" }}>
                        {bluePicks.map((p) => {
                            const isMatch = matchedSet.has(p.championName.trim().toLowerCase())
                            return (
                                <span
                                    key={p.championName}
                                    style={{
                                        display: "inline-block",
                                        marginRight: "0.35rem",
                                        fontWeight: isMatch ? "bold" : "normal",
                                        color: isMatch
                                            ? "var(--accent, #8b7cf6)"
                                            : undefined,
                                    }}
                                >
                                    {p.championName}
                                </span>
                            )
                        })}
                    </div>
                </div>
                <div>
                    <span className="muted">🔴 {match.redTeam}</span>
                    <div style={{ marginTop: "0.15rem" }}>
                        {redPicks.map((p) => {
                            const isMatch = matchedSet.has(p.championName.trim().toLowerCase())
                            return (
                                <span
                                    key={p.championName}
                                    style={{
                                        display: "inline-block",
                                        marginRight: "0.35rem",
                                        fontWeight: isMatch ? "bold" : "normal",
                                        color: isMatch
                                            ? "var(--accent, #8b7cf6)"
                                            : undefined,
                                    }}
                                >
                                    {p.championName}
                                </span>
                            )
                        })}
                    </div>
                </div>
            </div>

            {matchedBans.length > 0 && (
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.3rem" }}>
                    {t("similarDrafts_matchedBans")}: {matchedBans.join(", ")}
                </div>
            )}
        </div>
    )
}
