import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useTeam } from "../../teams/TeamContext"

export function TeamCreatePanel() {
    const { t } = useTranslation()
    const { createTeam, joinTeamWithInvite } = useTeam()

    const [newTeamName, setNewTeamName] = useState("")
    const [creating, setCreating] = useState(false)

    const [joinCode, setJoinCode] = useState("")
    const [joining, setJoining] = useState(false)
    const [joinFeedback, setJoinFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

    function showJoinFeedback(msg: string, ok: boolean) {
        setJoinFeedback({ msg, ok })
        window.setTimeout(() => setJoinFeedback(null), 3000)
    }

    async function handleCreate() {
        if (!newTeamName.trim()) return
        setCreating(true)
        await createTeam(newTeamName.trim())
        setNewTeamName("")
        setCreating(false)
    }

    async function handleJoin() {
        if (!joinCode.trim()) return
        setJoining(true)
        const err = await joinTeamWithInvite(joinCode.trim())
        setJoining(false)
        if (err) {
            showJoinFeedback(err === "invite_invalidCode" ? t("invite_invalidCode") : err, false)
        } else {
            setJoinCode("")
            showJoinFeedback(t("invite_joinSuccess"), true)
        }
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">{t("team_quickActions")}</span>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                {/* Join with invite code */}
                <div className="button-row" style={{ marginTop: 0 }}>
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder={t("invite_joinCodePlaceholder")}
                        disabled={joining}
                        style={{ maxWidth: "13rem", fontFamily: "monospace", letterSpacing: "0.05em" }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleJoin() }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={joining || !joinCode.trim()}
                        onClick={() => void handleJoin()}
                    >
                        {t("invite_join")}
                    </button>
                    {joinFeedback && (
                        <span
                            className={`muted ${joinFeedback.ok ? "feedback-ok" : "feedback-err"}`}
                            style={{ fontSize: "0.8rem" }}
                        >
                            {joinFeedback.msg}
                        </span>
                    )}
                </div>

                {/* Create new team */}
                <div className="button-row" style={{ marginTop: 0 }}>
                    <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder={t("team_teamName")}
                        disabled={creating}
                        style={{ maxWidth: "13rem" }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCreate() }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={creating || !newTeamName.trim()}
                        onClick={() => void handleCreate()}
                    >
                        {t("team_create")}
                    </button>
                </div>
            </div>
        </div>
    )
}
