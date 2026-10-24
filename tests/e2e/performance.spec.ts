import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('10,000-work library pages incrementally and restores a large page after details',async({page},info)=>{
 test.setTimeout(90000)
 const tables=await fixture(page)
 for(let n=0;n<10000;n++) {
  const work={id:`work-${n}`,ao3_work_id:n+1,title:`Story ${String(n).padStart(5,'0')}`,summary:'A varied summary about home, adventure and friendship. '.repeat(4+n%25),rating:'Mature',published_chapters:10,total_chapters:20,is_complete:false,ao3_updated_at:'2026-10-19T00:00:00Z',verified_chapters:{1:'91',2:'92'}}
  tables.works.push(work)
  tables.library_entries.push({id:`entry-${n}`,user_id:'10000000-0000-0000-0000-000000000001',work_id:work.id,original_url:`https://archiveofourown.org/works/${n+1}`,reading_status:'reading',last_read_chapter:1,is_favorite:false,personal_rating:null,notes:'Private note',created_at:'2026-10-19T00:00:00Z',metadata_overrides:{authors:[`Author ${n%5000}`],fandoms:[`Fandom ${n%100}`],additional_tags:Array.from({length:12},(_,k)=>`Tag ${(n+k)%500}`)}})
 }
 let largeResponseAt=0
 page.on('response',response=>{if(response.url().endsWith('/query_library')&&response.request().postDataJSON()?.p_size===250) void response.finished().then(()=>{largeResponseAt=Date.now()})})
 const queries:{page:number;size:number}[]=[],transfers:{path:string;bytes:number}[]=[]
 page.on('request',request=>{if(request.url().endsWith('/query_library')) {const body=request.postDataJSON();queries.push({page:body.p_page,size:body.p_size})}})
 page.on('response',response=>{if(response.url().includes('/rest/v1/rpc/')) void response.body().then(body=>transfers.push({path:new URL(response.url()).pathname,bytes:body.length})).catch(()=>{})})
 await page.goto('/library?size=50&sort=alpha')
 const started=Date.now()
 await login(page)
 await expect(page.locator('.work-card')).toHaveCount(50)
 const firstDisplayMs=Date.now()-started
 expect(queries).toEqual([{page:1,size:50}])
 expect(queries.every(q=>q.size<=250)).toBe(true)
 await expect(page.getByRole('navigation',{name:'Result Pages'}).first()).toContainText('1–50 of 10000')
 const largeStart=Date.now()
 await page.getByRole('combobox', { name: 'Works per Page', exact: true }).first().selectOption('250')
 await expect(page.locator('[data-virtualized="true"]')).toBeVisible()
 expect(await page.locator('.work-card').count()).toBeLessThan(100)
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const largePageMs=Date.now()-largeStart,largeRenderMs=Date.now()-largeResponseAt
 // Capture a real React mount/layout measurement before choosing virtualization.
 const heap=await page.evaluate(()=> (performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null)
 const target=page.locator('.work-card h2 a').filter({hasText:'Story 00060'})
 for(let i=0;i<60&&await target.count()===0;i++) { await page.evaluate(()=>window.scrollBy(0,1000)); await page.waitForTimeout(30) }
 await expect(target).toBeVisible()
 await target.focus()
 if(info.project.name==='desktop') {
  const original=page.viewportSize()!
  await page.setViewportSize({width:700,height:original.height})
  await expect(target).toBeFocused()
  await page.setViewportSize(original)
  await expect(target).toBeFocused()
 }
 await target.scrollIntoViewIfNeeded()
 const scroll=await page.evaluate(()=>window.scrollY),url=page.url()
 await target.click()
 await expect(page.locator('.story-details-page')).toBeVisible()
 await page.getByRole('link',{name:'Back to Library'}).click()
 await expect(page).toHaveURL(url)
 await expect(page.locator('[data-virtualized="true"]')).toBeVisible()
 expect(await page.locator('.work-card').count()).toBeLessThan(100)
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(scroll-150)
 await expect(page.getByRole('combobox', { name: 'Works per Page', exact: true }).first()).toHaveValue('250')
 // The page cache avoids a second query when returning from work details.
 expect(queries.filter(q=>q.size===250)).toHaveLength(1)
 await page.getByLabel('Search Title or Author',{exact:true}).fill('Story 09999')
 await expect(page.locator('.work-card')).toHaveCount(1)
 await expect(page.locator('.work-card h2')).toContainText('Story 09999')
 await page.goBack()
 await expect(page.locator('[data-virtualized="true"]')).toBeVisible()
 expect(await page.locator('.work-card').count()).toBeLessThan(100)
 await page.goForward()
 await expect(page.locator('.work-card')).toHaveCount(1)
 await page.reload()
 await expect(page.getByRole('combobox', { name: 'Works per Page', exact: true }).first()).toHaveValue('50')
 const report={environment:'local Chromium, mocked transport; 10,000 work catalog',project:info.project.name,firstDisplayMs,largePageMs,largeRenderMs,heap,queries,transfers}
 await mkdir('artifacts/performance',{recursive:true})
 await writeFile(`artifacts/performance/browser-${info.project.name}.json`,JSON.stringify(report,null,2))
 await info.attach('performance.json',{body:JSON.stringify(report,null,2),contentType:'application/json'})
 expect(firstDisplayMs).toBeLessThan(8000)
 expect(largePageMs).toBeLessThan(3000)
})
