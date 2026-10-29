import { useActivity } from '../../lib/use-activity'
import { FilePicker } from '../../components/FilePicker'
import './backups.css'
import { useRef, useState } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { formatDateTime } from '../../lib/dates'
import { type SavedBackup } from './repository'
import { prepareRestore, restoreBackup, type PreparedRestore } from './restore'

const previewLabels: Record<string, string> = {
  reading_records: 'Archived Reading Records', library_entries: 'Saved Works', library_series: 'Saved Series', collections: 'Collections', personal_tags: 'Personal Tags',
  collection_works: 'Work Memberships', collection_series: 'Series Memberships', library_entry_tags: 'Personal Tag Links',
  metadata_preferences: 'Metadata Settings', import_batches: 'Import Batches', import_items: 'Import Items', metadata_jobs: 'Metadata Jobs', processing_logs: 'Processing Logs',
}

export function RestoreBackupSettings({ backups, disabled, onActiveChange, onRestored }: {
  backups: SavedBackup[]; disabled: boolean; onActiveChange: (active: boolean) => void; onRestored: () => Promise<void>
}) {
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null)
  const [selected, setSelected] = useState(''), [loading, setLoading] = useState(false)
  useActivity(Boolean(loading), 'Reading your backup…')
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
  return <fieldset className="settings-subsection" aria-labelledby="restore-backup-title">
    <legend><h3 id="restore-backup-title">Restore Backup</h3></legend>
    <p className="muted">Restore a JSON or JSON.gz backup from your own account. Preview the changes before replacing your library. A safety copy of your current library is saved privately in Supabase first; restoration stops if that copy cannot be saved.</p>
    <FilePicker className="backup-source-field" label="Choose Backup File" accept=".json,.gz,application/json,application/gzip" disabled={locked} onChange={files => void preview(files[0])} />
    {backups.length > 0 && <div className="form-actions">
      <label className="backup-source-field">Saved Backup<select aria-label="Saved Backup to Restore" disabled={locked} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Choose a Saved Backup</option>
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
    {prepared && <ConfirmationDialog className="backup-restore-dialog" title="Replace Your Library With This Backup?" confirmLabel="Save Safety Backup and Replace Library" pendingLabel="Saving Safety Copy and Restoring…" onClose={close} onConfirm={async () => {
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
  </fieldset>
}
