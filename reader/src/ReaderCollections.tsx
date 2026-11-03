import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LibraryProvider, useLibrary } from '../../src/features/library/LibraryProvider'
import { CollectionBrowser } from '../../src/features/library/collections/CollectionBrowser'
import { EditCollectionsButton } from '../../src/features/library/collections/EditCollectionsButton'
import { saveStoryCollections } from '../../src/features/library/repository'
import { active } from '../../src/features/library/model'
import type { CatalogBook } from './model'

const ConnectedCollections = createContext(false)

export function ReaderCollections({ books, account, onScope, onSync, children }: { books: CatalogBook[]; account?: string; onScope: (ids: string[] | null) => void; onSync: () => void; children: ReactNode }) {
  useEffect(() => { if (!account) onScope(null) }, [account, onScope])
  if (!account) return children
  return <MemoryRouter><LibraryProvider key={account} userId={account}><ConnectedCollections value={true}><CollectionBrowser title="Collections">{({ selected, renderHeader, resultsActions }) => <>
    {renderHeader(null)}<CollectionScope books={books} selected={selected} onScope={onScope} onSync={onSync} />{resultsActions}{children}
  </>}</CollectionBrowser></ConnectedCollections></LibraryProvider></MemoryRouter>
}

function CollectionScope({ books, selected, onScope, onSync }: { books: CatalogBook[]; selected: string; onScope: (ids: string[] | null) => void; onSync: () => void }) {
  const sync = useRef(onSync)
  sync.current = onSync
  const { stories, revision, catalogLoaded, error, refresh } = useLibrary({ catalog: true })
  const scope = useMemo(() => {
    if (selected === 'all') return null
    const matches = stories.filter(story => {
      if (selected === 'currently_reading') return active(story)
      if (selected === 'favorites') return story.is_favorite
      if (selected === 'recs') return story.is_rec
      if (selected === 'series') return Boolean(story.metadata.series?.length || story.metadata.series_memberships?.length)
      if (selected === 'finished') return ['finished', 're_reading'].includes(story.reading_status)
      return story.reading_status === selected || [...story.collectionIds, ...(story.automaticCollectionIds ?? [])].includes(selected)
    })
    const ids = new Set(matches.map(story => story.id))
    return books.filter(book => book.organizerEntryId && ids.has(book.organizerEntryId)).map(book => book.id)
  }, [books, selected, stories])
  useEffect(() => onScope(scope), [scope, onScope])
  // Shared collections are read directly from the organizer; pull their names
  // back into the offline catalog after a revision or membership edit.
  useEffect(() => { if (catalogLoaded) sync.current() }, [revision, catalogLoaded])
  return error ? <p role="status">Collections are unavailable. <button onClick={() => void refresh().catch(() => {})}>Retry Collections</button></p> : null
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
