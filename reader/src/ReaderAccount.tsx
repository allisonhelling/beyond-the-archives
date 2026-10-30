import { isStorageFull } from './storage-info'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Dialog } from '../../src/components/Dialog'
import { cloudShelf, downloadCloud, importGuestLibrary, readerCloud, resolveCloud, savedConflicts, switchLibrary, syncCloud, type CloudConflict } from './cloud'
import { readerOwner } from './storage'
import type { CatalogBook } from './model'
import type { CloudEdit } from './cloud-model'
export function ReaderAccount({ onClose, onRefresh, beforeSwitch, onStorageFull }: { onStorageFull:(error:unknown)=>void; onClose:()=>void; onRefresh:()=>Promise<unknown>; beforeSwitch:()=>Promise<unknown> }) {
  const [session,setSession]=useState<Session|null>(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const [conflicts,setConflicts]=useState<CloudConflict[]>([]),[shelf,setShelf]=useState<CatalogBook[]>([]),[variants,setVariants]=useState<CloudEdit[]>([])
  useEffect(()=>{
    void readerCloud.auth.getSession().then(({data})=>setSession(data.session))
    const {data}=readerCloud.auth.onAuthStateChange((_event,next)=>setSession(next))
    void cloudShelf().then(setShelf); void savedConflicts().then(setVariants)
    return ()=>data.subscription.unsubscribe()
  },[])
  async function run(action:()=>Promise<unknown>) {
    setBusy(true)
    try {await action();await onRefresh();setShelf(await cloudShelf());setVariants(await savedConflicts())} catch(error){if(isStorageFull(error)) onStorageFull(error); else setMessage(error instanceof Error?error.message:String(error))} finally{setBusy(false)}
  }
  async function sync() {if(!navigator.onLine){setMessage('Offline. Downloads remain available and local edits will retry when online.');return}setConflicts(await syncCloud());setMessage('Cloud sync finished. Review conflicting edits below. The app must stay open to sync.')}
  return <Dialog title="Reader Account & Cloud Library" busy={busy} onClose={onClose}>
    <p>Guest reading works offline without an account. A reader account adds private EPUB storage and cross-device reading state. Organizer connection is a separate choice.</p>
    <p>{readerOwner ? 'Saved Account Library' : 'Guest Library'} · {session?.user.email ?? 'Signed out'}</p>
    {!session && <form onSubmit={event=>{event.preventDefault();const email=String(new FormData(event.currentTarget).get('email'));void run(async()=>{const {error}=await readerCloud.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin}});if(error)throw error;setMessage('Check your email for a sign-in link. Invited reader accounts only. This also restores access without a password.')})}}><label>Email<input name="email" type="email" autoComplete="email" required /></label><button disabled={busy}>Email Sign-In Link</button></form>}
    {session && session.user.id !== readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();await switchLibrary(session.user.id)})}>Open This Account’s Library</button>}
    {session?.user.id === readerOwner && <>
      <div className="dialog-actions"><button disabled={busy} onClick={()=>void run(sync)}>Sync Cloud Now</button><button disabled={busy} onClick={()=>{if(confirm('Copy guest books, notes, and history into this account? Existing account versions are skipped. The guest library stays on this device.')) void run(async()=>{await importGuestLibrary();await sync()})}}>Import Guest Library</button></div>
      <p>Downloads remain readable offline. Removing a local download retains its cloud copy. Each account and guest library have separate local storage; organizer credentials are never imported.</p>
      {shelf.map(book=><div className="pending-item" key={book.id}><strong>{book.metadata.title}</strong><p>Version {book.id.slice(0,12)}</p><button disabled={busy} onClick={()=>void run(()=>downloadCloud(book.id))}>Download EPUB</button></div>)}
      {conflicts.map(conflict=><div className="pending-item" key={conflict.edit.id}><strong>Conflicting {conflict.key.split('/').at(-1)?.replace(/^./, character => character.toUpperCase())}</strong><p>Choose a version. History events merge by unique ID. Positions can move backward for rereading.</p><pre>Device: {JSON.stringify(conflict.edit.value,null,2)}</pre><pre>Cloud: {JSON.stringify(conflict.value,null,2)}</pre><div className="dialog-actions"><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,true);await sync()})}>Use This Device</button><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,false);await sync()})}>Use Cloud Version</button></div></div>)}
      {variants.length>0 && <details><summary>Preserved Conflict Versions</summary>{variants.map(edit=><pre key={edit.id}>{edit.key}: {JSON.stringify(edit.value,null,2)}</pre>)}</details>}
    </>}
    {session && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();const {error}=await readerCloud.auth.signOut({scope:'local'});if(error)throw error;await switchLibrary('')})}>Sign Out & Open Guest Library</button>}
    {readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();await switchLibrary('')})}>Open Guest Library</button>}
    <p role="status">{message}</p>
  </Dialog>
}
