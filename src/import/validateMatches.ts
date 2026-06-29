import type { Match } from "../domain/types"
import { isRecord } from "../lib/isRecord"

const VALID_ROLES = new Set(["top", "jungle", "mid", "bot", "support"])
const VALID_SIDES = new Set(["blue", "red"])

export function validateMatches(raw: unknown[]): Match[] {
  const valid: Match[] = []

  for (const item of raw) {
    if (!isRecord(item)) {
      console.warn("Match (unknown): ungültiges Element (kein Objekt)")
      continue
    }
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
    for (const rawPick of m.picks as unknown[]) {
      if (!isRecord(rawPick)) {
        console.warn(`Match ${id}: ungültiger Pick (kein Objekt)`)
        invalid = true
        break
      }
      const pick = rawPick as Record<string, unknown>
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
      for (const rawBan of m.bans as unknown[]) {
        if (!isRecord(rawBan)) {
          console.warn(`Match ${id}: ungültiger Ban (kein Objekt)`)
          invalid = true
          break
        }
        const ban = rawBan as Record<string, unknown>
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
