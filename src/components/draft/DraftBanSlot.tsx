import { useTranslation } from "../../i18n/LanguageContext"
import type { DraftVisualSide } from "../../draft/types"
import { iconFor } from "./utils"

interface DraftBanSlotProps {
    visualSide: DraftVisualSide
    index: number
    championName: string
    isActive: boolean
    onActivate: () => void
    onClear: () => void
}

export function DraftBanSlot({ visualSide, index, championName, isActive, onActivate, onClear }: DraftBanSlotProps) {
    const { t } = useTranslation()

    return (
        <div className="draft-ban-slot-wrap">
            <button
                type="button"
                className={[
                    "draft-ban-slot",
                    visualSide,
                    isActive ? "is-active" : "",
                    championName ? "has-champion" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={onActivate}
                title={championName || `Ban ${index + 1}`}
            >
                {championName ? iconFor(championName) : <span>B{index + 1}</span>}
            </button>

            {championName && (
                <button
                    type="button"
                    className="draft-mini-clear"
                    onClick={onClear}
                    aria-label={`${t("dh_removeBan")} ${championName}`}
                    title={t("dh_removeBan")}
                >
                    ×
                </button>
            )}
        </div>
    )
}
