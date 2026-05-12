import { describe, it, expect } from "vitest"
import { parseCsv, parseCsvWithHeaders } from "../src/import/parseCsv"

describe("parseCsv", () => {
  it("parses simple CSV", () => {
    const rows = parseCsv("a,b,c\n1,2,3")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(["a", "b", "c"])
    expect(rows[1]).toEqual(["1", "2", "3"])
  })

  it("handles quoted fields", () => {
    const rows = parseCsv('"hello world","foo,bar",baz')
    expect(rows[0]).toEqual(["hello world", "foo,bar", "baz"])
  })

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCsv('"say ""hi""",plain')
    expect(rows[0]).toEqual(['say "hi"', "plain"])
  })

  it("handles empty fields", () => {
    const rows = parseCsv("a,,c")
    expect(rows[0]).toEqual(["a", "", "c"])
  })

  it("returns empty array for empty content", () => {
    expect(parseCsv("")).toHaveLength(0)
  })

  it("skips blank lines", () => {
    const rows = parseCsv("a,b\n\n1,2\n\n")
    expect(rows).toHaveLength(2)
  })

  it("handles \\r\\n line endings", () => {
    const rows = parseCsv("a,b\r\n1,2")
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual(["1", "2"])
  })
})

describe("parseCsvWithHeaders", () => {
  it("returns header-keyed objects", () => {
    const result = parseCsvWithHeaders("name,age\nAlice,30\nBob,25")
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: "Alice", age: "30" })
    expect(result[1]).toEqual({ name: "Bob", age: "25" })
  })

  it("returns empty array for empty content", () => {
    expect(parseCsvWithHeaders("")).toHaveLength(0)
  })

  it("returns empty array when only header present", () => {
    expect(parseCsvWithHeaders("name,age")).toHaveLength(0)
  })

  it("fills missing columns with empty string", () => {
    const result = parseCsvWithHeaders("a,b,c\n1,2")
    expect(result[0].c).toBe("")
  })
})
