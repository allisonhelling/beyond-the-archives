import type { BulkLink } from './bulk-links'
import type { Json } from '../../types/database'
import { allRows } from '../library/repository'
import { importClient } from './repository'
import { readMapping } from './site-mapping'

export async function loadSiteMappings() {
 const db = importClient()
 const rows = await allRows((from, to) => db.from('site_mappings').select('rule').order('id').range(from, to), 'site mappings')
 return rows.flatMap(({ rule }) => { const mapping = readMapping(rule); return mapping ? [mapping] : [] })
}
export async function submitSiteImport(batch: string, links: BulkLink[]) {
 const { data, error } = await importClient().rpc('submit_site_import', { p_batch: batch, p_items: links.map(link => ({ url: link.candidate, recognized: link.kind === 'recognized' })) })
 if (error || !data) throw new Error('Could not confirm the batch. Retry this submission to check its checkpoint.')
 return data
}
export async function retrySiteImport(batch: string, item?: string) {
 const { error } = await importClient().rpc('retry_site_import', { p_batch: batch, ...(item && { p_item: item }) })
 if (error) throw new Error('Could not retry this link. Refresh the batch and try again.')
}
export async function siteImportOrigins(batch: string) {
 const { data, error } = await importClient().rpc('site_import_origins', { p_batch: batch })
 if (error) throw new Error('Could not load pending sources for this batch.')
 return data as { url: string }[]
}
export type CountEdit = { id: string; revision: string; count: string; manual: boolean }
export type CountReview = { total: number; pages: number; page: number; reviewNeeded: number; saved: number; issues: Record<string, string>; rows: { id: string; title: string; revision: string; progress: number }[] }
export async function reviewImportCounts(batch: string, page: number, size: number, progress: boolean, edits?: CountEdit[]) {
 const { data, error } = await importClient().rpc('review_import_counts', { p_batch: batch, p_page: page, p_size: size, p_progress: progress, ...(edits && { p_edits: edits as Json }) })
 if (error) throw new Error('Could not load or save count reviews. Try again from this batch.')
 return data as unknown as CountReview
}
