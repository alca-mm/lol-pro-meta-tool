import { useTranslation } from "../../i18n/LanguageContext"
import type { WeightKey, WeightConfig, DraftAiPresetKey } from "../../draft/types"
import { WEIGHT_PRESETS, DEFAULT_WEIGHTS } from "../../draft/constants"

interface ScoreWeightPanelProps {
    weights: WeightConfig
    onUpdateWeight: (key: WeightKey, value: number) => void
    onApplyPreset: (preset: DraftAiPresetKey) => void
    onReset: () => void
}

export function ScoreWeightPanel({ weights, onUpdateWeight, onApplyPreset, onReset }: ScoreWeightPanelProps) {
    const { t } = useTranslation()

    const WEIGHT_LABELS: Record<WeightKey, string> = {
        draftPriority: t("dh_wLabel_draftPriority"),
        roleStats: t("dh_wLabel_roleStats"),
        synergy: t("dh_wLabel_synergy"),
        matchup: t("dh_wLabel_matchup"),
        winRate: t("dh_wLabel_winRate"),
        sampleSize: t("dh_wLabel_sampleSize"),
    }

    return (
        <div className="recommendation-section draft-weight-panel">
            <div className="champion-picker-header">
                <div>
                    <h3>{t("dh_weightTitle")}</h3>
                    <p>{t("dh_weightDesc")}</p>
                </div>

                <button type="button" className="secondary-button" onClick={onReset}>
                    {t("dh_resetWeight")}
                </button>
            </div>

            <div className="role-filter-tabs" aria-label="Wichtungs-Presets">
                {(Object.keys(WEIGHT_PRESETS) as DraftAiPresetKey[]).map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        className="role-tab"
                        onClick={() => onApplyPreset(preset)}
                    >
                        {WEIGHT_PRESETS[preset].label}
                    </button>
                ))}
            </div>

            <div className="draft-weight-grid">
                {(Object.keys(DEFAULT_WEIGHTS) as WeightKey[]).map((key) => (
                    <label key={key} className="draft-weight-control">
                        <span>
                            {WEIGHT_LABELS[key]}
                            <strong>{weights[key]}</strong>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={weights[key]}
                            onChange={(event) => onUpdateWeight(key, Number(event.target.value))}
                        />
                    </label>
                ))}
            </div>
        </div>
    )
}
