import { ChampionIcon } from "./ChampionIcon"
import { draftAvailabilityKey } from "../draft/draftAvailability"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"
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

const POOL_LEGEND: Array<{ rating: ChampionNoteRating; short: string }> = [
    { rating: "comfort",        short: "C" },
    { rating: "blind",          short: "B" },
    { rating: "pocket",         short: "P" },
    { rating: "situational",    short: "S" },
    { rating: "needs_practice", short: "!" },
    { rating: "avoid",          short: "X" },
]

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
                    // The same basis the board enforces with, so the grid
                    // never offers a champion the board then refuses.
                    const normalized = draftAvailabilityKey(champion)
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
                            <ChampionIcon championName={champion} alt="" />
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

            {teamRatings && teamRatings.size > 0 && (
                <div style={{ display: "flex", gap: "0.3rem 0.6rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.67rem" }}>
                    {POOL_LEGEND.map(({ rating, short }) => {
                        const color = ratingDotColor(rating)
                        return (
                            <span key={rating} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--text-dim)" }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                                <span style={{ color, fontWeight: 700 }}>{short}</span>
                                <span>{t(`cn_rating_${rating}` as TranslationKey)}</span>
                            </span>
                        )
                    })}
                </div>
            )}
        </div>
    )
}