import { createContext, useContext, useSyncExternalStore } from 'react'

export type DisplayLayout = 'mobile' | 'desktop'
export const mobileLayoutWidth = 1100
export const LayoutWidthContext = createContext<number | undefined>(undefined)
export const getLayout = (width = mobileLayoutWidth): DisplayLayout => window.innerWidth <= width ? 'mobile' : 'desktop'
const subscribe = (listener: () => void) => { window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }
export function useLayout(width = mobileLayoutWidth): DisplayLayout {
 const previewWidth = useContext(LayoutWidthContext)
 return useSyncExternalStore(subscribe, () => previewWidth === undefined ? getLayout(width) : previewWidth <= width ? 'mobile' : 'desktop', () => 'desktop')
}
