import { sampleMode } from '../../lib/sample-mode'
import { isLocalApp } from '../../lib/local-app'
import { localExtensionId } from './extension-config'
import { supabase } from '../../lib/supabase'
import type { Session } from '@supabase/supabase-js'

type ExtensionReply = { state?: LibrarySyncState | null; rows?: Record<string, string>[]; ok?: boolean; page?: { url: string; html: string }; error?: string }
type ExtensionRuntime = {
 lastError?: { message?: string }
 sendMessage(id: string, message: object, callback: (reply?: ExtensionReply) => void): void
}
function runtime(): ExtensionRuntime | undefined {
 return (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime
}
export function extensionId() {
 const fallback = import.meta.env.VITE_AO3_EXTENSION_ID || (isLocalApp() ? localExtensionId : '')
 try { return window.localStorage.getItem?.('ao3-library-extension-id') ?? fallback }
 catch { return fallback }
}
export function setExtensionId(id: string) {
 if (!/^[a-p]{32}$/.test(id)) throw new Error('Enter the 32-letter extension ID from your browser’s Extensions page.')
 window.localStorage.setItem('ao3-library-extension-id', id)
}
function message(payload: object): Promise<boolean> {
 const api = runtime(), id = extensionId()
 if (!api?.sendMessage || !/^[a-p]{32}$/.test(id)) return Promise.resolve(false)
 return new Promise(resolve => {
  const timer = setTimeout(() => resolve(false), 25000)
  try { api.sendMessage(id, payload, reply => { clearTimeout(timer); resolve(!api.lastError && reply?.ok === true) }) }
  catch { clearTimeout(timer); resolve(false) }
 })
}
export async function connectExtension(session?: Session): Promise<boolean> {
 if (sampleMode) return isLocalApp() && message({ type: 'AO3_LIBRARY_SAMPLE_CONNECT' })
 if (!extensionId() || !supabase) return false
 const current = session ?? (await supabase.auth.getSession()).data.session
 if (!current?.expires_at) return false
 return message({ type: 'AO3_LIBRARY_CONNECT', token: current.access_token, expiresAt: current.expires_at })
}
export function disconnectExtension() { return message({ type: 'AO3_LIBRARY_DISCONNECT' }) }

function previewPageWithExtension(url: string, type: 'AO3_LIBRARY_PREVIEW_SERIES' | 'AO3_LIBRARY_CAPTURE_WORK'): Promise<{ url: string; html: string }> {
 const api = runtime(), id = extensionId()
 if (!api?.sendMessage || !/^[a-p]{32}$/.test(id)) throw new Error('Connect the updated extension in Settings to preview series.')
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('AO3 page retrieval timed out. Complete sign-in in its tab, then retry.')), 125000)
  try {
   api.sendMessage(id, { type, url }, reply => {
    clearTimeout(timer)
    if (api.lastError || !reply?.ok || !reply.page) reject(new Error(reply?.error ?? 'Could not read the AO3 page. Rebuild and reconnect the extension, then retry.'))
    else resolve(reply.page)
   })
  } catch { clearTimeout(timer); reject(new Error('Could not contact the extension. Reconnect in Settings.')) }
 })
}

export function previewSeriesWithExtension(url: string) { return previewPageWithExtension(url, 'AO3_LIBRARY_PREVIEW_SERIES') }
export function captureWorkWithExtension(url: string) { return previewPageWithExtension(url, 'AO3_LIBRARY_CAPTURE_WORK') }

export type LibrarySyncState = { id: string; status: 'running' | 'paused' | 'ready' | 'complete' | 'discarded'; url: string; mode: string; pages: number; listPages?: number; count: number; skipped: number; error: string; startPage?: number; endPage?: number; limited?: boolean; partial?: boolean; delaySeconds?: number; attention?: 'login' | 'rate_limit' | 'page_error'; attentionId?: string; autoImport?: boolean; checkChapterDates?: boolean; chapterDatesChecked?: number; chapterDatesUnavailable?: number; readingStatus?: import('../library/model').Status; seenSeries?: string[]; seriesReviewVersion?: number; seriesBehavior?: import('./series-import-preferences').SeriesImportBehavior; importToCollection?: boolean; collectionId?: string; collection?: { name: string; description: string } }
export function librarySyncCommand(action: string, options: { url?: string; mode?: string; page?: number; scanId?: string; startPage?: number; endPage?: number; delaySeconds?: number; autoImport?: boolean; checkChapterDates?: boolean; readingStatus?: import('../library/model').Status; importToCollection?: boolean; collectionId?: string; seriesBehavior?: import('./series-import-preferences').SeriesImportBehavior } = {}): Promise<{ state?: LibrarySyncState | null; rows?: Record<string, string>[]; seriesUrl?: string; seriesPreview?: import('./urls').SeriesPreview }> {
 const api = runtime(), id = extensionId()
 if (!api?.sendMessage || !/^[a-p]{32}$/.test(id)) return Promise.reject(new Error('Connect AO3 Library Companion in Settings first.'))
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Extension did not respond. Rebuild, reload, and reconnect it in Settings.')), 25000)
  try {
   api.sendMessage(id, { type: 'AO3_LIBRARY_SYNC', action, ...options }, reply => {
    clearTimeout(timer)
    if (api.lastError || !reply?.ok) reject(new Error(reply?.error ?? 'Could not contact library sync. Update and reconnect the extension.'))
    else resolve(reply)
   })
  } catch { clearTimeout(timer); reject(new Error('Could not contact the extension.')) }
 })
}
