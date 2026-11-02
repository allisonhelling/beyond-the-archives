import { TabList } from '../../components/TabList'
import { useActivity } from '../../lib/use-activity'
import { BookFusionImport } from '../library/bookfusion/BookFusionImport'
import { SeriesImportOptions } from './SeriesImportOptions'
import { useSeriesImportBehavior, type SeriesImportBehavior } from './series-import-preferences'
import { LibrarySyncForm } from './LibrarySyncForm'
import { CsvImportForm } from './CsvImportForm'
import { AuthorNames } from '../library/AuthorNames'
import { formatDateTime } from '../../lib/dates'
import { ImportedSeriesNotice } from './ImportedSeriesNotice'
import { useState } from 'react'
import { Pagination } from '../library/browsing/Pagination'
import { useImportHistory } from './useImportHistory'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useLibrary } from '../library/LibraryProvider'
import { sampleMode } from '../../lib/sample-mode'
import { approveProgress, cancelBatch, retryJob, submitImport } from './repository'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { SeriesImportReview } from './SeriesImportReview'
import { importFinished, classifyUrl, extractUrls, groupWorks, selectedImportText, type SeriesPreview } from './urls'
const importTabs = [
 { id: 'links', label: 'Work or Series Links' },
 { id: 'sync', label: 'AO3 Library Sync' },
 { id: 'csv', label: 'CSV (Bookmarks or Marked for Later)' },
 { id: 'bookfusion', label: 'Calibre (Bookfusion)' },
] as const
const activeStatuses=['pending','processing']
const reviewStatuses=['failed','skipped','cancelled']
export function ImportPage() {
 const [params, setParams] = useSearchParams()
 const activeTab = importTabs.find(tab => tab.id === params.get('tab'))?.id ?? 'links'
 function setActiveTab(id: typeof importTabs[number]['id']) {
  setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', id); return next }, { replace: true })
 }
 const seriesBehavior = useSeriesImportBehavior()
 const location=useLocation()
 const [readingStatus,setReadingStatus]=useState<Status>('to_read')
 const [reviewing,setReviewing]=useState(false)
 const library=useLibrary({ catalog: reviewing })
 const [relatedImport, setRelatedImport] = useState<{ batchId: string; behavior: SeriesImportBehavior; workIds: number[]; reviewedSeriesIds: number[] }>()
 const [resultPage,setResultPage]=useState(1)
 const [resultView,setResultView]=useState<{batchId?:string;finished:boolean;status:string}>({finished:false,status:'all'})
 const [text,setText]=useState(typeof location.state?.seriesUrl==='string'?location.state.seriesUrl:''), [selected,setSelected]=useState<string>()
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useActivity(Boolean(busy), 'Processing your import…')
 const history=useImportHistory(selected,1,resultPage,resultView.status,!sampleMode,busy)
 const {data,loading,reload}=history
 async function action(fn:()=>Promise<unknown>) {setBusy(true);setError('');try {await fn();if(sampleMode)await library.refresh();else await reload()}catch(e){setError(e instanceof Error?e.message:'Import operation failed.')}finally{setBusy(false)}}
 const batch=data.batches.find(b=>b.id===(data.selectedBatch??selected))??data.batches[0]
 const finished=importFinished(data)
 if(resultView.batchId!==batch?.id||resultView.finished!==finished) setResultView({batchId:batch?.id,finished,status:finished?'review':'all'})
 const statusFilter=resultView.status
 function setStatusFilter(status:string){setResultPage(1);setResultView({batchId:batch?.id,finished,status})}
 const reviewItems=data.items.filter(item=>reviewStatuses.includes(item.status))
 const urls=extractUrls(text), ignored=urls.filter(url=>classifyUrl(url).kind==='unrelated').length
 const seriesCount=new Set(urls.flatMap(url=>{const result=classifyUrl(url);return result.kind==='series'?[result.identity.seriesId]:[]})).size
 function saveImport(works?:SeriesPreview['works'], status:Status=readingStatus, seriesIds:number[]=[]) {
  void action(async()=>{
   const importText = works ? selectedImportText(text,works) : text
   const id = await submitImport(importText,true,status,seriesIds)
   for (const seriesId of seriesIds) await library.refreshSeries(seriesId)
   setMessage(sampleMode?'Works saved to this browser’s sample library. Existing works were kept.':id?'Batch saved. Processing follows your Settings. Keep this app open for long extension imports.':'No AO3 URLs found. Unrelated URLs were ignored.')
   setReviewing(false); setText('')
   setRelatedImport(id && seriesBehavior.reviewRelatedSeries ? { batchId:id, behavior:seriesBehavior.behavior, workIds:[...groupWorks(extractUrls(importText)).keys()], reviewedSeriesIds:seriesIds } : undefined)
   seriesBehavior.reset()
   if (id) setSelected(id)
  })
 }
 const visibleItems=data.summary ? data.items : statusFilter==='review'?reviewItems:data.items.filter(item=>statusFilter==='all'||item.status===statusFilter)
 const total=data.summary?.total??data.items.length
 const reviewCount=data.summary ? ['failed','skipped','cancelled'].reduce((n,k)=>n+(data.summary!.counts[k]??0),0) : reviewItems.length
 const visibleCount=data.summary?.filtered??visibleItems.length
 const batchEntries=new Set((data.changes??data.items).flatMap(item=>item.entry_id?[item.entry_id]:[]))
 const jobsByEntry=new Map(data.jobs.map(job=>[job.entry_id,job]))
 const counts=data.summary?.counts??Object.fromEntries(['pending','processing','completed','failed','skipped','cancelled'].map(status=>[status,data.items.filter(i=>i.status===status).length]))
 const resultPagination = data.summary&&<Pagination page={data.summary.page} pages={data.summary.pages} total={visibleCount} size={50} onPage={setResultPage}/>
 const onImported = async (id: string | null) => { if(id)setSelected(id); await library.refresh(); if(!sampleMode)await reload() }
 const batchHistory = <>
 <section className="settings-card"><h2>Previous Batches</h2>{history.error&&<p role="alert" className="error-message">{history.error}</p>}{sampleMode?<p>Batch history is available in the connected library. Local sample imports do not create account batches.</p>:loading?<p role="status">Loading import history…</p>:!data.batches.length?<p>No imports yet. Paste your first batch above.</p>:<label>Batch<select value={batch?.id??''} onChange={event=>{setResultPage(1);setSelected(event.target.value)}}>{data.batches.map(b=><option key={b.id} value={b.id}>{formatDateTime(b.created_at)}{b.source_url ? ` · Library Sync · ${b.source_url}` : ''}{b.cancelled_at?' · Cancelled':''}</option>)}</select></label>}
 {batch&&<><p>{total} tracked URLs · {data.summary?.imported??data.items.filter(i=>i.result==='imported'&&i.status==='completed').length} imported with metadata · {data.summary?.alreadySaved??data.items.filter(i=>i.result==='already_saved').length} already saved</p><div className="import-status-filters" role="group" aria-label="Filter Import Results by Status"><button className="text-button" aria-pressed={statusFilter==='all'} aria-controls="import-result-table" onClick={()=>setStatusFilter('all')}>All Results: {total}</button>{finished&&<button className="text-button" aria-pressed={statusFilter==='review'} aria-controls="import-result-table" onClick={()=>setStatusFilter('review')}>Review: {reviewCount}</button>}{Object.entries(counts).map(([name,n])=><button key={name} className="text-button" aria-pressed={statusFilter===name} aria-controls="import-result-table" onClick={()=>setStatusFilter(name)}>{name}: {n}</button>)}</div>
 <p className="muted" role="status">{statusFilter==='review'?(reviewCount?`Batch finished. Showing failed, skipped, and cancelled results for your review. ${visibleCount} of ${total} results.`:'Batch finished. No failed, skipped, or cancelled results to review.'):`Showing ${visibleCount} of ${total} results${statusFilter!=='all'?` · ${statusFilter}`:''}`}</p>
 <progress aria-label="Import Progress" max={Math.max(total,1)} value={data.summary?.completed??data.items.filter(i=>!activeStatuses.includes(i.status)).length}/>
 <div className="form-actions"><button className="button secondary" disabled={busy||!!batch.cancelled_at||!(data.summary?.active??data.jobs.some(j=>activeStatuses.includes(j.status)))} onClick={()=>void action(()=>cancelBatch(batch.id))}>Cancel Remaining Retrieval</button><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{})}>Refresh Results</button></div>
 {batch.cancelled_at&&<p>Cancelled {formatDateTime(batch.cancelled_at)}. Saved works remain in your library.</p>}
 {resultPagination}
 <div className="import-results"><table id="import-result-table"><caption>INDIVIDUAL IMPORT RESULTS</caption><thead><tr><th>SUBMITTED URL</th><th>WORK INFO</th><th>RESULT</th><th>METADATA</th><th>ACTIONS</th></tr></thead><tbody>{!visibleItems.length&&<tr><td colSpan={5}>{statusFilter==='review'?'No results need review.':`No ${statusFilter==='all'?'import':statusFilter} results in this batch.`}</td></tr>}{visibleItems.map(item=>{const job=jobsByEntry.get(item.entry_id);return <tr key={item.id}><td><a className="clickable-text url-text" href={/^https?:\/\//i.test(item.original_url) ? item.original_url : undefined} target="_blank" rel="noopener noreferrer">{item.original_url}</a><small>Work {item.ao3_work_id??'unknown'}{item.chapter_id?` · Chapter ID ${item.chapter_id}`:''}</small></td><td>{item.work_info ? <><strong>{item.work_info.title}</strong><small>By <AuthorNames metadata={{ authors: item.work_info.authors ?? [], author_links: item.work_info.author_links }} /></small></> : item.status === 'completed' ? 'Work information unavailable' : 'Available when completed'}</td><td><span className="import-result-status">{item.status} · {item.result}</span>{item.verified_position&&<small>Verified chapter {item.verified_position}</small>}</td><td><span className="import-result-status">{item.metadata_status}</span>{item.error_category&&<small>{item.error_category}: {item.error_message}</small>}<small>Last attempt: {item.last_attempt_at?formatDateTime(item.last_attempt_at):'Never'}{job?` · ${job.attempts}/4 attempts`:''}</small>{job?.status==='pending'&&<small>Next eligible: {formatDateTime(job.next_attempt_at)}</small>}</td><td>{item.entry_id&&<><Link className="clickable-text" to={`/stories/${item.entry_id}`}>View Saved Work</Link><Link className="clickable-text" to={`/stories/${item.entry_id}?edit=metadata`}>Edit Metadata</Link></>}{job?.status==='failed'&&job.retryable&&!batch.cancelled_at&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>retryJob(job.id))}>Retry Metadata</button>}{item.verified_position&&item.verified_position>1&&item.result==='already_saved'&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>approveProgress(item.id))}>Approve Progress Through Chapter {item.verified_position-1}</button>}</td></tr>})}</tbody></table></div>{resultPagination}</>}
 </section>
 </>
 return <div className="mass-import-page"><div className="page-heading"><div><h1>Mass Import from AO3</h1><p>Choose work links, an AO3 library sync, CSV files, or Calibre Bookfusion links. Previous Batches is available at the bottom of every tab.</p></div></div>
 <TabList tabs={importTabs} active={activeTab} onChange={setActiveTab} label="Mass Import Sections" prefix="imports" />
 {importTabs.map(tab => <section key={tab.id} role="tabpanel" id={`imports-panel-${tab.id}`} aria-labelledby={`imports-tab-${tab.id}`} hidden={activeTab !== tab.id} tabIndex={0}>
  {tab.id === 'sync' && <LibrarySyncForm onImported={onImported} />}
  {tab.id === 'csv' && <CsvImportForm onImported={onImported} />}
  {tab.id === 'bookfusion' && <BookFusionImport />}
  {tab.id === 'links' && <>
 {reviewing ? <SeriesImportReview previewCache={seriesBehavior.previewCache} onPreview={seriesBehavior.cachePreview} error={error} automatic={seriesBehavior.behavior === 'all'} text={text} initialReadingStatus={readingStatus} onReadingStatusChange={setReadingStatus} savedIds={new Set((library.stories??[]).map(story=>story.work.ao3_work_id).filter((id):id is number=>id!==null))} busy={busy} onConfirm={saveImport} onCancel={()=>setReviewing(false)} /> : <form className="story-form settings-card" onSubmit={event=>{event.preventDefault();if(seriesCount){setError('');setMessage('');setReviewing(true)}else saveImport()}}>
 <h2>Import Work or Series Links</h2>
 <label>AO3 URLs<textarea rows={10} value={text} onChange={event=>setText(event.target.value)} placeholder={"Paste work or series links here one per line\nhttps://archiveofourown.org/works/123"} disabled={busy} /></label>
 <div className="form-controls-row">
 <ImportReadingStatus description="Applies to all links imported." value={readingStatus} onChange={setReadingStatus} disabled={busy} />
 <SeriesImportOptions reviewRelatedSeries={seriesBehavior.reviewRelatedSeries} onReviewRelatedSeriesChange={seriesBehavior.setReviewRelatedSeries} defaultBehavior={seriesBehavior.defaultBehavior} override={seriesBehavior.override} onChange={seriesBehavior.setOverride} disabled={busy || reviewing} />
 </div>
 <p className="field-help">{urls.length} links found · {ignored} unrelated links will be ignored.{seriesCount>0&&` ${seriesCount} series detected; ${seriesBehavior.behavior === 'all' ? 'all available works will be included.' : 'review and select their works before importing.'}`} Up to 2,000 URLs per batch. Chapter IDs only set progress when their positions are verified.</p>
 <div className="form-actions"><button className="button primary" disabled={busy||!urls.length}>{busy?'Saving…':seriesCount ? seriesBehavior.behavior === 'all' ? 'Import All Series Works' : 'Review Series' : 'Import URLs'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setText('')}>Clear</button></div>
 </form>}
 {!sampleMode && <p className="muted">Processing uses the metadata mode selected in Settings: the hosted worker or the connected browser extension. For extension requests, keep your browser running and complete any AO3 confirmation in the requested tab. This page checks persisted progress every five seconds. Closing it does not cancel jobs.</p>}
 {sampleMode && <p className="muted">Pasted links use the extension with Local selected and save to this browser’s sample library. Keep this page open while importing and complete any AO3 sign-in in the requested tab. Series follow the default and temporary option shown above; existing saved works are kept. New work-page requests wait 15 seconds between captures. Retry interrupted imports with the same links to continue safely.</p>}
 {message&&<p role="status">{message}</p>}{!reviewing&&error&&<p className="error-message" role="alert">{error}</p>}
 {relatedImport && (sampleMode || finished && batch?.id === relatedImport.batchId) && <ImportedSeriesNotice key={relatedImport.batchId} reviewedSeriesIds={relatedImport.reviewedSeriesIds} reviewRelatedSeries initialBehavior={relatedImport.behavior} stories={(library.stories ?? []).filter(story => sampleMode ? story.work.ao3_work_id !== null && relatedImport.workIds.includes(story.work.ao3_work_id) : batchEntries.has(story.id))} onImported={id => { setSelected(id); setRelatedImport(undefined) }} />}
 </>}
  {activeTab === tab.id && batchHistory}
 </section>)}
 </div>
}
