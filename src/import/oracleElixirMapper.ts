import type { Match, ChampionPick, ChampionBan, Side, Role } from "../domain/types"

function mapSide(raw: string): Side | null {
  const s = raw.toLowerCase().trim()
  if (s === "blue") return "blue"
  if (s === "red") return "red"
  return null
}

function mapPosition(raw: string): Role | null {
  const map: Record<string, Role> = {
    top: "top",
    jng: "jungle",
    jungle: "jungle",
    mid: "mid",
    bot: "bot",
    adc: "bot",
    sup: "support",
    support: "support",
  }
  return map[raw.toLowerCase().trim()] ?? null
}

function normalizePatch(raw: string): string {
  const parts = raw.trim().split(".")
  if (parts.length < 2) return raw.trim()
  const major = parseInt(parts[0], 10)
  const minor = parseInt(parts[1], 10)
  if (isNaN(major) || isNaN(minor)) return raw.trim()
  return `${major}.${minor}`
}

function extractDate(raw: string): string {
  return raw.trim().split(" ")[0] ?? raw.trim()
}

function isValidName(s: string): boolean {
  return s.trim().length > 0 && s.toLowerCase() !== "nan" && s !== "0"
}

interface PlayerRow {
  gameid: string
  date: string
  league: string
  split: string
  patch: string
  side: Side
  role: Role
  playerName: string
  teamName: string
  champion: string
  won: boolean
  rawBans: string[]
}

export interface MapperResult {
  matches: Match[]
  warnings: string[]
  skipped: number
}

export function mapOracleElixirCsvToMatches(rows: Record<string, string>[]): MapperResult {
  const warnings: string[] = []
  let skipped = 0

  // Parse each row into a PlayerRow (skip team-aggregate rows and invalid rows)
  const playerRows: PlayerRow[] = []

  for (const row of rows) {
    const gameid = row.gameid?.trim()
    if (!gameid || gameid === "") continue

    const position = row.position?.toLowerCase().trim()
    if (position === "team") continue // skip team-aggregate rows

    const side = mapSide(row.side ?? "")
    if (!side) continue

    const role = mapPosition(position ?? "")
    if (!role) continue

    const champion = row.champion?.trim()
    if (!champion || !isValidName(champion)) continue

    const teamName = row.teamname?.trim() ?? ""
    if (!teamName || !isValidName(teamName)) continue

    playerRows.push({
      gameid,
      date: extractDate(row.date ?? ""),
      league: row.league?.trim() ?? "",
      split: row.split?.trim() ?? "",
      patch: normalizePatch(row.patch ?? ""),
      side,
      role,
      playerName: row.playername?.trim() ?? "",
      teamName,
      champion,
      won: row.result === "1",
      rawBans: [row.ban1, row.ban2, row.ban3, row.ban4, row.ban5]
        .map((b) => (b ?? "").trim())
        .filter((b) => b && isValidName(b)),
    })
  }

  // Group by gameid
  const gameMap = new Map<string, PlayerRow[]>()
  for (const pr of playerRows) {
    if (!gameMap.has(pr.gameid)) gameMap.set(pr.gameid, [])
    gameMap.get(pr.gameid)!.push(pr)
  }

  const matches: Match[] = []

  for (const [gameid, gameRows] of gameMap) {
    const blueRows = gameRows.filter((r) => r.side === "blue")
    const redRows = gameRows.filter((r) => r.side === "red")

    if (blueRows.length === 0 || redRows.length === 0) {
      warnings.push(`Game ${gameid}: unvollständig (blue=${blueRows.length}, red=${redRows.length}), übersprungen`)
      skipped++
      continue
    }

    // Determine team names from first row of each side
    const blueTeam = blueRows[0].teamName
    const redTeam = redRows[0].teamName

    if (!isValidName(blueTeam) || !isValidName(redTeam)) {
      warnings.push(`Game ${gameid}: ungültige Team-Namen, übersprungen`)
      skipped++
      continue
    }

    // Determine winner: if blue side won, winningTeam = blueTeam
    const blueWon = blueRows[0].won
    const winningTeam = blueWon ? blueTeam : redTeam

    // Build picks
    const picks: ChampionPick[] = gameRows.map((r) => ({
      championName: r.champion,
      team: r.teamName,
      side: r.side,
      role: r.role,
      playerName: r.playerName || undefined,
      won: r.won,
    }))

    // Build bans from first blue/red row (bans are per-team in the CSV)
    const bans: ChampionBan[] = []
    const blueBans = blueRows[0]?.rawBans ?? []
    const redBans = redRows[0]?.rawBans ?? []

    for (let i = 0; i < blueBans.length; i++) {
      bans.push({ championName: blueBans[i], team: blueTeam, side: "blue", banOrder: i + 1 })
    }
    for (let i = 0; i < redBans.length; i++) {
      bans.push({ championName: redBans[i], team: redTeam, side: "red", banOrder: i + 1 })
    }

    const firstRow = blueRows[0]
    const tournament = [firstRow.league, firstRow.split].filter(Boolean).join(" ") || firstRow.league

    if (bans.length === 0) {
      warnings.push(`Game ${gameid}: keine Ban-Daten gefunden`)
    }

    matches.push({
      matchId: gameid,
      date: firstRow.date,
      tournament,
      patch: firstRow.patch,
      region: firstRow.league,
      blueTeam,
      redTeam,
      winningTeam,
      picks,
      bans,
    })
  }

  return { matches, warnings, skipped }
}
