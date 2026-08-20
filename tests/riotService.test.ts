import { describe, it, expect } from "vitest"
import {
    parseRiotId,
    buildPageStarts,
    computeMoreMayBeAvailable,
    getMyPlayerAccount,
    getTeamRankedMatches,
    formatGameDuration,
    filterMatches,
    isRankedQueue,
    buildMatchIdsUrl,
    SYNC_MODE_CONFIG,
    type RankedMatch,
} from "../src/teams/riotService"

describe("parseRiotId", () => {
    it("parses valid Riot ID into gameName and tagLine", () => {
        const result = parseRiotId("mmmmicrocontroler#EUW")
        expect(result).toEqual({ gameName: "mmmmicrocontroler", tagLine: "EUW" })
    })

    it("returns null for input without #", () => {
        expect(parseRiotId("nohashtag")).toBeNull()
    })

    it("returns null for empty string", () => {
        expect(parseRiotId("")).toBeNull()
    })

    it("returns null when gameName is empty", () => {
        expect(parseRiotId("#EUW")).toBeNull()
    })

    it("returns null when tagLine is empty", () => {
        expect(parseRiotId("Player#")).toBeNull()
    })

    it("handles spaces in gameName correctly", () => {
        const result = parseRiotId("My Player#EUW1")
        expect(result).toEqual({ gameName: "My Player", tagLine: "EUW1" })
    })
})

describe("buildPageStarts", () => {
    it("returns [0, 20, 40] for maxPages=3 pageSize=20", () => {
        expect(buildPageStarts(3, 20)).toEqual([0, 20, 40])
    })

    it("max 60 IDs total: 3 pages × 20 = starts cover exactly [0,20,40]", () => {
        const starts = buildPageStarts(3, 20)
        expect(starts.length).toBe(3)
        expect(starts[starts.length - 1] + 20).toBe(60) // last page ends at 60
    })

    it("returns [0] for maxPages=1", () => {
        expect(buildPageStarts(1, 20)).toEqual([0])
    })

    it("returns empty array for maxPages=0", () => {
        expect(buildPageStarts(0, 20)).toEqual([])
    })
})

describe("computeMoreMayBeAvailable", () => {
    it("false when maxPagesReached is false", () => {
        expect(computeMoreMayBeAvailable(false, 20, 20, 5)).toBe(false)
    })

    it("false when last page was partial (less than pageSize)", () => {
        expect(computeMoreMayBeAvailable(true, 15, 20, 5)).toBe(false)
    })

    it("false when all IDs on last page were already known (unknownOnLastPage=0)", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 0)).toBe(false)
    })

    it("true when maxPagesReached, full last page, and some IDs unknown", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 3)).toBe(true)
    })

    it("true even when only 1 unknown ID on last page", () => {
        expect(computeMoreMayBeAvailable(true, 20, 20, 1)).toBe(true)
    })
})

describe("getMyPlayerAccount", () => {
    it("returns null when supabase is not configured", async () => {
        const result = await getMyPlayerAccount("team-id", "user-id")
        expect(result).toBeNull()
    })
})

describe("getTeamRankedMatches", () => {
    it("returns empty array when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123")
        expect(result).toEqual([])
    })

    it("returns empty array with custom limit when supabase is not configured", async () => {
        const result = await getTeamRankedMatches("team-id", "puuid-123", 5)
        expect(result).toEqual([])
    })
})

describe("formatGameDuration", () => {
    it("formats 0 seconds as 0:00", () => {
        expect(formatGameDuration(0)).toBe("0:00")
    })

    it("formats 90 seconds as 1:30", () => {
        expect(formatGameDuration(90)).toBe("1:30")
    })

    it("pads seconds below 10 with a leading zero", () => {
        expect(formatGameDuration(65)).toBe("1:05")
    })

    it("formats a typical game of 1800 seconds as 30:00", () => {
        expect(formatGameDuration(1800)).toBe("30:00")
    })

    it("formats 2145 seconds as 35:45", () => {
        expect(formatGameDuration(2145)).toBe("35:45")
    })
})

function makeMatch(overrides: Partial<RankedMatch>): RankedMatch {
    return {
        id: "id",
        team_id: "t1",
        puuid: "p1",
        match_id: "m1",
        queue_id: 420,
        champion_name: "Aatrox",
        win: true,
        kills: 5,
        deaths: 2,
        assists: 3,
        game_duration: 1800,
        game_start: "2024-01-01T00:00:00Z",
        role: null,
        lane: null,
        cs: 180,
        vision_score: 25,
        damage_to_champs: 30000,
        gold_earned: 12000,
        created_at: "2024-01-01T00:00:00Z",
        ...overrides,
    }
}

