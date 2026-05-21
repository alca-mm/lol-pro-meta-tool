import { useState, useRef, useEffect } from "react"

export interface MultiSelectDropdownOption {
    value: string
    label: string
}

interface Props {
    label: string
    options: MultiSelectDropdownOption[]
    selectedValues: string[]
    onChange: (values: string[]) => void
    summaryAllLabel: string
    summaryNoneLabel?: string
    selectedSummary: (count: number) => string
    actions?: Array<{ label: string; onClick: () => void }>
}

export function MultiSelectDropdown({
    label,
    options,
    selectedValues,
    onChange,
    summaryAllLabel,
    selectedSummary,
    actions,
}: Props) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handleOutside)
        return () => document.removeEventListener("mousedown", handleOutside)
    }, [])

    const triggerText = selectedValues.length === 0
        ? summaryAllLabel
        : selectedSummary(selectedValues.length)

    function toggle(value: string, checked: boolean) {
        const next = checked
            ? [...selectedValues, value]
            : selectedValues.filter((v) => v !== value)
        onChange(next)
    }

    return (
        <div ref={containerRef} className="msd-container" aria-label={label}>
            <button
                type="button"
                className={`filter-control msd-trigger${open ? " msd-trigger-open" : ""}`}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="msd-summary-text">{triggerText}</span>
                <span className="msd-arrow" aria-hidden="true">{open ? "▲" : "▼"}</span>
            </button>

            {open && (
                <div className="msd-dropdown" role="listbox" aria-multiselectable="true" aria-label={label}>
                    {actions && actions.length > 0 && (
                        <div className="msd-actions">
                            {actions.map((a) => (
                                <button
                                    key={a.label}
                                    type="button"
                                    className="msd-action-btn"
                                    onClick={a.onClick}
                                >
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {options.length === 0 ? (
                        <div className="msd-empty">—</div>
                    ) : (
                        options.map((opt) => {
                            const checked = selectedValues.includes(opt.value)
                            return (
                                <label key={opt.value} className="msd-option">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => toggle(opt.value, e.target.checked)}
                                    />
                                    {opt.label}
                                </label>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
