import { supabase } from '../../lib/supabase'
import type { Database, Json } from '../../types/database'

export type CleanupSettings = { enabled: boolean; hours: number; protect_favorites: boolean; protect_personal: boolean; protect_collections: boolean }
export type CleanupEntry = { id: string; version: string; title: string; dnf_since: string; eligible_at: string }
export type CleanupResult = { settings: CleanupSettings; eligible: number; protected: number; waiting: number; removed: number; entries?: CleanupEntry[] }
export type ReadingRecord = Database['public']['Tables']['reading_records']['Row']
export type ArchivedReading = { total: number; records: ReadingRecord[] }
export const defaultCleanupSettings: CleanupSettings = { enabled: false, hours: 168, protect_favorites: true, protect_personal: true, protect_collections: true }

export async function cleanupRequest(action: 'get' | 'save' | 'preview' | 'cleanup', input?: { settings: CleanupSettings; base?: CleanupSettings; entries?: CleanupEntry[] }): Promise<CleanupResult>
export async function cleanupRequest(action: 'archive', input?: undefined, page?: number): Promise<ArchivedReading>
export async function cleanupRequest(action: string, input?: object, page = 0): Promise<CleanupResult | ArchivedReading> {
 if (!supabase) throw new Error('Sign in to manage DNF cleanup.')
 const { data, error } = await supabase.rpc('dnf_cleanup', { p_action: action, p_input: (input ?? {}) as Json, p_page: page })
 if (error) throw new Error(error.code === '40001'
  ? 'Settings or a fic changed on another device. Reload saved settings and preview cleanup again.'
  : 'Could not complete DNF cleanup. Check your connection and try again.')
 const result = data as unknown as CleanupResult & ArchivedReading
 if (!result || (action === 'archive' ? !Array.isArray(result.records) : !result.settings || typeof result.settings.hours !== 'number')) {
  throw new Error('Could not load DNF cleanup. Apply the latest database migration and reload settings.')
 }
 return data as unknown as CleanupResult | ArchivedReading
}
