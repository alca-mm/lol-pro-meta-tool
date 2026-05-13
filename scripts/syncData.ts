/**
 * npm run sync:data
 *
 * Downloads configured Oracle's Elixir CSV files from Google Drive,
 * converts them to Match[] format and writes src/data/importedMatches.json.
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { dataSources, getEnabledSources } from "./dataSources.js"
import { downloadCsvContent, saveCsvToFile } from "./googleDriveDownload.js"
import { parseCsvWithHeaders } from "../src/import/parseCsv.js"
import { mapOracleElixirCsvToMatches } from "../src/import/oracleElixirMapper.js"
import { validateMatches } from "../src/import/validateMatches.js"
import { createEmptyReport, finishReport } from "../src/import/importReport.js"
import { buildSyncStatusResult } from "./syncStatus.js"
import type { SyncReport } from "../src/domain/types.js"

const projectRoot = process.cwd()
const outputFile = resolve(projectRoot, "public", "data", "importedMatches.json")
const appReportFile = resolve(projectRoot, "public", "data", "latest-sync-report.json")
const rawDataDir = resolve(projectRoot, "data", "raw")
const reportsDir = resolve(projectRoot, "data", "reports")
const appDataDir = resolve(projectRoot, "public", "data")

mkdirSync(rawDataDir, { recursive: true })
mkdirSync(reportsDir, { recursive: true })
mkdirSync(appDataDir, { recursive: true })

async function run() {
  const report: SyncReport = createEmptyReport(outputFile)
  report.syncStartedAt = new Date().toISOString()

  const enabled = getEnabledSources(dataSources)
  report.sourcesProcessed = enabled.length

  if (enabled.length === 0) {
    console.log("ℹ  Keine aktive Datenquelle konfiguriert.")
    console.log("   Trage in scripts/dataSources.ts eine Google-Drive-File-ID ein und setze enabled: true.")
    writeFileSync(outputFile, "[]", "utf8")
    report.errors.push("Keine aktiven Datenquellen konfiguriert")
    const done = finishReport(report)
    writeReport(done)
    console.log(`   Bericht: ${join(reportsDir, "latest-sync-report.json")}`)
    console.log(`   App-Bericht: ${appReportFile}`)
    return
  }

  const allMatches: ReturnType<typeof validateMatches> = []

  for (const source of enabled) {
    console.log(`\n→ Verarbeite: ${source.name}`)
    console.log(`  File-ID: ${source.googleDriveFileId}`)

    const dlResult = await downloadCsvContent(source.googleDriveFileId)

    if (!dlResult.success || !dlResult.content) {
      console.error(`  ✗ Download fehlgeschlagen: ${dlResult.error}`)
      report.errors.push(`[${source.id}] ${dlResult.error}`)
      report.sourcesFailed++
      continue
    }

    console.log(`  ✓ Download erfolgreich (${Math.round(dlResult.content.length / 1024)} KB)`)

    const rawPath = join(rawDataDir, `${source.id}.csv`)
    try {
      saveCsvToFile(dlResult.content, rawPath)
      report.downloadedFiles.push(rawPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`  ⚠ Konnte CSV nicht speichern: ${msg}`)
    }

    const rows = parseCsvWithHeaders(dlResult.content)
    report.rowsRead += rows.length
    console.log(`  Zeilen gelesen: ${rows.length}`)

    const { matches, warnings, skipped } = mapOracleElixirCsvToMatches(rows)
    report.gamesDetected += matches.length + skipped
    report.matchesSkipped += skipped

    for (const w of warnings) {
      console.warn(`  ⚠ ${w}`)
      report.warnings.push(`[${source.id}] ${w}`)
    }

    const valid = validateMatches(matches as unknown[])
    const invalCount = matches.length - valid.length
    if (invalCount > 0) {
      report.warnings.push(`[${source.id}] ${invalCount} Matches nach Validierung entfernt`)
    }

    console.log(`  Spiele erkannt: ${matches.length + skipped}  |  übersprungen: ${skipped}  |  gültig: ${valid.length}`)
    report.matchesImported += valid.length
    report.sourcesSucceeded++
    allMatches.push(...valid)
  }

  report.detectedPatches = [...new Set(allMatches.map((m) => m.patch))].sort()
  report.detectedLeagues = [...new Set(allMatches.map((m) => m.region))].sort()
  report.detectedTournaments = [...new Set(allMatches.map((m) => m.tournament))].sort()
  report.bansDetected = allMatches.some((m) => m.bans.length > 0)

  const dates = allMatches.map((m) => m.date).filter(Boolean).sort()
  if (dates.length > 0) {
    report.dateRange = { from: dates[0], to: dates[dates.length - 1] }
  }

  writeFileSync(outputFile, JSON.stringify(allMatches, null, 2), "utf8")
  const done = finishReport(report)
  writeReport(done)

  const status = buildSyncStatusResult({
    sourcesSucceeded: done.sourcesSucceeded,
    sourcesProcessed: done.sourcesProcessed,
    sourcesFailed: done.sourcesFailed,
    matchesImported: done.matchesImported,
    errors: done.errors,
  })

  console.log("\n─── Sync abgeschlossen ───────────────────────────────")
  console.log(`Quellen verarbeitet : ${done.sourcesProcessed}`)
  console.log(`Quellen erfolgreich : ${done.sourcesSucceeded}`)
  console.log(`Matches importiert  : ${done.matchesImported}`)
  console.log(`Warnungen           : ${done.warnings.length}`)
  console.log(`Fehler              : ${done.errors.length}`)
  console.log(`Ausgabe             : ${outputFile}`)
  console.log(`Bericht             : ${join(reportsDir, "latest-sync-report.json")}`)
  console.log(`App-Bericht         : ${appReportFile}`)

  for (const line of status.summaryLines) {
    if (status.exitCode === 0) {
      console.log(line)
    } else {
      console.error(line)
    }
  }

  if (status.exitCode !== 0) {
    process.exit(1)
  }
}

function writeReport(report: SyncReport) {
  const reportJson = JSON.stringify(report, null, 2)

  const reportPath = join(reportsDir, "latest-sync-report.json")
  writeFileSync(reportPath, reportJson, "utf8")

  writeFileSync(appReportFile, reportJson, "utf8")
}

run().catch((err) => {
  console.error("Unerwarteter Fehler:", err)
  process.exit(1)
})