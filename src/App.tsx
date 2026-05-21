import { useState, useMemo, useEffect, lazy, Suspense } from "react"
import { FilterProvider, useFilters } from "./context/FilterContext"
import { LanguageProvider, useTranslation } from "./i18n/LanguageContext"
import { AuthProvider } from "./auth/AuthContext"
import { TeamProvider } from "./teams/TeamContext"
import { UserMenu } from "./components/auth/UserMenu"
import { parseMatches } from "./import/parseMatches"
import { applyFilters } from "./analysis/filters"
import { calculateChampionStats, primaryRole } from "./analysis/championStats"
import { calculateSynergyStats } from "./analysis/synergyStats"
import { calculateMatchupStats } from "./analysis/matchupStats"
import { calculateRoleStats } from "./analysis/roleStats"
import { calculateRoleMatchups } from "./analysis/roleMatchups"
import { calculateLaneMatchupStats } from "./analysis/laneMatchupStats"
import { Filters } from "./components/Filters"
import { Dashboard } from "./components/Dashboard"
import { ChampionStatsTable } from "./components/ChampionStatsTable"
import { DataSourceInfo } from "./components/DataSourceInfo"
import sampleData from "./data/sampleMatches.json"
import type { Match, SyncReport } from "./domain/types"

// Tab-specific components — loaded on first navigation to that tab
const AuthPanel = lazy(() =>
    import("./components/auth/AuthPanel").then((m) => ({ default: m.AuthPanel }))
)
const TeamStatusPanel = lazy(() =>
    import("./components/TeamStatusPanel").then((m) => ({ default: m.TeamStatusPanel }))
)
const DraftHelper = lazy(() =>
    import("./components/DraftHelper").then((m) => ({ default: m.DraftHelper }))
)
const PlayerResultsPage = lazy(() =>
    import("./components/player-results/PlayerResultsPage").then((m) => ({ default: m.PlayerResultsPage }))
)
const SynergyTable = lazy(() =>
    import("./components/SynergyTable").then((m) => ({ default: m.SynergyTable }))
)
const MatchupTable = lazy(() =>
    import("./components/MatchupTable").then((m) => ({ default: m.MatchupTable }))
)
const RoleMatchupTable = lazy(() =>
    import("./components/RoleMatchupTable").then((m) => ({ default: m.RoleMatchupTable }))
)
const RoleStatsTable = lazy(() =>
    import("./components/RoleStatsTable").then((m) => ({ default: m.RoleStatsTable }))
)
const PatchComparisonView = lazy(() =>
    import("./components/PatchComparisonView").then((m) => ({ default: m.PatchComparisonView }))
)

const DISCORD_INVITE_URL = "https://discord.gg/8cdFSGy9qT"

const sampleMatches = parseMatches(sampleData)

type TabId = "champions" | "draft" | "team-dashboard" | "player-results" | "synergies" | "matchups" | "roles" | "patches"

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

    const ALL_TABS: { id: TabId; label: string }[] = [
        { id: "champions",      label: t("tab_champions") },
        { id: "draft",          label: t("tab_draftHelper") },
        { id: "team-dashboard", label: t("tab_teamDashboard") },
        { id: "player-results", label: t("tab_playerResults") },
        { id: "synergies",      label: t("tab_synergies") },
        { id: "matchups",       label: t("tab_matchups") },
        { id: "roles",          label: t("tab_roles") },
        { id: "patches",        label: t("tab_patches") },
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
    const laneMatchupStats = useMemo(() => calculateLaneMatchupStats(filteredMatches), [filteredMatches])
    const roleStats = useMemo(() => calculateRoleStats(filteredMatches), [filteredMatches])
    const roleMatchups = useMemo(() => calculateRoleMatchups(filteredMatches), [filteredMatches])

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

            <Suspense fallback={null}>
                {authPanelOpen && (
                    <AuthPanel onClose={() => setAuthPanelOpen(false)} />
                )}
            </Suspense>

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

                    <nav className="tab-nav" aria-label="Ansichten">
                        {ALL_TABS.map((tab) => (
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

                    <Suspense fallback={<p className="inline-loading">{t("common_loading")}</p>}>
                    {activeTab === "team-dashboard" ? (
                        <section className="section">
                            <TeamStatusPanel onGoToPlayerResults={() => setActiveTab("player-results")} />
                        </section>
                    ) : activeTab === "player-results" ? (
                        <section className="section">
                            <PlayerResultsPage />
                        </section>
                    ) : allMatches.length === 0 ? (
                        <p className="empty-state error">{t("app_noMatches")}</p>
                    ) : (
                        <>
                            <Dashboard
                                totalMatches={allMatches.length}
                                filteredMatches={filteredMatches.length}
                            />

                            {activeTab === "champions" && (
                                <>
                                    <section className="section">
                                        <h2>{t("section_championStats")}</h2>
                                        <ChampionStatsTable
                                            stats={championStats}
                                            selectedChampion={selectedChampion}
                                            onSelectChampion={setSelectedChampion}
                                            synergies={synergyStats}
                                            matchups={matchupStats}
                                            laneMatchups={laneMatchupStats}
                                        />
                                    </section>
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
                    </Suspense>
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
