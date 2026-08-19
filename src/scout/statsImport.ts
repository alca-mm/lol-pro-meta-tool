/**
 * Tournament Scout — manual stats paste importer.
 *
 * The user opens a scouting site in a second tab, selects the champion table of
 * ONE player for ONE role, copies it, and pastes it here. This module turns
 * that text into reviewable {@link ScoutImportRow}s and, once the user confirms,
 * into ordinary {@link ManualChampionEntry} records.
 *
 * ---------------------------------------------------------------------------
 * THE THREE RULES THIS MODULE IS BUILT AROUND
 *
 * (1) PURE. No input/output of any kind: no requests, no wall clock, no
 *     randomness, no storage. Every exported function is a total function of
 *     its arguments, so the same paste always yields the same rows, the same
 *     `row-<index>` ids and the same warnings. tests/scoutStatsImport.test.ts
 *     asserts this against the source text of this very file.
 *
 * (2) NOTHING IS INVENTED. A value the pasted text did not contain stays
 *     `null` — never `0`, never an average, never the neighbouring row's value.
 *     A `0` would be indistinguishable from a real "0 games" and would flow
 *     straight into a threat score. Out-of-range numbers are reported and
 *     nulled, never clamped: a clamped 100 % looks like a fact.
 *
 * (3) NOTHING IS SWALLOWED. `rows` and `unparsedLines` together account for
 *     every non-empty line of the input, so the UI can truthfully say
 *     "12 of 17 lines understood" instead of showing 12 rows and implying that
 *     was everything.
 *
 *     ONE DOCUMENTED EXCEPTION, added with `opgg_raw_champion_page`: that
 *     layout is the only one where a single logical record spans many lines,
 *     so a per-line accounting would be noise rather than honesty. Dropped
 *     without an `unparsedLines` entry are: the rank number of a block, the
 *     value lines belonging to the "All Champions" aggregate, every line
 *     inside a `vs …` matchup block including the opponent's name, the extra
 *     metric lines inside a champion block, and every line in the
 *     recommendation area that the catalog does not resolve to a champion.
 *
 *     What the user actually needs to know is still reported — the aggregate
 *     row, every `vs …` line in every state, and every recommendation the
 *     CATALOG RESOLVES each get their own `unparsedLines` entry with their own
 *     reason, and the preview counts them. The two qualifications are exact,
 *     not hedging: an unresolved line in the recommendation area is page chrome
 *     as far as any available evidence goes ("Empfohlene Champions" itself is
 *     one such line), so calling it a `recommended_champion` would assert
 *     something untrue, and calling it `noise` would raise `row_not_parsed` on
 *     every ordinary paste and train the user to ignore that warning. It is
 *     dropped, and this sentence says so rather than claiming otherwise.
 *
 *     The spirit of the rule is kept: no *decision* is hidden, only the lines
 *     that carry no decision. See `parseOpggRawChampionPage`.
 * ---------------------------------------------------------------------------
 *
 * The contract lives in section 9 of src/scout/types.ts and is authoritative;
 * this file adds no types of its own that leave the module.
 */

import { ALL_CHAMPIONS } from "../analysis/championCatalog"
import { normalizeScoutRole } from "./linkParser"
import { SCOUT_IMPORT_COLUMNS } from "./types"
import type {
  ManualChampionEntry,
  ScoutConfidence,
  ScoutImportApplyOptions,
  ScoutImportApplyResult,
  ScoutImportColumn,
  ScoutImportLayout,
  ScoutImportRow,
  ScoutImportSourceKind,
  ScoutImportUnparsedLine,
  ScoutImportUnparsedReason,
  ScoutImportWarning,
  ScoutImportWarningCode,
  ScoutRole,
  ScoutStatsImportOptions,
  ScoutStatsImportResult,
} from "./types"

/* ==========================================================================
 * 1. Small normalisation helpers
 * ========================================================================== */

/**
 * Keep only letters and digits, lower-cased. Used for three different lookups —
 * champion names, header captions and games suffixes — and deliberately the
 * *same* function for all of them, so `Kai'Sa` / `kaisa`, `Win Rate` /
 * `win-rate` / `winrate` and `Spiele` / `spiele` collapse identically. Two
 * slightly different normalisers is how `K'Sante` resolves in one place and not
 * in the other.
 */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Trim and collapse inner whitespace runs to single spaces. */
function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

/**
 * Column separators, in one place: a tab, or a run of two or more spaces.
 *
 * A *single* tab is a separator on its own, so `"Zed\t\t55%"` splits into three
 * cells with an empty middle one. Collapsing `\t+` into one separator would
 * shift every following value one column to the left — which is exactly how a
 * winrate ends up in the games field.
 */
const CELL_SEPARATOR = /\t| {2,}/

function hasCellSeparator(line: string): boolean {
  return /\t| {2,}/.test(line)
}

function splitCells(line: string): string[] {
  return line.split(CELL_SEPARATOR).map((cell) => cell.trim())
}

/**
 * Whitespace-split tokens of one line, after two normalisations that only ever
 * *join* things that belong together:
 *
 *   - `"5.2 / 3.1 / 8.4"` → `"5.2/3.1/8.4"` (one KDA token, not five)
 *   - `"62 %"`            → `"62%"`         (one percent token, not two)
 */
function tokenizeLine(line: string): string[] {
  const normalized = line
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+%/g, "%")
    .trim()
  return normalized.length === 0 ? [] : normalized.split(/\s+/)
}

/** A token that starts like a number — the boundary between name and values. */
function isNumericToken(token: string): boolean {
  return /^[+-]?\d/.test(token)
}

/**
 * The separator characters a copied page prints where a column is empty:
 * hyphen, en dash, em dash, underscore, bullet, middle dot, pipe, slash.
 *
 * NO LETTER AND NO DIGIT IS IN THIS CLASS, AND THAT ASYMMETRY IS THE WHOLE
 * SAFETY ARGUMENT: `-5`, `A-` and `36S` cannot match it, so a line that
 * carried something can never be hidden as decoration. Adding `\w` here, or a
 * word like `vs`, would break that guarantee — do not.
 */
const PAGE_NOISE_CHARS = /^[-–—_•·|/]+$/

/**
 * Is this line pure page structure — `-`, `–`, `—`, `---`, `- -`, `•`, `·`,
 * `|`, `/` or any run of them?
 *
 * OP.GG prints a bare `-` in every column it has no value for, so ONE pasted
 * profile carries dozens of them. Reported as `noise` they flooded the preview
 * and raised `row_not_parsed` on every ordinary paste; reported as
 * `page_noise` they are counted instead of listed and raise nothing. The full
 * argument is on {@link ScoutImportUnparsedReason} in ./types.ts.
 *
 * Inner whitespace is removed first, so `- -` and `- - -` count too. Anything
 * else — including a BARE `vs`, which stays `matchup_row` because it really
 * does announce a matchup sub-block — is not page noise.
 */
function isPageNoiseLine(line: string): boolean {
  const compact = line.replace(/\s+/g, "")
  return compact.length > 0 && PAGE_NOISE_CHARS.test(compact)
}

/* ==========================================================================
 * 2. Number parsing
 * ========================================================================== */

/**
 * Parse one numeric literal, resolving the `,` / `.` ambiguity explicitly.
 *
 * THE DOCUMENTED HEURISTIC — the pasted text never says which convention a site
 * used, so the decision is made on digit counts alone and is the same in both
 * directions (`1.234` and `1,234` behave identically):
 *
 *   - no separator                          → plain integer
 *   - several separators                    → all but the LAST are thousands
 *     separators; the last one is judged by the rule below
 *   - last separator with EXACTLY 3 digits
 *     after it and digits before it         → thousands separator (`21,345` →
 *                                             21345, `1.234` → 1234)
 *   - last separator with 1, 2 or 4+ digits → decimal separator (`62.5` → 62.5,
 *                                             `2,8` → 2.8, `7.1416` → 7.1416)
 *
 * The 3-digit rule is the only lossy one: a genuine `1.234` KDA would be read
 * as 1234. That trade is deliberate — thousands-grouped damage figures are
 * common in these tables, four-decimal KDAs are not, and the alternative
 * (asking the user per value) is not something a paste box can do. Callers
 * range-check the result, so a misread damage figure surfaces as a visible
 * number in the preview rather than as silent corruption.
 *
 * Returns `null` for anything that is not a bare number — never `NaN`.
 */
function parseNumericLiteral(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, "")
  const match = /^([+-]?)(\d+(?:[.,]\d+)*)$/.exec(cleaned)
  if (match === null) return null

  const sign = match[1] === "-" ? -1 : 1
  const parts = match[2].split(/[.,]/)
  if (parts.length === 1) return sign * Number(parts[0])

  const last = parts[parts.length - 1]
  const head = parts.slice(0, -1).join("")
  const value =
    last.length === 3 && head.length > 0 ? Number(head + last) : Number(head + "." + last)
  return Number.isFinite(value) ? sign * value : null
}

