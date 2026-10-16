import { supabase } from '../../lib/supabase'
import type { Session } from '@supabase/supabase-js'

type ExtensionRuntime = {
 lastError?: { message?: string }
 sendMessage(id: string, message: object, callback: (reply?: { ok?: boolean }) => void): void
}
function runtime(): ExtensionRuntime | undefined {
 return (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime
}
export function extensionId() {
 try { return window.localStorage.getItem?.('ao3-library-extension-id') ?? import.meta.env.VITE_AO3_EXTENSION_ID ?? '' }
 catch { return import.meta.env.VITE_AO3_EXTENSION_ID ?? '' }
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
 if (!extensionId() || !supabase) return false
 const current = session ?? (await supabase.auth.getSession()).data.session
 if (!current?.expires_at) return false
 return message({ type: 'AO3_LIBRARY_CONNECT', token: current.access_token, expiresAt: current.expires_at })
}
export function disconnectExtension() { return message({ type: 'AO3_LIBRARY_DISCONNECT' }) }
