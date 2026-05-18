import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"

interface AuthPanelProps {
    onClose: () => void
}

export function AuthPanel({ onClose }: AuthPanelProps) {
    const { t } = useTranslation()
    const { signInWithEmail, signUpWithEmail, signInWithMagicLink, loading } = useAuth()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
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
        setError(null)
        setInfo(null)
        setBusy(true)
        const err = await action()
        setBusy(false)
        if (err) {
            setError(err)
        } else {
            onClose()
        }
    }

    async function handleMagicLink() {
        if (!email) return
        setError(null)
        setInfo(null)
        setBusy(true)
        const err = await signInWithMagicLink(email)
        setBusy(false)
        if (err) {
            setError(err)
        } else {
            setInfo(t("auth_magicLinkSent"))
        }
    }

    return (
        <div className="auth-panel recommendation-section">
            <div style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}>
                <label>
                    {t("auth_email")}
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={busy}
                        autoComplete="email"
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

                {error && <p className="muted" style={{ color: "var(--score-neg, #f87171)" }}>{t("auth_error")}: {error}</p>}
                {info && <p className="muted" style={{ color: "var(--score-pos, #4ade80)" }}>{info}</p>}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email || !password}
                        onClick={() => handleAction(() => signInWithEmail(email, password))}
                    >
                        {t("auth_login")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email || !password}
                        onClick={() => handleAction(() => signUpWithEmail(email, password))}
                    >
                        {t("auth_signUp")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || !email}
                        onClick={handleMagicLink}
                    >
                        {t("auth_sendMagicLink")}
                    </button>
                </div>
            </div>
        </div>
    )
}
