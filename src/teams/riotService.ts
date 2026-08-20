import { supabase } from "../lib/supabase"
import { isRecord } from "../lib/isRecord"

export interface PlayerAccount {
    id: string
    team_id: string
    user_id: string
    region: string
    routing_region: string
    riot_game_name: string
    riot_tag_line: string
    puuid: string
    created_at: string
    updated_at: string
}

export interface RankedMatch {
    id: string
    team_id: string
    puuid: string
    match_id: string
    queue_id: number
    champion_name: string
    win: boolean
    kills: number
    deaths: number
    assists: number
    game_duration: number
    game_start: string
    role: string | null
    lane: string | null
    cs: number
    vision_score: number
    damage_to_champs: number
    gold_earned: number
    created_at: string
}

export interface MatchParticipant {
    id: string
    team_id: string
    match_id: string
    puuid: string
    champion_name: string
    role: string | null
    lane: string | null
    win: boolean
    kills: number
    deaths: number
    assists: number
    cs: number
}

export type SyncMode = "quick" | "deep"

export const SYNC_MODE_CONFIG: Record<SyncMode, { countPerQueue: number }> = {
    quick: { countPerQueue: 10 },
    deep:  { countPerQueue: 30 },
}

export function isRankedQueue(queueId: number): boolean {
    return queueId === 420 || queueId === 440
}

export function buildMatchIdsUrl(
    base: string,
    puuid: string,
    queue: 420 | 440,
    start: number,
    count: number,
): string {
    return `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${queue}&start=${start}&count=${count}`
}

/** Returns the start-offsets for paginated Riot match-ID requests. */
export function buildPageStarts(maxPages: number, pageSize: number): number[] {
    return Array.from({ length: maxPages }, (_, i) => i * pageSize)
}

/**
 * Decides whether there may be more matches beyond what was synced.
 * True only when max pages were reached, the last page was full, and it
 * contained at least one match ID not yet stored in the DB.
 */
export function computeMoreMayBeAvailable(
    maxPagesReached: boolean,
    lastPageCount: number,
    pageSize: number,
    unknownOnLastPage: number,
): boolean {
    if (!maxPagesReached) return false
    if (lastPageCount < pageSize) return false
    return unknownOnLastPage > 0
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
    const idx = input.indexOf("#")
    if (idx === -1) return null
    const gameName = input.slice(0, idx)
    const tagLine = input.slice(idx + 1)
    if (!gameName || !tagLine) return null
    return { gameName, tagLine }
}

/* ==========================================================================
 * Transport layer
 * ========================================================================== */

/**
 * Error codes produced by THIS layer (not by the edge function).
 *
 * They travel through the same string channel as the function's own codes
 * (`riot_account_not_found`, `riot_rate_limited`, `riot_account_not_linked`,
 * prose messages, forwarded Postgres texts), so the UI can treat both alike:
 * a failure is always a string, a success is never one.
 */
export const RIOT_TRANSPORT_ERROR_CODES = [
    "riot_network_error",
    "riot_invalid_response",
    "riot_unauthorized",
    "riot_not_configured",
] as const

export type RiotTransportErrorCode = (typeof RIOT_TRANSPORT_ERROR_CODES)[number]

/**
 * The outcome of one edge-function call. Deliberately a discriminated union
 * instead of a thrown error: `callEdgeFunction` must never reject, because a
 * rejection escapes past the caller's `setBusy(false)` and leaves the button
 * stuck on "loading" forever.
 */
type EdgeCallResult =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; error: string }

/**
 * Reads `VITE_SUPABASE_URL` without ever exposing its value.
 *
 * Guarded because Supabase is optional in this project: without the variable
 * the previous code fetched `undefined/functions/v1/riot-sync`. The raw string
 * is returned unchanged (only its emptiness is judged on the trimmed form), so
 * the request URL stays byte-identical to before whenever the variable is set.
 *
 * WHY THE READ LIVES IN A FUNCTION BODY: the variable is resolved at CALL time,
 * not at module-load time. That is the whole point — it is what makes
 * `vi.stubEnv()` effective in the tests. A module-level `const` would freeze the
 * value before any test could stub it; src/lib/supabase.ts does exactly that
 * and consequently needs `vi.resetModules()` plus a dynamic import to be retested.
 *
 * It has nothing to do with surviving a missing `import.meta.env`, which an
 * earlier version of this comment claimed: the read sits inside a function body
 * and can never block the module load, and this module imports ../lib/supabase,
 * which reads `import.meta.env.MODE` at MODULE level and without `?.`. In the
 * scenario the old `?.` pretended to cover, that import would already have
 * thrown one line earlier. The `?.` bought nothing and is gone; every other
 * read of `import.meta.env` in this repo is plain too.
 */
