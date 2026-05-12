import { describe, it, expect } from "vitest"
import { buildDownloadUrl, isPlausibleCsv } from "../scripts/googleDriveDownload"

describe("buildDownloadUrl", () => {
  it("builds correct Google Drive download URL", () => {
    const url = buildDownloadUrl("abc123")
    expect(url).toBe("https://drive.google.com/uc?export=download&id=abc123")
  })

  it("trims whitespace from file ID", () => {
    const url = buildDownloadUrl("  abc123  ")
    expect(url).toBe("https://drive.google.com/uc?export=download&id=abc123")
  })

  it("throws on empty file ID", () => {
    expect(() => buildDownloadUrl("")).toThrow()
  })

  it("throws on whitespace-only file ID", () => {
    expect(() => buildDownloadUrl("   ")).toThrow()
  })
})

describe("isPlausibleCsv", () => {
  it("accepts valid CSV content", () => {
    expect(isPlausibleCsv("gameid,date,league\n1,2024-01-01,LEC")).toBe(true)
  })

  it("rejects HTML DOCTYPE response", () => {
    expect(isPlausibleCsv("<!DOCTYPE html><html><body>Error</body></html>")).toBe(false)
  })

  it("rejects lowercase html tag", () => {
    expect(isPlausibleCsv("<html lang='de'><body></body></html>")).toBe(false)
  })

  it("rejects uppercase HTML tag", () => {
    expect(isPlausibleCsv("<!doctype HTML><HTML></HTML>")).toBe(false)
  })

  it("accepts quoted CSV", () => {
    expect(isPlausibleCsv('"gameid","date"\n"g1","2024-01-01"')).toBe(true)
  })

  it("accepts empty content as plausible (not HTML)", () => {
    expect(isPlausibleCsv("")).toBe(true)
  })
})
