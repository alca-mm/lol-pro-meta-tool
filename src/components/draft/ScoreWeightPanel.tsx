import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import type { WeightKey, WeightConfig, DraftAiPresetKey } from "../../draft/types"
import { WEIGHT_PRESETS, DEFAULT_WEIGHTS } from "../../draft/constants"

/**
 * The preset buttons take their text from the catalogue, not from
 * `WEIGHT_PRESETS[...].label`.
 *
 * Those labels live in src/draft/constants.ts, which is a domain module with no
 * access to `t()`, so rendering them directly put five English words
 * ("Balanced", "Counterpick", "Meta Priority", ...) into the German build. The
 * sibling PatchWeightPanel already solved this the same way; the two panels
 * stack on one screen, so they had to agree.
 */
const WEIGHT_PRESET_LABELS: Record<DraftAiPresetKey, TranslationKey> = {
    balanced: "dh_wPreset_balanced",
    counterpick: "dh_wPreset_counterpick",
    synergy: "dh_wPreset_synergy",
    meta: "dh_wPreset_meta",
    safe: "dh_wPreset_safe",
}

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
        teamPool: t("dh_wLabel_teamPool"),
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

            <div className="role-filter-tabs" role="group" aria-label={t("dh_wPresetsAriaLabel")}>
                {(Object.keys(WEIGHT_PRESETS) as DraftAiPresetKey[]).map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        className="role-tab"
                        onClick={() => onApplyPreset(preset)}
                    >
                        {t(WEIGHT_PRESET_LABELS[preset])}
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
