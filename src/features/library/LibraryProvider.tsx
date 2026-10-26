import { useLocation } from 'react-router-dom'
import type { SeriesRecord } from './series/series'
import { editSnapshot } from './edit-merge'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { UndoNotice } from '../../components/UndoNotice'
import { abandonedReadingStatus, caughtUpReadingStatus, type Collection, type Story } from './model'
import { sampleMode } from '../../lib/sample-mode'
import { libraryFacetScope, loadLibraryFacets, loadLibraryNavigation, type LibraryFacets, type LibraryNavigation, deleteStory, loadCatalog, loadStories, loadSeriesRecord, loadAffectedCollections, loadCollections, queryLibrary, storyCatalogEntry, restoreStory, updateEntry, type LibraryQuery, type LibraryResults } from './repository'
type ReadingUndo = { id: string; storyId: string; title: string; message: string; saved?: { status: Story['reading_status']; progress: number }; previous?: { last_read_chapter: number; reading_status: Story['reading_status'] }; removed?: Story }
type LibraryState = { navigation: LibraryNavigation; navigationError: string; catalogLoaded: boolean; ensureCatalog: () => Promise<void>; fetchFacets: (query: LibraryQuery, signal: AbortSignal) => Promise<LibraryFacets>; temporaryPageSizes: Map<LibraryQuery['mode'], number>; rowHeights: Map<string, number>; series: SeriesRecord[]; stories: Story[]; collections: Collection[]; loading: boolean; error: string; revision: number; refresh: (ids?: string[]) => Promise<void>; refreshCollections: () => Promise<void>; loadDetails: (ids: string[]) => Promise<void>; retainDetails: (ids: string[]) => () => void; refreshSeries: (id: number, invalidate?: boolean) => Promise<void>; refreshStory: (id: string) => Promise<void>; fetchPage: (query: LibraryQuery, page: number, size: number, signal: AbortSignal) => Promise<LibraryResults>; markAllRead: (story: Story) => Promise<void>; markFinished: (story: Story) => Promise<void>; removeStory: (story: Story) => Promise<void> }
const Context = createContext<LibraryState | null>(null)
export function LibraryProvider({ children, userId = 'sample' }: { children: ReactNode; userId?: string }) {
  const [data, setData] = useState<{ stories: Story[]; collections: Collection[]; series?: SeriesRecord[] }>({ stories: [], collections: [], series: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [navigation, setNavigation] = useState<LibraryNavigation>({})
  const [firstPageLoaded, setFirstPageLoaded] = useState(false)
  const [navigationError, setNavigationError] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const catalogRequest = useRef<Promise<void> | null>(null)
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])
  const generation = useRef(0)
  const lifecycle = useRef(0)
  const [temporaryPageSizes] = useState(() => new Map<LibraryQuery['mode'], number>())
  const [rowHeights] = useState(() => new Map<string, number>())
  const cache = useRef(new Map<string, { query: LibraryQuery; result: LibraryResults }>())
  const facets = useRef(new Map<string, { query: LibraryQuery; result: LibraryFacets }>())
  const retainedDetails = useRef(new Map<string, number>())
  const boundDetails = useCallback((stories: Story[]) => {
    // Merges append recently loaded records. Keep the newest 100, plus any
    // mounted detail/series records when the visible set itself exceeds 100.
    let budget = Math.max(0, 100 - stories.filter(story => story.detailsLoaded !== false && retainedDetails.current.has(story.id)).length)
    const keep = new Set<string>()
    for (let i = stories.length - 1; i >= 0; i--) {
      const story = stories[i]
      if (story.detailsLoaded !== false && !retainedDetails.current.has(story.id) && budget-- > 0) keep.add(story.id)
    }
    return stories.map(story => story.detailsLoaded === false || retainedDetails.current.has(story.id) || keep.has(story.id) ? story : storyCatalogEntry(story))
  }, [])
  const retainDetails = useCallback((ids: string[]) => {
    for (const id of ids) retainedDetails.current.set(id, (retainedDetails.current.get(id) ?? 0) + 1)
    const wanted = new Set(ids)
    setData(previous => ({ ...previous, stories: boundDetails([...previous.stories.filter(story => !wanted.has(story.id)), ...previous.stories.filter(story => wanted.has(story.id))]) }))
    return () => {
      for (const id of ids) {
        const count = retainedDetails.current.get(id) ?? 0
        if (count <= 1) retainedDetails.current.delete(id)
        else retainedDetails.current.set(id, count - 1)
      }
      setData(previous => ({ ...previous, stories: boundDetails(previous.stories) }))
    }
  }, [boundDetails])
  const queue = useRef<Promise<void>>(Promise.resolve())
  const ensureCatalog = useCallback(async () => {
    if (catalogRequest.current) return catalogRequest.current
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      const next = await loadCatalog()
      if (life !== lifecycle.current) return
      setData(previous => {
        const ids = new Set(next.stories.map(story => story.id))
        const full = new Map(previous.stories.filter(story => story.detailsLoaded !== false && ids.has(story.id)).map(story => [story.id, story]))
        return { ...next, stories: boundDetails([...next.stories.filter(story => !full.has(story.id)), ...full.values()]) }
      })
      setCatalogLoaded(true); setError('')
    })
    queue.current = task
    catalogRequest.current = task
    try { await task } catch (error) { catalogRequest.current = null; setError(error instanceof Error ? error.message : 'Could not load your library.'); throw error }
  }, [boundDetails])
  // Unknown old records and series can affect any pool. Known manual collection
  // and author scopes can safely retain their pages when an edit is unrelated.
  const invalidateQueries = useCallback((affected: (query: LibraryQuery) => boolean) => {
    for (const entries of [cache.current, facets.current]) {
      for (const [key, entry] of entries) if (affected(entry.query)) entries.delete(key)
    }
  }, [])
  const invalidate = useCallback((before?: Story[], after?: Story[]) => {
    const affected = (query: LibraryQuery) => {
      if (!before || !after) return true
      const changed = [...before, ...after]
      if (query.author !== undefined && !changed.some(story => story.metadata.authors.includes(query.author!))) return false
      if (query.mode !== 'reading' && (query.mode === 'series' || query.shelf === 'series' || query.filters.showSeries) && changed.some(story => story.metadata.series?.length || story.metadata.series_memberships?.length)) return true
      if (query.mode !== 'reading' && !['all','currently_reading','paused_reading','to_read','finished','did_not_finish','series','recs','favorites'].includes(query.shelf)) {
        return changed.some(story => [...story.collectionIds, ...(story.automaticCollectionIds ?? [])].includes(query.shelf))
      }
      return true
    }
    invalidateQueries(affected)
  }, [invalidateQueries])
  const refresh = useCallback(async (ids?: string[]) => {
    const unique = ids ? [...new Set(ids)].sort() : undefined
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      if (life !== lifecycle.current) return
      const version = ++generation.current
      try {
        if (unique) {
          const before = dataRef.current.stories.filter(story => unique.includes(story.id))
          const next = await loadStories(unique)
          invalidate(before.length === unique.length ? before : undefined, next)
          const collections = await loadAffectedCollections([...new Set(next.flatMap(story => story.collectionIds))])
          if (version !== generation.current) return
          const wanted = new Set(unique), index = new Map(next.map(story => [story.id, story])), collectionIndex = new Map(collections.map(collection => [collection.id, collection]))
          setData(previous => {
            const stories = [...previous.stories.filter(story => !wanted.has(story.id)), ...index.values()]
            return { ...previous, collections: previous.collections.map(collection => collectionIndex.get(collection.id) ?? collection), stories: boundDetails(stories) }
          })
        } else {
          invalidate()
          catalogRequest.current = null; setCatalogLoaded(false)
          if (sampleMode) {
            const next = await loadCatalog()
            if (version !== generation.current) return
            setData({ ...next, stories: boundDetails(next.stories) }); setCatalogLoaded(true)
          } else {
            const collections = await loadCollections()
            if (version !== generation.current) return
            setData(previous => ({ ...previous, collections }))
          }
        }
        setError(''); setRevision(value => value + 1)
      } catch (e) {
        if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not load your library.')
        throw e
      } finally { if (version === generation.current) setLoading(false) }
    })
    queue.current = task
    await task
  }, [boundDetails, invalidate])
  const refreshCollections = useCallback(async () => {
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      if (life !== lifecycle.current) return
      const version = ++generation.current
      const collections = await loadCollections()
      // Collection appearance/order changes do not alter cached result pools.
      const previous = dataRef.current.collections
      const rulesChanged = collections.some(collection => JSON.stringify(collection.automatic_rules ?? null) !== JSON.stringify(previous.find(item => item.id === collection.id)?.automatic_rules ?? null))
      const removed = previous.filter(collection => !collections.some(item => item.id === collection.id))
      if (rulesChanged) invalidate()
      else if (removed.length) {
        const ids = new Set(removed.map(collection => collection.id))
        invalidateQueries(query => ids.has(query.shelf))
      }
      if (rulesChanged || removed.length) { catalogRequest.current = null; setCatalogLoaded(false) }
      if (version !== generation.current) return
      const ids = new Set(collections.map(collection => collection.id))
      const prune = <T extends { collectionIds?: string[] }>(item: T): T => item.collectionIds?.some(id => !ids.has(id)) ? { ...item, collectionIds: item.collectionIds.filter(id => ids.has(id)) } : item
      setData(previous => ({ ...previous, collections, stories: previous.stories.map(story => ({ ...prune(story), automaticCollectionIds: rulesChanged ? [] : story.automaticCollectionIds?.filter(id => ids.has(id)) })), series: previous.series?.map(prune) }))
      setRevision(value => value + 1)
    })
    queue.current = task
    await task
  }, [invalidate, invalidateQueries])
  const refreshSeries = useCallback(async (id: number, invalidate = true) => {
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      const version = invalidate ? ++generation.current : generation.current
      if (invalidate) {
        const includesSeries = (query: LibraryQuery) => query.author === undefined && query.mode !== 'reading' && (query.mode === 'series' || query.shelf === 'series' || query.filters.showSeries)
        invalidateQueries(includesSeries)
      }
      if (life !== lifecycle.current) return
      const record = await loadSeriesRecord(id)
      if (version !== generation.current) return
      setData(previous => ({ ...previous, series: [...(previous.series ?? []).filter(item => item.ao3_series_id !== id), ...(record ? [record] : [])] }))
      if (invalidate) setRevision(value => value + 1)
    })
    queue.current = task
    await task
  }, [invalidateQueries])
  const loadDetails = useCallback(async (ids: string[]) => {
    const version = generation.current
    let next: Story[]
    try { next = await loadStories(ids) } catch (error) { if (version === generation.current) setError(error instanceof Error ? error.message : 'Could not load details.'); throw error }
    if (version !== generation.current) return
    const wanted = new Set(ids)
    setData(previous => ({ ...previous, stories: boundDetails([...previous.stories.filter(story => !wanted.has(story.id)), ...next]) }))
  }, [boundDetails])
  const refreshStory = useCallback((id: string) => refresh([id]), [refresh])
  const fetchPage = useCallback(async (query: LibraryQuery, page: number, size: number, signal: AbortSignal) => {
    const key = JSON.stringify([userId, query, page, size])
    const cached = cache.current.get(key)
    if (cached) { cache.current.delete(key); cache.current.set(key, cached); return cached.result }
    const version = generation.current
    const result = await queryLibrary(query, page, size, signal)
    if (!signal.aborted && version === generation.current) {
      setFirstPageLoaded(true)
      cache.current.set(key, { query, result })
      setData(previous => {
        const fullIds = new Set(previous.stories.filter(story => story.detailsLoaded !== false).map(story => story.id))
        const next = result.stories.filter(story => !story.id.startsWith('series:') && !fullIds.has(story.id)).map(storyCatalogEntry)
        const ids = new Set(next.map(story => story.id))
        return { ...previous, stories: boundDetails([...previous.stories.filter(story => !ids.has(story.id)), ...next]) }
      })
      while (cache.current.size > 6) cache.current.delete(cache.current.keys().next().value!)
    }
    if (version !== generation.current) throw new DOMException('Obsolete library result', 'AbortError')
    return result
  }, [userId, boundDetails])
  const fetchFacets = useCallback(async (query: LibraryQuery, signal: AbortSignal) => {
    const key = JSON.stringify(libraryFacetScope(query)), cached = facets.current.get(key)
    if (cached) return cached.result
    const version = generation.current, result = await loadLibraryFacets(query, signal)
    if (version !== generation.current || signal.aborted) throw new DOMException('Obsolete library facets', 'AbortError')
    facets.current.set(key, { query, result })
    while (facets.current.size > 20) facets.current.delete(facets.current.keys().next().value!)
    return result
  }, [])
  useEffect(() => {
    if (sampleMode || loading || !firstPageLoaded && !catalogLoaded) return
    let alive = true
    void loadLibraryNavigation().then(result => { if (alive) { setNavigation(result); setNavigationError('') } }).catch(error => { if (alive) setNavigationError(error instanceof Error ? error.message : 'Could not load collection counts.') })
    return () => { alive = false }
  }, [revision, loading, firstPageLoaded, catalogLoaded])
  const location = useLocation()
  const [undoNotices, setUndoNotices] = useState<ReadingUndo[]>([])
  const noticeUrl = location.pathname + location.search
  const [noticeLocation, setNoticeLocation] = useState(noticeUrl)
  if (noticeLocation !== noticeUrl) { setNoticeLocation(noticeUrl); setUndoNotices([]) }
  const dismissUndo = useCallback((id: string) => setUndoNotices(notices => notices.filter(notice => notice.id !== id)), [])
  async function updateReadingWithUndo(story: Story, status: Story['reading_status'], chapters: number, message: string) {
    await updateEntry(story.id, { last_read_chapter: chapters, reading_status: status }, editSnapshot(story))
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), {
      id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message,
      saved: { status, progress: chapters },
      previous: notices.find(notice => notice.storyId === story.id)?.previous ?? { last_read_chapter: story.last_read_chapter, reading_status: story.reading_status },
    }].slice(-3))
    await refreshStory(story.id)
  }
  async function markAllRead(story: Story) {
    if (story.metadata.published_chapters === null) return
    const status = abandonedReadingStatus(caughtUpReadingStatus(story.reading_status, story.metadata), story.metadata.published_chapters, story.metadata)
    await updateReadingWithUndo(story, status, story.metadata.published_chapters, `Marked all chapters of “${story.metadata.title}” as read${status === 'finished' ? ' and fic as finished.' : status === 'waiting_for_updates' ? '. Waiting for updates.' : '.'}`)
  }
  async function removeStory(story: Story) {
    const snapshot = (await loadStories([story.id]))[0] ?? story
    await deleteStory(story.id)
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), { id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message: `Removed “${story.metadata.title}” from your library.`, removed: snapshot }].slice(-3))
    await refreshStory(story.id)
  }
  async function markFinished(story: Story) {
    const chapters = story.metadata.published_chapters ?? story.metadata.total_chapters
    await updateReadingWithUndo(story, 'finished', chapters ?? story.last_read_chapter, `Marked “${story.metadata.title}” as finished.${chapters === null ? '' : ' All chapters marked as read.'}`)
  }
  useEffect(() => {
    const life = lifecycle.current
    void (async () => {
      try {
        if (sampleMode) await ensureCatalog()
        else {
          const collections = await loadCollections()
          if (life !== lifecycle.current) return
          setData(previous => ({ ...previous, collections }))
        }
      } catch (error) { if (life === lifecycle.current) setError(error instanceof Error ? error.message : 'Could not load your library.') }
      finally { if (life === lifecycle.current) setLoading(false) }
    })()
    const pages = cache.current, facetCache = facets.current, heights = rowHeights, lifeRef = lifecycle, requests = generation
    return () => { lifeRef.current++; requests.current++; pages.clear(); facetCache.clear(); heights.clear(); temporaryPageSizes.clear() }
  }, [ensureCatalog, rowHeights, temporaryPageSizes])
  return <Context.Provider value={{ ...data, navigation, navigationError, catalogLoaded, ensureCatalog, fetchFacets, rowHeights, temporaryPageSizes, series: data.series ?? [], loading, error, revision, refresh, refreshCollections, refreshSeries, refreshStory, loadDetails, retainDetails, fetchPage, markAllRead, markFinished, removeStory }}>
    {undoNotices.length > 0 && <section className="reading-undo-notices" aria-label="Reading Updates">{undoNotices.map(notice => <UndoNotice key={notice.id} id={notice.id} message={notice.message} dismissLabel={`Dismiss Undo Notification for ${notice.title}`} onDismiss={dismissUndo} onUndo={async () => { if (notice.removed) await restoreStory(notice.removed); else if (notice.previous) await updateEntry(notice.storyId, notice.previous, notice.saved ?? {}); await refreshStory(notice.storyId) }} />)}</section>}
    {children}
  </Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary({ catalog = false }: { catalog?: boolean } = {}) {
  const value = useContext(Context)
  if (!value) throw new Error('Library provider missing')
  const { ensureCatalog, catalogLoaded, revision } = value
  useEffect(() => { if (catalog && !catalogLoaded) void ensureCatalog().catch(() => {}) }, [catalog, catalogLoaded, ensureCatalog, revision])
  return value
}
