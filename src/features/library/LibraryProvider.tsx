import { hasTagFilters, hasTagRules, tagResolutionEvent } from './tags/tag-resolution'
import { useLocation } from 'react-router-dom'
import type { SeriesRecord } from './series/series'
import { editSnapshot } from './edit-merge'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { UndoNotice } from '../../components/UndoNotice'
import { abandonedReadingStatus, caughtUpReadingStatus, type Collection, type Story } from './model'
import { sampleMode } from '../../lib/sample-mode'
import { libraryQueryHasSeries, libraryFacetScope, loadLibraryFacets, loadLibraryNavigation, loadLibraryRevision, type LibraryFacets, type LibraryNavigation, deleteStory, loadCatalog, loadStories, loadSeriesRecord, loadAffectedCollections, loadCollections, queryLibrary, storyCatalogEntry, restoreStory, updateEntry, type LibraryQuery, type LibraryResults } from './repository'
type ReadingUndo = { id: string; storyId: string; title: string; message: string; saved?: { status: Story['reading_status']; progress: number }; previous?: { last_read_chapter: number; reading_status: Story['reading_status'] }; removed?: Story }
const revisionCheckInterval = 45_000
const pageCacheKey = (query: LibraryQuery, page: number, size: number) => JSON.stringify([query, page, size])
type LibraryState = { userId: string; retryCounts: () => Promise<void>; navigationLoading: boolean; revisionError: string; checkRevision: (force?: boolean) => Promise<void>; hasCachedPage: (query: LibraryQuery, page: number, size: number) => boolean; tagRevision: number; navigation: LibraryNavigation; navigationError: string; catalogLoaded: boolean; ensureCatalog: () => Promise<void>; fetchFacets: (query: LibraryQuery, signal: AbortSignal) => Promise<LibraryFacets>; temporaryPageSizes: Map<LibraryQuery['mode'], number>; rowHeights: Map<string, number>; series: SeriesRecord[]; stories: Story[]; collections: Collection[]; loading: boolean; error: string; revision: number; refresh: (ids?: string[]) => Promise<void>; refreshCollections: () => Promise<void>; loadDetails: (ids: string[]) => Promise<void>; retainDetails: (ids: string[]) => () => void; refreshSeries: (id: number, invalidate?: boolean) => Promise<void>; refreshStory: (id: string) => Promise<void>; fetchPage: (query: LibraryQuery, page: number, size: number, signal: AbortSignal) => Promise<LibraryResults>; markAllRead: (story: Story) => Promise<void>; markFinished: (story: Story) => Promise<void>; removeStory: (story: Story) => Promise<void> }
const Context = createContext<LibraryState | null>(null)
export function LibraryProvider({ children, userId = 'sample' }: { children: ReactNode; userId?: string }) {
  const [data, setData] = useState<{ stories: Story[]; collections: Collection[]; series?: SeriesRecord[] }>({ stories: [], collections: [], series: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [tagRevision, setTagRevision] = useState(0)
  const [navigation, setNavigation] = useState<LibraryNavigation>({})
  const [firstPageLoaded, setFirstPageLoaded] = useState(false)
  const [navigationError, setNavigationError] = useState('')
  const [navigationEpoch, setNavigationEpoch] = useState(0)
  const [navigationStatus, setNavigationStatus] = useState({ revision: -1, epoch: -1 })
  const navigationLoading = !sampleMode && (navigationStatus.revision !== revision || navigationStatus.epoch !== navigationEpoch)
  const [revisionError, setRevisionError] = useState('')
  const serverRevision = useRef<number | undefined>(undefined)
  const revisionCheckedAt = useRef(0)
  const revisionRequest = useRef<Promise<void> | null>(null)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const catalogRequest = useRef<Promise<void> | null>(null)
  const catalogController = useRef<AbortController | null>(null)
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])
  const generation = useRef(0)
  const tagGeneration = useRef(0)
  const lifecycle = useRef(0)
  const [temporaryPageSizes] = useState(() => new Map<LibraryQuery['mode'], number>())
  const [rowHeights] = useState(() => new Map<string, number>())
  const cache = useRef(new Map<string, { query: LibraryQuery; result: LibraryResults }>())
  const facets = useRef(new Map<string, { query: LibraryQuery; result: LibraryFacets }>())
  const seriesReads = useRef<Promise<unknown>>(Promise.resolve())
  const readQuery = useCallback(<T,>(hasSeries: boolean, signal: AbortSignal, read: () => Promise<T>) => {
    if (!hasSeries) return read()
    // Pages, suggestions, catalog and navigation share the reader's database budget.
    // Queue them so concurrent scans cannot exhaust the database time budget.
    const task = seriesReads.current.catch(() => {}).then(() => {
      if (signal.aborted) throw new DOMException('Library request cancelled', 'AbortError')
      return read()
    })
    seriesReads.current = task
    return task
  }, [])
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
    const life = lifecycle.current, controller = new AbortController()
    catalogController.current = controller
    const task = queue.current.catch(() => {}).then(async () => {
      const next = await readQuery(!sampleMode, controller.signal, () => loadCatalog(controller.signal))
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
    try { await task } catch (error) {
      if (life === lifecycle.current && catalogRequest.current === task) { catalogRequest.current = null; setError(error instanceof Error ? error.message : 'Could not load your library.') }
      throw error
    }
  }, [boundDetails, readQuery])
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
  const reloadCollections = useCallback(async () => {
    const version = generation.current, life = lifecycle.current
    try {
      const collections = await loadCollections()
      if (version === generation.current && life === lifecycle.current) setData(previous => ({ ...previous, collections }))
    } catch { if (version === generation.current && life === lifecycle.current) setRevisionError('Couldn’t update collections.') }
  }, [])
  const acceptRevision = useCallback((next: number | undefined) => {
    if (next === undefined) return true
    const known = serverRevision.current
    if (known !== undefined && next < known) return false
    serverRevision.current = next
    if (known === undefined || next === known) return true
    generation.current++
    invalidate()
    setData(previous => ({ ...previous, stories: previous.stories.map(storyCatalogEntry) }))
    void reloadCollections()
    catalogRequest.current = null; setCatalogLoaded(false)
    setRevision(value => value + 1)
    return false
  }, [invalidate, reloadCollections])
  const recordOwnRevision = useCallback(async (version: number, expectedChanges = 0) => {
    if (sampleMode) return
    try {
      const next = await loadLibraryRevision()
      if (version !== generation.current) return
      if (serverRevision.current !== undefined && next > serverRevision.current + expectedChanges) {
        invalidate()
        catalogRequest.current = null; setCatalogLoaded(false)
      }
      serverRevision.current = Math.max(serverRevision.current ?? next, next)
      revisionCheckedAt.current = Date.now(); setRevisionError('')
    } catch { if (version === generation.current) setRevisionError('Couldn’t update counts.') }
  }, [invalidate])
  const checkRevision = useCallback(async (force = false) => {
    if (sampleMode) return
    if (revisionRequest.current) return revisionRequest.current
    if (!force && Date.now() - revisionCheckedAt.current < revisionCheckInterval) return
    const version = generation.current, life = lifecycle.current
    const task = (async () => {
      try {
        const next = await loadLibraryRevision()
        if (life !== lifecycle.current || version !== generation.current) return
        acceptRevision(next); revisionCheckedAt.current = Date.now(); setRevisionError('')
      } catch {
        if (life === lifecycle.current && version === generation.current) setRevisionError('Couldn’t update counts.')
      }
    })()
    revisionRequest.current = task
    try { await task } finally { if (revisionRequest.current === task) revisionRequest.current = null }
  }, [acceptRevision])
  const retryCounts = useCallback(async () => { await checkRevision(true); await reloadCollections(); setNavigationEpoch(value => value + 1) }, [checkRevision, reloadCollections])
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail?.userId !== userId) return
      const automatic = new Set(dataRef.current.collections.filter(collection => hasTagRules(collection.automatic_rules)).map(collection => collection.id))
      tagGeneration.current++
      invalidateQueries(query => hasTagFilters(query.filters) || automatic.has(query.shelf))
      setTagRevision(tagGeneration.current)
      if (automatic.size) {
        catalogRequest.current = null; setCatalogLoaded(false)
        setNavigationEpoch(value => value + 1)
      }
    }
    window.addEventListener(tagResolutionEvent, changed)
    return () => window.removeEventListener(tagResolutionEvent, changed)
  }, [userId, invalidateQueries])
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
        await recordOwnRevision(version)
        if (version !== generation.current) return
        setError(''); setRevision(value => value + 1)
      } catch (e) {
        if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not load your library.')
        throw e
      } finally { if (version === generation.current) setLoading(false) }
    })
    queue.current = task
    await task
  }, [boundDetails, invalidate, recordOwnRevision])
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
      await recordOwnRevision(version)
      if (version !== generation.current) return
      setRevision(value => value + 1)
    })
    queue.current = task
    await task
  }, [invalidate, invalidateQueries, recordOwnRevision])
  const refreshSeries = useCallback(async (id: number, invalidate = true) => {
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      const version = invalidate ? ++generation.current : generation.current
      if (invalidate) {
        invalidateQueries(libraryQueryHasSeries)
      }
      if (life !== lifecycle.current) return
      const record = await loadSeriesRecord(id)
      if (version !== generation.current) return
      setData(previous => ({ ...previous, series: [...(previous.series ?? []).filter(item => item.ao3_series_id !== id), ...(record ? [record] : [])] }))
      // The targeted read already reconciles one series edit. Rebuilding the
      // catalog here would disable catalog consumers after every picker save.
      // Additional revisions still require reconciliation of unknown changes.
      if (invalidate) { await recordOwnRevision(version, 1); if (version === generation.current) setRevision(value => value + 1) }
    })
    queue.current = task
    await task
  }, [invalidateQueries, recordOwnRevision])
  const loadDetails = useCallback(async (ids: string[]) => {
    const version = generation.current
    let next: Story[]
    try { next = await loadStories(ids) } catch (error) { if (version === generation.current) setError(error instanceof Error ? error.message : 'Could not load details.'); throw error }
    if (version !== generation.current) return
    const wanted = new Set(ids)
    setData(previous => ({ ...previous, stories: boundDetails([...previous.stories.filter(story => !wanted.has(story.id)), ...next]) }))
  }, [boundDetails])
  const refreshStory = useCallback((id: string) => refresh([id]), [refresh])
  const hasCachedPage = useCallback((query: LibraryQuery, page: number, size: number) => {
    const entry = cache.current.get(pageCacheKey(query, page, size))
    return Boolean(entry)
  }, [])
  const fetchPage = useCallback(async (query: LibraryQuery, page: number, size: number, signal: AbortSignal) => {
    const key = pageCacheKey(query, page, size)
    const cached = cache.current.get(key)
    if (cached) { cache.current.delete(key); cache.current.set(key, cached); return cached.result }
    const version = generation.current
    const tagVersion = tagGeneration.current
    const result = await readQuery(libraryQueryHasSeries(query), signal, () => queryLibrary(query, page, size, signal))
    if (version !== generation.current || signal.aborted) throw new DOMException('Obsolete library result', 'AbortError')
    if (!acceptRevision(result.revision)) throw new DOMException('Obsolete library revision', 'AbortError')
    if (tagVersion !== tagGeneration.current && (hasTagFilters(query.filters) || dataRef.current.collections.some(collection => collection.id === query.shelf && hasTagRules(collection.automatic_rules)))) throw new DOMException('Obsolete tag result', 'AbortError')
    if (!signal.aborted && version === generation.current) {
      setFirstPageLoaded(true)
      cache.current.set(key, { query, result })
      setData(previous => {
        const fullIds = new Set(previous.stories.filter(story => story.detailsLoaded !== false).map(story => story.id))
        const next = result.stories.filter(story => !story.id.startsWith('series:') && !fullIds.has(story.id)).map(storyCatalogEntry)
        const ids = new Set(next.map(story => story.id))
        return { ...previous, stories: boundDetails([...previous.stories.filter(story => !ids.has(story.id)), ...next]) }
      })
      while (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value!)
    }
    if (version !== generation.current) throw new DOMException('Obsolete library result', 'AbortError')
    return result
  }, [acceptRevision, boundDetails, readQuery])
  const fetchFacets = useCallback(async (query: LibraryQuery, signal: AbortSignal) => {
    const key = JSON.stringify(libraryFacetScope(query)), cached = facets.current.get(key)
    if (cached) return cached.result
    const version = generation.current, tagVersion = tagGeneration.current, result = await readQuery(libraryQueryHasSeries(query), signal, () => loadLibraryFacets(query, signal))
    if (version !== generation.current || signal.aborted || tagVersion !== tagGeneration.current && dataRef.current.collections.some(collection => collection.id === query.shelf && hasTagRules(collection.automatic_rules))) throw new DOMException('Obsolete library facets', 'AbortError')
    facets.current.set(key, { query, result })
    while (facets.current.size > 20) facets.current.delete(facets.current.keys().next().value!)
    return result
  }, [readQuery])
  useEffect(() => {
    if (sampleMode || loading || !firstPageLoaded && !catalogLoaded) return
    let alive = true
    const controller = new AbortController()
    const version = generation.current
    void readQuery(true, controller.signal, () => loadLibraryNavigation(controller.signal)).then(result => { if (alive && version === generation.current && acceptRevision(result.revision)) { setNavigation(result.counts); setNavigationError('') } }).catch(error => { if (alive && version === generation.current) setNavigationError(error instanceof Error ? error.message : 'Couldn’t update counts.') }).finally(() => { if (alive) setNavigationStatus({ revision, epoch: navigationEpoch }) })
    return () => { alive = false; controller.abort() }
  }, [revision, loading, firstPageLoaded, catalogLoaded, navigationEpoch, acceptRevision, readQuery])
  const location = useLocation()
  useEffect(() => {
    const returned = () => { if (!document.hidden) void checkRevision(true) }
    const fallback = () => { if (!document.hidden) void checkRevision() }
    window.addEventListener('focus', returned)
    document.addEventListener('visibilitychange', returned)
    const timer = setInterval(fallback, revisionCheckInterval)
    return () => { clearInterval(timer); window.removeEventListener('focus', returned); document.removeEventListener('visibilitychange', returned) }
  }, [checkRevision])
  useEffect(() => { void checkRevision() }, [location.pathname, location.search, checkRevision])
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
    return () => { lifeRef.current++; requests.current++; catalogRequest.current = null; catalogController.current?.abort(); catalogController.current = null; pages.clear(); facetCache.clear(); heights.clear(); temporaryPageSizes.clear() }
  }, [ensureCatalog, rowHeights, temporaryPageSizes])
  return <Context.Provider value={{ ...data, userId, hasCachedPage, navigation, navigationError, navigationLoading, revisionError, checkRevision, retryCounts, catalogLoaded, ensureCatalog, fetchFacets, rowHeights, temporaryPageSizes, series: data.series ?? [], loading, error, revision, tagRevision, refresh, refreshCollections, refreshSeries, refreshStory, loadDetails, retainDetails, fetchPage, markAllRead, markFinished, removeStory }}>
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
