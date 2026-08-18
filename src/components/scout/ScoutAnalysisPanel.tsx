/**
 * Per-player analysis: top threats, target bans, comfort picks, weaknesses and
 * the confidence behind them — every recommendation with *all* of its reasons.
 *
 * Honesty rule of this panel: a player without scout data gets
 * `scout_noAnalysis`, never a made-up recommendation.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { ScoutAnalysisResult, ScoutPlayerAnalysis } from "../../scout/analysis"
import type { ChampionSignal } from "../../scout/types"
import {
    ScoutBanRow,
    ScoutConfidenceBadge,
    ScoutNoDataNote,
    ScoutReasonList,
    ScoutSignalRow,
} from "./ScoutShared"
import { compareChampionNames, scoutMembershipKey, scoutRoleLabel } from "./scoutUiHelpers"

const MAX_THREATS = 5
const MAX_BANS = 3
const MAX_COMFORT = 3

/**
 * Comfort picks = what the player plays most, regardless of how well.
 *
 * The name tie-break uses `compareChampionNames()`, not `localeCompare()`: the
 * latter's result depends on the host locale and ICU build, so two people
 * looking at the same scout data could see two different orders. The analysis
 * engine avoids `localeCompare` for the same reason.
 */
function comfortPicks(signals: readonly ChampionSignal[]): ChampionSignal[] {
    return [...signals]
        .filter((signal) => signal.games > 0)
        .sort((a, b) => b.games - a.games || compareChampionNames(a.championName, b.championName))
        .slice(0, MAX_COMFORT)
}

export function ScoutAnalysisPanel({ analysis }: { analysis: ScoutAnalysisResult }) {
    const { t } = useTranslation()
    const hasAnyData = analysis.players.some((player) => player.dataQuality.entryCount > 0)

    return (
        <div className="scout-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_analysisTitle")}</h3>
                <ScoutConfidenceBadge confidence={analysis.confidence} />
            </div>
            <p className="muted">{t("scout_sourceHint")}</p>

            {!hasAnyData ? (
                <ScoutNoDataNote variant="none" />
            ) : (
                <div className="scout-analysis-grid">
                    {analysis.players.map((player) => (
                        <ScoutPlayerAnalysisCard key={player.playerId} player={player} />
                    ))}
                </div>
            )}
        </div>
    )
}

function ScoutPlayerAnalysisCard({ player }: { player: ScoutPlayerAnalysis }) {
    const { t } = useTranslation()
    const hasData = player.dataQuality.entryCount > 0
    const comfort = comfortPicks(player.signals)
    // Declared lineup slot and parsed guess used to share one chip via
    // `starterSlot ?? player.role`, so "Mid" could mean either — and for a
    // player without a seat no membership chip follows to hint at it. The guess
    // now says that it is one, and is greyed out on top.
    const role = scoutRoleLabel(t, player.lineup.starterSlot, player.role)

    return (
        <section className="scout-analysis-card">
            <header className="scout-panel-head">
                <strong className="scout-player-name">{player.displayName}</strong>
                <span className={role.isGuess ? "scout-chip muted" : "scout-chip"}>{role.text}</span>
                {player.lineup.membership !== "unassigned" && (
                    <span className={`scout-chip scout-membership-${player.lineup.membership}`}>
                        {t(scoutMembershipKey(player.lineup.membership))}
                    </span>
                )}
                <ScoutConfidenceBadge confidence={player.confidence} />
            </header>

            {!hasData ? (
                <ScoutNoDataNote variant="none" />
            ) : (
                <>
                    {(player.confidence === "low" || player.confidence === "none") && (
                        <ScoutNoDataNote variant="low" />
                    )}

                    <ScoutReasonList reasons={player.dataQuality.notes} />

                    <h5 className="scout-group-heading">{t("scout_topThreats")}</h5>
                    {player.signals.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ul className="scout-signal-list">
                            {player.signals.slice(0, MAX_THREATS).map((signal) => (
                                <ScoutSignalRow key={signal.championName} signal={signal} />
                            ))}
                        </ul>
                    )}

                    <h5 className="scout-group-heading">{t("scout_banCandidates")}</h5>
                    {player.targetBans.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ol className="scout-ban-list">
                            {player.targetBans.slice(0, MAX_BANS).map((candidate, index) => (
                                <ScoutBanRow
                                    key={candidate.championName}
                                    candidate={candidate}
                                    rank={index + 1}
                                />
                            ))}
                        </ol>
                    )}

                    <h5 className="scout-group-heading">{t("scout_comfortPicks")}</h5>
                    {comfort.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ul className="scout-signal-list">
                            {comfort.map((signal) => (
                                <ScoutSignalRow key={signal.championName} signal={signal} />
                            ))}
                        </ul>
                    )}

                    <h5 className="scout-group-heading">{t("scout_weaknesses")}</h5>
                    {player.weaknesses.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ul className="scout-signal-list">
                            {player.weaknesses.map((signal) => (
                                <ScoutSignalRow key={signal.championName} signal={signal} />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </section>
    )
}
