import { useState } from "react"
import { useTranslation } from "../i18n/LanguageContext"
import { useAuth } from "../auth/AuthContext"
import { useTeam } from "../teams/TeamContext"
import { canDeleteTeam } from "../teams/teamService"
import { TeamMembersPanel } from "./team/TeamMembersPanel"

export function TeamStatusPanel() {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { teams, activeTeam, loading, myRole, createTeam, setActiveTeam, deleteTeam } = useTeam()
    const [newTeamName, setNewTeamName] = useState("")
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // only render when logged in
    if (!user) return null
    if (loading) return <p className="muted">{t("auth_loading")}</p>

    async function handleCreate() {
        if (!newTeamName.trim()) return
        setCreating(true)
        await createTeam(newTeamName.trim())
        setNewTeamName("")
        setCreating(false)
    }

    async function handleDelete() {
        if (!activeTeam) return
        if (!window.confirm(t("team_deleteConfirm").replace("{name}", activeTeam.name))) return
        setDeleting(true)
        await deleteTeam(activeTeam.id)
        setDeleting(false)
    }

    return (
        <>
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                {activeTeam ? (
                    <span>
                        <strong>{t("team_activeTeam")}:</strong>{" "}
                        <span>{activeTeam.name}</span>
                    </span>
                ) : (
                    <span className="muted">{t("team_noTeam")}</span>
                )}

                {teams.length > 1 && (
                    <select
                        value={activeTeam?.id ?? ""}
                        onChange={(e) => setActiveTeam(e.target.value)}
                        style={{ maxWidth: "12rem" }}
                    >
                        {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                                {team.name}
                            </option>
                        ))}
                    </select>
                )}

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder={t("team_teamName")}
                        disabled={creating}
                        style={{ maxWidth: "10rem" }}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCreate() }}
                    />
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleCreate()}
                        disabled={creating || !newTeamName.trim()}
                    >
                        {t("team_create")}
                    </button>
                    {activeTeam && canDeleteTeam(myRole) && (
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleDelete()}
                            disabled={deleting}
                            style={{ color: "var(--color-danger, #e55)" }}
                        >
                            {t("team_deleteTeam")}
                        </button>
                    )}
                </div>
            </div>
        </div>
        <TeamMembersPanel />
        </>
    )
}
