import { useActivity } from '../../lib/use-activity'
import { useRef, useState } from 'react'
import { LockKeyhole, NotebookPen, Pencil } from 'lucide-react'
import { EditConflict } from './edit-merge'
import { EditConflictReview } from './EditConflictReview'

/** The same private-note editor and conflict review for works and series. */
export function PersonalNote({ notes, onSave, onRefresh, disabled = false }: { notes: string; onSave: (notes: string, base: string) => Promise<void>; onRefresh: () => Promise<void>; disabled?: boolean }) {
 const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [base, setBase] = useState('')
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState<EditConflict | null>(null)
 useActivity(Boolean(busy), 'Saving your note…')
 const trigger = useRef<HTMLButtonElement>(null)
 function close() { setConflict(null); setEditing(false); trigger.current?.focus() }
 function failed(error: unknown) { if (error instanceof EditConflict) setConflict(error); else setError(error instanceof Error ? error.message : 'Could not save your note.') }
 async function save() { setBusy(true); setError(''); try { await onSave(draft, base); await onRefresh(); close() } catch (error) { failed(error) } finally { setBusy(false) } }
 return <div className={`inline-personal-field note-panel ${notes || editing ? 'note-panel-filled' : ''}`}>
  <div className="note-heading">{(notes || editing) && <><span><NotebookPen size={18} aria-hidden="true" />Your Note</span><span className="note-private"><LockKeyhole size={14} aria-hidden="true" />private</span></>}{!editing && <button ref={trigger} type="button" disabled={disabled} className={`text-button inline-edit${notes ? '' : ' clickable-text'}`} onClick={() => { setBase(notes); setDraft(notes); setError(''); setConflict(null); setEditing(true) }} aria-label={notes ? 'Edit Note' : 'Add a Note'}>{notes ? <Pencil size={16} aria-hidden="true" /> : <NotebookPen size={18} aria-hidden="true" />}{notes ? 'Edit' : 'Add a Note'}</button>}</div>
  {editing ? <form className="inline-personal-form" onSubmit={event => { event.preventDefault(); if (!conflict) void save() }}><fieldset disabled={busy || Boolean(conflict)}>
   <label className="note-input-label"><span className="sr-only">Private Notes</span><textarea autoFocus aria-label="Private Notes" rows={4} value={draft} placeholder="A private reminder for your next visit." onChange={event => setDraft(event.target.value)} /></label>
   <div className="form-actions"><button className="button primary" type="submit">{busy ? 'Saving…' : 'Save'}</button><button className="text-button" type="button" onClick={close}>Cancel</button></div>
  </fieldset></form> : notes && <p className="story-summary">{notes}</p>}
  {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} onSaved={async () => { await onRefresh(); close() }} onError={failed} onCancel={() => setConflict(null)} />}
  {error && <p className="error-message" role="alert">{error}</p>}
 </div>
}
