import { TeamDashboard } from "./team/TeamDashboard"

interface Props {
    onGoToPlayerResults?: () => void
}

export function TeamStatusPanel({ onGoToPlayerResults }: Props = {}) {
    return <TeamDashboard onGoToPlayerResults={onGoToPlayerResults} />
}
