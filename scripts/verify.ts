/**
 * `npm run verify` — die vollständige Standard-Verifikationskette aus CLAUDE.md §11,
 * mit einem protokollierten Exit-Code je Befehl.
 *
 * WARUM ES DAS GIBT: Die Change-MD zu 0.7.4 hat die Kette unvollständig dokumentiert.
 * `npm ci` fehlte ganz, und `npm run typecheck` war durch den direkten Aufruf
 * `npx tsc --noEmit -p tsconfig.json` ERSETZT statt ergänzt. Beides war ein
 * Protokollierungsfehler, kein Verifikationsfehler, aber genau diese Fehlerklasse
 * verschwindet erst, wenn die Kette an einer Stelle steht und nicht in jeder
 * Change-MD von Hand abgeschrieben wird.
 *
 * Der Unterschied zwischen `npm run typecheck` und `npx tsc -p tsconfig.json` ist
 * nicht kosmetisch: der direkte Aufruf belegt den Compiler-Lauf, aber nicht, dass
 * das Script in package.json noch auf dieselbe Konfiguration zeigt. Eine geänderte
 * Script-Definition bliebe unbemerkt. Deshalb ruft dieses Tool ausschließlich
 * npm-Scripts auf und nie einen Compiler direkt.
 *
 * ------------------------------------------------------------------------------
 * ACHTUNG, DER GRUND FÜR `node scripts/verify.ts` STATT `tsx scripts/verify.ts`:
 *
 * Dieses Tool läuft mit dem NACKTEN Node und benutzt ausschließlich `node:`-Builtins.
 * Das ist keine Stilfrage, es ist die einzige Variante, die funktioniert. Schritt 1
 * der Kette ist `npm ci`, und `npm ci` löscht `node_modules` vollständig. Ein unter
 * `tsx` laufender Runner hält dabei `node_modules/@esbuild/<platform>/esbuild.exe`
 * als lebenden Kindprozess. Gemessen am 2026-08-24 unter Windows:
 *
 *     npm error code EPERM
 *     npm error syscall unlink
 *     npm error path ...\node_modules\@esbuild\win32-x64\esbuild.exe
 *
 * `npm ci` schlägt also fehl, und zwar ausgerechnet im ersten Schritt der Kette, die
 * beweisen soll, dass alles grün ist. Node 24 (siehe `.nvmrc` und `engines.node`)
 * führt TypeScript nativ per Type-Stripping aus, damit bleibt der Projektstil (TS
 * unter `scripts/`, erfasst von `npm run typecheck:tools`) erhalten, ohne dass das
 * Tool von `node_modules` abhängt.
 *
 * FOLGE FÜR DIESE DATEI: nur erasable syntax. Keine `enum`, keine `namespace`, keine
 * Parameter-Properties, kein `experimental-transform-types`. Ein Test in
 * `tests/verifyChain.test.ts` friert ein, dass das Script auf `node` und nicht auf
 * `tsx` zeigt.
 * ------------------------------------------------------------------------------
 *
 * KEINE SHELL. Die Befehle werden ohne `shell: true` gestartet. Auf Windows ist `npm`
 * eine `npm.cmd`, die Node seit CVE-2024-27980 nur noch mit `shell: true` startet, und
 * `shell: true` löst zusätzlich DEP0190 aus (Argumente werden konkateniert statt
 * escaped). Beides wird umgangen, indem nicht `npm` gestartet wird, sondern
 * `process.execPath` (das laufende Node-Binary) mit dem npm-CLI-Skript aus
 * `process.env.npm_execpath`. Dieser Weg ist auf Windows, macOS und Linux Zeichen für
 * Zeichen derselbe Code-Pfad.
 */

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Ein Schritt der Kette: der Anzeigename und die Argumente für die npm-CLI. */
export interface VerifyStep {
  /** Was im Protokoll steht. Identisch mit dem Befehl, den ein Mensch tippen würde. */
  readonly label: string
  /** Argumente für die npm-CLI, ohne das Wort `npm`. */
  readonly args: readonly string[]
}

/**
 * Die Kette, in genau dieser Reihenfolge.
 *
 * Zwei Eigenschaften der Reihenfolge sind nicht verhandelbar und von Tests gepinnt:
 *
 * 1. `npm ci` steht zuerst. Alles danach soll gegen exakt die Abhängigkeiten laufen,
 *    die `package-lock.json` festschreibt, nicht gegen einen gewachsenen lokalen Stand.
 * 2. `check:dist` steht nach `build`. Der Guard prüft `dist/`, und ohne vorherigen
 *    Build prüft er entweder einen alten Stand oder gar nichts.
 *
 * `typecheck:all` wiederholt die drei Einzel-Typechecks und ist damit redundant. Das
 * ist Absicht: CLAUDE.md §11 nennt alle vier, weil die Einzelscripts die
 * Fehlerzuordnung im Log verbessern (so ruft CI sie auf) und `typecheck:all` der
 * lokale Sammelbefehl ist. Wer hier einen davon streicht, weicht von der
 * dokumentierten Kette ab.
 */
