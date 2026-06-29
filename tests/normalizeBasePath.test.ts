import { describe, expect, it } from "vitest"

import { normalizeBasePath } from "../src/lib/normalizeBasePath"

describe("normalizeBasePath", () => {
  it("returns '/' for unset/empty/whitespace input", () => {
    expect(normalizeBasePath(undefined)).toBe("/")
    expect(normalizeBasePath(null)).toBe("/")
    expect(normalizeBasePath("")).toBe("/")
    expect(normalizeBasePath("   ")).toBe("/")
  })

  it("returns '/' for slash-only input (the bug being fixed — previously '//')", () => {
    expect(normalizeBasePath("/")).toBe("/")
    expect(normalizeBasePath("//")).toBe("/")
  })

  it("normalizes a subpath to a single leading and trailing slash", () => {
    expect(normalizeBasePath("lol-pro-meta-tool")).toBe("/lol-pro-meta-tool/")
    expect(normalizeBasePath("/lol-pro-meta-tool")).toBe("/lol-pro-meta-tool/")
    expect(normalizeBasePath("/lol-pro-meta-tool/")).toBe("/lol-pro-meta-tool/")
  })

  it("trims surrounding whitespace before normalizing", () => {
    expect(normalizeBasePath("  /lol-pro-meta-tool/  ")).toBe("/lol-pro-meta-tool/")
  })
})