/** A literal that ends in `%`. Returns the percent value (0–100 scale kept). */
function parsePercentLiteral(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, "")
  if (!cleaned.endsWith("%")) return null
  return parseNumericLiteral(cleaned.slice(0, -1))
}

/** Matches the two composite KDA notations, so the token classifier can tell
 *  a KDA apart from a plain decimal before either is parsed. */
const KDA_COMPOSITE = /^[\d.,]+(?:\/[\d.,]+\/[\d.,]+|:[\d.,]+)$/

/**
 * Parse a KDA in every notation these sites print:
 *
 *   `3.1` · `3,1` · `3.1:1` · `2.87:1` · `5.2/3.1/8.4` · `5.2 / 3.1 / 8.4`
 *
 * THE `D === 0` RULE — "perfect KDA":
 * The triple notation is kills/deaths/assists, and the ratio behind it is
 * `(K + A) / D`. With zero deaths that division is `Infinity`, which is neither
 * storable nor renderable, so the divisor is floored at 1 — the same convention
 * the scouting sites themselves use when they print a "Perfect KDA". `4/0/6`
 * therefore reads as 10, not as `Infinity` and not as `null`.
 *
 * The floor applies to any `D < 1`, so `5/0.5/5` also reads as 10 rather than
 * 20. That is a deliberate simplification of an average-deaths value below one;
 * `kda` is a review aid that is never stored, so the cost is a slightly
 * conservative number in the preview and nothing else.
 */
function parseKdaLiteral(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*:\s*/g, ":")

  const triple = /^([\d.,]+)\/([\d.,]+)\/([\d.,]+)$/.exec(cleaned)
  if (triple !== null) {
    const kills = parseNumericLiteral(triple[1])
    const deaths = parseNumericLiteral(triple[2])
    const assists = parseNumericLiteral(triple[3])
    if (kills === null || deaths === null || assists === null) return null
    return (kills + assists) / Math.max(deaths, 1)
  }

  const ratio = /^([\d.,]+):([\d.,]+)$/.exec(cleaned)
  if (ratio !== null) {
    const left = parseNumericLiteral(ratio[1])
    const right = parseNumericLiteral(ratio[2])
    if (left === null || right === null) return null
    return right === 0 ? left : left / right
  }

  return parseNumericLiteral(cleaned)
}

/**
 * Words that mark a number as a games count (`24 games`, `24 Spiele`, `24G`).
 * DE and EN, normalised through {@link normalizeKey}.
 */
const GAMES_SUFFIXES: ReadonlySet<string> = new Set([
  "games",
  "game",
  "played",
  "plays",
  "matches",
  "spiele",
  "spiel",
  "partien",
  "gespielt",
  "g",
])

/* ==========================================================================
 * 3. Champion resolution
 * ========================================================================== */

/**
 * Catalog lookup by normalised key. Built once from `ALL_CHAMPIONS`; the first
 * spelling wins, so the exported value stays the catalog's own casing.
 */
const CHAMPION_INDEX: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>()
  for (const champion of ALL_CHAMPIONS) {
    const key = normalizeKey(champion)
    if (key.length > 0 && !index.has(key)) index.set(key, champion)
  }
  return index
})()

/**
 * Resolve a pasted champion spelling against src/analysis/championCatalog.ts.
 *
 * Candidate and catalog entry are normalised **identically** (lower-case, every
 * non `a-z0-9` character removed), so `kaisa`, `Kai'sa` and `KAI SA` all reach
 * `"Kai'Sa"`, and `nunu willump` reaches `"Nunu & Willump"`.
 *
 * NO FUZZY MATCHING, EVER — no edit distance, no prefix match, no "nearest
 * catalog entry". A catalog lags behind new releases, and silently rewriting
 * `Ahrii` to `Ahri` would attach one champion's numbers to another. An
 * unresolved name is returned verbatim with `resolved: false`; the row stays
 * visible, carries `unknown_champion`, and the user decides.
 */
export function resolveChampionName(raw: string): { name: string; resolved: boolean } {
  const trimmed = collapseWhitespace(raw)
  if (trimmed.length === 0) return { name: "", resolved: false }

  const canonical = CHAMPION_INDEX.get(normalizeKey(trimmed))
  return canonical === undefined
    ? { name: trimmed, resolved: false }
    : { name: canonical, resolved: true }
}

/**
 * Strip a leading or trailing role word off an unresolved multi-word candidate
 * (`"Karma Support"` → champion `Karma`, role `support`).
 *
 * GUARDED THE SAME WAY THE LINK PARSER GUARDS ITS LEADING ROLE LABELS: the
 * shortened candidate must RESOLVE against the catalog before a word is given
 * up. Without that guard `"Master Yi"` or a future champion whose name happens
 * to contain a role word would lose part of its name. Because a resolved
 * candidate is required, a single-token name can never be reduced to nothing,
 * and the loops terminate — each pass removes one word or breaks.
 *
 * {@link normalizeScoutRole} from ./linkParser is the ONLY role vocabulary in
 * this module. A second, narrower list would drift out of sync with the parser.
 */
function stripRoleWords(words: readonly string[]): { words: string[]; role: ScoutRole } {
  if (resolveChampionName(words.join(" ")).resolved) {
    return { words: words.slice(), role: "unknown" }
  }

  let trailing = words.slice()
  let trailingRole: ScoutRole = "unknown"
  while (trailing.length > 1) {
    const role = normalizeScoutRole(trailing[trailing.length - 1])
    if (role === "unknown") break
    const rest = trailing.slice(0, -1)
    if (!resolveChampionName(rest.join(" ")).resolved) break
    trailing = rest
    trailingRole = role
  }
  if (trailingRole !== "unknown") return { words: trailing, role: trailingRole }

  let leading = words.slice()
  let leadingRole: ScoutRole = "unknown"
  while (leading.length > 1) {
    const role = normalizeScoutRole(leading[0])
    if (role === "unknown") break
    const rest = leading.slice(1)
    if (!resolveChampionName(rest.join(" ")).resolved) break
    leading = rest
    leadingRole = role
  }
  if (leadingRole !== "unknown") return { words: leading, role: leadingRole }

  return { words: words.slice(), role: "unknown" }
}

/** The leading run of non-numeric tokens starting at `start`. */
function takeLeadingWords(tokens: readonly string[], start: number): string[] {
  const words: string[] = []
  for (let index = start; index < tokens.length; index += 1) {
    if (isNumericToken(tokens[index])) break
    words.push(tokens[index])
  }
  return words
}

interface ChampionExtraction {
  name: string
  resolved: boolean
  /** Role read off the champion candidate itself, e.g. `"Karma Support"`. */
  roleFromName: ScoutRole
  /** Everything after the champion — the tokens the value heuristic may use. */
  valueTokens: string[]
}

/**
 * Split a line into "champion" and "everything else": the champion is the
 * leading run of tokens up to the first numeric/percent token.
 *
 * THE RANK INDEX EXCEPTION: many tables print a position number in front of the
 * name (`1  Lee Sin  24  62%`). A single leading integer is dropped as a rank
 * index **only when the words behind it actually resolve to a catalog
 * champion**. That condition is what keeps the exception safe: on
 * `"12 34 56"` nothing resolves, so the `12` is not eaten and the line is
 * honestly reported as `no_champion` instead of becoming a row about a champion
 * named "34".
 */
function extractChampion(tokens: readonly string[]): ChampionExtraction | null {
  let words = takeLeadingWords(tokens, 0)
  let offset = words.length

  if (words.length === 0 && tokens.length > 0 && /^\d+$/.test(tokens[0])) {
    const afterIndex = takeLeadingWords(tokens, 1)
    if (afterIndex.length > 0 && resolveChampionName(afterIndex.join(" ")).resolved) {
      words = afterIndex
      offset = 1 + afterIndex.length
    }
  }

  if (words.length === 0) return null

  const stripped = stripRoleWords(words)
  const resolution = resolveChampionName(stripped.words.join(" "))
  if (resolution.name.length === 0) return null

  return {
    name: resolution.name,
    resolved: resolution.resolved,
    roleFromName: stripped.role,
    valueTokens: tokens.slice(offset),
  }
}

/**
 * The single unambiguous role word in a token list, or `"unknown"`.
 *
 * Two *different* roles in one line mean the text is not telling us anything
 * we can act on, so the answer is `"unknown"` rather than "the first one".
 */
function detectRoleInTokens(tokens: readonly string[]): ScoutRole {
  const found = new Set<ScoutRole>()
  for (const token of tokens) {
    const role = normalizeScoutRole(token)
    if (role !== "unknown") found.add(role)
  }
  return found.size === 1 ? Array.from(found)[0] : "unknown"
}

/* ==========================================================================
 * 4. Header mapping
 * ========================================================================== */

