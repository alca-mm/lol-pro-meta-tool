import { describe, it, expect } from "vitest"
import { mapOracleElixirCsvToMatches } from "../src/import/oracleElixirMapper"

function makeRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    gameid: "g1",
    date: "2024-01-01",
    league: "LEC",
    split: "Spring",
    patch: "14.4",
    side: "Blue",
    position: "top",
    playername: "Player1",
    teamname: "TeamA",
    champion: "Garen",
    result: "1",
    ban1: "Zed",
    ban2: "Yasuo",
    ban3: "",
    ban4: "",
    ban5: "",
    ...overrides,
  }
}

const blueTeam = (gameid = "g1") => [
  makeRow({ gameid, side: "Blue", position: "top", champion: "Garen", teamname: "TeamA", result: "1" }),
  makeRow({ gameid, side: "Blue", position: "jng", champion: "Vi", teamname: "TeamA", result: "1" }),
  makeRow({ gameid, side: "Blue", position: "mid", champion: "Orianna", teamname: "TeamA", result: "1" }),
  makeRow({ gameid, side: "Blue", position: "bot", champion: "Jinx", teamname: "TeamA", result: "1" }),
  makeRow({ gameid, side: "Blue", position: "sup", champion: "Thresh", teamname: "TeamA", result: "1" }),
]

const redTeam = (gameid = "g1") => [
  makeRow({ gameid, side: "Red", position: "top", champion: "Darius", teamname: "TeamB", result: "0", ban1: "Caitlyn" }),
  makeRow({ gameid, side: "Red", position: "jng", champion: "Hecarim", teamname: "TeamB", result: "0" }),
  makeRow({ gameid, side: "Red", position: "mid", champion: "Syndra", teamname: "TeamB", result: "0" }),
  makeRow({ gameid, side: "Red", position: "bot", champion: "Caitlyn", teamname: "TeamB", result: "0" }),
  makeRow({ gameid, side: "Red", position: "sup", champion: "Lulu", teamname: "TeamB", result: "0" }),
]

describe("mapOracleElixirCsvToMatches", () => {
  const fullGame = [...blueTeam(), ...redTeam()]

  it("creates one match per gameid", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches).toHaveLength(1)
  })

  it("identifies blue and red teams correctly", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches[0].blueTeam).toBe("TeamA")
    expect(matches[0].redTeam).toBe("TeamB")
  })

  it("identifies winner correctly when blue wins", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches[0].winningTeam).toBe("TeamA")
  })

  it("identifies winner correctly when red wins", () => {
    const redWins = [
      ...blueTeam().map(r => ({ ...r, result: "0" })),
      ...redTeam().map(r => ({ ...r, result: "1" })),
    ]
    const { matches } = mapOracleElixirCsvToMatches(redWins)
    expect(matches[0].winningTeam).toBe("TeamB")
  })

  it("creates 10 picks from player rows", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches[0].picks).toHaveLength(10)
  })

  it("maps jng position to jungle role", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    const jungle = matches[0].picks.find(p => p.championName === "Vi")
    expect(jungle?.role).toBe("jungle")
  })

  it("maps sup position to support role", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    const support = matches[0].picks.find(p => p.championName === "Thresh")
    expect(support?.role).toBe("support")
  })

  it("skips team-aggregate rows (position=team)", () => {
    const withTeamRow = [
      ...fullGame,
      makeRow({ position: "team", champion: "", teamname: "TeamA" }),
    ]
    const { matches } = mapOracleElixirCsvToMatches(withTeamRow)
    expect(matches[0].picks).toHaveLength(10)
  })

  it("creates bans from ban columns", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    const banNames = matches[0].bans.map(b => b.championName)
    expect(banNames).toContain("Zed")
    expect(banNames).toContain("Yasuo")
  })

  it("skips incomplete game and adds warning", () => {
    const incomplete = blueTeam() // only blue side, no red
    const { matches, warnings, skipped } = mapOracleElixirCsvToMatches(incomplete)
    expect(matches).toHaveLength(0)
    expect(skipped).toBe(1)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it("warns when bans are missing", () => {
    const noBans = fullGame.map(r => ({ ...r, ban1: "", ban2: "", ban3: "", ban4: "", ban5: "" }))
    const { matches, warnings } = mapOracleElixirCsvToMatches(noBans)
    expect(matches).toHaveLength(1)
    expect(warnings.some(w => w.includes("Ban") || w.includes("ban"))).toBe(true)
  })

  it("groups multiple games correctly", () => {
    const game2 = [...blueTeam("g2"), ...redTeam("g2")]
    const { matches } = mapOracleElixirCsvToMatches([...fullGame, ...game2])
    expect(matches).toHaveLength(2)
    expect(new Set(matches.map(m => m.matchId)).size).toBe(2)
  })

  it("normalizes patch (removes leading zero)", () => {
    const rows = fullGame.map(r => ({ ...r, patch: "14.04" }))
    const { matches } = mapOracleElixirCsvToMatches(rows)
    expect(matches[0].patch).toBe("14.4")
  })

  it("sets region to league value", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches[0].region).toBe("LEC")
  })

  it("constructs tournament from league and split", () => {
    const { matches } = mapOracleElixirCsvToMatches(fullGame)
    expect(matches[0].tournament).toContain("LEC")
    expect(matches[0].tournament).toContain("Spring")
  })
})
