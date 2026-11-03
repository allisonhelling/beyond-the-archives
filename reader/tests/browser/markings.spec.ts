import { test, expect } from '@playwright/test'
import { epubFiles } from '../../../src/test/epub-fixture'
import { createZip } from '../../../src/lib/zip'

for (const width of [390,1280]) test(`keeps personal markings offline and applies Enter searches at width ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900})
 await page.goto('/')
 await page.getByLabel('Import EPUB File').setInputFiles({name:'markings.epub',mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(epubFiles()).arrayBuffer())})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'Bookshelf',exact:true}).click()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.context().setOffline(true)
 await page.getByRole('button',{name:'Mark Favorite',exact:true}).click()
 await page.getByRole('button',{name:'Mark as Rec',exact:true}).click()
 await expect(page.getByRole('button',{name:'Unmark Favorite',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('button',{name:'Remove Rec',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.context().setOffline(false)
 await page.reload()
 await expect(page.getByRole('button',{name:'Unmark Favorite',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Remove Rec',exact:true})).toBeVisible()
 await page.getByRole('searchbox',{name:'Search',exact:true}).fill('no matching book')
 await page.getByRole('searchbox',{name:'Search',exact:true}).press('Enter')
 await expect(page.getByRole('heading',{name:'No Matching Stories',exact:true})).toBeVisible()
})
