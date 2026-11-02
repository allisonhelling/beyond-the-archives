import { localExtensionConnectionHelp } from './extension-config'
import { importError } from './import-error'
import { bookmarkConflicts, bookmarkReadingState, csvWorkKey } from './ao3-csv'
import type { Database } from '../../types/database'
import type { Status } from '../library/model'
import { sampleMode } from '../../lib/sample-mode'
import { getLayout } from '../../lib/use-layout'
import { metadataRetrievalMode } from './metadata-preferences'
import { supabase } from '../../lib/supabase'
import { addStoriesToCollections, allRows } from '../library/repository'
import { classifyUrl, extractUrls, mergeSeriesPreviews, parseSeriesUrl, seriesPageUrl, type SeriesPreview } from './urls'
import { connectExtension, previewSeriesWithExtension } from './extension'
function client() { if(!supabase) throw new Error('Connect Supabase and apply the Phase 3 migration to use persistent imports.'); return supabase }
type Row<K extends keyof Database['public']['Tables']> = Database['public']['Tables'][K]['Row']
export type ImportHistory = { selectedBatch?: string; batches: Row<'import_batches'>[]; items: (Row<'import_items'> & { work_info?: { title: string; authors: string[]; author_links?: Record<string, string> } | null })[]; jobs: Row<'metadata_jobs'>[];
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
 if (sampleMode) {
  await (await import('./sample-import')).importSampleWorkUrls(urls, readingStatus ?? 'to_read', seriesIds, updateReadingLocation)
  return 'sample-import'
 }
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

export async function markWorkDeleted(entryId: string, jobId: string) {
 const { error } = await client().rpc('mark_work_deleted', { p_entry: entryId, p_job: jobId })
 if (error) throw new Error('Could not mark the work as deleted. Apply the latest migrations and retry.')
}

export async function previewSeries(url: string, options: { firstPageOnly?: boolean; viaExtension?: boolean; signal?: AbortSignal } = {}): Promise<SeriesPreview> {
 options.signal?.throwIfAborted()
 const identity = parseSeriesUrl(url)
 let useExtension = sampleMode || Boolean(options.viaExtension)
 if (useExtension) {
  if (!await connectExtension()) throw new Error(sampleMode ? localExtensionConnectionHelp : 'Connect the extension in Settings, then retry the series preview.')
 } else {
  const db = client()
  const { data: session } = await db.auth.getSession()
  if (!session.session) throw new Error('Sign in to preview series.')
  const { data: preferences, error: settingsError } = await db.from('metadata_preferences').select('retrieval_mode,retrieval_mode_mobile').eq('user_id', session.session.user.id).maybeSingle()
  if (settingsError) throw new Error('Could not load metadata settings. Retry the preview.')
  useExtension = metadataRetrievalMode(preferences, getLayout()) === 'extension'
 }
 let nextUrl: string | undefined = identity.normalizedUrl
 const pages: SeriesPreview[] = []
 const visited = new Set<string>()
 while (nextUrl) {
  options.signal?.throwIfAborted()
  const pageUrl = seriesPageUrl(nextUrl, identity.seriesId)
  if (visited.has(pageUrl)) throw new Error('Series preview returned a repeated page. Retry the preview.')
  visited.add(pageUrl)
  let body: { url: string; html?: string } = { url: pageUrl }
  if (useExtension) body = await previewSeriesWithExtension(pageUrl)
  options.signal?.throwIfAborted()
  let page: SeriesPreview, nextPageDelayMs: number | undefined
  if (sampleMode || options.viaExtension) {
   const { parseSeries } = await import('./ao3-series')
   page = parseSeries(body.html ?? '', body.url)
  } else {
   const { data, error } = await client().functions.invoke('series-preview', { body, ...(options.signal && { signal: options.signal }) })
   if (error) {
    let message = 'Could not preview this series. Check the series-preview function is deployed, then retry or skip it.'
    try { const response = error.context as Response; const detail = await response.json(); if (typeof detail.error === 'string') message = detail.error } catch { /* Use the connection guidance. */ }
    throw new Error(message)
   }
   if (!data?.preview || data.preview.seriesId !== identity.seriesId || !Array.isArray(data.preview.works)) throw new Error('The preview did not match this series. Retry or skip it.')
   page = data.preview as SeriesPreview; nextPageDelayMs = data.nextPageDelayMs
  }
  options.signal?.throwIfAborted()
  pages.push(page)
  if (options.firstPageOnly) break
  nextUrl = page.nextUrl
  if (nextUrl && !useExtension && nextPageDelayMs === 35_000) await new Promise(resolve => setTimeout(resolve, nextPageDelayMs))
 }
 return { ...mergeSeriesPreviews(pages), ...(options.firstPageOnly && pages[0].nextUrl ? { basic: true } : {}) }
}


export async function previewCsvImport(works: import('./ao3-csv').CsvWork[]): Promise<import('./ao3-csv').CsvConflict[]> {
 if (sampleMode) return (await import('../library/sample/repository')).previewSampleCsvImport(works)
 const { data, error } = await client().rpc('preview_ao3_csv_import', { p_work_ids: works.flatMap(work => work.workId === null ? [] : [work.workId]), p_bookmark_ids: works.flatMap(work => work.bookmarkId ? [work.bookmarkId] : []) })
 if (error) throw importError('Could not check CSV conflicts', error)
 return (data as unknown as import('./ao3-csv').CsvConflict[]).map(conflict => {
  const incoming = works.find(work => work.workId !== null && work.workId === conflict.workId || work.bookmarkId && work.bookmarkId === conflict.bookmarkId)
  return incoming ? { ...conflict, workId: incoming.workId } : conflict
 })
}
export async function submitCsvImport(works: import('./ao3-csv').CsvWork[], conflicts: import('./ao3-csv').CsvConflict[], choices: Record<string, import('./ao3-csv').CsvChoice>, checkChapterDates = false) {
 const saved = new Map(conflicts.map(conflict => [csvWorkKey(conflict), conflict]))
 const rows = works.map(work => ({ ...work, checkChapterDates, choice: choices[csvWorkKey(work)] ?? 'keep', expectedVersion: saved.get(csvWorkKey(work))?.version ?? null }))
 const { data, error } = await client().rpc('submit_ao3_csv_import', { p_rows: rows as unknown as import('../../types/database').Json })
 if (error) {
  if (error.code === '40001') throw new Error('Your library changed after CSV review. Choose the files again to refresh conflicts before importing.')
  throw importError('Could not confirm the CSV import', error)
 }
 void connectExtension().catch(() => {})
 return data as unknown as { batch: string | null; imported: number; kept: number; metadataRepaired: number; seriesRepaired: number; readingCorrections: number; repairWorkIds?: Record<'metadata' | 'series' | 'reading', string[]> }
}

export async function submitLibrarySync(works: import('./ao3-csv').CsvWork[], collectionId?: string, readingStatus?: import('../library/model').Status, scan?: { id: string; url: string; reviewExisting?: boolean; readingStatusOrigin?: 'default' | 'manual' }, approved?: import('./ao3-csv').CsvConflict) {
 works = works.map(work => ({ ...work, ...(readingStatus ? { importReadingStatus: readingStatus, ...(scan?.readingStatusOrigin ? { importReadingStatusOrigin: scan.readingStatusOrigin } : {}) } : {}), reviewExisting: scan?.reviewExisting ?? true, ...(approved && csvWorkKey(work) === csvWorkKey(approved) ? { choice: 'overwrite' as const, expectedVersion: approved.version } : {}) }))
 const conflicts = !approved && works.some(work => work.source === 'bookmarks') ? bookmarkConflicts(works, await previewCsvImport(works)) : []
 let result: { batch: string | null; imported: number; kept: number; metadataRepaired?: number; seriesRepaired?: number; readingCorrections?: number; repairWorkIds?: Record<'metadata' | 'series' | 'reading', string[]> }
 if (sampleMode) result = await (await import('../library/sample/repository')).importSampleWorks(works)
 else {
  const { data, error } = await client().rpc('submit_ao3_library_sync', { p_rows: works as unknown as import('../../types/database').Json, ...(scan ? { p_scan_id: scan.id, p_source_url: scan.url } : {}) })
  if (error?.code === '40001') throw new Error('This work changed after bookmark review. Import the scan again to review its latest saved data.')
  if (error) throw importError('Could not import this scan page', error)
  result = data as unknown as typeof result
 }
 if (collectionId) {
  const saved = await previewCsvImport(works)
  await addStoriesToCollections(saved.map(work => work.id), [collectionId])
 }
 // The sync itself can update the entry version; review must compare against
 // the saved post-import version rather than the earlier preview.
 const current = conflicts.length ? await previewCsvImport(works) : []
 return { ...result, ...(conflicts.length ? { bookmarkConflicts: conflicts.map(conflict => {
  const incoming = works.find(work => csvWorkKey(work) === csvWorkKey(conflict))
  return { ...conflict, ...current.find(saved => saved.id === conflict.id), incomingWork: incoming, incomingNotes: incoming?.notes, incomingTags: incoming?.tags, incomingReading: incoming ? bookmarkReadingState(incoming) : undefined }
 }) } : {}) }
}

/** Reuse listing validation, optimistic version checks and completed-job handling. */
export async function applyLibrarySyncBookmark(conflict: import('./ao3-csv').CsvConflict) {
 if (!conflict.incomingWork) throw new Error('Import the scan again to review this bookmark before applying it.')
 const result = await submitLibrarySync([conflict.incomingWork], undefined, undefined, undefined, conflict)
 if (result.imported !== 1) throw new Error('The incoming bookmark was not applied. Apply the latest database migrations, then retry.')
 return result
}
