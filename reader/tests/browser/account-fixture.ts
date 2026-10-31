import type { BrowserContext, Page } from '@playwright/test'
export const owner='10000000-0000-0000-0000-000000000001'
export function accountSession() {return {access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`,refresh_token:'mock-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:owner,email:'reader@example.com',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01'}}}
export async function signedIn(context:BrowserContext) {
 await context.addInitScript(({owner,session})=>{
  if (localStorage.getItem('cloud-test-initialized')) return
  localStorage.setItem('cloud-test-initialized','true')
  localStorage.setItem('reader-cloud-owner',owner)
  localStorage.setItem('reader-cloud-auth',JSON.stringify(session))
 },{owner,session:accountSession()})
}
export async function account(page:Page){await page.getByRole('button',{name:'Profile Menu',exact:true}).click();await page.getByRole('button',{name:'Reader Account',exact:true}).click()}
