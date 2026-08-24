/**
 * Drift-Guard zwischen `VERIFY_STEPS` (scripts/verify.ts) und der CI
 * (.github/workflows/deploy.yml).
 *
 * WARUM DAS HIER STEHT UND NICHT IN tests/verifyChain.test.ts: Jene Datei prüft das
 * Werkzeug selbst, diese prüft eine Übereinstimmung zwischen zwei Dateien, die sich
 * nichts voneinander importieren. Die halbe Datei ist außerdem ein
 * YAML-Extraktor samt Selbsttests, und der hat mit der Befehlsliste nichts zu tun.
 *
 * WARUM DER GUARD NÖTIG IST: Die CI ruft die Prüfschritte bewusst EINZELN auf und
 * nicht über `npm run verify`, weil die Fehlerzuordnung im GitHub-Log dann besser
 * ist (CLAUDE.md §11 sagt das ausdrücklich). Der Preis dafür ist, dass es die Kette
 * zweimal gibt. Wer `VERIFY_STEPS` erweitert, ändert die CI nicht mit, und
 * umgekehrt. Genau diese Drift fängt diese Datei ab. Die CI wird NICHT umgebaut.
 *
 * ------------------------------------------------------------------------------
 * KEIN YAML-PARSER. Das Projekt hat keinen, und dieser Guard rechtfertigt keine
 * neue Abhängigkeit. Gelesen wird also mit Text und Regex. Die Grenzen davon sind
 * real und stehen bei {@link extractRunCommands}; sie sind für DIESEN Workflow
 * unkritisch, aber sie sind Grenzen und keine Vollständigkeit.
 * ------------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { VERIFY_STEPS } from "../scripts/verify"
import type { VerifyStep } from "../scripts/verify"

const CI_WORKFLOW = ".github/workflows/deploy.yml"

/* -------------------------------------------------------------------------
 * 0. Die beiden bewusst NICHT einzeln laufenden Befehle
 * ------------------------------------------------------------------------- */

/**
 * Befehle aus {@link VERIFY_STEPS}, die in der CI absichtlich nicht als eigener
 * Step stehen.
 *
 * Das ist eine ALLOWLIST MIT BEGRÜNDUNG, keine Abkürzung. Beide Einträge sind
 * belegt, nicht behauptet, und beide werden weiter unten von einem Rot-Wächter
 * bewacht: taucht ein Befehl doch in der CI auf, wird der Eintrag hier überflüssig
 * und der Test sagt das, statt ihn schweigend liegen zu lassen.
 */
const CI_EXEMPT_COMMANDS: ReadonlyArray<readonly [command: string, why: string]> = [
  [
    "npm run typecheck",
    'laeuft in der CI als Teil von "npm run build" ("tsc && vite build"). Der blanke ' +
      "tsc dort nutzt tsconfig.json, also dieselbe Config und dieselbe include-Liste " +
      'wie "npm run typecheck". Am 2026-08-24 gegengemessen: ein eingebauter Typfehler ' +
      "in src/lib/isRecord.ts liefert bei beiden Aufrufen exit 1 und woertlich " +
      "dieselbe Meldung TS2322.",
  ],
  [
    "npm run typecheck:all",
    "ist der lokale Sammelbefehl. CLAUDE.md Paragraph 11 haelt ausdruecklich fest, " +
      "dass die CI stattdessen die Einzelscripts aufruft, weil das die " +
      "Fehlerzuordnung im Log verbessert. Seine drei Bestandteile laufen alle: " +
      "typecheck ueber den Build, typecheck:tools und typecheck:tests woertlich.",
  ],
]

const isExempt = (command: string): boolean =>
  CI_EXEMPT_COMMANDS.some(([exempt]) => exempt === command)

/* -------------------------------------------------------------------------
 * 1. Den Workflow lesen
 * ------------------------------------------------------------------------- */

const readWorkflow = (): string => readFileSync(CI_WORKFLOW, "utf8")

