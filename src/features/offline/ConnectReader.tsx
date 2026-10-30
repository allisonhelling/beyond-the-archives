import { useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'
import { readPublicConfig } from '../../lib/config'
import { hostedReaderUrl, readerBaseUrl, readerPairingUrl } from '../../lib/reader-connection'

export function ConnectReader() {
  const { authenticated } = useAuth()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [href, setHref] = useState('')
  async function connect() {
    if (!supabase || !authenticated || sampleMode || busy) return
    const config = readPublicConfig(import.meta.env)
    let target: URL
    try {
      if (!config) throw new Error('Organizer connection settings are unavailable.')
      target = readerBaseUrl(import.meta.env.VITE_READER_URL || hostedReaderUrl)
    } catch { setMessage('The reader URL or organizer connection settings are unavailable.'); return }
    // Open during the click so browsers can allow the new tab, then detach its opener.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    setBusy(true); setMessage(''); setHref('')
    try {
      const { data, error } = await supabase.rpc('manage_userscript_device', { p_action: 'create', p_name: 'My Reader' })
      if (error) throw error
      const code = (data as { code: string }).code
      if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('Invalid pairing code.')
      const url = readerPairingUrl(target.href, { ...config, code })
      if (tab && !tab.closed) tab.location.replace(url)
      else setHref(url)
      setMessage('The reader will connect automatically. Open the link within 5 minutes. Creating another pairing code replaces this unused code.')
    } catch {
      tab?.close()
      setMessage('Could not connect the reader. Check your connection and sign-in, then try again.')
    } finally { setBusy(false) }
  }
  return <div><div className="form-actions"><button className="button secondary" disabled={busy || sampleMode || !authenticated || !navigator.onLine} onClick={() => void connect()}>{busy ? 'Connecting Reader…' : 'Connect Reader'}</button>{href && <a className="button secondary" href={href} target="_blank" rel="noreferrer">Open Reader</a>}</div>{message && <p role="status" className="muted">{message}</p>}</div>
}
