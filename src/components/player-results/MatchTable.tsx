import { useState } from "react"
import {
    filterMatches,
    formatGameDuration,
    type RankedMatch,
    type MatchParticipant,
    type PlayerAccount,
} from "../../teams/riotService"

const QUEUE_LABELS: Record<number, string> = { 420: "SoloQ", 440: "FlexQ" }

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE", {
        day: "2-digit", month: "2-digit", year: "2-digit",
    })
}

function kda(k: number, d: number, a: number): string {
    return `${k}/${d}/${a}`
}

interface Props {
    matches: RankedMatch[]
    participants: MatchParticipant[]
    accounts: PlayerAccount[]
}

export function MatchTable({ matches, participants, accounts }: Props) {
    const [queueFilter, setQueueFilter] = useState<number | "">("")
    const [puuidFilter, setPuuidFilter] = useState<string>("")
    const [resultFilter, setResultFilter] = useState<"" | "win" | "loss">("")
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

    const filtered = filterMatches(matches, {
        queueId: queueFilter !== "" ? queueFilter : undefined,
        puuid:   puuidFilter || undefined,
        win:     resultFilter === "win" ? true : resultFilter === "loss" ? false : undefined,
    })

    const participantsByMatch = new Map<string, MatchParticipant[]>()
    for (const p of participants) {
        const list = participantsByMatch.get(p.match_id) ?? []
        list.push(p)
        participantsByMatch.set(p.match_id, list)
    }

    const accountByPuuid = new Map(accounts.map((a) => [a.puuid, a]))

    return (
        <div>
            {/* Filters */}
            <div className="filter-bar" style={{ fontSize: "0.85rem" }}>
                <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">Alle Queues</option>
                    <option value={420}>SoloQ</option>
                    <option value={440}>FlexQ</option>
                </select>

                <select value={puuidFilter} onChange={(e) => setPuuidFilter(e.target.value)}>
                    <option value="">Alle Spieler</option>
                    {accounts.map((a) => (
                        <option key={a.puuid} value={a.puuid}>
                            {a.riot_game_name}#{a.riot_tag_line}
                        </option>
                    ))}
                </select>

                <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as "" | "win" | "loss")}>
                    <option value="">Alle Ergebnisse</option>
                    <option value="win">Sieg</option>
                    <option value="loss">Niederlage</option>
                </select>

                <span className="muted" style={{ alignSelf: "center" }}>
                    {filtered.length} Match{filtered.length !== 1 ? "es" : ""}
                </span>
            </div>

            {filtered.length === 0 ? (
                <p className="empty-state">Keine Matches gefunden.</p>
            ) : (
                <div className="table-card">
                <table className="stats-table" style={{ fontSize: "0.8rem" }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Queue</th>
                            <th style={thStyle}>Spieler</th>
                            <th style={thStyle}>Champion</th>
                            <th style={thStyle}>Ergebnis</th>
                            <th className="numeric" style={thStyle}>KDA</th>
                            <th className="numeric" style={thStyle}>CS</th>
                            <th className="numeric" style={thStyle}>Schaden</th>
                            <th className="numeric" style={thStyle}>Gold</th>
                            <th className="numeric" style={thStyle}>Vision</th>
                            <th style={thStyle}>Dauer</th>
                            <th style={thStyle}>Datum</th>
                            <th style={thStyle}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((m) => {
                            const acc = accountByPuuid.get(m.puuid)
                            const playerLabel = acc
                                ? `${acc.riot_game_name}#${acc.riot_tag_line}`
                                : m.puuid.slice(0, 8)
                            const isExpanded = expandedMatchId === m.id
                            const teammates = participantsByMatch.get(m.match_id) ?? []

                            return (
                                <>
                                    <tr
                                        key={m.id}
                                        style={{
                                            background: m.win
                                                ? "rgba(74,222,128,0.05)"
                                                : "rgba(248,113,113,0.05)",
                                        }}
                                    >
                                        <td style={tdStyle}>{QUEUE_LABELS[m.queue_id] ?? m.queue_id}</td>
                                        <td style={tdStyle}>{playerLabel}</td>
                                        <td style={tdStyle}>{m.champion_name}</td>
                                        <td style={{ ...tdStyle, color: m.win ? "var(--green)" : "var(--red)" }}>
                                            {m.win ? "Sieg" : "Niederlage"}
                                        </td>
                                        <td className="numeric" style={tdStyle}>{kda(m.kills, m.deaths, m.assists)}</td>
                                        <td className="numeric" style={tdStyle}>{m.cs}</td>
                                        <td className="numeric" style={tdStyle}>{m.damage_to_champs.toLocaleString("de-DE")}</td>
                                        <td className="numeric" style={tdStyle}>{m.gold_earned.toLocaleString("de-DE")}</td>
                                        <td className="numeric" style={tdStyle}>{m.vision_score}</td>
                                        <td style={tdStyle}>{formatGameDuration(m.game_duration)}</td>
                                        <td style={{ ...tdStyle, color: "var(--text-dim)" }}>{formatDate(m.game_start)}</td>
                                        <td style={tdStyle}>
                                            {teammates.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="secondary-button"
                                                    style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                                                    onClick={() => setExpandedMatchId(isExpanded ? null : m.id)}
                                                >
                                                    {isExpanded ? "▲" : "▼"}
                                                </button>
                                            )}
                                        </td>
                                    </tr>

                                    {isExpanded && teammates.map((tp) => (
                                        <tr
                                            key={`${m.id}-${tp.puuid}`}
                                            style={{ background: "rgba(34,38,58,0.6)", fontSize: "0.75rem" }}
                                        >
                                            <td style={tdStyle} colSpan={2}>
                                                <span className="muted" style={{ paddingLeft: "1rem" }}>↳ Teammate</span>
                                            </td>
                                            <td style={tdStyle}>{tp.champion_name}</td>
                                            <td style={{ ...tdStyle, color: tp.win ? "var(--green)" : "var(--red)" }}>
                                                {tp.win ? "Sieg" : "Nied."}
                                            </td>
                                            <td className="numeric" style={tdStyle}>{kda(tp.kills, tp.deaths, tp.assists)}</td>
                                            <td className="numeric" style={tdStyle}>{tp.cs}</td>
                                            <td style={tdStyle} colSpan={5}></td>
                                            <td style={tdStyle}></td>
                                        </tr>
                                    ))}
                                </>
                            )
                        })}
                    </tbody>
                </table>
                </div>
            )}
        </div>
    )
}

const thStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
    verticalAlign: "top",
}
