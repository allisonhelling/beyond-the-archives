import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export function UndoNotice({ id, message, dismissLabel = 'Dismiss Undo Notification', durationMs = 120_000, undoLabel = 'Undo', onUndo, onDismiss }: {
  id: string; message: string; dismissLabel?: string; durationMs?: number; undoLabel?: string
  onUndo: () => Promise<void>; onDismiss: (id: string) => void
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => onDismiss(id), durationMs); return () => window.clearTimeout(timer) }, [id, durationMs, onDismiss])
  async function undo() {
    setBusy(true); setError('')
    try { await onUndo(); onDismiss(id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not undo. Please try again.') }
    finally { setBusy(false) }
  }
  return <div className="undo-notice">
    <p role="status">{message}</p>
    <button className="undo-notice-action" disabled={busy} onClick={() => void undo()}>{busy ? 'Undoing…' : undoLabel}</button>
    <button className="undo-notice-dismiss" aria-label={dismissLabel} onClick={() => onDismiss(id)}><X size={18} aria-hidden="true" /></button>
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>
}
