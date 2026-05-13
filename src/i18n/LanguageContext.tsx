import { createContext, useContext, useState, type ReactNode } from "react"
import type { Lang, TranslationKey, Translations } from "./types"
import { de } from "./de"
import { en } from "./en"

const translations: Record<Lang, Translations> = { de, en }

interface LanguageContextValue {
    lang: Lang
    setLang: (lang: Lang) => void
    t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readSavedLang(): Lang {
    try {
        const saved = localStorage.getItem("lol-meta-lang")
        return saved === "en" ? "en" : "de"
    } catch {
        return "de"
    }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(readSavedLang)

    function setLang(newLang: Lang) {
        setLangState(newLang)
        try {
            localStorage.setItem("lol-meta-lang", newLang)
        } catch {}
    }

    function t(key: TranslationKey): string {
        return translations[lang][key] as string
    }

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export function useTranslation(): LanguageContextValue {
    const ctx = useContext(LanguageContext)
    if (!ctx) throw new Error("useTranslation must be used inside LanguageProvider")
    return ctx
}
