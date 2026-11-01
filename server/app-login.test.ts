// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { appLoginHandler } from './app-login'
const organizer='https://organizer.example',reader='https://reader.example',id='verified-user'
let linked:boolean,allowed:boolean,consumed:boolean
let admin:SupabaseClient
const verify=vi.fn(),getUser=vi.fn(),generateLink=vi.fn(),consume=vi.fn(),insert=vi.fn()
beforeEach(()=>{
 linked=true;allowed=true;consumed=false;vi.clearAllMocks()
 getUser.mockResolvedValue({data:{user:{id,email:'owner@example.com',email_confirmed_at:'2026-10-31'}},error:null})
 generateLink.mockResolvedValue({data:{properties:{hashed_token:'one-time-email-token'}},error:null})
 verify.mockResolvedValue({access_token:'new-access-token',refresh_token:'new-refresh-token',user:{id}} as Session)
 consume.mockImplementation(async()=>({data:consumed?null:(consumed=true,id),error:null}))
 insert.mockResolvedValue({error:null})
 admin={auth:{getUser,admin:{getUserById:async()=>({data:{user:{id,email:'owner@example.com',email_confirmed_at:'2026-10-31'}},error:null}),generateLink}},rpc:consume,from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,lte:()=>Promise.resolve({error:null}),delete:()=>query,maybeSingle:async()=>({data:(table==='reader_organizer_links'?linked:allowed)?{user_id:id}:null,error:null}),insert,then:(resolve:(result:unknown)=>unknown)=>Promise.resolve({count:0,error:null}).then(resolve)}
  return query
 }} as unknown as SupabaseClient
})
const request=(input:unknown,origin=organizer,authorization='Bearer source-session')=>new Request('https://backend.example/functions/v1/app-login',{method:'POST',headers:{origin,authorization,'Content-Type':'application/json'},body:JSON.stringify(input)})
const issue=()=>({action:'issue',target:reader,challenge:'a'.repeat(64)})
it('rejects unknown origins, unauthenticated users, and unlinked accounts',async()=>{
 const handler=appLoginHandler(admin,[organizer,reader],verify)
 expect((await handler(request(issue(),'https://attacker.example'))).status).toBe(403)
 expect((await handler(request(issue(),organizer,''))).status).toBe(401)
 getUser.mockResolvedValueOnce({data:{user:null},error:new Error('expired')})
 expect((await handler(request(issue()))).status).toBe(401)
 linked=false;expect((await handler(request(issue()))).status).toBe(403)
 expect(insert).not.toHaveBeenCalled();expect(verify).not.toHaveBeenCalled()
})
it('issues only hashed, short-lived codes for the verified source account',async()=>{
 const response=await appLoginHandler(admin,[organizer,reader],verify)(request({...issue(),user_id:'victim'}))
 const {code}=await response.json();expect(code).toMatch(/^[a-f0-9]{64}$/)
 expect(insert).toHaveBeenCalledWith({code_hash:expect.stringMatching(/^[a-f0-9]{64}$/),challenge:'a'.repeat(64),target_origin:reader,user_id:id})
 expect(insert.mock.calls[0][0].code_hash).not.toBe(code)
 expect(response.headers.get('Cache-Control')).toBe('no-store');expect(response.headers.get('Access-Control-Allow-Origin')).toBe(organizer)
})
it('redeems once and creates a new session without returning the source token',async()=>{
 const handler=appLoginHandler(admin,[organizer,reader],verify),input={action:'redeem',code:'b'.repeat(64),verifier:'c'.repeat(64)}
 const response=await handler(request(input,reader))
 expect(await response.json()).toEqual({access_token:'new-access-token',refresh_token:'new-refresh-token'})
 expect(generateLink).toHaveBeenCalledWith({type:'magiclink',email:'owner@example.com'})
 expect(verify).toHaveBeenCalledWith('one-time-email-token')
 expect(consume.mock.calls[0][1]).toMatchObject({p_origin:reader,p_hash:expect.any(String),p_challenge:expect.any(String)})
 expect((await handler(request(input,reader))).status).toBe(401)
})
it('denies revoked reader access, identity mismatches, and malformed inputs',async()=>{
 const handler=appLoginHandler(admin,[organizer,reader],verify)
 expect((await handler(request({...issue(),target:'https://attacker.example'}))).status).toBe(400)
 expect((await handler(request({action:'redeem',code:'short',verifier:'short'},reader))).status).toBe(400)
 allowed=false;expect((await handler(request({action:'redeem',code:'b'.repeat(64),verifier:'c'.repeat(64)},reader))).status).toBe(403)
 allowed=true;consumed=false;verify.mockResolvedValueOnce({access_token:'secret',user:{id:'wrong-user'}})
 const response=await handler(request({action:'redeem',code:'b'.repeat(64),verifier:'c'.repeat(64)},reader))
 expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret')
})

it('verifies username passwords without returning the resolved email',async()=>{
 const passwordLogin=vi.fn().mockResolvedValue({access_token:'access',refresh_token:'refresh'})
 consume.mockResolvedValue({data:'private@example.com',error:null})
 const handler=appLoginHandler(admin,[organizer,reader],verify,passwordLogin)
 const response=await handler(request({action:'password',username:' Reader ',password:'ValidPassword123!'},reader,''))
 expect(consume).toHaveBeenCalledWith('account_login_email',{p_username:'Reader'})
 expect(passwordLogin).toHaveBeenCalledWith('private@example.com','ValidPassword123!')
 expect(await response.json()).toEqual({access_token:'access',refresh_token:'refresh'})
 consume.mockResolvedValue({data:null,error:null})
 const missing=await handler(request({action:'password',username:'missing',password:'wrong'}))
 consume.mockResolvedValue({data:'private@example.com',error:null});passwordLogin.mockRejectedValue(new Error('Invalid password for private@example.com'))
 const incorrect=await handler(request({action:'password',username:'Reader',password:'wrong'}))
 expect(missing.status).toBe(401);expect(incorrect.status).toBe(401)
 expect(await missing.json()).toEqual(await incorrect.json())
})

it('permits an explicit login without enabling organizer synchronization',async()=>{
 linked=false
 const handler=appLoginHandler(admin,[organizer,reader],verify)
 expect((await handler(request(issue()))).status).toBe(403)
 const response=await handler(request({...issue(),userRequested:true}))
 expect(response.status).toBe(200)
 expect(insert).toHaveBeenCalledWith(expect.objectContaining({user_requested:true,user_id:id}))
 allowed=false
 expect((await handler(request({...issue(),userRequested:true}))).status).toBe(403)
})
