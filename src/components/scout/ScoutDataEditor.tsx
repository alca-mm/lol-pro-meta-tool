/**
 * Scout data editor for one player: the manual champion rows plus the free
 * player note.
 *
 * VALIDATION IS THE POINT OF THIS FILE. `normalizeManualEntry()` in
 * src/scout/storage.ts drops a row *silently* when `championName` is empty,
 * `games` is non-finite or negative, or `winrate` leaves 0–100 — and it does
 * that on **load**, long after the user watched their input look saved. So this
 * editor is the gate: an invalid number never reaches the parent state at all.
 * It stays in the row's local draft, the field is `aria-invalid`, a translated
 * hint says what to type *while* the user types, and the last committed value
 * comes back on blur. Nothing is clamped — a winrate quietly pulled up to 100
 * would change a ban priority and nobody would ever see it happen.
 *
 * ROLE: every row carries the role its numbers were recorded on. Two different
 * roles reach this editor and they must not be confused. `defaultRole` is the
 * role a *new* row starts on — a pre-selection that saves a click, and it may
 * well be the role the parser only *guessed* for the player. `lineupRole` is
 * the starting slot the player really holds, set only for the five starters.
 * The inline mismatch hint is fed from `lineupRole` alone: a row that disagrees
 * with a real slot says so, because the analysis marks that signal down
 * (`offrole_signal` / `role_unknown_or_flex`) — worth knowing while typing, not
 * only in the finished ban plan. For a substitute or a pool player the row stays
 * silent; there is no lineup position to contradict, saying "fielded as Jungle"
 * would claim a slot that does not exist, and the analysis does not mark such a
 * player down either.
 */

import { useState } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type {
    ManualChampionEntry,
    ScoutLineupSlot,
    ScoutManualSource,
    ScoutPlayerId,
    ScoutRecency,
    ScoutRole,
} from "../../scout/types"
import {
    CHAMPION_DATALIST_ID,
    SCOUT_MANUAL_SOURCE_VALUES,
    SCOUT_RECENCY_VALUES,
    SCOUT_ROLE_VALUES,
    type ScoutTranslate,
    createEntryId,
    fillPlaceholders,
    parseGamesInput,
    parseWinrateInput,
    scoutRecencyKey,
    scoutRoleKey,
    scoutSourceKey,
} from "./scoutUiHelpers"

/**
 * The numbers a fresh row starts with — and therefore the baseline for "has the
 * user actually put anything into this row?" (see {@link isManualEntryFilled}).
 */
export const NEW_ENTRY_GAMES = 0
export const NEW_ENTRY_WINRATE = 50

/**
 * A fresh champion row. `role` starts on `defaultRole`, so the common case
 * needs no extra click; a pre-selected role is only an offer the user can
 * change, which is why the parser's guess is good enough for it. Without one
 * the row is honestly `"unknown"` — the analysis lowers the confidence of an
 * unknown-role signal instead of pretending it fits a lane nobody confirmed.
 */
export function createManualEntry(defaultRole?: ScoutRole): ManualChampionEntry {
    return {
        id: createEntryId(),
        championName: "",
        games: NEW_ENTRY_GAMES,
        winrate: NEW_ENTRY_WINRATE,
        note: "",
        source: "manual",
        recency: "current",
        role: defaultRole ?? "unknown",
    }
}

/**
 * Does this row carry anything the user would miss? Asked before removing it —
 * a filled row must not vanish on a mis-click, an untouched one must not nag.
 */
export function isManualEntryFilled(entry: ManualChampionEntry): boolean {
    return (
        entry.championName.trim().length > 0 ||
        entry.games !== NEW_ENTRY_GAMES ||
        entry.winrate !== NEW_ENTRY_WINRATE ||
        entry.note.trim().length > 0
    )
}

