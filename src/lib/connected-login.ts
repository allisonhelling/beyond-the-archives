import { sha256 as digest, randomSecret as random } from './crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hostedReaderUrl, readerBaseUrl } from './reader-connection'
export const organizerAppUrl = () => readerBaseUrl(import.meta.env.VITE_ORGANIZER_URL || 'https://beyondthearchives.vercel.app/').href
export const readerAppUrl = () => readerBaseUrl(import.meta.env.VITE_READER_URL || hostedReaderUrl).href
export const isLoginBridge = () => location.pathname==='/auth/bridge'

// Only the configured other app can ask this isolated page for a handoff.
export function serveConnectedLogin(client: SupabaseClient, otherApp: string) {
 const trusted=new URL(otherApp).origin, requester=window.opener || (window.parent!==window?window.parent:null)
 if(!requester)return
 let handled=false
 const respond=async(event:MessageEvent)=>{
  if(handled||event.source!==requester||event.origin!==trusted||event.data?.kind!=='connected-login-request'||!/^[a-f0-9]{64}$/.test(event.data.challenge)||!/^[a-f0-9]{64}$/.test(event.data.nonce))return
  handled=true
  try {
   const {data}=await client.auth.getSession()
   if(!data.session)throw new Error('No active session')
   const result=await client.functions.invoke('app-login',{body:{action:'issue',target:trusted,challenge:event.data.challenge}})
   if(result.error||typeof result.data?.code!=='string')throw new Error('Sign-in unavailable')
   requester.postMessage({kind:'connected-login-result',nonce:event.data.nonce,code:result.data.code},trusted)
  } catch {requester.postMessage({kind:'connected-login-result',nonce:event.data.nonce},trusted)}
 }
 window.addEventListener('message',respond)
 requester.postMessage({kind:'connected-login-ready'},trusted)
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
    if(!/^[a-f0-9]{64}$/.test(event.data.code??'')){cleanup();resolve(false);return}
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
