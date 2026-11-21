import { useLayout } from '../../src/lib/use-layout'
import { readerWorkIdentities } from '../../src/lib/reader-work-identities'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LibraryProvider, useLibrary } from '../../src/features/library/LibraryProvider'
import { useCollectionWorkSelection, type TileSelection } from '../../src/features/library/collections/useCollectionWorkSelection'
import { CollectionBrowser } from '../../src/features/library/collections/CollectionBrowser'
import { EditCollectionsButton } from '../../src/features/library/collections/EditCollectionsButton'
import { LoadingIcon } from '../../src/components/ActivityIndicator'
import { saveStoryCollections } from '../../src/features/library/repository'
import type { Story } from '../../src/features/library/model'
import { collectionStories } from '../../src/features/library/collections/collection-scope'
import { offlineStories, type OfflineSnapshot } from '../../src/features/offline/storage'
import { readerCloud } from './cloud'
import { loadSetting, setting, readerOwner } from './storage'
import type { CatalogBook } from './model'

function indexCollectionStories(stories: Story[]) {
  const entries = new Map<string, Story>(), ao3 = new Map<string, Story>()
  for (const story of stories) {
    entries.set(story.id, story)
    const id = story.work.ao3_work_id?.toString()
    if (id && !ao3.has(id)) ao3.set(id, story)
  }
  return { entries, ao3 }
}
type StoryIndex = ReturnType<typeof indexCollectionStories>
type ReaderWorkSelection = { toolbar: ReactNode; tile: (book: CatalogBook) => TileSelection | undefined }

const ConnectedCollections = createContext<StoryIndex | null>(null)
function collectionStoryForBook(book: CatalogBook, index: StoryIndex) {
  return (book.organizerEntryId ? index.entries.get(book.organizerEntryId) : undefined) ?? (book.workId ? index.ao3.get(book.workId) : undefined)
}

export function ReaderCollections({ books, pageBooks, account, onScope, onSync, children }: { books: CatalogBook[]; pageBooks: CatalogBook[]; account?: string; onScope: (ids: string[] | null) => void; onSync: () => void; children: (selection?: ReaderWorkSelection) => ReactNode }) {
  useEffect(() => { if (!account) onScope(null) }, [account, onScope])
  if (!account) return children()
  return <MemoryRouter><LibraryProvider key={account} userId={account} catalogWorksOnly navigationEnabled={false}><ConnectedCollectionBrowser books={books} pageBooks={pageBooks} onScope={onScope} onSync={onSync}>{children}</ConnectedCollectionBrowser></LibraryProvider></MemoryRouter>
}

function ConnectedCollectionBrowser({ books, pageBooks, onScope, onSync, children }: Omit<Parameters<typeof ReaderCollections>[0], 'account'>) {
  const mobile = useLayout() === 'mobile'
  const [counts, setCounts] = useState<Story[] | null>(null)
  return <CollectionBrowser compactHeader={mobile} title="Collections" countStories={counts}>{({ selected, editingCollections, renderHeader }) => <>
    {renderHeader(null)}<CollectionScope books={books} selected={selected} onScope={onScope} onSync={onSync} onCounts={setCounts} />
    <ConnectedCollectionWorks books={books} pageBooks={pageBooks} selected={selected} editing={editingCollections}>{children}</ConnectedCollectionWorks>
  </>}</CollectionBrowser>
}

function ConnectedCollectionWorks({ books, pageBooks, selected, editing, children }: Pick<Parameters<typeof ReaderCollections>[0], 'books' | 'pageBooks' | 'children'> & { selected: string; editing: boolean }) {
  const { stories, collections, catalogLoaded } = useLibrary()
  const index = useMemo(() => indexCollectionStories(stories), [stories])
  const shelfIds = useMemo(() => editing ? new Set(collectionStories(stories, selected).map(story => story.id)) : null, [editing, selected, stories])
  function workTarget(book: CatalogBook) {
    const story = collectionStoryForBook(book, index)
    return story && shelfIds?.has(story.id) && !book.deleting ? story : undefined
  }
  const selection = useCollectionWorkSelection({
    scope: editing ? selected : undefined,
    pageWorks: pageBooks.flatMap(book => workTarget(book) ?? []),
    loadAll: async () => books.flatMap(book => workTarget(book) ?? []),
    blocked: !catalogLoaded,
    manualCollection: collections.find(collection => collection.id === selected && !collection.default_key && !collection.automatic_rules),
  })
  return <ConnectedCollections value={index}>{children(selection && { toolbar: selection.toolbar, tile: book => {
    const story = workTarget(book)
    return story ? selection.tile(story) : undefined
  } })}</ConnectedCollections>
}