/**
 * Header captions this importer understands, DE and EN, normalised through
 * {@link normalizeKey} — so `Win Rate`, `win-rate`, `WINRATE` and `Win.Rate`
 * are one key, while `cs` and `cs/min` stay two (`cs` vs `csmin`).
 *
 * A caption that is not in here is IGNORED, not guessed: an unrecognised column
 * simply does not appear in {@link ScoutStatsImportResult.columns} and its
 * values are never read. Guessing a caption is how a "Pentakills" column ends
 * up as a games count.
 */
const COLUMN_ALIASES: Readonly<Record<string, ScoutImportColumn>> = {
  champion: "champion",
  champ: "champion",
  held: "champion",

  games: "games",
  game: "games",
  played: "games",
  plays: "games",
  matches: "games",
  spiele: "games",
  partien: "games",
  g: "games",

  winrate: "winrate",
  wr: "winrate",
  win: "winrate",
  siegrate: "winrate",
  siegquote: "winrate",

  kda: "kda",
  kdaratio: "kda",

  cs: "cs",
  minions: "cs",
  farm: "cs",

  csmin: "csPerMin",
  cspm: "csPerMin",
  cspermin: "csPerMin",
  csm: "csPerMin",

  kp: "killParticipation",
  killparticipation: "killParticipation",
  killbeteiligung: "killParticipation",
  teilnahme: "killParticipation",

  damage: "damage",
  dmg: "damage",
  dpm: "damage",
  damagemin: "damage",
  schaden: "damage",

  role: "role",
  lane: "role",
  position: "role",
  rolle: "role",
  pos: "role",
}

function mapHeaderCell(cell: string): ScoutImportColumn | null {
  const key = normalizeKey(cell)
  if (key.length === 0) return null
  return COLUMN_ALIASES[key] ?? null
}

/**
 * Is this tabular line a header row?
 *
 * Two independent signals, either of which is enough:
 *   - it carries no digits at all (the classic caption row), or
 *   - at least two of its cells map to known columns (survives captions like
 *     `Win Rate (last 20)`).
 */
function looksLikeHeader(cells: readonly string[]): boolean {
  if (cells.length < 2) return false
  if (!cells.some((cell) => cell.length > 0)) return false

  const mapped = cells.filter((cell) => mapHeaderCell(cell) !== null).length
  if (mapped >= 2) return true
  return !cells.some((cell) => /\d/.test(cell))
}

/** A header is *usable* once it located the champion or any value column. */
function headerIsUsable(columnMap: readonly (ScoutImportColumn | null)[]): boolean {
  return columnMap.some((column) => column !== null && column !== "role")
}

/* ==========================================================================
 * 5. Source detection
 * ========================================================================== */

/**
 * Guess which site a paste came from — DELIBERATELY NARROW, and only ever a
 * hint.
 *
 * The four supported sites print near-identical tables once the markup is
 * stripped, so the only honest evidence is a site name or a link the user
 * happened to copy along. When nothing matches, or when two providers match at
 * once, the answer is `"unknown"`: a wrong guess would end up in
 * `ManualChampionEntry.source`, which the user later reads as provenance.
 *
 * DECISION — a bare `DPM` does NOT identify dpm.lol. `DPM` is the standard
 * abbreviation for damage per minute and appears as a column header in tables
 * from every provider; treating it as a provider marker would mislabel the
 * provenance of most damage tables. Only the domain `dpm.lol` counts.
 *
 * THE ONE EXCEPTION TO "ONLY A DOMAIN COUNTS" is the raw champion-page copy: it
 * is a distinctive SHAPE rather than a coincidence of wording, and it usually
 * carries no link at all because the user selected a panel, not the address
 * bar. It still needs two independent markers before it counts — see
 * {@link looksLikeOpggRawChampionPage} — and it goes into the same `found` set,
 * so an OP.GG shape pasted next to a leagueofgraphs link still answers
 * `"unknown"` instead of picking a winner.
 */
export function detectStatsSource(raw: string): ScoutImportSourceKind {
  const haystack = raw.toLowerCase()
  const found = new Set<ScoutImportSourceKind>()

  if (haystack.includes("op.gg") || haystack.includes("opgg")) found.add("opgg")
  if (looksLikeOpggRawChampionPage(splitPasteLines(raw))) found.add("opgg")
  if (haystack.includes("leagueofgraphs") || haystack.includes("league of graphs")) {
    found.add("leagueofgraphs")
  }
  if (haystack.includes("deeplol")) found.add("deeplol")
  if (haystack.includes("dpm.lol")) found.add("dpm")

  return found.size === 1 ? Array.from(found)[0] : "unknown"
}

/* ==========================================================================
 * 6. Warnings
 * ========================================================================== */

type WarningSeverity = ScoutImportWarning["severity"]

/**
 * Severity per code, in one table instead of at every call site.
 *
 * `danger` is reserved for "this row cannot be applied at all"
 * (`missing_games` / `missing_winrate`), `warning` for "this is probably wrong,
 * look at it", `info` for "we did something reasonable and are saying so".
 */
const WARNING_SEVERITY: Readonly<Record<ScoutImportWarningCode, WarningSeverity>> = {
  empty_input: "info",
  no_rows_detected: "warning",
  header_not_recognized: "warning",
  columns_guessed: "warning",
  unknown_champion: "warning",
  missing_games: "danger",
  missing_winrate: "danger",
  value_out_of_range: "warning",
  duplicate_champion: "warning",
  role_mismatch: "warning",
  row_not_parsed: "info",
  source_mismatch: "info",
  // `warning`, not `danger`: the row IS applicable — the winrate the site
  // printed is kept unchanged on purpose. And not `info` either: this is
  // precisely the case where the preview has to be read before applying.
  winrate_mismatch: "warning",
}

/**
 * Unparsed reasons that mean "understood and deliberately not a row", as
 * opposed to "looked like a row and could not be read".
 *
 * These must NOT raise `row_not_parsed`. A table header, the aggregate line, a
 * matchup head, a recommended champion and a separator line occur in every
 * well-formed paste of their kind, so reporting them would fire the warning
 * permanently and train the user to ignore it. Genuine failures
 * (`no_champion`, `no_numbers`, `noise`) still raise it.
 *
 * `page_noise` is the one that made the warning useless in practice: a real
 * OP.GG profile prints dozens of `-` lines, so before it existed EVERY normal
 * paste came back with `row_not_parsed`. See `isPageNoiseLine`.
 */
const DELIBERATE_NON_ROW_REASONS: ReadonlySet<ScoutImportUnparsedReason> = new Set([
  "header",
  "aggregate_row",
  "matchup_row",
  "recommended_champion",
  "page_noise",
])

function makeWarning(
  code: ScoutImportWarningCode,
  extras?: Omit<ScoutImportWarning, "code" | "severity">,
): ScoutImportWarning {
  return { code, severity: WARNING_SEVERITY[code], ...extras }
}

/* ==========================================================================
 * 7. Confidence
 * ========================================================================== */

/**
 * The confidence ladder, lowest first: `none < low < medium < high`.
 *
 * `none` is not a synonym for `low` — it means "no basis at all" and must stay
 * distinguishable, which is why this is an explicit order table rather than a
 * numeric score.
 */
const CONFIDENCE_ORDER: readonly ScoutConfidence[] = ["none", "low", "medium", "high"]

function confidenceRank(confidence: ScoutConfidence): number {
  return CONFIDENCE_ORDER.indexOf(confidence)
}

/** The lowest confidence of all rows — an import is only as good as its worst
 *  row, because the user applies the whole preview at once. */
function lowestConfidence(rows: readonly ScoutImportRow[]): ScoutConfidence {
  let lowest: ScoutConfidence = "high"
  for (const row of rows) {
    if (confidenceRank(row.confidence) < confidenceRank(lowest)) lowest = row.confidence
  }
  return rows.length === 0 ? "none" : lowest
}

/* ==========================================================================
 * 8. Value extraction
 * ========================================================================== */

interface RowValues {
  games: number | null
  winrate: number | null
  kda: number | null
  csPerMin: number | null
  killParticipation: number | null
  damage: number | null
  /** `true` when at least one value was parsed but rejected as impossible. */
  outOfRange: boolean
}

/** Percent-shaped value in 0–100, or `null` (with an out-of-range flag). */
function readPercent(raw: string | null): { value: number | null; outOfRange: boolean } {
  if (raw === null || raw.trim().length === 0) return { value: null, outOfRange: false }
  const parsed = parsePercentLiteral(raw) ?? parseNumericLiteral(raw)
  if (parsed === null) return { value: null, outOfRange: false }
  if (parsed < 0 || parsed > 100) return { value: null, outOfRange: true }
  return { value: parsed, outOfRange: false }
}

