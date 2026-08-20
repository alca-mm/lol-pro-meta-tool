/**
 * Pure helpers for the Riot-account UI in src/components/team/.
 *
 * Why this file exists at all: vitest runs in Node here (see vite.config.ts,
 * `test.environment: 'node'`) — no jsdom, no document, no window. A rule that
 * lives as an `if` or a template literal inside JSX can therefore never be
 * unit-tested. The project already answers that with a helper module next to
 * the components (src/components/scout/scoutUiHelpers.ts,
 * scoutImportHelpers.ts); this is the same pattern for the team tab.
 *
 * What lives here:
 *
 *  1. Mechanical i18n key building for the machine error codes a Riot sync can
 *     fail with (`team_riot_error_${code}`). No switch, no lookup table —
 *     TypeScript checks the template literal against `TranslationKey`, so a
 *     missing key is a compile error, not a runtime `undefined`.
 *
 *  2. The two sentences the components assemble: the error line and the sync
 *     success line. The success line carries the declension rule that used to
 *     be wrong on screen — `${n} neue Match${n === 1 ? "" : "es"}` rendered
 *     "1 neue Match", because it pluralised the noun but not the adjective.
 *     Two full sentences per language (singular / plural) is the only way to
 *     get that right in German without a grammar engine.
 *
 *  3. That same singular/plural rule as ONE generic function
 *     ({@link pluralMessage}), because the Riot sync line was not the only
 *     place with the defect: the dashboard header glued a bare number in front
 *     of a fixed plural noun and rendered "1 Mitglieder" / "1 Members" and
 *     "1 Champion-Notizen" / "1 Champion Notes". Every counted string in the
 *     team tab now goes through the same two-key pattern.
 *
 * PURITY, STATED HONESTLY: every function below is pure — no React, no DOM, no
 * clock, and no I/O of its own. The IMPORT GRAPH, however, is no longer free of
 * I/O, and the older "no I/O" full stop had stopped being true.
 * `RIOT_TRANSPORT_ERROR_CODES` is a VALUE import, so this module pulls in
 * src/teams/riotService.ts, which pulls in src/lib/supabase.ts, which pulls in
 * @supabase/supabase-js. At runtime that is inert for this file — under vitest
 * `MODE === "test"` leaves the exported client `null` and `createClient` is never
 * called, and nothing here touches the client either way — but the graph is
 * heavier than the sentence used to admit.
 *
 * WHY THAT IS ACCEPTED: the alternative is a second, hand-maintained copy of
 * the transport codes sitting next to the i18n keys. Two lists drift, and the
 * compile-time completeness guards below only bite because there is exactly ONE
 * source for those codes. A heavier import graph is the cheaper half of that
 * trade.
 */

import { RIOT_TRANSPORT_ERROR_CODES } from "../../teams/riotService"
import type { RiotTransportErrorCode } from "../../teams/riotService"
import { pluralKey } from "../../i18n/plural"
import type { TranslationKey } from "../../i18n/types"

/** The `t()` of src/i18n/LanguageContext, narrowed to what this module needs. */
export type TeamTranslate = (key: TranslationKey) => string

/**
 * Internal: turns a failed type-level check into a real compile error at the
 * declaration below, instead of a silently `never`-typed alias nobody reads.
 * `Assert<false>` does not satisfy the `T extends true` constraint, so `tsc`
 * fails on the guard itself. Zero runtime cost.
 *
 * DUPLICATED ON PURPOSE from src/scout/types.ts. It is three tokens of type
 * syntax, and importing it would make a team module depend on the scout
 * module for nothing but a compile-time trick. The dependency would be the
 * expensive half of that trade, not the duplication.
 */
type Assert<T extends true> = T

/* ==========================================================================
 * 1. Riot sync error codes
 * ========================================================================== */

