import { useEffect, useState } from "react"
import { championIconUrl, championInitials } from "../analysis/championAssets"

interface ChampionIconProps {
    championName: string
    alt?: string
    className?: string
}

// Renders a champion icon. When the Data Dragon image fails to load
// (new champion, stale version, name/id mismatch, 404), it falls back to a
// visible initials placeholder instead of a blank/hidden image.
export function ChampionIcon({ championName, alt = "", className }: ChampionIconProps) {
    const [failed, setFailed] = useState(false)

    // Reset the failure state whenever the champion changes so a previously
    // broken icon does not stick to a different champion.
    useEffect(() => {
        setFailed(false)
    }, [championName])

    if (failed) {
        return (
            <span
                aria-hidden="true"
                className={className}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    background: "var(--surface-2)",
                    color: "var(--text-dim)",
                    fontWeight: 700,
                    fontSize: "0.7em",
                    letterSpacing: "0.02em",
                    borderRadius: "6px",
                    textTransform: "uppercase",
                    lineHeight: 1,
                }}
            >
                {championInitials(championName)}
            </span>
        )
    }

    return (
        <img
            src={championIconUrl(championName)}
            alt={alt}
            className={className}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}
