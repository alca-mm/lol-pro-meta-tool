export const de = {
    tab_champions: "Champions",
    tab_draftHelper: "Draft Helper",
    tab_teamDashboard: "Team Dashboard",
    tab_playerResults: "Player Results",
    tab_synergies: "Synergien",
    tab_matchups: "Matchups",
    tab_roles: "Rollen",
    tab_patches: "Patches",
    tab_tournamentScout: "Turnier Scout",

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
    team_membersOne: "{count} Mitglied",
    team_membersMany: "{count} Mitglieder",
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
    team_youMarker: "(du)",
    team_manageMembers: "Mitglieder verwalten",
    team_dashboard: "Team Dashboard",
    team_yourRole: "Deine Rolle",
    team_notesSummary: "Champion-Notizen",
    team_notesSummaryOne: "{count} Champion-Notiz",
    team_notesSummaryMany: "{count} Champion-Notizen",
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

    // Riot account (RiotAccountPanel, RiotAccountSummary)
    team_riot_title: "Riot-Account",
    team_riot_loading: "Lädt…",
    team_riot_link: "Verknüpfen",
    team_riot_change: "Ändern",
    team_riot_inputPlaceholder: "SpielerName#EUW",
    team_riot_formatHint: "Format: SpielerName#TAG (z.B. Beispiel#EUW)",
    team_riot_linkSuccess: "Riot-Account verknüpft!",
    team_riot_notLinked: "Kein Riot-Account verknüpft.",
    team_riot_sync: "Matches syncen",
    team_riot_syncShort: "Syncen",
    team_riot_syncCooldown: "Sync ({secs}s)",
    team_riot_loadMore: "Mehr laden",
    team_riot_loadMoreCooldown: "Mehr laden ({secs}s)",
    team_riot_modeHint: "Quick: letzte 10 Matches/Queue · Mehr laden: letzte 30/Queue",
    team_riot_playerResults: "Player Results",
    team_riot_syncDone: "Sync abgeschlossen.",
    team_riot_syncedOne: "{count} neues Match gespeichert.",
    team_riot_syncedMany: "{count} neue Matches gespeichert.",
    team_riot_moreLong: "Es könnten weitere Matches verfügbar sein. Synchronisiere erneut.",
    team_riot_moreShort: "Weitere verfügbar.",
    team_riot_error_riot_account_not_found: "Riot-Account nicht gefunden. Prüfe Schreibweise und Tag.",
    team_riot_error_riot_rate_limited: "Rate Limit erreicht. Bitte kurz warten und erneut synchronisieren.",
    team_riot_error_riot_account_not_linked: "Bitte zuerst Riot-Account verknüpfen.",
    team_riot_error_riot_network_error: "Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuch es erneut.",
    team_riot_error_riot_invalid_response: "Unerwartete Antwort vom Server. Es wurde nichts gespeichert. Versuch es später erneut.",
    team_riot_error_riot_unauthorized: "Deine Sitzung ist abgelaufen. Melde dich neu an und versuch es erneut.",
    team_riot_error_riot_not_configured: "Der Riot-Sync ist in dieser Installation nicht konfiguriert.",
    team_riot_error_unknown: "Riot-Anfrage fehlgeschlagen. Bitte später erneut versuchen.",
    team_riot_error_unknownDetail: "Riot-Anfrage fehlgeschlagen. Details: {detail}",

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

    // Tournament Scout — header
    scout_title: "Turnier Scout",
    scout_dataHonestySummary: "Wie dieser Tab arbeitet",
    scout_intro: "Links der Gegner einfügen, Spieler erkennen lassen, Scout-Daten eintragen, Ban-Empfehlungen bekommen.",
    scout_dataHonesty: "Dieser Tab liest OP.GG, League of Graphs, DeepLoL oder DPM nicht selbst aus. Das Tool erkennt die Spieler und baut die passenden Links. Champion, Games und Winrate trägst du selbst ein. Gerechnet wird nur damit, geschätzt wird nichts.",

    // Tournament Scout — input
    scout_inputLabel: "Links oder Spielerzeilen einfügen",
    scout_inputPlaceholder: "https://www.op.gg/multisearch/euw?summoners=Spieler1%23EUW,Spieler2%23EUW\nhttps://www.leagueofgraphs.com/summoner/euw/Spieler3-EUW\nMid: Spieler4#EUW\nSupport Spieler5#EUW1",
    scout_parseButton: "Spieler erkennen",
    scout_clearButton: "Eingabe leeren",
    scout_exampleButton: "Beispiel einfügen",
    scout_exampleHint: "Namen und Links im Beispiel sind erfunden.",

    // Tournament Scout — parse result
    scout_parsedPlayers: "Erkannte Spieler",
    scout_noPlayers: "Noch keine Spieler erkannt. Füge oben Links oder Spielerzeilen ein und starte die Erkennung.",
    scout_unparsedLines: "Nicht erkannte Zeilen",
    scout_unparsedHint: "Keinem Spieler zuzuordnen. Ergänze die Riot-ID als Name#TAG oder einen vollständigen Profil-Link.",
    scout_duplicatesMerged: "Mehrfach genannte Spieler wurden zu einem Eintrag zusammengeführt.",
    scout_countPlayers: "Erkannte Spieler: {count}",
    scout_countUnparsed: "Nicht erkannte Zeilen: {count}",
    scout_countDuplicates: "Zusammengeführte Doppelnennungen: {count}",

    // Tournament Scout — reasons for unparsed lines (UnparsedLineReason)
    scout_unparsed_no_riot_id: "Keine Riot-ID gefunden. Richtig wäre Name#TAG.",
    scout_unparsed_invalid_riot_id: "Riot-ID unvollständig: Name oder Tag fehlt.",
    scout_unparsed_malformed_url: "Link ist unvollständig oder fehlerhaft.",
    scout_unparsed_unknown_url_host: "Unbekannte Seite. Unterstützt werden OP.GG, League of Graphs, DeepLoL und DPM.",
    scout_unparsed_unsupported_url_shape: "Seite erkannt, aber diese Unterseite enthält keine Riot-ID. Nutze den direkten Profil-Link.",
    scout_unparsed_empty_multilink: "Multilink erkannt, aber ohne Spieler darin.",

    // Tournament Scout — player card
    scout_player_riotId: "Riot-ID",
    scout_player_region: "Region",
    scout_player_role: "Rolle",
    scout_player_sources: "Quellen",
    scout_player_noSources: "Kein Profil-Link vorhanden. Suche den Spieler direkt auf OP.GG und trage die Werte unten ein.",
    scout_player_openSource: "Profil auf {source} öffnen",
    scout_player_remove: "Spieler entfernen",
    scout_player_removeConfirm: "Diesen Spieler wirklich entfernen? Seine Champions, Games, Winrates und Notizen werden mitgelöscht und lassen sich nicht wiederherstellen.",

    // Tournament Scout — roles
    scout_role_top: "Top",
    scout_role_jungle: "Jungle",
    scout_role_mid: "Mid",
    scout_role_bot: "ADC",
    scout_role_support: "Support",
    scout_role_unknown: "Unbekannt",
    // Rolle, die nur aus der Eingabe gelesen wurde — kein Platz in der Aufstellung.
    scout_roleGuessed: "{role} (vermutet)",

    // Tournament Scout — sources
    scout_source_opgg: "OP.GG",
    scout_source_leagueofgraphs: "League of Graphs",
    scout_source_deeplol: "DeepLoL",
    scout_source_dpm: "DPM",
    scout_source_manual: "Aus dem Kopf",
    scout_source_other: "Andere Quelle",

    // Tournament Scout — source status
    scout_status_parsed_from_url: "Aus dem Link übernommen. Name, Tag und Region stehen fest.",
    scout_status_source_link_only: "Nur Link. Öffne die Seite und trage die Werte unten selbst ein.",
    scout_status_manual_required: "Manuelle Eingabe nötig. Ohne Scout-Daten fließt dieser Spieler nicht in die Analyse ein.",
    scout_status_not_supported_in_browser: "Automatisches Auslesen ist im Browser nicht möglich. Nutze den Link.",
    scout_status_error: "Link konnte nicht verarbeitet werden. Bitte prüfen oder neu einfügen.",

    // Tournament Scout — source notes (ScoutSourceNoteCode)
    scout_note_identity_from_url: "Spieler aus diesem Link gelesen.",
    scout_note_profile_link_generated: "Profil-Link aus Name, Tag und Region gebaut.",
    scout_note_url_format_heuristic: "Link-Format ist geraten, der Link kann ins Leere führen.",
    scout_note_region_unknown: "Region unbekannt. Ohne sie lässt sich kein Link bauen.",
    scout_note_tagline_unknown: "Tag fehlt. Ohne #TAG lässt sich kein Link bauen.",
    scout_note_identity_incomplete: "Name unvollständig oder unbrauchbar.",
    scout_note_direct_fetch_not_supported: "Diese Seite wird nicht abgerufen, nur verlinkt.",
    scout_note_unknown_url_shape: "Seite erkannt, das Adressformat aber nicht.",

    // Tournament Scout — why a source is not fetched (ScoutFetchBlockedCode)
    scout_blocked_no_public_api: "Für diese Seite ist keine öffentliche Schnittstelle dokumentiert.",
    scout_blocked_cors_blocked: "Die Schnittstelle erlaubt keine Zugriffe aus einer fremden Webseite heraus.",
    scout_blocked_anti_bot_protection: "Die Seite ist gegen automatische Zugriffe geschützt.",
    scout_blocked_html_scraping_only: "Die Werte stehen nur im Seiten-HTML. Sie dort auszulesen wäre fehleranfällig und von den Nutzungsbedingungen nicht gedeckt.",
    scout_blocked_undocumented_private_api: "Erreichbar wäre nur die interne, undokumentierte Schnittstelle der Seite. Sie wird bewusst nicht genutzt.",
    scout_blocked_unverified: "Nicht geprüft. Gilt bis auf Weiteres als nicht abrufbar.",
    // Tournament Scout — manual scouting data
    scout_manualTitle: "Scout-Daten",
    scout_manualHint: "Trage ein, was du auf den verlinkten Seiten siehst. Champion und Games reichen für einen ersten Vorschlag.",
    scout_manual_champion: "Champion",
    scout_manual_championInvalid: "Ohne Championnamen geht die Zeile beim nächsten Laden verloren.",
    scout_manual_games: "Games",
    scout_manual_gamesPlaceholder: "z. B. 14",
    scout_manual_gamesInvalid: "Games als ganze Zahl ab 0 eintragen.",
    scout_manual_winrate: "Winrate",
    scout_manual_winratePlaceholder: "z. B. 62",
    scout_manual_winrateInvalid: "Winrate als Wert zwischen 0 und 100 eintragen.",
    scout_manual_note: "Notiz",
    scout_manual_source: "Quelle",
    scout_manual_recency: "Aktualität",
    scout_manual_recencyHint: "Aktuellere Einträge zählen in der Analyse stärker. Ältere fließen abgeschwächt mit ein.",
    scout_manual_role: "Rolle",
    scout_manual_add: "Eintrag hinzufügen",
    scout_manual_remove: "Eintrag entfernen",
    scout_manual_removeConfirm: "Diesen Eintrag wirklich entfernen? Games, Winrate und Notiz gehen dabei verloren.",
    scout_manual_empty: "Noch keine Scout-Daten für diesen Spieler.",

    // Tournament Scout — recency
    scout_recency_current: "Aktueller Patch",
    scout_recency_recent: "Letzte Wochen",
    scout_recency_old: "Älter (nur Tendenz)",

    // Tournament Scout — lineup (starting five + substitutes)
    scout_lineupTitle: "Team-Aufstellung",
    scout_lineupHint: "Fünf Startplätze und bis zu drei Substitutes. Mit Aufstellung bekommen Ban-Empfehlungen eine Lane, ohne rechnet das Tool weiter, nur ohne Rollenbezug.",
    scout_startingFive: "Startaufstellung",
    scout_substitutes: "Substitutes",
    scout_unassigned: "Nicht zugewiesen",
    scout_unassignedHint: "Erkannte Spieler ohne Platz. Sie behalten ihre Daten, aber ihre Rolle lässt sich nicht abgleichen.",
    scout_lineupEmptySlot: "Frei (Spieler zuweisen)",
    scout_assignTo: "Platz zuweisen",
    scout_moveToPool: "Aus der Aufstellung nehmen",
    scout_alreadyAssigned: "Dieser Spieler steht bereits auf einem anderen Platz. Nimm ihn dort zuerst heraus.",
    scout_lineupComplete: "Startaufstellung vollständig: alle fünf Rollen sind besetzt.",
    scout_lineupIncomplete: "Startaufstellung noch unvollständig. Besetze die freien Rollen, damit der Banplan jede Lane abdeckt.",
    scout_lineupAutofill: "Aus erkannten Rollen füllen",
    scout_lineupAutofillHint: "Übernimmt die beim Erkennen gelesenen Rollen. Das ist eine Vermutung, prüfe jeden Platz nach.",
    scout_lineupClear: "Aufstellung leeren",
    scout_includeSubstitutes: "Substitutes mitwerten",
    scout_includeSubstitutesHint: "Aus: Substitutes bleiben editierbar, liefern aber keine Signale. An: Ihre Daten zählen abgeschwächt mit.",
    scout_substituteRisk: "Substitute-Risiko",
    scout_onlyIfPlayerStarts: "Zahlt sich nur aus, wenn dieser Spieler tatsächlich spielt.",

    // Tournament Scout — substitute slots (ScoutSubstituteSlot); starting slots reuse scout_role_*
    scout_lineup_sub1: "Substitute 1",
    scout_lineup_sub2: "Substitute 2",
    scout_lineup_sub3: "Substitute 3",

    // Tournament Scout — lineup membership (ScoutLineupMembership)
    scout_membership_starter: "Starter",
    scout_membership_substitute: "Substitute",
    scout_membership_unassigned: "Nicht zugewiesen",

    // Tournament Scout — analysis
    scout_analysisTitle: "Ban-Analyse",
    scout_topThreats: "Größte Bedrohungen",
    scout_banCandidates: "Ban-Kandidaten",
    scout_comfortPicks: "Comfort Picks",
    scout_weaknesses: "Schwachstellen",
    scout_confidence: "Aussagekraft",
    scout_sourceHint: "Basiert ausschließlich auf den Scout-Daten, die du eingetragen hast.",
    scout_lowData: "Dünne Datenlage. Trage mehr Champions oder Games ein, damit die Empfehlung belastbar wird.",
    scout_noAnalysis: "Noch keine Analyse möglich. Trage für mindestens einen Spieler Scout-Daten ein.",

    // Tournament Scout — confidence levels
    scout_confidence_high: "Hoch",
    scout_confidence_medium: "Mittel",
    scout_confidence_low: "Niedrig",
    scout_confidence_none: "Keine Daten",

    // Tournament Scout — role fit of a signal (ScoutRoleFit), short badge labels
    scout_rolefit_onrole: "Eigene Rolle",
    scout_rolefit_offrole: "Andere Rolle",
    scout_rolefit_flex: "Flex",
    scout_rolefit_unknown: "Rolle unklar",

    // Tournament Scout — reason codes (ScoutReasonCode)
    scout_reason_high_winrate_many_games: "{winrate}% Winrate auf {games} Games, ein belastbares Sample.",
    scout_reason_high_winrate_small_sample: "{winrate}% Winrate, aber nur {games} Games.",
    scout_reason_high_winrate_small_sampleOne: "{winrate}% Winrate, aber nur {games} Game.",
    scout_reason_signature_pick: "Signature Pick: großer Anteil der erfassten Games.",
    scout_reason_one_trick: "One-Trick-Niveau auf diesem Champion.",
    scout_reason_high_games_low_winrate: "{games} Games, aber nur {winrate}% Winrate. Eher Schwachstelle als Bedrohung.",
    scout_reason_flex_across_roles: "Flex: wird auf mehreren Rollen gespielt.",
    scout_reason_played_recently: "Im aktuellen Patch gespielt.",
    scout_reason_stale_data: "Nur ältere Daten, also eher eine Tendenz.",
    scout_reason_small_sample: "Nur {games} Games, kleines Sample. Zählt deshalb weniger.",
    scout_reason_small_sampleOne: "Nur {games} Game, kleines Sample. Zählt deshalb weniger.",
    scout_reason_no_data: "Keine Scout-Daten eingetragen.",
    scout_reason_manual_entry_only: "Manuell eingetragen, nichts automatisch abgerufen.",
    scout_reason_hits_multiple_players: "Trifft {count} Spieler im gegnerischen Team.",
    scout_reason_meta_priority: "Hohe Priorität im Pro Play der gewichteten Patches.",
    scout_reason_role_specific_threat: "Bedrohung vor allem auf {role}.",
    scout_reason_user_marked_priority: "Von dir als Priorität markiert.",
    scout_reason_onrole_signal: "Auf {role} gespielt und dort auch aufgestellt. Ein Ban trifft genau diese Lane.",
    scout_reason_offrole_signal: "Auf {signalRole} gespielt, aufgestellt aber als {lineupRole}. Ein Ban trifft die geplante Lane möglicherweise nicht.",
    scout_reason_role_unknown_or_flex: "Rolle unklar oder Flex. Signal: {signalRole}, Lineup: {lineupRole}. Welche Lane ein Ban hier trifft, steht nicht fest.",
    scout_reason_substitute_risk: "Stammt von einem Substitute, der vielleicht gar nicht spielt. Das Signal zählt deshalb nur mit dem Faktor {weight}.",
    scout_reason_player_without_lineup_role: "Spieler steht auf keinem Platz im Lineup. Die Daten sind als {role} erfasst, bestätigt ist die Rolle damit nicht. Ohne Platz gibt es keinen Rollenabgleich.",
    // Stat-Gewichtung (Games / Winrate / KDA). Bewusst OHNE `...One`-Sibling:
    // `many_games_on_champion` feuert erst ab 44 Games (abgeleitet aus
    // SCOUT_STAT_REASON_MIN_IMPACT in src/scout/analysis.ts), ein Singular
    // wäre also Text, den niemand je sieht. `strong_kda` rendert bewusst keine
    // Zahl und ist damit gar nicht zahlabhängig.
    scout_reason_many_games_on_champion: "Viele Spiele auf diesem Champion: {games}.",
    scout_reason_strong_kda: "Starke KDA auf diesem Champion.",

    // Tournament Scout — warning codes (ScoutWarningCode)
    scout_warning_player_without_data: "Für mindestens einen Spieler fehlen Scout-Daten, er bleibt in der Analyse außen vor. Trage seine Champions nach.",
    scout_warning_small_sample_overall: "Insgesamt wenige Games erfasst. Ein paar Einträge mehr machen den Banplan deutlich belastbarer.",
    scout_warning_stale_data_overall: "Die meisten Einträge sind älter. Prüfe auf den verlinkten Seiten, was gerade gespielt wird.",
    scout_warning_flex_pick_warning: "Mindestens ein Champion taucht auf mehreren Rollen auf. Ein Ban trifft dann eventuell nicht die Rolle, die du meinst.",
    scout_warning_meta_shift_possible: "Zwischen den erfassten Games und dem aktuellen Patch kann sich die Meta verschoben haben. Nur zur Einordnung, nichts zu tun.",
    scout_warning_source_not_fetchable: "Mindestens eine Quelle lässt sich nicht direkt abrufen. Öffne den Link und trage die Werte selbst ein.",
    scout_warning_conflicting_entries: "Für denselben Champion stehen sich widersprechende Einträge gegenüber. Prüfe Games und Winrate.",
    scout_warning_duplicate_players_merged: "Mehrfach genannte Spieler wurden zusammengeführt. Nichts zu tun, prüfe im Zweifel die Riot-IDs.",
    scout_warning_incomplete_starting_five: "Noch freie Startplätze: {missing}. Der Banplan deckt nur die besetzten Rollen ab. Weise die übrigen Spieler zu.",
    scout_warning_player_without_lineup_role: "Spieler mit Scout-Daten ohne Platz im Lineup: {count}. Ihre Signale lassen sich keiner Rolle zuordnen. Setze sie in die Startaufstellung oder auf die Bank.",
    scout_warning_offrole_data_present: "Signale aus einer anderen Rolle als der im Lineup: {count}. Ein Ban darauf trifft eventuell nicht die Lane, die du im Blick hast. Prüfe die Platzzuweisung oder die Rolle der Einträge.",
    scout_warning_substitute_risk_active: "Substitutes werden mitgewertet, betroffen sind {count} Einträge. Wer auf der Bank sitzt, spielt vielleicht nicht. Schalte Substitutes ab, wenn der Banplan nur die Startaufstellung treffen soll.",
    scout_warning_substitute_risk_activeOne: "Substitutes werden mitgewertet, betroffen ist {count} Eintrag. Wer auf der Bank sitzt, spielt vielleicht nicht. Schalte Substitutes ab, wenn der Banplan nur die Startaufstellung treffen soll.",
    scout_warning_data_loss_on_reparse: "Aus der Eingabe verschwunden: {count} Spieler mit Scout-Daten. Gelöscht wurde nichts. Die Daten liegen im Archiv, wo du sie zurückholen oder endgültig verwerfen kannst.",
    scout_warning_data_loss_on_reparseOne: "Aus der Eingabe verschwunden: {count} Spieler mit Scout-Daten. Gelöscht wurde nichts. Die Daten liegen im Archiv, wo du sie zurückholen oder endgültig verwerfen kannst.",

    // Tournament Scout — team ban plan
    scout_teamPlanTitle: "Team-Banplan",
    scout_safeBans: "Sichere Bans",
    scout_targetBans: "Gezielte Bans",
    scout_situationalBans: "Situative Bans",
    scout_overlapBans: "Bans gegen mehrere Spieler",
    scout_banAgainstRole: "gegen {role}",
    scout_banHitsRoles: "trifft {roles}",
    scout_banSubstituteOnly: "Nur Bank-Daten. Dieser Ban verpufft, wenn der Spieler nicht aufgestellt wird.",
    scout_flexWarning: "Flex-Gefahr: Dieser Champion taucht bei mehreren Spielern oder Rollen auf.",
    scout_teamPlanEmpty: "Für einen Banplan fehlen noch Scout-Daten.",

    // Tournament Scout — export
    scout_export_copy: "Banplan kopieren",
    scout_export_header: "Draft-Vorbereitung (Turnier Scout)",
    scout_export_copied: "Banplan kopiert",
    scout_export_failed: "Kopieren nicht möglich",

    // Tournament Scout — re-parse protection & archive of removed players
    scout_reparseConfirmTitle: "Erneut erkennen: Scout-Daten betroffen",
    scout_reparseConfirmBody: "Die Erkennung baut die Spielerliste komplett neu aus dem Eingabefeld auf. Für Spieler, die dort nicht mehr stehen, sind bereits Scout-Daten erfasst: Champions, Games, Winrates und Notizen. Diese Daten verschwinden aus der Liste und aus der Analyse. Leg sie ins Archiv, wenn du sie behalten willst.",
    scout_reparseKeepData: "Daten ins Archiv legen",
    scout_reparseDiscard: "Daten verwerfen",
    scout_reparseCancel: "Abbrechen",
    scout_removedPlayersTitle: "Archiv entfernter Spieler",
    scout_removedPlayersHint: "Spieler, die bei einer Neuerkennung aus der Eingabe gefallen sind. Ihre Daten liegen hier und zählen nicht in die Analyse.",
    scout_removedPlayersCapped: "Das Archiv fasst {max} Spieler. Kommt einer dazu, fällt der älteste heraus.",
    scout_restorePlayer: "Zurückholen",
    scout_restoreOverwriteConfirm: "Für diesen Spieler sind bereits Scout-Daten eingetragen. Zurückholen ersetzt sie vollständig durch die archivierten Champions, Games, Winrates und Notizen. Was jetzt in der Liste steht, ist danach weg. Trotzdem zurückholen?",
    scout_discardRemovedPlayer: "Endgültig verwerfen",

    // Tournament Scout — reset & errors
    scout_reset: "Zurücksetzen",
    scout_resetConfirm: "Wirklich alles zurücksetzen? Eingabe, erkannte Spieler und Scout-Daten gehen verloren.",
    scout_error_noInput: "Bitte zuerst Links oder Spielerzeilen einfügen.",
    scout_error_unrecognized: "Aus der Eingabe konnte kein Spieler gelesen werden. Prüfe die Links oder nutze das Format Name#TAG.",

    // Tournament Scout — Stats-Import: Panel-Rahmen
    scout_import_title: "Stats-Import",
    scout_import_hint: "Quelle öffnen, Champion-Stats kopieren, Rolle wählen, einfügen und Vorschau prüfen.",
    scout_import_honesty: "Das Tool holt nichts automatisch von OP.GG, League of Graphs, DeepLoL oder DPM. Fehlt ein Wert im eingefügten Text, bleibt er leer. Gerechnet wird nur mit dem, was du übernommen hast.",
    scout_import_step_player: "1. Spieler wählen",
    scout_import_step_role: "2. Rolle festlegen",
    scout_import_step_source: "3. Quelle öffnen",
    scout_import_step_paste: "4. Stats einfügen",
    scout_import_step_preview: "5. Vorschau prüfen und übernehmen",

    // Tournament Scout — Stats-Import: Spieler & Link
    scout_import_playerLabel: "Spieler",
    scout_import_playerPlaceholder: "Spieler auswählen",
    scout_import_playerNone: "Noch keine Spieler erkannt. Füge oben Links oder Spielerzeilen ein und starte die Erkennung. Danach kannst du hier für jeden Spieler Stats importieren.",
    scout_import_linkLabel: "Profil-Link oder Riot-ID",
    scout_import_linkPlaceholder: "https://www.op.gg/summoners/euw/Spieler-EUW oder Spieler#EUW",
    scout_import_linkButton: "Spieler übernehmen",
    scout_import_linkResolved: "Erkannt: {player}",
    scout_import_linkAdded: "{player} wurde zur Spielerliste hinzugefügt.",
    scout_import_linkNotResolved: "Daraus ließ sich kein Spieler lesen. Nutze einen vollständigen Profil-Link oder das Format Name#TAG.",

    // Tournament Scout — Stats-Import: Rolle, Quelle, Aktualität
    scout_import_roleLabel: "Rolle",
    scout_import_roleHint: "Alle Zeilen aus diesem Import bekommen die hier gewählte Rolle. Sonst zählt Karma aus 40 Support-Games plötzlich als Jungle-Ban.",
    scout_import_roleRequired: "Ohne Rolle kein Import. Wähle zuerst die Rolle, auf der dieser Spieler antritt.",
    scout_import_sourceLabel: "Quelle",
    scout_import_sourceHint: "Halte fest, woher die Zahlen stammen. Das ändert nichts an der Wertung.",
    scout_import_source_unknown: "Quelle unbekannt / nicht angegeben",
    scout_import_recencyLabel: "Aktualität",

    // Tournament Scout — Stats-Import: Paste-Feld
    scout_import_pasteLabel: "Champion-Stats einfügen",
    scout_import_pasteHint: "Die Kopfzeile darf mitkommen. Was keine Stat-Zeile ist, steht danach unter „Übersprungen“.",
    scout_import_pastePlaceholder: "Champion\tGames\tWin Rate\tKDA\nLee Sin\t24\t62%\t3.1\nViego\t18\t55%\t2.8",
    scout_import_parseButton: "Zeilen erkennen",
    scout_import_clearButton: "Eingabe leeren",
    scout_import_exampleButton: "Beispiel einfügen",
    scout_import_exampleHint: "Champions, Games und Winrates im Beispiel sind erfunden.",

    // Tournament Scout — Stats-Import: Importwege & automatischer Abruf
    scout_import_modeLabel: "Importweg",
    scout_import_mode_manual_paste: "Kopieren und einfügen",
    scout_import_mode_source_links: "Quellen öffnen",
    scout_import_autoFetchTitle: "Warum kein automatischer Abruf?",
    scout_import_autoFetchUnavailable: "{source} lässt sich im Browser nicht zuverlässig auslesen.",
    scout_import_autoFetchSummary: "Keine der vier Seiten lässt sich zuverlässig aus dem Browser auslesen. Deshalb kopierst du die Champion-Stats selbst.",
    scout_import_openSourcesTitle: "Quellen öffnen",

    // Tournament Scout — Stats-Import: erkanntes Format & Spalten
    scout_import_layoutLabel: "Erkanntes Format",
    scout_import_layout_tabular_with_header: "Tabelle mit Kopfzeile",
    scout_import_layout_tabular_no_header: "Tabelle ohne Kopfzeile",
    scout_import_layout_loose_lines: "Freie Zeilen ohne feste Spalten",
    scout_import_layout_unrecognized: "Format nicht erkannt",
    scout_import_columnsDetected: "Erkannte Spalten: {columns}",
    scout_import_column_champion: "Champion",
    scout_import_column_games: "Games",
    scout_import_column_winrate: "Winrate",
    scout_import_column_kda: "KDA",
    scout_import_column_cs: "CS",
    scout_import_column_csPerMin: "CS/min",
    scout_import_column_killParticipation: "KP",
    scout_import_column_damage: "Schaden",
    scout_import_column_role: "Rolle",

    // Tournament Scout — Stats-Import: Vorschau & Übernahme
    scout_import_previewTitle: "Vorschau",
    scout_import_previewHint: "Gespeichert wird nichts, bevor du unten bestätigst. Nimm vorher raus, was nicht passt.",
    scout_import_previewEmpty: "Noch nichts erkannt. Füge oben die Champion-Stats ein und starte die Erkennung.",
    scout_import_rowsDetected: "Erkannte Zeilen: {count}",
    scout_import_selectAll: "Alle auswählen",
    scout_import_selectNone: "Auswahl aufheben",
    scout_import_rowInclude: "Zeile übernehmen",
    scout_import_rowMissing: "keine Angabe",
    scout_import_row_detectedRole: "Quelle sagt: {role}",
    scout_import_row_appliedRole: "Wird übernommen als: {role}",
    scout_import_row_unknownChampion: "Nicht im Champion-Katalog",
    scout_import_confidenceLabel: "Erkennungssicherheit",
    scout_import_applyModeLabel: "Übernahme",
    scout_import_applyMode_append: "Ergänzen",
    scout_import_applyMode_replace: "Zeilen dieser Rolle ersetzen",
    scout_import_applyModeHint: "Ergänzen aktualisiert vorhandene Champion-Zeilen, statt sie zu doppeln. Ersetzen löscht nur die Zeilen dieser Rolle und importiert neu.",
    scout_import_applyButton: "In Scout-Daten übernehmen",
    scout_import_applied: "Übernommen: {count} Champion-Zeilen.",
    scout_import_appliedOne: "Übernommen: {count} Champion-Zeile.",
    scout_import_applyBlocked: "Noch nicht übernehmbar: Wähle oben die Rolle und mindestens eine Zeile aus.",
    scout_import_unparsedHint: "Diese Zeilen wurden nicht als Stat-Zeile gelesen. Steckt ein Champion darin, trage ihn von Hand nach.",

    // Tournament Scout — Stats-Import: Gründe für nicht erkannte Zeilen
    scout_import_unparsed_header: "Kopfzeile erkannt und übersprungen.",
    scout_import_unparsed_no_champion: "Kein Championname in der Zeile gefunden.",
    scout_import_unparsed_no_numbers: "Keine Zahlen in der Zeile gefunden. Ohne Games oder Winrate ist es keine Stat-Zeile.",
    scout_import_unparsed_noise: "Sieht nach mitkopiertem Seiteninhalt aus, etwa nach Navigation, Werbung oder Fußzeile.",

    // Tournament Scout — Stats-Import: Warnungen (scout_import_warning_<code>)
    scout_import_warning_empty_input: "Das Eingabefeld ist leer. Kopiere die Champion-Stats von der geöffneten Seite und füge sie hier ein.",
    scout_import_warning_no_rows_detected: "Im eingefügten Text steckt keine erkennbare Stat-Zeile. Kopiere die Champion-Tabelle mitsamt Zahlen. Fließtext allein reicht nicht.",
    scout_import_warning_header_not_recognized: "Die Kopfzeile wurde nicht erkannt. Kopiere sie mit, dann steht die Spaltenzuordnung fest.",
    scout_import_warning_columns_guessed: "Ohne erkannte Kopfzeile wurden die Spalten aus der Form der Werte geraten: Prozentzeichen als Winrate, ganze Zahlen als Games. Prüfe die Vorschau, bevor du übernimmst.",
    scout_import_warning_unknown_champion: "„{champion}“ steht nicht im Champion-Katalog. Prüf die Schreibweise, sonst wird die Zeile genau so übernommen, wie sie dasteht.",
    scout_import_warning_missing_games: "Für {champion} stand keine Games-Zahl im eingefügten Text. Geraten wird sie nicht, und ohne sie lässt sich die Zeile nicht übernehmen.",
    scout_import_warning_missing_winrate: "Für {champion} stand keine Winrate im eingefügten Text. Geraten wird sie nicht, und ohne sie lässt sich die Zeile nicht übernehmen.",
    scout_import_warning_value_out_of_range: "Bei {champion} liegt ein Wert außerhalb des Erlaubten, etwa eine Winrate über 100. Prüfe die Zeile in der Vorschau.",
    scout_import_warning_duplicate_champion: "{champion} kommt im eingefügten Text mehrfach vor. Übernimm nur eine der Zeilen, sonst zählt der Champion doppelt.",
    scout_import_warning_role_mismatch: "Die Quelle nennt {detectedRole}, übernommen wird aber {selectedRole}. Deine Auswahl gilt, still überschrieben wird nichts.",
    scout_import_warning_row_not_parsed: "Mindestens eine Zeile wurde nicht als Stat-Zeile gelesen. Was übersprungen wurde, steht unter den nicht erkannten Zeilen.",
    scout_import_warning_source_mismatch: "Der Text sieht nach {detected} aus, ausgewählt ist aber {selected}. Korrigiere die Quelle, damit später nachvollziehbar bleibt, woher die Zahlen kommen.",

    // Tournament Scout — Stats-Import: OP.GG Roh-Copy der Champions-Seite
    scout_import_layout_opgg_raw_champion_page: "Roh kopierte OP.GG-Champions-Seite. Die Werte stehen zeilenweise untereinander statt in Spalten.",
    scout_import_warning_winrate_mismatch: "Für {champion} nennt OP.GG {stated}%, aus Siegen und Niederlagen ergeben sich aber {computed}%. Übernommen wird der Wert von OP.GG, still korrigiert wird nichts; sieh dir die Zeile also selbst an.",
    scout_import_unparsed_matchup_row: "Eine „vs …“-Zeile: ein Matchup innerhalb eines Champions, keine eigene Zeile des Championpools. Wird übersprungen.",
    scout_import_unparsed_recommended_champion: "Ein Champion aus dem Empfehlungsbereich oben auf der Seite. Das ist ein Vorschlag von OP.GG, keine gespielte Statistik. Deshalb wird er nicht übernommen.",
    scout_import_unparsed_aggregate_row: "Die Summenzeile „Alle Champions“: ein Gesamtwert über alle Champions, kein einzelner Champion.",
    scout_import_opggHowTo: "OP.GG: Profil öffnen, Reiter „Champions“, ab „Alle Champions“ markieren und hier einfügen. Der Rest der Seite darf mitkommen.",
    scout_import_opggRawDetected: "OP.GG Roh-Copy der Champions-Seite erkannt",
    scout_import_opggRawChampions: "{count} Champions erkannt.",
    scout_import_opggRawChampionsOne: "{count} Champion erkannt.",
    scout_import_opggRawRoleNote: "Die OP.GG-Championliste nennt keine Rolle. Alle übernommenen Zeilen bekommen die oben gewählte Rolle.",

    // Tournament Scout — Stats-Import: kompakte Übersprungen-Summary
    scout_import_unparsed_page_noise: "Hier stand nur ein Trennzeichen der Seite, etwa ein „-“, ein Strich oder ein dekorativer Marker ohne Dateninhalt. Solche Zeilen stehen nicht in der Vorschau, sondern nur hier unter „Details anzeigen“.",
    scout_import_skippedTitle: "Übersprungen",
    scout_import_skippedAggregate: "Die Summenzeile „Alle Champions“ wurde ignoriert. Sie ist ein Gesamtwert über alle Champions, kein einzelner Champion.",
    scout_import_skippedMatchups: "{count} Matchup-Blöcke ignoriert. Sie gehören zu einem Champion, sind aber keine eigenen Zeilen des Championpools.",
    scout_import_skippedMatchupsOne: "{count} Matchup-Block ignoriert. Er gehört zu einem Champion, ist aber keine eigene Zeile des Championpools.",
    scout_import_skippedRecommended: "{count} empfohlene Champions ignoriert. Es sind Vorschläge von OP.GG, keine gespielten Statistiken.",
    scout_import_skippedRecommendedOne: "{count} empfohlener Champion ignoriert. Es ist ein Vorschlag von OP.GG, keine gespielte Statistik.",
    // BEWUSST OHNE {count}: der Zähler dahinter erfasst nur Trennzeichen an einer
    // Blockstart-Position, nicht jede ausgeblendete Zeile. Der Satz nennt deshalb
    // keine Anzahl, statt eine falsche zu behaupten — siehe ScoutStatsImportPanel.
    scout_import_skippedNoise: "Reine Trennzeichen- und Strukturzeilen der Seite wurden ausgeblendet. Sie tragen keine Daten.",
    scout_import_skippedDetails: "Details anzeigen",
} as const
