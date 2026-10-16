import { useId, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Heart, Info, SlidersHorizontal, X } from 'lucide-react'
import { ratings, type Story } from './model'
import { Dropdown } from '../../components/Dropdown'
import { useDismissible } from '../../components/useDismissible'
import { SearchSuggestions } from './SearchSuggestions'
import { defaultReadingFilters, filterReading, inReadingSection, normalize, readingGroups, tracked, type ReadingFilters, type SortOrder } from './reading-search'

type FandomOption = { name: string; count: number }
function FandomSelect({ options, selected, onChange }: { options: FandomOption[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('')
  const id = useId()
  const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
  return <div className="fandom-select" ref={ref}><span className="filter-label">Fandom</span>
    <button className="filter-input fandom-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Select fandoms {selected.length ? `(${selected.length})` : ''}<ChevronDown size={16} /></button>
    {!open && selected.length > 0 && <div className="filter-chips">{selected.map(name => <button key={name} aria-label={`Remove fandom ${name}`} onClick={() => onChange(selected.filter(f => f !== name))}>{name}<X size={14} /></button>)}</div>}
    {open && <div id={id} className="fandom-panel" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <input aria-label="Search fandoms" type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search fandoms" />
      <div className="fandom-options">{options.filter(f => normalize(f.name).includes(normalize(query))).map(f => <label key={f.name} className="check-label"><input type="checkbox" checked={selected.includes(f.name)} onChange={e => onChange(e.target.checked ? [...selected, f.name] : selected.filter(name => name !== f.name))} /><span>{f.name}</span><span className="fandom-count">{f.count} {f.count === 1 ? 'fic' : 'fics'}</span></label>)}</div>
      {!options.some(f => normalize(f.name).includes(normalize(query))) && <p>No matching fandoms.</p>}
    </div>}
  </div>
}
function TitleAuthorSearch({ value, onChange, stories }: { value: string; onChange: (value: string) => void; stories: Story[] }) {
  return <SearchSuggestions label="Search title or author" placeholder="Search title or author" value={value} onChange={onChange} keepOpen groups={[
    { label: 'Titles', values: stories.map(story => story.metadata.title) },
    { label: 'Authors', values: stories.flatMap(story => story.metadata.authors) },
  ]} />
}
function SortSelect({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  return <Dropdown label="Sort By" value={value} onChange={value => onChange(value as SortOrder)} options={[
    { value: 'updated', label: 'Last updated' }, { value: 'ready', label: 'Most chapters ready' }, { value: 'alpha', label: 'Alphabetical' },
  ]} />
}
const sections = [
  ['complete', 'Complete on AO3', 'All chapters out'], ['new', 'New Chapter', 'Verified chapter updates'],
  ['waiting', 'Waiting for Updates', 'Following ongoing stories'], ['view_all', 'View All', 'Currently reading'],
  ['to_read', 'To Read', 'Saved for later'],
] as const

export function ReadingDashboard({ stories, renderStory }: { stories: Story[]; renderStory: (story: Story) => ReactNode }) {
  const [filters, setFilters] = useState<ReadingFilters>({ ...defaultReadingFilters })
  const [expanded, setExpanded] = useState(false)
  const [params, setParams] = useSearchParams()
  const selected = params.get('shelf') ?? 'view_all'
  const pool = tracked(stories)
  const fandomCounts = new Map<string, number>()
  for (const story of pool) for (const name of new Set(story.metadata.fandoms)) fandomCounts.set(name, (fandomCounts.get(name) ?? 0) + 1)
  const ao3Tags = [...new Set(pool.flatMap(story => story.metadata.ao3_tags))]
  const relationships = ao3Tags.filter(tag => tag.includes('/') || tag.includes('&'))
  const fandoms = [...fandomCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { setFilters(previous => ({ ...previous, [key]: value })) }
  let error = '', filtered: Story[] = []
  if (filters.updatedAfter && filters.updatedBefore && filters.updatedAfter > filters.updatedBefore) error = 'The last-updated start date must be before the end date.'
  try { filtered = filterReading(pool, filters) } catch (e) { error = (e as Error).message }
  const shown = error ? [] : filtered.filter(s => inReadingSection(s, selected))
  const activeFilters = [filters.query && `Title / author: ${filters.query}`, ...filters.fandoms.map(f => `Fandom: ${f}`), filters.publication !== 'all' && `Status: ${filters.publication === 'complete' ? 'Complete on AO3' : 'In progress'}`,
    filters.waiting && 'Waiting for updates', filters.rating && `Rating: ${filters.rating}`, filters.favorites && 'Favorites',
    filters.relationship && `Relationship: ${filters.relationship}`, filters.tags && `AO3 tags: ${filters.tags}`, filters.within && `Within ${filters.scope}: ${filters.within}`,
    filters.updatedAfter && `Updated from ${filters.updatedAfter}`, filters.updatedBefore && `Updated through ${filters.updatedBefore}`].filter(Boolean)
  return <>
    <section className="reading-toolbar" aria-label="Reading toolbar">
      <SortSelect value={filters.sort} onChange={sort => change('sort', sort)} />
      <TitleAuthorSearch value={filters.query} onChange={query => change('query', query)} stories={pool} />
      <FandomSelect options={fandoms} selected={filters.fandoms} onChange={value => change('fandoms', value)} />
      <button className={`button ${expanded ? 'primary' : 'secondary'}`} aria-expanded={expanded} aria-controls="reading-filters" onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} />{expanded ? 'Hide filters' : 'Filters'}</button>
    </section>
    {expanded && <section className="reading-filters" id="reading-filters" aria-label="Reading filters"><div className="filter-grid">
      <Dropdown label="Work Completion Status" value={filters.publication} onChange={value => change('publication', value)} options={[{ value: 'all', label: 'All' }, { value: 'complete', label: 'Complete on AO3' }, { value: 'in_progress', label: 'In progress' }]} />
      <label className="filter-toggle"><input type="checkbox" role="switch" checked={filters.waiting} onChange={e => change('waiting', e.target.checked)} />Waiting for updates</label>
      <Dropdown label="Rating" value={filters.rating} onChange={value => change('rating', value)} options={[{ value: '', label: 'All ratings' }, ...ratings.map(rating => ({ value: rating, label: rating }))]} />
      <Dropdown label="Group by" value={filters.groupBy} onChange={value => change('groupBy', value as ReadingFilters['groupBy'])} options={[{ value: 'none', label: 'None' }, { value: 'fandom', label: 'Fandom' }, { value: 'author', label: 'Author' }, { value: 'series', label: 'Series' }]} />
      <button className={`button ${filters.favorites ? 'primary' : 'secondary'}`} aria-pressed={filters.favorites} onClick={() => change('favorites', !filters.favorites)}><Heart size={17} fill={filters.favorites ? 'currentColor' : 'none'} />Favorites only</button>
      <SearchSuggestions label="Relationship" placeholder="e.g. Castiel/Dean" value={filters.relationship} onChange={value => change('relationship', value)} groups={[{ label: 'Relationships', values: relationships }]} keepOpen hideHeadings help="Matches saved AO3 relationship tags." />
      <SearchSuggestions label="AO3 tags" placeholder="Tags, separated by commas" value={filters.tags} onChange={value => change('tags', value)} groups={[{ label: 'AO3 tags', values: ao3Tags }]} multiple keepOpen hideHeadings help="Each tag must match; partial names are supported." />
      <fieldset className="updated-filter"><legend>Last updated on AO3</legend><label>From<input type="date" value={filters.updatedAfter} onChange={e => change('updatedAfter', e.target.value)} /></label><label>Through<input type="date" value={filters.updatedBefore} onChange={e => change('updatedBefore', e.target.value)} /></label></fieldset>
    </div><div className="within-search"><div className="within-search-row"><div className="within-search-field"><label>Search within results<input type="search" placeholder="Search within results" aria-describedby="search-mode-description" value={filters.within} onChange={e => change('within', e.target.value)} /></label>

      <details className="search-help"><summary aria-label="Search syntax and modes"><Info size={18} /></summary><div id="search-mode-description"><p><strong>Any field</strong> combines saved titles, authors, fandoms, AO3 tags, personal tags, summaries, notes, ratings, statuses, and URLs. <strong>Summary</strong> searches only the fic’s summary. <strong>Notes</strong> searches only your private notes.</p><ul><li><code>book*</code> — any characters: book, books, booking.</li><li><code>Harry Potter</code> — AND: both terms must occur.</li><li><code>Harry || Potter</code> — OR: either or both terms.</li><li><code>"Harry Lockhart"</code> — words in exact sequence.</li><li><code>Harry -Lockhart</code> — include Harry, exclude Lockhart.</li></ul><p>AND and NOT apply before OR. Use a backslash to escape literal symbols, such as <code>\*</code>, <code>\-</code>, <code>\"</code>, <code>\|</code>, or <code>\\</code>. Matching ignores case and accents. Searches stay within the selected tile and filters.</p></div></details></div>
      <Dropdown label="Search in" value={filters.scope} onChange={value => change('scope', value as ReadingFilters['scope'])} options={[{ value: 'any', label: 'Any field' }, { value: 'summary', label: 'Summary' }, { value: 'notes', label: 'Notes' }]} />
    </div></div><p className="field-help">Last updated uses saved AO3 dates in UTC; stories without an AO3 date are excluded by date filters. Chapter counts are saved snapshots; unknown counts sort last.</p><div className="form-actions"><button className="button secondary" onClick={() => setFilters({ ...defaultReadingFilters })}>Clear all filters</button><button className="button secondary" onClick={() => setExpanded(false)}>Hide filters</button></div></section>}
    {activeFilters.length > 0 && <div className="active-reading-filters" aria-label="Active filters"><div className="filter-chips">{activeFilters.map(text => <span key={String(text)}>{text}</span>)}</div><button className="text-button" onClick={() => setFilters({ ...defaultReadingFilters })}>Clear all filters</button></div>}
    <nav className="reading-tiles" aria-label="Dashboard sections">{sections.map(([key, title, description]) => <button key={key} aria-label={title} aria-pressed={selected === key} className={selected === key ? 'selected' : ''} onClick={() => setParams({ shelf: key })}><strong>{title}</strong><span>{description}</span><span className="tile-count">{error ? '—' : filtered.filter(story => inReadingSection(story, key)).length}</span></button>)}</nav>
    <p className="results-count" role="status">{shown.length} {shown.length === 1 ? 'story' : 'stories'} shown</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!error && (shown.length ? readingGroups(shown, filters.groupBy).map(([name, group]) => <section key={name} className="reading-group">{name && <h2>{name} <span>({group.length})</span></h2>}<div className="story-grid">{group.map(story => renderStory(story))}</div></section>) : <section className="library-empty"><h2>{selected === 'new' ? 'No verified chapter updates' : 'No stories here yet'}</h2><p>{selected === 'new' ? 'New Chapter requires a saved notification and a verified unread-chapter destination. Phase 2 does not retrieve updates automatically.' : activeFilters.length ? 'Try another search or clear your filters.' : selected === 'view_all' ? 'Start reading a saved story, or choose To Read to see stories saved for later.' : 'Choose another tile, or use Add in the navigation to save a story.'}</p></section>)}
  </>
}