/**
 * Why the role of a row matters, in the user's language. Only produced when the
 * row's role disagrees with a starting slot the player *really holds* — exactly
 * the case the analysis marks down.
 *
 * `lineupRole` is a {@link ScoutLineupSlot}, never a plain `ScoutRole`, and that
 * is the whole point: the wording ("fielded as …") asserts an actual lineup
 * position, so a role that was merely guessed for the player must not be able to
 * reach this function. For a substitute or a pool player the caller passes
 * `undefined` and the answer is `null`. `null` whenever there is nothing to say.
 */
export function roleMismatchHint(
    t: ScoutTranslate,
    entryRole: ScoutRole,
    lineupRole: ScoutLineupSlot | undefined,
): string | null {
    if (lineupRole === undefined) return null
    if (entryRole === lineupRole) return null
    const key =
        entryRole === "unknown" ? "scout_reason_role_unknown_or_flex" : "scout_reason_offrole_signal"
    return fillPlaceholders(t(key), {
        signalRole: t(scoutRoleKey(entryRole)),
        lineupRole: t(scoutRoleKey(lineupRole)),
    })
}

interface EditorProps {
    playerId: ScoutPlayerId
    entries: readonly ManualChampionEntry[]
    note: string
    /**
     * The role a *new* row starts on. May be the role the parser guessed for the
     * player — a pre-selection is an offer, not a claim about the lineup.
     */
    defaultRole?: ScoutRole
    /**
     * The player's actual starting slot — set ONLY when they hold one of the
     * five starting positions. Drives the role hint of a row.
     */
    lineupRole?: ScoutLineupSlot
    onEntriesChange: (entries: ManualChampionEntry[]) => void
    onNoteChange: (note: string) => void
}

export function ScoutDataEditor({
    playerId,
    entries,
    note,
    defaultRole,
    lineupRole,
    onEntriesChange,
    onNoteChange,
}: EditorProps) {
    const { t } = useTranslation()

    function updateEntry(index: number, next: ManualChampionEntry) {
        onEntriesChange(entries.map((entry, i) => (i === index ? next : entry)))
    }

    function removeEntry(index: number) {
        onEntriesChange(entries.filter((_entry, i) => i !== index))
    }

    function addEntry() {
        onEntriesChange([...entries, createManualEntry(defaultRole)])
    }

    return (
        <div className="scout-data-editor">
            <h4 className="scout-subheading">{t("scout_manualTitle")}</h4>
            <p className="muted">{t("scout_manualHint")}</p>

            {entries.length === 0 ? (
                <p className="scout-nodata">{t("scout_manual_empty")}</p>
            ) : (
                <ul className="scout-entry-list">
                    {entries.map((entry, index) => (
                        <ScoutEntryRow
                            key={entry.id ?? `row-${index}`}
                            entry={entry}
                            lineupRole={lineupRole}
                            onChange={(next) => updateEntry(index, next)}
                            onRemove={() => removeEntry(index)}
                        />
                    ))}
                </ul>
            )}

            <div className="scout-button-row">
                <button type="button" className="secondary-button" onClick={addEntry}>
                    {t("scout_manual_add")}
                </button>
            </div>

            <label className="scout-field-label" htmlFor={`scout-note-${playerId}`}>
                {t("scout_manual_note")}
            </label>
            <textarea
                id={`scout-note-${playerId}`}
                className="scout-textarea scout-textarea-small"
                rows={2}
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
            />
        </div>
    )
}

interface RowProps {
    entry: ManualChampionEntry
    /** See {@link EditorProps.lineupRole} — a real starting slot or nothing. */
    lineupRole?: ScoutLineupSlot
    onChange: (next: ManualChampionEntry) => void
    onRemove: () => void
}

/**
 * One champion row. `games` / `winrate` live twice: as the committed number in
 * `entry` and as the in-progress text in local state. Only a value that passes
 * the parser is written back up — everything else stays here, visible and
 * flagged, so the storage layer never gets a chance to drop the row.
 */
