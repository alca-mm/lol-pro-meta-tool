import { useState, useRef, useEffect, useId } from "react"
import { useTranslation } from "../../i18n/LanguageContext"

export interface ChampionComboboxProps {
    champions: string[]
    value: string
    onChange: (championName: string) => void
    placeholder?: string
    disabled?: boolean
    id?: string
}

export function ChampionCombobox({
    champions,
    value,
    onChange,
    placeholder = "Search champion...",
    disabled = false,
    id,
}: ChampionComboboxProps) {
    const { t } = useTranslation()
    const generatedId = useId()
    const inputId = id ?? generatedId

    const [query, setQuery] = useState(value)
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)

    const containerRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLUListElement>(null)

    const filtered = query.trim() === ""
        ? champions
        : champions.filter((name) =>
            name.toLowerCase().includes(query.toLowerCase()),
        )

    useEffect(() => {
        setQuery(value)
    }, [value])

    useEffect(() => {
        setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
    }, [filtered.length])

    useEffect(() => {
        if (!open || !listRef.current) return
        const item = listRef.current.children[activeIndex] as HTMLElement | undefined
        item?.scrollIntoView({ block: "nearest" })
    }, [activeIndex, open])

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
                setQuery(value)
            }
        }
        document.addEventListener("mousedown", handleOutside)
        return () => document.removeEventListener("mousedown", handleOutside)
    }, [value])

    function commit(name: string) {
        onChange(name)
        setQuery(name)
        setOpen(false)
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        setQuery(e.target.value)
        setOpen(true)
        setActiveIndex(0)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setOpen(true)
            setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActiveIndex((prev) => Math.max(prev - 1, 0))
        } else if (e.key === "Enter") {
            e.preventDefault()
            if (open && filtered[activeIndex]) {
                commit(filtered[activeIndex])
            }
        } else if (e.key === "Escape") {
            e.preventDefault()
            setOpen(false)
            setQuery(value)
        }
    }

    function handleFocus() {
        setOpen(true)
        setActiveIndex(0)
    }

    function handleClear() {
        onChange("")
        setQuery("")
        setOpen(false)
    }

    return (
        <div ref={containerRef} className="combobox">
            <div className="combobox-input-wrap">
                <input
                    id={inputId}
                    type="text"
                    className="combobox-input"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={open}
                    aria-autocomplete="list"
                />
                {value && !disabled && (
                    <button
                        type="button"
                        className="combobox-clear"
                        onClick={handleClear}
                        tabIndex={-1}
                        aria-label={t("common_clear")}
                    >
                        ×
                    </button>
                )}
            </div>

            {open && filtered.length > 0 && (
                <ul ref={listRef} className="combobox-menu" role="listbox">
                    {filtered.map((name, i) => (
                        <li
                            key={name}
                            role="option"
                            aria-selected={i === activeIndex}
                            className={`combobox-option${i === activeIndex ? " combobox-option-active" : ""}`}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                commit(name)
                            }}
                            onMouseEnter={() => setActiveIndex(i)}
                        >
                            {name}
                        </li>
                    ))}
                </ul>
            )}

            {open && filtered.length === 0 && (
                <div className="combobox-empty">{t("common_noMatch")}</div>
            )}
        </div>
    )
}
