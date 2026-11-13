import { loadEnv } from 'vite'
import { requireEnvironmentConfig } from '../../../src/lib/environment'
export const testOrganizer = requireEnvironmentConfig(loadEnv('production', process.cwd(), 'VITE_'))
import type { BrowserContext, Page } from '@playwright/test'
export const owner='10000000-0000-0000-0000-000000000001'
export function accountSession() {return {access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`,refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:owner,email:'reader@example.com',email_confirmed_at:'2026-01-01',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01'}}}
export async function signedIn(context:BrowserContext) {
 await context.addInitScript(({owner,session})=>{
  if (localStorage.getItem('cloud-test-initialized')) return
  localStorage.setItem('cloud-test-initialized','true')
  localStorage.setItem('reader-cloud-owner',owner)
  localStorage.setItem('reader-cloud-auth',JSON.stringify(session))
 },{owner,session:accountSession()})
}
export async function account(page:Page){await page.getByRole('button',{name:'Profile Menu',exact:true}).click();await page.getByRole('button',{name:'Reader Account',exact:true}).click()}

// Account-backed organizer tests still stub cloud traffic independently of the
// companion RPC, which each test supplies for its own metadata/progress scenario.
export async function organizerAccount(context:BrowserContext) {
 await signedIn(context)
 let linked=false
 await context.route(url=>/^\/(auth|rest|storage)\/v1\//.test(url.pathname)&&!url.pathname.endsWith('/userscript_library'),async route=>{
  const path=new URL(route.request().url()).pathname,input=route.request().headers()['content-type']?.includes('application/json')&&route.request().method()==='POST'?route.request().postDataJSON():{}
  if(path==='/auth/v1/user')return route.fulfill({json:accountSession().user})
  if(path==='/auth/v1/token')return route.fulfill({json:accountSession()})
  if(path==='/rest/v1/reader_app_access')return route.fulfill({json:{user_id:owner}})
  if(path==='/rest/v1/rpc/library_revision')return route.fulfill({json:0})
  if(path==='/rest/v1/rpc/reader_organizer_connection'){
   if(input.p_action==='enable')linked=true
   if(input.p_action==='disable')linked=false
   return route.fulfill({json:{enabled:linked,userId:owner}})
  }
  if(path==='/rest/v1/rpc/reader_cloud_apply')return route.fulfill({json:{key:input.p_key,value:input.p_value,revision:input.p_base+1}})
  return route.fulfill({json:path.startsWith('/storage/')?{}:[]})
 })
 await context.route(`${testOrganizer.organizerUrl}/auth/bridge`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Signed Out Organizer</title>'}))
}

export async function cloudLibrary(page:Page){await page.getByRole('button',{name:'Profile Menu',exact:true}).click();await page.getByRole('button',{name:'Cloud Library',exact:true}).click()}
