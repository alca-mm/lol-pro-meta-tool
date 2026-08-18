import { describe, it, expect } from "vitest"
import { championImageId, championIconUrl, championInitials } from "../src/analysis/championAssets"
import { ALL_CHAMPIONS } from "../src/analysis/championCatalog"

// Keep in sync with DATA_DRAGON_VERSION in src/analysis/championAssets.ts.
// Locke was introduced in Data Dragon 16.13.1, so anything older 403s for his icon.
const DATA_DRAGON_VERSION = "16.16.1"
const MIN_VERSION_WITH_LOCKE = [16, 13, 1] as const

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

  it("keeps the remaining special-case mappings intact (regression guard)", () => {
    const expected: Record<string, string> = {
      "Aurelion Sol": "AurelionSol",
      "Bel'Veth": "Belveth",
      "Kha'Zix": "Khazix",
      "Kog'Maw": "KogMaw",
      LeBlanc: "Leblanc",
      "Lee Sin": "LeeSin",
      "Master Yi": "MasterYi",
      "Miss Fortune": "MissFortune",
      "Rek'Sai": "RekSai",
      "Tahm Kench": "TahmKench",
      "Xin Zhao": "XinZhao",
    }

    for (const [name, id] of Object.entries(expected)) {
      expect(championImageId(name)).toBe(id)
    }
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

  it("builds the exact Data Dragon URL for Locke on a version that actually ships him", () => {
    expect(championIconUrl("Locke")).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/Locke.png`,
    )
  })
})

describe("Data Dragon version pinning", () => {
  // Regression guard: Locke (and any future champion) only exists from a certain
  // patch onwards. A downgrade below that patch silently breaks his icon and
  // drops the UI back to the initials placeholder.
  it("pins a version that is new enough to contain Locke", () => {
    const url = championIconUrl("Aatrox")
    const match = url.match(/\/cdn\/(\d+)\.(\d+)\.(\d+)\/img\/champion\//)
    expect(match).not.toBeNull()

    const pinned = [Number(match![1]), Number(match![2]), Number(match![3])] as const
    expect(pinned.every((part) => Number.isInteger(part))).toBe(true)

    const isAtLeastMinimum =
      pinned[0] > MIN_VERSION_WITH_LOCKE[0] ||
      (pinned[0] === MIN_VERSION_WITH_LOCKE[0] &&
        (pinned[1] > MIN_VERSION_WITH_LOCKE[1] ||
          (pinned[1] === MIN_VERSION_WITH_LOCKE[1] && pinned[2] >= MIN_VERSION_WITH_LOCKE[2])))

    expect(isAtLeastMinimum).toBe(true)
  })

  it("uses one and the same pinned version for every champion URL", () => {
    for (const champion of ["Aatrox", "Locke", "Kai'Sa", "Wukong", "Nunu & Willump"]) {
      expect(championIconUrl(champion)).toContain(`/cdn/${DATA_DRAGON_VERSION}/img/champion/`)
    }
  })
})

describe("championImageId across the full champion catalog", () => {
  it("covers a non-trivial catalog", () => {
    expect(ALL_CHAMPIONS.length).toBeGreaterThan(150)
  })

  it("produces a non-empty, URL-safe id for every champion in ALL_CHAMPIONS", () => {
    const offenders = ALL_CHAMPIONS.filter((champion) => {
      const id = championImageId(champion)
      return id.length === 0 || !/^[A-Za-z0-9]+$/.test(id)
    })

    expect(offenders).toEqual([])
  })

  it("builds an encodable Data Dragon URL for every champion in ALL_CHAMPIONS", () => {
    const offenders = ALL_CHAMPIONS.filter((champion) => {
      const url = championIconUrl(champion)
      return (
        url !== encodeURI(url) ||
        !url.startsWith(`https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/`) ||
        !url.endsWith(".png")
      )
    })

    expect(offenders).toEqual([])
  })

  it("never maps two different champions to the same Data Dragon id", () => {
    const seen = new Map<string, string>()
    const collisions: string[] = []

    for (const champion of ALL_CHAMPIONS) {
      const id = championImageId(champion)
      const previous = seen.get(id)
      if (previous !== undefined) {
        collisions.push(`${previous} + ${champion} -> ${id}`)
      } else {
        seen.set(id, champion)
      }
    }

    expect(collisions).toEqual([])
  })

  it("includes Locke in the catalog it renders icons for", () => {
    expect(ALL_CHAMPIONS).toContain("Locke")
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
