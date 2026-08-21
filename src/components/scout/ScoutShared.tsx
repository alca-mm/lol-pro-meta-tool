/**
 * Small presentational building blocks shared by the scout panels.
 * No state, no data fetching — pure rendering of already-computed values.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { BanCandidate, ChampionSignal, ScoutConfidence, ScoutPlayerId, ScoutReason, ScoutRoleFit, ScoutWarning } from "../../scout/types"
import {
    banCandidateKda,
    banRoleLabels,
    formatScoutNumber,
    scoutBanPriorityLabel,
    scoutConfidenceKey,
    scoutKdaLabel,
    scoutRoleFitKey,
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

/** Every justification of a recommendation — not just the first one. */
export function ScoutReasonList({ reasons }: { reasons: readonly ScoutReason[] }) {
    const { t } = useTranslation()
    if (reasons.length === 0) return null
    return (
        <ul className="scout-reason-list">
            {reasons.map((reason, index) => (
                <li key={`${reason.code}-${index}`}>{translateScoutReason(t, reason)}</li>
            ))}
        </ul>
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
            <ScoutReasonList reasons={signal.reasons} />
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
}: {
    candidate: BanCandidate
    rank: number
    forPlayerId?: ScoutPlayerId
}) {
    const { t } = useTranslation()
    const roleLabels = banRoleLabels(t, candidate)
    const priorityLabel = scoutBanPriorityLabel(t, candidate)
    const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))

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
                <ScoutRoleFitBadge roleFit={candidate.roleFit} />
                <span className={`scout-chip scout-chip-${candidate.confidence}`}>
                    {t(scoutConfidenceKey(candidate.confidence))}
                </span>
            </div>
            {candidate.isFlex && <p className="scout-flex-warning">{t("scout_flexWarning")}</p>}
            {candidate.substituteOnly && (
                <p className="scout-substitute-note">{t("scout_banSubstituteOnly")}</p>
            )}
            <ScoutReasonList reasons={candidate.reasons} />
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