/**
 * Alle Kommandozeilen aus den `run:`-Feldern eines Workflows, in Dokumentreihenfolge.
 *
 * Beherrscht wird:
 *
 * * `run: npm ci` als Einzeiler.
 * * `run: |` und `run: >` als Block, dessen Zeilen staerker eingerueckt sind.
 * * Ganzzeilige `#`-Kommentare, die uebersprungen werden.
 * * Mit `&&` verkettete Befehle, die in ihre Teile zerlegt werden.
 *
 * BEWUSST NICHT BEHERRSCHT, und das ist die ehrliche Grenze eines Regex-Lesers:
 *
 * * Ein `#` MITTEN in einer Kommandozeile wird nicht als Kommentar erkannt. Fuer
 *   diesen Workflow richtig, denn dort ist jedes `#` ganzzeilig, und ein `#` in
 *   einer Shell-Zeile waere ohnehin meist Teil des Befehls.
 * * YAML-Anker, Aliase und mehrzeilige Flow-Skalare.
 * * `if:`-Bedingungen. Ein Step, der nur unter einer Bedingung laeuft, zaehlt hier
 *   trotzdem als vorhanden. Der Workflow hat aktuell keine solche Bedingung an
 *   einem Pruefschritt; ein Test weiter unten haelt das fest.
 * * Verkettung ueber `;` oder `||`. Ueber `||` laeuft im Workflow nur ein
 *   curl-Fallback, ueber `;` nichts.
 */
export function extractRunCommands(yaml: string): string[] {
  const commands: string[] = []
  const lines = yaml.split(/\r?\n/)

  let blockIndent: number | null = null

  const push = (raw: string): void => {
    for (const part of raw.split("&&")) {
      const normalized = part.trim().replace(/\s+/g, " ")
      if (normalized !== "") commands.push(normalized)
    }
  }

  const indentOf = (line: string): number => line.length - line.trimStart().length

  for (const line of lines) {
    const trimmed = line.trim()

    // Innerhalb eines Blocks: alles mitnehmen, was staerker eingerueckt ist als
    // das `run:` selbst. Eine Leerzeile beendet den Block nicht.
    if (blockIndent !== null) {
      if (trimmed === "") continue
      if (indentOf(line) > blockIndent) {
        if (!trimmed.startsWith("#")) push(trimmed)
        continue
      }
      blockIndent = null
    }

    if (trimmed.startsWith("#")) continue

    const match = /^(\s*)-?\s*run:\s*(.*)$/.exec(line)
    if (match === null) continue

    const value = (match[2] ?? "").trim()
    // Block-Skalar-Indikatoren: | > mit optionalem - oder + und optionaler Zahl.
    if (value === "" || /^[|>][-+]?\d*$/.test(value)) {
      blockIndent = indentOf(line)
      continue
    }
    push(value)
  }

  return commands
}

/** Nur die npm-Aufrufe, in Reihenfolge. */
const npmCommands = (commands: readonly string[]): string[] =>
  commands.filter((command) => /^npm(\s|$)/.test(command))

/**
 * Ist dieser npm-Aufruf ein PRUEFSCHRITT, oder ein Deploy-Schritt?
 *
 * Der Guard muss beide Richtungen abdecken. „VERIFY_STEPS enthaelt etwas, das die
 * CI nicht faehrt" ist die offensichtliche Drift. Die andere ist genauso echt: ein
 * Pruefbefehl steht in der CI, aber nicht mehr in `VERIFY_STEPS`, und damit prueft
 * `npm run verify` lokal WENIGER als die CI. Ohne diese Unterscheidung war die
 * zweite Richtung nicht prüfbar, denn dann müsste jeder zusätzliche CI-Schritt in
 * `VERIFY_STEPS` stehen, und Deploy-Schritte sollen ausdrücklich erlaubt bleiben.
 *
 * Erkannt wird das vorhandene Prüf-Vokabular des Projekts: `ci`, `test`, alles mit
 * `typecheck`, `build` und alles mit `check:`. Deploy- und Datenschritte wie
 * `sync:data`, `data:pack`, `preview` oder `dev` fallen bewusst NICHT darunter.
 *
 * BEKANNTE GRENZE: ein neu erfundener Prüfbefehl mit unbekanntem Namen, etwa
 * `npm run lint`, würde hier nicht als Prüfschritt erkannt. Ein solches Script gibt
 * es im Projekt nicht; ein Test unten pinnt, dass das Muster alle sechs echten
 * CI-Prüfbefehle trifft, damit es nicht unbemerkt ins Leere läuft.
 */
