import { test, expect } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('tag and fandom clicks apply filters immediately and the mobile series action shares the Apply row',async({page},testInfo)=>{
 const tables=await fixture(page)
 for(const [id,title,fandom,tags] of [['tagged','Tagged Story','Shared Fandom',['Found Family']],['other','Other Story','Other Fandom',['Adventure']]] as const){
  tables.works.push({id:`${id}-work`,ao3_work_id:id==='tagged'?99201:99202,verified_chapters:{}})
  tables.library_entries.push({id:`${id}-entry`,work_id:`${id}-work`,original_url:`https://archiveofourown.org/works/${id==='tagged'?99201:99202}`,reading_status:'to_read',last_read_chapter:0,notes:'',metadata_overrides:{title,fandoms:[fandom],additional_tags:tags}})
 }
 await page.goto('/library');await login(page)
 const toolbar=page.getByRole('region',{name:'Library Toolbar',exact:true})
 if(testInfo.project.name==='mobile'){
  // Read both rectangles in one browser turn so scroll restoration cannot
  // move the document between measurements while the library finishes loading.
  await expect(async()=>{
   const bounds=await toolbar.locator(':scope > .series-toggle, :scope > .apply-filters').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width}}))
   expect(bounds).toHaveLength(2)
   const [s,a]=bounds
   expect(Math.abs(a.y-s.y)).toBeLessThan(2)
   expect(s.x+s.width).toBeLessThanOrEqual(a.x)
  }).toPass({timeout:5000})
 }
 await page.locator('[data-story-id="tagged-entry"]').getByRole('button',{name:'Found Family',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Other Story',exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Active Filters')).toContainText('Found Family')
 await page.getByRole('button',{name:'Clear All Filters',exact:true}).click()
 await page.locator('[data-story-id="tagged-entry"]').getByRole('button',{name:'Shared Fandom',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Other Story',exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Active Filters')).toContainText('Shared Fandom')
 const search=page.getByLabel('Search Title or Author', {exact:true})
 await search.fill('no matching title');await search.press('Enter')
 await expect(page.getByRole('heading',{name:'Tagged Story',exact:true})).toHaveCount(0)
})
