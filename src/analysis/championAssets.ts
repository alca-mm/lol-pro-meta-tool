// Data Dragon asset version. Must be >= the patch that introduced the newest
// champion in championCatalog.ts, otherwise that champion's icon 404s/403s and
// ChampionIcon falls back to initials. 16.16.1 matches ALL_CHAMPIONS exactly
// (173/173 ids). Locke was added in 16.13.1.
const DATA_DRAGON_VERSION = "16.16.1"

const SPECIAL_CHAMPION_IMAGE_IDS: Record<string, string> = {
    "aurelion sol": "AurelionSol",
    "bel'veth": "Belveth",
    "cho'gath": "Chogath",
    "dr. mundo": "DrMundo",
    "jarvan iv": "JarvanIV",
    "kai'sa": "Kaisa",
    "kha'zix": "Khazix",
    "kog'maw": "KogMaw",
    ksante: "KSante",
    "k'sante": "KSante",
    leblanc: "Leblanc",
    "lee sin": "LeeSin",
    "master yi": "MasterYi",
    "miss fortune": "MissFortune",
    "nunu & willump": "Nunu",
    nunu: "Nunu",
    "rek'sai": "RekSai",
    "renata glasc": "Renata",
    "tahm kench": "TahmKench",
    "twisted fate": "TwistedFate",
    "vel'koz": "Velkoz",
    wukong: "MonkeyKing",
    "xin zhao": "XinZhao",
}

export function championImageId(championName: string): string {
    const normalized = championName.trim().toLowerCase()

    if (SPECIAL_CHAMPION_IMAGE_IDS[normalized]) {
        return SPECIAL_CHAMPION_IMAGE_IDS[normalized]
    }

    return championName
        .replace(/['’.\s:&-]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
}

export function championIconUrl(championName: string): string {
    return `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/${championImageId(
        championName,
    )}.png`
}

// Pure, deterministic fallback used when a champion icon fails to load.
// Builds a short initials label from the champion name. Never throws.
export function championInitials(championName: string): string {
    const words = championName
        .trim()
        .split(/\s+/)
        .filter((word) => /[a-zA-Z]/.test(word))

    if (words.length === 0) return "?"

    if (words.length === 1) {
        const firstLetter = words[0].match(/[a-zA-Z]/)?.[0] ?? ""
        return firstLetter.toUpperCase() || "?"
    }

    const initials = words
        .slice(0, 2)
        .map((word) => word.match(/[a-zA-Z]/)?.[0] ?? "")
        .join("")

    return initials.toUpperCase() || "?"
}