import { SlidersHorizontal } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { ActiveFilters } from '../../src/components/ActiveFilters'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { Dropdown } from '../../src/components/Dropdown'
import { appliedFilterTags, activeFilterCount, dateFields, emptyFilters, facets, facetOptions, filterErrors, numericFields, unknownValue, type Filters } from './filters'
import type { CatalogBook } from './model'
const searchableFacets = new Set(['fandom', 'character', 'relationship', 'freeform'])
export function BookshelfFilters({ books, filters, onChange, query, onQuery, appliedFilters, appliedQuery, onApply, onRefresh, busy, appearance }: {
  appliedFilters: Filters; appliedQuery: string; onApply: (next: { filters: Filters; query: string }) => void
  books: CatalogBook[]; filters: Filters; onChange: (filters: Filters) => void; query: string; onQuery: (query: string) => void; onRefresh: () => void; busy: boolean; appearance: TagAppearance
}) {
  function apply(next = { filters, query }) { onApply(next) }
  const options = useMemo(() => Object.fromEntries(facets.map(facet => [facet.key, facetOptions(books, facet)])), [books])
  const [expanded, setExpanded] = useState(false), toggle = useRef<HTMLButtonElement>(null)
  const applied = appliedFilterTags(appliedFilters, appliedQuery)
  const id = useId(), count = activeFilterCount(appliedFilters), errors = filterErrors(filters)
  function hide() { setExpanded(false); toggle.current?.focus() }
  function facetControl(facet: typeof facets[number], exclude = false) {
    const label = `${exclude ? 'Exclude ' : ''}${facet.label}`, group = exclude ? 'excluded' : 'selections'
    const values = filters[group][facet.key] ?? []
    const choices = options[facet.key].map(option => ({ value: option.value, label: `${option.value === unknownValue ? 'Unknown / Not Saved' : option.value} (${option.count})` }))
    for (const value of values) if (!choices.some(option => option.value === value)) choices.push({ value, label: `${value === unknownValue ? 'Unknown / Not Saved' : value} (0)` })
    const multiple = searchableFacets.has(facet.key) || facet.key === 'language'
    if (multiple) return <div className="facet-control" key={`${group}-${facet.key}`}>
      <Dropdown label={label} multiple searchable={searchableFacets.has(facet.key)} value={values} options={choices} onChange={value => onChange({ ...filters, [group]: { ...filters[group], [facet.key]: value } })} />
      {!exclude && facet.key !== 'language' && values.length > 1 && <label className="match-mode"><span>Match</span><select aria-label={`${label} Match`} value={filters.modes[facet.key] ?? (facet.key === 'fandom' ? 'any' : 'all')} onChange={e => onChange({ ...filters, modes: { ...filters.modes, [facet.key]: e.target.value as 'any' | 'all' } })}><option value="all">All Selected</option><option value="any">Any Selected</option></select></label>}
    </div>
    return <label key={`${group}-${facet.key}`}><span>{label}</span><select aria-label={label} value={values[0] ?? ''} onChange={e => onChange({ ...filters, [group]: { ...filters[group], [facet.key]: e.target.value ? [e.target.value] : [] } })}>
      <option value="">{exclude ? 'None' : 'All'}</option>{choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  }
  return <>
    <section className="bookshelf-toolbar" aria-label="Bookshelf Toolbar"><label className="search-field"><span>Search Metadata</span><input type="search" aria-label="Search Metadata" value={query} onChange={e => onQuery(e.target.value)} placeholder="Search titles, authors, fandoms, tags, series…" /></label>{facetControl(facets.find(facet => facet.key === 'fandom')!)}<button className="primary" disabled={errors.length > 0} onClick={() => apply()}>Apply Filters</button><button ref={toggle} className={expanded ? 'primary' : ''} aria-label={expanded ? 'Hide' : 'Filters'} aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} aria-hidden="true" />{expanded ? 'Hide' : 'Filters'}{count > 0 && <span aria-hidden="true">({count})</span>}</button></section>
    {expanded && <section id={id} className="filter-panel" aria-label="Bookshelf Filters">
      <div className="filters">{facets.slice(0,5).filter(facet => facet.key !== 'fandom').map(facet => facetControl(facet))}</div>
      <details className="metadata-filters"><summary>More Metadata Filters</summary><div className="filters">{facets.slice(5).map(facet => facetControl(facet))}</div>
        <p className="filter-help">EPUB Version selects which saved copy to show: the active copy opens from organizer links; retained copies are other downloads you chose to keep.</p>
        <h3>Exclude Metadata</h3><p className="filter-help">Every filter combines with the others. Fandoms and languages match any selection by default; characters, relationships, and freeform tags require all selections. Use Match to switch between All and Any. Exclusions reject a work matching any excluded value.</p><div className="filters">{facets.filter(f => ['warning','character','relationship','freeform'].includes(f.key)).map(facet => facetControl(facet, true))}</div>
      </details>
      <details className="metadata-filters"><summary>Length & Popularity</summary><div className="range-filters numeric-ranges" aria-label="Length and Popularity Ranges">{numericFields.map(field => <fieldset className="filter-range" key={field.key}><legend>{field.label}</legend>{(['min','max'] as const).map(bound => <label key={bound}><span>{bound === 'min' ? 'Min' : 'Max'}</span><input type="number" min="0" step="1" aria-label={`${bound === 'min' ? 'Minimum' : 'Maximum'} ${field.label}`} value={filters.ranges[field.key]?.[bound] ?? ''} placeholder="Any" onChange={e => onChange({ ...filters, ranges: { ...filters.ranges, [field.key]: { min: '', max: '', ...filters.ranges[field.key], [bound]: e.target.value } } })} /></label>)}</fieldset>)}</div></details>
      <details className="metadata-filters"><summary>Publication & File Dates</summary><div className="range-filters date-ranges" aria-label="Publication and File Date Ranges">{dateFields.map(field => <fieldset className="filter-range" key={field.key}><legend>{field.label}</legend>{(['min','max'] as const).map(bound => <label key={bound}><span>{bound === 'min' ? 'From' : 'Through'}</span><input type="date" aria-label={`${field.label} ${bound === 'min' ? 'From' : 'Through'}`} value={filters.ranges[field.key]?.[bound] ?? ''} onChange={e => onChange({ ...filters, ranges: { ...filters.ranges, [field.key]: { min: '', max: '', ...filters.ranges[field.key], [bound]: e.target.value } } })} /></label>)}</fieldset>)}</div></details>
      {errors.length > 0 && <div role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
      <div className="filter-actions"><button onClick={hide}>Hide</button><button onClick={onRefresh} disabled={busy}>Refresh Local Metadata</button><span>{activeFilterCount(filters)} selected filters/ranges</span></div>
      <p className="filter-help">Filters use saved EPUB metadata. Unknown numbers and dates do not match ranges. Collection filtering uses your organizer collections. No chapter text or personal notes are searched. Choose Apply Filters to update your results. Hiding filters preserves pending selections.</p>
    </section>}
    {applied.length > 0 && <ActiveFilters onClear={() => apply({ filters: emptyFilters(), query: '' })}>{applied.map(tag => <MetadataTags key={tag.id} values={[tag.label]} category={null} appearance={appearance} onRemove={() => { const next = tag.clear(); apply(next) }} removeLabel={label => `Remove Filter ${label}`} />)}</ActiveFilters>}
  </>
}
