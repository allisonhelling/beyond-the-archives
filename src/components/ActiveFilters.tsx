import type { ReactNode } from 'react'
import './active-filters.css'
export function ActiveFilters({ children, onClear }: { children: ReactNode; onClear: () => void }) {
 return <div className="active-reading-filters" aria-label="Active Filters"><div className="filter-chips">{children}</div><button type="button" className="text-button" onClick={onClear}>Clear All Filters</button></div>
}
