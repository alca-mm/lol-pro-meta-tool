import { describe, it, expect } from "vitest"
import {
  toSafeErrorMessage,
  isCriticalDataLoadError,
  createDataLoadError,
  reduceDataLoadError,
} from "../src/lib/dataLoadError"

describe("toSafeErrorMessage", () => {
  it("formats an HTTP status number as 'HTTP <code>'", () => {
    expect(toSafeErrorMessage(404)).toBe("HTTP 404")
    expect(toSafeErrorMessage(500)).toBe("HTTP 500")
  })

  it("uses name + message from an Error (e.g. a JSON parse error)", () => {
    const err = new SyntaxError("Unexpected token < in JSON")
    expect(toSafeErrorMessage(err)).toBe("SyntaxError: Unexpected token < in JSON")
  })

  it("uses a non-empty string error as-is", () => {
    expect(toSafeErrorMessage("Failed to fetch")).toBe("Failed to fetch")
  })

  it("falls back to a generic message for unknown error values", () => {
    expect(toSafeErrorMessage(undefined)).toBe("Unknown error")
    expect(toSafeErrorMessage(null)).toBe("Unknown error")
    expect(toSafeErrorMessage({})).toBe("Unknown error")
    expect(toSafeErrorMessage("")).toBe("Unknown error")
  })

  it("truncates huge messages so no large payload leaks into the UI", () => {
    const huge = "x".repeat(10_000)
    const result = toSafeErrorMessage(new Error(huge))
    expect(result.length).toBeLessThanOrEqual(210)
    expect(result.endsWith("…")).toBe(true)
  })

  it("does not leak a stack trace", () => {
    const err = new Error("boom")
    err.stack = "Error: boom\n    at /secret/path/with-token-abc123.ts:1:1"
    const result = toSafeErrorMessage(err)
    expect(result).toBe("Error: boom")
    expect(result).not.toContain("secret")
    expect(result).not.toContain("token")
  })
})

describe("isCriticalDataLoadError", () => {
  it("treats match-data failures as critical", () => {
    expect(isCriticalDataLoadError("matches")).toBe(true)
  })

  it("treats sync-report failures as non-critical", () => {
    expect(isCriticalDataLoadError("syncReport")).toBe(false)
  })
})

describe("createDataLoadError", () => {
  it("creates a critical error with a safe detail for an HTTP 404 on match data", () => {
    const error = createDataLoadError("matches", 404)
    expect(error).toEqual({
      kind: "matches",
      critical: true,
      detail: "HTTP 404",
    })
  })

  it("creates a critical error for a JSON/parse failure on match data", () => {
    const error = createDataLoadError("matches", new SyntaxError("bad json"))
    expect(error.kind).toBe("matches")
    expect(error.critical).toBe(true)
    expect(error.detail).toBe("SyntaxError: bad json")
  })

  it("creates a non-critical warning for a sync-report failure", () => {
    const error = createDataLoadError("syncReport", 503)
    expect(error.kind).toBe("syncReport")
    expect(error.critical).toBe(false)
    expect(error.detail).toBe("HTTP 503")
  })
})

describe("reduceDataLoadError", () => {
  it("produces no error state on a successful match-data load", () => {
    expect(reduceDataLoadError("matches", { type: "success" })).toBeNull()
  })

  it("produces no error state on a successful sync-report load", () => {
    expect(reduceDataLoadError("syncReport", { type: "success" })).toBeNull()
  })

  it("produces a critical error on a failed match-data load", () => {
    const error = reduceDataLoadError("matches", { type: "error", error: 404 })
    expect(error).not.toBeNull()
    expect(error?.critical).toBe(true)
    expect(error?.detail).toBe("HTTP 404")
  })

  it("produces a non-critical error on a failed sync-report load", () => {
    const error = reduceDataLoadError("syncReport", {
      type: "error",
      error: new Error("network"),
    })
    expect(error).not.toBeNull()
    expect(error?.critical).toBe(false)
    expect(error?.detail).toBe("Error: network")
  })
})
