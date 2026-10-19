import { useId, useRef, useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'

export function ConfirmationDialog({ title, children, confirmLabel, onConfirm, onClose, pendingLabel = 'Removing…' }: {
  title: string; children: ReactNode; confirmLabel: ReactNode; onConfirm: () => Promise<void>; onClose: () => void; pendingLabel?: string
}) {
  const descriptionId = useId()
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function confirm() {
    setBusy(true); setError('')
    try { await onConfirm(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action. Please try again.') }
    finally { setBusy(false) }
  }
  return <Dialog title={title} onClose={onClose} busy={busy} initialFocusRef={cancelButton} describedBy={descriptionId}>
    <div id={descriptionId} className="confirmation-description">{children}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="form-actions"><button ref={cancelButton} className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? pendingLabel : confirmLabel}</button></div>
  </Dialog>
}
