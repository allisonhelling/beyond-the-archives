import { sha256 as digest, randomSecret as random } from './crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readerBaseUrl } from './reader-connection'
import { requireRuntimeEnvironmentConfig } from './environment'
import { sampleMode } from './sample-mode'
export const organizerAppUrl = () => readerBaseUrl(sampleMode ? 'http://127.0.0.1:5173/' : requireRuntimeEnvironmentConfig(import.meta.env).organizerUrl).href
export const readerAppUrl = () => readerBaseUrl(sampleMode ? 'http://127.0.0.1:5174/' : requireRuntimeEnvironmentConfig(import.meta.env).readerUrl).href
export const isLoginBridge = () => location.pathname==='/auth/bridge'

type BridgeResult = { code?: string; error?: 'signed-out' | 'access-denied' | 'unavailable' | 'account-changed' }
const handoffChannel = 'connected-account-login:v1'
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export async function issueHandoff(client: SupabaseClient, target: string, challenge: string, userRequested: boolean, expectedUserId?: string): Promise<BridgeResult> {
 try {
  const { data, error } = await client.auth.getSession()
  if (error) return { error: 'unavailable' }
  if (!data.session) return { error: 'signed-out' }
  if (expectedUserId && data.session.user.id !== expectedUserId) return { error: 'account-changed' }
  const result = await client.functions.invoke('app-login', { body: { action: 'issue', target, challenge, ...(userRequested ? { userRequested: true } : {}) }, ...(expectedUserId ? { headers: { Authorization: `Bearer ${data.session.access_token}` } } : {}) })
  if (result.error || !validSecret(result.data?.code)) return { error: result.error?.context?.status === 403 ? 'access-denied' : 'unavailable' }
  return { code: result.data.code }
 } catch { return { error: 'unavailable' } }
}

// A tab-only Auth session stays in its original tab. That tab can issue a
// verifier-bound ticket without copying its Auth tokens to the popup or channel.
export function serveConnectedLoginInTab(client: SupabaseClient, otherApp: string) {
 if (typeof BroadcastChannel === 'undefined') return
 const trusted = new URL(otherApp).origin
 let channel: BroadcastChannel
 try { channel = new BroadcastChannel(handoffChannel) } catch { return }
 let active = true
 channel.onmessage = async ({ data }) => {
  if (data?.kind !== 'connected-login-tab-request' || data.target !== trusted || data.userRequested !== true || !validSecret(data.challenge) || !validSecret(data.nonce)) return
  const result = await issueHandoff(client, trusted, data.challenge, true)
  if (active && result.error !== 'signed-out') channel.postMessage({ kind: 'connected-login-tab-result', nonce: data.nonce, ...result })
 }
 const close = () => { active = false; channel.close() }
 window.addEventListener('pagehide', close, { once: true })
 return () => { window.removeEventListener('pagehide', close); close() }
}
function handoffFromOpenTab(target: string, challenge: string, nonce: string): Promise<BridgeResult> {
 if (typeof BroadcastChannel === 'undefined') return Promise.resolve({ error: 'signed-out' })
 return new Promise(resolve => {
  let channel: BroadcastChannel
  try { channel = new BroadcastChannel(handoffChannel) } catch { resolve({ error: 'signed-out' }); return }
  let failure: BridgeResult = { error: 'signed-out' }
  const finish = (result: BridgeResult) => { clearTimeout(timer); channel.close(); resolve(result) }
  const timer = setTimeout(() => finish(failure), 15000)
  channel.onmessage = ({ data }) => {
   if (data?.kind !== 'connected-login-tab-result' || data.nonce !== nonce) return
   if (validSecret(data.code)) finish({ code: data.code })
   else if (data.error === 'access-denied' || data.error === 'unavailable') failure = { error: data.error }
  }
  channel.postMessage({ kind: 'connected-login-tab-request', target, challenge, nonce, userRequested: true })
 })
}

