import type { Translations } from "./types"

export const en: Translations = {
    tab_champions: "Champions",
    tab_draftHelper: "Draft Helper",
    tab_synergies: "Synergies",
    tab_matchups: "Matchups",
    tab_roles: "Roles",
    tab_patches: "Patches",

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
}
