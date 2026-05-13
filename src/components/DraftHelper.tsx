import { useMemo, useState } from "react"
import type { Match, Role } from "../domain/types"
import {
    calculateDraftRecommendations,
    sampleConfidence,
    type DraftRecommendation,
    type DraftState,
} from "../analysis/draftHelper"
import { ALL_CHAMPIONS } from "../analysis/championCatalog"
import { SeriesPanel } from "./draft/SeriesPanel"
import { DraftFlowPanel } from "./draft/DraftFlowPanel"
import { RecommendationSideToggle } from "./draft/RecommendationSideToggle"
import { DraftBoard } from "./draft/DraftBoard"
import { PatchWeightPanel } from "./draft/PatchWeightPanel"
import { ScoreWeightPanel } from "./draft/ScoreWeightPanel"
import { iconFor, flexRoleLabel } from "./draft/utils"
import { useTranslation } from "../i18n/LanguageContext"

import type { TranslationKey } from "../i18n/types"
import type {
    DraftVisualSide,
    PickSlot,
    ActiveDraftSlot,
    DraftSnapshot,
    CompletedGameDraft,
    WeightKey,
    WeightConfig,
    DraftAiPresetKey,
    PatchWeightPresetKey,
    DraftEdgeSummary,
    FlexChampionInfo,
    BanRecommendation,
    TeamCompWarning,
    TeamCompMetric,
    TeamCompReport,
} from "../draft/types"
import {
    ROLES,
    ROLE_LABELS,
    DRAFT_FLOW,
    MAX_SERIES_GAMES,
    DEFAULT_PATCH_WEIGHTS,
    PATCH_WEIGHT_PRESETS,
    DEFAULT_WEIGHTS,
    WEIGHT_PRESETS,
    FRONTLINE_CHAMPIONS,
    ENGAGE_CHAMPIONS,
    AP_DAMAGE_CHAMPIONS,
    AD_DAMAGE_CHAMPIONS,
    POKE_CHAMPIONS,
    PICK_CHAMPIONS,
    DIVE_CHAMPIONS,
    PEEL_CHAMPIONS,
    SCALING_CHAMPIONS,
    SPLITPUSH_CHAMPIONS,
} from "../draft/constants"
import {
    weightedPatchWindow,
    formatPatchWindowSummary,
} from "../draft/patchWindow"
import {
    formatPercent,
    formatScore,
    normalizeChampionName,
    clamp,
    oppositeSide,
    sideLabel,
    filledPickCount,
    slotsToDraftPicks,
    nextEmptyPickIndex,
    createEmptyPickSlots,
    clonePickSlots,
    draftHasContent,
} from "../draft/helpers"

interface DraftHelperProps {
    matches: Match[]
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

export function buildFlexChampionCatalog(matches: Match[]): Map<string, FlexChampionInfo> {
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

    return (weightedSum / totalWeight) * sampleConfidence(entry.games)
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

export function calculateDraftEdgeSummary(input: {
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

export function generateTeamCompReport(slots: PickSlot[], t: (key: TranslationKey) => string): TeamCompReport {
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

export function generateBanRecommendations(input: {
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
    const { t } = useTranslation()

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
                        {entry.games < 50 ? ` · ${entry.sampleSizeLabel}` : ""}
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

            <SeriesPanel
                seriesGameNumber={seriesGameNumber}
                seriesHistory={seriesHistory}
                fearlessEnabled={fearlessEnabled}
                fearlessChampionSet={fearlessChampionSet}
                currentGameHasContent={currentGameHasContent}
                copyStatus={copyStatus}
                onToggleFearless={() => setFearlessEnabled((current) => !current)}
                onSaveGame={saveCurrentGameToSeries}
                onNextGame={goToNextSeriesGame}
                onCopyDraft={copyDraftToClipboard}
                onResetSeries={resetSeries}
            />

            <DraftFlowPanel
                draftFlowEnabled={draftFlowEnabled}
                historyLength={history.length}
                flowSlotLabel={flowLabelForSlot(activeDraftSlot, flowStepIndex)}
                onActivate={activateDraftFlow}
                onDeactivate={deactivateDraftFlow}
                onStepBack={restorePreviousStep}
            />

            <RecommendationSideToggle
                recommendationSide={recommendationSide}
                onChange={setRecommendationSide}
            />

            <PatchWeightPanel
                patchWeights={patchWeights}
                summaries={recentPatchData.summaries}
                onUpdateWeight={updatePatchWeight}
                onApplyPreset={applyPatchWeightPreset}
                onReset={() => setPatchWeights([...DEFAULT_PATCH_WEIGHTS])}
            />

            <ScoreWeightPanel
                weights={weights}
                onUpdateWeight={updateWeight}
                onApplyPreset={applyWeightPreset}
                onReset={() => setWeights(DEFAULT_WEIGHTS)}
            />

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

            <DraftBoard
                bluePickSlots={bluePickSlots}
                blueBans={blueBans}
                redPickSlots={redPickSlots}
                redBans={redBans}
                activeDraftSlot={activeDraftSlot}
                flexChampionCatalog={flexChampionCatalog}
                championPool={championPool}
                selectedChampionSet={selectedChampionSet}
                bannedChampionSet={bannedChampionSet}
                championSearch={championSearch}
                poolRoleFilter={poolRoleFilter}
                onActivateBanSlot={(visualSide, index) => {
                    setActiveDraftSlot({ type: "ban", visualSide, index })
                    setRecommendationSide(visualSide)
                }}
                onActivatePickSlot={(visualSide, index) => {
                    setActiveDraftSlot({ type: "pick", visualSide, index })
                    setRecommendationSide(visualSide)
                }}
                onClearBan={clearBan}
                onClearPick={clearPick}
                onUpdatePickRole={updatePickRole}
                onSetPoolRoleFilter={setPoolRoleFilter}
                onChampionSearchChange={setChampionSearch}
                onSelectChampion={handleChampionGridSelect}
            />

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