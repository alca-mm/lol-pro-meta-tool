import { useMemo, useState } from "react"
import { useTranslation } from "../i18n/LanguageContext"
import type { Match } from "../domain/types"

type SyncReportInfo = {
    syncStartedAt?: string | null
    syncFinishedAt?: string | null
    dateRange?: {
        from?: string | null
        to?: string | null
    } | null
}

interface DataSourceInfoProps {
    isUsingSampleData: boolean
    matches: Match[]
    syncReport?: SyncReportInfo
}

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) {
        return null
    }

    return parsed
}

function formatDate(value: string | null | undefined): string {
    if (!value) return "unbekannt"

    const parsed = parseDate(value)

    if (!parsed) {
        return value
    }

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(parsed)
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return "unbekannt"

    const parsed = parseDate(value)

    if (!parsed) {
        return value
    }

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed)
}

function getLatestMatchDate(matches: Match[]): string | null {
    let latest: { raw: string; time: number } | null = null

    for (const match of matches) {
        const parsed = parseDate(match.date)

        if (!parsed) continue

        const time = parsed.getTime()

        if (!latest || time > latest.time) {
            latest = {
                raw: match.date,
                time,
            }
        }
    }

    return latest?.raw ?? null
}

function getOldestMatchDate(matches: Match[]): string | null {
    let oldest: { raw: string; time: number } | null = null

    for (const match of matches) {
        const parsed = parseDate(match.date)

        if (!parsed) continue

        const time = parsed.getTime()

        if (!oldest || time < oldest.time) {
            oldest = {
                raw: match.date,
                time,
            }
        }
    }

    return oldest?.raw ?? null
}

function getLatestPatch(matches: Match[]): string | null {
    const patches = matches
        .map((match) => match.patch)
        .filter(Boolean)
        .sort((a, b) => comparePatch(b, a))

    return patches[0] ?? null
}

function parsePatchParts(patch: string): number[] {
    return patch
        .split(".")
        .map((part) => Number(part.replace(/[^\d]/g, "")))
        .map((part) => (Number.isFinite(part) ? part : 0))
}

function comparePatch(a: string, b: string): number {
    const aParts = parsePatchParts(a)
    const bParts = parsePatchParts(b)
    const maxLength = Math.max(aParts.length, bParts.length)

    for (let index = 0; index < maxLength; index += 1) {
        const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0)

        if (diff !== 0) {
            return diff
        }
    }

    return a.localeCompare(b)
}

export function DataSourceInfo({
                                   isUsingSampleData,
                                   matches,
                                   syncReport,
                               }: DataSourceInfoProps) {
    const { t } = useTranslation()
    const [isVisible, setIsVisible] = useState(true)

    const dataSummary = useMemo(() => {
        const oldestDate = getOldestMatchDate(matches)
        const latestDate = getLatestMatchDate(matches)
        const latestPatch = getLatestPatch(matches)

        return {
            oldestDate,
            latestDate,
            latestPatch,
            matchCount: matches.length,
        }
    }, [matches])

    const lastSyncDate = syncReport?.syncFinishedAt ?? syncReport?.syncStartedAt
    const reportFromDate = syncReport?.dateRange?.from
    const reportToDate = syncReport?.dateRange?.to

    const oldestMatchDate = reportFromDate ?? dataSummary.oldestDate
    const latestMatchDate = reportToDate ?? dataSummary.latestDate

    if (!isVisible) {
        return null
    }

    if (isUsingSampleData) {
        return (
            <div className="datasource-badge sample">
                <span>{t("ds_sampleActive")}</span>
                <span className="datasource-meta">{t("ds_sampleNote")}</span>
                <button
                    type="button"
                    className="datasource-close"
                    onClick={() => setIsVisible(false)}
                    aria-label={t("ds_dismiss")}
                    title={t("ds_dismiss")}
                >
                    ×
                </button>
            </div>
        )
    }

    return (
        <div className="datasource-badge synced">
            <span>{t("ds_synced")}</span>

            <span className="datasource-meta">
                {t("ds_lastSync")} {formatDateTime(lastSyncDate)}
            </span>

            <span className="datasource-meta">
                {t("ds_dataUpTo")} {formatDate(latestMatchDate)}
            </span>

            <span className="datasource-meta">
                {t("ds_dateRange")} {formatDate(oldestMatchDate)} – {formatDate(latestMatchDate)}
            </span>

            {dataSummary.latestPatch && (
                <span className="datasource-meta">
                    {t("ds_latestPatch")} {dataSummary.latestPatch}
                </span>
            )}

            <span className="datasource-meta">
                {t("ds_matches")} {dataSummary.matchCount.toLocaleString("de-DE")}
            </span>

            <button
                type="button"
                className="datasource-close"
                onClick={() => setIsVisible(false)}
                aria-label={t("ds_dismiss")}
                title={t("ds_dismiss")}
            >
                ×
            </button>
        </div>
    )
}