function CollectionScope({ books, selected, onScope, onSync, onCounts }: { onCounts: (stories: Story[]) => void; books: CatalogBook[]; selected: string; onScope: (ids: string[] | null) => void; onSync: () => void }) {
  const sync = useRef(onSync)
  sync.current = onSync
  const { stories, revision, catalogLoaded, error, refresh, ensureCatalog } = useLibrary({ catalog: true })
  const [retrying,setRetrying]=useState(false)
  async function retryCollections() {
    if(retrying)return
    setRetrying(true)
    try { await refresh(); await ensureCatalog() } catch { /* The shared provider retains the actual request error. */ }
    finally { setRetrying(false) }
  }
  const scope = useMemo(() => {
    if (selected === 'all') return null
    const matches = collectionStories(stories, selected)
    const ids = new Set(matches.map(story => String(story.work.ao3_work_id)))
    return books.filter(book => readerWorkIdentities(book).some(id => ids.has(id))).map(book => book.id)
  }, [books, selected, stories])
  useEffect(() => onScope(scope), [scope, onScope])
  // Shared collections are read directly from the organizer; pull their names
  // back into the offline catalog after a revision or membership edit.
  const syncedRevision=useRef<number|undefined>(undefined)
  useEffect(() => {
    if(!catalogLoaded)return
    const previous=syncedRevision.current
    syncedRevision.current=revision
    if(previous!==undefined&&previous!==revision)sync.current()
  }, [revision, catalogLoaded])
  const [countError, setCountError] = useState('')
  useEffect(() => {
    let active = true, refreshing = false
    const controller = new AbortController()
    async function refreshCounts() {
      if(refreshing)return
      refreshing=true
      try {
        const saved = await loadSetting<OfflineSnapshot>('collection-snapshot')
        if (active && saved?.userId === readerOwner) onCounts(offlineStories({ ...saved, readers: [] }))
        if (!navigator.onLine || !active) return
        const { data, error } = await readerCloud.rpc('reader_offline_snapshot').abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]))
        if (error) throw error
        const snapshot = { ...(data as unknown as OfflineSnapshot), userId: readerOwner, savedAt: new Date().toISOString() }
        if (!Array.isArray(snapshot.cloudBooks) || !Array.isArray(snapshot.stories)) throw new Error('Invalid cloud report')
        if (active) {
          await setting('collection-snapshot', snapshot)
          if (active) { onCounts(offlineStories({ ...snapshot, readers: [] })); setCountError('') }
        }
      } catch { if (active) setCountError('Cloud EPUB counts could not be refreshed. Last saved counts are shown when available.') }
      finally { refreshing=false }
    }
    void refreshCounts()
    const update = () => { if (!document.hidden) void refreshCounts() }
    window.addEventListener('online', update); window.addEventListener('focus', update)
    return () => { active = false; controller.abort(); window.removeEventListener('online', update); window.removeEventListener('focus', update) }
  }, [books, revision, onCounts])
  return error || retrying ? <p role="status">{retrying ? <><LoadingIcon /> Reloading collections… </> : error} <button disabled={retrying} onClick={() => void retryCollections()}>{retrying?'Retrying Collections…':'Retry Collections'}</button></p> : countError ? <p role="status">{countError}</p> : null
}

export function ReaderCollectionMembership({ book }: { book: CatalogBook }) {
  const index = useContext(ConnectedCollections)
  const story = index ? collectionStoryForBook(book, index) : undefined
  return story ? <Membership story={story} /> : null
}
function Membership({ story }: { story: Story }) {
  const { refreshStory } = useLibrary()
  return <EditCollectionsButton label="Collections" selectedIds={story.collectionIds} automaticIds={story.automaticCollectionIds} onRefresh={() => refreshStory(story.id)} description={`Choose collections for “${story.metadata.title}”.`} onSave={(ids, base) => saveStoryCollections(story, ids, base).then(() => {})} />
}
