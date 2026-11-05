import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ActivityIndicator } from './ActivityIndicator'

let scrollLocks = 0
let restorePageScroll: (() => void) | undefined
function lockPageScroll() {
 if (scrollLocks++ === 0) {
  const body = document.body, y = window.scrollY, x = window.scrollX
  const saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow }
  Object.assign(body.style, { position: 'fixed', top: `${-y}px`, width: '100%', overflow: 'hidden' })
  restorePageScroll = () => { Object.assign(body.style, saved); window.scrollTo(x, y) }
 }
 return () => { if (--scrollLocks === 0) { restorePageScroll?.(); restorePageScroll = undefined } }
}

export function Dialog({ title, children, onClose, busy = false, initialFocusRef, className = '', describedBy, titleAction, topEdgeLabel }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>; className?: string; describedBy?: string; titleAction?: ReactNode; topEdgeLabel?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => {
    const element = dialog.current
    const unlock = lockPageScroll()
    element?.showModal()
    initialFocusRef?.current?.focus()
    return () => { element?.close(); unlock() }
  }, [initialFocusRef])
  function close() { dialog.current?.close(); onClose() }
  return createPortal(<dialog ref={dialog} className={`confirmation-dialog ${className}`} aria-labelledby={titleId} aria-describedby={describedBy} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    {topEdgeLabel && <button className="dialog-top-target" aria-label={topEdgeLabel} onClick={() => dialog.current?.scrollTo({ top: 0, behavior: 'instant' })} />}
    <div className="confirmation-heading"><div className="dialog-title"><h2 id={titleId}>{title}</h2>{titleAction}</div><button type="button" className="icon-button" aria-label="Close Dialog" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <ActivityIndicator inline busy={busy} />
    {children}
  </dialog>, document.body)
}
