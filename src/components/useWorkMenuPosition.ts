import { useLayoutEffect, type RefObject } from 'react'

/** Keep native work-action menus inside the viewport and above fixed navigation. */
export function useWorkMenuPosition(ref: RefObject<HTMLDetailsElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const details = ref.current, panel = details?.querySelector<HTMLElement>(':scope > .menu-surface')
    const trigger = details?.querySelector('summary'), view = details?.ownerDocument.defaultView
    if (!open || !panel || !trigger || !view) return
    const position = () => {
      const box = trigger.getBoundingClientRect(), menu = panel
      const navigation = details.ownerDocument.querySelector('.mobile-nav')?.getBoundingClientRect()
      const bottom = Math.min(view.innerHeight, navigation?.height ? navigation.top : view.innerHeight) - 8
      const above = Math.max(0, Math.min(box.top - 6, bottom) - 8)
      const below = Math.max(0, bottom - box.bottom - 6)
      const height = menu.scrollHeight + 2 * menu.clientTop
      const down = below >= height || below >= above
      const available = down ? below : above
      menu.style.setProperty('--work-menu-max-height', `${available}px`)
      menu.style.setProperty('--work-menu-top', `${Math.max(8, Math.min(down ? box.bottom + 6 : box.top - Math.min(height, available) - 6, bottom - Math.min(height, available)))}px`)
      const width = menu.getBoundingClientRect().width
      menu.style.setProperty('--work-menu-left', `${Math.max(8, Math.min(box.right - width, view.innerWidth - width - 8))}px`)
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(panel); observer.observe(trigger)
    view.addEventListener('resize', position); view.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      view.removeEventListener('resize', position); view.removeEventListener('scroll', position, true)
    }
  }, [ref, open])
}