function ScoutEntryRow({ entry, lineupRole, onChange, onRemove }: RowProps) {
    const { t } = useTranslation()
    const [gamesText, setGamesText] = useState(() => String(entry.games))
    const [winrateText, setWinrateText] = useState(() => String(entry.winrate))
    const [committed, setCommitted] = useState({ games: entry.games, winrate: entry.winrate })
    const [championTouched, setChampionTouched] = useState(false)
    /** Only used when a persisted row predates entry ids — see `withEntryIds()`. */
    const [fallbackId] = useState(createEntryId)

    // The drafts are derived state: when the committed numbers change from the
    // *outside* (state reload, restored archive) they must follow, or the row
    // shows numbers that are no longer stored. Adjusting state during render is
    // React's documented pattern for this; our own commits update `committed`
    // themselves, so typing never trips this branch.
    if (committed.games !== entry.games || committed.winrate !== entry.winrate) {
        if (committed.games !== entry.games) setGamesText(String(entry.games))
        if (committed.winrate !== entry.winrate) setWinrateText(String(entry.winrate))
        setCommitted({ games: entry.games, winrate: entry.winrate })
    }

    const rowId = entry.id ?? fallbackId
    const championErrorId = `${rowId}-champion-error`
    const gamesErrorId = `${rowId}-games-error`
    const winrateErrorId = `${rowId}-winrate-error`
    const roleHintId = `${rowId}-role-hint`

    const gamesValid = parseGamesInput(gamesText) !== null
    const winrateValid = parseWinrateInput(winrateText) !== null
    // An empty champion name is dropped by the loader just as hard as a broken
    // number, so it is flagged and explained — but only once the user left the
    // field or put data into the row, so a fresh row is never born red.
    const championInvalid =
        entry.championName.trim().length === 0 && (championTouched || isManualEntryFilled(entry))
    const roleHint = roleMismatchHint(t, entry.role, lineupRole)

    function handleGames(value: string) {
        setGamesText(value)
        const parsed = parseGamesInput(value)
        if (parsed === null) return
        setCommitted({ games: parsed, winrate: entry.winrate })
        onChange({ ...entry, games: parsed })
    }

    function handleWinrate(value: string) {
        setWinrateText(value)
        const parsed = parseWinrateInput(value)
        if (parsed === null) return
        setCommitted({ games: entry.games, winrate: parsed })
        onChange({ ...entry, winrate: parsed })
    }

    function handleRemove() {
        if (isManualEntryFilled(entry)) {
            const champion = entry.championName.trim()
            const confirmText = t("scout_manual_removeConfirm")
            const question =
                champion.length > 0 ? `${champion}

${confirmText}` : confirmText
            if (!window.confirm(question)) return
        }
        onRemove()
    }

    return (
        <li className="scout-entry-row">
            <div className="scout-entry-field scout-entry-champion">
                <span className="scout-entry-label">{t("scout_manual_champion")}</span>
                <input
                    type="text"
                    list={CHAMPION_DATALIST_ID}
                    value={entry.championName}
                    aria-label={t("scout_manual_champion")}
                    aria-invalid={championInvalid}
                    aria-describedby={championInvalid ? championErrorId : undefined}
                    className={championInvalid ? "scout-input-invalid" : undefined}
                    onChange={(event) => onChange({ ...entry, championName: event.target.value })}
                    onBlur={() => setChampionTouched(true)}
                />
            </div>

            <div className="scout-entry-field scout-entry-number">
                <span className="scout-entry-label">{t("scout_manual_games")}</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={gamesText}
                    aria-label={t("scout_manual_games")}
                    aria-invalid={!gamesValid}
                    aria-describedby={gamesValid ? undefined : gamesErrorId}
                    className={gamesValid ? undefined : "scout-input-invalid"}
                    placeholder={t("scout_manual_gamesPlaceholder")}
                    onChange={(event) => handleGames(event.target.value)}
                    onBlur={() => {
                        if (!gamesValid) setGamesText(String(entry.games))
                    }}
                />
            </div>

            <div className="scout-entry-field scout-entry-number">
                <span className="scout-entry-label">{t("scout_manual_winrate")} %</span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={winrateText}
                    aria-label={t("scout_manual_winrate")}
                    aria-invalid={!winrateValid}
                    aria-describedby={winrateValid ? undefined : winrateErrorId}
                    className={winrateValid ? undefined : "scout-input-invalid"}
                    placeholder={t("scout_manual_winratePlaceholder")}
                    onChange={(event) => handleWinrate(event.target.value)}
                    onBlur={() => {
                        if (!winrateValid) setWinrateText(String(entry.winrate))
                    }}
                />
            </div>

            <div className="scout-entry-field">
                <span className="scout-entry-label" title={roleHint ?? undefined}>
                    {t("scout_manual_role")}
                </span>
                <select
                    value={entry.role}
                    aria-label={t("scout_manual_role")}
                    aria-describedby={roleHint === null ? undefined : roleHintId}
                    title={roleHint ?? undefined}
                    onChange={(event) => onChange({ ...entry, role: event.target.value as ScoutRole })}
                >
                    {SCOUT_ROLE_VALUES.map((role) => (
                        <option key={role} value={role}>
                            {t(scoutRoleKey(role))}
                        </option>
                    ))}
                </select>
            </div>

            <div className="scout-entry-field">
                <span className="scout-entry-label">{t("scout_manual_source")}</span>
                <select
                    value={entry.source}
                    aria-label={t("scout_manual_source")}
                    onChange={(event) =>
                        onChange({ ...entry, source: event.target.value as ScoutManualSource })
                    }
                >
                    {SCOUT_MANUAL_SOURCE_VALUES.map((source) => (
                        <option key={source} value={source}>
                            {t(scoutSourceKey(source))}
                        </option>
                    ))}
                </select>
            </div>

            <div className="scout-entry-field">
                <span className="scout-entry-label" title={t("scout_manual_recencyHint")}>
                    {t("scout_manual_recency")}
                </span>
                <select
                    value={entry.recency}
                    aria-label={t("scout_manual_recency")}
                    title={t("scout_manual_recencyHint")}
                    onChange={(event) =>
                        onChange({ ...entry, recency: event.target.value as ScoutRecency })
                    }
                >
                    {SCOUT_RECENCY_VALUES.map((recency) => (
                        <option key={recency} value={recency}>
                            {t(scoutRecencyKey(recency))}
                        </option>
                    ))}
                </select>
            </div>

            <div className="scout-entry-field scout-entry-note">
                <span className="scout-entry-label">{t("scout_manual_note")}</span>
                <input
                    type="text"
                    value={entry.note}
                    aria-label={t("scout_manual_note")}
                    onChange={(event) => onChange({ ...entry, note: event.target.value })}
                />
            </div>

            <button
                type="button"
                className="btn-close scout-entry-remove"
                aria-label={t("scout_manual_remove")}
                title={t("scout_manual_remove")}
                onClick={handleRemove}
            >
                ×
            </button>

            {/* Hints last, so they wrap onto their own line of the flex row
                instead of pushing the fields around. */}
            {championInvalid ? (
                <p className="scout-error" id={championErrorId}>
                    {t("scout_manual_championInvalid")}
                </p>
            ) : null}
            {gamesValid ? null : (
                <p className="scout-error" id={gamesErrorId}>
                    {t("scout_manual_gamesInvalid")}
                </p>
            )}
            {winrateValid ? null : (
                <p className="scout-error" id={winrateErrorId}>
                    {t("scout_manual_winrateInvalid")}
                </p>
            )}
            {roleHint === null ? null : (
                <p className="muted" id={roleHintId}>
                    {roleHint}
                </p>
            )}
        </li>
    )
}
