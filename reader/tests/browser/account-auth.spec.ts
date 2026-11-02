import { blankMetadata } from '../../src/model'
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
for(const identifier of ['reader@example.com','Reader']) test(`signs in with ${identifier} and opens an isolated account library`,async({page,context})=>{
 await backend(context)
 let credentials:unknown
 await context.route('**/auth/v1/token?grant_type=password',route=>{credentials=route.request().postDataJSON();return route.fulfill({json:accountSession()})})
 await context.route('**/functions/v1/app-login',route=>{credentials=route.request().postDataJSON();return route.fulfill({json:{access_token:accountSession().access_token,refresh_token:accountSession().refresh_token}})})
 await page.goto('/');await account(page)
 await expect(page.getByRole('checkbox',{name:'Remember Me',exact:true})).toBeChecked()
 await page.getByRole('checkbox',{name:'Remember Me',exact:true}).uncheck()
 await page.getByLabel('Username or Email',{exact:true}).fill(identifier)
 await page.getByLabel('Password',{exact:true}).fill('ValidPassword123!')
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Sign In',exact:true}).click()])
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
 expect(credentials).toMatchObject(identifier.includes('@')?{email:identifier,password:'ValidPassword123!'}:{action:'password',username:identifier,password:'ValidPassword123!'})
 expect(await page.evaluate(()=>localStorage.getItem('reader-cloud-auth'))).toBeNull()
 expect(await page.evaluate(()=>Boolean(sessionStorage.getItem('reader-cloud-auth')))).toBe(true)
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
  const recoveryEmail=page.getByLabel('Email Address',{exact:true})
  await expect(recoveryEmail).toHaveAttribute('type','email')
  await recoveryEmail.fill('Reader')
  expect(await recoveryEmail.evaluate((input:HTMLInputElement)=>input.checkValidity())).toBe(false)
  const send=(await page.getByRole('button',{name:'Send Recovery Link',exact:true}).boundingBox())!
  const back=page.getByRole('button',{name:'Back to Sign In',exact:true})
  expect((await back.boundingBox())!.y).toBeGreaterThanOrEqual(send.y+send.height)
  await expect(back).toHaveCSS('font-size','13px')
 await page.getByLabel('Email Address',{exact:true}).fill('reader@example.com')
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

for(const mode of ['login','signup']) test(`offers popup login from ${mode} when the browser cannot use the embedded organizer session`,async({page,context})=>{
 await backend(context,true)
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>{
  const popup=route.request().frame().parentFrame()===null
  return route.fulfill({contentType:'text/html',body:popup?`<!doctype html><script>const target=opener;addEventListener('message',e=>{if(e.source===target&&e.data.kind==='connected-login-request')target.postMessage({kind:'connected-login-result',nonce:e.data.nonce,code:'${'b'.repeat(64)}'},e.origin)});target.postMessage({kind:'connected-login-ready'},'${'http://127.0.0.1:4174'}');</script>`:'<!doctype html><title>Storage Blocked</title>'})
 })
 await context.route('**/functions/v1/app-login',route=>route.fulfill({json:{access_token:accountSession().access_token,refresh_token:'popup-refresh'}}))
 await page.goto('/');await account(page)
 if(mode==='signup')await page.getByRole('button',{name:'Create Account',exact:true}).click()
 await page.getByRole('button',{name:'Continue From Organizer',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
})

test('shares one browser installation across legacy guest and account libraries',async({page,context})=>{
 const devices=await backend(context,true),reports:{installationId:string;previousInstallationIds:string[]}[]=[]
 await context.route('**/rest/v1/rpc/userscript_library',async route=>{
  const input=route.request().postDataJSON()
  if(input.p_action==='reader_report')reports.push(input.p_input)
  return route.fulfill({json:{entry:null}})
 })
 const guest='50000000-0000-0000-0000-000000000001',accountId='50000000-0000-0000-0000-000000000002'
 await page.goto('/manifest.webmanifest')
 await page.evaluate(async({owner,guest,accountId})=>{
  for(const [name,id] of [['bta-reader',guest],[`bta-reader-account:${owner}`,accountId]])await new Promise<void>((resolve,reject)=>{
   const request=indexedDB.open(name,1)
   request.onupgradeneeded=()=>{for(const store of ['books','pending','settings'])request.result.createObjectStore(store,{keyPath:'id'})}
   request.onerror=()=>reject(request.error)
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({id:'installation-id',value:id});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}
  })
 },{owner,guest,accountId})
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'The Bookshelf',exact:true})).toBeVisible()
 expect(reports).toHaveLength(0)
 await account(page)
 await page.getByLabel('Username or Email',{exact:true}).fill('reader@example.com')
 await page.getByLabel('Password',{exact:true}).fill('ValidPassword123!')
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Sign In',exact:true}).click()])
 await expect.poll(()=>devices.length).toBeGreaterThan(0)
 expect(devices.every(id=>id===guest)).toBe(true)
 await expect.poll(()=>reports.length).toBeGreaterThan(0)
 expect(reports[0].previousInstallationIds).toContain(accountId)
 expect(reports.every(report=>report.installationId===guest)).toBe(true)
 expect(await page.evaluate(()=>localStorage.getItem('bta:reader-installation:v1'))).toBe(guest)
})

