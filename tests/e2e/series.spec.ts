import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('basic series and optional AO3 review stay separate on desktop and mobile', async ({ page }) => {
 test.setTimeout(90000)
 const tables = await fixture(page), now = '2026-10-20T12:00:00Z'
 const seriesUrl = 'https://archiveofourown.org/series/77'
 tables.works.push({id:'work-101',ao3_work_id:101,ao3_updated_at:'2026-10-20T00:00:00Z',verified_chapters:{},word_count:200})
 tables.library_entries.push({id:'entry-101',work_id:'work-101',original_url:'https://archiveofourown.org/works/101',metadata_overrides:{title:'Saved fic',authors:['Author'],word_count:200,series:['Related series'],series_memberships:[{id:77,name:'Related series',url:seriesUrl,position:1}]},reading_status:'to_read',last_read_chapter:0,notes:'Private work note',is_favorite:false,created_at:now,updated_at:now})
 tables.works.push({id:'work-103',ao3_work_id:103,verified_chapters:{}})
 tables.library_entries.push({...tables.library_entries[0],id:'entry-103',work_id:'work-103',original_url:'https://archiveofourown.org/works/103',metadata_overrides:{title:'Other saved fic',authors:['Author'],series:['Related series'],series_memberships:[{id:77,name:'Related series',url:seriesUrl,position:3}]}})
 let previews = 0
 await page.route('**/functions/v1/series-preview', route => {
  previews++
  return route.fulfill({json:{preview:{seriesId:77,normalizedUrl:seriesUrl,title:'Related series',description:'AO3 series description',creatorNotes:'Creator notes',begun:'2020-01-02',updated:'2026-10-20',workCount:3,wordCount:900,complete:false,works:[
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
  expect(collectionBox.x).toBeCloseTo(progressBox.x, 0)
  expect(collectionBox.y).toBeGreaterThanOrEqual(progressBox.y + progressBox.height)
  await expect(collection).toHaveCSS('border-top-width', '1px')
  const chooseBox = (await page.getByRole('button', { name: 'Choose Works to Import' }).boundingBox())!
  expect(chooseBox.y).toBeGreaterThanOrEqual(collectionBox.y + collectionBox.height)
  expect(chooseBox.x + chooseBox.width / 2).toBeCloseTo(collectionBox.x + collectionBox.width / 2, 0)
  const addBox = (await collection.getByRole('button', { name: 'Add to Collection' }).boundingBox())!
  expect(addBox.width).toBeLessThanOrEqual(collectionBox.width)
 }
 await expect(page.getByRole('button', {name:'Refresh Works',exact:true})).toBeEnabled()
 await expect(page.getByRole('heading', {name:'Works in Your Library'})).toBeVisible()
 await expect(page.getByRole('button', {name:'Hide Works Not in Library'})).toHaveCount(0)
 expect(previews).toBe(0)
 expect(tables.library_series).toHaveLength(0)
 await page.getByRole('button', {name:'Choose Works to Import'}).click()
 const dialog = page.getByRole('dialog', {name:'Review Series',exact:true})
 await expect(dialog.locator('.settings-card')).toHaveCount(0)
 await expect(dialog.getByRole('group', { name: 'Series Footer Controls' })).toHaveCount(0)
 await dialog.getByRole('button', { name: 'Show Series Works', exact: true }).first().click()
 await expect(dialog.getByRole('checkbox', {name:'Part 1: Saved fic'})).toBeDisabled()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 expect(previews).toBe(1)
 expect(tables.library_series).toHaveLength(0)
 await expect(dialog.getByRole('group', { name: 'All Series Top Controls' })).toHaveCount(0)
 await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
 await expect(dialog.getByRole('button', { name: 'Skip Series', exact: true })).toHaveCount(0)
 await expect(page.getByText(/Current series default/)).toHaveCount(0)
 await expect(dialog.locator('.series-import-preview').first()).toHaveCSS('border-top-width', '3px')
 const controls = dialog.getByRole('group', { name: 'Series Selection Controls' })
 await expect(controls.getByRole('button', { name: 'Select All', exact: true })).toHaveAccessibleDescription('Applies to Related series')
 expect((await controls.getByRole('button').allTextContents()).slice(0, 2)).toEqual(['Hide Series Works', 'Select All'])
 const workBounds = (await dialog.locator('.series-import-work').first().boundingBox())!
 const previewBounds = (await dialog.locator('.series-import-preview').boundingBox())!
 expect(Math.abs(workBounds.x - previewBounds.x)).toBeLessThan(1)
 const row = await controls.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y))
 expect(new Set(row).size).toBe(1)
 await expect(dialog.locator('.series-import-work .field-help').first()).toContainText('Author · Preview fandom · 200 words')
 await expect(dialog.locator('.series-import-work .field-help').first()).toHaveCSS('font-size', '14px')
 await controls.getByRole('button', {name:'Select All',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).toBeChecked()
 await controls.getByRole('button', {name:'Clear Selection',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 await controls.getByRole('button', {name:'Hide All',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(0)
 await controls.getByRole('button', {name:'View All',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(4)
 const footer = dialog.getByRole('group', { name: 'Series Footer Controls' })
 await footer.getByRole('button', {name:'Hide All',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(0)
 await expect(controls.getByRole('button', {name:'View All',exact:true})).toBeVisible()
 await footer.getByRole('button', {name:'View All',exact:true}).click()
 await expect(dialog.locator('.series-import-work details[open]')).toHaveCount(4)
 await footer.getByRole('button', {name:'Clear Selection',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).not.toBeChecked()
 await footer.getByRole('button', {name:'Select All',exact:true}).click()
 await expect(dialog.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).toBeChecked()
 await expect(dialog.locator('.series-work-choice').first()).toHaveCSS('font-size', '16px')
 await expect(dialog.locator('.series-import-work summary').first()).toHaveCSS('font-size', '16px')
 await expect(dialog.locator('.series-import-preview')).toHaveCSS('border-bottom-width', '3px')
 await expect(dialog.locator('.series-import-work').first()).toHaveCSS('border-bottom-width', '1px')
 await expect(dialog.getByRole('button', { name: 'Save All Series', exact: true })).toHaveCount(0)
 await expect(dialog.locator('[aria-label="All Series Controls"]')).toHaveCount(0)
 await page.screenshot({ path: test.info().outputPath('series-controls.png') })
 const bounds = await dialog.boundingBox()
 expect(bounds!.x).toBeGreaterThanOrEqual(0)
 expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
 expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
 await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
 expect(tables.library_series).toHaveLength(0)
 await page.getByRole('button', { name: 'Load', exact: true }).click()
 await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
 expect(tables.library_series).toHaveLength(1)
 expect(tables.library_entries).toHaveLength(2)
 expect(tables.works).toHaveLength(2)
 await expect(page.getByRole('heading', {name:'Works in This Series'})).toBeVisible()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 const unsavedTile = page.locator('.work-card').filter({ has: page.getByRole('link', {name:'Part 2: Unsaved sequel'}) })
 await expect(unsavedTile.locator('.story-summary')).toHaveCSS('font-size', page.viewportSize()!.width > 1100 ? '15px' : '13px')
 await expect(unsavedTile.locator('.story-summary em')).toHaveCSS('font-style', 'italic')
 await page.reload()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 expect(previews).toBe(2)
 await expect(page.getByText('01/02/2020', {exact:true})).toBeVisible()
 await expect(page.getByText('Oct 20, 2026', {exact:true})).toBeVisible()
 const description = await page.getByRole('region', {name:'Series Description'}).boundingBox()
 const progress = await page.getByRole('region', {name:'Reading and Organization'}).boundingBox()
 expect(description!.y + description!.height).toBeLessThan(progress!.y)
 if (page.viewportSize()!.width > 650) {
  const choose = (await page.getByRole('button', {name:'Choose Works to Import'}).boundingBox())!
  const hide = (await page.getByRole('button', {name:'Hide Works Not in Library'}).boundingBox())!
  const collections = (await page.getByRole('heading', {name:'Collections',exact:true}).boundingBox())!
  expect(Math.abs(hide.x + hide.width / 2 - choose.x - choose.width / 2)).toBeLessThan(1)
  const progressSections = page.locator('.series-progress-columns > *')
  await expect(progressSections.nth(1)).toHaveCSS('border-left-width', '1px')
  await expect(progressSections.nth(2)).toHaveCSS('border-left-width', '1px')
  expect(hide.x).toBeGreaterThan(collections.x)
  expect(hide.y + hide.height).toBeLessThan(choose.y)
 }
 await page.getByRole('button', {name:'Hide Works Not in Library'}).click()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toHaveCount(0)
 await expect(page.getByRole('region', {name:'Works in Series'}).getByRole('heading', {name:'Saved fic',exact:true})).toBeVisible()
 await page.getByRole('button', {name:'Show Works Not in Library'}).click()
 await expect(page.getByRole('link', {name:'Part 2: Unsaved sequel'})).toBeVisible()
 await page.getByRole('button', {name:'Add a Note',exact:true}).click()
 await page.getByRole('textbox', {name:'Private Notes'}).fill('My personal series summary')
 await page.locator('.inline-personal-form').getByRole('button', {name:'Save',exact:true}).click()
 await expect(page.getByRole('textbox', {name:'Private Notes'})).toHaveCount(0)
 await expect(page.getByText('My personal series summary')).toBeVisible()
 await page.goto('/library?shelf=series')
 const card = page.locator('.series-card')
 await expect(card).toContainText('2 works')
 await expect(page.locator('.work-card')).toHaveCount(0)
 await expect(card.locator('.series-work-list details[open]')).toHaveCount(0)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
 await page.getByRole('button', { name: 'Expand All Work Summaries', exact: true }).first().click()
 await expect(card.locator('.series-work-list details[open]')).toHaveCount(2)
 await page.getByRole('button', { name: 'Collapse All Work Summaries', exact: true }).first().click()
 await expect(card.locator('.series-work-list details[open]')).toHaveCount(0)
 await expect(card.getByText('My personal series summary', {exact:true})).toBeVisible()
 await expect(card).not.toContainText('Unsaved sequel')
 await expect(card).not.toContainText('Second summary')
 await page.goto('/settings#settings-browsing')
 await expect(page.getByRole('heading', { name: 'Library Browsing', exact: true })).toBeVisible({ timeout: 15000 })
 await expect(page.getByText('Dates will appear:', {exact:false})).toContainText('10/20/2026')
 await expect(page.getByRole('combobox', {name:'Works per Page',exact:true})).toHaveCSS('border-top-style', 'solid')
 await expect(page.getByRole('combobox', {name:'Date Format',exact:true})).toHaveCSS('border-top-style', 'solid')
 const pageSizeBounds = (await page.getByRole('combobox', {name:'Works per Page',exact:true}).boundingBox())!
 const dateFormatBounds = (await page.getByRole('combobox', {name:'Date Format',exact:true}).boundingBox())!
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
 await page.getByRole('combobox', {name:'Date Format',exact:true}).selectOption('DMY')
 expect((await page.getByRole('combobox', {name:'Date Format',exact:true}).boundingBox())!.width).toBe(dateFormatBounds.width)
 await expect(page.getByText('Dates will appear:', {exact:false})).toHaveText('Dates will appear: 20/10/2026Date Updated: 20 Oct 2026')
 await page.goto('/series/77')
 await expect(page.getByText('02/01/2020', {exact:true})).toBeVisible()
 await expect(page.getByText('20 Oct 2026', {exact:true})).toBeVisible()
 await page.goto('/stories/entry-101')
 await expect(page.getByText('20 Oct 2026', {exact:true})).toBeVisible()
 await page.goto('/settings#settings-browsing')
 await expect(page.getByRole('combobox', {name:'Date Format',exact:true})).toHaveValue('DMY')
 await page.getByRole('combobox', {name:'Date Format',exact:true}).selectOption('YMD')
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
 await page.evaluate(() => window.history.replaceState({...window.history.state,usr:{importBatchId:'batch-1',reviewRelatedSeries:true}},''))
 await page.reload()
 const related = page.getByRole('dialog', {name:'Related Series',exact:true})
 await expect(related).toBeVisible()
 await expect(related).toContainText('Saved fic')
 // The shared draft restores the earlier expansion and explicit selection.
 await expect(related.getByRole('button', { name: 'Hide Series Works', exact: true }).first()).toHaveAttribute('aria-expanded', 'true')
 await expect(related.getByRole('checkbox', {name:'Part 2: Unsaved sequel'})).toBeChecked()
 expect(previews).toBe(3)
 await related.getByRole('button', {name:'Close Dialog'}).click()
 await expect(related).toHaveCount(0)
 expect(tables.library_entries).toHaveLength(2)

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
 await page.goto('/imports'); await login(page)
 await page.getByRole('textbox', { name: 'AO3 URLs', exact: true }).fill(url)
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })
 await dialog.getByRole('button', { name: 'Show Series Works', exact: true }).first().click()
 await expect(dialog.getByRole('checkbox')).toHaveCount(3)
 expect(requested).toEqual([url, `${url}?page=2`, `${url}?page=3`])
 const save = dialog.getByRole('button', { name: 'Save', exact: true }).first()
 await expect(save).toHaveAccessibleDescription('Load and save full series details from AO3')
 const heading = dialog.locator('.series-import-heading')
 await expect(heading.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
 await save.click()
 await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
 await expect(dialog.getByRole('button', { name: 'Save All Series', exact: true })).toHaveCount(0)
 expect(tables.library_series).toHaveLength(1)
 expect(tables.library_entries).toHaveLength(0)
})


test('series import defaults persist while each import can choose a temporary override', async ({ page }) => {
 await fixture(page)
 await page.goto('/settings#settings-series-imports'); await login(page)
 const setting = page.getByRole('combobox', { name: 'When a Series Is Encountered' })
 await expect(setting).toHaveValue('choose')
 await setting.selectOption('all')
 await expect(page.getByRole('status').filter({ hasText: 'Series import default saved.' })).toBeVisible()
 await page.goto('/imports')
 const overrides = page.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' })
 await expect(overrides).toHaveCount(3)
 await expect(overrides.last()).not.toBeChecked()
 await overrides.last().check()
 await page.getByRole('textbox', { name: 'AO3 URLs' }).fill('https://archiveofourown.org/series/77')
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Choose Works From Series' })).toBeVisible()
 await page.goto('/imports')
 await expect(page.getByRole('checkbox', { name: 'Choose Series Works for This Import Only' }).last()).not.toBeChecked()
 await page.goto('/settings#settings-series-imports')
 await expect(setting).toHaveValue('all')
})

test('series review tooltips escape scrolling controls and Save comes first', async ({ page }) => {
 await fixture(page)
 await page.route('**/functions/v1/series-preview', route => route.fulfill({ json: { preview: {
  seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77', title: 'Series with visible tooltips', description: '',
  works: [{ workId: 101, url: 'https://archiveofourown.org/works/101', title: 'First work', position: 1, authors: ['Author'], summary: 'Summary', tags: ['Adventure'], wordCount: 100, chapters: '1/1', complete: true }],
 } } }))
 await page.goto('/imports'); await login(page)
 await page.getByRole('textbox', { name: 'AO3 URLs', exact: true }).fill('https://archiveofourown.org/series/77')
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })
 const top = dialog.getByRole('group', { name: 'All Series Top Controls' })
 await expect(top.getByRole('button', { name: 'Select All', exact: true })).toBeEnabled()
 const assertTooltip = async (button: ReturnType<typeof top.getByRole>) => {
  await button.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveCSS('position', 'fixed')
  expect(await tooltip.evaluate(node => node.parentElement?.tagName)).toBe('DIALOG')
  expect(await tooltip.evaluate(node => {
   const bounds = node.getBoundingClientRect()
   return node.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
  })).toBe(true)
 }
 for (const name of ['Select All', 'Clear Selection', 'View All', 'Hide All']) await assertTooltip(top.getByRole('button', { name, exact: true }))
 await assertTooltip(dialog.locator('.series-import-heading').getByRole('button', { name: 'Save', exact: true }))
 const footer = dialog.getByRole('group', { name: 'Series Footer Controls' })
 await expect(footer).toHaveCount(0)
 await dialog.getByRole('button', { name: 'Show Series Works', exact: true }).click()
 await expect(footer.getByRole('button').first()).toHaveText('Save')
 await assertTooltip(footer.getByRole('button', { name: 'Save', exact: true }))
 await assertTooltip(footer.getByRole('button', { name: 'Select All', exact: true }))
 await dialog.evaluate(node => { node.scrollTop += 20 })
 await expect(page.getByRole('tooltip')).toBeVisible()
 await assertTooltip(dialog.getByRole('button', { name: 'Save All Series', exact: true }))
 await page.screenshot({ path: test.info().outputPath('visible-series-tooltip.png') })
})

test('series review saves only series missing from the library', async ({ page }) => {
 const tables = await fixture(page), now = '2026-10-27T12:00:00Z'
 tables.library_series.push({ id: 'saved-series', ao3_series_id: 77, created_at: now, updated_at: now, notes: '', is_favorite: false, metadata: { seriesId: 77, title: 'Series 77', normalizedUrl: 'https://archiveofourown.org/series/77', basic: false, works: [] } })
 tables.works.push({ id: 'member-work', ao3_work_id: 800, verified_chapters: {} })
 tables.library_entries.push({ id: 'member-entry', work_id: 'member-work', original_url: 'https://archiveofourown.org/works/800', metadata_overrides: { title: 'Saved installment', authors: [], series: ['Series 88'], series_memberships: [{ id: 88, name: 'Series 88', url: 'https://archiveofourown.org/series/88', position: 1 }] }, reading_status: 'to_read', last_read_chapter: 0, notes: '', is_favorite: false, created_at: now, updated_at: now })
 await page.route('**/functions/v1/series-preview', route => {
  const url = route.request().postDataJSON().url as string, id = Number(new URL(url).pathname.split('/').at(-1))
  return route.fulfill({ json: { preview: { seriesId: id, normalizedUrl: url, title: `Series ${id}`, description: '', works: [{ workId: id * 10, url: `https://archiveofourown.org/works/${id * 10}`, title: 'Installment', authors: [], tags: [], summary: '', wordCount: null, chapters: '1/1', complete: true }] } } })
 })
 await page.goto('/imports'); await login(page)
 await page.getByRole('textbox', { name: 'AO3 URLs', exact: true }).fill([77, 88, 89].map(id => `https://archiveofourown.org/series/${id}`).join('\n'))
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })
 await expect(dialog.getByRole('region', { name: 'Series 89 • Series 89' }).getByRole('button', { name: 'Save', exact: true })).toBeVisible()
 for (const id of [77, 88]) {
  const series = dialog.getByRole('region', { name: `Series ${id} • Series ${id}` })
  await expect(series.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await series.getByRole('button', { name: 'Show Series Works', exact: true }).click()
  await expect(series.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
 }
 await dialog.getByRole('button', { name: 'Save All Series', exact: true }).click()
 await expect(dialog.getByRole('button', { name: 'Save All Series', exact: true })).toHaveCount(0)
 expect(tables.library_series.map(series => series.ao3_series_id).sort()).toEqual([77, 89])
})

test('series collection failures share retry styling and recover results and suggestions', async ({ page }) => {
 await fixture(page)
 let fail = true
 for (const rpc of ['query_library', 'library_query_facets']) {
  await page.route(`**/rest/v1/rpc/${rpc}`, route => fail
   ? route.fulfill({ status: 500, json: { code: '57014', message: 'Statement timeout' } })
   : route.fallback())
 }
 await page.goto('/library?shelf=series'); await login(page)
 const alerts = page.locator('.error-message-retry')
 await expect(alerts).toHaveCount(2)
 await expect(alerts.filter({ hasText: 'Could not load filter suggestions.' })).toContainText('The request took too long. Please try again.')
 await expect(alerts.filter({ hasText: 'Could not load these results.' })).toContainText('The request took too long. Please try again.')
 const retry = page.getByRole('button', { name: 'Retry Suggestions', exact: true })
 await retry.focus()
 await page.keyboard.press('Shift+Tab')
 await page.keyboard.press('Tab')
 await expect(retry).toHaveCSS('text-decoration-line', 'underline')
 if (page.viewportSize()!.width > 600) {
  await retry.blur()
  await retry.hover()
  await expect(retry).toHaveCSS('text-decoration-line', 'underline')
 }
 fail = false
 await retry.click()
 await expect(alerts).toHaveCount(0)
 await expect(page.locator('[data-results-loading]')).toHaveCount(0)
 await expect(page.getByRole('heading', { name: 'No Stories Here Yet' })).toBeVisible()
})

test('series results load before suggestions without concurrent catalog or series scans', async ({ page }) => {
 const tables=await fixture(page)
 tables.works.push({id:'queued-work',ao3_work_id:987,title:'Queued work',verified_chapters:{}})
 tables.library_entries.push({id:'queued-entry',work_id:'queued-work',original_url:'https://archiveofourown.org/works/987',reading_status:'to_read',last_read_chapter:0,notes:'',metadata_overrides:{series_memberships:[{id:789,name:'Queued series',url:'https://archiveofourown.org/series/789',position:1}]}})
 tables.works.push({id:'queued-work-2',ao3_work_id:988,title:'Another queued work',verified_chapters:{}})
 tables.library_entries.push({...tables.library_entries[0],id:'queued-entry-2',work_id:'queued-work-2',original_url:'https://archiveofourown.org/works/988'})
 let releaseResults!:()=>void,releaseSuggestions!:()=>void,resultsActive=false,suggestionsActive=false,navigationActive=false,catalogActive=false,overlaps=0
 const resultsGate=new Promise<void>(resolve=>{releaseResults=resolve}),suggestionsGate=new Promise<void>(resolve=>{releaseSuggestions=resolve})
 const requests:string[]=[]
 await page.route('**/rest/v1/rpc/query_library',async route=>{
  requests.push('results');resultsActive=true
  await resultsGate
  resultsActive=false
  await route.fallback()
 })
 await page.route('**/rest/v1/rpc/library_query_facets',async route=>{
  requests.push('suggestions');suggestionsActive=true
  if(resultsActive) {overlaps++;return route.fulfill({status:500,json:{code:'57014',message:'Concurrent series scan timed out'}})}
  await suggestionsGate
  suggestionsActive=false
  await route.fallback()
 })
 await page.route('**/rest/v1/rpc/library_navigation_snapshot',async route=>{
  requests.push('navigation')
  if(resultsActive||suggestionsActive||catalogActive) {overlaps++;return route.fulfill({status:500,json:{code:'57014',message:'Concurrent navigation scan timed out'}})}
  navigationActive=true
  await route.fallback()
  navigationActive=false
 })
 await page.route('**/rest/v1/rpc/library_catalog',async route=>{
  requests.push('catalog')
  if(resultsActive||suggestionsActive||navigationActive) {overlaps++;return route.fulfill({status:500,json:{code:'57014',message:'Concurrent catalog scan timed out'}})}
  catalogActive=true
  await route.fallback()
  catalogActive=false
 })
 try {
  await page.goto('/library?shelf=series');await login(page)
  await expect.poll(()=>requests).toEqual(['results'])
  releaseResults()
  await expect(page.locator('.series-card h2')).toContainText('Queued series')
  await expect.poll(()=>requests).toEqual(['results','suggestions'])
  expect(overlaps).toBe(0)
  await page.getByRole('navigation',{name:'Library Shelves',exact:true}).getByRole('button',{name:'New Collection',exact:true}).last().click()
  await expect(page.getByRole('dialog',{name:'New Collection',exact:true})).toBeVisible()
  expect(requests).not.toContain('catalog')
  releaseSuggestions()
  await expect.poll(()=>requests.slice(0,4)).toEqual(['results','suggestions','navigation','catalog'])
  expect(requests.filter(name=>name==='catalog')).toHaveLength(1)
  expect(overlaps).toBe(0)
  await expect(page.locator('[data-results-loading]')).toHaveCount(0)
  await expect(page.locator('.error-message-retry')).toHaveCount(0)
 } finally {releaseResults();releaseSuggestions()}
})

test('work imports leave related series alone unless the user opts in',async({page})=>{
 const tables=await fixture(page)
 tables.works.push({id:'optout-work',ao3_work_id:765,title:'Direct bookmark',verified_chapters:{}})
 tables.library_entries.push({id:'optout-entry',work_id:'optout-work',original_url:'https://archiveofourown.org/works/765',reading_status:'to_read',last_read_chapter:0,notes:'',metadata_overrides:{series_memberships:[{id:876,name:'Unrequested series',url:'https://archiveofourown.org/series/876',position:1}]}})
 tables.import_batches.push({id:'optout-batch',created_at:'2026-10-27T12:00:00Z'})
 tables.import_items.push({id:'optout-item',batch_id:'optout-batch',entry_id:'optout-entry',status:'completed',metadata_status:'completed'})
 tables.metadata_jobs.push({id:'optout-job',batch_id:'optout-batch',entry_id:'optout-entry',status:'completed'})
 let previews=0
 await page.route('**/functions/v1/series-preview',route=>{previews++;return route.fulfill({status:500,json:{error:'Unexpected related-series request'}})})
 await page.route('**/rest/v1/rpc/submit_import_urls',route=>route.fulfill({json:'optout-batch'}))
 await page.goto('/add');await login(page)
 await expect(page.getByRole('checkbox',{name:'Check Series Containing Imported Works'})).not.toBeChecked()
 await page.getByRole('textbox',{name:'AO3 Work or Series Link'}).fill('https://archiveofourown.org/works/765')
 await page.getByRole('button',{name:'Import from Link',exact:true}).click()
 await expect(page).toHaveURL(/\/stories\/optout-entry$/)
 await expect(page.locator('.story-details-page')).toBeVisible()
 await page.reload()
 await expect(page.locator('.story-details-page')).toBeVisible()
 await expect(page.getByRole('dialog',{name:'Related Series',exact:true})).toHaveCount(0)
 expect(previews).toBe(0)
})


test('saving series details preserves review spacing', async ({ page }) => {
 await fixture(page)
 const preview = { seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77', title: 'Series', description: 'Series description', works: [{ workId: 501, url: 'https://archiveofourown.org/works/501', title: 'Installment', authors: [], tags: [], summary: '', wordCount: 100, chapters: '1/1', complete: true }] }
 let requests = 0
 await page.route('**/functions/v1/series-preview', route => {
  requests++
  return route.fulfill({ json: { preview } })
 })
 await page.goto('/imports'); await login(page)
 await page.getByLabel('AO3 URLs', { exact: true }).fill(preview.normalizedUrl)
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })
 const series = dialog.locator('.series-import-preview')
 await series.getByRole('button', { name: 'Show Series Works', exact: true }).click()
 const measure = () => series.evaluate(element => {
  const heading = element.querySelector('.series-import-heading')!.getBoundingClientRect()
  const description = element.querySelector('.story-summary')!.getBoundingClientRect()
  const footer = element.querySelector('[aria-label="Series Footer Controls"]')!.getBoundingClientRect()
  return [heading.height, description.y - heading.y, footer.height, element.getBoundingClientRect().height]
 })
 const before = await measure()
 await series.getByRole('button', { name: 'Save', exact: true }).first().click()
 await expect(series.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
 expect(await measure()).toEqual(before)
 expect(requests).toBe(1)
})
