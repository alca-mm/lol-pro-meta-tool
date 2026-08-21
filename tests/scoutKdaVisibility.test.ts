/**
 * Structural guards for the KDA that 0.5.2 makes visible.
 *
 * Until 0.5.2 the KDA was collected by the stats import, typed into the data
 * editor and fed into the ban score (`kdaImpactMultiplier`, CLAUDE.md P4d) —
 * and then never shown anywhere. A number that moves the ban order without
 * appearing on screen is the worst kind of hidden input: the user sees a list
 * they cannot reconstruct. 0.5.2 wires it into the two places results are
 * actually read, the per-player signal rows and the ban plan, plus the
 * plain-text export the user copies out.
 *
 * WHAT THIS FILE GUARDS
 *
 *  1. the wiring exists in BOTH row components and in BOTH export functions —
 *     scoped to each function's own body, so one shared occurrence at the top
 *     of a file cannot satisfy two assertions at once,
 *  2. the one new i18n key exists in both languages, says the same thing in
 *     both, and is referenced from src/,
 *  3. no falsy KDA handling sneaks in with the new code (P4d: "not stated" is
 *     neutral, `0` is a real bad value, and `!kda` / `kda ?? 0` collapse
 *     exactly those two cases),
 *  4. the KDA arrived as a segment, not as prose — no explanatory key, no new
 *     paragraph in the ban row (P4c: the scout is a tool, not documentation),
 *  5. every per-player ban list names its player. `targetBansByPlayer` filters
 *     on `affectedPlayerIds`, not on the target, so ONE candidate is rendered
 *     under every player it hits — and a row under player B that prints the
 *     candidate's global `targetPlayerId` KDA shows B a number B never posted.
 *     `ScoutBanRow` therefore takes `forPlayerId`, both per-player call sites
 *     pass it, and the team-wide list deliberately does not.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE
 *
 * Vitest runs in Node here (vite.config.ts, `test.environment: 'node'`): no
 * jsdom, no document, no window, no rendering. Everything below is therefore
 * either a scan of the *source text* or a read of the two i18n object
 * literals, in the same spirit as tests/scoutUxDeclutter.test.ts, whose
 * helpers and structure this file deliberately mirrors.
 *
 * A source scan proves STRUCTURE and nothing else. It establishes that the
 * call sites exist inside the right functions, that no forbidden pattern is
 * written, and that no paragraph was added. It does NOT establish that:
 *
 *  - the KDA span is actually reached at runtime (a `false && (...)`, an early
 *    `return null`, or a condition that is never true would still pass here),
 *  - it appears in the right position within the row, or that the export puts
 *    it in the right place in the line (section 3 checks the *textual* order
 *    inside `formatCandidate`, which is a proxy, not the rendered order),
 *  - CSS does not hide it, wrap it badly, or collapse the row,
 *  - the result reads well next to the priority percentage.
 *
 * Those remain manual checks. What this file buys is the cheap half: the
 * wiring cannot silently disappear from one of the four call sites, and the
 * neutrality rule cannot silently be broken by the next edit.
 */

import { readFileSync, readdirSync } from "node:fs"
import { sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { de } from "../src/i18n/de"
import { en } from "../src/i18n/en"

/* ==========================================================================
 * Reading the sources
 * ========================================================================== */

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const SRC_DIR = `${ROOT}src/`

const readSource = (relativePath: string): string =>
    readFileSync(`${SRC_DIR}${relativePath}`, "utf8")

/**
 * Comments are stripped before every source scan below, and that is the whole
 * reason section 4 works at all.
 *
 * DECISION — strip comments rather than allowlist the files that quote the
 * forbidden patterns. This repo documents the KDA neutrality rule by QUOTING
 * the wrong code: src/scout/analysis.ts says "`!kda` and `kda ?? 0` both
 * collapse precisely the two cases that have to stay apart", the `kda` field
 * doc in src/scout/types.ts says the same about `!entry.kda`, and the JSDoc of
 * `kdaInputText()` in scoutUiHelpers.ts spells out `kda ? String(kda) : ""` as
 * the mistake it avoids. A raw scan would fail on the very prose that exists to
 * prevent the bug, and the obvious "fix" would be to delete that prose — the
 * exact opposite of what the rule wants. An allowlist of files would be worse
 * still: it would exempt the files most likely to break the rule.
 *
 * Same helper and same reasoning as tests/scoutUxDeclutter.test.ts. The
 * `(?<!:)` keeps a `https://` inside a string literal from eating the rest of
 * its line.
 */
const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, "")

/**
 * Index of the `}` that closes the block opened at `open`, or -1.
 *
 * WHY THIS IS BRACE-BALANCED AND NOT "the next line starting with `}`".
 *
 * That is what it used to be, and the premise ("a top-level function closes at
 * column 0 and nothing inside it does") was simply untrue for a destructured
 * prop list written across lines:
 *
 *     export function ScoutBanRow({
 *         candidate,
 *         rank,
 *         forPlayerId,
 *     }: {                     <-- line-initial `}`, still in the SIGNATURE
 *         ...
 *     }) {                     <-- and another one
 *
 * The slice ended inside the parameter list, the body came back empty, and
 * three guards went red on a reformat that changed no behaviour — pointing at
 * the source, which was correct. A guard that false-reds on cosmetics teaches
 * exactly the wrong lesson: that the guard is the thing in the way.
 *
 * Braces inside `'…'`, `"…"` and `` `…` `` are skipped, and a `${…}` inside a
 * template literal opens a fresh code context, so a JSX line such as
 * `` {kdaLabel !== null ? ` · ${kdaLabel}` : ""} `` balances exactly once.
 *
 * NOT a parser, and two shapes would still fool it: a regex literal containing
 * a lone brace or quote, and an apostrophe in bare JSX text (the string scan
 * bails at the newline, so that one stays contained to its line). Neither
 * exists in the functions scanned here. A mis-slice also stays loud rather
 * than silent: every caller asserts a marker that has to be inside the body it
 * sliced, and the paired components assert they did not reach into each other.
 */
const closingBraceIndex = (source: string, open: number): number => {
    /** One frame per code context; a template literal pushes its own. */
    const stack: Array<{ template: boolean; depth: number }> = [
        { template: false, depth: 0 },
    ]
    let i = open

    /** From an opening quote to just past its partner, or to the line end. */
    const skipQuoted = (from: number): number => {
        const quote = source[from]
        let j = from + 1
        while (j < source.length) {
            if (source[j] === "\\") {
                j += 2
                continue
            }
            if (source[j] === quote) return j + 1
            if (source[j] === "\n") return j
            j += 1
        }
        return source.length
    }

    while (i < source.length) {
        const frame = stack[stack.length - 1]
        const ch = source[i]

        if (frame.template) {
            if (ch === "\\") i += 2
            else if (ch === "`") {
                stack.pop()
                i += 1
            } else if (ch === "$" && source[i + 1] === "{") {
                stack.push({ template: false, depth: 0 })
                i += 2
            } else i += 1
            continue
        }

        if (ch === "'" || ch === '"') {
            i = skipQuoted(i)
            continue
        }
        if (ch === "`") {
            stack.push({ template: true, depth: 0 })
            i += 1
            continue
        }
        if (ch === "{") {
            frame.depth += 1
            i += 1
            continue
        }
        if (ch === "}") {
            if (frame.depth === 0 && stack.length > 1) {
                // Closes a `${…}` interpolation, not a block.
                stack.pop()
                i += 1
                continue
            }
            frame.depth -= 1
            if (frame.depth === 0 && stack.length === 1) return i
            i += 1
            continue
        }
        i += 1
    }
    return -1
}

/**
 * Index of the `{` that opens the body of `function <name>(`, or -1.
 *
 * Balances the parameter parentheses first, so a multi-line destructure and a
 * return-type annotation both land on the right brace. Premise, and the one
 * shape this would get wrong: a function whose return type is an object type
 * literal (`): { a: number } {`) would hand back the type's brace. None of the
 * scanned functions has one, and the caller's marker assertion would say so.
 */
const bodyBraceIndex = (source: string, start: number): number => {
    const parenOpen = source.indexOf("(", start)
    if (parenOpen === -1) return -1
    let depth = 0
    for (let i = parenOpen; i < source.length; i += 1) {
        if (source[i] === "(") depth += 1
        else if (source[i] === ")") {
            depth -= 1
            if (depth === 0) return source.indexOf("{", i)
        }
    }
    return -1
}

/**
 * The body of one top-level function declaration, comments already stripped.
 *
 * The slice starts at `function <name>(`, so it carries the signature — which
 * is what lets a caller check both the props a component takes and what it
 * does with them from one string.
 */
const functionBody = (source: string, name: string): string => {
    const start = source.indexOf(`function ${name}(`)
    if (start === -1) return ""
    const open = bodyBraceIndex(source, start)
    if (open === -1) return ""
    const close = closingBraceIndex(source, open)
    return close === -1 ? "" : source.slice(start, close + 1)
}

/**
 * Just the signature: `function <name>(…)` up to but excluding the body brace.
 *
 * Separate from `functionBody` on purpose. "Does `ScoutBanRow` accept a
 * `forPlayerId` prop" is a question about the parameter list, and answering it
 * against the whole body would also be satisfied by a local variable of that
 * name.
 */
const functionSignature = (source: string, name: string): string => {
    const start = source.indexOf(`function ${name}(`)
    if (start === -1) return ""
    const open = bodyBraceIndex(source, start)
    return open === -1 ? "" : source.slice(start, open)
}

/**
 * The destructured parameter PATTERN of a component - `({ … })`, not the type
 * literal that follows the colon.
 *
 * Narrower than `functionSignature` for one concrete reason, found by mutation
 * probe: `({ candidate, rank }: { candidate; rank; forPlayerId? })` still
 * contains the word "forPlayerId" while the component destructures nothing of
 * the sort. Asking the whole signature would have called that wired.
 *
 * Returns "" for a component that takes `props` whole instead of destructuring
 * - a legitimate style this scan cannot read, and the caller's message says so.
 */
