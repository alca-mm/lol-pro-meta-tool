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
            style={{ padding: "0.75rem 1rem", borderColor: "var(--color-danger, #e55)" }}
        >
            <strong style={{ fontSize: "0.85rem", color: "var(--color-danger, #e55)" }}>
                {t("team_dangerZone")}
            </strong>
            <div style={{ marginTop: "0.6rem" }}>
                <button
                    type="button"
                    className="secondary-button"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                    style={{ color: "var(--color-danger, #e55)" }}
                >
                    {t("team_deleteTeam")}
                </button>
            </div>
        </div>
    )
}
