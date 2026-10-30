import { readPublicConfig, type PublicConfig } from './config'

// Public browser configuration; account access still requires a private device credential.
export const hostedOrganizer: PublicConfig = {
  url: 'https://pnrdztfydurupcqwumvr.supabase.co',
  key: 'sb_publishable_f7JEDWH8xFPjvQtPms-Rzw_M9341Q9A',
}
export const hostedReaderUrl = 'https://archivesunfolded.vercel.app/'
export type ReaderPairing = PublicConfig & { code: string }
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
    const input = JSON.parse(value) as ReaderPairing
    const config = readPublicConfig({ VITE_SUPABASE_URL: input.url, VITE_SUPABASE_PUBLISHABLE_KEY: input.key })
    if (config && typeof input.code === 'string' && /^[a-f0-9]{64}$/.test(input.code)) return { ...config, code: input.code }
  } catch { /* Invalid links cannot configure or connect an organizer. */ }
}
