import { Dropdown } from '../../components/Dropdown'
import { ConnectReader } from './ConnectReader'
import { useSearchParams } from 'react-router-dom'
import { useOffline } from './OfflineProvider'
import { clearOfflineSnapshot, readerWorkUrl } from './storage'
export function ReaderControls({ hub = false }: { hub?: boolean }) {
  const { snapshot, shellReady, error, refresh } = useOffline()
  const [params, setParams] = useSearchParams()
  const selected = params.get('reader') ?? (hub ? snapshot?.readers[0]?.id ?? '' : '')
  const reader = snapshot?.readers.find(reader => reader.id === selected)
  const report = reader && <p className="field-help">Last reported by {reader.name}: {new Date(reader.reportedAt).toLocaleString()}. The reader confirms local file availability when opened. This is not verified availability on this device.</p>
  const errorMessage = error && <p role="status">{error}</p>
  function selectReader(value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set('reader', value); else next.delete('reader')
    next.set('page', '1'); setParams(next)
  }
  if (!hub) return <div className="reader-availability-filter"><Dropdown fitContent closeOnSelect label="Available Offline" value={selected} onChange={selectReader} options={[{ value: '', label: 'All Works' }, ...(snapshot?.readers.map(reader => ({ value: reader.id, label: reader.name })) ?? [])]} />{report}{errorMessage}</div>
  return <section className="settings-card" aria-label="Reader Availability"><label>Reader Installation<select value={selected} onChange={event => selectReader(event.target.value)}>{!snapshot?.readers.length && hub && <option value="">No Reader Reports Yet</option>}{snapshot?.readers.map(reader => <option key={reader.id} value={reader.id}>{reader.name}</option>)}</select></label>
    {report}
    {hub && <ConnectReader />}{hub && <p role="status">{shellReady && snapshot ? 'Organizer hub prepared for offline use.' : !snapshot ? 'Connect online and refresh reader reports to retain your hub.' : import.meta.env.DEV ? 'Development mode: build and preview to prepare offline use.' : 'Preparing the organizer interface and retained reports for offline use…'}</p>}
    {hub && <p>Initial setup requires connectivity. Prepare the reader for offline use and import EPUBs there separately. The hub does not cache reader files. Browser storage may be cleared; retained reports may be out of date.</p>}
    {errorMessage}{hub && <div className="form-actions"><button className="button secondary" disabled={!navigator.onLine} onClick={() => void refresh()}>Refresh Reader Reports</button>{snapshot && <button className="button secondary" onClick={clearOfflineSnapshot}>Clear Retained Hub</button>}</div>}
  </section>
}
export function ReadEpub({ workId }: { workId: number | null }) {
  const { snapshot } = useOffline()
  const [readerId, setReaderId] = useSearchParams()
  const reports = snapshot?.readers ?? []
  const reader = reports.find(reader => reader.id === readerId.get('reader')) ?? reports[0]
  if (!workId) return null
  if (!reader) return <p className="field-help">Read EPUB: connect a reader and sync its availability report first.</p>
  let href: string
  try { href = readerWorkUrl(reader.url, workId) } catch { return <p className="field-help">Reconnect this reader to update its URL.</p> }
  return <div className="form-actions">{reports.length > 1 && <label>Open in Reader<select value={reader.id} onChange={event => { const next = new URLSearchParams(readerId); next.set('reader', event.target.value); setReaderId(next, { replace: true }) }}>{reports.map(reader => <option key={reader.id} value={reader.id}>{reader.name}</option>)}</select></label>}<a className="button secondary" href={href}>Read EPUB</a></div>
}
