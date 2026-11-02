import { useId, useRef, useState } from 'react'
import { useDismissible } from '../../components/useDismissible'
import { progressReadingStatus, type Metadata, type Status } from './model'

export function ChapterProgress({ progress, metadata, disabled = false, onOpen, onSave }: { progress: number; metadata: Metadata; disabled?: boolean; onOpen?: () => void; onSave: (progress: number, status: Status) => Promise<boolean | void> }) {
 const [open, setOpen] = useState(false), [value, setValue] = useState(String(progress)), [error, setError] = useState(''), [saving, setSaving] = useState(false)
 const id = useId(), trigger = useRef<HTMLButtonElement>(null)
 function close() { setOpen(false); setError(''); requestAnimationFrame(() => trigger.current?.focus()) }
 const ref = useDismissible<HTMLDivElement>(open, () => { setOpen(false); setError('') })
 return <div className="progress-editor" ref={ref} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
  <button ref={trigger} className="chapter-progress-button" title="Edit Chapter Progress" aria-label={`Chapter ${progress} of ${metadata.published_chapters ?? '?'} — Edit Progress`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled || saving} onClick={() => { onOpen?.(); setValue(String(progress)); setError(''); setOpen(!open) }}><strong>Ch. {progress} / {metadata.published_chapters ?? '?'}</strong></button>
  {open && <div id={id} role="dialog" aria-modal="false" className="progress-popover" aria-label="Edit Chapter Progress"><form onSubmit={event => {
   event.preventDefault()
   void (async () => { setSaving(true); setError(''); try { if (!value.trim()) throw new Error('Enter chapters read.'); const status = progressReadingStatus(Number(value), metadata); if (await onSave(Number(value), status) !== false) close() } catch (error) { setError(error instanceof Error ? error.message : 'Could not save progress.') } finally { setSaving(false) } })()
  }}><h2>Edit Chapter Progress</h2><label>Last Fully Read Chapter<input type="number" autoFocus required min="0" step="1" value={value} onChange={event => setValue(event.target.value)} /></label><p>of {metadata.total_chapters ?? '?'} · {metadata.published_chapters ?? '?'} published</p>{error && <p role="alert" className="error-message">{error}</p>}<div className="form-actions"><button className="button primary" disabled={disabled || saving}>Save Progress</button><button className="button secondary" disabled={saving} type="button" onClick={close}>Cancel</button></div></form></div>}
 </div>
}
