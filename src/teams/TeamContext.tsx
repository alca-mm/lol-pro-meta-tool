import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react"
import type { Team, TeamMember, TeamRole, TeamInvite } from "./teamService"
import {
    fetchUserTeams,
    createTeam as createTeamService,
    getActiveTeamId,
    setActiveTeamId,
    getTeamMembers,
    addTeamMemberByUsername,
    updateTeamMemberRole,
    removeTeamMember,
    deleteTeam as deleteTeamService,
    createInvite as createInviteService,
    fetchTeamInvites,
    revokeInvite as revokeInviteService,
    joinTeamWithInvite as joinTeamWithInviteService,
    canManageMembers,
} from "./teamService"
import { useAuth } from "../auth/AuthContext"
import { getChampionNotesCount } from "../notes/teamNotesService"

interface TeamContextValue {
    teams: Team[]
    activeTeam: Team | null
    loading: boolean
    members: TeamMember[]
    myRole: TeamRole | null
    createTeam: (name: string) => Promise<void>
    setActiveTeam: (teamId: string) => void
    addMember: (username: string) => Promise<string | null>
    removeMember: (userId: string) => Promise<string | null>
    updateMemberRole: (userId: string, role: TeamRole) => Promise<string | null>
    refreshMembers: () => Promise<void>
    deleteTeam: (teamId: string) => Promise<string | null>
    invites: TeamInvite[]
    createInvite: () => Promise<{ code: string } | string>
    revokeInvite: (inviteId: string) => Promise<string | null>
    joinTeamWithInvite: (code: string) => Promise<string | null>
    notesCount: number
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [teams, setTeams] = useState<Team[]>([])
    const [activeTeamId, setActiveTeamIdState] = useState<string | null>(getActiveTeamId())
    const [loading, setLoading] = useState(false)
    const [members, setMembers] = useState<TeamMember[]>([])
    const [invites, setInvites] = useState<TeamInvite[]>([])
    const [notesCount, setNotesCount] = useState(0)

    // Load teams when user changes
    useEffect(() => {
        if (!user) {
            setTeams([])
            setActiveTeamIdState(null)
            setActiveTeamId(null)
            setMembers([])
            setInvites([])
            setNotesCount(0)
            return
        }
        setLoading(true)
        fetchUserTeams(user.id)
            .then((loaded) => {
                setTeams(loaded)
                const savedId = getActiveTeamId()
                if (loaded.length > 0 && !loaded.find((t) => t.id === savedId)) {
                    setActiveTeamIdState(loaded[0].id)
                    setActiveTeamId(loaded[0].id)
                }
            })
            .finally(() => setLoading(false))
    }, [user])

    // Load members when active team changes
    const refreshMembers = useCallback(async () => {
        if (!activeTeamId) { setMembers([]); return }
        const loaded = await getTeamMembers(activeTeamId)
        setMembers(loaded)
    }, [activeTeamId])

    useEffect(() => {
        void refreshMembers()
    }, [refreshMembers])

    const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null
    const myRole = members.find((m) => m.user_id === user?.id)?.role ?? null

    // Load invites when active team or role changes (only for owner/admin)
    const refreshInvites = useCallback(async () => {
        if (!activeTeamId || !canManageMembers(myRole)) {
            setInvites([])
            return
        }
        const loaded = await fetchTeamInvites(activeTeamId)
        setInvites(loaded)
    }, [activeTeamId, myRole])

    useEffect(() => {
        void refreshInvites()
    }, [refreshInvites])

    // Load champion notes count when active team changes
    useEffect(() => {
        if (!activeTeamId) { setNotesCount(0); return }
        getChampionNotesCount(activeTeamId).then(setNotesCount)
    }, [activeTeamId])

    async function createTeam(name: string): Promise<void> {
        if (!user) return
        const team = await createTeamService(user.id, name)
        if (team) {
            setTeams((prev) => [...prev, team])
            setActiveTeamIdState(team.id)
            setActiveTeamId(team.id)
        }
    }

    function setActiveTeam(teamId: string): void {
        setActiveTeamId(teamId)
        setActiveTeamIdState(teamId)
    }

    async function addMember(username: string): Promise<string | null> {
        if (!activeTeamId) return "No active team"
        const err = await addTeamMemberByUsername(activeTeamId, username)
        if (!err) await refreshMembers()
        return err
    }

    async function removeMember(userId: string): Promise<string | null> {
        if (!activeTeamId) return "No active team"
        const err = await removeTeamMember(activeTeamId, userId)
        if (!err) await refreshMembers()
        return err
    }

    async function updateMemberRole(userId: string, role: TeamRole): Promise<string | null> {
        if (!activeTeamId) return "No active team"
        const err = await updateTeamMemberRole(activeTeamId, userId, role)
        if (!err) await refreshMembers()
        return err
    }

    async function deleteTeam(teamId: string): Promise<string | null> {
        const err = await deleteTeamService(teamId)
        if (!err) {
            setTeams((prev) => prev.filter((t) => t.id !== teamId))
            if (activeTeamId === teamId) {
                const remaining = teams.filter((t) => t.id !== teamId)
                const next = remaining[0]?.id ?? null
                setActiveTeamIdState(next)
                setActiveTeamId(next)
            }
        }
        return err
    }

    async function createInvite(): Promise<{ code: string } | string> {
        if (!activeTeamId) return "No active team"
        const result = await createInviteService(activeTeamId, activeTeam?.name)
        if (typeof result !== "string") await refreshInvites()
        return result
    }

    async function revokeInvite(inviteId: string): Promise<string | null> {
        const err = await revokeInviteService(inviteId)
        if (!err) await refreshInvites()
        return err
    }

    async function joinTeamWithInvite(code: string): Promise<string | null> {
        if (!user) return "invite_invalidCode"
        const result = await joinTeamWithInviteService(code)
        if (typeof result === "string") return result
        const loaded = await fetchUserTeams(user.id)
        setTeams(loaded)
        setActiveTeamIdState(result.teamId)
        setActiveTeamId(result.teamId)
        return null
    }

    return (
        <TeamContext.Provider
            value={{
                teams,
                activeTeam,
                loading,
                members,
                myRole,
                createTeam,
                setActiveTeam,
                addMember,
                removeMember,
                updateMemberRole,
                refreshMembers,
                deleteTeam,
                invites,
                createInvite,
                revokeInvite,
                joinTeamWithInvite,
                notesCount,
            }}
        >
            {children}
        </TeamContext.Provider>
    )
}

export function useTeam(): TeamContextValue {
    const ctx = useContext(TeamContext)
    if (!ctx) throw new Error("useTeam must be used inside TeamProvider")
    return ctx
}
