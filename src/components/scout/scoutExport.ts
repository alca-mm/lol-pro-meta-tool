/**
 * Plain-text export of a scout session — the payload behind
 * `scout_export_copy`, plus the clipboard write itself.
 *
 * `buildScoutExportText()` is pure and deterministic (no clock, no DOM), which
 * is what makes the exact wording of the export unit-testable in the Node test
 * suite. `copyTextToClipboard()` is the only DOM-touching function here and it
 * resolves to `false` instead of throwing, so the caller can show
 * `scout_export_failed`.
 *
 * HONESTY RULE OF THIS FILE: the text states only what is in the analysis.
 * Every lineup section is skipped entirely when `analysis.lineup === null` —
 * without a lineup the engine claimed no roles, and printing "gegen Mid" from
 * the parser's guess would sell that guess as a plan. Likewise a ban never
 * gains a target player or lane that the engine did not attach to it.
 */

import type { ScoutAnalysisResult } from "../../scout/analysis"
import type {
  BanCandidate,
  ChampionSignal,
  ScoutLineupSummary,
  ScoutPlayerId,
  ScoutReason,
} from "../../scout/types"
import {
  banRoleLabels,
  formatScoutNumber,
  scoutConfidenceKey,
  scoutMembershipKey,
  scoutRoleKey,
  scoutRoleLabel,
  scoutSubstituteSlotKey,
  translateScoutReason,
  translateScoutWarning,
  type ScoutTranslate,
} from "./scoutUiHelpers"

export interface ScoutExportOptions {
  /** How many bans the team section lists. */
  maxBans?: number
  /** How many strongest picks are listed per player. */
  maxPicksPerPlayer?: number
  /**
   * Whether substitutes were scored in this analysis. Passed in rather than
   * guessed: the analysis result only shows the *consequences* of the toggle
   * (a `substitute_risk_active` warning appears solely when a substitute
   * actually had data), so deriving it would misreport an empty bench.
   */
  includeSubstitutes?: boolean
}

function formatSignal(t: ScoutTranslate, signal: ChampionSignal): string {
  const parts = [`${signal.games} ${t("common_games")}`]
  if (signal.winrate !== null) parts.push(`${formatScoutNumber(signal.winrate)}%`)
  return `${signal.championName} (${parts.join(", ")})`
}

function formatReasons(t: ScoutTranslate, reasons: readonly ScoutReason[]): string {
  return reasons.map((reason) => translateScoutReason(t, reason)).join(" ")
}

/**
 * `1. Karma gegen Mid — Gegner#EUW [Hoch] — Begründung…`
 *
 * The lane suffix hangs directly off the champion name (the i18n texts are
 * lower-case and unpunctuated for exactly that), the target player follows,
 * then the confidence, then every reason the engine gave.
 */
function formatCandidate(
  t: ScoutTranslate,
  candidate: BanCandidate,
  index: number,
  displayNameById: ReadonlyMap<ScoutPlayerId, string>,
): string[] {
  const lanes = banRoleLabels(t, candidate)
  const champion = lanes.length > 0 ? `${candidate.championName} ${lanes.join(" ")}` : candidate.championName

  const head: string[] = [`${index + 1}. ${champion}`]
  const targetName =
    candidate.targetPlayerId === null ? undefined : displayNameById.get(candidate.targetPlayerId)
  if (targetName !== undefined) head.push(targetName)
  head.push(`[${t(scoutConfidenceKey(candidate.confidence))}]`)

  const lines = [head.join(" — ")]

  const reasons = formatReasons(t, candidate.reasons)
  if (reasons.length > 0) lines.push(`   ${reasons}`)
  if (candidate.substituteOnly) lines.push(`   ! ${t("scout_banSubstituteOnly")}`)

  return lines
}

/**
 * The starting five, the bench and whether the five are complete.
 *
 * An empty seat is printed as `scout_lineupEmptySlot` rather than omitted: a
 * plan that silently lists four lanes reads as if the fifth were covered.
 */
