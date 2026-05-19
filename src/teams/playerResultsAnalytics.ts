import type { RankedMatch } from "./riotService"

export interface PlayerChampionResultStats {
    championName: string
    games: number
    wins: number
    losses: number
    winRate: number
    kills: number
    deaths: number
    assists: number
    avgKills: number
    avgDeaths: number
    avgAssists: number
    avgKda: number
    csPerMinute: number
    damagePerMinute: number
    goldPerMinute: number
    soloqGames: number
    flexqGames: number
    lastPlayedAt: string | null
}

interface Accumulator {
    games: number
    wins: number
    totalKills: number
    totalDeaths: number
    totalAssists: number
    totalCs: number
    totalDamage: number
    totalGold: number
    totalDurationSeconds: number
    soloqGames: number
    flexqGames: number
    lastPlayedAt: string | null
}

export function computeChampionStats(matches: RankedMatch[]): PlayerChampionResultStats[] {
    const map = new Map<string, Accumulator>()

    for (const m of matches) {
        if (!map.has(m.champion_name)) {
            map.set(m.champion_name, {
                games: 0, wins: 0,
                totalKills: 0, totalDeaths: 0, totalAssists: 0,
                totalCs: 0, totalDamage: 0, totalGold: 0,
                totalDurationSeconds: 0,
                soloqGames: 0, flexqGames: 0,
                lastPlayedAt: null,
            })
        }
        const e = map.get(m.champion_name)!
        e.games++
        if (m.win) e.wins++
        e.totalKills   += m.kills
        e.totalDeaths  += m.deaths
        e.totalAssists += m.assists
        e.totalCs      += m.cs
        e.totalDamage  += m.damage_to_champs
        e.totalGold    += m.gold_earned
        e.totalDurationSeconds += m.game_duration
        if (m.queue_id === 420) e.soloqGames++
        if (m.queue_id === 440) e.flexqGames++
        if (!e.lastPlayedAt || m.game_start > e.lastPlayedAt) e.lastPlayedAt = m.game_start
    }

    return Array.from(map.entries())
        .map(([championName, e]) => {
            const { games, wins } = e
            const totalMinutes = e.totalDurationSeconds / 60 || 1
            return {
                championName,
                games,
                wins,
                losses:           games - wins,
                winRate:          games > 0 ? wins / games : 0,
                kills:            e.totalKills,
                deaths:           e.totalDeaths,
                assists:          e.totalAssists,
                avgKills:         games > 0 ? e.totalKills   / games : 0,
                avgDeaths:        games > 0 ? e.totalDeaths  / games : 0,
                avgAssists:       games > 0 ? e.totalAssists / games : 0,
                avgKda:           (e.totalKills + e.totalAssists) / Math.max(e.totalDeaths, 1),
                csPerMinute:      e.totalCs     / totalMinutes,
                damagePerMinute:  e.totalDamage / totalMinutes,
                goldPerMinute:    e.totalGold   / totalMinutes,
                soloqGames:       e.soloqGames,
                flexqGames:       e.flexqGames,
                lastPlayedAt:     e.lastPlayedAt,
            }
        })
        .sort((a, b) => b.games - a.games || a.championName.localeCompare(b.championName))
}
