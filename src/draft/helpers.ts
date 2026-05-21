import type { Role } from "../domain/types"
import type { DraftVisualSide, PickSlot } from "./types"
import type { ChampionNoteRating } from "../notes/types"

export function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${(value * 100).toFixed(1)} %`
}

export function formatScore(value: number): string {
    return value.toFixed(3)
}

export function normalizeChampionName(name: string): string {
    return name.trim().toLowerCase()
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function oppositeSide(side: DraftVisualSide): DraftVisualSide {
    return side === "blue" ? "red" : "blue"
}

export function sideLabel(side: DraftVisualSide): string {
    return side === "blue" ? "Blue Side" : "Red Side"
}

export function filledPickCount(slots: PickSlot[]): number {
    return slots.filter((slot) => Boolean(slot.championName)).length
}

export function filledBanCount(bans: string[]): number {
    return bans.filter(Boolean).length
}

export function slotsToDraftPicks(slots: PickSlot[]): Partial<Record<Role, string>> {
    const picks: Partial<Record<Role, string>> = {}

    for (const slot of slots) {
        if (!slot.championName || !slot.role) continue
        picks[slot.role] = slot.championName
    }

    return picks
}

export function nextEmptyPickIndex(slots: PickSlot[]): number {
    return slots.findIndex((slot) => !slot.championName)
}

export function createEmptyPickSlots(): PickSlot[] {
    return Array.from({ length: 5 }, () => ({
        championName: "",
        role: null,
    }))
}

export function clonePickSlots(slots: PickSlot[]): PickSlot[] {
    return slots.map((slot) => ({ ...slot }))
}

export function teamPoolRatingShortLabel(rating: ChampionNoteRating): "C" | "B" | "P" | "S" | "!" | "X" {
    switch (rating) {
        case "comfort":        return "C"
        case "blind":          return "B"
        case "pocket":         return "P"
        case "situational":    return "S"
        case "needs_practice": return "!"
        case "avoid":          return "X"
    }
}

export type TeamPoolTone = "positive" | "warning" | "danger" | "neutral"

export function teamPoolRatingTone(rating: ChampionNoteRating): TeamPoolTone {
    switch (rating) {
        case "comfort":
        case "blind":
        case "pocket":         return "positive"
        case "situational":    return "neutral"
        case "needs_practice": return "warning"
        case "avoid":          return "danger"
    }
}

export function formatScorePercent(score: number): string {
    return `${Math.round(score * 100)}%`
}

export function draftHasContent(
    bluePickSlots: PickSlot[],
    redPickSlots: PickSlot[],
    blueBans: string[],
    redBans: string[],
): boolean {
    return (
        bluePickSlots.some((slot) => Boolean(slot.championName)) ||
        redPickSlots.some((slot) => Boolean(slot.championName)) ||
        blueBans.some(Boolean) ||
        redBans.some(Boolean)
    )
}
