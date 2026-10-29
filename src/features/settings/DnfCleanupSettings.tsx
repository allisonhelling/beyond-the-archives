import { useActivity } from '../../lib/use-activity'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { formatDateTime } from '../../lib/dates'
import { sampleMode } from '../../lib/sample-mode'
import { useAuth } from '../auth/auth-context'
import { useLibrary } from '../library/LibraryProvider'
import { cleanupRequest, defaultCleanupSettings, type ArchivedReading, type CleanupResult, type CleanupSettings } from './dnf-cleanup'
import { dnfCleanupSettingsSection } from './settings-sections'

const presets = [{ hours: 24, label: '24 Hours' }, { hours: 168, label: '7 Days' }, { hours: 720, label: '30 Days' }, { hours: 1440, label: '60 Days' }]
const protections = [
 { key: 'protect_favorites', label: 'Favorites and Recommendations' },
 { key: 'protect_personal', label: 'Fics With Personal Notes, Ratings, or Personal Tags' },
 { key: 'protect_collections', label: 'Fics in Manually Managed Collections' },
] as const

export function DnfCleanupSettings() {
 const { session } = useAuth(), { refresh } = useLibrary()
 const [saved, setSaved] = useState<CleanupResult | null>(null)
 const [draft, setDraft] = useState<CleanupSettings>(defaultCleanupSettings)
 const [duration, setDuration] = useState('168'), [custom, setCustom] = useState('7'), [unit, setUnit] = useState('days')
 const [preview, setPreview] = useState<CleanupResult | null>(null), [confirm, setConfirm] = useState(false)
 const [archive, setArchive] = useState<ArchivedReading | null>(null), [page, setPage] = useState(0)
 const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
 useActivity(Boolean(busy), 'Processing reading cleanup…')
 const pending = useRef(false)
 const userId = session?.user.id
 function apply(result: CleanupResult) {
  setSaved(result); setDraft(result.settings); setPreview(null)
  const hours = result.settings.hours
  setDuration(presets.some(preset => preset.hours === hours) ? String(hours) : 'custom')
  setUnit(hours % 24 === 0 ? 'days' : 'hours'); setCustom(String(hours % 24 === 0 ? hours / 24 : hours))
 }
 useEffect(() => {
  let active = true
  if (!sampleMode && userId) void cleanupRequest('get').then(result => { if (active) apply(result) }).catch(failure => { if (active) setError(failure.message) })
  return () => { active = false }
 }, [userId])
 const hours = duration === 'custom' ? Number(custom) * (unit === 'days' ? 24 : 1) : Number(duration)
 const valid = (duration !== 'custom' || (custom.trim() !== '' && Number.isInteger(Number(custom)))) && Number.isInteger(hours) && hours >= 24 && hours <= 87600
 const settings = { ...draft, hours }
 const dirty = saved && JSON.stringify(settings) !== JSON.stringify(saved.settings)
 const disabled = busy || !saved || sampleMode
 async function act(task: () => Promise<void>) {
  if (pending.current) return
  pending.current = true; setBusy(true); setError(''); setMessage('')
  try { await task() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete cleanup.'); setPreview(null) }
  finally { pending.current = false; setBusy(false) }
 }
 async function loadArchive(next: number) {
  const result = await cleanupRequest('archive', undefined, next)
  setArchive(result); setPage(next)
 }
 return <section id={dnfCleanupSettingsSection.id} tabIndex={-1} className="settings-card">
  <h2>{dnfCleanupSettingsSection.title}</h2>
  <p>Remove detailed fic entries after they have remained marked Did Not Finish for your selected period. A compact, private reading record preserves their recorded progress and history for statistics.</p>
  {sampleMode && <p className="muted">DNF cleanup requires a signed-in account and is unavailable in the local sample preview.</p>}
  <form className="story-form" onSubmit={event => { event.preventDefault(); if (!saved || !valid) return; void act(async () => { apply(await cleanupRequest('save', { settings, base: saved.settings })); setMessage('DNF cleanup settings saved.'); }) }}>
   <fieldset className="settings-subsection" disabled={disabled}>
    <legend>Automatic Cleanup</legend>
    <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={event => { setDraft({ ...draft, enabled: event.target.checked }); setPreview(null) }} />Automatically Clean Up DNF Fics</label>
    <label>Clean Up After<select value={duration} onChange={event => { setDuration(event.target.value); setPreview(null) }}>{presets.map(preset => <option key={preset.hours} value={preset.hours}>{preset.label}</option>)}<option value="custom">Custom Duration</option></select></label>
    {duration === 'custom' && <div className="form-actions"><label>Custom Amount<input type="number" min="1" max={unit === 'days' ? 3650 : 87600} step="1" required value={custom} onChange={event => { setCustom(event.target.value); setPreview(null) }} /></label><label>Custom Unit<select value={unit} onChange={event => { setUnit(event.target.value); setPreview(null) }}><option value="days">Days</option><option value="hours">Hours</option></select></label></div>}
    <p className="muted">Minimum 24 hours; maximum 3650 days. Cleanup runs on the next scheduled check after the period has elapsed. Turning it off stops future automatic cleanup.</p>
    {!valid && <p role="alert">Enter a whole number of hours or days between 24 hours and 3650 days.</p>}
   </fieldset>
   <fieldset className="settings-subsection" disabled={disabled}><legend>Protect from Cleanup</legend>{protections.map(({ key, label }) => <label className="check-label" key={key}><input type="checkbox" checked={draft[key]} onChange={event => { setDraft({ ...draft, [key]: event.target.checked }); setPreview(null) }} />{label}</label>)}<p className="muted">Fics with pending metadata requests are always protected until those requests finish.</p></fieldset>
   <div className="form-actions"><button className="button primary" disabled={disabled || !valid}>Save Settings</button><button type="button" className="button secondary" disabled={busy || sampleMode || !userId} onClick={() => void act(async () => { apply(await cleanupRequest('get')); setMessage('Saved settings reloaded.'); })}>Reload Saved Settings</button></div>
  </form>
  {saved && <p>Currently eligible: {saved.eligible} · Protected: {saved.protected} · Waiting: {saved.waiting}</p>}
  <p className="muted">Cleanup removes summaries, detailed metadata, notes, personal tags, ratings, and collection memberships. It keeps identity, title, authors, fandoms, known dates, recorded chapter progress, word-count context, and the status timeline. Reading records cannot restore deleted details; full recovery requires a backup.</p>
  {dirty && <p className="muted">Save or reload your settings before previewing cleanup.</p>}
  <div className="form-actions"><button className="button secondary" disabled={disabled || !!dirty} onClick={() => void act(async () => { const result = await cleanupRequest('preview'); setSaved(result); setPreview(result) })}>Preview Cleanup</button><button className="button secondary" disabled={disabled} onClick={() => void act(() => loadArchive(0))}>View Archived Reading Activity</button></div>
  {preview && <div className="settings-subsection"><h3>Cleanup Preview</h3><p>{preview.eligible} eligible fics. Showing up to 100 for this cleanup. Only these entries will be considered when you confirm.</p><ul>{preview.entries?.map(entry => <li key={entry.id}><strong>{entry.title}</strong> · DNF since {formatDateTime(entry.dnf_since)}</li>)}</ul><button className="button primary" disabled={busy || !preview.entries?.length || !!dirty} onClick={() => setConfirm(true)}>Clean Up Now</button></div>}
  {archive && <div className="settings-subsection"><h3>Archived Reading Activity</h3><p>{archive.total} compact records. Actual words read and time spent reading are not measured.</p><ul>{archive.records.map(record => {
   const metadata = record.metadata as { title?: string; authors?: string[] }
   return <li key={record.id}><strong>{metadata.title || 'Untitled Fic'}</strong>{metadata.authors?.length ? ` by ${metadata.authors.join(', ')}` : ''} · DNF {record.dnf_since ? formatDateTime(record.dnf_since) : 'date unknown'} · Chapter {record.last_read_chapter} · Archived {formatDateTime(record.archived_at)} {record.ao3_work_id && <Link className="clickable-text" to="/add" state={{ workUrl: `https://archiveofourown.org/works/${record.ao3_work_id}` }}>Add Again</Link>}</li>
  })}</ul><div className="form-actions"><button className="button secondary" disabled={busy || page === 0} onClick={() => void act(() => loadArchive(page - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(archive.total / 25))}</span><button className="button secondary" disabled={busy || (page + 1) * 25 >= archive.total} onClick={() => void act(() => loadArchive(page + 1))}>Next</button></div><p className="muted">Routine CSV imports and library sync skip archived fics. Add again starts a new reading attempt and retains the earlier record.</p></div>}
  {confirm && preview && <ConfirmationDialog title="Clean Up DNF Fics?" confirmLabel="Clean Up Now" pendingLabel="Cleaning Up…" onClose={() => setConfirm(false)} onConfirm={async () => {
   const result = await cleanupRequest('cleanup', { settings: preview.settings, entries: preview.entries })
   apply(result); setMessage(`Cleaned up ${result.removed} fics. Their compact reading records were preserved.`)
   try { await refresh(); if (archive) await loadArchive(0) } catch { setError('Cleanup succeeded. Reload to refresh your library and archive.') }
  }}><p>Remove detailed data for up to {preview.entries?.length ?? 0} previewed fics and retain compact reading records. Personal details removed by cleanup can only be recovered from a full backup.</p></ConfirmationDialog>}
  {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
 </section>
}
