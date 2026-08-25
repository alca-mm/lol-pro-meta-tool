import { Fragment, useState } from "react"
import type { ChampionStats, SynergyStats, MatchupStats, LaneMatchupStat } from "../domain/types"
import { useTranslation } from "../i18n/LanguageContext"
import type { TranslationKey } from "../i18n/types"
import { ChampionDetail } from "./ChampionDetail"
import { nextChampionSelection } from "./championSelection"

type SortKey = "championName" | "picks" | "bans" | "pickRate" | "banRate" | "presence" | "winRate" | "draftPriorityScore"

interface ChampionStatsTableProps {
  stats: ChampionStats[]
  selectedChampion: string | null
  onSelectChampion: (name: string | null) => void
  synergies: SynergyStats[]
  matchups: MatchupStats[]
  laneMatchups: LaneMatchupStat[]
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function ChampionStatsTable({ stats, selectedChampion, onSelectChampion, synergies, matchups, laneMatchups }: ChampionStatsTableProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<SortKey>("draftPriorityScore")
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...stats].sort((a, b) => {
    const aVal = sortKey === "winRate" ? (a.winRate ?? -1) : a[sortKey]
    const bVal = sortKey === "winRate" ? (b.winRate ?? -1) : b[sortKey]
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })

  /*
   * `aria-sort` BELONGS ON THE `<th>`, NOT ON THE BUTTON INSIDE IT.
   *
   * It used to sit on the `<button>`, where it compiled, rendered and did
   * nothing: ARIA only defines `aria-sort` for `columnheader`, `rowheader` and
   * `gridcell`, and a button maps to role `button`. Assistive technology drops
   * it there, so the sorted column was not announced as sorted at all - the
   * arrow glyph was the only signal, and that one is visual. A `<th>` inside
   * `<thead><tr>` maps to `columnheader` on its own, so moving the attribute is
   * the whole fix.
   *
   * TypeScript cannot catch this: `aria-sort` is part of `AriaAttributes`,
   * which both `ButtonHTMLAttributes` and `ThHTMLAttributes` extend. It
   * typechecked on the wrong element for as long as it was there.
   *
   * INACTIVE COLUMNS KEEP `"none"` rather than dropping the attribute. Both are
   * valid, and `"none"` is what this component already meant to say before the
   * attribute was misplaced; relocating it is the fix, redesigning what it says
   * is not. Exactly one header carries `ascending`/`descending` at a time,
   * because `active` is a comparison against the single `sortKey`.
   *
   * The non-sortable "confidence" header carries no `aria-sort` at all, which
   * is correct: it cannot be sorted, so it has no sort state to report.
   */
  function colBtn(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th aria-sort={active ? (sortAsc ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className={`sort-btn${active ? " sort-active" : ""}`}
          onClick={() => handleSort(key)}
        >
          {label}{active ? (sortAsc ? " ▲" : " ▼") : ""}
        </button>
      </th>
    )
  }

  if (sorted.length === 0) {
    return <p className="empty-state">{t("tbl_noChampions")}</p>
  }

  return (
    <div className="table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            {colBtn("championName", "Champion")}
            {colBtn("picks", "Picks")}
            {colBtn("bans", "Bans")}
            {colBtn("pickRate", "Pickrate")}
            {colBtn("banRate", "Banrate")}
            {colBtn("presence", "Presence")}
            {colBtn("winRate", "Winrate")}
            {colBtn("draftPriorityScore", t("tbl_draftPriority"))}
            <th>{t("tbl_confidence")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            /*
              A KEYED `<Fragment>`, NOT THE `<>` SHORTHAND.

              Each iteration returns TWO sibling rows, so the thing React has to
              identify per list entry is the pair, not one of its halves. The
              shorthand cannot take a `key`, so the key sat on the inner `<tr>`
              instead - which does not satisfy React at all: the list children
              are the fragments, and every one of them was keyless. React warned
              on every render and fell back to index-based reconciliation, so
              re-sorting the table re-used the wrong rows and could carry an open
              detail row over to a different champion.

              The inner keys are gone with it. Inside a fragment the two rows are
              static siblings, not a list, so neither needs one; leaving them
              would be a second, competing identity for the same entry.
            */
            <Fragment key={s.championName}>
              {/* The row stays clickable for the mouse: a wide stats row is
                  a big, forgiving target, and taking that away would be a
                  regression for everyone who already uses it. It is simply no
                  longer the ONLY way in, which is what made it a trap. */}
              <tr
                className={s.championName === selectedChampion ? "row-selected" : ""}
                onClick={() => onSelectChampion(nextChampionSelection(selectedChampion, s.championName))}
                style={{ cursor: "pointer" }}
              >
                <td>
                  {/*
                    THE KEYBOARD PATH. Until now the only way to expand a
                    champion was clicking the `<tr>`, and a table row is not
                    focusable, so this table was unreachable without a mouse.

                    A real `<button>` rather than `tabIndex` plus `onKeyDown` on
                    the row: the browser then supplies focus, Enter, Space and
                    the "button" announcement for free, and there is no
                    hand-written key handling to get wrong. It also keeps the
                    table markup intact, which `role="button"` on the `<tr>`
                    would not - that would have replaced the row's own semantics
                    and broken table navigation for screen readers.

                    `aria-expanded` because this IS a disclosure: the detail row
                    below appears and disappears with it. No `aria-controls`,
                    following the same call MatchTable.tsx made - it would need a
                    generated id per row, and the relationship is already obvious
                    from the reading order.
                  */}
                  <button
                    type="button"
                    className="champion-row-toggle"
                    aria-expanded={s.championName === selectedChampion}
                    onClick={(event) => {
                      // ONE CLICK, ONE DISPATCH. The button sits inside the row,
                      // so without this a click runs the button handler and then
                      // bubbles into the row handler. Keyboard activation bubbles
                      // the same way.
                      //
                      // BE PRECISE ABOUT WHAT THAT COSTS TODAY, because the
                      // tempting claim is wrong: it does NOT currently cancel
                      // itself. `App.tsx` passes `setSelectedChampion` straight
                      // through, both handlers close over the same
                      // `selectedChampion` of the same render, and React batches
                      // the pair - so the second dispatch sets the same value
                      // again rather than toggling back. The button works either
                      // way right now.
                      //
                      // It stays because the margin is one line wide. The moment
                      // the parent uses a functional updater
                      // (`setSelectedChampion(prev => next(prev, name))`), which
                      // is the obvious refactor, the second dispatch sees the
                      // first one's result and undoes it - and the button goes
                      // dead with nothing on screen to explain why. Same for any
                      // parent that counts, logs or appends per call.
                      event.stopPropagation()
                      onSelectChampion(nextChampionSelection(selectedChampion, s.championName))
                    }}
                  >
                    {s.championName}
                  </button>
                </td>
                <td>{s.picks}</td>
                <td>{s.bans}</td>
                <td>{pct(s.pickRate)}</td>
                <td>{pct(s.banRate)}</td>
                <td>{pct(s.presence)}</td>
                <td>{s.winRate !== null ? pct(s.winRate) : "—"}</td>
                <td className="priority-score">{s.draftPriorityScore.toFixed(3)}</td>
                <td className="sample-label">{t(s.sampleSizeLabel as TranslationKey)}</td>
              </tr>
              {s.championName === selectedChampion && (
                <tr>
                  <td colSpan={9} style={{ padding: 0 }}>
                    <ChampionDetail
                      stats={s}
                      synergies={synergies}
                      matchups={matchups}
                      laneMatchups={laneMatchups}
                      onClose={() => onSelectChampion(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
