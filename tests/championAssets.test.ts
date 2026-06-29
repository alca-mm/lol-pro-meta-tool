import { describe, it, expect } from "vitest"
import { championImageId, championIconUrl, championInitials } from "../src/analysis/championAssets"

const DATA_DRAGON_VERSION = "16.10.1"

describe("championImageId", () => {
  it("maps known special-case names (apostrophes/spaces/aliases) to Data Dragon ids", () => {
    expect(championImageId("Kai'Sa")).toBe("Kaisa")
    expect(championImageId("Wukong")).toBe("MonkeyKing")
    expect(championImageId("Nunu & Willump")).toBe("Nunu")
    expect(championImageId("Cho'Gath")).toBe("Chogath")
    expect(championImageId("Dr. Mundo")).toBe("DrMundo")
    expect(championImageId("Jarvan IV")).toBe("JarvanIV")
    expect(championImageId("Renata Glasc")).toBe("Renata")
    expect(championImageId("Twisted Fate")).toBe("TwistedFate")
    expect(championImageId("Vel'Koz")).toBe("Velkoz")
    expect(championImageId("K'Sante")).toBe("KSante")
  })

  it("matches special cases case-insensitively and trims surrounding whitespace", () => {
    expect(championImageId("  kai'sa  ")).toBe("Kaisa")
    expect(championImageId("WUKONG")).toBe("MonkeyKing")
  })

  it("normalizes a plain champion name to itself", () => {
    expect(championImageId("Aatrox")).toBe("Aatrox")
    expect(championImageId("Ahri")).toBe("Ahri")
  })

  it("handles an unknown name safely via the fallback (no throw, returns a string)", () => {
    let result: string | undefined
    expect(() => {
      result = championImageId("Some Brand New Champion!")
    }).not.toThrow()
    expect(typeof result).toBe("string")
    // Fallback strips spaces and non-alphanumeric characters from the raw name.
    expect(result).toBe("SomeBrandNewChampion")
  })

  it("handles an unknown name containing an apostrophe via the fallback", () => {
    // Not present in the special map -> apostrophe stripped by the fallback regex.
    expect(championImageId("Fake'Mon")).toBe("FakeMon")
  })

  it("returns a deterministic string for empty input without throwing", () => {
    let result: string | undefined
    expect(() => {
      result = championImageId("")
    }).not.toThrow()
    expect(typeof result).toBe("string")
    expect(result).toBe("")
  })

  it("maps the new champion Locke to itself via the fallback (no special-map entry)", () => {
    expect(championImageId("Locke")).toBe("Locke")
  })
})

describe("championIconUrl", () => {
  it("builds a Data Dragon URL containing the hardcoded version and the normalized id", () => {
    const url = championIconUrl("Aatrox")
    expect(url).toContain(DATA_DRAGON_VERSION)
    expect(url).toContain("Aatrox")
    expect(url).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/Aatrox.png`,
    )
  })

  it("uses the normalized special-case id in the URL", () => {
    const url = championIconUrl("Kai'Sa")
    expect(url).toContain(DATA_DRAGON_VERSION)
    expect(url).toContain("Kaisa")
    expect(url).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/Kaisa.png`,
    )
  })

  it("builds a URL containing Locke.png for the new champion", () => {
    expect(championIconUrl("Locke")).toContain("Locke.png")
  })
})

describe("championInitials", () => {
  it("returns the first letter for a single-word name", () => {
    expect(championInitials("Aatrox")).toBe("A")
    expect(championInitials("Locke")).toBe("L")
  })

  it("returns the first letter of the first two words for multi-word names", () => {
    expect(championInitials("Lee Sin")).toBe("LS")
  })

  it("skips non-letter words and punctuation when building initials", () => {
    expect(championInitials("Nunu & Willump")).toBe("NW")
    expect(championInitials("Dr. Mundo")).toBe("DM")
  })

  it("returns '?' for empty or whitespace-only input", () => {
    expect(championInitials("")).toBe("?")
    expect(championInitials("   ")).toBe("?")
  })

  it("never throws for arbitrary input", () => {
    const inputs = ["", "   ", "Aatrox", "Lee Sin", "Nunu & Willump", "Dr. Mundo", "!!!", "123 456"]
    for (const input of inputs) {
      expect(() => championInitials(input)).not.toThrow()
      expect(typeof championInitials(input)).toBe("string")
    }
  })
})
