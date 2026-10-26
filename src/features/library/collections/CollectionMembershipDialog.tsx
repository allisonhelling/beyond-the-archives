import { useRef, useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import { useLibrary } from '../LibraryProvider'
import { NewCollectionButton, SearchableChoices } from './CollectionChoices'
import { addStoriesToCollections } from '../repository'
import type { Collection, Story } from '../model'

export function CollectionMembershipDialog({ story, collection, onClose }: ({ story: Story; collection?: never } | { collection: Collection; story?: never }) & { onClose: () => void }) {
  const { stories, collections, catalogLoaded, error: catalogError, ensureCatalog, refresh } = useLibrary({ catalog: Boolean(collection) })
  const existing = story ? story.collectionIds : stories.filter(item => item.collectionIds.includes(collection!.id)).map(item => item.id)
  const [selected, setSelected] = useState(existing), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const form = useRef<HTMLFieldSetElement>(null)
  const additions = selected.filter(id => !existing.includes(id))
  async function save() {
    setBusy(true); setError('')
    try {
      if (!saved) {
        await addStoriesToCollections(story ? [story.id] : additions, story ? additions : [collection!.id])
        setSaved(true)
      }
      await refresh(story ? [story.id] : additions); onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add stories to collections.') }
    finally { setBusy(false) }
  }
  const options = story ? collections.filter(item => !item.default_key && !item.automatic_rules) : stories.map(item => ({ id: item.id, name: item.metadata.title, description: item.metadata.authors.join(', ') }))
  return <Dialog title={story ? 'Add to Collection' : `Add Stories to ${collection!.name}`} onClose={onClose} busy={busy} className={`collection-membership-dialog${collection ? ' story-choices-dialog' : ''}`}>
    <p>{story ? `Choose collections for “${story.metadata.title}”.` : 'Choose stories from your library.'}</p>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset ref={form} disabled={busy || saved || Boolean(collection) && catalogLoaded === false} className="collection-membership-fields">
        <SearchableChoices options={options} selected={selected} disabledIds={existing} onChange={setSelected} label={story ? 'Search Collections' : 'Search Stories'} />
        {story && <NewCollectionButton onCreated={id => { setSelected(current => [...current, id]); form.current?.querySelector('input')?.focus() }} />}
      </fieldset>
      {collection && catalogLoaded === false && catalogError && <p role="alert" className="error-message">{catalogError} <button type="button" className="text-button" onClick={() => void ensureCatalog().catch(() => {})}>Retry Loading</button></p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="form-actions"><button className={`button primary${collection ? ' button-small' : ''}`} disabled={busy || Boolean(collection) && catalogLoaded === false || (!saved && !additions.length)}>{busy ? 'Saving…' : saved ? 'Try Again' : story ? 'Add to Collections' : 'Add Story'}</button><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
    </form>
  </Dialog>
}
