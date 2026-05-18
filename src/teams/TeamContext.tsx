import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react"
import type { Team } from "./teamService"
import {
    fetchUserTeams,
    createTeam as createTeamService,
    getActiveTeamId,
    setActiveTeamId,
} from "./teamService"
import { useAuth } from "../auth/AuthContext"

interface TeamContextValue {
    teams: Team[]
    activeTeam: Team | null
    loading: boolean
    createTeam: (name: string) => Promise<void>
    setActiveTeam: (teamId: string) => void
}

const TeamContext = createContext<TeamContextValue | null>(null)

export function TeamProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [teams, setTeams] = useState<Team[]>([])
    const [activeTeamId, setActiveTeamIdState] = useState<string | null>(
        getActiveTeamId(),
    )
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!user) {
            setTeams([])
            setActiveTeamIdState(null)
            setActiveTeamId(null)
            return
        }
        setLoading(true)
        fetchUserTeams(user.id)
            .then((loaded) => {
                setTeams(loaded)
                // if saved id is no longer valid, default to first team
                const savedId = getActiveTeamId()
                if (loaded.length > 0 && !loaded.find((t) => t.id === savedId)) {
                    setActiveTeamIdState(loaded[0].id)
                    setActiveTeamId(loaded[0].id)
                }
            })
            .finally(() => setLoading(false))
    }, [user])

    const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null

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

    return (
        <TeamContext.Provider
            value={{ teams, activeTeam, loading, createTeam, setActiveTeam }}
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