const destructuredProps = (signature: string): string => {
    const open = signature.indexOf("{")
    if (open === -1) return ""
    const close = closingBraceIndex(signature, open)
    return close === -1 ? "" : signature.slice(open, close + 1)
}

/** Every `<p …>…</p>` element written in a JSX body. */
const paragraphElements = (body: string): string[] =>
    body.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? []

/** Raw `<p` count, used to cross-check the element parser above. */
const paragraphOpenCount = (body: string): number => body.match(/<p\b/g)?.length ?? 0

/**
 * Every self-closing `<Tag … />` in a JSX body, comments already stripped.
 *
 * Every call site checked here is self-closing, and the lazy `[^>]*?` stops at
 * the first `/>` — so a run of sibling elements comes back as separate matches
 * and each one can be asked about its own props. Attributes spanning lines are
 * fine; an attribute containing a literal `>` (an arrow function, say) is not,
 * and the element-count assertions would notice.
 */
const jsxElements = (body: string, tag: string): string[] =>
    body.match(new RegExp(`<${tag}\\b[^>]*?/>`, "g")) ?? []

/** The `muted scout-signal-facts` spans — a row's one run of numbers. */
const factsSpanElements = (body: string): string[] =>
    body.match(/<span[^>]*scout-signal-facts[^>]*>[\s\S]*?<\/span>/g) ?? []

/** Does this JSX element pass a `forPlayerId` prop at all? */
const passesForPlayerId = (element: string): boolean => /\bforPlayerId=/.test(element)

/* The wiring predicates, named once so the real assertions in sections 1, 1b
 * and 2 and the mutant fixtures in section 0b run literally the same code. A
 * fixture that exercised a copy of the regex would prove nothing about the
 * regex the assertions use. */

const callsScoutKdaLabel = (body: string): boolean => /scoutKdaLabel\s*\(/.test(body)

/**
 * A real call to `banCandidateKda`, with or without the second argument.
 *
 * Both forms are legitimate and mean different things: the team-wide plan and
 * the export claim no player, so the candidate's own target is the right one
 * and they call it with one argument; the per-player rows pass `forPlayerId`.
 * The optional group is one identifier wide — enough for the argument that
 * exists, narrow enough that an import line, a bare mention or a type position
 * still reads as "not called".
 */
const callsBanCandidateKda = (body: string): boolean =>
    /banCandidateKda\s*\(\s*candidate\s*(?:,\s*[A-Za-z_$][\w$.]*\s*)?\)/.test(body)

/**
 * The per-player form specifically.
 *
 * This is the distinction the review turned up: a row that declares the prop,
 * calls the helper and guards the result can still be wrong, because it passed
 * nothing and is printing the candidate's global target under every player.
 */
const callsBanCandidateKdaForPlayer = (body: string): boolean =>
    /banCandidateKda\s*\(\s*candidate\s*,\s*forPlayerId\s*\)/.test(body)

/* --------------------------------------------------------------------------
 * 0.5.3: the priority beside the KDA is LABELLED
 *
 * Until 0.5.3 the ban row printed a bare `67%` and the run read `67% · KDA
 * 3.2` — one figure that names itself next to one that does not, which invites
 * reading the bare one as another rating of the same kind. The percentage now
 * goes through `scoutBanPriorityLabel(t, candidate)` and arrives as
 * `Priorität 67%`.
 *
 * Three predicates rather than one, because the change has three independent
 * ways of half-happening: the helper is not called, the helper is called and
 * its result never reaches the visible span, or the i18n value behind it stops
 * carrying a word. Each is checked by exactly one of these, and section 0b
 * feeds each a fixture that breaks precisely that link.
 * -------------------------------------------------------------------------- */

/**
 * A real call to `scoutBanPriorityLabel(t, candidate)`.
 *
 * The argument shape is pinned, not just the name. The helper takes the whole
 * candidate on purpose — the rounding, the percent sign and the wording belong
 * to it — so a row that reached past it and formatted `candidate.priority`
 * inline would be the regression, and a leftover import line would still
 * satisfy a plain `toContain("scoutBanPriorityLabel")`.
 */
const callsScoutBanPriorityLabel = (body: string): boolean =>
    /scoutBanPriorityLabel\s*\(\s*t\s*,\s*candidate\s*\)/.test(body)

/**
 * Does this JSX fragment interpolate the labelled priority, `{priorityLabel}`?
 *
 * Asked of ONE span, never of a whole body — and that distinction is the point.
 * A row can call the helper correctly and then put the result somewhere the
 * reader never sees it (a `title=` tooltip is the plausible slip, and `tsc`
 * is perfectly happy with it because the local is used). Every call-site
 * assertion stays green while the visible run of facts is a bare number again.
 */
const rendersPriorityLabel = (element: string): boolean => /\{\s*priorityLabel\s*\}/.test(element)

/** Does an i18n value still carry the `{priority}` that fillPlaceholders substitutes? */
const statesPriorityPlaceholder = (value: string): boolean => value.includes("{priority}")

/**
 * Does an i18n value say what its number IS, or is it a bare figure?
 *
 * Placeholders are removed first, then at least two letters have to remain.
 * `"{priority}%"` is exactly the pre-0.5.3 state this change exists to end, and
 * a guard that only checked "the key exists in both catalogues" would be
 * perfectly green on it. Two letters rather than one so a stray unit letter
 * cannot pass itself off as a word.
 */
const labelsItsNumber = (value: string): boolean => /\p{L}{2,}/u.test(value.replace(/\{\w+\}/g, ""))

/* ==========================================================================
 * The forbidden patterns (P4d, neutrality rule)
 *
 * Each pattern ships the snippets it MUST match and the snippets it must NOT
 * match. Both directions are executed in section 0. Without the `misses` a
 * pattern could be tightened into inertness and stay green; without the `hits`
 * it could be broadened until it fires on the legitimate `=== null` checks and
 * force someone to weaken the rule to get back to green.
 * ========================================================================== */

interface ForbiddenPattern {
    /** Name used in the failure message. */
    readonly name: string
    /** Deliberately without the `g` flag - `.test()` on a global regex is stateful. */
    readonly pattern: RegExp
    /** What goes wrong when this is written. */
    readonly why: string
    readonly hits: readonly string[]
    readonly misses: readonly string[]
}

const FORBIDDEN_KDA_PATTERNS: readonly ForbiddenPattern[] = [
    {
        name: "falsy negation of a KDA value",
        // `!` then an optional dotted prefix, then an identifier that ENDS in
        // `kda`. Ending is what keeps `!kdaLabel` (a string, not the value)
        // and `!Number.isFinite(kda)` out of it.
        pattern: /!\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Za-z_$]*kda\b/i,
        why: "`!kda` treats a stated 0 as 'not stated'. Use `=== null || === undefined`.",
        hits: [
            "if (!kda) return null",
            "if (!entry.kda) return 1",
            "if (!signal.kda) return null",
            "const missing = !banCandidateKda(candidate)",
        ],
        misses: [
            'if (typeof kda !== "number" || !Number.isFinite(kda)) return 1',
            "if (kda === null || kda === undefined) return null",
            "if (kdaLabel !== null) parts.push(kdaLabel)",
            "if (!kdaLabel) return row",
            "if (value > SCOUT_KDA_MAX_PLAUSIBLE) return null",
        ],
    },
    {
        name: "nullish default of a KDA to 0",
        pattern: /[A-Za-z_$]*kda[\w$]*\s*(?:\([^()]*\))?\s*\?\?\s*0(?![\d.])/i,
        why: "`kda ?? 0` turns 'not stated' into the worst possible KDA and penalises every legacy row.",
        hits: [
            "const value = kda ?? 0",
            "kdaImpactMultiplier(entry.kda ?? 0, games)",
            "const shown = banCandidateKda(candidate) ?? 0",
        ],
        misses: [
            "kdaImpactMultiplier(input.kda ?? null, input.games)",
            'const id = warning.playerId ?? ""',
            "const kda = signal.kda ?? null",
        ],
    },
    {
        name: "logical-or default of a KDA to 0",
        pattern: /[A-Za-z_$]*kda[\w$]*\s*(?:\([^()]*\))?\s*\|\|\s*0(?![\d.])/i,
        why: "`kda || 0` does the same as `kda ?? 0` and additionally swallows a stated 0.",
        hits: ["const value = kda || 0", "const value = entry.kda || 0"],
        misses: [
            "if (kda === null || kda === undefined) return null",
            'if (typeof kda !== "number" || !Number.isFinite(kda)) return 1',
        ],
    },
    {
        name: "Number() coercion of a KDA defaulting to 0",
        pattern: /Number\s*\([^()]*kda[^()]*\)\s*(?:\|\||\?\?)\s*0(?![\d.])/i,
        why: "`Number(kda) || 0` hides a bad parse and a stated 0 behind the same number.",
        hits: ["const value = Number(kda) || 0", "const value = Number(entry.kda) ?? 0"],
        misses: ["if (!Number.isFinite(kda)) return 1", "const value = Number(text)"],
    },
    {
        name: "ternary deciding whether a KDA is present",
        // Only an identifier ENDING in `kda` (optionally called) followed by a
        // real `?`. The lookahead lets `kda?: number | null`, `kda ?? null` and
        // `kda?.toFixed(1)` through - those are a type annotation, a nullish
        // coalesce and optional chaining, not a falsy test.
        pattern: /[A-Za-z_$]*kda\s*(?:\([^()]*\))?\s*\?(?![?:.])/i,
        why: "`kda ? x : y` is a falsy test in disguise - a stated 0 takes the 'absent' branch.",
        hits: [
            'const text = kda ? String(kda) : ""',
            "const label = signal.kda ? format(signal.kda) : null",
            "const label = banCandidateKda(candidate) ? render() : null",
        ],
        misses: [
            "kda?: number | null",
            "kdaImpactMultiplier(input.kda ?? null, input.games)",
            'const seg = signal.kda !== null ? ` · ${label}` : ""',
            'const seg = kdaLabel !== null ? ` · ${kdaLabel}` : ""',
        ],
    },
    {
        name: "logical-and gate on a KDA value",
        // THE most likely way this feature breaks, because `{value && <span/>}`
        // is the idiomatic JSX conditional — and with `kda === 0` React renders
        // a bare `0` into the row while the score is busy punishing that exact
        // champion. There is no jsdom here, so nothing else can see it.
        //
        // Deliberately WITHOUT the `[\w$]*` the `??` / `||` rules carry: that
        // would also catch `{kdaLabel && …}`, and `kdaLabel` is `string | null`
        // — never `0`, never `""` — so gating on it is unlovely, not wrong.
        // Same distinction the falsy-negation rule draws with its `\b`. The two
        // row bodies are pinned to `kdaLabel !== null` in section 1 anyway.
        pattern: /[A-Za-z_$]*kda\s*(?:\([^()]*\))?\s*&&/i,
        why: "`kda && <span/>` is a falsy gate: a stated 0 renders as a bare `0` in JSX and vanishes everywhere else.",
        hits: [
            "const seg = signal.kda && ` · ${label}`",
            "{banCandidateKda(candidate) && <span/>}",
            "if (entry.kda && entry.games) return true",
        ],
        misses: [
            "if (kda === null || kda === undefined) return null",
            "kda !== null && games >= 8",
            "if (kdaLabel !== null && rank > 0)",
            "(entry.kda !== undefined && entry.kda !== null) ||",
            "{kdaLabel && <span>{kdaLabel}</span>}",
        ],
    },
    {
        name: "greater-than-zero test on a KDA value",
        // `>` without `=`, and no `[\w$]*`, so the repo's real plausibility
        // checks (`row.kda >= 0`, `kdas.length > 0`, `kdaIndex >= 0`) are all
        // outside it. Verified against every file under src/, not just the
        // scanned ones.
        pattern: /[A-Za-z_$]*kda\s*(?:\([^()]*\))?\s*>\s*0(?![\d.])/i,
        why: "`kda > 0` is the falsy test spelled out - a stated 0 takes the 'absent' branch. Presence is `!== null`; plausibility is `>= 0`.",
        hits: [
            "if (signal.kda > 0) parts.push(label)",
            "const shown = banCandidateKda(candidate) > 0",
        ],
        misses: [
            "if (row.kda !== null && Number.isFinite(row.kda) && row.kda >= 0) entry.kda = row.kda",
            "let kda: number | null = kdas.length > 0 ? kdas[0] : null",
            "kda = kdaIndex >= 0 ? rest[kdaIndex].value : null",
            "if (value < 0 || value > SCOUT_KDA_MAX_PLAUSIBLE) return null",
        ],
    },
    {
        name: "equality-with-zero test that treats a KDA as absent",
        pattern: /[A-Za-z_$]*kda\s*(?:\([^()]*\))?\s*===\s*0\s*\?/i,
        why: "`kda === 0 ? null : …` states the bug outright - a real 0 is dropped instead of scored.",
        hits: [
            "const label = signal.kda === 0 ? null : scoutKdaLabel(t, signal.kda)",
            "const shown = banCandidateKda(candidate) === 0 ? null : label",
        ],
        misses: [
            "kda: kda === null ? null : round3(kda)",
            "kda: kdaCell === null ? null : parseKdaLiteral(kdaCell)",
            "if (deaths === 0) return kills + assists",
        ],
    },
]

