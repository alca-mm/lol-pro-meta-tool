import { ChampionIcon } from "../ChampionIcon"
import type { FlexChampionInfo, PickSlot } from "../../draft/types"
import type { TranslationKey } from "../../i18n/types"
import { ROLE_LABELS } from "../../draft/constants"

export function iconFor(championName?: string) {
    if (!championName) return null

    return <ChampionIcon championName={championName} alt={championName} />
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

// `t` is threaded in as a parameter rather than read from a hook: this module
// is plain functions, not a component, so it has no place to call one.
export function pickSlotRoleLabel(
    slot: PickSlot,
    t: (key: TranslationKey) => string,
): string {
    if (!slot.championName) return t("dh_rolePlaceholder")
    return slot.role ? ROLE_LABELS[slot.role] : t("dh_rolePlaceholder")
}
