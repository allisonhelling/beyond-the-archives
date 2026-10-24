import type { SeriesPreview } from './urls'
import { useCallback, useState, useSyncExternalStore } from 'react'

export type SeriesImportBehavior = 'choose' | 'all'
const key = 'between-chapters:series-import-behavior'
const changeEvent = 'series-import-behavior-change'
function snapshot(): SeriesImportBehavior {
 try { return localStorage.getItem(key) === 'all' ? 'all' : 'choose' } catch { return 'choose' }
}
function subscribe(listener: () => void) {
 window.addEventListener('storage', listener)
 window.addEventListener(changeEvent, listener)
 return () => { window.removeEventListener('storage', listener); window.removeEventListener(changeEvent, listener) }
}
export function saveSeriesImportBehavior(value: SeriesImportBehavior) {
 localStorage.setItem(key, value)
 window.dispatchEvent(new Event(changeEvent))
}
export function useSeriesImportBehavior(initialBehavior?: SeriesImportBehavior) {
 const defaultBehavior = useSyncExternalStore(subscribe, snapshot, () => 'choose' as const)
 const [previewCache, setPreviewCache] = useState(() => new Map<number, SeriesPreview>())
 const cachePreview = useCallback((preview: SeriesPreview) => setPreviewCache(current => new Map(current).set(preview.seriesId, preview)), [])
 const [override, setOverride] = useState(() => initialBehavior !== undefined && initialBehavior !== snapshot())
 const behavior: SeriesImportBehavior = override ? defaultBehavior === 'all' ? 'choose' : 'all' : defaultBehavior
 return { defaultBehavior, behavior, override, setOverride, previewCache, cachePreview, reset() { setOverride(false); setPreviewCache(new Map()) } }
}