/** Non-negative plain number, or `null` (with an out-of-range flag). */
function readNonNegative(raw: string | null): { value: number | null; outOfRange: boolean } {
  if (raw === null || raw.trim().length === 0) return { value: null, outOfRange: false }
  const parsed = parseNumericLiteral(stripGamesSuffix(raw))
  if (parsed === null) return { value: null, outOfRange: false }
  if (parsed < 0) return { value: null, outOfRange: true }
  return { value: parsed, outOfRange: false }
}

/** `"24 games"` / `"24G"` → `"24"`. Leaves anything else untouched. */
function stripGamesSuffix(raw: string): string {
  const match = /^([+-]?[\d.,]+)\s*([a-zA-ZäöüÄÖÜß]+)$/.exec(raw.trim())
  if (match === null) return raw
  return GAMES_SUFFIXES.has(normalizeKey(match[2])) ? match[1] : raw
}

/**
 * Read the values out of a row whose columns are known from the header.
 *
 * The header is authoritative here: a column that was not recognised is simply
 * not read, even if its cell obviously holds a number. Mixing a recognised
 * header with positional guessing is how a "Pentakills" column silently becomes
 * a games count; a missing value is reported instead (`missing_games` /
 * `missing_winrate`) and stays visible to the user.
 */
function readValuesFromColumns(
  cells: readonly string[],
  columnMap: readonly (ScoutImportColumn | null)[],
): RowValues {
  const cellFor = (column: ScoutImportColumn): string | null => {
    const index = columnMap.indexOf(column)
    return index >= 0 && index < cells.length ? cells[index] : null
  }

  const games = readNonNegative(cellFor("games"))
  const winrate = readPercent(cellFor("winrate"))
  const killParticipation = readPercent(cellFor("killParticipation"))
  const damage = readNonNegative(cellFor("damage"))
  const csPerMinCell = cellFor("csPerMin")
  const kdaCell = cellFor("kda")

  return {
    games: games.value,
    winrate: winrate.value,
    kda: kdaCell === null ? null : parseKdaLiteral(kdaCell),
    csPerMin: csPerMinCell === null ? null : parseNumericLiteral(csPerMinCell),
    killParticipation: killParticipation.value,
    damage: damage.value,
    outOfRange:
      games.outOfRange || winrate.outOfRange || killParticipation.outOfRange || damage.outOfRange,
  }
}

interface ClassifiedNumber {
  value: number
  isInteger: boolean
  /** An explicit games marker was attached (`24 games`, `24G`). */
  isGames: boolean
}

/**
 * Read the values out of a row WITHOUT a usable header, from value shapes only.
 *
 * THE HEURISTIC, deliberately conservative and in this order:
 *
 *   1. every token carrying `%`: the FIRST is the winrate, a SECOND is kill
 *      participation. (Those are the only two percent values these tables
 *      print next to each other.)
 *   2. any remaining number ≥ 1000 is damage — and is then out of the running
 *      for everything else. Champion tables do not contain four-digit game
 *      counts, damage figures always are.
 *   3. games: the first number carrying an explicit games marker
 *      (`24 games` / `24 Spiele` / `24G`), otherwise the first plain INTEGER.
 *   4. kda: a composite KDA token (`5.2/3.1/8.4`, `3.1:1`) if there is one,
 *      otherwise the first DECIMAL that was not already taken as games.
 *   5. everything else stays `null`.
 *
 * Rule 5 is the important one: where two readings are equally plausible the
 * answer is `null`, not a coin flip. The whole result already carries
 * `columns_guessed`, so the user is told that this mapping was inferred.
 */
function readValuesFromTokens(tokens: readonly string[]): RowValues {
  const percents: number[] = []
  const kdas: number[] = []
  const numbers: ClassifiedNumber[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    const percent = parsePercentLiteral(token)
    if (percent !== null) {
      percents.push(percent)
      continue
    }

    if (KDA_COMPOSITE.test(token)) {
      const kda = parseKdaLiteral(token)
      if (kda !== null) {
        kdas.push(kda)
        continue
      }
    }

    const suffixMatch = /^([+-]?[\d.,]+)\s*([a-zA-ZäöüÄÖÜß]+)$/.exec(token)
    const numericPart = suffixMatch === null ? token : suffixMatch[1]
    const suffix = suffixMatch === null ? "" : normalizeKey(suffixMatch[2])

    const value = parseNumericLiteral(numericPart)
    if (value === null) continue

    const nextToken = index + 1 < tokens.length ? normalizeKey(tokens[index + 1]) : ""
    numbers.push({
      value,
      isInteger: Number.isInteger(value),
      isGames: GAMES_SUFFIXES.has(suffix) || GAMES_SUFFIXES.has(nextToken),
    })
  }

  const damageIndex = numbers.findIndex((entry) => entry.value >= 1000)
  const damage = damageIndex >= 0 ? numbers[damageIndex].value : null
  const rest = numbers.filter((_, index) => index !== damageIndex)

  let gamesIndex = rest.findIndex((entry) => entry.isGames)
  if (gamesIndex < 0) gamesIndex = rest.findIndex((entry) => entry.isInteger)
  const games = gamesIndex >= 0 ? rest[gamesIndex].value : null

  let kda: number | null = kdas.length > 0 ? kdas[0] : null
  if (kda === null) {
    const kdaIndex = rest.findIndex((entry, index) => index !== gamesIndex && !entry.isInteger)
    kda = kdaIndex >= 0 ? rest[kdaIndex].value : null
  }

  const winrateRaw = percents.length > 0 ? percents[0] : null
  const participationRaw = percents.length > 1 ? percents[1] : null
  const winrateOk = winrateRaw === null || (winrateRaw >= 0 && winrateRaw <= 100)
  const participationOk =
    participationRaw === null || (participationRaw >= 0 && participationRaw <= 100)
  const gamesOk = games === null || games >= 0

  return {
    games: gamesOk ? games : null,
    winrate: winrateOk ? winrateRaw : null,
    kda,
    csPerMin: null,
    killParticipation: participationOk ? participationRaw : null,
    damage,
    outOfRange: !winrateOk || !participationOk || !gamesOk,
  }
}

/* ==========================================================================
 * 9. Line parsing
 * ========================================================================== */

interface ParsedLine {
  row?: {
    championName: string
    championResolved: boolean
    rawChampion: string
    values: RowValues
    detectedRole: ScoutRole
  }
  unparsed?: ScoutImportUnparsedReason
}

function parseDataLine(
  line: string,
  columnMap: readonly (ScoutImportColumn | null)[],
  headerUsable: boolean,
): ParsedLine {
  const tabular = hasCellSeparator(line)
  const cells = tabular ? splitCells(line) : []
  const useColumns = headerUsable && tabular
  const championIndex = useColumns ? columnMap.indexOf("champion") : -1

  const championSource =
    championIndex >= 0 && championIndex < cells.length ? cells[championIndex] : null
  const lineTokens = tokenizeLine(tabular ? cells.join(" ") : line)
  const champion = extractChampion(
    championSource === null ? lineTokens : tokenizeLine(championSource),
  )

  if (champion === null) return { unparsed: "no_champion" }

  const valueCells = useColumns ? cells.filter((_, index) => index !== championIndex) : []
  const valueTokens = useColumns
    ? valueCells.reduce<string[]>((all, cell) => all.concat(tokenizeLine(cell)), [])
    : champion.valueTokens

  if (!valueTokens.some((token) => isNumericToken(token))) {
    // A champion with no numbers next to it is not a row. Text that is not even
    // a champion is copied page chrome.
    return { unparsed: champion.resolved ? "no_numbers" : "noise" }
  }

  const values = useColumns
    ? readValuesFromColumns(cells, columnMap)
    : readValuesFromTokens(champion.valueTokens)

  return {
    row: {
      championName: champion.name,
      championResolved: champion.resolved,
      rawChampion: champion.name,
      values,
      detectedRole: resolveDetectedRole(champion, cells, columnMap, useColumns, valueTokens),
    },
  }
}

/**
 * The role a row claims, in order of decreasing authority:
 *   1. a mapped `role` column,
 *   2. a role word that sat inside the champion candidate (`Karma Support`),
 *   3. a single unambiguous role word anywhere else in the line.
 *
 * `"unknown"` whenever the text says nothing — which is the common case, and
 * never a reason to fall back to the user's selection: this value exists to
 * *contradict* that selection out loud, so silently echoing it would make the
 * mismatch check useless.
 */
function resolveDetectedRole(
  champion: ChampionExtraction,
  cells: readonly string[],
  columnMap: readonly (ScoutImportColumn | null)[],
  useColumns: boolean,
  valueTokens: readonly string[],
): ScoutRole {
  if (useColumns) {
    const roleIndex = columnMap.indexOf("role")
    if (roleIndex >= 0 && roleIndex < cells.length) {
      const fromColumn = normalizeScoutRole(cells[roleIndex])
      if (fromColumn !== "unknown") return fromColumn
    }
  }
  if (champion.roleFromName !== "unknown") return champion.roleFromName
  return detectRoleInTokens(valueTokens)
}