/**
 * Every file that reads or writes a KDA, not just the ones this change edits.
 *
 * The first four are the display path. `analysis.ts` is in the list although
 * this task does not change it: it owns `normalizeKda`, `aggregateKda` and
 * `kdaImpactMultiplier`, so it is where a "simplification" of the null
 * handling would hurt most.
 *
 * The last four are the input and persistence path, added once it was checked
 * that all patterns are already green on them — the coverage is free, and
 * those files are where a `kda` is turned into a stored number in the first
 * place. `ScoutDataEditor.tsx` owns the hand-typed field (`withKdaValue`),
 * `statsImport.ts` parses it out of pasted pages, `scoutImportHelpers.ts`
 * decides which parsed rows may be applied, and `storage.ts` is the last gate
 * before localStorage (`if (kda !== null && kda >= 0)`).
 */
const KDA_SCANNED_FILES: readonly string[] = [
    "components/scout/scoutUiHelpers.ts",
    "components/scout/ScoutShared.tsx",
    "components/scout/scoutExport.ts",
    "scout/analysis.ts",
    "components/scout/ScoutDataEditor.tsx",
    "scout/statsImport.ts",
    "components/scout/scoutImportHelpers.ts",
    "scout/storage.ts",
]

/* ==========================================================================
 * 0. The scanner itself
 *
 * Every assertion below is only as trustworthy as the helpers above, and a
 * source scan that silently matches nothing is the classic way a guard test
 * turns vacuous. These run against synthetic strings, so they stay true no
 * matter what the sources do.
 * ========================================================================== */

describe("source scanner", () => {
    it("drops comments, keeps code, and does not choke on a URL", () => {
        expect(stripComments("const a = 1 // !kda is wrong\n")).not.toContain("kda")
        expect(stripComments("/* `!kda` and `kda ?? 0` are wrong */ const a = 1")).not.toContain(
            "kda",
        )
        expect(stripComments("{/* kda ?? 0 */}")).not.toContain("kda")
        expect(stripComments('const u = "https://example.test/x"')).toContain("example.test")
    })

    it("slices a top-level function body and stops at its closing brace", () => {
        const source = [
            "function first(a: number) {",
            "  return a",
            "}",
            "",
            "function second(b: number) {",
            "  return b",
            "}",
            "",
        ].join("\n")

        expect(functionBody(source, "first")).toContain("return a")
        expect(functionBody(source, "first")).not.toContain("return b")
        expect(functionBody(source, "second")).toContain("return b")
        expect(functionBody(source, "second")).not.toContain("return a")
    })

    it("returns an empty body for a function that is not there", () => {
        // The empty string is what makes a missing function fail the wiring
        // assertions instead of throwing an unreadable error.
        expect(functionBody("function other() {\n}\n", "missing")).toBe("")
    })

    it("slices a body whose parameter list spans several lines", () => {
        // THE regression this helper was rewritten for. `}: {` and `}) {` both
        // start a line inside the SIGNATURE, and the old "first line-initial
        // `}`" rule stopped there — body empty, three guards red, source fine.
        const source = [
            "export function ScoutBanRow({",
            "    candidate,",
            "    rank,",
            "    forPlayerId,",
            "}: {",
            "    candidate: BanCandidate",
            "    rank: number",
            "    forPlayerId?: ScoutPlayerId",
            "}) {",
            "    const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))",
            '    return <li className="scout-ban-rank">{rank}</li>',
            "}",
            "",
            "function after() {",
            "    return 2",
            "}",
            "",
        ].join("\n")
        const body = functionBody(source, "ScoutBanRow")

        expect(body).toContain("scout-ban-rank")
        expect(body).not.toContain("return 2")
        expect(functionBody(source, "after")).toContain("return 2")
    })

    it("separates the signature from the body", () => {
        const source = [
            "function Row({",
            "    candidate,",
            "    forPlayerId,",
            "}: {",
            "    forPlayerId?: ScoutPlayerId",
            "}) {",
            "    const local = 1",
            "    return null",
            "}",
            "",
        ].join("\n")

        expect(functionSignature(source, "Row")).toContain("forPlayerId")
        expect(functionSignature(source, "Row")).not.toContain("const local")
        expect(functionSignature(source, "missing")).toBe("")
        // A local variable must NOT look like a prop, which is the whole point
        // of having a signature slice at all.
        expect(functionSignature("function Row(a) {\n  const forPlayerId = 1\n}\n", "Row")).not.toContain(
            "forPlayerId",
        )
    })

    it("reads the destructured props and not the type literal beside them", () => {
        // Found by mutation probe: a signature keeps the word "forPlayerId" in
        // its TYPE even after the destructure stops taking it, so the whole
        // signature is too coarse to answer "does this component take it?".
        const declaredButNotTaken = [
            "function Row({",
            "    candidate,",
            "    rank,",
            "}: {",
            "    candidate: BanCandidate",
            "    rank: number",
            "    forPlayerId?: ScoutPlayerId",
            "}) {",
            "    return null",
            "}",
            "",
        ].join("\n")
        const signature = functionSignature(declaredButNotTaken, "Row")

        expect(signature).toContain("forPlayerId")
        expect(destructuredProps(signature)).not.toContain("forPlayerId")
        expect(destructuredProps(signature)).toContain("candidate")
        expect(destructuredProps("function Row(props: Props) ")).toBe("")
    })

    it("balances nested braces and skips braces written inside strings", () => {
        const source = [
            "function outer(a: number) {",
            "  if (a > 0) { return 1 }",
            '  const brace = "}"',
            "  const tpl = `left ${a} right`",
            '  const jsx = <span>{a !== null ? ` · ${a}` : ""}</span>',
            "  return 0",
            "}",
            "function after() {",
            "  return 2",
            "}",
            "",
        ].join("\n")
        const body = functionBody(source, "outer")

        // Without the string skip the slice would stop at `"}"`, before the
        // return — and without brace balancing it would stop at `{ return 1 }`.
        expect(body).toContain("return 0")
        expect(body).not.toContain("return 2")
        expect(functionBody(source, "after")).toContain("return 2")
    })

    it("returns an empty body when the braces never balance", () => {
        expect(functionBody("function broken() {\n  return 1\n", "broken")).toBe("")
    })

    it("reads self-closing JSX elements and the facts span", () => {
        const body = [
            '<ol className="scout-ban-list">',
            "  <ScoutBanRow candidate={a} rank={1} />",
            "  <ScoutBanRow",
            "    candidate={b}",
            "    rank={2}",
            "    forPlayerId={player.playerId}",
            "  />",
            '  <span className="muted scout-signal-facts">67% · KDA 3.2</span>',
            "</ol>",
        ].join("\n")
        const rows = jsxElements(body, "ScoutBanRow")

        expect(rows).toHaveLength(2)
        expect(passesForPlayerId(rows[0])).toBe(false)
        expect(passesForPlayerId(rows[1])).toBe(true)
        expect(jsxElements(body, "BanGroup")).toEqual([])
        expect(factsSpanElements(body)).toHaveLength(1)
        expect(factsSpanElements(body)[0]).toContain("KDA 3.2")
    })

    it("finds paragraph elements and counts the raw openings", () => {
        const body = '<li><p className="a">{t("k")}</p><span>x</span><p>y</p></li>'

        expect(paragraphElements(body)).toHaveLength(2)
        expect(paragraphOpenCount(body)).toBe(2)
        expect(paragraphElements("<li><span>no paragraph</span></li>")).toEqual([])
    })

    for (const rule of FORBIDDEN_KDA_PATTERNS) {
        it(`pattern "${rule.name}" fires on the bad snippets`, () => {
            for (const snippet of rule.hits) {
                expect(
                    rule.pattern.test(snippet),
                    `pattern "${rule.name}" no longer matches "${snippet}" - it has been ` +
                        "tightened into uselessness and now guards nothing.",
                ).toBe(true)
            }
        })

        it(`pattern "${rule.name}" leaves the legitimate snippets alone`, () => {
            for (const snippet of rule.misses) {
                expect(
                    rule.pattern.test(snippet),
                    `pattern "${rule.name}" falsely matches "${snippet}" - that is correct ` +
                        "code and the pattern would force someone to make it worse.",
                ).toBe(false)
            }
        })
    }
})

