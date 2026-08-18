/**
 * One recognised opponent: identity, editable role, the four source links with
 * their honest status, and the scout data editor for that player.
 *
 * `ScoutSourceRef.note` is a developer note and is deliberately NOT rendered —
 * `noteCode` carries the translatable counterpart.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import { canFetchInBrowser, getDirectFetchInfo } from "../../scout/sources"
import type {
    ManualChampionEntry,
    ScoutLineupMembership,
    ScoutLineupSlot,
    ScoutPlayer,
    ScoutRole,
    ScoutSourceRef,
} from "../../scout/types"
import { ScoutDataEditor } from "./ScoutDataEditor"
import {
    SCOUT_ROLE_VALUES,
    fillPlaceholders,
    scoutBlockedKey,
    scoutMembershipKey,
    scoutNoteKey,
    scoutRoleKey,
    scoutSourceKey,
    scoutStatusKey,
} from "./scoutUiHelpers"

interface Props {
    player: ScoutPlayer
    entries: readonly ManualChampionEntry[]
    note: string
    /**
     * Role a *new* manual row starts with — nothing else. The container always
     * supplies it (`defaultRoleForPlayer`), which is why there is no fallback
     * here: a second source for the same value would only invite the two to
     * drift apart. Its value may well be the parser's guess, and for a starting
     * row that is fine — the user edits the row anyway.
     */
    defaultRole: ScoutRole
    /**
     * The player's *actual* starting slot — set ONLY while they hold one of the
     * five starting seats, `undefined` otherwise. Drives the role hint on a
     * manual row, which is a statement about the declared lineup; feeding
     * `player.role` in here would turn the parser's guess into that statement.
     * Deliberately narrower than `ScoutRole` so it cannot be done by accident.
     */
    lineupRole?: ScoutLineupSlot
    /** Where this player stands — drives the badge next to their name only. */
    membership?: ScoutLineupMembership
    onRoleChange: (role: ScoutRole) => void
    onEntriesChange: (entries: ManualChampionEntry[]) => void
    onNoteChange: (note: string) => void
    onRemove: () => void
}

export function ScoutPlayerCard({
    player,
    entries,
    note,
    defaultRole,
    lineupRole,
    membership,
    onRoleChange,
    onEntriesChange,
    onNoteChange,
    onRemove,
}: Props) {
    const { t } = useTranslation()

    return (
        <article className="scout-panel scout-player-card">
            <header className="scout-player-head">
                <div className="scout-player-identity">
                    <span className="scout-entry-label">{t("scout_player_riotId")}</span>
                    <strong className="scout-player-name">{player.displayName}</strong>
                    {membership !== undefined && membership !== "unassigned" && (
                        <span className={`scout-chip scout-membership-${membership}`}>
                            {t(scoutMembershipKey(membership))}
                        </span>
                    )}
                </div>
                <div className="scout-player-identity">
                    <span className="scout-entry-label">{t("scout_player_region")}</span>
                    <span>{player.region}</span>
                </div>
                <div className="scout-player-identity">
                    <label className="scout-entry-label" htmlFor={`scout-role-${player.id}`}>
                        {t("scout_player_role")}
                    </label>
                    <select
                        id={`scout-role-${player.id}`}
                        value={player.role}
                        onChange={(event) => onRoleChange(event.target.value as ScoutRole)}
                    >
                        {SCOUT_ROLE_VALUES.map((role) => (
                            <option key={role} value={role}>
                                {t(scoutRoleKey(role))}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    className="secondary-button scout-player-remove"
                    onClick={onRemove}
                >
                    {t("scout_player_remove")}
                </button>
            </header>

            <section className="scout-sources">
                <h4 className="scout-subheading">{t("scout_player_sources")}</h4>
                {player.sources.length === 0 ? (
                    <p className="scout-nodata">{t("scout_player_noSources")}</p>
                ) : (
                    <ul className="scout-source-list">
                        {player.sources.map((source) => (
                            <ScoutSourceItem key={source.kind} source={source} />
                        ))}
                    </ul>
                )}
            </section>

            <ScoutDataEditor
                playerId={player.id}
                entries={entries}
                note={note}
                defaultRole={defaultRole}
                lineupRole={lineupRole}
                onEntriesChange={onEntriesChange}
                onNoteChange={onNoteChange}
            />
        </article>
    )
}

function ScoutSourceItem({ source }: { source: ScoutSourceRef }) {
    const { t } = useTranslation()
    const label = t(scoutSourceKey(source.kind))
    const openLabel = fillPlaceholders(t("scout_player_openSource"), { source: label })
    const fetchInfo = getDirectFetchInfo(source.kind)

    return (
        <li className={`scout-source scout-source-${source.status}`}>
            <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                title={openLabel}
                aria-label={openLabel}
                className="scout-source-link"
            >
                {label}
            </a>
            <span className="scout-source-status">{t(scoutStatusKey(source.status))}</span>
            {source.noteCode && (
                <span className="muted scout-source-note">{t(scoutNoteKey(source.noteCode))}</span>
            )}
            {!canFetchInBrowser(source.kind) && (
                <span className="muted scout-source-note">{t(scoutBlockedKey(fetchInfo.reason))}</span>
            )}
        </li>
    )
}
