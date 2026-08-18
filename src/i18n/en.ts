import type { Translations } from "./types"

export const en: Translations = {
    tab_champions: "Champions",
    tab_draftHelper: "Draft Helper",
    tab_teamDashboard: "Team Dashboard",
    tab_playerResults: "Player Results",
    tab_synergies: "Synergies",
    tab_matchups: "Matchups",
    tab_roles: "Roles",
    tab_patches: "Patches",
    tab_tournamentScout: "Tournament Scout",

    filter_title: "Filters",
    filter_reset: "Reset",
    filter_patch: "Patch",
    filter_region: "Region",
    filter_tournament: "Tournament",
    filter_role: "Role",
    filter_minPicks: "Min. Picks",
    filter_all: "All",
    filter_show: "Show filters",
    filter_hide: "Hide filters",

    ds_sampleActive: "Sample data active",
    ds_sampleNote: "No imported Oracle's Elixir data found.",
    ds_synced: "Oracle's Elixir data loaded",
    ds_lastSync: "Last sync:",
    ds_dataUpTo: "Match data up to:",
    ds_dateRange: "Date range:",
    ds_latestPatch: "Latest patch:",
    ds_matches: "Matches:",
    ds_dismiss: "Dismiss data notice",

    section_championStats: "Champion Statistics",
    section_synergies: "Top Synergies",
    section_champMatchups: "Champion Matchups (role-agnostic)",
    section_matchupsByRole: "Matchups by Role",
    section_champStatsByRole: "Champion Stats by Role",
    section_patchComparison: "Patch Comparison",

    dash_filtered: "Filtered matches",
    dash_total: "Total matches",

    app_loading: "Loading match data…",
    app_noMatches: "No valid matches found in the data.",

    // Data load error / warning banners
    dataLoad_matchesErrorTitle: "Live data could not be loaded.",
    dataLoad_matchesErrorBody:
        "The app currently shows no imported match data. Please reload the page or try again later.",
    dataLoad_syncReportError: "Sync status could not be loaded.",
    dataLoad_retryButton: "Retry loading",
    dataLoad_retrying: "Loading…",

    // DraftHelper — header & controls
    dh_patchInfo: "Recommendations use a weighted patch selection:",
    dh_rawSample: "Raw sample:",
    dh_weightedSample: "weighted sample:",
    dh_games: "games",
    dh_resetDraft: "Reset draft",
    dh_minPicksLabel: "Minimum picks per role",
    dh_excludeBans: "Exclude banned champions from recommendations",

    // Series panel
    dh_seriesTitle: "Series / Fearless Draft",
    dh_savedGames: "saved games:",
    dh_fearlessLocked: "Fearless locked:",
    dh_fearlessOff: "Fearless OFF",
    dh_fearlessOn: "Fearless ON",
    dh_saveGame: "Save game",
    dh_nextGame: "Next game",
    dh_copyDraft: "Copy draft",
    dh_resetSeries: "Reset series",
    dh_fearlessPool: "Fearless Pool:",
    dh_draftCopied: "Draft copied",
    dh_copyFailed: "Copy not possible",
    dh_noDraftYet: "No draft captured yet.",

    // Draft flow
    dh_draftFlow: "Draft flow:",
    dh_flowActive: "Active",
    dh_flowEnable: "Enable",
    dh_stepBack: "Step back",
    dh_manualMode: "Manual mode",
    dh_flowUpNext: "Up next:",

    // Recommendation side
    dh_liveRecsFor: "Live recommendations for:",

    // Patch weighting panel
    dh_patchWeightTitle: "Patch weighting",
    dh_patchWeightDesc: "Controls how strongly recent and older patches count in draft recommendations, flex detection, ban AI and draft edge.",
    dh_patchWeightNote: "A new patch stays important, but older patches can stabilize small samples.",
    dh_resetPatchWeight: "Reset patch weighting",
    dh_currentPatch: "Latest patch",
    dh_patchOld1: "patch old",
    dh_patchOldN: "patches old",

    // Patch weight preset labels
    dh_pPreset_balanced: "Balanced",
    dh_pPreset_currentFocused: "Current focus",
    dh_pPreset_stable: "Meta stable",
    dh_pPreset_currentOnly: "Current only",

    // Weighting panel
    dh_weightTitle: "Weighting",
    dh_weightDesc: "Controls how recommendations are sorted. Not a neural-network clone like LoLDraftAI, but gives the same idea: the whole draft is re-evaluated by priority, synergy, matchups and role strength.",
    dh_resetWeight: "Reset weighting",

    // Weight labels (used in sliders)
    dh_wLabel_draftPriority: "Champion Priority",
    dh_wLabel_roleStats: "Role Strength",
    dh_wLabel_synergy: "Synergy",
    dh_wLabel_matchup: "Matchup / Counter",
    dh_wLabel_winRate: "Win Rate",
    dh_wLabel_sampleSize: "Sample Size",
    dh_wLabel_teamPool: "Team Pool",

    // Draft Edge section
    dh_edgeDesc: "Heuristic draft evaluation based on your pro play data. Not calibrated as a real win rate.",
    dh_rolesSet: "Roles set",
    dh_strengthsData: "Strengths / Data points",
    dh_noWarnings: "No notable warnings found.",
    dh_compProfile: "Comp Profile",
    dh_compStrengths: "Strengths",
    dh_noStrengths: "No clear comp strengths detected yet.",
    dh_tagsOpen: "Still open",

    // Next decision section
    dh_nextDecision: "Next Decision",
    dh_flowLabel: "Flow:",
    dh_activeSlot: "Active slot:",
    dh_selectSlotHint: "· select a pick or ban slot.",
    dh_picksNote: "Picks are now champion priority first. Assign role via dropdown afterwards.",
    dh_ownPicks: "Own picks",
    dh_enemyPicks: "Enemy picks",
    dh_candidates: "Candidates",

    // Champion pool panel
    dh_poolTitle: "Champion Pool",
    dh_selectBanFor: "Select champion to ban for",
    dh_selectBanSuffix: "",
    dh_selectPickFor: "Select champion for",
    dh_selectPickSlot: "pick",
    dh_selectPickSuffix: "",
    dh_selectSlotFirst: "First select a pick or ban slot.",

    // Role recommendations grid
    dh_roleAlreadyFilled: "Role already picked:",
    dh_noCandidates: "No candidates in the current weighted patch selection.",

    // Side panel summary
    dh_assignedRoles: "Assigned roles:",

    // Pick/ban slot UI
    dh_selectPickPlaceholder: "Select pick",
    dh_assignRoleTitle: "Assign role",
    dh_removePick: "Remove pick",
    dh_removeBan: "Remove ban",

    // Ban recommendations
    dh_bestBansTitle: "Best Bans against",
    dh_banRecsDesc: "Bans block the best available recommendations for the opponent.",
    dh_noBanRecs: "No ban recommendations available.",

    // Best next picks table
    dh_bestPicksTitle: "Best next picks for",
    dh_noRecs: "No recommendations found. Reduce min picks or check your filters.",
    dh_tableReasons: "Reasons",

    // Pick/recommendation button tooltips
    dh_roleOccupied: "Role occupied",
    dh_applyPick: "Apply pick",

    // Draft recommendation reasons
    reason_highMetaPriority: "High meta priority",
    reason_strongRoleData: "Strong role-specific data",
    reason_goodSynergy: "Good synergy with your comp",
    reason_goodMatchup: "Good matchup into enemy pick",
    reason_verySmallSample: "Very small sample size",
    reason_smallSample: "Small sample size",
    reason_solidCandidate: "Solid data-based candidate",

    // Ban recommendation reasons
    ban_blocksOpenRole: "blocks open",
    ban_strongCounter: "strong counter value",
    ban_strongSynergy: "strong synergy option",
    ban_highDraftValue: "high opponent draft value",

    // Comp profile — warning titles
    comp_warnTitle_rolesOpen: "Roles still open",
    comp_warnTitle_dupRole: "Duplicate role assignment",
    comp_warnTitle_lowFrontline: "Low frontline",
    comp_warnTitle_lowEngage: "Limited engage tools",
    comp_warnTitle_adHeavy: "AD-heavy",
    comp_warnTitle_apHeavy: "AP-heavy",
    comp_warnTitle_lowScaling: "Limited scaling",

    // Comp profile — warning descriptions
    comp_warnDesc_rolesOpen: "Not yet assigned:",
    comp_warnDesc_dupRole: "Check:",
    comp_warnDesc_lowFrontline: "The comp has no clear champion who can reliably take space.",
    comp_warnDesc_lowEngage: "Missing engage or pick potential to start fights in a controlled manner.",
    comp_warnDesc_adHeavy: "Enemy can stack armor more easily. Consider adding AP/magic damage.",
    comp_warnDesc_apHeavy: "Enemy can stack magic resist more easily. Consider adding AD damage.",
    comp_warnDesc_lowScaling: "The comp feels early/mid-game focused. Consider a snowball plan.",

    // Comp profile — strengths
    comp_strength_frontline: "Front-to-back core present: frontline plus scaling damage.",
    comp_strength_engage: "Good fight initiation: engage and dive tools present.",
    comp_strength_poke: "Strong objective preparation: multiple poke sources.",
    comp_strength_pick: "High catch potential: multiple pick tools.",
    comp_strength_peel: "Carry protection present: peel supports scaling champions.",
    comp_strength_mixed: "Mixed damage profile makes defensive itemization harder.",
    comp_strength_clean: "No major structural weaknesses detected.",

    // Comp profile — metric descriptions
    comp_metricDesc_frontline: "How reliably can the comp take space and absorb damage?",
    comp_metricDesc_engage: "How well can the comp initiate fights?",
    comp_metricDesc_peel: "How well does the comp protect carries?",
    comp_metricDesc_poke: "How well can the comp chip before objectives?",
    comp_metricDesc_pick: "How well can the comp punish isolated targets?",
    comp_metricDesc_scaling: "How well does the comp perform in later teamfights?",

    // Comp profile — identity and damage labels
    comp_identity_hybrid: "Hybrid / open",
    comp_damage_unknown: "Unknown",
    comp_damage_adHeavy: "AD-heavy",
    comp_damage_apHeavy: "AP-heavy",
    comp_damage_mixed: "Mixed",

    // Champion pool
    pool_searchPlaceholder: "Search champion...",
    pool_noChampion: "No champion found.",

    // Similar Pro Play Drafts
    similarDrafts_title: "Similar Pro Play Drafts",
    similarDrafts_needMoreInput: "Enter at least 1 pick to find similar drafts.",
    similarDrafts_noResults: "No similar drafts found.",
    similarDrafts_similarity: "Similarity",
    similarDrafts_winner: "Winner",
    similarDrafts_matchedBans: "Matched bans",

    // Champion Notes
    cn_title: "Champion Notes",
    cn_selectChampion: "Champion",
    cn_note: "Note",
    cn_tags: "Tags (comma-separated)",
    cn_rating: "Rating",
    cn_save: "Save",
    cn_saved: "Saved",
    cn_delete: "Delete",
    cn_noRating: "— No rating —",
    cn_relevantNotes: "Notes for drafted champions",
    cn_noDraftedNotes: "No notes for current picks.",
    cn_editNote: "Edit note",
    cn_rating_comfort: "Comfort",
    cn_rating_situational: "Situational",
    cn_rating_avoid: "Avoid",
    cn_rating_blind: "Blind Pick",
    cn_rating_pocket: "Pocket Pick",
    cn_rating_needs_practice: "Needs Practice",

    // Auth
    auth_login: "Login",
    auth_logout: "Logout",
    auth_signUp: "Sign Up",
    auth_email: "Email",
    auth_password: "Password",
    auth_sendMagicLink: "Send Magic Link",
    auth_magicLinkSent: "Check your email!",
    auth_unavailable: "Auth not configured.",
    auth_loggedInAs: "Logged in as",
    auth_username: "Username",
    auth_invalidUsername: "Username must be 3–32 characters and may only contain a-z, 0-9, _ and -.",
    auth_error: "Error",
    auth_loading: "Loading…",

    // Teams
    team_myTeams: "My Teams",
    team_createTeam: "Create Team",
    team_teamName: "Team Name",
    team_activeTeam: "Active Team",
    team_noTeam: "No team yet. Create one to share notes.",
    team_create: "Create",
    team_switchTeam: "Switch team",
    team_members: "Members",
    team_addMember: "Add member",
    team_username: "Username",
    team_role: "Role",
    team_owner: "Owner",
    team_admin: "Admin",
    team_player: "Player",
    team_removeMember: "Remove",
    team_changeRole: "Change role",
    team_memberAdded: "Member added",
    team_memberRemoved: "Member removed",
    team_memberNotFound: "Username not found.",
    team_cannotManageMembers: "No permission to manage members.",
    team_noMembers: "No members yet.",
    team_manageMembers: "Manage members",
    team_dashboard: "Team Dashboard",
    team_yourRole: "Your Role",
    team_notesSummary: "Champion Notes",
    team_quickActions: "Actions",
    team_dangerZone: "Danger Zone",
    team_createFirstTeam: "Create your first team",
    // Invite codes
    invite_manageInvites: "Invites",
    invite_createInvite: "Create Invite",
    invite_copy: "Copy",
    invite_copied: "Copied!",
    invite_revoke: "Revoke",
    invite_revoked: "Invite revoked.",
    invite_noInvites: "No active invites.",
    invite_join: "Join",
    invite_joinCodePlaceholder: "XXXX-XXXX-XXXX",
    invite_invalidCode: "Invalid or expired invite code.",
    invite_joinSuccess: "Joined team successfully!",

    team_deleteTeam: "Delete team",
    team_deleteConfirm: "Really delete team \"{name}\"? This action cannot be undone.",
    team_deleteSuccess: "Team deleted.",
    team_deleteError: "Failed to delete team.",

    // Auth — account deletion
    auth_deleteAccount: "Delete account",
    auth_deleteAccountConfirm: "Really delete your account? This is permanent and cannot be undone.",
    auth_deleteAccountSuccess: "Account deleted.",
    auth_deleteAccountError: "Failed to delete account.",
    auth_deleteAccountOwnsTeams: "Delete all teams you own before deleting your account.",
    auth_deletingAccount: "Deleting…",

    // Notes mode
    cn_modeLocal: "Local only",
    cn_modeTeam: "Team:",

    // Team Drafts
    drafts_title: "Team Drafts",
    drafts_save: "Save",
    drafts_saveCurrent: "Save current draft",
    drafts_name: "Draft name",
    drafts_note: "Note",
    drafts_noTeam: "Select a team to save drafts.",
    drafts_saved: "Draft saved.",
    drafts_load: "Load",
    drafts_delete: "Delete",
    drafts_deleteConfirm: "Delete this draft?",
    drafts_noDrafts: "No saved drafts yet.",
    drafts_recent: "Recent drafts",
    drafts_count: "Saved drafts",
    drafts_patch: "Patch",
    drafts_updated: "Updated",
    drafts_error: "Could not load drafts.",
    drafts_nameRequired: "Please enter a draft name.",

    // Header
    header_contact: "Contact",

    // Common
    common_loading: "Loading…",

    // Player Results
    playerResults_view: "View",
    playerResults_teamOverview: "Team Overview",
    playerResults_noMatchesForPlayer: "No matches for this player.",
    playerResults_championStats: "Champion Statistics",
    playerResults_matchHistory: "Match History",
    playerResults_allQueues: "All queues",
    playerResults_allResults: "All results",
    playerResults_win: "Win",
    playerResults_loss: "Loss",
    playerResults_lossShort: "Loss",
    playerResults_noMatchesFound: "No matches found.",
    playerResults_player: "Player",
    playerResults_result: "Result",
    playerResults_duration: "Duration",
    playerResults_date: "Date",
    playerResults_noData: "No data.",
    playerResults_bestChampions: "Best Champions",
    playerResults_needsReview: "Needs Review",
    playerResults_noSavedMatches: "No matches saved yet.",
    playerResults_syncHint: "Click \"Sync matches\" above to load data.",
    playerResults_viewLabel: "View:",
    playerResults_noTeam: "No team selected.",
    playerResults_noTeamHint: "Select a team in the Team Dashboard to view Player Results.",

    // Sample size labels (translation keys returned by sampleSizeLabel())
    sample_veryLow: "very low confidence",
    sample_low: "low confidence",
    sample_moderate: "moderate confidence",
    sample_good: "good confidence",

    // Draft Edge notes
    dh_noEvaluatedPicks: "No evaluated picks with role yet.",
    dh_solidDraft: "Solid data-based draft.",

    // Champion Detail
    cd_roleDistribution: "Role distribution",
    cd_topSynergies: "Top Synergies",
    cd_topMatchupsFor: "Top Matchups (for",
    cd_topLaneMatchups: "Top Lane Matchups",
    cd_noPicks: "No picks",
    cd_noData: "No data",

    // Common
    common_games: "games",

    // Table headers and empty states
    tbl_confidence: "Confidence",
    tbl_games: "Games",
    tbl_wins: "Wins",
    tbl_wrForA: "WR for A",
    tbl_showLess: "Show less",
    tbl_showAll: "Show all",
    tbl_noChampions: "No champions for the current filters.",
    tbl_noSynergies: "No synergy data for the current filters.",
    tbl_noMatchups: "No matchup data for the current filters.",
    tbl_noRoleData: "No data for this role.",
    tbl_noRoleMatchupsFor: "No matchup data for",
    tbl_noPatchesNeeded: "At least 2 different patches needed for comparison.",
    tbl_selectDifferentPatches: "Please select two different patches.",
    tbl_noPatchCompData: "No data for this patch comparison.",
    // Tournament Scout — header
    scout_title: "Tournament Scout",
    scout_intro: "Paste OP.GG multi-links or individual profile links of your opponents — the tool picks the players out of them and sorts them by role. Add the scouting data you find on the linked pages and you get ban recommendations with a reason for each one. The more you enter, the more reliable the suggestion becomes.",
    scout_dataHonesty: "This tab does not read OP.GG, League of Graphs, DeepLoL or DPM for you — a browser app is not allowed to, and those sites do not permit it either. What it does is recognise the players and build the matching links for you. You look up champion, games and winrate there and enter them here. Everything is calculated from what is actually entered — nothing is estimated or filled in.",

    // Tournament Scout — input
    scout_inputLabel: "Paste links or player lines",
    scout_inputPlaceholder: "https://www.op.gg/multisearch/euw?summoners=Player1%23EUW,Player2%23EUW\nhttps://www.leagueofgraphs.com/summoner/euw/Player3-EUW\nMid: Player4#EUW\nSupport Player5#EUW1",
    scout_parseButton: "Detect players",
    scout_clearButton: "Clear input",
    scout_exampleButton: "Insert example",
    scout_exampleHint: "The example only shows what the input can look like. The names and links are made up and contain no real player data.",

    // Tournament Scout — parse result
    scout_parsedPlayers: "Detected players",
    scout_noPlayers: "No players detected yet. Paste links or player lines above and start the detection.",
    scout_unparsedLines: "Unrecognised lines",
    scout_unparsedHint: "These lines could not be matched to a player. Add the Riot ID in the format Name#TAG or paste a full profile link.",
    scout_duplicatesMerged: "Players listed more than once were merged into a single entry.",
    scout_countPlayers: "Players detected: {count}",
    scout_countUnparsed: "Lines not recognised: {count}",
    scout_countDuplicates: "Duplicates merged: {count}",

    // Tournament Scout — reasons for unparsed lines (UnparsedLineReason)
    scout_unparsed_no_riot_id: "No Riot ID found — expected format is Name#TAG.",
    scout_unparsed_invalid_riot_id: "Riot ID incomplete — name or tag is missing.",
    scout_unparsed_malformed_url: "Link is incomplete or malformed.",
    scout_unparsed_unknown_url_host: "Unknown site — supported are OP.GG, League of Graphs, DeepLoL and DPM.",
    scout_unparsed_unsupported_url_shape: "Site recognised, but this page holds no Riot ID — use the direct profile link.",
    scout_unparsed_empty_multilink: "Multi-link recognised, but it contains no players.",

    // Tournament Scout — player card
    scout_player_riotId: "Riot ID",
    scout_player_region: "Region",
    scout_player_role: "Role",
    scout_player_sources: "Sources",
    scout_player_noSources: "No profile link available. Look the player up on OP.GG directly and enter the values below.",
    scout_player_openSource: "Open profile on {source}",
    scout_player_remove: "Remove player",
    scout_player_removeConfirm: "Really remove this player? Their scouting data — every champion, games count, winrate and note — is deleted with them and cannot be restored.",

    // Tournament Scout — roles
    scout_role_top: "Top",
    scout_role_jungle: "Jungle",
    scout_role_mid: "Mid",
    scout_role_bot: "ADC",
    scout_role_support: "Support",
    scout_role_unknown: "Unknown",
    // A role read out of the input only — no seat in the lineup backs it up.
    scout_roleGuessed: "{role} (guessed)",

    // Tournament Scout — sources
    scout_source_opgg: "OP.GG",
    scout_source_leagueofgraphs: "League of Graphs",
    scout_source_deeplol: "DeepLoL",
    scout_source_dpm: "DPM",
    scout_source_manual: "From memory",
    scout_source_other: "Other source",

    // Tournament Scout — source status
    scout_status_parsed_from_url: "Taken from the link — name, tag and region are confirmed.",
    scout_status_source_link_only: "Link only — open the page and enter the values below yourself.",
    scout_status_manual_required: "Manual entry required — without scouting data this player is left out of the analysis.",
    scout_status_not_supported_in_browser: "Reading this automatically is not possible in the browser — use the link.",
    scout_status_error: "The link could not be processed — please check it or paste it again.",

    // Tournament Scout — source notes (ScoutSourceNoteCode)
    scout_note_identity_from_url: "Player read from this link.",
    scout_note_profile_link_generated: "Profile link built from name, tag and region.",
    scout_note_url_format_heuristic: "The link format is a best guess — it may not resolve.",
    scout_note_region_unknown: "Region unknown — no link can be built without it.",
    scout_note_tagline_unknown: "Tagline missing — no link can be built without #TAG.",
    scout_note_identity_incomplete: "Name is incomplete or unusable.",
    scout_note_direct_fetch_not_supported: "This site is only linked, never fetched.",
    scout_note_unknown_url_shape: "Site recognised, but not this address format.",

    // Tournament Scout — why a source is not fetched (ScoutFetchBlockedCode)
    scout_blocked_no_public_api: "No public API is documented for this site.",
    scout_blocked_cors_blocked: "The endpoint does not allow requests coming from another website.",
    scout_blocked_anti_bot_protection: "The site is protected against automated access — a fetch would be unreliable.",
    scout_blocked_html_scraping_only: "The values exist only in the page markup. Reading them out would be brittle and is not covered by the terms of use.",
    scout_blocked_undocumented_private_api: "There is a technically reachable endpoint, but it is the site's own internal one: undocumented, with no commitment from its operators, changeable at any time. It is deliberately left unused.",
    scout_blocked_unverified: "Not verified — treated as not fetchable until shown otherwise.",
    // Tournament Scout — manual scouting data
    scout_manualTitle: "Scouting data",
    scout_manualHint: "Enter what you see on the linked pages. Champion and games are enough for a first suggestion; winrate and recency make it more precise.",
    scout_manual_champion: "Champion",
    scout_manual_championInvalid: "Without a champion name this row is lost the next time the page loads.",
    scout_manual_games: "Games",
    scout_manual_gamesPlaceholder: "e.g. 14",
    scout_manual_gamesInvalid: "Enter games as a whole number, 0 or higher.",
    scout_manual_winrate: "Winrate",
    scout_manual_winratePlaceholder: "e.g. 62",
    scout_manual_winrateInvalid: "Enter the winrate as a value between 0 and 100.",
    scout_manual_note: "Note",
    scout_manual_source: "Source",
    scout_manual_recency: "Recency",
    scout_manual_recencyHint: "More recent entries count for more in the analysis — older ones are still included, but weighted down.",
    scout_manual_role: "Role",
    scout_manual_add: "Add entry",
    scout_manual_remove: "Remove entry",
    scout_manual_removeConfirm: "Really remove this entry? Its games, winrate and note go with it.",
    scout_manual_empty: "No scouting data for this player yet.",

    // Tournament Scout — recency
    scout_recency_current: "Current patch",
    scout_recency_recent: "Last few weeks",
    scout_recency_old: "Older (tendency only)",

    // Tournament Scout — lineup (starting five + substitutes)
    scout_lineupTitle: "Team lineup",
    scout_lineupHint: "Give every player their place: five starting slots and up to three substitutes. With a lineup the analysis knows which role really belongs to whom — ban recommendations get a lane (“against mid”), and entries recorded in a different role are marked as such. Without a lineup everything still works, just without the role context.",
    scout_startingFive: "Starting five",
    scout_substitutes: "Substitutes",
    scout_unassigned: "Unassigned",
    scout_unassignedHint: "Detected players who hold no slot. They are kept, along with their scouting data — but without a slot their role cannot be checked.",
    scout_lineupEmptySlot: "Empty — assign a player",
    scout_assignTo: "Assign to slot",
    scout_moveToPool: "Take out of the lineup",
    scout_alreadyAssigned: "This player already occupies another slot — take them out there first.",
    scout_lineupComplete: "Starting five complete — all five roles are filled.",
    scout_lineupIncomplete: "Starting five not complete yet — fill the open roles so the ban plan covers every lane.",
    scout_lineupAutofill: "Fill from detected roles",
    scout_lineupAutofillHint: "Takes the roles that were read out of your lines and links during detection. That is a guess from the input, not a confirmed lineup — check every slot before you rely on it.",
    scout_lineupClear: "Clear lineup",
    scout_includeSubstitutes: "Score substitutes too",
    scout_includeSubstitutesHint: "Off: substitutes are shown and stay editable, but they produce no signals and no ban candidates. On: their data counts, weighted down — a substitute can no longer outrank a comparably strong starter.",
    scout_substituteRisk: "Substitute risk",
    scout_onlyIfPlayerStarts: "Only pays off if this player actually plays.",

    // Tournament Scout — substitute slots (ScoutSubstituteSlot); starting slots reuse scout_role_*
    scout_lineup_sub1: "Substitute 1",
    scout_lineup_sub2: "Substitute 2",
    scout_lineup_sub3: "Substitute 3",

    // Tournament Scout — lineup membership (ScoutLineupMembership)
    scout_membership_starter: "Starter",
    scout_membership_substitute: "Substitute",
    scout_membership_unassigned: "Unassigned",

    // Tournament Scout — analysis
    scout_analysisTitle: "Ban analysis",
    scout_topThreats: "Biggest threats",
    scout_banCandidates: "Ban candidates",
    scout_comfortPicks: "Comfort picks",
    scout_weaknesses: "Weak spots",
    scout_confidence: "Confidence",
    scout_sourceHint: "Based solely on the scouting data you entered.",
    scout_lowData: "Thin data — add more champions or games so the recommendation becomes reliable.",
    scout_noAnalysis: "No analysis possible yet. Enter scouting data for at least one player.",

    // Tournament Scout — confidence levels
    scout_confidence_high: "High",
    scout_confidence_medium: "Medium",
    scout_confidence_low: "Low",
    scout_confidence_none: "No data",

    // Tournament Scout — role fit of a signal (ScoutRoleFit), short badge labels
    scout_rolefit_onrole: "Own role",
    scout_rolefit_offrole: "Other role",
    scout_rolefit_flex: "Flex",
    scout_rolefit_unknown: "Role unclear",

    // Tournament Scout — reason codes (ScoutReasonCode)
    scout_reason_high_winrate_many_games: "{winrate}% winrate over {games} games — a solid sample.",
    scout_reason_high_winrate_small_sample: "{winrate}% winrate, but only {games} games.",
    scout_reason_signature_pick: "Signature pick — a large share of the recorded games.",
    scout_reason_one_trick: "One-trick level on this champion.",
    scout_reason_high_games_low_winrate: "{games} games but only {winrate}% winrate — more of a weak spot than a threat.",
    scout_reason_flex_across_roles: "Flex — played in several roles.",
    scout_reason_played_recently: "Played on the current patch.",
    scout_reason_stale_data: "Only older data — treat it as a tendency.",
    scout_reason_small_sample: "Only {games} games — small sample size.",
    scout_reason_no_data: "No scouting data entered.",
    scout_reason_manual_entry_only: "Entered by hand — nothing was fetched automatically.",
    scout_reason_hits_multiple_players: "Denies {count} players on the enemy team.",
    scout_reason_meta_priority: "High priority in pro play across the weighted patches.",
    scout_reason_role_specific_threat: "A threat mainly in {role}.",
    scout_reason_user_marked_priority: "Marked as a priority by you.",
    scout_reason_onrole_signal: "Played in {role} and fielded there as well — a ban hits exactly this lane.",
    scout_reason_offrole_signal: "Played in {signalRole} but fielded as {lineupRole} — a ban may not hit the lane you are planning for.",
    scout_reason_role_unknown_or_flex: "Role unclear or flex — signal: {signalRole}, lineup: {lineupRole}. Which lane a ban here hits is not settled.",
    scout_reason_substitute_risk: "Comes from a substitute who may never enter the game — the signal is therefore weighted down to {weight}.",
    scout_reason_player_without_lineup_role: "Player holds no slot in the lineup — the data is recorded as {role}, which does not confirm that role. Without a slot no role check is possible.",

    // Tournament Scout — warning codes (ScoutWarningCode)
    scout_warning_player_without_data: "At least one player has no scouting data and is left out of the analysis. Add their champions.",
    scout_warning_small_sample_overall: "Few games recorded overall. A handful more entries makes the ban plan noticeably more reliable.",
    scout_warning_stale_data_overall: "Most entries are older. Check the linked pages for what is being played right now.",
    scout_warning_flex_pick_warning: "At least one champion shows up in several roles — a ban may not hit the role you have in mind.",
    scout_warning_meta_shift_possible: "The meta may have shifted between the recorded games and the current patch. Context only — nothing to do.",
    scout_warning_source_not_fetchable: "At least one source cannot be fetched directly. Open the link and enter the values yourself.",
    scout_warning_conflicting_entries: "There are contradictory entries for the same champion. Check games and winrate.",
    scout_warning_duplicate_players_merged: "Players listed more than once were merged. Nothing to do — check the Riot IDs if in doubt.",
    scout_warning_incomplete_starting_five: "Starting slots still open: {missing}. The ban plan only covers the roles that are filled — assign the remaining players.",
    scout_warning_player_without_lineup_role: "Players with scouting data but no slot in the lineup: {count}. Their signals cannot be matched to a role — put them into the starting five or onto the bench.",
    scout_warning_offrole_data_present: "Signals from a role other than the one in the lineup: {count}. A ban built on them may miss the lane you have in mind — check the slot assignment or the role on those entries.",
    scout_warning_substitute_risk_active: "Substitutes are being scored, {count} entries are affected. Someone on the bench may not play — turn substitutes off if the ban plan should only target the starting five.",
    scout_warning_data_loss_on_reparse: "Gone from the input: {count} players with scouting data. Nothing was deleted — the data sits in the archive, where you can restore it or discard it for good.",

    // Tournament Scout — team ban plan
    scout_teamPlanTitle: "Team ban plan",
    scout_safeBans: "Safe bans",
    scout_targetBans: "Targeted bans",
    scout_situationalBans: "Situational bans",
    scout_overlapBans: "Bans hitting multiple players",
    scout_banAgainstRole: "against {role}",
    scout_banHitsRoles: "hits {roles}",
    scout_banSubstituteOnly: "Bench data only — this ban comes to nothing if the player is not fielded.",
    scout_flexWarning: "Flex risk: this champion shows up on several players or roles.",
    scout_teamPlanEmpty: "Scouting data is still missing for a ban plan.",

    // Tournament Scout — export
    scout_export_copy: "Copy ban plan",
    scout_export_header: "Draft prep — Tournament Scout",
    scout_export_copied: "Ban plan copied",
    scout_export_failed: "Copy not possible",

    // Tournament Scout — re-parse protection & archive of removed players
    scout_reparseConfirmTitle: "Detect again — scouting data affected",
    scout_reparseConfirmBody: "Detection rebuilds the player list from the input field. Players who are no longer in that text already carry scouting data — champions, games, winrates and notes. That data disappears from the list and from the analysis. Move it to the archive if you want to keep it.",
    scout_reparseKeepData: "Move data to the archive",
    scout_reparseDiscard: "Discard the data",
    scout_reparseCancel: "Cancel",
    scout_removedPlayersTitle: "Archive of removed players",
    scout_removedPlayersHint: "Players who dropped out of the input on a detection run. Their scouting data sits here untouched and counts for nothing in the analysis. Restoring brings a player back into the list with their data; discarding deletes it for good.",
    scout_removedPlayersCapped: "The archive holds {max} players. When another one arrives, the oldest entry drops out — so restore whatever you still need.",
    scout_restorePlayer: "Restore",
    scout_restoreOverwriteConfirm: "This player already carries scouting data. Restoring replaces it completely with the archived champions, games, winrates and notes — whatever is in the list right now will be gone. Restore anyway?",
    scout_discardRemovedPlayer: "Discard for good",

    // Tournament Scout — reset & errors
    scout_reset: "Reset",
    scout_resetConfirm: "Reset everything? The input, the detected players and the scouting data will be lost.",
    scout_error_noInput: "Please paste links or player lines first.",
    scout_error_unrecognized: "No player could be read from the input. Check the links or use the Name#TAG format.",
}
