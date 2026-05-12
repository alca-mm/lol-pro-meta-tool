import type { Match } from "../domain/types"
import { validateMatches } from "./validateMatches"

export function parseMatches(raw: unknown): Match[] {
  if (!Array.isArray(raw)) {
    console.warn("parseMatches: Eingabe ist kein Array")
    return []
  }
  return validateMatches(raw)
}
