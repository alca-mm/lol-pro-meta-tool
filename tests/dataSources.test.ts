import { describe, it, expect } from "vitest"
import { getEnabledSources } from "../scripts/dataSources"
import type { DataSource } from "../scripts/dataSources"

const sources: DataSource[] = [
  {
    id: "enabled-1",
    name: "Enabled Source",
    type: "google-drive-csv",
    googleDriveFileId: "realFileId123",
    enabled: true,
    sourceWebsite: "https://example.com",
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
