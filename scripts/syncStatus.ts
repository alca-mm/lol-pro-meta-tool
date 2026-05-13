export type SyncStatusInput = {
    sourcesSucceeded: number
    matchesImported: number
    sourcesProcessed: number
    sourcesFailed: number
    errors: string[]
}

/**
 * Determines exit code and status label for a sync run.
 *
 * Exit code 0 (success/partial-success):
 *   - At least one source succeeded AND at least one valid match was imported.
 *   - Errors from other sources are preserved in the report but don't block deploy.
 *
 * Exit code 1 (failure):
 *   - No source succeeded, OR zero valid matches imported, OR fatal error.
 */
export function getSyncExitStatus(summary: SyncStatusInput): 0 | 1 {
    if (summary.sourcesSucceeded > 0 && summary.matchesImported > 0) return 0
    return 1
}

export type SyncStatusResult = {
    exitCode: 0 | 1
    label: "success" | "partial" | "failure"
    summaryLines: string[]
}

export function buildSyncStatusResult(summary: SyncStatusInput): SyncStatusResult {
    const exitCode = getSyncExitStatus(summary)
    const isPartial = exitCode === 0 && summary.errors.length > 0

    if (exitCode === 1) {
        const reason =
            summary.sourcesSucceeded === 0
                ? "Keine Quelle konnte verarbeitet werden."
                : "Keine validen Matches importiert."
        return {
            exitCode: 1,
            label: "failure",
            summaryLines: [`✗  Sync fehlgeschlagen: ${reason}`],
        }
    }

    if (isPartial) {
        return {
            exitCode: 0,
            label: "partial",
            summaryLines: [
                `⚠  Teilweise erfolgreich: ${summary.sourcesSucceeded}/${summary.sourcesProcessed} Quellen verarbeitet, ${summary.sourcesFailed} Quellen fehlgeschlagen.`,
                `   Deploy wird fortgesetzt, weil ${summary.matchesImported} valide Matches importiert wurden.`,
            ],
        }
    }

    return {
        exitCode: 0,
        label: "success",
        summaryLines: [`✓  Sync vollständig erfolgreich.`],
    }
}