/** Row confidence — see the table in the task contract; `none` beats `low`
 *  only in the sense of being worse, never in the sense of being usable. */
function rowConfidence(
  championResolved: boolean,
  games: number | null,
  winrate: number | null,
  headerUsable: boolean,
  roleMismatch: boolean,
): ScoutConfidence {
  const missing = (games === null ? 1 : 0) + (winrate === null ? 1 : 0)
  if (missing === 2) return "none"
  if (missing === 1 || !championResolved) return "low"
  return headerUsable && !roleMismatch ? "high" : "medium"
}

/* ==========================================================================
 * 9b. The OP.GG raw champion page — layout `opgg_raw_champion_page`
 *
 * A browser copy of the OP.GG summoner "Champions" panel loses every column
 * boundary, so the values arrive ONE PER LINE with no header at all:
 *
 *     Alle Champions      <- aggregate heading, then the aggregate's own values
 *     256S
 *     256N
 *     50%
 *     2.57:1
 *     3.9 / 5.4 / 9.9 (45%)
 *     1                   <- rank index
 *     Ahri                <- champion, printed twice (icon caption + label)
 *     Ahri
 *     36S                 <- wins   (DE "S" / EN "W" / "36 Wins")
 *     36N                 <- losses (DE "N" / EN "L" / "36 Losses")
 *     50%                 <- winrate, as the site printed it
 *     2.60:1              <- KDA ratio
 *     vs Mel              <- a MATCHUP sub-block: the numbers below it belong to
 *     3S                     one opponent, NOT to Ahri and NOT to the next
 *     1N                     champion
 *     75%
 *
 * NOT A SCRAPER. Nothing is requested and no page is read; this parser only
 * ever sees a string a human put on their clipboard. See the long note on
 * `ScoutImportLayout` in ./types.ts.
 *
 * ---------------------------------------------------------------------------
 * DELIBERATELY NOT READ: the `3.9 / 5.4 / 9.9 (45%)` line.
 * The triple is kills / deaths / assists and the percentage in brackets is very
 * probably kill participation — but that is NOT VERIFIED, and rule (2) of this
 * module forbids guessing. A value under the wrong label is worse than a
 * missing value: `killParticipation` feeds the preview the user checks before
 * accepting the import, and a mislabelled 45 % would be accepted as a fact. It
 * therefore stays `null`, together with `csPerMin` and `damage`, which this
 * copy does not print at all.
 *
 * DELIBERATELY ALWAYS `detectedRole: "unknown"`.
 * The champions list of a summoner page states no role per champion — the same
 * mid player's Ahri and their off-role Lux sit in one undifferentiated list. So
 * this parser has nothing to say about the role, `roleMismatch` is always
 * `false` and a `role_mismatch` warning can never come out of this layout. The
 * user's selected role is the only statement about the role, exactly as
 * `importRowToManualEntry` already assumes.
 * ---------------------------------------------------------------------------
 * ========================================================================== */

