/**
 * The question asked before a re-parse throws away scout data.
 *
 * WHY NOT `window.confirm`: this decision has THREE outcomes — archive the
 * data, discard it, or do not re-parse at all. A native confirm has two, and
 * squeezing "keep" and "discard" into OK/Cancel would make cancelling
 * impossible; the user would have to choose between two irreversible options
 * just to get out of the dialog.
 *
 * The affected players are listed by name with how much work is at stake, so
 * "Daten verwerfen" is a decision and not a guess.
 *
 * Cancelling — the third outcome — is the conventional `×` control, named by
 * `scout_reparseCancel` so a screen reader announces it, plus Escape and a click
 * on the backdrop.
 */

import { useEffect, useRef } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { ScoutPlayer, ScoutPlayerData, ScoutPlayerId } from "../../scout/types"

interface Props {
    /** Players that are about to fall out of the roster *and* carry data. */
    affected: readonly ScoutPlayer[]
    playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>
    onKeep: () => void
    onDiscard: () => void
    onCancel: () => void
}

export function ScoutReparseDialog({ affected, playerData, onKeep, onDiscard, onCancel }: Props) {
    const { t } = useTranslation()
    const keepButtonRef = useRef<HTMLButtonElement | null>(null)

    // Escape cancels — the outcome that changes nothing is the one reachable
    // without reading anything, exactly as a modal should behave.
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCancel()
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [onCancel])

    // Focus the safe option, never the destructive one.
    useEffect(() => {
        keepButtonRef.current?.focus()
    }, [])

    return (
        <div
            className="scout-dialog-backdrop"
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onCancel()
            }}
        >
            <div
                className="scout-panel scout-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="scout-reparse-title"
                aria-describedby="scout-reparse-body"
            >
                <div className="scout-panel-head scout-dialog-head">
                    <h3 className="scout-subheading" id="scout-reparse-title">
                        {t("scout_reparseConfirmTitle")}
                    </h3>
                    <button
                        type="button"
                        className="secondary-button scout-dialog-close"
                        aria-label={t("scout_reparseCancel")}
                        title={t("scout_reparseCancel")}
                        onClick={onCancel}
                    >
                        ×
                    </button>
                </div>

                <p id="scout-reparse-body">{t("scout_reparseConfirmBody")}</p>

                <ul className="scout-dialog-list">
                    {affected.map((player) => {
                        const data = playerData[player.id]
                        const entryCount = data?.entries.length ?? 0
                        const hasNote =
                            typeof data?.note === "string" && data.note.trim().length > 0
                        return (
                            <li key={player.id} className="scout-dialog-row">
                                <strong className="scout-player-name">{player.displayName}</strong>
                                <span className="muted">
                                    {t("scout_manualTitle")}: {entryCount}
                                </span>
                                {hasNote && <span className="muted">{t("scout_manual_note")}</span>}
                            </li>
                        )
                    })}
                </ul>

                <div className="scout-button-row">
                    {/* The non-destructive option first and styled as primary. */}
                    <button
                        type="button"
                        className="scout-primary-button"
                        onClick={onKeep}
                        ref={keepButtonRef}
                    >
                        {t("scout_reparseKeepData")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button scout-dialog-discard"
                        onClick={onDiscard}
                    >
                        {t("scout_reparseDiscard")}
                    </button>
                </div>
            </div>
        </div>
    )
}
