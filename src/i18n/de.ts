export const de = {
    tab_champions: "Champions",
    tab_draftHelper: "Draft Helper",
    tab_teamDashboard: "Team Dashboard",
    tab_playerResults: "Player Results",
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

    // Data load error / warning banners
    dataLoad_matchesErrorTitle: "Live-Daten konnten nicht geladen werden.",
    dataLoad_matchesErrorBody:
        "Die App zeigt aktuell keine importierten Match-Daten. Bitte Seite neu laden oder später erneut versuchen.",
    dataLoad_syncReportError: "Sync-Status konnte nicht geladen werden.",
    dataLoad_retryButton: "Erneut laden",
    dataLoad_retrying: "Wird geladen…",

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
    dh_wLabel_teamPool: "Team Pool",

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

    // Similar Pro Play Drafts
    similarDrafts_title: "Ähnliche Pro-Play-Drafts",
    similarDrafts_needMoreInput: "Mindestens 1 Pick eingeben, um ähnliche Drafts zu suchen.",
    similarDrafts_noResults: "Keine ähnlichen Drafts gefunden.",
    similarDrafts_similarity: "Ähnlichkeit",
    similarDrafts_winner: "Sieger",
    similarDrafts_matchedBans: "Gemeinsame Bans",

    // Champion Notes
    cn_title: "Champion-Notizen",
    cn_selectChampion: "Champion",
    cn_note: "Notiz",
    cn_tags: "Tags (kommagetrennt)",
    cn_rating: "Einschätzung",
    cn_save: "Speichern",
    cn_saved: "Gespeichert",
    cn_delete: "Löschen",
    cn_noRating: "— Keine Einschätzung —",
    cn_relevantNotes: "Notizen zu aktuellen Draft-Picks",
    cn_noDraftedNotes: "Keine Notizen zu aktuellen Picks.",
    cn_editNote: "Notiz bearbeiten",
    cn_rating_comfort: "Comfort",
    cn_rating_situational: "Situativ",
    cn_rating_avoid: "Vermeiden",
    cn_rating_blind: "Blind Pick",
    cn_rating_pocket: "Pocket Pick",
    cn_rating_needs_practice: "Braucht Übung",

    // Auth
    auth_login: "Login",
    auth_logout: "Abmelden",
    auth_signUp: "Registrieren",
    auth_email: "E-Mail",
    auth_password: "Passwort",
    auth_sendMagicLink: "Magic Link senden",
    auth_magicLinkSent: "Prüfe deine E-Mail!",
    auth_unavailable: "Auth nicht konfiguriert.",
    auth_loggedInAs: "Angemeldet als",
    auth_username: "Benutzername",
    auth_invalidUsername: "Benutzername muss 3–32 Zeichen lang sein und darf nur a-z, 0-9, _ und - enthalten.",
    auth_error: "Fehler",
    auth_loading: "Laden…",

    // Teams
    team_myTeams: "Meine Teams",
    team_createTeam: "Team erstellen",
    team_teamName: "Teamname",
    team_activeTeam: "Aktives Team",
    team_noTeam: "Noch kein Team. Erstelle eines, um Notizen zu teilen.",
    team_create: "Erstellen",
    team_switchTeam: "Team wechseln",
    team_members: "Mitglieder",
    team_addMember: "Mitglied hinzufügen",
    team_username: "Benutzername",
    team_role: "Rolle",
    team_owner: "Owner",
    team_admin: "Admin",
    team_player: "Spieler",
    team_removeMember: "Entfernen",
    team_changeRole: "Rolle ändern",
    team_memberAdded: "Mitglied hinzugefügt",
    team_memberRemoved: "Mitglied entfernt",
    team_memberNotFound: "Benutzername nicht gefunden.",
    team_cannotManageMembers: "Keine Berechtigung zur Mitgliederverwaltung.",
    team_noMembers: "Noch keine Mitglieder.",
    team_manageMembers: "Mitglieder verwalten",
    team_dashboard: "Team Dashboard",
    team_yourRole: "Deine Rolle",
    team_notesSummary: "Champion-Notizen",
    team_quickActions: "Aktionen",
    team_dangerZone: "Gefahrenbereich",
    team_createFirstTeam: "Erstelle dein erstes Team",
    // Invite codes
    invite_manageInvites: "Einladungen",
    invite_createInvite: "Einladung erstellen",
    invite_copy: "Kopieren",
    invite_copied: "Kopiert!",
    invite_revoke: "Sperren",
    invite_revoked: "Einladung gesperrt.",
    invite_noInvites: "Keine aktiven Einladungen.",
    invite_join: "Beitreten",
    invite_joinCodePlaceholder: "XXXX-XXXX-XXXX",
    invite_invalidCode: "Ungültiger oder abgelaufener Invite-Code.",
    invite_joinSuccess: "Team erfolgreich beigetreten!",

    team_deleteTeam: "Team löschen",
    team_deleteConfirm: "Team \"{name}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
    team_deleteSuccess: "Team wurde gelöscht.",
    team_deleteError: "Fehler beim Löschen des Teams.",

    // Auth — account deletion
    auth_deleteAccount: "Account löschen",
    auth_deleteAccountConfirm: "Account wirklich löschen? Diese Aktion ist dauerhaft und kann nicht rückgängig gemacht werden.",
    auth_deleteAccountSuccess: "Account wurde gelöscht.",
    auth_deleteAccountError: "Fehler beim Löschen des Accounts.",
    auth_deleteAccountOwnsTeams: "Lösche zuerst alle eigenen Teams, bevor du deinen Account löscht.",
    auth_deletingAccount: "Wird gelöscht…",

    // Notes mode
    cn_modeLocal: "Nur lokal",
    cn_modeTeam: "Team:",

    // Team Drafts
    drafts_title: "Team-Drafts",
    drafts_save: "Speichern",
    drafts_saveCurrent: "Aktuellen Draft speichern",
    drafts_name: "Draftname",
    drafts_note: "Notiz",
    drafts_noTeam: "Wähle ein Team aus, um Drafts zu speichern.",
    drafts_saved: "Draft gespeichert.",
    drafts_load: "Laden",
    drafts_delete: "Löschen",
    drafts_deleteConfirm: "Diesen Draft wirklich löschen?",
    drafts_noDrafts: "Noch keine gespeicherten Drafts.",
    drafts_recent: "Letzte Drafts",
    drafts_count: "Gespeicherte Drafts",
    drafts_patch: "Patch",
    drafts_updated: "Aktualisiert",
    drafts_error: "Drafts konnten nicht geladen werden.",
    drafts_nameRequired: "Bitte gib einen Draftnamen ein.",

    // Header
    header_contact: "Kontakt",

    // Common
    common_loading: "Lädt…",

    // Player Results
    playerResults_view: "Ansicht",
    playerResults_teamOverview: "Team Overview",
    playerResults_noMatchesForPlayer: "Keine Matches für diesen Spieler.",
    playerResults_championStats: "Champion-Statistiken",
    playerResults_matchHistory: "Match-Verlauf",
    playerResults_allQueues: "Alle Queues",
    playerResults_allResults: "Alle Ergebnisse",
    playerResults_win: "Sieg",
    playerResults_loss: "Niederlage",
    playerResults_lossShort: "Nied.",
    playerResults_noMatchesFound: "Keine Matches gefunden.",
    playerResults_player: "Spieler",
    playerResults_result: "Ergebnis",
    playerResults_duration: "Dauer",
    playerResults_date: "Datum",
    playerResults_noData: "Keine Daten.",
    playerResults_bestChampions: "Beste Champions",
    playerResults_needsReview: "Needs Review",
    playerResults_noSavedMatches: "Noch keine Matches gespeichert.",
    playerResults_syncHint: "Klicke oben auf \"Matches syncen\" um Daten zu laden.",
    playerResults_viewLabel: "Ansicht:",
    playerResults_noTeam: "Kein Team ausgewählt.",
    playerResults_noTeamHint: "Wähle ein Team im Team Dashboard aus, um Player Results zu sehen.",

    // Sample size labels (translation keys returned by sampleSizeLabel())
    sample_veryLow: "sehr geringe Aussagekraft",
    sample_low: "geringe Aussagekraft",
    sample_moderate: "brauchbarer Trend",
    sample_good: "stabilerer Trend",

    // Draft Edge notes
    dh_noEvaluatedPicks: "Noch keine bewertbaren Picks mit Rolle.",
    dh_solidDraft: "Solider datenbasierter Draft-Stand.",

    // Champion Detail
    cd_roleDistribution: "Rollenverteilung",
    cd_topSynergies: "Top Synergien",
    cd_topMatchupsFor: "Top Matchups (für",
    cd_topLaneMatchups: "Top Lane-Matchups",
    cd_noPicks: "Keine Picks",
    cd_noData: "Keine Daten",

    // Common
    common_games: "Spiele",

    // Table headers and empty states
    tbl_confidence: "Aussagekraft",
    tbl_games: "Spiele",
    tbl_wins: "Siege",
    tbl_wrForA: "WR für A",
    tbl_showLess: "Weniger anzeigen",
    tbl_showAll: "Alle anzeigen",
    tbl_noChampions: "Keine Champions für die aktuellen Filter.",
    tbl_noSynergies: "Keine Synergiedaten für die aktuellen Filter.",
    tbl_noMatchups: "Keine Matchup-Daten für die aktuellen Filter.",
    tbl_noRoleData: "Keine Daten für diese Rolle.",
    tbl_noRoleMatchupsFor: "Keine Matchup-Daten für",
    tbl_noPatchesNeeded: "Mindestens 2 verschiedene Patches nötig für Vergleich.",
    tbl_selectDifferentPatches: "Bitte zwei unterschiedliche Patches auswählen.",
    tbl_noPatchCompData: "Keine Daten für diesen Patch-Vergleich.",
} as const
