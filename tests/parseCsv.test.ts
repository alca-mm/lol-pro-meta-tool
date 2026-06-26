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

  // ---- additional regression cases ----

  it("handles a leading empty field", () => {
    const rows = parseCsv(",b,c")
    expect(rows[0]).toEqual(["", "b", "c"])
  })

  it("handles multiple consecutive empty fields in the middle", () => {
    const rows = parseCsv("a,,,d")
    expect(rows[0]).toEqual(["a", "", "", "d"])
  })

  it("does not produce a trailing empty field for a single trailing comma", () => {
    // Characterizes actual behavior: a lone trailing comma is consumed
    // without adding an empty field.
    expect(parseCsv("a,b,")[0]).toEqual(["a", "b"])
  })

  it("produces an empty field for a double trailing comma", () => {
    expect(parseCsv("a,b,,")[0]).toEqual(["a", "b", ""])
  })

  it("handles a quoted empty field", () => {
    const rows = parseCsv('"",a')
    expect(rows[0]).toEqual(["", "a"])
  })

  it("handles a quoted field that only contains commas", () => {
    const rows = parseCsv('",,,",x')
    expect(rows[0]).toEqual([",,,", "x"])
  })

  it("pushes text after a closing quote (before the comma) as a separate field", () => {
    // Characterizes actual behavior: the quoted segment is one field, and the
    // trailing un-quoted text up to the next comma becomes another field.
    const rows = parseCsv('"ab"cd,e')
    expect(rows[0]).toEqual(["ab", "cd", "e"])
  })

  it("does NOT support newlines embedded in quoted fields (splits on the raw newline)", () => {
    // The content is split on \r?\n before field parsing, so an embedded
    // newline breaks one logical record into two rows.
    const rows = parseCsv('"line1\nline2",b')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(["line1"])
    expect(rows[1]).toEqual(['line2"', "b"])
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