/**
 * A translatable Riot sync error code comes from TWO different places, and the
 * distinction is worth keeping in the type system:
 *
 *  - {@link RiotEdgeErrorCode} — produced by the `riot-sync` EDGE FUNCTION and
 *    delivered in `result.error`. That is a server contract: the strings live
 *    in supabase/functions/, and changing one means deploying a function.
 *  - {@link RiotTransportErrorCode} — produced by src/teams/riotService.ts
 *    ITSELF, before or instead of any function payload: the request never left
 *    the machine, the answer was not usable JSON, the session was rejected by
 *    the platform gateway, or the app has no Supabase configuration at all.
 *    These strings are ours; no deploy is involved.
 *
 * WHY THEY SHARE ONE STRING CHANNEL ANYWAY: to the person looking at the
 * screen the difference is meaningless. A sync failed and they need one
 * sentence saying why and whether anything was saved. So both groups travel as
 * the same `string` error code, and {@link riotErrorMessage} stays the single
 * place that turns a code into a sentence — the components do not branch on
 * the origin, and never should.
 *
 * WHY THE TRANSPORT GROUP EXISTS AT ALL: when the Supabase platform answered
 * with its own gateway JSON (`{"code":401,"message":"Invalid JWT"}`) instead of
 * the function payload, the service took the success path and the UI rendered
 * "undefined neue Matches gespeichert." as a GREEN success line. A dedicated
 * `riot_invalid_response` code, with a sentence that says nothing was saved, is
 * the fix for that on this side of the wire.
 *
 * Anything that is in neither group is a code this build does not know about
 * and is handled as such — again see {@link riotErrorMessage}.
 *
 * NO IMPORT CYCLE: src/teams/riotService.ts imports only src/lib/supabase.ts
 * and nothing from src/components/, so this direction is the only one.
 */
export type RiotEdgeErrorCode =
    | "riot_account_not_found"
    | "riot_rate_limited"
    | "riot_account_not_linked"

export const RIOT_EDGE_ERROR_CODES = [
    "riot_account_not_found",
    "riot_rate_limited",
    "riot_account_not_linked",
] as const satisfies readonly RiotEdgeErrorCode[]

/** Compile-time guard: the tuple above lists *every* {@link RiotEdgeErrorCode}. */
export type RiotEdgeErrorCodesAreComplete = Assert<
    [RiotEdgeErrorCode] extends [(typeof RIOT_EDGE_ERROR_CODES)[number]] ? true : false
>

/** Every code this build has a translated sentence for, from both sources. */
export type RiotSyncErrorCode = RiotEdgeErrorCode | RiotTransportErrorCode

export const RIOT_SYNC_ERROR_CODES = [
    ...RIOT_EDGE_ERROR_CODES,
    ...RIOT_TRANSPORT_ERROR_CODES,
] as const satisfies readonly RiotSyncErrorCode[]

/**
 * Compile-time guard, deliberately in BOTH directions.
 *
 *  - tuple ⊇ union: nothing in the union is missing from the tuple. This is the
 *    half that matters most — {@link riotSyncErrorKey} returns `TranslationKey`,
 *    so a code that reaches the tuple without a `team_riot_error_*` entry in
 *    de.ts is already a compile error there; this line makes a code that never
 *    reaches the tuple one too. Add a fifth transport code in riotService.ts
 *    and this file stops compiling until de.ts and en.ts have caught up.
 *  - union ⊇ tuple: no string sneaks into the tuple that the union does not
 *    name. `satisfies` above covers this today; stating it here keeps the guard
 *    honest if the `satisfies` clause is ever loosened.
 */
export type RiotSyncErrorCodesAreComplete = Assert<
    [RiotSyncErrorCode] extends [(typeof RIOT_SYNC_ERROR_CODES)[number]]
        ? [(typeof RIOT_SYNC_ERROR_CODES)[number]] extends [RiotSyncErrorCode]
            ? true
            : false
        : false
>