/** Split a paste into trimmed, non-empty lines. Shared by detection and parse. */
function splitPasteLines(raw: string): string[] {
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * A page heading that identifies the copy, DE and EN. Anchored to the WHOLE
 * normalised line (optionally followed by digits, so `Saison 15` counts) rather
 * than used as a substring: a table whose header cell happens to say "Season"
 * must not become a page-copy marker.
 */
const OPGG_TEXT_MARKER_LINE =
  /^(?:allechampions|allchampions|meinechampions|mychampions|empfohlenechampions|recommendedchampions|saison|season)\d*$/

/** The heading that ends the recommendation area and opens the real list. */
const OPGG_AGGREGATE_HEADING_LINE = /^(?:allechampions|allchampions|meinechampions|mychampions)$/

/** `36S` (DE) · `36W` / `36 Wins` (EN). */
const OPGG_WINS_LINE = /^(\d+)\s*(?:Wins?|W|S)$/i
/** `36N` (DE) · `36L` / `36 Loss` / `36 Losses` (EN). */
const OPGG_LOSSES_LINE = /^(\d+)\s*(?:Loss(?:es)?|L|N)$/i
/** `50%` · `50,5 %`. */
const OPGG_WINRATE_LINE = /^(\d+(?:[.,]\d+)?)\s*%$/
/** `2.60:1` · `2,60 : 1`. */
const OPGG_KDA_LINE = /^(\d+(?:[.,]\d+)?)\s*:\s*1$/
/** The rank index in front of a champion. */
const OPGG_RANK_LINE = /^\d+$/
/**
 * `vs Mel` · `vs. Ryze` · a bare `vs` / `vs.` / `VS` — the head of a matchup
 * sub-block.
 *
 * THE BARE FORM IS NOT COSMETIC. In the browser copy the `vs` badge is its own
 * element, so it lands on a line of its own about as often as it stays attached
 * to the opponent's name. A pattern that demands whitespace after `vs` misses
 * that shape completely, the sub-block goes unrecognised, and the opponent's
 * own S/N/% lines become a champion row.
 *
 * ANCHORED AT BOTH ENDS: either whitespace follows, or the line ends. A bare
 * prefix match would make a future champion whose name begins with those two
 * letters swallow its own block and everything behind it.
 */
const OPGG_MATCHUP_LINE = /^vs\.?(?:\s|$)/i

/**
 * How far a champion name may be from its wins line before it stops looking
 * like the start of a block. Four covers the widest real shape (name, repeated
 * name, an icon caption, wins).
 */
const OPGG_BLOCK_LOOKAHEAD = 4

/**
 * How many value lines directly under the aggregate heading are swallowed. The
 * copy prints four to six (wins, losses, winrate, KDA ratio, KDA triple, and
 * occasionally one more); the cap stops a malformed paste from eating the whole
 * champion list.
 */
const OPGG_AGGREGATE_VALUE_LIMIT = 6

/** Difference in PERCENTAGE POINTS above which stated and recomputed winrate
 *  are treated as a real disagreement rather than the site's rounding. */
const OPGG_WINRATE_TOLERANCE = 1.5

function isOpggAggregateHeading(line: string): boolean {
  return OPGG_AGGREGATE_HEADING_LINE.test(normalizeKey(line))
}

function isOpggMatchupLine(line: string): boolean {
  return OPGG_MATCHUP_LINE.test(line)
}

/**
 * Does this text look like a raw copy of the champions page?
 *
 * TWO INDEPENDENT MARKERS ARE REQUIRED, never one. Each of the three signals
 * below occurs by accident often enough on its own — a tab-separated table can
 * carry a "Season" caption, a champion name can stand alone on a line of prose —
 * and a single false positive would route an ordinary table into a parser that
 * expects one value per line, producing rows that are wrong rather than absent.
 */
function looksLikeOpggRawChampionPage(lines: readonly string[]): boolean {
  let markers = 0

  if (lines.some((line) => OPGG_TEXT_MARKER_LINE.test(normalizeKey(line)))) markers += 1
  if (
    lines.some((line) => OPGG_WINS_LINE.test(line)) &&
    lines.some((line) => OPGG_LOSSES_LINE.test(line))
  ) {
    markers += 1
  }
  if (lines.some((line) => resolveChampionName(line).resolved)) markers += 1

  return markers >= 2
}

/** A catalog champion with a wins line close behind it — the start of a block. */
function startsOpggChampionBlock(lines: readonly string[], index: number): boolean {
  if (!resolveChampionName(lines[index]).resolved) return false

  const limit = Math.min(lines.length, index + 1 + OPGG_BLOCK_LOOKAHEAD)
  for (let ahead = index + 1; ahead < limit; ahead += 1) {
    if (OPGG_WINS_LINE.test(lines[ahead])) return true
  }
  return false
}

/**
 * Swallow the aggregate's own value lines.
 *
 * They are NOT reported one by one: they are four to six lines on every single
 * paste, and listing them would bury the two or three lines the user actually
 * needs to look at under permanent noise. The heading itself is reported once,
 * as `aggregate_row`, so nothing disappears without a word.
 */
function skipOpggAggregateValues(lines: readonly string[], start: number): number {
  let index = start
  let skipped = 0

  while (index < lines.length && skipped < OPGG_AGGREGATE_VALUE_LIMIT) {
    const line = lines[index]
    if (OPGG_RANK_LINE.test(line)) break
    if (isOpggMatchupLine(line)) break
    if (isOpggAggregateHeading(line)) break
    if (resolveChampionName(line).resolved) break
    index += 1
    skipped += 1
  }
  return index
}

interface OpggChampionBlock {
  /** The champion line itself — the block's source, shown next to the parse. */
  raw: string
  championName: string
  championResolved: boolean
  wins: number
  losses: number
  winrate: number | null
  kda: number | null
}

interface OpggBlockRead {
  raw: string
  championName: string
  championResolved: boolean
  wins: number | null
  losses: number | null
  winrate: number | null
  kda: number | null
  /** Index of the first line AFTER the block. Always greater than `start`. */
  next: number
}

/**
 * Read one champion block, starting at its name line.
 *
 * The block ends at the next structural line — a rank index, a `vs` matchup
 * head, another aggregate heading, or another champion that has a wins line
 * behind it. Everything in between that is not one of the four known values is
 * DROPPED WITHOUT AN UNPARSED LINE: the KDA triple, CS, gold and damage lines
 * are block interior, not lost rows, and reporting each of them would make the
 * preview unreadable.
 */
function readOpggChampionBlock(lines: readonly string[], start: number): OpggBlockRead {
  const raw = lines[start]
  const resolution = resolveChampionName(raw)

  let index = start + 1
  // The copy prints the name twice (icon caption plus label). A repetition of
  // the same name is the same champion, never a second row.
  //
  // SEPARATOR LINES BETWEEN THE TWO DO NOT BREAK THE PAIRING, and that is not
  // cosmetic: when the empty-column `-` lands between them, the first name line
  // used to end its own block with no numbers in it and was reported as
  // `{ raw: "Ahri", reason: "no_numbers" }` — the preview then said "Ahri was
  // not recognised" while the correct Ahri row sat directly above it, and
  // `row_not_parsed` fired on top. A FALSE STATEMENT ABOUT A CHAMPION THAT WAS
  // RECOGNISED is worse than the dash noise this guard skips.
  //
  // Only pure page noise is skipped (no letter, no digit — see
  // `isPageNoiseLine`), and only when the very next real line repeats the name:
  // two DIFFERENT champions separated by a dash still stay two blocks.
  let repeated = index
  while (repeated < lines.length && isPageNoiseLine(lines[repeated])) repeated += 1
  if (repeated < lines.length && normalizeKey(lines[repeated]) === normalizeKey(raw)) {
    index = repeated + 1
  }

  let wins: number | null = null
  let losses: number | null = null
  let winrate: number | null = null
  let kda: number | null = null

  while (index < lines.length) {
    const line = lines[index]
    if (
      OPGG_RANK_LINE.test(line) ||
      isOpggMatchupLine(line) ||
      isOpggAggregateHeading(line) ||
      startsOpggChampionBlock(lines, index)
    ) {
      break
    }

    const winsMatch = OPGG_WINS_LINE.exec(line)
    const lossesMatch = OPGG_LOSSES_LINE.exec(line)
    const winrateMatch = OPGG_WINRATE_LINE.exec(line)
    const kdaMatch = OPGG_KDA_LINE.exec(line)

    if (wins === null && winsMatch !== null) wins = Number(winsMatch[1])
    else if (losses === null && lossesMatch !== null) losses = Number(lossesMatch[1])
    else if (winrate === null && winrateMatch !== null) {
      winrate = parseNumericLiteral(winrateMatch[1])
    } else if (kda === null && kdaMatch !== null) kda = parseNumericLiteral(kdaMatch[1])

    index += 1
  }

  return {
    raw,
    championName: resolution.name,
    championResolved: resolution.resolved,
    wins,
    losses,
    winrate,
    kda,
    next: index,
  }
}

/** The three regions of the pasted page. */
type OpggScanState = "recommended" | "list" | "matchup"

/**
 * Walk the pasted page as a three-state machine.
 *
 * `recommended` — everything above the aggregate heading. The champions there
 *   are OP.GG's own SUGGESTIONS, not games anybody played, so each is reported
 *   as `recommended_champion` and never becomes a row. When the paste contains
 *   no aggregate heading at all there is no recommendation area, and the first
 *   real champion block opens `list` directly.
 *
 * `list` — the real champion pool. One block per champion.
 *
 * `matchup` — inside a `vs <Champion>` sub-block. THIS IS THE STATE THE WHOLE
 *   PARSER TURNS ON. A matchup prints its own S/N/% lines, and they look
 *   exactly like a champion's. Without this state they are added to the
 *   champion above (or to the one below) and the import is SILENTLY WRONG —
 *   plausible numbers, attached to the wrong champion, with nothing in the
 *   preview to show it. Everything inside it is dropped without an unparsed
 *   line, because a matchup is data about the OPPONENT, not about the scouted
 *   player. A further `vs` line stays in the state and is reported as one more
 *   `matchup_row`.
 *
 *   THE STATE IS LEFT THROUGH A RANK NUMBER, AND NOTHING ELSE — plus the
 *   aggregate heading, which is handled above this loop's state branches and
 *   therefore ends every state. In a real OP.GG list every champion row carries
 *   its rank number and a matchup sub-block carries none, so the rank is the
 *   only dependable "a new block starts here" evidence.
 *
 *   IT USED TO ALSO LEAVE THROUGH `startsOpggChampionBlock()`, AND THAT WAS THE
 *   BUG. A matchup names its OPPONENT, and an opponent is a catalog champion
 *   with a wins line right behind it — the exact signature of a new block. The
 *   parser therefore stepped out of the sub-block halfway through and built a
 *   row out of the opponent's numbers: `vs Mel / Mel / 3S / 1N / 75%` produced
 *   a `Mel` row at 75 % winrate, `high` confidence, no warning, pre-ticked in
 *   the preview, straight into the threat score. Exactly the silent, plausible,
 *   wrong import this module exists to prevent.
 *
 *   THE TRADE-OFF, MADE DELIBERATELY: requiring the rank is STRICTER than
 *   before. A genuine champion block that carries no rank number AND stands
 *   directly behind a matchup is now swallowed and never becomes a row. That is
 *   the smaller damage of the two, and not by a small margin: a MISSING row is
 *   visible in the preview — the user sees their champion is not there and can
 *   add it — whereas an INVENTED row at 75 % winrate is invisible, indis-
 *   tinguishable from a real one, and silently reshapes the ban recommendation.
 */
function scanOpggRawChampionPage(lines: readonly string[]): {
  blocks: OpggChampionBlock[]
  unparsedLines: ScoutImportUnparsedLine[]
} {
  const blocks: OpggChampionBlock[] = []
  const unparsedLines: ScoutImportUnparsedLine[] = []
  const hasAggregateHeading = lines.some(isOpggAggregateHeading)

  let state: OpggScanState = "recommended"
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (isOpggAggregateHeading(line)) {
      unparsedLines.push({ raw: line, reason: "aggregate_row" })
      index = skipOpggAggregateValues(lines, index + 1)
      state = "list"
      continue
    }

    // BEFORE the `recommended` branch, so the promise in this file's header —
    // "every `vs …` line gets its own `unparsedLines` entry" — holds in EVERY
    // state. It used to sit behind that branch, where a `vs` line above the
    // aggregate heading was consumed without a word.
    if (isOpggMatchupLine(line)) {
      unparsedLines.push({ raw: line, reason: "matchup_row" })
      // Reported, but NOT entered, while still in `recommended`: there is no
      // champion pool up there to protect, and switching states would swallow
      // the remaining suggestions instead of reporting them.
      if (state !== "recommended") state = "matchup"
      index += 1
      continue
    }

    if (state === "recommended") {
      // No aggregate heading anywhere means there is no recommendation area:
      // the list starts at the first block that proves itself to be one.
      if (!hasAggregateHeading && startsOpggChampionBlock(lines, index)) {
        state = "list"
        continue
      }
      if (resolveChampionName(line).resolved) {
        unparsedLines.push({ raw: line, reason: "recommended_champion" })
      }
      index += 1
      continue
    }

    if (state === "matchup") {
      // The rank number, and nothing else. See the long note above this
      // function for why `startsOpggChampionBlock()` must NOT be an exit here.
      if (OPGG_RANK_LINE.test(line)) {
        state = "list"
        continue
      }
      index += 1
      continue
    }

    // A rank index, a stray value line or any other number-leading line between
    // blocks carries nothing this layout needs.
    if (isNumericToken(line)) {
      index += 1
      continue
    }

    const block = readOpggChampionBlock(lines, index)
    index = block.next

    if (block.wins === null || block.losses === null) {
      // Wins AND losses are mandatory: `games` is their sum and nothing else,
      // so half a pair is not a row. Same three-way split as the tabular path:
      // a real champion without numbers is `no_numbers`, a bare separator is
      // `page_noise` (the `-` OP.GG prints for an empty column — dozens per
      // profile, counted rather than listed), anything else is page chrome.
      unparsedLines.push({
        raw: block.raw,
        reason: block.championResolved
          ? "no_numbers"
          : isPageNoiseLine(block.raw)
            ? "page_noise"
            : "noise",
      })
      continue
    }

    blocks.push({
      raw: block.raw,
      championName: block.championName,
      championResolved: block.championResolved,
      wins: block.wins,
      losses: block.losses,
      winrate: block.winrate,
      kda: block.kda,
    })
  }

  return { blocks, unparsedLines }
}

