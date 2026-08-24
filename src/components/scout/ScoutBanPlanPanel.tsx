/**
 * Team ban plan: ONE prioritised list of ban candidates, a phase summary, a
 * per-player overview and every warning the engine raised.
 *
 * Until 0.7.4 this panel also rendered the three ban phases, the overlap bans
 * and the per-player target bans as four more lists of FULL ban rows. They held
 * the same candidates as the prioritised list, so a single champion could
 * occupy four rows with four copies of its reasons. The groupings are gone; the
 * facts behind them ride on the row itself as badges (see `ScoutBanRow`).
 *
 * The warning list rendered here is `ScoutAnalysis.warnings` — the session-wide
 * set, of which `TeamBanPlan.warnings` is a subset. Rendering both would show
 * the flex/sample/stale warnings twice.
 */

import { useState } from "react"

import { useTranslation } from "../../i18n/LanguageContext"
import type { ScoutAnalysisResult } from "../../scout/analysis"
import type { ScoutPlayerId } from "../../scout/types"
import { ScoutBanRow, ScoutWarningList } from "./ScoutShared"
import {
    SCOUT_MORE_BANS_KEYS,
    banPhaseFilterOptions,
    fillPlaceholders,
    filterBansByPhase,
    isBanPhaseFilterEnabled,
    rankBanCandidates,
    scoutBanPhaseFilterKey,
    scoutPluralMessage,
    scoutRoleGateStatusKey,
    scoutRoleLabel,
    splitScoutList,
} from "./scoutUiHelpers"
import type { RankedBanCandidate, ScoutBanPhaseFilter } from "./scoutUiHelpers"

const MAX_PRIORITIZED = 8
const MAX_TARGET_PER_PLAYER = 3

