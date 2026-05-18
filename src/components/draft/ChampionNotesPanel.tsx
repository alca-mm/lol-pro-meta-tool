import { useState, useEffect } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import { ALL_CHAMPIONS } from "../../analysis/championCatalog"
import type { ChampionNoteRating } from "../../notes/types"
import { loadNotes, saveNote, deleteNote } from "../../notes/storage"

const RATINGS: ChampionNoteRating[] = ["comfort", "blind", "pocket", "situational", "avoid"]

interface ChampionNotesPanelProps {
    pickedChampions: string[]
}

export function ChampionNotesPanel({ pickedChampions }: ChampionNotesPanelProps) {
    const { t } = useTranslation()
    const [notes, setNotes] = useState(() => loadNotes())
    const [selectedChampion, setSelectedChampion] = useState("")
    const [editNote, setEditNote] = useState("")
    const [editTags, setEditTags] = useState("")
    const [editRating, setEditRating] = useState<ChampionNoteRating | "">("")
    const [savedFlash, setSavedFlash] = useState(false)

    useEffect(() => {
        if (!selectedChampion) return
        const existing = loadNotes()[selectedChampion]
        if (existing) {
            setEditNote(existing.note)
            setEditTags(existing.tags.join(", "))
            setEditRating(existing.rating ?? "")
        } else {
            setEditNote("")
            setEditTags("")
            setEditRating("")
        }
    }, [selectedChampion])

    function handleSave() {
        if (!selectedChampion) return
        const entry = {
            championName: selectedChampion,
            note: editNote.trim(),
            tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
            rating: (editRating || null) as ChampionNoteRating | null,
            updatedAt: new Date().toISOString(),
        }
        saveNote(entry)
        setNotes(loadNotes())
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 1500)
    }

    function handleDelete() {
        if (!selectedChampion) return
        deleteNote(selectedChampion)
        setNotes(loadNotes())
        setEditNote("")
        setEditTags("")
        setEditRating("")
    }

    const relevantNotes = pickedChampions.map((name) => notes[name]).filter(Boolean)

    return (
        <div className="recommendation-section">
            <div className="champion-picker-header">
                <h3>{t("cn_title")}</h3>
            </div>

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
                        disabled={!selectedChampion}
                        style={{ resize: "vertical" }}
                    />
                </label>

                <label>
                    {t("cn_tags")}
                    <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        disabled={!selectedChampion}
                        placeholder="e.g. top, carry, peel"
                    />
                </label>

                <label>
                    {t("cn_rating")}
                    <select
                        value={editRating}
                        onChange={(e) => setEditRating(e.target.value as ChampionNoteRating | "")}
                        disabled={!selectedChampion}
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
                        onClick={handleSave}
                        disabled={!selectedChampion}
                    >
                        {savedFlash ? t("cn_saved") : t("cn_save")}
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={handleDelete}
                        disabled={!selectedChampion || !notes[selectedChampion]}
                    >
                        {t("cn_delete")}
                    </button>
                </div>
            </div>
        </div>
    )
}
