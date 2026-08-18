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

    // Tournament Scout — header
    scout_title: "Turnier Scout",
    scout_intro: "Füge OP.GG-Multilinks oder einzelne Profil-Links deiner Gegner ein — das Tool erkennt daraus die Spieler und sortiert sie nach Rolle. Ergänze die Scout-Daten, die du auf den verlinkten Seiten findest, und du bekommst Ban-Empfehlungen mit Begründung. Je mehr du einträgst, desto belastbarer wird der Vorschlag.",
    scout_dataHonesty: "Dieser Tab liest OP.GG, League of Graphs, DeepLoL oder DPM nicht selbst aus — eine Browser-App darf das nicht, und die Seiten erlauben es auch nicht. Das Tool erkennt deshalb die Spieler und baut dir die passenden Links. Champion, Games und Winrate schaust du dort nach und trägst sie hier ein. Gerechnet wird ausschließlich mit dem, was wirklich eingetragen ist — nichts wird geschätzt oder ergänzt.",

    // Tournament Scout — input
    scout_inputLabel: "Links oder Spielerzeilen einfügen",
    scout_inputPlaceholder: "https://www.op.gg/multisearch/euw?summoners=Spieler1%23EUW,Spieler2%23EUW\nhttps://www.leagueofgraphs.com/summoner/euw/Spieler3-EUW\nMid: Spieler4#EUW\nSupport Spieler5#EUW1",
    scout_parseButton: "Spieler erkennen",
    scout_clearButton: "Eingabe leeren",
    scout_exampleButton: "Beispiel einfügen",
    scout_exampleHint: "Das Beispiel zeigt nur, wie die Eingabe aussehen kann. Namen und Links sind erfunden und enthalten keine echten Spielerdaten.",

    // Tournament Scout — parse result
    scout_parsedPlayers: "Erkannte Spieler",
    scout_noPlayers: "Noch keine Spieler erkannt. Füge oben Links oder Spielerzeilen ein und starte die Erkennung.",
    scout_unparsedLines: "Nicht erkannte Zeilen",
    scout_unparsedHint: "Diese Zeilen konnten keinem Spieler zugeordnet werden. Ergänze die Riot-ID im Format Name#TAG oder füge einen vollständigen Profil-Link ein.",
    scout_duplicatesMerged: "Mehrfach genannte Spieler wurden zu einem Eintrag zusammengeführt.",
    scout_countPlayers: "Erkannte Spieler: {count}",
    scout_countUnparsed: "Nicht erkannte Zeilen: {count}",
    scout_countDuplicates: "Zusammengeführte Doppelnennungen: {count}",

    // Tournament Scout — reasons for unparsed lines (UnparsedLineReason)
    scout_unparsed_no_riot_id: "Keine Riot-ID gefunden — erwartet wird Name#TAG.",
    scout_unparsed_invalid_riot_id: "Riot-ID unvollständig — Name oder Tag fehlt.",
    scout_unparsed_malformed_url: "Link ist unvollständig oder fehlerhaft.",
    scout_unparsed_unknown_url_host: "Unbekannte Seite — unterstützt werden OP.GG, League of Graphs, DeepLoL und DPM.",
    scout_unparsed_unsupported_url_shape: "Seite erkannt, aber diese Unterseite enthält keine Riot-ID — nutze den direkten Profil-Link.",
    scout_unparsed_empty_multilink: "Multilink erkannt, aber ohne Spieler darin.",

    // Tournament Scout — player card
    scout_player_riotId: "Riot-ID",
    scout_player_region: "Region",
    scout_player_role: "Rolle",
    scout_player_sources: "Quellen",
    scout_player_noSources: "Kein Profil-Link vorhanden. Suche den Spieler direkt auf OP.GG und trage die Werte unten ein.",
    scout_player_openSource: "Profil auf {source} öffnen",
    scout_player_remove: "Spieler entfernen",
    scout_player_removeConfirm: "Diesen Spieler wirklich entfernen? Seine Scout-Daten — alle Champions, Games, Winrates und Notizen — werden mitgelöscht und lassen sich nicht wiederherstellen.",

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
    scout_status_parsed_from_url: "Aus dem Link übernommen — Name, Tag und Region stehen fest.",
    scout_status_source_link_only: "Nur Link — öffne die Seite und trage die Werte unten selbst ein.",
    scout_status_manual_required: "Manuelle Eingabe nötig — ohne Scout-Daten fließt dieser Spieler nicht in die Analyse ein.",
    scout_status_not_supported_in_browser: "Automatisches Auslesen ist im Browser nicht möglich — nutze den Link.",
    scout_status_error: "Link konnte nicht verarbeitet werden — bitte prüfen oder neu einfügen.",

    // Tournament Scout — source notes (ScoutSourceNoteCode)
    scout_note_identity_from_url: "Spieler aus diesem Link gelesen.",
    scout_note_profile_link_generated: "Profil-Link aus Name, Tag und Region gebaut.",
    scout_note_url_format_heuristic: "Link-Format ist geraten — er kann ins Leere führen.",
    scout_note_region_unknown: "Region unbekannt — ohne sie lässt sich kein Link bauen.",
    scout_note_tagline_unknown: "Tag fehlt — ohne #TAG lässt sich kein Link bauen.",
    scout_note_identity_incomplete: "Name unvollständig oder unbrauchbar.",
    scout_note_direct_fetch_not_supported: "Diese Seite wird nicht abgerufen, nur verlinkt.",
    scout_note_unknown_url_shape: "Seite erkannt, das Adressformat aber nicht.",

    // Tournament Scout — why a source is not fetched (ScoutFetchBlockedCode)
    scout_blocked_no_public_api: "Für diese Seite ist keine öffentliche Schnittstelle dokumentiert.",
    scout_blocked_cors_blocked: "Die Schnittstelle erlaubt keine Zugriffe aus einer fremden Webseite heraus.",
    scout_blocked_anti_bot_protection: "Die Seite ist gegen automatische Zugriffe geschützt — ein Abruf wäre unzuverlässig.",
    scout_blocked_html_scraping_only: "Die Werte stehen nur im Seiten-HTML. Sie dort auszulesen wäre fehleranfällig und von den Nutzungsbedingungen nicht gedeckt.",
    scout_blocked_undocumented_private_api: "Technisch gäbe es einen Zugang, aber es ist die interne Schnittstelle der Seite: nicht dokumentiert, ohne Zusage der Betreiber, jederzeit änderbar. Sie wird deshalb bewusst nicht genutzt.",
    scout_blocked_unverified: "Nicht geprüft — wird bis auf Weiteres als nicht abrufbar behandelt.",
    // Tournament Scout — manual scouting data
    scout_manualTitle: "Scout-Daten",
    scout_manualHint: "Trage ein, was du auf den verlinkten Seiten siehst. Champion und Games reichen für einen ersten Vorschlag, Winrate und Aktualität machen ihn genauer.",
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
    scout_manual_recencyHint: "Aktuellere Einträge zählen in der Analyse stärker — ältere fließen abgeschwächt mit ein.",
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
    scout_lineupHint: "Weise jedem Spieler seinen Platz zu: fünf Startplätze und bis zu drei Substitutes. Mit einer Aufstellung weiß die Analyse, welche Rolle wirklich zu wem gehört — Ban-Empfehlungen bekommen dann eine Lane („gegen Mid“), und Einträge aus einer anderen Rolle werden als solche gekennzeichnet. Ohne Aufstellung rechnet das Tool weiter, nur ohne Rollenbezug.",
    scout_startingFive: "Startaufstellung",
    scout_substitutes: "Substitutes",
    scout_unassigned: "Nicht zugewiesen",
    scout_unassignedHint: "Erkannte Spieler, die auf keinem Platz stehen. Sie bleiben erhalten und behalten ihre Scout-Daten — ohne Platz lässt sich ihre Rolle aber nicht abgleichen.",
    scout_lineupEmptySlot: "Frei — Spieler zuweisen",
    scout_assignTo: "Platz zuweisen",
    scout_moveToPool: "Aus der Aufstellung nehmen",
    scout_alreadyAssigned: "Dieser Spieler steht bereits auf einem anderen Platz — nimm ihn dort zuerst heraus.",
    scout_lineupComplete: "Startaufstellung vollständig — alle fünf Rollen sind besetzt.",
    scout_lineupIncomplete: "Startaufstellung noch unvollständig — besetze die freien Rollen, damit der Banplan jede Lane abdeckt.",
    scout_lineupAutofill: "Aus erkannten Rollen füllen",
    scout_lineupAutofillHint: "Übernimmt die Rollen, die beim Erkennen aus deinen Zeilen und Links gelesen wurden. Das ist eine Vermutung aus der Eingabe, keine gesicherte Aufstellung — prüfe jeden Platz nach, bevor du dich darauf verlässt.",
    scout_lineupClear: "Aufstellung leeren",
    scout_includeSubstitutes: "Substitutes mitwerten",
    scout_includeSubstitutesHint: "Aus: Substitutes werden angezeigt und bleiben editierbar, liefern aber keine Signale und keine Ban-Kandidaten. An: Ihre Daten zählen mit, allerdings abgeschwächt — ein Substitute verdrängt damit keinen vergleichbar starken Starter.",
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
    scout_lowData: "Dünne Datenlage — trage mehr Champions oder Games ein, damit die Empfehlung belastbar wird.",
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
    scout_reason_high_winrate_many_games: "{winrate}% Winrate auf {games} Games — belastbares Sample.",
    scout_reason_high_winrate_small_sample: "{winrate}% Winrate, aber nur {games} Games.",
    scout_reason_signature_pick: "Signature Pick — großer Anteil der erfassten Games.",
    scout_reason_one_trick: "One-Trick-Niveau auf diesem Champion.",
    scout_reason_high_games_low_winrate: "{games} Games, aber nur {winrate}% Winrate — eher Schwachstelle als Bedrohung.",
    scout_reason_flex_across_roles: "Flex — wird auf mehreren Rollen gespielt.",
    scout_reason_played_recently: "Im aktuellen Patch gespielt.",
    scout_reason_stale_data: "Nur ältere Daten — als Tendenz werten.",
    scout_reason_small_sample: "Nur {games} Games — kleine Sample Size.",
    scout_reason_no_data: "Keine Scout-Daten eingetragen.",
    scout_reason_manual_entry_only: "Manuell eingetragen — nichts automatisch abgerufen.",
    scout_reason_hits_multiple_players: "Trifft {count} Spieler im gegnerischen Team.",
    scout_reason_meta_priority: "Hohe Priorität im Pro Play der gewichteten Patches.",
    scout_reason_role_specific_threat: "Bedrohung vor allem auf {role}.",
    scout_reason_user_marked_priority: "Von dir als Priorität markiert.",
    scout_reason_onrole_signal: "Auf {role} gespielt und dort auch aufgestellt — ein Ban trifft genau diese Lane.",
    scout_reason_offrole_signal: "Auf {signalRole} gespielt, aufgestellt aber als {lineupRole} — ein Ban trifft die geplante Lane möglicherweise nicht.",
    scout_reason_role_unknown_or_flex: "Rolle unklar oder Flex — Signal: {signalRole}, Lineup: {lineupRole}. Welche Lane ein Ban hier trifft, steht nicht fest.",
    scout_reason_substitute_risk: "Stammt von einem Substitute, der möglicherweise gar nicht ins Spiel kommt — das Signal wird deshalb auf {weight} abgeschwächt gewertet.",
    scout_reason_player_without_lineup_role: "Spieler steht auf keinem Platz im Lineup — die Daten sind als {role} erfasst, bestätigt ist diese Rolle damit aber nicht. Ohne Platz ist kein Rollenabgleich möglich.",

    // Tournament Scout — warning codes (ScoutWarningCode)
    scout_warning_player_without_data: "Für mindestens einen Spieler fehlen Scout-Daten — er bleibt in der Analyse außen vor. Trage seine Champions nach.",
    scout_warning_small_sample_overall: "Insgesamt wenige Games erfasst. Ein paar Einträge mehr machen den Banplan deutlich belastbarer.",
    scout_warning_stale_data_overall: "Die meisten Einträge sind älter. Prüfe auf den verlinkten Seiten, was gerade gespielt wird.",
    scout_warning_flex_pick_warning: "Mindestens ein Champion taucht auf mehreren Rollen auf — ein Ban trifft dann eventuell nicht die Rolle, die du meinst.",
    scout_warning_meta_shift_possible: "Zwischen den erfassten Games und dem aktuellen Patch kann sich die Meta verschoben haben. Nur zur Einordnung — nichts zu tun.",
    scout_warning_source_not_fetchable: "Mindestens eine Quelle lässt sich nicht direkt abrufen. Öffne den Link und trage die Werte selbst ein.",
    scout_warning_conflicting_entries: "Für denselben Champion stehen sich widersprechende Einträge gegenüber. Prüfe Games und Winrate.",
    scout_warning_duplicate_players_merged: "Mehrfach genannte Spieler wurden zusammengeführt. Nichts zu tun — prüfe im Zweifel die Riot-IDs.",
    scout_warning_incomplete_starting_five: "Noch freie Startplätze: {missing}. Der Banplan deckt nur die besetzten Rollen ab — weise die übrigen Spieler zu.",
    scout_warning_player_without_lineup_role: "Spieler mit Scout-Daten ohne Platz im Lineup: {count}. Ihre Signale lassen sich keiner Rolle zuordnen — setze sie in die Startaufstellung oder auf die Bank.",
    scout_warning_offrole_data_present: "Signale aus einer anderen Rolle als der im Lineup: {count}. Ein Ban darauf trifft eventuell nicht die Lane, die du im Blick hast — prüfe die Platzzuweisung oder die Rolle der Einträge.",
    scout_warning_substitute_risk_active: "Substitutes werden mitgewertet, betroffen sind {count} Einträge. Wer auf der Bank sitzt, spielt vielleicht nicht — schalte Substitutes ab, wenn der Banplan nur die Startaufstellung treffen soll.",
    scout_warning_data_loss_on_reparse: "Aus der Eingabe verschwunden: {count} Spieler mit Scout-Daten. Gelöscht wurde nichts — die Daten liegen im Archiv, wo du sie zurückholen oder endgültig verwerfen kannst.",

    // Tournament Scout — team ban plan
    scout_teamPlanTitle: "Team-Banplan",
    scout_safeBans: "Sichere Bans",
    scout_targetBans: "Gezielte Bans",
    scout_situationalBans: "Situative Bans",
    scout_overlapBans: "Bans gegen mehrere Spieler",
    scout_banAgainstRole: "gegen {role}",
    scout_banHitsRoles: "trifft {roles}",
    scout_banSubstituteOnly: "Nur Bank-Daten — dieser Ban verpufft, wenn der Spieler nicht aufgestellt wird.",
    scout_flexWarning: "Flex-Gefahr: Dieser Champion taucht bei mehreren Spielern oder Rollen auf.",
    scout_teamPlanEmpty: "Für einen Banplan fehlen noch Scout-Daten.",

    // Tournament Scout — export
    scout_export_copy: "Banplan kopieren",
    scout_export_header: "Draft-Vorbereitung — Turnier Scout",
    scout_export_copied: "Banplan kopiert",
    scout_export_failed: "Kopieren nicht möglich",

    // Tournament Scout — re-parse protection & archive of removed players
    scout_reparseConfirmTitle: "Erneut erkennen — Scout-Daten betroffen",
    scout_reparseConfirmBody: "Die Erkennung baut die Spielerliste komplett neu aus dem Eingabefeld auf. Für Spieler, die dort nicht mehr stehen, sind bereits Scout-Daten erfasst — Champions, Games, Winrates und Notizen. Diese Daten verschwinden aus der Liste und aus der Analyse. Leg sie ins Archiv, wenn du sie behalten willst.",
    scout_reparseKeepData: "Daten ins Archiv legen",
    scout_reparseDiscard: "Daten verwerfen",
    scout_reparseCancel: "Abbrechen",
    scout_removedPlayersTitle: "Archiv entfernter Spieler",
    scout_removedPlayersHint: "Spieler, die bei einer Neuerkennung aus der Eingabe gefallen sind. Ihre Scout-Daten liegen hier unangetastet und zählen nicht in die Analyse. Zurückholen bringt Spieler samt Daten wieder in die Liste, Verwerfen löscht sie endgültig.",
    scout_removedPlayersCapped: "Das Archiv fasst {max} Spieler. Kommt einer dazu, fällt der jeweils älteste Eintrag heraus — hol dir also zurück, was du noch brauchst.",
    scout_restorePlayer: "Zurückholen",
    scout_restoreOverwriteConfirm: "Für diesen Spieler sind bereits Scout-Daten eingetragen. Zurückholen ersetzt sie vollständig durch die archivierten Champions, Games, Winrates und Notizen — was jetzt in der Liste steht, ist danach weg. Trotzdem zurückholen?",
    scout_discardRemovedPlayer: "Endgültig verwerfen",

    // Tournament Scout — reset & errors
    scout_reset: "Zurücksetzen",
    scout_resetConfirm: "Wirklich alles zurücksetzen? Eingabe, erkannte Spieler und Scout-Daten gehen verloren.",
    scout_error_noInput: "Bitte zuerst Links oder Spielerzeilen einfügen.",
    scout_error_unrecognized: "Aus der Eingabe konnte kein Spieler gelesen werden. Prüfe die Links oder nutze das Format Name#TAG.",
} as const
