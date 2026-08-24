/**
 * Per-player analysis: top threats, target bans, comfort picks, weaknesses and
 * the confidence behind them — every recommendation with *all* of its reasons.
 *
 * Honesty rule of this panel: a player without scout data gets
 * `scout_noAnalysis`, never a made-up recommendation.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { ScoutAnalysisResult, ScoutPlayerAnalysis } from "../../scout/analysis"
import type { BanCandidate, ChampionSignal } from "../../scout/types"
import {
    ScoutBanRow,
    ScoutConfidenceBadge,
    ScoutNoDataNote,
    ScoutReasonList,
    ScoutSignalRow,
} from "./ScoutShared"
import {
    SCOUT_LIST_PREVIEW_COUNT,
    SCOUT_MORE_BANS_KEYS,
    SCOUT_MORE_COMFORT_KEYS,
    SCOUT_MORE_THREATS_KEYS,
    SCOUT_MORE_WEAKNESSES_KEYS,
    compareChampionNames,
    scoutMembershipKey,
    scoutPluralMessage,
    scoutRoleLabel,
    splitScoutList,
} from "./scoutUiHelpers"
import type { PluralKeys } from "../../i18n/plural"

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
    // Returns the FULL ordered list. It used to end on `.slice(0, MAX_COMFORT)`
    // and the tail was gone; the cap now lives in the rendering, where the
    // hidden part can still be opened.
    return [...signals]
        .filter((signal) => signal.games > 0)
        .sort((a, b) => b.games - a.games || compareChampionNames(a.championName, b.championName))
}

/**
 * A signal list whose tail collapses.
 *
 * The head stays open, the rest sits behind a counted summary. NOTHING IS
 * DROPPED — `splitScoutList` hands back the input in order, unlike the
 * `slice()` calls above it, which cut a ranked list where the tail really is
 * the least relevant part.
 *
 * One `ScoutSignalRow` call site, used for both halves: two would be two places
 * to forget a prop, which is exactly the shape of defect the KDA guards in
 * tests/scoutKdaVisibility.test.ts exist to catch.
 */
function ScoutSignalList({
    signals,
    moreKeys,
    previewCount = SCOUT_LIST_PREVIEW_COUNT,
}: {
    signals: readonly ChampionSignal[]
    moreKeys: PluralKeys
    /** How many rows stay open. Each list keeps the size it always had. */
    previewCount?: number
}) {
    const { t } = useTranslation()
    const { visible, collapsed, collapsedCount } = splitScoutList(signals, previewCount)
    const rows = (items: readonly ChampionSignal[]) => (
        <ul className="scout-signal-list">
            {items.map((signal) => (
                <ScoutSignalRow key={signal.championName} signal={signal} />
            ))}
        </ul>
    )

    return (
        <>
            {rows(visible)}
            {collapsedCount > 0 && (
                <details className="scout-details scout-list-details">
                    <summary>{scoutPluralMessage(t, collapsedCount, moreKeys)}</summary>
                    {rows(collapsed)}
                </details>
            )}
        </>
    )
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
    const bans = splitScoutList(player.targetBans, MAX_BANS)
    // ONE ScoutBanRow call site for both halves, and `startRank` keeps the
    // numbering running across the fold. `forPlayerId` is why this lives here
    // rather than in a shared component: this card IS one player, and an
    // overlap ban lands in several cards, so without it every card would print
    // the candidate's global target KDA.
    const banRows = (items: readonly BanCandidate[], startRank: number) => (
        <ol className="scout-ban-list">
            {items.map((candidate, index) => (
                <ScoutBanRow
                    key={candidate.championName}
                    candidate={candidate}
                    rank={startRank + index + 1}
                    forPlayerId={player.playerId}
                />
            ))}
        </ol>
    )

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
                        <ScoutSignalList
                            signals={player.signals}
                            previewCount={MAX_THREATS}
                            moreKeys={SCOUT_MORE_THREATS_KEYS}
                        />
                    )}

                    <h5 className="scout-group-heading">{t("scout_banCandidates")}</h5>
                    {player.targetBans.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <>
                            {banRows(bans.visible, 0)}
                            {bans.collapsedCount > 0 && (
                                <details className="scout-details scout-list-details">
                                    <summary>
                                        {scoutPluralMessage(
                                            t,
                                            bans.collapsedCount,
                                            SCOUT_MORE_BANS_KEYS,
                                        )}
                                    </summary>
                                    {banRows(bans.collapsed, bans.visible.length)}
                                </details>
                            )}
                        </>
                    )}

                    <h5 className="scout-group-heading">{t("scout_comfortPicks")}</h5>
                    {comfort.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ScoutSignalList
                            signals={comfort}
                            previewCount={MAX_COMFORT}
                            moreKeys={SCOUT_MORE_COMFORT_KEYS}
                        />
                    )}

                    <h5 className="scout-group-heading">{t("scout_weaknesses")}</h5>
                    {player.weaknesses.length === 0 ? (
                        <ScoutNoDataNote variant="none" />
                    ) : (
                        <ScoutSignalList
                            signals={player.weaknesses}
                            moreKeys={SCOUT_MORE_WEAKNESSES_KEYS}
                        />
                    )}
                </>
            )}
        </section>
    )
}
