import { useEffect, useRef } from 'react'

// Share outside-click, outside-focus, and Escape dismissal across menus and suggestions.
export function useDismissible<T extends HTMLElement>(open: boolean, close: () => void, { outsideEvent = 'pointerdown', dismissOnFocus = true }: { outsideEvent?: 'pointerdown' | 'click'; dismissOnFocus?: boolean } = {}) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    function outside(event: Event) {
      if (ref.current && !event.composedPath().includes(ref.current)) close()
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') close() }
    document.addEventListener(outsideEvent, outside, true)
    if (dismissOnFocus) document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener(outsideEvent, outside, true)
      if (dismissOnFocus) document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open, close, outsideEvent, dismissOnFocus])
  return ref
}
