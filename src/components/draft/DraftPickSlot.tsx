import { useTranslation } from "../../i18n/LanguageContext"
import type { Role } from "../../domain/types"
import type { PickSlot, DraftVisualSide, FlexChampionInfo } from "../../draft/types"
import { ROLES, ROLE_LABELS } from "../../draft/constants"
import { iconFor, flexRoleLabel, pickSlotRoleLabel } from "./utils"

interface DraftPickSlotProps {
    visualSide: DraftVisualSide
    index: number
    slot: PickSlot
    flexInfo: FlexChampionInfo | undefined
    isActive: boolean
    onActivate: () => void
    onUpdateRole: (role: Role | null) => void
    onClear: () => void
}

export function DraftPickSlot({
    visualSide,
    index,
    slot,
    flexInfo,
    isActive,
    onActivate,
    onUpdateRole,
    onClear,
}: DraftPickSlotProps) {
    const { t } = useTranslation()
    const { championName } = slot

    return (
        <div className="draft-pick-slot-wrap">
            <button
                type="button"
                className={[
                    "draft-pick-slot",
                    visualSide,
                    isActive ? "is-active" : "",
                    championName ? "has-champion" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={onActivate}
                title={championName || `Pick ${index + 1}`}
            >
                <span className="draft-pick-role">P{index + 1}</span>

                <span className="draft-pick-icon">
                    {championName ? iconFor(championName) : null}
                </span>

                <span className="draft-pick-name">
                    {championName || t("dh_selectPickPlaceholder")}
                    {championName ? (
                        <span className="muted" style={{ display: "block", fontWeight: 600 }}>
                            {pickSlotRoleLabel(slot)}
                            {flexInfo?.isFlex ? ` · Flex ${flexRoleLabel(flexInfo)}` : ""}
                        </span>
                    ) : null}
                </span>
            </button>

            {championName && (
                <select
                    value={slot.role ?? ""}
                    onChange={(event) =>
                        onUpdateRole(event.target.value ? (event.target.value as Role) : null)
                    }
                    title={t("dh_assignRoleTitle")}
                    style={{
                        width: "100%",
                        marginTop: "0.3rem",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        background: "var(--surface2)",
                        color: "var(--text)",
                        padding: "0.35rem 0.45rem",
                        fontSize: "0.75rem",
                    }}
                >
                    <option value="">Role?</option>
                    {ROLES.map((role) => (
                        <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                        </option>
                    ))}
                </select>
            )}

            {championName && (
                <button
                    type="button"
                    className="draft-mini-clear"
                    onClick={onClear}
                    aria-label={`${t("dh_removePick")} ${championName}`}
                    title={t("dh_removePick")}
                >
                    ×
                </button>
            )}
        </div>
    )
}
