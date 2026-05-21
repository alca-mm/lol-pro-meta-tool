import { useState, useEffect, useCallback, useMemo } from "react"
import { useTeam } from "../../teams/TeamContext"
import {
    getAllTeamRankedMatches,
    getTeamPlayerAccounts,
    getMatchParticipants,
    type RankedMatch,
    type MatchParticipant,
    type PlayerAccount,
} from "../../teams/riotService"
import {
    applyLastNFilter,
    applyScopeFilter,
    type LastNLimit,
    type PlayerScope,
} from "../../teams/playerResultsAnalytics"
import { RiotAccountPanel } from "../team/RiotAccountPanel"
import { ChampionResultsTable } from "./ChampionResultsTable"
import { MatchTable } from "./MatchTable"
import { RecentFormCards } from "./RecentFormCards"
import { ChampionHighlightCards } from "./ChampionHighlightCards"

const LAST_N_OPTIONS: Array<{ label: string; value: LastNLimit }> = [
    { label: "Alle",    value: "all" },
    { label: "Last 10", value: 10   },
    { label: "Last 20", value: 20   },
    { label: "Last 50", value: 50   },
]

export function PlayerResultsPage() {
    const { activeTeam } = useTeam()
    const [matches, setMatches]           = useState<RankedMatch[]>([])
    const [participants, setParticipants] = useState<MatchParticipant[]>([])
    const [accounts, setAccounts]         = useState<PlayerAccount[]>([])
    const [loading, setLoading]           = useState(false)
    const [lastN, setLastN]               = useState<LastNLimit>("all")
    const [selectedScope, setSelectedScope] = useState<PlayerScope>("team")

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

    // Reset scope when team changes
    useEffect(() => {
        setSelectedScope("team")
    }, [activeTeam])

    // DB returns newest-first; ensure stable order client-side too
    const sortedMatches = useMemo(
        () => [...matches].sort((a, b) => b.game_start.localeCompare(a.game_start)),
        [matches],
    )

    // Pipeline: scope → Last-N
    const scopedMatches = useMemo(
        () => applyScopeFilter(sortedMatches, selectedScope),
        [sortedMatches, selectedScope],
    )

    const limitedMatches = useMemo(
        () => applyLastNFilter(scopedMatches, lastN),
        [scopedMatches, lastN],
    )

    if (!activeTeam) {
        return (
            <div className="empty-state" style={{ padding: "0.5rem 0" }}>
                <p>Kein Team ausgewählt.</p>
                <p className="empty-hint">Wähle ein Team im Team Dashboard aus, um Player Results zu sehen.</p>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <RiotAccountPanel onAfterSync={() => void reload()} />

            {loading && <p className="inline-loading">Lädt…</p>}

            {!loading && sortedMatches.length === 0 && (
                <div className="empty-state">
                    <p>Noch keine Matches gespeichert.</p>
                    <p className="empty-hint">Klicke oben auf "Matches syncen" um Daten zu laden.</p>
                </div>
            )}

            {!loading && sortedMatches.length > 0 && (
                <>
                    {/* View / scope selector */}
                    <div className="filter-bar">
                        <span className="muted" style={{ fontSize: "0.8rem", alignSelf: "center" }}>Ansicht:</span>
                        <select
                            value={selectedScope}
                            onChange={(e) => { setSelectedScope(e.target.value); setLastN("all") }}
                            style={{ fontSize: "0.85rem" }}
                        >
                            <option value="team">Team Overview</option>
                            {accounts.map((a) => (
                                <option key={a.puuid} value={a.puuid}>
                                    {a.riot_game_name}#{a.riot_tag_line}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Recent Form — based on scoped matches (last 10), not affected by Last-N */}
                    <RecentFormCards matches={scopedMatches} count={10} />

                    {scopedMatches.length === 0 ? (
                        <p className="empty-state">Keine Matches für diesen Spieler.</p>
                    ) : (
                        <>
                            {/* Last-N filter */}
                            <div className="filter-bar">
                                {LAST_N_OPTIONS.map((opt) => (
                                    <button
                                        key={String(opt.value)}
                                        type="button"
                                        className={`role-tab${lastN === opt.value ? " role-tab-active" : ""}`}
                                        onClick={() => setLastN(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                <span className="muted" style={{ fontSize: "0.8rem", alignSelf: "center" }}>
                                    {limitedMatches.length} Match{limitedMatches.length !== 1 ? "es" : ""}
                                </span>
                            </div>

                            {/* Best / Needs Review champion highlights */}
                            <ChampionHighlightCards matches={limitedMatches} />

                            {/* Champion stats table */}
                            <div>
                                <p className="section-label">Champion-Statistiken</p>
                                <ChampionResultsTable matches={limitedMatches} />
                            </div>

                            {/* Match history */}
                            <div>
                                <p className="section-label">Match-Verlauf</p>
                                <MatchTable
                                    matches={limitedMatches}
                                    participants={participants}
                                    accounts={accounts}
                                />
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
