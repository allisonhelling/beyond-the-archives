import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../library/LibraryProvider'
import { sampleMode } from '../../lib/sample-mode'
import { approveProgress, cancelBatch, importHistory, retryJob, submitImport } from './repository'
import { classifyUrl, extractUrls } from './urls'
type History = Awaited<ReturnType<typeof importHistory>>
export function ImportPage() {
 const library=useLibrary(), {refresh}=library
 const completedSignature=useRef('')
 const [text,setText]=useState(''), [selected,setSelected]=useState<string>(), [data,setData]=useState<History>({batches:[],items:[],jobs:[]})
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
 const reload=useCallback(async()=>{const next=await importHistory(selected);setData(next);setLoading(false)},[selected])
 useEffect(()=>{let alive=true; const load=async()=>{try {const next=await importHistory(selected);if(alive){setData(next);setLoading(false);const signature=JSON.stringify(next.jobs.map(j=>[j.id,j.completed_at]));if(signature!==completedSignature.current){completedSignature.current=signature;void refresh().catch(()=>{})}}}catch {if(alive){setError('Import history is unavailable. Check your connection and apply the Phase 3 migration.');setLoading(false)}}}; if(!sampleMode) {void load();const timer=setInterval(()=>void load(),5000);return()=>{alive=false;clearInterval(timer)}}},[selected,refresh])
 async function action(fn:()=>Promise<unknown>) {setBusy(true);setError('');try {await fn();await reload();await library.refresh()}catch(e){setError(e instanceof Error?e.message:'Import operation failed.')}finally{setBusy(false)}}
 const batch=data.batches.find(b=>b.id===selected)??data.batches[0]
 const urls=extractUrls(text), ignored=urls.filter(url=>classifyUrl(url).kind==='unrelated').length
 const counts=Object.fromEntries(['pending','processing','completed','failed','skipped','cancelled'].map(status=>[status,data.items.filter(i=>i.status===status).length]))
 return <><div className="page-heading"><div><h1>Import History from AO3</h1><p>Paste work links. Valid identities are saved immediately; metadata arrives gradually.</p></div></div>
 {sampleMode ? <p className="settings-card">Persistent imports require the connected application. Sample mode has no background worker.</p> : <>
 <form className="story-form settings-card" onSubmit={event=>{event.preventDefault();void action(async()=>{const id=await submitImport(text);setMessage(id?'Batch saved. You may leave this page; the configured worker will continue processing.':'No AO3 URLs found. Unrelated URLs were ignored.');if(id){setSelected(id);setText('')}})}}>
 <label>AO3 URLs<textarea rows={10} value={text} onChange={event=>setText(event.target.value)} placeholder="https://archiveofourown.org/works/123" disabled={busy} /></label>
 <p className="field-help">{urls.length} links found · {ignored} unrelated links will be ignored. Up to 2,000 URLs per batch. Chapter IDs only set progress when their positions are verified.</p>
 <div className="form-actions"><button className="button primary" disabled={busy||!urls.length}>{busy?'Saving…':'Import URLs'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setText('')}>Clear</button></div>
 </form>
 <p className="muted">Processing requires the separately running metadata worker. This page checks persisted progress every five seconds. Closing it does not cancel jobs.</p>
 {message&&<p role="status">{message}</p>}{error&&<p className="error-message" role="alert">{error}</p>}
 <section className="settings-card"><h2>Previous batches</h2>{loading?<p role="status">Loading import history…</p>:!data.batches.length?<p>No imports yet. Paste your first batch above.</p>:<label>Batch<select value={batch?.id??''} onChange={event=>setSelected(event.target.value)}>{data.batches.map(b=><option key={b.id} value={b.id}>{new Date(b.created_at).toLocaleString()}{b.cancelled_at?' · Cancelled':''}</option>)}</select></label>}
 {batch&&<><p>{data.items.length} tracked URLs · {data.items.filter(i=>i.result==='imported'&&i.status==='completed').length} imported with metadata · {data.items.filter(i=>i.result==='already_saved').length} already saved</p><p role="status">{Object.entries(counts).map(([name,n])=>`${name}: ${n}`).join(' · ')}</p>
 <progress aria-label="Import progress" max={Math.max(data.items.length,1)} value={data.items.filter(i=>!['pending','processing'].includes(i.status)).length}/>
 <div className="form-actions"><button className="button secondary" disabled={busy||!!batch.cancelled_at||!data.jobs.some(j=>['pending','processing'].includes(j.status))} onClick={()=>void action(()=>cancelBatch(batch.id))}>Cancel remaining retrieval</button><button className="text-button" disabled={busy} onClick={()=>void action(reload)}>Refresh results and library</button></div>
 {batch.cancelled_at&&<p>Cancelled {new Date(batch.cancelled_at).toLocaleString()}. Saved works remain in your library.</p>}
 <div className="import-results"><table><caption>Individual import results</caption><thead><tr><th>Submitted URL</th><th>Result</th><th>Metadata</th><th>Actions</th></tr></thead><tbody>{data.items.map(item=>{const job=data.jobs.find(j=>j.entry_id===item.entry_id);return <tr key={item.id}><td>{item.original_url}<small>Work {item.ao3_work_id??'unknown'}{item.chapter_id?` · Chapter ID ${item.chapter_id}`:''}</small></td><td>{item.status} · {item.result}{item.verified_position&&<small>Verified chapter {item.verified_position}</small>}</td><td>{item.metadata_status}{item.error_category&&<small>{item.error_category}: {item.error_message}</small>}<small>Last attempt: {item.last_attempt_at?new Date(item.last_attempt_at).toLocaleString():'Never'}{job?` · ${job.attempts}/4 attempts`:''}</small>{job?.status==='pending'&&<small>Next eligible: {new Date(job.next_attempt_at).toLocaleString()}</small>}</td><td>{item.entry_id&&<><Link to={`/stories/${item.entry_id}`}>View saved work</Link><Link to={`/stories/${item.entry_id}?edit=metadata`}>Edit metadata</Link></>}{job?.status==='failed'&&job.retryable&&!batch.cancelled_at&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>retryJob(job.id))}>Retry metadata</button>}{item.verified_position&&item.verified_position>1&&item.result==='already_saved'&&<button className="text-button" disabled={busy} onClick={()=>void action(()=>approveProgress(item.id))}>Approve progress through chapter {item.verified_position-1}</button>}</td></tr>})}</tbody></table></div></>}
 </section></>}
 </>
}
