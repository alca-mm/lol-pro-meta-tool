/**
 * Team ban plan: the prioritised list, the three ban phases, the overlap bans,
 * the per-player target bans and every warning the engine raised.
 *
 * The warning list rendered here is `ScoutAnalysis.warnings` — the session-wide
 * set, of which `TeamBanPlan.warnings` is a subset. Rendering both would show
 * the flex/sample/stale warnings twice.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { ScoutAnalysisResult } from "../../scout/analysis"
import type { BanCandidate, ScoutBanPhases, ScoutPlayerId } from "../../scout/types"
import { ScoutBanRow, ScoutWarningList } from "./ScoutShared"
import { scoutRoleLabel } from "./scoutUiHelpers"
import type { TranslationKey } from "../../i18n/types"

const MAX_PRIORITIZED = 8
const MAX_TARGET_PER_PLAYER = 3

const PHASE_HEADINGS: ReadonlyArray<{ key: keyof ScoutBanPhases; label: TranslationKey }> = [
    { key: "safe", label: "scout_safeBans" },
    { key: "target", label: "scout_targetBans" },
    { key: "situational", label: "scout_situationalBans" },
]

export function ScoutBanPlanPanel({ analysis }: { analysis: ScoutAnalysisResult }) {
    const { t } = useTranslation()
    const { banPlan } = analysis
    const hasBans = banPlan.prioritizedBans.length > 0

    return (
        <div className="scout-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_teamPlanTitle")}</h3>
            </div>

            <ScoutWarningList warnings={analysis.warnings} />

            {!hasBans ? (
                <p className="scout-nodata">{t("scout_teamPlanEmpty")}</p>
            ) : (
                <>
                    <ol className="scout-ban-list">
                        {banPlan.prioritizedBans.slice(0, MAX_PRIORITIZED).map((candidate, index) => (
                            <ScoutBanRow
                                key={candidate.championName}
                                candidate={candidate}
                                rank={index + 1}
                            />
                        ))}
                    </ol>

                    {banPlan.phases && (
                        <div className="scout-phase-grid">
                            {PHASE_HEADINGS.map((phase) => (
                                <BanGroup
                                    key={phase.key}
                                    heading={t(phase.label)}
                                    candidates={banPlan.phases?.[phase.key] ?? []}
                                />
                            ))}
                        </div>
                    )}

                    <BanGroup heading={t("scout_overlapBans")} candidates={banPlan.overlapBans} />

                    <h5 className="scout-group-heading">{t("scout_targetBans")}</h5>
                    <div className="scout-phase-grid">
                        {analysis.players.map((player) => (
                            <BanGroup
                                key={player.playerId}
                                // The declared slot, or the parser's guess marked
                                // as one — see ScoutAnalysisPanel.
                                heading={`${player.displayName} · ${
                                    scoutRoleLabel(t, player.lineup.starterSlot, player.role).text
                                }`}
                                candidates={(banPlan.targetBansByPlayer[player.playerId] ?? []).slice(
                                    0,
                                    MAX_TARGET_PER_PLAYER,
                                )}
                                // The heading names this player, so the rows
                                // must show this player's numbers. The phase
                                // and overlap groups above claim no player and
                                // deliberately pass nothing.
                                forPlayerId={player.playerId}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

function BanGroup({
    heading,
    candidates,
    forPlayerId,
}: {
    heading: string
    candidates: readonly BanCandidate[]
    /** Set only by a group whose heading names a player. See `ScoutBanRow`. */
    forPlayerId?: ScoutPlayerId
}) {
    const { t } = useTranslation()
    return (
        <section className="scout-ban-group">
            <h5 className="scout-group-heading">{heading}</h5>
            {candidates.length === 0 ? (
                <p className="scout-nodata">{t("scout_teamPlanEmpty")}</p>
            ) : (
                <ol className="scout-ban-list">
                    {candidates.map((candidate, index) => (
                        <ScoutBanRow
                            key={candidate.championName}
                            candidate={candidate}
                            rank={index + 1}
                            forPlayerId={forPlayerId}
                        />
                    ))}
                </ol>
            )}
        </section>
    )
}
