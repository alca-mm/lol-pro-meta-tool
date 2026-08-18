/**
 * Archive of players that fell out of the input on a re-parse.
 *
 * This panel is the visible half of the re-parse protection: nothing the user
 * typed disappears without a place to get it back from. The other half lives in
 * TournamentScout's `handleParse`, which puts a dropped player here instead of
 * deleting their rows.
 *
 * The panel renders nothing at all while the archive is empty — an empty
 * "Archiv entfernter Spieler" box would only suggest that something was lost.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import { SCOUT_REMOVED_PLAYERS_MAX } from "../../scout/types"
import type { ScoutPlayerId, ScoutRemovedPlayer } from "../../scout/types"
import {
    fillPlaceholders,
    scoutRoleKey,
    sortRemovedPlayers,
    translateScoutWarning,
} from "./scoutUiHelpers"

interface Props {
    removedPlayers: Readonly<Record<ScoutPlayerId, ScoutRemovedPlayer>>
    onRestore: (playerId: ScoutPlayerId) => void
    onDiscard: (playerId: ScoutPlayerId) => void
}

export function ScoutRemovedPlayersPanel({ removedPlayers, onRestore, onDiscard }: Props) {
    const { t } = useTranslation()

    // Newest first: what was just lost is what the user is looking for.
    const entries = sortRemovedPlayers(removedPlayers)
    if (entries.length === 0) return null

    return (
        <div className="scout-panel scout-archive-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_removedPlayersTitle")}</h3>
                {/* A bare number: none of the `scout_count*` texts describes an
                    archive, and bending one of them would put a wrong sentence
                    ("Erkannte Spieler") on a list of removed ones. */}
                <span className="scout-chip">{entries.length}</span>
            </div>
            {/* `data_loss_on_reparse` is the one warning code `analyzeScout()`
                never emits — it describes the *archive*, not the analysis, so
                it is stated here where the fact lives. The count is real: it is
                the number of entries in this list. */}
            <p className="scout-warning scout-warning-warning">
                {translateScoutWarning(t, {
                    code: "data_loss_on_reparse",
                    severity: "warning",
                    params: { count: entries.length },
                })}
            </p>
            <p className="muted">{t("scout_removedPlayersHint")}</p>
            {/* Shown from the first entry on, not only once the cap bites: by the
                time an entry is silently dropped it is too late to warn. */}
            <p className="muted scout-archive-cap">
                {fillPlaceholders(t("scout_removedPlayersCapped"), { max: SCOUT_REMOVED_PLAYERS_MAX })}
            </p>

            <ul className="scout-archive-list">
                {entries.map((removed) => (
                    <li key={removed.player.id} className="scout-archive-row">
                        <div className="scout-archive-identity">
                            <strong className="scout-player-name">{removed.player.displayName}</strong>
                            <span className="scout-chip">{t(scoutRoleKey(removed.player.role))}</span>
                            {/* What exactly is being kept here — the manual rows.
                                Without this the two buttons ask the user to
                                decide about an unknown amount of work. */}
                            <span className="muted scout-archive-facts">
                                {t("scout_manualTitle")}: {removed.data.entries.length}
                            </span>
                            {typeof removed.data.note === "string" &&
                                removed.data.note.trim().length > 0 && (
                                    <span className="muted scout-archive-facts">
                                        {t("scout_manual_note")}
                                    </span>
                                )}
                        </div>
                        <div className="scout-button-row">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => onRestore(removed.player.id)}
                            >
                                {t("scout_restorePlayer")}
                            </button>
                            <button
                                type="button"
                                className="secondary-button scout-archive-discard"
                                onClick={() => onDiscard(removed.player.id)}
                            >
                                {t("scout_discardRemovedPlayer")}
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
