import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import { ALL_CHAMPIONS } from "../../analysis/championCatalog"
import type { ChampionNote, ChampionNoteRating } from "../../notes/types"
import { loadNotes, saveNote, deleteNote } from "../../notes/storage"
import { loadTeamNotes, saveTeamNote, deleteTeamNote } from "../../notes/teamNotesService"
import { isTeamModeActive } from "../../notes/notesMode"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { isSupabaseConfigured } from "../../lib/supabase"

const RATINGS: ChampionNoteRating[] = ["comfort", "blind", "pocket", "situational", "avoid"]

interface ChampionNotesPanelProps {
    pickedChampions: string[]
}

export function ChampionNotesPanel({ pickedChampions }: ChampionNotesPanelProps) {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { activeTeam } = useTeam()

    const teamMode = isTeamModeActive(
        isSupabaseConfigured,
        user?.id ?? null,
        activeTeam?.id ?? null,
    )

    const [notes, setNotes] = useState<Record<string, ChampionNote>>({})
    const [loadingNotes, setLoadingNotes] = useState(false)
    const [notesError, setNotesError] = useState<string | null>(null)
    const [selectedChampion, setSelectedChampion] = useState("")
    const [editNote, setEditNote] = useState("")
    const [editTags, setEditTags] = useState("")
    const [editRating, setEditRating] = useState<ChampionNoteRating | "">("")
    const [savedFlash, setSavedFlash] = useState(false)

    const loadAllNotes = useCallback(async () => {
        setLoadingNotes(true)
        setNotesError(null)
        try {
            const loaded = teamMode && activeTeam
                ? await loadTeamNotes(activeTeam.id)
                : loadNotes()
            setNotes(loaded)
        } catch (err) {
            setNotesError(err instanceof Error ? err.message : "Load error")
        } finally {
            setLoadingNotes(false)
        }
    }, [teamMode, activeTeam])

    useEffect(() => {
        void loadAllNotes()
    }, [loadAllNotes])

    useEffect(() => {
        if (!selectedChampion) return
        const existing = notes[selectedChampion]
        if (existing) {
            setEditNote(existing.note)
            setEditTags(existing.tags.join(", "))
            setEditRating(existing.rating ?? "")
        } else {
            setEditNote("")
            setEditTags("")
            setEditRating("")
        }
    }, [selectedChampion, notes])

    async function handleSave() {
        if (!selectedChampion) return
        const entry: ChampionNote = {
            championName: selectedChampion,
            note: editNote.trim(),
            tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
            rating: (editRating || null) as ChampionNoteRating | null,
            updatedAt: new Date().toISOString(),
        }
        if (teamMode && activeTeam && user) {
            const err = await saveTeamNote(activeTeam.id, entry, user.id)
            if (err) { setNotesError(err); return }
        } else {
            saveNote(entry)
        }
        await loadAllNotes()
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 1500)
    }

    async function handleDelete() {
        if (!selectedChampion) return
        if (teamMode && activeTeam) {
            const err = await deleteTeamNote(activeTeam.id, selectedChampion)
            if (err) { setNotesError(err); return }
        } else {
            deleteNote(selectedChampion)
        }
        await loadAllNotes()
        setEditNote("")
        setEditTags("")
        setEditRating("")
    }

    const relevantNotes = pickedChampions.map((name) => notes[name]).filter(Boolean)

    const modeLabel = teamMode && activeTeam
        ? `${t("cn_modeTeam")} ${activeTeam.name}`
        : t("cn_modeLocal")

    return (
        <div className="recommendation-section">
            <div className="champion-picker-header">
                <h3>{t("cn_title")}</h3>
                <span className="muted" style={{ fontSize: "0.8rem" }}>{modeLabel}</span>
            </div>

            {notesError && (
                <p className="muted" style={{ color: "var(--score-neg, #f87171)" }}>
                    {t("auth_error")}: {notesError}
                </p>
            )}

            {pickedChampions.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                    <p className="muted">
                        <strong>{t("cn_relevantNotes")}</strong>
                    </p>
                    {relevantNotes.length === 0 ? (
                        <p className="muted">{t("cn_noDraftedNotes")}</p>
                    ) : (
                        relevantNotes.map((n) => (
                            <div
                                key={n.championName}
                                className="recommendation-card"
                                style={{ marginBottom: "0.5rem", cursor: "pointer" }}
                                onClick={() => setSelectedChampion(n.championName)}
                                title={t("cn_editNote")}
                            >
                                <strong>{n.championName}</strong>
                                {n.rating && (
                                    <span className="draft-comp-pill" style={{ marginLeft: "0.5rem" }}>
                                        {t(`cn_rating_${n.rating}` as TranslationKey)}
                                    </span>
                                )}
                                {n.tags.length > 0 && (
                                    <span className="muted"> · {n.tags.join(", ")}</span>
                                )}
                                {n.note && (
                                    <p className="muted" style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
                                        {n.note}
                                    </p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            <div style={{ display: "grid", gap: "0.5rem" }}>
                <label>
                    {t("cn_selectChampion")}
                    <select
                        value={selectedChampion}
                        onChange={(e) => setSelectedChampion(e.target.value)}
                        disabled={loadingNotes}
                    >
                        <option value="">—</option>
                        {ALL_CHAMPIONS.map((name) => (
                            <option key={name} value={name}>
                                {name}{notes[name] ? " ·" : ""}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    {t("cn_note")}
                    <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        rows={3}
                        disabled={!selectedChampion || loadingNotes}
                        style={{ resize: "vertical" }}
                    />
                </label>

                <label>
                    {t("cn_tags")}
                    <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        disabled={!selectedChampion || loadingNotes}
                        placeholder="e.g. top, carry, peel"
                    />
                </label>

                <label>
                    {t("cn_rating")}
                    <select
                        value={editRating}
                        onChange={(e) => setEditRating(e.target.value as ChampionNoteRating | "")}
                        disabled={!selectedChampion || loadingNotes}
                    >
                        <option value="">{t("cn_noRating")}</option>
                        {RATINGS.map((r) => (
                            <option key={r} value={r}>
                                {t(`cn_rating_${r}` as TranslationKey)}
                            </option>
                        ))}
                    </select>
                </label>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleSave()}
                        disabled={!selectedChampion || loadingNotes}
                    >
                        {savedFlash ? t("cn_saved") : t("cn_save")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleDelete()}
                        disabled={!selectedChampion || !notes[selectedChampion] || loadingNotes}
                    >
                        {t("cn_delete")}
                    </button>
                </div>
            </div>
        </div>
    )
}
