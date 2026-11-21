import { countNoun } from '../../../lib/count-noun'
import { useActivity } from '../../../lib/use-activity'
import { useRef, useState } from 'react'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { Dialog } from '../../../components/Dialog'
import { useLibrary } from '../LibraryProvider'
import { NewCollectionButton, SearchableChoices } from './CollectionChoices'
import { addStoriesToCollections, removeStoriesFromCollection } from '../repository'
import type { Collection, Story } from '../model'

export function CollectionMembershipDialog({ story, collection, workIds, onClose, onSaved }: (
  { story: Story; collection?: never; workIds?: never } |
  { collection: Collection; story?: never; workIds?: never } |
  { workIds: string[]; story?: never; collection?: never }
) & { onClose: () => void; onSaved?: () => void }) {
  const { stories, collections, catalogLoaded, error: catalogError, ensureCatalog, refresh } = useLibrary({ catalog: Boolean(collection) })
  const existing = story ? story.collectionIds : collection ? stories.filter(item => item.collectionIds.includes(collection.id)).map(item => item.id) : []
  const [selected, setSelected] = useState(existing), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  useActivity(Boolean(busy), 'Saving collection memberships…')
  const form = useRef<HTMLFieldSetElement>(null)
  const additions = selected.filter(id => !existing.includes(id))
  async function save() {
    setBusy(true); setError('')
    try {
      const entries = collection ? additions : workIds ?? [story!.id]
      if (!saved) {
        await addStoriesToCollections(entries, collection ? [collection.id] : additions)
        setSaved(true)
      }
      await refresh(workIds ? undefined : entries)
      onSaved?.()
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add stories to collections.') }
    finally { setBusy(false) }
  }
  const options = collection ? stories.map(item => ({ id: item.id, name: item.metadata.title, description: item.metadata.authors.join(', ') })) : collections.filter(item => !item.default_key && !item.automatic_rules)
  return <Dialog title={collection ? `Add Stories to ${collection.name}` : 'Add to Collection'} onClose={onClose} busy={busy} className={`collection-membership-dialog${collection ? ' story-choices-dialog' : ''}`}>
    <p>{collection ? 'Choose stories from your library.' : story ? `Choose collections for “${story.metadata.title}”.` : `Choose collections for ${workIds.length} selected ${countNoun(workIds.length, 'work', 'works')}.`}</p>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset ref={form} disabled={busy || saved || Boolean(collection) && catalogLoaded === false} className="collection-membership-fields">
        <SearchableChoices options={options} selected={selected} disabledIds={existing} onChange={setSelected} label={collection ? 'Search Stories' : 'Search Collections'} />
        {!collection && <NewCollectionButton onCreated={id => { setSelected(current => [...current, id]); form.current?.querySelector('input')?.focus() }} />}
      </fieldset>
      {collection && catalogLoaded === false && catalogError && <p role="alert" className="error-message">{catalogError} <button type="button" className="text-button" onClick={() => void ensureCatalog().catch(() => {})}>Retry Loading</button></p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy || Boolean(collection) && catalogLoaded === false || (!saved && !additions.length)}>{busy ? 'Saving…' : saved ? 'Try Again' : collection ? 'Add Story' : 'Add to Collections'}</button><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
    </form>
  </Dialog>
}

export function RemoveSelectedWorksDialog({ ids, label, collection, onClose, onSaved }: {
  ids: string[]; label: string; collection: Collection; onClose: () => void; onSaved: () => void
}) {
  const { refresh } = useLibrary()
  const saved = useRef(false)
  return <ConfirmationDialog title="Remove from Collection?" confirmLabel="Remove from Collection" onClose={onClose} onConfirm={async () => {
    if (!saved.current) {
      await removeStoriesFromCollection(ids, collection.id)
      saved.current = true
    }
    await refresh()
    onSaved()
  }}><p>Remove {label} from “{collection.name}”? The works will stay in your library.</p></ConfirmationDialog>
}
