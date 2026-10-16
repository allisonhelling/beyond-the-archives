import { useEffect, useRef } from 'react'

// Share outside-click, outside-focus, and Escape dismissal across menus and suggestions.
export function useDismissible<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    function outside(event: Event) {
      if (ref.current && !event.composedPath().includes(ref.current)) close()
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open, close])
  return ref
}
