/**
 * Stats import panel of the Tournament Scout.
 *
 * WHAT IT IS FOR: the user opens a scouting site in a second tab, copies the
 * champion table of ONE player for ONE role, and pastes it here. The panel
 * parses that text, shows what it understood *and* what it did not, and turns
 * only the rows the user confirms into ordinary `ManualChampionEntry` records.
 * Nothing is estimated — see `scout_import_honesty`.
 *
 * ONE WAY IN, ONE PREVIEW: copy/paste is the whole import. Not one of the four
 * providers can be read out of the browser — the auto-fetch status block of
 * step 3 says so provider by provider, with the reason, straight out of
 * `getAllScoutAutoFetchStatuses()` — so the panel offers the honest route
 * instead of a button that could only fail: open the profile in a second tab,
 * copy the table, paste it. There is deliberately ONE preview table and ONE
 * apply path — two of either would eventually mean two definitions of
 * "applicable" and two different ban plans for the same numbers.
 *
 * FIVE STEPS, IN THIS ORDER, AND THE SECOND ONE IS THE POINT: player → role →
 * source → paste → preview. The role is chosen BEFORE anything is parsed and
 * is authoritative for every applied entry. `suggestImportRole()` may return
 * `null`, and `null` is rendered as an empty selection with the parse button
 * disabled — a table copied off a support profile must never be filed as a
 * jungle threat because a default was quietly picked. That is why this panel
 * never falls back to `"top"`, and why `parseScoutStats` cannot even be called
 * without a role.
 *
 * CONTROLLED, WITH NO PERSISTENCE OF ITS OWN: everything that must survive a
 * reload (the roster and `playerData`) belongs to TournamentScout and is
 * reached exclusively through `onApply` / `onAddPlayer`; this panel writes no
 * localStorage and holds no copy of the scout state. Its own working state —
 * the pasted text, the parse result, the row selection, the chosen source and
 * apply mode — is deliberately transient (see section 9 of src/scout/types.ts):
 * a half-reviewed paste is not a scouting result, and restoring one after a
 * reload would re-present unconfirmed numbers as if the user had accepted them.
 *
 * NOTHING IS APPLIED BEFORE THE BUTTON: parsing only fills the preview. The
 * apply step is the single call to `onApply`, and it is disabled while no role
 * is chosen or no row is selected.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import { parseScoutInput } from "../../scout/linkParser"
import {
    availableScoutImportModes,
    buildSourceLinks,
    getAllScoutAutoFetchStatuses,
    getScoutSourceDescriptor,
    isAutoFetchUnavailableForAll,
} from "../../scout/sources"
import {
    applyImportRows,
    buildImportNote,
    isImportRowApplicable,
    parseScoutStats,
} from "../../scout/statsImport"
import type {
    ManualChampionEntry,
    ScoutImportApplyMode,
    ScoutImportRole,
    ScoutImportRow,
    ScoutImportSourceKind,
    ScoutImportWarning,
    ScoutLineup,
    ScoutPlayer,
    ScoutPlayerData,
    ScoutPlayerId,
    ScoutRecency,
    ScoutStatsImportResult,
} from "../../scout/types"
import {
    SCOUT_IMPORT_ROLE_VALUES,
    SCOUT_IMPORT_SOURCE_VALUES,
    applicableRowIds,
    defaultSelectedRowIds,
    formatImportColumns,
    importValueLabel,
    isOpggRawResult,
    manualSourceForImport,
    resolveApplyStatus,
    scoutImportLayoutKey,
    scoutImportModeKey,
    scoutImportSourceKey,
    scoutImportUnparsedKey,
    selectedImportRows,
    suggestImportRole,
    summarizeSkippedLines,
    translateScoutImportWarning,
} from "./scoutImportHelpers"
import {
    SCOUT_IMPORT_APPLIED_KEYS,
    SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS,
    SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS,
    SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS,
    SCOUT_RECENCY_VALUES,
    fillPlaceholders,
    scoutBlockedKey,
    scoutConfidenceKey,
    scoutPluralMessage,
    scoutRecencyKey,
    scoutRoleKey,
    translateCount,
} from "./scoutUiHelpers"

interface Props {
    players: readonly ScoutPlayer[]
    playerData: Readonly<Record<ScoutPlayerId, ScoutPlayerData>>
    lineup: ScoutLineup
    /** Hands over the finished rows. The container writes them into playerData. */
    onApply: (playerId: ScoutPlayerId, entries: ManualChampionEntry[]) => void
    /** Adds a player recognised from a link to the roster (when new). */
    onAddPlayer: (player: ScoutPlayer) => void
}

/** What the link field last did. Transient, like everything else in here. */
type LinkState =
    | { kind: "idle" }
    | { kind: "not_resolved" }
    | { kind: "resolved"; playerName: string }
    | { kind: "added"; playerName: string }

