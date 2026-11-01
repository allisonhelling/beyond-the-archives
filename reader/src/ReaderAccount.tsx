import { BackToSignIn, SignInFields } from '../../src/features/auth/SignInFields'
import { remembersSession, rememberSession } from '../../src/lib/auth-session-storage'
import { connectedLogin, organizerAppUrl } from '../../src/lib/connected-login'
import { signInWithLogin, verifyAuthLink } from '../../src/lib/auth-account'
import { isStorageFull } from './storage-info'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Dialog } from '../../src/components/Dialog'
import { restoreOrganizerConnection, clearReaderAuthIntent, readerAuthIntent, rememberOrganizerConnection, importGuestLibrary, readerCloud, resolveCloud, savedConflicts, switchLibrary, syncCloud, type CloudConflict } from './cloud'
import { loadSetting, transaction, readerOwner } from './storage'
import type { Connection } from './model'
import type { CloudEdit } from './cloud-model'
export function ReaderAccount({ onClose, onRefresh, beforeSwitch, onStorageFull }: { onStorageFull:(error:unknown)=>void; onClose:()=>void; onRefresh:()=>Promise<unknown>; beforeSwitch:()=>Promise<unknown> }) {
  const [mode,setMode]=useState<'login'|'reset'>('login'),[needsPassword,setNeedsPassword]=useState(readerAuthIntent==='invite'||readerAuthIntent==='recovery')
  const [session,setSession]=useState<Session|null>(null), [busy,setBusy]=useState(false), [message,setMessage]=useState(''),[organizerLinked,setOrganizerLinked]=useState(false)
  const [remember,setRemember]=useState(()=>remembersSession('reader'))
  const [conflicts,setConflicts]=useState<CloudConflict[]>([]),[variants,setVariants]=useState<CloudEdit[]>([])
  useEffect(()=>{
    void (async()=>{
      const params=new URLSearchParams(location.search),token=params.get('token_hash'),type=params.get('type')
      try {
        if(token&&(type==='invite'||type==='recovery')){await verifyAuthLink(readerCloud,token,type);setNeedsPassword(true);history.replaceState(null,'','/')}
        const {data,error}=await readerCloud.auth.getSession();if(error)throw error;setSession(data.session)
      }catch{setMessage('This sign-in link is invalid or expired. Request a new recovery link.')}
    })()
    const {data}=readerCloud.auth.onAuthStateChange((event,next)=>{setSession(next);if(event==='PASSWORD_RECOVERY')setNeedsPassword(true);if(event==='SIGNED_OUT')setNeedsPassword(false)})
    void readerCloud.rpc('reader_organizer_connection',{p_action:'status'}).then(({data})=>setOrganizerLinked(Boolean((data as {enabled?:boolean})?.enabled)))
    void savedConflicts().then(setVariants)
    return ()=>data.subscription.unsubscribe()
  },[])
  function toggleMode() {setMode(mode==='login'?'reset':'login');setMessage('')}
  async function run(action:()=>Promise<unknown>) {
    setBusy(true)
    try {await action();await onRefresh();setVariants(await savedConflicts())} catch(error){if(isStorageFull(error)) onStorageFull(error); else setMessage(error instanceof Error?error.message:String(error))} finally{setBusy(false)}
  }
  async function enterAccount(owner:string) {
    sessionStorage.removeItem('connected-login-signed-out')
    try {await rememberOrganizerConnection(await loadSetting<Connection>('connection'))} catch {setMessage('Signed in. The existing organizer connection could not be attached to this account.')}
    await beforeSwitch();await switchLibrary(owner)
  }
  async function sync() {if(!navigator.onLine){setMessage('Offline. Downloads remain available and local edits will retry when online.');return}setConflicts(await syncCloud());setMessage('Cloud sync finished. Review conflicting edits below. The app must stay open to sync.')}
  return <Dialog title="Reader Account & Cloud Library" busy={busy} onClose={onClose}>
    <p>Guest reading works offline without an account. A reader account adds private EPUB storage and cross-device reading state. Organizer connection is a separate choice.</p>
    <p>{readerOwner ? 'Saved Account Library' : 'Guest Library'} · {session?.user.email ?? 'Signed out'}</p>
    {(!session || needsPassword) && <form className="account-auth-form" onSubmit={event=>{
      event.preventDefault()
      const fields=new FormData(event.currentTarget),email=String(fields.get('email')??'').trim(),password=String(fields.get('password')??'')
      void run(async()=>{
        if(needsPassword){
          const {error}=await readerCloud.auth.updateUser({password});if(error)throw error
          setNeedsPassword(false);clearReaderAuthIntent();history.replaceState(null,'','/');setMessage('Password saved. Use this email and password in either app.')
        } else if(mode==='reset') {
          const {error}=await readerCloud.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/auth/callback`});if(error)throw error
          setMessage('If this email has an account, a recovery link is on its way. Open it in this browser.')
        } else {
          const {data,error}=await signInWithLogin(readerCloud,email,password);if(error)throw error
          sessionStorage.removeItem('connected-login-signed-out');await enterAccount(data.user!.id)
        }
      })
    }}>
      <SignInFields mode={needsPassword?'password':mode} busy={busy} remember={remember} onRememberChange={value=>{setRemember(value);rememberSession('reader',value)}} onToggleMode={toggleMode} />
      <div className="account-auth-actions">
      {!needsPassword&&mode==='login'&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{const ok=await connectedLogin(readerCloud,organizerAppUrl(),true);if(!ok){setMessage('Sign in to your connected organizer first, or use your email and password.');return}const {data}=await readerCloud.auth.getSession();if(data.session)await enterAccount(data.session.user.id)})}>Continue From Organizer</button>}
      <button className="primary" disabled={busy}>{busy?'Please Wait…':needsPassword?'Save Password':mode==='reset'?'Send Recovery Link':'Sign In'}</button>
      </div>
      {!needsPassword&&mode==='reset'&&<BackToSignIn busy={busy} onClick={toggleMode} />}
    </form>}
    {needsPassword && !session && <button disabled={busy} onClick={()=>{setNeedsPassword(false);setMode('reset')}}>Request a New Recovery Link</button>}
    {session && !needsPassword && <button disabled={busy} onClick={()=>setNeedsPassword(true)}>Set or Change Password</button>}
    {session?.user.id === readerOwner && <>
      <label><input type="checkbox" checked={organizerLinked} disabled={busy} onChange={event=>{const enabled=event.target.checked;void run(async()=>{
        const connection=await loadSetting<Connection>('connection')
        if(enabled && connection)await rememberOrganizerConnection(connection)
        else {const {error}=await readerCloud.rpc('reader_organizer_connection',{p_action:enabled?'enable':'disable'});if(error)throw error}
        await transaction(['settings'],tx=>{tx.objectStore('settings').delete('organizer-disabled-here');if(!enabled)tx.objectStore('settings').delete('connection')})
        setOrganizerLinked(enabled);setMessage(enabled?'Organizer connection enabled across signed-in devices.':'Account organizer connections disconnected. Pending reading updates are retained.')
      })}}/>Use Organizer Connection Across Devices</label>
      {organizerLinked && <button disabled={busy} onClick={()=>void run(async()=>{await transaction(['settings'],tx=>tx.objectStore('settings').delete('organizer-disabled-here'));await restoreOrganizerConnection(await loadSetting<Connection>('connection'));setMessage('Organizer connection restored on this device.')})}>Reconnect Organizer on This Device</button>}
      <p>Connect once for this account, then sign in on another device to restore its organizer connection. Each device has its own revocable credential.</p>
      <div className="dialog-actions"><button disabled={busy} onClick={()=>void run(sync)}>Sync Cloud Now</button><button disabled={busy} onClick={()=>{if(confirm('Copy guest books, notes, and history into this account? Existing account versions are skipped. The guest library stays on this device.')) void run(async()=>{await importGuestLibrary();await sync()})}}>Import Guest Library</button></div>
      <p>Downloads remain readable offline. Removing a local download retains its cloud copy. Each account and guest library have separate local storage; organizer credentials are never imported.</p>
      {conflicts.map(conflict=><div className="pending-item" key={conflict.edit.id}><strong>Conflicting {conflict.key.split('/').at(-1)?.replace(/^./, character => character.toUpperCase())}</strong><p>Choose a version. History events merge by unique ID. Positions can move backward for rereading.</p><pre>Device: {JSON.stringify(conflict.edit.value,null,2)}</pre><pre>Cloud: {JSON.stringify(conflict.value,null,2)}</pre><div className="dialog-actions"><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,true);await sync()})}>Use This Device</button><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,false);await sync()})}>Use Cloud Version</button></div></div>)}
      {variants.length>0 && <details><summary>Preserved Conflict Versions</summary>{variants.map(edit=><pre key={edit.id}>{edit.key}: {JSON.stringify(edit.value,null,2)}</pre>)}</details>}
    </>}
    <div className="dialog-actions">
      {session && session.user.id !== readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await enterAccount(session.user.id)})}>Open This Account’s Library</button>}
      {session && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();sessionStorage.setItem('connected-login-signed-out','1');const {error}=await readerCloud.auth.signOut({scope:'local'});if(error)throw error;await switchLibrary('')})}>Sign Out & Open Guest Library</button>}
      {readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();await switchLibrary('')})}>Open Guest Library</button>}
    </div>
    <p role="status">{message}</p>
  </Dialog>
}
