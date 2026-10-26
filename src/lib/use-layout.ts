import { useSyncExternalStore } from 'react'

export type DisplayLayout = 'mobile' | 'desktop'
export const mobileLayoutWidth = 1100
export const getLayout = (): DisplayLayout => window.innerWidth <= mobileLayoutWidth ? 'mobile' : 'desktop'
const subscribe = (listener: () => void) => { window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }
export function useLayout(): DisplayLayout {
 return useSyncExternalStore(subscribe, getLayout, () => 'desktop')
}
