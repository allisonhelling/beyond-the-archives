import { useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, FileText, Heart, Info, Layers3, SlidersHorizontal, Star } from 'lucide-react'
import { MetadataTags } from './MetadataTags'
import { Dropdown } from '../../components/Dropdown'
import { useDismissible } from '../../components/useDismissible'
import { DateFilterField } from './DateFilterField'
import { SearchSuggestions } from './SearchSuggestions'
import { ratingLabel, ratings, tagNames, type Story } from './model'
import { filterPublicationLabel, readingFilterTags } from './reading-filter-labels'
import { publicationStatuses } from './publication-status'
import { defaultReadingFilters, normalize, type ReadingFilters } from './reading-search'

type FandomOption = { name: string; count: number }
function FandomSelect({ options, selected, onChange }: { options: FandomOption[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const id = useId()
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  return <div className="fandom-select" ref={ref}>
    <button type="button" className="filter-input fandom-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>Select Fandoms {selected.length ? `(${selected.length})` : ''}</span><ChevronDown size={16} /></button>
    {!open && selected.length > 0 && <div className="filter-chips"><MetadataTags values={selected} removeLabel={name => `Remove Fandom ${name}`} onRemove={name => onChange(selected.filter(f => f !== name))} /></div>}
    {open && <div id={id} className="fandom-panel menu-surface" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <input aria-label="Search Fandoms" type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Fandoms" />
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
  const label = authorOnly ? 'Search Author' : 'Search Title or Author'
  return <SearchSuggestions label={label} placeholder={label} value={value} onChange={onChange} hideLabel keepOpen groups={groups} />
}
export function ReadingFilterControls({ stories, filters, onChange, mode = 'library', orderingControls, actions, suggestions, fandomOptions, alwaysExpanded = false, automaticCollection = false }: {
  stories: Story[]; filters: ReadingFilters; onChange(filters: ReadingFilters): void; mode?: 'reading' | 'library' | 'series'; orderingControls?: ReactNode; actions?: ReactNode
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
  const activeFilters = readingFilterTags(filters, { authorOnly: automaticCollection, series: mode === 'series', seriesVisibility: mode === 'library' })
  const membershipToggles = <>
      <button type="button" className={`button ${filters.excludeLaterSeries ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.excludeLaterSeries)} onClick={() => change('excludeLaterSeries', !filters.excludeLaterSeries)}><Layers3 size={17} />Exclude Later Series Works</button>
      <button type="button" className={`button ${filters.inSeries ? 'primary' : 'secondary'}`} aria-pressed={filters.inSeries} onClick={() => change('inSeries', !filters.inSeries)}><Layers3 size={17} />In a Series</button>
      <button type="button" className={`button favorite ${filters.favorites ? 'primary' : 'secondary'}`} aria-pressed={filters.favorites} onClick={() => change('favorites', !filters.favorites)}><Star size={17} fill={filters.favorites ? 'currentColor' : 'none'} />Favorites</button>
      <button type="button" className={`button ${filters.personalNotes ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.personalNotes)} onClick={() => change('personalNotes', !filters.personalNotes)}><FileText size={17} />Personal Notes</button>
      <button type="button" className={`button ${filters.recs ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.recs)} onClick={() => change('recs', !filters.recs)}><Heart size={17} fill={filters.recs ? 'currentColor' : 'none'} />Recs</button>
  </>
  return <>
    <section className={`reading-toolbar${alwaysExpanded ? ' reading-toolbar-rules' : ''}`} aria-label={mode === 'series' ? 'Series Toolbar' : mode === 'library' ? 'Library Toolbar' : 'Reading Toolbar'}>
      {orderingControls}
      <TitleAuthorSearch value={filters.query} onChange={query => change('query', query)} stories={stories} authorOnly={automaticCollection} />
      <FandomSelect options={fandoms} selected={filters.fandoms} onChange={value => change('fandoms', value)} />
      {!alwaysExpanded && <button type="button" className={`button ${expanded ? 'primary' : 'secondary'}`} aria-expanded={expanded} aria-controls={filterId} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} /><span className="filter-toggle-label"><span>{expanded ? 'Hide' : 'Filters'}</span></span></button>}
      {(actions || mode === 'library' && !automaticCollection) && <div className="form-actions reading-toolbar-actions">{actions}
      {mode === 'library' && !automaticCollection && <button type="button" className={`button ${filters.showSeries ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.showSeries)} onClick={() => change('showSeries', !filters.showSeries)}><Layers3 size={17} />Show Series</button>}
      </div>}
    </section>
    {expanded && <section className="reading-filters" id={filterId} aria-label={mode === 'series' ? 'Series Filters' : mode === 'library' ? 'Library Filters' : 'Reading Filters'}><div className="filter-grid">
      <SearchSuggestions label="Relationships" tagCategory="relationships" placeholder="e.g. Castiel/Dean" value={filters.relationship} onChange={value => change('relationship', value)} groups={[{ label: 'Relationships', values: relationships }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Characters" tagCategory="characters" placeholder="Search characters" value={filters.characters} onChange={value => change('characters', value)} groups={[{ label: 'Characters', values: characters }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Tags" tagCategory="tags" placeholder="Search additional tags" value={filters.tags} onChange={value => change('tags', value)} groups={[{ label: 'Tags', values: additionalTags }]} multiple chips keepOpen hideHeadings />

      <div className="filter-choice-row">
      <Dropdown fitContent label="Content Rating" multiple value={filters.rating} onChange={value => change('rating', value)} options={ratings.map(rating => ({ value: rating, label: ratingLabel(rating) }))} />
      <Dropdown fitContent label="Rating" multiple value={filters.personalRating ?? []} onChange={value => change('personalRating', value)} options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: `${value}/5` })).concat({ value: 'unrated', label: 'Unrated' })} />
      <Dropdown fitContent label={mode !== 'reading' ? 'Publication Status' : 'Work Status'} multiple value={filters.publication} onChange={value => change('publication', value as ReadingFilters['publication'])} options={Object.entries(publicationStatuses).filter(([value]) => mode !== 'series' || ['complete', 'in_progress', 'unknown'].includes(value)).map(([value]) => ({ value, label: publicationLabel(value as keyof typeof publicationStatuses) }))} />
      <Dropdown fitContent label="One-Shot" value={filters.oneShot} onChange={value => change('oneShot', value as ReadingFilters['oneShot'])} options={[{ value: 'allowed', label: 'Allowed' }, { value: 'only', label: 'Only' }, { value: 'exclude', label: 'Exclude' }]} closeOnSelect />
      {!automaticCollection && membershipToggles}
      </div>
      <div className={automaticCollection ? "filter-date-options" : "filter-date-only"}>
        {automaticCollection && <div className="filter-choice-row filter-membership-toggles">{membershipToggles}</div>}
      <div className="updated-filter-section"><div className="updated-filter-row"><div className="updated-filter-heading"><span className="filter-label" id={`${filterId}-updated`}>Last Updated on AO3</span><details className="search-help updated-filter-help"><summary aria-label="Last Updated on AO3 Help"><Info size={18} /></summary><div>Last updated uses saved AO3 dates in UTC; stories without an AO3 date are excluded by date filters.</div></details></div><div className="updated-filter" role="group" aria-labelledby={`${filterId}-updated`}><DateFilterField label="From" value={filters.updatedAfter} onChange={value => change('updatedAfter', value)} /><DateFilterField label="Through" value={filters.updatedBefore} onChange={value => change('updatedBefore', value)} /></div></div></div>
      </div>
    </div><div className="within-search"><div className="within-search-row"><div className="within-search-field"><label><span className="filter-name">Search Within Results</span><input type="search" placeholder="Search Within Results" aria-describedby={helpId} value={filters.within} onChange={e => change('within', e.target.value)} /></label>

      <details className="search-help"><summary aria-label="Search Syntax and Modes"><Info size={18} /></summary><div id={helpId}><p><strong>Any Field</strong> combines saved titles, authors, fandoms, AO3 tags, personal tags, summaries, notes, ratings, statuses, and URLs. <strong>Summary</strong> searches only the fic’s summary. <strong>Notes</strong> searches only your private notes.</p><ul><li><code>book*</code> — any characters: book, books, booking.</li><li><code>Harry Potter</code> — AND: both terms must occur.</li><li><code>Harry || Potter</code> — OR: either or both terms.</li><li><code>"Harry Lockhart"</code> — words in exact sequence.</li><li><code>Harry -Lockhart</code> — include Harry, exclude Lockhart.</li></ul><p>AND and NOT apply before OR. Use a backslash to escape literal symbols, such as <code>\*</code>, <code>\-</code>, <code>\"</code>, <code>\|</code>, or <code>\\</code>. Matching ignores case and accents. Searches stay within the selected {mode === 'library' ? 'shelf' : 'tile'} and filters.</p></div></details></div>
      <Dropdown label="Search In" value={filters.scope} onChange={value => change('scope', value as ReadingFilters['scope'])} options={[{ value: 'any', label: 'Any Field' }, { value: 'summary', label: 'Summary' }, { value: 'notes', label: 'Notes' }]} />
    </div></div><div className="form-actions"><button type="button" className="button secondary" onClick={clearFilters}>Clear All Filters</button>{!alwaysExpanded && <button type="button" className="button secondary" onClick={() => setExpanded(false)}>Hide</button>}</div></section>}
    {activeFilters.length > 0 && <div className="active-reading-filters" aria-label="Active Filters"><div className="filter-chips">{activeFilters.map(({ label, category }) => <MetadataTags key={label} values={[label]} category={category ?? null} />)}</div><button type="button" className="text-button" onClick={clearFilters}>Clear All Filters</button></div>}
  </>
}
