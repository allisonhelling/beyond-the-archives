import { describeCloudValue, cloudFieldLabel } from './cloud-model'
import { enableOrganizerSync } from '../../src/lib/reader-connection'
import { AccountSecuritySettings } from '../../src/features/auth/AccountSecuritySettings'
import { verifyCurrentPassword } from '../../src/lib/auth-account'
import { UsernameSettings } from '../../src/features/auth/UsernameSettings'
import { AccountModeSwitch, SignInFields, type AccountMode } from '../../src/features/auth/SignInFields'
import { remembersSession, rememberSession } from '../../src/lib/auth-session-storage'
import { connectedLogin, organizerAppUrl } from '../../src/lib/connected-login'
import { accountConfirmationMessage, confirmPassword, createAccount, isAuthLinkType, signInWithLogin, verifyAuthLink } from '../../src/lib/auth-account'
import { isStorageFull } from './storage-info'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ReaderSection } from './ReaderSettings'
import { restoreOrganizerConnection, clearReaderAuthIntent, readerAuthIntent, importGuestLibrary, readerCloud, resolveCloud, savedConflicts, switchLibrary, type CloudConflict } from './cloud'
import { getBookDetails, loadSetting, transaction, readerOwner } from './storage'
import type { BookDetails, Connection } from './model'
import type { CloudEdit } from './cloud-model'
function ConflictDescription({ edit }: { edit: Pick<CloudEdit, 'key' | 'value'> }) {
 const [book,setBook]=useState<BookDetails>()
 useEffect(()=>{let active=true;void getBookDetails(edit.key.split('/')[0]).then(book=>{if(active)setBook(book)});return()=>{active=false}},[edit.key])
 return <>{book&&<strong>{book.metadata.title}: </strong>}{describeCloudValue(edit.key,edit.value,book)}</>
}
export function ReaderAccount({cloudLibrary=false,asPage=false, onClose, onRefresh, beforeSwitch, onStorageFull, onSync, conflicts }: {cloudLibrary?:boolean; asPage?:boolean; onSync:()=>Promise<unknown>; conflicts:CloudConflict[]; onStorageFull:(error:unknown)=>void; onClose:()=>void; onRefresh:()=>Promise<unknown>; beforeSwitch:()=>Promise<unknown> }) {
  const [mode,setMode]=useState<AccountMode>(()=>new URLSearchParams(location.search).get('auth')==='recovery'?'reset':'login'),[needsPassword,setNeedsPassword]=useState(readerAuthIntent==='invite'||readerAuthIntent==='recovery')
  const [session,setSession]=useState<Session|null>(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const [remember,setRemember]=useState(()=>remembersSession('reader'))
  const [resolved,setResolved]=useState<Set<string>>(new Set())
  const [variants,setVariants]=useState<CloudEdit[]>([])
  useEffect(()=>{
    void (async()=>{
      const params=new URLSearchParams(location.search),token=params.get('token_hash'),type=params.get('type')
      const completesSignup=type==='signup'||(location.pathname==='/auth/callback'&&readerAuthIntent!=='invite'&&readerAuthIntent!=='recovery')
      try {
        if(token&&isAuthLinkType(type)){await verifyAuthLink(readerCloud,token,type);setNeedsPassword(type==='invite'||type==='recovery');history.replaceState(null,'','/')}
        const {data,error}=await readerCloud.auth.getSession();if(error)throw error;setSession(data.session)
        if(data.session&&completesSignup){clearReaderAuthIntent();history.replaceState(null,'','/');await enterAccount(data.session.user.id)}
      }catch{setMessage('This sign-in link is invalid or expired. Request a new recovery link.')}
    })()
    const {data}=readerCloud.auth.onAuthStateChange((event,next)=>{setSession(next);if(event==='PASSWORD_RECOVERY')setNeedsPassword(true);if(event==='SIGNED_OUT')setNeedsPassword(false)})
    void savedConflicts().then(setVariants)
    return ()=>data.subscription.unsubscribe()
  },[])
  const verifyPassword = (password:string) => verifyCurrentPassword(readerCloud,password)
  function changeMode(next:AccountMode) {setMode(next);setMessage('')}
  async function run(action:()=>Promise<unknown>) {
    setBusy(true)
    try {await action();await onRefresh();setVariants(await savedConflicts())} catch(error){if(isStorageFull(error)) onStorageFull(error); else setMessage(error instanceof Error?error.message:String(error))} finally{setBusy(false)}
  }
  async function enterAccount(owner:string) {
    sessionStorage.removeItem('connected-login-signed-out')
    try { await enableOrganizerSync(readerCloud) } catch { setMessage('Signed in. Organizer sync setup will retry when this account library opens.') }
    await beforeSwitch();await switchLibrary(owner)
  }
  return <ReaderSection page={asPage} title={cloudLibrary ? "Cloud Library" : "Reader Account"} busy={busy} onClose={onClose}>
    {!cloudLibrary && <><p>Guest reading stays on this device and works offline without an account. Sign in for cloud storage, cross-device reading state, and organizer connection.</p>
    <p>{readerOwner ? 'Saved Account Library' : 'Guest Library'} · {session?.user.email ?? 'Signed out'}</p>
    {(!session || needsPassword ) && <form className="account-auth-form" onSubmit={event=>{
      event.preventDefault()
      const form=event.currentTarget,fields=new FormData(form),email=String(fields.get('email')??'').trim(),password=String(fields.get('password')??'')
      void run(async()=>{
        if(needsPassword||mode==='signup')confirmPassword(fields)
        if(mode==='signup'&&!needsPassword){
          const session=await createAccount(readerCloud,email,password,String(fields.get('username')??''),`${location.origin}/auth/callback`)
          if(session)await enterAccount(session.user.id)
          else {for(const name of ['password','confirmPassword']){const input=form.elements.namedItem(name);if(input instanceof HTMLInputElement)input.value=''}setMessage(accountConfirmationMessage)}
        } else if(needsPassword){
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
      {mode==='signup'&&!needsPassword&&<p className="field-help">Create one account for both apps, or continue with your existing organizer account.</p>}

      <SignInFields mode={needsPassword?'password':mode} busy={busy} remember={remember} onRememberChange={value=>{setRemember(value);rememberSession('reader',value)}} onToggleMode={()=>changeMode('reset')} />
      <div className="account-auth-actions">
      {!needsPassword&&mode!=='reset'&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{const ok=await connectedLogin(readerCloud,organizerAppUrl(),true);if(!ok){setMessage('Sign in to your connected organizer first, or use your email and password.');return}const {data}=await readerCloud.auth.getSession();if(data.session)await enterAccount(data.session.user.id)})}>Continue From Organizer</button>}
      <button className="primary" disabled={busy}>{busy?'Please Wait…':needsPassword?'Save Password':mode==='reset'?'Send Recovery Link':mode==='signup'?'Create Account':'Sign In'}</button>
      {(needsPassword&&session)&&<button type="button" disabled={busy} onClick={()=>{setNeedsPassword(false);clearReaderAuthIntent();setMessage('')}}>Cancel</button>}
      </div>
      {!needsPassword&&<AccountModeSwitch mode={mode} busy={busy} onChange={changeMode} />}
    </form>}
    {needsPassword && !session && <button disabled={busy} onClick={()=>{setNeedsPassword(false);setMode('reset')}}>Request a New Recovery Link</button>}
    {session && !needsPassword && <>
      <UsernameSettings key={session.user.id} client={readerCloud} disabled={busy} verifyPassword={verifyPassword} />
      <p>Email: {session.user.email}</p>
      <AccountSecuritySettings client={readerCloud} disabled={busy} redirectTo={`${location.origin}/auth/callback`} beforeSignOut={beforeSwitch} afterSignOut={async()=>{sessionStorage.setItem('connected-login-signed-out','1');await switchLibrary('');await onRefresh()}} />
    </>}
    </>}
    {cloudLibrary && !readerOwner && <p>Sign in to Reader Account to store your library in the cloud and sync across devices.</p>}
    {cloudLibrary && session?.user.id === readerOwner && <>
      <p>Organizer sync is enabled automatically for your shared account. This reader registers itself and reuses its connection when you return.</p>
      <details><summary>Advanced Troubleshooting</summary>
        <button disabled={busy} onClick={()=>void run(async()=>{await transaction(['settings'],tx=>tx.objectStore('settings').delete('organizer-disabled-here'));await restoreOrganizerConnection(await loadSetting<Connection>('connection'));setMessage('Organizer sync restored on this device.')})}>Repair Organizer Connection</button>
        <p>Sign in with the same account in both apps. Each reader installation has its own revocable credential.</p>
      </details>
      <div className="dialog-actions"><button disabled={busy} onClick={()=>void run(onSync)}>Sync Now</button><button disabled={busy} onClick={()=>{if(confirm('Copy guest books, notes, and history into this account? Existing account versions are skipped. The guest library stays on this device.')) void run(async()=>{await importGuestLibrary();await onSync()})}}>Import Guest Library</button></div>
      <p>Downloads remain readable offline. Removing a local download retains its cloud copy. Each account and guest library have separate local storage; organizer credentials are never imported.</p>
      {conflicts.filter(conflict=>!resolved.has(conflict.edit.id)).map(conflict=><div className="pending-item" key={conflict.edit.id}><strong>Conflicting {cloudFieldLabel(conflict.key)}</strong><p>This device and the cloud changed {cloudFieldLabel(conflict.key).toLowerCase()} independently. Choose which version to keep.</p><p>This device: <ConflictDescription edit={{key:conflict.key,value:conflict.edit.value}} /></p><p>Cloud: <ConflictDescription edit={conflict} /></p><div className="dialog-actions conflict-actions"><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,true);setResolved(current=>new Set([...current,conflict.edit.id]));await onSync()})}>Use This Device</button><button disabled={busy} onClick={()=>void run(async()=>{await resolveCloud(conflict,false);setResolved(current=>new Set([...current,conflict.edit.id]));await onSync()})}>Use Cloud Version</button></div></div>)}
      {variants.length>0 && <details><summary>Preserved Conflict Versions</summary>{variants.map(edit=><p key={edit.id}><strong>{cloudFieldLabel(edit.key)}</strong>: <ConflictDescription edit={edit} /></p>)}</details>}
    </>}
    <div className="dialog-actions">
      {session && session.user.id !== readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await enterAccount(session.user.id)})}>Open This Account’s Library</button>}
      {session && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();sessionStorage.setItem('connected-login-signed-out','1');const {error}=await readerCloud.auth.signOut({scope:'local'});if(error)throw error;await switchLibrary('')})}>Sign Out & Open Guest Library</button>}
      {readerOwner && <button disabled={busy} onClick={()=>void run(async()=>{await beforeSwitch();await switchLibrary('')})}>Open Guest Library</button>}
    </div>
    <p role="status">{message}</p>
  </ReaderSection>
}