describe("isRankedQueue", () => {
    it("returns true for SoloQ (420)", () => {
        expect(isRankedQueue(420)).toBe(true)
    })

    it("returns true for FlexQ (440)", () => {
        expect(isRankedQueue(440)).toBe(true)
    })

    it("returns false for ARAM (450)", () => {
        expect(isRankedQueue(450)).toBe(false)
    })

    it("returns false for 0", () => {
        expect(isRankedQueue(0)).toBe(false)
    })
})

describe("buildMatchIdsUrl", () => {
    const base = "https://europe.api.riotgames.com"
    const puuid = "abc-123"

    it("contains the correct queue parameter for 420", () => {
        const url = buildMatchIdsUrl(base, puuid, 420, 0, 10)
        expect(url).toContain("queue=420")
    })

    it("contains the correct queue parameter for 440", () => {
        const url = buildMatchIdsUrl(base, puuid, 440, 0, 10)
        expect(url).toContain("queue=440")
    })

    it("contains start and count parameters", () => {
        const url = buildMatchIdsUrl(base, puuid, 420, 0, 10)
        expect(url).toContain("start=0")
        expect(url).toContain("count=10")
    })

    it("URL-encodes the puuid in the path", () => {
        const url = buildMatchIdsUrl(base, puuid, 420, 0, 10)
        expect(url).toContain(encodeURIComponent(puuid))
    })
})

describe("SYNC_MODE_CONFIG", () => {
    it("quick mode uses countPerQueue=10", () => {
        expect(SYNC_MODE_CONFIG.quick.countPerQueue).toBe(10)
    })

    it("deep mode uses countPerQueue=30", () => {
        expect(SYNC_MODE_CONFIG.deep.countPerQueue).toBe(30)
    })
})

describe("filterMatches", () => {
    const matches: RankedMatch[] = [
        makeMatch({ match_id: "m1", queue_id: 420, puuid: "p1", win: true }),
        makeMatch({ match_id: "m2", queue_id: 440, puuid: "p1", win: false }),
        makeMatch({ match_id: "m3", queue_id: 420, puuid: "p2", win: true }),
        makeMatch({ match_id: "m4", queue_id: 420, puuid: "p1", win: false }),
    ]

    it("returns all matches when filter is empty", () => {
        expect(filterMatches(matches, {})).toHaveLength(4)
    })

    it("filters by queueId", () => {
        const result = filterMatches(matches, { queueId: 420 })
        expect(result).toHaveLength(3)
        expect(result.every((m) => m.queue_id === 420)).toBe(true)
    })

    it("filters by puuid", () => {
        const result = filterMatches(matches, { puuid: "p2" })
        expect(result).toHaveLength(1)
        expect(result[0].match_id).toBe("m3")
    })

    it("filters by win=true", () => {
        const result = filterMatches(matches, { win: true })
        expect(result).toHaveLength(2)
        expect(result.every((m) => m.win)).toBe(true)
    })

    it("filters by win=false", () => {
        const result = filterMatches(matches, { win: false })
        expect(result).toHaveLength(2)
        expect(result.every((m) => !m.win)).toBe(true)
    })

    it("combines multiple filter criteria", () => {
        const result = filterMatches(matches, { queueId: 420, puuid: "p1" })
        expect(result).toHaveLength(2)
        expect(result.map((m) => m.match_id)).toEqual(["m1", "m4"])
    })

    it("returns empty array when no matches pass filter", () => {
        expect(filterMatches(matches, { queueId: 450 })).toHaveLength(0)
    })
})

