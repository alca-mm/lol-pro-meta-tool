import { describe, it, expect, beforeEach } from "vitest"
import { loadNotes, saveNote, deleteNote } from "../src/notes/storage"
import type { ChampionNote } from "../src/notes/types"

const store: Record<string, string> = {}

Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: (key: string): string | null => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    },
    writable: true,
})

const noteGaren: ChampionNote = {
    championName: "Garen",
    note: "Safe blind pick",
    tags: ["top", "safe"],
    rating: "comfort",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const noteAhri: ChampionNote = {
    championName: "Ahri",
    note: "",
    tags: [],
    rating: "pocket",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("loadNotes", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("returns empty object when nothing is saved", () => {
        expect(loadNotes()).toEqual({})
    })

    it("returns empty object on corrupt JSON", () => {
        store["lol_champion_notes"] = "not-valid-json{{{"
        expect(loadNotes()).toEqual({})
    })
})

describe("saveNote", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("persists a note retrievable by loadNotes", () => {
        saveNote(noteGaren)
        expect(loadNotes()["Garen"]).toEqual(noteGaren)
    })

    it("overwrites existing note for the same champion", () => {
        saveNote(noteGaren)
        const updated: ChampionNote = { ...noteGaren, note: "Updated note", rating: "situational" }
        saveNote(updated)
        const loaded = loadNotes()["Garen"]
        expect(loaded.note).toBe("Updated note")
        expect(loaded.rating).toBe("situational")
    })

    it("stores multiple champions independently", () => {
        saveNote(noteGaren)
        saveNote(noteAhri)
        const all = loadNotes()
        expect(all["Garen"]).toEqual(noteGaren)
        expect(all["Ahri"]).toEqual(noteAhri)
    })

    it("preserves empty tags and null rating", () => {
        const minimal: ChampionNote = {
            championName: "Zilean",
            note: "",
            tags: [],
            rating: null,
            updatedAt: "2026-01-01T00:00:00.000Z",
        }
        saveNote(minimal)
        expect(loadNotes()["Zilean"]).toEqual(minimal)
    })
})

describe("deleteNote", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it("removes a saved note", () => {
        saveNote(noteGaren)
        deleteNote("Garen")
        expect(loadNotes()["Garen"]).toBeUndefined()
    })

    it("leaves other notes intact when deleting one", () => {
        saveNote(noteGaren)
        saveNote(noteAhri)
        deleteNote("Garen")
        expect(loadNotes()["Ahri"]).toEqual(noteAhri)
    })

    it("is a no-op for an unknown champion", () => {
        saveNote(noteGaren)
        deleteNote("Zilean")
        expect(loadNotes()["Garen"]).toEqual(noteGaren)
    })
})

describe("ChampionNoteRating values", () => {
    const validRatings = ["comfort", "situational", "avoid", "blind", "pocket"] as const

    it("all rating values are non-empty strings", () => {
        for (const r of validRatings) {
            expect(typeof r).toBe("string")
            expect(r.length).toBeGreaterThan(0)
        }
    })

    it("note with each rating round-trips through storage", () => {
        localStorage.clear()
        for (const r of validRatings) {
            const n: ChampionNote = { championName: "Test", note: "", tags: [], rating: r, updatedAt: "" }
            saveNote(n)
            expect(loadNotes()["Test"].rating).toBe(r)
        }
    })
})
