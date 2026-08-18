/**
 * Team lineup builder: five starting slots, three substitute seats and the pool
 * of players that sit on neither.
 *
 * WHY THIS PANEL EXISTS: without a lineup the analysis knows a player's role
 * only from what the parser guessed out of the pasted text. With one, a ban
 * recommendation can name a lane ("Karma gegen Mid"), an entry recorded on a
 * different role is marked as such, and a bench player can be kept out of the
 * plan entirely.
 *
 * DUPLICATE INVARIANT: a player occupies at most one of the eight seats. The
 * `<select>` of a seat therefore only offers players that are still in the pool
 * (plus its own current occupant) — the user cannot even express a double
 * assignment. `assignPlayerToSlot()` refuses one anyway and the panel shows
 * `scout_alreadyAssigned`; that path is the belt to the UI's braces.
 *
 * Every role label comes from `scout_role_*` (which is where "ADC" for the bot
 * slot lives) — this panel never spells a slot name itself.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type {
    ScoutLineup,
    ScoutLineupSummary,
    ScoutPlayer,
    ScoutPlayerId,
} from "../../scout/types"
import { SCOUT_LINEUP_SLOTS, SCOUT_SUBSTITUTE_SLOTS } from "../../scout/types"
import {
    lineupSlotPlayerId,
    scoutLineupTargetKey,
    scoutRoleKey,
    type ScoutLineupAssignError,
    type ScoutLineupTarget,
} from "./scoutUiHelpers"

interface Props {
    players: readonly ScoutPlayer[]
    lineup: ScoutLineup
    summary: ScoutLineupSummary
    includeSubstitutes: boolean
    /** `null` clears the seat; a player id assigns. */
    onAssign: (target: ScoutLineupTarget, playerId: ScoutPlayerId | null) => void
    onAutofill: () => void
    onClear: () => void
    onIncludeSubstitutesChange: (value: boolean) => void
    /** Set by the container when an assignment was refused; `null` otherwise. */
    assignError: ScoutLineupAssignError | null
}

