import { useState } from 'react'
import { useLibrary } from './LibraryProvider'
import { saveCollection } from './repository'
import type { Collection } from './model'

export function CollectionChoices({ collections, selected, onChange }: {
  collections: Collection[]; selected: string[]; onChange: (selected: string[]) => void
}) {
  return collections.filter(collection => !collection.default_key).map(collection => <label className="check-label" key={collection.id}>
    <input type="checkbox" checked={selected.includes(collection.id)} onChange={event => onChange(event.target.checked ? [...selected, collection.id] : selected.filter(id => id !== collection.id))} />
    <span>{collection.name}</span>
  </label>)
}

export function NewCollectionButton({ label = 'New collection', disabled = false, className = 'button secondary' }: { label?: string; disabled?: boolean; className?: string }) {
  const { refresh } = useLibrary()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create() {
    const name = window.prompt('New collection name')
    if (name === null) return
    setBusy(true); setError('')
    try { await saveCollection(name); await refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not create collection.') }
    finally { setBusy(false) }
  }
  return <><button type="button" className={className} disabled={disabled || busy} onClick={() => void create()}>{busy ? 'Creating…' : label}</button>{error && <p role="alert" className="error-message">{error}</p>}</>
}
