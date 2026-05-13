import { useTranslation } from "../../i18n/LanguageContext"
import type { Role } from "../../domain/types"
import type { PickSlot, DraftVisualSide, ActiveDraftSlot, FlexChampionInfo } from "../../draft/types"
import { normalizeChampionName, filledPickCount, filledBanCount, slotsToDraftPicks } from "../../draft/helpers"
import { DraftBanSlot } from "./DraftBanSlot"
import { DraftPickSlot } from "./DraftPickSlot"

interface DraftTeamPanelProps {
    visualSide: DraftVisualSide
    pickSlots: PickSlot[]
    bans: string[]
    activeDraftSlot: ActiveDraftSlot | null
    flexChampionCatalog: Map<string, FlexChampionInfo>
    onActivateBanSlot: (index: number) => void
    onActivatePickSlot: (index: number) => void
    onClearBan: (index: number) => void
    onClearPick: (index: number) => void
    onUpdatePickRole: (index: number, role: Role | null) => void
}

export function DraftTeamPanel({
    visualSide,
    pickSlots,
    bans,
    activeDraftSlot,
    flexChampionCatalog,
    onActivateBanSlot,
    onActivatePickSlot,
    onClearBan,
    onClearPick,
    onUpdatePickRole,
}: DraftTeamPanelProps) {
    const { t } = useTranslation()

    return (
        <div className={`draft-team-panel ${visualSide}`}>
            <div className="draft-team-header">
                <span>{visualSide === "blue" ? "BLUE SIDE" : "RED SIDE"}</span>
            </div>

            <div className="draft-ban-row">
                {bans.map((_, index) => (
                    <DraftBanSlot
                        key={`${visualSide}-ban-${index}`}
                        visualSide={visualSide}
                        index={index}
                        championName={bans[index]}
                        isActive={
                            activeDraftSlot?.type === "ban" &&
                            activeDraftSlot.visualSide === visualSide &&
                            activeDraftSlot.index === index
                        }
                        onActivate={() => onActivateBanSlot(index)}
                        onClear={() => onClearBan(index)}
                    />
                ))}
            </div>

            <div className="draft-pick-list">
                {pickSlots.map((slot, index) => (
                    <DraftPickSlot
                        key={`${visualSide}-pick-${index}`}
                        visualSide={visualSide}
                        index={index}
                        slot={slot}
                        flexInfo={
                            slot.championName
                                ? flexChampionCatalog.get(normalizeChampionName(slot.championName))
                                : undefined
                        }
                        isActive={
                            activeDraftSlot?.type === "pick" &&
                            activeDraftSlot.visualSide === visualSide &&
                            activeDraftSlot.index === index
                        }
                        onActivate={() => onActivatePickSlot(index)}
                        onUpdateRole={(role) => onUpdatePickRole(index, role)}
                        onClear={() => onClearPick(index)}
                    />
                ))}
            </div>

            <div className="recommendation-card" style={{ marginTop: "0.85rem", padding: "0.75rem" }}>
                <h3>Summary</h3>
                <p className="muted">
                    {filledPickCount(pickSlots)}/5 Picks · {filledBanCount(bans)}/5 Bans
                </p>
                <p className="muted">
                    {t("dh_assignedRoles")} {Object.keys(slotsToDraftPicks(pickSlots)).length}/5
                </p>
            </div>
        </div>
    )
}
