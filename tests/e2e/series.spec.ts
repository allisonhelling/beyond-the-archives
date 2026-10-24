import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('basic series and optional AO3 review stay separate on desktop and mobile', async ({ page }) => {
 const tables = await fixture(page), now = '2026-10-20T12:00:00Z'
 const seriesUrl = 'https://archiveofourown.org/series/77'
 tables.works.push({id:'work-101',ao3_work_id:101,ao3_updated_at:'2026-10-20T00:00:00Z',verified_chapters:{},word_count:200})
 tables.library_entries.push({id:'entry-101',work_id:'work-101',original_url:'https://archiveofourown.org/works/101',metadata_overrides:{title:'Saved fic',authors:['Author'],word_count:200,series:['Related series'],series_memberships:[{id:77,name:'Related series',url:seriesUrl,position:1}]},reading_status:'to_read',last_read_chapter:0,notes:'Private work note',is_favorite:false,created_at:now,updated_at:now})
 let previews = 0
 await page.route('**/functions/v1/series-preview', route => {
  previews++
  return route.fulfill({json:{preview:{seriesId:77,normalizedUrl:seriesUrl,title:'Related series',description:'AO3 series description',creatorNotes:'Creator notes',begun:'2020-01-02',updated:'2026-10-20',workCount:2,wordCount:900,complete:false,works:[
   {workId:101,url:'https://archiveofourown.org/works/101',position:1,title:'Saved fic',authors:['Author'],fandoms:['Preview fandom'],summary:'First summary',tags:[],wordCount:200,chapters:'1/1',complete:true},
   {workId:102,url:'https://archiveofourown.org/works/102',position:2,title:'Unsaved sequel',authors:['Author'],fandoms:['Preview fandom'],summary:'Second summary',summary_html:'<p>Second <em>summary</em></p>',tags:['Adventure'],wordCount:700,chapters:'1/?',complete:false},
  ]}}})
 })
 await page.goto('/series/77'); await login(page)
 if (page.viewportSize()!.width <= 600) {
  const fandoms = (await page.locator('.story-title-row .details-fandom-rating').boundingBox())!
  const favorite = (await page.locator('.story-title-row .favorite').boundingBox())!
  const actions = (await page.locator('.story-metadata-actions').boundingBox())!
  expect(favorite.y).toBeGreaterThanOrEqual(fandoms.y + fandoms.height)
  expect(actions.y).toBeGreaterThanOrEqual(fandoms.y + fandoms.height)
  const progress = page.locator('.series-progress-state')
  const collection = page.getByRole('region', { name: 'Collections', exact: true })
  const progressBox = (await progress.boundingBox())!, collectionBox = (await collection.boundingBox())!
  expect(collectionBox.x).toBeGreaterThan(progressBox.x)
  expect(Math.abs(collectionBox.y - progressBox.y)).toBeLessThan(1)
  const chooseBox = (await page.getByRole('button', { name: 'Choose Works to Import' }).boundingBox())!
  expect(chooseBox.y).toBeGreaterThanOrEqual(progressBox.y + progressBox.height)
  const addBox = (await collection.getByRole('button', { name: 'Add to Collection' }).boundingBox())!
  expect(addBox.width).toBeLessThanOrEqual(collectionBox.width)
 }
 await expect(page.getByRole('heading', {name:'Works in your library'})).toBeVisible()
 await expect(page.getByRole('button', {name:'Hide Works Not in Library'})).toHaveCount(0)
 expect(previews).toBe(0)
 expect(tables.library_series).toHaveLength(0)
 await page.getByRole('button', {name:'Choose Works to Import'}).click()
 const dialog = page.getByRole('dialog', {name:'Review Series',exact:true})
 await expect(dialog.locator('.settings-card')).toHaveCount(0)
 await expect(dialog.getByRole('checkbox', {name:'Part 1: Saved fic'})).toBeDisabled()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 expect(previews).toBe(1)
 expect(tables.library_series).toHaveLength(0)
 const controls = dialog.locator('.series-import-preview .series-preview-controls')
 const row = await controls.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y))
 expect(new Set(row).size).toBe(1)
 await expect(dialog.locator('.series-import-work .field-help').first()).toContainText('Author · Preview fandom · 200 words')
 await expect(dialog.locator('.series-import-work .field-help').first()).toHaveCSS('font-size', '14px')
 await controls.getByRole('button', {name:'Select all',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).toBeChecked()
 await controls.getByRole('button', {name:'Clear selection',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 await controls.getByRole('button', {name:'Hide all',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(0)
 await controls.getByRole('button', {name:'View all',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(4)
 await expect(dialog.locator('.series-work-choice').first()).toHaveCSS('font-size', '16px')
 await expect(dialog.locator('.series-import-work summary').first()).toHaveCSS('font-size', '16px')
 await expect(dialog.locator('.series-import-preview')).toHaveCSS('border-bottom-width', '3px')
 await expect(dialog.locator('.series-import-work').first()).toHaveCSS('border-bottom-width', '1px')
 await expect(dialog.getByRole('button', { name: 'Save All Series', exact: true })).toHaveAccessibleDescription('Load and save full series details from AO3')
 await dialog.getByRole('button', { name: 'Hide All', exact: true }).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(0)
 await dialog.getByRole('button', { name: 'Select All', exact: true }).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).toBeChecked()
 const bounds = await dialog.boundingBox()
 expect(bounds!.x).toBeGreaterThanOrEqual(0)
 expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
 expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
 await dialog.getByRole('button', {name:'Save',exact:true}).click()
 await expect(dialog.getByRole('button', {name:'Full series details saved'})).toBeDisabled()
 expect(tables.library_series).toHaveLength(1)
 expect(tables.library_entries).toHaveLength(1)
 expect(tables.works).toHaveLength(1)
 await dialog.getByRole('button', {name:'Close dialog'}).click()
 await expect(page.getByRole('heading', {name:'Works in this series'})).toBeVisible()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 const unsavedTile = page.locator('.work-card').filter({ has: page.getByRole('link', {name:'Part 2: Unsaved sequel'}) })
 await expect(unsavedTile.locator('.story-summary')).toHaveCSS('font-size', page.viewportSize()!.width > 1100 ? '15px' : '13px')
 await expect(unsavedTile.locator('.story-summary em')).toHaveCSS('font-style', 'italic')
 await page.reload()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 expect(previews).toBe(1)
 await expect(page.getByText('01/02/2020', {exact:true})).toBeVisible()
 await expect(page.getByText('Oct 20, 2026', {exact:true})).toBeVisible()
 const description = await page.getByRole('region', {name:'Series description'}).boundingBox()
 const progress = await page.getByRole('region', {name:'Reading and organization'}).boundingBox()
 expect(description!.y + description!.height).toBeLessThan(progress!.y)
 if (page.viewportSize()!.width > 650) {
  const choose = (await page.getByRole('button', {name:'Choose Works to Import'}).boundingBox())!
  const hide = (await page.getByRole('button', {name:'Hide Works Not in Library'}).boundingBox())!
  const collections = (await page.getByRole('heading', {name:'Collections',exact:true}).boundingBox())!
  expect(Math.abs(hide.x + hide.width / 2 - choose.x - choose.width / 2)).toBeLessThan(1)
  expect(Math.abs(hide.y + hide.height / 2 - collections.y - collections.height / 2)).toBeLessThan(1)
  expect(hide.y + hide.height).toBeLessThan(choose.y)
 }
 await page.getByRole('button', {name:'Hide Works Not in Library'}).click()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toHaveCount(0)
 await expect(page.getByRole('region', {name:'Works in series'}).getByRole('heading', {name:'Saved fic',exact:true})).toBeVisible()
 await page.getByRole('button', {name:'Show Works Not in Library'}).click()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 await page.getByRole('button', {name:'Add a note',exact:true}).click()
 await page.getByRole('textbox', {name:'Private notes'}).fill('My personal series summary')
 await page.locator('.inline-personal-form').getByRole('button', {name:'Save',exact:true}).click()
 await expect(page.getByRole('textbox', {name:'Private notes'})).toHaveCount(0)
 await expect(page.getByText('My personal series summary')).toBeVisible()
 await page.goto('/library?shelf=series')
 const card = page.locator('.series-card')
 await expect(card).toContainText('1 works')
 await expect(card.getByText('My personal series summary', {exact:true})).toBeVisible()
 await expect(card).not.toContainText('Unsaved sequel')
 await expect(card).not.toContainText('Second summary')
 await page.goto('/settings#settings-browsing')
 await expect(page.getByText('Dates will appear:', {exact:false})).toContainText('10/20/2026')
 await expect(page.getByRole('combobox', {name:'Works per page',exact:true})).toHaveCSS('border-top-style', 'solid')
 await expect(page.getByRole('combobox', {name:'Date format',exact:true})).toHaveCSS('border-top-style', 'solid')
 const pageSizeBounds = (await page.getByRole('combobox', {name:'Works per page',exact:true}).boundingBox())!
 const dateFormatBounds = (await page.getByRole('combobox', {name:'Date format',exact:true}).boundingBox())!
 expect(dateFormatBounds.width).toBeGreaterThan(pageSizeBounds.width)
 expect(dateFormatBounds.y - pageSizeBounds.y - pageSizeBounds.height).toBeGreaterThanOrEqual(24)
 const labels = page.locator('.browsing-settings > label')
 for (const label of await labels.all()) {
  const text=(await label.locator('span').boundingBox())!, select=(await label.locator('select').boundingBox())!
  expect(select.x).toBeGreaterThan(text.x+text.width)
  expect(Math.abs(text.y+text.height/2-select.y-select.height/2)).toBeLessThan(1)
 }
 await expect(page.locator('.date-format-examples')).toHaveCSS('padding-inline-start','24px')
 const dateLabelFont = await labels.nth(1).locator('span').evaluate(element => getComputedStyle(element).fontSize)
 await expect(page.locator('.date-format-examples')).toHaveCSS('font-size',dateLabelFont)
 await page.getByRole('combobox', {name:'Date format',exact:true}).selectOption('DMY')
 expect((await page.getByRole('combobox', {name:'Date format',exact:true}).boundingBox())!.width).toBe(dateFormatBounds.width)
 await expect(page.getByText('Dates will appear:', {exact:false})).toHaveText('Dates will appear: 20/10/2026Date Updated: 20 Oct 2026')
 await page.goto('/series/77')
 await expect(page.getByText('02/01/2020', {exact:true})).toBeVisible()
 await expect(page.getByText('20 Oct 2026', {exact:true})).toBeVisible()
 await page.goto('/stories/entry-101')
 await expect(page.getByText('20 Oct 2026', {exact:true})).toBeVisible()
 await page.goto('/settings#settings-browsing')
 await expect(page.getByRole('combobox', {name:'Date format',exact:true})).toHaveValue('DMY')
 await page.getByRole('combobox', {name:'Date format',exact:true}).selectOption('YMD')
 await expect(page.getByText('Dates will appear:', {exact:false})).toHaveText('Dates will appear: 2026-10-20Date Updated: 2026 Oct 20')
 await page.goto('/series/77')
 await expect(page.getByText('2020-01-02', {exact:true})).toBeVisible()
 await expect(page.getByText('2026 Oct 20', {exact:true})).toBeVisible()
 await page.goto('/stories/entry-101')
 await expect(page.getByText('2026 Oct 20', {exact:true})).toBeVisible()
 // A completed work import opens Related Series and automatically loads its works.
 tables.import_batches.push({id:'batch-1',created_at:now})
 tables.import_items.push({id:'item-1',batch_id:'batch-1',entry_id:'entry-101',ordinal:0,status:'completed',metadata_status:'completed'})
 tables.metadata_jobs.push({id:'job-1',batch_id:'batch-1',entry_id:'entry-101',status:'completed'})
 await page.goto('/stories/entry-101')
 await page.evaluate(() => window.history.replaceState({...window.history.state,usr:{importBatchId:'batch-1'}},''))
 await page.reload()
 const related = page.getByRole('dialog', {name:'Related Series',exact:true})
 await expect(related).toBeVisible()
 await expect(related).toContainText('Saved fic')
 await expect(related.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 expect(previews).toBe(2)
 await related.getByRole('button', {name:'Close dialog'}).click()
 await expect(related).toHaveCount(0)
 expect(tables.library_entries).toHaveLength(1)

})

test('series preview follows Next pages before offering all works for import', async ({ page }) => {
 const tables = await fixture(page), url = 'https://archiveofourown.org/series/77'
 const requested: string[] = []
 await page.route('**/functions/v1/series-preview', route => {
  const target = route.request().postDataJSON().url as string
  requested.push(target)
  const number = Number(new URL(target).searchParams.get('page') ?? 1)
  return route.fulfill({ json: { preview: {
   seriesId: 77, normalizedUrl: url, title: 'Paged series', description: '', workCount: 3,
   ...(number < 3 && { nextUrl: `${url}?page=${number + 1}` }),
   works: [{ workId: 100 + number, url: `https://archiveofourown.org/works/${100 + number}`, position: number, title: `Paged work ${number}`, authors: ['Author'], summary: '', tags: [], wordCount: 100, chapters: '1/1', complete: true }],
  } } })
 })
 await page.goto('/series/77'); await login(page)
 await page.getByRole('button', { name: 'Choose Works to Import' }).click()
 const dialog = page.getByRole('dialog', { name: 'Review Series', exact: true })
 await expect(dialog.getByRole('checkbox')).toHaveCount(3)
 expect(requested).toEqual([url, `${url}?page=2`, `${url}?page=3`])
 const save = dialog.getByRole('button', { name: 'Save', exact: true })
 await expect(save).toHaveAccessibleDescription('Load and save full series details from AO3')
 const heading = dialog.locator('.series-import-heading')
 await expect(heading.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
 await save.click()
 await expect(dialog.getByRole('button', { name: 'Full series details saved' })).toBeDisabled()
 expect(tables.library_series).toHaveLength(1)
 expect(tables.library_entries).toHaveLength(0)
})


test('series import defaults persist while each import can choose a temporary override', async ({ page }) => {
 await fixture(page)
 await page.goto('/settings#settings-series-imports'); await login(page)
 const setting = page.getByRole('combobox', { name: 'When a series is encountered' })
 await expect(setting).toHaveValue('choose')
 await setting.selectOption('all')
 await expect(page.getByRole('status').filter({ hasText: 'Series import default saved.' })).toBeVisible()
 await page.goto('/imports')
 const overrides = page.getByRole('checkbox', { name: 'Choose series works for this import only' })
 await expect(overrides).toHaveCount(3)
 await expect(overrides.last()).not.toBeChecked()
 await overrides.last().check()
 await page.getByRole('textbox', { name: 'AO3 URLs' }).fill('https://archiveofourown.org/series/77')
 await page.getByRole('button', { name: 'Review series', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Choose Works From Series' })).toBeVisible()
 await page.goto('/imports')
 await expect(page.getByRole('checkbox', { name: 'Choose series works for this import only' }).last()).not.toBeChecked()
 await page.goto('/settings#settings-series-imports')
 await expect(setting).toHaveValue('all')
})
