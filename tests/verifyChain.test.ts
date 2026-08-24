/**
 * Guards für `npm run verify` (scripts/verify.ts).
 *
 * Das Tool existiert, weil eine Change-MD die Standardkette unvollständig
 * dokumentiert hat: `npm ci` fehlte, und `npm run typecheck` war durch
 * `npx tsc --noEmit -p tsconfig.json` ERSETZT. Diese Datei friert genau das ein,
 * was dabei schiefgehen kann.
 *
 * Die Kette selbst läuft hier NICHT. Sie dauert Minuten, sie ruft `npm ci` auf und
 * löscht dabei `node_modules` unter dem laufenden Vitest weg. Getestet wird deshalb
 * das, was das Tool ohne Subprozesse hergibt: die Befehlsliste als exportierte
 * Konstante, die abgeleiteten reinen Funktionen und die Kopplung an package.json.
 * Der echte Lauf gehört in die Verifikation und ist dort protokolliert.
 */

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  VERIFY_STEPS,
  npmCliPath,
  requiredNpmScripts,
  resolveExitCode,
  runSteps,
} from "../scripts/verify"
import type { VerifyStep } from "../scripts/verify"

/**
 * Die Kette, wie sie in CLAUDE.md §11 und im Auftrag steht, wörtlich abgeschrieben.
 *
 * Bewusst eine zweite, unabhängige Niederschrift und keine Ableitung aus
 * `VERIFY_STEPS`: eine Ableitung wäre mit jeder Änderung automatisch einverstanden
 * und würde nichts beweisen.
 */
const DOCUMENTED_CHAIN = [
  "npm ci",
  "npm test",
  "npm run typecheck",
  "npm run typecheck:tools",
  "npm run typecheck:tests",
  "npm run typecheck:all",
  "npm run build",
  "npm run check:dist",
] as const

const packageJson = (): { scripts?: Record<string, string> } =>
  JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }

/**
 * Kommentare raus, bevor gescannt wird.
 *
 * Dieselbe Regel wie in den Scout-Guards, und sie ist hier sofort zugeschnappt:
 * `scripts/verify.ts` ERKLÄRT im Modulkopf ausführlich, warum es kein `shell: true`
 * benutzt. Ein Scan auf dem Rohtext haette diese Erklaerung als Verstoss gemeldet.
 * Umgekehrt gilt genauso: wer die Zeile loescht und nur den Kommentar stehen laesst,
 * darf nicht gruen bleiben.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/.*/g, "")

/** Der Quelltext des Tools, ohne Kommentare. */
const verifyScriptSource = (): string => stripComments(readFileSync("scripts/verify.ts", "utf8"))

/** Der rohe Quelltext, fuer die Selbsttests des Scanners. */
const verifyScriptRaw = (): string => readFileSync("scripts/verify.ts", "utf8")

/* -------------------------------------------------------------------------
 * 1. Die Befehlsliste
 * ------------------------------------------------------------------------- */

