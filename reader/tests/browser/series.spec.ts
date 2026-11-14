import { testOrganizer } from './account-fixture'
import { test, expect } from '@playwright/test'
import { importBook } from './library-fixture'
test('shows series on tiles and opens every saved work in the clicked series',async({page,context})=>{
 await context.route(`${testOrganizer.organizerUrl}/auth/bridge`,route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}))
 await page.goto('/')
 await importBook(page,'First Adventure','Shared Adventures')
 await importBook(page,'Another Adventure','Shared Adventures')
 await importBook(page,'Unrelated Story','Shared Adventures Extra')
 await page.getByRole('button', { name: 'Sort', exact: true }).click()
 await page.getByRole('option', { name: 'Title', exact: true }).click()
 await page.getByRole('heading', { name: 'The Bookshelf', exact: true }).click()
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844})
  await expect(page.getByRole('button',{name:'Shared Adventures',exact:true})).toHaveCount(2)
  for(const membership of await page.locator('.story-card').filter({has:page.getByRole('button',{name:'Shared Adventures',exact:true})}).locator('.series-membership').all()) await expect(membership).toHaveText('Part 2 of Shared Adventures')
  if(width===1280){
   const link=page.getByRole('button',{name:'Shared Adventures',exact:true}).first()
   await expect(link).toHaveCSS('text-decoration-line','none')
   await link.hover()
   await expect(link).toHaveCSS('text-decoration-line','underline')
  }
  // Selecting a series replaces pending search and incompatible filters.
  await page.getByRole('searchbox',{name:'Search',exact:true}).fill('Unrelated')
  await page.getByRole('button',{name:'Shared Adventures',exact:true}).first().click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await expect(page.locator('.story-card h2')).toContainText(['Another Adventure','First Adventure'])
  await expect(page.getByRole('searchbox',{name:'Search',exact:true})).toHaveValue('')
  await expect(page.getByRole('button',{name:'Unrelated Story',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'First Adventure',exact:true}).click()
  await expect(page.getByLabel('Book Content')).toBeVisible()
  await page.getByRole('button',{name:'Bookshelf',exact:true}).click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await page.getByRole('button',{name:'Remove Filter Series: Shared Adventures',exact:true}).click()
  await expect(page.locator('.story-card')).toHaveCount(3)
 }
})

test('clicking an author shows their saved works and replaces pending filters',async({page})=>{
 await page.goto('/')
 await importBook(page,'First Story','First Series','Shared Author')
 await importBook(page,'Second Story','Second Series','Shared Author')
 await importBook(page,'Shared Author Cameo','Other Series','Different Author')
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844})
  await page.getByRole('searchbox',{name:'Search',exact:true}).fill('No Match')
  await page.getByRole('button',{name:'Shared Author',exact:true}).first().click()
  await expect(page.locator('.story-card')).toHaveCount(2)
  await expect(page.locator('.story-card h2')).toContainText(['Second Story','First Story'])
  await expect(page.getByRole('searchbox',{name:'Search',exact:true})).toHaveValue('')
  await expect(page.getByRole('button',{name:'Shared Author Cameo',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Remove Filter Author: Shared Author',exact:true}).click()
  await expect(page.locator('.story-card')).toHaveCount(3)
 }
})
