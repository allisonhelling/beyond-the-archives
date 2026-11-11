import type { Page } from '@playwright/test'

/** Simulate a compatible desktop transport at any responsive viewport size.
 * Physical mobile behavior is tested separately without this fixture.
 * AO3 HTML parsing/transport authorization use the companion/server fixture suites.
 */
export async function desktopCompanion(page: Page) {
 await page.addInitScript(() => {
  localStorage.setItem('ao3-library-extension-id','a'.repeat(32))
  if ((window as Window & { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage) return
  const runtime={sendMessage(_id:string,message:{type:string;url?:string},reply:(value:object)=>void) {
   if(message.type==='AO3_LIBRARY_CAPABILITIES')reply({ok:true,capabilities:['metadata-retrieval-v1']})
   else if(message.type==='AO3_LIBRARY_PREVIEW_SERIES')reply({ok:true,page:{url:message.url,html:'<html></html>'}})
   else reply({ok:true,state:null})
  }}
  Object.defineProperty(window,'chrome',{configurable:true,value:{runtime}})
 })
}