describe("VERIFY_STEPS ist die dokumentierte Standardkette", () => {
  it("hat genau acht Schritte", () => {
    expect(VERIFY_STEPS).toHaveLength(8)
  })

  it("führt sie in exakt der dokumentierten Reihenfolge", () => {
    expect(VERIFY_STEPS.map((step) => step.label)).toEqual([...DOCUMENTED_CHAIN])
  })

  it("beginnt mit npm ci", () => {
    // Alles danach soll gegen den Stand aus package-lock.json laufen, nicht gegen
    // einen gewachsenen lokalen node_modules-Baum.
    expect(VERIFY_STEPS[0].label).toBe("npm ci")
    expect(VERIFY_STEPS[0].args).toEqual(["ci"])
  })

  it("enthält npm run typecheck als SCRIPT, nicht als direkten tsc-Aufruf", () => {
    // Der eigentliche Anlass für dieses Tool. Ein direkter `tsc`-Aufruf belegt den
    // Compiler-Lauf, aber nicht, dass das npm-Script noch auf dieselbe Config zeigt.
    const typecheck = VERIFY_STEPS.find((step) => step.label === "npm run typecheck")
    expect(typecheck, "npm run typecheck fehlt in der Kette").toBeDefined()
    expect(typecheck?.args).toEqual(["run", "typecheck"])
  })

  it("ruft nirgends tsc, tsx, vite oder vitest direkt auf", () => {
    // Die Kette darf ausschliesslich aus npm-Scripts bestehen. Sonst laeuft verify
    // an genau der package.json vorbei, die es absichern soll.
    for (const step of VERIFY_STEPS) {
      for (const forbidden of ["tsc", "tsx", "npx", "vite", "vitest", "node"]) {
        expect(step.args, `${step.label} ruft ${forbidden} direkt auf`).not.toContain(forbidden)
      }
      expect(step.args[0], `${step.label} ist kein npm-Unterbefehl`).toMatch(/^(ci|test|run)$/)
    }
  })

  it("prüft dist erst NACH dem Build", () => {
    // check:dist liest dist/. Vor dem Build prueft es einen alten Stand oder nichts.
    const build = VERIFY_STEPS.findIndex((step) => step.label === "npm run build")
    const checkDist = VERIFY_STEPS.findIndex((step) => step.label === "npm run check:dist")
    expect(build, "npm run build fehlt").toBeGreaterThanOrEqual(0)
    expect(checkDist, "npm run check:dist fehlt").toBeGreaterThanOrEqual(0)
    expect(checkDist).toBeGreaterThan(build)
  })

  it("trägt keine Shell-Metazeichen und keine Leerzeichen in den Argumenten", () => {
    // Die Argumente gehen ohne `shell: true` an spawnSync. Ein Argument mit einem
    // Leerzeichen oder einem Metazeichen waere ein Hinweis darauf, dass jemand
    // doch wieder eine Kommandozeile zusammenbaut.
    for (const step of VERIFY_STEPS) {
      expect(step.args.length, `${step.label} hat keine Argumente`).toBeGreaterThan(0)
      for (const arg of step.args) {
        expect(arg, `${step.label}: leeres Argument`).not.toBe("")
        expect(arg, `${step.label}: "${arg}" enthaelt Shell-Metazeichen`).toMatch(
          /^[a-zA-Z0-9:._-]+$/,
        )
      }
    }
  })

  it("hat keinen doppelten Schritt", () => {
    const labels = VERIFY_STEPS.map((step) => step.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

/* -------------------------------------------------------------------------
 * 2. Die Kopplung an package.json
 * ------------------------------------------------------------------------- */

describe("die Kette passt zu den Scripts in package.json", () => {
  it("verlangt genau die sechs run-Scripts", () => {
    expect(requiredNpmScripts()).toEqual([
      "typecheck",
      "typecheck:tools",
      "typecheck:tests",
      "typecheck:all",
      "build",
      "check:dist",
    ])
  })

  it("jedes davon existiert wirklich", () => {
    // Der wertvollste Test der Datei: wer ein Script umbenennt, bekommt es hier
    // gesagt statt erst beim naechsten echten verify-Lauf.
    const scripts = packageJson().scripts ?? {}
    for (const name of requiredNpmScripts()) {
      expect(typeof scripts[name], `package.json hat kein Script "${name}"`).toBe("string")
      expect((scripts[name] ?? "").trim().length, `Script "${name}" ist leer`).toBeGreaterThan(0)
    }
  })

  it("verify selbst ist als Script eingetragen und laeuft mit nacktem node", () => {
    // KRITISCH, und der Grund steht im Kopf von scripts/verify.ts: unter `tsx`
    // scheitert Schritt 1 der Kette. `npm ci` loescht node_modules, tsx haelt aber
    // node_modules/@esbuild/<platform>/esbuild.exe als lebenden Kindprozess, und
    // Windows verweigert das Loeschen mit EPERM. Gemessen am 2026-08-24.
    const verify = packageJson().scripts?.verify
    expect(verify, "package.json hat kein Script 'verify'").toBeDefined()
    expect(verify).toBe("node scripts/verify.ts")
    expect(verify, "verify laeuft wieder ueber tsx, dann bricht npm ci mit EPERM ab").not.toContain(
      "tsx",
    )
  })

  it("das Tool importiert nichts ausserhalb der node:-Builtins", () => {
    // Dieselbe Ursache: verify laeuft durch ein `npm ci`, das node_modules
    // waehrend des eigenen Laufs loescht. Ein Import aus node_modules waere eine
    // Wette darauf, dass er vorher vollstaendig geladen war.
    const imports = [...verifyScriptSource().matchAll(/^import[^"']*["']([^"']+)["']/gm)].map(
      (match) => match[1],
    )
    expect(imports.length, "keine Imports gefunden, Scanner kaputt?").toBeGreaterThan(0)
    for (const specifier of imports) {
      expect(specifier, `verify.ts importiert "${specifier}"`).toMatch(/^node:/)
    }
  })
})

/* -------------------------------------------------------------------------
 * 3. Fehlerverhalten, ohne echte Subprozesse
 * ------------------------------------------------------------------------- */

describe("resolveExitCode", () => {
  it("wertet nur eine saubere 0 als Erfolg", () => {
    expect(resolveExitCode({ status: 0, signal: null })).toBe(0)
  })

  it("reicht einen gewöhnlichen Fehlercode unverändert durch", () => {
    expect(resolveExitCode({ status: 1, signal: null })).toBe(1)
    expect(resolveExitCode({ status: 2, signal: null })).toBe(2)
    expect(resolveExitCode({ status: 255, signal: null })).toBe(255)
  })

  it("zieht einen Code ausserhalb von 1..255 auf 1", () => {
    // Der reale Fall: ein fehlgeschlagenes `npm ci` meldete unter Windows
    // 4294963248 (das ist -4048 vorzeichenlos). process.exit() wuerde davon 240
    // uebrig lassen, also einen Code, der mit dem Fehler nichts zu tun hat.
    expect(resolveExitCode({ status: 4294963248, signal: null })).toBe(1)
    expect(resolveExitCode({ status: 256, signal: null })).toBe(1)
    expect(resolveExitCode({ status: -1, signal: null })).toBe(1)
  })

  it("wertet einen Abbruch per Signal als Fehler, auch bei status 0", () => {
    // Ein 0 neben einem Signal ist kein Erfolg, sondern ein abgebrochener Prozess,
    // der zufaellig nichts gemeldet hat.
    expect(resolveExitCode({ status: 0, signal: "SIGTERM" })).toBe(1)
    expect(resolveExitCode({ status: null, signal: "SIGKILL" })).toBe(1)
  })

  it("wertet einen Spawn-Fehler als Fehler", () => {
    // Der Befehl lief nie. Das darf niemals als gruen durchgehen.
    expect(resolveExitCode({ status: null, signal: null, error: new Error("ENOENT") })).toBe(1)
    expect(resolveExitCode({ status: 0, signal: null, error: new Error("ENOENT") })).toBe(1)
  })

  it("wertet status null als Fehler", () => {
    expect(resolveExitCode({ status: null, signal: null })).toBe(1)
  })

  it("wertet einen nicht ganzzahligen Status als Fehler", () => {
    expect(resolveExitCode({ status: Number.NaN, signal: null })).toBe(1)
  })
})

describe("runSteps bricht beim ersten Fehler ab", () => {
  const ok = { status: 0, signal: null }
  const steps: readonly VerifyStep[] = [
    { label: "a", args: ["ci"] },
    { label: "b", args: ["test"] },
    { label: "c", args: ["run", "build"] },
    { label: "d", args: ["run", "check:dist"] },
  ]

  it("laeuft bei lauter Erfolgen komplett durch", () => {
    const result = runSteps(steps, () => ok)
    expect(result.exitCode).toBe(0)
    expect(result.executed).toEqual(["a", "b", "c", "d"])
    expect(result.failedStep).toBeNull()
  })

  it("fuehrt nach einem roten Befehl KEINEN weiteren aus", () => {
    // Die wichtigste Zusage des Tools, und sie war kurzzeitig ungetestet: eine
    // Mutationsprobe ersetzte `return exitCode` durch `continue`, und alle Guards
    // blieben gruen. Deshalb liegt die Schleife jetzt als reine Funktion daneben.
    const seen: string[] = []
    const result = runSteps(steps, (step) => {
      seen.push(step.label)
      return step.label === "b" ? { status: 2, signal: null } : ok
    })

    expect(seen, "c oder d wurde trotz Fehler noch gestartet").toEqual(["a", "b"])
    expect(result.executed).toEqual(["a", "b"])
    expect(result.failedStep).toBe("b")
    expect(result.exitCode, "der Exit-Code des gescheiterten Befehls geht verloren").toBe(2)
  })

  it("bricht schon beim allerersten Befehl ab", () => {
    const seen: string[] = []
    const result = runSteps(steps, (step) => {
      seen.push(step.label)
      return { status: 1, signal: null }
    })

    expect(seen).toEqual(["a"])
    expect(result.exitCode).toBe(1)
    expect(result.failedStep).toBe("a")
  })

  it("meldet den gescheiterten Befehl und die Zahl der uebersprungenen", () => {
    const lines: string[] = []
    runSteps(steps, (step) => (step.label === "c" ? { status: 7, signal: null } : ok), (line) =>
      lines.push(line),
    )
    const log = lines.join("")

    expect(log).toContain("FEHLGESCHLAGEN")
    expect(log, "der gescheiterte Befehl wird nicht benannt").toContain("[3/4] c")
    expect(log, "die uebersprungenen Befehle werden nicht beziffert").toContain(
      "1 Befehl(e) wurden NICHT ausgefuehrt",
    )
    expect(log, "der Exit-Code fehlt im Protokoll").toContain("Exit-Code 7")
    expect(log, "ein Fehlschlag darf nicht als gruen gemeldet werden").not.toContain("alle 4")
  })

  it("protokolliert jeden Befehl mit Namen und Exit-Code", () => {
    // "Fuer jeden Befehl: Name anzeigen, Exit-Code anzeigen."
    const lines: string[] = []
    runSteps(steps, () => ok, (line) => lines.push(line))
    const log = lines.join("")

    for (const [index, step] of steps.entries()) {
      expect(log, `${step.label} fehlt im Protokoll`).toContain(
        `[${index + 1}/${steps.length}] ${step.label}`,
      )
      expect(log, `${step.label} meldet keinen Exit-Code`).toContain(
        `[${index + 1}/${steps.length}] ${step.label} -> exit 0`,
      )
    }
    expect(log).toContain("alle 4 Befehle gruen (exit 0)")
  })

  it("meldet einen leeren Lauf nicht als Fehler, fuehrt aber auch nichts aus", () => {
    const result = runSteps([], () => ok)
    expect(result.exitCode).toBe(0)
    expect(result.executed).toEqual([])
  })
})

describe("npmCliPath", () => {
  it("nimmt den Pfad, den npm gesetzt hat", () => {
    expect(npmCliPath({ npm_execpath: "/usr/lib/node_modules/npm/bin/npm-cli.js" })).toBe(
      "/usr/lib/node_modules/npm/bin/npm-cli.js",
    )
    expect(npmCliPath({ npm_execpath: "C:\\Program Files\\nodejs\\npm-cli.cjs" })).toBe(
      "C:\\Program Files\\nodejs\\npm-cli.cjs",
    )
  })

  it("lehnt eine fehlende oder leere Variable ab", () => {
    expect(npmCliPath({})).toBeNull()
    expect(npmCliPath({ npm_execpath: "" })).toBeNull()
    expect(npmCliPath({ npm_execpath: "   " })).toBeNull()
  })

  it("lehnt eine npm.cmd ab, statt sie ueber eine Shell zu starten", () => {
    // Das ist der Kern der Plattform-Neutralitaet: gestartet wird immer
    // `node <npm-cli.js>`, nie `npm.cmd`. Letzteres braeuchte `shell: true`, und
    // damit haette das Tool auf Windows einen anderen Code-Pfad als auf POSIX.
    expect(npmCliPath({ npm_execpath: "C:\\Program Files\\nodejs\\npm.cmd" })).toBeNull()
    expect(npmCliPath({ npm_execpath: "/usr/local/bin/npm" })).toBeNull()
  })
})

/* -------------------------------------------------------------------------
 * 4. Der Import darf die Kette nicht starten
 * ------------------------------------------------------------------------- */

describe("das Modul ist importierbar, ohne etwas auszufuehren", () => {
  it("startet die Kette nur als Einstiegspunkt", () => {
    // Dass dieser Test ueberhaupt laeuft, ist bereits der halbe Beweis: ohne die
    // Schranke haette der Import oben `npm ci` gestartet. Der Scan haelt zusaetzlich
    // fest, WORAUF die Schranke prueft, damit sie nicht zu `if (true)` verkommt.
    const source = verifyScriptSource()
    expect(source).toContain("const invokedDirectly =")
    expect(source).toContain("resolve(process.argv[1]) === fileURLToPath(import.meta.url)")
    expect(source).toContain("if (invokedDirectly) {")
  })

  it("der Scanner strippt Kommentare wirklich", () => {
    // Anti-Vakuositaet, und zwar beidseitig gepinnt: Das Verbot von `shell: true`
    // ist NUR deshalb gruen, weil der Modulkopf vorher entfernt wird. Bricht der
    // Stripper, meldet der Test unten einen Verstoss, den es nie gab, und der
    // naechste Leser sucht eine Shell, die niemand eingebaut hat.
    expect(stripComments("/* <a> */ const a = 1")).not.toContain("<a>")
    expect(stripComments("const a = 1 // shell: true")).not.toContain("shell")
    expect(stripComments('const u = "https://a.example"')).toContain("https://a.example")

    // ROH muss enthalten sein, GESTRIPPT darf nicht.
    expect(verifyScriptRaw(), "der Modulkopf erklaert shell: true nicht mehr").toContain(
      "shell: true",
    )
    expect(verifyScriptSource()).not.toContain("shell: true")

    // Und der Scanner darf nicht einfach alles wegwerfen.
    expect(verifyScriptSource(), "der Stripper hat den Code mitgenommen").toContain(
      "export const VERIFY_STEPS",
    )
  })

  it("laesst die Ausgabe der Werkzeuge ungefiltert durch", () => {
    // "Keine Ausgabe verschlucken." Ein Runner, der stdout einsammelt, ist die
    // Schicht, hinter der ein Compilerfehler verschwinden kann.
    const source = verifyScriptSource()
    expect(source).toContain('stdio: "inherit"')
    expect(source, "spawnSync mit Shell, das war der Windows-Sonderweg").not.toContain(
      "shell: true",
    )
  })
})
