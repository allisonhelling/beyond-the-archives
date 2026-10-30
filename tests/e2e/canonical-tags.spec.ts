import { expect,test } from '@playwright/test'
import { fixture,login } from './library-fixture'

test('orders standard tags first and matches verified aliases without merging related tags',async({page})=>{
 const tables=await fixture(page),user='10000000-0000-0000-0000-000000000001'
 const names=['Alya Césaire','Alya (Miraculous Ladybug)','Alya Césaire (Miraculous Ladybug)','Protective Alya Césaire']
 tables.ao3_tag_resolutions=names.slice(0,3).map((name,i)=>({user_id:user,category:'character',name,status:i?'synonym':'canonical',canonical_name:names[0],checked_at:new Date().toISOString(),attempted_at:new Date().toISOString()}))
 for(const [i,name] of names.entries()){
  tables.works.push({id:`tag-work-${i}`,ao3_work_id:i+1,title:`Tagged story ${i}`,verified_chapters:{},automatic_metadata:{}})
  tables.library_entries.push({id:`tag-entry-${i}`,user_id:user,work_id:`tag-work-${i}`,original_url:`https://archiveofourown.org/works/${i+1}`,reading_status:'reading',last_read_chapter:0,notes:'',is_favorite:false,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',metadata_overrides:{title:`Tagged story ${i}`,authors:['Author'],fandoms:['Miraculous Ladybug'],character_tags:[name],relationship_tags:[],additional_tags:[],ao3_tags:[name]}})
 }
 await page.goto('/library');await login(page)
 await expect(page.locator('.story-card')).toHaveCount(4)
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 await page.getByLabel('Characters',{exact:true}).fill('alya')
 const popup=page.getByRole('region',{name:'Characters Suggestions',exact:true})
 const standard=popup.getByRole('group',{name:'Standard Tags Suggestions'})
 const other=popup.getByRole('group',{name:'Other / Unverified Tags Suggestions'})
 await expect(standard.getByRole('button',{name:names[0],exact:true})).toBeVisible()
 await expect(popup.locator(':scope > section').first()).toHaveAttribute('aria-label','Standard Tags Suggestions')
 await expect(other).toHaveCSS('border-top-style','solid')
 await standard.getByRole('button',{name:names[0],exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(4)
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Apply',exact:true}).click()
 await expect(page.locator('.story-card')).toHaveCount(3)
 await expect(page.getByRole('link',{name:'Tagged story 3',exact:true})).toHaveCount(0)
 for(const i of [0,1,2])await expect(page.getByRole('link',{name:`Tagged story ${i}`,exact:true})).toBeVisible()
 expect(tables.library_entries.map(row=>(row.metadata_overrides as {character_tags:string[]}).character_tags[0])).toEqual(names)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