function lineupLines(
  t: ScoutTranslate,
  lineup: ScoutLineupSummary,
  displayNameById: ReadonlyMap<ScoutPlayerId, string>,
  includeSubstitutes: boolean,
): string[] {
  const lines: string[] = []
  lines.push(t("scout_lineupTitle"))

  lines.push(`${t("scout_startingFive")}:`)
  for (const row of lineup.starters) {
    const name = row.playerId === null ? null : (displayNameById.get(row.playerId) ?? null)
    lines.push(`- ${t(scoutRoleKey(row.slot))}: ${name ?? t("scout_lineupEmptySlot")}`)
  }

  lines.push(
    lineup.isStartingFiveComplete ? t("scout_lineupComplete") : t("scout_lineupIncomplete"),
  )

  const benchOccupied = lineup.substitutes.some((row) => row.playerId !== null)
  if (benchOccupied) {
    lines.push("")
    lines.push(`${t("scout_substitutes")}:`)
    for (const row of lineup.substitutes) {
      if (row.playerId === null) continue
      const name = displayNameById.get(row.playerId)
      if (name === undefined) continue
      lines.push(`- ${t(scoutSubstituteSlotKey(row.slot))}: ${name}`)
    }
    // Only stated when true. "Substitutes are not counted" is the default and
    // needs no line; claiming they *are* counted when they are not would be
    // the dangerous direction.
    if (includeSubstitutes) lines.push(`  (${t("scout_includeSubstitutes")})`)
  }

  if (lineup.unassignedPlayerIds.length > 0) {
    lines.push("")
    lines.push(`${t("scout_unassigned")}:`)
    for (const playerId of lineup.unassignedPlayerIds) {
      const name = displayNameById.get(playerId)
      if (name !== undefined) lines.push(`- ${name}`)
    }
  }

  return lines
}

/**
 * The clipboard payload: header, lineup, team ban plan, then one block per
 * player with the strongest picks, the weaknesses and the confidence, and
 * finally every warning the engine raised.
 *
 * Pure and deterministic — no clock, no DOM — so the exact text is unit-tested.
 */
export function buildScoutExportText(
  t: ScoutTranslate,
  analysis: ScoutAnalysisResult,
  options?: ScoutExportOptions,
): string {
  const maxBans = options?.maxBans ?? 5
  const maxPicks = options?.maxPicksPerPlayer ?? 3
  const includeSubstitutes = options?.includeSubstitutes === true

  const displayNameById = new Map<ScoutPlayerId, string>(
    analysis.players.map((player) => [player.playerId, player.displayName]),
  )

  const lines: string[] = []
  lines.push(t("scout_export_header"))
  lines.push(`${t("scout_confidence")}: ${t(scoutConfidenceKey(analysis.confidence))}`)
  lines.push(t("scout_sourceHint"))
  lines.push("")

  if (analysis.lineup !== null) {
    lines.push(...lineupLines(t, analysis.lineup, displayNameById, includeSubstitutes))
    lines.push("")
  }

  lines.push(t("scout_teamPlanTitle"))
  const bans = analysis.banPlan.prioritizedBans.slice(0, maxBans)
  if (bans.length === 0) lines.push(t("scout_teamPlanEmpty"))
  else {
    bans.forEach((candidate, index) =>
      lines.push(...formatCandidate(t, candidate, index, displayNameById)),
    )
  }

  for (const player of analysis.players) {
    lines.push("")

    // With a lineup the declared slot leads; without one the parsed role is all
    // there is — and then it is printed as the guess it is, which is what the
    // honesty rule at the top of this file demands. The membership is only
    // appended when a lineup exists at all.
    const role = scoutRoleLabel(t, player.lineup.starterSlot, player.role).text
    const roleParts = [role]
    if (analysis.lineup !== null) roleParts.push(t(scoutMembershipKey(player.lineup.membership)))

    lines.push(
      `${player.displayName} (${roleParts.join(" · ")}) — ${t("scout_confidence")}: ${t(
        scoutConfidenceKey(player.confidence),
      )}`,
    )

    const picks = player.signals.slice(0, maxPicks)
    if (picks.length === 0) {
      lines.push(`${t("scout_topThreats")}: ${t("scout_noAnalysis")}`)
    } else {
      lines.push(`${t("scout_topThreats")}:`)
      for (const signal of picks) {
        const reasons = formatReasons(t, signal.reasons)
        const row = `- ${formatSignal(t, signal)}`
        lines.push(reasons.length > 0 ? `${row} — ${reasons}` : row)
      }
    }

    if (player.weaknesses.length > 0) {
      lines.push(
        `${t("scout_weaknesses")}: ${player.weaknesses
          .map((signal) => formatSignal(t, signal))
          .join(", ")}`,
      )
    }
  }

  // Every warning the engine raised — including the lineup ones
  // (`incomplete_starting_five`, `player_without_lineup_role`,
  // `offrole_data_present`, `substitute_risk_active`). They are the caveats of
  // everything above, so they must travel with it.
  if (analysis.warnings.length > 0) {
    lines.push("")
    for (const warning of analysis.warnings) lines.push(`! ${translateScoutWarning(t, warning)}`)
  }

  return lines.join("\n")
}

/**
 * Copy to the clipboard with a `document.execCommand` fallback for browsers
 * that expose no `navigator.clipboard` (or refuse it outside a secure context).
 * Resolves to `false` instead of throwing — the caller shows
 * `scout_export_failed`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    if (typeof document === "undefined") return false
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
