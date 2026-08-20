import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { useTranslation } from "../../i18n/LanguageContext"
import { riotErrorMessage, riotSyncSuccessMessage } from "./teamUiHelpers"
import {
    syncRiotMatches,
    getMyPlayerAccount,
    type PlayerAccount,
    type SyncResult,
} from "../../teams/riotService"

interface Props {
    onGoToPlayerResults?: () => void
}

export function RiotAccountSummary({ onGoToPlayerResults }: Props) {
    const { user, session } = useAuth()
    const { activeTeam } = useTeam()
    const { t } = useTranslation()

    const [account, setAccount] = useState<PlayerAccount | null>(null)
    const [busy, setBusy] = useState(false)
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

    function showFeedback(msg: string, ok: boolean) {
        setFeedback({ msg, ok })
        window.setTimeout(() => setFeedback(null), 3000)
    }

    const loadAccount = useCallback(async () => {
        if (!activeTeam || !user) return
        const acc = await getMyPlayerAccount(activeTeam.id, user.id)
        setAccount(acc)
    }, [activeTeam, user])

    useEffect(() => {
        void loadAccount()
    }, [loadAccount])

    if (!user || !activeTeam || !session) return null

    async function handleSync() {
        setBusy(true)
        // No catch on purpose: riotService never throws any more, it reports failures as an
        // error string. Swallowing a truly unexpected exception here would turn it into a
        // silent "nothing happened"; without a catch it stays visible in the console while
        // the finally still guarantees the button leaves its loading state.
        try {
            const result = await syncRiotMatches(session!.access_token, activeTeam!.id)
            if (typeof result === "string") {
                showFeedback(riotErrorMessage(t, result), false)
            } else {
                showFeedback(buildSyncMessage(result), true)
            }
        } finally {
            // setBusy(false) now runs AFTER showFeedback(...) instead of before it. That
            // reordering is not observable: React 18 batches all state updates made in the
            // same task, including the ones after an await, so busy=false and the feedback
            // land in one single re-render with the same final state as before. Please do
            // not "fix" this back to a setBusy(false) placed before the branches.
            setBusy(false)
        }
    }

    function buildSyncMessage(r: SyncResult): string {
        return riotSyncSuccessMessage(t, r, "summary")
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">{t("team_riot_title")}</span>

            {account ? (
                <div className="button-row" style={{ fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 500 }}>
                        {account.riot_game_name}#{account.riot_tag_line}
                    </span>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy}
                        onClick={() => void handleSync()}
                    >
                        {busy ? t("team_riot_loading") : t("team_riot_syncShort")}
                    </button>
                    {onGoToPlayerResults && (
                        <button
                            type="button"
                            className="secondary-button"
                            style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                            onClick={onGoToPlayerResults}
                        >
                            {t("team_riot_playerResults")} →
                        </button>
                    )}
                </div>
            ) : (
                <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    {t("team_riot_notLinked")}{" "}
                    {onGoToPlayerResults && (
                        <button
                            type="button"
                            className="secondary-button"
                            style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                            onClick={onGoToPlayerResults}
                        >
                            {t("team_riot_link")} →
                        </button>
                    )}
                </p>
            )}

            {feedback && (
                <p className={`muted feedback-msg ${feedback.ok ? "feedback-ok" : "feedback-err"}`}>
                    {feedback.msg}
                </p>
            )}
        </div>
    )
}
