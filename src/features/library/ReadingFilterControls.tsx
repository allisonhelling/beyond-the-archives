import { useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Heart, Info, Layers3, SlidersHorizontal, X } from 'lucide-react'
import { Dropdown } from '../../components/Dropdown'
import { useDismissible } from '../../components/useDismissible'
import { DateFilterField } from './DateFilterField'
import { SearchSuggestions } from './SearchSuggestions'
import { ratingLabel, ratings, tagNames, type Story } from './model'
import { filterPublicationLabel, readingFilterLabels } from './reading-filter-labels'
import { publicationStatuses } from './publication-status'
import { defaultReadingFilters, normalize, type ReadingFilters } from './reading-search'

type FandomOption = { name: string; count: number }
function FandomSelect({ options, selected, onChange }: { options: FandomOption[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const id = useId()
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  return <div className="fandom-select" ref={ref}>
    <button type="button" className="filter-input fandom-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>Select fandoms {selected.length ? `(${selected.length})` : ''}</span><ChevronDown size={16} /></button>
    {!open && selected.length > 0 && <div className="filter-chips">{selected.map(name => <button type="button" key={name} aria-label={`Remove fandom ${name}`} onClick={() => onChange(selected.filter(f => f !== name))}>{name}<X size={14} /></button>)}</div>}
    {open && <div id={id} className="fandom-panel menu-surface" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <input aria-label="Search fandoms" type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search fandoms" />
      {/* Keep label presses from focusing the page and dismissing the menu before checkbox activation. */}
      <div className="fandom-options">{options.filter(f => normalize(f.name).includes(normalize(query))).map(f => <label key={f.name} className="check-label" onMouseDown={event => { if (event.target !== event.currentTarget.control) event.preventDefault() }} htmlFor={`${id}-${encodeURIComponent(f.name)}`}><input id={`${id}-${encodeURIComponent(f.name)}`} type="checkbox" checked={selected.includes(f.name)} onChange={e => onChange(e.target.checked ? [...selected, f.name] : selected.filter(name => name !== f.name))} /><span>{f.name}</span><span className="fandom-count">{f.count}</span></label>)}</div>
      {!options.some(f => normalize(f.name).includes(normalize(query))) && <p>No matching fandoms.</p>}
    </div>}
  </div>
}
function TitleAuthorSearch({ value, onChange, stories, authorOnly }: { value: string; onChange: (value: string) => void; stories: Story[]; authorOnly: boolean }) {
  const groups = useMemo(() => [
    ...(!authorOnly ? [{ label: 'Titles', values: stories.map(story => story.metadata.title) }] : []),
    { label: 'Authors', values: stories.flatMap(story => story.metadata.authors) },
  ], [stories, authorOnly])
  const label = authorOnly ? 'Search author' : 'Search title or author'
  return <SearchSuggestions label={label} placeholder={label} value={value} onChange={onChange} hideLabel keepOpen groups={groups} />
}
export function ReadingFilterControls({ stories, filters, onChange, mode = 'library', orderingControls, suggestions, fandomOptions, alwaysExpanded = false, automaticCollection = false }: {
  stories: Story[]; filters: ReadingFilters; onChange(filters: ReadingFilters): void; mode?: 'reading' | 'library' | 'series'; orderingControls?: ReactNode
  suggestions?: { relationships: string[]; characters: string[]; tags: string[] }; fandomOptions?: FandomOption[]; alwaysExpanded?: boolean; automaticCollection?: boolean
}) {
  const [expanded, setExpanded] = useState(alwaysExpanded)
  const filterId = useId(), helpId = `${filterId}-help`
  const { localRelationships, localCharacters, localTags, localFandoms } = useMemo(() => {
    const fandomCounts = new Map<string, number>()
    for (const story of stories) for (const name of new Set(story.metadata.fandoms)) fandomCounts.set(name, (fandomCounts.get(name) ?? 0) + 1)
    return {
      localRelationships: stories.flatMap(story => tagNames(story.metadata, 'relationship')),
      localCharacters: stories.flatMap(story => tagNames(story.metadata, 'character')),
      localTags: stories.flatMap(story => tagNames(story.metadata, 'freeform')),
      localFandoms: [...fandomCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    }
  }, [stories])
  const relationships = suggestions?.relationships ?? localRelationships
  const characters = suggestions?.characters ?? localCharacters
  const additionalTags = suggestions?.tags ?? localTags
  const fandoms = fandomOptions ?? localFandoms
  function clearFilters() { onChange({ ...defaultReadingFilters, sort: filters.sort, groupBy: filters.groupBy, ...(filters.randomSeed && { randomSeed: filters.randomSeed }) }) }
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { onChange({ ...filters, [key]: value }) }
  const publicationLabel = (value: keyof typeof publicationStatuses) => filterPublicationLabel(value, mode === 'series')
  const activeFilters = readingFilterLabels(filters, { authorOnly: automaticCollection, series: mode === 'series' })
  const membershipToggles = <>
      <button type="button" className={`button ${filters.inSeries ? 'primary' : 'secondary'}`} aria-pressed={filters.inSeries} onClick={() => change('inSeries', !filters.inSeries)}><Layers3 size={17} />In a Series</button>
      <button type="button" className={`button favorite ${filters.favorites ? 'primary' : 'secondary'}`} aria-pressed={filters.favorites} onClick={() => change('favorites', !filters.favorites)}><Heart size={17} fill={filters.favorites ? 'currentColor' : 'none'} />Favorites</button>
  </>
  return <>
    <section className={`reading-toolbar${alwaysExpanded ? ' reading-toolbar-rules' : ''}`} aria-label={mode === 'series' ? 'Series toolbar' : mode === 'library' ? 'Library toolbar' : 'Reading toolbar'}>
      {orderingControls}
      <TitleAuthorSearch value={filters.query} onChange={query => change('query', query)} stories={stories} authorOnly={automaticCollection} />
      <FandomSelect options={fandoms} selected={filters.fandoms} onChange={value => change('fandoms', value)} />
      {!alwaysExpanded && <button type="button" className={`button ${expanded ? 'primary' : 'secondary'}`} aria-expanded={expanded} aria-controls={filterId} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} /><span className="filter-toggle-label"><span>{expanded ? 'Hide' : 'Filters'}</span></span></button>}
    </section>
    {expanded && <section className="reading-filters" id={filterId} aria-label={mode === 'series' ? 'Series filters' : mode === 'library' ? 'Library filters' : 'Reading filters'}><div className="filter-grid">
      <SearchSuggestions label="Relationships" placeholder="e.g. Castiel/Dean" value={filters.relationship} onChange={value => change('relationship', value)} groups={[{ label: 'Relationships', values: relationships }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Characters" placeholder="Search characters" value={filters.characters} onChange={value => change('characters', value)} groups={[{ label: 'Characters', values: characters }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Tags" placeholder="Search additional tags" value={filters.tags} onChange={value => change('tags', value)} groups={[{ label: 'Tags', values: additionalTags }]} multiple chips keepOpen hideHeadings />

      <div className="filter-choice-row">
      <Dropdown fitContent label="Rating" multiple value={filters.rating} onChange={value => change('rating', value)} options={ratings.map(rating => ({ value: rating, label: ratingLabel(rating) }))} />
      <Dropdown fitContent label={mode !== 'reading' ? 'Publication status' : 'Work Status'} multiple value={filters.publication} onChange={value => change('publication', value as ReadingFilters['publication'])} options={Object.entries(publicationStatuses).filter(([value]) => mode !== 'series' || ['complete', 'in_progress', 'unknown'].includes(value)).map(([value]) => ({ value, label: publicationLabel(value as keyof typeof publicationStatuses) }))} />
      <Dropdown fitContent label="One-shot" value={filters.oneShot} onChange={value => change('oneShot', value as ReadingFilters['oneShot'])} options={[{ value: 'allowed', label: 'Allowed' }, { value: 'only', label: 'Only' }, { value: 'exclude', label: 'Exclude' }]} closeOnSelect />
      {!automaticCollection && membershipToggles}
      </div>
      <div className={automaticCollection ? "filter-date-options" : "filter-date-only"}>
        {automaticCollection && <div className="filter-choice-row filter-membership-toggles">{membershipToggles}</div>}
      <div className="updated-filter-section"><div className="updated-filter-row"><div className="updated-filter-heading"><span className="filter-label" id={`${filterId}-updated`}>Last updated on AO3</span><details className="search-help updated-filter-help"><summary aria-label="Last updated on AO3 help"><Info size={18} /></summary><div>Last updated uses saved AO3 dates in UTC; stories without an AO3 date are excluded by date filters.</div></details></div><div className="updated-filter" role="group" aria-labelledby={`${filterId}-updated`}><DateFilterField label="From" value={filters.updatedAfter} onChange={value => change('updatedAfter', value)} /><DateFilterField label="Through" value={filters.updatedBefore} onChange={value => change('updatedBefore', value)} /></div></div></div>
      </div>
    </div><div className="within-search"><div className="within-search-row"><div className="within-search-field"><label><span className="filter-name">Search within results</span><input type="search" placeholder="Search within results" aria-describedby={helpId} value={filters.within} onChange={e => change('within', e.target.value)} /></label>

      <details className="search-help"><summary aria-label="Search syntax and modes"><Info size={18} /></summary><div id={helpId}><p><strong>Any field</strong> combines saved titles, authors, fandoms, AO3 tags, personal tags, summaries, notes, ratings, statuses, and URLs. <strong>Summary</strong> searches only the fic’s summary. <strong>Notes</strong> searches only your private notes.</p><ul><li><code>book*</code> — any characters: book, books, booking.</li><li><code>Harry Potter</code> — AND: both terms must occur.</li><li><code>Harry || Potter</code> — OR: either or both terms.</li><li><code>"Harry Lockhart"</code> — words in exact sequence.</li><li><code>Harry -Lockhart</code> — include Harry, exclude Lockhart.</li></ul><p>AND and NOT apply before OR. Use a backslash to escape literal symbols, such as <code>\*</code>, <code>\-</code>, <code>\"</code>, <code>\|</code>, or <code>\\</code>. Matching ignores case and accents. Searches stay within the selected {mode === 'library' ? 'shelf' : 'tile'} and filters.</p></div></details></div>
      <Dropdown label="Search in" value={filters.scope} onChange={value => change('scope', value as ReadingFilters['scope'])} options={[{ value: 'any', label: 'Any field' }, { value: 'summary', label: 'Summary' }, { value: 'notes', label: 'Notes' }]} />
    </div></div><div className="form-actions"><button type="button" className="button secondary" onClick={clearFilters}>Clear all filters</button>{!alwaysExpanded && <button type="button" className="button secondary" onClick={() => setExpanded(false)}>Hide</button>}</div></section>}
    {activeFilters.length > 0 && <div className="active-reading-filters" aria-label="Active filters"><div className="filter-chips">{activeFilters.map(text => <span key={String(text)}>{text}</span>)}</div><button type="button" className="text-button" onClick={clearFilters}>Clear all filters</button></div>}
  </>
}
