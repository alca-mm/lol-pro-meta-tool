import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { TeamMembersPanel } from "./TeamMembersPanel"
import { TeamInvitePanel } from "./TeamInvitePanel"
import { TeamCreatePanel } from "./TeamCreatePanel"
import { TeamDangerZone } from "./TeamDangerZone"
import { RiotAccountSummary } from "./RiotAccountSummary"
import { pluralMessage, TEAM_MEMBER_COUNT_KEYS, TEAM_NOTE_COUNT_KEYS } from "./teamUiHelpers"

interface Props {
    onGoToPlayerResults?: () => void
}

export function TeamDashboard({ onGoToPlayerResults }: Props = {}) {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { activeTeam, teams, myRole, members, notesCount, loading, setActiveTeam } = useTeam()

    if (!user) return null
    if (loading) return <p className="inline-loading">{t("common_loading")}</p>

    const roleLabels: Record<string, string> = {
        owner: t("team_owner"),
        admin: t("team_admin"),
        player: t("team_player"),
    }
    const myRoleLabel = myRole ? (roleLabels[myRole] ?? myRole) : null

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* ── Header card ────────────────────────────────── */}
            <div className="section-card">
                <div className="panel-header">
                    <div>
                        <span className="section-title">{t("team_dashboard")}</span>
                        {activeTeam ? (
                            <p style={{ margin: "0.15rem 0 0", fontSize: "1rem", fontWeight: 600 }}>
                                {activeTeam.name}
                            </p>
                        ) : (
                            <p className="muted section-subtitle">{t("team_noTeam")}</p>
                        )}
                    </div>

                    {(myRoleLabel || teams.length > 1) && (
                        <div className="button-row" style={{ marginTop: 0 }}>
                            {myRoleLabel && (
                                <span className="muted" style={{ fontSize: "0.8rem" }}>
                                    {t("team_yourRole")}:{" "}
                                    <strong style={{ color: "var(--text)" }}>{myRoleLabel}</strong>
                                </span>
                            )}
                            {teams.length > 1 && (
                                <select
                                    value={activeTeam?.id ?? ""}
                                    onChange={(e) => setActiveTeam(e.target.value)}
                                    style={{ maxWidth: "12rem" }}
                                >
                                    {teams.map((team) => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                </div>

                {activeTeam && (
                    <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                        {/* Counted strings go through pluralMessage: a bare
                            number in front of a fixed plural noun rendered
                            "1 Mitglieder" / "1 Champion-Notizen" for a solo
                            team. See src/components/team/teamUiHelpers.ts. */}
                        {pluralMessage(t, members.length, TEAM_MEMBER_COUNT_KEYS)}
                        {notesCount > 0 && (
                            <> &middot; {pluralMessage(t, notesCount, TEAM_NOTE_COUNT_KEYS)}</>
                        )}
                    </p>
                )}
            </div>

            <TeamMembersPanel />
            <RiotAccountSummary onGoToPlayerResults={onGoToPlayerResults} />
            <TeamInvitePanel />
            <TeamCreatePanel />
            <TeamDangerZone />
        </div>
    )
}
