import { describe, it, expect } from "vitest"
import { getEnabledSources, dataSources } from "../scripts/dataSources"
import type { DataSource } from "../scripts/dataSources"

const sources: DataSource[] = [
  {
    id: "enabled-1",
    name: "Enabled Source",
    type: "google-drive-csv",
    googleDriveFileId: "realFileId123",
    enabled: true,
    sourceWebsite: "https://example.com",
    localFallbackPath: "data/manual/enabled-1.csv",
  },
  {
    id: "disabled-1",
    name: "Disabled Source",
    type: "google-drive-csv",
    googleDriveFileId: "anotherId456",
    enabled: false,
    sourceWebsite: "https://example.com",
  },
  {
    id: "placeholder",
    name: "Placeholder",
    type: "google-drive-csv",
    googleDriveFileId: "PASTE_FILE_ID_HERE",
    enabled: true, // enabled but placeholder ID
    sourceWebsite: "https://example.com",
  },
]

describe("getEnabledSources", () => {
  it("returns only enabled sources", () => {
    const enabled = getEnabledSources(sources)
    expect(enabled.every(s => s.enabled)).toBe(true)
  })

  it("excludes disabled sources", () => {
    const enabled = getEnabledSources(sources)
    expect(enabled.find(s => s.id === "disabled-1")).toBeUndefined()
  })

  it("excludes placeholder file IDs", () => {
    const enabled = getEnabledSources(sources)
    expect(enabled.find(s => s.id === "placeholder")).toBeUndefined()
  })

  it("returns enabled sources with real file IDs", () => {
    const enabled = getEnabledSources(sources)
    expect(enabled).toHaveLength(1)
    expect(enabled[0].id).toBe("enabled-1")
  })

  it("returns empty array when all sources are disabled", () => {
    const allDisabled = sources.map(s => ({ ...s, enabled: false }))
    expect(getEnabledSources(allDisabled)).toHaveLength(0)
  })

  it("returns empty array for empty input", () => {
    expect(getEnabledSources([])).toHaveLength(0)
  })
})

describe("DataSource.localFallbackPath", () => {
  it("localFallbackPath is accepted on a DataSource without type errors", () => {
    const source: DataSource = {
      id: "test",
      name: "Test",
      type: "google-drive-csv",
      googleDriveFileId: "abc",
      enabled: true,
      sourceWebsite: "https://example.com",
      localFallbackPath: "data/manual/test.csv",
    }
    expect(source.localFallbackPath).toBe("data/manual/test.csv")
  })

  it("localFallbackPath is optional — omitting it is valid", () => {
    const source: DataSource = {
      id: "test",
      name: "Test",
      type: "google-drive-csv",
      googleDriveFileId: "abc",
      enabled: true,
      sourceWebsite: "https://example.com",
    }
    expect(source.localFallbackPath).toBeUndefined()
  })

  it("all configured sources have a localFallbackPath pointing to data/manual/", () => {
    for (const source of dataSources) {
      expect(source.localFallbackPath).toMatch(/^data\/manual\//)
    }
  })
})
