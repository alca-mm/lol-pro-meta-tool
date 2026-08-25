/**
 * Structural guards around the draft foundation (0.8.0), its wiring (0.8.1) and
 * the state lift that connected it to the ban plan (0.8.2).
 *
 * WHAT THE THREE RELEASES DID, AND WHY THAT NEEDS GUARDING
 *
 * 0.8.0: the brief was "build a draft board". The audit found one already there:
 * `src/components/DraftHelper.tsx` plus `DraftBoard`, `DraftTeamPanel`,
 * `DraftBanSlot` and `DraftPickSlot` render blue and red sides, ban and pick
 * slots, slot activation, clearing and duplicate prevention. So no second board
 * was built. The only new product file was `src/draft/draftState.ts`: the RULE
 * underneath a board, extracted as a pure domain module so that Vitest - which
 * runs in Node here with no jsdom - can test it at all. It was deliberately left
 * unconnected.
 *
 * 0.8.1 (Epic C) connected it, and added a second pure module,
 * `src/draft/draftAvailability.ts`, for the one question the board asked in eight
 * places with eight local answers: "is this champion still available?". Those
 * eight places all keyed by `normalizeChampionName()` (= `trim().toLowerCase()`).
 * Measured over the real 173-champion catalogue: neither rule ever merges two
 * DIFFERENT champions, but spelling variants resolve for 154 of 173 under
 * `normalizeChampionName` and 173 of 173 under `championIdentityKey`. The 19 that
 * differ are the punctuated and spaced ones. So the switch can only ever CATCH a
 * duplicate that used to slip through.
 *
 * 0.8.2 lifted the four draft arrays out of `DraftHelper` and into `App.tsx`, and
 * used them to filter the scout's ban plan. The lift is not tidying: `App.tsx`
 * renders `DraftHelper` conditionally, so leaving the draft tab UNMOUNTED it and
 * threw the whole draft away - the scout could never have read a draft that
 * stopped existing the moment you navigated to it. A read-only copy could not
 * have fixed that; the state had to move to the one component that stays
 * mounted. `DraftHelper` now takes `slots` / `onSlotsChange` and keeps four
 * same-named setter shims so its thirty call sites read unchanged, and section 10
 * exists to make sure a local `useState` for those four arrays never comes back
 * alongside them. Two owners of one draft is the defect this project has already
 * paid for three times (`ScoutManualSource` in three places, `overwrittenRows`
 * against `removedExistingRows`, `banPhaseCounts()` against `prioritizedBans`),
 * and here it would be invisible: both copies render, they just disagree.
 *
 * Everything this file asserts is a property of those three decisions, and every
 * one of those properties is invisible at runtime. A second board renders fine. A
 * transcribed draft order renders fine. `championLookupKey` in place of
 * `championIdentityKey` renders fine right up to the first Korean champion name.
 * A grid keyed on one basis while the board decides on another renders fine and
 * only shows up as "I clicked it and nothing happened". An import of `react` into
 * a domain module renders fine and only bites whoever next tries to unit-test it.
 * None of that shows up in a screenshot, which is exactly the kind of defect a
 * source scan is for.
 *
 * WHAT THIS FILE CANNOT PROVE
 *
 * Vitest runs in Node (vite.config.ts, `test.environment: 'node'`): this is a
 * source scan, not a render. It proves that the imports, identifiers, calls and
 * definitions are where they should be. It cannot prove the board still looks
 * right, that a slot still reacts to a click, that the grid really greys out, or
 * that `draftState.ts` and `draftAvailability.ts` behave correctly - the
 * behaviour is the job of `tests/draftState.test.ts` and
 * `tests/draftAvailability.test.ts`. Same caveat as every sibling guard file, and
 * CLAUDE.md P4c requires it stated rather than implied.
 *
 * EVERY NEGATIVE ASSERTION RUNS ON COMMENT-STRIPPED SOURCE, and here that is not
 * a formality. The module comment of `draftState.ts` names `championLookupKey`,
 * `DraftHelper.tsx` and `React` on purpose, as the things it does NOT do; the
 * module comment of `draftAvailability.ts` names `normalizeChampionName`,
 * `championLookupKey` and `Kai'Sa` for the same reason; and the duplicate guard
 * in `DraftHelper.tsx` explains itself with `Kai'Sa`, `trim().toLowerCase()` and
 * `championIdentityKey`. On raw text half the guards below would be red the day
 * they were written, and the obvious "fix" would be deleting the prose that
 * exists to stop the defect coming back. CLAUDE.md records the cost of the
 * opposite mistake: a source scan without a stripper once let a whole feature be
 * deleted while 2410 tests stayed green. Section 2 therefore pins the coupling in
 * both directions, per file - raw MUST contain the term, stripped MUST NOT.
 */

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/* ==========================================================================
 * 0. Reading src/
 * ========================================================================== */

const SRC = fileURLToPath(new URL("../src/", import.meta.url))

const DRAFT_STATE = "draft/draftState.ts"
const DRAFT_AVAILABILITY = "draft/draftAvailability.ts"
const DRAFT_CONSTANTS = "draft/constants.ts"
const DRAFT_BOARD = "components/draft/DraftBoard.tsx"
const DRAFT_HELPER = "components/DraftHelper.tsx"
const CHAMPION_GRID = "components/ChampionPortraitGrid.tsx"
/** The 0.8.2 owner of the draft, and the two components it feeds. */
const APP = "App.tsx"
const TOURNAMENT_SCOUT = "components/scout/TournamentScout.tsx"
const BAN_PLAN_PANEL = "components/scout/ScoutBanPlanPanel.tsx"
const SCOUT_EXPORT = "components/scout/scoutExport.ts"
const SCOUT_ANALYSIS = "scout/analysis.ts"
const SCOUT_TYPES = "scout/types.ts"
const SCOUT_STORAGE = "scout/storage.ts"

/** The two pure modules under src/draft/. Neither may grow a runtime. */
const PURE_DOMAIN_FILES: readonly string[] = [DRAFT_STATE, DRAFT_AVAILABILITY]

const readSrc = (rel: string): string => readFileSync(SRC + rel.split("/").join(sep), "utf8")

/**
 * Remove block and line comments, PRESERVING every newline.
 *
 * Spelled exactly like the stripper in tests/clickableNonInteractive.test.ts,
 * for the same two reasons. Block comments are blanked character for character
 * so a reported line number still points at the right line in a file whose
 * comments are longer than its code. The `(?<!:)` lookbehind keeps a `https://`
 * inside a string literal from reading as the start of a comment and deleting
 * the rest of that line before the scanner sees it; section 1 proves that with
 * a fixture instead of asserting it in prose.
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/[^\n]*/g, "")

interface SourceFile {
  readonly path: string
  /** Verbatim, comments included. Used ONLY by the both-directions pin. */
  readonly raw: string
  /** Comments blanked. Every rule below reads this. */
  readonly code: string
}

const CACHE = new Map<string, SourceFile>()

function file(rel: string): SourceFile {
  const hit = CACHE.get(rel)
  if (hit !== undefined) return hit
  const raw = readSrc(rel)
  const entry: SourceFile = { path: rel, raw, code: stripComments(raw) }
  CACHE.set(rel, entry)
  return entry
}

/** Every `.ts`/`.tsx` under `src/`, relative to it, with `/` separators. */
const srcFiles = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(sep).join("/"))
    .filter((entry) => /\.tsx?$/.test(entry))

/* ==========================================================================
 * 1. The scanners
 *
 * Each one is a pure function declared once and used BOTH by the real guards
 * and by the fixtures in section 1b. That pairing is the whole anti-vacuity
 * mechanism: a scanner whose regex has quietly stopped matching reports the
 * same clean tree as a correct one.
 * ========================================================================== */

/**
 * Every module specifier the source imports, re-exports or requires.
 *
 * WHY THE IMPORT LIST AND NOT A SUBSTRING SEARCH. `DraftHelper.tsx` contains the
 * text `draftState` as the name of a PARAMETER (`draftState: DraftState`),
 * unrelated to the module of that name. A guard written as
 * `expect(source).not.toContain("draftState")` would have been red the moment it
 * was written, for a file that at the time imported nothing of the sort. The
 * question these guards ask is "does this file depend on that module", and the
 * honest place to read that is the import list.
 *
 * The gap before `from` excludes quotes, backticks, `;`, `(`, `)` and `=`. An
 * import statement never contains any of them, and a function body hits one
 * within a few characters - so a stray `export` keyword somewhere in a file
 * cannot reach forward and swallow an unrelated `from "…"`.
 */
