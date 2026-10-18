import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Dialog({ title, children, onClose, busy = false, initialFocusRef, className = '', describedBy }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>; className?: string; describedBy?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    initialFocusRef?.current?.focus()
    return () => element?.close()
  }, [initialFocusRef])
  function close() { dialog.current?.close(); onClose() }
  return createPortal(<dialog ref={dialog} className={`confirmation-dialog ${className}`} aria-labelledby={titleId} aria-describedby={describedBy} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <div className="confirmation-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    {children}
  </dialog>, document.body)
}
