import { useMemo, useState } from "react"
import type { Match, Role } from "../domain/types"
import {
    calculateDraftRecommendations,
    type DraftRecommendation,
    type DraftState,
} from "../analysis/draftHelper"
import { ALL_CHAMPIONS } from "../analysis/championCatalog"
import { ChampionPortraitGrid } from "./ChampionPortraitGrid"
import { championIconUrl } from "../analysis/championAssets"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"

interface DraftHelperProps {
    matches: Match[]
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

const ROLE_LABELS: Record<Role, string> = {
    top: "TOP",
    jungle: "JGL",
    mid: "MID",
    bot: "BOT",
    support: "SUP",
}

type DraftVisualSide = "blue" | "red"

type PickSlot = {
    championName: string
    role: Role | null
}

type ActiveDraftSlot =
    | {
    type: "pick"
    visualSide: DraftVisualSide
    index: number
}
    | {
    type: "ban"
    visualSide: DraftVisualSide
    index: number
}

type DraftFlowStep =
    | {
    type: "ban"
    visualSide: DraftVisualSide
    index: number
    label: string
}
    | {
    type: "pick"
    visualSide: DraftVisualSide
    index: number
    label: string
}

type DraftSnapshot = {
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

type CompletedGameDraft = {
    gameNumber: number
    bluePickSlots: PickSlot[]
    redPickSlots: PickSlot[]
    blueBans: string[]
    redBans: string[]
}

type WeightKey = "draftPriority" | "roleStats" | "synergy" | "matchup" | "winRate" | "sampleSize"

type WeightConfig = Record<WeightKey, number>

type DraftAiPresetKey = "balanced" | "counterpick" | "synergy" | "meta" | "safe"

type PatchWeightPresetKey = "balanced" | "currentFocused" | "stable" | "currentOnly"

type PatchWindowSummary = {
    patch: string
    rawMatches: number
    weight: number
    weightedMatches: number
}

type PatchWindowData = {
    patches: string[]
    matches: Match[]
    rawMatches: Match[]
    rawSample: number
    weightedSample: number
    summaries: PatchWindowSummary[]
}

type DraftEdgeSummary = {
    score: number
    completedPicks: number
    assignedRoles: number
    averageConfidence: number
    notes: string[]
}

type FlexRoleInfo = {
    role: Role
    games: number
    share: number
    winRate: number | null
}

type FlexChampionInfo = {
    championName: string
    totalGames: number
    roles: FlexRoleInfo[]
    primaryRole: Role | null
    isFlex: boolean
}

type BanRecommendation = {
    championName: string
    role: Role
    score: number
    reason: string
    flexRoles: Role[]
    hitsOpenRole: boolean
}

type TeamCompWarning = {
    severity: "info" | "warning" | "danger"
    title: string
    description: string
}

type TeamCompMetric = {
    label: string
    value: number
    max: number
    description: string
}

type TeamCompReport = {
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

const DRAFT_FLOW: DraftFlowStep[] = [
    { type: "ban", visualSide: "blue", index: 0, label: "Blue Ban 1" },
    { type: "ban", visualSide: "red", index: 0, label: "Red Ban 1" },
    { type: "ban", visualSide: "blue", index: 1, label: "Blue Ban 2" },
    { type: "ban", visualSide: "red", index: 1, label: "Red Ban 2" },
    { type: "ban", visualSide: "blue", index: 2, label: "Blue Ban 3" },
    { type: "ban", visualSide: "red", index: 2, label: "Red Ban 3" },

    { type: "pick", visualSide: "blue", index: 0, label: "Blue Pick 1" },
    { type: "pick", visualSide: "red", index: 0, label: "Red Pick 1" },
    { type: "pick", visualSide: "red", index: 1, label: "Red Pick 2" },
    { type: "pick", visualSide: "blue", index: 1, label: "Blue Pick 2" },
    { type: "pick", visualSide: "blue", index: 2, label: "Blue Pick 3" },
    { type: "pick", visualSide: "red", index: 2, label: "Red Pick 3" },

    { type: "ban", visualSide: "red", index: 3, label: "Red Ban 4" },
    { type: "ban", visualSide: "blue", index: 3, label: "Blue Ban 4" },
    { type: "ban", visualSide: "red", index: 4, label: "Red Ban 5" },
    { type: "ban", visualSide: "blue", index: 4, label: "Blue Ban 5" },

    { type: "pick", visualSide: "red", index: 3, label: "Red Pick 4" },
    { type: "pick", visualSide: "blue", index: 3, label: "Blue Pick 4" },
    { type: "pick", visualSide: "blue", index: 4, label: "Blue Pick 5" },
    { type: "pick", visualSide: "red", index: 4, label: "Red Pick 5" },
]

const MAX_SERIES_GAMES = 5
const PATCH_WEIGHT_MAX_PATCHES = 6

const DEFAULT_PATCH_WEIGHTS = [100, 70, 45, 25, 15, 10]

const PATCH_WEIGHT_PRESETS: Record<PatchWeightPresetKey, { label: string; weights: number[] }> = {
    balanced: {
        label: "Balanced",
        weights: DEFAULT_PATCH_WEIGHTS,
    },
    currentFocused: {
        label: "Aktueller Patch",
        weights: [100, 55, 30, 15, 5, 0],
    },
    stable: {
        label: "Meta stabil",
        weights: [100, 85, 70, 55, 40, 25],
    },
    currentOnly: {
        label: "Nur aktuell",
        weights: [100, 0, 0, 0, 0, 0],
    },
}

const DEFAULT_WEIGHTS: WeightConfig = {
    draftPriority: 40,
    roleStats: 20,
    synergy: 15,
    matchup: 20,
    winRate: 5,
    sampleSize: 0,
}

const WEIGHT_PRESETS: Record<DraftAiPresetKey, { label: string; weights: WeightConfig }> = {
    balanced: {
        label: "Balanced",
        weights: DEFAULT_WEIGHTS,
    },
    counterpick: {
        label: "Counterpick",
        weights: {
            draftPriority: 20,
            roleStats: 15,
            synergy: 10,
            matchup: 45,
            winRate: 5,
            sampleSize: 5,
        },
    },
    synergy: {
        label: "Synergy",
        weights: {
            draftPriority: 20,
            roleStats: 15,
            synergy: 45,
            matchup: 10,
            winRate: 5,
            sampleSize: 5,
        },
    },
    meta: {
        label: "Meta Priority",
        weights: {
            draftPriority: 60,
            roleStats: 20,
            synergy: 5,
            matchup: 10,
            winRate: 5,
            sampleSize: 0,
        },
    },
    safe: {
        label: "Safe / High Confidence",
        weights: {
            draftPriority: 25,
            roleStats: 25,
            synergy: 10,
            matchup: 10,
            winRate: 10,
            sampleSize: 20,
        },
    },
}

// WEIGHT_LABELS is defined inside the component to support i18n

const FRONTLINE_CHAMPIONS = new Set([
    "aatrox",
    "alistar",
    "braum",
    "ksante",
    "leona",
    "malphite",
    "maokai",
    "nautilus",
    "ornn",
    "poppy",
    "rell",
    "renekton",
    "rakan",
    "sejuani",
    "shen",
    "sion",
    "tahmkench",
    "taric",
    "zac",
])

const ENGAGE_CHAMPIONS = new Set([
    "alistar",
    "amumu",
    "ashe",
    "gnar",
    "gragas",
    "jarvaniv",
    "leona",
    "malphite",
    "maokai",
    "nautilus",
    "neeko",
    "ornn",
    "rakan",
    "rell",
    "sejuani",
    "vi",
    "wukong",
])

const AP_DAMAGE_CHAMPIONS = new Set([
    "ahri",
    "akali",
    "annie",
    "azir",
    "brand",
    "cassiopeia",
    "corki",
    "diana",
    "elise",
    "fiddlesticks",
    "galio",
    "gragas",
    "gwen",
    "hwei",
    "karma",
    "karthus",
    "kennen",
    "leblanc",
    "lillia",
    "lissandra",
    "lux",
    "malzahar",
    "neeko",
    "nidalee",
    "orianna",
    "rumble",
    "ryze",
    "seraphine",
    "sylas",
    "syndra",
    "taliyah",
    "twistedfate",
    "veigar",
    "viktor",
    "vladimir",
    "xerath",
    "ziggs",
    "zoe",
])

const AD_DAMAGE_CHAMPIONS = new Set([
    "aatrox",
    "akshan",
    "aphelios",
    "ashe",
    "belveth",
    "caitlyn",
    "camille",
    "darius",
    "draven",
    "ezreal",
    "fiora",
    "gangplank",
    "gnar",
    "graves",
    "irelia",
    "jarvaniv",
    "jax",
    "jayce",
    "jinx",
    "kaisa",
    "kalista",
    "khazix",
    "kindred",
    "leesin",
    "lucian",
    "missfortune",
    "nilah",
    "nocturne",
    "olaf",
    "pantheon",
    "pyke",
    "qiyana",
    "quinn",
    "reksai",
    "renekton",
    "rengar",
    "samira",
    "senna",
    "sivir",
    "tristana",
    "tryndamere",
    "twitch",
    "varus",
    "vayne",
    "vi",
    "viego",
    "xayah",
    "xinzhao",
    "yasuo",
    "yone",
    "zeri",
    "ziggs",
])

const POKE_CHAMPIONS = new Set([
    "ashe",
    "caitlyn",
    "ezreal",
    "hwei",
    "jayce",
    "karma",
    "lux",
    "maokai",
    "nidalee",
    "orianna",
    "seraphine",
    "varus",
    "velkoz",
    "xerath",
    "ziggs",
    "zoe",
])

const PICK_CHAMPIONS = new Set([
    "ahri",
    "ashe",
    "blitzcrank",
    "elise",
    "jax",
    "leblanc",
    "leesin",
    "leona",
    "lissandra",
    "lux",
    "morgana",
    "nautilus",
    "neeko",
    "pyke",
    "rakan",
    "renata",
    "sejuani",
    "syndra",
    "thresh",
    "twistedfate",
    "vi",
    "viego",
])

const DIVE_CHAMPIONS = new Set([
    "akali",
    "alistar",
    "camille",
    "diana",
    "galio",
    "hecarim",
    "irelia",
    "jarvaniv",
    "kaisa",
    "leesin",
    "leona",
    "malphite",
    "nautilus",
    "nocturne",
    "rakan",
    "rell",
    "renekton",
    "sejuani",
    "sylas",
    "vi",
    "viego",
    "wukong",
    "yasuo",
    "yone",
])

const PEEL_CHAMPIONS = new Set([
    "alistar",
    "braum",
    "ivern",
    "janna",
    "karma",
    "lulu",
    "milio",
    "nami",
    "poppy",
    "renata",
    "rakan",
    "seraphine",
    "tahmkench",
    "taric",
    "thresh",
    "zilean",
])

const SCALING_CHAMPIONS = new Set([
    "aphelios",
    "azir",
    "cassiopeia",
    "corki",
    "gwen",
    "jax",
    "jinx",
    "kaisa",
    "kayle",
    "kogmaw",
    "orianna",
    "ryze",
    "senna",
    "sivir",
    "smolder",
    "tristana",
    "twitch",
    "veigar",
    "viktor",
    "vladimir",
    "xayah",
    "zeri",
])

const SPLITPUSH_CHAMPIONS = new Set([
    "camille",
    "fiora",
    "gwen",
    "jax",
    "jayce",
    "ksante",
    "renekton",
    "riven",
    "trundle",
    "tryndamere",
    "twistedfate",
    "yone",
])

function createEmptyPickSlots(): PickSlot[] {
    return Array.from({ length: 5 }, () => ({
        championName: "",
        role: null,
    }))
}

function clonePickSlots(slots: PickSlot[]): PickSlot[] {
    return slots.map((slot) => ({ ...slot }))
}

function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${(value * 100).toFixed(1)} %`
}

function formatScore(value: number): string {
    return value.toFixed(3)
}

function normalizeChampionName(name: string): string {
    return name.trim().toLowerCase()
}

function parsePatchParts(patch: string): number[] {
    return patch
        .split(".")
        .map((part) => Number(part.replace(/[^\d]/g, "")))
        .map((part) => (Number.isFinite(part) ? part : 0))
}

function comparePatch(a: string, b: string): number {
    const aParts = parsePatchParts(a)
    const bParts = parsePatchParts(b)
    const maxLength = Math.max(aParts.length, bParts.length)

    for (let index = 0; index < maxLength; index += 1) {
        const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
        if (diff !== 0) return diff
    }

    return a.localeCompare(b)
}

function weightedPatchWindow(matches: Match[], patchWeights: number[]): PatchWindowData {
    const patches = [...new Set(matches.map((match) => match.patch).filter(Boolean))]
        .sort(comparePatch)
        .slice(-PATCH_WEIGHT_MAX_PATCHES)
        .reverse()

    const summaries: PatchWindowSummary[] = []
    const rawMatches: Match[] = []
    const weightedMatches: Match[] = []

    for (const [patchIndex, patch] of patches.entries()) {
        const weight = patchWeights[patchIndex] ?? 0
        if (weight <= 0) continue

        const patchMatches = matches.filter((match) => match.patch === patch)
        const repeatCount = Math.max(1, Math.round(weight / 10))
        rawMatches.push(...patchMatches)

        for (let index = 0; index < repeatCount; index += 1) {
            weightedMatches.push(...patchMatches)
        }

        summaries.push({
            patch,
            rawMatches: patchMatches.length,
            weight,
            weightedMatches: Math.round(patchMatches.length * (weight / 100)),
        })
    }

    return {
        patches: summaries.map((summary) => summary.patch),
        matches: weightedMatches.length > 0 ? weightedMatches : rawMatches,
        rawMatches,
        rawSample: rawMatches.length,
        weightedSample: summaries.reduce((sum, summary) => sum + summary.weightedMatches, 0),
        summaries,
    }
}

function formatPatchWindowSummary(patchData: PatchWindowData): string {
    if (patchData.summaries.length === 0) return "keine Patchdaten"

    return patchData.summaries
        .map((summary) => `${summary.patch} (${summary.weight}%, ${summary.rawMatches} Games)`)
        .join(" · ")
}

function iconFor(championName?: string) {
    if (!championName) return null

    return (
        <img
            src={championIconUrl(championName)}
            alt={championName}
            loading="lazy"
            onError={(event) => {
                event.currentTarget.style.visibility = "hidden"
            }}
        />
    )
}

function sideLabel(side: DraftVisualSide): string {
    return side === "blue" ? "Blue Side" : "Red Side"
}

function filledPickCount(slots: PickSlot[]): number {
    return slots.filter((slot) => Boolean(slot.championName)).length
}

function filledBanCount(bans: string[]): number {
    return bans.filter(Boolean).length
}

function slotsToDraftPicks(slots: PickSlot[]): Partial<Record<Role, string>> {
    const picks: Partial<Record<Role, string>> = {}

    for (const slot of slots) {
        if (!slot.championName || !slot.role) continue
        picks[slot.role] = slot.championName
    }

    return picks
}

function nextEmptyPickIndex(slots: PickSlot[]): number {
    return slots.findIndex((slot) => !slot.championName)
}

function getRoleRecommendations(
    recommendations: DraftRecommendation[],
    role: Role,
    limit: number,
): DraftRecommendation[] {
    return recommendations.filter((entry) => entry.role === role).slice(0, limit)
}

function buildRoleChampionCatalog(matches: Match[]): Record<Role, Set<string>> {
    const catalog: Record<Role, Set<string>> = {
        top: new Set(),
        jungle: new Set(),
        mid: new Set(),
        bot: new Set(),
        support: new Set(),
    }

    for (const match of matches) {
        for (const pick of match.picks) {
            catalog[pick.role].add(normalizeChampionName(pick.championName))
        }
    }

    return catalog
}

function buildFlexChampionCatalog(matches: Match[]): Map<string, FlexChampionInfo> {
    const raw = new Map<string, { championName: string; roles: Record<Role, { games: number; wins: number }> }>()

    for (const match of matches) {
        for (const pick of match.picks) {
            const key = normalizeChampionName(pick.championName)
            const current = raw.get(key) ?? {
                championName: pick.championName,
                roles: {
                    top: { games: 0, wins: 0 },
                    jungle: { games: 0, wins: 0 },
                    mid: { games: 0, wins: 0 },
                    bot: { games: 0, wins: 0 },
                    support: { games: 0, wins: 0 },
                },
            }

            current.roles[pick.role].games += 1
            if (pick.won) current.roles[pick.role].wins += 1
            raw.set(key, current)
        }
    }

    const catalog = new Map<string, FlexChampionInfo>()

    for (const [key, entry] of raw) {
        const totalGames = ROLES.reduce((sum, role) => sum + entry.roles[role].games, 0)
        const roles = ROLES
            .map((role) => {
                const data = entry.roles[role]
                return {
                    role,
                    games: data.games,
                    share: totalGames > 0 ? data.games / totalGames : 0,
                    winRate: data.games > 0 ? data.wins / data.games : null,
                }
            })
            .filter((roleInfo) => roleInfo.games > 0)
            .sort((a, b) => b.games - a.games)

        const viableRoles = roles.filter((roleInfo) => roleInfo.games >= 2 && roleInfo.share >= 0.12)

        catalog.set(key, {
            championName: entry.championName,
            totalGames,
            roles,
            primaryRole: roles[0]?.role ?? null,
            isFlex: viableRoles.length >= 2,
        })
    }

    return catalog
}

function flexRoleLabel(info: FlexChampionInfo | undefined): string {
    if (!info || info.roles.length === 0) return ""

    const visibleRoles = info.roles
        .filter((roleInfo) => roleInfo.games >= 2 || roleInfo.share >= 0.1)
        .slice(0, 3)

    if (visibleRoles.length === 0) return ""

    return visibleRoles
        .map((roleInfo) => `${ROLE_LABELS[roleInfo.role]} ${(roleInfo.share * 100).toFixed(0)}%`)
        .join(" / ")
}

function getViableFlexRoles(info: FlexChampionInfo | undefined): Role[] {
    if (!info) return []

    return info.roles
        .filter((roleInfo) => roleInfo.games >= 2 && roleInfo.share >= 0.12)
        .map((roleInfo) => roleInfo.role)
}

function calculateWeightedScore(entry: DraftRecommendation, weights: WeightConfig): number {
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0)

    if (totalWeight <= 0) return entry.totalScore

    const winRateScore = entry.winRate === null ? 0 : (entry.winRate - 0.5) * 2
    const sampleSizeScore = Math.min(entry.games / 25, 1)

    const weightedSum =
        entry.draftPriorityScore * weights.draftPriority +
        entry.roleStatsScore * weights.roleStats +
        entry.synergyScore * weights.synergy +
        entry.matchupScore * weights.matchup +
        winRateScore * weights.winRate +
        sampleSizeScore * weights.sampleSize

    return weightedSum / totalWeight
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function oppositeSide(side: DraftVisualSide): DraftVisualSide {
    return side === "blue" ? "red" : "blue"
}

function weightedRecommendations(
    matches: Match[],
    draftState: DraftState,
    weights: WeightConfig,
): DraftRecommendation[] {
    return calculateDraftRecommendations(matches, draftState)
        .map((entry) => ({
            ...entry,
            totalScore: calculateWeightedScore(entry, weights),
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
}


function championKeyForHeuristic(championName: string): string {
    return normalizeChampionName(championName).replace(/[^a-z0-9]/g, "")
}

function getAssignedRoleCounts(slots: PickSlot[]): Partial<Record<Role, number>> {
    const counts: Partial<Record<Role, number>> = {}

    for (const slot of slots) {
        if (!slot.role) continue
        counts[slot.role] = (counts[slot.role] ?? 0) + 1
    }

    return counts
}

function calculateRolePickScore(matches: Match[], championName: string, role: Role): {
    score: number
    confidence: number
    games: number
    winRate: number | null
} {
    const championKey = normalizeChampionName(championName)
    let games = 0
    let wins = 0

    for (const match of matches) {
        for (const pick of match.picks) {
            if (pick.role !== role) continue
            if (normalizeChampionName(pick.championName) !== championKey) continue

            games += 1
            if (pick.won) wins += 1
        }
    }

    if (games === 0) {
        return { score: 0.45, confidence: 0, games: 0, winRate: null }
    }

    const winRate = wins / games
    const confidence = clamp(Math.log(1 + games) / Math.log(31), 0, 1)
    const score = clamp(0.42 + (winRate - 0.5) * 0.55 + confidence * 0.18, 0, 1)

    return { score, confidence, games, winRate }
}

function calculatePairSynergyScore(matches: Match[], championA: string, championB: string): number | null {
    const aKey = normalizeChampionName(championA)
    const bKey = normalizeChampionName(championB)
    let games = 0
    let wins = 0

    for (const match of matches) {
        for (const side of ["blue", "red"] as const) {
            const sidePicks = match.picks.filter((pick) => pick.side === side)
            const hasA = sidePicks.some((pick) => normalizeChampionName(pick.championName) === aKey)
            const hasB = sidePicks.some((pick) => normalizeChampionName(pick.championName) === bKey)

            if (!hasA || !hasB) continue

            games += 1
            if (sidePicks.some((pick) => pick.won)) wins += 1
        }
    }

    if (games < 2) return null
    return wins / games
}

function calculateSameRoleMatchupScore(
    matches: Match[],
    championName: string,
    enemyChampionName: string,
    role: Role,
): number | null {
    const championKey = normalizeChampionName(championName)
    const enemyKey = normalizeChampionName(enemyChampionName)
    let games = 0
    let wins = 0

    for (const match of matches) {
        const candidatePick = match.picks.find(
            (pick) => pick.role === role && normalizeChampionName(pick.championName) === championKey,
        )
        const enemyPick = match.picks.find(
            (pick) => pick.role === role && normalizeChampionName(pick.championName) === enemyKey,
        )

        if (!candidatePick || !enemyPick || candidatePick.side === enemyPick.side) continue

        games += 1
        if (candidatePick.won) wins += 1
    }

    if (games < 2) return null
    return wins / games
}

function calculateSinglePickDraftScore(input: {
    matches: Match[]
    slot: PickSlot
    ownSlots: PickSlot[]
    enemySlots: PickSlot[]
    weights: WeightConfig
}): { score: number; confidence: number; notes: string[] } {
    if (!input.slot.championName || !input.slot.role) {
        return { score: 0, confidence: 0, notes: [] }
    }

    const roleScore = calculateRolePickScore(input.matches, input.slot.championName, input.slot.role)
    const ownChampions = input.ownSlots
        .filter((slot) => slot.championName && slot.championName !== input.slot.championName)
        .map((slot) => slot.championName)

    const synergyScores = ownChampions
        .map((championName) => calculatePairSynergyScore(input.matches, input.slot.championName, championName))
        .filter((value): value is number => value !== null)

    const sameRoleEnemy = input.enemySlots.find((slot) => slot.role === input.slot.role && slot.championName)
    const matchupScore = sameRoleEnemy
        ? calculateSameRoleMatchupScore(
              input.matches,
              input.slot.championName,
              sameRoleEnemy.championName,
              input.slot.role,
          )
        : null

    const synergyScore = synergyScores.length > 0
        ? synergyScores.reduce((sum, value) => sum + value, 0) / synergyScores.length
        : 0.5
    const matchupValue = matchupScore ?? 0.5
    const sampleScore = roleScore.confidence
    const winRateScore = roleScore.winRate === null ? 0.5 : roleScore.winRate
    const totalWeight = Object.values(input.weights).reduce((sum, value) => sum + value, 0) || 1

    const score = (
        roleScore.score * (input.weights.draftPriority + input.weights.roleStats) +
        synergyScore * input.weights.synergy +
        matchupValue * input.weights.matchup +
        winRateScore * input.weights.winRate +
        sampleScore * input.weights.sampleSize
    ) / totalWeight

    const notes: string[] = []
    if (roleScore.games > 0) notes.push(`${input.slot.championName} ${ROLE_LABELS[input.slot.role]}: ${roleScore.games} Games`)
    if (synergyScores.length > 0 && synergyScore >= 0.58) notes.push("gute historische Synergie")
    if (matchupScore !== null && matchupScore >= 0.58) notes.push("gutes Same-Role-Matchup")
    if (roleScore.confidence < 0.35) notes.push("kleine Sample Size")

    return {
        score: clamp(score, 0, 1),
        confidence: roleScore.confidence,
        notes,
    }
}

function calculateDraftEdgeSummary(input: {
    matches: Match[]
    ownSlots: PickSlot[]
    enemySlots: PickSlot[]
    weights: WeightConfig
}): DraftEdgeSummary {
    const evaluated = input.ownSlots
        .filter((slot) => slot.championName && slot.role)
        .map((slot) =>
            calculateSinglePickDraftScore({
                matches: input.matches,
                slot,
                ownSlots: input.ownSlots,
                enemySlots: input.enemySlots,
                weights: input.weights,
            }),
        )

    const completedPicks = filledPickCount(input.ownSlots)
    const assignedRoles = Object.keys(slotsToDraftPicks(input.ownSlots)).length

    if (evaluated.length === 0) {
        return {
            score: 50,
            completedPicks,
            assignedRoles,
            averageConfidence: 0,
            notes: ["Noch keine bewertbaren Picks mit Rolle."],
        }
    }

    const averageScore = evaluated.reduce((sum, entry) => sum + entry.score, 0) / evaluated.length
    const averageConfidence = evaluated.reduce((sum, entry) => sum + entry.confidence, 0) / evaluated.length
    const notes = evaluated.flatMap((entry) => entry.notes).slice(0, 4)

    return {
        score: clamp(averageScore * 100, 0, 100),
        completedPicks,
        assignedRoles,
        averageConfidence,
        notes: notes.length > 0 ? notes : ["Solider datenbasierter Draft-Stand."],
    }
}

function countTaggedChampions(championKeys: string[], tagSet: Set<string>): number {
    return championKeys.filter((champion) => tagSet.has(champion)).length
}

function createMetric(label: string, value: number, max: number, description: string): TeamCompMetric {
    return {
        label,
        value,
        max,
        description,
    }
}

function damageProfileLabel(profile: TeamCompReport["damageProfile"], t: (key: TranslationKey) => string): string {
    const knownDamage = profile.ap + profile.ad + profile.mixed

    if (knownDamage === 0) return t("comp_damage_unknown")
    if (profile.ad >= knownDamage - 1 && profile.ap <= 1) return t("comp_damage_adHeavy")
    if (profile.ap >= knownDamage - 1 && profile.ad <= 1) return t("comp_damage_apHeavy")
    if (profile.mixed > 0 || (profile.ap >= 1 && profile.ad >= 1)) return t("comp_damage_mixed")

    return t("comp_damage_unknown")
}

function generateTeamCompReport(slots: PickSlot[], t: (key: TranslationKey) => string): TeamCompReport {
    const warnings: TeamCompWarning[] = []
    const strengths: string[] = []
    const assignedCounts = getAssignedRoleCounts(slots)
    const pickedChampionKeys = slots
        .map((slot) => slot.championName)
        .filter(Boolean)
        .map(championKeyForHeuristic)

    const pickedChampionCount = pickedChampionKeys.length
    const assignedRoleCount = Object.keys(slotsToDraftPicks(slots)).length
    const missingRoles = ROLES.filter((role) => !assignedCounts[role])
    const duplicatedRoles = ROLES.filter((role) => (assignedCounts[role] ?? 0) > 1)

    const frontlineCount = countTaggedChampions(pickedChampionKeys, FRONTLINE_CHAMPIONS)
    const engageCount = countTaggedChampions(pickedChampionKeys, ENGAGE_CHAMPIONS)
    const peelCount = countTaggedChampions(pickedChampionKeys, PEEL_CHAMPIONS)
    const pokeCount = countTaggedChampions(pickedChampionKeys, POKE_CHAMPIONS)
    const pickCount = countTaggedChampions(pickedChampionKeys, PICK_CHAMPIONS)
    const diveCount = countTaggedChampions(pickedChampionKeys, DIVE_CHAMPIONS)
    const scalingCount = countTaggedChampions(pickedChampionKeys, SCALING_CHAMPIONS)
    const splitpushCount = countTaggedChampions(pickedChampionKeys, SPLITPUSH_CHAMPIONS)

    const damageProfile = pickedChampionKeys.reduce<TeamCompReport["damageProfile"]>(
        (profile, champion) => {
            const hasAp = AP_DAMAGE_CHAMPIONS.has(champion)
            const hasAd = AD_DAMAGE_CHAMPIONS.has(champion)

            if (hasAp && hasAd) profile.mixed += 1
            else if (hasAp) profile.ap += 1
            else if (hasAd) profile.ad += 1
            else profile.unknown += 1

            return profile
        },
        { ap: 0, ad: 0, mixed: 0, unknown: 0, label: "Unklar" },
    )
    damageProfile.label = damageProfileLabel(damageProfile, t)

    const identityScores = [
        { label: "Front-to-back", value: frontlineCount * 2 + peelCount + scalingCount },
        { label: "Dive", value: diveCount * 2 + engageCount },
        { label: "Pick Comp", value: pickCount * 2 + engageCount },
        { label: "Poke / Siege", value: pokeCount * 2 + peelCount },
        { label: "Scaling", value: scalingCount * 2 + peelCount },
        { label: "Splitpush", value: splitpushCount * 2 + pickCount },
    ].sort((a, b) => b.value - a.value)

    const identity = identityScores[0]?.value > 0 ? identityScores[0].label : t("comp_identity_hybrid")
    const primaryTags = identityScores
        .filter((entry) => entry.value > 0)
        .slice(0, 3)
        .map((entry) => entry.label)

    const metrics: TeamCompMetric[] = [
        createMetric("Frontline", frontlineCount, 2, t("comp_metricDesc_frontline")),
        createMetric("Engage", engageCount, 2, t("comp_metricDesc_engage")),
        createMetric("Peel", peelCount, 2, t("comp_metricDesc_peel")),
        createMetric("Poke", pokeCount, 2, t("comp_metricDesc_poke")),
        createMetric("Pick", pickCount, 2, t("comp_metricDesc_pick")),
        createMetric("Scaling", scalingCount, 2, t("comp_metricDesc_scaling")),
    ]

    if (missingRoles.length > 0) {
        warnings.push({
            severity: "info",
            title: t("comp_warnTitle_rolesOpen"),
            description: `${t("comp_warnDesc_rolesOpen")} ${missingRoles.map((role) => ROLE_LABELS[role]).join(", ")}.`,
        })
    }

    if (duplicatedRoles.length > 0) {
        warnings.push({
            severity: "warning",
            title: t("comp_warnTitle_dupRole"),
            description: `${t("comp_warnDesc_dupRole")} ${duplicatedRoles.map((role) => ROLE_LABELS[role]).join(", ")}.`,
        })
    }

    if (pickedChampionCount >= 3 && frontlineCount === 0) {
        warnings.push({
            severity: "warning",
            title: t("comp_warnTitle_lowFrontline"),
            description: t("comp_warnDesc_lowFrontline"),
        })
    }

    if (pickedChampionCount >= 3 && engageCount === 0 && pickCount === 0) {
        warnings.push({
            severity: "warning",
            title: t("comp_warnTitle_lowEngage"),
            description: t("comp_warnDesc_lowEngage"),
        })
    }

    if (pickedChampionCount >= 4 && damageProfile.label === t("comp_damage_adHeavy")) {
        warnings.push({
            severity: "info",
            title: t("comp_warnTitle_adHeavy"),
            description: t("comp_warnDesc_adHeavy"),
        })
    }

    if (pickedChampionCount >= 4 && damageProfile.label === t("comp_damage_apHeavy")) {
        warnings.push({
            severity: "info",
            title: t("comp_warnTitle_apHeavy"),
            description: t("comp_warnDesc_apHeavy"),
        })
    }

    if (pickedChampionCount >= 4 && scalingCount === 0) {
        warnings.push({
            severity: "info",
            title: t("comp_warnTitle_lowScaling"),
            description: t("comp_warnDesc_lowScaling"),
        })
    }

    if (frontlineCount > 0 && scalingCount > 0) {
        strengths.push(t("comp_strength_frontline"))
    }

    if (engageCount > 0 && diveCount > 0) {
        strengths.push(t("comp_strength_engage"))
    }

    if (pokeCount >= 2) {
        strengths.push(t("comp_strength_poke"))
    }

    if (pickCount >= 2) {
        strengths.push(t("comp_strength_pick"))
    }

    if (peelCount > 0 && scalingCount > 0) {
        strengths.push(t("comp_strength_peel"))
    }

    if (damageProfile.label === t("comp_damage_mixed")) {
        strengths.push(t("comp_strength_mixed"))
    }

    if (assignedRoleCount === 5 && strengths.length === 0 && warnings.length <= 1) {
        strengths.push(t("comp_strength_clean"))
    }

    return {
        identity,
        primaryTags,
        metrics,
        strengths: strengths.slice(0, 5),
        warnings: warnings.slice(0, 6),
        damageProfile,
    }
}

function generateBanRecommendations(input: {
    opponentRecommendations: DraftRecommendation[]
    opponentSlots: PickSlot[]
    selectedChampionSet: Set<string>
    bannedChampionSet: Set<string>
    flexChampionCatalog: Map<string, FlexChampionInfo>
    limit: number
}, t: (key: TranslationKey) => string): BanRecommendation[] {
    const grouped = new Map<string, { championName: string; entries: DraftRecommendation[] }>()
    const opponentAssignedRoles = new Set(
        input.opponentSlots
            .map((slot) => slot.role)
            .filter((role): role is Role => Boolean(role)),
    )
    const opponentOpenRoles = ROLES.filter((role) => !opponentAssignedRoles.has(role))

    for (const entry of input.opponentRecommendations) {
        const key = normalizeChampionName(entry.championName)
        if (input.selectedChampionSet.has(key)) continue
        if (input.bannedChampionSet.has(key)) continue

        const current = grouped.get(key) ?? { championName: entry.championName, entries: [] }
        current.entries.push(entry)
        grouped.set(key, current)
    }

    return [...grouped.entries()]
        .map(([key, group]) => {
            const flexInfo = input.flexChampionCatalog.get(key)
            const flexRoles = getViableFlexRoles(flexInfo)
            const bestEntry = [...group.entries].sort((a, b) => b.totalScore - a.totalScore)[0]
            const bestOpenRoleEntry = group.entries
                .filter((entry) => opponentOpenRoles.includes(entry.role))
                .sort((a, b) => b.totalScore - a.totalScore)[0]
            const roleEntry = bestOpenRoleEntry ?? bestEntry
            const hitsOpenRole = Boolean(bestOpenRoleEntry)
            const flexBonus = Math.min(Math.max(flexRoles.length - 1, 0) * 0.08, 0.18)
            const openRoleBonus = hitsOpenRole ? 0.1 : 0
            const sampleBonus = Math.min(roleEntry.games / 40, 1) * 0.04
            const score = roleEntry.totalScore + flexBonus + openRoleBonus + sampleBonus
            const reasonParts: string[] = []

            if (hitsOpenRole) reasonParts.push(`${t("ban_blocksOpenRole")} ${ROLE_LABELS[roleEntry.role]}`)
            if (flexRoles.length >= 2) reasonParts.push(`Flex: ${flexRoles.map((role) => ROLE_LABELS[role]).join("/")}`)
            if (roleEntry.matchupScore > 0.08) reasonParts.push(t("ban_strongCounter"))
            if (roleEntry.synergyScore > 0.08) reasonParts.push(t("ban_strongSynergy"))
            if (reasonParts.length === 0) {
                const fallbackKey = (roleEntry.reasons[0] ?? "ban_highDraftValue") as TranslationKey
                reasonParts.push(t(fallbackKey))
            }

            return {
                championName: group.championName,
                role: roleEntry.role,
                score,
                reason: reasonParts.join(" · "),
                flexRoles,
                hitsOpenRole,
            }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit)
}

function createRecommendationDraftState(input: {
    recommendationSide: DraftVisualSide
    bluePicks: Partial<Record<Role, string>>
    redPicks: Partial<Record<Role, string>>
    bans: string[]
    excludeBans: boolean
    minGames: number
}): DraftState {
    return {
        ownPicks: input.recommendationSide === "blue" ? input.bluePicks : input.redPicks,
        enemyPicks: input.recommendationSide === "blue" ? input.redPicks : input.bluePicks,
        bans: input.bans,
        excludeBans: input.excludeBans,
        minGames: input.minGames,
        sidePreference: input.recommendationSide,
    }
}

function getBansForSide(
    visualSide: DraftVisualSide,
    blueBans: string[],
    redBans: string[],
): string[] {
    return visualSide === "blue" ? blueBans : redBans
}

function getPickSlotsForSide(
    visualSide: DraftVisualSide,
    bluePickSlots: PickSlot[],
    redPickSlots: PickSlot[],
): PickSlot[] {
    return visualSide === "blue" ? bluePickSlots : redPickSlots
}

function draftFlowSlotForIndex(
    stepIndex: number,
    bluePickSlots: PickSlot[],
    redPickSlots: PickSlot[],
    blueBans: string[],
    redBans: string[],
): ActiveDraftSlot | null {
    const step = DRAFT_FLOW[stepIndex]
    if (!step) return null

    if (step.type === "ban") {
        const bans = getBansForSide(step.visualSide, blueBans, redBans)
        if (bans[step.index]) return null

        return {
            type: "ban",
            visualSide: step.visualSide,
            index: step.index,
        }
    }

    const pickSlots = getPickSlotsForSide(step.visualSide, bluePickSlots, redPickSlots)
    if (pickSlots[step.index]?.championName) return null

    return {
        type: "pick",
        visualSide: step.visualSide,
        index: step.index,
    }
}

function findNextAvailableFlowStepIndex(
    startIndex: number,
    bluePickSlots: PickSlot[],
    redPickSlots: PickSlot[],
    blueBans: string[],
    redBans: string[],
): number {
    for (let index = Math.max(0, startIndex); index < DRAFT_FLOW.length; index += 1) {
        const slot = draftFlowSlotForIndex(index, bluePickSlots, redPickSlots, blueBans, redBans)
        if (slot) return index
    }

    return -1
}

function flowLabelForSlot(slot: ActiveDraftSlot | null, flowStepIndex: number): string {
    if (!slot) return "Draft abgeschlossen"

    const step = DRAFT_FLOW[flowStepIndex]
    if (step) return step.label

    if (slot.type === "ban") return `${sideLabel(slot.visualSide)} Ban ${slot.index + 1}`
    return `${sideLabel(slot.visualSide)} Pick ${slot.index + 1}`
}

function describeActiveSlot(slot: ActiveDraftSlot | null): string {
    if (!slot) return "Kein Slot aktiv"

    if (slot.type === "ban") {
        return `${sideLabel(slot.visualSide)} · Ban ${slot.index + 1}`
    }

    return `${sideLabel(slot.visualSide)} · Pick ${slot.index + 1}`
}

function inferChampionRole(input: {
    championName: string
    preferredRole: Role | null
    recommendations: DraftRecommendation[]
    ownSlots: PickSlot[]
    flexChampionCatalog: Map<string, FlexChampionInfo>
}): Role | null {
    const championKey = normalizeChampionName(input.championName)
    const flexInfo = input.flexChampionCatalog.get(championKey)
    const viableRoles = getViableFlexRoles(flexInfo)

    if (input.preferredRole) {
        const hasPreferredRole =
            viableRoles.includes(input.preferredRole) ||
            input.recommendations.some(
                (entry) =>
                    normalizeChampionName(entry.championName) === championKey &&
                    entry.role === input.preferredRole,
            )

        if (hasPreferredRole) return input.preferredRole
    }

    if (flexInfo?.isFlex && !input.preferredRole) {
        return null
    }

    const alreadyUsedRoles = new Set(
        input.ownSlots
            .map((slot) => slot.role)
            .filter((role): role is Role => Boolean(role)),
    )

    if (flexInfo?.primaryRole && !alreadyUsedRoles.has(flexInfo.primaryRole)) {
        return flexInfo.primaryRole
    }

    const bestRecommendation = input.recommendations.find(
        (entry) =>
            normalizeChampionName(entry.championName) === championKey &&
            !alreadyUsedRoles.has(entry.role),
    )

    return bestRecommendation?.role ?? null
}

function pickSlotRoleLabel(slot: PickSlot): string {
    if (!slot.championName) return "Role?"
    return slot.role ? ROLE_LABELS[slot.role] : "Role?"
}

function draftHasContent(bluePickSlots: PickSlot[], redPickSlots: PickSlot[], blueBans: string[], redBans: string[]): boolean {
    return (
        bluePickSlots.some((slot) => Boolean(slot.championName)) ||
        redPickSlots.some((slot) => Boolean(slot.championName)) ||
        blueBans.some(Boolean) ||
        redBans.some(Boolean)
    )
}

function getFearlessChampionKeys(games: CompletedGameDraft[]): Set<string> {
    const keys = new Set<string>()

    for (const game of games) {
        for (const slot of [...game.bluePickSlots, ...game.redPickSlots]) {
            if (slot.championName) keys.add(normalizeChampionName(slot.championName))
        }
    }

    return keys
}

function formatPickSlotsForExport(slots: PickSlot[]): string {
    const filled = slots
        .filter((slot) => slot.championName)
        .map((slot, index) => {
            const roleLabel = slot.role ? ` (${ROLE_LABELS[slot.role]})` : ""
            return `${index + 1}. ${slot.championName}${roleLabel}`
        })

    return filled.length > 0 ? filled.join(" / ") : "—"
}

function formatBansForExport(bans: string[]): string {
    const filled = bans.filter(Boolean)
    return filled.length > 0 ? filled.join(" / ") : "—"
}

function formatSingleGameDraftForExport(game: CompletedGameDraft, labelSuffix = ""): string {
    return [
        `Game ${game.gameNumber}${labelSuffix}`,
        `Blue Bans: ${formatBansForExport(game.blueBans)}`,
        `Blue Picks: ${formatPickSlotsForExport(game.bluePickSlots)}`,
        `Red Bans: ${formatBansForExport(game.redBans)}`,
        `Red Picks: ${formatPickSlotsForExport(game.redPickSlots)}`,
    ].join("\n")
}

export function DraftHelper({ matches }: DraftHelperProps) {
    const { t, lang } = useTranslation()

    const WEIGHT_LABELS: Record<WeightKey, string> = {
        draftPriority: t("dh_wLabel_draftPriority"),
        roleStats: t("dh_wLabel_roleStats"),
        synergy: t("dh_wLabel_synergy"),
        matchup: t("dh_wLabel_matchup"),
        winRate: t("dh_wLabel_winRate"),
        sampleSize: t("dh_wLabel_sampleSize"),
    }

    const PATCH_PRESET_LABELS: Record<PatchWeightPresetKey, TranslationKey> = {
        balanced: "dh_pPreset_balanced",
        currentFocused: "dh_pPreset_currentFocused",
        stable: "dh_pPreset_stable",
        currentOnly: "dh_pPreset_currentOnly",
    }

    const [bluePickSlots, setBluePickSlots] = useState<PickSlot[]>(createEmptyPickSlots)
    const [redPickSlots, setRedPickSlots] = useState<PickSlot[]>(createEmptyPickSlots)
    const [blueBans, setBlueBans] = useState<string[]>(["", "", "", "", ""])
    const [redBans, setRedBans] = useState<string[]>(["", "", "", "", ""])
    const [excludeBans, setExcludeBans] = useState(true)
    const [minGames, setMinGames] = useState(5)
    const [recommendationSide, setRecommendationSide] = useState<DraftVisualSide>("blue")
    const [activeDraftSlot, setActiveDraftSlot] = useState<ActiveDraftSlot | null>(null)
    const [championSearch, setChampionSearch] = useState("")
    const [poolRoleFilter, setPoolRoleFilter] = useState<Role | null>(null)
    const [draftFlowEnabled, setDraftFlowEnabled] = useState(false)
    const [flowStepIndex, setFlowStepIndex] = useState(0)
    const [history, setHistory] = useState<DraftSnapshot[]>([])
    const [weights, setWeights] = useState<WeightConfig>(DEFAULT_WEIGHTS)
    const [patchWeights, setPatchWeights] = useState<number[]>(DEFAULT_PATCH_WEIGHTS)
    const [seriesGameNumber, setSeriesGameNumber] = useState(1)
    const [fearlessEnabled, setFearlessEnabled] = useState(false)
    const [seriesHistory, setSeriesHistory] = useState<CompletedGameDraft[]>([])
    const [copyStatus, setCopyStatus] = useState("")

    const bluePicks = useMemo(() => slotsToDraftPicks(bluePickSlots), [bluePickSlots])
    const redPicks = useMemo(() => slotsToDraftPicks(redPickSlots), [redPickSlots])

    const recentPatchData = useMemo(() => weightedPatchWindow(matches, patchWeights), [matches, patchWeights])

    const fearlessChampionSet = useMemo(
        () => (fearlessEnabled ? getFearlessChampionKeys(seriesHistory) : new Set<string>()),
        [fearlessEnabled, seriesHistory],
    )

    const allBans = useMemo(() => {
        return [...blueBans, ...redBans].map((entry) => entry.trim()).filter(Boolean)
    }, [blueBans, redBans])

    const unavailableChampions = useMemo(() => {
        return [...allBans, ...fearlessChampionSet]
    }, [allBans, fearlessChampionSet])

    const blueRecommendationDraftState = useMemo(
        () =>
            createRecommendationDraftState({
                recommendationSide: "blue",
                bluePicks,
                redPicks,
                bans: unavailableChampions,
                excludeBans,
                minGames,
            }),
        [bluePicks, redPicks, unavailableChampions, excludeBans, minGames],
    )

    const redRecommendationDraftState = useMemo(
        () =>
            createRecommendationDraftState({
                recommendationSide: "red",
                bluePicks,
                redPicks,
                bans: unavailableChampions,
                excludeBans,
                minGames,
            }),
        [bluePicks, redPicks, unavailableChampions, excludeBans, minGames],
    )

    const blueWeightedRecommendations = useMemo(
        () => weightedRecommendations(recentPatchData.matches, blueRecommendationDraftState, weights),
        [recentPatchData.matches, blueRecommendationDraftState, weights],
    )

    const redWeightedRecommendations = useMemo(
        () => weightedRecommendations(recentPatchData.matches, redRecommendationDraftState, weights),
        [recentPatchData.matches, redRecommendationDraftState, weights],
    )

    const recommendations = recommendationSide === "blue" ? blueWeightedRecommendations : redWeightedRecommendations

    const topRecommendations = recommendations.slice(0, 20)

    const activeSidePickSlots = recommendationSide === "blue" ? bluePickSlots : redPickSlots
    const enemySidePickSlots = recommendationSide === "blue" ? redPickSlots : bluePickSlots
    const activeSidePicks = recommendationSide === "blue" ? bluePicks : redPicks

    const suggestedNextRole = poolRoleFilter ?? null

    const heroRecommendation = suggestedNextRole
        ? getRoleRecommendations(recommendations, suggestedNextRole, 1)[0]
        : topRecommendations[0]

    const recommendationsByRole = ROLES.map((role) => ({
        role,
        recommendations: getRoleRecommendations(recommendations, role, 4),
    }))

    const roleChampionCatalog = useMemo(
        () => buildRoleChampionCatalog(recentPatchData.matches),
        [recentPatchData.matches],
    )

    const flexChampionCatalog = useMemo(
        () => buildFlexChampionCatalog(recentPatchData.matches),
        [recentPatchData.matches],
    )

    const selectedChampionSet = useMemo(() => {
        return new Set(
            [...bluePickSlots, ...redPickSlots]
                .map((slot) => slot.championName)
                .filter(Boolean)
                .map((name) => normalizeChampionName(name)),
        )
    }, [bluePickSlots, redPickSlots])

    const bannedChampionSet = useMemo(() => {
        return new Set([...allBans.map((name) => normalizeChampionName(name)), ...fearlessChampionSet])
    }, [allBans, fearlessChampionSet])

    const championPool = useMemo(() => {
        if (!poolRoleFilter) return ALL_CHAMPIONS

        const roleChampionSet = roleChampionCatalog[poolRoleFilter]

        if (roleChampionSet.size === 0) {
            return ALL_CHAMPIONS
        }

        return ALL_CHAMPIONS.filter((champion) =>
            roleChampionSet.has(normalizeChampionName(champion)),
        )
    }, [poolRoleFilter, roleChampionCatalog])

    const blueDraftEdge = useMemo(
        () =>
            calculateDraftEdgeSummary({
                matches: recentPatchData.matches,
                ownSlots: bluePickSlots,
                enemySlots: redPickSlots,
                weights,
            }),
        [recentPatchData.matches, bluePickSlots, redPickSlots, weights],
    )

    const redDraftEdge = useMemo(
        () =>
            calculateDraftEdgeSummary({
                matches: recentPatchData.matches,
                ownSlots: redPickSlots,
                enemySlots: bluePickSlots,
                weights,
            }),
        [recentPatchData.matches, redPickSlots, bluePickSlots, weights],
    )

    const activeDraftEdge = recommendationSide === "blue" ? blueDraftEdge : redDraftEdge
    const enemyDraftEdge = recommendationSide === "blue" ? redDraftEdge : blueDraftEdge
    const draftEdgeDelta = activeDraftEdge.score - enemyDraftEdge.score

    const activeTeamCompReport = useMemo(
        () => generateTeamCompReport(activeSidePickSlots, t),
        [activeSidePickSlots, t],
    )

    const opponentRecommendations = recommendationSide === "blue" ? redWeightedRecommendations : blueWeightedRecommendations

    const banRecommendations = useMemo(
        () =>
            generateBanRecommendations({
                opponentRecommendations,
                opponentSlots: recommendationSide === "blue" ? redPickSlots : bluePickSlots,
                selectedChampionSet,
                bannedChampionSet,
                flexChampionCatalog,
                limit: 8,
            }, t),
        [
            opponentRecommendations,
            recommendationSide,
            redPickSlots,
            bluePickSlots,
            selectedChampionSet,
            bannedChampionSet,
            flexChampionCatalog,
            t,
        ],
    )

    const currentGameHasContent = draftHasContent(bluePickSlots, redPickSlots, blueBans, redBans)

    const currentGameDraft: CompletedGameDraft = {
        gameNumber: seriesGameNumber,
        bluePickSlots: clonePickSlots(bluePickSlots),
        redPickSlots: clonePickSlots(redPickSlots),
        blueBans: [...blueBans],
        redBans: [...redBans],
    }

    function captureSnapshot(): DraftSnapshot {
        return {
            bluePickSlots: clonePickSlots(bluePickSlots),
            redPickSlots: clonePickSlots(redPickSlots),
            blueBans: [...blueBans],
            redBans: [...redBans],
            recommendationSide,
            activeDraftSlot,
            championSearch,
            poolRoleFilter,
            draftFlowEnabled,
            flowStepIndex,
        }
    }

    function pushHistory() {
        setHistory((current) => [...current, captureSnapshot()].slice(-40))
    }

    function restorePreviousStep() {
        setHistory((current) => {
            const previous = current[current.length - 1]
            if (!previous) return current

            setBluePickSlots(clonePickSlots(previous.bluePickSlots))
            setRedPickSlots(clonePickSlots(previous.redPickSlots))
            setBlueBans([...previous.blueBans])
            setRedBans([...previous.redBans])
            setRecommendationSide(previous.recommendationSide)
            setActiveDraftSlot(previous.activeDraftSlot)
            setChampionSearch(previous.championSearch)
            setPoolRoleFilter(previous.poolRoleFilter)
            setDraftFlowEnabled(previous.draftFlowEnabled)
            setFlowStepIndex(previous.flowStepIndex)

            return current.slice(0, -1)
        })
    }

    function activateDraftFlow() {
        const nextIndex = findNextAvailableFlowStepIndex(
            0,
            bluePickSlots,
            redPickSlots,
            blueBans,
            redBans,
        )
        const nextSlot = draftFlowSlotForIndex(
            nextIndex,
            bluePickSlots,
            redPickSlots,
            blueBans,
            redBans,
        )

        setDraftFlowEnabled(true)
        setFlowStepIndex(nextIndex >= 0 ? nextIndex : DRAFT_FLOW.length)
        setActiveDraftSlot(nextSlot)

        if (nextSlot) {
            setRecommendationSide(nextSlot.visualSide)
        }
    }

    function deactivateDraftFlow() {
        setDraftFlowEnabled(false)
    }

    function resetDraft() {
        setBluePickSlots(createEmptyPickSlots())
        setRedPickSlots(createEmptyPickSlots())
        setBlueBans(["", "", "", "", ""])
        setRedBans(["", "", "", "", ""])
        setExcludeBans(true)
        setMinGames(5)
        setRecommendationSide("blue")
        setActiveDraftSlot(null)
        setChampionSearch("")
        setPoolRoleFilter(null)
        setDraftFlowEnabled(false)
        setFlowStepIndex(0)
        setHistory([])
        setWeights(DEFAULT_WEIGHTS)
        setSeriesGameNumber(1)
        setSeriesHistory([])
        setFearlessEnabled(false)
        setCopyStatus("")
    }

    function clearCurrentGameDraft() {
        setBluePickSlots(createEmptyPickSlots())
        setRedPickSlots(createEmptyPickSlots())
        setBlueBans(["", "", "", "", ""])
        setRedBans(["", "", "", "", ""])
        setActiveDraftSlot(null)
        setChampionSearch("")
        setPoolRoleFilter(null)
        setDraftFlowEnabled(false)
        setFlowStepIndex(0)
        setHistory([])
    }

    function saveCurrentGameToSeries() {
        if (!currentGameHasContent) return

        setSeriesHistory((current) => {
            const withoutCurrentGame = current.filter((game) => game.gameNumber !== seriesGameNumber)
            return [...withoutCurrentGame, currentGameDraft].sort((a, b) => a.gameNumber - b.gameNumber)
        })
    }

    function goToNextSeriesGame() {
        if (seriesGameNumber >= MAX_SERIES_GAMES) return

        if (currentGameHasContent) {
            setSeriesHistory((current) => {
                const withoutCurrentGame = current.filter((game) => game.gameNumber !== seriesGameNumber)
                return [...withoutCurrentGame, currentGameDraft].sort((a, b) => a.gameNumber - b.gameNumber)
            })
        }

        setSeriesGameNumber((current) => Math.min(MAX_SERIES_GAMES, current + 1))
        clearCurrentGameDraft()
        setRecommendationSide("blue")
    }

    function resetSeries() {
        setSeriesGameNumber(1)
        setSeriesHistory([])
        setCopyStatus("")
        clearCurrentGameDraft()
    }

    function buildDraftExportText(): string {
        const gamesToExport = [...seriesHistory]
        const hasSavedCurrentGame = gamesToExport.some((game) => game.gameNumber === seriesGameNumber)

        if (currentGameHasContent && !hasSavedCurrentGame) {
            gamesToExport.push(currentGameDraft)
        }

        gamesToExport.sort((a, b) => a.gameNumber - b.gameNumber)

        const header = [
            "LoL Pro Meta Tool Draft Export",
            `Series Game: ${seriesGameNumber}/${MAX_SERIES_GAMES}`,
            `Fearless Draft: ${fearlessEnabled ? "ON" : "OFF"}`,
            `Draft Edge: Blue ${blueDraftEdge.score.toFixed(1)} / Red ${redDraftEdge.score.toFixed(1)}`,
        ]

        const body = gamesToExport.length > 0
            ? gamesToExport.map((game) => formatSingleGameDraftForExport(game, game.gameNumber === seriesGameNumber ? " (current)" : ""))
            : [t("dh_noDraftYet")]

        return [...header, "", ...body].join("\n\n")
    }

    async function copyDraftToClipboard() {
        const exportText = buildDraftExportText()

        try {
            await navigator.clipboard.writeText(exportText)
            setCopyStatus(t("dh_draftCopied"))
        } catch {
            setCopyStatus(t("dh_copyFailed"))
        }

        window.setTimeout(() => setCopyStatus(""), 1800)
    }

    function moveToNextFlowSlot(
        nextBluePickSlots: PickSlot[],
        nextRedPickSlots: PickSlot[],
        nextBlueBans: string[],
        nextRedBans: string[],
    ) {
        const nextIndex = findNextAvailableFlowStepIndex(
            flowStepIndex + 1,
            nextBluePickSlots,
            nextRedPickSlots,
            nextBlueBans,
            nextRedBans,
        )
        const nextSlot = draftFlowSlotForIndex(
            nextIndex,
            nextBluePickSlots,
            nextRedPickSlots,
            nextBlueBans,
            nextRedBans,
        )

        setFlowStepIndex(nextIndex >= 0 ? nextIndex : DRAFT_FLOW.length)
        setActiveDraftSlot(nextSlot)

        if (nextSlot) {
            setRecommendationSide(nextSlot.visualSide)
        } else {
            setChampionSearch("")
        }
    }

    function applyChampionToSlot(slot: ActiveDraftSlot, championName: string, roleOverride?: Role | null) {
        const championKey = normalizeChampionName(championName)

        if (fearlessChampionSet.has(championKey) || selectedChampionSet.has(championKey) || bannedChampionSet.has(championKey)) {
            return
        }

        pushHistory()

        let nextBluePickSlots = clonePickSlots(bluePickSlots)
        let nextRedPickSlots = clonePickSlots(redPickSlots)
        let nextBlueBans = [...blueBans]
        let nextRedBans = [...redBans]

        if (slot.type === "pick") {
            const ownSlots = slot.visualSide === "blue" ? nextBluePickSlots : nextRedPickSlots
            const inferredRole =
                roleOverride ??
                inferChampionRole({
                    championName,
                    preferredRole: poolRoleFilter,
                    recommendations,
                    ownSlots,
                    flexChampionCatalog,
                })

            ownSlots[slot.index] = {
                championName,
                role: inferredRole,
            }

            if (slot.visualSide === "blue") {
                nextBluePickSlots = ownSlots
            } else {
                nextRedPickSlots = ownSlots
            }
        } else if (slot.visualSide === "blue") {
            nextBlueBans[slot.index] = championName
        } else {
            nextRedBans[slot.index] = championName
        }

        setBluePickSlots(nextBluePickSlots)
        setRedPickSlots(nextRedPickSlots)
        setBlueBans(nextBlueBans)
        setRedBans(nextRedBans)
        setRecommendationSide(slot.visualSide)
        setChampionSearch("")

        if (draftFlowEnabled) {
            moveToNextFlowSlot(nextBluePickSlots, nextRedPickSlots, nextBlueBans, nextRedBans)
        } else {
            setActiveDraftSlot(null)
        }
    }

    function handleChampionGridSelect(championName: string) {
        if (!activeDraftSlot) return
        applyChampionToSlot(activeDraftSlot, championName)
    }

    function handleRecommendationPick(entry: DraftRecommendation) {
        const targetSlots = recommendationSide === "blue" ? bluePickSlots : redPickSlots
        const targetIndex =
            activeDraftSlot?.type === "pick" && activeDraftSlot.visualSide === recommendationSide
                ? activeDraftSlot.index
                : nextEmptyPickIndex(targetSlots)

        if (targetIndex < 0) return

        applyChampionToSlot(
            {
                type: "pick",
                visualSide: recommendationSide,
                index: targetIndex,
            },
            entry.championName,
            entry.role,
        )
    }

    function clearPick(visualSide: DraftVisualSide, index: number) {
        pushHistory()

        if (visualSide === "blue") {
            setBluePickSlots((current) => {
                const next = clonePickSlots(current)
                next[index] = { championName: "", role: null }
                return next
            })
        } else {
            setRedPickSlots((current) => {
                const next = clonePickSlots(current)
                next[index] = { championName: "", role: null }
                return next
            })
        }

        if (
            activeDraftSlot?.type === "pick" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index
        ) {
            setActiveDraftSlot(null)
        }
    }

    function clearBan(visualSide: DraftVisualSide, index: number) {
        pushHistory()

        if (visualSide === "blue") {
            setBlueBans((current) => {
                const next = [...current]
                next[index] = ""
                return next
            })
        } else {
            setRedBans((current) => {
                const next = [...current]
                next[index] = ""
                return next
            })
        }

        if (
            activeDraftSlot?.type === "ban" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index
        ) {
            setActiveDraftSlot(null)
        }
    }

    function updatePickRole(visualSide: DraftVisualSide, index: number, role: Role | null) {
        pushHistory()

        if (visualSide === "blue") {
            setBluePickSlots((current) => {
                const next = clonePickSlots(current)
                next[index] = { ...next[index], role }
                return next
            })
        } else {
            setRedPickSlots((current) => {
                const next = clonePickSlots(current)
                next[index] = { ...next[index], role }
                return next
            })
        }
    }

    function renderBanSlot(visualSide: DraftVisualSide, index: number) {
        const bans = visualSide === "blue" ? blueBans : redBans
        const championName = bans[index]
        const isActive =
            activeDraftSlot?.type === "ban" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index

        return (
            <div key={`${visualSide}-ban-${index}`} className="draft-ban-slot-wrap">
                <button
                    type="button"
                    className={[
                        "draft-ban-slot",
                        visualSide,
                        isActive ? "is-active" : "",
                        championName ? "has-champion" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => {
                        setActiveDraftSlot({ type: "ban", visualSide, index })
                        setRecommendationSide(visualSide)
                    }}
                    title={championName || `Ban ${index + 1}`}
                >
                    {championName ? iconFor(championName) : <span>B{index + 1}</span>}
                </button>

                {championName && (
                    <button
                        type="button"
                        className="draft-mini-clear"
                        onClick={() => clearBan(visualSide, index)}
                        aria-label={`${t("dh_removeBan")} ${championName}`}
                        title={t("dh_removeBan")}
                    >
                        ×
                    </button>
                )}
            </div>
        )
    }

    function renderPickSlot(visualSide: DraftVisualSide, index: number) {
        const pickSlots = visualSide === "blue" ? bluePickSlots : redPickSlots
        const slot = pickSlots[index]
        const championName = slot.championName
        const flexInfo = championName ? flexChampionCatalog.get(normalizeChampionName(championName)) : undefined
        const isActive =
            activeDraftSlot?.type === "pick" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index

        return (
            <div key={`${visualSide}-pick-${index}`} className="draft-pick-slot-wrap">
                <button
                    type="button"
                    className={[
                        "draft-pick-slot",
                        visualSide,
                        isActive ? "is-active" : "",
                        championName ? "has-champion" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => {
                        setActiveDraftSlot({
                            type: "pick",
                            visualSide,
                            index,
                        })
                        setRecommendationSide(visualSide)
                    }}
                    title={championName || `Pick ${index + 1}`}
                >
                    <span className="draft-pick-role">P{index + 1}</span>

                    <span className="draft-pick-icon">
                        {championName ? iconFor(championName) : null}
                    </span>

                    <span className="draft-pick-name">
                        {championName || t("dh_selectPickPlaceholder")}
                        {championName ? (
                            <span className="muted" style={{ display: "block", fontWeight: 600 }}>
                                {pickSlotRoleLabel(slot)}
                                {flexInfo?.isFlex ? ` · Flex ${flexRoleLabel(flexInfo)}` : ""}
                            </span>
                        ) : null}
                    </span>
                </button>

                {championName && (
                    <select
                        value={slot.role ?? ""}
                        onChange={(event) =>
                            updatePickRole(
                                visualSide,
                                index,
                                event.target.value ? (event.target.value as Role) : null,
                            )
                        }
                        title={t("dh_assignRoleTitle")}
                        style={{
                            width: "100%",
                            marginTop: "0.3rem",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            background: "var(--surface2)",
                            color: "var(--text)",
                            padding: "0.35rem 0.45rem",
                            fontSize: "0.75rem",
                        }}
                    >
                        <option value="">Role?</option>
                        {ROLES.map((role) => (
                            <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                            </option>
                        ))}
                    </select>
                )}

                {championName && (
                    <button
                        type="button"
                        className="draft-mini-clear"
                        onClick={() => clearPick(visualSide, index)}
                        aria-label={`${t("dh_removePick")} ${championName}`}
                        title={t("dh_removePick")}
                    >
                        ×
                    </button>
                )}
            </div>
        )
    }

    function renderSidePanel(visualSide: DraftVisualSide) {
        const pickSlots = visualSide === "blue" ? bluePickSlots : redPickSlots
        const bans = visualSide === "blue" ? blueBans : redBans

        return (
            <div className={`draft-team-panel ${visualSide}`}>
                <div className="draft-team-header">
                    <span>{visualSide === "blue" ? "BLUE SIDE" : "RED SIDE"}</span>
                </div>

                <div className="draft-ban-row">
                    {bans.map((_, index) => renderBanSlot(visualSide, index))}
                </div>

                <div className="draft-pick-list">
                    {pickSlots.map((_, index) => renderPickSlot(visualSide, index))}
                </div>

                <div className="recommendation-card" style={{ marginTop: "0.85rem", padding: "0.75rem" }}>
                    <h3>Summary</h3>
                    <p className="muted">
                        {filledPickCount(pickSlots)}/5 Picks · {filledBanCount(bans)}/5 Bans
                    </p>
                    <p className="muted">
                        {t("dh_assignedRoles")} {Object.keys(slotsToDraftPicks(pickSlots)).length}/5
                    </p>
                </div>
            </div>
        )
    }

    function renderRecommendationButton(entry: DraftRecommendation, index: number) {
        const disabled = Boolean(activeSidePicks[entry.role])
        const flexInfo = flexChampionCatalog.get(normalizeChampionName(entry.championName))

        return (
            <button
                key={`${entry.championName}-${entry.role}`}
                type="button"
                className="secondary-button"
                onClick={() => handleRecommendationPick(entry)}
                disabled={disabled}
                title={disabled ? `${ROLE_LABELS[entry.role]}: ${t("dh_roleOccupied")}` : t("dh_applyPick")}
                style={{
                    display: "grid",
                    gridTemplateColumns: "24px minmax(0, 1fr)",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    textAlign: "left",
                    opacity: disabled ? 0.55 : 1,
                }}
            >
                <span className="draft-pick-icon" style={{ width: 24, height: 24 }}>
                    {iconFor(entry.championName)}
                </span>
                <span>
                    <strong>
                        {index + 1}. {entry.championName}
                    </strong>
                    <span className="muted" style={{ display: "block" }}>
                        {ROLE_LABELS[entry.role]} · Score {formatScore(entry.totalScore)} · {entry.games} Picks
                        {flexInfo?.isFlex ? ` · Flex ${flexRoleLabel(flexInfo)}` : ""}
                    </span>
                </span>
            </button>
        )
    }

    function updateWeight(key: WeightKey, value: number) {
        setWeights((current) => ({
            ...current,
            [key]: value,
        }))
    }

    function applyWeightPreset(preset: DraftAiPresetKey) {
        setWeights({ ...WEIGHT_PRESETS[preset].weights })
    }

    function applyPatchWeightPreset(preset: PatchWeightPresetKey) {
        setPatchWeights([...PATCH_WEIGHT_PRESETS[preset].weights])
    }

    function updatePatchWeight(index: number, value: number) {
        setPatchWeights((current) => {
            const next = [...current]
            next[index] = value
            return next
        })
    }

    function renderPatchWeightSlider(index: number) {
        const label = index === 0
            ? t("dh_currentPatch")
            : lang === "de"
                ? `${index} Patch${index === 1 ? "" : "es"} alt`
                : `${index} ${index === 1 ? t("dh_patchOld1") : t("dh_patchOldN")}`
        const patch = recentPatchData.summaries[index]?.patch ?? "—"
        const rawMatches = recentPatchData.summaries[index]?.rawMatches ?? 0

        return (
            <label key={index} className="draft-weight-control">
                <span>
                    {label}
                    <strong>{patchWeights[index] ?? 0}%</strong>
                </span>
                <span className="muted">
                    {patch} · {rawMatches.toLocaleString("de-DE")} {t("dh_games")}
                </span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={patchWeights[index] ?? 0}
                    onChange={(event) => updatePatchWeight(index, Number(event.target.value))}
                />
            </label>
        )
    }

    function renderWeightSlider(key: WeightKey) {
        return (
            <label key={key} className="draft-weight-control">
                <span>
                    {WEIGHT_LABELS[key]}
                    <strong>{weights[key]}</strong>
                </span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={weights[key]}
                    onChange={(event) => updateWeight(key, Number(event.target.value))}
                />
            </label>
        )
    }

    return (
        <section className="draft-helper">
            <div className="section-header">
                <div>
                    <h2>Draft Cockpit</h2>
                    <p>
                        {t("dh_patchInfo")} {formatPatchWindowSummary(recentPatchData)}
                    </p>
                    <p className="muted">
                        {t("dh_rawSample")} {recentPatchData.rawSample.toLocaleString("de-DE")} {t("dh_games")} · {t("dh_weightedSample")} {recentPatchData.weightedSample.toLocaleString("de-DE")} {t("dh_games")}
                    </p>
                </div>

                <button type="button" className="secondary-button" onClick={resetDraft}>
                    {t("dh_resetDraft")}
                </button>
            </div>

            <div className="draft-controls draft-controls-compact">
                <label>
                    {t("dh_minPicksLabel")}
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={minGames}
                        onChange={(event) => setMinGames(Number(event.target.value) || 1)}
                    />
                </label>

                <label className="checkbox-row">
                    <input
                        type="checkbox"
                        checked={excludeBans}
                        onChange={(event) => setExcludeBans(event.target.checked)}
                    />
                    {t("dh_excludeBans")}
                </label>
            </div>

            <div className="recommendation-section series-panel">
                <div className="champion-picker-header">
                    <div>
                        <h3>{t("dh_seriesTitle")}</h3>
                        <p className="muted">
                            Game {seriesGameNumber}/{MAX_SERIES_GAMES} · {t("dh_savedGames")} {seriesHistory.length}
                            {fearlessEnabled ? ` · ${t("dh_fearlessLocked")} ${fearlessChampionSet.size}` : ""}
                        </p>
                    </div>

                    <div className="series-actions">
                        <button
                            type="button"
                            className={["role-tab", fearlessEnabled ? "role-tab-active" : ""].filter(Boolean).join(" ")}
                            onClick={() => setFearlessEnabled((current) => !current)}
                        >
                            {fearlessEnabled ? t("dh_fearlessOn") : t("dh_fearlessOff")}
                        </button>

                        <button
                            type="button"
                            className="role-tab"
                            onClick={saveCurrentGameToSeries}
                            disabled={!currentGameHasContent}
                        >
                            {t("dh_saveGame")}
                        </button>

                        <button
                            type="button"
                            className="role-tab"
                            onClick={goToNextSeriesGame}
                            disabled={seriesGameNumber >= MAX_SERIES_GAMES}
                        >
                            {t("dh_nextGame")}
                        </button>

                        <button type="button" className="role-tab" onClick={copyDraftToClipboard}>
                            {t("dh_copyDraft")}
                        </button>

                        <button type="button" className="role-tab" onClick={resetSeries}>
                            {t("dh_resetSeries")}
                        </button>
                    </div>
                </div>

                {copyStatus ? <p className="muted">{copyStatus}</p> : null}

                <div className="series-game-row">
                    {Array.from({ length: MAX_SERIES_GAMES }, (_, index) => {
                        const gameNumber = index + 1
                        const isCurrent = gameNumber === seriesGameNumber
                        const isSaved = seriesHistory.some((game) => game.gameNumber === gameNumber)

                        return (
                            <span
                                key={gameNumber}
                                className={[
                                    "series-game-pill",
                                    isCurrent ? "is-current" : "",
                                    isSaved ? "is-saved" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            >
                                G{gameNumber}{isCurrent ? " · Live" : isSaved ? " · saved" : ""}
                            </span>
                        )
                    })}
                </div>

                {fearlessEnabled && fearlessChampionSet.size > 0 ? (
                    <p className="muted">
                        {t("dh_fearlessPool")} {[...fearlessChampionSet].slice(0, 18).join(", ")}
                        {fearlessChampionSet.size > 18 ? " …" : ""}
                    </p>
                ) : null}
            </div>

            <div className="role-filter-tabs" aria-label="Draft-Flow">
                <span className="muted" style={{ alignSelf: "center", marginRight: "0.35rem" }}>
                    {t("dh_draftFlow")}
                </span>

                {draftFlowEnabled ? (
                    <button type="button" className="role-tab role-tab-active" onClick={deactivateDraftFlow}>
                        {t("dh_flowActive")}
                    </button>
                ) : (
                    <button type="button" className="role-tab" onClick={activateDraftFlow}>
                        {t("dh_flowEnable")}
                    </button>
                )}

                <button
                    type="button"
                    className="role-tab"
                    onClick={restorePreviousStep}
                    disabled={history.length === 0}
                    style={{ opacity: history.length === 0 ? 0.5 : 1 }}
                >
                    {t("dh_stepBack")}
                </button>

                <span className="muted" style={{ alignSelf: "center" }}>
                    {draftFlowEnabled
                        ? `${t("dh_flowUpNext")} ${flowLabelForSlot(activeDraftSlot, flowStepIndex)}`
                        : t("dh_manualMode")}
                </span>
            </div>

            <div className="role-filter-tabs" aria-label="Empfehlungsseite">
                <span className="muted" style={{ alignSelf: "center", marginRight: "0.35rem" }}>
                    {t("dh_liveRecsFor")}
                </span>

                <button
                    type="button"
                    className={[
                        "role-tab",
                        recommendationSide === "blue" ? "role-tab-active" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => setRecommendationSide("blue")}
                >
                    Blue Side
                </button>

                <button
                    type="button"
                    className={[
                        "role-tab",
                        recommendationSide === "red" ? "role-tab-active" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => setRecommendationSide("red")}
                >
                    Red Side
                </button>
            </div>

            <div className="recommendation-section draft-weight-panel">
                <div className="champion-picker-header">
                    <div>
                        <h3>{t("dh_patchWeightTitle")}</h3>
                        <p>{t("dh_patchWeightDesc")}</p>
                        <p className="muted">{t("dh_patchWeightNote")}</p>
                    </div>

                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setPatchWeights([...DEFAULT_PATCH_WEIGHTS])}
                    >
                        {t("dh_resetPatchWeight")}
                    </button>
                </div>

                <div className="role-filter-tabs" aria-label="Patch-Gewichtungs-Presets">
                    {(Object.keys(PATCH_WEIGHT_PRESETS) as PatchWeightPresetKey[]).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className="role-tab"
                            onClick={() => applyPatchWeightPreset(preset)}
                        >
                            {t(PATCH_PRESET_LABELS[preset])}
                        </button>
                    ))}
                </div>

                <div className="draft-weight-grid">
                    {Array.from({ length: PATCH_WEIGHT_MAX_PATCHES }, (_, index) => renderPatchWeightSlider(index))}
                </div>
            </div>

            <div className="recommendation-section draft-weight-panel">
                <div className="champion-picker-header">
                    <div>
                        <h3>{t("dh_weightTitle")}</h3>
                        <p>{t("dh_weightDesc")}</p>
                    </div>

                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setWeights(DEFAULT_WEIGHTS)}
                    >
                        {t("dh_resetWeight")}
                    </button>
                </div>

                <div className="role-filter-tabs" aria-label="Wichtungs-Presets">
                    {(Object.keys(WEIGHT_PRESETS) as DraftAiPresetKey[]).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className="role-tab"
                            onClick={() => applyWeightPreset(preset)}
                        >
                            {WEIGHT_PRESETS[preset].label}
                        </button>
                    ))}
                </div>

                <div className="draft-weight-grid">
                    {(Object.keys(DEFAULT_WEIGHTS) as WeightKey[]).map((key) => renderWeightSlider(key))}
                </div>
            </div>

            <div className="recommendation-section">
                <div className="champion-picker-header">
                    <div>
                        <h3>Draft Edge</h3>
                        <p className="muted">{t("dh_edgeDesc")}</p>
                    </div>
                    <strong className={draftEdgeDelta >= 0 ? "score-pos" : "score-neg"}>
                        {sideLabel(recommendationSide)} {draftEdgeDelta >= 0 ? "+" : ""}
                        {draftEdgeDelta.toFixed(1)} Edge
                    </strong>
                </div>

                <div className="dashboard-stats">
                    <div className="stat-card">
                        <span className="stat-value">{blueDraftEdge.score.toFixed(1)}</span>
                        <span className="stat-label">Blue Draft Edge</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{redDraftEdge.score.toFixed(1)}</span>
                        <span className="stat-label">Red Draft Edge</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{Math.round(activeDraftEdge.averageConfidence * 100)}%</span>
                        <span className="stat-label">Confidence</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{activeDraftEdge.assignedRoles}/5</span>
                        <span className="stat-label">{t("dh_rolesSet")}</span>
                    </div>
                </div>

                <div className="recommendation-grid" style={{ marginTop: "0.85rem" }}>
                    <div className="recommendation-card">
                        <h3>{t("dh_strengthsData")}</h3>
                        {activeDraftEdge.notes.map((note) => (
                            <p key={note} className="muted">
                                {note}
                            </p>
                        ))}
                    </div>
                    <div className="recommendation-card">
                        <h3>Team Identity</h3>

                        <p className="draft-comp-identity">{activeTeamCompReport.identity}</p>
                        <div className="draft-comp-pills">
                            {activeTeamCompReport.primaryTags.length === 0 ? (
                                <span className="draft-comp-pill">{t("dh_tagsOpen")}</span>
                            ) : (
                                activeTeamCompReport.primaryTags.map((tag) => (
                                    <span key={tag} className="draft-comp-pill">
                                        {tag}
                                    </span>
                                ))
                            )}
                        </div>
                        <p className="muted">
                            Damage: {activeTeamCompReport.damageProfile.label} · AP {activeTeamCompReport.damageProfile.ap} · AD {activeTeamCompReport.damageProfile.ad} · Mixed {activeTeamCompReport.damageProfile.mixed}
                        </p>
                    </div>
                    <div className="recommendation-card">
                        <h3>Comp Checks</h3>
                        {activeTeamCompReport.warnings.length === 0 ? (
                            <p className="muted">{t("dh_noWarnings")}</p>
                        ) : (
                            activeTeamCompReport.warnings.map((warning) => (
                                <p key={`${warning.title}-${warning.description}`} className="muted">
                                    <strong
                                        className={
                                            warning.severity === "danger"
                                                ? "score-neg"
                                                : warning.severity === "warning"
                                                  ? "priority-score"
                                                  : ""
                                        }
                                    >
                                        {warning.title}:
                                    </strong>{" "}
                                    {warning.description}
                                </p>
                            ))
                        )}
                    </div>
                    <div className="recommendation-card draft-comp-wide">
                        <h3>{t("dh_compProfile")}</h3>
                        <div className="draft-comp-metric-grid">
                            {activeTeamCompReport.metrics.map((metric) => (
                                <div key={metric.label} className="draft-comp-metric" title={metric.description}>
                                    <span>
                                        {metric.label}
                                        <strong>{metric.value}/{metric.max}</strong>
                                    </span>
                                    <div className="draft-comp-meter">
                                        <div
                                            className="draft-comp-meter-fill"
                                            style={{ width: `${Math.min(100, (metric.value / metric.max) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="recommendation-card draft-comp-wide">
                        <h3>{t("dh_compStrengths")}</h3>
                        {activeTeamCompReport.strengths.length === 0 ? (
                            <p className="muted">{t("dh_noStrengths")}</p>
                        ) : (
                            activeTeamCompReport.strengths.map((strength) => (
                                <p key={strength} className="muted">
                                    <strong className="score-pos">✓</strong> {strength}
                                </p>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="recommendation-section">
                <div className="champion-picker-header">
                    <div>
                        <h3>{t("dh_nextDecision")}</h3>
                        <p>
                            {draftFlowEnabled
                                ? `${t("dh_flowLabel")} ${flowLabelForSlot(activeDraftSlot, flowStepIndex)}`
                                : activeDraftSlot
                                    ? `${t("dh_activeSlot")} ${describeActiveSlot(activeDraftSlot)}`
                                    : `${sideLabel(recommendationSide)} ${t("dh_selectSlotHint")}`}
                        </p>
                        <p className="muted">{t("dh_picksNote")}</p>
                    </div>

                    {heroRecommendation ? (
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleRecommendationPick(heroRecommendation)}
                            disabled={Boolean(activeSidePicks[heroRecommendation.role])}
                        >
                            Best Pick: {heroRecommendation.championName} ({ROLE_LABELS[heroRecommendation.role]})
                        </button>
                    ) : null}
                </div>

                <div className="dashboard-stats">
                    <div className="stat-card">
                        <span className="stat-value">{filledPickCount(activeSidePickSlots)}/5</span>
                        <span className="stat-label">{t("dh_ownPicks")}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{filledPickCount(enemySidePickSlots)}/5</span>
                        <span className="stat-label">{t("dh_enemyPicks")}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{allBans.length}/10</span>
                        <span className="stat-label">Bans</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{recommendations.length}</span>
                        <span className="stat-label">{t("dh_candidates")}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{Object.keys(activeSidePicks).length}/5</span>
                        <span className="stat-label">{t("dh_rolesSet")}</span>
                    </div>
                </div>
            </div>

            <div className="draft-layout">
                {renderSidePanel("blue")}

                <div className="champion-picker-panel draft-center-panel">
                    <div className="champion-picker-header">
                        <div>
                            <h3>{t("dh_poolTitle")}</h3>
                            <p>
                                {activeDraftSlot
                                    ? activeDraftSlot.type === "ban"
                                        ? `${t("dh_selectBanFor")} ${sideLabel(activeDraftSlot.visualSide)}${t("dh_selectBanSuffix") ? ` ${t("dh_selectBanSuffix")}` : "."}`
                                        : `${t("dh_selectPickFor")} ${sideLabel(activeDraftSlot.visualSide)} ${t("dh_selectPickSlot")} ${activeDraftSlot.index + 1}${t("dh_selectPickSuffix") ? ` ${t("dh_selectPickSuffix")}` : "."}`
                                    : t("dh_selectSlotFirst")}
                            </p>
                        </div>
                    </div>

                    <div className="role-filter-tabs">
                        <button
                            type="button"
                            className={["role-tab", poolRoleFilter === null ? "role-tab-active" : ""]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={() => setPoolRoleFilter(null)}
                        >
                            {t("filter_all")}
                        </button>
                        {ROLES.map((role) => (
                            <button
                                key={role}
                                type="button"
                                className={["role-tab", poolRoleFilter === role ? "role-tab-active" : ""]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => setPoolRoleFilter(role)}
                            >
                                {ROLE_LABELS[role]}
                            </button>
                        ))}
                    </div>

                    <ChampionPortraitGrid
                        champions={championPool}
                        selectedChampions={selectedChampionSet}
                        bannedChampions={bannedChampionSet}
                        searchQuery={championSearch}
                        onSearchQueryChange={setChampionSearch}
                        onSelectChampion={handleChampionGridSelect}
                    />
                </div>

                {renderSidePanel("red")}
            </div>

            <div className="recommendation-grid">
                {recommendationsByRole.map(({ role, recommendations }) => (
                    <div key={role} className="recommendation-card">
                        <h3>{ROLE_LABELS[role]}</h3>

                        {activeSidePicks[role] ? (
                            <p className="muted">{t("dh_roleAlreadyFilled")} {activeSidePicks[role]}</p>
                        ) : recommendations.length === 0 ? (
                            <p className="muted">{t("dh_noCandidates")}</p>
                        ) : (
                            <div style={{ display: "grid", gap: "0.45rem" }}>
                                {recommendations.map((entry, index) => renderRecommendationButton(entry, index))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="recommendation-section">
                <div className="champion-picker-header">
                    <div>
                        <h3>{t("dh_bestBansTitle")} {sideLabel(oppositeSide(recommendationSide))}</h3>
                        <p className="muted">{t("dh_banRecsDesc")}</p>
                    </div>
                </div>

                {banRecommendations.length === 0 ? (
                    <p className="empty-state">{t("dh_noBanRecs")}</p>
                ) : (
                    <div className="recommendation-grid">
                        {banRecommendations.map((entry, index) => (
                            <button
                                key={`${entry.championName}-${entry.role}`}
                                type="button"
                                className="secondary-button"
                                onClick={() => {
                                    const targetBanIndex =
                                        recommendationSide === "blue"
                                            ? blueBans.findIndex((ban) => !ban)
                                            : redBans.findIndex((ban) => !ban)

                                    if (targetBanIndex < 0) return

                                    applyChampionToSlot(
                                        {
                                            type: "ban",
                                            visualSide: recommendationSide,
                                            index: targetBanIndex,
                                        },
                                        entry.championName,
                                    )
                                }}
                            >
                                <strong>
                                    {index + 1}. {entry.championName}
                                </strong>
                                <span className="muted" style={{ display: "block" }}>
                                    {ROLE_LABELS[entry.role]} · deny score {formatScore(entry.score)} · {entry.reason}
                                    {entry.flexRoles.length >= 2 ? ` · Flex ${entry.flexRoles.map((role) => ROLE_LABELS[role]).join("/")}` : ""}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="recommendation-section">
                <h3>{t("dh_bestPicksTitle")} {sideLabel(recommendationSide)}</h3>

                {topRecommendations.length === 0 ? (
                    <p className="empty-state">{t("dh_noRecs")}</p>
                ) : (
                    <div className="table-scroll">
                        <table>
                            <thead>
                            <tr>
                                <th>Champion</th>
                                <th>Rolle</th>
                                <th>Total</th>
                                <th>Priority</th>
                                <th>Role</th>
                                <th>Synergy</th>
                                <th>Matchup</th>
                                <th>Picks</th>
                                <th>Winrate</th>
                                <th>Sample</th>
                                <th>{t("dh_tableReasons")}</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topRecommendations.map((entry) => (
                                <tr key={`${entry.championName}-${entry.role}`}>
                                    <td>{entry.championName}</td>
                                    <td>{ROLE_LABELS[entry.role]}</td>
                                    <td>{formatScore(entry.totalScore)}</td>
                                    <td>{formatScore(entry.draftPriorityScore)}</td>
                                    <td>{formatScore(entry.roleStatsScore)}</td>
                                    <td>{formatScore(entry.synergyScore)}</td>
                                    <td>{formatScore(entry.matchupScore)}</td>
                                    <td>{entry.games}</td>
                                    <td>{formatPercent(entry.winRate)}</td>
                                    <td className="muted">{entry.sampleSizeLabel}</td>
                                    <td>{entry.reasons.map((r) => t(r as TranslationKey)).join(", ")}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    )
}