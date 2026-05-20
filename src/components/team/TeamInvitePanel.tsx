import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useTeam } from "../../teams/TeamContext"
import { canManageMembers, formatExpiry } from "../../teams/teamService"

export function TeamInvitePanel() {
    const { t } = useTranslation()
    const { activeTeam, invites, myRole, createInvite, revokeInvite } = useTeam()
    const [creating, setCreating] = useState(false)
    const [newCode, setNewCode] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

    if (!activeTeam || !canManageMembers(myRole)) return null

    function showFeedback(msg: string, ok: boolean) {
        setFeedback({ msg, ok })
        window.setTimeout(() => setFeedback(null), 2500)
    }

    function copyToClipboard(code: string) {
        void navigator.clipboard.writeText(code).then(() => showFeedback(t("invite_copied"), true))
    }

    async function handleCreate() {
        setCreating(true)
        setNewCode(null)
        const result = await createInvite()
        setCreating(false)
        if (typeof result === "string") {
            showFeedback(result, false)
        } else {
            setNewCode(result.code)
        }
    }

    async function handleRevoke(id: string) {
        const err = await revokeInvite(id)
        if (err) showFeedback(err, false)
        else showFeedback(t("invite_revoked"), true)
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">{t("invite_manageInvites")}</span>

            {invites.length === 0 ? (
                <p className="empty-state">{t("invite_noInvites")}</p>
            ) : (
                <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {invites.map((inv) => {
                        const remaining = formatExpiry(inv.expires_at)
                        return (
                            <div key={inv.id} className="button-row" style={{ marginTop: 0, fontSize: "0.85rem" }}>
                                <code style={{ letterSpacing: "0.05em", userSelect: "all" }}>{inv.code}</code>
                                {remaining && <span className="muted" style={{ fontSize: "0.75rem" }}>{remaining}</span>}
                                <button
                                    type="button"
                                    className="secondary-button"
                                    style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                                    onClick={() => copyToClipboard(inv.code)}
                                >
                                    {t("invite_copy")}
                                </button>
                                <button
                                    type="button"
                                    className="btn-danger"
                                    style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                                    onClick={() => void handleRevoke(inv.id)}
                                >
                                    {t("invite_revoke")}
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            <div className="button-row">
                <button
                    type="button"
                    className="secondary-button"
                    disabled={creating}
                    onClick={() => void handleCreate()}
                >
                    {t("invite_createInvite")}
                </button>
                {newCode && (
                    <>
                        <input
                            readOnly
                            value={newCode}
                            onFocus={(e) => e.target.select()}
                            style={{ fontFamily: "monospace", letterSpacing: "0.05em", maxWidth: "14rem", fontSize: "0.85rem" }}
                        />
                        <button
                            type="button"
                            className="secondary-button"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => copyToClipboard(newCode)}
                        >
                            {t("invite_copy")}
                        </button>
                    </>
                )}
            </div>

            {feedback && (
                <p className={`muted feedback-msg ${feedback.ok ? "feedback-ok" : "feedback-err"}`}>
                    {feedback.msg}
                </p>
            )}
        </div>
    )
}
