import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { connectedLogin, serveConnectedLogin } from './connected-login'
const origin='https://other.example'
const getSession=vi.fn(),invoke=vi.fn(),setSession=vi.fn()
const client={auth:{getSession,setSession},functions:{invoke}} as unknown as SupabaseClient
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto)
 getSession.mockReset().mockResolvedValue({data:{session:null}})
 invoke.mockReset().mockResolvedValue({data:{access_token:'new-access',refresh_token:'new-refresh'},error:null})
 setSession.mockReset().mockResolvedValue({error:null})
})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
async function frame(){for(let i=0;i<100;i++){const node=document.querySelector('iframe');if(node)return node;await new Promise(resolve=>setTimeout(resolve,5))}throw new Error('No bridge frame')}
it('ignores messages from other origins and windows, and redeems only a matching challenge response',async()=>{
 const promise=connectedLogin(client,origin),bridge=await frame(),target=bridge.contentWindow!
 const post=vi.spyOn(target,'postMessage')
 const send=(data:unknown,messageOrigin=origin,source:Window=target)=>window.dispatchEvent(new MessageEvent('message',{data,origin:messageOrigin,source}))
 send({kind:'connected-login-ready'})
 const request=post.mock.calls.at(-1)![0] as {nonce:string;challenge:string}
 expect(request.challenge).toMatch(/^[a-f0-9]{64}$/)
 const response={kind:'connected-login-result',nonce:request.nonce,code:'a'.repeat(64)}
 send(response,'https://attacker.example');send(response,origin,window);send({...response,nonce:'wrong'})
 expect(invoke).not.toHaveBeenCalled()
 send(response)
 expect(await promise).toBe(true)
 expect(invoke).toHaveBeenCalledWith('app-login',{body:{action:'redeem',code:response.code,verifier:expect.stringMatching(/^[a-f0-9]{64}$/)}})
 expect(setSession).toHaveBeenCalledWith({access_token:'new-access',refresh_token:'new-refresh'})
 expect(document.querySelector('iframe')).toBeNull()
})
it('keeps password sign-in available when the other app is signed out',async()=>{
 const promise=connectedLogin(client,origin),bridge=await frame(),target=bridge.contentWindow!,post=vi.spyOn(target,'postMessage')
 window.dispatchEvent(new MessageEvent('message',{origin,source:target,data:{kind:'connected-login-ready'}}))
 const request=post.mock.calls.at(-1)![0] as {nonce:string}
 window.dispatchEvent(new MessageEvent('message',{origin,source:target,data:{kind:'connected-login-result',nonce:request.nonce}}))
 expect(await promise).toBe(false);expect(setSession).not.toHaveBeenCalled()
})
it('does not automatically sign back in after explicit sign-out, or accept a bridge without an opener',async()=>{
 sessionStorage.setItem('connected-login-signed-out','1')
 expect(await connectedLogin(client,origin)).toBe(false)
 serveConnectedLogin(client,origin)
 window.dispatchEvent(new MessageEvent('message',{origin,source:window,data:{kind:'connected-login-request',challenge:'a'.repeat(64),nonce:'b'.repeat(64)}}))
 expect(invoke).not.toHaveBeenCalled()
})
