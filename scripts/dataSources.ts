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
    googleDriveFileId: "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm",
    enabled: true,
    sourceWebsite: "https://oracleselixir.com/tools/downloads",
    notes:
      "Trage hier die File-ID einer konkreten CSV aus dem öffentlichen Oracle's-Elixir-Google-Drive-Ordner ein. " +
      "Ordner: https://drive.google.com/drive/u/0/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH",
  },
]

export function getEnabledSources(sources: DataSource[]): DataSource[] {
  return sources.filter((s) => s.enabled && s.googleDriveFileId && s.googleDriveFileId !== "PASTE_FILE_ID_HERE")
}