/* ==========================================================================
 * 0b. Proof that each guard can go red
 *
 * A guard test is worth exactly as much as its ability to fail. The wiring
 * assertions below run against the real sources, so once the feature is in
 * place they are green and stay green - and a green assertion says nothing
 * about whether it would have caught the mistake it was written for.
 *
 * These fixtures close that hole permanently. They feed the SAME predicates
 * (`functionBody`, `callsScoutKdaLabel`, `callsBanCandidateKda`,
 * `FORBIDDEN_KDA_PATTERNS`, `paragraphElements`) a source in which the wiring
 * is broken in one specific way, and assert the predicate reports it. If
 * someone later loosens a regex or widens a slice, one of these turns red even
 * though the real files are fine.
 * ========================================================================== */

describe("the guards catch the mutations they exist for", () => {
    /** A ScoutShared.tsx in miniature: signal row wired, ban row not. */
    const BAN_ROW_NOT_WIRED = [
        'import { banCandidateKda, scoutKdaLabel } from "./scoutUiHelpers"',
        "",
        "export function ScoutSignalRow({ signal }: { signal: ChampionSignal }) {",
        "  const kdaLabel = scoutKdaLabel(t, signal.kda)",
        '  return <li className="scout-signal-champion">{kdaLabel}</li>',
        "}",
        "",
        "export function ScoutBanRow({ candidate, rank }: Props) {",
        '  return <li className="scout-ban-rank">{rank}</li>',
        "}",
        "",
    ].join("\n")

    it("catches a KDA wired into the signal row only", () => {
        // The import line names both helpers, exactly as it does in the real
        // file - so a file-wide `toContain("scoutKdaLabel")` would be green
        // here. Only the scoped body slice sees the difference.
        expect(BAN_ROW_NOT_WIRED).toContain("scoutKdaLabel")
        expect(callsScoutKdaLabel(functionBody(BAN_ROW_NOT_WIRED, "ScoutSignalRow"))).toBe(true)
        expect(callsScoutKdaLabel(functionBody(BAN_ROW_NOT_WIRED, "ScoutBanRow"))).toBe(false)
        expect(callsBanCandidateKda(functionBody(BAN_ROW_NOT_WIRED, "ScoutBanRow"))).toBe(false)
    })

    it("catches a KDA wired into the ban row only", () => {
        const signalRowNotWired = BAN_ROW_NOT_WIRED.replace(
            "  const kdaLabel = scoutKdaLabel(t, signal.kda)\n",
            "",
        ).replace(
            '  return <li className="scout-ban-rank">{rank}</li>',
            "  const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate))\n" +
                '  return <li className="scout-ban-rank">{rank}</li>',
        )

        expect(callsScoutKdaLabel(functionBody(signalRowNotWired, "ScoutSignalRow"))).toBe(false)
        expect(callsBanCandidateKda(functionBody(signalRowNotWired, "ScoutBanRow"))).toBe(true)
    })

    it("catches a falsy KDA check that slipped into a helper", () => {
        const mutated = [
            "export function scoutKdaLabel(t, kda) {",
            "  if (!kda) return null",
            '  return fillPlaceholders(t("scout_kdaValue"), { kda })',
            "}",
            "",
        ].join("\n")
        const firing = FORBIDDEN_KDA_PATTERNS.filter((rule) => rule.pattern.test(mutated))

        expect(
            firing.map((rule) => rule.name),
            "no forbidden pattern reacts to `if (!kda) return null` - section 5 would let " +
                "the neutrality rule break silently.",
        ).toContain("falsy negation of a KDA value")
    })

    it("catches a nullish default that slipped into the aggregate", () => {
        const mutated = "  return kdaImpactMultiplier(entry.kda ?? 0, entry.games)\n"
        const firing = FORBIDDEN_KDA_PATTERNS.filter((rule) => rule.pattern.test(mutated))

        expect(firing.map((rule) => rule.name)).toContain("nullish default of a KDA to 0")
    })

    it("catches a KDA rendered as a paragraph in the ban row", () => {
        const mutated = [
            "export function ScoutBanRow({ candidate, rank }: Props) {",
            '  return (<li className="scout-ban-rank">',
            '    <p className="scout-kda-note">{scoutKdaLabel(t, banCandidateKda(candidate))}</p>',
            "  </li>)",
            "}",
            "",
        ].join("\n")
        const body = functionBody(mutated, "ScoutBanRow")

        expect(paragraphElements(body).filter((element) => /kda/i.test(element))).toHaveLength(1)
        expect(paragraphOpenCount(body)).toBe(1)
    })

    /**
     * The shape the review actually found: prop declared, helper called,
     * result guarded — and the argument never passed on. Everything the
     * original assertions looked at is true here, which is precisely why they
     * could not see it.
     */
    const BAN_ROW_IGNORES_PLAYER = [
        'import { banCandidateKda, scoutKdaLabel } from "./scoutUiHelpers"',
        "",
        "export function ScoutBanRow({",
        "    candidate,",
        "    rank,",
        "    forPlayerId,",
        "}: {",
        "    candidate: BanCandidate",
        "    rank: number",
        "    forPlayerId?: ScoutPlayerId",
        "}) {",
        "    const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate))",
        '    return <li className="scout-ban-rank">{rank}{kdaLabel !== null ? ` · ${kdaLabel}` : ""}</li>',
        "}",
        "",
    ].join("\n")

    it("catches a ban row that accepts forPlayerId and then ignores it", () => {
        const body = functionBody(BAN_ROW_IGNORES_PLAYER, "ScoutBanRow")

        expect(
            destructuredProps(functionSignature(BAN_ROW_IGNORES_PLAYER, "ScoutBanRow")),
        ).toContain("forPlayerId")
        expect(callsScoutKdaLabel(body)).toBe(true)
        expect(body).toMatch(/kdaLabel\s*!==\s*null/)
        // The widened predicate still says "called" — as it must, because the
        // one-argument form is correct for the team-wide list and the export.
        expect(callsBanCandidateKda(body)).toBe(true)
        // Only this one sees the defect.
        expect(
            callsBanCandidateKdaForPlayer(body),
            "callsBanCandidateKdaForPlayer accepts a row that never passes the prop on - " +
                "the per-player rows would silently print the global target's KDA again.",
        ).toBe(false)
    })

    it("catches a per-player call site that forgets forPlayerId", () => {
        const callSite = [
            '<ol className="scout-ban-list">',
            "  {player.targetBans.map((candidate, index) => (",
            "    <ScoutBanRow key={candidate.championName} candidate={candidate} rank={index + 1} />",
            "  ))}",
            "</ol>",
        ].join("\n")
        const rows = jsxElements(callSite, "ScoutBanRow")

        expect(rows, "the call-site scan found no ScoutBanRow at all").toHaveLength(1)
        expect(
            rows.every(passesForPlayerId),
            "passesForPlayerId accepts a per-player list that names no player - every row " +
                "under every player would show the candidate's global target KDA.",
        ).toBe(false)
    })

    it("catches a team-wide row that claims a player it does not have", () => {
        // The opposite mistake, and the reason section 1b asserts the absence
        // rather than shrugging at it: the prioritised list is a team plan and
        // has no player to be right about.
        const teamWide = "<ScoutBanRow candidate={candidate} rank={index + 1} forPlayerId={player.playerId} />"

        expect(jsxElements(teamWide, "ScoutBanRow").some(passesForPlayerId)).toBe(true)
    })

    it("catches a KDA segment rendered without its null guard", () => {
        // Drop the ternary and every KDA-less row - the common case, and all
        // pre-0.5.0 data - reads `Ahri 30 Spiele · 62% · null`.
        const unguarded = [
            "export function ScoutBanRow({ candidate, rank, forPlayerId }: Props) {",
            "  const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))",
            '  return <span className="muted scout-signal-facts">{`67% · ${kdaLabel}`}</span>',
            "}",
            "",
        ].join("\n")
        const body = functionBody(unguarded, "ScoutBanRow")

        expect(callsBanCandidateKdaForPlayer(body)).toBe(true)
        expect(
            body,
            "the null-guard assertion would pass on a row that interpolates `null` straight " +
                "into the facts span.",
        ).not.toMatch(/kdaLabel\s*!==\s*null/)
    })

    it("catches a KDA split into a second facts span", () => {
        // Two identically-styled spans separated only by the flex gap read as
        // one run: `67% KDA 3.2`, with no separator and a third convention in
        // a tab that already middot-joins its facts.
        const twoSpans = [
            "export function ScoutBanRow({ candidate, rank }: Props) {",
            '  return (<li><span className="muted scout-signal-facts">{priority}%</span>',
            '    <span className="muted scout-signal-facts">{kdaLabel}</span></li>)',
            "}",
            "",
        ].join("\n")

        expect(factsSpanElements(functionBody(twoSpans, "ScoutBanRow"))).toHaveLength(2)
    })

    it("catches a JSX falsy gate on the KDA", () => {
        const mutated = "  {banCandidateKda(candidate) && <span>{kdaLabel}</span>}\n"
        const firing = FORBIDDEN_KDA_PATTERNS.filter((rule) => rule.pattern.test(mutated))

        expect(
            firing.map((rule) => rule.name),
            "no forbidden pattern reacts to the idiomatic `{value && <span/>}` - with a " +
                "stated 0 React would render a bare `0` into the ban row.",
        ).toContain("logical-and gate on a KDA value")
    })

    it("catches a KDA presence check written as a comparison", () => {
        const gt = "  if (signal.kda > 0) parts.push(kdaLabel)\n"
        const eq = "  const label = signal.kda === 0 ? null : scoutKdaLabel(t, signal.kda)\n"

        expect(
            FORBIDDEN_KDA_PATTERNS.filter((rule) => rule.pattern.test(gt)).map((rule) => rule.name),
        ).toContain("greater-than-zero test on a KDA value")
        expect(
            FORBIDDEN_KDA_PATTERNS.filter((rule) => rule.pattern.test(eq)).map((rule) => rule.name),
        ).toContain("equality-with-zero test that treats a KDA as absent")
    })

    /**
     * (a) The pre-0.5.3 row, reconstructed: the percentage is formatted in the
     * JSX and carries no word. Everything the OLD span assertion looked at is
     * true here — one facts span, `candidate.priority` inside it, the KDA
     * middot-joined on — which is exactly why that assertion had to be
     * replaced rather than merely repaired.
     */
    const BAN_ROW_BARE_PRIORITY = [
        'import { banCandidateKda, scoutKdaLabel } from "./scoutUiHelpers"',
        "",
        "export function ScoutBanRow({ candidate, rank, forPlayerId }: Props) {",
        "  const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))",
        '  return (<li className="scout-ban"><span className="muted scout-signal-facts">',
        "    {Math.round(candidate.priority * 100)}%",
        '    {kdaLabel !== null ? ` · ${kdaLabel}` : ""}',
        "  </span></li>)",
        "}",
        "",
    ].join("\n")

    it("catches a ban row that goes back to a bare priority percentage", () => {
        const body = functionBody(BAN_ROW_BARE_PRIORITY, "ScoutBanRow")
        const spans = factsSpanElements(body)

        // The structural guards that survived the change are all satisfied.
        expect(spans, "the fixture's own facts span was not sliced").toHaveLength(1)
        expect(spans[0]).toContain("candidate.priority")
        expect(spans[0]).toMatch(/·\s*\$\{kdaLabel\}/)
        // Only the 0.5.3 predicates see that the number lost its word.
        expect(
            callsScoutBanPriorityLabel(body),
            "callsScoutBanPriorityLabel accepts a row that formats the percentage inline - " +
                "the row would print `67% · KDA 3.2` again.",
        ).toBe(false)
        expect(
            rendersPriorityLabel(spans[0]),
            "rendersPriorityLabel accepts a span that interpolates raw arithmetic instead " +
                "of the labelled string.",
        ).toBe(false)
    })

    /**
     * (b) The subtler half: the helper IS called, correctly, and its result is
     * hung on a tooltip instead of the visible run of facts. `noUnusedLocals`
     * is satisfied, every call-site assertion is satisfied, and the reader is
     * back to a bare percentage.
     */
    const BAN_ROW_PRIORITY_LABEL_NOT_SHOWN = [
        'import { banCandidateKda, scoutBanPriorityLabel, scoutKdaLabel } from "./scoutUiHelpers"',
        "",
        "export function ScoutBanRow({ candidate, rank, forPlayerId }: Props) {",
        "  const priorityLabel = scoutBanPriorityLabel(t, candidate)",
        "  const kdaLabel = scoutKdaLabel(t, banCandidateKda(candidate, forPlayerId))",
        '  return (<li className="scout-ban" title={priorityLabel}>',
        '    <span className="muted scout-signal-facts">',
        "      {Math.round(candidate.priority * 100)}%",
        '      {kdaLabel !== null ? ` · ${kdaLabel}` : ""}',
        "    </span></li>)",
        "}",
        "",
    ].join("\n")

    it("catches a labelled priority that never reaches the facts span", () => {
        const body = functionBody(BAN_ROW_PRIORITY_LABEL_NOT_SHOWN, "ScoutBanRow")
        const spans = factsSpanElements(body)

        expect(spans, "the fixture's own facts span was not sliced").toHaveLength(1)
        // The call-site guard is fully satisfied...
        expect(callsScoutBanPriorityLabel(body)).toBe(true)
        // ...and so is a body-wide search for the const, which is why the span
        // assertion asks the SPAN and not the body.
        expect(rendersPriorityLabel(body)).toBe(true)
        expect(
            rendersPriorityLabel(spans[0]),
            "rendersPriorityLabel was asked of the whole body somewhere instead of the one " +
                "facts span - a priority label parked in a tooltip would count as shown.",
        ).toBe(false)
    })

    it("catches an i18n priority value that lost its {priority} placeholder", () => {
        // (c) `fillPlaceholders` REMOVES an unmatched `{key}` instead of
        // throwing, so this renders as "Priorität %" - a label with nothing
        // left to label - and nothing else in the app goes red.
        const renamed = "Priorität {prio}%"
        const dropped = "Priorität %"

        expect(statesPriorityPlaceholder(de.scout_banPriorityValue)).toBe(true)
        expect(
            statesPriorityPlaceholder(renamed),
            "statesPriorityPlaceholder accepts a renamed placeholder - the percentage would " +
                "silently vanish from the ban row.",
        ).toBe(false)
        expect(statesPriorityPlaceholder(dropped)).toBe(false)
        // Both stay LABELLED, so the label guard cannot stand in for this one.
        expect(labelsItsNumber(renamed)).toBe(true)
        expect(labelsItsNumber(dropped)).toBe(true)
    })

    it("catches an i18n priority value that is a bare percentage again", () => {
        // The mirror image of the fixture above: placeholder intact, word gone.
        // This is the literal pre-0.5.3 output, and a guard that only asserted
        // key existence plus placeholder presence would pass it.
        expect(labelsItsNumber("{priority}%")).toBe(false)
        expect(statesPriorityPlaceholder("{priority}%")).toBe(true)
        expect(labelsItsNumber(de.scout_banPriorityValue)).toBe(true)
        expect(labelsItsNumber(en.scout_banPriorityValue)).toBe(true)
    })

    it("catches an i18n key that exists in one language only", () => {
        // The real assertion reads `"scout_kdaValue" in DE/EN`; this pins that
        // a one-sided catalogue is genuinely visible to it. The compile step
        // would also object today, but only while `Translations` stays a total
        // mapped type - see the note in tests/i18nScoutCopy.test.ts.
        const onlyDe: Record<string, string> = { scout_kdaValue: "KDA {kda}" }
        const onlyEn: Record<string, string> = { scout_other: "x" }

        expect("scout_kdaValue" in onlyDe).toBe(true)
        expect("scout_kdaValue" in onlyEn).toBe(false)
    })
})

