export type ChampionNoteRating =
    | "comfort"
    | "blind"
    | "pocket"
    | "situational"
    | "needs_practice"
    | "avoid"

export type TeamChampionRating = ChampionNoteRating

export interface ChampionNote {
    championName: string
    note: string
    tags: string[]
    rating: ChampionNoteRating | null
    updatedAt: string
}
