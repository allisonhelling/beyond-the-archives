import { useEffect, useState } from 'react'
import { Pagination } from '../../src/features/library/browsing/Pagination'
import { Dialog } from '../../src/components/Dialog'
import { loadSetting, readerOwner } from './storage'
import { cancelTransfers, pairCalibre, receiveTransfers, retryTransfer, revokeCalibre, transferJobs, type ImportJob, type TransferPair } from './transfers'
export function CalibreTransfers({onClose,onRefresh,onError}:{onClose:()=>void;onRefresh:()=>Promise<unknown>;onError:(error:unknown)=>void}) {
  const [pair,setPair]=useState<TransferPair>(),[jobs,setJobs]=useState<ImportJob[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const [page,setPage]=useState(1)
  const size=25,pages=Math.max(1,Math.ceil(jobs.length/size)),currentPage=Math.min(page,pages)
  async function refresh(){setPair(await loadSetting<TransferPair>('calibre-pair'));setJobs(await transferJobs())}
  useEffect(()=>{void refresh().catch(onError);const timer=window.setInterval(()=>void refresh().catch(onError),2000);return()=>window.clearInterval(timer)},[])
  async function run(action:()=>Promise<unknown>){setBusy(true);try{await action();await refresh();await onRefresh()}catch(error){setMessage(String(error));onError(error)}finally{setBusy(false)}}
  return <Dialog title="Calibre Transfers" busy={busy} onClose={onClose}>
    <p>Destination: {readerOwner ? `Reader cloud account ${readerOwner}` : 'This guest library'}. Organizer connection does not affect this choice.</p>
    <p>Cloud delivery can reach other account devices. Local delivery requires Calibre and this reader on the same computer, with the reader open. Allow local network access if your browser requests it.</p>
    {!pair ? <form onSubmit={event=>{event.preventDefault();const label=String(new FormData(event.currentTarget).get('label'));void run(async()=>{await pairCalibre(label);setMessage('Copy the pairing configuration into the Calibre plugin. It contains a private delivery credential.')})}}><label>Destination Name<input name="label" defaultValue="My Reader" maxLength={160} required /></label><button disabled={busy}>Pair Calibre</button></form> : <>
      <p>{pair.label} · Device {pair.device} · Automatic: {pair.cloud ? 'Cloud Inbox (queued by Calibre while offline)' : 'Local Reader'}</p>
      <label>Pairing Configuration<textarea readOnly rows={5} value={JSON.stringify(pair)} aria-label="Calibre Pairing Configuration" /></label>
      <div className="dialog-actions"><button disabled={busy} onClick={()=>void run(()=>navigator.clipboard.writeText(JSON.stringify(pair)))}>Copy Pairing Configuration</button><button disabled={busy} onClick={()=>void run(()=>revokeCalibre(pair))}>Revoke Pairing</button></div>
      <p>Choose Automatic, Cloud Inbox, or Local Reader in Calibre before sending. Failures remain assigned to that destination. To change the account or device, revoke and pair again. Stop the local bridge in Calibre after revoking.</p>
    </>}
    <div className="dialog-actions"><button disabled={busy} onClick={()=>void run(()=>receiveTransfers())}>Receive & Retry Delivery</button><button onClick={cancelTransfers}>Cancel Pending Imports</button></div>
    <p>{jobs.length} transfers · {jobs.filter(job=>job.status==='queued').length} pending · {jobs.filter(job=>job.hasFile && job.status!=='queued').length} needing attention</p>
    {jobs.length>size && <Pagination inlinePage page={currentPage} pages={pages} total={jobs.length} size={size} onPage={setPage} />}
    {jobs.slice((currentPage-1)*size,currentPage*size).map(job=><div className="pending-item" key={job.id}><strong>{job.filename} · {job.status}</strong><p>{job.message}</p>{job.hasFile && job.status!=='queued' && <button disabled={busy} onClick={()=>void run(async()=>{await retryTransfer(job.id);await receiveTransfers()})}>Retry Import</button>}</div>)}
    <p role="status">{message}</p>
  </Dialog>
}
