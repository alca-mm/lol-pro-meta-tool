import type { Match, Role } from "../domain/types"
import { calculateChampionStats } from "./championStats"
import { calculateRoleStats } from "./roleStats"
import { calculateSynergyStats } from "./synergyStats"
import { calculateRoleMatchups } from "./roleMatchups"
import { sampleSizeLabel } from "./sampleSize"

export type DraftSide = "blue" | "red" | "any"

export type DraftState = {
    ownPicks: Partial<Record<Role, string>>
    enemyPicks: Partial<Record<Role, string>>
    bans: string[]
    excludeBans: boolean
    minGames: number
    sidePreference: DraftSide
}

export type DraftRecommendation = {
    championName: string
    role: Role
    totalScore: number
    draftPriorityScore: number
    roleStatsScore: number
    synergyScore: number
    matchupScore: number
    games: number
    winRate: number | null
    sampleSizeLabel: string
    reasons: string[]
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

function normalizeChampionName(name: string): string {
    return name.trim().toLowerCase()
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function average(values: number[], fallback = 0.5): number {
    if (values.length === 0) return fallback
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getPickedChampionNames(draft: DraftState): Set<string> {
    const names = [
        ...Object.values(draft.ownPicks),
        ...Object.values(draft.enemyPicks),
    ]
        .filter(Boolean)
        .map((name) => normalizeChampionName(name as string))

    return new Set(names)
}

function getBannedChampionNames(draft: DraftState): Set<string> {
    return new Set(
        draft.bans
            .filter(Boolean)
            .map((name) => normalizeChampionName(name)),
    )
}

function draftPriorityScore(stats: {
    presence: number
    banRate: number
    pickRate: number
    winRate: number | null
    picks: number
}): number {
    const winRateComponent =
        stats.picks >= 5 && stats.winRate !== null ? stats.winRate : 0.5

    return clamp01(
        stats.presence * 0.5 +
        stats.banRate * 0.2 +
        stats.pickRate * 0.2 +
        winRateComponent * 0.1,
    )
}

// TARGET_SAMPLE = 25: at this many picks sampleConfidence reaches 1.0 (no dampening).
// Below this threshold, extreme win rates are pulled toward neutral 0.5 proportionally.
const TARGET_SAMPLE = 25

// Exported so calculateWeightedScore in DraftHelper.tsx can apply the same penalty.
export function sampleConfidence(games: number, targetGames = 50): number {
    if (games <= 0) return 0
    return Math.min(1, Math.log(1 + games) / Math.log(1 + targetGames))
}

function roleStatsScore(stats: {
    picks: number
    winRate: number | null
}): number {
    if (stats.picks <= 0) return 0

    const sampleConfidence = Math.min(1, Math.log(1 + stats.picks) / Math.log(1 + TARGET_SAMPLE))
    const winRate = stats.winRate ?? 0.5
    // Dampen extreme win rates toward neutral when sample is small.
    // Without this, a 7/7 100% WR champion outscores 3000-game picks with 52% WR.
    const dampedWinRate = 0.5 + (winRate - 0.5) * sampleConfidence

    return clamp01(0.5 * sampleConfidence + dampedWinRate * 0.5)
}

function findSynergyScore(
    championName: string,
    ownChampions: string[],
    synergyStats: ReturnType<typeof calculateSynergyStats>,
): number {
    const scores = ownChampions
        .filter(Boolean)
        .map((ownChampion) => {
            const found = synergyStats.find((entry) => {
                const a = normalizeChampionName(entry.championA)
                const b = normalizeChampionName(entry.championB)
                const c = normalizeChampionName(championName)
                const o = normalizeChampionName(ownChampion)

                return (a === c && b === o) || (a === o && b === c)
            })

            if (!found) return null

            return clamp01(found.winRateTogether ?? 0.5)
        })
        .filter((value): value is number => value !== null)

    return average(scores, 0.5)
}

function findMatchupScore(
    championName: string,
    role: Role,
    enemyPicks: Partial<Record<Role, string>>,
    roleMatchups: ReturnType<typeof calculateRoleMatchups>,
): number {
    const enemyChampionSameRole = enemyPicks[role]

    if (!enemyChampionSameRole) {
        return 0.5
    }

    const candidate = normalizeChampionName(championName)
    const enemy = normalizeChampionName(enemyChampionSameRole)

    const found = roleMatchups.find((entry) => {
        const a = normalizeChampionName(entry.championA)
        const b = normalizeChampionName(entry.championB)

        return (
            entry.role === role &&
            ((a === candidate && b === enemy) || (a === enemy && b === candidate))
        )
    })

    if (!found) {
        return 0.5
    }

    const a = normalizeChampionName(found.championA)
    const winRateForCandidate =
        a === candidate ? found.winRateForA : 1 - found.winRateForA

    return clamp01(winRateForCandidate)
}

function buildReasons(input: {
    draftPriorityScore: number
    roleStatsScore: number
    synergyScore: number
    matchupScore: number
    games: number
}): string[] {
    const reasons: string[] = []

    if (input.draftPriorityScore >= 0.65) {
        reasons.push("reason_highMetaPriority")
    }

    if (input.roleStatsScore >= 0.65) {
        reasons.push("reason_strongRoleData")
    }

    if (input.synergyScore >= 0.6) {
        reasons.push("reason_goodSynergy")
    }

    if (input.matchupScore >= 0.6) {
        reasons.push("reason_goodMatchup")
    }

    if (input.games < 5) {
        reasons.push("reason_verySmallSample")
    } else if (input.games < 10) {
        reasons.push("reason_smallSample")
    }

    if (reasons.length === 0) {
        reasons.push("reason_solidCandidate")
    }

    return reasons
}

export function getAvailableChampions(matches: Match[]): string[] {
    const championNames = new Set<string>()

    for (const match of matches) {
        for (const pick of match.picks) {
            if (pick.championName) {
                championNames.add(pick.championName)
            }
        }

        for (const ban of match.bans) {
            if (ban.championName) {
                championNames.add(ban.championName)
            }
        }
    }

    return [...championNames].sort((a, b) => a.localeCompare(b))
}

export function createEmptyDraftState(): DraftState {
    return {
        ownPicks: {},
        enemyPicks: {},
        bans: [],
        excludeBans: true,
        minGames: 5,
        sidePreference: "any",
    }
}

export function calculateDraftRecommendations(
    matches: Match[],
    draft: DraftState,
): DraftRecommendation[] {
    const championStats = calculateChampionStats(matches)
    const roleStats = calculateRoleStats(matches)
    const synergyStats = calculateSynergyStats(matches)
    const roleMatchups = calculateRoleMatchups(matches)

    const picked = getPickedChampionNames(draft)
    const banned = getBannedChampionNames(draft)
    const ownChampions = Object.values(draft.ownPicks).filter(Boolean) as string[]

    const recommendations: DraftRecommendation[] = []

    for (const roleStat of roleStats) {
        const championName = roleStat.championName
        const role = roleStat.role

        if (!ROLES.includes(role)) {
            continue
        }

        if (draft.ownPicks[role]) {
            continue
        }

        const normalized = normalizeChampionName(championName)

        if (picked.has(normalized)) {
            continue
        }

        if (draft.excludeBans && banned.has(normalized)) {
            continue
        }

        if (roleStat.picks < draft.minGames) {
            continue
        }

        const baseStats = championStats.find(
            (entry) => normalizeChampionName(entry.championName) === normalized,
        )

        if (!baseStats) {
            continue
        }

        const priority = draftPriorityScore({
            presence: baseStats.presence,
            banRate: baseStats.banRate,
            pickRate: baseStats.pickRate,
            winRate: baseStats.winRate,
            picks: baseStats.picks,
        })

        const roleScore = roleStatsScore({
            picks: roleStat.picks,
            winRate: roleStat.winRate,
        })

        const synergyScore = findSynergyScore(championName, ownChampions, synergyStats)

        const matchupScore = findMatchupScore(
            championName,
            role,
            draft.enemyPicks,
            roleMatchups,
        )

        const rawScore = clamp01(
            priority * 0.35 +
            roleScore * 0.25 +
            synergyScore * 0.2 +
            matchupScore * 0.2,
        )
        const totalScore = rawScore * sampleConfidence(roleStat.picks)

        recommendations.push({
            championName,
            role,
            totalScore,
            draftPriorityScore: priority,
            roleStatsScore: roleScore,
            synergyScore,
            matchupScore,
            games: roleStat.picks,
            winRate: roleStat.winRate,
            sampleSizeLabel: sampleSizeLabel(roleStat.picks),
            reasons: buildReasons({
                draftPriorityScore: priority,
                roleStatsScore: roleScore,
                synergyScore,
                matchupScore,
                games: roleStat.picks,
            }),
        })
    }

    return recommendations.sort((a, b) => b.totalScore - a.totalScore)
}