/* ==========================================================================
 * 1. The two row components
 *
 * The KDA has to arrive in BOTH of them. `ScoutSignalRow` is where a scout
 * reads a single player, `ScoutBanRow` is where the team reads the plan - and
 * the ban plan is the one screen a captain looks at during champ select. Each
 * assertion is scoped to the component's own body, so the shared import at the
 * top of the file cannot stand in for a missing call site.
 * ========================================================================== */

describe("ScoutShared wires the KDA into both row components", () => {
    const source = stripComments(readSource("components/scout/ScoutShared.tsx"))
    const signalRow = functionBody(source, "ScoutSignalRow")
    const banRow = functionBody(source, "ScoutBanRow")
    const banRowSignature = functionSignature(source, "ScoutBanRow")

    it("looks like the shared components file and not an empty one", () => {
        expect(source.length, "ScoutShared.tsx looks empty").toBeGreaterThan(1500)
    })

    it("sliced both component bodies and kept them apart", () => {
        // Without this the two assertions below could both be satisfied by one
        // over-wide slice, which is exactly the mistake this section exists to
        // avoid.
        expect(signalRow, "ScoutSignalRow not found in ScoutShared.tsx").not.toBe("")
        expect(banRow, "ScoutBanRow not found in ScoutShared.tsx").not.toBe("")
        expect(signalRow, "ScoutSignalRow body lost its own markup").toContain(
            "scout-signal-champion",
        )
        expect(banRow, "ScoutBanRow body lost its own markup").toContain("scout-ban-rank")
        expect(
            signalRow,
            "the ScoutSignalRow slice reaches into ScoutBanRow - functionBody mis-sliced.",
        ).not.toContain("scout-ban-rank")
        expect(
            banRow,
            "the ScoutBanRow slice reaches into ScoutSignalRow - functionBody mis-sliced.",
        ).not.toContain("common_games")
    })

    it("imports scoutKdaLabel and banCandidateKda from the helper module", () => {
        // Both must come from scoutUiHelpers: a locally reimplemented formatter
        // is how a second KDA convention appears next to the one the score uses.
        expect(source, "scoutKdaLabel is not imported").toContain("scoutKdaLabel")
        expect(source, "banCandidateKda is not imported").toContain("banCandidateKda")
        expect(source, "the helper import is gone").toMatch(/from\s+"\.\/scoutUiHelpers"/)
    })

    it("ScoutSignalRow renders the signal's own KDA", () => {
        expect(
            callsScoutKdaLabel(signalRow),
            "ScoutSignalRow does not call scoutKdaLabel - the per-player rows still hide " +
                "the number the ban score is using.",
        ).toBe(true)
        expect(
            signalRow,
            "ScoutSignalRow calls scoutKdaLabel but not with signal.kda - the row must show " +
                "the aggregate the scoring used, not a second number.",
        ).toMatch(/signal\s*\.\s*kda\b/)
        expect(
            signalRow,
            "the KDA segment is not guarded by an explicit null check - a missing KDA, " +
                "which is the common case and true of ALL pre-0.5.0 data, would interpolate " +
                'as " · null".',
        ).toMatch(/kdaLabel\s*!==\s*null/)
    })

    it("ScoutBanRow renders the KDA via banCandidateKda", () => {
        expect(
            callsScoutKdaLabel(banRow),
            "ScoutBanRow does not call scoutKdaLabel - the ban plan, the one screen read " +
                "during champ select, still hides the KDA.",
        ).toBe(true)
        expect(
            callsBanCandidateKda(banRow),
            "ScoutBanRow does not call banCandidateKda(candidate, …) - the ban row must show " +
                "the KDA of the player the ban is aimed at, not an average across signals.",
        ).toBe(true)
        expect(
            banRow,
            "same null guard as the signal row: without it a ban on a champion nobody " +
                'stated a KDA for reads "67% · null".',
        ).toMatch(/kdaLabel\s*!==\s*null/)
    })

    it("ScoutBanRow takes forPlayerId and feeds it to banCandidateKda", () => {
        // The candidate carries ONE `targetPlayerId`, but `targetBansByPlayer`
        // groups by `affectedPlayerIds` - so the same row is rendered under
        // every player it hits. Without the prop, player B's card prints the
        // KDA of whoever the candidate globally targets: a number B never
        // posted, on a screen that is read as being about B.
        expect(
            destructuredProps(banRowSignature),
            "ScoutBanRow does not destructure a forPlayerId prop, so a per-player list has " +
                "no way to say whose numbers its rows are. (If the component was rewritten " +
                "to take `props` whole, this scan cannot read it - rewrite the guard rather " +
                "than dropping it.)",
        ).toMatch(/\bforPlayerId\b/)
        expect(
            callsBanCandidateKdaForPlayer(banRow),
            "ScoutBanRow accepts forPlayerId but does not pass it to banCandidateKda - the " +
                "prop is inert and every per-player row is back to the global target's KDA.",
        ).toBe(true)
    })

    it("ScoutBanRow labels its priority through scoutBanPriorityLabel", () => {
        // 0.5.3. The row used to print a bare `67%` right next to `KDA 3.2`.
        // The word now comes from i18n through the helper, so the rounding, the
        // percent sign and the wording live in one place instead of being
        // spelled out in the JSX of the one screen read during champ select.
        expect(
            source,
            "scoutBanPriorityLabel is not imported into ScoutShared.tsx - the ban row " +
                "cannot be labelling its priority through the shared helper.",
        ).toContain("scoutBanPriorityLabel")
        expect(
            callsScoutBanPriorityLabel(banRow),
            "ScoutBanRow does not call scoutBanPriorityLabel(t, candidate). Either the " +
                "percentage is being formatted inline again (the pre-0.5.3 bare `67%`) or " +
                "the helper is being handed something other than the candidate - it takes " +
                "the whole candidate so the rounding stays in one place.",
        ).toBe(true)
    })

    it("the signal row has no priority to label", () => {
        // A signal row is one champion on one player: games, winrate, KDA, and
        // no ban priority whatsoever - `candidate` does not even exist in that
        // scope. The helper turning up there would mean the two rows have been
        // merged or the wrong wiring copied across.
        expect(
            callsScoutBanPriorityLabel(signalRow),
            "ScoutSignalRow calls scoutBanPriorityLabel - a signal carries no priority.",
        ).toBe(false)
        expect(
            signalRow,
            "scoutBanPriorityLabel appears inside ScoutSignalRow's body. The shared import " +
                "at the top of the file is expected; the body is not.",
        ).not.toContain("scoutBanPriorityLabel")
    })

    it("does not reuse the signal-row wiring for the ban row", () => {
        // `banCandidateKda` belongs to the ban row only; if it turns up in the
        // signal row, the two rows have been wired to the same source and the
        // per-player number is no longer that player's.
        expect(
            signalRow,
            "ScoutSignalRow calls banCandidateKda - a signal row already IS one player's " +
                "signal and must read signal.kda directly.",
        ).not.toContain("banCandidateKda")
    })
})

