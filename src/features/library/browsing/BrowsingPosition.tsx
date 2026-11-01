import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { isFilterNavigation } from './browsing'

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
    const browsing = /^\/(reading|library|series\/|authors\/)/.test(path)
    const returning = action === 'POP' || /^\/(stories|series|authors)\//.test(previousRoute.current)
    const preserve = action !== 'POP' && browsing && isFilterNavigation(previousRoute.current, path)
    previousRoute.current = path
    const saved = returning && !preserve ? positions.current.get(path) : undefined
    let lastPosition = saved ?? { y: window.scrollY, focus: null }
    let restoring = Boolean(saved && browsing)
    function remember() {
      // Loading results can temporarily clamp the viewport to a shorter page.
      // Keep the saved destination until restoration finishes or the user scrolls.
      if (restoring) return
      const focused = document.activeElement
      lastPosition = { y: window.scrollY, focus: focused instanceof HTMLElement ? focused.id || null : null }
    }
    let frame = 0, stopped = false, attempts = 0
    function restore() {
      if (stopped) return
      if (location.hash && !preserve) {
        let id = location.hash.slice(1)
        try { id = decodeURIComponent(id) } catch { /* Keep malformed fragment text literal. */ }
        document.getElementById(id)?.scrollIntoView()
        return
      }
      const pending = document.querySelector('[data-results-loading="true"]')
      if (saved && browsing) {
        window.scrollTo(0, saved.y)
        if (saved.focus) document.getElementById(saved.focus)?.focus({ preventScroll: true })
        if ((pending || saved.focus && !document.getElementById(saved.focus) || document.documentElement.scrollHeight < saved.y + window.innerHeight) && attempts++ < 900) {
          frame = requestAnimationFrame(restore)
          return
        }
        restoring = false
      } else if (!preserve) window.scrollTo(0, 0)
    }
    // Result data may arrive after this route mounts; retry until it has height.
    frame = requestAnimationFrame(restore)
    const cancel = (event?: Event) => { stopped = true; cancelAnimationFrame(frame); if (event) { restoring = false; remember() } }
    window.addEventListener('wheel', cancel, { once: true, passive: true })
    window.addEventListener('touchstart', cancel, { once: true, passive: true })
    // Returning focus must yield as soon as the user starts another action.
    window.addEventListener('pointerdown', cancel, true)
    window.addEventListener('keydown', cancel, true)
    // Capture while this page is still present. Reading scrollY during route
    // cleanup can see a position clamped by the shorter destination page.
    window.addEventListener('scroll', remember, { passive: true })
    window.addEventListener('click', cancel, true)
    window.addEventListener('focusin', remember)
    const cache = positions.current
    return () => {
      cancel(); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel)
      window.removeEventListener('pointerdown', cancel, true)
      window.removeEventListener('keydown', cancel, true)
      window.removeEventListener('scroll', remember)
      window.removeEventListener('click', cancel, true)
      window.removeEventListener('focusin', remember)
      cache.set(path, lastPosition)
      while (cache.size > 40) cache.delete(cache.keys().next().value!)
    }
  }, [path, action, location.hash, location.pathname])
  return null
}
