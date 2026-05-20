import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
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
        const result = await syncRiotMatches(session!.access_token, activeTeam!.id)
        setBusy(false)
        if (typeof result === "string") {
            const msg =
                result === "riot_account_not_linked"
                    ? "Bitte zuerst Riot-Account verknüpfen."
                    : result === "riot_rate_limited"
                    ? "Rate Limit erreicht. Bitte kurz warten."
                    : result
            showFeedback(msg, false)
        } else {
            showFeedback(buildSyncMessage(result), true)
        }
    }

    function buildSyncMessage(r: SyncResult): string {
        const base = `${r.imported} neue Match${r.imported === 1 ? "" : "es"} gespeichert.`
        return r.moreMayBeAvailable ? base + " Weitere verfügbar." : base
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">Riot-Account</span>

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
                        {busy ? "Lädt…" : "Syncen"}
                    </button>
                    {onGoToPlayerResults && (
                        <button
                            type="button"
                            className="secondary-button"
                            style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                            onClick={onGoToPlayerResults}
                        >
                            Player Results →
                        </button>
                    )}
                </div>
            ) : (
                <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    Kein Riot-Account verknüpft.{" "}
                    {onGoToPlayerResults && (
                        <button
                            type="button"
                            className="secondary-button"
                            style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                            onClick={onGoToPlayerResults}
                        >
                            Verknüpfen →
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
