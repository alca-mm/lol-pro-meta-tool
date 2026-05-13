import { championIconUrl } from "../../analysis/championAssets"
import type { FlexChampionInfo, PickSlot } from "../../draft/types"
import { ROLE_LABELS } from "../../draft/constants"

export function iconFor(championName?: string) {
    if (!championName) return null

    return (
        <img
            src={championIconUrl(championName)}
            alt={championName}
            loading="lazy"
            onError={(event) => {
                event.currentTarget.style.visibility = "hidden"
            }}
        />
    )
}

export function flexRoleLabel(info: FlexChampionInfo | undefined): string {
    if (!info || info.roles.length === 0) return ""

    const visibleRoles = info.roles
        .filter((roleInfo) => roleInfo.games >= 2 || roleInfo.share >= 0.1)
        .slice(0, 3)

    if (visibleRoles.length === 0) return ""

    return visibleRoles
        .map((roleInfo) => `${ROLE_LABELS[roleInfo.role]} ${(roleInfo.share * 100).toFixed(0)}%`)
        .join(" / ")
}

export function pickSlotRoleLabel(slot: PickSlot): string {
    if (!slot.championName) return "Role?"
    return slot.role ? ROLE_LABELS[slot.role] : "Role?"
}
