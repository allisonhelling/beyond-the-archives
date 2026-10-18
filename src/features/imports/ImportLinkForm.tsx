import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLibrary } from '../library/LibraryProvider'
import { sampleMode } from '../../lib/sample-mode'
import { classifyUrl, parseWorkUrl } from './urls'
import { importHistory, submitImport } from './repository'

type ImportItem = Awaited<ReturnType<typeof importHistory>>['items'][number]

export function ImportLinkForm() {
  const { refresh } = useLibrary()
  const navigate = useNavigate()
  const [url, setUrl] = useState(''), [batch, setBatch] = useState(''), [item, setItem] = useState<ImportItem>()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const complete = !!item && !['pending', 'processing'].includes(item.status)
  useEffect(() => {
    if (!batch) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function check() {
      let finished = false
      try {
        const history = await importHistory(batch)
        if (!alive) return
        const next = history.items[0]
        finished = !!next && !['pending', 'processing'].includes(next.status)
        if (next?.entry_id) {
          await refresh()
          if (alive) navigate(`/stories/${next.entry_id}`, { replace: true })
          return
        }
        if (alive) { setItem(next); setError('') }
      } catch { finished = false; if (alive) setError('Could not check this import. Retrying shortly; you can also view it in import history.') }
      if (alive && !finished) timer = setTimeout(() => void check(), 5000)
    }
    void check()
    return () => { alive = false; clearTimeout(timer) }
  }, [batch, refresh, navigate])
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (classifyUrl(url).kind === 'series') { navigate('/imports', { state: { seriesUrl: url.trim() } }); return }
      parseWorkUrl(url)
      const id = await submitImport(url.trim())
      if (!id) throw new Error('No AO3 work was found in that link.')
      setBatch(id)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import this fic.') }
    finally { setBusy(false) }
  }
  return <>
    {sampleMode ? <section className="settings-card"><p>Importing requires the connected application.</p><Link className="clickable-text" to="/add?import=manual">Add a story manually</Link></section> : !batch ? <form className="story-form settings-card import-link-form" onSubmit={event => void submit(event)}>
      <label>AO3 work or series link<input type="url" required value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="https://archiveofourown.org/works/123" /></label>
      <button className="button primary" disabled={busy}>{busy ? 'Importing…' : 'Import from link'}</button>
    </form> : <>
      {!complete ? <section className="settings-card"><p role="status">Retrieving metadata… Your fic is saved; this may take a few minutes. If using the extension, keep your browser running and complete any AO3 confirmation in its requested tab.</p><Link className="clickable-text" to="/imports">View import history</Link></section> : <section className="settings-card" aria-label="Import result">
        <h2>Import result</h2>
        <p role="status">No saved fic was available for this import.</p>
        {item?.error_message && <p>{item.error_message}</p>}
        <Link className="clickable-text" to="/imports">View import history</Link>
      </section>}
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </>
}
