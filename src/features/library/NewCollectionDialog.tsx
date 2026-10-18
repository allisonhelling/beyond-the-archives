import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import type { Collection } from './model'
import { Dialog } from '../../components/Dialog'
import { CollectionColorPicker } from './CollectionColorPicker'
import { CollectionSpineLabel } from './CollectionSpineLabel'
import { collectionColorPattern, collectionColors, collectionSymbols, getCollectionColors, type CollectionAppearance } from './collection-appearance'
import { useLibrary } from './LibraryProvider'
import { deleteCollection, deleteCollections, saveCollection, updateCollections } from './repository'

const deleteLabel = <><Trash2 size={16} aria-hidden="true" />Delete</>

export function NewCollectionDialog({ onClose, onCreated, collection, selectedCollections, onDeleted }: { onClose: () => void; onCreated?: (id: string) => void; collection?: Collection; selectedCollections?: Collection[]; onDeleted?: () => void }) {
  const { refresh, collections, stories } = useLibrary()
  const bulk = selectedCollections !== undefined
  const targets = selectedCollections ?? (collection ? [collection] : [])
  const targetIds = targets.map(item => item.id)
  const hasStories = stories.some(story => story.collectionIds.some(id => targetIds.includes(id)))
  const [summary, setSummary] = useState(collection?.description ?? '')
  const [applyColor, setApplyColor] = useState(!bulk), [applySymbol, setApplySymbol] = useState(!bulk)
  const colors = getCollectionColors(collections)
  const [name, setName] = useState(collection?.name ?? ''), [color, setColor] = useState<string>(targets[0]?.color ?? collectionColors[0].value)
  const [symbol, setSymbol] = useState<string>(targets[0]?.symbol ?? collectionSymbols[0].value)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const deleted = useRef(false)
  const [removed, setRemoved] = useState(false)
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
      let id = createdId
      if (!id) {
        if (bulk) {
          const changes: Partial<CollectionAppearance> = { ...(applyColor && { color }), ...(applySymbol && { symbol }) }
          await updateCollections(targetIds, changes)
          id = targets[0].id
        } else id = await saveCollection(name, collection?.id, { color, symbol }, summary)
        setCreatedId(id)
      }
      await refresh(); if (!bulk) onCreated?.(id); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save collection.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!deleted.current) {
      if (bulk) await deleteCollections(targetIds)
      else await deleteCollection(collection!.id)
      deleted.current = true
      setRemoved(true)
    }
    await refresh()
  }
  function closeEditor() { if (deleted.current) onDeleted?.(); onClose() }
  async function requestDelete() {
    if (hasStories && !deleted.current) { setConfirmDelete(true); return }
    setBusy(true); setError('')
    try { await remove(); closeEditor() }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not delete collection.') }
    finally { setBusy(false) }
  }
  return <><Dialog title={bulk ? `Edit ${targets.length} collections` : collection ? 'Edit collection' : 'New collection'} className="collection-dialog" busy={busy} onClose={closeEditor} initialFocusRef={nameRef}>
    <form onSubmit={event => void create(event)}>
      <div className="collection-dialog-content">
        <fieldset className="collection-dialog-fields" disabled={busy || createdId !== null || removed}>
          {bulk ? <p>Choose which fields to change for the selected collections. Names stay unchanged.</p> : <label className="collection-name-field">Name<input ref={nameRef} name="name" required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Comfort reads" /></label>}
          {!bulk && <label className="collection-name-field">Summary<textarea name="summary" rows={3} value={summary} onChange={event => setSummary(event.target.value)} placeholder="What brings these stories together?" /></label>}
          {bulk && <label className="check-label"><input type="checkbox" checked={applyColor} onChange={event => setApplyColor(event.target.checked)} />Change color</label>}

          <fieldset className="collection-appearance-options" disabled={!applyColor}><legend>Color</legend><div className="collection-color-options">{colors.map(option => <label className="collection-color-option" key={option.value} title={option.label} style={{ '--cover-color': option.value } as CSSProperties}><input type="radio" name="collection-color" value={option.value} checked={color.toLowerCase() === option.value} onChange={() => setColor(option.value)} /><span className="sr-only">{option.label}</span></label>)}</div><CollectionColorPicker value={color} onChange={setColor} disabled={busy || createdId !== null || removed || !applyColor} /></fieldset>
          {bulk && <label className="check-label"><input type="checkbox" checked={applySymbol} onChange={event => setApplySymbol(event.target.checked)} />Change symbol</label>}
          <fieldset className="collection-appearance-options" disabled={!applySymbol}><legend>Symbol</legend><div className="collection-symbol-options">{collectionSymbols.map(({ value, label, Icon }) => <label className="collection-symbol-option" key={value} title={label}><input type="radio" name="collection-symbol" value={value} checked={symbol === value} onChange={() => setSymbol(value)} /><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">{label}</span></label>)}</div></fieldset>
        </fieldset>
        <div className="collection-preview" aria-label="Collection preview"><div className="collection-spine" style={{ '--cover-color': new RegExp(collectionColorPattern).test(color) ? color : collectionColors[0].value } as CSSProperties}><CollectionSpineLabel name={bulk ? `${targets.length} collections` : name.trim() || 'Your collection'} Icon={selectedSymbol.Icon} /></div></div>
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="form-actions">{targets.length > 0 && <button ref={deleteRef} className="button secondary" type="button" disabled={busy || createdId !== null} onClick={() => void requestDelete()}>{deleteLabel}</button>}<button className="button secondary" type="button" disabled={busy} onClick={closeEditor}>Cancel</button><button className="button primary" type="submit" disabled={busy || removed || (bulk && !applyColor && !applySymbol)}>{busy ? (targets.length ? 'Saving…' : 'Creating…') : createdId ? 'Try again' : targets.length ? 'Save changes' : 'Create collection'}</button></div>
    </form>
  </Dialog>{targets.length > 0 && confirmDelete && <ConfirmationDialog title={bulk ? 'Delete collections?' : 'Delete collection?'} confirmLabel={deleteLabel} onClose={() => { setConfirmDelete(false); if (deleted.current) closeEditor() }} onConfirm={remove}><p>{bulk ? `Delete ${targets.length} collections?` : `Delete “${collection!.name}”?`}</p><p>Stories will stay in your library.</p></ConfirmationDialog>}</>
}
