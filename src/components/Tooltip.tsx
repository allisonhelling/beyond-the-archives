import { createPortal } from 'react-dom'
import { mobileLayoutWidth } from '../lib/use-layout'
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Tooltip({ description, children, placement = 'top', pinOnClick = false, portal = false, info = false }: { description: ReactNode; info?: boolean; placement?: 'top' | 'bottom'; pinOnClick?: boolean; portal?: boolean; children: (descriptionId: string, pinned: boolean) => ReactNode }) {
  const id = useId()
  const [visible, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = visible || pinned
  const anchor = useRef<HTMLSpanElement>(null), tooltip = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState({ x: 0, y: 0 })
  const [resolvedPlacement, setPlacement] = useState(placement)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [previewFrame, setPreviewFrame] = useState<HTMLIFrameElement | null>(null)
  useLayoutEffect(() => {
    const frame = anchor.current?.ownerDocument.defaultView?.frameElement
    if (frame?.classList.contains('viewport-preview-frame')) {
      setPreviewFrame(frame as HTMLIFrameElement)
      setPortalRoot(frame.closest('dialog') ?? frame.ownerDocument.body)
    } else if (portal) setPortalRoot(anchor.current?.closest('dialog') ?? anchor.current?.ownerDocument.body ?? document.body)
  }, [portal])
  useLayoutEffect(() => {
    if (!open) return
    function position() {
      if (!anchor.current || !tooltip.current) return
      const doc = anchor.current.ownerDocument
      const viewport = doc.defaultView ?? window
      const activePlacement = placement === 'top' && viewport.innerWidth <= mobileLayoutWidth && anchor.current.closest('.story-details-page:not(.series-details-page)') ? 'bottom' : placement
      setPlacement(activePlacement)
      const dialog = anchor.current.closest('dialog')?.getBoundingClientRect()
      const left = Math.max(8, (dialog?.left ?? 0) + 8)
      const right = Math.min(viewport.innerWidth - 8, (dialog?.right ?? viewport.innerWidth) - 8)
      tooltip.current.style.setProperty('--tooltip-boundary-width', `${right - left}px`)
      const box = anchor.current.getBoundingClientRect()
      const { width, height } = previewFrame ? { width: tooltip.current.offsetWidth, height: tooltip.current.offsetHeight } : tooltip.current.getBoundingClientRect()
      const centered = box.left + box.width / 2 - width / 2
      const top = activePlacement === 'top' ? box.top - height - 6 : box.bottom + 6
      const boundedTop = Math.max(dialog?.top ?? 0, 0) + 8
      const bottom = Math.min(dialog?.bottom ?? viewport.innerHeight, viewport.innerHeight) - 8
      if (info && height <= bottom - boundedTop) tooltip.current.style.removeProperty('position')
      const y = dialog || portal ? Math.max(boundedTop, Math.min(top, bottom - height)) : top
      const x = Math.max(left, Math.min(centered, right - width))
      if (info && portal && !previewFrame && height > bottom - boundedTop) {
        // Let long help expand into the page/dialog's scrollable content.
        tooltip.current.style.position = 'absolute'
        const parent = tooltip.current.offsetParent as HTMLElement | null
        const root = !parent || parent === doc.body || parent === doc.documentElement
        const origin = parent?.getBoundingClientRect()
        setShift({
          x: root ? x + viewport.scrollX : x - origin!.left + parent!.scrollLeft - parent!.clientLeft,
          y: root ? box.bottom + 6 + viewport.scrollY : box.bottom + 6 - origin!.top + parent!.scrollTop - parent!.clientTop,
        })
      } else if (previewFrame) {
        // Keep the same iframe-space placement; only escape its clipping boundary.
        const frame = previewFrame.getBoundingClientRect(), scale = frame.width / previewFrame.offsetWidth
        tooltip.current.style.setProperty('--tooltip-preview-scale', String(scale))
        setShift({ x: frame.left + x * scale, y: frame.top + y * scale })
      } else setShift({ x: portal ? x : x - centered, y: portal ? y : y - top })
    }
    const windows = new Set<Window>([window])
    const previewWindow = anchor.current?.ownerDocument.defaultView
    if (previewWindow) windows.add(previewWindow)
    position(); windows.forEach(view => { view.addEventListener('resize', position); view.addEventListener('scroll', position, true) })
    return () => { windows.forEach(view => { view.removeEventListener('resize', position); view.removeEventListener('scroll', position, true) }) }
  }, [open, description, placement, portal, previewFrame, info])
  const content = <span ref={tooltip} id={previewFrame ? `${id}-preview` : id} role="tooltip" data-portal={portal || Boolean(previewFrame) || undefined} data-preview-portal={Boolean(previewFrame) || undefined} className={`action-tooltip-content${info ? ' info-tooltip-content' : ''}`} style={{ '--tooltip-shift': `${shift.x}px`, '--tooltip-y-shift': `${shift.y}px` } as CSSProperties} hidden={!open}>{description}</span>
  return <span ref={anchor} className={`action-tooltip${info ? ' info-tooltip' : ''}`} data-placement={resolvedPlacement} onClick={pinOnClick ? event => { if (event.target instanceof Element && event.target.closest('button')) { setPinned(!pinned); setOpen(false) } } : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setPinned(false); event.stopPropagation() } }}>
    {children(id, pinned)}
    {previewFrame && <span id={id} className="sr-only">{description}</span>}
    {portal || previewFrame ? createPortal(content, portalRoot ?? document.body) : content}
  </span>
}