const isVerificationCommand = (command: string): boolean =>
  /^npm (ci|test)$/.test(command) ||
  /^npm run (test|build|typecheck(:[\w-]+)?|check:[\w-]+)$/.test(command)

/** Der Befehl, den ein Schritt WIRKLICH startet, aus den Argumenten gebaut. */
const commandOf = (step: VerifyStep): string => ["npm", ...step.args].join(" ")

const workflowCommands = (): string[] => extractRunCommands(readWorkflow())
const workflowNpmCommands = (): string[] => npmCommands(workflowCommands())

/* -------------------------------------------------------------------------
 * 2. Selbsttests des Extraktors
 * ------------------------------------------------------------------------- */

describe("extractRunCommands", () => {
  it("liest einen einzeiligen run-Eintrag", () => {
    expect(extractRunCommands("      - name: X\n        run: npm ci\n")).toEqual(["npm ci"])
  })

  it("liest einen mehrzeiligen run-Block", () => {
    const yaml = [
      "      - name: Block",
      "        run: |",
      "          mkdir -p public/data",
      "          npm run sync:data",
      "      - name: Danach",
      "        run: npm test",
    ].join("\n")

    expect(extractRunCommands(yaml)).toEqual([
      "mkdir -p public/data",
      "npm run sync:data",
      "npm test",
    ])
  })

  it("beendet einen Block an der naechsten gleich eingerueckten Zeile", () => {
    // Sonst frisst der Block den Rest der Datei und jeder Befehl gilt als
    // vorhanden, egal wo er steht.
    const yaml = [
      "        run: |",
      "          echo drin",
      "        env:",
      "          FOO: bar",
      "        run: npm test",
    ].join("\n")

    // `env:` ist genauso eingerueckt wie `run:`, beendet den Block also. `FOO: bar`
    // steht danach im env-Mapping und ist KEIN Kommando: es darf nicht mitgelesen
    // werden, und das `run:` dahinter muss wieder greifen.
    expect(extractRunCommands(yaml)).toEqual(["echo drin", "npm test"])
    expect(extractRunCommands(yaml)).not.toContain("FOO: bar")
  })

  it("ueberspringt ganzzeilige Kommentare, auch im Block", () => {
    const yaml = [
      "      # run: npm run boese",
      "      - name: X",
      "        run: |",
      "          # npm run auch-boese",
      "          npm ci",
    ].join("\n")

    expect(extractRunCommands(yaml)).toEqual(["npm ci"])
  })

  it("zerlegt eine &&-Kette", () => {
    expect(extractRunCommands("        run: npm run build && npm run check:dist")).toEqual([
      "npm run build",
      "npm run check:dist",
    ])
  })

  it("normalisiert Whitespace", () => {
    expect(extractRunCommands("        run:    npm    run   build   ")).toEqual(["npm run build"])
  })

  it("findet nichts in einem Workflow ohne run-Eintrag", () => {
    const yaml = ["jobs:", "  build:", "    steps:", "      - uses: actions/checkout@v5"].join("\n")
    expect(extractRunCommands(yaml)).toEqual([])
  })

  it("liest ein run: am Listenanfang, nicht nur ein eingerruecktes", () => {
    // `- run: npm ci` ohne vorangestelltes `name:` ist gueltiges YAML und kommt in
    // Workflows haeufig vor. Ein Regex, der nur die eingerueckte Form kennt,
    // uebersaehe den Schritt und meldete ihn als fehlend.
    expect(extractRunCommands("      - run: npm ci\n")).toEqual(["npm ci"])
    expect(extractRunCommands("      - run: |\n          npm test\n")).toEqual(["npm test"])
  })

  it("liest den echten Workflow und findet mehr als nur eine Handvoll", () => {
    // Anti-Vakuositaet: Ein Extraktor, der [] liefert, wuerde jede
    // "kommt nicht vor"-Behauptung erfuellen und jede Reihenfolge-Pruefung
    // trivial bestehen. Die Pflichtbefehle stehen unten namentlich.
    const commands = workflowCommands()
    expect(commands.length, `${CI_WORKFLOW} liefert kaum run-Zeilen, Extraktor kaputt?`).toBeGreaterThan(
      8,
    )
    expect(workflowNpmCommands().length, "keine npm-Befehle im Workflow gefunden").toBeGreaterThan(4)
  })
})

