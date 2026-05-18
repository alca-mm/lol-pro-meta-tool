export function isTeamModeActive(
    isConfigured: boolean,
    userId: string | null,
    teamId: string | null,
): boolean {
    return isConfigured && Boolean(userId) && Boolean(teamId)
}
