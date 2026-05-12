import { createContext, useContext, useState, type ReactNode } from "react"
import type { FilterState, Role } from "../domain/types"

interface FilterContextValue {
  filters: FilterState
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  resetFilters: () => void
}

const defaultFilters: FilterState = {
  patch: null,
  region: null,
  tournament: null,
  role: null,
  minPicks: 1,
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function resetFilters() {
    setFilters(defaultFilters)
  }

  return (
    <FilterContext.Provider value={{ filters, setFilter, resetFilters }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error("useFilters must be used inside FilterProvider")
  return ctx
}

export type { Role }