// Only the configured other app can ask this isolated page for a handoff.
export function serveConnectedLogin(client: SupabaseClient, otherApp: string) {
 const trusted = new URL(otherApp).origin, requester = window.opener || (window.parent !== window ? window.parent : null)
 if (!requester) return
 const userRequested = Boolean(window.opener)
 let handled = false
 const respond = async (event: MessageEvent) => {
  if (handled || event.source !== requester || event.origin !== trusted || event.data?.kind !== 'connected-login-request' || !validSecret(event.data.challenge) || !validSecret(event.data.nonce)) return
  handled = true
  let result = await issueHandoff(client, trusted, event.data.challenge, userRequested)
  if (userRequested && result.error === 'signed-out') result = await handoffFromOpenTab(trusted, event.data.challenge, event.data.nonce)
  requester.postMessage({ kind: 'connected-login-result', nonce: event.data.nonce, ...result }, trusted)
 }
 window.addEventListener('message', respond)
 requester.postMessage({ kind: 'connected-login-ready' }, trusted)
 return () => window.removeEventListener('message', respond)
}

let pending: Promise<boolean>|undefined
export function connectedLogin(client:SupabaseClient,otherApp:string,popup=false):Promise<boolean>{
 if(!popup && sessionStorage.getItem('connected-login-signed-out'))return Promise.resolve(false)
 if(pending&&!popup)return pending
 const url=readerBaseUrl(otherApp);url.pathname='/auth/bridge'
 // Opening during the click lets browsers permit the fallback window.
 const tab=popup?window.open('about:blank','connected-account-login','popup,width=480,height=600'):null
 if(popup&&!tab)return Promise.reject(new Error('Allow the sign-in popup or use your email and password.'))
 pending=(async()=>{
  if((await client.auth.getSession()).data.session){tab?.close();return true}
  const verifier=random(),challenge=await digest(verifier),nonce=random()
  return new Promise<boolean>((resolve,reject)=>{
   const frame=popup?undefined:document.createElement('iframe')
   if(frame){frame.hidden=true;frame.title='Connected Account Sign-In';frame.src=url.href;frame.referrerPolicy='no-referrer'}
   let exchanged=false,expired=false
   const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame?.remove();tab?.close()}
   const send=()=>{const target=tab??frame?.contentWindow;target?.postMessage({kind:'connected-login-request',challenge,nonce},url.origin)}
   const receive=async(event:MessageEvent)=>{
    if(event.origin!==url.origin||event.source!==(tab??frame?.contentWindow))return
    if(event.data?.kind==='connected-login-ready'){send();return}
    if(exchanged||event.data?.kind!=='connected-login-result'||event.data.nonce!==nonce)return
    exchanged=true
    if(!validSecret(event.data.code)){
     cleanup()
     if(popup)reject(new Error(event.data.error === 'signed-out' ? 'No active account was found in the other app. Keep its signed-in tab open and try again, or sign in here with your username or email.' : event.data.error === 'access-denied' ? 'This account cannot use connected sign-in. Check its reader access, or sign in here with your username or email.' : 'The other app could not complete sign-in. Try again, or sign in here with your username or email.'))
     else resolve(false)
     return
    }
    try {
     // An explicit sign-in always wins over a delayed automatic handoff.
     if((await client.auth.getSession()).data.session){cleanup();resolve(true);return}
     const result=await client.functions.invoke('app-login',{body:{action:'redeem',code:event.data.code,verifier}})
     if(result.error||!result.data?.access_token||!result.data?.refresh_token)throw new Error('Connected sign-in failed. Use your email and password.')
     const active=(await client.auth.getSession()).data.session
     if(expired)return
     if(!active){const {error}=await client.auth.setSession(result.data);if(error)throw error}
     sessionStorage.removeItem('connected-login-signed-out');cleanup();resolve(true)
    }catch(error){cleanup();reject(error)}
   }
   const timer=setTimeout(()=>{expired=true;cleanup();resolve(false)},popup?60000:4000)
   window.addEventListener('message',receive)
   if(frame){frame.addEventListener('load',send,{once:true});document.body.append(frame)}
   if(tab){try{tab.location.replace(url.href)}catch{cleanup();resolve(false)}}
  })
 })().finally(()=>{pending=undefined})
 return pending
}
