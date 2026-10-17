import { useState } from 'react'
import { useLibrary } from './LibraryProvider'
import { saveCollection } from './repository'
import type { Collection } from './model'
import { Plus } from 'lucide-react'

export function CollectionChoices({ collections, selected, onChange }: {
  collections: Collection[]; selected: string[]; onChange: (selected: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const choices = collections.filter(collection => !collection.default_key && collection.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="collection-selector"><input type="search" aria-label="Search collections" placeholder="Search collections" value={query} onChange={event => setQuery(event.target.value)} /><div className="collection-options">{choices.map(collection => <label className="check-label" key={collection.id}>
    <input type="checkbox" checked={selected.includes(collection.id)} onChange={event => onChange(event.target.checked ? [...selected, collection.id] : selected.filter(id => id !== collection.id))} />
    <span>{collection.name}</span>
  </label>)}{!choices.length && <p className="muted">No matching collections.</p>}</div></div>
}

export function NewCollectionButton({ label = 'New collection', disabled = false, className = 'button secondary', iconOnly = false, onCreated }: { label?: string; disabled?: boolean; className?: string; iconOnly?: boolean; onCreated?: (id: string) => void }) {
  const { refresh } = useLibrary()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create() {
    const name = window.prompt('New collection name')
    if (name === null) return
    setBusy(true); setError('')
    try { const id = await saveCollection(name); await refresh(); onCreated?.(id) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not create collection.') }
    finally { setBusy(false) }
  }
  return <><button type="button" className={iconOnly ? 'icon-button inline-edit-icon' : className} aria-label={iconOnly ? 'New collection' : undefined} title={iconOnly ? 'New collection' : undefined} disabled={disabled || busy} onClick={() => void create()}>{iconOnly ? <Plus size={16} aria-hidden="true" /> : busy ? 'Creating…' : label}</button>{error && <p role="alert" className="error-message">{error}</p>}</>
}