/* -------------------------------------------------------------------------
 * 3. Der eigentliche Drift-Guard
 * ------------------------------------------------------------------------- */

describe("die CI faehrt dieselbe Verifikationskette wie VERIFY_STEPS", () => {
  it("fuehrt jeden Schritt aus, der nicht ausdruecklich ausgenommen ist", () => {
    const ci = workflowNpmCommands()
    const missing = VERIFY_STEPS.map(commandOf)
      .filter((command) => !isExempt(command))
      .filter((command) => !ci.includes(command))

    expect(
      missing,
      `Diese Befehle stehen in VERIFY_STEPS, aber nicht in ${CI_WORKFLOW}: ` +
        `${missing.join(", ")}. Entweder den Step im Workflow ergaenzen, oder ihn ` +
        "mit Begruendung in CI_EXEMPT_COMMANDS aufnehmen. Nicht einfach hier " +
        `streichen. Gefunden wurden: ${ci.join(" | ")}`,
    ).toEqual([])
  })

  it("faehrt keinen Pruefschritt, den VERIFY_STEPS nicht kennt", () => {
    // Die GEGENRICHTUNG, und sie fehlte im ersten Anlauf. Eine Mutationsprobe
    // strich `npm test` aus VERIFY_STEPS und der Guard blieb gruen: die CI prueft
    // dann mehr als `npm run verify`, die lokale Kette ist also schwaecher als die
    // CI, und niemand erfaehrt es. Deploy-Schritte bleiben davon unberuehrt, siehe
    // isVerificationCommand.
    const known = VERIFY_STEPS.map(commandOf)
    const extra = workflowNpmCommands()
      .filter(isVerificationCommand)
      .filter((command) => !known.includes(command))

    expect(
      [...new Set(extra)],
      `${CI_WORKFLOW} faehrt diese Pruefbefehle, VERIFY_STEPS kennt sie nicht: ` +
        `${extra.join(", ")}. Entweder in VERIFY_STEPS aufnehmen, damit ` +
        '"npm run verify" lokal dasselbe prueft, oder aus der CI entfernen.',
    ).toEqual([])
  })

  it("das Pruefschritt-Muster trifft alle sechs echten CI-Befehle", () => {
    // Anti-Vakuositaet fuer isVerificationCommand: ein Muster, das nichts trifft,
    // wuerde die Gegenrichtung oben stumm schalten.
    const ci = workflowNpmCommands()
    const checks = ci.filter(isVerificationCommand)
    expect(checks).toEqual([
      "npm ci",
      "npm test",
      "npm run typecheck:tools",
      "npm run typecheck:tests",
      "npm run build",
      "npm run check:dist",
    ])

    // Und es darf nicht ALLES treffen, sonst waere jeder Deploy-Schritt ein
    // Pruefschritt und zusaetzliche Steps waeren verboten.
    expect(ci.filter((command) => !isVerificationCommand(command))).toContain("npm run sync:data")
    expect(isVerificationCommand("npm run data:pack")).toBe(false)
    expect(isVerificationCommand("npm run preview")).toBe(false)
    expect(isVerificationCommand("npm run verify")).toBe(false)
  })

  it("nennt die sechs Befehle, die wirklich als eigener Step laufen", () => {
    // Namentlich, nicht nur als Zahl: eine Zahl bliebe gruen, wenn ein Befehl
    // gegen einen anderen getauscht wird.
    const ci = workflowNpmCommands()
    for (const command of [
      "npm ci",
      "npm test",
      "npm run typecheck:tools",
      "npm run typecheck:tests",
      "npm run build",
      "npm run check:dist",
    ]) {
      expect(ci, `${CI_WORKFLOW} ruft "${command}" nicht auf`).toContain(command)
    }
  })

  it("haelt die Reihenfolge der gemeinsamen Befehle exakt ein", () => {
    // Die vollstaendige relative Reihenfolge, nicht nur einzelne Paare: von den
    // acht Schritten laufen sechs in der CI, und deren Reihenfolge dort ist
    // Zeichen fuer Zeichen die aus VERIFY_STEPS. Zusaetzliche Deploy-Steps
    // dazwischen stoeren nicht, sie werden herausgefiltert.
    const expected = VERIFY_STEPS.map(commandOf).filter((command) => !isExempt(command))
    const actual = workflowNpmCommands().filter((command) => expected.includes(command))

    expect(
      actual,
      "Die Reihenfolge in der CI weicht von VERIFY_STEPS ab. Erwartet: " +
        `${expected.join(" -> ")}. Gefunden: ${actual.join(" -> ")}`,
    ).toEqual(expected)
  })

  it("installiert vor jeder Pruefung", () => {
    // Ausdruecklich benannt, obwohl die Reihenfolgepruefung es mit abdeckt: die
    // Meldung soll sagen, WAS kaputt ist, nicht nur dass zwei Listen ungleich sind.
    const ci = workflowNpmCommands()
    const install = ci.indexOf("npm ci")
    expect(install, `${CI_WORKFLOW} ruft "npm ci" nicht auf`).toBeGreaterThanOrEqual(0)

    const checks = VERIFY_STEPS.map(commandOf).filter((command) => command !== "npm ci")
    for (const command of checks) {
      const at = ci.indexOf(command)
      if (at < 0) continue
      expect(at, `"${command}" laeuft in der CI VOR "npm ci"`).toBeGreaterThan(install)
    }
  })

  it("prueft dist erst nach dem Build", () => {
    const ci = workflowNpmCommands()
    const build = ci.indexOf("npm run build")
    const checkDist = ci.indexOf("npm run check:dist")

    expect(build, "npm run build fehlt in der CI").toBeGreaterThanOrEqual(0)
    expect(checkDist, "npm run check:dist fehlt in der CI").toBeGreaterThanOrEqual(0)
    expect(
      checkDist,
      "npm run check:dist laeuft VOR npm run build. Der Guard liest dist/ und " +
        "wuerde dann einen alten Stand oder gar nichts pruefen.",
    ).toBeGreaterThan(build)
  })

  it("ersetzt keinen Typecheck durch einen direkten Compileraufruf", () => {
    // Derselbe Fehler, der 0.7.4 in der Change-MD passiert ist, nur eine Ebene
    // tiefer: ein direkter tsc-Aufruf laeuft an package.json vorbei.
    const offenders = workflowCommands().filter(
      (command) => /(^|\s)(npx|pnpm|yarn)\s/.test(command) || /(^|\s)tsc(\s|$)/.test(command),
    )
    expect(
      offenders,
      `${CI_WORKFLOW} ruft einen Compiler oder Paketrunner direkt auf: ` +
        `${offenders.join(", ")}. Die Kette soll ausschliesslich npm-Scripts fahren, ` +
        "sonst belegt sie den Lauf, aber nicht die Script-Definition.",
    ).toEqual([])
  })
})

