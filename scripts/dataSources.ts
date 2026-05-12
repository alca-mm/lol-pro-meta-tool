export type DataSourceType = "google-drive-csv"

export interface DataSource {
  id: string
  name: string
  type: DataSourceType
  googleDriveFileId: string
  enabled: boolean
  notes?: string
  sourceWebsite: string
}

/**
 * Explizite Liste der Datenquellen mit Google-Drive-File-IDs.
 *
 * Wie du eine File-ID einträgst:
 *   1. Öffne den Google-Drive-Ordner: https://drive.google.com/drive/u/0/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH
 *   2. Klicke mit der rechten Maustaste auf eine CSV-Datei → "Link abrufen" oder "Share"
 *   3. Die URL sieht so aus: https://drive.google.com/file/d/FILE_ID_HIER/view
 *   4. Kopiere den Teil zwischen /d/ und /view → das ist die File-ID
 *   5. Trage sie unten ein und setze enabled: true
 */
export const dataSources: DataSource[] = [
  {
    id: "oracles-elixir-2024",
    name: "Oracle's Elixir 2024 Pro Play CSV",
    type: "google-drive-csv",
    googleDriveFileId: "1XXk2LO0CsNADBB1LRGOV5rUpyZdEZ8s2",
    enabled: true,
    sourceWebsite: "https://oracleselixir.com/tools/downloads",
    notes: "2024 Oracle's Elixir match data CSV",
  },
  {
    id: "oracles-elixir-2025",
    name: "Oracle's Elixir 2025 Pro Play CSV",
    type: "google-drive-csv",
    googleDriveFileId: "1v6LRphp2kYciU4SXp0PCjEMuev1bDejc",
    enabled: true,
    sourceWebsite: "https://oracleselixir.com/tools/downloads",
    notes: "2025 Oracle's Elixir match data CSV",
  },
  {
    id: "oracles-elixir-2026",
    name: "Oracle's Elixir 2026 Pro Play CSV",
    type: "google-drive-csv",
    googleDriveFileId: "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm",
    enabled: true,
    sourceWebsite: "https://oracleselixir.com/tools/downloads",
    notes: "2026 Oracle's Elixir match data CSV",
  },
]

export function getEnabledSources(sources: DataSource[]): DataSource[] {
  return sources.filter((s) => s.enabled && s.googleDriveFileId && s.googleDriveFileId !== "PASTE_FILE_ID_HERE")
}
