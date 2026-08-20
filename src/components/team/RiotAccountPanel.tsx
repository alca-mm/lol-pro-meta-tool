import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { useTranslation } from "../../i18n/LanguageContext"
import { riotErrorMessage, riotSyncSuccessMessage } from "./teamUiHelpers"
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
    const { t } = useTranslation()

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
            showFeedback(t("team_riot_formatHint"), false)
            return
        }
        setBusy(true)
        // No catch on purpose: riotService never throws any more, it reports failures as an
        // error string. Swallowing a truly unexpected exception here would turn it into a
        // silent "nothing happened"; without a catch it stays visible in the console while
        // the finally still guarantees the button leaves its loading state.
        try {
            const err = await linkRiotAccount(
                session!.access_token,
                activeTeam!.id,
                parsed.gameName,
                parsed.tagLine,
            )
            if (err) {
                showFeedback(riotErrorMessage(t, err), false)
            } else {
                setRiotIdInput("")
                showFeedback(t("team_riot_linkSuccess"), true)
                void loadAccount()
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

    async function handleSync(mode: SyncMode = "quick") {
        setBusy(true)
        // No catch here either - see handleLink() above for the reasoning.
        try {
            const result = await syncRiotMatches(session!.access_token, activeTeam!.id, mode)
            // startCooldown() deliberately stays INSIDE the try, after the request and before
            // the success/error branch: the rate-limit cooldown must keep applying to failed
            // syncs too. Do not move it into one of the branches, and do not move it into the
            // finally either - there it would additionally run for an exception, which is not
            // what happens today.
            startCooldown()
            if (typeof result === "string") {
                showFeedback(riotErrorMessage(t, result), false)
            } else {
                showFeedback(buildSyncMessage(result), true)
                onAfterSync?.()
            }
        } finally {
            // Same reordering as in handleLink(): setBusy(false) now runs after
            // startCooldown()/showFeedback(...) instead of before them. Not observable -
            // React 18 batches these updates into one re-render, so
            // disabled={busy || cooldownSecs > 0} never sees an intermediate state.
            setBusy(false)
        }
    }

    function buildSyncMessage(r: SyncResult): string {
        return riotSyncSuccessMessage(t, r, "panel")
    }

    /** Pure substitution of the one `{secs}` placeholder the cooldown labels carry. */
    function withSecs(template: string): string {
        return template.split("{secs}").join(String(cooldownSecs))
    }

    function handleEditAccount() {
        setAccount(null)
        setRiotIdInput("")
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
                        disabled={busy || cooldownSecs > 0}
                        onClick={() => void handleSync("quick")}
                    >
                        {busy
                            ? t("team_riot_loading")
                            : cooldownSecs > 0
                            ? withSecs(t("team_riot_syncCooldown"))
                            : t("team_riot_sync")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy || cooldownSecs > 0}
                        onClick={() => void handleSync("deep")}
                    >
                        {cooldownSecs > 0
                            ? withSecs(t("team_riot_loadMoreCooldown"))
                            : t("team_riot_loadMore")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                        disabled={busy}
                        onClick={handleEditAccount}
                    >
                        {t("team_riot_change")}
                    </button>
                </div>
            ) : (
                <div className="button-row">
                    <input
                        type="text"
                        value={riotIdInput}
                        onChange={(e) => setRiotIdInput(e.target.value)}
                        placeholder={t("team_riot_inputPlaceholder")}
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
                        {t("team_riot_link")}
                    </button>
                </div>
            )}

            {feedback && (
                <p className={`muted feedback-msg ${feedback.ok ? "feedback-ok" : "feedback-err"}`}>
                    {feedback.msg}
                </p>
            )}

            {account && !busy && cooldownSecs === 0 && (
                <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    {t("team_riot_modeHint")}
                </p>
            )}
        </div>
    )
}
