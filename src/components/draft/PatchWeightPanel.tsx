import { useTranslation } from "../../i18n/LanguageContext"
import type { TranslationKey } from "../../i18n/types"
import type { PatchWindowSummary, PatchWeightPresetKey } from "../../draft/types"
import { PATCH_WEIGHT_PRESETS, PATCH_WEIGHT_MAX_PATCHES } from "../../draft/constants"

const PATCH_PRESET_LABELS: Record<PatchWeightPresetKey, TranslationKey> = {
    balanced: "dh_pPreset_balanced",
    currentFocused: "dh_pPreset_currentFocused",
    stable: "dh_pPreset_stable",
    currentOnly: "dh_pPreset_currentOnly",
}

interface PatchWeightPanelProps {
    patchWeights: number[]
    summaries: PatchWindowSummary[]
    onUpdateWeight: (index: number, value: number) => void
    onApplyPreset: (preset: PatchWeightPresetKey) => void
    onReset: () => void
}

export function PatchWeightPanel({
    patchWeights,
    summaries,
    onUpdateWeight,
    onApplyPreset,
    onReset,
}: PatchWeightPanelProps) {
    const { t, lang } = useTranslation()

    function patchLabel(index: number): string {
        if (index === 0) return t("dh_currentPatch")
        if (lang === "de") return `${index} Patch${index === 1 ? "" : "es"} alt`
        return `${index} ${index === 1 ? t("dh_patchOld1") : t("dh_patchOldN")}`
    }

    return (
        <div className="recommendation-section draft-weight-panel">
            <div className="champion-picker-header">
                <div>
                    <h3>{t("dh_patchWeightTitle")}</h3>
                    <p>{t("dh_patchWeightDesc")}</p>
                    <p className="muted">{t("dh_patchWeightNote")}</p>
                </div>

                <button type="button" className="secondary-button" onClick={onReset}>
                    {t("dh_resetPatchWeight")}
                </button>
            </div>

            <div className="role-filter-tabs" aria-label="Patch-Gewichtungs-Presets">
                {(Object.keys(PATCH_WEIGHT_PRESETS) as PatchWeightPresetKey[]).map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        className="role-tab"
                        onClick={() => onApplyPreset(preset)}
                    >
                        {t(PATCH_PRESET_LABELS[preset])}
                    </button>
                ))}
            </div>

            <div className="draft-weight-grid">
                {Array.from({ length: PATCH_WEIGHT_MAX_PATCHES }, (_, index) => {
                    const patch = summaries[index]?.patch ?? "—"
                    const rawMatches = summaries[index]?.rawMatches ?? 0

                    return (
                        <label key={index} className="draft-weight-control">
                            <span>
                                {patchLabel(index)}
                                <strong>{patchWeights[index] ?? 0}%</strong>
                            </span>
                            <span className="muted">
                                {patch} · {rawMatches.toLocaleString("de-DE")} {t("dh_games")}
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={patchWeights[index] ?? 0}
                                onChange={(event) => onUpdateWeight(index, Number(event.target.value))}
                            />
                        </label>
                    )
                })}
            </div>
        </div>
    )
}
