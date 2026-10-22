import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudUpload, Download } from 'lucide-react'
import { sampleMode } from '../../lib/sample-mode'
import { formatDateTime } from '../../lib/dates'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { RestoreBackupSettings } from './RestoreBackupSettings'
import { BackupRequestError, deleteSavedBackup, downloadSavedBackup, exportBackup, listSavedBackups, saveBackup, type SavedBackup } from './repository'

export function BackupSettings() {
  const [busy, setBusy] = useState('')
  const exporting = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [backups, setBackups] = useState<SavedBackup[]>([])
  const [loading, setLoading] = useState(!sampleMode)
  const [listError, setListError] = useState('')
  const [deleting, setDeleting] = useState<SavedBackup | null>(null)
  const [restoring, setRestoring] = useState(false)
  const loadId = useRef(0)
  const refresh = useCallback((signal?: AbortSignal) => {
    const request = ++loadId.current
    return listSavedBackups().then(saved => {
      if (!signal?.aborted && request === loadId.current) { setBackups(saved); setListError('') }
    }).catch(() => {
      if (!signal?.aborted && request === loadId.current) setListError('Could not load saved backups. Check your connection and reload the page to try again.')
    }).finally(() => { if (!signal?.aborted && request === loadId.current) setLoading(false) })
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    if (!sampleMode) void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])
  async function refreshSaved() {
    setLoading(true); setListError('')
    await refresh()
  }
  async function run(action: string, task: () => Promise<void>, success: string) {
    if (exporting.current) return
    exporting.current = true
    setBusy(action); setMessage(''); setError('')
    try {
      await task()
      setMessage(success)
    } catch (failure) { setError(failure instanceof BackupRequestError ? failure.message : 'Could not complete your backup request. Check your connection and browser storage, then try again. Contact the administrator if this continues.') }
    finally { exporting.current = false; setBusy('') }
  }
  const disabled = Boolean(busy || sampleMode || deleting || restoring)
  return <section id="settings-backup" tabIndex={-1} className="settings-card">
    <div className="section-title"><Download size={21} /><h2>Export Backup</h2></div>
    <p>Download or save your complete library, including all works and their metadata, reading progress, private notes, ratings, tags, collections, saved series, import history, and settings. Every saved work is included, across all pages.</p>
    <p className="muted">Use Restore Backup below to preview a JSON backup and restore your own account. Sign-in credentials and paired devices are excluded. Browser preferences are included from this browser.</p>
    <div className="form-actions">
      <button className="button secondary" disabled={disabled} onClick={() => void run('export', exportBackup, 'Your backup download has started. Keep the file somewhere safe; it includes your private notes.')}><Download size={17} />{busy === 'export' ? 'Preparing backup…' : 'Export Backup'}</button>
      <button className="button secondary" disabled={disabled} onClick={() => void run('save', async () => { await saveBackup(); await refreshSaved() }, 'Your backup was saved privately in Supabase.')}><CloudUpload size={17} />{busy === 'save' ? 'Saving backup…' : 'Save Backup to Supabase'}</button>
    </div>
    {sampleMode && <p className="muted">Backups are unavailable in the local sample preview.</p>}
    {message && <p role="status" className="muted">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <h3>Saved Backups</h3>
    <p className="muted">Your three most recent successful backups are kept privately in Supabase. After a new backup uploads successfully, older copies are removed automatically. You can save once per minute, up to 50 MiB per file. Downloaded backups are unrestricted. Keep a downloaded copy outside Supabase too.</p>
    {loading && <p role="status" className="muted">Loading saved backups…</p>}
    {listError && <p role="alert">{listError}</p>}
    {!sampleMode && !loading && !listError && backups.length === 0 && <p className="muted">No saved backups yet.</p>}
    <dl>{backups.map(backup => <div key={backup.path}>
      <dt>{formatDateTime(backup.createdAt)} · {(backup.size / 1_048_576).toFixed(2)} MiB</dt>
      <dd className="form-actions">
        <button className="button secondary compact" disabled={disabled || loading} aria-label={`Download backup from ${formatDateTime(backup.createdAt)}`} onClick={() => void run(`download:${backup.path}`, () => downloadSavedBackup(backup), 'Your saved backup download has started.')}>{busy === `download:${backup.path}` ? 'Downloading…' : 'Download'}</button>
        <button className="button secondary compact" disabled={disabled || loading} aria-label={`Delete backup from ${formatDateTime(backup.createdAt)}`} onClick={() => setDeleting(backup)}>Delete</button>
      </dd>
    </div>)}</dl>
    <RestoreBackupSettings backups={backups} disabled={Boolean(busy || sampleMode || deleting)} onActiveChange={setRestoring} onRestored={refreshSaved} />
    {deleting && <ConfirmationDialog title="Delete saved backup?" confirmLabel="Delete Backup" onClose={() => setDeleting(null)} onConfirm={async () => {
      await deleteSavedBackup(deleting)
      setBackups(current => current.filter(backup => backup.path !== deleting.path))
      setMessage('Saved backup deleted. Your library is unchanged.')
    }}><p>This permanently removes the backup saved on {formatDateTime(deleting.createdAt)}. Your current library data will be kept.</p></ConfirmationDialog>}
  </section>
}
