import type { Match } from "../domain/types"
import type { PickSlot } from "./types"

export type SimilarDraftResult = {
    match: Match
    score: number
    matchedBluePicks: string[]
    matchedRedPicks: string[]
    matchedBans: string[]
}

function normalize(name: string): string {
    return name.trim().toLowerCase()
}

function intersection(input: string[], pool: string[]): string[] {
    const poolSet = new Set(pool)
    return input.filter((x) => poolSet.has(x))
}

export function findSimilarDrafts(input: {
    matches: Match[]
    bluePicks: PickSlot[]
    redPicks: PickSlot[]
    blueBans: string[]
    redBans: string[]
    limit?: number
}): SimilarDraftResult[] {
    const { matches, bluePicks, redPicks, blueBans, redBans, limit = 5 } = input

    const inputBlue = bluePicks.map((s) => normalize(s.championName)).filter(Boolean)
    const inputRed = redPicks.map((s) => normalize(s.championName)).filter(Boolean)
    const inputBans = [...blueBans, ...redBans].map(normalize).filter(Boolean)

    const totalPicks = inputBlue.length + inputRed.length
    if (totalPicks === 0) return []

    const denominator = totalPicks + inputBans.length * 0.5

    const seen = new Set<string>()
    const results: SimilarDraftResult[] = []

    for (const match of matches) {
        if (seen.has(match.matchId)) continue
        seen.add(match.matchId)

        const matchBluePicks = match.picks
            .filter((p) => p.side === "blue")
            .map((p) => normalize(p.championName))

        const matchRedPicks = match.picks
            .filter((p) => p.side === "red")
            .map((p) => normalize(p.championName))

        const matchBans = match.bans.map((b) => normalize(b.championName))

        const matchedBluePicks = intersection(inputBlue, matchBluePicks)
        const matchedRedPicks = intersection(inputRed, matchRedPicks)
        const matchedBans = intersection(inputBans, matchBans)

        const score =
            (matchedBluePicks.length + matchedRedPicks.length + matchedBans.length * 0.5) /
            denominator

        if (score > 0) {
            results.push({ match, score, matchedBluePicks, matchedRedPicks, matchedBans })
        }
    }

    return results
        .sort((a, b) => b.score - a.score || a.match.matchId.localeCompare(b.match.matchId))
        .slice(0, limit)
}
