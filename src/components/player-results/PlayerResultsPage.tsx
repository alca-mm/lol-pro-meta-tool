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
import { ChampionResultsTable } from "./ChampionResultsTable"
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
            <div className="empty-state" style={{ padding: "0.5rem 0" }}>
                <p>Kein Team ausgewählt.</p>
                <p className="empty-hint">Wähle ein Team im Team Dashboard aus, um Player Results zu sehen.</p>
            </div>
        )
    }

    return (
        <div style={{ padding: "0.5rem 0" }}>
            <RiotAccountPanel onAfterSync={() => void reload()} />

            {loading && <p className="inline-loading" style={{ marginTop: "1rem" }}>Lädt…</p>}

            {!loading && matches.length === 0 && (
                <div className="empty-state" style={{ marginTop: "1rem" }}>
                    <p>Noch keine Matches gespeichert.</p>
                    <p className="empty-hint">Klicke oben auf "Matches syncen" um Daten zu laden.</p>
                </div>
            )}

            {!loading && matches.length > 0 && (
                <>
                    <div style={{ marginTop: "1.5rem" }}>
                        <p className="section-label">Champion-Statistiken</p>
                        <ChampionResultsTable matches={matches} accounts={accounts} />
                    </div>

                    <div style={{ marginTop: "1.5rem" }}>
                        <p className="section-label">Match-Verlauf</p>
                        <MatchTable
                            matches={matches}
                            participants={participants}
                            accounts={accounts}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
