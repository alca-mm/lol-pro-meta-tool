import type { Role } from "../../domain/types"
import type { PickSlot, DraftVisualSide, ActiveDraftSlot, FlexChampionInfo } from "../../draft/types"
import { DraftTeamPanel } from "./DraftTeamPanel"
import { ChampionPoolPanel } from "./ChampionPoolPanel"

interface DraftBoardProps {
    bluePickSlots: PickSlot[]
    blueBans: string[]
    redPickSlots: PickSlot[]
    redBans: string[]
    activeDraftSlot: ActiveDraftSlot | null
    flexChampionCatalog: Map<string, FlexChampionInfo>
    championPool: string[]
    selectedChampionSet: Set<string>
    bannedChampionSet: Set<string>
    championSearch: string
    poolRoleFilter: Role | null
    onActivateBanSlot: (visualSide: DraftVisualSide, index: number) => void
    onActivatePickSlot: (visualSide: DraftVisualSide, index: number) => void
    onClearBan: (visualSide: DraftVisualSide, index: number) => void
    onClearPick: (visualSide: DraftVisualSide, index: number) => void
    onUpdatePickRole: (visualSide: DraftVisualSide, index: number, role: Role | null) => void
    onSetPoolRoleFilter: (role: Role | null) => void
    onChampionSearchChange: (query: string) => void
    onSelectChampion: (championName: string) => void
}

export function DraftBoard({
    bluePickSlots,
    blueBans,
    redPickSlots,
    redBans,
    activeDraftSlot,
    flexChampionCatalog,
    championPool,
    selectedChampionSet,
    bannedChampionSet,
    championSearch,
    poolRoleFilter,
    onActivateBanSlot,
    onActivatePickSlot,
    onClearBan,
    onClearPick,
    onUpdatePickRole,
    onSetPoolRoleFilter,
    onChampionSearchChange,
    onSelectChampion,
}: DraftBoardProps) {
    return (
        <div className="draft-layout">
            <DraftTeamPanel
                visualSide="blue"
                pickSlots={bluePickSlots}
                bans={blueBans}
                activeDraftSlot={activeDraftSlot}
                flexChampionCatalog={flexChampionCatalog}
                onActivateBanSlot={(index) => onActivateBanSlot("blue", index)}
                onActivatePickSlot={(index) => onActivatePickSlot("blue", index)}
                onClearBan={(index) => onClearBan("blue", index)}
                onClearPick={(index) => onClearPick("blue", index)}
                onUpdatePickRole={(index, role) => onUpdatePickRole("blue", index, role)}
            />

            <ChampionPoolPanel
                activeDraftSlot={activeDraftSlot}
                championPool={championPool}
                selectedChampionSet={selectedChampionSet}
                bannedChampionSet={bannedChampionSet}
                championSearch={championSearch}
                poolRoleFilter={poolRoleFilter}
                onSetPoolRoleFilter={onSetPoolRoleFilter}
                onChampionSearchChange={onChampionSearchChange}
                onSelectChampion={onSelectChampion}
            />

            <DraftTeamPanel
                visualSide="red"
                pickSlots={redPickSlots}
                bans={redBans}
                activeDraftSlot={activeDraftSlot}
                flexChampionCatalog={flexChampionCatalog}
                onActivateBanSlot={(index) => onActivateBanSlot("red", index)}
                onActivatePickSlot={(index) => onActivatePickSlot("red", index)}
                onClearBan={(index) => onClearBan("red", index)}
                onClearPick={(index) => onClearPick("red", index)}
                onUpdatePickRole={(index, role) => onUpdatePickRole("red", index, role)}
            />
        </div>
    )
}
