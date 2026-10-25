import { useSyncExternalStore } from 'react'

export type DisplayLayout = 'mobile' | 'desktop'
export const mobileLayoutWidth = 1100
const subscribe = (listener: () => void) => { window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }
export function useLayout(): DisplayLayout {
 return useSyncExternalStore(subscribe, () => window.innerWidth <= mobileLayoutWidth ? 'mobile' : 'desktop', () => 'desktop')
}
