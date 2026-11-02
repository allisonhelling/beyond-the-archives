import type { SupabaseClient } from '@supabase/supabase-js'
import { readPublicConfig, type PublicConfig } from './config'

// Public browser configuration; account access still requires a private device credential.
export const hostedOrganizer: PublicConfig = {
  url: 'https://pnrdztfydurupcqwumvr.supabase.co',
  key: 'sb_publishable_f7JEDWH8xFPjvQtPms-Rzw_M9341Q9A',
}
export const hostedReaderUrl = 'https://archivesunfolded.vercel.app/'
export type ReaderPairing = PublicConfig & { code: string }
const pendingPairingKey = 'reader:pending-pairing'
function parseReaderPairing(input: unknown): ReaderPairing | undefined {
  if (!input || typeof input !== 'object') return
  const value = input as ReaderPairing
  const config = readPublicConfig({ VITE_SUPABASE_URL: value.url, VITE_SUPABASE_PUBLISHABLE_KEY: value.key })
  if (config && typeof value.code === 'string' && /^[a-f0-9]{64}$/.test(value.code)) return { ...config, code: value.code }
}
export function deferReaderPairing(pairing: ReaderPairing) {
  sessionStorage.setItem(pendingPairingKey, JSON.stringify({ pairing, expires: Date.now() + 5 * 60_000 }))
}
export function clearPendingReaderPairing() { sessionStorage.removeItem(pendingPairingKey) }
export function consumePendingReaderPairing(): ReaderPairing | undefined {
  try {
    const saved = sessionStorage.getItem(pendingPairingKey)
    clearPendingReaderPairing()
    const value = JSON.parse(saved ?? 'null')
    if (typeof value?.expires === 'number' && value.expires > Date.now()) return parseReaderPairing(value.pairing)
  } catch { /* Missing, expired, or invalid pending links cannot connect an account. */ }
}
export function readerBaseUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS reader URL.')
  if (url.username || url.password) throw new Error('Use a reader URL without credentials.')
  url.search = ''; url.hash = ''
  return url
}
export function readerPairingUrl(reader: string, pairing: ReaderPairing): string {
  const url = readerBaseUrl(reader)
  url.hash = new URLSearchParams({ readerPairing: JSON.stringify(pairing) }).toString()
  return url.href
}
export function consumeReaderPairing(): ReaderPairing | undefined {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const value = params.get('readerPairing')
  if (value === null) return
  // Remove credentials from browser history before rendering or making requests.
  params.delete('readerPairing')
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${params.size ? `#${params}` : ''}`)
  try {
    return parseReaderPairing(JSON.parse(value))
  } catch { /* Invalid links cannot configure or connect an organizer. */ }
}

// Both apps establish the same account association; only the reader registers a device.
export async function enableOrganizerSync(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user?.email_confirmed_at || data.user.is_anonymous) throw new Error('Confirm your email before enabling organizer sync.')
  const result = await client.rpc('reader_organizer_connection', { p_action: 'enable' })
  if (result.error) throw new Error(result.error.message)
}
