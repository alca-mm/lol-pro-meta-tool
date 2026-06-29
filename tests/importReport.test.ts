import { describe, it, expect } from "vitest"
import { createEmptyReport, finishReport } from "../src/import/importReport"
import type { SyncReport } from "../src/domain/types"

const isIso = (value: string) => !Number.isNaN(Date.parse(value))

// Every documented field on the SyncReport contract.
const REQUIRED_FIELDS: Array<keyof SyncReport> = [
  "syncStartedAt",
  "syncFinishedAt",
  "sourcesProcessed",
  "sourcesSucceeded",
  "sourcesFailed",
  "downloadedFiles",
  "rowsRead",
  "gamesDetected",
  "matchesImported",
  "matchesSkipped",
  "warnings",
  "errors",
  "detectedPatches",
  "detectedLeagues",
  "detectedTournaments",
  "dateRange",
  "bansDetected",
  "outputFile",
]

describe("createEmptyReport", () => {
  it("returns a zeroed SyncReport for the given output file", () => {
    const report = createEmptyReport("out.json")

    expect(report.outputFile).toBe("out.json")

    // All numeric counts start at zero.
    expect(report.sourcesProcessed).toBe(0)
    expect(report.sourcesSucceeded).toBe(0)
    expect(report.sourcesFailed).toBe(0)
    expect(report.rowsRead).toBe(0)
    expect(report.gamesDetected).toBe(0)
    expect(report.matchesImported).toBe(0)
    expect(report.matchesSkipped).toBe(0)

    // All array fields start empty.
    expect(report.downloadedFiles).toEqual([])
    expect(report.warnings).toEqual([])
    expect(report.errors).toEqual([])
    expect(report.detectedPatches).toEqual([])
    expect(report.detectedLeagues).toEqual([])
    expect(report.detectedTournaments).toEqual([])

    // Defaults.
    expect(report.dateRange).toBeNull()
    expect(report.bansDetected).toBe(false)

    // Timestamps are valid ISO strings.
    expect(typeof report.syncStartedAt).toBe("string")
    expect(typeof report.syncFinishedAt).toBe("string")
    expect(isIso(report.syncStartedAt)).toBe(true)
    expect(isIso(report.syncFinishedAt)).toBe(true)
  })

  it("includes every documented SyncReport field", () => {
    const report = createEmptyReport("out.json")
    for (const field of REQUIRED_FIELDS) {
      expect(report).toHaveProperty(field)
    }
    // No unexpected extra keys leaked onto the report.
    expect(Object.keys(report).sort()).toEqual([...REQUIRED_FIELDS].sort())
  })

  it("does not leak unexpected payloads (warnings/errors empty by default)", () => {
    const report = createEmptyReport("out.json")
    expect(report.warnings).toHaveLength(0)
    expect(report.errors).toHaveLength(0)
    expect(report.dateRange).toBeNull()
  })

  it("returns independent array instances per call (no shared state)", () => {
    const a = createEmptyReport("a.json")
    const b = createEmptyReport("b.json")
    a.warnings.push("oops")
    expect(b.warnings).toEqual([])
    expect(a.warnings).toEqual(["oops"])
  })
})

describe("finishReport", () => {
  it("returns a new object without mutating the input", () => {
    const report = createEmptyReport("out.json")
    const finished = finishReport(report)

    expect(finished).not.toBe(report)
    expect(isIso(finished.syncFinishedAt)).toBe(true)
    // Input is untouched.
    expect(report.syncFinishedAt).toBe(report.syncStartedAt)
  })

  it("preserves all other fields when finishing", () => {
    const report = createEmptyReport("out.json")
    // Tweak some counts/arrays to prove they survive the copy.
    report.sourcesProcessed = 3
    report.matchesImported = 120
    report.matchesSkipped = 5
    report.warnings.push("w1")
    report.errors.push("e1")
    report.detectedPatches.push("14.1")
    report.bansDetected = true

    const finished = finishReport(report)

    expect(finished.outputFile).toBe("out.json")
    expect(finished.sourcesProcessed).toBe(3)
    expect(finished.matchesImported).toBe(120)
    expect(finished.matchesSkipped).toBe(5)
    expect(finished.warnings).toEqual(["w1"])
    expect(finished.errors).toEqual(["e1"])
    expect(finished.detectedPatches).toEqual(["14.1"])
    expect(finished.bansDetected).toBe(true)
    expect(finished.syncStartedAt).toBe(report.syncStartedAt)
  })

  it("preserves a dateRange when one is set", () => {
    const report = createEmptyReport("out.json")
    report.dateRange = { from: "2024-01-01", to: "2024-02-01" }

    const finished = finishReport(report)

    expect(finished.dateRange).toEqual({ from: "2024-01-01", to: "2024-02-01" })
  })

  it("keeps dateRange null-safe by default", () => {
    const finished = finishReport(createEmptyReport("out.json"))
    expect(finished.dateRange).toBeNull()
  })
})
