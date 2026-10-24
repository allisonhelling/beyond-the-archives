import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NewCollectionDialog } from './NewCollectionDialog'
import type { Collection } from '../model'
import { Plus } from 'lucide-react'

export function CollectionChoices({ collections, selected, onChange }: {
  collections: Collection[]; selected: string[]; onChange: (selected: string[]) => void
}) {
  return <SearchableChoices options={collections.filter(collection => !collection.default_key && !collection.automatic_rules)} selected={selected} onChange={onChange} label="Search Collections" />
}

export function SearchableChoices({ options, selected, onChange, label, disabledIds = [] }: {
  options: { id: string; name: string; description?: string | null }[]; selected: string[]; onChange: (selected: string[]) => void; label: string; disabledIds?: string[]
}) {
  const [query, setQuery] = useState('')
  const choices = options.filter(option => `${option.name} ${option.description ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="collection-selector"><input type="search" aria-label={label} placeholder={label} value={query} onChange={event => setQuery(event.target.value)} /><div className="collection-options">{choices.map(option => <label className="check-label" key={option.id}>
    <input type="checkbox" aria-label={option.name} checked={selected.includes(option.id)} disabled={disabledIds.includes(option.id)} onChange={event => onChange(event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />
    <span>{option.name}{option.description && <small className="muted choice-description">{option.description}</small>}{disabledIds.includes(option.id) && <small className="muted">Already added</small>}</span>
  </label>)}{!choices.length && <p className="muted">No matches found.</p>}</div></div>
}

export function NewCollectionButton({ label = 'New Collection', disabled = false, className = 'button secondary', iconOnly = false, onCreated }: { label?: ReactNode; disabled?: boolean; className?: string; iconOnly?: boolean; onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])
  function close() { setOpen(false) }
  return <><button ref={trigger} type="button" className={iconOnly ? 'icon-button inline-edit-icon' : className} aria-label={iconOnly ? 'New Collection' : undefined} title={iconOnly ? 'New Collection' : undefined} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>{iconOnly ? <Plus size={16} aria-hidden="true" /> : label}</button>{open && <NewCollectionDialog onClose={close} onCreated={onCreated} />}</>
}
