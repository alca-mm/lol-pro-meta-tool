import { createWriteStream, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface DownloadResult {
  success: boolean
  content?: string
  error?: string
}

/** Builds the Google Drive direct-download URL from a file ID. */
export function buildDownloadUrl(fileId: string): string {
  if (!fileId || !fileId.trim()) {
    throw new Error("File-ID darf nicht leer sein")
  }
  return `https://drive.google.com/uc?export=download&id=${fileId.trim()}`
}

/**
 * Returns true if the content looks like CSV rather than an HTML error page.
 * Google Drive returns HTML when the file is not publicly accessible or when
 * a large-file confirmation page is shown.
 */
export function isPlausibleCsv(content: string): boolean {
  const trimmed = content.trimStart()
  if (
    trimmed.startsWith("<!") ||
    trimmed.toLowerCase().startsWith("<html") ||
    trimmed.toLowerCase().startsWith("<!doctype")
  ) {
    return false
  }
  return true
}

/**
 * Downloads a Google Drive file by File-ID and returns its text content.
 * Does NOT follow complex confirmation flows — aborts with a clear error if
 * the response is HTML (confirmation page or access denied).
 */
export async function downloadCsvContent(fileId: string): Promise<DownloadResult> {
  const url = buildDownloadUrl(fileId)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "lol-pro-meta-tool/0.1 (data-sync)" },
      redirect: "follow",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Netzwerkfehler beim Download: ${msg}` }
  }

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status} beim Download von File-ID ${fileId}`,
    }
  }

  let text: string
  try {
    text = await response.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Fehler beim Lesen der Antwort: ${msg}` }
  }

  if (!isPlausibleCsv(text)) {
    return {
      success: false,
      error:
        `Die Antwort für File-ID "${fileId}" ist kein CSV, sondern HTML. ` +
        "Mögliche Ursachen: Datei ist nicht öffentlich freigegeben, " +
        "oder Google Drive zeigt eine Bestätigungsseite für große Dateien. " +
        "Lösung: Stelle sicher, dass die Datei mit 'Jeder mit dem Link' geteilt ist. " +
        "Bei großen Dateien ggf. manuelle CSV-Bereitstellung notwendig (siehe README).",
    }
  }

  return { success: true, content: text }
}

/** Saves CSV content to a local file path, creating parent directories. */
export function saveCsvToFile(content: string, destPath: string): void {
  mkdirSync(dirname(destPath), { recursive: true })
  const stream = createWriteStream(destPath, { encoding: "utf8" })
  stream.write(content)
  stream.end()
}
