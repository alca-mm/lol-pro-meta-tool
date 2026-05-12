import { useState, useMemo } from "react"
import { FilterProvider, useFilters } from "./context/FilterContext"
import { parseMatches } from "./import/parseMatches"
import { applyFilters } from "./analysis/filters"
import { calculateChampionStats, primaryRole } from "./analysis/championStats"
import { calculateSynergyStats } from "./analysis/synergyStats"
import { calculateMatchupStats } from "./analysis/matchupStats"
import { calculateRoleStats } from "./analysis/roleStats"
import { calculateRoleMatchups } from "./analysis/roleMatchups"
import { Filters } from "./components/Filters"
import { Dashboard } from "./components/Dashboard"
import { ChampionStatsTable } from "./components/ChampionStatsTable"
import { ChampionDetail } from "./components/ChampionDetail"
import { SynergyTable } from "./components/SynergyTable"
import { MatchupTable } from "./components/MatchupTable"
import { DataSourceInfo } from "./components/DataSourceInfo"
import { RoleStatsTable } from "./components/RoleStatsTable"
import { RoleMatchupTable } from "./components/RoleMatchupTable"
import { PatchComparisonView } from "./components/PatchComparisonView"
import { DraftHelper } from "./components/DraftHelper"
import sampleData from "./data/sampleMatches.json"
import importedDataRaw from "./data/importedMatches.json"

const importedMatches = parseMatches(importedDataRaw as unknown)
const sampleMatches = parseMatches(sampleData)
const isUsingSampleData = importedMatches.length === 0
const allMatches = isUsingSampleData ? sampleMatches : importedMatches

type TabId = "champions" | "draft" | "synergies" | "matchups" | "roles" | "patches"

const TABS: { id: TabId; label: string }[] = [
    { id: "champions", label: "Champions" },
    { id: "draft", label: "Draft Helper" },
    { id: "synergies", label: "Synergien" },
    { id: "matchups", label: "Matchups" },
    { id: "roles", label: "Rollen" },
    { id: "patches", label: "Patches" },
]

function AppContent() {
    const { filters } = useFilters()
    const [selectedChampion, setSelectedChampion] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabId>("champions")
    const [filtersCollapsed, setFiltersCollapsed] = useState(false)

    const filteredMatches = useMemo(() => applyFilters(allMatches, filters), [filters])

    const championStats = useMemo(() => {
        const stats = calculateChampionStats(filteredMatches)
        return stats
            .filter((s) => s.picks >= filters.minPicks)
            .filter((s) => {
                if (!filters.role) return true
                return primaryRole(s) === filters.role
            })
    }, [filteredMatches, filters.minPicks, filters.role])

    const synergyStats = useMemo(() => calculateSynergyStats(filteredMatches), [filteredMatches])
    const matchupStats = useMemo(() => calculateMatchupStats(filteredMatches), [filteredMatches])
    const roleStats = useMemo(() => calculateRoleStats(filteredMatches), [filteredMatches])
    const roleMatchups = useMemo(() => calculateRoleMatchups(filteredMatches), [filteredMatches])

    const selectedStats = championStats.find((s) => s.championName === selectedChampion) ?? null

    return (
        <div className="app">
            <header className="app-header">
                <h1>LoL Pro Meta Tool</h1>
            </header>

            <DataSourceInfo isUsingSampleData={isUsingSampleData} matches={allMatches} />

            <div className={`app-body${filtersCollapsed ? " filters-collapsed" : ""}`}>
                <aside className="filters-shell">
                    <button
                        type="button"
                        className="filters-collapse-button"
                        onClick={() => setFiltersCollapsed((current) => !current)}
                        aria-expanded={!filtersCollapsed}
                    >
                        {filtersCollapsed ? "Filter anzeigen" : "Filter ausblenden"}
                    </button>

                    {!filtersCollapsed && <Filters matches={allMatches} />}
                </aside>

                <main className="app-main">
                    {filtersCollapsed && (
                        <button
                            type="button"
                            className="filters-floating-button"
                            onClick={() => setFiltersCollapsed(false)}
                        >
                            Filter anzeigen
                        </button>
                    )}

                    {allMatches.length === 0 ? (
                        <p className="empty-state error">Keine validen Matches in den Daten gefunden.</p>
                    ) : (
                        <>
                            <Dashboard
                                totalMatches={allMatches.length}
                                filteredMatches={filteredMatches.length}
                            />

                            <nav className="tab-nav" aria-label="Ansichten">
                                {TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`tab-btn${activeTab === tab.id ? " tab-active" : ""}`}
                                        onClick={() => setActiveTab(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </nav>

                            {activeTab === "champions" && (
                                <>
                                    <section className="section">
                                        <h2>Champion-Statistiken</h2>
                                        <ChampionStatsTable
                                            stats={championStats}
                                            selectedChampion={selectedChampion}
                                            onSelectChampion={setSelectedChampion}
                                        />
                                    </section>

                                    {selectedStats && (
                                        <section className="section">
                                            <ChampionDetail
                                                stats={selectedStats}
                                                synergies={synergyStats}
                                                matchups={matchupStats}
                                                onClose={() => setSelectedChampion(null)}
                                            />
                                        </section>
                                    )}
                                </>
                            )}

                            {activeTab === "draft" && (
                                <section className="section">
                                    <DraftHelper matches={filteredMatches} />
                                </section>
                            )}

                            {activeTab === "synergies" && (
                                <section className="section">
                                    <h2>Top Synergien</h2>
                                    <SynergyTable synergies={synergyStats} />
                                </section>
                            )}

                            {activeTab === "matchups" && (
                                <>
                                    <section className="section">
                                        <h2>Champion-Matchups (rollenagnostisch)</h2>
                                        <MatchupTable matchups={matchupStats} />
                                    </section>
                                    <section className="section">
                                        <h2>Matchups nach Rolle</h2>
                                        <RoleMatchupTable matchups={roleMatchups} />
                                    </section>
                                </>
                            )}

                            {activeTab === "roles" && (
                                <section className="section">
                                    <h2>Champion-Stats nach Rolle</h2>
                                    <RoleStatsTable stats={roleStats} filterRole={filters.role} />
                                </section>
                            )}

                            {activeTab === "patches" && (
                                <section className="section">
                                    <h2>Patch-Vergleich</h2>
                                    <PatchComparisonView matches={filteredMatches} />
                                </section>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}

export default function App() {
    return (
        <FilterProvider>
            <AppContent />
        </FilterProvider>
    )
}