function readSupabaseUrl(): string | null {
    const raw: unknown = import.meta.env.VITE_SUPABASE_URL
    if (typeof raw !== "string") return null
    return raw.trim().length > 0 ? raw : null
}

/** Finite number or nothing — never `NaN`, never a numeric string. */
function asFiniteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * A COUNT: a whole number that is not negative, or nothing.
 *
 * Stricter than {@link asFiniteNumber} on purpose, and used for exactly one
 * field — `imported`, the number that ends up in a sentence on the user's
 * screen. `Number.isFinite` alone would let `-3` render as "-3 neue Matches
 * gespeichert." and `2.5` as "2.5 neue Matches". Neither is a realistic server
 * answer, but the entire point of this layer is that nothing nonsensical
 * reaches the screen, and a value that cannot be true is a failed sync.
 *
 * `-0` PASSES, DELIBERATELY: `Number.isInteger(-0)` and `-0 >= 0` are both
 * true, and it is numerically zero — `String(-0)` is "0", so it renders as
 * "0 neue Matches gespeichert.", which is correct. Rejecting it would mean
 * failing a sync over a sign bit nobody can see.
 *
 * NOT used for skipped / alreadyKnown / pagesFetched / detailRequests: those
 * are informational, are defaulted safely, and keep the softer treatment.
 */
function asCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined
}

/** A real `true`; anything else (including truthy non-booleans) is `false`. */
function asBoolean(value: unknown): boolean {
    return value === true
}

/** One of the two known sync modes, or nothing. */
function asSyncMode(value: unknown): SyncMode | undefined {
    return value === "quick" || value === "deep" ? value : undefined
}

/**
 * How long ONE edge-function call may take before it is aborted.
 *
 * WHY A TIMEOUT EXISTS AT ALL: the try/catch below only catches a fetch that
 * REJECTS. A fetch that never settles — captive portal, black-holed TCP, a
 * server that accepts the connection and then says nothing — rejects never.
 * The awaiting component's `setBusy(false)` then never runs either, the button
 * stays on "Lädt…" forever and no cooldown starts. That is the same stuck
 * button the rest of this hardening was written for, reached by another road.
 *
 * WHY 60 000 ms AND NOT LESS: a deep sync makes up to 30 detail requests
 * against the Riot API server-side (see {@link SYNC_MODE_CONFIG}), each a real
 * round trip. A genuine deep sync is allowed to take several tens of seconds.
 * A short timeout would abort WORKING syncs and report a network error for
 * them, which is strictly worse than the hang it is meant to cure: the user
 * would then have no way to succeed at all, whereas a hang at least fails
 * visibly once. 60 s is generous for the slowest realistic run and still a
 * finite bound. Named, not inlined, so the number is greppable and this
 * reasoning has somewhere to live.
 */
const EDGE_FUNCTION_TIMEOUT_MS = 60_000

/**
 * The `name` of a thrown value ("TypeError", "AbortError", "SyntaxError", …),
 * or "unknown" when it has none.
 *
 * `name` ONLY, NEVER `message`: the message of a fetch failure routinely
 * contains the request URL (and undici puts the full target in the `cause`),
 * which is exactly what the logging rule below forbids. The name is a bounded
 * class label with no payload in it. Read through {@link isRecord} rather than
 * an `as` cast, because a `catch` binding really can be any value — a string,
 * `null`, a number — and `name` lives on the prototype for real Errors.
 */
function errorName(err: unknown): string {
    return isRecord(err) && typeof err.name === "string" ? err.name : "unknown"
}

/**
 * Calls the `riot-sync` edge function and ALWAYS resolves — never rejects.
 *
 * The checks run in this order, and the order matters:
 *   1. no `VITE_SUPABASE_URL`      -> riot_not_configured (no request at all)
 *   2. `fetch` rejects OR the call
 *      exceeds the timeout         -> riot_network_error
 *   3. body is not JSON            -> riot_invalid_response
 *   4. JSON is not an object       -> riot_invalid_response
 *   5. non-empty string `error`    -> that string, passed through verbatim
 *   6. non-OK without usable error -> riot_unauthorized (401/403), else
 *                                     riot_invalid_response
 *   7. otherwise                   -> ok
 *
 * Step 5 before step 6 is what keeps the function's own stable codes intact.
 * Steps 4 and 6 are what catch the Supabase *gateway* JSON — e.g.
 * `{"code":401,"message":"Invalid JWT"}` — which carries no `error` field and
 * previously slipped into the success branch, producing "undefined new matches
 * saved" on a green background.
 *
 * A TIMEOUT IS NOT ITS OWN CODE, deliberately. It resolves as
 * `riot_network_error`, whose existing sentence ("Keine Verbindung zum Server.
 * Prüfe deine Internetverbindung und versuch es erneut." / "No connection to
 * the server…") fits a timeout and tells the user the one thing they can act
 * on. A fifth code would cost two more i18n keys per language and tell them
 * nothing extra. The console keeps the distinction that matters to US: see the
 * logging rule.
 *
 * LOGGING RULE — do not weaken: log the HTTP status and the failure class and
 * nothing else. The failure class is {@link errorName}, i.e. `err.name` —
 * "AbortError" means our own timeout fired, "TypeError" means a real network
 * or CORS failure, and without it those three are one indistinguishable line
 * in the console. Never `err.message`, never the access token, never the
 * Authorization header, never the request URL, never the request body, never
 * the response body. Any of those can carry credentials or echo request
 * details back into the console.
 */
