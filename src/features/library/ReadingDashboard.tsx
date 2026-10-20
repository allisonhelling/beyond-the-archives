import { useEffect, useId, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bell, Bookmark, ChevronDown, Clock, Heart, Info, Library, Layers3, SlidersHorizontal, ArrowDownWideNarrow, X } from 'lucide-react'
import { publicationStatuses } from './publication-status'
import { ratings, tagNames, type Story } from './model'
import { Dropdown } from '../../components/Dropdown'
import { useDismissible } from '../../components/useDismissible'
import { SearchSuggestions } from './SearchSuggestions'
import { defaultReadingFilters, filterReading, inReadingSection, normalize, readingGroups, tracked, type ReadingFilters, type SortOrder } from './reading-search'

type FandomOption = { name: string; count: number }
function FandomSelect({ options, selected, onChange }: { options: FandomOption[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const id = useId()
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  return <div className="fandom-select" ref={ref}>
    <button className="filter-input fandom-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>Select fandoms {selected.length ? `(${selected.length})` : ''}</span><ChevronDown size={16} /></button>
    {!open && selected.length > 0 && <div className="filter-chips">{selected.map(name => <button key={name} aria-label={`Remove fandom ${name}`} onClick={() => onChange(selected.filter(f => f !== name))}>{name}<X size={14} /></button>)}</div>}
    {open && <div id={id} className="fandom-panel menu-surface" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <input aria-label="Search fandoms" type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search fandoms" />
      {/* Keep label presses from focusing the page and dismissing the menu before checkbox activation. */}
      <div className="fandom-options">{options.filter(f => normalize(f.name).includes(normalize(query))).map(f => <label key={f.name} className="check-label" onMouseDown={event => { if (event.target !== event.currentTarget.control) event.preventDefault() }} htmlFor={`${id}-${encodeURIComponent(f.name)}`}><input id={`${id}-${encodeURIComponent(f.name)}`} type="checkbox" checked={selected.includes(f.name)} onChange={e => onChange(e.target.checked ? [...selected, f.name] : selected.filter(name => name !== f.name))} /><span>{f.name}</span><span className="fandom-count">{f.count}</span></label>)}</div>
      {!options.some(f => normalize(f.name).includes(normalize(query))) && <p>No matching fandoms.</p>}
    </div>}
  </div>
}
function TitleAuthorSearch({ value, onChange, stories }: { value: string; onChange: (value: string) => void; stories: Story[] }) {
  return <SearchSuggestions label="Search title or author" placeholder="Search title or author" value={value} onChange={onChange} hideLabel keepOpen groups={[
    { label: 'Titles', values: stories.map(story => story.metadata.title) },
    { label: 'Authors', values: stories.flatMap(story => story.metadata.authors) },
  ]} />
}
const sortOptions: { value: SortOrder; label: string }[] = [
  { value: 'added', label: 'Date added' }, { value: 'added_reverse', label: 'Date added (oldest first)' },
  { value: 'updated', label: 'Last updated' }, { value: 'updated_reverse', label: 'Last updated (oldest first)' },
  { value: 'ready', label: 'Most chapters ready' }, { value: 'ready_reverse', label: 'Fewest chapters ready' },
  { value: 'alpha', label: 'Alphabetical' }, { value: 'alpha_reverse', label: 'Alphabetical (Z–A)' },
]
const groupOptions: { value: ReadingFilters['groupBy']; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'fandom', label: 'Fandom' },
  { value: 'author', label: 'Author' }, { value: 'series', label: 'Series' },
]
const preferencesKey = 'between-chapters:reading-preferences:v1'
function initialReadingFilters(): ReadingFilters {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesKey) ?? '{}')
    return { ...defaultReadingFilters,
      sort: sortOptions.find(option => option.value === saved?.sort)?.value ?? defaultReadingFilters.sort,
      groupBy: groupOptions.find(option => option.value === saved?.groupBy)?.value ?? defaultReadingFilters.groupBy,
    }
  } catch { return { ...defaultReadingFilters } }
}
function SortSelect({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  return <Dropdown label="Sort" icon={ArrowDownWideNarrow} compact mobileIconOnly value={value} onChange={value => onChange(value as SortOrder)} options={sortOptions} />
}
const mobileQuery = '(max-width: 650px)'
const mobileSectionOrder: Partial<Record<string, number>> = { to_read: 3, view_all: 5 }
const sections = [
  ['complete', publicationStatuses.complete.label, 'All chapters out', publicationStatuses.complete.Icon], ['in_progress', publicationStatuses.in_progress.label, 'Still being written, still catching up.', publicationStatuses.in_progress.Icon],
  ['new', 'New Chapter', 'Caught up stories', Bell], ['view_all', 'View All', 'Currently reading', Library],
  ['waiting', 'Waiting for Updates', 'Following ongoing stories', Clock],
  ['to_read', 'To Read', 'Saved for later', Bookmark],
] as const

export function ReadingDashboard({ stories, renderStory, mode = 'reading', resultsActions, filterItems = filterReading, resultKind = mode === 'series' ? 'series' : 'story' }: { stories: Story[]; renderStory: (story: Story) => ReactNode; mode?: 'reading' | 'library' | 'series'; resultsActions?: ReactNode; resultKind?: 'story' | 'series' | 'item'; filterItems?: typeof filterReading }) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(mobileQuery).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(mobileQuery)
    if (!query) return
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const displayedSections = mobile ? [...sections].sort((a, b) => (mobileSectionOrder[a[0]] ?? sections.indexOf(a)) - (mobileSectionOrder[b[0]] ?? sections.indexOf(b))) : sections
  const [filters, setFilters] = useState<ReadingFilters>(initialReadingFilters)
  useEffect(() => {
    try { window.localStorage.setItem(preferencesKey, JSON.stringify({ sort: filters.sort, groupBy: filters.groupBy })) }
    catch { /* The current selections still work when browser storage is unavailable. */ }
  }, [filters.sort, filters.groupBy])
  const [expanded, setExpanded] = useState(false)
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'view_all'
  const pool = mode === 'reading' ? tracked(stories) : stories
  const fandomCounts = new Map<string, number>()
  for (const story of pool) for (const name of new Set(story.metadata.fandoms)) fandomCounts.set(name, (fandomCounts.get(name) ?? 0) + 1)
  const relationships = pool.flatMap(story => tagNames(story.metadata, 'relationship'))
  const characters = pool.flatMap(story => tagNames(story.metadata, 'character'))
  const additionalTags = pool.flatMap(story => tagNames(story.metadata, 'freeform'))
  const fandoms = [...fandomCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  function clearFilters() { setFilters(previous => ({ ...defaultReadingFilters, sort: previous.sort, groupBy: previous.groupBy })) }
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { setFilters(previous => ({ ...previous, [key]: value })) }
  let error = '', filtered: Story[] = []
  if (filters.updatedAfter && filters.updatedBefore && filters.updatedAfter > filters.updatedBefore) error = 'The last-updated start date must be before the end date.'
  try { filtered = filterItems(pool, filters) } catch (e) { error = (e as Error).message }
  const shown = error ? [] : filtered.filter(s => mode !== 'reading' || inReadingSection(s, selected))
  const publicationLabel = (value: keyof typeof publicationStatuses) => mode === 'series' ? value === 'complete' ? 'Complete' : value === 'in_progress' ? 'Incomplete' : 'Completion unknown' : publicationStatuses[value].label
  const activeFilters = [filters.query && `Title / author: ${filters.query}`, ...filters.fandoms.map(f => `Fandom: ${f}`), ...filters.publication.map(status => `Publication status: ${publicationLabel(status)}`),
    filters.oneShot !== 'allowed' && `One-shot: ${filters.oneShot === 'only' ? 'Only' : 'Exclude'}`,
    filters.inSeries && 'In a series', filters.rating && `Rating: ${filters.rating}`, filters.favorites && 'Favorites',
    filters.relationship && `Relationships: ${filters.relationship}`, filters.characters && `Characters: ${filters.characters}`, filters.tags && `Tags: ${filters.tags}`, filters.within && `Within ${filters.scope}: ${filters.within}`,
    filters.updatedAfter && `Updated from ${filters.updatedAfter}`, filters.updatedBefore && `Updated through ${filters.updatedBefore}`].filter(Boolean)
  const orderingControls = <>
    <SortSelect value={filters.sort} onChange={sort => change('sort', sort)} />
    <Dropdown label="Group" icon={Layers3} compact mobileIconOnly value={filters.groupBy} onChange={value => change('groupBy', value as ReadingFilters['groupBy'])} options={groupOptions} />
  </>
  return <>
    <section className="reading-toolbar" aria-label={mode === 'series' ? 'Series toolbar' : mode === 'library' ? 'Library toolbar' : 'Reading toolbar'}>
      {orderingControls}
      <TitleAuthorSearch value={filters.query} onChange={query => change('query', query)} stories={pool} />
      <FandomSelect options={fandoms} selected={filters.fandoms} onChange={value => change('fandoms', value)} />
      <button className={`button ${expanded ? 'primary' : 'secondary'}`} aria-expanded={expanded} aria-controls="reading-filters" onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} /><span className="filter-toggle-label"><span>{expanded ? 'Hide' : 'Filters'}</span></span></button>
    </section>
    {expanded && <section className="reading-filters" id="reading-filters" aria-label={mode === 'series' ? 'Series filters' : mode === 'library' ? 'Library filters' : 'Reading filters'}><div className="filter-grid">
      <SearchSuggestions label="Relationships" placeholder="e.g. Castiel/Dean" value={filters.relationship} onChange={value => change('relationship', value)} groups={[{ label: 'Relationships', values: relationships }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Characters" placeholder="Search characters" value={filters.characters} onChange={value => change('characters', value)} groups={[{ label: 'Characters', values: characters }]} multiple chips keepOpen hideHeadings />
      <SearchSuggestions label="Tags" placeholder="Search additional tags" value={filters.tags} onChange={value => change('tags', value)} groups={[{ label: 'Tags', values: additionalTags }]} multiple chips keepOpen hideHeadings />

      <div className="filter-choice-row">
      <Dropdown fitContent label="Rating" value={filters.rating} onChange={value => change('rating', value)} options={[{ value: '', label: 'All ratings' }, ...ratings.map(rating => ({ value: rating, label: rating }))]} />
      <Dropdown fitContent label={mode !== 'reading' ? 'Publication status' : 'Work Status'} multiple value={filters.publication} onChange={value => change('publication', value as ReadingFilters['publication'])} options={Object.entries(publicationStatuses).filter(([value]) => mode !== 'series' || ['complete', 'in_progress', 'unknown'].includes(value)).map(([value]) => ({ value, label: publicationLabel(value as keyof typeof publicationStatuses) }))} />
      <Dropdown fitContent label="One-shot" value={filters.oneShot} onChange={value => change('oneShot', value as ReadingFilters['oneShot'])} options={[{ value: 'allowed', label: 'Allowed' }, { value: 'only', label: 'Only' }, { value: 'exclude', label: 'Exclude' }]} closeOnSelect />
      <button className={`button ${filters.inSeries ? 'primary' : 'secondary'}`} aria-pressed={filters.inSeries} onClick={() => change('inSeries', !filters.inSeries)}><Layers3 size={17} />In a series</button>
      <button className={`button favorite ${filters.favorites ? 'primary' : 'secondary'}`} aria-pressed={filters.favorites} onClick={() => change('favorites', !filters.favorites)}><Heart size={17} fill={filters.favorites ? 'currentColor' : 'none'} />Favorites only</button>
      </div>
      <div className="updated-filter-section"><div className="updated-filter-row"><span className="filter-label" id="updated-filter-label">Last updated on AO3</span><div className="updated-filter" role="group" aria-labelledby="updated-filter-label"><label><span className="filter-name">From</span><input type="date" value={filters.updatedAfter} onChange={e => change('updatedAfter', e.target.value)} /></label><label><span className="filter-name">Through</span><input type="date" value={filters.updatedBefore} onChange={e => change('updatedBefore', e.target.value)} /></label></div></div><p className="field-help">Last updated uses saved AO3 dates in UTC; stories without an AO3 date are excluded by date filters. Chapter counts are saved snapshots; unknown counts sort last.</p></div>
    </div><div className="within-search"><div className="within-search-row"><div className="within-search-field"><label><span className="filter-name">Search within results</span><input type="search" placeholder="Search within results" aria-describedby="search-mode-description" value={filters.within} onChange={e => change('within', e.target.value)} /></label>

      <details className="search-help"><summary aria-label="Search syntax and modes"><Info size={18} /></summary><div id="search-mode-description"><p><strong>Any field</strong> combines saved titles, authors, fandoms, AO3 tags, personal tags, summaries, notes, ratings, statuses, and URLs. <strong>Summary</strong> searches only the fic’s summary. <strong>Notes</strong> searches only your private notes.</p><ul><li><code>book*</code> — any characters: book, books, booking.</li><li><code>Harry Potter</code> — AND: both terms must occur.</li><li><code>Harry || Potter</code> — OR: either or both terms.</li><li><code>"Harry Lockhart"</code> — words in exact sequence.</li><li><code>Harry -Lockhart</code> — include Harry, exclude Lockhart.</li></ul><p>AND and NOT apply before OR. Use a backslash to escape literal symbols, such as <code>\*</code>, <code>\-</code>, <code>\"</code>, <code>\|</code>, or <code>\\</code>. Matching ignores case and accents. Searches stay within the selected {mode === 'library' ? 'shelf' : 'tile'} and filters.</p></div></details></div>
      <Dropdown label="Search in" value={filters.scope} onChange={value => change('scope', value as ReadingFilters['scope'])} options={[{ value: 'any', label: 'Any field' }, { value: 'summary', label: 'Summary' }, { value: 'notes', label: 'Notes' }]} />
    </div></div><div className="form-actions"><button className="button secondary" onClick={clearFilters}>Clear all filters</button><button className="button secondary" onClick={() => setExpanded(false)}>Hide</button></div></section>}
    {activeFilters.length > 0 && <div className="active-reading-filters" aria-label="Active filters"><div className="filter-chips">{activeFilters.map(text => <span key={String(text)}>{text}</span>)}</div><button className="text-button" onClick={clearFilters}>Clear all filters</button></div>}
    {mode === 'reading' && <nav className="reading-tiles" aria-label="Dashboard sections">{displayedSections.map(([key, title, description, Icon]) => {
      const label = mobile && key === 'waiting' ? 'Waiting' : title
      return <button key={key} aria-label={label} aria-pressed={selected === key} className={selected === key ? 'selected' : ''} onClick={() => setParams({ shelf: key })}><Icon className="tile-icon" strokeWidth={1.6} aria-hidden="true" /><strong>{label}</strong><span className="tile-description">{description}</span><span className="tile-count">{error ? '—' : filtered.filter(story => inReadingSection(story, key)).length}</span></button>
    })}</nav>}
    <div className="results-row"><p className="results-count" role="status">{shown.length} {resultKind === 'series' ? 'series' : resultKind === 'item' ? shown.length === 1 ? 'item' : 'items' : shown.length === 1 ? 'story' : 'stories'} shown</p>{resultsActions}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!error && (shown.length ? readingGroups(shown, filters.groupBy).map(([name, group]) => <section key={name} className="reading-group">{name && <h2>{name} <span>({group.length})</span></h2>}<div className="story-grid">{group.map(story => renderStory(story))}</div></section>) : <section className="library-empty"><h2>{selected === 'new' ? 'No verified chapter updates' : 'No stories here yet'}</h2><p>{selected === 'new' ? 'New Chapter requires a saved notification and a verified unread-chapter destination. Phase 2 does not retrieve updates automatically.' : activeFilters.length ? 'Try another search or clear your filters.' : mode === 'library' ? 'Add a story manually or choose another shelf.' : selected === 'view_all' ? 'Start reading a saved story, or choose To Read to see stories saved for later.' : 'Choose another tile, or use Add in the navigation to save a story.'}</p></section>)}
  </>
}
