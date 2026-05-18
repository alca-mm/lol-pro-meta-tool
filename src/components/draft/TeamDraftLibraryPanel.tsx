import { useState, useEffect } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { PickSlot } from "../../draft/types"
import type { TeamRole } from "../../teams/teamService"
import type { SavedTeamDraft } from "../../teams/teamDraftsService"
import {
    fetchTeamDrafts,
    saveTeamDraft,
    deleteTeamDraft,
    canDeleteDraft,
} from "../../teams/teamDraftsService"

interface TeamDraftLibraryPanelProps {
    activeTeamId: string | null
    activeTeamName?: string
    currentRole: TeamRole | null
    bluePicks: PickSlot[]
    redPicks: PickSlot[]
    blueBans: string[]
    redBans: string[]
    patch: string | null
    onLoadDraft: (draft: SavedTeamDraft) => void
}

export function TeamDraftLibraryPanel({
    activeTeamId,
    activeTeamName,
    currentRole,
    bluePicks,
    redPicks,
    blueBans,
    redBans,
    patch,
    onLoadDraft,
}: TeamDraftLibraryPanelProps) {
    const { t } = useTranslation()
    const [drafts, setDrafts] = useState<SavedTeamDraft[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [draftName, setDraftName] = useState("")
    const [draftNote, setDraftNote] = useState("")
    const [saving, setSaving] = useState(false)
    const [saveMsg, setSaveMsg] = useState<string | null>(null)
    const [nameError, setNameError] = useState<string | null>(null)

    useEffect(() => {
        if (!activeTeamId) {
            setDrafts([])
            return
        }
        setLoading(true)
        setError(null)
        fetchTeamDrafts(activeTeamId)
            .then(setDrafts)
            .catch(() => setError(t("drafts_error")))
            .finally(() => setLoading(false))
    }, [activeTeamId, t])

    async function handleSave() {
        if (!activeTeamId) return
        const trimmed = draftName.trim()
        if (!trimmed) {
            setNameError(t("drafts_nameRequired"))
            return
        }
        setNameError(null)
        setSaving(true)
        try {
            await saveTeamDraft({
                teamId: activeTeamId,
                name: trimmed,
                note: draftNote,
                patch,
                bluePicks,
                redPicks,
                blueBans,
                redBans,
            })
            const updated = await fetchTeamDrafts(activeTeamId)
            setDrafts(updated)
            setSaveMsg(t("drafts_saved"))
            window.setTimeout(() => setSaveMsg(null), 3000)
            setDraftName("")
            setDraftNote("")
        } catch {
            // save errors are shown via UI feedback only
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(draft: SavedTeamDraft) {
        if (!window.confirm(t("drafts_deleteConfirm"))) return
        await deleteTeamDraft(draft.id)
        if (activeTeamId) {
            const updated = await fetchTeamDrafts(activeTeamId)
            setDrafts(updated)
        }
    }

    function formatUpdatedAt(iso: string): string {
        try {
            return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        } catch {
            return iso
        }
    }

    const title = activeTeamName
        ? `${t("drafts_title")} · ${activeTeamName}`
        : t("drafts_title")

    return (
        <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
            <strong style={{ fontSize: "0.85rem" }}>{title}</strong>

            {!activeTeamId ? (
                <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                    {t("drafts_noTeam")}
                </p>
            ) : (
                <>
                    {/* Save form */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.6rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <input
                                type="text"
                                value={draftName}
                                onChange={(e) => { setDraftName(e.target.value); setNameError(null) }}
                                placeholder={t("drafts_name")}
                                disabled={saving}
                                style={{ maxWidth: "14rem" }}
                                onKeyDown={(e) => { if (e.key === "Enter") void handleSave() }}
                            />
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={saving}
                                onClick={() => void handleSave()}
                            >
                                {t("drafts_saveCurrent")}
                            </button>
                        </div>
                        <textarea
                            value={draftNote}
                            onChange={(e) => setDraftNote(e.target.value)}
                            placeholder={t("drafts_note")}
                            disabled={saving}
                            rows={2}
                            style={{ resize: "vertical", fontSize: "0.85rem", maxWidth: "22rem" }}
                        />
                        {nameError && (
                            <span className="muted" style={{ fontSize: "0.8rem", color: "var(--score-neg, #f87171)" }}>
                                {nameError}
                            </span>
                        )}
                        {saveMsg && (
                            <span className="muted" style={{ fontSize: "0.8rem", color: "var(--score-pos, #4ade80)" }}>
                                {saveMsg}
                            </span>
                        )}
                    </div>

                    {/* Draft list */}
                    <div style={{ marginTop: "0.8rem" }}>
                        <p
                            className="muted"
                            style={{ margin: "0 0 0.4rem", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}
                        >
                            {t("drafts_recent")}
                        </p>
                        {loading && (
                            <p className="muted" style={{ fontSize: "0.85rem" }}>{t("auth_loading")}</p>
                        )}
                        {error && (
                            <p style={{ fontSize: "0.85rem", color: "var(--score-neg, #f87171)" }}>{error}</p>
                        )}
                        {!loading && !error && drafts.length === 0 && (
                            <p className="muted" style={{ fontSize: "0.85rem" }}>{t("drafts_noDrafts")}</p>
                        )}
                        {drafts.map((draft) => (
                            <div
                                key={draft.id}
                                style={{ borderTop: "1px solid var(--color-border, #333)", paddingTop: "0.5rem", marginTop: "0.5rem" }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{draft.name}</span>
                                        {draft.patch && (
                                            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>
                                                {t("drafts_patch")} {draft.patch}
                                            </span>
                                        )}
                                        <br />
                                        <span className="muted" style={{ fontSize: "0.75rem" }}>
                                            {t("drafts_updated")}: {formatUpdatedAt(draft.updatedAt)}
                                        </span>
                                        {draft.note && (
                                            <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", maxWidth: "20rem" }}>
                                                {draft.note.length > 80 ? `${draft.note.slice(0, 80)}…` : draft.note}
                                            </p>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => onLoadDraft(draft)}
                                        >
                                            {t("drafts_load")}
                                        </button>
                                        {canDeleteDraft(currentRole) && (
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={() => void handleDelete(draft)}
                                                style={{ color: "var(--color-danger, #e55)" }}
                                            >
                                                {t("drafts_delete")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
