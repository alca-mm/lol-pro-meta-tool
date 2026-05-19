import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { canManageMembers, canChangeRoles, canRemoveMembers } from "../../teams/teamService"
import type { TeamRole } from "../../teams/teamService"

const ROLES: TeamRole[] = ["owner", "admin", "player"]

export function TeamMembersPanel() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { activeTeam, members, myRole, addMember, removeMember, updateMemberRole } = useTeam()
    const [newUsername, setNewUsername] = useState("")
    const [busy, setBusy] = useState(false)
    const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

    if (!activeTeam || !user) return null

    function showFeedback(msg: string, ok: boolean) {
        setFeedback({ msg, ok })
        window.setTimeout(() => setFeedback(null), 2500)
    }

    async function handleAdd() {
        if (!newUsername.trim()) return
        setBusy(true)
        const err = await addMember(newUsername.trim())
        setBusy(false)
        if (err) {
            showFeedback(err === "team_memberNotFound" ? t("team_memberNotFound") : err, false)
        } else {
            setNewUsername("")
            showFeedback(t("team_memberAdded"), true)
        }
    }

    async function handleRemove(userId: string) {
        setBusy(true)
        const err = await removeMember(userId)
        setBusy(false)
        if (err) {
            showFeedback(err, false)
        } else {
            showFeedback(t("team_memberRemoved"), true)
        }
    }

    async function handleRoleChange(userId: string, role: TeamRole) {
        const err = await updateMemberRole(userId, role)
        if (err) showFeedback(err, false)
    }

    const roleLabel: Record<TeamRole, string> = {
        owner: t("team_owner"),
        admin: t("team_admin"),
        player: t("team_player"),
    }

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <span className="panel-title">{t("team_manageMembers")}</span>

            {members.length === 0 ? (
                <p className="muted" style={{ margin: "0.5rem 0 0" }}>{t("team_noMembers")}</p>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem", fontSize: "0.85rem" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>{t("team_username")}</th>
                            <th style={{ textAlign: "left", paddingBottom: "0.25rem" }}>{t("team_role")}</th>
                            {canRemoveMembers(myRole) && <th />}
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((member) => (
                            <tr key={member.user_id}>
                                <td style={{ paddingRight: "1rem", paddingBottom: "0.25rem" }}>
                                    {member.username}
                                    {member.user_id === user.id && (
                                        <span className="muted" style={{ marginLeft: "0.35rem", fontSize: "0.75rem" }}>
                                            (you)
                                        </span>
                                    )}
                                </td>
                                <td style={{ paddingRight: "1rem", paddingBottom: "0.25rem" }}>
                                    {canChangeRoles(myRole) && member.user_id !== user.id ? (
                                        <select
                                            value={member.role}
                                            onChange={(e) =>
                                                void handleRoleChange(member.user_id, e.target.value as TeamRole)
                                            }
                                            disabled={busy}
                                            style={{ fontSize: "0.8rem" }}
                                        >
                                            {ROLES.map((r) => (
                                                <option key={r} value={r}>{roleLabel[r]}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span>{roleLabel[member.role]}</span>
                                    )}
                                </td>
                                {canRemoveMembers(myRole) && (
                                    <td style={{ paddingBottom: "0.25rem" }}>
                                        {member.user_id !== user.id && (
                                            <button
                                                type="button"
                                                className="btn-danger"
                                                style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}
                                                disabled={busy}
                                                onClick={() => void handleRemove(member.user_id)}
                                            >
                                                {t("team_removeMember")}
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {canManageMembers(myRole) && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
                    <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder={t("team_username")}
                        disabled={busy}
                        style={{ maxWidth: "12rem", fontSize: "0.85rem" }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAdd() }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !newUsername.trim()}
                        onClick={() => void handleAdd()}
                    >
                        {t("team_addMember")}
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
        </div>
    )
}
