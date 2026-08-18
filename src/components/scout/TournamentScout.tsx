/**
 * Tournament Scout — container of the "Turnier Scout" tab.
 *
 * Owns all state and is the only place that talks to the pure scout modules:
 *
 *   input text ──parseScoutInput()──▶ players + unparsedLines + duplicatesMerged
 *   players + playerData + lineup ──analyzeScout()──▶ analysis (threats, bans, warnings)
 *   the whole V2 state ──saveScoutState()──▶ localStorage
 *
 * Deliberate design points:
 *  - The tab needs no match data at all, so it can render while the pro-meta
 *    dataset is still loading or failed to load.
 *  - `duplicatesMerged` from the parser is handed to `analyzeScout` via
 *    `options.duplicatesMerged`; without it the `duplicate_players_merged`
 *    warning would never appear.
 *  - `lineup` and `includeSubstitutes` are handed to `analyzeScout` the same
 *    way. THIS IS WHAT MAKES THE WHOLE ROLE-AWARENESS FEATURE WORK: without
 *    them the engine claims nothing about roles, no ban carries a lane, no
 *    off-role entry is flagged and no substitute is weighted down. The lineup
 *    is passed only once at least one seat is filled — see `isLineupEmpty()`
 *    for why "no lineup" and "an empty lineup" must stay different states.
 *  - RE-PARSE PROTECTION: `parseScoutInput()` rebuilds the roster from scratch
 *    and a `ScoutPlayerId` is region + name + tagline, so *correcting a typo*
 *    drops the old player — together with every champion row the user typed
 *    for them. `handleParse` therefore commits nothing until it has checked
 *    which dropped players carry data (`findDroppedPlayersWithData`), and asks
 *    when any do. Cancelling keeps everything, including the input.
 *  - Removing a player asks first: `saveScoutState()` drops `playerData` whose
 *    player is gone, so the removal destroys that player's scout rows.
 *  - The clock lives here, not in the pure modules (`nowIso`).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { ALL_CHAMPIONS } from "../../analysis/championCatalog"
import { useTranslation } from "../../i18n/LanguageContext"
import { analyzeScout } from "../../scout/analysis"
import { parseScoutInput } from "../../scout/linkParser"
import { buildOpggMultiLink } from "../../scout/sources"
import {
    clearScoutState,
    createEmptyScoutLineup,
    loadScoutState,
    saveScoutState,
} from "../../scout/storage"
import { SCOUT_SCHEMA_VERSION } from "../../scout/types"
import type {
    ManualChampionEntry,
    ScoutLineup,
    ScoutParseResult,
    ScoutPlayer,
    ScoutPlayerData,
    ScoutPlayerId,
    ScoutRemovedPlayer,
    ScoutRole,
    UnparsedLine,
} from "../../scout/types"
import { ScoutAnalysisPanel } from "./ScoutAnalysisPanel"
import { ScoutBanPlanPanel } from "./ScoutBanPlanPanel"
import { ScoutInputPanel, type ScoutParseError } from "./ScoutInputPanel"
import { ScoutLineupPanel } from "./ScoutLineupPanel"
import { ScoutPlayerCard } from "./ScoutPlayerCard"
import { ScoutRemovedPlayersPanel } from "./ScoutRemovedPlayersPanel"
import { ScoutReparseDialog } from "./ScoutReparseDialog"
import { buildScoutExportText, copyTextToClipboard } from "./scoutExport"
import {
    CHAMPION_DATALIST_ID,
    SCOUT_EXAMPLE_INPUT,
    archiveRemovedPlayers,
    assignPlayerToSlot,
    autofillLineupFromRoles,
    buildScoutLineupSummary,
    clearLineupSlot,
    defaultRoleForPlayer,
    findDroppedPlayersWithData,
    isLineupEmpty,
    lineupStarterSlot,
    liveScoutPlayerDataIds,
    pruneLineup,
    removePlayerFromLineup,
    scoutRestoreDecision,
    withEntryIds,
    type ScoutLineupAssignError,
    type ScoutLineupTarget,
} from "./scoutUiHelpers"

type CopyState = "idle" | "copied" | "failed"

type PlayerDataMap = Record<ScoutPlayerId, ScoutPlayerData>
type RemovedPlayerMap = Record<ScoutPlayerId, ScoutRemovedPlayer>

/**
 * A parse that is waiting for the user's answer.
 *
 * Held whole and unapplied: nothing on screen changes while the dialog is up,
 * so cancelling really is "as you were" and not "as you were, except the
 * unparsed-lines box already updated".
 */
