import { TagFilterContext } from './tag-filter-context'
import { InfoTooltip } from '../../components/InfoTooltip'
import { ReaderControls } from '../offline/ReaderControls'
import { SeriesSummaryContext } from './series/series-summary-context'
import { RetryError } from '../../components/RetryError'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { MetadataRefreshButton } from '../imports/MetadataControls'
import { usePageMetadataRefresh } from '../imports/usePageMetadataRefresh'
import { LibraryResults } from './LibraryResults'
import { useLibrary } from './LibraryProvider'
import { sampleMode } from '../../lib/sample-mode'
import { SeriesCard } from './series/SeriesCollection'
import { useLibraryResults } from './useLibraryResults'
import { readBrowsing, writeBrowsing, readingPreferencesKey } from './browsing/browsing'
import { filterDefaultScope, readFilterDefaults } from './browsing/filter-defaults'
import { Pagination } from './browsing/Pagination'
import { pageSize, pageSizes } from './browsing/page-size'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { Bell, RotateCcw, Pause, Bookmark, Clock, Library, ListTree, ArrowDownWideNarrow } from 'lucide-react'
import { publicationStatuses } from './publication-status'
import type { Story } from './model'
import { Dropdown } from '../../components/Dropdown'
import { ReadingFilterControls } from './ReadingFilterControls'
import { filterReading, hasReadingFilters, inReadingSection, tracked, type ReadingFilters, type SortOrder } from './reading-search'