export function ScoutLineupPanel({
    players,
    lineup,
    summary,
    includeSubstitutes,
    onAssign,
    onAutofill,
    onClear,
    onIncludeSubstitutesChange,
    assignError,
}: Props) {
    const { t } = useTranslation()

    const byId = new Map<ScoutPlayerId, ScoutPlayer>(players.map((player) => [player.id, player]))
    const poolPlayers = summary.unassignedPlayerIds
        .map((id) => byId.get(id))
        .filter((player): player is ScoutPlayer => player !== undefined)

    const starterTargets: ScoutLineupTarget[] = SCOUT_LINEUP_SLOTS.map((slot) => ({
        kind: "starter",
        slot,
    }))
    const substituteTargets: ScoutLineupTarget[] = SCOUT_SUBSTITUTE_SLOTS.map((slot) => ({
        kind: "substitute",
        slot,
    }))

    return (
        <div className="scout-panel scout-lineup-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_lineupTitle")}</h3>
            </div>
            <p className="muted">{t("scout_lineupHint")}</p>

            {players.length === 0 ? (
                <p className="scout-nodata">{t("scout_noPlayers")}</p>
            ) : (
                <>
                    <div className="scout-button-row">
                        <button type="button" className="secondary-button" onClick={onAutofill}>
                            {t("scout_lineupAutofill")}
                        </button>
                        <button type="button" className="secondary-button" onClick={onClear}>
                            {t("scout_lineupClear")}
                        </button>
                    </div>
                    {/* Always visible, not only after pressing: the button offers a
                        guess, and the caveat has to be readable before the click. */}
                    <p className="muted scout-lineup-autofill-hint">{t("scout_lineupAutofillHint")}</p>

                    {assignError === "already_assigned" && (
                        <p className="scout-error" role="alert">
                            {t("scout_alreadyAssigned")}
                        </p>
                    )}

                    <h5 className="scout-group-heading">{t("scout_startingFive")}</h5>
                    <div className="scout-lineup-grid">
                        {starterTargets.map((target) => (
                            <ScoutLineupSlotRow
                                key={`starter-${target.slot}`}
                                target={target}
                                lineup={lineup}
                                poolPlayers={poolPlayers}
                                byId={byId}
                                onAssign={onAssign}
                            />
                        ))}
                    </div>

                    <p
                        className={
                            summary.isStartingFiveComplete
                                ? "scout-lineup-state scout-lineup-complete"
                                : "scout-lineup-state scout-lineup-incomplete"
                        }
                        role="status"
                    >
                        {summary.isStartingFiveComplete
                            ? t("scout_lineupComplete")
                            : t("scout_lineupIncomplete")}
                    </p>
                    {!summary.isStartingFiveComplete && summary.missingStarterSlots.length > 0 && (
                        <p className="muted scout-lineup-missing">
                            {summary.missingStarterSlots.map((slot) => t(scoutRoleKey(slot))).join(", ")}
                        </p>
                    )}

                    <h5 className="scout-group-heading">{t("scout_substitutes")}</h5>
                    <div className="scout-lineup-grid">
                        {substituteTargets.map((target) => (
                            <ScoutLineupSlotRow
                                key={`substitute-${target.slot}`}
                                target={target}
                                lineup={lineup}
                                poolPlayers={poolPlayers}
                                byId={byId}
                                onAssign={onAssign}
                            />
                        ))}
                    </div>

                    <label className="scout-toggle">
                        <input
                            type="checkbox"
                            checked={includeSubstitutes}
                            onChange={(event) => onIncludeSubstitutesChange(event.target.checked)}
                        />
                        <span>{t("scout_includeSubstitutes")}</span>
                    </label>
                    <p className="muted">{t("scout_includeSubstitutesHint")}</p>

                    {/* Hidden entirely when everyone has a seat: an empty pool is
                        not a state that needs explaining, and there is no honest
                        text for "nothing here" that would not read as a claim
                        about the lineup being complete. */}
                    {poolPlayers.length > 0 && (
                        <>
                            <h5 className="scout-group-heading">{t("scout_unassigned")}</h5>
                            <p className="muted">{t("scout_unassignedHint")}</p>
                            <ul className="scout-pool-list">
                                {poolPlayers.map((player) => (
                                    <li key={player.id} className="scout-pool-player">
                                        <strong className="scout-player-name">
                                            {player.displayName}
                                        </strong>
                                        <span className="scout-chip">
                                            {t(scoutRoleKey(player.role))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}
        </div>
    )
}

/**
 * One seat. The `<select>` lists only players that are free plus the seat's own
 * occupant — that is what makes a double assignment unreachable rather than
 * merely discouraged.
 */
function ScoutLineupSlotRow({
    target,
    lineup,
    poolPlayers,
    byId,
    onAssign,
}: {
    target: ScoutLineupTarget
    lineup: ScoutLineup
    poolPlayers: readonly ScoutPlayer[]
    byId: ReadonlyMap<ScoutPlayerId, ScoutPlayer>
    onAssign: (target: ScoutLineupTarget, playerId: ScoutPlayerId | null) => void
}) {
    const { t } = useTranslation()

    const occupantId = lineupSlotPlayerId(lineup, target)
    const occupant = occupantId === null ? undefined : byId.get(occupantId)
    const label = t(scoutLineupTargetKey(target))
    const selectId = `scout-lineup-${target.kind}-${target.slot}`

    const options = occupant === undefined ? poolPlayers : [occupant, ...poolPlayers]

    return (
        <div className={`scout-lineup-slot scout-lineup-slot-${target.kind}`}>
            <label className="scout-entry-label" htmlFor={selectId}>
                {label}
            </label>
            <select
                id={selectId}
                value={occupantId ?? ""}
                aria-label={`${label} — ${t("scout_assignTo")}`}
                title={t("scout_assignTo")}
                onChange={(event) =>
                    onAssign(target, event.target.value === "" ? null : event.target.value)
                }
            >
                <option value="">{t("scout_lineupEmptySlot")}</option>
                {options.map((player) => (
                    <option key={player.id} value={player.id}>
                        {player.displayName}
                    </option>
                ))}
            </select>
            {occupant !== undefined && (
                <button
                    type="button"
                    className="secondary-button scout-lineup-release"
                    onClick={() => onAssign(target, null)}
                >
                    {t("scout_moveToPool")}
                </button>
            )}
        </div>
    )
}