async function callEdgeFunction(
    accessToken: string,
    body: Record<string, unknown>,
): Promise<EdgeCallResult> {
    const supabaseUrl = readSupabaseUrl()
    if (supabaseUrl === null) {
        // No URL, no request. The message names the missing variable, not a value.
        console.error("riot-sync edge function not called: Supabase URL is not configured")
        return { ok: false, error: "riot_not_configured" }
    }

    // WHY AbortController + setTimeout AND NOT AbortSignal.timeout(): the static
    // helper is available in every runtime this app targets and would be one
    // line, but its timer belongs to the platform and vi.useFakeTimers() cannot
    // advance it — the timeout test would have to sit through a real 60 s.
    // AbortController is also the variant with the wider support floor, and it
    // is the only one whose timer we can cancel, which is what the finally at
    // the bottom needs.
    //
    // The abort covers the WHOLE exchange, not just the connect: a server that
    // sends headers and then stalls mid-body hangs res.json() exactly the way a
    // dead socket hangs fetch(). So the timer is armed here and cleared once,
    // in the finally, on every return path.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS)

    try {
        let res: Response
        try {
            res = await fetch(`${supabaseUrl}/functions/v1/riot-sync`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            })
        } catch (err) {
            // Failure CLASS only — never err.message, which can contain the
            // request URL. "AbortError" here means our own timeout fired.
            console.error(
                "riot-sync edge function request failed; error class:",
                errorName(err),
            )
            return { ok: false, error: "riot_network_error" }
        }

        if (!res.ok) {
            // Log status only — never the body, which may echo request details.
            console.error("riot-sync edge function returned non-OK status:", res.status)
        }

        let parsed: unknown
        try {
            parsed = await res.json()
        } catch (err) {
            // A body read killed by OUR timeout is a network failure, not a
            // malformed payload: no payload was ever seen. Everything else that
            // lands here (a SyntaxError on an HTML error page) stays
            // riot_invalid_response, so the existing behaviour is untouched.
            const name = errorName(err)
            if (name === "AbortError") {
                console.error(
                    "riot-sync edge function response body aborted; error class:",
                    name,
                    "status:",
                    res.status,
                )
                return { ok: false, error: "riot_network_error" }
            }
            // Status and class only — the unparsable body itself is never logged.
            console.error(
                "riot-sync edge function returned a non-JSON body; error class:",
                name,
                "status:",
                res.status,
            )
            return { ok: false, error: "riot_invalid_response" }
        }

        // Arrays, null, numbers and strings are all valid JSON and all unusable here.
        if (!isRecord(parsed)) return { ok: false, error: "riot_invalid_response" }

        const rawError = parsed.error
        if (typeof rawError === "string" && rawError.trim().length > 0) {
            return { ok: false, error: rawError }
        }

        if (!res.ok) {
            // The common real case is an expired session; it deserves its own
            // sentence rather than the catch-all.
            if (res.status === 401 || res.status === 403) {
                return { ok: false, error: "riot_unauthorized" }
            }
            return { ok: false, error: "riot_invalid_response" }
        }

        return { ok: true, data: parsed }
    } finally {
        // MANDATORY. Without it the 60 s timer stays armed after every single
        // call: a leak in the browser, and under vitest an open handle that
        // keeps the run alive ("Vitest did not exit"). finally also covers the
        // early returns above, which is why the timer is not cleared inline.
        clearTimeout(timeoutId)
    }
}

/**
 * Links a Riot account. `null` means success — and now only a payload that
 * explicitly says `success: true` produces it.
 *
 * The edge function sends `{ success: true, puuid }` on its single success
 * path (supabase/functions/riot-sync/index.ts, `action: "link"`), so this gate
 * cannot reject a genuine link.
 */
export async function linkRiotAccount(
    accessToken: string,
    teamId: string,
    gameName: string,
    tagLine: string,
): Promise<string | null> {
    const result = await callEdgeFunction(accessToken, {
        action: "link",
        team_id: teamId,
        game_name: gameName,
        tag_line: tagLine,
    })
    if (!result.ok) return result.error
    if (result.data.success !== true) return "riot_invalid_response"
    return null
}

