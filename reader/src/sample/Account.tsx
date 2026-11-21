import { useState } from 'react'
import { ReaderSection } from '../ReaderSettings'

export function SampleReaderAccount({ title, asPage, onClose, onSignOut }: { title: string; asPage?: boolean; onClose: () => void; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <ReaderSection title={title} page={asPage} busy={busy} onClose={onClose}><p><strong>Sample</strong> · Local Sample Account</p><p>Books, reading progress, notes and preferences stay in this browser’s sample library. Cloud storage, organizer sync and Calibre pairing require the regular reader.</p><p>Sign in again with username <strong>Sample</strong> and password <strong>123</strong>.</p><button className="button secondary" disabled={busy} onClick={() => { setBusy(true); void onSignOut().catch(error => setError(String(error))).finally(() => setBusy(false)) }}>{busy ? 'Logging Out…' : 'Log Out'}</button>{error && <p role="alert">{error}</p>}</ReaderSection>
}
