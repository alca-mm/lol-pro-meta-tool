import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import {
    parseRiotId,
    linkRiotAccount,
    syncRiotMatches,
    getMyPlayerAccount,
    type PlayerAccount,
    type SyncResult,
    type SyncMode,
} from "../../teams/riotService"

const COOLDOWN_SECS = 30

export function RiotAccountPanel({ onAfterSync }: { onAfterSync?: () => void } = {}) {
    const { user, session } = useAuth()
    const { activeTeam } = useTeam()

    const [account, setAccount] = useState<PlayerAccount | null>(null)
    const [riotIdInput, setRiotIdInput] = useState("")
    const [busy, setBusy] = useState(false)
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
    const [cooldownSecs, setCooldownSecs] = useState(0)
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

    function startCooldown() {
        setCooldownSecs(COOLDOWN_SECS)
        if (cooldownRef.current) clearInterval(cooldownRef.current)
        cooldownRef.current = setInterval(() => {
            setCooldownSecs((s) => {
                if (s <= 1) {
                    clearInterval(cooldownRef.current!)
                    cooldownRef.current = null
                    return 0
                }
                return s - 1
            })
        }, 1000)
    }

    useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }, [])

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

    async function handleLink() {
        const parsed = parseRiotId(riotIdInput)
        if (!parsed) {
            showFeedback("Format: SpielerName#TAG (z.B. mmmmicrocontroler#EUW)", false)
            return
        }
        setBusy(true)
        const err = await linkRiotAccount(
            session!.access_token,
            activeTeam!.id,
            parsed.gameName,
            parsed.tagLine,
        )
        setBusy(false)
        if (err) {
            const msg =
                err === "riot_account_not_found"
                    ? "Riot-Account nicht gefunden. Prüfe Schreibweise und Tag."
                    : err
            showFeedback(msg, false)
        } else {
            setRiotIdInput("")
            showFeedback("Riot-Account verknüpft!", true)
            void loadAccount()
        }
    }

    async function handleSync(mode: SyncMode = "quick") {
        setBusy(true)
        const result = await syncRiotMatches(session!.access_token, activeTeam!.id, mode)
        setBusy(false)
        startCooldown()
        if (typeof result === "string") {
            const msg =
                result === "riot_account_not_linked"
                    ? "Bitte zuerst Riot-Account verknüpfen."
                    : result === "riot_rate_limited"
                    ? "Rate Limit erreicht. Bitte kurz warten und erneut synchronisieren."
                    : result
            showFeedback(msg, false)
        } else {
            showFeedback(buildSyncMessage(result), true)
            onAfterSync?.()
        }
    }

    function buildSyncMessage(r: SyncResult): string {
        const base = `Sync abgeschlossen. ${r.imported} neue Match${r.imported === 1 ? "" : "es"} gespeichert.`
        return r.moreMayBeAvailable
            ? base + " Es könnten weitere Matches verfügbar sein. Synchronisiere erneut."
            : base
    }

    function handleEditAccount() {
        setAccount(null)
        setRiotIdInput("")
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">Riot-Account</span>

            {account ? (
                <div
                    style={{
                        marginTop: "0.4rem",
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                    }}
                >
                    <span style={{ fontWeight: 500 }}>
                        {account.riot_game_name}#{account.riot_tag_line}
                    </span>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy || cooldownSecs > 0}
                        onClick={() => void handleSync("quick")}
                    >
                        {busy ? "Lädt…" : cooldownSecs > 0 ? `Sync (${cooldownSecs}s)` : "Matches syncen"}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy || cooldownSecs > 0}
                        onClick={() => void handleSync("deep")}
                    >
                        {cooldownSecs > 0 ? `Mehr laden (${cooldownSecs}s)` : "Mehr laden"}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy}
                        onClick={handleEditAccount}
                    >
                        Ändern
                    </button>
                </div>
            ) : (
                <div
                    style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        marginTop: "0.5rem",
                    }}
                >
                    <input
                        type="text"
                        value={riotIdInput}
                        onChange={(e) => setRiotIdInput(e.target.value)}
                        placeholder="SpielerName#EUW"
                        disabled={busy}
                        style={{ maxWidth: "14rem", fontSize: "0.85rem" }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleLink()
                        }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !riotIdInput.trim()}
                        onClick={() => void handleLink()}
                    >
                        Verknüpfen
                    </button>
                </div>
            )}

            {feedback && (
                <p
                    className="muted"
                    style={{
                        marginTop: "0.5rem",
                        color: feedback.ok
                            ? "var(--score-pos, #4ade80)"
                            : "var(--score-neg, #f87171)",
                    }}
                >
                    {feedback.msg}
                </p>
            )}

            {account && !busy && cooldownSecs === 0 && (
                <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    Quick: letzte 10 Matches/Queue · Mehr laden: letzte 30/Queue
                </p>
            )}
        </div>
    )
}
