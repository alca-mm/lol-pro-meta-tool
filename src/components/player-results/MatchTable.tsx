import { useState } from "react"
import {
    filterMatches,
    formatGameDuration,
    type RankedMatch,
    type MatchParticipant,
    type PlayerAccount,
} from "../../teams/riotService"
import { useTranslation } from "../../i18n/LanguageContext"
import { pluralMessage } from "../team/teamUiHelpers"
import {
    formatKdaTriple,
    formatMatchDate,
    formatWholeNumber,
    PLAYER_RESULTS_MATCH_COUNT_KEYS,
} from "./playerResultsFormat"

/**
 * Queue names stay hardcoded: "SoloQ" and "FlexQ" are the League client's own
 * labels and read identically in German and English. Translating them would
 * invent terms no player uses.
 */
const QUEUE_LABELS: Record<number, string> = { 420: "SoloQ", 440: "FlexQ" }

interface Props {
    matches: RankedMatch[]
    participants: MatchParticipant[]
    accounts: PlayerAccount[]
}

export function MatchTable({ matches, participants, accounts }: Props) {
    const { t, lang } = useTranslation()
    const [queueFilter, setQueueFilter] = useState<number | "">("")
    const [resultFilter, setResultFilter] = useState<"" | "win" | "loss">("")
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

    const filtered = filterMatches(matches, {
        queueId: queueFilter !== "" ? queueFilter : undefined,
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
                    <option value="">{t("playerResults_allQueues")}</option>
                    <option value={420}>SoloQ</option>
                    <option value={440}>FlexQ</option>
                </select>

                <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as "" | "win" | "loss")}>
                    <option value="">{t("playerResults_allResults")}</option>
                    <option value="win">{t("playerResults_win")}</option>
                    <option value="loss">{t("playerResults_loss")}</option>
                </select>

                <span className="muted" style={{ alignSelf: "center" }}>
                    {pluralMessage(t, filtered.length, PLAYER_RESULTS_MATCH_COUNT_KEYS)}
                </span>
            </div>

            {filtered.length === 0 ? (
                <p className="empty-state">{t("playerResults_noMatchesFound")}</p>
            ) : (
                <div className="table-card">
                <table className="stats-table" style={{ fontSize: "0.8rem" }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Queue</th>
                            <th style={thStyle}>{t("playerResults_player")}</th>
                            <th style={thStyle}>Champion</th>
                            <th style={thStyle}>{t("playerResults_result")}</th>
                            <th className="numeric" style={thStyle}>KDA</th>
                            <th className="numeric" style={thStyle}>CS</th>
                            <th className="numeric" style={thStyle}>Dmg</th>
                            <th className="numeric" style={thStyle}>Gold</th>
                            <th className="numeric" style={thStyle}>Vision</th>
                            <th style={thStyle}>{t("playerResults_duration")}</th>
                            <th style={thStyle}>{t("playerResults_date")}</th>
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
                                            {m.win ? t("playerResults_win") : t("playerResults_loss")}
                                        </td>
                                        <td className="numeric" style={tdStyle}>{formatKdaTriple(m.kills, m.deaths, m.assists)}</td>
                                        <td className="numeric" style={tdStyle}>{m.cs}</td>
                                        <td className="numeric" style={tdStyle}>{formatWholeNumber(m.damage_to_champs, lang)}</td>
                                        <td className="numeric" style={tdStyle}>{formatWholeNumber(m.gold_earned, lang)}</td>
                                        <td className="numeric" style={tdStyle}>{m.vision_score}</td>
                                        <td style={tdStyle}>{formatGameDuration(m.game_duration)}</td>
                                        <td style={{ ...tdStyle, color: "var(--text-dim)" }}>{formatMatchDate(m.game_start, lang)}</td>
                                        <td style={tdStyle}>
                                            {teammates.length > 0 && (
                                                /* The glyph stays on screen and stops being the accessible
                                                   name: `aria-label` wins step 2C of the accname algorithm,
                                                   name-from-content only step 2F, so "black up-pointing
                                                   triangle" is no longer what gets announced.
                                                   The name follows the state, which is a JUDGEMENT CALL and
                                                   not the only defensible one. A stable name plus
                                                   `aria-expanded` is the canonical disclosure pattern and
                                                   suits speech-input users better, since they otherwise have
                                                   to say a different phrase depending on a state they cannot
                                                   see. It was chosen because "Mitspieler" alone names a noun
                                                   and no action; "Mitspieler ein-/ausklappen" would satisfy
                                                   both and is the obvious thing to try next.
                                                   NO `aria-controls`: what it would point at is
                                                   `teammates.map(...)` below, several sibling <tr>s with no
                                                   wrapper element to hang an id on. The rows are absent from
                                                   the DOM while collapsed, which is NOT itself the problem -
                                                   a dangling reference under `aria-expanded="false"` is
                                                   explicitly tolerated, axe-core carves out that exact case.
                                                   It is omitted because only JAWS meaningfully consumes
                                                   `aria-controls`, so the cost of a real wrapper outweighs
                                                   it. `aria-expanded` is the well-supported half and carries
                                                   the state on its own. If a <tbody> per match ever lands
                                                   (it would also fix the fragment key warning below), add
                                                   `aria-controls` then. */
                                                <button
                                                    type="button"
                                                    className="secondary-button"
                                                    style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}
                                                    aria-expanded={isExpanded}
                                                    aria-label={
                                                        isExpanded
                                                            ? t("playerResults_hideTeammates")
                                                            : t("playerResults_showTeammates")
                                                    }
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
                                                <span className="muted" style={{ paddingLeft: "1rem" }}>↳ {t("playerResults_teammate")}</span>
                                            </td>
                                            <td style={tdStyle}>{tp.champion_name}</td>
                                            <td style={{ ...tdStyle, color: tp.win ? "var(--green)" : "var(--red)" }}>
                                                {tp.win ? t("playerResults_win") : t("playerResults_lossShort")}
                                            </td>
                                            <td className="numeric" style={tdStyle}>{formatKdaTriple(tp.kills, tp.deaths, tp.assists)}</td>
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
