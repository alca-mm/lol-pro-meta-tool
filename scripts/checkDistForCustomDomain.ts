/**
 * npm run check:dist
 *
 * Guard gegen die Custom-Domain-Regression auf https://aatroxtool.de/.
 *
 * Der Build muss root-relative Asset-Pfade (/assets/...) erzeugen — NICHT den
 * GitHub-Pages-Projektpfad (/lol-pro-meta-tool/assets/...). Genau dieser Fehler
 * hat die Live-Seite schon einmal komplett leer ausgeliefert.
 *
 * Ablauf (lokal und in CI):
 *   npm run build
 *   npm run check:dist
 *
 * Es werden immer ALLE Probleme gesammelt und gebündelt ausgegeben, damit ein
 * CI-Log den kompletten Befund zeigt. Exit-Code 0 = alles in Ordnung,
 * Exit-Code 1 = mindestens ein Check ist fehlgeschlagen.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"

export const EXPECTED_CNAME = "aatroxtool.de"
export const ASSET_PREFIX = "/assets/"
export const PROJECT_PATH_MARKER = "/lol-pro-meta-tool/assets/"
export const DOUBLE_SLASH_MARKER = "//assets/"

export type AssetKind = "js" | "css"

export interface AssetReference {
  /** "src" oder "href" */
  attribute: string
  /** Roher Attributwert inkl. eventueller Query-/Hash-Anteile */
  value: string
  /** Attributwert ohne Query/Hash */
  path: string
  kind: AssetKind
  /** 1-basierte Zeilennummer in dist/index.html */
  line: number
}

export interface CheckResult {
  errors: string[]
  info: string[]
}

const ASSET_ATTRIBUTE_PATTERN = /\b(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/** Kürzt Werte für Fehlermeldungen, damit nie ganze Dateiinhalte im Log landen. */
function truncate(value: string, maxLength = 80): string {
  const collapsed = value.replace(/\s+/g, " ").trim()
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}...` : collapsed
}

function lineOf(text: string, index: number): number {
  const limit = Math.min(index, text.length)
  let line = 1
  for (let i = 0; i < limit; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1
    }
  }
  return line
}

function classifyAsset(path: string): AssetKind | null {
  const lower = path.toLowerCase()
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
    return "js"
  }
  if (lower.endsWith(".css")) {
    return "css"
  }
  return null
}

function findLinesContaining(text: string, needle: string): number[] {
  const lines: number[] = []
  let index = text.indexOf(needle)
  while (index !== -1) {
    lines.push(lineOf(text, index))
    index = text.indexOf(needle, index + 1)
  }
  return lines
}

/**
 * Extrahiert alle JS-/CSS-Referenzen aus src=/href=-Attributen.
 * Erfasst damit <script src>, <link rel="stylesheet" href> und
 * <link rel="modulepreload" href>, jeweils mit " oder ' als Quotes.
 */
export function extractAssetReferences(html: string): AssetReference[] {
  const pattern = new RegExp(ASSET_ATTRIBUTE_PATTERN.source, ASSET_ATTRIBUTE_PATTERN.flags)
  const references: AssetReference[] = []
  let match: RegExpExecArray | null = pattern.exec(html)

  while (match !== null) {
    const value = (match[2] ?? match[3] ?? "").trim()
    const path = value.split("?")[0].split("#")[0]
    const kind = classifyAsset(path)

    if (kind !== null) {
      references.push({
        attribute: match[1].toLowerCase(),
        value,
        path,
        kind,
        line: lineOf(html, match.index),
      })
    }

    match = pattern.exec(html)
  }

  return references
}

/**
 * Jede JS-/CSS-Referenz muss root-relativ unter /assets/ liegen, und es muss
 * mindestens je eine JS- und eine CSS-Referenz geben.
 */
export function validateAssetReferences(references: AssetReference[]): string[] {
  const errors: string[] = []

  for (const reference of references) {
    if (!reference.path.startsWith(ASSET_PREFIX)) {
      errors.push(
        `dist/index.html:${reference.line} — ${reference.attribute}="${truncate(reference.value)}" ist kein root-relativer Asset-Pfad. ` +
          `Erwartet: Pfad beginnt mit "${ASSET_PREFIX}" (Custom Domain https://aatroxtool.de/), gefunden: "${truncate(reference.path)}".`,
      )
    }
  }

  const jsCount = references.filter((reference) => reference.kind === "js").length
  const cssCount = references.filter((reference) => reference.kind === "css").length

  if (jsCount === 0) {
    errors.push(
      'dist/index.html enthält keine einzige JS-Referenz. Erwartet: mindestens ein <script type="module" src="/assets/index-<hash>.js">. ' +
        "Entweder ist der Build kaputt oder die Extraktion greift nicht mehr.",
    )
  }

  if (cssCount === 0) {
    errors.push(
      'dist/index.html enthält keine einzige CSS-Referenz. Erwartet: mindestens ein <link rel="stylesheet" href="/assets/index-<hash>.css">. ' +
        "Entweder ist der Build kaputt oder die Extraktion greift nicht mehr.",
    )
  }

  return errors
}