/** One decimal place — the precision OP.GG itself prints winrates in. */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Row confidence for this layout.
 *
 * `high` is legitimate here even though there is no header: nothing was
 * guessed. The block pattern was RECOGNISED, and a `36S` line is a win count by
 * construction, not by position — the ambiguity `columns_guessed` warns about
 * simply does not exist. Only a missing winrate (`medium`) or a champion the
 * catalog does not know (`low`) lowers it.
 */
function opggRowConfidence(championResolved: boolean, winrate: number | null): ScoutConfidence {
  if (!championResolved) return "low"
  return winrate === null ? "medium" : "high"
}

/**
 * Build the full result for a recognised raw champion page.
 *
 * `columns` stays empty and `columns_guessed` is NEVER raised: this layout has
 * no columns to identify and nothing about it was inferred from value shapes.
 * Claiming a guess here would be as dishonest as hiding one.
 */
function parseOpggRawChampionPageResult(
  lines: readonly string[],
  options: ScoutStatsImportOptions,
  detectedSource: ScoutImportSourceKind,
): ScoutStatsImportResult {
  const { blocks, unparsedLines } = scanOpggRawChampionPage(lines)

  const rows: ScoutImportRow[] = []
  const rowWarnings: ScoutImportWarning[] = []

  for (const block of blocks) {
    const rowIndex = rows.length
    // ALWAYS the sum of two counted integers. A rounded percentage is not
    // evidence of a game count and is never used to reconstruct one.
    const games = block.wins + block.losses
    const warnings: ScoutImportWarning[] = []

    if (!block.championResolved) {
      warnings.push(
        makeWarning("unknown_champion", {
          rowIndex,
          championName: block.raw,
          params: { champion: block.championName },
        }),
      )
    }
    if (block.winrate === null) {
      warnings.push(
        makeWarning("missing_winrate", {
          rowIndex,
          championName: block.raw,
          params: { champion: block.championName },
        }),
      )
    } else if (games > 0) {
      const computed = roundToTenth((block.wins / games) * 100)
      if (Math.abs(computed - block.winrate) > OPGG_WINRATE_TOLERANCE) {
        // STATED AND COMPUTED BOTH TRAVEL, AND NOTHING IS CORRECTED. The row
        // keeps the winrate the site printed; the tool only says that the site
        // disagrees with its own win/loss counts and lets the user decide.
        warnings.push(
          makeWarning("winrate_mismatch", {
            rowIndex,
            championName: block.raw,
            params: { champion: block.championName, stated: block.winrate, computed },
          }),
        )
      }
    }

    rows.push({
      id: `row-${rowIndex}`,
      raw: block.raw,
      championName: block.championName,
      championResolved: block.championResolved,
      wins: block.wins,
      losses: block.losses,
      games,
      winrate: block.winrate,
      kda: block.kda,
      csPerMin: null,
      killParticipation: null,
      damage: null,
      detectedRole: "unknown",
      roleMismatch: false,
      confidence: opggRowConfidence(block.championResolved, block.winrate),
      warnings,
    })
    rowWarnings.push(...warnings)
  }

  const warnings: ScoutImportWarning[] = []
  if (
    options.source !== undefined &&
    options.source !== "unknown" &&
    detectedSource !== "unknown" &&
    detectedSource !== options.source
  ) {
    warnings.push(
      makeWarning("source_mismatch", {
        params: { detected: detectedSource, selected: options.source },
      }),
    )
  }
  warnings.push(...rowWarnings)
  warnings.push(...duplicateWarnings(rows))
  if (rows.length === 0) warnings.push(makeWarning("no_rows_detected"))
  if (unparsedLines.some((entry) => !DELIBERATE_NON_ROW_REASONS.has(entry.reason))) {
    warnings.push(makeWarning("row_not_parsed"))
  }

  return {
    rows,
    unparsedLines,
    layout: "opgg_raw_champion_page",
    columns: [],
    detectedSource,
    warnings,
    confidence: lowestConfidence(rows),
  }
}

/* ==========================================================================
 * 10. parseScoutStats
 * ========================================================================== */

/**
 * Parse a pasted champion table into reviewable rows.
 *
 * Nothing here is applied to any player: the result is a *report* the UI shows
 * the user, who then decides. See {@link applyImportRows} for the second half.
 *
 * The order of {@link ScoutStatsImportResult.warnings} is fixed so tests and UI
 * agree: whole-paste warnings about the layout first, then the source
 * mismatch, then every row warning in row order, then duplicates, then the
 * "nothing came out" warnings.
 */
export function parseScoutStats(
  raw: string,
  options: ScoutStatsImportOptions,
): ScoutStatsImportResult {
  const detectedSource = detectStatsSource(raw)
  const lines = splitPasteLines(raw)

  if (lines.length === 0) {
    return {
      rows: [],
      unparsedLines: [],
      layout: "unrecognized",
      columns: [],
      detectedSource,
      warnings: [makeWarning("empty_input")],
      confidence: "none",
    }
  }

  /* ---- the raw OP.GG champion page ------------------------------------- */
  // Checked BEFORE anything table-shaped is attempted. This layout has no
  // columns at all, so letting the header/cell path see it first would produce
  // a "table" of one-cell lines and rows built from guessed positions.
  if (looksLikeOpggRawChampionPage(lines)) {
    return parseOpggRawChampionPageResult(lines, options, detectedSource)
  }

  /* ---- header ---------------------------------------------------------- */
  let headerIndex = -1
  let headerSeen = false
  let columnMap: (ScoutImportColumn | null)[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (!hasCellSeparator(lines[index])) continue
    const cells = splitCells(lines[index])
    if (looksLikeHeader(cells)) {
      headerSeen = true
      headerIndex = index
      columnMap = cells.map(mapHeaderCell)
    }
    break
  }

  const headerUsable = headerSeen && headerIsUsable(columnMap)
  const columns = headerUsable
    ? SCOUT_IMPORT_COLUMNS.filter((column) => columnMap.includes(column))
    : []

  /* ---- rows ------------------------------------------------------------ */
  const rows: ScoutImportRow[] = []
  const unparsedLines: ScoutImportUnparsedLine[] = []
  const rowWarnings: ScoutImportWarning[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (index === headerIndex) {
      unparsedLines.push({ raw: line, reason: "header" })
      continue
    }

    const parsed = parseDataLine(line, columnMap, headerUsable)
    if (parsed.row === undefined) {
      const reason = parsed.unparsed ?? "noise"
      // ONLY `noise` is ever downgraded to `page_noise`. `no_champion` and
      // `no_numbers` are statements about a line that DID carry something, and
      // a separator can produce neither of them anyway — the character class
      // behind `isPageNoiseLine` holds no letter and no digit.
      unparsedLines.push({
        raw: line,
        reason: reason === "noise" && isPageNoiseLine(line) ? "page_noise" : reason,
      })
      continue
    }

    const rowIndex = rows.length
    const { championName, championResolved, rawChampion, values, detectedRole } = parsed.row
    const roleMismatch = detectedRole !== "unknown" && detectedRole !== options.role
    const warnings: ScoutImportWarning[] = []

    if (!championResolved) {
      warnings.push(
        makeWarning("unknown_champion", {
          rowIndex,
          championName: rawChampion,
          params: { champion: championName },
        }),
      )
    }
    if (values.outOfRange) {
      warnings.push(
        makeWarning("value_out_of_range", {
          rowIndex,
          championName: rawChampion,
          params: { champion: championName },
        }),
      )
    }
    if (values.games === null) {
      warnings.push(
        makeWarning("missing_games", {
          rowIndex,
          championName: rawChampion,
          params: { champion: championName },
        }),
      )
    }
    if (values.winrate === null) {
      warnings.push(
        makeWarning("missing_winrate", {
          rowIndex,
          championName: rawChampion,
          params: { champion: championName },
        }),
      )
    }
    if (roleMismatch) {
      warnings.push(
        makeWarning("role_mismatch", {
          rowIndex,
          championName: rawChampion,
          params: { detectedRole, selectedRole: options.role },
        }),
      )
    }

    rows.push({
      id: `row-${rowIndex}`,
      raw: line,
      championName,
      championResolved,
      // Only `opgg_raw_champion_page` prints a win/loss split. A column table
      // states a games total, so both stay `null` here — never `0`, which would
      // read as "zero wins".
      wins: null,
      losses: null,
      games: values.games,
      winrate: values.winrate,
      kda: values.kda,
      csPerMin: values.csPerMin,
      killParticipation: values.killParticipation,
      damage: values.damage,
      detectedRole,
      roleMismatch,
      confidence: rowConfidence(
        championResolved,
        values.games,
        values.winrate,
        headerUsable,
        roleMismatch,
      ),
      warnings,
    })
    rowWarnings.push(...warnings)
  }

  /* ---- layout ---------------------------------------------------------- */
  const tabular = lines.some((line) => hasCellSeparator(line))
  let layout: ScoutImportLayout = "unrecognized"
  if (rows.length > 0) {
    if (tabular) layout = headerUsable ? "tabular_with_header" : "tabular_no_header"
    else layout = "loose_lines"
  }

  /* ---- warnings -------------------------------------------------------- */
  const warnings: ScoutImportWarning[] = []
  if (headerSeen && !headerUsable) warnings.push(makeWarning("header_not_recognized"))
  if (rows.length > 0 && layout !== "tabular_with_header") {
    warnings.push(makeWarning("columns_guessed"))
  }
  if (
    options.source !== undefined &&
    options.source !== "unknown" &&
    detectedSource !== "unknown" &&
    detectedSource !== options.source
  ) {
    warnings.push(
      makeWarning("source_mismatch", {
        params: { detected: detectedSource, selected: options.source },
      }),
    )
  }
  warnings.push(...rowWarnings)
  warnings.push(...duplicateWarnings(rows))
  if (rows.length === 0) warnings.push(makeWarning("no_rows_detected"))
  // The header is not a row that "could not be parsed" — it is a line we
  // understood and deliberately did not turn into a row. Reporting it as
  // row_not_parsed would fire on every well-formed table.
  if (unparsedLines.some((entry) => !DELIBERATE_NON_ROW_REASONS.has(entry.reason))) {
    warnings.push(makeWarning("row_not_parsed"))
  }

  return {
    rows,
    unparsedLines,
    layout,
    columns: layout === "unrecognized" ? [] : columns,
    detectedSource,
    warnings,
    confidence: lowestConfidence(rows),
  }
}

