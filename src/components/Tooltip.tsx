import { createPortal } from 'react-dom'
import { mobileLayoutWidth } from '../lib/use-layout'
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Tooltip({ description, children, placement = 'top', pinOnClick = false, portal = false }: { description: string; placement?: 'top' | 'bottom'; pinOnClick?: boolean; portal?: boolean; children: (descriptionId: string) => ReactNode }) {
  const id = useId()
  const [visible, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = visible || pinned
  const anchor = useRef<HTMLSpanElement>(null), tooltip = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState({ x: 0, y: 0 })
  const [resolvedPlacement, setPlacement] = useState(placement)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { if (portal) setPortalRoot(anchor.current?.closest('dialog') ?? anchor.current?.ownerDocument.body ?? document.body) }, [portal])
  useLayoutEffect(() => {
    if (!open) return
    function position() {
      if (!anchor.current || !tooltip.current) return
      const viewport = anchor.current.ownerDocument.defaultView ?? window
      const activePlacement = placement === 'top' && viewport.innerWidth <= mobileLayoutWidth && anchor.current.closest('.story-details-page:not(.series-details-page)') ? 'bottom' : placement
      setPlacement(activePlacement)
      const dialog = anchor.current.closest('dialog')?.getBoundingClientRect()
      const left = Math.max(8, (dialog?.left ?? 0) + 8)
      const right = Math.min(viewport.innerWidth - 8, (dialog?.right ?? viewport.innerWidth) - 8)
      tooltip.current.style.setProperty('--tooltip-boundary-width', `${right - left}px`)
      const box = anchor.current.getBoundingClientRect(), { width, height } = tooltip.current.getBoundingClientRect()
      const centered = box.left + box.width / 2 - width / 2
      const top = activePlacement === 'top' ? box.top - height - 6 : box.bottom + 6
      const boundedTop = Math.max(dialog?.top ?? 0, 0) + 8
      const bottom = Math.min(dialog?.bottom ?? viewport.innerHeight, viewport.innerHeight) - 8
      const y = dialog || portal ? Math.max(boundedTop, Math.min(top, bottom - height)) : top
      const x = Math.max(left, Math.min(centered, right - width))
      setShift({ x: portal ? x : x - centered, y: portal ? y : y - top })
    }
    position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open, description, placement, portal])
  const content = <span ref={tooltip} id={id} role="tooltip" data-portal={portal || undefined} className="action-tooltip-content" style={{ '--tooltip-shift': `${shift.x}px`, '--tooltip-y-shift': `${shift.y}px` } as CSSProperties} hidden={!open}>{description}</span>
  return <span ref={anchor} className="action-tooltip" data-placement={resolvedPlacement} onClick={pinOnClick ? event => { if (event.target instanceof Element && event.target.closest('button')) { setPinned(!pinned); setOpen(false) } } : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setPinned(false); event.stopPropagation() } }}>
    {children(id)}
    {portal ? createPortal(content, portalRoot ?? document.body) : content}
  </span>
}
