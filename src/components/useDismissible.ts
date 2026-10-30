import { useEffect, useRef, type RefObject } from 'react'

// Share outside-click, outside-focus, and Escape dismissal across menus and suggestions.
export function useDismissible<T extends HTMLElement>(open: boolean, close: () => void, { outsideEvent = 'pointerdown', dismissOnFocus = true, additionalRefs }: { outsideEvent?: 'pointerdown' | 'click'; dismissOnFocus?: boolean; additionalRefs?: RefObject<HTMLElement | null>[] } = {}) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    let pointerActive = false
    const pointerStart = () => { pointerActive = true }, pointerEnd = () => { pointerActive = false }
    function outside(event: Event) {
      // Click dismissal must not collapse an inline panel before the pressed button receives its click.
      if (event.type === 'focusin' && outsideEvent === 'click' && pointerActive) return
      if (ref.current && !event.composedPath().includes(ref.current) && !additionalRefs?.some(extra => extra.current && event.composedPath().includes(extra.current))) close()
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') close() }
    if (outsideEvent === 'click' && dismissOnFocus) {
      document.addEventListener('pointerdown', pointerStart, true)
      document.addEventListener('pointerup', pointerEnd, true)
      document.addEventListener('pointercancel', pointerEnd, true)
    }
    document.addEventListener(outsideEvent, outside, true)
    if (dismissOnFocus) document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', pointerStart, true)
      document.removeEventListener('pointerup', pointerEnd, true)
      document.removeEventListener('pointercancel', pointerEnd, true)
      document.removeEventListener(outsideEvent, outside, true)
      if (dismissOnFocus) document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open, close, outsideEvent, dismissOnFocus, additionalRefs])
  return ref
}
