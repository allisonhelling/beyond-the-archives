import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'

type Drag = { id: string; target: string | null; x: number; y: number }

export function useCollectionDrag(shelfRef: RefObject<HTMLDivElement | null>, enabled: boolean, onMove?: (id: string, target: string) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    const shelf = shelfRef.current
    if (!shelf || !enabled) return
    let pending: { id: string; pointerId: number; slot: HTMLElement; startX: number; startY: number; grabX: number; grabY: number; active: boolean } | null = null
    let pointer = { x: 0, y: 0 }, target: string | null = null
    let hold: ReturnType<typeof setTimeout> | undefined, frame = 0

    function update() {
      if (!pending?.active) return
      const bounds = shelf!.getBoundingClientRect()
      let nearest: HTMLElement | null = null, distance = Infinity
      if (pointer.x >= bounds.left && pointer.x <= bounds.right && pointer.y >= bounds.top && pointer.y <= bounds.bottom) {
        for (const slot of shelf!.querySelectorAll<HTMLElement>('.collection-shelf-row > *')) {
          const rect = slot.getBoundingClientRect()
          const gap = Math.hypot(pointer.x - Math.max(rect.left, Math.min(pointer.x, rect.right)), pointer.y - Math.max(rect.top, Math.min(pointer.y, rect.bottom)))
          if (gap < distance) { distance = gap; nearest = slot }
        }
      }
      target = nearest?.dataset.collectionId ?? null
      const source = pending.slot.getBoundingClientRect()
      const next = { id: pending.id, target, x: pointer.x - pending.grabX - source.left, y: pointer.y - pending.grabY - source.top }
      setDrag(previous => previous?.id === next.id && previous.target === next.target && previous.x === next.x && previous.y === next.y ? previous : next)
    }
    function scroll() {
      if (!pending?.active) return
      const edge = 64
      const delta = pointer.y < edge ? -Math.min(14, (edge - pointer.y) / 4) : pointer.y > innerHeight - edge ? Math.min(14, (pointer.y - innerHeight + edge) / 4) : 0
      if (delta) window.scrollBy(0, delta)
      update()
      frame = requestAnimationFrame(scroll)
    }
    function activate() {
      if (!pending || pending.active) return
      pending.active = true
      shelf!.setPointerCapture(pending.pointerId)
      update(); frame = requestAnimationFrame(scroll)
    }
    function finish(commit: boolean) {
      clearTimeout(hold); cancelAnimationFrame(frame)
      if (!pending) return
      const { id, active, pointerId } = pending
      pending = null
      if (shelf!.hasPointerCapture(pointerId)) shelf!.releasePointerCapture(pointerId)
      if (active) {
        suppressClick.current = true
        setTimeout(() => { suppressClick.current = false }, 0)
        setDrag(null)
        if (commit && target && target !== id) onMove?.(id, target)
      }
    }
    function down(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0 || pending) return
      const button = (event.target as Element).closest<HTMLButtonElement>('.collection-spine')
      const slot = button?.closest<HTMLElement>('[data-collection-id]')
      if (!button || button.disabled || !slot) return
      suppressClick.current = false
      const rect = button.getBoundingClientRect()
      pointer = { x: event.clientX, y: event.clientY }
      pending = { id: slot.dataset.collectionId!, pointerId: event.pointerId, slot, startX: pointer.x, startY: pointer.y, grabX: pointer.x - rect.left, grabY: pointer.y - rect.top, active: false }
      hold = setTimeout(activate, 180)
    }
    function move(event: PointerEvent) {
      if (!pending || event.pointerId !== pending.pointerId) return
      pointer = { x: event.clientX, y: event.clientY }
      if (Math.hypot(pointer.x - pending.startX, pointer.y - pending.startY) > 6) activate()
      update()
      if (pending.active) event.preventDefault()
    }
    function up(event: PointerEvent) { if (event.pointerId === pending?.pointerId) { update(); finish(true) } }
    function cancel(event: PointerEvent) { if (event.pointerId === pending?.pointerId) finish(false) }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { if (pending) { event.preventDefault(); finish(false) }; return }
      if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      const slot = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-collection-id]') : null
      if (!slot || !shelf!.contains(slot)) return
      event.preventDefault()
      const slots = [...shelf!.querySelectorAll<HTMLElement>('[data-collection-id]')]
      const destination = slots[slots.indexOf(slot) + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (destination) onMove?.(slot.dataset.collectionId!, destination.dataset.collectionId!)
    }
    shelf.addEventListener('pointerdown', down)
    shelf.addEventListener('lostpointercapture', cancel)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', blur)
    function blur() { finish(false) }
    return () => {
      finish(false)
      shelf.removeEventListener('pointerdown', down)
      shelf.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', blur)
    }
  }, [enabled, onMove, shelfRef])
  function preventDragClick(event: MouseEvent) {
    if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
  }
  return { drag, preventDragClick }
}
