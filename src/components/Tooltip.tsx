import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Tooltip({ description, children, placement = 'top' }: { description: string; placement?: 'top' | 'bottom'; children: (descriptionId: string) => ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null), tooltip = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    if (!open) return
    function position() {
      if (!anchor.current || !tooltip.current) return
      const box = anchor.current.getBoundingClientRect(), width = tooltip.current.getBoundingClientRect().width
      const centered = box.left + box.width / 2 - width / 2
      setShift(Math.max(8, Math.min(centered, window.innerWidth - width - 8)) - centered)
    }
    position(); window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [open, description])
  return <span ref={anchor} className="action-tooltip" data-placement={placement} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation() } }}>
    {children(id)}
    <span ref={tooltip} id={id} role="tooltip" className="action-tooltip-content" style={{ '--tooltip-shift': `${shift}px` } as CSSProperties} hidden={!open}>{description}</span>
  </span>
}
