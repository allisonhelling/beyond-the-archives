import { useEffect, useState, useSyncExternalStore } from 'react'
import { Clock, Cloud, Pause, RefreshCw } from 'lucide-react'
import { Tooltip } from '../../src/components/Tooltip'
import { readerCloud } from './cloud'
import { hasCloudChanges, loadSetting, readerOwner, readerQueueChanged } from './storage'
import { subscribeSyncStatus, syncStatusSnapshot, type SyncReport, type SyncService } from './sync-status'
import type { Connection, Pending } from './model'

type Indicator = { label: string; tone: 'success'|'syncing'|'waiting'|'failed'|'neutral'; mark?: 'arrows'|'clock'|'pause'|'alert'; detail?: string }
function ServiceIcon({ kind, indicator }: {kind:'network'|SyncService;indicator:Indicator}) {
  const cloud=kind==='cloud', filled=indicator.tone==='success'
  const Mark=indicator.mark==='arrows'?RefreshCw:indicator.mark==='clock'?Clock:Pause
  const bounds={x:cloud?12:11,y:cloud?16:13,width:cloud?16:18,height:cloud?16:18}
  return <svg className="connection-status-icon" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {kind==='network'?<circle cx="20" cy="20" r="16" fill={filled?'currentColor':'none'}/>:cloud?<Cloud x="0" y="0" width="40" height="40" strokeWidth="1.3" fill={filled?'currentColor':'none'}/>:<path d="M9 35V16a11 11 0 0 1 22 0v19Z" fill={filled?'currentColor':'none'}/>}
    {indicator.mark==='alert'?<svg {...bounds} viewBox="0 0 24 24" className="connection-status-symbol"><path d="M12 4v10"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>:indicator.mark&&<Mark {...bounds} strokeWidth="2.5" className={indicator.mark==='arrows'?'loading-icon connection-status-symbol':'connection-status-symbol'}/>}
  </svg>
}
export function ConnectionStatus({online,connection,pending}:{online:boolean;connection?:Connection;pending:Pending[]}) {
  const reports=useSyncExternalStore(subscribeSyncStatus,syncStatusSnapshot,syncStatusSnapshot)
  const [account,setAccount]=useState<string|null>(),[queue,setQueue]=useState({cloud:false,paused:false,known:false})
  useEffect(()=>{
    const {data}=readerCloud.auth.onAuthStateChange((_event,session)=>setAccount(session?.user.id??null))
    return()=>data.subscription.unsubscribe()
  },[])
  useEffect(()=>{
    let active=true,timer:ReturnType<typeof setTimeout>|undefined
    async function refresh(){
      try{
        const [cloud,paused]=await Promise.all([hasCloudChanges(),loadSetting<boolean>('organizer-disabled-here')])
        if(active)setQueue({cloud,paused:Boolean(paused),known:true})
      }catch{if(active)setQueue(current=>({...current,known:false}))}
    }
    const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>void refresh(),100)}
    void refresh();window.addEventListener(readerQueueChanged,changed)
    return()=>{active=false;clearTimeout(timer);window.removeEventListener(readerQueueChanged,changed)}
  },[reports])
  function serviceIndicator(service:SyncService,report:SyncReport):Indicator {
    if(service==='organizer'&&queue.paused)return {label:'Paused',tone:'waiting',mark:'pause',detail:'Organizer sync is paused on this device.'}
    if(!readerOwner||account===null||account!==undefined&&account!==readerOwner)return {label:service==='cloud'?'Not Signed In':'Not Connected',tone:'neutral',detail:'Sign in to this reader account to sync.'}
    const queued=pending.filter(item=>item.account===connection?.account)
    const dirty=service==='cloud'?queue.cloud:queued.length>0
    if(report.phase==='signed-out')return {label:'Not Signed In',tone:'neutral',detail:report.detail}
    const failed=service==='organizer'?queued.find(item=>item.error)?.error:undefined
    if(report.phase==='failed'||failed)return {label:'Sync Failed',tone:'failed',mark:'alert',detail:failed||report.detail}
    if(!online)return {label:dirty?'Changes Pending':'Offline',tone:dirty?'waiting':'neutral',mark:dirty?'clock':undefined,detail:'Reconnect to sync this account. Saved local changes are retained.'}
    if(report.phase==='syncing')return {label:'Syncing',tone:'syncing',mark:'arrows',detail:'Sync is in progress. Keep the reader open to finish.'}
    if(service==='organizer'&&!connection)return {label:'Not Connected',tone:'neutral',detail:'Connect your organizer account in Organizer & Sync.'}
    if(dirty||report.phase==='attention')return {label:'Changes Pending',tone:'waiting',mark:'clock',detail:report.phase==='attention'?report.detail:'Saved changes are waiting to finish syncing.'}
    if(report.phase==='success'&&queue.known)return {label:service==='cloud'?'Up to Date':'Connected',tone:'success',detail:report.checkedAt?`Last successful sync: ${new Date(report.checkedAt).toLocaleString()}`:undefined}
    return {label:'Not Checked',tone:'neutral',detail:queue.known?'Waiting for this session’s first successful sync.':'Local sync queues have not been checked yet.'}
  }
  const network:Indicator={label:online?'Online':'Offline',tone:online?'success':'neutral',detail:'Network reflects browser connectivity.'}
  const items=[{kind:'network' as const,name:'Network',indicator:network},{kind:'cloud' as const,name:'Cloud',indicator:serviceIndicator('cloud',reports.cloud)},{kind:'organizer' as const,name:'Organizer',indicator:serviceIndicator('organizer',reports.organizer)}]
  return <div className="connection-status-box" role="group" aria-label="Connection Status">
    {items.map(({kind,name,indicator})=><Tooltip key={kind} placement="bottom" portal pinOnClick description={`${name}: ${indicator.label}${indicator.detail?`. ${indicator.detail}`:''}`}>{id=><button type="button" className="connection-status-item" data-service={kind} data-tone={indicator.tone} aria-label={`${name}: ${indicator.label}`} aria-describedby={id}><ServiceIcon kind={kind} indicator={indicator}/><span className="connection-status-title">{name}</span></button>}</Tooltip>)}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{items.map(item=>`${item.name}: ${item.indicator.label}`).join('. ')}</span>
  </div>
}
