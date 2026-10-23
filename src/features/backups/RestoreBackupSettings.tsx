import './backups.css'
import { useRef, useState } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { formatDateTime } from '../../lib/dates'
import { type SavedBackup } from './repository'
import { prepareRestore, restoreBackup, type PreparedRestore } from './restore'

const previewLabels: Record<string, string> = {
  library_entries: 'Saved works', library_series: 'Saved series', collections: 'Collections', personal_tags: 'Personal tags',
  collection_works: 'Work memberships', collection_series: 'Series memberships', library_entry_tags: 'Personal tag links',
  metadata_preferences: 'Metadata settings', import_batches: 'Import batches', import_items: 'Import items', metadata_jobs: 'Metadata jobs', processing_logs: 'Processing logs',
}

export function RestoreBackupSettings({ backups, disabled, onActiveChange, onRestored }: {
  backups: SavedBackup[]; disabled: boolean; onActiveChange: (active: boolean) => void; onRestored: () => Promise<void>
}) {
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null)
  const [selected, setSelected] = useState(''), [loading, setLoading] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const pending = useRef(false)
  async function preview(source: File | SavedBackup) {
    if (pending.current) return
    pending.current = true; setLoading(true); setError(''); onActiveChange(true)
    try { setPrepared(await prepareRestore(source)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not preview this backup.'); onActiveChange(false) }
    finally { pending.current = false; setLoading(false) }
  }
  function close() { setPrepared(null); onActiveChange(false) }
  const locked = disabled || loading || Boolean(prepared || message)
  return <>
    <h3>Restore Backup</h3>
    <p className="muted">Restore a JSON or JSON.gz backup from your own account. Preview the changes before replacing your library. A safety copy of your current library is saved privately in Supabase first; restoration stops if that copy cannot be saved.</p>
    <label className="backup-source-field">Choose backup file<input type="file" accept=".json,.gz,application/json,application/gzip" disabled={locked} onChange={event => {
      const file = event.target.files?.[0]
      if (file) void preview(file)
    }} /></label>
    {backups.length > 0 && <div className="form-actions">
      <label className="backup-source-field">Saved backup<select aria-label="Saved backup to restore" disabled={locked} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Choose a saved backup</option>
        {backups.map(backup => <option key={backup.path} value={backup.path}>{formatDateTime(backup.createdAt)} · {backup.name}</option>)}
      </select></label>
      <button className="button secondary" disabled={locked || !backups.some(backup => backup.path === selected)} onClick={() => {
        const backup = backups.find(backup => backup.path === selected)
        if (backup) void preview(backup)
      }}>Preview Saved Backup</button>
    </div>}
    {loading && <p role="status">Validating backup and preparing preview…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <><p role="status">{message}</p><button className="button primary" onClick={() => window.location.reload()}>Reload Library</button></>}
    {prepared && <ConfirmationDialog className="backup-restore-dialog" title="Replace your library with this backup?" confirmLabel="Save Safety Backup and Replace Library" pendingLabel="Saving safety copy and restoring…" onClose={close} onConfirm={async () => {
      const result = await restoreBackup(prepared)
      setMessage(result)
      await onRestored()
    }}>
      <p>Backup: {prepared.name}<br />Created: {formatDateTime(prepared.preview.exported_at)}</p>
      <p>This replaces your current works, notes, ratings, progress, collections, saved series, import history, and metadata settings. Items added since the backup will be removed. Available browser preferences will also be restored.</p>
      <dl className="metadata-list">{Object.entries(prepared.preview.counts).map(([table, counts]) => <div key={table}>
        <dt>{previewLabels[table] ?? table}</dt><dd>{counts.current} current → {counts.backup} in backup</dd>
      </div>)}</dl>
      <p>AO3 metadata from the file is restored privately to your account. Sign-in credentials and paired devices are kept. A safety copy of the current library will appear in Saved Backups, under the normal three-backup retention policy.</p>
    </ConfirmationDialog>}
  </>
}