// ===========================================================================
// Transport-Härtung: callEdgeFunction / syncRiotMatches / linkRiotAccount
// ---------------------------------------------------------------------------
// Der abgesicherte Defekt (gemeldet 2026-08-20):
//
//   syncRiotMatches prüfte nur `if (result.error)`. Antwortet die
//   Supabase-PLATTFORM mit ihrem eigenen Gateway-JSON
//   ({"code":401,"message":"Invalid JWT"}) statt der Function-Payload, ist
//   `result.error` undefined — der Code fiel in den ERFOLGSZWEIG und baute
//   { imported: undefined, ... }. Die UI rendert daraus
//   "undefined neue Matches gespeichert." als GRÜNE Erfolgsmeldung.
//
//   Zweitens hatte callEdgeFunction kein try/catch: eine fetch-Rejection oder
//   eine Nicht-JSON-Antwort lief ungefangen bis in die Komponente,
//   setBusy(false) wurde nie erreicht, der Button hing dauerhaft auf "Lädt…".
//
// Contract, gegen den hier getestet wird:
//   syncRiotMatches -> Promise<SyncResult | string>; ein STRING ist ein Fehler.
//   linkRiotAccount -> Promise<string | null>;       NULL heißt Erfolg.
//   Erfolg bei syncRiotMatches NUR wenn data.success === true UND
//   Number.isFinite(data.imported). Erfolg bei linkRiotAccount NUR wenn
//   data.success === true.
//
// --- Wie import.meta.env hier gestubbt wird (und warum genau so) -----------
// (1) riotService.ts liest VITE_SUPABASE_URL INNERHALB von callEdgeFunction,
//     also zur AUFRUFZEIT und nicht zur Modulladezeit. Deshalb genügt
//     vi.stubEnv() zusammen mit einem statischen Import. Der Umweg über
//     vi.resetModules() plus dynamisches import() wäre nur nötig, wenn der
//     Wert beim Laden des Moduls eingefroren würde — so wie in
//     src/lib/supabase.ts, das seine Konstanten auf Modulebene berechnet.
//     Empirisch geprüft: nach vi.stubEnv("VITE_SUPABASE_URL", "…") liefert
//     import.meta.env.VITE_SUPABASE_URL sofort den gestubbten Wert.
// (2) WICHTIG: In diesem Repo existiert eine .env.local mit einem echten
//     VITE_SUPABASE_URL, und Vitest lädt sie in import.meta.env (empirisch
//     geprüft: typeof import.meta.env.VITE_SUPABASE_URL === "string" ganz ohne
//     Stubben). Ein Test für "Konfiguration fehlt" darf sich also NICHT darauf
//     verlassen, dass die Variable ungesetzt ist — er muss sie aktiv
//     entfernen. vi.stubEnv(name, undefined) löscht den Key wirklich (geprüft:
//     "VITE_SUPABASE_URL" in import.meta.env === false), und
//     vi.unstubAllEnvs() stellt den .env.local-Wert danach wieder her.
//
// Vitest läuft hier in Node OHNE jsdom: kein document, kein window.
// ===========================================================================

import { afterEach, beforeEach, vi, type Mock } from "vitest"
import {
    linkRiotAccount,
    syncRiotMatches,
    RIOT_TRANSPORT_ERROR_CODES,
} from "../src/teams/riotService"

/**
 * Die Codes, die der Service SELBST erzeugt, als flache String-Liste.
 * Object.values() funktioniert sowohl für ein Array (`[...] as const`) als auch
 * für eine Map ({ network: "riot_network_error", … }) — der Test soll an der
 * gewählten Datenform des Service nicht zerbrechen, nur an den Codes.
 */
const TRANSPORT_CODES: readonly string[] = Object.values(
    RIOT_TRANSPORT_ERROR_CODES as unknown as Record<string, string>,
)

const TEST_TOKEN = "test-token"
const TEST_TEAM = "team-42"
const TEST_SUPABASE_URL = "https://example.test"

/** Fake-Response mit verwertbarem JSON-Körper. */
function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as unknown as Response
}

/** Fake-Response, deren .json() wirft — z.B. eine HTML-Fehlerseite. */
function brokenJsonResponse(rawText: string, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            throw new SyntaxError("Unexpected token < in JSON at position 0")
        },
        text: async () => rawText,
    } as unknown as Response
}

