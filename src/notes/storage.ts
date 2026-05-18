import type { ChampionNote } from "./types"

const STORAGE_KEY = "lol_champion_notes"

export function loadNotes(): Record<string, ChampionNote> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? (JSON.parse(raw) as Record<string, ChampionNote>) : {}
    } catch {
        return {}
    }
}

export function saveNote(note: ChampionNote): void {
    const notes = loadNotes()
    notes[note.championName] = note
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export function deleteNote(championName: string): void {
    const notes = loadNotes()
    delete notes[championName]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}
