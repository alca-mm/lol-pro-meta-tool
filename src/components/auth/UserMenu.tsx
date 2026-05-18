import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"
import { authEmailToUsername } from "../../auth/usernameAuth"
import { deleteOwnAccount } from "../../auth/accountService"
import { setActiveTeamId } from "../../teams/teamService"

interface UserMenuProps {
    onShowLogin: () => void
}

export function UserMenu({ onShowLogin }: UserMenuProps) {
    const { t } = useTranslation()
    const { user, loading, signOut } = useAuth()
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    if (!isSupabaseConfigured) return null

    if (loading) return <span className="muted">{t("auth_loading")}</span>

    if (!user) {
        return (
            <button type="button" className="lang-btn" onClick={onShowLogin}>
                {t("auth_login")}
            </button>
        )
    }

    const displayName = authEmailToUsername(user.email)

    async function handleDeleteAccount() {
        if (!window.confirm(t("auth_deleteAccountConfirm"))) return
        setDeleting(true)
        setDeleteError(null)
        const err = await deleteOwnAccount()
        if (err) {
            setDeleteError(t(err as Parameters<typeof t>[0]))
            setDeleting(false)
            return
        }
        // Account deleted server-side. signOut() may fail because the auth user
        // no longer exists — catch and ignore, then force a clean page reload.
        setActiveTeamId(null)
        await signOut().catch(() => undefined)
        window.location.reload()
    }

    return (
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
                {t("auth_loggedInAs")} {displayName}
            </span>
            <button type="button" className="lang-btn" onClick={() => void signOut()}>
                {t("auth_logout")}
            </button>
            <button
                type="button"
                className="lang-btn"
                onClick={() => void handleDeleteAccount()}
                disabled={deleting}
                style={{ color: "var(--color-danger, #e55)", fontSize: "0.75rem" }}
                title={t("auth_deleteAccount")}
            >
                {deleting ? t("auth_deletingAccount") : t("auth_deleteAccount")}
            </button>
            {deleteError && (
                <span className="muted" style={{ color: "var(--color-danger, #e55)", fontSize: "0.75rem" }}>
                    {deleteError}
                </span>
            )}
        </span>
    )
}