test('lets the signed-in reader create and change a username',async({page,context})=>{
 await signedIn(context);await backend(context)
 let username:string|null=null
 await context.route('**/rest/v1/rpc/manage_account_username',async route=>{
  const input=route.request().postDataJSON()
  if(input.p_username==='Taken')return route.fulfill({status:409,json:{code:'23505',message:'duplicate key'}})
  if(input.p_username)username=input.p_username
  return route.fulfill({json:username})
 })
 await page.goto('/');await account(page)
 const input=page.getByLabel('Account Username',{exact:true})
 await expect(input).toBeEnabled();await input.fill('Taken')
 await page.getByRole('button',{name:'Save Username',exact:true}).click()
 await expect(page.getByRole('alert')).toHaveText('That username is already taken.')
 await input.fill('MyReader')
 await page.getByRole('button',{name:'Save Username',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Username saved.'})).toBeVisible()
 expect(username).toBe('MyReader')
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click();await account(page)
 await expect(input).toHaveValue('MyReader')
})

test('shows a useful failure when the organizer cannot issue a login ticket',async({page,context})=>{
 await backend(context,true)
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><script>const target=opener;addEventListener('message',event=>{if(event.source===target&&event.data.kind==='connected-login-request')target.postMessage({kind:'connected-login-result',nonce:event.data.nonce,error:'unavailable'},event.origin)});if(target)target.postMessage({kind:'connected-login-ready'},'http://127.0.0.1:4174');</script>`}))
 await page.goto('/');await account(page)
 await page.getByRole('button',{name:'Continue From Organizer',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'The other app could not complete sign-in.'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Continue From Organizer',exact:true})).toBeEnabled()
})

test('creates a reader account with email, password, and username without opening guest files',async({page,context})=>{
 await backend(context)
 let input:unknown,redirect=''
 await context.route('**/auth/v1/signup*',route=>{input=route.request().postDataJSON();redirect=new URL(route.request().url()).searchParams.get('redirect_to')??'';return route.fulfill({json:{user:{...accountSession().user,identities:[{id:'new-identity'}]},session:null}})})
 await page.goto('/');await account(page)
 await page.getByRole('button',{name:'Create Account',exact:true}).click()
 await expect(page.getByRole('button',{name:'Continue From Organizer',exact:true})).toBeVisible()
 await page.getByLabel('Email Address',{exact:true}).fill('new@example.com')
 await page.getByLabel('Username',{exact:true}).fill('NewReader')
 await page.getByLabel('Password',{exact:true}).fill('StrongPassword123!')
 await page.getByRole('button',{name:'Create Account',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'Check your email to confirm'})).toBeVisible()
 expect(input).toMatchObject({email:'new@example.com',password:'StrongPassword123!',data:{username:'NewReader'}})
 expect(redirect).toBe(`${new URL(page.url()).origin}/auth/callback`)
 expect(await page.evaluate(()=>localStorage.getItem('reader-cloud-owner'))).toBeNull()
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('')
})

test('confirms signup and opens the account library without replacing the chosen password',async({page,context})=>{
 await backend(context)
 let verification:unknown
 await context.route('**/auth/v1/verify',route=>{verification=route.request().postDataJSON();return route.fulfill({json:accountSession()})})
 await page.goto('/auth/callback?token_hash=signup-confirmation&type=signup')
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reader-cloud-owner')).catch(()=>null)).toBe(owner)
 expect(verification).toMatchObject({token_hash:'signup-confirmation',type:'signup'})
 await account(page)
 await expect(page.getByLabel('New Password',{exact:true})).toHaveCount(0)
 await expect(page.getByText('Saved Account Library',{exact:false})).toContainText('reader@example.com')
})

test('rejects a different organizer account before claiming a code or saving a connection',async({page,context})=>{
 await signedIn(context);await backend(context)
 let claims=0
 await context.route('**/rest/v1/rpc/reader_organizer_connection',route=>{
  const input=route.request().postDataJSON()
  if(input.p_action==='validate')return route.fulfill({status:403,json:{code:'42501',message:'This organizer can connect only to its matching reader account. Sign in with the same account in both apps.'}})
  return route.fulfill({json:{enabled:false}})
 })
 await context.route('**/rest/v1/rpc/userscript_library',route=>{claims++;return route.fulfill({json:{entry:null}})})
 await page.goto('/')
 await page.getByRole('button',{name:'Profile Menu',exact:true}).click()
 await page.getByRole('button',{name:'Connect Organizer',exact:true}).click()
 await page.getByLabel('Pairing Code',{exact:true}).fill('a'.repeat(64))
 await page.getByRole('dialog').getByRole('button',{name:'Connect Organizer',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'matching reader account'})).toBeVisible()
 expect(claims).toBe(0)
 const saved=await page.evaluate(async owner=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(`bta-reader-account:${owner}`);request.onsuccess=()=>resolve(request.result)})
  try{return await new Promise(resolve=>{const request=db.transaction('settings').objectStore('settings').get('connection');request.onsuccess=()=>resolve(request.result??null)})}finally{db.close()}
 },owner)
 expect(saved).toBeNull()
})

test('keeps guest reading local and defers an organizer pairing until the matching account signs in',async({page,context})=>{
 await backend(context)
 let claims=0
 await context.route('**/rest/v1/rpc/userscript_library',route=>{
  const input=route.request().postDataJSON()
  if(input.p_action==='claim'){claims++;return route.fulfill({json:{secret:'b'.repeat(64),userId:owner}})}
  return route.fulfill({json:{entry:null}})
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Profile Menu',exact:true}).click()
 await page.getByRole('button',{name:'Connect Organizer',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Reader Account & Cloud Library'})).toBeVisible()
 await expect(page.getByLabel('Pairing Code',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 await page.evaluate(pairing=>{location.hash=new URLSearchParams({readerPairing:JSON.stringify(pairing)}).toString()}, {url:'https://pnrdztfydurupcqwumvr.supabase.co',key:'sb_publishable_test_only',code:'a'.repeat(64)})
 await expect(page.getByRole('dialog',{name:'Reader Account & Cloud Library'})).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>Boolean(sessionStorage.getItem('reader:pending-pairing')))).toBe(true)
 expect(claims).toBe(0)
 expect(new URL(page.url()).hash).toBe('')
 await page.getByLabel('Username or Email',{exact:true}).fill('reader@example.com')
 await page.getByLabel('Password',{exact:true}).fill('ValidPassword123!')
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Sign In',exact:true}).click()])
 await expect.poll(()=>claims).toBe(1)
 expect(await page.evaluate(()=>localStorage.getItem('reader-cloud-owner'))).toBe(owner)
 expect(await page.evaluate(()=>sessionStorage.getItem('reader:pending-pairing'))).toBeNull()
})

test('preserves guest books and old queued edits without contacting the organizer',async({page,context})=>{
 const {importBook}=await import('./library-fixture')
 await backend(context)
 let organizerCalls=0
 await context.route('**/rest/v1/rpc/userscript_library',route=>{organizerCalls++;return route.fulfill({json:{entry:null}})})
 await page.goto('/');await importBook(page,'Local Guest Story')
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('bta-reader');request.onsuccess=()=>resolve(request.result)})
  await new Promise<void>(resolve=>{
   const tx=db.transaction(['settings','pending'],'readwrite')
   tx.objectStore('settings').put({id:'connection',value:{backend:'https://pnrdztfydurupcqwumvr.supabase.co',key:'sb_publishable_test_only',secret:'a'.repeat(64),account:'legacy-organizer',name:'Legacy Reader',label:'Organizer'}})
   tx.objectStore('pending').put({id:'old-guest-edit',book:'local-book',account:'legacy-organizer',work:'8001',input:{notes:'Keep my guest note'},base:{}})
   tx.oncomplete=()=>{db.close();resolve()}
  })
 })
 await page.reload();await expect(page.getByRole('button',{name:'Local Guest Story',exact:true})).toBeVisible()
 await expect(page.locator('.reader-account-state')).toHaveText('Guest · Local Only')
 expect(organizerCalls).toBe(0)
 const retained=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('bta-reader');request.onsuccess=()=>resolve(request.result)})
  try{return await new Promise(resolve=>{const request=db.transaction('pending').objectStore('pending').get('old-guest-edit');request.onsuccess=()=>resolve(request.result?.input.notes)})}finally{db.close()}
 })
 expect(retained).toBe('Keep my guest note')
 await context.setOffline(true)
 await page.getByRole('button',{name:'Local Guest Story',exact:true}).click()
 await expect(page.getByLabel('Book Content')).toBeVisible()
})

test('manual Sync Now links the full cloud catalog and distinguishes cloud-only EPUBs from offline downloads',async({page,context})=>{
 await signedIn(context);await backend(context,true)
 const stamp='2026-11-01T00:00:00Z'
 const values=Array.from({length:62},(_,index)=>({key:`version-${String(index).padStart(3,'0')}/manifest`,revision:1,value:{id:`version-${String(index).padStart(3,'0')}`,workId:index===61?null:String(8001+index),active:true,metadata:{...blankMetadata,title:`Cloud Work ${index}`,authors:['Writer']},chapters:[],importedAt:stamp,metadataAt:stamp,position:{chapter:'',fraction:0},history:[],completed:[],notes:'',status:'to_read',collections:[]}}))
 const checks=new Set<number>(),reports:string[][]=[]
 await context.route('**/rest/v1/reader_cloud_values*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('like')?[]:values}))
 await context.route('**/rest/v1/rpc/userscript_library',route=>{
  const input=route.request().postDataJSON()
  if(input.p_action==='reader_report'){reports.push(input.p_input.works);return route.fulfill({json:{entry:null}})}
  if(input.p_action==='get'){checks.add(input.p_work);return route.fulfill({json:{entry:{id:`entry-${input.p_work}`,version:'v1',status:'to_read',progress:0,notes:''},collections:[]}})}
  return route.fulfill({json:{entry:null}})
 })
 await page.goto('/')
 await expect(page.locator('.story-card')).toHaveCount(24)
 await page.getByRole('button',{name:'Profile Menu',exact:true}).click()
 await page.getByRole('button',{name:'Organizer & Sync',exact:true}).click()
 await page.getByRole('button',{name:'Sync Now',exact:true}).click()
 await expect(page.getByText(/Catalog: 62 EPUB versions/)).toBeVisible()
 await expect(page.getByText(/1 checked version needs an AO3 work link/)).toBeVisible()
 await expect(page.getByText(/0 downloaded works reported for Offline/)).toBeVisible()
 expect(checks.size).toBe(61)
 expect(reports.at(-1)).toEqual([])
 await page.getByRole('button',{name:'Close Dialog',exact:true}).click()
 const card=page.locator('.story-card').filter({has:page.getByRole('button',{name:'Cloud Work 0',exact:true})})
 await card.getByLabel('Work Actions',{exact:true}).click()
 await expect(card.getByRole('link',{name:'View in Organizer',exact:true})).toHaveAttribute('href','https://beyondthearchives.vercel.app/stories/entry-8001')
 await expect(card.getByRole('link',{name:'View in Organizer',exact:true})).toHaveAttribute('target','_blank')
 await page.keyboard.press('Escape')
 await card.getByRole('button',{name:'Manage EPUB',exact:true}).click()
 await expect(page.getByLabel('Link to Organizer Work',{exact:true})).toHaveValue('https://archiveofourown.org/works/8001')
})
