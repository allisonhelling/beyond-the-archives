import { readerWorkIdentities } from '../../src/lib/reader-work-identities'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LibraryProvider, useLibrary } from '../../src/features/library/LibraryProvider'
import { CollectionBrowser } from '../../src/features/library/collections/CollectionBrowser'
import { EditCollectionsButton } from '../../src/features/library/collections/EditCollectionsButton'
import { saveStoryCollections } from '../../src/features/library/repository'
import type { Story } from '../../src/features/library/model'
import { collectionStories } from '../../src/features/library/collections/collection-scope'
import { offlineStories, type OfflineSnapshot } from '../../src/features/offline/storage'
import { readerCloud } from './cloud'
import { loadSetting, setting, readerOwner } from './storage'
import type { CatalogBook } from './model'

const ConnectedCollections = createContext(false)

export function ReaderCollections({ books, account, onScope, onSync, children }: { books: CatalogBook[]; account?: string; onScope: (ids: string[] | null) => void; onSync: () => void; children: ReactNode }) {
  useEffect(() => { if (!account) onScope(null) }, [account, onScope])
  if (!account) return children
  return <MemoryRouter><LibraryProvider key={account} userId={account}><ConnectedCollections value={true}><ConnectedCollectionBrowser books={books} onScope={onScope} onSync={onSync}>{children}</ConnectedCollectionBrowser></ConnectedCollections></LibraryProvider></MemoryRouter>
}

function ConnectedCollectionBrowser({ books, onScope, onSync, children }: Omit<Parameters<typeof ReaderCollections>[0], 'account'>) {
  const [counts, setCounts] = useState<Story[] | null>(null)
  return <CollectionBrowser title="Collections" countStories={counts}>{({ selected, renderHeader }) => <>
    {renderHeader(null)}<CollectionScope books={books} selected={selected} onScope={onScope} onSync={onSync} onCounts={setCounts} />{children}
  </>}</CollectionBrowser>
}

function CollectionScope({ books, selected, onScope, onSync, onCounts }: { onCounts: (stories: Story[]) => void; books: CatalogBook[]; selected: string; onScope: (ids: string[] | null) => void; onSync: () => void }) {
  const sync = useRef(onSync)
  sync.current = onSync
  const { stories, revision, catalogLoaded, error, refresh } = useLibrary({ catalog: true })
  const scope = useMemo(() => {
    if (selected === 'all') return null
    const matches = collectionStories(stories, selected)
    const ids = new Set(matches.map(story => String(story.work.ao3_work_id)))
    return books.filter(book => readerWorkIdentities(book).some(id => ids.has(id))).map(book => book.id)
  }, [books, selected, stories])
  useEffect(() => onScope(scope), [scope, onScope])
  // Shared collections are read directly from the organizer; pull their names
  // back into the offline catalog after a revision or membership edit.
  useEffect(() => { if (catalogLoaded) sync.current() }, [revision, catalogLoaded])
  const [countError, setCountError] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function refreshCounts() {
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
    }
    void refreshCounts()
    const update = () => { if (!document.hidden) void refreshCounts() }
    window.addEventListener('online', update); window.addEventListener('focus', update)
    return () => { active = false; controller.abort(); window.removeEventListener('online', update); window.removeEventListener('focus', update) }
  }, [books, revision, onCounts])
  return error ? <p role="status">Collections are unavailable. <button onClick={() => void refresh().catch(() => {})}>Retry Collections</button></p> : countError ? <p role="status">{countError}</p> : null
}

export function ReaderCollectionMembership({ book }: { book: CatalogBook }) {
  const connected = useContext(ConnectedCollections)
  return connected ? <Membership book={book} /> : null
}
function Membership({ book }: { book: CatalogBook }) {
  const { stories, refreshStory } = useLibrary()
  const story = stories.find(story => story.id === book.organizerEntryId)
  if (!story) return null
  return <EditCollectionsButton selectedIds={story.collectionIds} automaticIds={story.automaticCollectionIds} onRefresh={() => refreshStory(story.id)} description={`Choose collections for “${story.metadata.title}”.`} onSave={(ids, base) => saveStoryCollections(story, ids, base).then(() => {})} />
}
