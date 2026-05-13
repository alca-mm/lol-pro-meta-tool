import type { de } from "./de"

export type Lang = "de" | "en"
export type TranslationKey = keyof typeof de
export type Translations = { [K in TranslationKey]: string }