const sortOptions: { value: SortOrder; label: string }[] = [
  { value: 'added', label: 'Date Added' }, { value: 'updated', label: 'Last Updated' },
  { value: 'ready', label: 'Chapters Ready' }, { value: 'words', label: 'Word Count' },
  { value: 'random', label: 'Random' }, { value: 'alpha', label: 'Alphabetical' },
]
const groupOptions: { value: ReadingFilters['groupBy']; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'fandom', label: 'Fandom' },
  { value: 'author', label: 'Author' }, { value: 'series', label: 'Series' },
]
function SortSelect({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  return <Dropdown fitContent label="Sort" icon={ArrowDownWideNarrow} compact mobileIconOnly value={value.replace(/_reverse$/, '')} onChange={next => onChange((next === value && next !== 'random' ? `${next}_reverse` : next) as SortOrder)} options={sortOptions.map(option => ({ ...option, label: `${option.label}${option.value === value.replace(/_reverse$/, '') && value !== 'random' ? value.endsWith('_reverse') !== (option.value === 'alpha') ? ' ↑' : ' ↓' : ''}` }))} />
}
const mobileQuery = '(max-width: 650px)'
const mobileSectionOrder: Partial<Record<string, number>> = { to_read: 4, waiting: 5, paused_reading: 6, view_all: 7 }
const sections = [
  ['complete', publicationStatuses.complete.label, 'All chapters out', publicationStatuses.complete.Icon], ['in_progress', publicationStatuses.in_progress.label, 'More chapters ahead', publicationStatuses.in_progress.Icon],
  ['new', 'New Chapter', 'Caught up stories', Bell], ['re_reading', 'Re-Reading', 'Reading again', RotateCcw], ['view_all', 'View All', 'Non-caught up', Library],
  ['waiting', 'Waiting for Updates', 'Following ongoing stories', Clock],
  ['paused_reading', 'Paused Reading', 'Resume later', Pause],
  ['to_read', 'To Read', 'Saved for later', Bookmark],
] as const

export function ReadingDashboard({ stories, renderStory, mode = 'reading', showActions = true, renderHeader, filterItems = filterReading, author, localOnly = false }: { localOnly?: boolean; stories: Story[]; renderStory: (story: Story, linkId?: string) => ReactNode; mode?: 'reading' | 'library' | 'series'; showActions?: boolean; renderHeader?: (actions: ReactNode, total: number | undefined, selectShelf: (shelf: string) => void) => ReactNode; filterItems?: typeof filterReading; author?: string }) {
  const localResults = sampleMode || localOnly
  const [mobile, setMobile] = useState(() => window.matchMedia?.(mobileQuery).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(mobileQuery)
    if (!query) return
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const displayedSections = mobile ? [...sections].sort((a, b) => (mobileSectionOrder[a[0]] ?? sections.indexOf(a)) - (mobileSectionOrder[b[0]] ?? sections.indexOf(b))) : sections
  const [params, setParams] = useSearchParams()
  const { key: entryKey } = useLocation()
  const navigationType = useNavigationType()
  const [filterNavigation, setFilterNavigation] = useState({ entryKey, revision: 0 })
  if (filterNavigation.entryKey !== entryKey) setFilterNavigation({ entryKey, revision: filterNavigation.revision + (navigationType === 'POP' ? 1 : 0) })
  const selected = author !== undefined ? 'all' : params.get('shelf') ?? (mode === 'reading' ? 'view_all' : 'all')
  const defaultScope = author !== undefined ? `author:${author}` : filterDefaultScope(mode, selected)
  const [summaryState, setSummaryState] = useState({ scope: defaultScope, expanded: false, revision: 0 })
  if (summaryState.scope !== defaultScope) setSummaryState({ scope: defaultScope, expanded: false, revision: summaryState.revision + 1 })
  // Rapid navigation can return to this scope without unmounting the dashboard.
  // Re-read browser preferences for each history entry; explicit URL values win.
  const [defaults, setDefaults] = useState(() => ({ scope: defaultScope, entryKey, filters: readFilterDefaults(defaultScope) }))
  if (defaults.scope !== defaultScope || defaults.entryKey !== entryKey) setDefaults({ scope: defaultScope, entryKey, filters: readFilterDefaults(defaultScope) })
  const decoded = useMemo(() => readBrowsing(params, defaults.filters), [params, defaults.filters])
  // Retain local selections across detail navigation; a reload creates a new provider.
  const { temporaryPageSizes, revisionError, checkRevision } = useLibrary()
  const [temporarySize, setTemporarySize] = useState(() => pageSize(params.get('size')) === undefined ? temporaryPageSizes.get(mode) : undefined)
  const [draft, setDraft] = useState<{ source: string; filters: ReadingFilters } | null>(null)
  const currentUrl = params.toString()
  const [pendingShelf, setPendingShelf] = useState<{ source: string; shelf: string } | null>(null)
  if (pendingShelf && pendingShelf.source !== currentUrl) setPendingShelf(null)
  const currentFilters = draft?.source === currentUrl ? draft.filters : decoded.filters
  const filters = useMemo(() => author !== undefined ? { ...currentFilters, showSeries: false } : currentFilters, [currentFilters, author])
  const page = draft?.source === currentUrl ? 1 : decoded.page, size = temporarySize ?? decoded.size
  const urlSize = temporarySize === undefined ? pageSize(params.get('size')) : undefined
  if (draft && draft.source !== currentUrl) setDraft(null)
  const setFilters = useCallback((update: (previous: ReadingFilters) => ReadingFilters) => {
    const next = update(filters)
    // Save the user's ordering before navigation can unmount this dashboard.
    try { window.localStorage.setItem(readingPreferencesKey, JSON.stringify({ sort: next.sort, groupBy: next.groupBy })) }
    catch { /* The current selections still work when browser storage is unavailable. */ }
    const nextParams = writeBrowsing(params, next, urlSize)
    // A shelf click may still be waiting for Router when Apply or Clear runs.
    if (pendingShelf?.source === currentUrl) nextParams.set('shelf', pendingShelf.shelf)
    setDraft({ source: currentUrl, filters: next }); setParams(nextParams)
  }, [filters, params, urlSize, pendingShelf, currentUrl, setParams])
  const selectShelf = useCallback((shelf: string) => {
    // The URL transition may still be pending after Apply or Clear All Filters.
    // Shelf navigation must use the same optimistic filters as the controls.
    const next = writeBrowsing(params, readFilterDefaults(filterDefaultScope(mode, shelf), filters), mode === 'reading' ? urlSize : undefined)
    setPendingShelf({ source: currentUrl, shelf })
    next.set('shelf', shelf); setParams(next)
  }, [params, currentUrl, mode, filters, urlSize, setParams])
  function applyFilters(next: ReadingFilters) {
    // Ordering belongs to the dashboard controls, not a filter-panel snapshot.
    setFilters(previous => ({ ...next, sort: previous.sort, groupBy: previous.groupBy, ...(previous.randomSeed && { randomSeed: previous.randomSeed }) }))
  }
  // Normalize before user navigation can race a deferred effect from this route.
  // Local page-size edits stay temporary.
  const normalized = useRef('')
  useLayoutEffect(() => {
    if (draft) return
    const input = JSON.stringify([params.toString(), filters, urlSize, page, mode])
    // Activity updates can commit again while Router navigation is pending.
    // Do not repeat a replacement from the route being left behind.
    if (normalized.current === input) return
    normalized.current = input
    const next = writeBrowsing(params, filters, urlSize, page)
    if (!next.has('shelf')) next.set('shelf', mode === 'reading' ? 'view_all' : 'all')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [params, setParams, filters, urlSize, page, mode, draft])
  const pool = useMemo(() => {
    const works = author !== undefined ? stories.filter(story => story.metadata.authors.includes(author)) : stories
    return mode === 'reading' ? tracked(works) : works
  }, [mode, stories, author])
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { setFilters(previous => ({ ...previous, [key]: value, ...(key === 'sort' && value === 'random' && { randomSeed: crypto.randomUUID() }) })) }
  let error = '', filtered: Story[] = []
  try { filtered = filterItems(localResults ? pool : [], filters) } catch (e) { error = (e as Error).message }
  const localShown = error ? [] : filtered.filter(s => mode !== 'reading' || inReadingSection(s, selected))
  const availability = params.get('availability')
  const remote = useLibraryResults({ mode, shelf: selected, filters, ...(availability === 'unfolded' || availability === 'bookfusion' ? { availability } : params.get('reader') ? { reader: params.get('reader')! } : {}), ...(author !== undefined && { author }) }, page, size, !localResults && !error)
  const displayed = remote.result ?? remote.previousResult
  const countsStale = !localResults && !remote.result
  const total = localResults ? localShown.length : displayed?.total
  const pages = localResults ? Math.max(1, Math.ceil((total ?? 0) / size)) : displayed?.pages ?? 1
  const currentPage = localResults ? Math.min(page, pages) : remote.result?.page ?? page
  const shown = localResults ? localShown.slice((currentPage - 1) * size, currentPage * size) : remote.result?.stories ?? remote.previousResult?.stories ?? []
  const seriesById = new Map((remote.result ?? remote.previousResult)?.series.map(series => [`series:${series.seriesId}`, series]) ?? [])
  const refreshStories = shown.flatMap(story => seriesById.get(story.id)?.savedStories ?? [story])
  const metadataRefresh = usePageMetadataRefresh(refreshStories)
  const [confirmRefresh, setConfirmRefresh] = useState(false)
  const refreshButton = <MetadataRefreshButton {...metadataRefresh} unavailable={metadataRefresh.unavailable || remote.loading || Boolean(error || remote.error)} onRefresh={() => mobile ? setConfirmRefresh(true) : void metadataRefresh.refresh()} variant="icon" label="Mass Refresh All Stories on Page" description="Mass Refresh All Stories on Page" />
  useLayoutEffect(() => {
    if ((localResults || remote.result) && page !== currentPage) setParams(writeBrowsing(params, filters, urlSize, currentPage), { replace: true })
  }, [page, currentPage, remote.result, params, filters, urlSize, setParams, localResults])
  function changePage(value: number) { setParams(writeBrowsing(params, filters, urlSize, value)) }
  error ||= remote.error ?? ''
  const sortControl = <SortSelect value={filters.sort} onChange={sort => change('sort', sort)} />
  const pagination = (inlinePage = false) => <Pagination range={localResults ? undefined : remote.range} stale={countsStale || Boolean(revisionError)} countError={Boolean(remote.error || revisionError)} inlinePage={inlinePage} page={currentPage} pages={pages} total={total} size={size} onPage={changePage} leading={mode !== 'reading' && (mode === 'series' || filters.showSeries) ? <div className="series-summary-controls">{[true, false].map(expanded => <button key={String(expanded)} type="button" className="text-button" onClick={() => setSummaryState(current => ({ ...current, expanded, revision: current.revision + 1 }))}>{expanded ? 'Expand All Work Summaries' : 'Collapse All Work Summaries'}</button>)}</div> : undefined} trailing={inlinePage ? !mobile && sortControl : <><InfoTooltip description="Changing works per page here is temporary and resets when you reload the page. Change the default works per page in Settings." label="Works per Page Information" size={16} /><label className="pagination-size">Works per Page<select className="filter-input select-fit" value={size} onChange={event => { temporaryPageSizes.set(mode, Number(event.target.value)); setTemporarySize(Number(event.target.value)); setParams(writeBrowsing(params, filters, undefined)) }}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label></>} />
  const orderingControls = <Dropdown label="Group" icon={ListTree} compact mobileIconOnly value={filters.groupBy} onChange={value => change('groupBy', value as ReadingFilters['groupBy'])} options={groupOptions} />
  const headerActions = showActions && refreshButton
  const searchTag = useCallback((tag: string) => setFilters(previous => ({ ...previous, within: `"${tag.replace(/[\\"*|-]/g, '\\$&')}"`, scope: 'any' })), [setFilters])
  return <SeriesSummaryContext value={summaryState}>
    {confirmRefresh && <ConfirmationDialog title="Mass Refresh?" confirmLabel="Mass Refresh" pendingLabel="Refreshing…" onClose={() => setConfirmRefresh(false)} onConfirm={async () => { await metadataRefresh.refresh() }}><p>Refresh AO3 metadata for all works on this page?</p></ConfirmationDialog>}
    {renderHeader ? renderHeader(headerActions, localResults ? pool.length : remote.facets?.total, selectShelf) : <div className="library-heading-actions">{headerActions}</div>}
    {metadataRefresh.message && <p role={metadataRefresh.status === 'failed' ? 'alert' : 'status'}>{metadataRefresh.message} <Link className="clickable-text" to="/imports">View Import History</Link></p>}
    {mode === 'reading' && <nav className="reading-tiles" aria-label="Dashboard Sections">{displayedSections.map(([key, title, description, Icon]) => {
      const label = mobile && key === 'waiting' ? 'Waiting' : title
      return <button key={key} aria-label={label} aria-pressed={selected === key} className={selected === key ? 'selected' : ''} onClick={() => selectShelf(key)}><Icon className="tile-icon" strokeWidth={1.6} aria-hidden="true" /><strong>{label}</strong><span className="tile-description">{description}</span><span className="tile-count">{localResults ? error ? '—' : filtered.filter(story => inReadingSection(story, key)).length : displayed?.sections[key] ?? '—'}</span></button>
    })}</nav>}
    {revisionError && <p role="status" className="field-help">{revisionError} <button className="text-button" onClick={() => void checkRevision(true)}>Retry Counts</button></p>}
    <ReadingFilterControls navigationKey={String(filterNavigation.revision)} availabilityControl={!localOnly && mode === 'library' ? <ReaderControls /> : undefined} worksOnly={localOnly || author !== undefined} defaultScope={defaultScope} stories={pool} filters={filters} onChange={applyFilters} mode={mode} orderingControls={orderingControls} sortControl={mobile ? sortControl : undefined} suggestions={remote.suggestions} fandomOptions={remote.facets?.fandoms} />
    {pagination(true)}
    {remote.facetsError && <RetryError message={remote.facetsError} onRetry={remote.retrySuggestions} retryLabel="Retry Suggestions" />}
    {remote.loading && <p role="status" data-results-loading="true">Loading results…</p>}
    {error && <RetryError message={error} onRetry={remote.error ? remote.retry : undefined} />}
    {(!error || Boolean(remote.error && shown.length)) && (shown.length ? <TagFilterContext value={searchTag}><LibraryResults stories={shown} groupBy={filters.groupBy} renderStory={(story, linkId) => seriesById.has(story.id) ? <SeriesCard key={story.id} series={seriesById.get(story.id)!} linkId={linkId} /> : renderStory(story, linkId)} /></TagFilterContext> : !remote.loading && <section className="library-empty"><h2>{selected === 'new' ? 'No Verified Chapter Updates' : 'No Stories Here Yet'}</h2><p>{selected === 'new' ? 'New Chapter requires a saved notification and a verified unread-chapter destination. Phase 2 does not retrieve updates automatically.' : hasReadingFilters(filters) ? 'Try another search or clear your filters.' : mode === 'library' ? 'Add a story manually or choose another shelf.' : selected === 'view_all' ? 'Start reading a saved story, or choose To Read to see stories saved for later.' : 'Choose another tile, or use Add in the navigation to save a story.'}</p></section>)}
    {!error && (localResults ? shown.length > 0 : (displayed?.total ?? 0) > 0) && (!remote.loading || Boolean(displayed)) && pagination()}
  </SeriesSummaryContext>
}