/**
 * One `duplicate_champion` warning per champion that appears more than once.
 *
 * BOTH ROWS SURVIVE. A paste can legitimately list the same champion twice (two
 * roles, two time ranges), and dropping one silently would be the data loss
 * this whole feature is built to avoid. The user is told and decides.
 */
function duplicateWarnings(rows: readonly ScoutImportRow[]): ScoutImportWarning[] {
  const counts = new Map<string, { count: number; row: ScoutImportRow }>()
  for (const row of rows) {
    const key = normalizeKey(row.championName)
    const seen = counts.get(key)
    if (seen === undefined) counts.set(key, { count: 1, row })
    else seen.count += 1
  }

  const warnings: ScoutImportWarning[] = []
  for (const { count, row } of Array.from(counts.values())) {
    if (count < 2) continue
    warnings.push(
      makeWarning("duplicate_champion", {
        championName: row.championName,
        params: { champion: row.championName },
      }),
    )
  }
  return warnings
}

/* ==========================================================================
 * 11. Applying rows
 * ========================================================================== */

/**
 * Can this row become a stored {@link ManualChampionEntry}?
 *
 * The conditions are copied straight from `normalizeManualEntry()` in
 * src/scout/storage.ts, which drops a persisted row when the champion name is
 * empty, when `games` is not a finite number ≥ 0, or when `winrate` is outside
 * 0–100. Producing such an entry would "work" until the next page load and then
 * vanish without a trace — the user would see imported data disappear and have
 * no way to tell why. So the import refuses to build it in the first place and
 * counts the row as `skipped`.
 *
 * An UNRESOLVED CHAMPION DOES NOT BLOCK: `championResolved: false` only means
 * the catalog has not caught up with a spelling. Storage keeps such a row
 * happily, the preview showed the `unknown_champion` warning, and the user
 * accepted it deliberately.
 */
export function isImportRowApplicable(row: ScoutImportRow): boolean {
  if (row.championName.trim().length === 0) return false
  if (row.games === null || !Number.isFinite(row.games) || row.games < 0) return false
  if (row.winrate === null || !Number.isFinite(row.winrate)) return false
  return row.winrate >= 0 && row.winrate <= 100
}

/** At most two decimals, without trailing zeros: `4.3870…` → `4.39`, `7.0` → `7`. */
function formatMetric(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * Build the note that carries the metrics which have no home on
 * {@link ManualChampionEntry}: `W36 · L36 · KDA 3.1 · CS/min 7.2 · KP 62% ·
 * DMG 21345`.
 *
 * `W` / `L` come FIRST because they are the only part of the note that is not
 * decoration: the win/loss split is the evidence behind the stored `games` and
 * `winrate`, and the contract on {@link ScoutImportRow.wins} names this note as
 * the one place it may survive the apply — the entry itself deliberately gains
 * no field for it, so no schema bump and no migration.
 *
 * DELIBERATELY LANGUAGE NEUTRAL. `ManualChampionEntry.note` is, per contract,
 * "not translated, shown verbatim, never parsed" — it is stored once and
 * rendered forever. A note written in German would still read German after the
 * user switches the app to English, and a note the app re-translated would
 * contradict what was stored. Universal abbreviations (`KDA`, `CS/min`, `KP`,
 * `DMG`) sidestep both problems and stay correct in every language.
 *
 * Empty string when the paste carried none of these metrics — never a
 * placeholder, never "n/a".
 */
export function buildImportNote(row: ScoutImportRow): string {
  const parts: string[] = []
  if (row.wins !== null) parts.push(`W${formatMetric(row.wins)}`)
  if (row.losses !== null) parts.push(`L${formatMetric(row.losses)}`)
  if (row.kda !== null) parts.push(`KDA ${formatMetric(row.kda)}`)
  if (row.csPerMin !== null) parts.push(`CS/min ${formatMetric(row.csPerMin)}`)
  if (row.killParticipation !== null) parts.push(`KP ${formatMetric(row.killParticipation)}%`)
  if (row.damage !== null) parts.push(`DMG ${formatMetric(row.damage)}`)
  return parts.join(" · ")
}

/**
 * Turn one reviewed row into a stored entry, or `null` when it is not
 * applicable.
 *
 * `role`, `source` and `recency` come from the APPLY OPTIONS — the user's own
 * statements — and never from the row. In particular `row.detectedRole` is
 * ignored here even when `roleMismatch` is `true`: the mismatch was shown in
 * the preview, and a user who applies anyway has made a decision the importer
 * must not quietly override.
 *
 * No `id` is set: React keys are assigned by the UI (`withEntryIds()`), and an
 * id invented here would either collide with existing rows or need a counter
 * that survives across parses.
 */
export function importRowToManualEntry(
  row: ScoutImportRow,
  options: ScoutImportApplyOptions,
): ManualChampionEntry | null {
  if (!isImportRowApplicable(row)) return null
  if (row.games === null || row.winrate === null) return null

  return {
    championName: row.championName,
    games: Math.floor(row.games),
    winrate: row.winrate,
    note: buildImportNote(row),
    source: options.source,
    recency: options.recency,
    role: options.role,
  }
}

/**
 * Merge reviewed rows into a player's existing entries and report what happened.
 *
 * `append` (the default) NEVER DUPLICATES A CHAMPION IN THE SAME ROLE. If the
 * player already has a row for that champion in the imported role, the imported
 * numbers replace it in place. Blindly appending would leave two rows for one
 * champion, and every consumer that sums `games` — the ban priority above all —
 * would count that champion twice and over-rate it. Rows of any OTHER role, and
 * rows with `role: "unknown"`, are untouched: they are different statements
 * about different lanes.
 *
 * `replace` removes the player's rows OF THE IMPORTED ROLE ONLY. Importing a
 * fresh support table must not delete the mid data the user collected for the
 * same player.
 *
 * The result is deterministic and order-stable — surviving entries keep their
 * relative order, new ones are appended in row order — and `existing` is never
 * mutated: the caller may still be rendering it.
 */
export function applyImportRows(
  existing: readonly ManualChampionEntry[],
  rows: readonly ScoutImportRow[],
  options: ScoutImportApplyOptions,
): ScoutImportApplyResult {
  const applicable = rows.filter((row) => isImportRowApplicable(row))
  const skipped = rows.length - applicable.length

  if (options.mode === "replace") {
    const kept = existing.filter((entry) => entry.role !== options.role)
    const replaced = existing.length - kept.length
    const added: ManualChampionEntry[] = []
    for (const row of applicable) {
      const entry = importRowToManualEntry(row, options)
      if (entry !== null) added.push(entry)
    }
    return { entries: kept.concat(added), added: added.length, replaced, skipped }
  }

  const entries = existing.slice()
  let added = 0
  let replaced = 0

  for (const row of applicable) {
    const entry = importRowToManualEntry(row, options)
    if (entry === null) continue

    const key = normalizeKey(entry.championName)
    const index = entries.findIndex(
      (candidate) => candidate.role === options.role && normalizeKey(candidate.championName) === key,
    )
    if (index >= 0) {
      entries[index] = entry
      replaced += 1
    } else {
      entries.push(entry)
      added += 1
    }
  }

  return { entries, added, replaced, skipped }
}
