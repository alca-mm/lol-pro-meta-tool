import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"

interface UserMenuProps {
    onShowLogin: () => void
}

export function UserMenu({ onShowLogin }: UserMenuProps) {
    const { t } = useTranslation()
    const { user, loading, signOut } = useAuth()

    if (!isSupabaseConfigured) return null

    if (loading) return <span className="muted">{t("auth_loading")}</span>

    if (!user) {
        return (
            <button type="button" className="lang-btn" onClick={onShowLogin}>
                {t("auth_login")}
            </button>
        )
    }

    return (
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="muted" style={{ fontSize: "0.8rem" }}>{user.email}</span>
            <button type="button" className="lang-btn" onClick={() => void signOut()}>
                {t("auth_logout")}
            </button>
        </span>
    )
}
