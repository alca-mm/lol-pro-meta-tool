export const de = {
    tab_champions: "Champions",
    tab_draftHelper: "Draft Helper",
    tab_synergies: "Synergien",
    tab_matchups: "Matchups",
    tab_roles: "Rollen",
    tab_patches: "Patches",

    filter_title: "Filter",
    filter_reset: "Zurücksetzen",
    filter_patch: "Patch",
    filter_region: "Region",
    filter_tournament: "Turnier",
    filter_role: "Rolle",
    filter_minPicks: "Min. Picks",
    filter_all: "Alle",
    filter_show: "Filter anzeigen",
    filter_hide: "Filter ausblenden",

    ds_sampleActive: "Sample-Daten aktiv",
    ds_sampleNote: "Keine importierten Oracle's-Elixir-Daten gefunden.",
    ds_synced: "Oracle's Elixir Daten geladen",
    ds_lastSync: "Letzter Sync:",
    ds_dataUpTo: "Matchdaten bis:",
    ds_dateRange: "Zeitraum:",
    ds_latestPatch: "Neuester Patch:",
    ds_matches: "Matches:",
    ds_dismiss: "Datenhinweis ausblenden",

    section_championStats: "Champion-Statistiken",
    section_synergies: "Top Synergien",
    section_champMatchups: "Champion-Matchups (rollenagnostisch)",
    section_matchupsByRole: "Matchups nach Rolle",
    section_champStatsByRole: "Champion-Stats nach Rolle",
    section_patchComparison: "Patch-Vergleich",

    dash_filtered: "Matches gefiltert",
    dash_total: "Matches gesamt",

    app_loading: "Lade Matchdaten…",
    app_noMatches: "Keine validen Matches in den Daten gefunden.",

    // DraftHelper — header & controls
    dh_patchInfo: "Empfehlungen nutzen eine gewichtete Patch-Auswahl:",
    dh_rawSample: "Roh-Sample:",
    dh_weightedSample: "gewichtetes Sample:",
    dh_games: "Games",
    dh_resetDraft: "Draft zurücksetzen",
    dh_minPicksLabel: "Mindest-Picks pro Rolle",
    dh_excludeBans: "Gebannte Champions aus Empfehlungen ausschließen",

    // Series panel
    dh_seriesTitle: "Series / Fearless Draft",
    dh_savedGames: "gespeicherte Games:",
    dh_fearlessLocked: "Fearless gesperrt:",
    dh_fearlessOff: "Fearless AUS",
    dh_fearlessOn: "Fearless AN",
    dh_saveGame: "Game speichern",
    dh_nextGame: "Nächstes Game",
    dh_copyDraft: "Draft kopieren",
    dh_resetSeries: "Series reset",
    dh_fearlessPool: "Fearless Pool:",
    dh_draftCopied: "Draft kopiert",
    dh_copyFailed: "Kopieren nicht möglich",
    dh_noDraftYet: "Noch kein Draft erfasst.",

    // Draft flow
    dh_draftFlow: "Draft-Flow:",
    dh_flowActive: "Aktiv",
    dh_flowEnable: "Aktivieren",
    dh_stepBack: "Einen Schritt zurück",
    dh_manualMode: "Manueller Modus",
    dh_flowUpNext: "Jetzt dran:",

    // Recommendation side
    dh_liveRecsFor: "Live-Empfehlungen für:",

    // Patch weighting panel
    dh_patchWeightTitle: "Patch-Gewichtung",
    dh_patchWeightDesc: "Steuert, wie stark neue und ältere Patches in Draft-Empfehlungen, Flex-Erkennung, Ban-AI und Draft Edge zählen.",
    dh_patchWeightNote: "Ein neuer Patch bleibt wichtig, aber ältere Patches können kleine Samples stabilisieren.",
    dh_resetPatchWeight: "Patch-Gewichtung zurücksetzen",
    dh_currentPatch: "Aktuellster Patch",
    dh_patchOld1: "Patch alt",
    dh_patchOldN: "Patches alt",

    // Patch weight preset labels
    dh_pPreset_balanced: "Balanced",
    dh_pPreset_currentFocused: "Aktueller Patch",
    dh_pPreset_stable: "Meta stabil",
    dh_pPreset_currentOnly: "Nur aktuell",

    // Weighting panel
    dh_weightTitle: "Wichtung",
    dh_weightDesc: "Steuert, wie die Empfehlungen sortiert werden. Das ist keine Neural-Network-Kopie wie LoLDraftAI, aber es gibt dir dieselbe Idee: der ganze Draft wird nach Priorität, Synergie, Matchups und Rollenstärke neu bewertet.",
    dh_resetWeight: "Wichtung zurücksetzen",

    // Weight labels (used in sliders)
    dh_wLabel_draftPriority: "Champion-Priorität",
    dh_wLabel_roleStats: "Rollenstärke",
    dh_wLabel_synergy: "Synergie",
    dh_wLabel_matchup: "Matchup / Counter",
    dh_wLabel_winRate: "Winrate",
    dh_wLabel_sampleSize: "Sample Size",

    // Draft Edge section
    dh_edgeDesc: "Heuristische Draft-Bewertung auf Basis deiner Pro-Play-Daten. Nicht als echte Winrate kalibriert.",
    dh_rolesSet: "Rollen gesetzt",
    dh_strengthsData: "Stärken / Datenpunkte",
    dh_noWarnings: "Keine auffälligen Warnungen gefunden.",
    dh_compProfile: "Comp Profil",
    dh_compStrengths: "Stärken",
    dh_noStrengths: "Noch keine klare Comp-Stärke erkannt.",
    dh_tagsOpen: "Noch offen",

    // Next decision section
    dh_nextDecision: "Nächste Entscheidung",
    dh_flowLabel: "Flow:",
    dh_activeSlot: "Aktiver Slot:",
    dh_selectSlotHint: "· wähle einen Pick- oder Ban-Slot.",
    dh_picksNote: "Picks sind jetzt Champion-Priorität zuerst. Rolle danach über das Dropdown setzen.",
    dh_ownPicks: "Eigene Picks",
    dh_enemyPicks: "Gegner Picks",
    dh_candidates: "Kandidaten",

    // Champion pool panel
    dh_poolTitle: "Champion Pool",
    dh_selectBanFor: "Champion als Ban für",
    dh_selectBanSuffix: "wählen.",
    dh_selectPickFor: "Champion für",
    dh_selectPickSlot: "Pick",
    dh_selectPickSuffix: "wählen.",
    dh_selectSlotFirst: "Wähle zuerst einen Pick- oder Ban-Slot aus.",

    // Role recommendations grid
    dh_roleAlreadyFilled: "Rolle bereits besetzt:",
    dh_noCandidates: "Keine Kandidaten in der aktuellen gewichteten Patch-Auswahl.",

    // Side panel summary
    dh_assignedRoles: "Zugewiesene Rollen:",

    // Pick/ban slot UI
    dh_selectPickPlaceholder: "Pick auswählen",
    dh_assignRoleTitle: "Rolle zuweisen",
    dh_removePick: "Pick entfernen",
    dh_removeBan: "Ban entfernen",

    // Ban recommendations
    dh_bestBansTitle: "Best Bans gegen",
    dh_banRecsDesc: "Bans blocken die besten noch verfügbaren Empfehlungen für die gegnerische Seite.",
    dh_noBanRecs: "Keine Ban-Empfehlungen verfügbar.",

    // Best next picks table
    dh_bestPicksTitle: "Beste nächste Picks für",
    dh_noRecs: "Keine Empfehlungen gefunden. Reduziere die Mindest-Picks oder prüfe deine Filter.",
    dh_tableReasons: "Gründe",

    // Pick/recommendation button tooltips
    dh_roleOccupied: "Rolle belegt",
    dh_applyPick: "Direkt eintragen",

    // Draft recommendation reasons
    reason_highMetaPriority: "Hohe Meta-Priorität",
    reason_strongRoleData: "Starke rollenbezogene Daten",
    reason_goodSynergy: "Gute Synergie mit eigener Comp",
    reason_goodMatchup: "Gutes Matchup gegen Gegnerpick",
    reason_verySmallSample: "Sehr kleine Sample Size",
    reason_smallSample: "Kleine Sample Size",
    reason_solidCandidate: "Solider datenbasierter Kandidat",

    // Ban recommendation reasons
    ban_blocksOpenRole: "blockt offene",
    ban_strongCounter: "starker Counter-Wert",
    ban_strongSynergy: "starke Synergy-Option",
    ban_highDraftValue: "hoher gegnerischer Draft-Wert",

    // Comp profile — warning titles
    comp_warnTitle_rolesOpen: "Rollen noch offen",
    comp_warnTitle_dupRole: "Doppelte Rollenzuweisung",
    comp_warnTitle_lowFrontline: "Wenig Frontline",
    comp_warnTitle_lowEngage: "Wenig Start-Tools",
    comp_warnTitle_adHeavy: "AD-lastig",
    comp_warnTitle_apHeavy: "AP-lastig",
    comp_warnTitle_lowScaling: "Wenig Scaling",

    // Comp profile — warning descriptions
    comp_warnDesc_rolesOpen: "Noch nicht gesetzt:",
    comp_warnDesc_dupRole: "Prüfe:",
    comp_warnDesc_lowFrontline: "Die Comp hat noch keinen klaren Champion, der zuverlässig Raum nehmen kann.",
    comp_warnDesc_lowEngage: "Es fehlt Engage oder Pick-Potential, um Kämpfe kontrolliert zu eröffnen.",
    comp_warnDesc_adHeavy: "Gegner kann leichter Armor stacken. Prüfe AP/Magic-Damage-Ergänzung.",
    comp_warnDesc_apHeavy: "Gegner kann leichter Magic Resist stacken. Prüfe AD-Damage-Ergänzung.",
    comp_warnDesc_lowScaling: "Die Comp wirkt eher early/mid-game fokussiert. Snowball-Plan beachten.",

    // Comp profile — strengths
    comp_strength_frontline: "Front-to-back Kern vorhanden: Frontline plus Scaling-Damage.",
    comp_strength_engage: "Gute Fight-Eröffnung: Engage- und Dive-Tools vorhanden.",
    comp_strength_poke: "Starke Objective-Vorbereitung: mehrere Poke-Quellen.",
    comp_strength_pick: "Hohes Catch-Potential: mehrere Pick-Tools.",
    comp_strength_peel: "Carry-Schutz erkennbar: Peel unterstützt Scaling-Champions.",
    comp_strength_mixed: "Gemischtes Damage-Profil erschwert defensive Itemisierung.",
    comp_strength_clean: "Keine großen strukturellen Schwächen erkannt.",

    // Comp profile — metric descriptions
    comp_metricDesc_frontline: "Wie zuverlässig kann die Comp Raum nehmen und Schaden tanken?",
    comp_metricDesc_engage: "Wie gut kann die Comp Kämpfe starten?",
    comp_metricDesc_peel: "Wie gut schützt die Comp Carries?",
    comp_metricDesc_poke: "Wie gut kann die Comp vor Objectives chippen?",
    comp_metricDesc_pick: "Wie gut kann die Comp einzelne Ziele bestrafen?",
    comp_metricDesc_scaling: "Wie gut wird die Comp in späteren Teamfights?",

    // Comp profile — identity and damage labels
    comp_identity_hybrid: "Hybrid / offen",
    comp_damage_unknown: "Unklar",
    comp_damage_adHeavy: "AD-lastig",
    comp_damage_apHeavy: "AP-lastig",
    comp_damage_mixed: "Gemischt",

    // Champion pool
    pool_searchPlaceholder: "Champion suchen...",
    pool_noChampion: "Kein Champion gefunden.",
} as const
