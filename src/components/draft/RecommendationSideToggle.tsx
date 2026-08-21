import { useRef } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import type { DraftVisualSide } from "../../draft/types"
import { nextRadioValue, radioTabIndex } from "./radioGroupNavigation"

/** Option order, and therefore what Arrow-Right and End mean. */
const SIDES: readonly DraftVisualSide[] = ["blue", "red"]

interface RecommendationSideToggleProps {
    recommendationSide: DraftVisualSide
    onChange: (side: DraftVisualSide) => void
}

export function RecommendationSideToggle({ recommendationSide, onChange }: RecommendationSideToggleProps) {
    const { t } = useTranslation()
    const blueRef = useRef<HTMLButtonElement>(null)
    const redRef = useRef<HTMLButtonElement>(null)

    // Selection follows focus, per the APG radio-group pattern: the arrow keys
    // move AND check in one step, so a single `onChange` covers both. Sitting on
    // the wrapper rather than on each button means one handler serves both
    // options and would keep serving a third.
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        const next = nextRadioValue(SIDES, recommendationSide, event.key)

        // `null` means "not a key we claim". Returning BEFORE preventDefault is
        // the whole contract: swallowing Tab, Space or Enter here would break
        // the keyboard access this change exists to improve.
        if (next === null) return

        event.preventDefault()
        onChange(next)

        // Focus has to follow the selection or the roving tabindex strands it on
        // an option that just became `tabIndex={-1}`. The target button is
        // already mounted, so this lands before React re-renders.
        const target = next === "blue" ? blueRef.current : redRef.current
        target?.focus()
    }

    return (
        // `radiogroup`, not `group` and not `tablist`: picking a side is an
        // EXCLUSIVE choice between two options, and that is the one thing
        // `group` cannot express. The CSS class says "tabs", which is the trap
        // here. What disqualifies `tablist` is its CONTENT model, not its
        // keyboard model: role `tab` requires `aria-selected` and is expected to
        // point `aria-controls` at real tabpanels, and there are no panels here
        // - the recommendation list below is not owned by this control. Arrow
        // -key roving is NOT the discriminator, because the APG asks the same of
        // a radiogroup; it is implemented above rather than argued away.
        <div
            className="role-filter-tabs"
            role="radiogroup"
            aria-label={t("dh_recoSideAriaLabel")}
            onKeyDown={handleKeyDown}
        >
            <span className="muted" style={{ alignSelf: "center", marginRight: "0.35rem" }}>
                {t("dh_liveRecsFor")}
            </span>

            <button
                ref={blueRef}
                type="button"
                role="radio"
                aria-checked={recommendationSide === "blue"}
                tabIndex={radioTabIndex(SIDES, recommendationSide, "blue")}
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
                ref={redRef}
                type="button"
                role="radio"
                aria-checked={recommendationSide === "red"}
                tabIndex={radioTabIndex(SIDES, recommendationSide, "red")}
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
