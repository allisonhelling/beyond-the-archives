import { savedWorkIdentity } from '../library/model'
import { readerWorkIdentities } from '../../lib/reader-work-identities'
import { useEffect, useState } from 'react'
import { Dropdown } from '../../components/Dropdown'
import { BookOpen } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { ConnectReader } from './ConnectReader'
import { useSearchParams } from 'react-router-dom'
import { useOffline } from './OfflineProvider'
import { hostedReaderUrl } from '../../lib/reader-connection'
import { readerWorkUrl } from './storage'
export function ReaderControls({ hub = false }: { hub?: boolean }) {
  const { snapshot, shellReady, error, refresh, disconnect, disconnecting } = useOffline()
  const [message, setMessage] = useState('')
  const [params, setParams] = useSearchParams()
  const selected = params.get('reader') ?? (hub ? snapshot?.readers[0]?.id ?? '' : '')
  const reader = snapshot?.readers.find(reader => reader.id === selected)
  useEffect(() => {
    const requested = params.get('reader')
    if (!snapshot || !requested || snapshot.readers.some(reader => reader.id === requested)) return
    const next = new URLSearchParams(params); next.delete('reader'); next.set('page', '1'); setParams(next, { replace: true })
  }, [snapshot, params, setParams])
  const reports = hub ? snapshot?.readers ?? [] : reader ? [reader] : []
  const report = reports.map(reader => <p key={reader.id} className="field-help">Last reported by {reader.name}: {new Date(reader.reportedAt).toLocaleString()}. The reader confirms local file availability when opened. This is not verified availability on this device.</p>)
  const errorMessage = error && <p role="status">{error}</p>
  const cloudWorks = new Set(snapshot?.cloudBooks?.flatMap(book => { const ids = readerWorkIdentities(book); return ids.length ? ids : [book.id] }) ?? [])
  const connected = snapshot?.connected ?? Boolean(snapshot?.readers.length || cloudWorks.size)
  function selectReader(value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set('reader', value); else next.delete('reader')
    next.set('page', '1'); setParams(next)
  }
  if (!hub) return <div className="reader-availability-filter"><Dropdown fitContent closeOnSelect label="Available Offline" value={selected} onChange={selectReader} options={[{ value: '', label: 'All Works' }, ...(snapshot?.readers.map(reader => ({ value: reader.id, label: reader.name })) ?? [])]} />{report}{errorMessage}</div>
  return <section className="settings-card reader-hub-controls" aria-label="Reader Availability"><h2>{connected ? 'Connected Reader' : 'Reader Connection'}</h2>

    {report}{cloudWorks.size > 0 && <p>{cloudWorks.size} {cloudWorks.size === 1 ? 'work saved' : 'works saved'} in the reader cloud. Cloud-only EPUBs need an internet connection to download.</p>}{connected && !cloudWorks.size && !snapshot?.readers.some(reader => reader.works.length) && <p>No downloaded or cloud-saved EPUBs are available yet. Sync the reader account, then Refresh Reader Reports.</p>}
    {!connected && <ConnectReader />}{hub && <p role="status">{shellReady && snapshot ? 'Organizer hub prepared for offline use.' : !snapshot ? 'Connect online and refresh reader reports to retain your hub.' : import.meta.env.DEV ? 'Development mode: build and preview to prepare offline use.' : 'Preparing the organizer interface and retained reports for offline use…'}</p>}
    {hub && <p>Initial setup requires connectivity. Download cloud EPUBs in the reader to prepare them for offline use. The hub does not cache reader files. Browser storage may be cleared; retained reports may be out of date.</p>}
    {errorMessage}{message && <p role="status">{message}</p>}{hub && <div className="form-actions"><button className="button secondary" disabled={!navigator.onLine || disconnecting} onClick={() => void refresh()}>Refresh Reader Reports</button>{connected && <button className="button secondary" disabled={!navigator.onLine || disconnecting} onClick={() => { setMessage(''); void disconnect().then(() => setMessage('Reader disconnected. Books and reading data are preserved.')).catch(() => {}) }}>{disconnecting ? 'Disconnecting Reader…' : 'Disconnect Reader'}</button>}</div>}
  </section>
}
export function ReadEpub({ workId, bookId, variant = 'default', chapter }: { workId: number | null; bookId?: string; variant?: 'default' | 'details' | 'spine'; chapter?: number }) {
  const { snapshot } = useOffline()
  const [readerId, setReaderId] = useSearchParams()
  const reports = (snapshot?.connected === false ? [] : snapshot?.readers ?? []).filter(reader => workId !== null && reader.works.includes(String(workId)))
  const reader = reports.find(reader => reader.id === readerId.get('reader')) ?? reports[0]
  if (!workId && !bookId) return null
  const cloud = snapshot?.connected !== false ? snapshot?.cloudBooks?.find(book => bookId ? book.id === bookId : readerWorkIdentities(book).includes(String(workId))) : undefined
  if (!reader && !cloud) return null
  let href: string
  const targetWork = workId ?? (cloud && (cloud.workCount ?? 0) <= 1 ? savedWorkIdentity(cloud) : null)
  try { href = readerWorkUrl(reader?.url ?? (snapshot?.readers[0]?.url || import.meta.env.VITE_READER_URL || hostedReaderUrl), targetWork ?? cloud!.id, targetWork ? 'work' : 'book', chapter) } catch { return <p className="field-help">Reconnect this reader to update its URL.</p> }
  if (variant === 'spine') {
    const label = `Read Chapter ${chapter ?? 1} in EPUB`
    return <Tooltip description={label}>{id => <a className="spine-action" href={href} target="_blank" rel="noopener noreferrer" aria-label={label} aria-describedby={id}><BookOpen size={16} aria-hidden="true" /></a>}</Tooltip>
  }
  const link = (descriptionId?: string) => <a className="button secondary" href={href} aria-describedby={descriptionId}>{variant === 'details' ? <><span aria-hidden="true">▤</span>Unfolded</> : reader ? 'Read EPUB' : 'Open in Reader'}</a>
  return <div className="form-actions reader-work-actions">{variant === 'details' ? <Tooltip description="Open in archives unfolded EPUB reader">{id => link(id)}</Tooltip> : link()}{reports.length > 1 && <label>Open in Reader<select value={reader?.id ?? ''} onChange={event => { const next = new URLSearchParams(readerId); next.set('reader', event.target.value); setReaderId(next, { replace: true }) }}>{reports.map(reader => <option key={reader.id} value={reader.id}>{reader.name}</option>)}</select></label>}</div>
}
