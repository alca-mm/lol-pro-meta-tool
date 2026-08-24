/**
 * Small presentational building blocks shared by the scout panels.
 * No state, no data fetching — pure rendering of already-computed values.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { BanCandidate, ChampionSignal, ScoutConfidence, ScoutPlayerId, ScoutReason, ScoutRoleFit, ScoutRoleViabilityEvidence, ScoutWarning } from "../../scout/types"
import {
    banCandidateKda,
    banRoleLabels,
    describeRoleViabilityEvidence,
    fillPlaceholders,
    formatScoutNumber,
    scoutBanPhaseKey,
    scoutBanPriorityLabel,
    scoutConfidenceKey,
    scoutKdaLabel,
    scoutRoleFitKey,
    splitScoutReasons,
    summarizeBanCandidate,
    translateScoutReason,
    translateScoutWarning,
} from "./scoutUiHelpers"

/**
 * How a signal's own role relates to the role its player is set up for.
 *
 * Rendered only when the engine actually decided: `unknown` means "no lineup,
 * or nothing to compare against", and a badge reading "Rolle unklar" on every
 * row of a session without a lineup would be noise, not information.
 */
function ScoutRoleFitBadge({ roleFit }: { roleFit: ScoutRoleFit }) {
    const { t } = useTranslation()
    if (roleFit === "unknown") return null
    return <span className={`scout-chip scout-rolefit-${roleFit}`}>{t(scoutRoleFitKey(roleFit))}</span>
}

/** Confidence pill. `none` is rendered as its own state, never as "low". */
export function ScoutConfidenceBadge({ confidence }: { confidence: ScoutConfidence }) {
    const { t } = useTranslation()
    return (
        <span className={`scout-confidence scout-confidence-${confidence}`}>
            {t("scout_confidence")}: {t(scoutConfidenceKey(confidence))}
        </span>
    )
}

/**
 * The justifications behind a recommendation.
 *
 * The leading ones stay in the open, the rest sit behind a collapsed block.
 * NOTHING IS DROPPED — see `splitScoutReasons`, whose two halves are the input
 * list in order. The split exists because a real session rendered 275 reason
 * lines across 40 rows, and a reason past the second on an already-accepted row
 * is diagnosis rather than justification.
 */
