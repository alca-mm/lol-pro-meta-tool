import { championIconUrl } from "../analysis/championAssets"
import { useTranslation } from "../i18n/LanguageContext"
import type { ChampionNoteRating } from "../notes/types"

interface ChampionPortraitGridProps {
    champions: string[]
    selectedChampions: Set<string>
    bannedChampions: Set<string>
    searchQuery: string
    onSearchQueryChange: (value: string) => void
    onSelectChampion: (championName: string) => void
    teamRatings?: Map<string, ChampionNoteRating>
}

function normalizeChampionName(name: string): string {
    return name.trim().toLowerCase()
}

function ratingDotColor(rating: ChampionNoteRating): string {
    switch (rating) {
        case "comfort":
        case "blind":
        case "pocket":
            return "var(--green)"
        case "situational":
            return "var(--accent)"
        case "needs_practice":
            return "var(--text-dim)"
        case "avoid":
            return "var(--red)"
    }
}

export function ChampionPortraitGrid({
    champions,
    selectedChampions,
    bannedChampions,
    searchQuery,
    onSearchQueryChange,
    onSelectChampion,
    teamRatings,
}: ChampionPortraitGridProps) {
    const { t } = useTranslation()
    const normalizedSearch = searchQuery.trim().toLowerCase()

    const filteredChampions = champions.filter((champion) =>
        champion.toLowerCase().includes(normalizedSearch),
    )

    return (
        <div className="champion-picker-content">
            <input
                type="search"
                className="champion-search"
                value={searchQuery}
                placeholder={t("pool_searchPlaceholder")}
                onChange={(event) => onSearchQueryChange(event.target.value)}
            />

            <div className="champion-grid">
                {filteredChampions.map((champion) => {
                    const normalized = normalizeChampionName(champion)
                    const isSelected = selectedChampions.has(normalized)
                    const isBanned = bannedChampions.has(normalized)
                    const isUnavailable = isSelected || isBanned

                    return (
                        <button
                            key={champion}
                            type="button"
                            className={[
                                "champion-portrait-button",
                                isSelected ? "is-selected" : "",
                                isBanned ? "is-banned" : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            onClick={() => onSelectChampion(champion)}
                            disabled={isUnavailable}
                            title={champion}
                            aria-label={champion}
                        >
                            <img
                                src={championIconUrl(champion)}
                                alt=""
                                loading="lazy"
                                onError={(event) => {
                                    event.currentTarget.style.visibility = "hidden"
                                }}
                            />
                            {teamRatings?.has(normalized) && (
                                <span
                                    aria-hidden="true"
                                    style={{
                                        position: "absolute",
                                        bottom: 2,
                                        right: 2,
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        background: ratingDotColor(teamRatings.get(normalized)!),
                                        boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
                                        pointerEvents: "none",
                                    }}
                                />
                            )}
                        </button>
                    )
                })}
            </div>

            {filteredChampions.length === 0 && (
                <p className="empty-state">{t("pool_noChampion")}</p>
            )}
        </div>
    )
}