import type { Match } from "../domain/types"
import type { PatchWindowData, PatchWindowSummary } from "./types"
import { PATCH_WEIGHT_MAX_PATCHES } from "./constants"

export function parsePatchParts(patch: string): number[] {
    return patch
        .split(".")
        .map((part) => Number(part.replace(/[^\d]/g, "")))
        .map((part) => (Number.isFinite(part) ? part : 0))
}

export function comparePatch(a: string, b: string): number {
    const aParts = parsePatchParts(a)
    const bParts = parsePatchParts(b)
    const maxLength = Math.max(aParts.length, bParts.length)

    for (let index = 0; index < maxLength; index += 1) {
        const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
        if (diff !== 0) return diff
    }

    return a.localeCompare(b)
}

export function weightedPatchWindow(matches: Match[], patchWeights: number[]): PatchWindowData {
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

export function formatPatchWindowSummary(patchData: PatchWindowData): string {
    if (patchData.summaries.length === 0) return "keine Patchdaten"

    return patchData.summaries
        .map((summary) => `${summary.patch} (${summary.weight}%, ${summary.rawMatches} Games)`)
        .join(" · ")
}
