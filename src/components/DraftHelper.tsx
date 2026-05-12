import { useMemo, useState } from "react"
import type { Match, Role } from "../domain/types"
import {
    calculateDraftRecommendations,
    type DraftState,
} from "../analysis/draftHelper"
import { ALL_CHAMPIONS } from "../analysis/championCatalog"
import { ChampionPortraitGrid } from "./ChampionPortraitGrid"
import { championIconUrl } from "../analysis/championAssets"

interface DraftHelperProps {
    matches: Match[]
}

const ROLES: Role[] = ["top", "jungle", "mid", "bot", "support"]

const ROLE_LABELS: Record<Role, string> = {
    top: "TOP",
    jungle: "JGL",
    mid: "MID",
    bot: "BOT",
    support: "SUP",
}

type DraftVisualSide = "blue" | "red"

type ActiveDraftSlot =
    | {
    type: "pick"
    visualSide: DraftVisualSide
    role: Role
}
    | {
    type: "ban"
    visualSide: DraftVisualSide
    index: number
}

function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${(value * 100).toFixed(1)} %`
}

function formatScore(value: number): string {
    return value.toFixed(3)
}

function normalizeChampionName(name: string): string {
    return name.trim().toLowerCase()
}

function parsePatchParts(patch: string): number[] {
    return patch
        .split(".")
        .map((part) => Number(part.replace(/[^\d]/g, "")))
        .map((part) => (Number.isFinite(part) ? part : 0))
}

function comparePatch(a: string, b: string): number {
    const aParts = parsePatchParts(a)
    const bParts = parsePatchParts(b)
    const maxLength = Math.max(aParts.length, bParts.length)

    for (let index = 0; index < maxLength; index += 1) {
        const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)
        if (diff !== 0) return diff
    }

    return a.localeCompare(b)
}

function latestPatchWindow(matches: Match[], patchCount: number): {
    patches: string[]
    matches: Match[]
} {
    const patches = [...new Set(matches.map((match) => match.patch).filter(Boolean))]
        .sort(comparePatch)
        .slice(-patchCount)

    const patchSet = new Set(patches)

    return {
        patches,
        matches: matches.filter((match) => patchSet.has(match.patch)),
    }
}

function iconFor(championName?: string) {
    if (!championName) return null

    return (
        <img
            src={championIconUrl(championName)}
            alt={championName}
            loading="lazy"
            onError={(event) => {
                event.currentTarget.style.visibility = "hidden"
            }}
        />
    )
}

function setSidePick(
    picks: Partial<Record<Role, string>>,
    role: Role,
    championName: string,
): Partial<Record<Role, string>> {
    return {
        ...picks,
        [role]: championName || undefined,
    }
}

function createRecommendationDraftState(input: {
    recommendationSide: DraftVisualSide
    bluePicks: Partial<Record<Role, string>>
    redPicks: Partial<Record<Role, string>>
    bans: string[]
    excludeBans: boolean
    minGames: number
}): DraftState {
    return {
        ownPicks: input.recommendationSide === "blue" ? input.bluePicks : input.redPicks,
        enemyPicks: input.recommendationSide === "blue" ? input.redPicks : input.bluePicks,
        bans: input.bans,
        excludeBans: input.excludeBans,
        minGames: input.minGames,
        sidePreference: input.recommendationSide,
    }
}

export function DraftHelper({ matches }: DraftHelperProps) {
    const [bluePicks, setBluePicks] = useState<Partial<Record<Role, string>>>({})
    const [redPicks, setRedPicks] = useState<Partial<Record<Role, string>>>({})
    const [blueBans, setBlueBans] = useState<string[]>(["", "", "", "", ""])
    const [redBans, setRedBans] = useState<string[]>(["", "", "", "", ""])
    const [excludeBans, setExcludeBans] = useState(true)
    const [minGames, setMinGames] = useState(5)
    const [recommendationSide, setRecommendationSide] = useState<DraftVisualSide>("blue")
    const [activeDraftSlot, setActiveDraftSlot] = useState<ActiveDraftSlot | null>(null)
    const [championSearch, setChampionSearch] = useState("")

    const recentPatchData = useMemo(() => latestPatchWindow(matches, 4), [matches])


    const allBans = useMemo(() => {
        return [...blueBans, ...redBans].map((entry) => entry.trim()).filter(Boolean)
    }, [blueBans, redBans])

    const recommendationDraftState = useMemo(
        () =>
            createRecommendationDraftState({
                recommendationSide,
                bluePicks,
                redPicks,
                bans: allBans,
                excludeBans,
                minGames,
            }),
        [recommendationSide, bluePicks, redPicks, allBans, excludeBans, minGames],
    )

    const recommendations = useMemo(
        () => calculateDraftRecommendations(recentPatchData.matches, recommendationDraftState),
        [recentPatchData.matches, recommendationDraftState],
    )

    const topRecommendations = recommendations.slice(0, 20)

    const activeSidePicks = recommendationSide === "blue" ? bluePicks : redPicks

    const recommendationsByRole = ROLES.map((role) => ({
        role,
        recommendations: recommendations
            .filter((entry) => entry.role === role)
            .slice(0, 5),
    }))

    const selectedChampionSet = useMemo(() => {
        return new Set(
            [
                ...Object.values(bluePicks),
                ...Object.values(redPicks),
            ]
                .filter(Boolean)
                .map((name) => normalizeChampionName(name as string)),
        )
    }, [bluePicks, redPicks])

    const bannedChampionSet = useMemo(() => {
        return new Set(allBans.map((name) => normalizeChampionName(name)))
    }, [allBans])

    function resetDraft() {
        setBluePicks({})
        setRedPicks({})
        setBlueBans(["", "", "", "", ""])
        setRedBans(["", "", "", "", ""])
        setExcludeBans(true)
        setMinGames(5)
        setRecommendationSide("blue")
        setActiveDraftSlot(null)
        setChampionSearch("")
    }

    function handleChampionGridSelect(championName: string) {
        if (!activeDraftSlot) {
            return
        }

        if (activeDraftSlot.type === "pick") {
            if (activeDraftSlot.visualSide === "blue") {
                setBluePicks((current) => setSidePick(current, activeDraftSlot.role, championName))
            } else {
                setRedPicks((current) => setSidePick(current, activeDraftSlot.role, championName))
            }

            setRecommendationSide(activeDraftSlot.visualSide)
            setActiveDraftSlot(null)
            setChampionSearch("")
            return
        }

        if (activeDraftSlot.type === "ban") {
            if (activeDraftSlot.visualSide === "blue") {
                setBlueBans((current) => {
                    const next = [...current]
                    next[activeDraftSlot.index] = championName
                    return next
                })
            } else {
                setRedBans((current) => {
                    const next = [...current]
                    next[activeDraftSlot.index] = championName
                    return next
                })
            }

            setActiveDraftSlot(null)
            setChampionSearch("")
        }
    }

    function clearPick(visualSide: DraftVisualSide, role: Role) {
        if (visualSide === "blue") {
            setBluePicks((current) => setSidePick(current, role, ""))
        } else {
            setRedPicks((current) => setSidePick(current, role, ""))
        }

        if (
            activeDraftSlot?.type === "pick" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.role === role
        ) {
            setActiveDraftSlot(null)
        }
    }

    function clearBan(visualSide: DraftVisualSide, index: number) {
        if (visualSide === "blue") {
            setBlueBans((current) => {
                const next = [...current]
                next[index] = ""
                return next
            })
        } else {
            setRedBans((current) => {
                const next = [...current]
                next[index] = ""
                return next
            })
        }

        if (
            activeDraftSlot?.type === "ban" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index
        ) {
            setActiveDraftSlot(null)
        }
    }

    function renderBanSlot(visualSide: DraftVisualSide, index: number) {
        const bans = visualSide === "blue" ? blueBans : redBans
        const championName = bans[index]
        const isActive =
            activeDraftSlot?.type === "ban" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.index === index

        return (
            <div key={`${visualSide}-ban-${index}`} className="draft-ban-slot-wrap">
                <button
                    type="button"
                    className={[
                        "draft-ban-slot",
                        visualSide,
                        isActive ? "is-active" : "",
                        championName ? "has-champion" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => setActiveDraftSlot({ type: "ban", visualSide, index })}
                    title={championName || `Ban ${index + 1}`}
                >
                    {championName ? iconFor(championName) : <span>B{index + 1}</span>}
                </button>

                {championName && (
                    <button
                        type="button"
                        className="draft-mini-clear"
                        onClick={() => clearBan(visualSide, index)}
                        aria-label={`${championName} aus Ban ${index + 1} entfernen`}
                        title="Ban entfernen"
                    >
                        ×
                    </button>
                )}
            </div>
        )
    }

    function renderPickSlot(visualSide: DraftVisualSide, role: Role) {
        const picks = visualSide === "blue" ? bluePicks : redPicks
        const championName = picks[role]
        const isActive =
            activeDraftSlot?.type === "pick" &&
            activeDraftSlot.visualSide === visualSide &&
            activeDraftSlot.role === role

        return (
            <div key={`${visualSide}-${role}`} className="draft-pick-slot-wrap">
                <button
                    type="button"
                    className={[
                        "draft-pick-slot",
                        visualSide,
                        isActive ? "is-active" : "",
                        championName ? "has-champion" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() =>
                        setActiveDraftSlot({
                            type: "pick",
                            visualSide,
                            role,
                        })
                    }
                    title={championName || ROLE_LABELS[role]}
                >
                    <span className="draft-pick-role">{ROLE_LABELS[role]}</span>

                    <span className="draft-pick-icon">
            {championName ? iconFor(championName) : null}
          </span>

                    <span className="draft-pick-name">{championName || "Pick"}</span>
                </button>

                {championName && (
                    <button
                        type="button"
                        className="draft-mini-clear"
                        onClick={() => clearPick(visualSide, role)}
                        aria-label={`${championName} aus ${ROLE_LABELS[role]} entfernen`}
                        title="Pick entfernen"
                    >
                        ×
                    </button>
                )}
            </div>
        )
    }

    return (
        <section className="draft-helper">
            <div className="section-header">
                <div>
                    <h2>Draft Helper</h2>
                    <p>
                        Empfehlungen nutzen nur die neuesten 4 Patches aus den aktuellen Filtern:{" "}
                        {recentPatchData.patches.length > 0
                            ? recentPatchData.patches.join(", ")
                            : "keine Patchdaten"}
                    </p>
                </div>

                <button type="button" className="secondary-button" onClick={resetDraft}>
                    Draft zurücksetzen
                </button>
            </div>

            <div className="draft-controls draft-controls-compact">
                <label>
                    Mindest-Picks pro Rolle
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={minGames}
                        onChange={(event) => setMinGames(Number(event.target.value) || 1)}
                    />
                </label>

                <label className="checkbox-row">
                    <input
                        type="checkbox"
                        checked={excludeBans}
                        onChange={(event) => setExcludeBans(event.target.checked)}
                    />
                    Gebannte Champions ausschließen
                </label>
            </div>

            <div className="recommendation-side-toggle" aria-label="Empfehlungsseite">
                <span>Empfehlungen für:</span>
                <button
                    type="button"
                    className={recommendationSide === "blue" ? "side-toggle-active blue" : ""}
                    onClick={() => setRecommendationSide("blue")}
                >
                    Blue Side
                </button>
                <button
                    type="button"
                    className={recommendationSide === "red" ? "side-toggle-active red" : ""}
                    onClick={() => setRecommendationSide("red")}
                >
                    Red Side
                </button>
            </div>

            <div className="draft-layout">
                <div className="draft-team-panel blue">
                    <div className="draft-team-header">
                        <span>BLUE SIDE</span>
                    </div>

                    <div className="draft-ban-row">
                        {blueBans.map((_, index) => renderBanSlot("blue", index))}
                    </div>

                    <div className="draft-pick-list">
                        {ROLES.map((role) => renderPickSlot("blue", role))}
                    </div>
                </div>

                <div className="champion-picker-panel draft-center-panel">
                    <div className="champion-picker-header">
                        <h3>Champion Pool</h3>
                        <p>
                            {activeDraftSlot
                                ? activeDraftSlot.type === "ban"
                                    ? `Wähle Ban ${activeDraftSlot.index + 1} für ${
                                        activeDraftSlot.visualSide === "blue" ? "Blue" : "Red"
                                    }`
                                    : `Wähle ${ROLE_LABELS[activeDraftSlot.role]} für ${
                                        activeDraftSlot.visualSide === "blue" ? "Blue" : "Red"
                                    }`
                                : "Slot auswählen"}
                        </p>
                    </div>

                    <ChampionPortraitGrid
                        champions={ALL_CHAMPIONS}
                        selectedChampions={selectedChampionSet}
                        bannedChampions={bannedChampionSet}
                        searchQuery={championSearch}
                        onSearchQueryChange={setChampionSearch}
                        onSelectChampion={handleChampionGridSelect}
                    />
                </div>

                <div className="draft-team-panel red">
                    <div className="draft-team-header">
                        <span>RED SIDE</span>
                    </div>

                    <div className="draft-ban-row">
                        {redBans.map((_, index) => renderBanSlot("red", index))}
                    </div>

                    <div className="draft-pick-list">
                        {ROLES.map((role) => renderPickSlot("red", role))}
                    </div>
                </div>
            </div>

            <div className="recommendation-grid">
                {recommendationsByRole.map(({ role, recommendations }) => (
                    <div key={role} className="recommendation-card">
                        <h3>{ROLE_LABELS[role]}</h3>

                        {activeSidePicks[role] ? (
                            <p className="muted">Rolle bereits gepickt.</p>
                        ) : recommendations.length === 0 ? (
                            <p className="muted">Keine Kandidaten auf den letzten 4 Patches.</p>
                        ) : (
                            <ol>
                                {recommendations.map((entry) => (
                                    <li key={`${entry.championName}-${entry.role}`}>
                                        <strong>{entry.championName}</strong>
                                        <span>
                      Score {formatScore(entry.totalScore)} · {entry.games} Picks
                    </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                ))}
            </div>

            <div className="recommendation-section">
                <h3>
                    Beste nächste Picks für {recommendationSide === "blue" ? "Blue Side" : "Red Side"}
                </h3>

                {topRecommendations.length === 0 ? (
                    <p className="empty-state">
                        Keine Empfehlungen gefunden. Reduziere die Mindest-Picks oder prüfe
                        deine Filter.
                    </p>
                ) : (
                    <div className="table-scroll">
                        <table>
                            <thead>
                            <tr>
                                <th>Champion</th>
                                <th>Rolle</th>
                                <th>Total</th>
                                <th>Priority</th>
                                <th>Role</th>
                                <th>Synergy</th>
                                <th>Matchup</th>
                                <th>Picks</th>
                                <th>Winrate</th>
                                <th>Sample</th>
                                <th>Gründe</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topRecommendations.map((entry) => (
                                <tr key={`${entry.championName}-${entry.role}`}>
                                    <td>{entry.championName}</td>
                                    <td>{ROLE_LABELS[entry.role]}</td>
                                    <td>{formatScore(entry.totalScore)}</td>
                                    <td>{formatScore(entry.draftPriorityScore)}</td>
                                    <td>{formatScore(entry.roleStatsScore)}</td>
                                    <td>{formatScore(entry.synergyScore)}</td>
                                    <td>{formatScore(entry.matchupScore)}</td>
                                    <td>{entry.games}</td>
                                    <td>{formatPercent(entry.winRate)}</td>
                                    <td className="muted">{entry.sampleSizeLabel}</td>
                                    <td>{entry.reasons.join(", ")}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    )
}