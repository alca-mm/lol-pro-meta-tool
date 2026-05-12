import { useState } from "react"
import type { Match } from "../domain/types"
import { comparePatchs, getAvailablePatches } from "../analysis/patchComparison"

interface PatchComparisonViewProps {
  matches: Match[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

function delta(n: number): string {
  const s = (n * 100).toFixed(1)
  return n > 0 ? `+${s}%` : `${s}%`
}

export function PatchComparisonView({ matches }: PatchComparisonViewProps) {
  const patches = getAvailablePatches(matches)

  const [patch1, setPatch1] = useState<string>(patches[0] ?? "")
  const [patch2, setPatch2] = useState<string>(patches[1] ?? "")

  if (patches.length < 2) {
    return <p className="empty-state">Mindestens 2 verschiedene Patches nötig für Vergleich.</p>
  }

  const entries = patch1 && patch2 && patch1 !== patch2
    ? comparePatchs(matches, patch1, patch2)
    : []

  return (
    <div>
      <div className="patch-selectors">
        <label htmlFor="patch1-sel">Patch 1</label>
        <select
          id="patch1-sel"
          value={patch1}
          onChange={(e) => setPatch1(e.target.value)}
        >
          {patches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <label htmlFor="patch2-sel">Patch 2</label>
        <select
          id="patch2-sel"
          value={patch2}
          onChange={(e) => setPatch2(e.target.value)}
        >
          {patches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {patch1 === patch2 ? (
        <p className="empty-state">Bitte zwei unterschiedliche Patches auswählen.</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">Keine Daten für diesen Patch-Vergleich.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th><span className="sort-btn">Champion</span></th>
                <th><span className="sort-btn">Presence {patch1}</span></th>
                <th><span className="sort-btn">Presence {patch2}</span></th>
                <th><span className="sort-btn">Δ Presence</span></th>
                <th><span className="sort-btn">Δ Pickrate</span></th>
                <th><span className="sort-btn">Δ Banrate</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 30).map((e) => (
                <tr key={e.championName}>
                  <td>{e.championName}</td>
                  <td>{pct(e.presencePatch1)}</td>
                  <td>{pct(e.presencePatch2)}</td>
                  <td className={e.presenceDelta > 0 ? "score-pos" : e.presenceDelta < 0 ? "score-neg" : ""}>
                    {delta(e.presenceDelta)}
                  </td>
                  <td className={e.pickRateDelta > 0 ? "score-pos" : e.pickRateDelta < 0 ? "score-neg" : ""}>
                    {delta(e.pickRateDelta)}
                  </td>
                  <td className={e.banRateDelta > 0 ? "score-pos" : e.banRateDelta < 0 ? "score-neg" : ""}>
                    {delta(e.banRateDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
