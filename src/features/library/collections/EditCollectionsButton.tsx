import { useActivity } from '../../../lib/use-activity'
import { useEffect, useRef, useState } from 'react'
import { FolderPlus, Pencil, Square } from 'lucide-react'
import { Dialog } from '../../../components/Dialog'
import { CollectionChoices, NewCollectionButton } from './CollectionChoices'
import { EditConflictReview } from '../EditConflictReview'
import { EditConflict } from '../edit-merge'
import { useLibrary } from '../LibraryProvider'

/** Works and series share the same collection editor and conflict handling. */
export function EditCollectionsButton({ selectedIds, onSave, disabled = false, onOpen, description, variant = 'button', onRefresh, automaticIds = [] }: {
 automaticIds?: string[]; onRefresh?: () => Promise<void>; selectedIds: string[]; onSave: (ids: string[], base: string[]) => Promise<void>; disabled?: boolean; onOpen?: () => void; description?: string; variant?: 'button' | 'field'
}) {
 const { collections, refresh } = useLibrary()
 const [open, setOpen] = useState(false), [selected, setSelected] = useState<string[]>([]), [base, setBase] = useState<string[]>([])
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState<EditConflict | null>(null)
 useActivity(Boolean(busy), 'Saving collections…')
 const trigger = useRef<HTMLButtonElement>(null)
 const wasOpen = useRef(false)
 useEffect(() => {
  if (wasOpen.current && !open) trigger.current?.focus()
  wasOpen.current = open
 }, [open])
 const assigned = collections.filter(collection => !collection.default_key && (selectedIds.includes(collection.id) || automaticIds.includes(collection.id)))
 const iconOnly = variant === 'field' && assigned.length > 0
 function close() { setOpen(false); setConflict(null) }
 function failed(error: unknown) { if (error instanceof EditConflict) setConflict(error); else setError(error instanceof Error ? error.message : 'Could not save collections.') }
 async function save() {
  setBusy(true); setError('')
  try { await onSave(selected, base); await (onRefresh ?? refresh)(); close() } catch (error) { failed(error) } finally { setBusy(false) }
 }
 const button = <button ref={trigger} type="button" className={iconOnly ? 'icon-button inline-edit-icon' : 'button secondary'} disabled={disabled} aria-haspopup="dialog" aria-label={iconOnly ? 'Edit Collections' : undefined} title={iconOnly ? 'Edit Collections' : undefined} onClick={() => { setSelected(selectedIds); setBase(selectedIds); setError(''); setConflict(null); setOpen(true); onOpen?.() }}>{iconOnly ? <Pencil size={14} aria-hidden="true" /> : <><FolderPlus size={16} aria-hidden="true" />Add to Collection</>}</button>
 return <>{variant === 'field' ? <section className="details-collections" aria-label="Collections"><div className="details-collections-heading"><h2 className="details-control-heading">Collections</h2>{iconOnly && button}</div><div className="details-collections-content">{assigned.length ? <ul className="collection-name-list">{assigned.map(collection => <li key={collection.id}><Square size={12} aria-hidden="true" /><span>{collection.name}</span></li>)}</ul> : button}</div></section> : button}

  {open && <Dialog title="Edit Collections" onClose={close} busy={busy}>
   {description && <p>{description}</p>}
   <form onSubmit={event => { event.preventDefault(); if (!conflict) void save() }}><fieldset disabled={busy || Boolean(conflict)}><CollectionChoices collections={collections} selected={selected} onChange={setSelected} /><NewCollectionButton onCreated={id => setSelected(current => [...current, id])} /><div className="form-actions"><button className="button primary">{busy ? 'Saving…' : 'Save Collections'}</button><button type="button" className="button secondary" onClick={close}>Cancel</button></div></fieldset></form>
   {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} collections={collections} onSaved={async () => { await (onRefresh ?? refresh)(); close() }} onError={failed} onCancel={() => setConflict(null)} />}
   {error && <p role="alert" className="error-message">{error}</p>}
  </Dialog>}
 </>
}
