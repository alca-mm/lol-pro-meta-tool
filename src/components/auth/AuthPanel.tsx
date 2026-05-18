import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"
import { isValidUsername } from "../../auth/usernameAuth"

interface AuthPanelProps {
    onClose: () => void
}

export function AuthPanel({ onClose }: AuthPanelProps) {
    const { t } = useTranslation()
    const { signInWithUsername, signUpWithUsername, loading } = useAuth()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    if (!isSupabaseConfigured) {
        return (
            <div className="auth-panel">
                <p className="muted">{t("auth_unavailable")}</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="auth-panel">
                <p className="muted">{t("auth_loading")}</p>
            </div>
        )
    }

    async function handleAction(action: () => Promise<string | null>) {
        if (!isValidUsername(username)) {
            setError(t("auth_invalidUsername"))
            return
        }
        setError(null)
        setBusy(true)
        const err = await action()
        setBusy(false)
        if (err) {
            setError(err)
        } else {
            onClose()
        }
    }

    const canSubmit = !busy && username.length > 0 && password.length > 0

    return (
        <div className="auth-panel recommendation-section">
            <div style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}>
                <label>
                    {t("auth_username")}
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={busy}
                        autoComplete="username"
                        spellCheck={false}
                    />
                </label>
                <label>
                    {t("auth_password")}
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        autoComplete="current-password"
                    />
                </label>

                {error && (
                    <p className="muted" style={{ color: "var(--score-neg, #f87171)" }}>
                        {t("auth_error")}: {error}
                    </p>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={!canSubmit}
                        onClick={() => handleAction(() => signInWithUsername(username, password))}
                    >
                        {t("auth_login")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={!canSubmit}
                        onClick={() => handleAction(() => signUpWithUsername(username, password))}
                    >
                        {t("auth_signUp")}
                    </button>
                </div>
            </div>
        </div>
    )
}
