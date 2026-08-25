import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react"
import { FilterProvider, useFilters } from "./context/FilterContext"
import {
    createEmptyDraftSlots,
    draftBoardFromSlots,
} from "./draft/draftAvailability"
import type { DraftSlotsState } from "./draft/draftAvailability"
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
import { publicAssetUrl } from "./lib/publicAssetUrl"
import {
    reduceDataLoadError,
    toSafeErrorMessage,
    type DataLoadError,
} from "./lib/dataLoadError"
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
const TournamentScout = lazy(() =>
    import("./components/scout/TournamentScout").then((m) => ({ default: m.TournamentScout }))
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

type TabId = "champions" | "draft" | "tournament-scout" | "team-dashboard" | "player-results" | "synergies" | "matchups" | "roles" | "patches"

function AppContent() {
    const { filters } = useFilters()
    const { t, lang, setLang } = useTranslation()
    const [selectedChampion, setSelectedChampion] = useState<string | null>(null)

    /*
      THE DRAFT, OWNED HERE SINCE 0.8.2.

      It used to live inside `DraftHelper`, which is rendered conditionally and
      therefore UNMOUNTED whenever the user left the draft tab - the whole draft
      was thrown away on every tab switch. The scout tab could not have read a
      draft that stopped existing the moment you navigated to it.

      One owner, one truth: `DraftHelper` renders and edits it, the scout reads
      the board derived from it. Nothing is persisted, exactly as before.
    */
    const [draftSlots, setDraftSlots] = useState<DraftSlotsState>(createEmptyDraftSlots)

    // The domain view of the same four arrays. Derived, never stored, so it can
    // never drift from what the draft board shows.
    const draftBoard = useMemo(() => draftBoardFromSlots(draftSlots), [draftSlots])
    const [activeTab, setActiveTab] = useState<TabId>("champions")
    const [filtersCollapsed, setFiltersCollapsed] = useState(false)
    const [authPanelOpen, setAuthPanelOpen] = useState(false)

    const [allMatches, setAllMatches] = useState<Match[]>(sampleMatches)
    const [isUsingSampleData, setIsUsingSampleData] = useState(true)
    const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isRetrying, setIsRetrying] = useState(false)
    const [matchesError, setMatchesError] = useState<DataLoadError | null>(null)
    const [syncReportError, setSyncReportError] = useState<DataLoadError | null>(null)

    // Monotonic token: lets a fresh load (initial mount or a manual retry)
    // invalidate any responses still in flight from a previous attempt, so a
    // late/stale fetch can never overwrite newer state.
    const loadTokenRef = useRef(0)

    const loadRuntimeData = useCallback(() => {
        const token = ++loadTokenRef.current
        setIsRetrying(true)

        const matchesPromise = fetch(publicAssetUrl("data/importedMatches.json"))
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (loadTokenRef.current !== token) return
                const matches = parseMatches(data)
                if (matches.length > 0) {
                    setAllMatches(matches)
                    setIsUsingSampleData(false)
                }
                setMatchesError(reduceDataLoadError("matches", { type: "success" }))
            })
            .catch((err) => {
                if (loadTokenRef.current !== token) return
                console.error("Failed to load imported matches:", toSafeErrorMessage(err))
                setMatchesError(reduceDataLoadError("matches", { type: "error", error: err }))
            })

        const syncPromise = fetch(publicAssetUrl("data/latest-sync-report.json"))
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: unknown) => {
                if (loadTokenRef.current !== token) return
                setSyncReport(data as SyncReport)
                setSyncReportError(reduceDataLoadError("syncReport", { type: "success" }))
            })
            .catch((err) => {
                if (loadTokenRef.current !== token) return
                console.error("Failed to load sync report:", toSafeErrorMessage(err))
                setSyncReportError(reduceDataLoadError("syncReport", { type: "error", error: err }))
            })

        void Promise.allSettled([matchesPromise, syncPromise]).then(() => {
            if (loadTokenRef.current !== token) return
            setIsLoading(false)
            setIsRetrying(false)
        })
    }, [])

    useEffect(() => {
        loadRuntimeData()
        // Invalidate in-flight responses on unmount.
        return () => {
            loadTokenRef.current += 1
        }
    }, [loadRuntimeData])

    const ALL_TABS: { id: TabId; label: string }[] = [
        { id: "champions",      label: t("tab_champions") },
        { id: "draft",          label: t("tab_draftHelper") },
        { id: "tournament-scout", label: t("tab_tournamentScout") },
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

    /**
     * Champion role evidence for the Tournament Scout's role-viability gate.
     *
     * Built from `allMatches`, NOT from `filteredMatches`, and that is the whole
     * point of computing it separately from `championStats` above. The gate asks
     * "is this champion played in this lane at all", so it needs the widest
     * evidence available: with a patch or league filter applied, a champion
     * would start looking unplayable in a lane merely because the current filter
     * hides the games that prove otherwise, and a false "not playable" verdict
     * silently removes a real ban candidate.
     *
     * Only `picks` and `roleDistribution` are read downstream. Deliberately not
     * passed as `proMeta`: that field switches on meta enrichment
     * (`meta_priority`, `meta_shift_possible`), which is a separate feature.
     */
    // Sticky: computed the first time the scout tab is opened and kept from
    // then on. This is a second full pass over ~250k picks (App already does one
    // over the filtered set), so paying it on the initial load for every visitor
    // who never opens the scout is waste. The prop is optional and the engine
    // degrades to "unknown", so the tab is correct on its very first frame too.
    const [scoutOpened, setScoutOpened] = useState(false)
    useEffect(() => {
        if (activeTab === "tournament-scout") setScoutOpened(true)
    }, [activeTab])

    const scoutChampionRoleReference = useMemo(
        () => (scoutOpened ? calculateChampionStats(allMatches) : undefined),
        [allMatches, scoutOpened],
    )

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
                syncReportFailed={!matchesError && !!syncReportError}
            />

            {matchesError && (
                <div className="data-load-alert error" role="alert">
                    <strong>{t("dataLoad_matchesErrorTitle")}</strong>
                    <span>{t("dataLoad_matchesErrorBody")}</span>
                    <span className="data-load-alert-detail">{matchesError.detail}</span>
                    <button
                        type="button"
                        className="data-load-retry"
                        onClick={() => loadRuntimeData()}
                        disabled={isRetrying}
                    >
                        {isRetrying ? t("dataLoad_retrying") : t("dataLoad_retryButton")}
                    </button>
                </div>
            )}

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

                    <nav className="tab-nav" aria-label={t("app_navAriaLabel")}>
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
                    ) : activeTab === "tournament-scout" ? (
                        // Deliberately above the `allMatches.length === 0` guard:
                        // the scout tab works on pasted links and manually entered
                        // numbers only, so it must stay usable when the pro-meta
                        // dataset is empty or failed to load.
                        <section className="section">
                            <TournamentScout
                                championRoleReference={scoutChampionRoleReference}
                                draftBoard={draftBoard}
                            />
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
                                    <DraftHelper
                                        matches={filteredMatches}
                                        slots={draftSlots}
                                        onSlotsChange={setDraftSlots}
                                    />
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