export const VERIFY_STEPS: readonly VerifyStep[] = [
  { label: "npm ci", args: ["ci"] },
  { label: "npm test", args: ["test"] },
  { label: "npm run typecheck", args: ["run", "typecheck"] },
  { label: "npm run typecheck:tools", args: ["run", "typecheck:tools"] },
  { label: "npm run typecheck:tests", args: ["run", "typecheck:tests"] },
  { label: "npm run typecheck:all", args: ["run", "typecheck:all"] },
  { label: "npm run build", args: ["run", "build"] },
  { label: "npm run check:dist", args: ["run", "check:dist"] },
]

/**
 * Die npm-Scripts, die die Kette voraussetzt.
 *
 * Abgeleitet aus {@link VERIFY_STEPS}, nicht danebengeschrieben: ein Schritt der Form
 * `npm run <name>` verlangt `<name>` in package.json. `ci` und `test` sind
 * npm-Builtins und stehen deshalb nicht drin (`test` ist zwar zusätzlich als Script
 * definiert, aber nicht, weil die Kette es verlangt).
 */
export function requiredNpmScripts(steps: readonly VerifyStep[] = VERIFY_STEPS): string[] {
  return steps.filter((step) => step.args[0] === "run").map((step) => step.args[1] ?? "")
}

/**
 * Der Exit-Code, mit dem sich `verify` beendet, wenn ein Schritt so ausgegangen ist.
 *
 * PUR und getrennt vom Prozess, damit das Fehlerverhalten ohne echte Subprozesse
 * testbar ist.
 *
 * Die Regeln, und warum sie so sind:
 *
 * * `status === 0` ohne Signal ist der einzige Erfolg. Ein `0` neben einem Signal ist
 *   kein Erfolg, sondern ein abgebrochener Prozess, der zufällig nichts gemeldet hat.
 * * Ein Spawn-Fehler (`error`) heißt: der Befehl lief nie. Das ist ein Fehlschlag, und
 *   zwar einer, der ohne eigenen Code daherkommt, also `1`.
 * * `status === null` (durch Signal beendet) wird zu `1`. Das Signal selbst steht im
 *   Protokoll, aber es taugt nicht als Exit-Code.
 * * Ein Code AUSSERHALB von 1 bis 255 wird zu `1`. Das ist kein Kosmetikfall: unter
 *   Windows meldet ein fehlgeschlagenes `npm ci` schon einmal `4294963248` (das ist
 *   `-4048` als vorzeichenlose 32-Bit-Zahl). `process.exit(4294963248)` würde vom
 *   Betriebssystem auf `240` maskiert, also auf einen Code, der mit dem echten Fehler
 *   nichts zu tun hat. Der ROHE Wert bleibt im Protokoll sichtbar, nur der
 *   weitergereichte Code wird auf etwas Sinnvolles gezogen.
 */
export function resolveExitCode(result: {
  status: number | null
  signal?: NodeJS.Signals | null
  error?: Error | undefined
}): number {
  if (result.error !== undefined) return 1
  if (result.signal !== undefined && result.signal !== null) return 1
  if (result.status === null) return 1
  if (!Number.isInteger(result.status)) return 1
  if (result.status === 0) return 0
  if (result.status < 1 || result.status > 255) return 1
  return result.status
}

/**
 * Der Pfad zum npm-CLI-Skript, das diesen Prozess gestartet hat.
 *
 * npm setzt `npm_execpath` für jedes Lifecycle-Script, und `verify` IST ein
 * npm-Script. Fehlt die Variable, wurde das Tool direkt mit `node scripts/verify.ts`
 * aufgerufen. Dann bricht es mit einer klaren Meldung ab, statt auf `shell: true`
 * auszuweichen: ein zweiter Startweg wäre ein zweiter Code-Pfad, der sich auf Windows
 * anders verhält als auf POSIX, und genau das soll dieses Tool nicht haben.
 */
export function npmCliPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const execPath = env.npm_execpath
  if (typeof execPath !== "string" || execPath.trim() === "") return null
  if (!execPath.endsWith(".js") && !execPath.endsWith(".cjs") && !execPath.endsWith(".mjs")) {
    return null
  }
  return execPath
}

