import { useState, useMemo, useEffect } from "react"
import { FilterProvider, useFilters } from "./context/FilterContext"
import { LanguageProvider, useTranslation } from "./i18n/LanguageContext"
import { AuthProvider } from "./auth/AuthContext"
import { TeamProvider } from "./teams/TeamContext"
import { UserMenu } from "./components/auth/UserMenu"
import { AuthPanel } from "./components/auth/AuthPanel"
import { TeamStatusPanel } from "./components/TeamStatusPanel"
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
import type { Match, SyncReport } from "./domain/types"

const DISCORD_INVITE_URL = "DISCORD_INVITE_HIER_EINSETZEN"

const sampleMatches = parseMatches(sampleData)

type TabId = "champions" | "draft" | "synergies" | "matchups" | "roles" | "patches"

function AppContent() {
    const { filters } = useFilters()
    const { t, lang, setLang } = useTranslation()
    const [selectedChampion, setSelectedChampion] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabId>("champions")
    const [filtersCollapsed, setFiltersCollapsed] = useState(false)
    const [authPanelOpen, setAuthPanelOpen] = useState(false)

    const [allMatches, setAllMatches] = useState<Match[]>(sampleMatches)
    const [isUsingSampleData, setIsUsingSampleData] = useState(true)
    const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const base = import.meta.env.BASE_URL

        fetch(`${base}data/importedMatches.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (cancelled) return
                const matches = parseMatches(data)
                if (matches.length > 0) {
                    setAllMatches(matches)
                    setIsUsingSampleData(false)
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        fetch(`${base}data/latest-sync-report.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (!cancelled) setSyncReport(data as SyncReport)
            })
            .catch(() => {})

        return () => {
            cancelled = true
        }
    }, [])

    const TABS: { id: TabId; label: string }[] = [
        { id: "champions", label: t("tab_champions") },
        { id: "draft", label: t("tab_draftHelper") },
        { id: "synergies", label: t("tab_synergies") },
        { id: "matchups", label: t("tab_matchups") },
        { id: "roles", label: t("tab_roles") },
        { id: "patches", label: t("tab_patches") },
    ]

    const filteredMatches = useMemo(() => applyFilters(allMatches, filters), [allMatches, filters])

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

    if (isLoading) {
        return (
            <div className="app">
                <header className="app-header">
                    <h1>Aatroxtool</h1>
                </header>
                <p className="loading-state">{t("app_loading")}</p>
            </div>
        )
    }

    return (
        <div className="app">
            <header className="app-header">
                <h1>Aatroxtool</h1>
                <div className="header-right" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div className="lang-toggle">
                        <button
                            type="button"
                            className={`lang-btn${lang === "de" ? " lang-active" : ""}`}
                            onClick={() => setLang("de")}
                            aria-pressed={lang === "de"}
                        >
                            DE
                        </button>
                        <button
                            type="button"
                            className={`lang-btn${lang === "en" ? " lang-active" : ""}`}
                            onClick={() => setLang("en")}
                            aria-pressed={lang === "en"}
                        >
                            EN
                        </button>
                    </div>
                    <a
                        href={DISCORD_INVITE_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="lang-btn"
                    >
                        {t("header_contact")}
                    </a>
                    <UserMenu onShowLogin={() => setAuthPanelOpen((prev) => !prev)} />
                </div>
            </header>

            {authPanelOpen && (
                <AuthPanel onClose={() => setAuthPanelOpen(false)} />
            )}

            <TeamStatusPanel />

            <DataSourceInfo
                isUsingSampleData={isUsingSampleData}
                matches={allMatches}
                syncReport={syncReport ?? undefined}
            />

            <div className={`app-body${filtersCollapsed ? " filters-collapsed" : ""}`}>
                <aside className="filters-shell">
                    <button
                        type="button"
                        className="filters-collapse-button"
                        onClick={() => setFiltersCollapsed((current) => !current)}
                        aria-expanded={!filtersCollapsed}
                    >
                        {filtersCollapsed ? t("filter_title") : t("filter_hide")}
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
                            {t("filter_show")}
                        </button>
                    )}

                    {allMatches.length === 0 ? (
                        <p className="empty-state error">{t("app_noMatches")}</p>
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
                                        <h2>{t("section_championStats")}</h2>
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
                                    <h2>{t("section_synergies")}</h2>
                                    <SynergyTable synergies={synergyStats} />
                                </section>
                            )}

                            {activeTab === "matchups" && (
                                <>
                                    <section className="section">
                                        <h2>{t("section_champMatchups")}</h2>
                                        <MatchupTable matchups={matchupStats} />
                                    </section>
                                    <section className="section">
                                        <h2>{t("section_matchupsByRole")}</h2>
                                        <RoleMatchupTable matchups={roleMatchups} />
                                    </section>
                                </>
                            )}

                            {activeTab === "roles" && (
                                <section className="section">
                                    <h2>{t("section_champStatsByRole")}</h2>
                                    <RoleStatsTable stats={roleStats} filterRole={filters.role} />
                                </section>
                            )}

                            {activeTab === "patches" && (
                                <section className="section">
                                    <h2>{t("section_patchComparison")}</h2>
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
        <LanguageProvider>
            <AuthProvider>
                <TeamProvider>
                    <FilterProvider>
                        <AppContent />
                    </FilterProvider>
                </TeamProvider>
            </AuthProvider>
        </LanguageProvider>
    )
}
