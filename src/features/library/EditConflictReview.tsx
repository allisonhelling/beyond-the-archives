import { useEffect, useId, useRef, useState } from 'react'
import { EditConflict, type EditValues } from './edit-merge'
import { statuses } from './model'
import type { Json } from '../../types/database'

const labels: Record<string, string> = { reading: 'Reading progress', notes: 'Private notes', status: 'Reading status', progress: 'Chapters read', rating: 'Personal rating', favorite: 'Favorite', tags: 'Personal tags', collections: 'Custom collections' }
function display(field: string, value: Json) {
  if (field === 'reading' && value && typeof value === 'object' && !Array.isArray(value)) return `${statuses[value.status as keyof typeof statuses] ?? value.status} · ${value.progress} chapters read`
  if (field === 'status' && typeof value === 'string') return statuses[value as keyof typeof statuses] ?? value
  if (value === null || value === '') return '(empty)'
  return typeof value === 'string' ? value : Array.isArray(value) ? value.join('\n') || '(empty)' : JSON.stringify(value, null, 2)
}
export function EditConflictReview({ conflict, onSaved, onError, onCancel, collections = [] }: { conflict: EditConflict; onSaved: (result: unknown) => void | Promise<void>; onError: (error: unknown) => void; onCancel: () => void; collections?: { id: string; name: string }[] }) {
  const id = useId(), region = useRef<HTMLElement>(null)
  useEffect(() => { region.current?.focus() }, [])
  const [choices, setChoices] = useState<Record<string, string>>({}), [combined, setCombined] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const format = (field: string, value: Json) => display(field, field === 'collections' && Array.isArray(value) ? value.map(id => collections.find(collection => collection.id === id)?.name ?? id) : value)
  async function save() {
    setBusy(true)
    try {
      const values: EditValues = Object.fromEntries(conflict.review.conflicts.map(item => [item.field, choices[item.field] === 'combined' ? combined[item.field] ?? String(item.local ?? '') : choices[item.field] === 'saved' ? item.saved : item.local]))
      await onSaved(await conflict.retry(values))
    } catch (error) { onError(error) }
    finally { setBusy(false) }
  }
  return <section ref={region} tabIndex={-1} className="edit-conflict-review" aria-label="Review conflicting edits" role="region">
    <h3>Changes saved on another device</h3><p>Other changes can be merged automatically. Choose what to save for each conflicting field. Nothing is saved until you confirm.</p>
    {conflict.review.conflicts.map(item => <fieldset key={item.field} disabled={busy}>
      <legend>{labels[item.field] ?? item.field.replace('metadata.', '').replaceAll('_', ' ')}</legend>
      <div className="edit-conflict-versions"><div><strong>Your draft</strong><pre>{format(item.field, item.local)}</pre></div><div><strong>Currently saved</strong><pre>{format(item.field, item.saved)}</pre></div></div>
      <label><input type="radio" name={`${id}-resolve-${item.field}`} checked={choices[item.field] === 'local'} onChange={() => setChoices(current => ({ ...current, [item.field]: 'local' }))} />Keep my draft</label>
      <label><input type="radio" name={`${id}-resolve-${item.field}`} checked={choices[item.field] === 'saved'} onChange={() => setChoices(current => ({ ...current, [item.field]: 'saved' }))} />Use saved version</label>
      {item.field === 'notes' && <><label><input type="radio" name={`${id}-resolve-${item.field}`} checked={choices[item.field] === 'combined'} onChange={() => setChoices(current => ({ ...current, [item.field]: 'combined' }))} />Edit or combine notes</label>{choices[item.field] === 'combined' && <label>Notes to save<textarea aria-label="Notes to save" rows={6} value={combined[item.field] ?? String(item.local ?? '')} onChange={event => setCombined(current => ({ ...current, [item.field]: event.target.value }))} /></label>}</>}
    </fieldset>)}
    <div className="form-actions row"><button type="button" className="button primary" disabled={busy || conflict.review.conflicts.some(item => !choices[item.field])} onClick={() => void save()}>{busy ? 'Saving…' : 'Save resolved changes'}</button><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Back to editing</button></div>
  </section>
}
