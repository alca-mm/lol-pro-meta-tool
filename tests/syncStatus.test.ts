import { describe, it, expect } from "vitest"
import { getSyncExitStatus, buildSyncStatusResult } from "../scripts/syncStatus"

const base = {
    sourcesProcessed: 3,
    sourcesFailed: 0,
    errors: [] as string[],
}

describe("getSyncExitStatus", () => {
    it("all sources succeeded → exit code 0", () => {
        expect(getSyncExitStatus({ ...base, sourcesSucceeded: 3, matchesImported: 100 })).toBe(0)
    })

    it("one source succeeded, others failed, matches > 0 → exit code 0", () => {
        expect(
            getSyncExitStatus({
                sourcesProcessed: 3,
                sourcesSucceeded: 1,
                sourcesFailed: 2,
                matchesImported: 4427,
                errors: ["[src2] timeout", "[src3] 404"],
            }),
        ).toBe(0)
    })

    it("all sources failed → exit code 1", () => {
        expect(
            getSyncExitStatus({
                sourcesProcessed: 3,
                sourcesSucceeded: 0,
                sourcesFailed: 3,
                matchesImported: 0,
                errors: ["[src1] err", "[src2] err", "[src3] err"],
            }),
        ).toBe(1)
    })

    it("one source succeeded but 0 matches imported → exit code 1", () => {
        expect(
            getSyncExitStatus({
                sourcesProcessed: 2,
                sourcesSucceeded: 1,
                sourcesFailed: 1,
                matchesImported: 0,
                errors: ["[src2] err"],
            }),
        ).toBe(1)
    })

    it("no sources at all → exit code 1", () => {
        expect(
            getSyncExitStatus({
                sourcesProcessed: 0,
                sourcesSucceeded: 0,
                sourcesFailed: 0,
                matchesImported: 0,
                errors: [],
            }),
        ).toBe(1)
    })
})

describe("buildSyncStatusResult", () => {
    it("full success → label success, exit code 0, no failure line", () => {
        const result = buildSyncStatusResult({
            ...base,
            sourcesSucceeded: 3,
            matchesImported: 100,
        })
        expect(result.exitCode).toBe(0)
        expect(result.label).toBe("success")
        expect(result.summaryLines.join(" ")).not.toContain("fehlgeschlagen")
    })

    it("partial success → label partial, exit code 0, warning line contains counts", () => {
        const result = buildSyncStatusResult({
            sourcesProcessed: 3,
            sourcesSucceeded: 1,
            sourcesFailed: 2,
            matchesImported: 4427,
            errors: ["[src2] timeout", "[src3] 404"],
        })
        expect(result.exitCode).toBe(0)
        expect(result.label).toBe("partial")
        expect(result.summaryLines[0]).toContain("1/3")
        expect(result.summaryLines[0]).toContain("2 Quellen fehlgeschlagen")
        expect(result.summaryLines[1]).toContain("4427")
    })

    it("partial success — errors are not discarded (caller still writes them to report)", () => {
        const errors = ["[src2] timeout", "[src3] 404"]
        const result = buildSyncStatusResult({
            sourcesProcessed: 3,
            sourcesSucceeded: 1,
            sourcesFailed: 2,
            matchesImported: 100,
            errors,
        })
        // buildSyncStatusResult does not modify the errors array — they pass through to the report
        expect(errors).toHaveLength(2)
        expect(result.exitCode).toBe(0)
    })

    it("all failed → label failure, exit code 1, failure message mentions no source succeeded", () => {
        const result = buildSyncStatusResult({
            sourcesProcessed: 3,
            sourcesSucceeded: 0,
            sourcesFailed: 3,
            matchesImported: 0,
            errors: ["[src1] err"],
        })
        expect(result.exitCode).toBe(1)
        expect(result.label).toBe("failure")
        expect(result.summaryLines[0]).toContain("fehlgeschlagen")
        expect(result.summaryLines[0]).toContain("Keine Quelle")
    })

    it("succeeded but 0 matches → label failure, failure message mentions no matches", () => {
        const result = buildSyncStatusResult({
            sourcesProcessed: 2,
            sourcesSucceeded: 1,
            sourcesFailed: 1,
            matchesImported: 0,
            errors: ["[src2] err"],
        })
        expect(result.exitCode).toBe(1)
        expect(result.label).toBe("failure")
        expect(result.summaryLines[0]).toContain("Keine validen Matches")
    })
})
