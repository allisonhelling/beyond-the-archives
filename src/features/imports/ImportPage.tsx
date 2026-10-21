import { formatDateTime } from '../../lib/dates'
import { ImportedSeriesNotice } from './ImportedSeriesNotice'
import { useState } from 'react'
import { Pagination } from '../library/pagination'
import { useImportHistory } from './useImportHistory'
import { Link, useLocation } from 'react-router-dom'
import { useLibrary } from '../library/LibraryProvider'
import { sampleMode } from '../../lib/sample-mode'
import { approveProgress, cancelBatch, retryJob, submitImport } from './repository'
import type { Status } from '../library/model'
import { ImportReadingStatus } from './ImportReadingStatus'
import { SeriesImportReview } from './SeriesImportReview'
import { importFinished, classifyUrl, extractUrls, selectedImportText, type SeriesPreview } from './urls'
const activeStatuses=['pending','processing']
const reviewStatuses=['failed','skipped','cancelled']
export function ImportPage() {
 const location=useLocation()
 const [readingStatus,setReadingStatus]=useState<Status>('to_read')
 const [reviewing,setReviewing]=useState(false)
 const library=useLibrary()
 const [relatedBatch, setRelatedBatch] = useState<string>()
 const [historyPage,setHistoryPage]=useState(1),[resultPage,setResultPage]=useState(1)
 const [resultView,setResultView]=useState<{batchId?:string;finished:boolean;status:string}>({finished:false,status:'all'})
 const [text,setText]=useState(typeof location.state?.seriesUrl==='string'?location.state.seriesUrl:''), [selected,setSelected]=useState<string>()
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const history=useImportHistory(selected,historyPage,resultPage,resultView.status,!sampleMode,busy)
 const {data,loading,reload}=history
 async function action(fn:()=>Promise<unknown>) {setBusy(true);setError('');try {await fn();await reload()}catch(e){setError(e instanceof Error?e.message:'Import operation failed.')}finally{setBusy(false)}}
 const batch=data.batches.find(b=>b.id===selected)??data.batches[0]
 const finished=importFinished(data)
 if(resultView.batchId!==batch?.id||resultView.finished!==finished) setResultView({batchId:batch?.id,finished,status:finished?'review':'all'})
 const statusFilter=resultView.status
 function setStatusFilter(status:string){setResultPage(1);setResultView({batchId:batch?.id,finished,status})}
 const reviewItems=data.items.filter(item=>reviewStatuses.includes(item.status))
 const urls=extractUrls(text), ignored=urls.filter(url=>classifyUrl(url).kind==='unrelated').length
 const seriesCount=new Set(urls.flatMap(url=>{const result=classifyUrl(url);return result.kind==='series'?[result.identity.seriesId]:[]})).size
 function saveImport(works?:SeriesPreview['works'], status:Status=readingStatus, seriesIds:number[]=[]) {
  void action(async()=>{const id=await submitImport(works?selectedImportText(text,works):text,true,status,seriesIds);for(const seriesId of seriesIds) await library.refreshSeries(seriesId);setMessage(id?'Batch saved. Processing follows your Settings. Keep this app open for long extension imports.':'No AO3 URLs found. Unrelated URLs were ignored.');if(id){setSelected(id);setRelatedBatch(works ? undefined : id);setText('');setReviewing(false)}})
 }
 const visibleItems=data.summary ? data.items : statusFilter==='review'?reviewItems:data.items.filter(item=>statusFilter==='all'||item.status===statusFilter)
 const total=data.summary?.total??data.items.length
 const reviewCount=data.summary ? ['failed','skipped','cancelled'].reduce((n,k)=>n+(data.summary!.counts[k]??0),0) : reviewItems.length
 const visibleCount=data.summary?.filtered??visibleItems.length
 const batchEntries=new Set((data.changes??data.items).flatMap(item=>item.entry_id?[item.entry_id]:[]))
 const jobsByEntry=new Map(data.jobs.map(job=>[job.entry_id,job]))
 const counts=data.summary?.counts??Object.fromEntries(['pending','processing','completed','failed','skipped','cancelled'].map(status=>[status,data.items.filter(i=>i.status===status).length]))
 const resultPagination = data.summary&&<Pagination page={data.summary.page} pages={data.summary.pages} total={visibleCount} size={50} onPage={setResultPage}/>
 return <><div className="page-heading"><div><h1>Mass Import from AO3</h1><p>Paste work or series links. Choose which series works to import. Valid work identities are saved immediately; metadata arrives gradually.</p></div></div>
 {sampleMode ? <p className="settings-card">Persistent imports require the connected application. Sample mode has no background worker.</p> : <>
 {reviewing ? <SeriesImportReview text={text} initialReadingStatus={readingStatus} onReadingStatusChange={setReadingStatus} savedIds={new Set((library.stories??[]).map(story=>story.work.ao3_work_id).filter((id):id is number=>id!==null))} busy={busy} onConfirm={saveImport} onCancel={()=>setReviewing(false)} /> : <form className="story-form settings-card" onSubmit={event=>{event.preventDefault();if(seriesCount){setError('');setMessage('');setReviewing(true)}else saveImport()}}>
 <label>AO3 URLs<textarea rows={10} value={text} onChange={event=>setText(event.target.value)} placeholder="https://archiveofourown.org/works/123" disabled={busy} /></label>
 <ImportReadingStatus value={readingStatus} onChange={setReadingStatus} disabled={busy} />
 <p className="field-help">Applies to all links imported.</p>
 <p className="field-help">{urls.length} links found · {ignored} unrelated links will be ignored.{seriesCount>0&&` ${seriesCount} series detected; review and select their works before importing.`} Up to 2,000 URLs per batch. Chapter IDs only set progress when their positions are verified.</p>
 <div className="form-actions"><button className="button primary" disabled={busy||!urls.length}>{busy?'Saving…':seriesCount?'Review series':'Import URLs'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setText('')}>Clear</button></div>
 </form>}
 <p className="muted">Processing uses the metadata mode selected in Settings: the hosted worker or the connected browser extension. For extension requests, keep your browser running and complete any AO3 confirmation in the requested tab. This page checks persisted progress every five seconds. Closing it does not cancel jobs.</p>
 {message&&<p role="status">{message}</p>}{(error||history.error)&&<p className="error-message" role="alert">{error||history.error}</p>}
 {finished && batch?.id === relatedBatch && <ImportedSeriesNotice stories={(library.stories ?? []).filter(story => batchEntries.has(story.id))} onImported={id => { setSelected(id); setRelatedBatch(undefined) }} />}
 <section className="settings-card"><h2>Previous batches</h2>{loading?<p role="status">Loading import history…</p>:!data.batches.length?<p>No imports yet. Paste your first batch above.</p>:<label>Batch<select value={batch?.id??''} onChange={event=>{setResultPage(1);setSelected(event.target.value)}}>{data.batches.map(b=><option key={b.id} value={b.id}>{formatDateTime(b.created_at)}{b.cancelled_at?' · Cancelled':''}</option>)}</select></label>}
 {data.summary&&<Pagination page={historyPage} pages={data.summary.historyPages} total={data.summary.historyTotal} size={25} onPage={page=>{setHistoryPage(page);setResultPage(1)}}/>}
 {batch&&<><p>{total} tracked URLs · {data.summary?.imported??data.items.filter(i=>i.result==='imported'&&i.status==='completed').length} imported with metadata · {data.summary?.alreadySaved??data.items.filter(i=>i.result==='already_saved').length} already saved</p><div className="import-status-filters" role="group" aria-label="Filter import results by status"><button className="text-button" aria-pressed={statusFilter==='all'} aria-controls="import-result-table" onClick={()=>setStatusFilter('all')}>All results: {total}</button>{finished&&<button className="text-button" aria-pressed={statusFilter==='review'} aria-controls="import-result-table" onClick={()=>setStatusFilter('review')}>Review: {reviewCount}</button>}{Object.entries(counts).map(([name,n])=><button key={name} className="text-button" aria-pressed={statusFilter===name} aria-controls="import-result-table" onClick={()=>setStatusFilter(name)}>{name}: {n}</button>)}</div>
 <p className="muted" role="status">{statusFilter==='review'?(reviewCount?`Batch finished. Showing failed, skipped, and cancelled results for your review. ${visibleCount} of ${total} results.`:'Batch finished. No failed, skipped, or cancelled results to review.'):`Showing ${visibleCount} of ${total} results${statusFilter!=='all'?` · ${statusFilter}`:''}`}</p>
 <progress aria-label="Import progress" max={Math.max(total,1)} value={data.summary?.completed??data.items.filter(i=>!activeStatuses.includes(i.status)).length}/>
 <div className="form-actions"><button className="button secondary" disabled={busy||!!batch.cancelled_at||!(data.summary?.active??data.jobs.some(j=>activeStatuses.includes(j.status)))} onClick={()=>void action(()=>cancelBatch(batch.id))}>Cancel remaining retrieval</button><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{})}>Refresh results</button></div>
 {batch.cancelled_at&&<p>Cancelled {formatDateTime(batch.cancelled_at)}. Saved works remain in your library.</p>}
 {resultPagination}
 <div className="import-results"><table id="import-result-table"><caption>INDIVIDUAL IMPORT RESULTS</caption><thead><tr><th>SUBMITTED URL</th><th>RESULT</th><th>METADATA</th><th>ACTIONS</th></tr></thead><tbody>{!visibleItems.length&&<tr><td colSpan={4}>{statusFilter==='review'?'No results need review.':`No ${statusFilter==='all'?'import':statusFilter} results in this batch.`}</td></tr>}{visibleItems.map(item=>{const job=jobsByEntry.get(item.entry_id);return <tr key={item.id}><td>{item.original_url}<small>Work {item.ao3_work_id??'unknown'}{item.chapter_id?` · Chapter ID ${item.chapter_id}`:''}</small></td><td><span className="import-result-status">{item.status} · {item.result}</span>{item.verified_position&&<small>Verified chapter {item.verified_position}</small>}</td><td><span className="import-result-status">{item.metadata_status}</span>{item.error_category&&<small>{item.error_category}: {item.error_message}</small>}<small>Last attempt: {item.last_attempt_at?formatDateTime(item.last_attempt_at):'Never'}{job?` · ${job.attempts}/4 attempts`:''}</small>{job?.status==='pending'&&<small>Next eligible: {formatDateTime(job.next_attempt_at)}</small>}</td><td>{item.entry_id&&<><Link className="clickable-text" to={`/stories/${item.entry_id}`}>View saved work</Link><Link className="clickable-text" to={`/stories/${item.entry_id}?edit=metadata`}>Edit metadata</Link></>}{job?.status==='failed'&&job.retryable&&!batch.cancelled_at&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>retryJob(job.id))}>Retry metadata</button>}{item.verified_position&&item.verified_position>1&&item.result==='already_saved'&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>approveProgress(item.id))}>Approve progress through chapter {item.verified_position-1}</button>}</td></tr>})}</tbody></table></div>{resultPagination}</>}
 </section></>}
 </>
}