export interface SyncResult {
    imported: number
    skipped: number
    alreadyKnown: number
    pagesFetched: number
    maxPagesReached: boolean
    moreMayBeAvailable: boolean
    mode?: SyncMode
    detailRequests?: number
}

/**
 * Runs a sync. Returns a {@link SyncResult} on success, or an error string.
 *
 * Success requires BOTH of:
 *   - `success === true`, strictly (all three success paths of the edge
 *     function send it: index.ts lines 109, 151 and 298)
 *   - `imported` being a non-negative whole number (see {@link asCount})
 *
 * `imported` is the number that ends up on the user's screen, so it is never
 * defaulted: a missing, non-numeric, `NaN`, negative or fractional value is a
 * failed sync, not a sync of zero. The remaining fields are informational and
 * are defaulted safely — they keep the softer {@link asFiniteNumber} check,
 * because a wrong "pages fetched" is a cosmetic detail while a wrong "matches
 * saved" is a lie about the user's data. The former `as number` / `as boolean`
 * casts are gone on purpose — they asserted a shape nobody had checked, which
 * is exactly how `undefined` reached the success message.
 */
export async function syncRiotMatches(
    accessToken: string,
    teamId: string,
    mode: SyncMode = "quick",
): Promise<SyncResult | string> {
    const result = await callEdgeFunction(accessToken, {
        action: "sync",
        team_id: teamId,
        mode,
    })
    if (!result.ok) return result.error

    const data = result.data
    if (data.success !== true) return "riot_invalid_response"

    const imported = asCount(data.imported)
    if (imported === undefined) return "riot_invalid_response"

    return {
        imported,
        skipped:            asFiniteNumber(data.skipped) ?? 0,
        alreadyKnown:       asFiniteNumber(data.alreadyKnown) ?? 0,
        pagesFetched:       asFiniteNumber(data.pagesFetched) ?? 0,
        maxPagesReached:    asBoolean(data.maxPagesReached),
        moreMayBeAvailable: asBoolean(data.moreMayBeAvailable),
        mode:               asSyncMode(data.mode),
        detailRequests:     asFiniteNumber(data.detailRequests),
    }
}

export async function getMyPlayerAccount(
    teamId: string,
    userId: string,
): Promise<PlayerAccount | null> {
    if (!supabase) return null
    const { data, error } = await supabase
        .from("player_accounts")
        .select("*")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle()
    if (error) console.error("getMyPlayerAccount failed:", error.message)
    return (data as PlayerAccount | null) ?? null
}

export async function getTeamRankedMatches(
    teamId: string,
    puuid: string,
    limit = 20,
): Promise<RankedMatch[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("team_id", teamId)
        .eq("puuid", puuid)
        .order("game_start", { ascending: false })
        .limit(limit)
    if (error) console.error("getTeamRankedMatches failed:", error.message)
    return (data as RankedMatch[] | null) ?? []
}

export async function getAllTeamRankedMatches(
    teamId: string,
    limit = 200,
): Promise<RankedMatch[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("ranked_matches")
        .select("*")
        .eq("team_id", teamId)
        .order("game_start", { ascending: false })
        .limit(limit)
    if (error) console.error("getAllTeamRankedMatches failed:", error.message)
    return (data as RankedMatch[] | null) ?? []
}

export async function getTeamPlayerAccounts(teamId: string): Promise<PlayerAccount[]> {
    if (!supabase) return []
    const { data, error } = await supabase
        .from("player_accounts")
        .select("*")
        .eq("team_id", teamId)
    if (error) console.error("getTeamPlayerAccounts failed:", error.message)
    return (data as PlayerAccount[] | null) ?? []
}

export async function getMatchParticipants(
    teamId: string,
    matchIds: string[],
): Promise<MatchParticipant[]> {
    if (!supabase || matchIds.length === 0) return []
    const { data, error } = await supabase
        .from("ranked_match_participants")
        .select("*")
        .eq("team_id", teamId)
        .in("match_id", matchIds)
    if (error) console.error("getMatchParticipants failed:", error.message)
    return (data as MatchParticipant[] | null) ?? []
}

/** Formats seconds into "mm:ss". */
export function formatGameDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, "0")}`
}

export interface MatchFilter {
    queueId?: number
    puuid?: string
    win?: boolean
}

export function filterMatches(matches: RankedMatch[], filter: MatchFilter): RankedMatch[] {
    return matches.filter((m) => {
        if (filter.queueId !== undefined && m.queue_id !== filter.queueId) return false
        if (filter.puuid !== undefined && m.puuid !== filter.puuid) return false
        if (filter.win !== undefined && m.win !== filter.win) return false
        return true
    })
}
