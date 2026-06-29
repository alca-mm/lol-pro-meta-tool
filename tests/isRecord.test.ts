import { describe, expect, it } from "vitest"

import { isRecord } from "../src/lib/isRecord"

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(Object.create(null))).toBe(true)
  })

  it("accepts nested objects", () => {
    expect(isRecord({ a: { b: 1 } })).toBe(true)
  })

  it("rejects null and undefined", () => {
    expect(isRecord(null)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
  })

  it("rejects primitives", () => {
    expect(isRecord(42)).toBe(false)
    expect(isRecord(0)).toBe(false)
    expect(isRecord("x")).toBe(false)
    expect(isRecord("")).toBe(false)
    expect(isRecord(true)).toBe(false)
    expect(isRecord(false)).toBe(false)
    expect(isRecord(Symbol())).toBe(false)
    expect(isRecord(10n)).toBe(false)
  })

  it("rejects arrays", () => {
    expect(isRecord([])).toBe(false)
    expect(isRecord([1, 2])).toBe(false)
    expect(isRecord([[1]])).toBe(false)
  })

  it("rejects functions (typeof 'function', not 'object')", () => {
    expect(isRecord(() => {})).toBe(false)
  })

  it("accepts Date and class instances — intentionally matches the previous inline-guard behavior (no unexpected tightening)", () => {
    expect(isRecord(new Date())).toBe(true)

    class Foo {}
    expect(isRecord(new Foo())).toBe(true)
  })
})
