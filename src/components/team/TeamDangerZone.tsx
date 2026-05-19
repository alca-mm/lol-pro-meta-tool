import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useTeam } from "../../teams/TeamContext"
import { canDeleteTeam } from "../../teams/teamService"

export function TeamDangerZone() {
    const { t } = useTranslation()
    const { activeTeam, myRole, deleteTeam } = useTeam()
    const [deleting, setDeleting] = useState(false)

    if (!activeTeam || !canDeleteTeam(myRole)) return null

    async function handleDelete() {
        if (!activeTeam) return
        if (!window.confirm(t("team_deleteConfirm").replace("{name}", activeTeam.name))) return
        setDeleting(true)
        await deleteTeam(activeTeam.id)
        setDeleting(false)
    }

    return (
        <div
            className="recommendation-section"
            style={{ padding: "0.75rem 1rem", borderColor: "var(--danger, #ff4d4d)" }}
        >
            <span className="panel-title" style={{ color: "var(--danger, #ff4d4d)" }}>
                {t("team_dangerZone")}
            </span>
            <div style={{ marginTop: "0.6rem" }}>
                <button
                    type="button"
                    className="btn-danger"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                >
                    {t("team_deleteTeam")}
                </button>
            </div>
        </div>
    )
}
