import { useMemo, useState } from "react"
import { useTranslation } from "../i18n/LanguageContext"
import { formatDateNumeric, formatDateTimeNumeric, formatNumber } from "../i18n/format"
import type { Lang } from "../i18n/types"
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
    /**
     * True when match data loaded but the sync report fetch failed. Renders a
     * compact, non-critical warning inside the synced badge. Optional/defaults
     * to false so existing call sites keep working.
     */
    syncReportFailed?: boolean
}

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) {
        return null
    }

    return parsed
}

/**
 * A sync/match date for the badge, in the active language.
 *
 * Stays module-level and pure, so `lang` and the translated "unknown" label
 * are threaded in as arguments rather than read from a hook. `unknownLabel` is
 * `t("ds_unknownDate")` at the call site: this used to be a hardcoded German
 * word, which an English user read right next to `08/21/2026`.
 *
 * Three fallbacks, in order: no value at all -> the label; a value that is not
 * a date -> the raw string, so the user sees what the data actually says; a
 * `Date` the formatter refuses (`formatDateNumeric` answers `""` for an
 * invalid one) -> the raw string as well. `parseDate` already rules that last
 * case out, but a bare `formatted` return would render an empty gap after the
 * "Letzter Sync:" label if it ever stopped doing so.
 */
function formatDate(value: string | null | undefined, lang: Lang, unknownLabel: string): string {
    if (!value) return unknownLabel

    const parsed = parseDate(value)

    if (!parsed) {
        return value
    }

    return formatDateNumeric(parsed, lang) || value
}

/** {@link formatDate} plus the time. Same fallback chain, same reasons. */
function formatDateTime(value: string | null | undefined, lang: Lang, unknownLabel: string): string {
    if (!value) return unknownLabel

    const parsed = parseDate(value)

    if (!parsed) {
        return value
    }

    return formatDateTimeNumeric(parsed, lang) || value
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
                                   syncReportFailed = false,
                               }: DataSourceInfoProps) {
    const { t, lang } = useTranslation()
    const [isVisible, setIsVisible] = useState(true)
    // Read once: the two module-level date helpers take it as an argument,
    // because they must stay pure and cannot call `t` themselves.
    const unknownDate = t("ds_unknownDate")

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
                {t("ds_lastSync")} {formatDateTime(lastSyncDate, lang, unknownDate)}
            </span>

            <span className="datasource-meta">
                {t("ds_dataUpTo")} {formatDate(latestMatchDate, lang, unknownDate)}
            </span>

            <span className="datasource-meta">
                {t("ds_dateRange")} {formatDate(oldestMatchDate, lang, unknownDate)} – {formatDate(latestMatchDate, lang, unknownDate)}
            </span>

            {dataSummary.latestPatch && (
                <span className="datasource-meta">
                    {t("ds_latestPatch")} {dataSummary.latestPatch}
                </span>
            )}

            <span className="datasource-meta">
                {t("ds_matches")} {formatNumber(dataSummary.matchCount, lang)}
            </span>

            {syncReportFailed && (
                <span className="datasource-warning" role="status">
                    {t("dataLoad_syncReportError")}
                </span>
            )}

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