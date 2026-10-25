import { sampleMode } from '../../lib/sample-mode'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../types/database'
import type { LibrarySyncState } from './extension'

export type LibrarySyncReport = { id: string; completed_at: string; report: LibrarySyncState }
export type LibrarySyncReports = { reports: LibrarySyncReport[]; total: number }
const sampleKey = 'ao3-sample-library-sync-reports'

export async function librarySyncReports(page = 1, state?: LibrarySyncState): Promise<LibrarySyncReports> {
 const report = state ? { ...state, status: 'complete' as const, error: '' } : undefined
 if (sampleMode) {
  const reports: LibrarySyncReport[] = JSON.parse(localStorage.getItem(sampleKey) ?? '[]')
  if (report) {
   const previous = reports.find(saved => saved.id === report.id)
   const next = { id: report.id, completed_at: previous?.completed_at ?? new Date().toISOString(), report }
   const saved = [next, ...reports.filter(saved => saved.id !== report.id)].sort((a, b) => b.completed_at.localeCompare(a.completed_at) || a.id.localeCompare(b.id))
   localStorage.setItem(sampleKey, JSON.stringify(saved))
   return { reports: saved.slice((page - 1) * 10, page * 10), total: saved.length }
  }
  return { reports: reports.slice((page - 1) * 10, page * 10), total: reports.length }
 }
 if (!supabase) throw new Error('Connect your library to save sync reports.')
 const { data, error } = await supabase.rpc('library_sync_report_history', { p_page: page, ...(report ? { p_report: report as unknown as Json } : {}) })
 if (error) throw new Error('Could not save or load sync reports. Apply the latest database migrations and check your connection. Saved scan pages remain available for retry.')
 return data as unknown as LibrarySyncReports
}
