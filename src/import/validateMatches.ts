import type { Match } from "../domain/types"

const VALID_ROLES = new Set(["top", "jungle", "mid", "bot", "support"])
const VALID_SIDES = new Set(["blue", "red"])

export function validateMatches(raw: unknown[]): Match[] {
  const valid: Match[] = []

  for (const item of raw) {
    const m = item as Record<string, unknown>
    const id = typeof m.matchId === "string" ? m.matchId : "(unknown)"

    if (!m.matchId || !m.date || !m.tournament || !m.patch || !m.region) {
      console.warn(`Match ${id}: fehlende Pflichtfelder`)
      continue
    }
    if (m.winningTeam !== m.blueTeam && m.winningTeam !== m.redTeam) {
      console.warn(`Match ${id}: winningTeam ist weder blueTeam noch redTeam`)
      continue
    }
    if (!Array.isArray(m.picks)) {
      console.warn(`Match ${id}: picks ist kein Array`)
      continue
    }

    let invalid = false
    for (const pick of m.picks as Record<string, unknown>[]) {
      if (!VALID_ROLES.has(pick.role as string)) {
        console.warn(`Match ${id}: ungültige Rolle "${pick.role}"`)
        invalid = true
        break
      }
      if (!VALID_SIDES.has(pick.side as string)) {
        console.warn(`Match ${id}: ungültige Side "${pick.side}"`)
        invalid = true
        break
      }
    }
    if (invalid) continue

    if (Array.isArray(m.bans)) {
      for (const ban of m.bans as Record<string, unknown>[]) {
        if (!VALID_SIDES.has(ban.side as string)) {
          console.warn(`Match ${id}: Ban mit ungültiger Side "${ban.side}"`)
          invalid = true
          break
        }
      }
    }
    if (invalid) continue

    valid.push(m as unknown as Match)
  }

  return valid
}