/** Verbotene Pfadmuster, die die Custom Domain live zerlegen. */
export function findForbiddenAssetPatterns(html: string): string[] {
  const errors: string[] = []

  const projectPathLines = findLinesContaining(html, PROJECT_PATH_MARKER)
  if (projectPathLines.length > 0) {
    errors.push(
      `dist/index.html enthält den GitHub-Pages-Projektpfad "${PROJECT_PATH_MARKER}" (Zeile(n): ${projectPathLines.join(", ")}). ` +
        `Für die Custom Domain https://aatroxtool.de/ müssen die Pfade root-relativ sein ("${ASSET_PREFIX}"). ` +
        "Ursache ist in der Regel ein gesetztes VITE_BASE_PATH beim Build.",
    )
  }

  const doubleSlashLines = findLinesContaining(html, DOUBLE_SLASH_MARKER)
  if (doubleSlashLines.length > 0) {
    errors.push(
      `dist/index.html enthält "${DOUBLE_SLASH_MARKER}" (Zeile(n): ${doubleSlashLines.join(", ")}). ` +
        `Doppelte bzw. protokoll-relative Slashes brechen das Laden der Assets. Erwartet: "${ASSET_PREFIX}".`,
    )
  }

  return errors
}

/** Vergleicht einen CNAME-Inhalt mit der erwarteten Domain (Rand-Whitespace toleriert). */
export function checkCnameContent(raw: string, label: string): string[] {
  const trimmed = raw.trim()
  if (trimmed === EXPECTED_CNAME) {
    return []
  }
  return [
    `${label} enthält nicht die erwartete Domain. Erwartet exakt: "${EXPECTED_CNAME}", gefunden: "${truncate(trimmed)}".`,
  ]
}

function checkCnameFile(filePath: string, label: string): CheckResult {
  if (!existsSync(filePath)) {
    return {
      errors: [
        `${label} nicht gefunden. Ohne CNAME fällt GitHub Pages auf die Projekt-URL zurück und https://aatroxtool.de/ bricht.`,
      ],
      info: [],
    }
  }

  const errors = checkCnameContent(readFileSync(filePath, "utf8"), label)

  return {
    errors,
    info: errors.length === 0 ? [`${label} — Domain "${EXPECTED_CNAME}" bestätigt`] : [],
  }
}

/** Führt alle Checks aus und liefert gesammelte Fehler plus Erfolgsinfos. */
export function runChecks(projectRoot: string): CheckResult {
  const errors: string[] = []
  const info: string[] = []

  const distDir = resolve(projectRoot, "dist")
  const indexFile = join(distDir, "index.html")

  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    errors.push("dist/ nicht gefunden — bitte zuerst `npm run build` ausführen.")
  } else if (!existsSync(indexFile)) {
    errors.push(
      "dist/index.html nicht gefunden — der Build hat keine index.html erzeugt. Bitte `npm run build` erneut ausführen.",
    )
  } else {
    const html = readFileSync(indexFile, "utf8")
    const references = extractAssetReferences(html)

    errors.push(...findForbiddenAssetPatterns(html))
    errors.push(...validateAssetReferences(references))

    for (const reference of references) {
      if (!reference.path.startsWith(ASSET_PREFIX)) {
        continue
      }
      if (!existsSync(join(distDir, reference.path))) {
        errors.push(
          `dist/index.html:${reference.line} referenziert "${truncate(reference.path)}", ` +
            `aber die Datei fehlt unter "dist${truncate(reference.path)}".`,
        )
      }
    }

    const jsCount = references.filter((reference) => reference.kind === "js").length
    const cssCount = references.filter((reference) => reference.kind === "css").length

    info.push(`dist/index.html — ${jsCount} JS-, ${cssCount} CSS-Referenz(en) gefunden`)
    for (const reference of references) {
      info.push(`  ${reference.kind === "js" ? "JS " : "CSS"} ${reference.path}`)
    }
  }

  const publicCname = checkCnameFile(resolve(projectRoot, "public", "CNAME"), "public/CNAME")
  errors.push(...publicCname.errors)
  info.push(...publicCname.info)

  const distCname = checkCnameFile(join(distDir, "CNAME"), "dist/CNAME")
  errors.push(...distCname.errors)
  info.push(...distCname.info)

  return { errors, info }
}

function main(): void {
  console.log("→ Prüfe dist/ für Custom Domain https://aatroxtool.de/")

  const { errors, info } = runChecks(process.cwd())

  for (const line of info) {
    console.log(line)
  }

  if (errors.length > 0) {
    console.error("")
    console.error(`✗ ${errors.length} Problem(e) gefunden:`)
    errors.forEach((error, index) => {
      console.error(`  ${index + 1}. ${error}`)
    })
    console.error("")
    console.error("Dieser Build darf NICHT auf https://aatroxtool.de/ deployt werden.")
    // Kein process.exit() — das würde in CI (stdout/stderr sind Pipes) die gepufferte
    // Ausgabe abschneiden, also genau die Diagnose, für die dieser Guard existiert.
    process.exitCode = 1
    return
  }

  console.log("")
  console.log("✓ Alle Checks bestanden:")
  console.log("  - dist/index.html vorhanden")
  console.log(`  - JS-/CSS-Assets root-relativ unter "${ASSET_PREFIX}"`)
  console.log(`  - kein "${PROJECT_PATH_MARKER}"`)
  console.log(`  - kein "${DOUBLE_SLASH_MARKER}"`)
  console.log("  - alle referenzierten Assets existieren in dist/")
  console.log(`  - public/CNAME und dist/CNAME == "${EXPECTED_CNAME}"`)
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return resolve(entry).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
}

if (isDirectRun()) {
  main()
} else if (!process.env.VITEST) {
  // Fail-Loud: Wird die Datei weder direkt ausgeführt noch von Vitest importiert,
  // ist der Entry-Point nicht erkannt worden (anderer tsx-Pfad, Symlink,
  // case-sensitives FS in CI). Ohne diesen Zweig endete der Prozess mit Exit 0,
  // obwohl NICHTS geprüft wurde — ein grüner CI-Step für einen kaputten Build.
  console.error(
    "check:dist: Entry-Point nicht erkannt — der Guard hat NICHTS geprüft. " +
      "Dieser Build darf NICHT deployt werden.",
  )
  process.exitCode = 1
}
