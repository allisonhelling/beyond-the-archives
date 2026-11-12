import { test,expect } from '@playwright/test'
import { fixture,login } from './library-fixture'

test('stages verified crossover filters and preserves unknowns, URL state, saved defaults and Clear All',async({page})=>{
 const tables=await fixture(page)
 for(const [index,status]of ['crossover','not_crossover','unknown'].entries()){
  tables.works.push({id:`cross-work-${index}`,ao3_work_id:99001+index,verified_chapters:{}})
  tables.library_entries.push({id:`cross-${index}`,work_id:`cross-work-${index}`,original_url:`https://archiveofourown.org/works/${99001+index}`,reading_status:'to_read',last_read_chapter:0,notes:'',
   crossoverStatus:status,crossoverPolicy:'ao3_hierarchy_v1',crossoverClassifierVersion:1,crossoverEvidenceRevision:'fixture-1',crossoverValidUntil:status==='crossover'?new Date(Date.now()+86400000).toISOString():null,
   metadata_overrides:{title:`Crossover Fixture ${status}`,fandoms:['First','Second']}})
 }
 await page.goto('/library');await login(page)
 const cards=page.locator('[data-story-id^="cross-"]')
 await expect(cards).toHaveCount(3)
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 const control=page.getByRole('button',{name:'Crossovers',exact:true})
 await control.click();await page.getByRole('option',{name:'Only',exact:true}).click()
 await expect(cards).toHaveCount(3)
 await page.getByRole('button',{name:'Apply Filters',exact:true}).click()
 await expect(cards).toHaveCount(1)
 await expect(page.getByLabel('Active Filters')).toContainText('Crossovers Only')
 const onlyUrl=page.url();await page.reload();await expect(cards).toHaveCount(1)
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 await control.click();await page.getByRole('option',{name:'Exclude',exact:true}).click()
 await page.getByRole('button',{name:'Apply Filters',exact:true}).click()
 await expect(cards).toHaveCount(2)
 await expect(page.getByRole('heading',{name:'Crossover Fixture unknown',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Save as Library Default',exact:true}).click()
 await page.getByRole('dialog',{name:'Save as Library Default?'}).getByRole('button',{name:'Save as Library Default',exact:true}).click()
 await page.getByLabel('Active Filters').getByRole('button',{name:'Clear All Filters',exact:true}).click()
 await expect(cards).toHaveCount(3)
 await page.goto(onlyUrl);await expect(cards).toHaveCount(1)
 await page.getByRole('button',{name:'Remove Filter Crossovers Only',exact:true}).click()
 await expect(cards).toHaveCount(3)
})
