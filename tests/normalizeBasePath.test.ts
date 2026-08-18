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
    expect(normalizeBasePath("///")).toBe("/")
  })

  it("normalizes a subpath to a single leading and trailing slash", () => {
    expect(normalizeBasePath("lol-pro-meta-tool")).toBe("/lol-pro-meta-tool/")
    expect(normalizeBasePath("/lol-pro-meta-tool")).toBe("/lol-pro-meta-tool/")
    expect(normalizeBasePath("/lol-pro-meta-tool/")).toBe("/lol-pro-meta-tool/")
    expect(normalizeBasePath("//lol-pro-meta-tool//")).toBe("/lol-pro-meta-tool/")
  })

  it("trims surrounding whitespace before normalizing", () => {
    expect(normalizeBasePath("  /lol-pro-meta-tool/  ")).toBe("/lol-pro-meta-tool/")
  })

  it("always yields exactly one leading and one trailing slash and never a '//'", () => {
    // Regression guard: a '//' base breaks every asset URL on the custom domain
    // https://aatroxtool.de/ (the live bug this helper exists to prevent).
    const inputs: Array<string | undefined | null> = [
      undefined,
      null,
      "",
      "   ",
      "/",
      "//",
      "///",
      "lol-pro-meta-tool",
      "/lol-pro-meta-tool",
      "/lol-pro-meta-tool/",
      "//lol-pro-meta-tool//",
      "  /lol-pro-meta-tool/  ",
    ]

    for (const input of inputs) {
      const hint = `input: ${JSON.stringify(input)}`
      const result = normalizeBasePath(input)

      expect(result, hint).not.toContain("//")
      expect(result.startsWith("/"), hint).toBe(true)
      expect(result.endsWith("/"), hint).toBe(true)
    }
  })
})
