import type { SeriesRecord } from './series'
import { editSnapshot } from './edit-merge'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { UndoNotice } from '../../components/UndoNotice'
import { abandonedReadingStatus, type Collection, type Story } from './model'
import { deleteStory, loadCatalog, loadStories, loadSeriesRecord, loadAffectedCollections, loadCollections, queryLibrary, storyCatalogEntry, restoreStory, updateEntry, type LibraryQuery, type LibraryResults } from './repository'
type ReadingUndo = { id: string; storyId: string; title: string; message: string; saved?: { status: Story['reading_status']; progress: number }; previous?: { last_read_chapter: number; reading_status: Story['reading_status'] }; removed?: Story }
type LibraryState = { temporaryPageSizes: Map<LibraryQuery['mode'], number>; rowHeights: Map<string, number>; series: SeriesRecord[]; stories: Story[]; collections: Collection[]; loading: boolean; error: string; revision: number; refresh: (ids?: string[]) => Promise<void>; refreshCollections: () => Promise<void>; loadDetails: (ids: string[]) => Promise<void>; retainDetails: (ids: string[]) => () => void; refreshSeries: (id: number, invalidate?: boolean) => Promise<void>; refreshStory: (id: string) => Promise<void>; fetchPage: (query: LibraryQuery, page: number, size: number, signal: AbortSignal) => Promise<LibraryResults>; markAllRead: (story: Story) => Promise<void>; markFinished: (story: Story) => Promise<void>; removeStory: (story: Story) => Promise<void> }
const Context = createContext<LibraryState | null>(null)
export function LibraryProvider({ children, userId = 'sample' }: { children: ReactNode; userId?: string }) {
  const [data, setData] = useState<{ stories: Story[]; collections: Collection[]; series?: SeriesRecord[] }>({ stories: [], collections: [], series: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const lifecycle = useRef(0)
  const [temporaryPageSizes] = useState(() => new Map<LibraryQuery['mode'], number>())
  const [rowHeights] = useState(() => new Map<string, number>())
  const cache = useRef(new Map<string, LibraryResults>())
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
  const refresh = useCallback(async (ids?: string[]) => {
    const unique = ids ? [...new Set(ids)].sort() : undefined
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      if (life !== lifecycle.current) return
      const version = ++generation.current
      cache.current.clear()
      try {
        if (unique) {
          const next = await loadStories(unique)
          const collections = await loadAffectedCollections([...new Set(next.flatMap(story => story.collectionIds))])
          if (version !== generation.current) return
          const wanted = new Set(unique), index = new Map(next.map(story => [story.id, story])), collectionIndex = new Map(collections.map(collection => [collection.id, collection]))
          setData(previous => {
            const stories = [...previous.stories.filter(story => !wanted.has(story.id)), ...index.values()]
            return { ...previous, collections: previous.collections.map(collection => collectionIndex.get(collection.id) ?? collection), stories: boundDetails(stories) }
          })
        } else {
          const next = await loadCatalog()
          if (version !== generation.current) return
          setData({ ...next, stories: boundDetails(next.stories) })
        }
        setError(''); setRevision(value => value + 1)
      } catch (e) {
        if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not load your library.')
        throw e
      } finally { if (version === generation.current) setLoading(false) }
    })
    queue.current = task
    await task
  }, [boundDetails])
  const refreshCollections = useCallback(async () => {
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      if (life !== lifecycle.current) return
      const version = ++generation.current
      cache.current.clear()
      const collections = await loadCollections()
      const catalog = await loadCatalog()
      const memberships = new Map(catalog.stories.map(story => [story.id, story]))
      if (version !== generation.current) return
      const ids = new Set(collections.map(collection => collection.id))
      const prune = <T extends { collectionIds?: string[] }>(item: T): T => item.collectionIds?.some(id => !ids.has(id)) ? { ...item, collectionIds: item.collectionIds.filter(id => ids.has(id)) } : item
      setData(previous => ({ ...previous, collections, stories: previous.stories.map(story => ({ ...prune(story), collectionIds: memberships.get(story.id)?.collectionIds ?? story.collectionIds.filter(id => ids.has(id)), automaticCollectionIds: memberships.get(story.id)?.automaticCollectionIds ?? [] })), series: previous.series?.map(prune) }))
      setRevision(value => value + 1)
    })
    queue.current = task
    await task
  }, [])
  const refreshSeries = useCallback(async (id: number, invalidate = true) => {
    const life = lifecycle.current
    const task = queue.current.catch(() => {}).then(async () => {
      const version = invalidate ? ++generation.current : generation.current
      if (invalidate) cache.current.clear()
      if (life !== lifecycle.current) return
      const record = await loadSeriesRecord(id)
      if (version !== generation.current) return
      setData(previous => ({ ...previous, series: [...(previous.series ?? []).filter(item => item.ao3_series_id !== id), ...(record ? [record] : [])] }))
      if (invalidate) setRevision(value => value + 1)
    })
    queue.current = task
    await task
  }, [])
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
    if (cached) { cache.current.delete(key); cache.current.set(key, cached); return cached }
    const version = generation.current
    const result = await queryLibrary(query, page, size, signal)
    if (!signal.aborted && version === generation.current) {
      cache.current.set(key, result)
      while (cache.current.size > 6) cache.current.delete(cache.current.keys().next().value!)
    }
    if (version !== generation.current) throw new DOMException('Obsolete library result', 'AbortError')
    return result
  }, [userId])
  const [undoNotices, setUndoNotices] = useState<ReadingUndo[]>([])
  const dismissUndo = useCallback((id: string) => setUndoNotices(notices => notices.filter(notice => notice.id !== id)), [])
  async function updateReadingWithUndo(story: Story, status: Story['reading_status'], chapters: number, message: string) {
    await updateEntry(story.id, { last_read_chapter: chapters, reading_status: status }, editSnapshot(story))
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), {
      id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message,
      saved: { status, progress: chapters },
      previous: notices.find(notice => notice.storyId === story.id)?.previous ?? { last_read_chapter: story.last_read_chapter, reading_status: story.reading_status },
    }])
    await refreshStory(story.id)
  }
  async function markAllRead(story: Story) {
    if (story.metadata.published_chapters === null) return
    const status = abandonedReadingStatus(story.metadata.publication_status === 'complete' ? 'finished' : story.metadata.publication_status === 'in_progress' ? 'waiting_for_updates' : story.reading_status, story.metadata.published_chapters, story.metadata)
    await updateReadingWithUndo(story, status, story.metadata.published_chapters, `Marked all chapters of “${story.metadata.title}” as read${status === 'finished' ? ' and fic as finished.' : status === 'waiting_for_updates' ? '. Waiting for updates.' : '.'}`)
  }
  async function removeStory(story: Story) {
    const snapshot = (await loadStories([story.id]))[0] ?? story
    await deleteStory(story.id)
    setUndoNotices(notices => [...notices.filter(notice => notice.storyId !== story.id), { id: crypto.randomUUID(), storyId: story.id, title: story.metadata.title, message: `Removed “${story.metadata.title}” from your library.`, removed: snapshot }])
    await refreshStory(story.id)
  }
  async function markFinished(story: Story) {
    const chapters = story.metadata.published_chapters ?? story.metadata.total_chapters
    await updateReadingWithUndo(story, 'finished', chapters ?? story.last_read_chapter, `Marked “${story.metadata.title}” as finished.${chapters === null ? '' : ' All chapters marked as read.'}`)
  }
  useEffect(() => {
    void refresh().catch(() => {})
    const pages = cache.current, heights = rowHeights, life = lifecycle, requests = generation
    return () => { life.current++; requests.current++; pages.clear(); heights.clear(); temporaryPageSizes.clear() }
  }, [refresh, rowHeights, temporaryPageSizes])
  return <Context.Provider value={{ ...data, rowHeights, temporaryPageSizes, series: data.series ?? [], loading, error, revision, refresh, refreshCollections, refreshSeries, refreshStory, loadDetails, retainDetails, fetchPage, markAllRead, markFinished, removeStory }}>
    {undoNotices.length > 0 && <section className="reading-undo-notices" aria-label="Reading updates">{undoNotices.map(notice => <UndoNotice key={notice.id} id={notice.id} message={notice.message} dismissLabel={`Dismiss undo notification for ${notice.title}`} onDismiss={dismissUndo} onUndo={async () => { if (notice.removed) await restoreStory(notice.removed); else if (notice.previous) await updateEntry(notice.storyId, notice.previous, notice.saved ?? {}); await refreshStory(notice.storyId) }} />)}</section>}
    {children}
  </Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary() { const value = useContext(Context); if (!value) throw new Error('Library provider missing'); return value }
