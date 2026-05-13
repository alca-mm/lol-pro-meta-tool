import { useTranslation } from "../../i18n/LanguageContext"
import type { CompletedGameDraft } from "../../draft/types"
import { MAX_SERIES_GAMES } from "../../draft/constants"

interface SeriesPanelProps {
    seriesGameNumber: number
    seriesHistory: CompletedGameDraft[]
    fearlessEnabled: boolean
    fearlessChampionSet: Set<string>
    currentGameHasContent: boolean
    copyStatus: string
    onToggleFearless: () => void
    onSaveGame: () => void
    onNextGame: () => void
    onCopyDraft: () => void
    onResetSeries: () => void
}

export function SeriesPanel({
    seriesGameNumber,
    seriesHistory,
    fearlessEnabled,
    fearlessChampionSet,
    currentGameHasContent,
    copyStatus,
    onToggleFearless,
    onSaveGame,
    onNextGame,
    onCopyDraft,
    onResetSeries,
}: SeriesPanelProps) {
    const { t } = useTranslation()

    return (
        <div className="recommendation-section series-panel">
            <div className="champion-picker-header">
                <div>
                    <h3>{t("dh_seriesTitle")}</h3>
                    <p className="muted">
                        Game {seriesGameNumber}/{MAX_SERIES_GAMES} · {t("dh_savedGames")} {seriesHistory.length}
                        {fearlessEnabled ? ` · ${t("dh_fearlessLocked")} ${fearlessChampionSet.size}` : ""}
                    </p>
                </div>

                <div className="series-actions">
                    <button
                        type="button"
                        className={["role-tab", fearlessEnabled ? "role-tab-active" : ""].filter(Boolean).join(" ")}
                        onClick={onToggleFearless}
                    >
                        {fearlessEnabled ? t("dh_fearlessOn") : t("dh_fearlessOff")}
                    </button>

                    <button
                        type="button"
                        className="role-tab"
                        onClick={onSaveGame}
                        disabled={!currentGameHasContent}
                    >
                        {t("dh_saveGame")}
                    </button>

                    <button
                        type="button"
                        className="role-tab"
                        onClick={onNextGame}
                        disabled={seriesGameNumber >= MAX_SERIES_GAMES}
                    >
                        {t("dh_nextGame")}
                    </button>

                    <button type="button" className="role-tab" onClick={onCopyDraft}>
                        {t("dh_copyDraft")}
                    </button>

                    <button type="button" className="role-tab" onClick={onResetSeries}>
                        {t("dh_resetSeries")}
                    </button>
                </div>
            </div>

            {copyStatus ? <p className="muted">{copyStatus}</p> : null}

            <div className="series-game-row">
                {Array.from({ length: MAX_SERIES_GAMES }, (_, index) => {
                    const gameNumber = index + 1
                    const isCurrent = gameNumber === seriesGameNumber
                    const isSaved = seriesHistory.some((game) => game.gameNumber === gameNumber)

                    return (
                        <span
                            key={gameNumber}
                            className={[
                                "series-game-pill",
                                isCurrent ? "is-current" : "",
                                isSaved ? "is-saved" : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            G{gameNumber}{isCurrent ? " · Live" : isSaved ? " · saved" : ""}
                        </span>
                    )
                })}
            </div>

            {fearlessEnabled && fearlessChampionSet.size > 0 ? (
                <p className="muted">
                    {t("dh_fearlessPool")} {[...fearlessChampionSet].slice(0, 18).join(", ")}
                    {fearlessChampionSet.size > 18 ? " …" : ""}
                </p>
            ) : null}
        </div>
    )
}