export function ScoutStatsImportPanel({
    players,
    playerData,
    lineup,
    onApply,
    onAddPlayer,
}: Props) {
    const { t } = useTranslation()

    const [selectedPlayerId, setSelectedPlayerId] = useState<ScoutPlayerId | "">("")
    const [linkInput, setLinkInput] = useState("")
    const [linkState, setLinkState] = useState<LinkState>({ kind: "idle" })

    const [selectedRole, setSelectedRole] = useState<ScoutImportRole | null>(null)
    // Set the moment the user touches the role select. While it is false the
    // suggestion may keep updating; afterwards the user's answer stands.
    const [roleTouched, setRoleTouched] = useState(false)

    const [selectedSource, setSelectedSource] = useState<ScoutImportSourceKind>("unknown")
    const [recency, setRecency] = useState<ScoutRecency>("current")

    const [pasteText, setPasteText] = useState("")
    const [showExampleHint, setShowExampleHint] = useState(false)
    const [result, setResult] = useState<ScoutStatsImportResult | null>(null)
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set<string>())

    const [applyMode, setApplyMode] = useState<ScoutImportApplyMode>("append")
    const [appliedCount, setAppliedCount] = useState<number | null>(null)

    /**
     * The player the panel is working on.
     *
     * Derived rather than stored, so a roster change (a re-parse dropped the
     * selected player, the user removed them) cannot leave the panel pointing
     * at somebody who no longer exists.
     */
    const selectedPlayer: ScoutPlayer | null =
        players.find((player) => player.id === selectedPlayerId) ??
        (players.length > 0 ? players[0] : null)

    const roleSuggestion = useMemo(
        () => (selectedPlayer === null ? null : suggestImportRole(lineup, selectedPlayer)),
        [lineup, selectedPlayer],
    )

    /**
     * Re-suggest the role when the subject changes — but never overwrite an
     * answer the user gave. `roleSuggestion` is `null` for a player with
     * neither a starting seat nor a detected role, and that `null` is carried
     * through on purpose: the select then shows "please choose" and the parse
     * button stays disabled.
     */
    useEffect(() => {
        if (roleTouched) return
        setSelectedRole(roleSuggestion)
    }, [roleSuggestion, roleTouched])

    /**
     * The subject the success sentence is a statement ABOUT: player + role.
     *
     * Serialised rather than concatenated with a separator, so no player id can
     * collide with the joiner and make two different contexts look like one.
     */
    const appliedContextKey = JSON.stringify([selectedPlayer?.id ?? null, selectedRole])
    /**
     * The context of the LAST render, seeded with the FIRST one so the mount run
     * of the effect below is a no-op rather than a reset.
     */
    const lastAppliedContextKey = useRef(appliedContextKey)

    /**
     * WHY THIS EFFECT EXISTS: every one of the thirteen handlers already clears
     * `appliedCount`, but two paths into this panel are not handlers at all —
     * they are driven by props and fire without anybody clicking in here:
     *
     *  - the effect right above swaps the ROLE when `roleSuggestion` changes
     *    (the lineup panel sits directly above this one, so re-seating a player
     *    there moves the role under an untouched select), and
     *  - `selectedPlayer` falls back to `players[0]` when the chosen player is
     *    removed via their player card, which visibly jumps the select to
     *    somebody else.
     *
     * In both cases "Übernommen: n Zeilen." would keep standing while describing
     * a context that is no longer on screen — the same class of stale assertion
     * the handlers above avoid.
     *
     * WHAT IT MUST NOT DO: wipe the message the click just produced.
     * `handleApply()` writes through `onApply` into `playerData` only; it changes
     * neither `players` nor `lineup` nor `selectedRole`, so `appliedContextKey`
     * is identical across the render that first carries an `appliedCount`. The
     * ref makes that guarantee explicit instead of leaving it to dependency
     * comparison: the reset happens only when the context REALLY changed.
     */
    useEffect(() => {
        if (lastAppliedContextKey.current === appliedContextKey) return
        lastAppliedContextKey.current = appliedContextKey
        setAppliedCount(null)
    }, [appliedContextKey])

    const autoFetchStatuses = useMemo(() => getAllScoutAutoFetchStatuses(), [])
    const autoFetchBlockedForAll = useMemo(() => isAutoFetchUnavailableForAll(), [])
    const importModes = useMemo(() => availableScoutImportModes(), [])

    const sourceLinks = useMemo(
        () => (selectedPlayer === null ? [] : buildSourceLinks(selectedPlayer)),
        [selectedPlayer],
    )

    const rows: readonly ScoutImportRow[] = result?.rows ?? []
    /** Whole-paste warnings only — the row-scoped ones render on their row. */
    const resultWarnings: readonly ScoutImportWarning[] = (result?.warnings ?? []).filter(
        (warning) => warning.rowIndex === undefined,
    )

    /**
     * The raw OP.GG champions-page copy.
     *
     * `isOpggRawResult()` rather than a `result.layout === …` written out here:
     * the condition is asked once and every piece of the block below hangs off
     * that one answer (see the helper for the full argument).
     *
     * The block states what was RECOGNISED — the layout, the champion count and
     * the role note. What was SKIPPED is deliberately not repeated here: that is
     * the job of the skip summary further down, which covers every reason and
     * every layout instead of two reasons and one layout. Saying it twice, once
     * per section, is precisely the clutter this panel was cleaned up to lose.
     */
    const isOpggRaw = result !== null && isOpggRawResult(result)

    /**
     * The skipped lines, rolled up into four numbers plus a short list.
     *
     * A raw OP.GG copy contributes dozens of `-`, `vs …` and "Alle Champions"
     * entries; listing every one of them verbatim buried the two or three lines
     * that genuinely needed a human eye. See `summarizeSkippedLines()` for where
     * the line between "counted" and "still listed" runs — the panel does not
     * decide that, it only renders it.
     */
    const skipSummary = useMemo(
        () => (result === null ? null : summarizeSkippedLines(result)),
        [result],
    )

    /**
     * The lines the summary rolled up, for the collapsed `<details>`.
     *
     * Identity-based rather than a second list of reasons: `listed` is a
     * filtered view of the very same objects, so "everything not in it" is
     * exactly the counted rest — without this file owning a second copy of the
     * rule that could drift away from the helper's.
     */
    const countedSkipLines = useMemo(
        () =>
            result === null || skipSummary === null
                ? []
                : result.unparsedLines.filter((line) => !skipSummary.listed.includes(line)),
        [result, skipSummary],
    )

    const hasPlayers = players.length > 0
    const canParse = selectedRole !== null
    const canApply = selectedRole !== null && selectedPlayer !== null && selectedIds.size > 0

    /**
     * The ONE thing the apply step says. Never two.
     *
     * Both messages used to render from two independent conditions, and those
     * two are not mutually exclusive: `handleApply()` clears the row selection,
     * which makes `canApply` false in the very render that first has an
     * `appliedCount` — so "Übernahme gesperrt" and "Übernommen: n Zeilen" ended
     * up next to each other, each contradicting the other. `resolveApplyStatus()`
     * returns a single value, which makes that state unrepresentable, and it is
     * a pure function so the rule is actually covered by the Node-based suite.
     */
    const applyStatus = resolveApplyStatus({ canApply, appliedCount })

    /**
     * The provenance label of the preview's source column.
     *
     * The dropdown of step 3 is the only statement there is about where the
     * pasted table came from, so it is what the column shows — including the
     * dedicated "unknown" label, which is the parser's honest "could not tell"
     * rather than a provider name. Same rule (and same reason) as
     * `manualSourceForImport()`, which decides what is actually stored; this is
     * only its visible half.
     */
    const previewSourceLabel = t(scoutImportSourceKey(selectedSource))

    /* ----------------------------------------------------------- handlers */

    /**
     * WHY EVERY HANDLER BELOW CLEARS `appliedCount`.
     *
     * "Übernommen: n Zeilen" is a statement about ONE past click and about the
     * exact context it happened in. The moment any part of that context moves —
     * another player, another role, another mode, another selection, another
     * paste — the sentence would describe something that is no longer on screen,
     * and the panel would be asserting a result for a situation that never
     * produced one. So it is cleared in every one of them, and the apply step
     * falls back to `blocked` / `idle`, which then show alone and correctly
     * (see resolveApplyStatus()). handleApply() is the only place that sets it.
     *
     * The two ways the context can move WITHOUT a handler running — a role
     * swapped by the suggestion effect, a player dropped so the derived
     * `selectedPlayer` falls back — are covered by the context effect above.
     */
    function handleSelectPlayer(playerId: string) {
        setSelectedPlayerId(playerId)
        setLinkState({ kind: "idle" })
        setAppliedCount(null)
    }

    /**
     * Resolve one profile link or Riot ID into a player.
     *
     * Only the FIRST recognised player is used: this field is for one profile,
     * not for a multi-link — the roster paste at the top of the tab is where a
     * whole team goes in.
     */
    function handleResolveLink() {
        const parsed = parseScoutInput(linkInput)
        if (parsed.players.length === 0) {
            setLinkState({ kind: "not_resolved" })
            return
        }
        const player = parsed.players[0]

        const known = players.some((entry) => entry.id === player.id)
        if (!known) onAddPlayer(player)
        setSelectedPlayerId(player.id)
        setAppliedCount(null)
        setLinkState({
            kind: known ? "resolved" : "added",
            playerName: player.displayName,
        })
    }

    function handleRoleChange(value: string) {
        setRoleTouched(true)
        setSelectedRole(value === "" ? null : (value as ScoutImportRole))
        setAppliedCount(null)
    }

    function handleSourceChange(value: string) {
        setSelectedSource(value as ScoutImportSourceKind)
        setAppliedCount(null)
    }

    function handleRecencyChange(value: string) {
        setRecency(value as ScoutRecency)
        setAppliedCount(null)
    }

    function handlePasteChange(value: string) {
        setPasteText(value)
        setAppliedCount(null)
    }

    function handleApplyModeChange(value: string) {
        setApplyMode(value as ScoutImportApplyMode)
        setAppliedCount(null)
    }

    function handleParse() {
        if (selectedRole === null) return
        setShowExampleHint(false)
        setAppliedCount(null)
        const parsed = parseScoutStats(pasteText, {
            role: selectedRole,
            source: selectedSource,
        })
        setResult(parsed)
        // PRESELECTION — deliberately stricter than "select all": only rows
        // that can become an entry AND whose champion the catalog resolved.
        // A copied-along summary line (`total  42  58%`) is applicable but
        // unresolved, so it stays unticked instead of riding along unnoticed.
        // Do NOT "unify" this with handleSelectAll() below; see
        // defaultSelectedRowIds() for why the two questions differ.
        setSelectedIds(new Set(defaultSelectedRowIds(parsed.rows)))
    }

    function handleClearPaste() {
        setPasteText("")
        setResult(null)
        setSelectedIds(new Set<string>())
        setShowExampleHint(false)
        setAppliedCount(null)
    }

    function handleInsertExample() {
        // Structure only, never a result — `scout_import_exampleHint` says so.
        setPasteText(t("scout_import_pastePlaceholder"))
        setShowExampleHint(true)
        setResult(null)
        setSelectedIds(new Set<string>())
        setAppliedCount(null)
    }

    function toggleRow(rowId: string, include: boolean) {
        setAppliedCount(null)
        setSelectedIds((current) => {
            const next = new Set(current)
            if (include) next.add(rowId)
            else next.delete(rowId)
            return next
        })
    }

    function handleSelectAll() {
        // An explicit act of the user: this ticks EVERYTHING that may be
        // applied, unresolved champion names included. Unlike the preselection
        // in handleParse() it is not the panel making a choice on its own, so
        // it stays on applicableRowIds().
        setAppliedCount(null)
        setSelectedIds(new Set(applicableRowIds(rows)))
    }

    function handleSelectNone() {
        setAppliedCount(null)
        setSelectedIds(new Set<string>())
    }

    function handleApply() {
        if (selectedRole === null || selectedPlayer === null || result === null) return
        const existing = playerData[selectedPlayer.id]?.entries ?? []
        const selectedRows = selectedImportRows(rows, selectedIds)
        const applied = applyImportRows(existing, selectedRows, {
            role: selectedRole,
            // The dropdown is the statement, with one correction: the parser's
            // `"unknown"` is not a storable provenance. See
            // manualSourceForImport() for the full argument.
            source: manualSourceForImport(result.layout, selectedSource),
            recency,
            mode: applyMode,
        })
        onApply(selectedPlayer.id, applied.entries)
        // `importedRows` is, mode-independently, the number of IMPORT ROWS that
        // became stored entries — the only number this message may show. It is
        // NOT `addedRows + removedExistingRows`: in `replace` mode
        // `removedExistingRows` counts the user's own old entries that were
        // DELETED, so summing them announces a deletion as an import
        // ("Übernommen: 72 Zeilen." for 36 existing rows replaced by 36 pasted
        // ones, while 36 were stored). See `ScoutImportApplyResult` in
        // src/scout/types.ts.
        setAppliedCount(applied.importedRows)
        // The preview stays: the user can see what was taken over. Only the
        // selection is cleared, so a second click cannot apply the same rows
        // again by accident.
        setSelectedIds(new Set<string>())
    }

    /* ------------------------------------------------------------- render */

    return (
        <div className="scout-panel scout-import-panel">
            <div className="scout-panel-head">
                <h3 className="scout-subheading">{t("scout_import_title")}</h3>
            </div>
            <p className="muted">{t("scout_import_hint")}</p>

            {/* ---------------------------------------------------- 1. player */}
            <section className="scout-import-step">
                <h4 className="scout-import-step-title">{t("scout_import_step_player")}</h4>

                {!hasPlayers ? (
                    <p className="scout-nodata">{t("scout_import_playerNone")}</p>
                ) : (
                    <div className="scout-import-fields">
                        <div className="scout-import-field">
                            <label className="scout-entry-label" htmlFor="scout-import-player">
                                {t("scout_import_playerLabel")}
                            </label>
                            <select
                                id="scout-import-player"
                                value={selectedPlayer?.id ?? ""}
                                onChange={(event) => handleSelectPlayer(event.target.value)}
                            >
                                {/* The empty value `selectedPlayer?.id ?? ""` can
                                    fall back to gets a name of its own instead of
                                    silently displaying the first player while the
                                    state says "nobody". `disabled` because it is a
                                    prompt, not a choice — picking "no player" is
                                    not a thing the user may do here. */}
                                <option value="" disabled>
                                    {t("scout_import_playerPlaceholder")}
                                </option>
                                {players.map((player) => (
                                    <option key={player.id} value={player.id}>
                                        {player.displayName}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                <div className="scout-import-fields">
                    <div className="scout-import-field scout-import-field-wide">
                        <label className="scout-entry-label" htmlFor="scout-import-link">
                            {t("scout_import_linkLabel")}
                        </label>
                        <input
                            id="scout-import-link"
                            type="text"
                            value={linkInput}
                            spellCheck={false}
                            placeholder={t("scout_import_linkPlaceholder")}
                            onChange={(event) => setLinkInput(event.target.value)}
                        />
                    </div>
                    <div className="scout-button-row">
                        <button type="button" className="secondary-button" onClick={handleResolveLink}>
                            {t("scout_import_linkButton")}
                        </button>
                    </div>
                </div>

                {linkState.kind === "not_resolved" && (
                    <p className="scout-error" role="alert">
                        {t("scout_import_linkNotResolved")}
                    </p>
                )}
                {linkState.kind === "resolved" && (
                    <p className="scout-import-status" role="status">
                        {fillPlaceholders(t("scout_import_linkResolved"), {
                            player: linkState.playerName,
                        })}
                    </p>
                )}
                {linkState.kind === "added" && (
                    <p className="scout-import-status" role="status">
                        {fillPlaceholders(t("scout_import_linkAdded"), {
                            player: linkState.playerName,
                        })}
                    </p>
                )}
            </section>

            {/* ------------------------------------------------------ 2. role */}
            <section className="scout-import-step">
                <h4 className="scout-import-step-title">{t("scout_import_step_role")}</h4>

                <div className="scout-import-fields">
                    <div className="scout-import-field">
                        <label className="scout-entry-label" htmlFor="scout-import-role">
                            {t("scout_import_roleLabel")}
                        </label>
                        <select
                            id="scout-import-role"
                            value={selectedRole ?? ""}
                            disabled={!hasPlayers}
                            onChange={(event) => handleRoleChange(event.target.value)}
                        >
                            {/* Empty option first while nothing is chosen — the
                                panel states "you must answer this" instead of
                                pre-selecting a lane nobody claimed. The label is
                                the language-neutral dash because there is no
                                "please choose" key in the i18n files and this
                                module does not own them; `scout_import_roleRequired`
                                right below spells the demand out. */}
                            <option value="">{"—"}</option>
                            {SCOUT_IMPORT_ROLE_VALUES.map((role) => (
                                <option key={role} value={role}>
                                    {t(scoutRoleKey(role))}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {selectedRole === null && (
                    <p className="scout-import-required" role="alert">
                        {t("scout_import_roleRequired")}
                    </p>
                )}
                <p className="scout-import-hint">{t("scout_import_roleHint")}</p>
            </section>

            {/* ---------------------------------------------------- 3. source */}
            <section className="scout-import-step">
                <h4 className="scout-import-step-title">{t("scout_import_step_source")}</h4>

                <div className="scout-import-fields">
                    <div className="scout-import-field">
                        <label className="scout-entry-label" htmlFor="scout-import-source">
                            {t("scout_import_sourceLabel")}
                        </label>
                        <select
                            id="scout-import-source"
                            value={selectedSource}
                            onChange={(event) => handleSourceChange(event.target.value)}
                        >
                            {SCOUT_IMPORT_SOURCE_VALUES.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(scoutImportSourceKey(kind))}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="scout-import-field">
                        <label className="scout-entry-label" htmlFor="scout-import-recency">
                            {t("scout_import_recencyLabel")}
                        </label>
                        <select
                            id="scout-import-recency"
                            value={recency}
                            onChange={(event) => handleRecencyChange(event.target.value)}
                        >
                            {SCOUT_RECENCY_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {t(scoutRecencyKey(value))}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <p className="scout-import-hint">{t("scout_import_sourceHint")}</p>

                <div className="scout-import-block">
                    <h5 className="scout-import-block-title">{t("scout_import_openSourcesTitle")}</h5>
                    {/* Step 1 already says this a few lines above. Saying it twice on
                        one screen is the documentation tone this tab is moving away
                        from, so the block stays silent until a player is picked. */}
                    {selectedPlayer === null ? null : (
                        <div className="scout-import-source-links">
                            {sourceLinks.map((ref) => {
                                const label = getScoutSourceDescriptor(ref.kind).label
                                const title = fillPlaceholders(t("scout_player_openSource"), {
                                    source: label,
                                })
                                return (
                                    <a
                                        key={ref.kind}
                                        href={ref.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={title}
                                        aria-label={title}
                                    >
                                        {title}
                                    </a>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* WHY THERE IS NO BUTTON — collapsed on purpose. This is the
                    justification for the copy/paste route, not an instruction, so it
                    must not stand between the user and the paste field. It is NOT dead
                    code: `autoFetchStatuses`, `autoFetchBlockedForAll` and `importModes`
                    are the status functions of src/scout/sources.ts rendering
                    SCOUT_DIRECT_FETCH_INFO. The day a provider becomes fetchable, this
                    block says so without anyone editing this file. */}
                <details className="scout-details scout-import-why-details">
                    <summary>{t("scout_import_autoFetchTitle")}</summary>

                    <p className="scout-honesty">{t("scout_import_honesty")}</p>

                    {/* Said once rather than four times when it is true of all
                        four providers — `isAutoFetchUnavailableForAll()` flips
                        by itself the day one becomes fetchable. */}
                    {autoFetchBlockedForAll && (
                        <p className="scout-import-hint">{t("scout_import_autoFetchSummary")}</p>
                    )}

                    <ul className="scout-import-list">
                        {autoFetchStatuses.map((status) => {
                            const label = getScoutSourceDescriptor(status.kind).label
                            // `supported` is `SCOUT_DIRECT_FETCH_INFO`'s own answer,
                            // not a constant repeated here: the day a provider
                            // becomes fetchable this row stops claiming otherwise
                            // without anyone editing this file.
                            return (
                                <li key={status.kind}>
                                    {status.supported ? (
                                        <strong>{label}</strong>
                                    ) : (
                                        <>
                                            {fillPlaceholders(
                                                t("scout_import_autoFetchUnavailable"),
                                                { source: label },
                                            )}{" "}
                                            {t(scoutBlockedKey(status.reason))}
                                        </>
                                    )}
                                </li>
                            )
                        })}
                    </ul>

                    <div className="scout-import-chips">
                        <span className="scout-entry-label">{t("scout_import_modeLabel")}</span>
                        {importModes.map((mode) => (
                            <span
                                key={mode}
                                className={
                                    mode === "manual_paste"
                                        ? "scout-chip scout-chip-high"
                                        : "scout-chip"
                                }
                            >
                                {t(scoutImportModeKey(mode))}
                            </span>
                        ))}
                    </div>
                </details>
            </section>

            {/* ----------------------------------------------------- 4. paste */}
            <section className="scout-import-step">
                <h4 className="scout-import-step-title">{t("scout_import_step_paste")}</h4>

                {/* Answers "where do I get the table?" BEFORE the paste; in the
                    preview it would arrive too late. */}
                <p className="muted">{t("scout_import_opggHowTo")}</p>

                <label className="scout-field-label" htmlFor="scout-import-paste">
                    {t("scout_import_pasteLabel")}
                </label>
                <textarea
                    id="scout-import-paste"
                    className="scout-textarea"
                    value={pasteText}
                    rows={8}
                    spellCheck={false}
                    placeholder={t("scout_import_pastePlaceholder")}
                    onChange={(event) => handlePasteChange(event.target.value)}
                />
                <p className="scout-import-hint">{t("scout_import_pasteHint")}</p>

                <div className="scout-button-row">
                    <button
                        type="button"
                        className="scout-primary-button"
                        disabled={!canParse}
                        onClick={handleParse}
                    >
                        {t("scout_import_parseButton")}
                    </button>
                    <button type="button" className="secondary-button" onClick={handleClearPaste}>
                        {t("scout_import_clearButton")}
                    </button>
                    <button type="button" className="secondary-button" onClick={handleInsertExample}>
                        {t("scout_import_exampleButton")}
                    </button>
                </div>

                {showExampleHint && (
                    <p className="scout-example-hint">{t("scout_import_exampleHint")}</p>
                )}
                {/* Same demand as in the role step, repeated where the disabled
                    button is — but without a second `role="alert"`, so a screen
                    reader announces it once rather than twice. */}
                {!canParse && <p className="scout-error">{t("scout_import_roleRequired")}</p>}
            </section>

            {/* --------------------------------------------------- 5. preview */}
            {result !== null && (
                <section className="scout-import-step">
                    <h4 className="scout-import-step-title">{t("scout_import_step_preview")}</h4>
                    <h5 className="scout-import-block-title">{t("scout_import_previewTitle")}</h5>
                    <p className="scout-import-hint">{t("scout_import_previewHint")}</p>

                    <div className="scout-counts">
                        <span className="scout-count">
                            {translateCount(t, "scout_import_rowsDetected", rows.length)}
                        </span>
                        <span className="scout-count">
                            {t("scout_import_layoutLabel")}: {t(scoutImportLayoutKey(result.layout))}
                        </span>
                        {result.columns.length > 0 && (
                            <span className="scout-count">
                                {fillPlaceholders(t("scout_import_columnsDetected"), {
                                    columns: formatImportColumns(t, result.columns),
                                })}
                            </span>
                        )}
                    </div>

                    {/* The raw OP.GG copy, said out loud above the preview:
                        what was recognised and why the role is the one from
                        step 2. What was SKIPPED is stated ONCE, in the skip
                        summary further down — that summary is layout-independent
                        and covers all four skipped categories, so repeating two
                        of them here would print the same sentence twice. It only
                        DESCRIBES the same single preview below — there is no
                        second table and no second apply path for this layout,
                        and the row selection is untouched by it. */}
                    {isOpggRaw && (
                        <div className="scout-import-block">
                            <h5 className="scout-import-block-title">
                                {t("scout_import_opggRawDetected")}
                            </h5>
                            <p>{scoutPluralMessage(t, rows.length, SCOUT_IMPORT_OPGG_CHAMPIONS_KEYS)}</p>
                            {/* The OP.GG list names no reliable role per
                                champion, so the selected role is what every
                                applied row gets — stated here rather than left
                                for the user to infer from the role column. */}
                            <p className="muted">{t("scout_import_opggRawRoleNote")}</p>
                        </div>
                    )}

                    {resultWarnings.length > 0 && (
                        <ul className="scout-warning-list">
                            {resultWarnings.map((warning, index) => (
                                <li
                                    key={`${warning.code}-${index}`}
                                    className={`scout-warning scout-warning-${warning.severity}`}
                                >
                                    <span aria-hidden="true" className="scout-warning-icon">
                                        {warning.severity === "info" ? "i" : "!"}
                                    </span>
                                    <span>{translateScoutImportWarning(t, warning)}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {rows.length === 0 ? (
                        <p className="scout-nodata">{t("scout_import_previewEmpty")}</p>
                    ) : (
                        <>
                            <div className="scout-button-row">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={handleSelectAll}
                                >
                                    {t("scout_import_selectAll")}
                                </button>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={handleSelectNone}
                                >
                                    {t("scout_import_selectNone")}
                                </button>
                            </div>

                            <div className="scout-import-table-wrap">
                                <table className="scout-import-table">
                                    <thead>
                                        <tr>
                                            <th className="scout-import-table-check" scope="col">
                                                {t("scout_import_rowInclude")}
                                            </th>
                                            <th scope="col">{t("scout_import_column_champion")}</th>
                                            <th scope="col">{t("scout_import_column_role")}</th>
                                            <th scope="col">{t("scout_import_column_games")}</th>
                                            <th scope="col">{t("scout_import_column_winrate")}</th>
                                            <th scope="col">{t("scout_import_column_kda")}</th>
                                            <th scope="col">{t("scout_import_sourceLabel")}</th>
                                            <th scope="col">{t("scout_import_confidenceLabel")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => {
                                            const applicable = isImportRowApplicable(row)
                                            const checkboxId = `scout-import-row-${row.id}`
                                            // Exactly the string that will be stored as
                                            // `ManualChampionEntry.note` — the preview shows
                                            // the note, not the raw paste line. Empty when the
                                            // paste carried none of these metrics.
                                            const note = buildImportNote(row)
                                            // Hoisted and narrowed here rather than inline in the
                                            // JSX: TypeScript 7 was seen failing to carry a
                                            // `selectedRole !== null` narrowing across the JSX
                                            // boundary on a cold run, and a local makes the
                                            // narrowing local too.
                                            const appliedRoleLabel =
                                                selectedRole === null
                                                    ? null
                                                    : t(scoutRoleKey(selectedRole))
                                            return (
                                                <tr
                                                    key={row.id}
                                                    className={
                                                        applicable ? undefined : "scout-import-row-blocked"
                                                    }
                                                >
                                                    <td>
                                                        <input
                                                            id={checkboxId}
                                                            type="checkbox"
                                                            checked={selectedIds.has(row.id)}
                                                            // A row without games or winrate can
                                                            // never become an entry — the box is
                                                            // disabled rather than silently ignored
                                                            // on apply.
                                                            disabled={!applicable}
                                                            aria-label={t("scout_import_rowInclude")}
                                                            onChange={(event) =>
                                                                toggleRow(row.id, event.target.checked)
                                                            }
                                                        />
                                                    </td>
                                                    <td>
                                                        <span className="scout-import-champion">
                                                            {row.championName}
                                                        </span>
                                                        {!row.championResolved && (
                                                            <div className="scout-error">
                                                                {t("scout_import_row_unknownChampion")}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {/*
                                                          Only rendered when it
                                                          says something new.
                                                          Step 2 already states
                                                          the role once, so
                                                          repeating it on all 40
                                                          rows was pure noise;
                                                          next to a contradicting
                                                          source it is the whole
                                                          point.

                                                          The `selectedRole !==
                                                          null` guard is not
                                                          defensive padding: the
                                                          role can be cleared
                                                          while a parsed preview
                                                          is still on screen, and
                                                          `fillPlaceholders`
                                                          turns the missing param
                                                          into "", so every row
                                                          used to read
                                                          "Wird uebernommen als:"
                                                          with a dangling colon.
                                                        */}
                                                        {appliedRoleLabel !== null &&
                                                            row.detectedRole !== "unknown" &&
                                                            row.detectedRole !== selectedRole && (
                                                                <span className="scout-import-applied-role">
                                                                    {fillPlaceholders(
                                                                        t("scout_import_row_appliedRole"),
                                                                        { role: appliedRoleLabel },
                                                                    )}
                                                                </span>
                                                            )}
                                                        {/* The selection wins; the source is
                                                            contradicted out loud, not behind the
                                                            user's back. */}
                                                        {row.detectedRole !== "unknown" &&
                                                            row.detectedRole !== selectedRole && (
                                                            <div className="scout-import-rolemismatch">
                                                                {fillPlaceholders(
                                                                    t("scout_import_row_detectedRole"),
                                                                    {
                                                                        role: t(
                                                                            scoutRoleKey(row.detectedRole),
                                                                        ),
                                                                    },
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td
                                                        className={
                                                            row.games === null
                                                                ? "scout-import-cell-missing"
                                                                : undefined
                                                        }
                                                    >
                                                        {importValueLabel(t, row.games)}
                                                    </td>
                                                    <td
                                                        className={
                                                            row.winrate === null
                                                                ? "scout-import-cell-missing"
                                                                : undefined
                                                        }
                                                    >
                                                        {importValueLabel(t, row.winrate, "%")}
                                                    </td>
                                                    <td
                                                        className={
                                                            row.kda === null
                                                                ? "scout-import-cell-missing"
                                                                : undefined
                                                        }
                                                    >
                                                        {importValueLabel(t, row.kda)}
                                                        {/* The column is "KDA / note": what
                                                            lands here is what gets SAVED, so
                                                            CS/min, KP and DMG become visible
                                                            instead of only stored. The raw
                                                            line is not repeated per row — a
                                                            line the parser refused is listed
                                                            verbatim under `unparsedLines`. */}
                                                        {note !== "" && (
                                                            <div className="scout-import-cell-note muted">
                                                                {note}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>{previewSourceLabel}</td>
                                                    <td>
                                                        <span
                                                            className={`scout-chip scout-chip-${row.confidence}`}
                                                        >
                                                            {t(scoutConfidenceKey(row.confidence))}
                                                        </span>
                                                        {row.warnings.length > 0 && (
                                                            <ul className="scout-import-row-warnings">
                                                                {row.warnings.map((warning, index) => (
                                                                    <li
                                                                        key={`${warning.code}-${index}`}
                                                                        className={`scout-warning scout-warning-${warning.severity}`}
                                                                    >
                                                                        <span>
                                                                            {translateScoutImportWarning(
                                                                                t,
                                                                                warning,
                                                                            )}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* NOTHING IS SWALLOWED — but a raw OP.GG copy floods this
                        block with dozens of `-`, `vs …` and "Alle Champions"
                        lines, and printing each one buried the handful that
                        actually deserve a look. So: a NUMBER for each category
                        the parser recognised positively, the verbatim list for
                        everything it could not categorise, and the counted lines
                        still reachable behind a collapsed <details>. The numbers
                        are the "word" rule (A) demands; nothing is hidden. */}
                    {skipSummary !== null && skipSummary.hasSkipped && (
                        <div className="scout-import-block">
                            <h5 className="scout-import-block-title">
                                {t("scout_import_skippedTitle")}
                            </h5>

                            {/* No count for the aggregate row: there is at most
                                one, and "1 Summenzeile" reads worse than the
                                sentence that names it. */}
                            {skipSummary.aggregateRows > 0 && (
                                <p className="scout-import-hint">
                                    {t("scout_import_skippedAggregate")}
                                </p>
                            )}
                            {skipSummary.matchupRows > 0 && (
                                <p className="scout-import-hint">
                                    {scoutPluralMessage(
                                        t,
                                        skipSummary.matchupRows,
                                        SCOUT_IMPORT_SKIPPED_MATCHUPS_KEYS,
                                    )}
                                </p>
                            )}
                            {skipSummary.recommendedChampions > 0 && (
                                <p className="scout-import-hint">
                                    {scoutPluralMessage(
                                        t,
                                        skipSummary.recommendedChampions,
                                        SCOUT_IMPORT_SKIPPED_RECOMMENDED_KEYS,
                                    )}
                                </p>
                            )}
                            {/* NO NUMBER HERE, ON PURPOSE — do not "fix" this back
                                into a translateCount().

                                `pageNoise` counts a separator only where it sits at
                                a block-START position; the same `-` inside a
                                champion block, inside a `vs` block, in the
                                recommendation strip, in the aggregate range or
                                between the two name lines is consumed by the parser
                                without ever reaching the counter. A paste with 15
                                separator lines therefore reported "1". No datum is
                                lost by that (none of these lines carries one), but
                                the sentence WAS claiming a quantity that was not the
                                quantity of hidden lines — and in a module whose first
                                rule is "never assert what is not true", that is the
                                wrong kind of error.

                                Completing the counter would mean booking every single
                                consumed separator individually — exactly the
                                bookkeeping whose flood this panel was cleaned up to
                                lose. An honest sentence without a number beats a
                                wrong number, so `scout_import_skippedNoise` carries
                                no {count} placeholder any more and is rendered with
                                plain t(). The count still GATES the sentence: it is
                                shown only when the parser saw such lines at all.

                                The three counters above are untouched — their numbers
                                are complete (see summarizeSkippedLines()). */}
                            {skipSummary.pageNoise > 0 && (
                                <p className="scout-import-hint">
                                    {t("scout_import_skippedNoise")}
                                </p>
                            )}

                            {/* The lines the parser could NOT categorise. Each of
                                them means "something here looked like data and
                                did not become data", so only the user can judge
                                whether a champion is hiding in it — they stay
                                verbatim, exactly as before. */}
                            {skipSummary.listed.length > 0 && (
                                <>
                                    <p className="scout-import-hint">
                                        {t("scout_import_unparsedHint")}
                                    </p>
                                    <ul className="scout-import-unparsed-list">
                                        {skipSummary.listed.map((line, index) => (
                                            <li key={`${line.reason}-${index}`}>
                                                <code>{line.raw}</code>
                                                <span className="muted">
                                                    {" "}
                                                    · {t(scoutImportUnparsedKey(line.reason))}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}

                            {/* Closed by default — getting these out of the way
                                is the whole point. Still one click away, so the
                                counted lines are summarised and never lost. */}
                            {countedSkipLines.length > 0 && (
                                <details className="scout-details scout-import-skipped-details">
                                    <summary>{t("scout_import_skippedDetails")}</summary>
                                    <ul className="scout-import-unparsed-list">
                                        {countedSkipLines.map((line, index) => (
                                            <li key={`${line.reason}-${index}`}>
                                                <code>{line.raw}</code>
                                                <span className="muted">
                                                    {" "}
                                                    · {t(scoutImportUnparsedKey(line.reason))}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}

                    {/* ------------------------------------------------ apply */}
                    {/* FOUR STACKED BLOCKS, one statement each: the mode select ·
                        what the mode does · the button · the outcome.

                        The one thing that genuinely did not sit in a block of
                        its own was the OUTCOME: it was a <span> inside
                        `.scout-button-row`, so it rendered beside the button
                        instead of under it — and that is the row where the two
                        contradicting messages appeared next to each other. It
                        is a <p> in its own block now. The rest of the step was
                        already spaced (`.scout-button-row` has `gap: 8px`) and
                        is only grouped here, not respaced. */}
                    <div className="scout-import-apply-row scout-import-apply">
                        <div className="scout-import-fields">
                            <div className="scout-import-field">
                                <label
                                    className="scout-entry-label"
                                    htmlFor="scout-import-applymode"
                                >
                                    {t("scout_import_applyModeLabel")}
                                </label>
                                <select
                                    id="scout-import-applymode"
                                    value={applyMode}
                                    onChange={(event) => handleApplyModeChange(event.target.value)}
                                >
                                    <option value="append">
                                        {t("scout_import_applyMode_append")}
                                    </option>
                                    <option value="replace">
                                        {t("scout_import_applyMode_replace")}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <p className="scout-import-hint">{t("scout_import_applyModeHint")}</p>

                        <div className="scout-button-row">
                            <button
                                type="button"
                                className="scout-primary-button"
                                disabled={!canApply}
                                onClick={handleApply}
                            >
                                {t("scout_import_applyButton")}
                            </button>
                        </div>

                        {/* EXACTLY ONE of the two, decided in ONE place. Two
                            independent conditions are what put "Übernahme
                            gesperrt" next to "Übernommen: 72 Zeilen" — see
                            resolveApplyStatus() for why `applied` wins the tie
                            and why that is not a message being swallowed. */}
                        {applyStatus.kind === "blocked" && (
                            <p className="scout-error scout-import-apply-status" role="alert">
                                {t("scout_import_applyBlocked")}
                            </p>
                        )}
                        {applyStatus.kind === "applied" && (
                            <p
                                className="scout-import-status scout-import-apply-status"
                                role="status"
                            >
                                {scoutPluralMessage(
                                    t,
                                    applyStatus.count,
                                    SCOUT_IMPORT_APPLIED_KEYS,
                                )}
                            </p>
                        )}
                    </div>
                </section>
            )}
        </div>
    )
}
