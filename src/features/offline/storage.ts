import { readerBaseUrl } from '../../lib/reader-connection'
import type { Story } from '../library/model'

export type ReaderReport = { id: string; name: string; url: string; reportedAt: string; works: string[] }
export type OfflineSnapshot = { connected?: boolean; userId: string; savedAt: string; readers: ReaderReport[]; stories: Story[] }
const key = 'bta:offline-hub:v1'
export const offlineCleared = 'bta:offline-cleared'
export function readOfflineSnapshot(): OfflineSnapshot | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as OfflineSnapshot | null
    if (value && typeof value.userId === 'string' && Array.isArray(value.readers) && Array.isArray(value.stories)) return value
  } catch { /* An unavailable cache must not prevent sign-in. */ }
}
export function saveOfflineSnapshot(snapshot: OfflineSnapshot) { localStorage.setItem(key, JSON.stringify(snapshot)) }
export function clearOfflineSnapshot() { localStorage.removeItem(key); window.dispatchEvent(new Event(offlineCleared)) }
export function readerWorkUrl(readerUrl: string, work: string | number): string {
  const url = readerBaseUrl(readerUrl)
  url.searchParams.set('work', String(work))
  return url.href
}