/* ==========================================================================
 * 1b. Every per-player ban list names its player
 *
 * `ScoutBanRow` taking the prop is half the fix; the other half is the three
 * call sites agreeing on who each list is about. Two of them claim a player
 * and must pass it, one deliberately claims none and must not — and that last
 * one is not an oversight to be "tidied up" later: the prioritised list is the
 * team plan, it has no player to be right about, and target semantics are the
 * only honest reading there.
 * ========================================================================== */

describe("every per-player ban list names its player", () => {
    const analysisPanel = stripComments(readSource("components/scout/ScoutAnalysisPanel.tsx"))
    const banPlan = stripComments(readSource("components/scout/ScoutBanPlanPanel.tsx"))
    const panelBody = functionBody(banPlan, "ScoutBanPlanPanel")
    const banGroupBody = functionBody(banPlan, "BanGroup")

    it("sliced the two panel bodies and kept them apart", () => {
        expect(analysisPanel.length, "ScoutAnalysisPanel.tsx looks empty").toBeGreaterThan(1500)
        expect(panelBody, "ScoutBanPlanPanel not found").not.toBe("")
        expect(banGroupBody, "BanGroup not found").not.toBe("")
        expect(panelBody, "the ScoutBanPlanPanel slice lost its own markup").toContain(
            "scout_teamPlanTitle",
        )
        expect(banGroupBody, "the BanGroup slice lost its own markup").toContain("scout-ban-group")
        expect(
            panelBody,
            "the ScoutBanPlanPanel slice reaches into BanGroup - functionBody mis-sliced.",
        ).not.toContain("scout-ban-group")
        expect(
            banGroupBody,
            "the BanGroup slice reaches into ScoutBanPlanPanel - functionBody mis-sliced.",
        ).not.toContain("scout_teamPlanTitle")
    })

    it("the analysis card passes its own player down", () => {
        const rows = jsxElements(analysisPanel, "ScoutBanRow")

        expect(rows, "expected exactly one ScoutBanRow in ScoutAnalysisPanel.tsx").toHaveLength(1)
        expect(
            rows[0],
            "the player card renders ScoutBanRow without forPlayerId. The card IS one " +
                "player, and an overlap ban lands in several cards - so every card would " +
                "print the candidate's global target KDA.",
        ).toMatch(/forPlayerId=\{\s*player\.playerId\s*\}/)
    })

    it("the team-wide list deliberately passes nothing", () => {
        const rows = jsxElements(panelBody, "ScoutBanRow")

        expect(rows, "expected exactly one team-wide ScoutBanRow").toHaveLength(1)
        expect(
            passesForPlayerId(rows[0]),
            "the prioritised team list passes forPlayerId. It is the TEAM plan: it claims " +
                "no player, so the candidate's own target is the only number it can honestly " +
                "show. Naming a player here would attribute the KDA to someone the row is " +
                "not about.",
        ).toBe(false)
    })

    it("BanGroup forwards whatever it was given", () => {
        const rows = jsxElements(banGroupBody, "ScoutBanRow")

        expect(rows, "expected exactly one ScoutBanRow inside BanGroup").toHaveLength(1)
        expect(
            rows[0],
            "BanGroup does not forward forPlayerId, so the per-player groups below cannot " +
                "reach ScoutBanRow with it however carefully they pass it in.",
        ).toMatch(/forPlayerId=\{\s*forPlayerId\s*\}/)
    })

    it("only the group whose heading names a player passes forPlayerId", () => {
        const groups = jsxElements(panelBody, "BanGroup")
        const namesAPlayer = groups.filter((group) => /player\.displayName/.test(group))

        expect(groups.length, "expected several BanGroup call sites").toBeGreaterThanOrEqual(3)
        expect(
            namesAPlayer,
            "no BanGroup heading contains player.displayName - the per-player target ban " +
                "groups are gone, or the heading is built somewhere this scan cannot see.",
        ).toHaveLength(1)
        expect(
            passesForPlayerId(namesAPlayer[0]),
            "the group headed by a player's name does not pass forPlayerId. The heading " +
                "says whose bans these are; the rows below it would say someone else's KDA.",
        ).toBe(true)
        for (const group of groups.filter((group) => !/player\.displayName/.test(group))) {
            expect(
                passesForPlayerId(group),
                `a BanGroup that names no player passes forPlayerId:\n${group}\n` +
                    "The phase and overlap groups are team-wide. Passing a player there " +
                    "would relabel the same numbers as that player's.",
            ).toBe(false)
        }
    })
})

/* ==========================================================================
 * 2. The plain-text export
 *
 * The export is what the user pastes into Discord, so a KDA missing here is
 * missing from the artefact the team actually shares. Both functions carry it:
 * `formatSignal` for the per-player pick lines, `formatCandidate` for the ban
 * plan head.
 * ========================================================================== */

