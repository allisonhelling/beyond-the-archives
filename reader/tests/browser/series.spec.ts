import { test, expect } from '@playwright/test'
import { importBook } from './library-fixture'
test('shows series on tiles and opens every saved work in the clicked series',async({page,context})=>{
 await context.route('https://beyondthearchives.vercel.app/auth/bridge',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}))
 await page.goto('/')
 await importBook(page,'First Adventure','Shared Adventures')
 await importBook(page,'Another Adventure','Shared Adventures')
 await importBook(page,'Unrelated Story','Shared Adventures Extra')
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844})
  await expect(page.getByRole('button',{name:'Shared Adventures',exact:true})).toHaveCount(2)
  // Selecting a series replaces pending search and incompatible filters.
  await page.getByRole('searchbox',{name:'Search',exact:true}).fill('Unrelated')
  await page.getByRole('button',{name:'Shared Adventures',exact:true}).first().click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await expect(page.locator('.story-card h2')).toContainText(['Another Adventure','First Adventure'])
  await expect(page.getByRole('searchbox',{name:'Search',exact:true})).toHaveValue('')
  await expect(page.getByRole('button',{name:'Unrelated Story',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'First Adventure',exact:true}).click()
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button',{name:'← Bookshelf',exact:true}).click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await page.getByRole('button',{name:'Remove Filter Series: Shared Adventures',exact:true}).click()
  await expect(page.locator('.story-card')).toHaveCount(3)
 }
})
