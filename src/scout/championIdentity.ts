/**
 * Tournament Scout — champion identity.
 *
 * ONE definition of "these two spellings mean the same champion", used by the
 * stats import and by the analysis engine. Before 0.7.0 there was no shared
 * definition and the two layers disagreed, which produced a real defect:
 *
 *   - `statsImport.ts` resolved a pasted name against the champion catalog with
 *     a punctuation-stripping key, so `KaiSa` became `"Kai'Sa"`.
 *   - `analysis.ts` grouped ban candidates with `trim().toLowerCase()` plus
 *     whitespace collapsing, which KEEPS punctuation and never asked the
 *     catalog. `Kai'Sa` and `KaiSa` therefore became TWO ban candidates for one
 *     champion, and `Lee Sin` / `LeeSin` likewise.
 *
 * That was not merely cosmetic. Splitting one champion in two also destroyed
 * `isOverlap`, emptied `overlapBans`, forfeited the overlap priority bonus and
 * the `hits_multiple_players` reason, and could leave both halves in a weaker
 * ban phase than the merged candidate earns. A champion two opponents both play
 * was ranked as two weaker single threats.
 *
 * Both entry points into champion names can produce those spellings: the manual
 * editor validates emptiness only (its champion list is a `datalist`
 * suggestion, not a constraint), and an import spelling the catalog cannot
 * resolve is stored verbatim on purpose.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES THIS MODULE KEEPS
 *
 * (1) NO FUZZY MATCHING, EVER. No edit distance, no prefix match, no "nearest
 *     catalog entry". The catalog lags behind new releases, and silently
 *     rewriting `Ahrii` to `Ahri` would attach one champion's numbers to
 *     another. An unresolved name is returned verbatim with `resolved: false`.
 *
 * (2) ONE normaliser. Two slightly different ones is exactly how `K'Sante`
 *     resolves in one place and not in the other.
 * ---------------------------------------------------------------------------
 */

import { ALL_CHAMPIONS } from "../analysis/championCatalog"

/**
 * Lookup key for champion names: lower-case, every character outside `a-z0-9`
 * removed. So `Kai'Sa`, `kaisa` and `KAI SA` collapse to one key, and
 * `Nunu & Willump` to `nunuwillump`.
 *
 * Punctuation-insensitivity is the whole point. It is what makes the two
 * spellings of one champion one champion.
 */
export function championLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Trim and collapse inner whitespace runs to single spaces. */
export function collapseChampionWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

/**
 * Catalog lookup by normalised key. Built once from `ALL_CHAMPIONS`; the first
 * spelling wins, so the resolved value carries the catalog's own casing.
 */
const CHAMPION_INDEX: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>()
  for (const champion of ALL_CHAMPIONS) {
    const key = championLookupKey(champion)
    if (key.length > 0 && !index.has(key)) index.set(key, champion)
  }
  return index
})()

/**
 * Resolve a champion spelling against src/analysis/championCatalog.ts.
 *
 * Candidate and catalog entry are normalised **identically**, so `kaisa`,
 * `Kai'sa` and `KAI SA` all reach `"Kai'Sa"`. See rule (1) in the module
 * header: an unresolved name comes back verbatim with `resolved: false`, the
 * row stays visible, and the user decides.
 */
export function resolveCatalogChampion(raw: string): { name: string; resolved: boolean } {
  const trimmed = collapseChampionWhitespace(raw)
  if (trimmed.length === 0) return { name: "", resolved: false }

  const canonical = CHAMPION_INDEX.get(championLookupKey(trimmed))
  return canonical === undefined
    ? { name: trimmed, resolved: false }
    : { name: canonical, resolved: true }
}

/** The identity of one champion name: what to group by, and what to display. */
export interface ChampionIdentity {
  /**
   * Grouping key. Punctuation-insensitive AND catalog-resolved, so every
   * spelling of one champion produces one key. For an unresolved name this is
   * still the punctuation-stripped key, which is strictly better at merging
   * than the whitespace-only key it replaced.
   */
  key: string
  /**
   * What to show the user: the catalog's canonical casing when the name
   * resolved, otherwise the name as typed (whitespace-collapsed).
   */
  displayName: string
  /** `true` when the name was found in the champion catalog. */
  resolved: boolean
}

/**
 * Group key plus display name for one champion spelling.
 *
 * A genuinely empty or whitespace-only name yields an empty `key`. That case is
 * already filtered out one layer up: `normalizeEntries()` in
 * src/scout/analysis.ts drops a row whose trimmed champion name is empty, so an
 * empty key never reaches the candidate map.
 *
 * THE FALLBACK BELOW IS NOT DEFENSIVE PADDING. `championLookupKey` strips every
 * character outside `a-z0-9`, so a name written entirely in a non-Latin script
 * (`아리`), in fullwidth Latin (`Ａｈｒｉ`, a common CJK paste artefact) or in pure
 * punctuation (`---`) normalises to the EMPTY STRING — and the empty string is a
 * perfectly valid Map key. Without the fallback all such names share one key and
 * merge into a single ban candidate: two champions of one player get their games
 * summed, a second player's unrelated champion is folded in, and the plan
 * reports an overlap that does not exist.
 *
 * The pre-0.7.0 key (`trim().toLowerCase()` plus whitespace collapsing) kept
 * those names apart, so this is the case the punctuation-insensitive key cannot
 * represent and must hand back. ASCII names are unaffected and keep the shared
 * key that makes `Kai'Sa` and `KaiSa` one champion.
 */
export function championIdentity(raw: string): ChampionIdentity {
  const resolution = resolveCatalogChampion(raw)

  return {
    key: championIdentityKey(raw),
    displayName: resolution.name,
    resolved: resolution.resolved,
  }
}

/**
 * THE answer to "are these two spellings the same champion".
 *
 * Use this for every champion-to-champion comparison. `championLookupKey` alone
 * is NOT that answer: it strips every character outside `a-z0-9`, so a name
 * written in a non-Latin script (`아리`), in fullwidth Latin (`Ａｈｒｉ`, a common
 * CJK paste artefact) or in pure punctuation (`---`) reduces to the EMPTY
 * STRING — and the empty string compares equal to every other such name.
 *
 * That is not theoretical. The stats import compared champions with the bare
 * lookup key in three places, and all three broke on those names: a paste of
 * `아리` / `야스오` / `제드` was reported as one duplicated champion, applying it
 * stored a single entry because each row overwrote the last, and an existing
 * entry could be overwritten by a completely different champion.
 *
 * The fallback is the whitespace-collapsed, lower-cased name, i.e. exactly the
 * key this module used before the punctuation-insensitive one was introduced.
 * Two spellings that differ only in case or spacing still merge; two genuinely
 * different names stay apart. ASCII names never reach the fallback, so the
 * `Kai'Sa` / `KaiSa` merge is untouched.
 */
export function championIdentityKey(raw: string): string {
  const resolved = resolveCatalogChampion(raw).name
  const strippedKey = championLookupKey(resolved)
  return strippedKey.length > 0 ? strippedKey : resolved.toLowerCase()
}
