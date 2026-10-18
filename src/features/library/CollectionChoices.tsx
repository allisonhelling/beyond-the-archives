import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NewCollectionDialog } from './NewCollectionDialog'
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

export function NewCollectionButton({ label = 'New collection', disabled = false, className = 'button secondary', iconOnly = false, onCreated }: { label?: ReactNode; disabled?: boolean; className?: string; iconOnly?: boolean; onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])
  function close() { setOpen(false) }
  return <><button ref={trigger} type="button" className={iconOnly ? 'icon-button inline-edit-icon' : className} aria-label={iconOnly ? 'New collection' : undefined} title={iconOnly ? 'New collection' : undefined} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>{iconOnly ? <Plus size={16} aria-hidden="true" /> : label}</button>{open && <NewCollectionDialog onClose={close} onCreated={onCreated} />}</>
}