describe("the scout export states the KDA in both formatters", () => {
    const source = stripComments(readSource("components/scout/scoutExport.ts"))
    const formatSignal = functionBody(source, "formatSignal")
    const formatCandidate = functionBody(source, "formatCandidate")

    it("looks like the export module and not an empty file", () => {
        expect(source.length, "scoutExport.ts looks empty").toBeGreaterThan(2000)
    })

    it("sliced both formatter bodies and kept them apart", () => {
        expect(formatSignal, "formatSignal not found in scoutExport.ts").not.toBe("")
        expect(formatCandidate, "formatCandidate not found in scoutExport.ts").not.toBe("")
        expect(formatSignal, "formatSignal body lost its own code").toContain("championName")
        expect(formatCandidate, "formatCandidate body lost its own code").toContain(
            "banRoleLabels",
        )
        expect(
            formatSignal,
            "the formatSignal slice reaches into formatCandidate - functionBody mis-sliced.",
        ).not.toContain("banRoleLabels")
        expect(
            formatCandidate,
            "the formatCandidate slice reaches into formatSignal - functionBody mis-sliced.",
        ).not.toMatch(/function\s+formatSignal\b/)
    })

    it("imports the same two helpers the UI uses", () => {
        // Same reasoning as in section 1: one formatter, one convention. The
        // export must not build "KDA 3.2" with its own template.
        expect(source, "scoutKdaLabel is not imported into the export").toContain("scoutKdaLabel")
        expect(source, "banCandidateKda is not imported into the export").toContain(
            "banCandidateKda",
        )
    })

    it("formatSignal puts the KDA into the parenthesis list", () => {
        expect(
            callsScoutKdaLabel(formatSignal),
            "formatSignal does not call scoutKdaLabel - the exported pick lines still read " +
                '"Ahri (30 Spiele, 68%)" without the KDA.',
        ).toBe(true)
        expect(
            formatSignal,
            "formatSignal does not read signal.kda - it must state the aggregate the score " +
                "used, not a separately derived number.",
        ).toMatch(/signal\s*\.\s*kda\b/)
    })

    it("formatCandidate puts the KDA into the ban head", () => {
        expect(
            callsScoutKdaLabel(formatCandidate),
            "formatCandidate does not call scoutKdaLabel - the exported ban plan still hides " +
                "the KDA.",
        ).toBe(true)
        expect(
            callsBanCandidateKda(formatCandidate),
            "formatCandidate does not call banCandidateKda(candidate) - the ban head must " +
                "state the target player's KDA.",
        ).toBe(true)
    })

    it("states the KDA before the confidence bracket", () => {
        // HEURISTIC, and named as one: this compares TEXT positions, not the
        // order of the pushes at runtime. It catches the plain mistake of
        // appending the KDA after the `[Hoch]` bracket, which the spec forbids
        // ("inserted BEFORE the confidence bracket"). It cannot catch a build
        // order that differs from the source order - see the file header.
        const lastKda = formatCandidate.toLowerCase().lastIndexOf("kda")
        const confidence = formatCandidate.indexOf("scoutConfidenceKey")

        expect(lastKda, "formatCandidate mentions no KDA at all").toBeGreaterThan(-1)
        expect(confidence, "formatCandidate no longer renders the confidence").toBeGreaterThan(-1)
        expect(
            lastKda,
            "the KDA is written after the confidence bracket in formatCandidate. The head " +
                "reads `1. Karma gegen Mid · Gegner#EUW · KDA 3.2 · [Hoch]`, so the KDA " +
                "segment is pushed before the bracket.",
        ).toBeLessThan(confidence)
    })

    it("keeps the separator rule of the file: still no dash", () => {
        // The export is copy the user reads (CLAUDE.md P4a). The KDA segments
        // are joined with the file's two existing separators, never a third
        // glyph, and the joins live in code rather than in i18n - which is
        // precisely why they need a test of their own.
        expect(formatSignal, "a dash appeared in formatSignal").not.toMatch(/[—–]/)
        expect(formatCandidate, "a dash appeared in formatCandidate").not.toMatch(/[—–]/)
    })
})

/* ==========================================================================
 * 3. The one new i18n key
 *
 * "KDA" is an acronym, not copy - it is the same word in both languages, and
 * the value is a label, not a sentence. tests/i18nScoutCopy.test.ts already
 * enforces key parity, placeholder parity and the dash ban across every
 * `scout_` key; what is pinned here is what is specific to this one key.
 * ========================================================================== */

const DE: Record<string, string> = de
const EN: Record<string, string> = en

describe("i18n key scout_kdaValue", () => {
    it("exists in both catalogues", () => {
        expect(
            "scout_kdaValue" in DE,
            "scout_kdaValue is missing from src/i18n/de.ts",
        ).toBe(true)
        expect(
            "scout_kdaValue" in EN,
            "scout_kdaValue is missing from src/i18n/en.ts - de.ts alone is not enough, " +
                "the English UI would fall back to a raw key.",
        ).toBe(true)
    })

    it("renders exactly `KDA {kda}` in both languages", () => {
        // A golden text, deliberately, and the only one in this file. The value
        // is an acronym plus a placeholder; there is no wording decision left
        // to make, and pinning it is what keeps the two languages identical and
        // the placeholder name in sync with `scoutKdaLabel`'s params object.
        expect(DE.scout_kdaValue, "de.scout_kdaValue changed shape").toBe("KDA {kda}")
        expect(EN.scout_kdaValue, "en.scout_kdaValue changed shape").toBe("KDA {kda}")
        expect(
            EN.scout_kdaValue,
            "DE and EN differ - KDA is an acronym and must not be translated.",
        ).toBe(DE.scout_kdaValue)
    })

    it("carries the {kda} placeholder fillPlaceholders substitutes", () => {
        // A renamed placeholder would not throw: `fillPlaceholders` REMOVES an
        // unmatched `{key}`, so the UI would silently print a bare "KDA".
        for (const [lang, value] of [
            ["de", DE.scout_kdaValue],
            ["en", EN.scout_kdaValue],
        ] as const) {
            expect(value, `${lang}.scout_kdaValue lost its {kda} placeholder`).toContain("{kda}")
        }
    })
})

/* ==========================================================================
 * 3b. The i18n key 0.5.3 adds: scout_banPriorityValue
 *
 * The point of 0.5.3 is not that the priority HAS a key - it is that the number
 * says what it is. A guard that only asked "does scout_banPriorityValue exist
 * in both catalogues, with its placeholder" would be perfectly green on a value
 * of `"{priority}%"`, which is the bare figure this change removed. So the
 * label itself is asserted, not just the key.
 * ========================================================================== */

describe("i18n key scout_banPriorityValue", () => {
    it("exists in both catalogues", () => {
        expect(
            "scout_banPriorityValue" in DE,
            "scout_banPriorityValue is missing from src/i18n/de.ts",
        ).toBe(true)
        expect(
            "scout_banPriorityValue" in EN,
            "scout_banPriorityValue is missing from src/i18n/en.ts - de.ts alone is not " +
                "enough, the English ban plan would fall back to a raw key.",
        ).toBe(true)
    })

    it("carries the {priority} placeholder fillPlaceholders substitutes", () => {
        // Same trap as scout_kdaValue: `fillPlaceholders` REMOVES an unmatched
        // `{key}` rather than throwing, so a renamed placeholder prints
        // "Priorität %" - a label with nothing left to label - and no test
        // anywhere else notices.
        for (const [lang, value] of [
            ["de", DE.scout_banPriorityValue],
            ["en", EN.scout_banPriorityValue],
        ] as const) {
            expect(
                statesPriorityPlaceholder(value),
                `${lang}.scout_banPriorityValue lost its {priority} placeholder: "${value}"`,
            ).toBe(true)
        }
    })

    it("labels the number instead of printing it bare", () => {
        // THE assertion of this section. `"{priority}%"` satisfies every other
        // check in this file and is exactly the state 0.5.3 exists to end.
        for (const [lang, value] of [
            ["de", DE.scout_banPriorityValue],
            ["en", EN.scout_banPriorityValue],
        ] as const) {
            expect(
                labelsItsNumber(value),
                `${lang}.scout_banPriorityValue is "${value}" - once the placeholder is ` +
                    "substituted that is a bare figure. The ban row prints it beside " +
                    "`KDA 3.2`, and one labelled number next to one unlabelled one reads as " +
                    "two of the same kind. Give it its word back.",
            ).toBe(true)
        }
    })

    it("is a label, not a sentence (P4c)", () => {
        for (const [lang, value] of [
            ["de", DE.scout_banPriorityValue],
            ["en", EN.scout_banPriorityValue],
        ] as const) {
            expect(
                value.length,
                `${lang}.scout_banPriorityValue is ${value.length} characters - it labels ` +
                    'one number inside a row of facts ("Priorität 67%"), it does not ' +
                    "explain what a ban priority is. That belongs in a collapsed <details>.",
            ).toBeLessThanOrEqual(32)
            expect(
                value,
                `${lang}.scout_banPriorityValue gained sentence punctuation - it sits ` +
                    "mid-run between the champion name and the KDA.",
            ).not.toMatch(/[.!?]/)
        }
    })

    it("is translated, unlike the KDA acronym beside it", () => {
        // The deliberate contrast with section 3: "KDA" is an acronym and must
        // read identically in both languages, "Priority" is a word and must
        // not. Two keys, two rules, and mixing them up is a copy-paste away.
        expect(
            EN.scout_banPriorityValue,
            "de and en carry the same priority label. Unlike KDA this is an ordinary word " +
                "- one of the two catalogues was filled from the other.",
        ).not.toBe(DE.scout_banPriorityValue)
    })
})

