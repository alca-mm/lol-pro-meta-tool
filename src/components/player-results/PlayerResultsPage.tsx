import { useState, useEffect, useCallback } from "react"
import { useTeam } from "../../teams/TeamContext"
import {
    getAllTeamRankedMatches,
    getTeamPlayerAccounts,
    getMatchParticipants,
    type RankedMatch,
    type MatchParticipant,
    type PlayerAccount,
} from "../../teams/riotService"
import { RiotAccountPanel } from "../team/RiotAccountPanel"
import { MatchTable } from "./MatchTable"

export function PlayerResultsPage() {
    const { activeTeam } = useTeam()
    const [matches, setMatches] = useState<RankedMatch[]>([])
    const [participants, setParticipants] = useState<MatchParticipant[]>([])
    const [accounts, setAccounts] = useState<PlayerAccount[]>([])
    const [loading, setLoading] = useState(false)

    const reload = useCallback(async () => {
        if (!activeTeam) return
        setLoading(true)
        const [m, a] = await Promise.all([
            getAllTeamRankedMatches(activeTeam.id),
            getTeamPlayerAccounts(activeTeam.id),
        ])
        setMatches(m)
        setAccounts(a)

        if (m.length > 0) {
            const matchIds = [...new Set(m.map((x) => x.match_id))]
            const p = await getMatchParticipants(activeTeam.id, matchIds)
            setParticipants(p)
        } else {
            setParticipants([])
        }
        setLoading(false)
    }, [activeTeam])

    useEffect(() => {
        void reload()
    }, [reload])

    if (!activeTeam) {
        return (
            <p className="muted" style={{ padding: "0.5rem 0" }}>
                Wähle ein Team aus, um Player Results zu sehen.
            </p>
        )
    }

    return (
        <div style={{ padding: "0.5rem 0" }}>
            <RiotAccountPanel onAfterSync={() => void reload()} />

            <div style={{ marginTop: "1rem" }}>
                {loading ? (
                    <p className="muted">Lädt…</p>
                ) : matches.length === 0 ? (
                    <p className="muted">
                        Noch keine Matches gespeichert — klicke "Matches syncen" oben.
                    </p>
                ) : (
                    <MatchTable
                        matches={matches}
                        participants={participants}
                        accounts={accounts}
                    />
                )}
            </div>
        </div>
    )
}
