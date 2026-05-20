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
        <div className="danger-zone">
            <span className="panel-title" style={{ color: "var(--danger)" }}>
                {t("team_dangerZone")}
            </span>
            <div className="button-row">
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