/* ==========================================================================
 * 4. No dead key
 *
 * Same rule as section 8 of tests/i18nScoutCopy.test.ts, applied to the keys
 * these two changes add: a key nobody reads is a promise the app does not keep.
 * src/i18n is excluded because de.ts and en.ts DEFINE the keys.
 * ========================================================================== */

describe("the two row-value keys are actually used", () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
        .map((entry) => entry.split(sep).join("/"))
        .filter((entry) => /\.(ts|tsx)$/.test(entry) && !entry.startsWith("i18n/"))
    const text = files.map((file) => readSource(file)).join("\n")

    it("scanned a plausible source tree", () => {
        // Without this the assertion below passes vacuously the day the scan
        // reads nothing - an empty `text` makes every key look dead, so the
        // failure would at least be loud; a mis-globbed one makes every key
        // look alive, and that is the silent direction.
        expect(files.length, "src/ scan found almost no TypeScript files").toBeGreaterThan(50)
        expect(text, "src/ scan found no scout_title reference at all").toContain("scout_title")
    })

    it("is referenced from src/ outside the catalogues", () => {
        expect(
            text.includes("scout_kdaValue"),
            "scout_kdaValue is in de.ts and en.ts but nowhere in src/ - either wire it up " +
                "through scoutKdaLabel or delete it from both catalogues.",
        ).toBe(true)
    })

    it("scout_banPriorityValue is referenced from src/ outside the catalogues", () => {
        expect(
            text.includes("scout_banPriorityValue"),
            "scout_banPriorityValue is in de.ts and en.ts but nowhere in src/ - the ban row " +
                "has gone back to formatting the percentage itself, which is the pre-0.5.3 " +
                "bare `67%`. Wire it up through scoutBanPriorityLabel or delete it from " +
                "both catalogues.",
        ).toBe(true)
    })
})

/* ==========================================================================
 * 5. The neutrality rule of P4d survives the new code
 *
 * "Not stated" scores EXACTLY 1.0; a stated `0` is a real, bad value. `!kda`
 * and `kda ?? 0` collapse precisely those two cases, and doing so would
 * downgrade every row written before 0.5.0 - none of them carries a KDA.
 * ========================================================================== */

describe("no falsy KDA handling in the files this change touches", () => {
    it("scans the files it means to scan", () => {
        for (const file of KDA_SCANNED_FILES) {
            const source = readSource(file)
            expect(source.length, `${file} looks empty or was moved`).toBeGreaterThan(1000)
        }
    })

    for (const file of KDA_SCANNED_FILES) {
        it(`${file}: writes no falsy KDA check`, () => {
            const source = stripComments(readSource(file))
            const lines = source.split("\n")
            const offenders: string[] = []

            for (const rule of FORBIDDEN_KDA_PATTERNS) {
                // Line by line first, purely so the message can name a line.
                lines.forEach((line, index) => {
                    if (rule.pattern.test(line)) {
                        offenders.push(`${file}:${index + 1} [${rule.name}] ${line.trim()}`)
                    }
                })
                // Then once over the whole file, because a formatter can break
                // `entry.kda\n  ?? 0` across two lines and the loop above would
                // see neither half.
                if (!lines.some((line) => rule.pattern.test(line)) && rule.pattern.test(source)) {
                    offenders.push(`${file} [${rule.name}] (spans more than one line)`)
                }
            }

            expect(
                offenders,
                `falsy KDA handling found:\n${offenders.join("\n")}\n\n` +
                    FORBIDDEN_KDA_PATTERNS.map((rule) => `- ${rule.name}: ${rule.why}`).join("\n") +
                    "\n\nA value that was never stated is neutral (multiplier 1.0); a stated " +
                    "0 is a real bad value. Test `=== null || === undefined` explicitly - " +
                    "see CLAUDE.md P4d and the `kda` field doc in src/scout/types.ts.",
            ).toEqual([])
        })
    }
})

/* ==========================================================================
 * 6. The KDA is a segment, not documentation (P4c)
 *
 * "Die UI soll stärker wie ein Werkzeug wirken, nicht wie eine Dokumentation."
 * A KDA is four characters and a number. It gets a span next to the numbers
 * that are already there - no explanatory key, no "KDA unbekannt" line, no
 * paragraph of its own.
 * ========================================================================== */

describe("the KDA adds no prose", () => {
    it("no scout_ key that mentions KDA turns into a paragraph", () => {
        for (const [lang, dict] of [
            ["de", DE],
            ["en", EN],
        ] as const) {
            for (const [key, value] of Object.entries(dict)) {
                if (!key.startsWith("scout_")) continue
                if (!value.toUpperCase().includes("KDA")) continue
                expect(
                    value.length,
                    `${lang}.${key} is ${value.length} characters and mentions the KDA. ` +
                        "P4c: an explanation of what a KDA is belongs in a collapsed " +
                        '<details>, not next to the number. Shorten it, or move it.',
                ).toBeLessThanOrEqual(220)
            }
        }
    })

    it("scout_kdaValue carries no explanatory sentence", () => {
        for (const [lang, value] of [
            ["de", DE.scout_kdaValue],
            ["en", EN.scout_kdaValue],
        ] as const) {
            expect(
                value.length,
                `${lang}.scout_kdaValue is ${value.length} characters - it is a label ` +
                    '("KDA 3.2"), not a sentence.',
            ).toBeLessThanOrEqual(24)
            expect(
                value,
                `${lang}.scout_kdaValue gained sentence punctuation - it labels a number ` +
                    "inside a row of facts and must not read as a claim of its own.",
            ).not.toMatch(/[.!?]/)
        }
    })
})

describe("the ban row gained a span, not a paragraph", () => {
    const source = stripComments(readSource("components/scout/ScoutShared.tsx"))
    const banRow = functionBody(source, "ScoutBanRow")
    const signalRow = functionBody(source, "ScoutSignalRow")

    it("sliced the bodies", () => {
        expect(banRow, "ScoutBanRow not found").not.toBe("")
        expect(signalRow, "ScoutSignalRow not found").not.toBe("")
    })

    it("no paragraph in ScoutBanRow mentions the KDA", () => {
        const guilty = paragraphElements(banRow).filter((element) => /kda/i.test(element))

        expect(
            guilty,
            `ScoutBanRow renders the KDA as a paragraph:\n${guilty.join("\n")}\n` +
                "The spec puts it in an extra `<span className=\"muted scout-signal-facts\">` " +
                "next to the priority percentage. A paragraph turns one number into a " +
                "statement and pushes the reasons down the row.",
        ).toEqual([])
    })

    it("ScoutBanRow still has exactly its two existing paragraphs", () => {
        // The flex warning and the substitute note. A third one is either the
        // KDA in disguise or an unrelated block that this change should not
        // have added; both are worth stopping.
        const count = paragraphOpenCount(banRow)

        expect(
            paragraphElements(banRow).length,
            `${count} <p openings but ${paragraphElements(banRow).length} parsed - a ` +
                "paragraph spans a shape the element parser cannot read.",
        ).toBe(count)
        expect(
            count,
            `ScoutBanRow renders ${count} paragraphs, expected 2 (scout_flexWarning and ` +
                "scout_banSubstituteOnly). If a third one is genuinely wanted, say why here " +
                "and raise the number - do not delete this guard.",
        ).toBe(2)
    })

    it("the ban row has ONE facts span and middot-joins the KDA into it", () => {
        // Priority and KDA used to be two sibling spans carrying identical
        // styling with only the flex gap between them, which reads as one run:
        // `67% KDA 3.2`. The tab already separates facts with a middot in the
        // signal row and in the export; a third convention in the one place
        // read during champ select is the worst spot for it.
        const spans = factsSpanElements(banRow)

        expect(
            spans.length,
            `ScoutBanRow renders ${spans.length} "muted scout-signal-facts" spans, expected ` +
                "1. Priority and KDA belong in the same run of facts, joined by the middot.",
        ).toBe(1)
        expect(
            rendersPriorityLabel(spans[0]),
            `the facts span does not state the priority:\n${spans[0]}\n\n` +
                "Since 0.5.3 the priority is LABELLED and no longer read off the candidate " +
                "here: ScoutBanRow's body calls `scoutBanPriorityLabel(t, candidate)` into a " +
                "`priorityLabel` const, and this span interpolates `{priorityLabel}`. If the " +
                "const was renamed, rename it here too - do not drop the assertion, or the " +
                "span could lose the number entirely and stay green.",
        ).toBe(true)
        expect(
            spans[0],
            `the facts span formats the priority itself:\n${spans[0]}\n\n` +
                "The rounding, the percent sign and the word all belong to " +
                "scoutBanPriorityLabel. Spelling the arithmetic out here is how the bare " +
                "`67%` comes back, and how the two languages drift apart.",
        ).not.toContain("candidate.priority")
        expect(
            spans[0],
            "the KDA is not middot-joined onto the priority inside the facts span. Without " +
                "the separator the row reads `67% KDA 3.2` as one number.",
        ).toMatch(/·\s*\$\{kdaLabel\}/)
    })

    it("the signal row keeps its single facts span too", () => {
        const spans = factsSpanElements(signalRow)

        expect(spans).toHaveLength(1)
        expect(spans[0], "games, winrate and KDA must share one run of facts").toContain(
            "common_games",
        )
        expect(spans[0]).toMatch(/·\s*\$\{kdaLabel\}/)
    })

    it("ScoutSignalRow still has exactly its one existing paragraph", () => {
        const count = paragraphOpenCount(signalRow)

        expect(
            count,
            `ScoutSignalRow renders ${count} paragraphs, expected 1 ` +
                "(scout_onlyIfPlayerStarts). The KDA belongs in the existing muted facts " +
                "span, appended after the winrate.",
        ).toBe(1)
        expect(
            paragraphElements(signalRow).filter((element) => /kda/i.test(element)),
            "ScoutSignalRow renders the KDA as a paragraph instead of a facts segment.",
        ).toEqual([])
    })
})
