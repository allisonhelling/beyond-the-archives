import type { Database } from '../../types/database'
import type { Status } from '../library/model'
import { supabase } from '../../lib/supabase'
import { allRows } from '../library/repository'
import { classifyUrl, extractUrls, parseSeriesUrl, type SeriesPreview } from './urls'
import { connectExtension, previewSeriesWithExtension } from './extension'
function client() { if(!supabase) throw new Error('Connect Supabase and apply the Phase 3 migration to use persistent imports.'); return supabase }
type Row<K extends keyof Database['public']['Tables']> = Database['public']['Tables'][K]['Row']
export type ImportHistory = { batches: Row<'import_batches'>[]; items: Row<'import_items'>[]; jobs: Row<'metadata_jobs'>[];
 changes?: Pick<Row<'metadata_jobs'>,'id'|'entry_id'|'status'|'completed_at'|'last_attempt_at'>[];
 summary?: { total: number; filtered: number; page: number; pages: number; historyTotal: number; historyPages: number; active: boolean; counts: Record<string,number>; imported: number; alreadySaved: number; completed: number } }
export async function importHistory(batchId?: string, options?: { historyPage: number; resultPage: number; status: string }): Promise<ImportHistory> {
 if (options) {
  const { data, error } = await client().rpc('paged_import_history', { ...(batchId && { p_batch: batchId }), p_history_page: options.historyPage, p_result_page: options.resultPage, p_status: options.status })
  if (error) throw new Error('Could not load import history. Apply the latest migrations and check your connection.')
  return data as unknown as ImportHistory
 }
 const db=client()
 const batches=await allRows((from,to)=>db.from('import_batches').select('*').order('created_at',{ascending:false}).order('id').range(from,to))
 const selected=batchId??batches[0]?.id
 if(!selected) return {batches,items:[],jobs:[]}
 const [items,jobs]=await Promise.all([
  allRows((from,to)=>db.from('import_items').select('*').eq('batch_id',selected).order('ordinal').range(from,to)),
  allRows((from,to)=>db.from('metadata_jobs').select('*').eq('batch_id',selected).order('id').range(from,to)),
 ])
 return {batches,items,jobs}
}
export async function submitImport(text:string, updateReadingLocation = true, readingStatus?: Status, seriesIds: number[] = []) {
 const urls=extractUrls(text)
 if(urls.some(url=>classifyUrl(url).kind==='series')) throw new Error('Review series and choose works before importing.')
 if(!urls.length) throw new Error('Paste at least one http or https URL.')
 if(urls.length>2000) throw new Error('Use at most 2,000 URLs per submission.')
 const {data,error}=await client().rpc('submit_import_urls',{p_urls:urls,p_update_reading_location:updateReadingLocation,...(readingStatus ? {p_reading_status:readingStatus,p_series_ids:seriesIds} : {})})
 if(error) {
  if(error.code==='PGRST202' && readingStatus) throw new Error('The connected database is missing import reading-status support. Apply the latest database migrations, then try again.')
  if(error.code==='PGRST202') throw new Error('The connected Supabase database is missing the Phase 3 importer. Apply the Phase 3 migration to the database used by VITE_SUPABASE_URL, then try again.')
  if(error.code==='42501') throw new Error('Import access was denied. Sign in again; if it continues, check the Phase 3 database permissions.')
  throw new Error('Could not confirm the import. Check your connection and import history before trying again.')
 }
 if (data) void connectExtension().catch(()=>{})
 return data
}
export async function cancelBatch(id:string) { const {error}=await client().rpc('cancel_import_batch',{p_batch:id}); if(error) throw new Error('Could not cancel this batch.') }
export async function retryJob(id:string) { const {error}=await client().rpc('retry_metadata_job',{p_job:id}); if(error) throw new Error('Retry unavailable. Check the attempt limit, cancellation and retry time.'); void connectExtension().catch(()=>{}) }
export async function approveProgress(id:string) { const {error}=await client().rpc('approve_import_progress',{p_item:id}); if(error) throw new Error('Could not apply verified progress.') }
export async function clearOverride(entry:string,field:string) { const {error}=await client().rpc('clear_metadata_override',{p_entry:entry,p_field:field}); if(error) throw new Error('Could not restore automatic metadata.') }

export async function metadataRefreshJob(entryId: string, batchId?: string) {
 let query = client().from('metadata_jobs').select('*').eq('entry_id', entryId)
 if (batchId) query = query.eq('batch_id', batchId)
 const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()
 if (error) throw new Error('Could not check metadata refresh status. Check your connection or view import history.')
 return data
}

export async function previewSeries(url: string): Promise<SeriesPreview> {
 const db = client()
 const identity = parseSeriesUrl(url)
 const { data: session } = await db.auth.getSession()
 if (!session.session) throw new Error('Sign in to preview series.')
 const { data: preferences, error: settingsError } = await db.from('metadata_preferences').select('retrieval_mode').eq('user_id', session.session.user.id).maybeSingle()
 if (settingsError) throw new Error('Could not load metadata settings. Retry the preview.')
 let body: { url: string; html?: string } = { url: identity.normalizedUrl }
 if (preferences?.retrieval_mode === 'extension') body = await previewSeriesWithExtension(identity.normalizedUrl)
 const { data, error } = await db.functions.invoke('series-preview', { body })
 if (error) {
  let message = 'Could not preview this series. Check the series-preview function is deployed, then retry or skip it.'
  try { const response = error.context as Response; const detail = await response.json(); if (typeof detail.error === 'string') message = detail.error } catch { /* Use the connection guidance. */ }
  throw new Error(message)
 }
 if (!data?.preview || data.preview.seriesId !== identity.seriesId || !Array.isArray(data.preview.works)) throw new Error('The preview did not match this series. Retry or skip it.')
 const preview = data.preview as SeriesPreview
 return { ...preview, fetchedAt: new Date().toISOString() }
}