/* -------------------------------------------------------------------------
 * 4. Die Ausnahmen, und was sie voraussetzen
 * ------------------------------------------------------------------------- */

describe("die CI-Ausnahmen sind begruendet und noch noetig", () => {
  it("beschreibt jede Ausnahme in ganzen Saetzen", () => {
    expect(CI_EXEMPT_COMMANDS.length, "die Allowlist ist leer geworden").toBeGreaterThan(0)
    for (const [command, why] of CI_EXEMPT_COMMANDS) {
      expect(why.length, `${command} hat keine brauchbare Begruendung`).toBeGreaterThan(60)
    }
  })

  it("nimmt nur Befehle aus, die es in VERIFY_STEPS ueberhaupt gibt", () => {
    const known = VERIFY_STEPS.map(commandOf)
    for (const [command] of CI_EXEMPT_COMMANDS) {
      expect(known, `"${command}" ist ausgenommen, steht aber gar nicht in VERIFY_STEPS`).toContain(
        command,
      )
    }
  })

  it("ROT-WAECHTER: meldet eine Ausnahme, die ueberfluessig geworden ist", () => {
    // Wenn die CI den Befehl inzwischen doch einzeln aufruft, gehoert der Eintrag
    // raus. Eine Allowlist, die niemand aufraeumt, verdeckt irgendwann etwas.
    const ci = workflowNpmCommands()
    const obsolete = CI_EXEMPT_COMMANDS.filter(([command]) => ci.includes(command)).map(
      ([command]) => command,
    )
    expect(
      obsolete,
      `Diese Befehle stehen in CI_EXEMPT_COMMANDS, laufen in ${CI_WORKFLOW} aber ` +
        `inzwischen doch als eigener Step: ${obsolete.join(", ")}. Eintrag entfernen.`,
    ).toEqual([])
  })

  it("die Ausnahme fuer npm run typecheck haengt daran, dass der Build tsc faehrt", () => {
    // DIE Voraussetzung der ersten Ausnahme. Wird "build" zu "vite build", ist der
    // App-Typecheck in der CI ersatzlos weg, und zwar lautlos.
    const scripts = (
      JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }
    ).scripts
    const build = scripts?.build ?? ""

    expect(
      build,
      'Das build-Script faehrt kein tsc mehr. Damit deckt die CI "npm run typecheck" ' +
        "nicht mehr ab, und die Ausnahme in CI_EXEMPT_COMMANDS ist falsch geworden: " +
        "entweder tsc zurueck in den Build, oder einen eigenen Typecheck-Step in den " +
        "Workflow.",
    ).toMatch(/(^|\s|&)tsc(\s|$)/)
    expect(build).toBe("tsc && vite build")
  })

  it("kein Pruefschritt der Kette haengt an einer if-Bedingung", () => {
    // Grenze des Regex-Lesers, hier abgesichert statt verschwiegen: der Extraktor
    // sieht `if:` nicht. Solange kein Pruefschritt eine Bedingung traegt, zaehlt
    // "steht im Workflow" auch als "laeuft".
    const yaml = readWorkflow()
    const conditional = [...yaml.matchAll(/^\s+if:.*$/gm)].map((match) => match[0].trim())
    expect(
      conditional,
      "Der Workflow hat jetzt bedingte Steps. Dieser Guard kann Bedingungen nicht " +
        "lesen und wuerde einen uebersprungenen Pruefschritt als vorhanden zaehlen. " +
        `Gefunden: ${conditional.join(" | ")}`,
    ).toEqual([])
  })

  it("kein Pruefschritt der Kette darf fehlschlagen duerfen", () => {
    // continue-on-error ist im Workflow legitim, aber nur fuer den Datensync.
    // An einem Pruefschritt waere es ein gruener Build ueber einem roten Test.
    const yaml = readWorkflow()
    const steps = yaml.split(/^\s+- name:/m)
    const tolerant = steps
      .filter((step) => /continue-on-error:\s*true/.test(step))
      .flatMap((step) => npmCommands(extractRunCommands(step)))
    const checks = VERIFY_STEPS.map(commandOf)

    expect(
      tolerant.filter((command) => checks.includes(command)),
      `Ein Pruefschritt der Kette steht unter continue-on-error: ${tolerant.join(", ")}`,
    ).toEqual([])
    // Anker: der Datensync IST so markiert, sonst prueft die Zeile oben nichts.
    expect(tolerant, "kein continue-on-error mehr im Workflow, Filter prueft nichts").toContain(
      "npm run sync:data",
    )
  })
})