function moduleSpecifiers(code: string): string[] {
  const found: string[] = []
  for (const match of code.matchAll(/\b(?:import|export)\b[^"'`;()=]*?\bfrom\s*["']([^"']+)["']/g)) {
    found.push(match[1])
  }
  for (const match of code.matchAll(/\bimport\s*["']([^"']+)["']/g)) {
    found.push(match[1])
  }
  for (const match of code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push(match[1])
  }
  return found
}

/**
 * A specifier as a path relative to `src/`, extension dropped.
 *
 * A bare specifier (`react`, `node:fs`) is returned unchanged, which is what
 * makes "imports no package at all" expressible below.
 */
function resolveSpecifier(fromRel: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier
  const parts = fromRel.split("/").slice(0, -1)
  for (const step of specifier.split("/")) {
    if (step === "" || step === ".") continue
    if (step === "..") parts.pop()
    else parts.push(step)
  }
  return parts.join("/").replace(/\.(tsx?|jsx?)$/, "")
}

/** What a file under `src/` depends on, as `src/`-relative paths. */
const importedModules = (rel: string): string[] =>
  moduleSpecifiers(file(rel).code).map((specifier) => resolveSpecifier(rel, specifier))

/** `draft/draftState.ts` as the specifier form an import would resolve to. */
const moduleId = (rel: string): string => rel.replace(/\.tsx?$/, "")

interface Definition {
  readonly kind: string
  readonly name: string
  readonly line: number
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length

/**
 * Every VALUE definition: `function`, `const`, `let`, `var`, `class`.
 *
 * `type` and `interface` are deliberately absent, and that is load-bearing
 * rather than an oversight. `draftState.ts` declares `export type DraftBoard =
 * readonly DraftSlot[]` - a data type describing twenty slots, not a component
 * rendering them. Counting it as a second board definition would make the
 * "exactly one board" guard permanently red and teach the next reader that the
 * rule is noise. Section 6 pins that it really is still a `type` there, so
 * turning it into a component does not slip through this exemption.
 */
function valueDefinitions(code: string): Definition[] {
  const found: Definition[] = []
  for (const match of code.matchAll(
    /\b(function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
  )) {
    found.push({ kind: match[1], name: match[2], line: lineOf(code, match.index ?? 0) })
  }
  return found
}

/** Does this file DEFINE that name itself, rather than import or call it? */
const definesValue = (code: string, name: string): boolean =>
  valueDefinitions(code).some((definition) => definition.name === name)

/** Every name the module exports, values and types alike. */
const exportedNames = (code: string): string[] =>
  [
    ...code.matchAll(
      /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    ),
  ].map((match) => match[1])

/** The identifier as a whole word, so `draftStateHelper` is not `draftState`. */
const mentions = (code: string, identifier: string): boolean =>
  new RegExp(`(?<![\\w$])${identifier}(?![\\w$])`).test(code)

const countMatches = (code: string, pattern: string): number =>
  (code.match(new RegExp(pattern, "g")) ?? []).length

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * One argument, tolerant of any reformat inside it.
 *
 * The argument text is split on whitespace and rejoined with "any whitespace,
 * optionally one comma", so `{ bluePickSlots, redPickSlots, blueBans, redBans }`
 * still matches when Prettier breaks it over five lines and adds a trailing
 * comma. The TOKENS themselves stay exact - that is what keeps the pattern a pin
 * on the real call rather than a fuzzy match.
 */
const argPattern = (arg: string): string =>
  arg
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s*,?\\s*")

/**
 * A WHOLE call - callee plus its exact arguments in order.
 *
 * WHY THE WHOLE CALL AND NOT THE BARE IDENTIFIER. CLAUDE.md records this exact
 * vacuity three times over (`scoutPluralMessage`, `scoutBanPhaseKey`,
 * `splitScoutList`): a `toContain("isChampionTaken")` is already satisfied by the
 * IMPORT LINE, so the call site can be deleted and the guard stays green. Every
 * positive pin in sections 8 and 9 goes through this function for that reason.
 */
function callPattern(callee: string, args: readonly string[]): RegExp {
  return new RegExp(
    `(?<![\\w$])${escapeRegex(callee)}\\s*\\(\\s*${args.map(argPattern).join("\\s*,\\s*")}\\s*,?\\s*\\)`,
  )
}

const hasCall = (rel: string, callee: string, args: readonly string[]): boolean =>
  callPattern(callee, args).test(file(rel).code)

/**
 * Lines that name BOTH one of `anchors` and `identifier`, as `line: text`.
 *
 * The narrow way to ask "is this identifier being used in an availability role?"
 * in a file where the same identifier is legitimately used for other things.
 * Known limit, stated rather than implied: it reads ONE line at a time, so a
 * statement split over two lines escapes it. It is a second line of defence
 * behind the positive call pins, not a substitute for them.
 */
function linesNamingBoth(code: string, anchors: readonly string[], identifier: string): string[] {
  const hits: string[] = []
  code.split("\n").forEach((text, index) => {
    if (!mentions(text, identifier)) return
    if (!anchors.some((anchor) => mentions(text, anchor))) return
    hits.push(`${index + 1}: ${text.trim()}`)
  })
  return hits
}

/** A PascalCase name containing `Board`, i.e. how a React board is named. */
const isBoardComponentName = (name: string): boolean =>
  /^[A-Z][A-Za-z0-9_$]*Board[A-Za-z0-9_$]*$/.test(name)

/**
 * The first binding of every `const [name, setName] = useState(...)`.
 *
 * THE SCANNER SECTION 10 RESTS ON, and the reason it reads the binding rather
 * than the identifier. `DraftHelper.tsx` names `useState` sixteen more times for
 * state that legitimately stays local (the search box, the weights, the series
 * history), and its own comment names `useState` too. A check for the word would
 * be red for all of that; what section 10 forbids is one specific shape - the
 * four lifted arrays being DECLARED here a second time.
 *
 * `React.useState` is accepted deliberately: it is the same hook, and a mirror
 * written that way would otherwise walk straight past the guard.
 */
function useStateBindings(code: string): string[] {
  return [
    ...code.matchAll(
      /\b(?:const|let|var)\s*\[\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*)?\]\s*=\s*(?:React\s*\.\s*)?useState\b/g,
    ),
  ].map((match) => match[1])
}

/**
 * The `chars` characters of source that begin at `const NAME`, or `""`.
 *
 * How "this declaration writes through to `onSlotsChange`" is asked without
 * pinning a whole `useCallback` body character for character, which any reformat
 * would break. Known limit, stated rather than implied: it is a fixed window, so
 * a setter whose body grew past `chars` before it reaches `onSlotsChange` would
 * report a false negative - the fixture below pins that the window really is
 * bounded, so the failure would be loud rather than silent.
 */
function declarationWindow(code: string, name: string, chars = 400): string {
  const match = new RegExp(`\\bconst\\s+${escapeRegex(name)}(?![\\w$])`).exec(code)
  if (match === null) return ""
  return code.slice(match.index, match.index + chars)
}

/**
 * The opening JSX tag of `<Component …>`, attributes included, or `""`.
 *
 * WHY A TAG AND NOT A SUBSTRING SEARCH. `App.tsx` contains the text
 * `draftBoard` four times - the `useMemo`, its dependency array, and the props
 * it hands to two different children. "Does TournamentScout receive it" is a
 * question about ONE tag, and a file-wide `toContain("draftBoard")` answers a
 * different one: it stays green when the prop is dropped from that tag and kept
 * on another.
 *
 * Known limit, stated rather than implied: attributes are read up to the first
 * `>`, so an inline arrow function in a prop (`onX={() => f()}`) truncates the
 * tag. Neither tag this file reads has one; the fixture below pins that shape as
 * a known miss so it fails loudly rather than passing on half a tag.
 */
function jsxOpeningTag(code: string, component: string): string {
  const match = new RegExp(`<${escapeRegex(component)}(?![\\w$])[^>]*>`).exec(code)
  return match === null ? "" : match[0]
}

/** `prop={value}`, tolerant of spacing, exact in both names. */
const hasJsxProp = (tag: string, prop: string, value: string): boolean =>
  new RegExp(`(?<![\\w$])${escapeRegex(prop)}\\s*=\\s*\\{\\s*${escapeRegex(value)}\\s*\\}`).test(tag)

/** Where a pattern first matches, or -1. The basis of the ordering pins. */
const positionOf = (code: string, pattern: RegExp): number => {
  const match = pattern.exec(code)
  return match === null ? -1 : match.index
}

/**
 * `const { bluePickSlots, redPickSlots, blueBans, redBans } = slots`.
 *
 * The counterpart of the `useState` ban: the four names have to come from the
 * prop, and reading them out of one object is what makes "half-applied draft"
 * unrepresentable.
 */
const SLOTS_DESTRUCTURING = new RegExp(
  `\\bconst\\s*${argPattern("{ bluePickSlots, redPickSlots, blueBans, redBans }")}\\s*=\\s*slots(?![\\w$])`,
)

/** The four arrays 0.8.2 lifted. Named once, used by every rule in section 10. */
const LIFTED_DRAFT_ARRAYS: readonly string[] = [
  "bluePickSlots",
  "redPickSlots",
  "blueBans",
  "redBans",
]

/** The four write-through shims, in the same order. */
const LIFTED_DRAFT_SETTERS: readonly string[] = [
  "setBluePickSlots",
  "setRedPickSlots",
  "setBlueBans",
  "setRedBans",
]

/* ==========================================================================
 * 1b. The scanners, proven against known inputs
 * ========================================================================== */

const SPECIFIER_FIXTURES: ReadonlyArray<readonly [what: string, source: string, specs: string[]]> = [
  ["a named import", 'import { a } from "x"', ["x"]],
  ["a type-only import", 'import type { a } from "x"', ["x"]],
  ["a default import", 'import a from "x"', ["x"]],
  ["a namespace import", 'import * as ns from "x"', ["x"]],
  ["a side-effect import", 'import "x"', ["x"]],
  ["a multi-line import", 'import {\n  a,\n  b,\n} from "x"', ["x"]],
  ["a re-export", 'export { a } from "x"', ["x"]],
  ["a star re-export", 'export * from "x"', ["x"]],
  ["a dynamic import", 'const m = await import("x")', ["x"]],
  ["a require call", 'const m = require("x")', ["x"]],
  // The counterparts. Each of these is a shape a substring search would call
  // an import, and the guards below would then be red for nothing.
  ["a local named like the module", "const draftState = createDraftBoard()", []],
  [
    "a parameter named like the module",
    "function f(draftState: DraftState) { return draftState }",
    [],
  ],
  ["a property access", "const s = props.draftState", []],
  ["the word from in a string", 'const label = "copied from the board"', []],
  ["an exported value with an initialiser", 'export const FROM = "x"', []],
]

describe("the scanners in this file see what they claim to see", () => {
  it("reads every import shape, and nothing that merely looks like one", () => {
    // Mutation that turns this red: drop the third `matchAll` and the dynamic
    // import fixture reports [], or widen the gap class to `[^"']` and the
    // "local named like the module" fixture starts reporting a specifier.
    for (const [what, source, specs] of SPECIFIER_FIXTURES) {
      expect(moduleSpecifiers(source), `${what}: ${JSON.stringify(source)}`).toEqual(specs)
    }
  })

  it("does not read an import out of a comment", () => {
    // Mutation that turns this red: make stripComments the identity function,
    // which is the single change that would silently disarm every negative
    // assertion in this file.
    expect(moduleSpecifiers(stripComments('// import { a } from "react"\nconst a = 1'))).toEqual([])
    expect(moduleSpecifiers(stripComments('/* import { a } from "react" */\nconst a = 1'))).toEqual(
      [],
    )
  })

  it("resolves a specifier to a path relative to src/", () => {
    // Mutation that turns this red: drop the `..` branch from
    // resolveSpecifier, and "../draft/draftState" resolves to a path no guard
    // below ever matches - every import rule passes blind.
    expect(resolveSpecifier(DRAFT_STATE, "./constants")).toBe("draft/constants")
    expect(resolveSpecifier(DRAFT_STATE, "../scout/championIdentity")).toBe("scout/championIdentity")
    expect(resolveSpecifier(DRAFT_HELPER, "../draft/draftState")).toBe("draft/draftState")
    expect(resolveSpecifier(DRAFT_HELPER, "../draft/draftAvailability")).toBe(
      "draft/draftAvailability",
    )
    expect(resolveSpecifier(CHAMPION_GRID, "../draft/draftAvailability")).toBe(
      "draft/draftAvailability",
    )
    expect(resolveSpecifier(SCOUT_EXPORT, "../../draft/draftState.ts")).toBe("draft/draftState")
    expect(resolveSpecifier(DRAFT_BOARD, "./DraftTeamPanel")).toBe("components/draft/DraftTeamPanel")
    expect(resolveSpecifier(DRAFT_STATE, "react")).toBe("react")
    // The import guards compare against exactly this form, so it has to agree.
    expect(moduleId(DRAFT_AVAILABILITY)).toBe("draft/draftAvailability")
    expect(moduleId(DRAFT_BOARD)).toBe("components/draft/DraftBoard")
  })

  it("tells a component definition from a type alias and from an import", () => {
    // Mutation that turns this red: add `type` to the keyword group in
    // valueDefinitions, and `export type DraftBoard` in draftState.ts counts as
    // a second board - the guard in section 6 fails for a file that renders
    // nothing.
    const names = (source: string): string[] => valueDefinitions(source).map((d) => d.name)
    expect(names("export function DraftBoard({ a }: P) { return null }")).toEqual(["DraftBoard"])
    expect(names("const DraftBoardPanel = () => null")).toEqual(["DraftBoardPanel"])
    expect(names("class DraftBoard {}")).toEqual(["DraftBoard"])
    expect(names("export type DraftBoard = readonly DraftSlot[]")).toEqual([])
    expect(names("export interface DraftBoardProps { a: string }")).toEqual([])
    expect(names('import { DraftBoard } from "./draft/DraftBoard"')).toEqual([])
  })

  it("tells a local definition from an import of the same name and from a call", () => {
    // Mutation that turns this red: let definesValue fall back to a substring
    // search, and the ChampionPortraitGrid guard in section 9 reports a local
    // normalizer for a file that only imports one - or, the other way round,
    // stops seeing a re-introduced local copy at all.
    expect(
      definesValue("function normalizeChampionName(n: string) { return n }", "normalizeChampionName"),
    ).toBe(true)
    expect(
      definesValue("const normalizeChampionName = (n: string) => n", "normalizeChampionName"),
    ).toBe(true)
    expect(
      definesValue('import { normalizeChampionName } from "../draft/helpers"', "normalizeChampionName"),
    ).toBe(false)
    expect(definesValue("const key = normalizeChampionName(champion)", "normalizeChampionName")).toBe(
      false,
    )
  })

  it("counts a PascalCase board name and not a factory or a dashboard", () => {
    // Mutation that turns this red: drop the `^[A-Z]` anchor, and
    // `createDraftBoard` in draftState.ts is reported as a second board.
    expect(isBoardComponentName("DraftBoard")).toBe(true)
    expect(isBoardComponentName("DraftBoardPanel")).toBe(true)
    expect(isBoardComponentName("NewDraftBoard")).toBe(true)
    expect(isBoardComponentName("createDraftBoard")).toBe(false)
    expect(isBoardComponentName("Dashboard")).toBe(false)
  })

  it("matches an identifier only as a whole word", () => {
    // Mutation that turns this red: replace the lookarounds in mentions() with
    // a plain includes(), and `championIdentityKey` would report a hit for
    // `championIdentity`, making the section 4 guards meaningless.
    expect(mentions("const draftState = 1", "draftState")).toBe(true)
    expect(mentions("const draftStateHelper = 1", "draftState")).toBe(false)
    expect(mentions("championLookupKeyish", "championLookupKey")).toBe(false)
    expect(mentions("championIdentityKey(x)", "championIdentity")).toBe(false)
    expect(mentions("draftBoardFromSlots(x)", "draftBoard")).toBe(false)
  })

  it("finds the names a module exports", () => {
    // Mutation that turns this red: drop `function` from the keyword group and
    // the derived export lists in section 7 lose every function, leaving the
    // scoutExport guard checking type names only.
    expect(exportedNames("export function a() {}\nexport type B = 1\nconst c = 2")).toEqual([
      "a",
      "B",
    ])
  })

  it("counts repeated literals", () => {
    // Mutation that turns this red: drop the "g" flag in countMatches, which
    // caps every count at 1 and makes the transcribed-flow-table guards in
    // section 3 unable to fail.
    expect(countMatches('type: "ban"\ntype: "pick"\ntype: "ban"', '"(?:ban|pick)"')).toBe(3)
    expect(countMatches("visualSide: a\nvisualSide: b", "\\bvisualSide\\s*:")).toBe(2)
  })

  it("matches a whole call across a reformat, and not a near miss", () => {
    // Mutation that turns this red: drop the `\s*` between the tokens and a
    // Prettier line break defeats every positive pin in sections 8 and 9; drop
    // the argument list and the pins degrade to the bare-identifier check that
    // CLAUDE.md has caught being vacuous three times.
    const taken = callPattern("isChampionTaken", ["draftBoard", "championName"])
    expect(taken.test("if (isChampionTaken(draftBoard, championName)) return")).toBe(true)
    expect(taken.test("isChampionTaken(\n  draftBoard,\n  championName,\n)")).toBe(true)
    expect(taken.test("isChampionTaken(board, championName)")).toBe(false)
    expect(taken.test("isChampionTaken(draftBoard)")).toBe(false)
    expect(taken.test("myIsChampionTaken(draftBoard, championName)")).toBe(false)
    expect(taken.test('import { isChampionTaken } from "../draft/draftState"')).toBe(false)

    const board = callPattern("draftBoardFromSlots", [
      "{ bluePickSlots, redPickSlots, blueBans, redBans }",
    ])
    expect(
      board.test("draftBoardFromSlots({ bluePickSlots, redPickSlots, blueBans, redBans })"),
    ).toBe(true)
    expect(
      board.test(
        "draftBoardFromSlots({\n  bluePickSlots,\n  redPickSlots,\n  blueBans,\n  redBans,\n})",
      ),
    ).toBe(true)
    expect(
      board.test("draftBoardFromSlots({ redPickSlots, bluePickSlots, blueBans, redBans })"),
    ).toBe(false)
    expect(board.test("draftBoardFromSlots({ bluePickSlots, redPickSlots, blueBans })")).toBe(false)

    const nested = callPattern("fearlessChampionSet.has", ["draftAvailabilityKey(championName)"])
    expect(nested.test("fearlessChampionSet.has(draftAvailabilityKey(championName))")).toBe(true)
    expect(nested.test("fearlessChampionSet.has(normalizeChampionName(championName))")).toBe(false)
  })

  it("reads the binding of a useState declaration, and not the word useState", () => {
    // Mutation that turns this red: loosen the pattern to a bare
    // /useState/ search, and the "no local mirror" guard in section 10 would be
    // red for the sixteen legitimately local useState calls in DraftHelper.tsx -
    // a guard red for the wrong reason gets deleted. Tighten it the other way
    // (drop the `React.` branch) and a mirror written as React.useState walks
    // straight past it.
    expect(useStateBindings("const [bluePickSlots, setBluePickSlots] = useState<PickSlot[]>([])")).toEqual([
      "bluePickSlots",
    ])
    expect(useStateBindings("const [minGames, setMinGames] = useState(5)")).toEqual(["minGames"])
    expect(useStateBindings("const [only] = useState(5)")).toEqual(["only"])
    expect(useStateBindings("const [blueBans, setBlueBans] = React.useState<string[]>([])")).toEqual(
      ["blueBans"],
    )
    expect(
      useStateBindings("const [a, setA] = useState(1)\nconst [b, setB] = useState(2)"),
    ).toEqual(["a", "b"])
    // The shapes 0.8.2 actually produced. None of them is a declaration.
    expect(
      useStateBindings("const { bluePickSlots, redPickSlots, blueBans, redBans } = slots"),
    ).toEqual([])
    expect(useStateBindings("const setBlueBans = useCallback((next) => onSlotsChange(next), [])")).toEqual(
      [],
    )
    expect(useStateBindings("const [state, dispatch] = useReducer(reducer, init)")).toEqual([])
    // The exact wording of the 0.8.2 comment in DraftHelper.tsx, which names
    // the hook on purpose. It is prose, so it must report nothing even unstripped.
    expect(useStateBindings("keep the names and the exact `useState` signature")).toEqual([])
  })

  it("returns a bounded window that starts at a named declaration", () => {
    // Mutation that turns this red: drop the slice and return the whole file -
    // the section 10 write-through guard would then be satisfied by any
    // onSlotsChange anywhere in DraftHelper.tsx, including the three other
    // setters, so a single shim could stop writing through unnoticed.
    const source = "const setBlueBans = useCallback((next) => onSlotsChange(next), [])\nconst other = 1"
    expect(declarationWindow(source, "setBlueBans")).toContain("onSlotsChange")
    expect(declarationWindow(source, "setBlueBans", 20)).not.toContain("onSlotsChange")
    expect(declarationWindow(source, "setRedBans")).toBe("")
    // Whole word: setBlueBansTwice is a different declaration.
    expect(declarationWindow("const setBlueBansTwice = 1", "setBlueBans")).toBe("")
  })

  it("reads one JSX opening tag with its props, and not the whole file", () => {
    // Mutation that turns this red: return the whole source instead of the
    // matched tag, and "TournamentScout receives draftBoard" would be satisfied
    // by the useMemo that builds it - the prop could be dropped and the guard
    // would stay green.
    const app = '<DraftHelper\n  matches={m}\n  slots={draftSlots}\n/>\n<TournamentScout draftBoard={draftBoard} />'
    expect(jsxOpeningTag(app, "DraftHelper")).toContain("slots={draftSlots}")
    expect(jsxOpeningTag(app, "DraftHelper")).not.toContain("draftBoard")
    expect(jsxOpeningTag(app, "TournamentScout")).toContain("draftBoard={draftBoard}")
    // A lazy() binding of the same name is not a render site.
    expect(jsxOpeningTag('const DraftHelper = lazy(() => import("x"))', "DraftHelper")).toBe("")
    // Whole word, so a differently named component is not mistaken for it.
    expect(jsxOpeningTag("<DraftHelperPanel slots={s} />", "DraftHelper")).toBe("")
    // The documented limit, pinned so it is a known miss rather than a surprise.
    expect(jsxOpeningTag("<X onA={() => f()} b={c} />", "X")).not.toContain("b={c}")
  })

  it("matches a JSX prop by name and value, not by either alone", () => {
    // Mutation that turns this red: drop the value from the pattern, and
    // slots={somethingElse} would satisfy the section 10 guard - which is
    // exactly the second-source-of-truth case it exists to catch.
    expect(hasJsxProp("<X slots={draftSlots} />", "slots", "draftSlots")).toBe(true)
    expect(hasJsxProp("<X slots={ draftSlots } />", "slots", "draftSlots")).toBe(true)
    expect(hasJsxProp("<X slots={otherSlots} />", "slots", "draftSlots")).toBe(false)
    expect(hasJsxProp("<X onSlotsChange={setDraftSlots} />", "slots", "draftSlots")).toBe(false)
    expect(hasJsxProp("<X draftBoard={draftBoard} />", "draftBoard", "draftBoard")).toBe(true)
    expect(hasJsxProp("<X />", "draftBoard", "draftBoard")).toBe(false)
  })

  it("orders two call sites by where they appear", () => {
    // Mutation that turns this red: return a constant instead of match.index,
    // and the "filter after ranking, before counting" guard in section 11 can
    // no longer fail - which is the guard that keeps a chip from promising a
    // number the list does not show.
    const source = "const a = one(1)\nconst b = two(2)"
    expect(positionOf(source, callPattern("one", ["1"]))).toBeLessThan(
      positionOf(source, callPattern("two", ["2"])),
    )
    expect(positionOf(source, callPattern("three", ["3"]))).toBe(-1)
  })

  it("matches the slots destructuring across a reformat, and not a rebuild", () => {
    // Mutation that turns this red: relax it to `= slots` alone, and
    // `const { bluePickSlots } = slots` - three arrays short - would pass.
    expect(
      SLOTS_DESTRUCTURING.test("const { bluePickSlots, redPickSlots, blueBans, redBans } = slots"),
    ).toBe(true)
    expect(
      SLOTS_DESTRUCTURING.test(
        "const {\n  bluePickSlots,\n  redPickSlots,\n  blueBans,\n  redBans,\n} = slots",
      ),
    ).toBe(true)
    expect(SLOTS_DESTRUCTURING.test("const { bluePickSlots, redPickSlots } = slots")).toBe(false)
    expect(
      SLOTS_DESTRUCTURING.test("const { bluePickSlots, redPickSlots, blueBans, redBans } = props"),
    ).toBe(false)
  })

  it("finds an identifier only when it shares a line with an anchor", () => {
    // Mutation that turns this red: drop the anchor test and linesNamingBoth
    // reports every one of the 21 legitimate normalizeChampionName call sites
    // in DraftHelper.tsx, so the section 9 guard becomes permanently red and
    // gets "fixed" by deletion.
    const anchors = ["selectedChampionSet", "bannedChampionSet"]
    expect(
      linesNamingBoth(
        "selectedChampionSet.has(normalizeChampionName(x))",
        anchors,
        "normalizeChampionName",
      ),
    ).toHaveLength(1)
    expect(
      linesNamingBoth(
        "roleChampionSet.has(normalizeChampionName(x))",
        anchors,
        "normalizeChampionName",
      ),
    ).toEqual([])
    expect(
      linesNamingBoth(
        "selectedChampionSet.has(key)\nconst k = normalizeChampionName(x)",
        anchors,
        "normalizeChampionName",
      ),
    ).toEqual([])
    expect(
      linesNamingBoth(
        "selectedChampionSet.has(draftAvailabilityKey(x))",
        anchors,
        "normalizeChampionName",
      ),
    ).toEqual([])
  })
})

/* ==========================================================================
 * 2. The files are the right files, and the stripper is load-bearing
 * ========================================================================== */

/**
 * One marker per file that could only come from that file.
 *
 * Almost every rule below is negative, so a file that came back empty, or from
 * a path that no longer exists, would satisfy all of them at once.
 */
const CONTENT_MARKERS: ReadonlyArray<readonly [rel: string, marker: string]> = [
  [DRAFT_STATE, "export function createDraftBoard"],
  [DRAFT_AVAILABILITY, "export function draftBoardFromSlots"],
  [DRAFT_CONSTANTS, "export const DRAFT_FLOW"],
  [DRAFT_BOARD, "export function DraftBoard"],
  [DRAFT_HELPER, "export function DraftHelper"],
  [CHAMPION_GRID, "export function ChampionPortraitGrid"],
  [APP, "function AppContent"],
  [TOURNAMENT_SCOUT, "export function TournamentScout"],
  [BAN_PLAN_PANEL, "export function ScoutBanPlanPanel"],
  [SCOUT_EXPORT, "export function buildScoutExportText"],
  [SCOUT_ANALYSIS, "export function analyzeScout"],
  [SCOUT_TYPES, "export interface ChampionSignal"],
  [SCOUT_STORAGE, "export function normalizeScoutState"],
]

/** Named rather than counted: twenty files can leave a walk unnoticed. */
const REQUIRED_SRC_FILES: readonly string[] = [
  DRAFT_STATE,
  DRAFT_AVAILABILITY,
  DRAFT_CONSTANTS,
  DRAFT_BOARD,
  DRAFT_HELPER,
  CHAMPION_GRID,
  APP,
  TOURNAMENT_SCOUT,
  BAN_PLAN_PANEL,
  SCOUT_EXPORT,
  SCOUT_ANALYSIS,
]

/**
 * Terms each file's PROSE names as something it does not do, or used to do.
 *
 * Each one has to be present in the raw file and absent from the stripped one.
 * That is the coupling every negative guard here rests on, pinned from both ends
 * so a broken stripper reports itself instead of reporting a defect that does not
 * exist. All three entries matter: `draftAvailability.ts` explains at length why
 * `normalizeChampionName` and `championLookupKey` are the WRONG bases, and the
 * duplicate guard in `DraftHelper.tsx` explains itself with `Kai'Sa` and
 * `trim().toLowerCase()`. Read raw, every one of those files looks like a
 * violation of sections 4 and 9.
 *
 * THE 0.8.2 ENTRIES ARE THE SAME MECHANISM ON THE NEW SECTIONS. The prose that
 * explains the state lift names precisely the things the code must not do:
 * `draftAvailability.ts` says it is "ONE object rather than four `useState`
 * hooks", which is the only occurrence of `useState` in a module section 5
 * forbids React in at all; `DraftHelper.tsx` says "there is no local mirror",
 * which is the very thing section 10 scans for; and `App.tsx` explains the lift
 * with `UNMOUNTED`. Each of those would read as its own violation on raw text.
 */
const COMMENT_ONLY_TERMS: ReadonlyArray<readonly [rel: string, terms: readonly string[]]> = [
  [DRAFT_STATE, ["championLookupKey", "DraftHelper.tsx", "React"]],
  [DRAFT_AVAILABILITY, ["championLookupKey", "normalizeChampionName", "Kai'Sa", "useState"]],
  [DRAFT_HELPER, ["championIdentityKey", "Kai'Sa", "trim().toLowerCase()", "local mirror"]],
  [APP, ["UNMOUNTED"]],
]

describe("the guards below read the files they think they read", () => {
  it("finds a content marker in every file", () => {
    // Mutation that turns this red: rename any of the ten files or its entry
    // point - which is precisely the case where the negative guards would
    // otherwise all pass on an empty read.
    for (const [rel, marker] of CONTENT_MARKERS) {
      const source = file(rel).raw
      expect(
        source.length,
        `SCANNER PROBLEM, not a rule violation: src/${rel} came back empty. Fix the read before ` +
          "treating anything in this file as a verdict about the draft foundation.",
      ).toBeGreaterThan(200)
      expect(
        source,
        `SCANNER PROBLEM, not a rule violation: src/${rel} does not contain "${marker}", so this ` +
          "is not the file these guards are about. Either the entry point was renamed - then " +
          "update CONTENT_MARKERS in the same change - or the read resolved somewhere else.",
      ).toContain(marker)
    }
  })

  it("walks the whole of src/", () => {
    // Mutation that turns this red: filter the walk to a subdirectory, which
    // would let a second board live anywhere outside it undetected.
    const walked = srcFiles()
    const missing = REQUIRED_SRC_FILES.filter((required) => !walked.includes(required))
    expect(
      missing,
      `SCANNER PROBLEM, not a rule violation: the src/ walk did not return ${missing.join(", ")}. ` +
        "The sweeps over src/ in sections 6, 7 and 10 prove nothing while a file they are about " +
        "is missing from the walk.",
    ).toEqual([])
    expect(
      walked.length,
      "SCANNER PROBLEM, not a rule violation: the src/ walk found almost no TypeScript files " +
        "(125 at 0.8.1). The tree is not this small.",
    ).toBeGreaterThan(100)
  })

  it("strips comments, and the prose really does name what it forbids", () => {
    // Mutation that turns this red: make stripComments the identity function -
    // every term below is prose in the named file, so the stripped half fails
    // immediately and names the stripper as the cause instead of sending the
    // next reader after a defect that is not there.
    for (const [rel, terms] of COMMENT_ONLY_TERMS) {
      const source = file(rel)
      for (const term of terms) {
        expect(
          source.raw,
          `SCANNER PROBLEM, not a rule violation: the prose in src/${rel} no longer mentions ` +
            `"${term}". This pin exists to prove the stripper is doing something; if the comment ` +
            "was rewritten, drop the term from COMMENT_ONLY_TERMS rather than weakening a guard.",
        ).toContain(term)
        expect(
          source.code,
          `"${term}" survived stripComments in src/${rel}. It is named in that file's PROSE as ` +
            "something the code does not do, so either the stripper is broken - and then every " +
            "negative guard in this file is reporting comments, not code - or the term really " +
            "did enter the code, which is what sections 4 and 9 are about.",
        ).not.toContain(term)
      }
    }
  })

  it("keeps line numbers and does not let a URL eat the line beneath it", () => {
    // Mutation that turns this red: collapse block comments to a single space,
    // or remove the (?<!:) lookbehind - the second one deletes real code that
    // follows a https:// inside a string literal.
    expect(stripComments("/*\n * prose\n */\nconst a = 1").split("\n")).toHaveLength(4)
    expect(stripComments('const u = "https://example.test/x"')).toContain("example.test")
    expect(stripComments("/* React */ const a = 1")).toContain("const a = 1")
  })
})

/* ==========================================================================
 * 3. The draft order is DERIVED from DRAFT_FLOW, never restated
 * ========================================================================== */

/**
 * Headroom over what the modules have today, not a target.
 *
 * Measured on the stripped source at 0.8.1: `draftState.ts` has zero
 * `visualSide:` keys and two ban/pick string literals (both in `export type
 * DraftActionType = "ban" | "pick"`); `draftAvailability.ts` has zero and one
 * (`step.type === "ban"`). A transcribed twenty-step table has twenty of each, so
 * these thresholds sit far below a copied flow and far above the real modules.
 * The anti-vacuity check below proves the counters can see a real table by
 * running them on `constants.ts`.
 */
const MAX_VISUAL_SIDE_KEYS = 2
const MAX_BAN_PICK_LITERALS = 6

const VISUAL_SIDE_KEY = "\\bvisualSide\\s*:"
const BAN_PICK_LITERAL = '"(?:ban|pick)"'

/** The same two counters, applied to whichever module claims to derive. */
function expectNoTranscribedFlow(rel: string): void {
  const code = file(rel).code
  const visualSideKeys = countMatches(code, VISUAL_SIDE_KEY)
  const banPickLiterals = countMatches(code, BAN_PICK_LITERAL)
  expect(
    visualSideKeys,
    `src/${rel} contains ${visualSideKeys} "visualSide:" keys (${MAX_VISUAL_SIDE_KEYS} allowed). ` +
      `That is the shape of a transcribed flow table. The order lives in src/${DRAFT_CONSTANTS} ` +
      "and this module derives from it; a second listing means the two drift the first time the " +
      "tournament format changes.",
  ).toBeLessThanOrEqual(MAX_VISUAL_SIDE_KEYS)
  expect(
    banPickLiterals,
    `src/${rel} contains ${banPickLiterals} "ban"/"pick" string literals ` +
      `(${MAX_BAN_PICK_LITERALS} allowed). A run of them is a hand-written sequence. Derive it ` +
      "from DRAFT_FLOW instead, or if the module genuinely needs more literals for another " +
      "reason, raise the threshold in the same change and say why.",
  ).toBeLessThanOrEqual(MAX_BAN_PICK_LITERALS)
}

describe("the draft order is derived from DRAFT_FLOW", () => {
  it("imports DRAFT_FLOW from the module that owns it", () => {
    // Mutation that turns this red: replace the import with a local array
    // literal, which is the whole defect this section is about.
    expect(
      importedModules(DRAFT_STATE),
      `src/${DRAFT_STATE} no longer imports from src/${DRAFT_CONSTANTS}. DRAFT_FLOW has been the ` +
        "canonical twenty-step tournament order since long before this module; a second copy of " +
        "the sequence is the two-sources-of-truth defect this project has already paid for three " +
        "times (ScoutManualSource in three places, overwrittenRows against removedExistingRows, " +
        "banPhaseCounts() against prioritizedBans).",
    ).toContain("draft/constants")
    expect(file(DRAFT_STATE).code).toMatch(/\bimport\s*\{[^}]*\bDRAFT_FLOW\b[^}]*\}\s*from/)
  })

  it("actually maps over DRAFT_FLOW, rather than only naming it", () => {
    // Mutation that turns this red: keep the import and build the board from a
    // literal array - the identifier would still be in the file, in the import
    // line, so only pinning the CALL catches it.
    expect(
      file(DRAFT_STATE).code,
      `src/${DRAFT_STATE} imports DRAFT_FLOW but never maps over it. The bare identifier also ` +
        "appears in the import line, so an unused import passes any check that looks for the " +
        "name alone. Every slot has to be derived from the flow, or the order exists twice.",
    ).toMatch(/\bDRAFT_FLOW\s*\.\s*map\s*\(/)
  })

  it("does not restate the sequence as a table of its own", () => {
    // Mutation that turns this red: paste the twenty DRAFT_FLOW rows into
    // draftState.ts, which pushes both counters far past their thresholds.
    expectNoTranscribedFlow(DRAFT_STATE)
  })

  it("derives the 0.8.1 bridge from DRAFT_FLOW as well", () => {
    // Mutation that turns this red: replace DRAFT_FLOW.map(...) in
    // draftAvailability.ts with a written-out list of the twenty slot
    // positions, which is exactly how the board's four arrays and the domain
    // board would start to disagree about which index is which.
    expect(
      importedModules(DRAFT_AVAILABILITY),
      `src/${DRAFT_AVAILABILITY} no longer imports from src/${DRAFT_CONSTANTS}. It is the bridge ` +
        "from the board's four state arrays to the domain board: if it stops reading the " +
        "canonical order it has to restate it, and then a format change moves one of the two and " +
        "not the other.",
    ).toContain("draft/constants")
    expect(
      file(DRAFT_AVAILABILITY).code,
      `src/${DRAFT_AVAILABILITY} names DRAFT_FLOW but never maps over it. The bare identifier is ` +
        "in the import line too, so only pinning the call catches an unused import.",
    ).toMatch(/\bDRAFT_FLOW\s*\.\s*map\s*\(/)
  })

  it("does not restate the sequence in the bridge either", () => {
    // Mutation that turns this red: transcribe the twenty steps into
    // draftBoardFromSlots instead of mapping the flow.
    expectNoTranscribedFlow(DRAFT_AVAILABILITY)
  })

  it("uses counters that can see a real flow table", () => {
    // Mutation that turns this red: break either pattern - the guards above
    // would then pass on a transcribed table, and only this check notices that
    // the counter has gone blind.
    const constants = file(DRAFT_CONSTANTS).code
    expect(
      countMatches(constants, VISUAL_SIDE_KEY),
      "SCANNER PROBLEM, not a rule violation: the \"visualSide:\" counter found nothing in " +
        `src/${DRAFT_CONSTANTS}, which is where the real twenty-step table lives. The counter is ` +
        "blind, so the thresholds above cannot fail.",
    ).toBeGreaterThan(MAX_VISUAL_SIDE_KEYS)
    expect(
      countMatches(constants, BAN_PICK_LITERAL),
      "SCANNER PROBLEM, not a rule violation: the ban/pick literal counter found nothing in " +
        `src/${DRAFT_CONSTANTS}. Same conclusion: the thresholds above cannot fail.`,
    ).toBeGreaterThan(MAX_BAN_PICK_LITERALS)
  })
})

/* ==========================================================================
 * 4. Champion identity, not a raw string comparison
 * ========================================================================== */

describe("the draft modules compare champions by identity", () => {
  it("has draftState importing championIdentityKey and using it", () => {
    // Mutation that turns this red: compare `slot.championName === name`
    // directly and drop the import.
    expect(
      importedModules(DRAFT_STATE),
      `src/${DRAFT_STATE} no longer imports src/scout/championIdentity. Without it the board ` +
        "compares raw strings, and a champion banned under one spelling could be picked under " +
        "another.",
    ).toContain("scout/championIdentity")
    expect(file(DRAFT_STATE).code).toMatch(/\bchampionIdentityKey\s*\(/)
  })

  it("has draftState not falling back to championLookupKey", () => {
    // Mutation that turns this red: swap championIdentityKey for
    // championLookupKey, the exact substitution this guard exists for.
    expect(
      mentions(file(DRAFT_STATE).code, "championLookupKey"),
      `src/${DRAFT_STATE} uses championLookupKey. It strips everything outside a-z0-9, so a ` +
        "Korean name, fullwidth latin or pure punctuation all reduce to the EMPTY STRING - which " +
        "is a valid map key, so every such champion compares equal to every other. CLAUDE.md " +
        '("Champion-Identitaet: EINE Funktion, und championLookupKey ist NICHT sie") records the ' +
        "same defect in the stats import, where three Korean names collapsed into one entry. Use " +
        "championIdentityKey for every champion-to-champion comparison.",
    ).toBe(false)
  })

  it("has draftAvailabilityKey delegating to championIdentityKey", () => {
    // Mutation that turns this red: reimplement draftAvailabilityKey as
    // `name.trim().toLowerCase()`, which is the pre-0.8.1 basis and loses the
    // 19 punctuated champions again.
    expect(
      importedModules(DRAFT_AVAILABILITY),
      `src/${DRAFT_AVAILABILITY} no longer imports src/scout/championIdentity. It is the ONE ` +
        "definition of what counts as the same champion on the board: the grid greys out against " +
        "it and the duplicate guard decides with it. A weaker basis here silently re-opens the " +
        "punctuated-name double pick.",
    ).toContain("scout/championIdentity")
    expect(
      file(DRAFT_AVAILABILITY).code,
      `src/${DRAFT_AVAILABILITY} imports championIdentity but never calls championIdentityKey.`,
    ).toMatch(/\bchampionIdentityKey\s*\(/)
  })

  it("has draftAvailability not falling back to championLookupKey", () => {
    // Mutation that turns this red: change draftAvailabilityKey to call
    // championLookupKey - and every Korean, fullwidth or punctuation-only name
    // collapses to the empty string, i.e. one champion blocks all of them.
    expect(
      mentions(file(DRAFT_AVAILABILITY).code, "championLookupKey"),
      `src/${DRAFT_AVAILABILITY} uses championLookupKey. Its own module comment says why that is ` +
        "wrong: the empty string is a valid Set key, so every champion whose name strips to " +
        "nothing would be reported as already taken by the first one of them. Only " +
        "championIdentityKey is safe for a champion-to-champion comparison.",
    ).toBe(false)
  })
})

/* ==========================================================================
 * 5. Both draft modules stay pure domain modules
 * ========================================================================== */

const FORBIDDEN_IMPORTS: ReadonlyArray<
  readonly [what: string, matches: (module: string) => boolean]
> = [
  ["react", (module) => module === "react" || module.startsWith("react/")],
  ["a UI component under src/components/", (module) => module.startsWith("components/")],
  ["the scout analysis engine (src/scout/analysis)", (module) => module === "scout/analysis"],
  ["the team layer under src/teams/", (module) => module.startsWith("teams/")],
  ["the Supabase client (src/lib/supabase)", (module) => module === "lib/supabase"],
]

/** Browser and platform globals. None of them belongs in a domain module. */
const FORBIDDEN_GLOBALS: readonly string[] = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "window",
  "document",
  "navigator",
  "XMLHttpRequest",
]

describe("the draft modules stay pure domain modules", () => {
  it("import none of the layers that would tie them to a runtime", () => {
    // Mutation that turns this red: add `import { useState } from "react"` to
    // draftState.ts or draftAvailability.ts - the second is the likelier
    // accident, since its only caller is a component.
    for (const rel of PURE_DOMAIN_FILES) {
      const modules = importedModules(rel)
      for (const [what, matches] of FORBIDDEN_IMPORTS) {
        const hits = modules.filter(matches)
        expect(
          hits,
          `src/${rel} imports ${what}. It is domain rule under the draft board: no React, no ` +
            "DOM, no storage, no network. Vitest runs in Node here with no jsdom, so an import of " +
            "any of these is what makes a module untestable - which is the exact problem 0.8.0 " +
            "extracted these files to escape.",
        ).toEqual([])
      }
    }
  })

  it("import nothing but relative modules inside src/", () => {
    // Mutation that turns this red: import any npm package into either module -
    // it would then carry a dependency, and "pure" would be prose only.
    for (const rel of PURE_DOMAIN_FILES) {
      const packages = importedModules(rel).filter((module) => !module.includes("/"))
      expect(
        packages,
        `src/${rel} imports the package(s) ${packages.join(", ")}. A pure domain module depends ` +
          "on nothing outside src/. If a dependency is genuinely needed, that is a product " +
          "decision: take it deliberately, relax this guard in the same change and write the " +
          "reason into the change note.",
      ).toEqual([])
    }
  })

  it("touch no browser or platform global", () => {
    // Mutation that turns this red: read or write localStorage in either
    // module, or reach for window/document/fetch.
    for (const rel of PURE_DOMAIN_FILES) {
      const code = file(rel).code
      const used = FORBIDDEN_GLOBALS.filter((name) => mentions(code, name))
      expect(
        used,
        `src/${rel} references ${used.join(", ")}. Persistence, DOM and network belong to the ` +
          "caller. These modules take a board and return a board or a boolean; keeping them that " +
          "way is what lets their tests assert the rules without a browser.",
      ).toEqual([])
    }
  })
})

/* ==========================================================================
 * 6. There is still exactly ONE draft board
 * ========================================================================== */

describe("there is still exactly one draft board", () => {
  it("defines a board component in exactly one file", () => {
    // Mutation that turns this red: add a second PascalCase `*Board*`
    // component anywhere under src/.
    const found: Definition[] = []
    const where: string[] = []
    for (const path of srcFiles()) {
      for (const definition of valueDefinitions(file(path).code)) {
        if (!isBoardComponentName(definition.name)) continue
        found.push(definition)
        where.push(`${path}:${definition.line} ${definition.kind} ${definition.name}`)
      }
    }
    expect(
      found.map((definition) => definition.name),
      `Board components found: ${where.join(" | ")}. 0.8.0 deliberately did NOT build a second ` +
        `board, and 0.8.1 wired the existing one instead: src/${DRAFT_BOARD} already renders both ` +
        "sides, ban and pick slots, activation, clearing and duplicate prevention. A second one " +
        "repeats the defect 0.7.4 spent a whole release removing from the ban plan - the same " +
        "candidate rendered as four separate row lists, four sets of state, drifting apart. If a " +
        "board really has to move, MOVE it: there must still be one.",
    ).toEqual(["DraftBoard"])
    expect(where[0]).toContain(DRAFT_BOARD)
  })

  it("has no DraftBoardPanel, neither as a file nor as an identifier", () => {
    // Mutation that turns this red: create src/components/draft/
    // DraftBoardPanel.tsx, or reference that name from anywhere under src/.
    const files = srcFiles().filter((path) => path.endsWith("DraftBoardPanel.tsx"))
    expect(
      files,
      "A DraftBoardPanel file exists under src/. That was the name the second board would have " +
        "had; the decision at 0.8.0 was to extend the one board rather than open a second view " +
        "on the same state, and 0.8.1 kept it - the availability rule moved INTO the existing " +
        "board rather than next to it.",
    ).toEqual([])
    const users = srcFiles().filter((path) => mentions(file(path).code, "DraftBoardPanel"))
    expect(
      users,
      `The identifier DraftBoardPanel appears in ${users.join(", ")}. See above: one board.`,
    ).toEqual([])
  })

  it("keeps draftState's DraftBoard a type, which is why it is exempt above", () => {
    // Mutation that turns this red: turn `export type DraftBoard` into a
    // component - the guard above exempts types, so without this pin a second
    // board could be smuggled in under that exemption.
    expect(
      file(DRAFT_STATE).code,
      `src/${DRAFT_STATE} no longer declares DraftBoard as a type. The "exactly one board" ` +
        "guard above counts value definitions only, precisely so this data type (twenty slots) " +
        "is not mistaken for a component. If DraftBoard here became something that renders, that " +
        "exemption is now hiding a second board.",
    ).toMatch(/\bexport\s+type\s+DraftBoard\b/)
  })
})

/* ==========================================================================
 * 7. No coupling to the scout engine or the scout export at this stage
 * ========================================================================== */

/** Score, rank and role-gate entry points, all exported by scout/analysis.ts. */
const SCOUT_ENGINE_NAMES: readonly string[] = [
  "analyzeScout",
  "championStatStrengthMultiplier",
  "applyRankStrength",
  "rankImpactMultiplier",
  "evaluateChampionRoleViability",
  "championRoleViability",
  "buildChampionRoleIndex",
  "gamesImpactMultiplier",
  "winrateImpactMultiplier",
  "kdaImpactMultiplier",
]

const SCOUT_CORE_FILES: readonly string[] = [SCOUT_ANALYSIS, SCOUT_TYPES, SCOUT_STORAGE]

describe("the draft foundation and the scout stay uncoupled at 0.8.1", () => {
  it("derives the export list from draftState itself", () => {
    // Mutation that turns this red: break exportedNames, and the guards below
    // would compare against an empty list and pass on anything.
    const names = exportedNames(file(DRAFT_STATE).code)
    expect(
      names,
      `SCANNER PROBLEM, not a rule violation: no exports were parsed out of src/${DRAFT_STATE}, ` +
        "so the coupling guards below have nothing to look for.",
    ).toContain("createDraftBoard")
    expect(names).toContain("applyDraftAction")
    expect(names).toContain("isChampionTaken")
    expect(names.length).toBeGreaterThan(6)
  })

  it("derives the export list from draftAvailability itself", () => {
    // Mutation that turns this red: same as above for the second module - an
    // empty list makes the leak checks below vacuous for it, and section 10
    // would be searching for names that cannot appear anywhere.
    const names = exportedNames(file(DRAFT_AVAILABILITY).code)
    expect(
      names,
      "SCANNER PROBLEM, not a rule violation: no exports were parsed out of " +
        `src/${DRAFT_AVAILABILITY}, so the coupling guards below have nothing to look for.`,
    ).toContain("draftAvailabilityKey")
    expect(names).toContain("draftBoardFromSlots")
    expect(names).toContain("takenChampionKeys")
    expect(names).toContain("isBanCandidateAvailable")
    expect(names).toContain("filterAvailableBanCandidates")
  })

  it("keeps the scout export free of anything from the draft modules", () => {
    // Mutation that turns this red: import a draftState or draftAvailability
    // symbol into scoutExport.ts, or name one of their exports there.
    const exportFile = file(SCOUT_EXPORT)
    for (const rel of PURE_DOMAIN_FILES) {
      expect(
        importedModules(SCOUT_EXPORT),
        `src/${SCOUT_EXPORT} imports src/${rel}. The scout export is the text a human copies out ` +
          "of the scout tab; it states what the scout analysis found and nothing else. Feeding a " +
          "draft board into it would make the copied text depend on unrelated state, the same " +
          "way pinning it to the ban phase filter would have in 0.7.5.",
      ).not.toContain(moduleId(rel))
      const leaked = exportedNames(file(rel).code).filter((name) => mentions(exportFile.code, name))
      expect(
        leaked,
        `src/${SCOUT_EXPORT} names ${leaked.join(", ")} from src/${rel}. The export stays ` +
          "draft-independent at this stage; wiring the two together is a product decision with " +
          "its own change note, not a side effect.",
      ).toEqual([])
    }
  })

  it("keeps the draft modules away from score, rank and the role gate", () => {
    // Mutation that turns this red: import anything from scout/analysis into
    // either draft module, or call one of the scoring multipliers from them.
    for (const rel of PURE_DOMAIN_FILES) {
      expect(
        importedModules(rel),
        `src/${rel} imports the scout analysis engine. The board is slot bookkeeping and ` +
          "availability; the score, the rank multiplier and the role gate are the scout's, with " +
          "their own measured thresholds and a clamp order CLAUDE.md warns has already been " +
          "broken twice. isBanCandidateAvailable is deliberately a boolean about VISIBILITY - it " +
          "must never be able to reach a score.",
      ).not.toContain("scout/analysis")
      const code = file(rel).code
      const used = SCOUT_ENGINE_NAMES.filter((name) => mentions(code, name))
      expect(
        used,
        `src/${rel} references ${used.join(", ")}. Scoring a draft is a later stage of the war ` +
          "room programme, and it will be its own module with its own tests.",
      ).toEqual([])
    }
  })

  it("names scout engine functions that really exist", () => {
    // Mutation that turns this red: misspell an entry in SCOUT_ENGINE_NAMES -
    // the guard above would then be looking for a name nothing could ever
    // contain, and would pass whatever the draft modules do.
    const analysisExports = exportedNames(file(SCOUT_ANALYSIS).code)
    const unknown = SCOUT_ENGINE_NAMES.filter((name) => !analysisExports.includes(name))
    expect(
      unknown,
      `SCANNER PROBLEM, not a rule violation: ${unknown.join(", ")} are not exported by ` +
        `src/${SCOUT_ANALYSIS} any more. Either they were renamed - then rename them here in the ` +
        "same change - or this list is checking for names that cannot appear anywhere.",
    ).toEqual([])
  })

  it("keeps the scout core files unaware of both draft modules", () => {
    // Mutation that turns this red: import draftState or draftAvailability
    // from scout/analysis.ts, scout/types.ts or scout/storage.ts.
    for (const draftRel of PURE_DOMAIN_FILES) {
      const draftExports = exportedNames(file(draftRel).code)
      for (const rel of SCOUT_CORE_FILES) {
        expect(
          importedModules(rel),
          `src/${rel} imports src/${draftRel}. The scout contract, its storage and its engine ` +
            "predate the draft foundation and stay independent of it: SCOUT_SCHEMA_VERSION " +
            "governs persisted user data, and a dependency in this direction would drag the " +
            "draft into it.",
        ).not.toContain(moduleId(draftRel))
        const leaked = draftExports.filter((name) => mentions(file(rel).code, name))
        expect(leaked, `src/${rel} names ${leaked.join(", ")} from src/${draftRel}.`).toEqual([])
      }
    }
  })
})

/* ==========================================================================
 * 8. 0.8.1 WIRED the existing board to the domain rule
 *
 * THIS SECTION WAS DELIBERATELY TURNED AROUND. IT DID NOT ROT, AND IT WAS NOT
 * QUIETLY DELETED.
 *
 * At 0.8.0 this file asserted the exact opposite of what it asserts now:
 * `DraftHelper.tsx` and `DraftBoard.tsx` must NOT import `draft/draftState`. That
 * guard opened with the words "THIS IS NOT A PROHIBITION" and said in full that
 * wiring the board up was the intended next step, that doing so is a behaviour
 * change, and that whoever does it edits this test in the same change and writes
 * the change note.
 *
 * 0.8.1 (Epic C) is that change. The guard is therefore now the COUNTER-statement
 * rather than a hole: the board MUST go through the domain rule, and the day
 * somebody quietly reverts the duplicate check to a local `Set.has` on a
 * `trim().toLowerCase()` key, this section goes red. Deleting it instead would
 * have left the most reversible part of 0.8.1 completely unguarded.
 *
 * The measurement behind the switch, and the reason it cannot block a champion it
 * should not, is in the 0.8.1 change note under docs/changes/ and in the module
 * comment of `src/draft/draftAvailability.ts`.
 * ========================================================================== */

describe("0.8.1 wired the existing board to the domain rule", () => {
  it("has DraftHelper importing both draft modules", () => {
    // Mutation that turns this red: drop either import from DraftHelper.tsx -
    // which is what a revert to the old local sets would do.
    const modules = importedModules(DRAFT_HELPER)
    expect(
      modules,
      `src/${DRAFT_HELPER} no longer imports src/${DRAFT_AVAILABILITY}. THIS IS THE 0.8.0 GUARD, ` +
        "TURNED AROUND ON PURPOSE. Until 0.8.1 the board answered \"is this champion taken?\" in " +
        "eight places with its own trim().toLowerCase() keys; 0.8.1 replaced all eight with the " +
        "one module. If you are deliberately unwiring it again, that is a behaviour change with " +
        "its own change note - and 19 punctuated champions (the apostrophe, dot, ampersand and " +
        "space names) become double-pickable the moment you do.",
    ).toContain(moduleId(DRAFT_AVAILABILITY))
    expect(
      modules,
      `src/${DRAFT_HELPER} no longer imports src/${DRAFT_STATE}. Same note as above: 0.8.0 pinned ` +
        "the opposite of this, as a statement of fact about an extraction that had not been " +
        "connected yet, and said explicitly that connecting it was the intended next step. The " +
        "duplicate guard in applyChampionToSlot is that connection.",
    ).toContain(moduleId(DRAFT_STATE))
  })

  it("runs the duplicate guard through isChampionTaken(draftBoard, championName)", () => {
    // Mutation that turns this red: replace the call with
    // `selectedChampionSet.has(normalizeChampionName(championName))` - the old
    // local check - or with a raw Set.has, or drop it entirely so the board
    // accepts the same champion twice.
    expect(
      hasCall(DRAFT_HELPER, "isChampionTaken", ["draftBoard", "championName"]),
      `src/${DRAFT_HELPER} does not call isChampionTaken(draftBoard, championName). That call IS ` +
        "the duplicate guard in applyChampionToSlot since 0.8.1: it is the tested domain rule " +
        "rather than a local Set lookup, and it compares through championIdentityKey. The bare " +
        "identifier is not enough to check for - it also stands in the import line - so this pins " +
        "the whole call. If the guard moved, pin it where it moved to.",
    ).toBe(true)
  })

  it("builds the board with draftBoardFromSlots from the four existing arrays", () => {
    // Mutation that turns this red: build the DraftSlot list inline in
    // DraftHelper.tsx, or feed draftBoardFromSlots a different set of arrays -
    // either way the board the guard decides on stops being the board on
    // screen.
    expect(
      hasCall(DRAFT_HELPER, "draftBoardFromSlots", [
        "{ bluePickSlots, redPickSlots, blueBans, redBans }",
      ]),
      `src/${DRAFT_HELPER} does not call draftBoardFromSlots({ bluePickSlots, redPickSlots, ` +
        "blueBans, redBans }). That one memo is the bridge: it reads the board's own four state " +
        "arrays into the domain's DraftBoard, and BOTH display sets plus the duplicate guard are " +
        "derived from it. Building a board from a different set of arrays, or building it inline, " +
        "reintroduces exactly the split this change removed - the grid greying out one set while " +
        "the board refuses another.",
    ).toBe(true)
  })

  it("keeps the fearless lock as a second, separate check", () => {
    // Mutation that turns this red: delete the fearless half of the duplicate
    // guard, or fold it into isChampionTaken - champions from EARLIER games of
    // the series are not on this board at all, so the domain rule cannot see
    // them and fearless mode silently stops locking anything.
    expect(
      file(DRAFT_HELPER).code,
      `src/${DRAFT_HELPER} no longer builds a fearless champion set. Fearless bans champions used ` +
        "in earlier games of the series; they are not on the current board, so isChampionTaken " +
        "cannot possibly cover them.",
    ).toMatch(/\bgetFearlessChampionKeys\s*\(/)
    expect(
      hasCall(DRAFT_HELPER, "fearlessChampionSet.has", ["draftAvailabilityKey(championName)"]),
      `src/${DRAFT_HELPER} does not check fearlessChampionSet.has(draftAvailabilityKey(` +
        "championName)) in the duplicate guard. Two things break if this goes: the fearless lock " +
        "stops being enforced at all, or it is enforced on a different key basis than the board, " +
        "so a champion played under a punctuated spelling in game 1 is free again under the " +
        "unpunctuated one in game 2.",
    ).toBe(true)
  })

  it("still writes a role onto a pick slot", () => {
    // Mutation that turns this red: drop `role` from the object written into
    // ownSlots[slot.index] - the board would still render champions, and every
    // role-aware panel would quietly go blank instead.
    expect(
      file(DRAFT_HELPER).code,
      `src/${DRAFT_HELPER} no longer writes a role when a champion is placed in a pick slot. ` +
        "PickSlot.role survived the 0.8.1 refactor on purpose: draftBoardFromSlots reads only " +
        "championName out of a PickSlot, so nothing in the new availability path would ever " +
        "notice the role going missing - but inferChampionRole, the flex catalogue, the role " +
        "recommendations and the export all depend on it.",
    ).toMatch(/\brole\s*:\s*inferredRole\b/)
    expect(file(DRAFT_HELPER).code).toMatch(/\binferChampionRole\s*\(/)
  })

  it("keeps DraftBoard.tsx presentational, with the wiring in the state owner", () => {
    // Mutation that turns this red: import either draft module into
    // DraftBoard.tsx. NOT A PROHIBITION, a statement about where the state
    // lives today - see the message.
    const modules = importedModules(DRAFT_BOARD)
    for (const rel of PURE_DOMAIN_FILES) {
      expect(
        modules,
        `src/${DRAFT_BOARD} now imports src/${rel}. THIS IS NOT A PROHIBITION. The four draft ` +
          "arrays live in App.tsx since 0.8.2 and DraftHelper edits them; DraftBoard only " +
          "renders what it is handed. 0.8.1 wired the availability rule into the component that " +
          "BUILDS the board for that reason, so there is one place where the board is built and " +
          "one place where it is consulted, and 0.8.2 moved the state one level up without " +
          "changing that. If the wiring is being moved deliberately, update this test in the " +
          "same change and say so in the change note. If not, a presentational component has " +
          "just gained a second, independent view of availability - which is the exact split " +
          "0.8.1 removed.",
      ).not.toContain(moduleId(rel))
    }
  })
})

/* ==========================================================================
 * 9. Availability has exactly ONE basis in the UI
 *
 * The most valuable section of this file, and the least visible defect it
 * guards: two answers to "is this champion available?" render perfectly. The
 * grid greys out against one set, the board decides with another, and the
 * symptom is "I clicked a champion and nothing happened" with nothing on screen
 * to explain it.
 *
 * HONESTY ABOUT THE SCOPE. `normalizeChampionName` is NOT banned from
 * `DraftHelper.tsx` and must not be: it is still the right key for historical
 * match statistics and for the champion catalogues, and there are 21 such call
 * sites at 0.8.1 (role catalogue, flex catalogue, role pick score, pair synergy,
 * same-role matchup, team pool map, pool role filter). A blanket ban on the
 * identifier would be red for all of them, and a guard that is red for the wrong
 * reason gets deleted. The rules below therefore forbid the AVAILABILITY shapes
 * specifically and pin the replacements as whole calls.
 * ========================================================================== */

/**
 * Identifiers that only ever appear in an availability decision.
 *
 * A line naming one of these AND `normalizeChampionName` is the old basis coming
 * back. A line naming `roleChampionSet` or `flexChampionCatalog` next to
 * `normalizeChampionName` is a catalogue lookup and perfectly fine.
 */
const AVAILABILITY_ANCHORS: readonly string[] = [
  "selectedChampionSet",
  "bannedChampionSet",
  "fearlessChampionSet",
  "takenChampionKeys",
  "draftBoard",
  "allBans",
  "pickedChampions",
]

/**
 * Availability-shaped call sites, each verified absent at 0.8.1.
 *
 * These are the shapes the pre-0.8.1 code actually had.
 */
const FORBIDDEN_AVAILABILITY_SHAPES: ReadonlyArray<readonly [what: string, pattern: RegExp]> = [
  [
    "normalizeChampionName(slot.championName), i.e. keying a BOARD or SERIES slot",
    callPattern("normalizeChampionName", ["slot.championName"]),
  ],
  [
    "a champion-name list mapped through normalizeChampionName into a Set",
    /\.\s*map\s*\(\s*\(\s*name\s*\)\s*=>\s*normalizeChampionName\s*\(\s*name\s*\)\s*\)/,
  ],
  [
    "selectedChampionSet.has(normalizeChampionName(...)), the old duplicate guard",
    /\bselectedChampionSet\s*\.\s*has\s*\(\s*normalizeChampionName\s*\(/,
  ],
  [
    "bannedChampionSet.has(normalizeChampionName(...)), the old duplicate guard",
    /\bbannedChampionSet\s*\.\s*has\s*\(\s*normalizeChampionName\s*\(/,
  ],
  [
    "fearlessChampionSet.has(normalizeChampionName(...)), the old fearless lock",
    /\bfearlessChampionSet\s*\.\s*has\s*\(\s*normalizeChampionName\s*\(/,
  ],
]

describe("availability has exactly one basis in the UI", () => {
  it("builds both display sets with takenChampionKeys off the one board", () => {
    // Mutation that turns this red: rebuild either set from bluePickSlots /
    // redPickSlots / blueBans / redBans directly - the sets and the duplicate
    // guard would then be two independent answers again, which is the whole
    // defect Epic C removed.
    expect(
      hasCall(DRAFT_HELPER, "takenChampionKeys", [
        'draftBoard.filter((slot) => slot.action === "pick")',
      ]),
      `src/${DRAFT_HELPER} no longer derives selectedChampionSet from ` +
        'takenChampionKeys(draftBoard.filter((slot) => slot.action === "pick")). The champion ' +
        "grid greys out against that set while applyChampionToSlot decides with isChampionTaken " +
        "on the same board. Build it from anything else and the two can disagree, with nothing on " +
        "screen to explain why a click does nothing.",
    ).toBe(true)
    expect(
      hasCall(DRAFT_HELPER, "takenChampionKeys", [
        'draftBoard.filter((slot) => slot.action === "ban")',
      ]),
      `src/${DRAFT_HELPER} no longer derives bannedChampionSet from ` +
        'takenChampionKeys(draftBoard.filter((slot) => slot.action === "ban")). Same reasoning as ' +
        "the pick set above.",
    ).toBe(true)
  })

  it("keys the ban recommendation filter and the fearless lock with draftAvailabilityKey", () => {
    // Mutation that turns this red: revert either call site to
    // normalizeChampionName. Note that a bare-identifier check could NOT catch
    // the first one: normalizeChampionName(entry.championName) is a legitimate
    // shape elsewhere in the same file (the flex catalogue lookup), which is
    // why this pins the whole call instead.
    expect(
      hasCall(DRAFT_HELPER, "draftAvailabilityKey", ["entry.championName"]),
      `src/${DRAFT_HELPER} no longer keys the ban recommendation filter with ` +
        "draftAvailabilityKey(entry.championName). That key is looked up in selectedChampionSet " +
        "and bannedChampionSet, which are built by takenChampionKeys - a different key function " +
        "here means the filter stops matching and already-taken champions keep being recommended.",
    ).toBe(true)
    expect(
      hasCall(DRAFT_HELPER, "draftAvailabilityKey", ["slot.championName"]),
      `src/${DRAFT_HELPER} no longer keys getFearlessChampionKeys with ` +
        "draftAvailabilityKey(slot.championName). The fearless set is compared against " +
        "draftAvailabilityKey(championName) in the duplicate guard; two bases here means a " +
        "champion played under one spelling in game 1 is free again under another in game 2.",
    ).toBe(true)
  })

  it("runs no availability decision through normalizeChampionName any more", () => {
    // Mutation that turns this red: put any of the pre-0.8.1 shapes back -
    // keying a board slot, mapping a name list into a Set, or looking a
    // normalized name up in one of the availability sets.
    const code = file(DRAFT_HELPER).code
    for (const [what, pattern] of FORBIDDEN_AVAILABILITY_SHAPES) {
      expect(
        pattern.test(code),
        `src/${DRAFT_HELPER} contains ${what}. normalizeChampionName is only ` +
          "trim().toLowerCase(), which resolves 154 of 173 champions' spelling variants against " +
          "championIdentityKey's 173 of 173. In an availability role that gap is a double pick. " +
          "It stays the right function for match statistics and the champion catalogues, which " +
          "is why this guard lists shapes instead of banning the name.",
      ).toBe(false)
    }
    const shared = linesNamingBoth(code, AVAILABILITY_ANCHORS, "normalizeChampionName")
    expect(
      shared,
      `src/${DRAFT_HELPER} names normalizeChampionName on the same line as an availability set or ` +
        `the draft board:\n${shared.join("\n")}\nEvery one of those identifiers exists only for ` +
        "the availability decision, so a normalizer next to one of them is the old basis coming " +
        "back. Use draftAvailabilityKey / takenChampionKeys / isChampionTaken.",
    ).toEqual([])
  })

  it("RED GUARD: normalizeChampionName is still used here for other things", () => {
    // Mutation that turns this red: remove the last statistics call site from
    // DraftHelper.tsx - nothing is broken then, but the narrow shape list above
    // has become pointless ceremony and should be replaced by a blanket ban.
    const uses = countMatches(file(DRAFT_HELPER).code, "(?<![\\w$])normalizeChampionName(?![\\w$])")
    expect(
      uses,
      `NOT A RULE VIOLATION, and nothing is broken. src/${DRAFT_HELPER} has stopped using ` +
        "normalizeChampionName for the things it is still right for (21 call sites at 0.8.1: role " +
        "catalogue, flex catalogue, role pick score, pair synergy, same-role matchup, team pool " +
        "map, pool role filter). The " +
        "guard above is written as a narrow list of availability SHAPES precisely because a " +
        "blanket ban on the identifier would have been red for those. If they are gone, replace " +
        "FORBIDDEN_AVAILABILITY_SHAPES with a single " +
        '`expect(mentions(code, "normalizeChampionName")).toBe(false)` - it is strictly stronger.',
    ).toBeGreaterThan(5)
  })

  it("has the champion grid on the same key function and no normalizer of its own", () => {
    // Mutation that turns this red: give ChampionPortraitGrid.tsx back its own
    // local normalizeChampionName - which is what it had before 0.8.1, and the
    // reason the grid could offer a champion the board then refused.
    expect(
      importedModules(CHAMPION_GRID),
      `src/${CHAMPION_GRID} no longer imports src/${DRAFT_AVAILABILITY}.`,
    ).toContain(moduleId(DRAFT_AVAILABILITY))
    expect(
      hasCall(CHAMPION_GRID, "draftAvailabilityKey", ["champion"]),
      `src/${CHAMPION_GRID} does not call draftAvailabilityKey(champion). It looks the result up ` +
        "in selectedChampions and bannedChampions, which DraftHelper builds with " +
        "takenChampionKeys. Any other key function here and the grid greys out a different set " +
        "than the board enforces.",
    ).toBe(true)
    expect(
      definesValue(file(CHAMPION_GRID).code, "normalizeChampionName"),
      `src/${CHAMPION_GRID} defines its own normalizeChampionName again. It had a local copy of ` +
        "the weaker rule until 0.8.1; a private copy is how the grid and the board came to " +
        "disagree in the first place. Import the one key function instead.",
    ).toBe(false)
    expect(
      mentions(file(CHAMPION_GRID).code, "normalizeChampionName"),
      `src/${CHAMPION_GRID} references normalizeChampionName. Everything this component does is ` +
        "an availability decision - which portrait is disabled - so there is no legitimate use " +
        "for the weaker key here, unlike in DraftHelper.tsx.",
    ).toBe(false)
  })
})

/* ==========================================================================
 * 10. 0.8.2 OWNS THE DRAFT IN App.tsx, AND LEFT NO COPY BEHIND
 *
 * The most reversible part of 0.8.2, and the one whose defect is completely
 * invisible.
 *
 * Until 0.8.2 `DraftHelper` held the four arrays in four `useState` hooks. It is
 * rendered conditionally in `App.tsx`, so leaving the draft tab UNMOUNTED it and
 * threw the whole draft away - which is why a read-only copy for the scout could
 * never have worked: there was nothing left to copy by the time the scout tab
 * rendered. The arrays moved to `App.tsx`, which stays mounted, and `DraftHelper`
 * became controlled (`slots` / `onSlotsChange`).
 *
 * The dangerous shape of a revert is NOT deleting the props - that is a compile
 * error and nobody ships it. It is ADDING a local `useState` back beside them,
 * "just for the picks", or "as a fast path". Then both copies exist, both render,
 * and they disagree: the board shows one draft while the ban plan filters against
 * another. Nothing on screen explains it. CLAUDE.md records that exact family of
 * defect three times over (`ScoutManualSource` in three places, `overwrittenRows`
 * against `removedExistingRows`, `banPhaseCounts()` against `prioritizedBans`),
 * every time as two sources for one answer.
 *
 * So the rule this section enforces is narrow and deliberate: the four names may
 * be DESTRUCTURED from the prop and they may be WRITTEN THROUGH, but they may
 * not be DECLARED here. `useState` itself is untouched - `DraftHelper` uses it
 * sixteen more times for state that is rightly local, and its own comment names
 * the hook on purpose, which is why section 2 pins that comment as prose.
 * ========================================================================== */

/** The whole `useState` declaration in App.tsx, factory reference included. */
const APP_DRAFT_STATE =
  /\bconst\s*\[\s*draftSlots\s*,\s*setDraftSlots\s*\]\s*=\s*useState\s*<\s*DraftSlotsState\s*>\s*\(\s*createEmptyDraftSlots\s*\)/

/** The whole memo. Derived from the state, with the state as its only input. */
const APP_DRAFT_BOARD_MEMO =
  /\bconst\s+draftBoard\s*=\s*useMemo\s*\(\s*\(\s*\)\s*=>\s*draftBoardFromSlots\s*\(\s*draftSlots\s*\)\s*,\s*\[\s*draftSlots\s*\]\s*\)/

describe("0.8.2 owns the draft in App.tsx and left no copy behind", () => {
  it("holds the four arrays as one useState<DraftSlotsState>(createEmptyDraftSlots)", () => {
    // Mutation that turns this red: split the state back into four useState
    // hooks in App.tsx, or seed it with createEmptyDraftSlots() instead of the
    // factory reference - the first makes a half-applied draft representable
    // again, the second rebuilds an empty board on every single render.
    expect(
      importedModules(APP),
      `src/${APP} no longer imports src/${DRAFT_AVAILABILITY}. Since 0.8.2 it owns the draft: ` +
        "the empty board and the domain view of it both come from that module, so that App.tsx, " +
        "DraftHelper and the tests all name one shape.",
    ).toContain(moduleId(DRAFT_AVAILABILITY))
    expect(
      APP_DRAFT_STATE.test(file(APP).code),
      `src/${APP} does not declare const [draftSlots, setDraftSlots] = ` +
        "useState<DraftSlotsState>(createEmptyDraftSlots). ONE piece of state, not four: four " +
        "separate setters would let a caller update the picks and forget the bans, and the draft " +
        "would be half-applied for a render. The factory is passed BY REFERENCE for lazy " +
        "initialisation - calling it here would build a fresh empty board on every render of the " +
        "whole app. If this genuinely has to change shape, change DraftSlotsState with it and " +
        "update this pin in the same change.",
    ).toBe(true)
    expect(
      useStateBindings(file(APP).code),
      `SCANNER PROBLEM, not a rule violation: no useState binding was parsed out of src/${APP}, ` +
        "so the mirror guards in this section cannot fail.",
    ).toContain("draftSlots")
  })

  it("derives the board with draftBoardFromSlots(draftSlots) and never stores it", () => {
    // Mutation that turns this red: put the board in its own useState and keep
    // it in sync by hand - then there are two truths again, and the one the
    // scout reads is the stale one.
    expect(
      hasCall(APP, "draftBoardFromSlots", ["draftSlots"]),
      `src/${APP} does not call draftBoardFromSlots(draftSlots). That call is the ONLY bridge ` +
        "from the four arrays the user edits to the DraftSlot list the scout filters against. " +
        "The bare identifier is not enough to check for - it also stands in the import line - so " +
        "this pins the whole call.",
    ).toBe(true)
    expect(
      APP_DRAFT_BOARD_MEMO.test(file(APP).code),
      `src/${APP} no longer derives draftBoard as useMemo(() => draftBoardFromSlots(draftSlots), ` +
        "[draftSlots]). Derived, never stored: a board kept in its own state is a second copy of " +
        "the draft that has to be maintained by hand, and the first missed update shows the " +
        "scout a draft the board does not have. A dependency array that is not exactly " +
        "[draftSlots] is the same defect with an extra step.",
    ).toBe(true)
    expect(
      useStateBindings(file(APP).code),
      `src/${APP} declares draftBoard as state. It is derived from draftSlots; storing it makes ` +
        "it a second truth that can go stale.",
    ).not.toContain("draftBoard")
  })

  it("hands the state to DraftHelper and the derived board to TournamentScout", () => {
    // Mutation that turns this red: drop draftBoard={draftBoard} from the
    // TournamentScout tag - the panel's prop is optional, so the ban plan
    // silently stops accounting for the draft and NOTHING fails to compile.
    const code = file(APP).code
    const helperTag = jsxOpeningTag(code, "DraftHelper")
    expect(
      helperTag,
      `SCANNER PROBLEM, not a rule violation: no <DraftHelper ...> tag was found in src/${APP}. ` +
        "The prop pins below cannot fail while the tag is missing.",
    ).not.toBe("")
    expect(
      hasJsxProp(helperTag, "slots", "draftSlots"),
      `src/${APP} does not pass slots={draftSlots} to DraftHelper. The tag reads: ${helperTag}`,
    ).toBe(true)
    expect(
      hasJsxProp(helperTag, "onSlotsChange", "setDraftSlots"),
      `src/${APP} does not pass onSlotsChange={setDraftSlots} to DraftHelper. Without the setter ` +
        "the board is read-only: every click would compute a new draft and throw it away.",
    ).toBe(true)
    const scoutTag = jsxOpeningTag(code, "TournamentScout")
    expect(
      scoutTag,
      `SCANNER PROBLEM, not a rule violation: no <TournamentScout ...> tag was found in ` +
        `src/${APP}.`,
    ).not.toBe("")
    expect(
      hasJsxProp(scoutTag, "draftBoard", "draftBoard"),
      `src/${APP} does not pass draftBoard={draftBoard} to TournamentScout. THIS IS THE WHOLE ` +
        "POINT OF 0.8.2, and it fails silently: draftBoard is optional all the way down, and an " +
        "omitted board means 'no draft to account for', so the ban plan would go back to " +
        "recommending champions that are already picked without a single type error. The tag " +
        `reads: ${scoutTag}`,
    ).toBe(true)
  })

  it("has DraftHelper holding none of the four arrays itself", () => {
    // Mutation that turns this red: add `const [blueBans, setBlueBans] =
    // useState<string[]>(...)` back to DraftHelper.tsx alongside the props.
    // This is THE guard of this section.
    const bindings = useStateBindings(file(DRAFT_HELPER).code)
    expect(
      bindings.length,
      `SCANNER PROBLEM, not a rule violation: only ${bindings.length} useState bindings were ` +
        `parsed out of src/${DRAFT_HELPER}, which still holds sixteen pieces of legitimately ` +
        "local state (the search box, the weights, the series history). The mirror guard below " +
        "cannot fail while the scanner sees nothing.",
    ).toBeGreaterThan(8)
    const mirrored = LIFTED_DRAFT_ARRAYS.filter((name) => bindings.includes(name))
    expect(
      mirrored,
      `src/${DRAFT_HELPER} declares ${mirrored.join(", ")} as local state again. THE FOUR DRAFT ` +
        "ARRAYS HAVE ONE OWNER, App.tsx, SINCE 0.8.2, AND A LOCAL COPY BESIDE THE PROP IS THE " +
        "DEFECT THIS GUARD EXISTS FOR. It does not fail to compile and it does not look wrong: " +
        "both copies render. They simply disagree, and then the board shows one draft while the " +
        "scout's ban plan filters against another, with nothing on screen to explain it. Read " +
        "the four arrays out of `slots` and write through `onSlotsChange`; if the state is being " +
        "moved somewhere else deliberately, move it - do not duplicate it - and update this test " +
        "in the same change. NOTE the narrowness: useState itself is fine here and is used " +
        "sixteen more times; only these four names may not be declared.",
    ).toEqual([])
  })

  it("has DraftHelper reading the four arrays out of the slots prop", () => {
    // Mutation that turns this red: destructure only some of the four, or
    // rebuild them from anything other than `slots` - the counterpart of the
    // guard above, since "no local useState" alone is also satisfied by a
    // component that lost the arrays entirely.
    expect(
      SLOTS_DESTRUCTURING.test(file(DRAFT_HELPER).code),
      `src/${DRAFT_HELPER} does not read const { bluePickSlots, redPickSlots, blueBans, ` +
        "redBans } = slots. All four come out of ONE prop, in one statement, which is what makes " +
        "a half-applied draft unrepresentable: they move together or not at all.",
    ).toBe(true)
    expect(
      importedModules(DRAFT_HELPER),
      `src/${DRAFT_HELPER} no longer imports src/${DRAFT_AVAILABILITY}, which is where ` +
        "DraftSlotsState is defined. The shape lives in the domain module so App.tsx, the " +
        "component and the tests all name the same one.",
    ).toContain(moduleId(DRAFT_AVAILABILITY))
  })

  it("has all four setter shims writing through onSlotsChange", () => {
    // Mutation that turns this red: point any one shim at a local array, or
    // delete one - the thirty call sites in DraftHelper.tsx call these by name
    // and would go on compiling while one quarter of the draft stopped
    // reaching the owner.
    const code = file(DRAFT_HELPER).code
    for (const setter of LIFTED_DRAFT_SETTERS) {
      expect(
        definesValue(code, setter),
        `src/${DRAFT_HELPER} no longer defines ${setter}. The four shims keep the names and the ` +
          "useState signature the thirty existing call sites expect, which is the only reason " +
          "the 0.8.2 lift did not have to touch them.",
      ).toBe(true)
      expect(
        declarationWindow(code, setter),
        `src/${DRAFT_HELPER} defines ${setter} without reaching onSlotsChange. A setter that ` +
          "writes anywhere else is a second copy of that array by another name: the call sites " +
          "keep working, the owner never hears about it, and the scout filters against a draft " +
          "that is missing whatever that setter controls.",
      ).toContain("onSlotsChange")
    }
  })

  it("carries the board from TournamentScout into the ban plan panel", () => {
    // Mutation that turns this red: stop forwarding the prop in
    // TournamentScout.tsx - the board would arrive at the scout tab and get
    // dropped one component short of the only place that uses it, again with
    // no type error, because the panel's prop is optional too.
    const code = file(TOURNAMENT_SCOUT).code
    expect(
      mentions(code, "draftBoard"),
      `src/${TOURNAMENT_SCOUT} no longer names draftBoard at all, so nothing reaches the ban ` +
        "plan panel.",
    ).toBe(true)
    const panelTag = jsxOpeningTag(code, "ScoutBanPlanPanel")
    expect(
      panelTag,
      "SCANNER PROBLEM, not a rule violation: no <ScoutBanPlanPanel ...> tag was found in " +
        `src/${TOURNAMENT_SCOUT}.`,
    ).not.toBe("")
    expect(
      hasJsxProp(panelTag, "draftBoard", "draftBoard"),
      `src/${TOURNAMENT_SCOUT} does not pass draftBoard={draftBoard} to ScoutBanPlanPanel. The ` +
        `tag reads: ${panelTag}`,
    ).toBe(true)
  })

  it("keeps the tab shell a pass-through, with the filtering in the panel", () => {
    // Mutation that turns this red: filter the candidates in
    // TournamentScout.tsx as well. NOT A PROHIBITION on the file - a statement
    // that the decision has ONE site, see the message.
    expect(
      importedModules(TOURNAMENT_SCOUT),
      `src/${TOURNAMENT_SCOUT} now imports src/${DRAFT_AVAILABILITY}. THIS IS NOT A ` +
        "PROHIBITION. The scout tab carries the board from App.tsx to the ban plan panel and " +
        "decides nothing about it; the panel is where availability is applied, next to the " +
        "ranking and the two filters that have to count the same list. A second filtering site " +
        "is how a chip comes to promise a number the list below it does not show - the defect " +
        "0.7.5 was written to prevent. If the decision is genuinely moving, move it and update " +
        "this test in the same change.",
    ).not.toContain(moduleId(DRAFT_AVAILABILITY))
  })
})

/* ==========================================================================
 * 11. 0.8.2 FILTERS THE BAN PLAN BY THE LIVE DRAFT BOARD
 *
 * THIS SECTION WAS DELIBERATELY TURNED AROUND. IT DID NOT ROT, AND IT WAS NOT
 * QUIETLY DELETED.
 *
 * At 0.8.1 it asserted the exact opposite: `isBanCandidateAvailable` and
 * `filterAvailableBanCandidates` must NOT be referenced from any component. That
 * guard opened with "THIS IS NOT A PROHIBITION" and said in full that wiring
 * them up was the intended next step, that it needs the draft state to reach the
 * scout tab, that the two tabs held separate state, and that whoever does it
 * edits this test in the same change and writes the change note.
 *
 * 0.8.2 is that change, and it is the second time this file has been turned
 * around the way its own guards asked for - section 8 is the first. The lift is
 * described in section 10 and in the 0.8.2 change note under docs/changes/; the
 * behaviour it buys is that a ban suggestion DISAPPEARS once that champion is
 * picked or banned in the draft.
 *
 * So the statement is now the counter-statement: the filter must be there, it
 * must be the ONLY one, and it must sit at exactly one point in the pipeline.
 * Deleting the section instead would have left the whole feature unguarded the
 * day it shipped.
 * ========================================================================== */

const UNWIRED_BAN_PLAN_NAMES: readonly string[] = ["isBanCandidateAvailable"]

const WIRED_BAN_PLAN_NAMES: readonly string[] = ["filterAvailableBanCandidates"]

describe("0.8.2 filters the ban plan by the live draft board", () => {
  it("has exactly one component filtering the ban plan, and it is the ban plan panel", () => {
    // Mutation that turns this red: drop the filter from
    // ScoutBanPlanPanel.tsx (a silent revert - the prop is optional, so the
    // draft is simply ignored again), or add a second filtering site anywhere
    // under src/components/.
    const components = srcFiles().filter((path) => path.startsWith("components/"))
    expect(
      components.length,
      "SCANNER PROBLEM, not a rule violation: the walk found almost no files under " +
        "src/components/, so this guard cannot fail.",
    ).toBeGreaterThan(20)
    for (const name of WIRED_BAN_PLAN_NAMES) {
      const users = components.filter((path) => mentions(file(path).code, name))
      const where = users.length === 0 ? "no component at all" : `src/${users.join(", src/")}`
      expect(
        users,
        `${name} is used by ${where}, and it must be used by exactly src/${BAN_PLAN_PANEL}. ` +
          "THIS IS THE 0.8.1 GUARD, TURNED AROUND ON PURPOSE: 0.8.1 pinned that NO component " +
          "referenced it, as a statement of fact about a helper written and tested ahead of the " +
          "state lift it needed. 0.8.2 lifted the state (section 10) and wired it here. If the " +
          "list is EMPTY, the ban plan has silently stopped accounting for the draft - and it " +
          "fails silently, because the board prop is optional at every level and an absent board " +
          "means 'no draft to account for'. If it names MORE than one file, availability is " +
          "being decided in two places, which is how a phase chip comes to promise a number the " +
          "list does not show. Either way the rule from the module comment stands: this is " +
          "VISIBILITY, never the score.",
      ).toEqual([BAN_PLAN_PANEL])
    }
  })

  it("runs the filter as filterAvailableBanCandidates(ranked, draftBoard ?? [], selector)", () => {
    // Mutation that turns this red: drop the `?? []` (an undefined board would
    // then throw for every user who never opened the draft tab), or drop the
    // selector - RankedBanCandidate carries the name at
    // entry.candidate.championName, so the default selector reads undefined
    // and the filter quietly removes NOTHING.
    expect(
      importedModules(BAN_PLAN_PANEL),
      `src/${BAN_PLAN_PANEL} no longer imports src/${DRAFT_AVAILABILITY}.`,
    ).toContain(moduleId(DRAFT_AVAILABILITY))
    expect(
      hasCall(BAN_PLAN_PANEL, "filterAvailableBanCandidates", [
        "ranked",
        "draftBoard ?? []",
        "(entry) => entry.candidate.championName",
      ]),
      `src/${BAN_PLAN_PANEL} does not call filterAvailableBanCandidates(ranked, ` +
        "draftBoard ?? [], (entry) => entry.candidate.championName). All three arguments are " +
        "load-bearing. It filters the RANKED list, so a champion the draft took cannot renumber " +
        "the ones that remain. `?? []` is what keeps the scout tab working for somebody who " +
        "never opened the draft: an absent board means 'no draft to account for', never " +
        "'everything is taken'. And the selector is why the filter finds anything at all - a " +
        "RankedBanCandidate wraps the candidate to keep its rank, so the name sits at " +
        "entry.candidate.championName and the default top-level selector would read undefined " +
        "and filter nothing, silently. The bare identifier is not enough to check for; it also " +
        "stands in the import line.",
    ).toBe(true)
  })

  it("filters after the ranking and before every filter that counts", () => {
    // Mutation that turns this red: move the filter below
    // banPhaseFilterOptions / banOverlapFilterOption / filterBans, or feed any
    // of those `ranked` instead of `available` - a chip would then read
    // "Gezielt: 4" and open a list of two.
    const code = file(BAN_PLAN_PANEL).code
    const rank = positionOf(code, callPattern("rankBanCandidates", ["banPlan.prioritizedBans"]))
    const filter = positionOf(
      code,
      callPattern("filterAvailableBanCandidates", [
        "ranked",
        "draftBoard ?? []",
        "(entry) => entry.candidate.championName",
      ]),
    )
    const downstream: ReadonlyArray<readonly [what: string, at: number]> = [
      [
        "banPhaseFilterOptions(available, overlapOnly)",
        positionOf(code, callPattern("banPhaseFilterOptions", ["available", "overlapOnly"])),
      ],
      [
        "banOverlapFilterOption(available, phaseFilter, overlapOnly)",
        positionOf(
          code,
          callPattern("banOverlapFilterOption", ["available", "phaseFilter", "overlapOnly"]),
        ),
      ],
      [
        "filterBans(available, phaseFilter, overlapOnly)",
        positionOf(code, callPattern("filterBans", ["available", "phaseFilter", "overlapOnly"])),
      ],
    ]
    expect(
      rank,
      "SCANNER PROBLEM, not a rule violation: rankBanCandidates(banPlan.prioritizedBans) was not " +
        `found in src/${BAN_PLAN_PANEL}, so the ordering below compares against -1 and cannot ` +
        "fail.",
    ).toBeGreaterThan(-1)
    expect(
      rank,
      `src/${BAN_PLAN_PANEL} filters by availability BEFORE ranking. The rank comes from the ` +
        "full list on purpose, so '#7' keeps meaning 'seventh most important ban overall' - " +
        "renumbering after the draft removes one would make the number mean 'third row on " +
        "screen' and nothing else, against the same promise the phase chips have made since " +
        "0.7.5.",
    ).toBeLessThan(filter)
    for (const [what, at] of downstream) {
      expect(
        at,
        `SCANNER PROBLEM, not a rule violation: ${what} was not found in src/${BAN_PLAN_PANEL}. ` +
          "Either it was renamed or its arguments changed - update this pin in the same change - " +
          "or the ordering rule below is comparing against -1 and cannot fail. The arguments are " +
          "part of the pin precisely because every one of these has to start from `available`.",
      ).toBeGreaterThan(-1)
      expect(
        filter,
        `src/${BAN_PLAN_PANEL} runs ${what} BEFORE the draft filter. Everything downstream has ` +
          "to count the same list it shows: filtering last lets a chip promise 'Gezielt: 4' and " +
          "then open a list of two, which is precisely the defect 0.7.5's 'filter first, split " +
          "second' rule was written for.",
      ).toBeLessThan(at)
    }
  })

  it("leaves isBanCandidateAvailable unwired, which is still a statement of fact", () => {
    // Mutation that turns this red: call isBanCandidateAvailable from a
    // component - which may well be the right thing to do one day, and is the
    // point at which this test is meant to be edited.
    const components = srcFiles().filter((path) => path.startsWith("components/"))
    for (const name of UNWIRED_BAN_PLAN_NAMES) {
      const users = components.filter((path) => mentions(file(path).code, name))
      expect(
        users,
        `src/${users.join(", src/")} now uses ${name}. THIS IS NOT A PROHIBITION, and it is the ` +
          "same honesty the 0.8.1 guard was written with. 0.8.2 wired its sibling " +
          "filterAvailableBanCandidates into the ban plan and had no use for the " +
          "single-champion form, so it stays pure, exported and tested, waiting for a caller. " +
          "If you have found that caller, update this test in the same change and write the " +
          "change note. If you have NOT, then something has just gained a dependency on the " +
          "draft by accident - and the rule from the module comment still stands: this is " +
          "VISIBILITY, never the score.",
      ).toEqual([])
    }
  })

  it("exports both helpers all the same, so the guards above have something to look for", () => {
    // Mutation that turns this red: rename or delete either helper - the
    // guards above would then be searching for a name that cannot appear
    // anywhere and would pass whatever the components do.
    const names = exportedNames(file(DRAFT_AVAILABILITY).code)
    const missing = [...WIRED_BAN_PLAN_NAMES, ...UNWIRED_BAN_PLAN_NAMES].filter(
      (name) => !names.includes(name),
    )
    expect(
      missing,
      `SCANNER PROBLEM, not a rule violation: ${missing.join(", ")} are not exported by ` +
        `src/${DRAFT_AVAILABILITY} any more. Either they were renamed - then rename them here in ` +
        "the same change - or the guards above are checking for names nothing could contain.",
    ).toEqual([])
  })

  it("keeps the dependency pointing one way: components import the rule, never the reverse", () => {
    // Mutation that turns this red: import anything from src/components/ into
    // draftAvailability.ts - for instance the RankedBanCandidate type from
    // scoutUiHelpers, which is the tempting one now that the panel filters
    // exactly that shape.
    const importers = [APP, DRAFT_HELPER, CHAMPION_GRID, BAN_PLAN_PANEL]
    for (const rel of importers) {
      expect(
        importedModules(rel),
        `SCANNER PROBLEM, not a rule violation: src/${rel} does not import ` +
          `src/${DRAFT_AVAILABILITY} any more, so the direction this guard is about no longer ` +
          "exists there. If that component genuinely stopped needing the rule, drop it from this " +
          "list; if it stopped by accident, section 10 or 11 above says what it broke.",
      ).toContain(moduleId(DRAFT_AVAILABILITY))
    }
    const upward = importedModules(DRAFT_AVAILABILITY).filter(
      (module) => module.startsWith("components/") || module === moduleId(APP),
    )
    expect(
      upward,
      `src/${DRAFT_AVAILABILITY} imports ${upward.join(", ")}. THE DIRECTION IS THE STATEMENT. ` +
        "Four components import this module and none of that is a problem; the module importing " +
        "one of them back is, and it is the shape a convenience type or a shared constant would " +
        "arrive in. It would make the rule untestable in the same breath - Vitest runs in Node " +
        "here with no jsdom, so a transitive import of a .tsx component drags React into a " +
        "module whose whole purpose is to be testable without one. Section 5 forbids the same " +
        "thing generically; this pins it now that the pull in that direction actually exists.",
    ).toEqual([])
  })

  it("keeps the copied scout export out of it, filter or no filter", () => {
    // Mutation that turns this red: filter the export text by the draft too -
    // the same class of change as pinning it to the ban phase filter, which
    // 0.7.5 deliberately did not do.
    const code = file(SCOUT_EXPORT).code
    const leaked = [...WIRED_BAN_PLAN_NAMES, ...UNWIRED_BAN_PLAN_NAMES, "draftBoard"].filter(
      (name) => mentions(code, name),
    )
    expect(
      leaked,
      `src/${SCOUT_EXPORT} names ${leaked.join(", ")}. THE ASYMMETRY IS DELIBERATE: the PANEL is ` +
        "filtered by the live draft, the copied EXPORT is not. The export is the text a human " +
        "takes out of the tool, and what it says must not depend on which champions happened to " +
        "be on the board at the moment they pressed the button - exactly the reasoning that kept " +
        "buildScoutExportText independent of the phase filter in 0.7.5. If that is being changed " +
        "deliberately, it is a product decision with its own change note.",
    ).toEqual([])
  })
})
