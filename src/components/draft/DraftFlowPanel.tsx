import { useTranslation } from "../../i18n/LanguageContext"

interface DraftFlowPanelProps {
    draftFlowEnabled: boolean
    historyLength: number
    flowSlotLabel: string
    onActivate: () => void
    onDeactivate: () => void
    onStepBack: () => void
}

export function DraftFlowPanel({
    draftFlowEnabled,
    historyLength,
    flowSlotLabel,
    onActivate,
    onDeactivate,
    onStepBack,
}: DraftFlowPanelProps) {
    const { t } = useTranslation()

    return (
        <div className="role-filter-tabs" aria-label="Draft-Flow">
            <span className="muted" style={{ alignSelf: "center", marginRight: "0.35rem" }}>
                {t("dh_draftFlow")}
            </span>

            {draftFlowEnabled ? (
                <button type="button" className="role-tab role-tab-active" onClick={onDeactivate}>
                    {t("dh_flowActive")}
                </button>
            ) : (
                <button type="button" className="role-tab" onClick={onActivate}>
                    {t("dh_flowEnable")}
                </button>
            )}

            <button
                type="button"
                className="role-tab"
                onClick={onStepBack}
                disabled={historyLength === 0}
                style={{ opacity: historyLength === 0 ? 0.5 : 1 }}
            >
                {t("dh_stepBack")}
            </button>

            <span className="muted" style={{ alignSelf: "center" }}>
                {draftFlowEnabled
                    ? `${t("dh_flowUpNext")} ${flowSlotLabel}`
                    : t("dh_manualMode")}
            </span>
        </div>
    )
}
