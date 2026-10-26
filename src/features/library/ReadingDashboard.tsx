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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, RotateCcw, Pause, Bookmark, Clock, Info, Library, ListTree, ArrowDownWideNarrow } from 'lucide-react'
import { publicationStatuses } from './publication-status'
import type { Story } from './model'
import { Dropdown } from '../../components/Dropdown'
import { Tooltip } from '../../components/Tooltip'
import { ReadingFilterControls } from './ReadingFilterControls'
import { filterReading, hasReadingFilters, inReadingSection, tracked, type ReadingFilters, type SortOrder } from './reading-search'

const sortOptions: { value: SortOrder; label: string }[] = [
  { value: 'added', label: 'Date Added' }, { value: 'added_reverse', label: 'Date Added (Oldest First)' },
  { value: 'updated', label: 'Last Updated' }, { value: 'updated_reverse', label: 'Last Updated (Oldest First)' },
  { value: 'ready', label: 'Most Chapters Ready' }, { value: 'ready_reverse', label: 'Fewest Chapters Ready' },
  { value: 'random', label: 'Random' },
  { value: 'alpha', label: 'Alphabetical' }, { value: 'alpha_reverse', label: 'Alphabetical (Z–A)' },
]
const groupOptions: { value: ReadingFilters['groupBy']; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'fandom', label: 'Fandom' },
  { value: 'author', label: 'Author' }, { value: 'series', label: 'Series' },
]
function SortSelect({ value, onChange }: { value: SortOrder; onChange: (value: SortOrder) => void }) {
  return <Dropdown label="Sort" icon={ArrowDownWideNarrow} compact mobileIconOnly value={value} onChange={value => onChange(value as SortOrder)} options={sortOptions} />
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

export function ReadingDashboard({ stories, renderStory, mode = 'reading', resultsActions, showActions = true, renderHeader, filterItems = filterReading }: { stories: Story[]; renderStory: (story: Story, linkId?: string) => ReactNode; mode?: 'reading' | 'library' | 'series'; resultsActions?: ReactNode; showActions?: boolean; renderHeader?: (actions: ReactNode) => ReactNode; filterItems?: typeof filterReading }) {
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
  const selected = params.get('shelf') ?? (mode === 'reading' ? 'view_all' : 'all')
  const defaultScope = filterDefaultScope(mode, selected)
  const [defaults, setDefaults] = useState(() => ({ scope: defaultScope, filters: readFilterDefaults(defaultScope) }))
  if (defaults.scope !== defaultScope) setDefaults({ scope: defaultScope, filters: readFilterDefaults(defaultScope) })
  const decoded = readBrowsing(params, defaults.filters)
  // Retain local selections across detail navigation; a reload creates a new provider.
  const { temporaryPageSizes } = useLibrary()
  const [temporarySize, setTemporarySize] = useState(() => pageSize(params.get('size')) === undefined ? temporaryPageSizes.get(mode) : undefined)
  const [draft, setDraft] = useState<{ source: string; filters: ReadingFilters } | null>(null)
  const currentUrl = params.toString()
  const filters = draft?.source === currentUrl ? draft.filters : decoded.filters
  const page = draft?.source === currentUrl ? 1 : decoded.page, size = temporarySize ?? decoded.size
  const urlSize = temporarySize === undefined ? pageSize(params.get('size')) : undefined
  if (draft && draft.source !== currentUrl) setDraft(null)
  function setFilters(update: (previous: ReadingFilters) => ReadingFilters) { const next = update(filters); setDraft({ source: currentUrl, filters: next }); setParams(writeBrowsing(params, next, urlSize)) }
  // Keep filters and explicit links reproducible; local page-size edits stay temporary.
  useEffect(() => {
    if (draft) return
    const next = writeBrowsing(params, filters, urlSize, page)
    if (!next.has('shelf')) next.set('shelf', mode === 'reading' ? 'view_all' : 'all')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [params, setParams, filters, urlSize, page, mode, draft])
  useEffect(() => {
    try { window.localStorage.setItem(readingPreferencesKey, JSON.stringify({ sort: filters.sort, groupBy: filters.groupBy })) }
    catch { /* The current selections still work when browser storage is unavailable. */ }
  }, [filters.sort, filters.groupBy])
  const pool = useMemo(() => mode === 'reading' ? tracked(stories) : stories, [mode, stories])
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { setFilters(previous => ({ ...previous, [key]: value, ...(key === 'sort' && value === 'random' && { randomSeed: crypto.randomUUID() }) })) }
  let error = '', filtered: Story[] = []
  try { filtered = filterItems(sampleMode ? pool : [], filters) } catch (e) { error = (e as Error).message }
  const localShown = error ? [] : filtered.filter(s => mode !== 'reading' || inReadingSection(s, selected))
  const remote = useLibraryResults({ mode, shelf: selected, filters }, page, size, !sampleMode && !error)
  const total = sampleMode ? localShown.length : remote.result?.total ?? 0
  const pages = sampleMode ? Math.max(1, Math.ceil(total / size)) : remote.result?.pages ?? 1
  const currentPage = sampleMode ? Math.min(page, pages) : remote.result?.page ?? page
  const shown = sampleMode ? localShown.slice((currentPage - 1) * size, currentPage * size) : remote.result?.stories ?? remote.previousResult?.stories ?? []
  const seriesById = new Map((remote.result ?? remote.previousResult)?.series.map(series => [`series:${series.seriesId}`, series]) ?? [])
  const refreshStories = shown.flatMap(story => seriesById.get(story.id)?.savedStories ?? [story])
  const metadataRefresh = usePageMetadataRefresh(refreshStories)
  const refreshButton = <MetadataRefreshButton {...metadataRefresh} unavailable={metadataRefresh.unavailable || remote.loading || Boolean(error || remote.error)} onRefresh={() => void metadataRefresh.refresh()} variant="icon" label="Mass Refresh All Stories on Page" description="Mass Refresh All Stories on Page" />
  useEffect(() => {
    if ((sampleMode || remote.result) && page !== currentPage) setParams(writeBrowsing(params, filters, urlSize, currentPage), { replace: true })
  }, [page, currentPage, remote.result, params, filters, urlSize, setParams])
  function changePage(value: number) { setParams(writeBrowsing(params, filters, urlSize, value)) }
  error ||= remote.error ?? ''
  const pagination = (inlinePage = false) => <Pagination inlinePage={inlinePage} page={currentPage} pages={pages} total={total} size={size} onPage={changePage} trailing={<><Tooltip pinOnClick description="Changing works per page here is temporary and resets when you reload the page. Change the default works per page in Settings.">{id => <button type="button" className="icon-button" aria-label="Works per Page Information" aria-describedby={id}><Info size={16} aria-hidden="true" /></button>}</Tooltip><label className="pagination-size">Works per Page<select className="filter-input select-fit" value={size} onChange={event => { temporaryPageSizes.set(mode, Number(event.target.value)); setTemporarySize(Number(event.target.value)); setParams(writeBrowsing(params, filters, undefined)) }}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label></>} />
  const orderingControls = <>
    <SortSelect value={filters.sort} onChange={sort => change('sort', sort)} />
    <Dropdown label="Group" icon={ListTree} compact mobileIconOnly value={filters.groupBy} onChange={value => change('groupBy', value as ReadingFilters['groupBy'])} options={groupOptions} />
  </>
  const headerActions = <>{showActions && <>{refreshButton}<span className="library-add-actions">{resultsActions}</span></>}</>
  return <>
    {renderHeader ? renderHeader(headerActions) : <div className="library-heading-actions">{headerActions}</div>}
    {metadataRefresh.message && <p role={metadataRefresh.status === 'failed' ? 'alert' : 'status'}>{metadataRefresh.message} <Link className="clickable-text" to="/imports">View Import History</Link></p>}
    {mode === 'reading' && <nav className="reading-tiles" aria-label="Dashboard Sections">{displayedSections.map(([key, title, description, Icon]) => {
      const label = mobile && key === 'waiting' ? 'Waiting' : title
      return <button key={key} aria-label={label} aria-pressed={selected === key} className={selected === key ? 'selected' : ''} onClick={() => { const next = writeBrowsing(params, readFilterDefaults(filterDefaultScope(mode, key), filters), urlSize); next.set('shelf', key); setParams(next) }}><Icon className="tile-icon" strokeWidth={1.6} aria-hidden="true" /><strong>{label}</strong><span className="tile-description">{description}</span><span className="tile-count">{error ? '—' : sampleMode ? filtered.filter(story => inReadingSection(story, key)).length : remote.result?.sections[key] ?? '—'}</span></button>
    })}</nav>}
    <ReadingFilterControls defaultScope={defaultScope} stories={pool} filters={filters} onChange={next => setFilters(() => next)} mode={mode} orderingControls={orderingControls} suggestions={remote.suggestions} fandomOptions={remote.result?.fandoms} />
    {pagination(true)}
    {remote.loading && <p role="status" data-results-loading="true">Loading results…</p>}
    {error && <div role="alert" className="error-message error-message-retry"><p>{error}</p>{remote.error && <button className="button secondary" onClick={remote.retry}>Retry Loading</button>}</div>}
    {!error && (shown.length ? <LibraryResults stories={shown} groupBy={filters.groupBy} renderStory={(story, linkId) => seriesById.has(story.id) ? <SeriesCard key={story.id} series={seriesById.get(story.id)!} linkId={linkId} /> : renderStory(story, linkId)} /> : !remote.loading && <section className="library-empty"><h2>{selected === 'new' ? 'No Verified Chapter Updates' : 'No Stories Here Yet'}</h2><p>{selected === 'new' ? 'New Chapter requires a saved notification and a verified unread-chapter destination. Phase 2 does not retrieve updates automatically.' : hasReadingFilters(filters) ? 'Try another search or clear your filters.' : mode === 'library' ? 'Add a story manually or choose another shelf.' : selected === 'view_all' ? 'Start reading a saved story, or choose To Read to see stories saved for later.' : 'Choose another tile, or use Add in the navigation to save a story.'}</p></section>)}
    {!error && !remote.loading && pagination()}
  </>
}