export function ScoutReasonList({
    reasons,
    evidence,
}: {
    reasons: readonly ScoutReason[]
    /**
     * Role-gate numbers for this row, if any. They go into the SAME collapsed
     * block as the reason tail: the verdict itself is already an open reason,
     * and a second `details` per row would be exactly the clutter this panel
     * spent 0.7.0 removing.
     */
    evidence?: ScoutRoleViabilityEvidence
}) {
    const { t } = useTranslation()
    if (reasons.length === 0) return null

    const { visible, collapsed } = splitScoutReasons(reasons)
    const evidenceLines = describeRoleViabilityEvidence(t, evidence)
    const hasDetails = collapsed.length > 0 || evidenceLines.length > 0

    return (
        <>
            <ul className="scout-reason-list">
                {visible.map((reason, index) => (
                    <li key={`${reason.code}-${index}`}>{translateScoutReason(t, reason)}</li>
                ))}
            </ul>
            {hasDetails && (
                <details className="scout-details scout-reason-details">
                    <summary>{t("scout_moreReasons")}</summary>
                    <ul className="scout-reason-list">
                        {collapsed.map((reason, index) => (
                            <li key={`${reason.code}-${index}`}>
                                {translateScoutReason(t, reason)}
                            </li>
                        ))}
                        {evidenceLines.map((line, index) => (
                            <li key={`evidence-${index}`} className="muted">
                                {line}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </>
    )
}

/** Warning block. `severity` drives colour/icon only — never the wording. */
export function ScoutWarningList({ warnings }: { warnings: readonly ScoutWarning[] }) {
    const { t } = useTranslation()
    if (warnings.length === 0) return null
    return (
        <ul className="scout-warning-list">
            {warnings.map((warning, index) => (
                <li
                    key={`${warning.code}-${warning.playerId ?? ""}-${warning.championName ?? ""}-${index}`}
                    className={`scout-warning scout-warning-${warning.severity}`}
                >
                    <span aria-hidden="true" className="scout-warning-icon">
                        {warning.severity === "info" ? "i" : "!"}
                    </span>
                    <span>
                        {translateScoutWarning(t, warning)}
                        {warning.championName ? ` (${warning.championName})` : ""}
                    </span>
                </li>
            ))}
        </ul>
    )
}

/** `Champion` plus `14 Spiele · 62% · KDA 3.2` and every reason behind the signal. */
export function ScoutSignalRow({ signal }: { signal: ChampionSignal }) {
    const { t } = useTranslation()
    // `null` whenever no row behind this champion stated a KDA, which is the
    // common case. The segment then disappears instead of announcing that
    // something is unknown on every single line.
    const kdaLabel = scoutKdaLabel(t, signal.kda)
    return (
        <li className="scout-signal">
            <div className="scout-signal-head">
                <strong className="scout-signal-champion">{signal.championName}</strong>
                <span className="muted scout-signal-facts">
                    {signal.games} {t("common_games")}
                    {signal.winrate !== null ? ` · ${formatScoutNumber(signal.winrate)}%` : ""}
                    {kdaLabel !== null ? ` · ${kdaLabel}` : ""}
                </span>
                <ScoutRoleFitBadge roleFit={signal.roleFit} />
                {signal.fromSubstitute && (
                    <span
                        className="scout-chip scout-chip-substitute"
                        title={t("scout_onlyIfPlayerStarts")}
                    >
                        {t("scout_substituteRisk")}
                    </span>
                )}
                <span className={`scout-chip scout-chip-${signal.confidence}`}>
                    {t(scoutConfidenceKey(signal.confidence))}
                </span>
            </div>
            {signal.fromSubstitute && (
                <p className="scout-substitute-note">{t("scout_onlyIfPlayerStarts")}</p>
            )}
            <ScoutReasonList
                reasons={signal.reasons}
                evidence={signal.roleViabilityEvidence}
            />
        </li>
    )
}

/**
 * One ban candidate with its lane, its priority, its flex flag and all its
 * reasons.
 *
 * The lane suffixes are appended to the champion name on purpose — the i18n
 * texts are lower-case and unpunctuated so the row reads as one phrase:
 * "Karma gegen Mid". They come from `banRoleLabels()` and are empty when no
 * lineup is known, which is the only honest output in that case.
 *
 * `forPlayerId` IS REQUIRED OF EVERY PER-PLAYER LIST. The same candidate shows
 * up under each player it hits, so a row rendered under "Spieler B" has to
 * read the KDA off player B, not off the candidate's global target. Only the
 * team-wide plan, which claims no player, leaves it out. See
 * `banCandidateKda()` for the full argument.
 */
export function ScoutBanRow({
    candidate,
    rank,
    forPlayerId,
    displayNameById,
}: {
    candidate: BanCandidate
    rank: number
    forPlayerId?: ScoutPlayerId
    /**
     * Player names, so the row can say WHO a ban hits.
     *
     * Optional because only the team plan needs it: a per-player card already
     * names its player in the heading above the row. Without it the affected
     * line simply does not render, rather than printing raw ids.
     */
    displayNameById?: Readonly<Record<ScoutPlayerId, string>>
}) {
    const { t } = useTranslation()
    const roleLabels = banRoleLabels(t, candidate)
    const priorityLabel = scoutBanPriorityLabel(t, candidate)
    const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))
    // The facts the ban panel used to express by repeating this candidate under
    // its phase, under "hits several players" and under every player it hits.
    const context = summarizeBanCandidate(candidate, displayNameById)

    return (
        <li className="scout-ban">
            <div className="scout-signal-head">
                <span className="scout-ban-rank">{rank}.</span>
                <strong className="scout-signal-champion">{candidate.championName}</strong>
                {roleLabels.length > 0 && (
                    <span className="scout-ban-lane">{roleLabels.join(" · ")}</span>
                )}
                {/*
                  * Priority and KDA share ONE span, joined by the same middot
                  * the signal row and the export use between facts. Two
                  * sibling spans carry identical styling and only the flex
                  * gap between them, so the two figures would read as one run
                  * — and the ban row would be the only place in the tab with a
                  * third separator convention.
                  *
                  * BOTH numbers name themselves. `Priorität 67% · KDA 3.2`:
                  * one labelled figure beside one bare one invites reading the
                  * bare one as more of the same.
                  */}
                <span className="muted scout-signal-facts">
                    {priorityLabel}
                    {kdaLabel !== null ? ` · ${kdaLabel}` : ""}
                </span>
                {context.phase !== undefined && (
                    <span className={`scout-chip scout-ban-phase-${context.phase}`}>
                        {t(scoutBanPhaseKey(context.phase))}
                    </span>
                )}
                {/*
                  THAT the ban hits several players, at a glance. This replaces
                  the separate "overlap bans" list, which said the same thing by
                  printing every one of these candidates a second time. Driven by
                  the engine's own `isOverlap`, not by how many names resolved,
                  so it stays truthful on a per-player card that passes no name
                  lookup at all. WHO it hits is the line below.
                */}
                {context.isOverlap && (
                    <span className="scout-chip scout-chip-overlap">
                        {fillPlaceholders(t("scout_banOverlapBadge"), {
                            count: context.affectedPlayerCount,
                        })}
                    </span>
                )}
                <ScoutRoleFitBadge roleFit={candidate.roleFit} />
                <span className={`scout-chip scout-chip-${candidate.confidence}`}>
                    {t(scoutConfidenceKey(candidate.confidence))}
                </span>
            </div>
            {/*
              WHO the ban hits, by name. This is the one thing a `BanCandidate`
              cannot say for itself, and it is what the per-player ban groups
              used to convey by rendering the whole candidate again under each
              player. Only shown when it adds something: a single affected
              player is already named by `banRoleLabels` and the target line.
            */}
            {context.affectedPlayerNames.length > 1 && (
                <p className="muted scout-ban-affected">
                    {fillPlaceholders(t("scout_banAffectedPlayers"), {
                        players: context.affectedPlayerNames.join(", "),
                    })}
                </p>
            )}
            {candidate.isFlex && <p className="scout-flex-warning">{t("scout_flexWarning")}</p>}
            {candidate.substituteOnly && (
                <p className="scout-substitute-note">{t("scout_banSubstituteOnly")}</p>
            )}
            {/* The candidate's numbers come from the signal the ban is aimed at,
                so the row explains the champion the user is actually reading. */}
            <ScoutReasonList
                reasons={candidate.reasons}
                evidence={
                    candidate.signals.find(
                        (signal) => signal.playerId === candidate.targetPlayerId,
                    )?.roleViabilityEvidence ?? candidate.signals[0]?.roleViabilityEvidence
                }
            />
        </li>
    )
}

/** Shared empty/low-data note so no panel ever invents a recommendation. */
export function ScoutNoDataNote({ variant }: { variant: "none" | "low" }) {
    const { t } = useTranslation()
    return (
        <p className="scout-nodata">{variant === "none" ? t("scout_noAnalysis") : t("scout_lowData")}</p>
    )
}
