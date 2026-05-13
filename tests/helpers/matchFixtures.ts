import type { Match } from "../../src/domain/types"

export function makeMatch(
    id: string,
    picks: Match["picks"],
    bans: Match["bans"] = [],
    patch = "14.1",
): Match {
    const blueWon = picks.find((p) => p.side === "blue")?.won ?? false
    return {
        matchId: id,
        date: "2024-01-01",
        tournament: "Test",
        patch,
        region: "LEC",
        blueTeam: "Blue",
        redTeam: "Red",
        winningTeam: blueWon ? "Blue" : "Red",
        picks,
        bans,
    }
}