interface PendingParse {
    result: ScoutParseResult
    nextPlayers: ScoutPlayer[]
    affected: ScoutPlayer[]
}

/** Give every persisted row a React key without touching its values. */
function hydratePlayerData(raw: PlayerDataMap): PlayerDataMap {
    const out: PlayerDataMap = {}
    for (const id of Object.keys(raw)) {
        const data = raw[id]
        out[id] = { ...data, entries: withEntryIds(data.entries) }
    }
    return out
}

function omitKey<T>(map: Readonly<Record<string, T>>, key: string): Record<string, T> {
    const out: Record<string, T> = {}
    for (const id of Object.keys(map)) {
        if (id !== key) out[id] = map[id]
    }
    return out
}

export function TournamentScout() {
    const { t } = useTranslation()

    const [initialState] = useState(loadScoutState)
    const [rawInput, setRawInput] = useState<string>(initialState.rawInput ?? "")
    const [players, setPlayers] = useState<ScoutPlayer[]>(initialState.players)
    const [playerData, setPlayerData] = useState<PlayerDataMap>(() =>
        hydratePlayerData(initialState.playerData),
    )
    const [lineup, setLineup] = useState<ScoutLineup>(initialState.lineup)
    const [includeSubstitutes, setIncludeSubstitutes] = useState(initialState.includeSubstitutes)
    const [removedPlayers, setRemovedPlayers] = useState<RemovedPlayerMap>(
        initialState.removedPlayers,
    )

    const [unparsedLines, setUnparsedLines] = useState<UnparsedLine[]>([])
    const [duplicatesMerged, setDuplicatesMerged] = useState(0)
    const [hasParsed, setHasParsed] = useState(false)
    const [parseError, setParseError] = useState<ScoutParseError | null>(null)
    const [showExampleHint, setShowExampleHint] = useState(false)
    const [copyState, setCopyState] = useState<CopyState>("idle")
    const [pendingParse, setPendingParse] = useState<PendingParse | null>(null)
    const [assignError, setAssignError] = useState<ScoutLineupAssignError | null>(null)

    // The first effect run would only write back what was just read.
    const skipFirstSave = useRef(true)
    useEffect(() => {
        if (skipFirstSave.current) {
            skipFirstSave.current = false
            return
        }
        saveScoutState(
            {
                schemaVersion: SCOUT_SCHEMA_VERSION,
                players,
                playerData,
                lineup,
                includeSubstitutes,
                removedPlayers,
                rawInput,
            },
            { nowIso: new Date().toISOString() },
        )
    }, [players, playerData, lineup, includeSubstitutes, removedPlayers, rawInput])

    useEffect(() => {
        if (copyState === "idle") return
        const handle = setTimeout(() => setCopyState("idle"), 3000)
        return () => clearTimeout(handle)
    }, [copyState])

    /**
     * THE handover to the engine. `lineup` and `includeSubstitutes` travel with
     * the data — drop either and every lane label, every off-role flag and the
     * whole substitute weighting silently disappear.
     *
     * An untouched lineup is passed as `undefined`, not as an empty object: the
     * engine reads those as two different statements (see `isLineupEmpty`).
     */
    const analysis = useMemo(
        () =>
            analyzeScout(players, playerData, {
                duplicatesMerged,
                lineup: isLineupEmpty(lineup) ? undefined : lineup,
                includeSubstitutes,
            }),
        [players, playerData, duplicatesMerged, lineup, includeSubstitutes],
    )

    /** The builder's own view — available before and without any analysis. */
    const lineupSummary = useMemo(
        () => buildScoutLineupSummary(lineup, players),
        [lineup, players],
    )

    const multiLink = useMemo(() => buildOpggMultiLink(players), [players])

    /* ---------------------------------------------------------------- input */

    /**
     * Keep a role the user corrected by hand when the re-parse did not detect
     * one. The input is the source of truth for the roster, not for handiwork.
     */
    function carryOverRoles(parsed: readonly ScoutPlayer[]): ScoutPlayer[] {
        const previousRoles = new Map(players.map((player) => [player.id, player.role]))
        return parsed.map((player) => {
            const previous = previousRoles.get(player.id)
            if (player.role === "unknown" && previous && previous !== "unknown") {
                return { ...player, role: previous }
            }
            return player
        })
    }

    /**
     * Apply a parse that has been decided on.
     *
     * `droppedMode` says what happens to the scout data of players the parse
     * removed: `"archive"` moves it into `removedPlayers` (restorable),
     * `"discard"` lets it go. `"discard"` is also the path taken when nothing
     * was at stake in the first place.
     */
    function commitParse(
        result: ScoutParseResult,
        nextPlayers: ScoutPlayer[],
        affected: readonly ScoutPlayer[],
        droppedMode: "archive" | "discard",
    ) {
        setUnparsedLines(result.unparsedLines)
        setDuplicatesMerged(result.duplicatesMerged)
        setHasParsed(true)
        setParseError(null)

        const keptIds = new Set<ScoutPlayerId>(nextPlayers.map((player) => player.id))

        // Same orphan rule the persisted playerData below is pruned by, so the
        // archive is filtered against the state that is about to be *written*,
        // not the one still on screen. Without it the panel would keep offering
        // "restore" for an entry saveScoutState() deletes on its next write.
        const nextLiveDataIds = liveScoutPlayerDataIds(nextPlayers, playerData)

        if (droppedMode === "archive" && affected.length > 0) {
            setRemovedPlayers((current) =>
                archiveRemovedPlayers(
                    current,
                    affected,
                    playerData,
                    new Date().toISOString(),
                    nextLiveDataIds,
                ),
            )
        }

        setPlayers(nextPlayers)

        // Mirror the orphan rule of saveScoutState() into the live state, so
        // what is on screen is exactly what will be persisted.
        setPlayerData((current) => {
            const next: PlayerDataMap = {}
            for (const id of Object.keys(current)) {
                if (keptIds.has(id)) next[id] = current[id]
            }
            return next
        })

        // A seat pointing at a player who is gone would render empty while the
        // analysis still counted the slot as filled.
        setLineup((current) => pruneLineup(current, keptIds))
        setAssignError(null)
    }

    function handleParse() {
        setShowExampleHint(false)
        if (rawInput.trim().length === 0) {
            setParseError("noInput")
            setHasParsed(false)
            return
        }

        const result = parseScoutInput(rawInput)

        if (result.players.length === 0) {
            // Keep whatever was already recognised — an unusable paste must not
            // silently destroy the roster the user already collected.
            setUnparsedLines(result.unparsedLines)
            setDuplicatesMerged(result.duplicatesMerged)
            setHasParsed(true)
            setParseError("unrecognized")
            return
        }

        const nextPlayers = carryOverRoles(result.players)
        const affected = findDroppedPlayersWithData(players, playerData, nextPlayers)

        // Players *without* data never raise the dialog: asking on every
        // ordinary roster change would train the user to click it away.
        if (affected.length > 0) {
            setPendingParse({ result, nextPlayers, affected })
            return
        }

        commitParse(result, nextPlayers, affected, "discard")
    }

    function handleClearInput() {
        setRawInput("")
        setParseError(null)
        setShowExampleHint(false)
    }

    function handleInsertExample() {
        // Structure only — never a result. `scout_exampleHint` says so.
        setRawInput(SCOUT_EXAMPLE_INPUT)
        setShowExampleHint(true)
        setParseError(null)
        setHasParsed(false)
        setUnparsedLines([])
    }

    /* ------------------------------------------------------------- re-parse */

    function resolvePendingParse(mode: "archive" | "discard") {
        if (pendingParse === null) return
        commitParse(pendingParse.result, pendingParse.nextPlayers, pendingParse.affected, mode)
        setPendingParse(null)
    }

    /** Cancel keeps everything: roster, data, lineup and the input text. */
    function cancelPendingParse() {
        setPendingParse(null)
    }

    /**
     * The second data-loss path of this tab, and the one that had no guard.
     *
     * Restoring *replaces* `playerData[playerId]` with the archived rows. A
     * player can be in the archive and back in the roster at the same time (the
     * user corrected the spelling again), and then the rows they have typed
     * since would be gone without a word. `scoutRestoreDecision()` holds the
     * rule — pure, and therefore testable, unlike the `window.confirm` here.
     */
    function handleRestoreRemovedPlayer(playerId: ScoutPlayerId) {
        const removed = removedPlayers[playerId]
        if (removed === undefined) return

        if (scoutRestoreDecision(playerData[playerId]) === "confirm_overwrite") {
            if (!window.confirm(t("scout_restoreOverwriteConfirm"))) return
        }

        setPlayers((current) =>
            current.some((player) => player.id === playerId) ? current : [...current, removed.player],
        )
        setPlayerData((current) => ({
            ...current,
            [playerId]: { ...removed.data, entries: withEntryIds(removed.data.entries) },
        }))
        // `ScoutStateV2`: an id lives in `playerData` or in `removedPlayers`,
        // never in both.
        setRemovedPlayers((current) => omitKey(current, playerId))
    }

    function handleDiscardRemovedPlayer(playerId: ScoutPlayerId) {
        if (!window.confirm(t("scout_player_removeConfirm"))) return
        setRemovedPlayers((current) => omitKey(current, playerId))
    }

    /* --------------------------------------------------------------- lineup */

    function handleAssign(target: ScoutLineupTarget, playerId: ScoutPlayerId | null) {
        setAssignError(null)
        if (playerId === null) {
            setLineup((current) => clearLineupSlot(current, target))
            return
        }

        // Belt to the `<select>`'s braces: the dropdown never offers a player
        // who already sits somewhere, but the invariant is enforced here too.
        const result = assignPlayerToSlot(lineup, target, playerId)
        if (result.error !== null) {
            setAssignError(result.error)
            return
        }
        setLineup(result.lineup)
    }

    function handleAutofillLineup() {
        setAssignError(null)
        setLineup((current) => autofillLineupFromRoles(current, players))
    }

    function handleClearLineup() {
        setAssignError(null)
        setLineup(createEmptyScoutLineup())
    }

    /* --------------------------------------------------------------- players */

    function updatePlayerData(playerId: ScoutPlayerId, patch: Partial<ScoutPlayerData>) {
        setPlayerData((current) => {
            const existing = current[playerId] ?? { playerId, entries: [] }
            return { ...current, [playerId]: { ...existing, ...patch, playerId } }
        })
    }

    function handleRoleChange(playerId: ScoutPlayerId, role: ScoutRole) {
        setPlayers((current) =>
            current.map((player) => (player.id === playerId ? { ...player, role } : player)),
        )
    }

    function handleEntriesChange(playerId: ScoutPlayerId, entries: ManualChampionEntry[]) {
        updatePlayerData(playerId, { entries })
    }

    function handleNoteChange(playerId: ScoutPlayerId, note: string) {
        updatePlayerData(playerId, { note })
    }

    /**
     * HARD RULE: ask before removing. The persistence layer drops manual data
     * whose player no longer exists, so this is not undoable — which is exactly
     * what `scout_player_removeConfirm` says. (The archive is for players the
     * *input* dropped; deleting one by hand is a deliberate delete.)
     */
    function handleRemovePlayer(player: ScoutPlayer) {
        if (!window.confirm(t("scout_player_removeConfirm"))) return

        setPlayers((current) => current.filter((entry) => entry.id !== player.id))
        setPlayerData((current) => omitKey(current, player.id))
        setLineup((current) => removePlayerFromLineup(current, player.id))
    }

    /* ------------------------------------------------------- export & reset */

    async function handleCopy() {
        const text = buildScoutExportText(t, analysis, { includeSubstitutes })
        const ok = await copyTextToClipboard(text)
        setCopyState(ok ? "copied" : "failed")
    }

    function handleReset() {
        if (!window.confirm(t("scout_resetConfirm"))) return
        clearScoutState()
        setRawInput("")
        setPlayers([])
        setPlayerData({})
        setLineup(createEmptyScoutLineup())
        setIncludeSubstitutes(false)
        setRemovedPlayers({})
        setUnparsedLines([])
        setDuplicatesMerged(0)
        setHasParsed(false)
        setParseError(null)
        setShowExampleHint(false)
        setPendingParse(null)
        setAssignError(null)
    }

    /* --------------------------------------------------------------- render */

    return (
        <div className="scout-tab">
            <header className="scout-header">
                <h2>{t("scout_title")}</h2>
                <p className="scout-intro">{t("scout_intro")}</p>
                <p className="scout-honesty">{t("scout_dataHonesty")}</p>
            </header>

            <datalist id={CHAMPION_DATALIST_ID}>
                {ALL_CHAMPIONS.map((champion) => (
                    <option key={champion} value={champion} />
                ))}
            </datalist>

            <ScoutInputPanel
                rawInput={rawInput}
                onRawInputChange={setRawInput}
                onParse={handleParse}
                onClearInput={handleClearInput}
                onInsertExample={handleInsertExample}
                showExampleHint={showExampleHint}
                playerCount={players.length}
                unparsedLines={unparsedLines}
                duplicatesMerged={duplicatesMerged}
                parseError={parseError}
                multiLink={multiLink}
                hasParsed={hasParsed}
            />

            <ScoutLineupPanel
                players={players}
                lineup={lineup}
                summary={lineupSummary}
                includeSubstitutes={includeSubstitutes}
                onAssign={handleAssign}
                onAutofill={handleAutofillLineup}
                onClear={handleClearLineup}
                onIncludeSubstitutesChange={setIncludeSubstitutes}
                assignError={assignError}
            />

            <ScoutRemovedPlayersPanel
                removedPlayers={removedPlayers}
                onRestore={handleRestoreRemovedPlayer}
                onDiscard={handleDiscardRemovedPlayer}
            />

            <div className="scout-panel">
                <h3 className="scout-subheading">{t("scout_parsedPlayers")}</h3>
                {players.length === 0 ? (
                    <p className="scout-nodata">{t("scout_noPlayers")}</p>
                ) : (
                    <div className="scout-player-list">
                        {players.map((player) => (
                            <ScoutPlayerCard
                                key={player.id}
                                player={player}
                                entries={playerData[player.id]?.entries ?? []}
                                note={playerData[player.id]?.note ?? ""}
                                // The lineup slot, not the parsed guess — a new
                                // row for the mid-lane starter starts as `mid`.
                                defaultRole={defaultRoleForPlayer(lineup, player)}
                                // Only set when the player really holds one of
                                // the five starting seats. `player.role` must
                                // NOT stand in here: the role hint on a row is
                                // a statement about the declared lineup, and
                                // the parser's guess is not that.
                                lineupRole={lineupStarterSlot(lineup, player.id) ?? undefined}
                                membership={lineupSummary.byPlayerId[player.id]?.membership}
                                onRoleChange={(role) => handleRoleChange(player.id, role)}
                                onEntriesChange={(entries) => handleEntriesChange(player.id, entries)}
                                onNoteChange={(note) => handleNoteChange(player.id, note)}
                                onRemove={() => handleRemovePlayer(player)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ScoutAnalysisPanel analysis={analysis} />
            <ScoutBanPlanPanel analysis={analysis} />

            <div className="scout-button-row scout-footer-actions">
                <button type="button" className="scout-primary-button" onClick={() => void handleCopy()}>
                    {t("scout_export_copy")}
                </button>
                {copyState === "copied" && (
                    <span className="scout-copy-state" role="status">
                        {t("scout_export_copied")}
                    </span>
                )}
                {copyState === "failed" && (
                    <span className="scout-copy-state scout-error" role="status">
                        {t("scout_export_failed")}
                    </span>
                )}
                <button type="button" className="secondary-button" onClick={handleReset}>
                    {t("scout_reset")}
                </button>
            </div>

            {pendingParse !== null && (
                <ScoutReparseDialog
                    affected={pendingParse.affected}
                    playerData={playerData}
                    onKeep={() => resolvePendingParse("archive")}
                    onDiscard={() => resolvePendingParse("discard")}
                    onCancel={cancelPendingParse}
                />
            )}
        </div>
    )
}
