export type ChampionNoteRating = "comfort" | "situational" | "avoid" | "blind" | "pocket"

export interface ChampionNote {
    championName: string
    note: string
    tags: string[]
    rating: ChampionNoteRating | null
    updatedAt: string
}
