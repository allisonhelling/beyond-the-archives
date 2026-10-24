import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Dialog({ title, children, onClose, busy = false, initialFocusRef, className = '', describedBy, titleAction }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>; className?: string; describedBy?: string; titleAction?: ReactNode
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
    <div className="confirmation-heading"><div className="dialog-title"><h2 id={titleId}>{title}</h2>{titleAction}</div><button type="button" className="icon-button" aria-label="Close Dialog" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    {children}
  </dialog>, document.body)
}
