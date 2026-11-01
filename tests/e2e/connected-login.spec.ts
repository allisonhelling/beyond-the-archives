import { expect, test } from '@playwright/test'

// Use the real shared bridge in separate origins and browser tabs. The Auth
// client stub keeps this focused on sessionStorage isolation and handoff messages.
test('continues from an open tab whose source session is not remembered',async({page,context})=>{
 const targetOrigin='http://127.0.0.1:4173',sourceOrigin='http://localhost:4173'
 await context.route('**/handoff-source',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><script type="module">
  import {serveConnectedLoginInTab} from '/src/lib/connected-login.ts';
  sessionStorage.setItem('source-account','signed-in');
  serveConnectedLoginInTab({auth:{getSession:async()=>({data:{session:sessionStorage.getItem('source-account')?{user:{id:'source-user'}}:null}})},functions:{invoke:async(name,input)=>{window.issued=input.body;await new Promise(resolve=>setTimeout(resolve,2500));return {data:{code:'${'a'.repeat(64)}'}}}}},'${targetOrigin}');
  document.body.textContent='Source Ready';
 </script>`}))
 await context.route(`${sourceOrigin}/auth/bridge`,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><script type="module">
  import {serveConnectedLogin} from '/src/lib/connected-login.ts';
  serveConnectedLogin({auth:{getSession:async()=>({data:{session:sessionStorage.getItem('source-account')?{user:{id:'source-user'}}:null}})},functions:{invoke:async()=>{throw Error('The popup must use the existing tab')}}},'${targetOrigin}');
 </script>`}))
 await context.route('**/handoff-target',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><button>Continue From Organizer</button><p role="status"></p><script type="module">
  import {connectedLogin} from '/src/lib/connected-login.ts';
  let session=null;
  const client={auth:{getSession:async()=>({data:{session}}),setSession:async(value)=>{session=value;return {error:null}}},functions:{invoke:async(name,input)=>{window.redeemed=input.body;return {data:{access_token:'new-access',refresh_token:'independent-refresh'}}}}};
  document.querySelector('button').onclick=async()=>{try{const ok=await connectedLogin(client,'${sourceOrigin}',true);document.querySelector('p').textContent=ok?'Signed In':'Failed'}catch(error){document.querySelector('p').textContent=error.message}};
 </script>`}))
 const source=await context.newPage()
 await source.goto(`${sourceOrigin}/handoff-source`);await expect(source.locator('body')).toHaveText('Source Ready')
 await page.goto(`${targetOrigin}/handoff-target`)
 const popupPromise=page.waitForEvent('popup')
 await page.getByRole('button',{name:'Continue From Organizer'}).click()
 const popup=await popupPromise
 await expect(page.getByRole('status')).toHaveText('Signed In')
 await expect.poll(()=>popup.isClosed()).toBe(true)
 expect(await source.evaluate(()=>sessionStorage.getItem('source-account'))).toBe('signed-in')
 expect(await source.evaluate(()=>localStorage.getItem('source-account'))).toBeNull()
 expect(await source.evaluate(()=>Reflect.get(window,'issued'))).toMatchObject({action:'issue',target:targetOrigin,userRequested:true,challenge:expect.stringMatching(/^[a-f0-9]{64}$/)})
 expect(await page.evaluate(()=>Reflect.get(window,'redeemed'))).toMatchObject({action:'redeem',code:'a'.repeat(64),verifier:expect.stringMatching(/^[a-f0-9]{64}$/)})
})
