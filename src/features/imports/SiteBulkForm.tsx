import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pagination } from '../library/browsing/Pagination'
import { bulkModes, discoverPastedLinks, eligibleBulkLink, previewBulkLinks, type BulkLink, type BulkMode } from './bulk-links'
import { classifyUrl } from './urls'
import { loadSiteMappings, submitSiteImport } from './site-bulk-repository'
import { beginPageLinkDiscovery, readSitePreview } from './extension'
import { sourcePage, type SiteRequest } from './site-mapping'
import { sampleMode } from '../../lib/sample-mode'

const labels: Record<BulkLink['kind'], string> = {
 ao3: 'AO3 Work', series: 'AO3 Series', recognized: 'Recognized Story URL', candidate: 'Unverified Candidate',
 duplicate: 'Duplicate', unsafe: 'Invalid or Unsafe', unsupported: 'Unsupported URL',
}
const pageSize = 25

export function SiteBulkForm({ onQueued, onAo3Links }: { onQueued: (batch: string) => void; onAo3Links: (text: string) => void }) {
 const [pageUrl, setPageUrl] = useState(''), [scan, setScan] = useState<SiteRequest>()
 const [text, setText] = useState(''), [mode, setMode] = useState<BulkMode>('recognized')
 const [preview, setPreview] = useState<BulkLink[]>(), [page, setPage] = useState(1)
 const [checkpoint, setCheckpoint] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
 const siteLinks = preview?.filter(link => link.candidate && eligibleBulkLink(link, mode)) ?? []
 const ao3 = preview?.filter(link => link.kind === 'ao3' || link.kind === 'series') ?? []
 const counts = Object.entries(labels).map(([key, label]) => ({ label, count: preview?.filter(link => link.kind === key).length ?? 0 }))
 async function run(action: () => Promise<void>) {
  setBusy(true); setError(''); setMessage('')
  try { await action() }
  catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare website links.') }
  finally { setBusy(false) }
 }
 async function inspect(values = discoverPastedLinks(text)) {
  if (!values.length || values.length > 2000) throw new Error('Paste 1–2,000 links or candidates.')
  setPreview(previewBulkLinks(values, await loadSiteMappings()))
  setPage(1); setCheckpoint(crypto.randomUUID())
 }
 if (sampleMode) return <section className="settings-card"><h2>Import Website Links</h2><p>Sign in to queue website links and resume count reviews.</p></section>
 return <section className="settings-card">
  <form className="story-form" onSubmit={event => { event.preventDefault(); void run(() => inspect()) }}>
   <h2>Import Website Links</h2>
   <label>Source Page URL<input inputMode="url" value={pageUrl} onChange={event => { setPageUrl(event.target.value); setScan(undefined) }} disabled={busy} /></label>
   <div className="form-actions">
    <button type="button" className="button secondary" disabled={busy || !pageUrl.trim()} onClick={() => void run(async () => {
     const url = sourcePage(pageUrl)
     if (!url || new URL(url).origin === window.location.origin) throw new Error('Enter a public website page URL, or paste links below.')
     setScan(await beginPageLinkDiscovery(url))
     setMessage('Click the companion icon on the source page, then select Load Discovered Links here.')
    })}>Open Source Page</button>
    {scan && <button type="button" className="button secondary" disabled={busy} onClick={() => void run(async () => {
     const response = await readSitePreview(scan)
     if (response.code === 'PERMISSION_REQUIRED') { setMessage('Click the companion icon on the source page first.'); return }
     if (response.code !== 'OK' || !response.links) { setScan(undefined); throw new Error('Could not scan this source page. Paste the links you want to review.') }
     setScan(undefined); setText(response.links.join('\n')); await inspect(response.links)
    })}>Load Discovered Links</button>}
   </div>
   <label>Links<textarea rows={8} maxLength={4_000_000} value={text} onChange={event => { setText(event.target.value); setPreview(undefined); setCheckpoint('') }} disabled={busy} /></label>
   <label>Bulk Mode<select value={mode} disabled={busy} onChange={event => { setMode(event.target.value as BulkMode); setCheckpoint(crypto.randomUUID()) }}>{Object.entries(bulkModes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
   <p>Recognized links match AO3, a FanFiction.net story URL, or a saved story URL pattern. Website imports require story evidence on the page. <Link className="clickable-text" to="/settings#settings-site-mappings">Manage Site Mappings</Link></p>
   <div className="form-actions"><button className="button secondary" disabled={busy || !text.trim()}>Preview Links</button></div>
  </form>
  {preview && <>
   <p role="status">{counts.map(({ label, count }) => `${label}: ${count}`).join(' · ')}</p>
   <Pagination page={page} pages={Math.max(1, Math.ceil(preview.length / pageSize))} size={pageSize} total={preview.length} onPage={setPage} itemLabel="links" />
   <div className="import-results"><table><caption>Link Preview</caption><thead><tr><th>URL</th><th>Discovery Result</th></tr></thead><tbody>{preview.slice((page - 1) * pageSize, page * pageSize).map((link, index) => <tr key={index}><td className="url-text">{link.url}</td><td>{labels[link.kind]}</td></tr>)}</tbody></table></div>
   <div className="form-actions">
    <button className="button primary" disabled={busy || !siteLinks.length || !checkpoint} onClick={() => void run(async () => {
     const id = await submitSiteImport(checkpoint, siteLinks)
     setCheckpoint(''); setMessage('Batch queued. Open each pending source below and click the companion icon to start retrieval.')
     onQueued(id)
    })}>Queue {siteLinks.length} Website {siteLinks.length === 1 ? 'Link' : 'Links'}</button>
    {ao3.length > 0 && <button className="button secondary" disabled={busy} onClick={() => onAo3Links(discoverPastedLinks(text).filter(value => ['valid', 'series'].includes(classifyUrl(value).kind)).join('\n'))}>Review AO3 Links</button>}
   </div>
  </>}
  {message && <p role="status">{message}</p>}
  {error && <p role="alert" className="error-message">{error}</p>}
 </section>
}
