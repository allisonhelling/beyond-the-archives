import { TagExpressionPicker } from '../../src/features/library/tags/TagFilterControl'
import { SlidersHorizontal } from 'lucide-react'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActiveFilters } from '../../src/components/ActiveFilters'
import { FilterRange, NumberFilterRange, type RangeBound } from '../../src/components/FilterRange'
import { MetadataTags } from '../../src/features/library/MetadataTags'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { Dropdown } from '../../src/components/Dropdown'
import { appliedFilterTags, activeFilterCount, dateFields, emptyFilters, facets, facetOptions, filterErrors, numericFields, readerTagExpression, setReaderTagExpression, unknownValue, type Filters } from './filters'
import type { CatalogBook } from './model'
const searchableFacets = new Set(['fandom', 'character', 'relationship', 'freeform'])
export function BookshelfFilters({ books, filters, onChange, query, onQuery, appliedFilters, appliedQuery, onApply, appearance, groupControl, sortControl }: {
  groupControl?: ReactNode; sortControl?: ReactNode
  appliedFilters: Filters; appliedQuery: string; onApply: (next: { filters: Filters; query: string }) => void
  books: CatalogBook[]; filters: Filters; onChange: (filters: Filters) => void; query: string; onQuery: (query: string) => void; appearance: TagAppearance
}) {
  function apply(next = { filters, query }) { setRestorationEpoch(current => current + 1); onApply(next) }
  const options = useMemo(() => Object.fromEntries(facets.map(facet => [facet.key, facetOptions(books, facet)])), [books])
  const [restorationEpoch, setRestorationEpoch] = useState(0)
  const [expanded, setExpanded] = useState(false), toggle = useRef<HTMLButtonElement>(null)
  const applied = appliedFilterTags(appliedFilters, appliedQuery)
  const id = useId(), count = activeFilterCount(appliedFilters), errors = filterErrors(filters)
  function changeRange(field: keyof Filters['ranges'], bound: RangeBound, value: string) {
    onChange({ ...filters, ranges: { ...filters.ranges, [field]: { min: '', max: '', ...filters.ranges[field], [bound]: value } } })
  }
  function hide() { setExpanded(false); toggle.current?.focus() }
  function tagControl(facet: typeof facets[number], label: string = facet.label) {
    return <TagExpressionPicker label={label} categoryLabel={facet.label} expression={readerTagExpression(filters, facet.key)} restorationKey={String(restorationEpoch)} options={options[facet.key].map(option => ({ name: option.value === unknownValue ? 'Unknown / Not Saved' : option.value, value: option.value, count: option.count }))} onChange={expression => onChange(setReaderTagExpression(filters, facet.key, expression))} />
  }
  function facetControl(facet: typeof facets[number], exclude = false) {
    const label = `${exclude ? 'Exclude ' : ''}${facet.label}`, group = exclude ? 'excluded' : 'selections'
    if (!exclude && searchableFacets.has(facet.key)) return <div className="facet-control" key={facet.key}><span className="filter-label">{facet.label}</span>{tagControl(facet)}</div>
    const values = filters[group][facet.key] ?? []
    const choices = options[facet.key].map(option => ({ value: option.value, label: `${option.value === unknownValue ? 'Unknown / Not Saved' : option.value} (${option.count})` }))
    for (const value of values) if (!choices.some(option => option.value === value)) choices.push({ value, label: `${value === unknownValue ? 'Unknown / Not Saved' : value} (0)` })
    const select = (value: string[]) => onChange({ ...filters, [group]: { ...filters[group], [facet.key]: value } })
    return searchableFacets.has(facet.key) || facet.key === 'language' ? <Dropdown key={facet.key} label={label} multiple searchable={searchableFacets.has(facet.key)} value={values} options={choices} onChange={select} />
      : <Dropdown key={facet.key} label={label} value={values[0] ?? ''} options={[{ value: '', label: exclude ? 'None' : 'All' }, ...choices]} closeOnSelect onChange={value => select(value ? [value] : [])} />
  }
  return <>
    <section className="reading-toolbar bookshelf-toolbar" data-mode="reading" aria-label="Bookshelf Toolbar">{groupControl}<div className="suggestion-search"><label className="search-field unlabeled-filter"><span className="sr-only">Search</span><input className="filter-input" onKeyDown={event => { if (event.key === 'Enter' && !errors.length) { event.preventDefault(); apply() } }} type="search" aria-label="Search" value={query} onChange={e => onQuery(e.target.value)} placeholder="Search Title, Author, or AO3 Work ID" /></label></div>{sortControl && <div className="toolbar-sort">{sortControl}</div>}{tagControl(facets[2], 'Select Fandoms')}<div className="toolbar-actions"><button className="button primary apply-filters" disabled={errors.length > 0} onClick={() => apply()}>Apply Filters</button><button ref={toggle} className={`button filter-toggle ${expanded ? 'primary' : 'secondary'}`} aria-label={expanded ? 'Hide' : 'Filters'} aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} aria-hidden="true" /><span className="filter-toggle-label"><span>{expanded ? 'Hide' : 'Filters'}</span></span>{count > 0 && <span aria-hidden="true">({count})</span>}</button></div></section>
    {expanded && <section id={id} className="filter-panel" aria-label="Bookshelf Filters">
      <div className="filters">{facets.slice(0,5).filter(facet => facet.key !== 'fandom').map(facet => facetControl(facet))}</div>
      <details className="metadata-filters"><summary>More Metadata Filters</summary><div className="filters">{facets.slice(5).map(facet => facetControl(facet))}</div>
        <p className="filter-help">EPUB Version selects which saved copy to show: the active copy opens from organizer links; retained copies are other downloads you chose to keep.</p>
        <h3>Exclude Metadata</h3><p className="filter-help">Every filter combines with the others. Choose Any, All, or Custom groups in the fandom and tag menus. Languages match any selection. Exclusions reject a work matching any excluded value.</p><div className="filters">{facets.filter(f => ['warning','character','relationship','freeform'].includes(f.key)).map(facet => facetControl(facet, true))}</div>
      </details>
      <details className="metadata-filters"><summary>Length &amp; Popularity</summary><div className="range-filters numeric-ranges" aria-label="Length and Popularity Ranges">
        {numericFields.map(field => <NumberFilterRange key={field.key} label={field.label} range={filters.ranges[field.key]} onChange={(bound, value) => changeRange(field.key, bound, value)} />)}
      </div></details>
      <details className="metadata-filters"><summary>Publication &amp; File Dates</summary><div className="range-filters date-ranges" aria-label="Publication and File Date Ranges">
        {dateFields.map(field => <FilterRange key={field.key} label={field.label}>{bound => <label key={bound}>
          <span>{bound === 'min' ? 'From' : 'Through'}</span><input type="date" aria-label={`${field.label} ${bound === 'min' ? 'From' : 'Through'}`} value={filters.ranges[field.key]?.[bound] ?? ''} onChange={event => changeRange(field.key, bound, event.target.value)} />
        </label>}</FilterRange>)}
      </div></details>
      <div className="filter-actions"><button className="button primary" aria-label="Apply Filters from Filter Panel" onClick={() => apply()} disabled={errors.length > 0}>Apply Filters</button><button className="button secondary" onClick={hide}>Hide</button><span>{activeFilterCount(filters)} selected filters/ranges</span></div>
      <p className="filter-help">Filters use saved EPUB metadata. Unknown numbers and dates do not match ranges. Hiding filters preserves pending selections.</p>
    </section>}
    {applied.length > 0 && <ActiveFilters onClear={() => apply({ filters: emptyFilters(), query: '' })}>{applied.map(tag => <MetadataTags key={tag.id} values={[tag.label]} category={null} appearance={appearance} onRemove={() => { const next = tag.clear(); apply(next) }} removeLabel={label => `Remove Filter ${label}`} />)}</ActiveFilters>}
  </>
}