/** Eine Trennlinie, damit die Ausgabe der acht Befehle im Terminal lesbar bleibt. */
const RULE = "-".repeat(72)

/** Was ein Lauf eines einzelnen Befehls hinterlaesst, so wie `spawnSync` es meldet. */
export interface StepResult {
  status: number | null
  signal?: NodeJS.Signals | null
  error?: Error | undefined
}

/** Das Ergebnis der ganzen Kette. */
export interface ChainResult {
  /** Der Exit-Code des Prozesses. 0 nur, wenn ALLE Schritte grün waren. */
  readonly exitCode: number
  /** Die Labels der Schritte, die tatsächlich gelaufen sind, in Reihenfolge. */
  readonly executed: readonly string[]
  /** Das Label des gescheiterten Schritts, sonst `null`. */
  readonly failedStep: string | null
}

/**
 * Die Kette abarbeiten und beim ERSTEN Fehler abbrechen.
 *
 * Der Befehlsstart (`run`) und die Ausgabe (`log`) sind hereingereicht statt fest
 * verdrahtet. Das ist derselbe Grund, aus dem im Projekt `scoutImportHelpers.ts` und
 * `pluralMessage()` neben und nicht in ihren Komponenten liegen: eine Regel, die nur
 * innerhalb eines echten Subprozess-Laufs existiert, ist nicht testbar.
 *
 * Und sie war es kurz auch nicht: Eine Mutationsprobe hat `return exitCode` durch
 * `continue` ersetzt, wodurch ein roter Befehl die Kette nicht mehr stoppte, und ALLE
 * Guards blieben grün. Genau diese Zusage ist die wichtigste des Tools, deshalb steht
 * sie jetzt hier und nicht in der Schleife von {@link runChain}.
 */
export function runSteps(
  steps: readonly VerifyStep[],
  run: (step: VerifyStep, index: number) => StepResult,
  log: (line: string) => void = () => {},
): ChainResult {
  const total = steps.length
  const executed: string[] = []

  for (const [index, step] of steps.entries()) {
    log(`\n${RULE}\nverify: [${index + 1}/${total}] ${step.label}\n${RULE}\n`)
    executed.push(step.label)

    const result = run(step, index)
    const exitCode = resolveExitCode(result)

    if (exitCode === 0) {
      log(`verify: [${index + 1}/${total}] ${step.label} -> exit 0\n`)
      continue
    }

    // Der ROHE Befund zuerst, dann der weitergereichte Code. Die beiden koennen
    // auseinanderfallen (siehe resolveExitCode), und dann muss man beide sehen.
    log(
      `\n${RULE}\n` +
        `verify: FEHLGESCHLAGEN bei [${index + 1}/${total}] ${step.label}\n` +
        `verify: status=${String(result.status)} signal=${String(result.signal ?? null)}` +
        `${result.error ? ` error=${result.error.name}: ${result.error.message}` : ""}\n` +
        `verify: Abbruch, ${total - index - 1} Befehl(e) wurden NICHT ausgefuehrt.\n` +
        `verify: Exit-Code ${exitCode}\n${RULE}\n`,
    )
    return { exitCode, executed, failedStep: step.label }
  }

  log(`\n${RULE}\nverify: alle ${total} Befehle gruen (exit 0)\n${RULE}\n`)
  return { exitCode: 0, executed, failedStep: null }
}

function runChain(): number {
  const cli = npmCliPath()
  if (cli === null) {
    process.stderr.write(
      "verify: npm_execpath ist nicht gesetzt.\n" +
        "verify: Bitte ueber 'npm run verify' starten, nicht direkt ueber node.\n",
    )
    return 1
  }

  process.stdout.write(
    `${RULE}\nverify: ${VERIFY_STEPS.length} Befehle, Abbruch beim ersten Fehler\n${RULE}\n`,
  )

  // `stdio: "inherit"` — die Ausgabe der Werkzeuge geht ungefiltert durch. Ein
  // Runner, der Testausgaben oder Compilerfehler einsammelt und zusammenfasst,
  // waere genau die Schicht, hinter der ein Fehler verschwinden kann.
  const result = runSteps(
    VERIFY_STEPS,
    (step) => spawnSync(process.execPath, [cli, ...step.args], { stdio: "inherit" }),
    (line) => process.stdout.write(line),
  )
  return result.exitCode
}

// Nur ausfuehren, wenn diese Datei der Einstiegspunkt ist. Ohne diese Schranke
// wuerde `tests/verifyChain.test.ts` beim blossen Import die ganze Kette starten.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  process.exit(runChain())
}
