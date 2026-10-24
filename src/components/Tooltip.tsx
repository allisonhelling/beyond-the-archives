import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Tooltip({ description, children, placement = 'top', pinOnClick = false }: { description: string; placement?: 'top' | 'bottom'; pinOnClick?: boolean; children: (descriptionId: string) => ReactNode }) {
  const id = useId()
  const [visible, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = visible || pinned
  const anchor = useRef<HTMLSpanElement>(null), tooltip = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    if (!open) return
    function position() {
      if (!anchor.current || !tooltip.current) return
      const dialog = anchor.current.closest('dialog')?.getBoundingClientRect()
      const left = Math.max(8, (dialog?.left ?? 0) + 8)
      const right = Math.min(window.innerWidth - 8, (dialog?.right ?? window.innerWidth) - 8)
      tooltip.current.style.setProperty('--tooltip-boundary-width', `${right - left}px`)
      const box = anchor.current.getBoundingClientRect(), { width, height } = tooltip.current.getBoundingClientRect()
      const centered = box.left + box.width / 2 - width / 2
      const top = placement === 'top' ? box.top - height - 6 : box.bottom + 6
      const boundedTop = dialog ? Math.max(dialog.top + 8, Math.min(top, dialog.bottom - height - 8)) : top
      setShift({ x: Math.max(left, Math.min(centered, right - width)) - centered, y: boundedTop - top })
    }
    position(); window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [open, description, placement])
  return <span ref={anchor} className="action-tooltip" data-placement={placement} onClick={pinOnClick ? event => { if (event.target instanceof Element && event.target.closest('button')) { setPinned(!pinned); setOpen(false) } } : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setPinned(false); event.stopPropagation() } }}>
    {children(id)}
    <span ref={tooltip} id={id} role="tooltip" className="action-tooltip-content" style={{ '--tooltip-shift': `${shift.x}px`, '--tooltip-y-shift': `${shift.y}px` } as CSSProperties} hidden={!open}>{description}</span>
  </span>
}