describe("riot edge function transport hardening", () => {
    let fetchMock: Mock<(...args: Parameters<typeof fetch>) => Promise<Response>>

    beforeEach(() => {
        vi.stubEnv("VITE_SUPABASE_URL", TEST_SUPABASE_URL)
        fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        vi.stubGlobal("fetch", fetchMock)
        // Der Service loggt bei Nicht-OK-Status bewusst den Status. Hier stumm
        // geschaltet, damit die Testausgabe lesbar bleibt; die Aufrufe bleiben
        // über den Spy für die Secret-Prüfung weiter inspizierbar.
        vi.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
        // Sauber zurücksetzen, damit kein Test den nächsten beeinflusst.
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    // -----------------------------------------------------------------------
    // 1. Gateway-JSON ist kein Erfolg
    // -----------------------------------------------------------------------
    describe("Supabase gateway JSON is never a success (the reported defect)", () => {
        // {"code":401,"message":"Invalid JWT"} ist die Antwort der PLATTFORM,
        // nicht der Edge Function. Sie hat kein `error`-Feld — genau deshalb
        // fiel der alte Code in den Erfolgszweig.
        const GATEWAY_JSON = { code: 401, message: "Invalid JWT" }

        it("returns an error string for gateway JSON with HTTP 401", async () => {
            fetchMock.mockResolvedValue(jsonResponse(GATEWAY_JSON, 401))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("string")
            // Der gemeldete Defekt im Wortlaut: es entstand ein OBJEKT mit
            // imported === undefined, aus dem die UI
            // "undefined neue Matches gespeichert." als Erfolg rendert.
            expect(result).not.toEqual(expect.objectContaining({ imported: undefined }))
            expect(TRANSPORT_CODES).toContain(result as string)
        })

        it("returns an error string for gateway JSON delivered with HTTP 200", async () => {
            // Bösester Fall: Der Status sieht gesund aus, nur der Körper ist
            // Plattform-JSON. Ohne Payload-Prüfung ist das nicht erkennbar.
            fetchMock.mockResolvedValue(jsonResponse(GATEWAY_JSON, 200))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("string")
            expect(result).not.toEqual(expect.objectContaining({ imported: undefined }))
            expect(TRANSPORT_CODES).toContain(result as string)
        })
    })

    // -----------------------------------------------------------------------
    // 2. Malformed Payload ist kein Erfolg
    // -----------------------------------------------------------------------
    describe("malformed payloads never count as success", () => {
        const MALFORMED: ReadonlyArray<{ name: string; body: unknown }> = [
            { name: "imported present but no success flag", body: { imported: 3 } },
            { name: "success but no imported", body: { success: true } },
            { name: "imported explicitly undefined", body: { success: true, imported: undefined } },
            { name: "imported as string instead of number", body: { success: true, imported: "3" } },
            { name: "imported is NaN", body: { success: true, imported: NaN } },
            { name: "imported is null", body: { success: true, imported: null } },
            { name: "success truthy but not strictly true", body: { success: "true", imported: 3 } },
            { name: "body is an array", body: [{ success: true, imported: 3 }] },
            { name: "body is a number", body: 42 },
            { name: "body is a string", body: "OK" },
            { name: "body is null", body: null },
        ]

        it.each(MALFORMED)("returns an error string when $name", async ({ body }) => {
            fetchMock.mockResolvedValue(jsonResponse(body, 200))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("string")
            expect(result).not.toEqual(expect.objectContaining({ imported: undefined }))
        })
    })

    // -----------------------------------------------------------------------
    // 3. Gültige Payload bleibt Erfolg
    // -----------------------------------------------------------------------
    describe("valid payloads still succeed", () => {
        it("returns a SyncResult for a complete payload", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({
                    success: true,
                    imported: 1,
                    skipped: 2,
                    alreadyKnown: 3,
                    pagesFetched: 4,
                    maxPagesReached: false,
                    moreMayBeAvailable: false,
                    mode: "quick",
                }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("object")
            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(1)
            expect(sync.skipped).toBe(2)
            expect(sync.alreadyKnown).toBe(3)
            expect(sync.pagesFetched).toBe(4)
            expect(sync.maxPagesReached).toBe(false)
            expect(sync.moreMayBeAvailable).toBe(false)
            expect(sync.mode).toBe("quick")
        })

        it("passes moreMayBeAvailable=true through", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({
                    success: true,
                    imported: 2,
                    skipped: 0,
                    alreadyKnown: 0,
                    pagesFetched: 3,
                    maxPagesReached: true,
                    moreMayBeAvailable: true,
                    mode: "deep",
                }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM, "deep")

            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(2)
            expect(sync.moreMayBeAvailable).toBe(true)
            expect(sync.maxPagesReached).toBe(true)
            expect(sync.mode).toBe("deep")
        })

        it("treats imported=0 as a valid success, not as an error", async () => {
            // Das ist der Frühausstiegspfad der Edge Function: ein Sync, der
            // nichts Neues findet, ist erfolgreich. Eine Prüfung auf
            // Wahrheitswert statt Number.isFinite würde hier fälschlich
            // scheitern.
            fetchMock.mockResolvedValue(
                jsonResponse({ success: true, imported: 0, alreadyKnown: 60 }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("object")
            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(0)
            expect(sync.alreadyKnown).toBe(60)
        })

        it("defaults the informative fields safely when they are missing", async () => {
            // imported ist der EINZIGE Wert, der nie gedefaultet wird —
            // sein Fehlen ist ein Fehler (siehe Block 2).
            fetchMock.mockResolvedValue(jsonResponse({ success: true, imported: 5 }))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(5)
            expect(sync.skipped).toBe(0)
            expect(sync.alreadyKnown).toBe(0)
            expect(sync.pagesFetched).toBe(0)
            expect(sync.maxPagesReached).toBe(false)
            expect(sync.moreMayBeAvailable).toBe(false)
            expect(sync.mode).toBeUndefined()
        })

        it("ignores an unknown mode value instead of leaking it into SyncResult", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({ success: true, imported: 1, mode: "turbo" }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            const sync = result as Exclude<typeof result, string>
            expect(sync.mode).toBeUndefined()
        })

        it("keeps a valid mode value", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({ success: true, imported: 1, mode: "deep" }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM, "deep")

            const sync = result as Exclude<typeof result, string>
            expect(sync.mode).toBe("deep")
        })
    })

    // -----------------------------------------------------------------------
    // 4. Edge-Function-Fehler bleiben erhalten
    // -----------------------------------------------------------------------
    describe("stable edge function error codes pass through unchanged", () => {
        const EDGE_ERROR_CODES = [
            "riot_account_not_found",
            "riot_rate_limited",
            "riot_account_not_linked",
        ] as const

        it.each(EDGE_ERROR_CODES)("passes %s through unchanged", async (code) => {
            fetchMock.mockResolvedValue(jsonResponse({ error: code }))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(code)
        })

        it("passes an arbitrary foreign error string through unchanged", async () => {
            // Englische Prosa, Postgres-Meldungen usw. — die Härtung darf
            // fremde error-Strings nicht durch einen eigenen Code ersetzen.
            fetchMock.mockResolvedValue(jsonResponse({ error: "Invalid token" }))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe("Invalid token")
        })
    })

    // -----------------------------------------------------------------------
    // 5. + 6. Transportfehler resolven, sie werfen nicht
    // -----------------------------------------------------------------------
    describe("transport failures resolve instead of throwing", () => {
        it("returns riot_network_error when fetch rejects", async () => {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
            // resolves, NICHT rejects: sonst erreicht die Komponente ihr
            // setBusy(false) nie und der Button hängt dauerhaft auf "Lädt…".
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_network_error",
            )
        })

        it("returns riot_invalid_response when the body is not JSON", async () => {
            fetchMock.mockResolvedValue(brokenJsonResponse("<html>502 Bad Gateway</html>"))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_invalid_response",
            )
        })

        it("does not throw for a non-JSON body delivered with a non-OK status", async () => {
            fetchMock.mockResolvedValue(brokenJsonResponse("<html>504</html>", 504))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)
            expect(typeof result).toBe("string")
        })
    })

    // -----------------------------------------------------------------------
    // 7. HTTP-Status ohne brauchbares error-Feld
    // -----------------------------------------------------------------------
    describe("non-OK HTTP status without a usable error field", () => {
        it.each([401, 403])("maps HTTP %i to riot_unauthorized", async (status) => {
            fetchMock.mockResolvedValue(jsonResponse({ message: "no" }, status))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_unauthorized",
            )
        })

        it("maps HTTP 500 without a usable error to riot_invalid_response", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_invalid_response",
            )
        })

        it("lets the error field win over the HTTP status", async () => {
            // Die Edge Function antwortet mit 500 UND einem stabilen Code —
            // der Code ist die aussagekräftigere Information.
            fetchMock.mockResolvedValue(jsonResponse({ error: "riot_rate_limited" }, 500))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_rate_limited",
            )
        })
    })

    // -----------------------------------------------------------------------
    // 8. Fehlende Konfiguration
    // -----------------------------------------------------------------------
    describe("missing configuration", () => {
        beforeEach(() => {
            // Muss aktiv gelöscht werden: .env.local setzt die Variable real,
            // Vitest lädt sie in import.meta.env (siehe Kopfkommentar).
            vi.stubEnv("VITE_SUPABASE_URL", undefined as unknown as string)
        })

        it("returns riot_not_configured without calling fetch", async () => {
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_not_configured",
            )
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it("returns riot_not_configured from linkRiotAccount without calling fetch", async () => {
            await expect(
                linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW"),
            ).resolves.toBe("riot_not_configured")
            expect(fetchMock).not.toHaveBeenCalled()
        })
    })

    // -----------------------------------------------------------------------
    // 9. linkRiotAccount hat denselben Schutz
    // -----------------------------------------------------------------------
    describe("linkRiotAccount has the same protection", () => {
        it("returns null on a valid success payload", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ success: true, puuid: "x" }))
            await expect(
                linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW"),
            ).resolves.toBeNull()
        })

        it("does not report success for Supabase gateway JSON", async () => {
            // Derselbe Defekt wie bei syncRiotMatches: bisher meldete die UI
            // fälschlich "Riot-Account verknüpft!", weil result.error
            // undefined war und der Service daraufhin null zurückgab.
            fetchMock.mockResolvedValue(jsonResponse({ code: 401, message: "Invalid JWT" }, 401))
            const result = await linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW")

            expect(result).not.toBeNull()
            expect(typeof result).toBe("string")
            expect(TRANSPORT_CODES).toContain(result as string)
        })

        it("does not report success for a payload without success flag", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ puuid: "x" }))
            const result = await linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW")
            expect(result).not.toBeNull()
            expect(typeof result).toBe("string")
        })

        it("passes riot_account_not_found through unchanged", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ error: "riot_account_not_found" }))
            await expect(
                linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW"),
            ).resolves.toBe("riot_account_not_found")
        })

        it("returns riot_network_error when fetch rejects", async () => {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
            await expect(
                linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW"),
            ).resolves.toBe("riot_network_error")
        })
    })

    // -----------------------------------------------------------------------
    // 11. Request unverändert
    // -----------------------------------------------------------------------
    describe("the request itself is unchanged by the hardening", () => {
        it("sends POST JSON with a bearer token to /functions/v1/riot-sync", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ success: true, imported: 1 }))
            await syncRiotMatches(TEST_TOKEN, TEST_TEAM, "deep")

            expect(fetchMock).toHaveBeenCalledTimes(1)
            const [url, init] = fetchMock.mock.calls[0]
            expect(String(url)).toBe(`${TEST_SUPABASE_URL}/functions/v1/riot-sync`)
            expect(init?.method).toBe("POST")

            // Header-Schreibweise wird toleranz-normalisiert; die Werte sind gepinnt.
            const headers = Object.fromEntries(
                Object.entries((init?.headers ?? {}) as Record<string, string>).map(
                    ([key, value]) => [key.toLowerCase(), value],
                ),
            )
            expect(headers["content-type"]).toBe("application/json")
            expect(headers["authorization"]).toBe(`Bearer ${TEST_TOKEN}`)

            expect(JSON.parse(String(init?.body))).toEqual({
                action: "sync",
                team_id: TEST_TEAM,
                mode: "deep",
            })
        })

        it("sends the link action with game name and tag line", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ success: true, puuid: "x" }))
            await linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW")

            expect(fetchMock).toHaveBeenCalledTimes(1)
            const [, init] = fetchMock.mock.calls[0]
            expect(JSON.parse(String(init?.body))).toEqual({
                action: "link",
                team_id: TEST_TEAM,
                game_name: "Player",
                tag_line: "EUW",
            })
        })
    })

    // -----------------------------------------------------------------------
    // 10. Keine Secrets im Fehlerkanal
    // -----------------------------------------------------------------------
    describe("no secrets leak into the error channel", () => {
        const SECRET_TOKEN = "super-secret-token-do-not-leak"
        const LOUD_URL = "https://super-secret-project-ref.supabase.test"

        beforeEach(() => {
            vi.stubEnv("VITE_SUPABASE_URL", LOUD_URL)
        })

        type FailureCase = { name: string; arrange: () => void }

        /** Fälle, die für BEIDE Funktionen ein Fehler sind. */
        const SHARED_FAILURE_CASES: ReadonlyArray<FailureCase> = [
            {
                name: "fetch rejects",
                arrange: () => {
                    fetchMock.mockRejectedValue(new Error(`connect ${LOUD_URL} failed`))
                },
            },
            {
                name: "body is not JSON",
                arrange: () => {
                    fetchMock.mockResolvedValue(brokenJsonResponse("<html>502</html>"))
                },
            },
            {
                name: "gateway JSON with HTTP 401",
                arrange: () => {
                    fetchMock.mockResolvedValue(
                        jsonResponse({ code: 401, message: "Invalid JWT" }, 401),
                    )
                },
            },
            {
                name: "HTTP 500 without error field",
                arrange: () => {
                    fetchMock.mockResolvedValue(jsonResponse({}, 500))
                },
            },
            {
                name: "edge function error code",
                arrange: () => {
                    fetchMock.mockResolvedValue(jsonResponse({ error: "riot_rate_limited" }))
                },
            },
        ]

        /**
         * Nur für syncRiotMatches ein Fehler. linkRiotAccount verlangt laut
         * Contract ausschließlich `success === true` und kein `imported`;
         * { success: true } ist dort also ein legitimer Erfolg (null) und
         * gehört deshalb nicht in den Fehlerkanal-Durchlauf.
         */
        const SYNC_ONLY_FAILURE_CASES: ReadonlyArray<FailureCase> = [
            {
                name: "success payload without imported",
                arrange: () => {
                    fetchMock.mockResolvedValue(jsonResponse({ success: true }))
                },
            },
        ]

        it.each([...SHARED_FAILURE_CASES, ...SYNC_ONLY_FAILURE_CASES])(
            "syncRiotMatches error string leaks neither token nor URL when $name",
            async ({ arrange }) => {
                arrange()
                const result = await syncRiotMatches(SECRET_TOKEN, TEST_TEAM)

                expect(typeof result).toBe("string")
                const message = result as string
                expect(message).not.toContain(SECRET_TOKEN)
                expect(message).not.toContain(LOUD_URL)
                expect(message).not.toContain("super-secret-project-ref")
            },
        )

        it.each(SHARED_FAILURE_CASES)(
            "linkRiotAccount error string leaks neither token nor URL when $name",
            async ({ arrange }) => {
                arrange()
                const result = await linkRiotAccount(SECRET_TOKEN, TEST_TEAM, "Player", "EUW")

                expect(result).not.toBeNull()
                const message = String(result)
                expect(message).not.toContain(SECRET_TOKEN)
                expect(message).not.toContain(LOUD_URL)
                expect(message).not.toContain("super-secret-project-ref")
            },
        )

        it("never writes the access token into console.error", async () => {
            // Projektregel 17/20: keine Secrets in Logs. Der Service loggt heute
            // nur res.status — dieser Test hält das fest.
            fetchMock.mockResolvedValue(jsonResponse({ code: 401, message: "Invalid JWT" }, 401))
            await syncRiotMatches(SECRET_TOKEN, TEST_TEAM)

            const logged = (console.error as unknown as Mock).mock.calls
                .flat()
                .map((arg) => String(arg))
                .join(" | ")
            expect(logged).not.toContain(SECRET_TOKEN)
        })
    })

    // -----------------------------------------------------------------------
    // 12. imported muss eine nicht-negative GANZE Zahl sein
    //
    // Number.isFinite() allein liess -3 und 2.5 durch. Beides waere als
    // "-3 neue Matches gespeichert." bzw. "2.5 neue Matches gespeichert." auf
    // dem Schirm gelandet — genau das, was dieser Change verhindern soll.
    // Gilt NUR fuer imported; skipped/alreadyKnown/pagesFetched/detailRequests
    // behalten bewusst die weichere Behandlung (siehe letzter Test hier).
    // -----------------------------------------------------------------------
    describe("imported must be a non-negative whole number", () => {
        const REJECTED: ReadonlyArray<{ name: string; imported: unknown }> = [
            { name: "a negative integer", imported: -3 },
            { name: "a negative one", imported: -1 },
            { name: "a fraction", imported: 2.5 },
            { name: "a negative fraction", imported: -0.5 },
            { name: "Infinity", imported: Infinity },
            { name: "-Infinity", imported: -Infinity },
        ]

        it.each(REJECTED)(
            "returns riot_invalid_response when imported is $name",
            async ({ imported }) => {
                fetchMock.mockResolvedValue(jsonResponse({ success: true, imported }))
                await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                    "riot_invalid_response",
                )
            },
        )

        const ACCEPTED: ReadonlyArray<{ name: string; imported: number }> = [
            { name: "zero", imported: 0 },
            { name: "seven", imported: 7 },
            { name: "a large count", imported: 60 },
        ]

        it.each(ACCEPTED)("still succeeds when imported is $name", async ({ imported }) => {
            fetchMock.mockResolvedValue(jsonResponse({ success: true, imported }))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("object")
            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(imported)
        })

        it("accepts -0 and renders it as a plain zero, not as a failure", async () => {
            // Number.isInteger(-0) === true und -0 >= 0 === true, und String(-0)
            // ist "0" — die Meldung lautet also "0 neue Matches gespeichert.",
            // was korrekt ist. Einen Sync an einem unsichtbaren Vorzeichenbit
            // scheitern zu lassen waere die schlechtere Wahl.
            fetchMock.mockResolvedValue(jsonResponse({ success: true, imported: -0 }))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("object")
            const sync = result as Exclude<typeof result, string>
            // toBe() ist Object.is und wuerde -0 von 0 unterscheiden. Genau
            // diese Unterscheidung ist hier irrelevant: numerisch gleich (===)
            // und auf dem Schirm identisch ist alles, was zaehlt.
            expect(sync.imported === 0).toBe(true)
            expect(String(sync.imported)).toBe("0")
        })

        it("keeps the softer check for the informative fields", async () => {
            // Bewusst NICHT mitverschaerft: ein falsches "pagesFetched" ist
            // kosmetisch, ein falsches "imported" ist eine Falschaussage ueber
            // die Daten des Users. -1 und 2.5 duerfen hier also durchgehen.
            fetchMock.mockResolvedValue(
                jsonResponse({
                    success: true,
                    imported: 3,
                    skipped: -1,
                    alreadyKnown: 2.5,
                    pagesFetched: -4,
                    detailRequests: 1.5,
                }),
            )
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            expect(typeof result).toBe("object")
            const sync = result as Exclude<typeof result, string>
            expect(sync.imported).toBe(3)
            expect(sync.skipped).toBe(-1)
            expect(sync.alreadyKnown).toBe(2.5)
            expect(sync.pagesFetched).toBe(-4)
            expect(sync.detailRequests).toBe(1.5)
        })
    })

    // -----------------------------------------------------------------------
    // 13. Der HAENGENDE Request (der zweite Weg zum festen Button)
    //
    // Die bisherige Haertung faengt nur einen fetch, der REJECTED. Ein fetch,
    // der nie settled (Captive Portal, totes TCP, Server antwortet nie),
    // rejected nie — busy bliebe unbegrenzt true, der Button dauerhaft auf
    // "Laedt…", und startCooldown() liefe nicht. Genau dagegen steht der
    // AbortController.
    //
    // Fake-Timer, damit der Test nicht wirklich 60 s laeuft. Sie werden in
    // einem EIGENEN describe an- und wieder abgeschaltet, damit sie nicht in
    // andere Tests lecken: vi.useRealTimers() im afterEach dieses Blocks laeuft
    // vor dem aeusseren afterEach.
    // -----------------------------------------------------------------------
    describe("a hanging request is aborted instead of hanging forever", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        /** Was ein echter fetch beim Abbruch wirft: ein Error namens AbortError. */
        function abortError(): Error {
            const err = new Error("The operation was aborted.")
            err.name = "AbortError"
            return err
        }

        /**
         * Ein fetch, der NIE von selbst settled und ausschliesslich auf das
         * Abort-Signal reagiert — exakt das Verhalten eines echten fetch an
         * einem toten Socket. Ohne AbortController bekommt dieser Mock kein
         * signal, der Listener wird nie registriert, und der Aufruf haengt fuer
         * immer: das ist die Mutationsprobe, die in diesen Tests steckt.
         */
        function neverSettlingFetch(): void {
            fetchMock.mockImplementation((_input, init) => {
                return new Promise<Response>((_resolve, reject) => {
                    const signal = (init as RequestInit | undefined)?.signal
                    signal?.addEventListener("abort", () => reject(abortError()))
                })
            })
        }

        it("resolves syncRiotMatches with riot_network_error after the timeout", async () => {
            neverSettlingFetch()

            const pending = syncRiotMatches(TEST_TOKEN, TEST_TEAM)
            let settled = false
            void pending.then(() => {
                settled = true
            })

            // Kurz vor der Schranke wartet der Aufruf noch — das pinnt den
            // 60-000-ms-Wert fest, statt nur "irgendwann" zu pruefen.
            await vi.advanceTimersByTimeAsync(59_999)
            expect(settled).toBe(false)

            await vi.advanceTimersByTimeAsync(1)
            await expect(pending).resolves.toBe("riot_network_error")
        })

        it("resolves linkRiotAccount with riot_network_error after the timeout", async () => {
            neverSettlingFetch()

            const pending = linkRiotAccount(TEST_TOKEN, TEST_TEAM, "Player", "EUW")
            await vi.advanceTimersByTimeAsync(60_000)
            await expect(pending).resolves.toBe("riot_network_error")
        })

        it("logs the failure CLASS (AbortError) and never the message", async () => {
            neverSettlingFetch()

            const pending = syncRiotMatches(TEST_TOKEN, TEST_TEAM)
            await vi.advanceTimersByTimeAsync(60_000)
            await pending

            const logged = (console.error as unknown as Mock).mock.calls
                .flat()
                .map((arg) => String(arg))
                .join(" | ")
            expect(logged).toContain("AbortError")
            // err.message darf die Request-URL tragen und wird deshalb nie geloggt.
            expect(logged).not.toContain("The operation was aborted.")
        })

        it("passes an AbortSignal to fetch and clears the timer on success", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ success: true, imported: 1 }))
            const result = await syncRiotMatches(TEST_TOKEN, TEST_TEAM)
            expect(typeof result).toBe("object")

            const [, init] = fetchMock.mock.calls[0]
            const signal = (init as RequestInit | undefined)?.signal
            expect(signal).toBeInstanceOf(AbortSignal)
            expect(signal?.aborted).toBe(false)

            // Kein offener Handle: der Timer ist im finally aufgeraeumt. Ohne
            // clearTimeout stuende hier 1, und vitest meldete am Ende
            // "Vitest did not exit".
            expect(vi.getTimerCount()).toBe(0)

            // Und er feuert auch spaeter nicht mehr — der staerkere Beleg als
            // der reine Zaehler.
            await vi.advanceTimersByTimeAsync(120_000)
            expect(signal?.aborted).toBe(false)
        })

        it("clears the timer on a failing call too", async () => {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
            await expect(syncRiotMatches(TEST_TOKEN, TEST_TEAM)).resolves.toBe(
                "riot_network_error",
            )
            expect(vi.getTimerCount()).toBe(0)
        })

        it("logs TypeError as the failure class for a real network error", async () => {
            // Nach dem Timeout-Umbau ist die Klasse im Log der einzige
            // Unterschied zwischen "Timeout" und "kein Netz".
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
            await syncRiotMatches(TEST_TOKEN, TEST_TEAM)

            const logged = (console.error as unknown as Mock).mock.calls
                .flat()
                .map((arg) => String(arg))
                .join(" | ")
            expect(logged).toContain("TypeError")
            expect(logged).not.toContain("Failed to fetch")
        })
    })

    // -----------------------------------------------------------------------
    // Der exportierte Code-Katalog
    // -----------------------------------------------------------------------
    describe("RIOT_TRANSPORT_ERROR_CODES", () => {
        it("contains exactly the four codes the service produces itself", () => {
            expect([...TRANSPORT_CODES].sort()).toEqual(
                [
                    "riot_invalid_response",
                    "riot_network_error",
                    "riot_not_configured",
                    "riot_unauthorized",
                ].sort(),
            )
        })

        it("does not contain the stable edge function codes", () => {
            // Die kommen von der Edge Function und werden nur durchgereicht.
            expect(TRANSPORT_CODES).not.toContain("riot_account_not_found")
            expect(TRANSPORT_CODES).not.toContain("riot_rate_limited")
            expect(TRANSPORT_CODES).not.toContain("riot_account_not_linked")
        })
    })
})
