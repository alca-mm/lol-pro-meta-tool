/**
 * npm run data:pack
 *
 * Komprimiert public/data/importedMatches.json → public/data/importedMatches.json.gz
 * Die .gz-Datei kann ins Repo committed werden als Last-known-good Fallback.
 * Sie wird von GitHub Actions beim nächsten Sync automatisch entpackt.
 *
 * Nach manuellem CSV-Sync:
 *   npm run sync:data
 *   npm run data:pack
 *   git add public/data/importedMatches.json.gz
 *   git commit -m "chore: update last-known-good data fallback"
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { gzip as gzipCallback, gunzip as gunzipCallback } from "node:zlib"
import { promisify } from "node:util"

const gzipAsync = promisify(gzipCallback)
const gunzipAsync = promisify(gunzipCallback)

export async function gzipBuffer(input: Buffer): Promise<Buffer> {
  return gzipAsync(input)
}

export async function gunzipBuffer(input: Buffer): Promise<Buffer> {
  return gunzipAsync(input)
}

const projectRoot = process.cwd()
const inputFile = resolve(projectRoot, "public", "data", "importedMatches.json")
const outputFile = resolve(projectRoot, "public", "data", "importedMatches.json.gz")

async function pack() {
  const input = readFileSync(inputFile)
  const compressed = await gzipBuffer(input)
  writeFileSync(outputFile, compressed)

  const inputMb = Math.round(input.length / 1024 / 1024)
  const outputKb = Math.round(compressed.length / 1024)
  const ratio = Math.round((1 - compressed.length / input.length) * 100)

  console.log(`✓ importedMatches.json → importedMatches.json.gz`)
  console.log(`  ${inputMb} MB → ${outputKb} KB (${ratio}% kleiner)`)
  console.log(`  Datei zum Committen: public/data/importedMatches.json.gz`)
}

pack().catch((err) => {
  console.error("Fehler beim Packen:", err)
  process.exit(1)
})
