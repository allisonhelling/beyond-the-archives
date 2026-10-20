import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// A session-local bounded map avoids persisting private URLs after sign-out.
export function BrowsingPosition() {
  const location = useLocation(), action = useNavigationType()
  const positions = useRef(new Map<string, { y: number; focus: string | null }>())
  const previousRoute = useRef('')
  const path = location.pathname + location.search + location.hash
  useLayoutEffect(() => {
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => { history.scrollRestoration = previous }
  }, [])
  useLayoutEffect(() => {
    const browsing = /^\/(reading|library|series\/)/.test(path)
    const returning = action === 'POP' || /^\/(stories|series)\//.test(previousRoute.current)
    previousRoute.current = location.pathname
    const saved = returning ? positions.current.get(path) : undefined
    let frame = 0, stopped = false, attempts = 0
    function restore() {
      if (stopped) return
      if (location.hash) {
        let id = location.hash.slice(1)
        try { id = decodeURIComponent(id) } catch { /* Keep malformed fragment text literal. */ }
        document.getElementById(id)?.scrollIntoView()
        return
      }
      const pending = document.querySelector('[data-results-loading="true"]')
      if (saved && browsing) {
        window.scrollTo(0, saved.y)
        if (saved.focus) document.getElementById(saved.focus)?.focus({ preventScroll: true })
        if ((pending || saved.focus && !document.getElementById(saved.focus) || document.documentElement.scrollHeight < saved.y + window.innerHeight) && attempts++ < 900) frame = requestAnimationFrame(restore)
      } else window.scrollTo(0, 0)
    }
    // Result data may arrive after this route mounts; retry until it has height.
    frame = requestAnimationFrame(restore)
    const cancel = () => { stopped = true; cancelAnimationFrame(frame) }
    window.addEventListener('wheel', cancel, { once: true, passive: true })
    window.addEventListener('touchstart', cancel, { once: true, passive: true })
    const cache = positions.current
    return () => {
      cancel(); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel)
      const focused = document.activeElement
      cache.set(path, { y: window.scrollY, focus: focused instanceof HTMLElement ? focused.id || null : null })
      while (cache.size > 40) cache.delete(cache.keys().next().value!)
    }
  }, [path, action, location.hash, location.pathname])
  return null
}
