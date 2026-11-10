import { useState } from 'react'
import { useActivity } from '../lib/use-activity'

/** Both local previews publish/reset through the same explicit workflow. */
export function SampleDataControls({ title, description, onUpdate, onReset }: { title: string; description: string; onUpdate: () => Promise<void>; onReset: () => Promise<void> }) {
  const [busy, setBusy] = useState<'update' | 'reset' | null>(null), [message, setMessage] = useState(''), [error, setError] = useState('')
  useActivity(Boolean(busy), busy === 'update' ? 'Updating sample data…' : 'Resetting sample data…')
  async function run(action: 'update' | 'reset') {
    setBusy(action); setMessage(''); setError('')
    try { await (action === 'update' ? onUpdate() : onReset()); if (action === 'update') setMessage('Current library saved as the project’s default sample data.') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update sample data.') }
    finally { setBusy(null) }
  }
  return <aside className="sample-preview" aria-label="Local Sample Preview"><span><strong>{title}</strong> · {description}</span><button className="button secondary compact" disabled={Boolean(busy)} onClick={() => void run('update')}>{busy === 'update' ? 'Updating…' : 'Update Sample Data'}</button><button className="button secondary compact" disabled={Boolean(busy)} onClick={() => void run('reset')}>{busy === 'reset' ? 'Resetting…' : 'Reset Sample Data'}</button>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</aside>
}
