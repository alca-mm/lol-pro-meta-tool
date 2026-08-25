/**
 * Team ban plan: ONE prioritised list of ban candidates, its two filters, a
 * per-player overview and every warning the engine raised.
 *
 * The phase chips and the overlap toggle both NARROW that one list. Neither
 * opens a list of its own, which is the whole difference between them and the
 * groupings 0.7.4 removed.
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
import { filterAvailableBanCandidates } from "../../draft/draftAvailability"
import type { DraftSlot } from "../../draft/draftState"
import {
    SCOUT_MORE_BANS_KEYS,
    SCOUT_ROLE_GATE_UNJUDGED_KEYS,
    banOverlapFilterOption,
    banPhaseFilterOptions,
    fillPlaceholders,
    filterBans,
    isBanOverlapFilterEnabled,
    isBanPhaseFilterEnabled,
    rankBanCandidates,
    scoutBanListEmptyKey,
    scoutBanPhaseFilterKey,
    scoutPluralMessage,
    scoutRoleGateStatusKey,
    scoutRoleLabel,
    splitScoutList,
} from "./scoutUiHelpers"
import type { RankedBanCandidate, ScoutBanPhaseFilter } from "./scoutUiHelpers"

const MAX_PRIORITIZED = 8
const MAX_TARGET_PER_PLAYER = 3

export function ScoutBanPlanPanel({
    analysis,
    draftBoard,
}: {
    analysis: ScoutAnalysisResult
    /**
     * The live draft, so a champion already picked or banned there stops being
     * offered as a ban.
     *
     * Optional, and an omitted board means "no draft to account for" rather than
     * "everything is taken": the scout tab has always worked on its own, and it
     * must keep working when nobody has opened the draft.
     */
    draftBoard?: readonly DraftSlot[]
}) {
    const { t } = useTranslation()
    const { banPlan } = analysis
    const [phaseFilter, setPhaseFilter] = useState<ScoutBanPhaseFilter>("all")
    // The second filter, and deliberately NOT persisted: it is a way of reading
    // the current plan, not a setting. A stored toggle would greet the next
    // session with a list that hides most of its rows for a reason the user set
    // days ago.
    const [overlapOnly, setOverlapOnly] = useState(false)

    const hasBans = banPlan.prioritizedBans.length > 0
    // Ranks are taken from the FULL list, before anything is filtered away, so
    // "#7" keeps meaning "seventh most important ban overall" under every chip.
    const ranked = rankBanCandidates(banPlan.prioritizedBans)
    /*
      DRAFT AVAILABILITY, AND IT SITS EXACTLY HERE: after the rank is stamped,
      before every other filter and before the cap.

      After ranking, because a champion the draft took must not renumber the
      ones that remain - "#7" goes on meaning seventh most important ban overall,
      which is the same promise the phase chips make.

      Before the phase and overlap filters, because everything downstream has to
      count the same list it shows. Filtering last would let a chip read
      "Gezielt: 4" and then open a list of two.

      This is VISIBILITY ONLY. No score is recomputed, no candidate is reordered,
      and `analyzeScout` never learns the draft exists.
    */
    const available = filterAvailableBanCandidates(
        ranked,
        draftBoard ?? [],
        (entry) => entry.candidate.championName,
    )
    // How many the draft removed, so the empty state can say WHY the list is
    // empty rather than blaming the filters.
    const takenByDraft = ranked.length - available.length
    // Both controls count through `filterBans`, the same function that produces
    // the list below, and all three start from `available`. A chip therefore
    // cannot promise a number the list fails to show. The phase counts shrink
    // while the overlap toggle is on, because that is what pressing them would
    // actually open.
    const filterOptions = banPhaseFilterOptions(available, overlapOnly)
    const overlapOption = banOverlapFilterOption(available, phaseFilter, overlapOnly)
    // FILTER FIRST, SPLIT SECOND. The other way round would cap the full list at
    // eight and only then throw away what does not match, so "Gezielt" would
    // show whichever targeted bans happened to fall inside the first eight and
    // silently hide the rest.
    const visibleBans = filterBans(available, phaseFilter, overlapOnly)
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
                        {scoutPluralMessage(
                            t,
                            analysis.roleGate.unjudgedChampions,
                            SCOUT_ROLE_GATE_UNJUDGED_KEYS,
                        )}
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
                      The second filter, in its own group so a screen reader
                      hears what it does rather than a fifth phase. It COMBINES
                      with the phase chips instead of replacing them: "Gezielt"
                      plus this toggle is the targeted bans that hit more than
                      one player.

                      Still ONE list. This narrows the canonical list; it does
                      not open the separate "overlap bans" list that 0.7.4
                      deleted, and a candidate is rendered at most once either
                      way.
                    */}
                    <div
                        className="scout-ban-overlap-filter"
                        role="group"
                        aria-label={t("scout_banOverlapFilterLabel")}
                    >
                        <button
                            type="button"
                            className={`scout-chip scout-ban-overlap-chip${
                                overlapOnly ? " scout-ban-overlap-chip-active" : ""
                            }`}
                            // Announced, not just coloured, exactly like the
                            // phase chips. CSS adds the same non-colour marker.
                            aria-pressed={overlapOnly}
                            disabled={!isBanOverlapFilterEnabled(overlapOption)}
                            onClick={() => setOverlapOnly(!overlapOnly)}
                        >
                            {fillPlaceholders(t("scout_banOverlapFilterCount"), {
                                label: t("scout_banOverlapFilterOnly"),
                                count: overlapOption.count,
                            })}
                        </button>
                    </div>

                    {/*
                      Reachable although an empty filter is disabled: editing the
                      scout data re-runs the analysis, so the selection can empty
                      out under a control that is already pressed. The active
                      chip and the active toggle deliberately stay enabled in
                      that case (see isBanPhaseFilterEnabled and
                      isBanOverlapFilterEnabled), so this is what the user sees.

                      WHICH sentence is a rule, not an inline condition: the
                      overlap message names the control that is actually hiding
                      the rows. See scoutBanListEmptyKey.
                    */}
                    {visibleBans.length === 0 ? (
                        /*
                          `role="status"` ON THE EMPTY STATE, and deliberately
                          not on the list around it. This paragraph appears
                          because the user pressed something, and a sighted user
                          sees the rows vanish; without a live region a screen
                          reader user hears "pressed" and nothing else, so the
                          one fact that matters - the filter emptied the list -
                          never reaches them.

                          It is scoped to this paragraph on purpose. A live
                          region over the whole ban list would re-announce every
                          row on every chip press, which is the noise this panel
                          spent 0.7.0 removing.

                          `role="status"` carries polite + atomic by itself.
                          NEVER `aria-live="assertive"`: a filter result is not
                          an emergency, and assertive would cut off whatever the
                          user is currently hearing. Bare `role="status"` is
                          also what the rest of the scout uses.
                        */
                        <p className="scout-nodata" role="status">
                            {t(scoutBanListEmptyKey(overlapOnly, available.length === 0 && takenByDraft > 0))}
                        </p>
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