export function ScoutBanPlanPanel({ analysis }: { analysis: ScoutAnalysisResult }) {
    const { t } = useTranslation()
    const { banPlan } = analysis
    const [phaseFilter, setPhaseFilter] = useState<ScoutBanPhaseFilter>("all")

    const hasBans = banPlan.prioritizedBans.length > 0
    // Ranks are taken from the FULL list, before anything is filtered away, so
    // "#7" keeps meaning "seventh most important ban overall" under every chip.
    const ranked = rankBanCandidates(banPlan.prioritizedBans)
    const filterOptions = banPhaseFilterOptions(ranked)
    // FILTER FIRST, SPLIT SECOND. The other way round would cap the full list at
    // eight and only then throw away the phases that do not match, so "Gezielt"
    // would show whichever targeted bans happened to fall inside the first eight
    // and silently hide the rest.
    const visibleBans = filterBansByPhase(ranked, phaseFilter)
    const prioritized = splitScoutList(visibleBans, MAX_PRIORITIZED)

    // Names for the affected-players line. Built here because the panel is the
    // only place that has both the plan and the roster.
    const displayNameById: Record<ScoutPlayerId, string> = {}
    for (const player of analysis.players) displayNameById[player.playerId] = player.displayName
    // ONE ScoutBanRow call site for both halves, and it deliberately passes NO
    // `forPlayerId`: this is the TEAM plan, it claims no player, so the
    // candidate's own target is the only number it can honestly show.
    const teamRows = (items: readonly RankedBanCandidate[]) => (
        <ol className="scout-ban-list">
            {items.map((entry) => (
                <ScoutBanRow
                    key={entry.candidate.championName}
                    candidate={entry.candidate}
                    rank={entry.rank}
                    displayNameById={displayNameById}
                />
            ))}
        </ol>
    )

    return (
        <div className="scout-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_teamPlanTitle")}</h3>
            </div>

            {/*
              ONE short line, and it is shown in every state including the
              healthy one. "Is the role check even on?" is not answerable from
              the ban list itself: a gate that never ran looks exactly like a
              gate that found nothing, and the difference decides whether the
              user can trust the list. The honesty note and the count sit behind
              the summary.
            */}
            <p className={`scout-role-gate scout-role-gate-${analysis.roleGate.status}`}>
                <span>{t(scoutRoleGateStatusKey(analysis.roleGate.status))}</span>
            </p>
            <details className="scout-details scout-role-gate-details">
                <summary>{t("scout_roleGate_details")}</summary>
                <p className="muted">{t("scout_roleGate_source")}</p>
                {analysis.roleGate.unjudgedChampions > 0 && (
                    <p className="muted">
                        {fillPlaceholders(t("scout_roleGate_unjudged"), {
                            count: analysis.roleGate.unjudgedChampions,
                        })}
                    </p>
                )}
            </details>

            <ScoutWarningList warnings={analysis.warnings} />

            {!hasBans ? (
                <p className="scout-nodata">{t("scout_teamPlanEmpty")}</p>
            ) : (
                <>
                    {/*
                      The phase split, as FILTERS over the one canonical list.
                      Until 0.7.4 this was a static count line, and before that
                      three more lists of full ban rows for the same candidates.
                      Neither comes back: pressing a chip changes WHICH of the
                      prioritised bans are shown, never how often a candidate is
                      rendered. Every row still carries its own phase as a badge.

                      All four chips are always present, empty ones included: a
                      missing "Situativ: 0" would read as "there is no such
                      phase" rather than "nothing landed there".
                    */}
                    <div
                        className="scout-ban-phase-filter"
                        role="group"
                        aria-label={t("scout_banPhaseFilterLabel")}
                    >
                        {filterOptions.map((option) => {
                            const active = option.filter === phaseFilter
                            return (
                                <button
                                    key={option.filter}
                                    type="button"
                                    className={`scout-chip scout-ban-phase-chip${
                                        active ? " scout-ban-phase-chip-active" : ""
                                    }`}
                                    // The pressed state is announced, not just
                                    // coloured. CSS adds a marker on top, so the
                                    // active chip is also recognisable without
                                    // colour.
                                    aria-pressed={active}
                                    disabled={!isBanPhaseFilterEnabled(option, phaseFilter)}
                                    onClick={() => setPhaseFilter(option.filter)}
                                >
                                    {fillPlaceholders(t("scout_banPhaseFilterCount"), {
                                        label: t(scoutBanPhaseFilterKey(option.filter)),
                                        count: option.count,
                                    })}
                                </button>
                            )
                        })}
                    </div>

                    {/*
                      Reachable although an empty phase is disabled: editing the
                      scout data re-runs the analysis, so the selected phase can
                      empty out under a chip that is already pressed. The active
                      chip deliberately stays enabled in that case (see
                      isBanPhaseFilterEnabled), so this is what the user sees.
                    */}
                    {visibleBans.length === 0 ? (
                        <p className="scout-nodata">{t("scout_banPhaseFilterEmpty")}</p>
                    ) : (
                        <>
                            {prioritized.visible.length > 0 && teamRows(prioritized.visible)}
                            {prioritized.collapsedCount > 0 && (
                                <details className="scout-details scout-list-details">
                                    <summary>
                                        {scoutPluralMessage(
                                            t,
                                            prioritized.collapsedCount,
                                            SCOUT_MORE_BANS_KEYS,
                                        )}
                                    </summary>
                                    {teamRows(prioritized.collapsed)}
                                </details>
                            )}
                        </>
                    )}

                    {/*
                      Bans by player, as champion NAMES rather than a second full
                      ban row each. The per-player numbers have a better home:
                      ScoutAnalysisPanel's player card renders the same
                      candidates with that player's own KDA, which is exactly
                      what a per-player view is for.
                    */}
                    <h5 className="scout-group-heading">{t("scout_bansByPlayer")}</h5>
                    <ul className="scout-bans-by-player">
                        {analysis.players.map((player) => {
                            const own = banPlan.targetBansByPlayer[player.playerId] ?? []
                            // The declared slot, or the parser's guess marked as
                            // one — see ScoutAnalysisPanel.
                            const role = scoutRoleLabel(t, player.lineup.starterSlot, player.role)
                            return (
                                <li key={player.playerId}>
                                    <strong className="scout-player-name">
                                        {player.displayName}
                                    </strong>
                                    <span className="muted">{` · ${role.text}: `}</span>
                                    <span>
                                        {own.length === 0
                                            ? t("scout_bansByPlayerNone")
                                            : own
                                                  .slice(0, MAX_TARGET_PER_PLAYER)
                                                  .map((candidate) => candidate.championName)
                                                  .join(", ")}
                                    </span>
                                    {/*
                                      The cut is NAMED rather than silent. A
                                      player can be hit by a dozen candidates,
                                      so this line has to end somewhere, but an
                                      unmarked "Zed, Ahri, Yasuo" claims to be
                                      the whole story. `(+N)` needs no
                                      declension in either language, which is
                                      why it is a figure and not a sentence.
                                      Nothing is unreachable: the player card in
                                      ScoutAnalysisPanel renders the SAME list
                                      in full, with this player's own numbers.
                                    */}
                                    {own.length > MAX_TARGET_PER_PLAYER && (
                                        <span className="muted">
                                            {` (+${own.length - MAX_TARGET_PER_PLAYER})`}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </div>
    )
}
