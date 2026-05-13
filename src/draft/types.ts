import type { Match, Role } from "../domain/types"

export type DraftVisualSide = "blue" | "red"

export type PickSlot = {
    championName: string
    role: Role | null
}

export type ActiveDraftSlot =
    | { type: "pick"; visualSide: DraftVisualSide; index: number }
    | { type: "ban"; visualSide: DraftVisualSide; index: number }

export type DraftFlowStep =
    | { type: "ban"; visualSide: DraftVisualSide; index: number; label: string }
    | { type: "pick"; visualSide: DraftVisualSide; index: number; label: string }

export type DraftSnapshot = {
    bluePickSlots: PickSlot[]
    redPickSlots: PickSlot[]
    blueBans: string[]
    redBans: string[]
    recommendationSide: DraftVisualSide
    activeDraftSlot: ActiveDraftSlot | null
    championSearch: string
    poolRoleFilter: Role | null
    draftFlowEnabled: boolean
    flowStepIndex: number
}

export type CompletedGameDraft = {
    gameNumber: number
    bluePickSlots: PickSlot[]
    redPickSlots: PickSlot[]
    blueBans: string[]
    redBans: string[]
}

export type WeightKey = "draftPriority" | "roleStats" | "synergy" | "matchup" | "winRate" | "sampleSize"

export type WeightConfig = Record<WeightKey, number>

export type DraftAiPresetKey = "balanced" | "counterpick" | "synergy" | "meta" | "safe"

export type PatchWeightPresetKey = "balanced" | "currentFocused" | "stable" | "currentOnly"

export type PatchWindowSummary = {
    patch: string
    rawMatches: number
    weight: number
    weightedMatches: number
}

export type PatchWindowData = {
    patches: string[]
    matches: Match[]
    rawMatches: Match[]
    rawSample: number
    weightedSample: number
    summaries: PatchWindowSummary[]
}

export type DraftEdgeSummary = {
    score: number
    completedPicks: number
    assignedRoles: number
    averageConfidence: number
    notes: string[]
}

export type FlexRoleInfo = {
    role: Role
    games: number
    share: number
    winRate: number | null
}

export type FlexChampionInfo = {
    championName: string
    totalGames: number
    roles: FlexRoleInfo[]
    primaryRole: Role | null
    isFlex: boolean
}

export type BanRecommendation = {
    championName: string
    role: Role
    score: number
    reason: string
    flexRoles: Role[]
    hitsOpenRole: boolean
}

export type TeamCompWarning = {
    severity: "info" | "warning" | "danger"
    title: string
    description: string
}

export type TeamCompMetric = {
    label: string
    value: number
    max: number
    description: string
}

export type TeamCompReport = {
    identity: string
    primaryTags: string[]
    metrics: TeamCompMetric[]
    strengths: string[]
    warnings: TeamCompWarning[]
    damageProfile: {
        ap: number
        ad: number
        mixed: number
        unknown: number
        label: string
    }
}
