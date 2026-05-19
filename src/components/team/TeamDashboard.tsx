import { useTranslation } from "../../i18n/LanguageContext"
import { useAuth } from "../../auth/AuthContext"
import { useTeam } from "../../teams/TeamContext"
import { TeamMembersPanel } from "./TeamMembersPanel"
import { TeamInvitePanel } from "./TeamInvitePanel"
import { TeamCreatePanel } from "./TeamCreatePanel"
import { TeamDangerZone } from "./TeamDangerZone"
import { RiotAccountSummary } from "./RiotAccountSummary"

interface Props {
    onGoToPlayerResults?: () => void
}

export function TeamDashboard({ onGoToPlayerResults }: Props = {}) {
    const { t } = useTranslation()
    const { user } = useAuth()
    const { activeTeam, teams, myRole, members, notesCount, loading, setActiveTeam } = useTeam()

    if (!user) return null
    if (loading) return <p className="muted">{t("auth_loading")}</p>

    const roleLabels: Record<string, string> = {
        owner: t("team_owner"),
        admin: t("team_admin"),
        player: t("team_player"),
    }
    const myRoleLabel = myRole ? (roleLabels[myRole] ?? myRole) : null

    return (
        <>
            {/* ── Header card ────────────────────────────────── */}
            <div className="recommendation-section" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                        <p
                            className="muted"
                            style={{ margin: 0, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em" }}
                        >
                            {t("team_dashboard")}
                        </p>
                        {activeTeam ? (
                            <p style={{ margin: "0.2rem 0 0", fontSize: "1.05rem", fontWeight: 600 }}>
                                {activeTeam.name}
                            </p>
                        ) : (
                            <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                                {t("team_noTeam")}
                            </p>
                        )}
                    </div>

                    {(myRoleLabel || teams.length > 1) && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                            {myRoleLabel && (
                                <span className="muted" style={{ fontSize: "0.8rem" }}>
                                    {t("team_yourRole")}:{" "}
                                    <strong style={{ color: "var(--color-fg, inherit)" }}>{myRoleLabel}</strong>
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

                {/* Summary line: member + notes count */}
                {activeTeam && (
                    <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.8rem" }}>
                        {members.length} {t("team_members")}
                        {notesCount > 0 && (
                            <> &middot; {notesCount} {t("team_notesSummary")}</>
                        )}
                    </p>
                )}
            </div>

            {/* ── Sections ───────────────────────────────────── */}
            <TeamMembersPanel />
            <RiotAccountSummary onGoToPlayerResults={onGoToPlayerResults} />
            <TeamInvitePanel />
            <TeamCreatePanel />
            <TeamDangerZone />
        </>
    )
}
