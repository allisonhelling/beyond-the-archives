import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('legacy preferences cannot restore hosted retrieval and unavailable companions leave history usable',async({page})=>{
 const tables=await fixture(page)
 tables.metadata_preferences.push({user_id:'10000000-0000-0000-0000-000000000001',retrieval_mode:'direct',retrieval_mode_mobile:'direct'})
 let submissions=0
 await page.route('**/rest/v1/rpc/submit_import_urls',route=>{submissions++;return route.fulfill({json:null})})
 await page.goto('/settings#settings-metadata')
 await login(page)
 await expect(page.getByRole('button',{name:'Reconnect Extension',exact:true})).toBeVisible()
 await expect(page.getByRole('combobox',{name:'Desktop Metadata Retrieval',exact:true})).toHaveCount(0)
 await page.goto('/imports')
 await expect(page.getByRole('heading',{name:'Desktop Companion Required',exact:true})).toBeVisible()
 await expect(page.getByRole('textbox',{name:'AO3 URLs',exact:true})).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Previous Batches',exact:true})).toBeVisible()
 for(const tab of ['AO3 Library Sync','CSV (Bookmarks or Marked for Later)']) {
  await page.getByRole('tab',{name:tab,exact:true}).click()
  await expect(page.getByRole('heading',{name:'Desktop Companion Required',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Previous Batches',exact:true})).toBeVisible()
 }
 expect(submissions).toBe(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('a compatible desktop transport enables imports in a narrow window',async({page})=>{
 const {desktopCompanion}=await import('./desktop-companion-fixture')
 await desktopCompanion(page)
 await page.setViewportSize({width:390,height:844})
 await fixture(page)
 const submissions:Record<string,unknown>[]=[]
 await page.route('**/rest/v1/rpc/submit_import_urls',route=>{submissions.push(route.request().postDataJSON());return route.fulfill({json:null})})
 await page.goto('/imports');await login(page)
 await page.getByRole('textbox',{name:'AO3 URLs',exact:true}).fill('https://archiveofourown.org/works/123/chapters/456')
 await page.getByRole('button',{name:'Import URLs',exact:true}).click()
 await expect.poll(()=>submissions.length).toBe(1)
 expect(submissions[0]).toMatchObject({p_urls:['https://archiveofourown.org/works/123/chapters/456'],p_update_reading_location:true})
 await expect(page.getByRole('heading',{name:'Desktop Companion Required',exact:true})).toHaveCount(0)
})
