import type { SyncReport } from "../domain/types"

export function createEmptyReport(outputFile: string): SyncReport {
  const now = new Date().toISOString()
  return {
    syncStartedAt: now,
    syncFinishedAt: now,
    sourcesProcessed: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    downloadedFiles: [],
    rowsRead: 0,
    gamesDetected: 0,
    matchesImported: 0,
    matchesSkipped: 0,
    warnings: [],
    errors: [],
    detectedPatches: [],
    detectedLeagues: [],
    detectedTournaments: [],
    dateRange: null,
    bansDetected: false,
    outputFile,
  }
}

export function finishReport(report: SyncReport): SyncReport {
  return { ...report, syncFinishedAt: new Date().toISOString() }
}
