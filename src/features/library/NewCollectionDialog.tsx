import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import type { Collection } from './model'
import { Dialog } from '../../components/Dialog'
import { CollectionColorPicker } from './CollectionColorPicker'
import { CollectionSpineLabel } from './CollectionSpineLabel'
import { collectionColorPattern, collectionColors, collectionSymbols, getCollectionColors } from './collection-appearance'
import { useLibrary } from './LibraryProvider'
import { deleteCollection, saveCollection } from './repository'

const deleteLabel = <><Trash2 size={16} aria-hidden="true" />Delete</>

export function NewCollectionDialog({ onClose, onCreated, collection, onDeleted }: { onClose: () => void; onCreated?: (id: string) => void; collection?: Collection; onDeleted?: () => void }) {
  const { refresh, collections } = useLibrary()
  const colors = getCollectionColors(collections)
  const [name, setName] = useState(collection?.name ?? ''), [color, setColor] = useState<string>(collection?.color ?? collectionColors[0].value)
  const [symbol, setSymbol] = useState<string>(collection?.symbol ?? collectionSymbols[0].value)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const deleted = useRef(false)
  const wasConfirmingDelete = useRef(false)
  useEffect(() => {
    if (wasConfirmingDelete.current && !confirmDelete) deleteRef.current?.focus()
    wasConfirmingDelete.current = confirmDelete
  }, [confirmDelete])
  const nameRef = useRef<HTMLInputElement>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const selectedSymbol = collectionSymbols.find(option => option.value === symbol)!
  async function create(event: FormEvent) {
    event.preventDefault(); event.stopPropagation(); setBusy(true); setError('')
    try {
      // A reload failure can be retried without creating the same collection twice.
      const id = createdId ?? await saveCollection(name, collection?.id, { color, symbol })
      setCreatedId(id)
      await refresh(); onCreated?.(id); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save collection.') }
    finally { setBusy(false) }
  }
  return <><Dialog title={collection ? 'Edit collection' : 'New collection'} className="collection-dialog" busy={busy} onClose={onClose} initialFocusRef={nameRef}>
    <form onSubmit={event => void create(event)}>
      <div className="collection-dialog-content">
        <fieldset className="collection-dialog-fields" disabled={busy || createdId !== null}>
          <label className="collection-name-field">Name<input ref={nameRef} name="name" required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Comfort reads" /></label>
          <fieldset className="collection-appearance-options"><legend>Color</legend><div className="collection-color-options">{colors.map(option => <label className="collection-color-option" key={option.value} title={option.label} style={{ '--cover-color': option.value } as CSSProperties}><input type="radio" name="collection-color" value={option.value} checked={color.toLowerCase() === option.value} onChange={() => setColor(option.value)} /><span className="sr-only">{option.label}</span></label>)}</div><CollectionColorPicker value={color} onChange={setColor} disabled={busy || createdId !== null} /></fieldset>
          <fieldset className="collection-appearance-options"><legend>Symbol</legend><div className="collection-symbol-options">{collectionSymbols.map(({ value, label, Icon }) => <label className="collection-symbol-option" key={value} title={label}><input type="radio" name="collection-symbol" value={value} checked={symbol === value} onChange={() => setSymbol(value)} /><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">{label}</span></label>)}</div></fieldset>
        </fieldset>
        <div className="collection-preview" aria-label="Collection preview"><div className="collection-spine" style={{ '--cover-color': new RegExp(collectionColorPattern).test(color) ? color : collectionColors[0].value } as CSSProperties}><CollectionSpineLabel name={name.trim() || 'Your collection'} Icon={selectedSymbol.Icon} /></div></div>
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="form-actions">{collection && <button ref={deleteRef} className="button secondary" type="button" disabled={busy || createdId !== null} onClick={() => setConfirmDelete(true)}>{deleteLabel}</button>}<button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy ? (collection ? 'Saving…' : 'Creating…') : createdId ? 'Try again' : collection ? 'Save changes' : 'Create collection'}</button></div>
    </form>
  </Dialog>{collection && confirmDelete && <ConfirmationDialog title="Delete collection?" confirmLabel={deleteLabel} onClose={() => { setConfirmDelete(false); if (deleted.current) { onDeleted?.(); onClose() } }} onConfirm={async () => {
    if (!deleted.current) { await deleteCollection(collection.id); deleted.current = true }
    await refresh()
  }}><p>Delete “{collection.name}”?</p><p>Stories will stay in your library.</p></ConfirmationDialog>}</>
}
