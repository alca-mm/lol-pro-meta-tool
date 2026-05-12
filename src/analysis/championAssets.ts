const DATA_DRAGON_VERSION = "15.24.1"

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