/** Is this raw string one of the codes this build has a sentence for? */
export function isRiotSyncErrorCode(value: string): value is RiotSyncErrorCode {
    return (RIOT_SYNC_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * The i18n key for a known error code, built mechanically.
 *
 * The return type is `TranslationKey`, not `string`: that is what turns a
 * forgotten entry in de.ts into a compile error instead of an empty box on
 * screen.
 */
export function riotSyncErrorKey(code: RiotSyncErrorCode): TranslationKey {
    return `team_riot_error_${code}`
}

/* ==========================================================================
 * 2. Sentence assembly
 * ========================================================================== */

/**
 * Substitute `{name}` placeholders in a translated template.
 *
 * DECISION — written here rather than imported from
 * src/components/scout/scoutUiHelpers.ts. `fillPlaceholders()` there does the
 * same job, but importing it would tie a team module to the scout module, and
 * it is typed against `ScoutReasonParams` and runs scout-specific number
 * formatting. Four lines of `String.replace` cost less than that coupling.
 *
 * Unlike the scout version this one does *not* delete a placeholder it has no
 * value for: every caller below passes every placeholder its template uses,
 * so a leftover `{count}` on screen would be a bug worth seeing rather than a
 * hole worth hiding.
 */
function fillPlaceholders(template: string, params: Record<string, string | number>): string {
    let out = template
    for (const [name, value] of Object.entries(params)) {
        out = out.split(`{${name}}`).join(String(value))
    }
    return out.trim()
}

/**
 * A finished error sentence from whatever `riotService` handed back.
 *
 * A known code gets its own sentence. Anything else gets the translated
 * catch-all, carrying the raw text along as a detail: a bare server code must
 * never reach the screen on its own, but throwing it away would cost the user
 * (and us) the only clue about what actually failed.
 *
 * An empty or whitespace-only `raw` uses the detail-free variant, so the
 * sentence does not end in a dangling "Details:".
 */
export function riotErrorMessage(t: TeamTranslate, raw: string): string {
    if (isRiotSyncErrorCode(raw)) return t(riotSyncErrorKey(raw))

    const detail = raw.trim()
    if (detail.length === 0) return t("team_riot_error_unknown")
    return fillPlaceholders(t("team_riot_error_unknownDetail"), { detail })
}

/**
 * A singular/plural key pair. Both keys must carry `{count}` — see
 * {@link pluralMessage}.
 */
export interface PluralKeys {
    readonly one: TranslationKey
    readonly many: TranslationKey
}

/**
 * A counted string, picked from a singular/plural key pair and filled in.
 *
 * THE RULE: `count === 1` takes `keys.one`, *everything else* — 0 included —
 * takes `keys.many`. Zero really is a plural in both languages this app
 * ships: "0 Mitglieder" and "0 members" are correct, "0 Mitglied" is not.
 *
 * Why a key PAIR and not a suffix trick: German declines more than the noun.
 * "1 neue Match" was on screen because the old code pluralised "Match" and
 * left "neue" alone. Only two complete sentences can get that right, and the
 * same is true for any other adjective or article a translator adds later.
 *
 * Why both keys carry `{count}` — the singular one too, where the number can
 * only ever be 1: baking the "1" into the text would break DE/EN placeholder
 * parity (tests/i18nScoutCopy.test.ts checks that for *every* key, not just
 * the scout family) and would hide the number from whoever re-words the
 * string next.
 *
 * Pure: no clock, no locale lookup, no number formatting. The count is
 * stringified exactly as JavaScript would.
 */
export function pluralMessage(t: TeamTranslate, count: number, keys: PluralKeys): string {
    return fillPlaceholders(t(pluralKey(count, keys)), { count })
}

/* --------------------------------------------------------------------------
 * The counted strings of the team dashboard.
 *
 * They live here, next to the rule, so the components never name a key pair
 * themselves — that is how one of the two halves gets forgotten. Exported so
 * the tests can assert against the real pairs instead of a copy of them.
 * ------------------------------------------------------------------------ */

/** "1 Mitglied" / "3 Mitglieder" in the dashboard header. */
export const TEAM_MEMBER_COUNT_KEYS: PluralKeys = {
    one: "team_membersOne",
    many: "team_membersMany",
}

/** "1 Champion-Notiz" / "3 Champion-Notizen" in the dashboard header. */
export const TEAM_NOTE_COUNT_KEYS: PluralKeys = {
    one: "team_notesSummaryOne",
    many: "team_notesSummaryMany",
}

/** "1 neues Match gespeichert." / "3 neue Matches gespeichert." after a sync. */
export const TEAM_RIOT_SYNCED_KEYS: PluralKeys = {
    one: "team_riot_syncedOne",
    many: "team_riot_syncedMany",
}

/** Which of the two Riot panels is asking for the success line. */
export type RiotSyncMessageVariant = "panel" | "summary"

/**
 * The success line after a sync, correctly declined.
 *
 * The counting half is {@link pluralMessage} with
 * {@link TEAM_RIOT_SYNCED_KEYS} — same rule, same placeholder handling, one
 * implementation. Signature and output are unchanged by that move; the tests
 * that quote the four sentences verbatim still hold.
 *
 * `variant: "panel"` is the long form (a "Sync abgeschlossen." lead-in and the
 * long hint about further matches), `"summary"` the compact one.
 */
export function riotSyncSuccessMessage(
    t: TeamTranslate,
    result: { imported: number; moreMayBeAvailable: boolean },
    variant: RiotSyncMessageVariant,
): string {
    const counted = pluralMessage(t, result.imported, TEAM_RIOT_SYNCED_KEYS)

    const parts: string[] = variant === "panel" ? [t("team_riot_syncDone"), counted] : [counted]

    if (result.moreMayBeAvailable) {
        parts.push(variant === "panel" ? t("team_riot_moreLong") : t("team_riot_moreShort"))
    }

    return parts.join(" ").trim()
}
