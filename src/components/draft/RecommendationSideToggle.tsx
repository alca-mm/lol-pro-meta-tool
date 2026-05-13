import { useTranslation } from "../../i18n/LanguageContext"
import type { DraftVisualSide } from "../../draft/types"

interface RecommendationSideToggleProps {
    recommendationSide: DraftVisualSide
    onChange: (side: DraftVisualSide) => void
}

export function RecommendationSideToggle({ recommendationSide, onChange }: RecommendationSideToggleProps) {
    const { t } = useTranslation()

    return (
        <div className="role-filter-tabs" aria-label="Empfehlungsseite">
            <span className="muted" style={{ alignSelf: "center", marginRight: "0.35rem" }}>
                {t("dh_liveRecsFor")}
            </span>

            <button
                type="button"
                className={[
                    "role-tab",
                    recommendationSide === "blue" ? "role-tab-active" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={() => onChange("blue")}
            >
                Blue Side
            </button>

            <button
                type="button"
                className={[
                    "role-tab",
                    recommendationSide === "red" ? "role-tab-active" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={() => onChange("red")}
            >
                Red Side
            </button>
        </div>
    )
}
