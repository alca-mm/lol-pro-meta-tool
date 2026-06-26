import { describe, it, expect } from "vitest"
import { publicAssetUrl } from "../src/lib/publicAssetUrl"

describe("publicAssetUrl", () => {
  it("joins a relative path with root base", () => {
    expect(publicAssetUrl("data/importedMatches.json", "/")).toBe(
      "/data/importedMatches.json",
    )
  })

  it("joins a relative path with a sub-path base", () => {
    expect(
      publicAssetUrl("data/importedMatches.json", "/lol-pro-meta-tool/"),
    ).toBe("/lol-pro-meta-tool/data/importedMatches.json")
  })

  it("normalizes a base WITHOUT a trailing slash", () => {
    expect(
      publicAssetUrl("data/importedMatches.json", "/lol-pro-meta-tool"),
    ).toBe("/lol-pro-meta-tool/data/importedMatches.json")
  })

  it("normalizes a base WITHOUT a leading slash (no trailing slash)", () => {
    expect(
      publicAssetUrl("data/importedMatches.json", "lol-pro-meta-tool"),
    ).toBe("/lol-pro-meta-tool/data/importedMatches.json")
  })

  it("normalizes a base WITHOUT a leading slash (with trailing slash)", () => {
    expect(
      publicAssetUrl("data/importedMatches.json", "lol-pro-meta-tool/"),
    ).toBe("/lol-pro-meta-tool/data/importedMatches.json")
  })

  it("strips a leading slash from the asset path to avoid a double slash", () => {
    expect(publicAssetUrl("/data/x.json", "/repo/")).toBe("/repo/data/x.json")
  })

  it("falls back to '/' when the base is an empty string", () => {
    expect(publicAssetUrl("data/x.json", "")).toBe("/data/x.json")
  })

  it("never produces a double slash at the join boundary", () => {
    const result = publicAssetUrl("/data/x.json", "/repo/")
    // Strip the leading slash, then assert there is no remaining '//'.
    expect(result.slice(1).includes("//")).toBe(false)
    expect(result).toBe("/repo/data/x.json")
  })

  it("preserves a querystring on the asset path", () => {
    expect(publicAssetUrl("data/x.json?v=2", "/repo/")).toBe(
      "/repo/data/x.json?v=2",
    )
  })

  it("preserves a fragment on the asset path", () => {
    expect(publicAssetUrl("data/x.json#section", "/repo/")).toBe(
      "/repo/data/x.json#section",
    )
  })

  it("stays app-relative (starts with '/') for a normal relative input", () => {
    const result = publicAssetUrl("data/x.json", "/repo/")
    expect(result.startsWith("/")).toBe(true)
    expect(result.startsWith("http")).toBe(false)
  })

  it("returns an already-absolute http(s) URL unchanged", () => {
    expect(publicAssetUrl("https://cdn.example.com/x.json", "/repo/")).toBe(
      "https://cdn.example.com/x.json",
    )
    expect(publicAssetUrl("http://cdn.example.com/x.json", "/repo/")).toBe(
      "http://cdn.example.com/x.json",
    )
  })
})
