import { expect, test, type Page } from '@playwright/test'
import { selectLibraryShelf } from './library-fixture'

test.skip(process.env.VITE_SAMPLE_DATA !== 'true', 'Uses the existing extension-free sample repository')
async function add(page: Page, count = 20) {
 await page.goto('/add?import=manual')
 await page.getByLabel('Story URL', { exact: true }).fill('https://fiction.example/stories/manual?edition=one#start')
 await page.getByLabel('Title', { exact: true }).fill('Universal Manual Fixture')
 await page.getByLabel('Fandoms (one per line)', { exact: true }).fill('Original Work')
 await page.getByLabel('Published Chapters', { exact: true }).fill(String(count))
 await page.getByRole('checkbox', { name: 'Manually Entered Chapter Count', exact: true }).check()
 await page.getByRole('button', { name: 'Save Story', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Universal Manual Fixture', exact: true })).toBeVisible()
 return new URL(page.url()).pathname
}
async function finish(page: Page, path: string) {
 await page.goto(`${path}?edit=reading`)
 await page.getByRole('combobox', { name: 'Reading Status', exact: true }).selectOption('finished')
 await page.getByRole('button', { name: 'Save Story', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Universal Manual Fixture', exact: true })).toBeVisible()
}
async function editCount(page: Page, path: string, count: number) {
 await page.goto(`${path}?edit=metadata`)
 await page.getByLabel('Published Chapters', { exact: true }).fill(String(count))
 await page.getByRole('button', { name: 'Save Story', exact: true }).click()
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }

test('universal manual story saves unread, uses its safe story URL, and tracks caught-up progress without an extension', async ({ page }) => {
 const external: string[]=[]
 await page.route(/https:\/\/(?:[^/]+\.)?(?:supabase\.co|archiveofourown\.org|fiction\.example)\//, route => { external.push(route.request().url()); return route.abort() })
 const path = await add(page)
 await expect(page.getByRole('button', { name: 'Chapter 0 of 20 — Edit Progress', exact: true })).toBeVisible()
 await expect(page.getByRole('link', { name: 'Read Story', exact: true })).toHaveAttribute('href', 'https://fiction.example/stories/manual?edition=one#start')
 await page.getByRole('button', { name: 'Chapter 0 of 20 — Edit Progress', exact: true }).click()
 await page.getByLabel('Last Fully Read Chapter', { exact: true }).fill('20')
 await page.getByRole('button', { name: 'Save', exact: true }).click()
 await expect(page.getByRole('img', { name: 'Caught Up · Completion Unconfirmed', exact: true })).toBeVisible()
 await page.reload()
 await expect(page.getByRole('button', { name: 'Chapter 20 of 20 — Edit Progress', exact: true })).toBeVisible()
 await expect(page.getByLabel('Metadata Provenance')).toContainText('Manually Supplied')
 await noOverflow(page)
 expect(external).toEqual([])
 expect(new URL(page.url()).pathname).toBe(path)
})
for (const choice of ['Keep 20 Read', "I've Read All 25", 'Keep Finished as Manual Override']) test(`universal Finished count increase offers ${choice} without inventing progress`, async ({ page }) => {
 const path = await add(page)
 await finish(page,path)
 await editCount(page,path,25)
 const dialog=page.getByRole('dialog',{name:'Review Finished Status',exact:true})
 await expect(dialog).toBeVisible()
 await expect(dialog.getByRole('radio',{name:'Keep 20 Read',exact:true})).toBeChecked()
 await dialog.getByRole('radio',{name:choice,exact:true}).check()
 await noOverflow(page)
 await dialog.getByRole('button',{name:'Apply Choice and Save',exact:true}).click()
 const read=choice==="I've Read All 25"?25:20
 await expect(page.getByRole('button',{name:`Chapter ${read} of 25 — Edit Progress`,exact:true})).toBeVisible()
 if(choice==='Keep Finished as Manual Override') await expect(page.getByRole('img',{name:'Finished · Manual Override · Unread Chapters',exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByRole('button',{name:`Chapter ${read} of 25 — Edit Progress`,exact:true})).toBeVisible()
})
test('universal count reduction blocks, permits keyboard cancellation, and saves only a confirmed current-progress reduction',async({page})=>{
 const path=await add(page)
 await finish(page,path)
 await editCount(page,path,15)
 let dialog=page.getByRole('dialog',{name:'Review Chapter Progress',exact:true})
 await expect(dialog).toContainText('reduced by 5 chapters')
 await expect(dialog).toContainText('history will be retained')
 await noOverflow(page)
 await page.keyboard.press('Escape')
 await page.goto(path)
 await expect(page.getByRole('button',{name:'Chapter 20 of 20 — Edit Progress',exact:true})).toBeVisible()
 await editCount(page,path,15)
 dialog=page.getByRole('dialog',{name:'Review Chapter Progress',exact:true})
 await dialog.getByRole('button',{name:'Reduce Current Progress to 15/15',exact:true}).click()
 await expect(page.getByRole('button',{name:'Chapter 15 of 15 — Edit Progress',exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByRole('button',{name:'Chapter 15 of 15 — Edit Progress',exact:true})).toBeVisible()
})
test('universal stories join Original Works and support field-aware completion verification filters', async ({page})=>{
 await add(page,100000)
 await page.goto('/library')
 await selectLibraryShelf(page,'Original Works')
 await expect(page.getByRole('heading',{name:'Universal Manual Fixture',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 await page.getByRole('button',{name:'Chapter Count Confidence',exact:true}).click()
 await page.getByRole('option',{name:'Manually Supplied',exact:true}).click()
 await page.getByRole('checkbox',{name:'Needs Completion Verification',exact:true}).check()
 await page.getByRole('button',{name:'Apply Filters',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Universal Manual Fixture',exact:true})).toBeVisible()
 await noOverflow(page)
})
