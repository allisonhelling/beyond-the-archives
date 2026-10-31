import { test, expect, type BrowserContext } from '@playwright/test'
import { account, accountSession, owner, signedIn } from './account-fixture'
async function backend(context:BrowserContext,linked=false){
 const devices:string[]=[]
 await context.route(url=>/^\/(auth|rest|storage)\/v1\//.test(url.pathname),async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/auth/v1/token')return route.fulfill({json:accountSession()})
  if(path==='/auth/v1/user')return route.fulfill({json:accountSession().user})
  if(path==='/rest/v1/reader_app_access')return route.fulfill({json:{user_id:owner}})
  if(path==='/rest/v1/rpc/reader_organizer_connection'){
   const input=route.request().postDataJSON()
   if(input.p_action==='enable')linked=true
   if(input.p_action==='disable')linked=false
   if(input.p_action==='restore'){devices.push(input.p_installation);return route.fulfill({json:{enabled:linked,userId:owner,secret:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString()}})}
   return route.fulfill({json:{enabled:linked}})
  }
  return route.fulfill({json:path.includes('reader_cloud_values')||path.includes('reader_import_inbox')?[]:{}})
 })
 // Tests that do not exercise cross-origin login should never contact the hosted application.
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Signed Out Organizer</title>'}))
 return devices
}
test('signs in with an existing email/password and opens an isolated account library',async({page,context})=>{
 await backend(context)
 let credentials:unknown
 await context.route('**/auth/v1/token?grant_type=password',route=>{credentials=route.request().postDataJSON();return route.fulfill({json:accountSession()})})
 await page.goto('/');await account(page)
 await page.getByLabel('Email',{exact:true}).fill('reader@example.com')
 await page.getByLabel('Password',{exact:true}).fill('ValidPassword123!')
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Sign In',exact:true}).click()])
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
 expect(credentials).toMatchObject({email:'reader@example.com',password:'ValidPassword123!'})
 await account(page)
 await expect(page.getByText('Saved Account Library',{exact:false})).toContainText('reader@example.com')
 await expect(page.getByRole('button',{name:'Set or Change Password',exact:true})).toBeVisible()
})
test('recovers a password back to the reader and saves a new password',async({page,context})=>{
 await backend(context)
 let redirect=''
 await context.route('**/auth/v1/recover*',route=>{redirect=new URL(route.request().url()).searchParams.get('redirect_to')??'';return route.fulfill({json:{}})})
 await page.goto('/');await account(page)
 await page.getByRole('button',{name:'Forgot Your Password?',exact:true}).click()
 await page.getByLabel('Email',{exact:true}).fill('reader@example.com')
 await page.getByRole('button',{name:'Send Recovery Link',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'a recovery link is on its way'})).toBeVisible()
 expect(redirect).toBe(`${new URL(page.url()).origin}/auth/callback`)
 await context.addInitScript(session=>localStorage.setItem('reader-cloud-auth',JSON.stringify(session)),accountSession())
 let password=''
 await context.route('**/auth/v1/user',route=>{if(route.request().method()==='PUT')password=route.request().postDataJSON().password;return route.fulfill({json:accountSession().user})})
 await page.goto('/?type=recovery')
 await expect(page.getByLabel('New Password',{exact:true})).toBeVisible()
 await page.getByLabel('New Password',{exact:true}).fill('NewValidPassword123!')
 await page.getByRole('button',{name:'Save Password',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Password saved.'})).toBeVisible()
 expect(password).toBe('NewValidPassword123!')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click();await account(page)
 await expect(page.getByRole('button',{name:'Set or Change Password',exact:true})).toBeVisible()
})
test('restores the account organizer association on a new device and respects local disconnect',async({page,context})=>{
 await signedIn(context);const devices=await backend(context,true)
 await page.goto('/')
 await expect.poll(()=>devices.length).toBe(1)
 await account(page)
 await expect(page.getByLabel('Use Organizer Connection Across Devices')).toBeChecked()
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.getByRole('button',{name:'Profile Menu',exact:true}).click()
 await page.getByRole('button',{name:'Organizer & Sync',exact:true}).click()
 await page.getByRole('button',{name:'Disconnect Organizer',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Organizer & Sync',exact:true})).toBeHidden()
 await page.reload();await page.getByRole('button',{name:'Profile Menu',exact:true}).click()
 await expect(page.getByRole('button',{name:'Connect Organizer',exact:true})).toBeVisible()
 expect(devices).toHaveLength(1)
})
test('automatically opens the reader account through an origin-bound organizer handoff',async({page,context})=>{
 await backend(context,true)
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><script>addEventListener('message',e=>{if(e.source===parent&&e.data.kind==='connected-login-request')parent.postMessage({kind:'connected-login-result',nonce:e.data.nonce,code:'${'b'.repeat(64)}'},e.origin)});</script>`}))
 let verifier=''
 await context.route('**/functions/v1/app-login',route=>{verifier=route.request().postDataJSON().verifier;return route.fulfill({json:{access_token:accountSession().access_token,refresh_token:'independent-refresh'}})})
 await page.goto('/')
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
 expect(verifier).toMatch(/^[a-f0-9]{64}$/)
 await expect(page.locator('iframe[title="Connected Account Sign-In"]')).toHaveCount(0)
})

test('offers popup login when the browser cannot use the embedded organizer session',async({page,context})=>{
 await backend(context,true)
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>{
  const popup=route.request().frame().parentFrame()===null
  return route.fulfill({contentType:'text/html',body:popup?`<!doctype html><script>const target=opener;addEventListener('message',e=>{if(e.source===target&&e.data.kind==='connected-login-request')target.postMessage({kind:'connected-login-result',nonce:e.data.nonce,code:'${'b'.repeat(64)}'},e.origin)});target.postMessage({kind:'connected-login-ready'},'${'http://127.0.0.1:4174'}');</script>`:'<!doctype html><title>Storage Blocked</title>'})
 })
 await context.route('**/functions/v1/app-login',route=>route.fulfill({json:{access_token:accountSession().access_token,refresh_token:'popup-refresh'}}))
 await page.goto('/');await account(page)
 await page.getByRole('button',{name:'Continue From Organizer',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
})
