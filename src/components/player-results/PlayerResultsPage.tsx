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
            <p className="muted" style={{ padding: "0.5rem 0" }}>
                Wähle ein Team aus, um Player Results zu sehen.
            </p>
        )
    }

    return (
        <div style={{ padding: "0.5rem 0" }}>
            <RiotAccountPanel onAfterSync={() => void reload()} />

            {loading && <p className="muted" style={{ marginTop: "1rem" }}>Lädt…</p>}

            {!loading && matches.length === 0 && (
                <p className="muted" style={{ marginTop: "1rem" }}>
                    Noch keine Matches gespeichert — klicke "Matches syncen" oben.
                </p>
            )}

            {!loading && matches.length > 0 && (
                <>
                    <div style={{ marginTop: "1.5rem" }}>
                        <p
                            className="muted"
                            style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}
                        >
                            Champion-Statistiken
                        </p>
                        <ChampionResultsTable matches={matches} accounts={accounts} />
                    </div>

                    <div style={{ marginTop: "1.5rem" }}>
                        <p
                            className="muted"
                            style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}
                        >
                            Match-Verlauf
                        </p>
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
