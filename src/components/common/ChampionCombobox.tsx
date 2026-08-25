import { useState, useRef, useEffect, useId } from "react"
import { useTranslation } from "../../i18n/LanguageContext"
import {
    comboboxActiveDescendantId,
    comboboxListboxId,
    comboboxOptionId,
} from "./comboboxIds"

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

    /*
      ONE condition for "the listbox is on the page", used by the `<ul>`, by
      `aria-controls` and by `aria-activedescendant`.

      Written once because the three must agree: an `aria-controls` pointing at a
      `<ul>` that was not rendered is a dangling reference, and it would dangle in
      exactly the case that already has its own markup - `open` with an empty
      filter renders the "no match" note instead of a list.
    */
    const listboxRendered = open && filtered.length > 0
    const listboxId = comboboxListboxId(inputId)
    // Computed from `filtered.length`, the count actually being rendered, not
    // from the state alone - see comboboxActiveDescendantId for why that matters.
    const activeDescendantId = comboboxActiveDescendantId(
        inputId,
        listboxRendered,
        filtered.length,
        activeIndex,
    )

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
                    /*
                      THE POINT OF THIS CHANGE. The arrow keys have always moved
                      a highlight, but nothing told assistive technology WHICH
                      option was highlighted: focus stays on the input the whole
                      time (that is the listbox pattern), so without this
                      attribute a screen reader user heard the list open and then
                      nothing at all while arrowing through it.

                      `undefined` when there is nothing to point at, which React
                      renders as no attribute. An empty string would be a
                      dangling reference instead of an absent one.
                    */
                    aria-activedescendant={activeDescendantId}
                    aria-controls={listboxRendered ? listboxId : undefined}
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

            {listboxRendered && (
                <ul ref={listRef} id={listboxId} className="combobox-menu" role="listbox">
                    {filtered.map((name, i) => (
                        /*
                          `id` so `aria-activedescendant` has something to
                          reference; index-based, see comboboxIds.ts for why a
                          champion name would be the wrong key here.

                          NO `tabIndex` and NO `<button>`: options in a listbox
                          are deliberately not tab stops. Focus never leaves the
                          input, which is what makes `aria-activedescendant`
                          necessary in the first place. Turning these into
                          buttons would put ~170 tab stops in the page and
                          destroy the listbox semantics.

                          `aria-selected` tracks the HIGHLIGHT, not the committed
                          `value`. This is a single-select listbox driven by
                          aria-activedescendant, where the active option is the
                          one that is announced and the one Enter would take; the
                          committed champion is already shown in the input.

                          `aria-setsize` / `aria-posinset` say "5 of 170" out
                          loud instead of leaving it to be inferred. The whole
                          filtered set IS in the DOM here, so a screen reader
                          could in principle count for itself - but with an
                          aria-activedescendant listbox not all of them do, and
                          an announcement that names the position is the point of
                          arrowing through 170 champions.

                          BOTH VALUES ASSUME THE MAP RUNS OVER THE WHOLE FILTERED
                          LIST, which it does: there is no slice and no
                          virtualisation here. `i + 1` is therefore the real
                          1-based position, and `filtered.length` the real total.
                          Anyone adding a cap has to revisit `i + 1` specifically:
                          `aria-setsize` would still be right (that is what it is
                          for), while an index into a shortened array would start
                          lying. A test pins the absence of a slice for that
                          reason.
                        */
                        <li
                            key={name}
                            id={comboboxOptionId(inputId, i)}
                            role="option"
                            aria-selected={i === activeIndex}
                            aria-setsize={filtered.length}
                            aria-posinset={i + 1}
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

            {/*
              The "no match" note is NOT an option: no `role`, no id, and
              deliberately no `aria-setsize`/`aria-posinset`. It is a message
              about the list, not a member of it, and there is no listbox
              rendered beside it to be a member of.
            */}
            {open && filtered.length === 0 && (
                <div className="combobox-empty">{t("common_noMatch")}</div>
            )}
        </div>
    )
}
