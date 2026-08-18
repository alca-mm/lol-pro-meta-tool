import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  ASSET_PREFIX,
  DOUBLE_SLASH_MARKER,
  EXPECTED_CNAME,
  PROJECT_PATH_MARKER,
  checkCnameContent,
  extractAssetReferences,
  findForbiddenAssetPatterns,
  runChecks,
  validateAssetReferences,
} from "../scripts/checkDistForCustomDomain"

/** So sieht die von Vite erzeugte dist/index.html für die Custom Domain aus. */
const GOOD_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <title>Aatroxtool</title>
  <script type="module" crossorigin src="/assets/index-DVpvGvr-.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/LanguageContext-D1IfMQoj.js">
  <link rel="stylesheet" crossorigin href="/assets/index-xUbbHxq0.css">
</head>
<body>
<div id="root"></div>
</body>
</html>
`

/** Der Live-Bug: Build mit gesetztem VITE_BASE_PATH für den Projektpfad. */
const PROJECT_PATH_HTML = GOOD_HTML.split(ASSET_PREFIX).join(PROJECT_PATH_MARKER)

/** Der zweite Bug: base '//' erzeugt protokoll-relative Pfade. */
const DOUBLE_SLASH_HTML = GOOD_HTML.split(ASSET_PREFIX).join(DOUBLE_SLASH_MARKER)

describe("extractAssetReferences", () => {
  it("erfasst script src, stylesheet href und modulepreload href", () => {
    const references = extractAssetReferences(GOOD_HTML)

    expect(references.map((reference) => reference.path)).toEqual([
      "/assets/index-DVpvGvr-.js",
      "/assets/LanguageContext-D1IfMQoj.js",
      "/assets/index-xUbbHxq0.css",
    ])
    expect(references.map((reference) => reference.kind)).toEqual(["js", "js", "css"])
    expect(references.map((reference) => reference.attribute)).toEqual(["src", "href", "href"])
  })

  it("ignoriert Nicht-JS/CSS-Referenzen wie das Favicon", () => {
    const paths = extractAssetReferences(GOOD_HTML).map((reference) => reference.path)
    expect(paths).not.toContain("/favicon.png")
  })

  it("versteht einfache Anführungszeichen und Query-/Hash-Anteile", () => {
    const references = extractAssetReferences(
      `<script src='/assets/app.js?v=2'></script><link href='/assets/app.css#top' rel='stylesheet'>`,
    )

    expect(references.map((reference) => reference.path)).toEqual(["/assets/app.js", "/assets/app.css"])
  })

  it("liefert die 1-basierte Zeilennummer der Referenz", () => {
    const references = extractAssetReferences(GOOD_HTML)
    expect(references[0].line).toBe(7)
    expect(references[2].line).toBe(9)
  })
})

describe("validateAssetReferences", () => {
  it("akzeptiert root-relative Assets (Positivfall)", () => {
    expect(validateAssetReferences(extractAssetReferences(GOOD_HTML))).toEqual([])
  })

  it("meldet Assets unter dem GitHub-Pages-Projektpfad (Negativfall)", () => {
    const errors = validateAssetReferences(extractAssetReferences(PROJECT_PATH_HTML))

    expect(errors).toHaveLength(3)
    expect(errors[0]).toContain(PROJECT_PATH_MARKER)
    expect(errors[0]).toContain("dist/index.html:7")
  })

  it("meldet protokoll-relative Pfade (Negativfall)", () => {
    const errors = validateAssetReferences(extractAssetReferences(DOUBLE_SLASH_HTML))
    expect(errors).toHaveLength(3)
  })

  it("meldet fehlende JS-Referenz", () => {
    const cssOnly = extractAssetReferences(`<link rel="stylesheet" href="/assets/index.css">`)
    const errors = validateAssetReferences(cssOnly)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("keine einzige JS-Referenz")
  })

  it("meldet fehlende CSS-Referenz", () => {
    const jsOnly = extractAssetReferences(`<script type="module" src="/assets/index.js"></script>`)
    const errors = validateAssetReferences(jsOnly)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("keine einzige CSS-Referenz")
  })

  it("meldet beide fehlenden Kategorien bei leerem HTML", () => {
    expect(validateAssetReferences(extractAssetReferences("<html></html>"))).toHaveLength(2)
  })
})

describe("findForbiddenAssetPatterns", () => {
  it("findet nichts in einer korrekten index.html (Positivfall)", () => {
    expect(findForbiddenAssetPatterns(GOOD_HTML)).toEqual([])
  })

  it("findet den Projektpfad inklusive Zeilennummern (Negativfall)", () => {
    const errors = findForbiddenAssetPatterns(PROJECT_PATH_HTML)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(PROJECT_PATH_MARKER)
    expect(errors[0]).toContain("7, 8, 9")
  })

  it("findet doppelte Slashes (Negativfall)", () => {
    const errors = findForbiddenAssetPatterns(DOUBLE_SLASH_HTML)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(DOUBLE_SLASH_MARKER)
  })

  it("meldet beide Muster gebündelt statt beim ersten Treffer abzubrechen", () => {
    const html = `<script src="${PROJECT_PATH_MARKER}a.js"></script><link href="${DOUBLE_SLASH_MARKER}a.css">`
    expect(findForbiddenAssetPatterns(html)).toHaveLength(2)
  })
})

describe("checkCnameContent", () => {
  it("akzeptiert die exakte Domain mit und ohne Rand-Whitespace", () => {
    expect(checkCnameContent(EXPECTED_CNAME, "public/CNAME")).toEqual([])
    expect(checkCnameContent(`${EXPECTED_CNAME}\n`, "public/CNAME")).toEqual([])
    expect(checkCnameContent(`  ${EXPECTED_CNAME}\r\n`, "dist/CNAME")).toEqual([])
  })

  it("lehnt eine andere oder leere Domain ab", () => {
    expect(checkCnameContent("www.aatroxtool.de", "public/CNAME")).toHaveLength(1)
    expect(checkCnameContent("", "public/CNAME")).toHaveLength(1)
    expect(checkCnameContent("aatroxtool.de\nfoo.de", "public/CNAME")).toHaveLength(1)
  })

  it("nennt Label, Erwartung und Fund in der Fehlermeldung", () => {
    const [error] = checkCnameContent("example.com", "dist/CNAME")

    expect(error).toContain("dist/CNAME")
    expect(error).toContain(EXPECTED_CNAME)
    expect(error).toContain("example.com")
  })
})

/** Die Assets, die GOOD_HTML referenziert — relativ zu dist/. */
const GOOD_HTML_ASSETS = [
  "assets/index-DVpvGvr-.js",
  "assets/LanguageContext-D1IfMQoj.js",
  "assets/index-xUbbHxq0.css",
]

/** Alle in einem Test angelegten Temp-Wurzeln, damit afterEach sicher aufräumt. */
const tempRoots: string[] = []

/**
 * Legt ein Fake-Projekt (dist/ + public/) in einem Temp-Verzeichnis an, das
 * runChecks fehlerfrei durchläuft. Einzelne Tests brechen davon gezielt ein Stück ab.
 */
function createFakeProject(html: string = GOOD_HTML, assets: string[] = GOOD_HTML_ASSETS): string {
  const root = mkdtempSync(join(tmpdir(), "check-dist-"))
  tempRoots.push(root)

  mkdirSync(join(root, "dist", "assets"), { recursive: true })
  mkdirSync(join(root, "public"), { recursive: true })
  writeFileSync(join(root, "dist", "index.html"), html, "utf8")

  for (const asset of assets) {
    writeFileSync(join(root, "dist", asset), "/* fake */", "utf8")
  }

  writeFileSync(join(root, "public", "CNAME"), `${EXPECTED_CNAME}\n`, "utf8")
  writeFileSync(join(root, "dist", "CNAME"), `${EXPECTED_CNAME}\n`, "utf8")

  return root
}

/** Temp-Wurzel ohne jeden Inhalt — für die Fälle "dist/ fehlt komplett". */
function createEmptyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "check-dist-"))
  tempRoots.push(root)
  return root
}

describe("runChecks (Integration gegen echte Verzeichnisse)", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop()
      if (root !== undefined) {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("meldet keinen Fehler für ein vollständig korrektes Projekt (Positivfall)", () => {
    const { errors, info } = runChecks(createFakeProject())

    expect(errors).toEqual([])
    expect(info.join("\n")).toContain("2 JS-, 1 CSS-Referenz(en) gefunden")
    expect(info.join("\n")).toContain("public/CNAME")
    expect(info.join("\n")).toContain("dist/CNAME")
  })

  it("meldet fehlendes dist/ mit Hinweis auf npm run build", () => {
    const { errors } = runChecks(createEmptyRoot())

    expect(errors.some((error) => error.includes("dist/ nicht gefunden"))).toBe(true)
    expect(errors.some((error) => error.includes("npm run build"))).toBe(true)
  })

  it("meldet fehlende dist/index.html bei vorhandenem dist/", () => {
    const root = createFakeProject()
    rmSync(join(root, "dist", "index.html"), { force: true })

    const { errors } = runChecks(root)

    expect(errors.some((error) => error.includes("dist/index.html nicht gefunden"))).toBe(true)
  })

  it("meldet ein referenziertes Asset, das nicht auf Platte liegt", () => {
    const root = createFakeProject()
    rmSync(join(root, "dist", "assets/index-xUbbHxq0.css"), { force: true })

    const { errors } = runChecks(root)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("index-xUbbHxq0.css")
    expect(errors[0]).toContain("die Datei fehlt")
  })

  it("meldet falschen CNAME-Inhalt", () => {
    const root = createFakeProject()
    writeFileSync(join(root, "public", "CNAME"), "example.com\n", "utf8")

    const { errors } = runChecks(root)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("public/CNAME")
    expect(errors[0]).toContain("example.com")
    expect(errors[0]).toContain(EXPECTED_CNAME)
  })

  it("meldet fehlendes public/CNAME", () => {
    const root = createFakeProject()
    rmSync(join(root, "public", "CNAME"), { force: true })

    const { errors } = runChecks(root)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("public/CNAME nicht gefunden")
  })

  it("meldet fehlendes dist/CNAME", () => {
    const root = createFakeProject()
    rmSync(join(root, "dist", "CNAME"), { force: true })

    const { errors } = runChecks(root)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("dist/CNAME nicht gefunden")
  })

  it("meldet den GitHub-Pages-Projektpfad End-to-End (Live-Regression)", () => {
    const { errors } = runChecks(createFakeProject(PROJECT_PATH_HTML, []))

    expect(errors).toHaveLength(4)
    expect(errors.some((error) => error.includes(PROJECT_PATH_MARKER))).toBe(true)
    expect(errors.some((error) => error.includes("kein root-relativer Asset-Pfad"))).toBe(true)
    expect(errors.some((error) => error.includes("CNAME"))).toBe(false)
  })

  it("meldet protokoll-relative Pfade End-to-End", () => {
    const { errors } = runChecks(createFakeProject(DOUBLE_SLASH_HTML, []))

    expect(errors.some((error) => error.includes(DOUBLE_SLASH_MARKER))).toBe(true)
    expect(errors.some((error) => error.includes("CNAME"))).toBe(false)
  })
})
