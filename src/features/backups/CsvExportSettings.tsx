import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { csvFiles, exportLibraryCsv, type CsvFile } from './csv-export'

export function CsvExportSettings() {
  const [selection, setSelection] = useState<CsvFile[]>(csvFiles.map(file => file.name))
  const [busy, setBusy] = useState(false), pending = useRef(false)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  async function download() {
    if (pending.current || !selection.length) return
    pending.current = true; setBusy(true); setMessage(''); setError('')
    try { await exportLibraryCsv(selection); setMessage('Your ZIP download has started.') }
    catch { setError('Could not export your library. Check your connection and try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section id="settings-csv-export" tabIndex={-1} className="settings-card csv-export-settings">
    <div className="section-title"><Download size={21} /><h2>Export CSV</h2></div>
    <p>Choose the files to include in one ZIP download. Exports include every saved item across all pages, including private notes and ratings.</p>
    <fieldset disabled={busy}>
      <legend>Files to export</legend>
      <label className="check-label"><input type="checkbox" checked={selection.length === csvFiles.length} onChange={event => setSelection(event.target.checked ? csvFiles.map(file => file.name) : [])} />Export all</label>
      <div className="collection-options collection-options-expanded">{csvFiles.map(file => <label className="check-label" key={file.name}>
        <input type="checkbox" checked={selection.includes(file.name)} onChange={event => setSelection(current => event.target.checked ? [...current, file.name] : current.filter(name => name !== file.name))} />
        <span>{file.name}<small className="muted">{file.description}</small></span>
      </label>)}</div>
    </fieldset>
    <p className="muted">Works and series include collection names. Automatic collections include their rules and current membership. Lists and structured metadata are stored as JSON in CSV cells. Text that could be interpreted as a spreadsheet formula is prefixed with an apostrophe.</p>
    <div className="form-actions"><button className="button secondary" disabled={busy || !selection.length} onClick={() => void download()}><Download size={17} />{busy ? 'Preparing ZIP…' : 'Download CSV ZIP'}</button></div>
    {message && <p role="status" className="muted">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
