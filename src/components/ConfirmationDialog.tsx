import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function ConfirmationDialog({ title, children, confirmLabel, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => Promise<void>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), descriptionId = useId()
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    cancelButton.current?.focus()
    return () => element?.close()
  }, [])
  function close() { dialog.current?.close(); onClose() }
  async function confirm() {
    setBusy(true); setError('')
    try { await onConfirm(); close() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete this action. Please try again.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <div className="confirmation-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close confirmation" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <div id={descriptionId} className="confirmation-description">{children}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="form-actions"><button ref={cancelButton} className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Removing…' : confirmLabel}</button></div>
  </dialog>
}
