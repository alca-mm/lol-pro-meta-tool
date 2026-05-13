import { useTranslation } from "../../i18n/LanguageContext"
import type { Role } from "../../domain/types"
import type { ActiveDraftSlot } from "../../draft/types"
import { ROLES, ROLE_LABELS } from "../../draft/constants"
import { sideLabel } from "../../draft/helpers"
import { ChampionPortraitGrid } from "../ChampionPortraitGrid"

interface ChampionPoolPanelProps {
    activeDraftSlot: ActiveDraftSlot | null
    championPool: string[]
    selectedChampionSet: Set<string>
    bannedChampionSet: Set<string>
    championSearch: string
    poolRoleFilter: Role | null
    onSetPoolRoleFilter: (role: Role | null) => void
    onChampionSearchChange: (query: string) => void
    onSelectChampion: (championName: string) => void
}

export function ChampionPoolPanel({
    activeDraftSlot,
    championPool,
    selectedChampionSet,
    bannedChampionSet,
    championSearch,
    poolRoleFilter,
    onSetPoolRoleFilter,
    onChampionSearchChange,
    onSelectChampion,
}: ChampionPoolPanelProps) {
    const { t } = useTranslation()

    function activeSlotHint(): string {
        if (!activeDraftSlot) return t("dh_selectSlotFirst")

        if (activeDraftSlot.type === "ban") {
            const suffix = t("dh_selectBanSuffix")
            return `${t("dh_selectBanFor")} ${sideLabel(activeDraftSlot.visualSide)}${suffix ? ` ${suffix}` : "."}`
        }

        const suffix = t("dh_selectPickSuffix")
        return `${t("dh_selectPickFor")} ${sideLabel(activeDraftSlot.visualSide)} ${t("dh_selectPickSlot")} ${activeDraftSlot.index + 1}${suffix ? ` ${suffix}` : "."}`
    }

    return (
        <div className="champion-picker-panel draft-center-panel">
            <div className="champion-picker-header">
                <div>
                    <h3>{t("dh_poolTitle")}</h3>
                    <p>{activeSlotHint()}</p>
                </div>
            </div>

            <div className="role-filter-tabs">
                <button
                    type="button"
                    className={["role-tab", poolRoleFilter === null ? "role-tab-active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => onSetPoolRoleFilter(null)}
                >
                    {t("filter_all")}
                </button>

                {ROLES.map((role) => (
                    <button
                        key={role}
                        type="button"
                        className={["role-tab", poolRoleFilter === role ? "role-tab-active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                        onClick={() => onSetPoolRoleFilter(role)}
                    >
                        {ROLE_LABELS[role]}
                    </button>
                ))}
            </div>

            <ChampionPortraitGrid
                champions={championPool}
                selectedChampions={selectedChampionSet}
                bannedChampions={bannedChampionSet}
                searchQuery={championSearch}
                onSearchQueryChange={onChampionSearchChange}
                onSelectChampion={onSelectChampion}
            />
        </div>
    )
}
