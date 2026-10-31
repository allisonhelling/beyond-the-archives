import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('features guide links to every current workflow on desktop and mobile', async ({ page }) => {
 await fixture(page)
 await page.goto('/features'); await login(page)
 await expect(page.getByRole('heading', { name: 'Features', exact: true })).toBeVisible()
 const navigation = page.getByRole('navigation', { name: 'Features Navigation' })
 await expect(navigation).toBeVisible()
 for (const link of await navigation.getByRole('link').all()) {
  const href = await link.getAttribute('href')
  await expect(page.locator(href!)).toHaveCount(1)
 }
 await navigation.getByRole('link', { name: 'Combine Search Terms, Tag Filters, and Saved Defaults' }).click()
 await expect(page).toHaveURL(/#search$/)
 await expect(page.getByText('Standard Tags', { exact: true })).toBeVisible()
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('applied filter separators follow category colors and selected chips omit bullets', async ({ page }) => {
 await fixture(page)
 const params = new URLSearchParams({ shelf: 'all', relationship: 'A/B, C/D', characters: 'Alice, Bob' })
 await page.goto(`/library?${params}`); await login(page)
 const active = page.getByLabel('Active Filters')
 await expect(active.getByText('Relationships: A/B', { exact: true })).toBeVisible()
 const separators = active.locator('.filter-chips > .info-separator')
 expect(await separators.count()).toBeGreaterThanOrEqual(3)
 for (const separator of await separators.all()) {
  const text = separator.locator('.metadata-tag')
  if ((await separator.getAttribute('class'))?.includes('filter-category-boundary')) await expect(text).toHaveCSS('color', 'rgb(0, 0, 0)')
  else {
   const category = await separator.getAttribute('data-tag-category')
   const color = await active.locator(`.filter-chips > .categorized-tags[data-tag-category="${category}"]`).first().evaluate(element => getComputedStyle(element).color)
   await expect(text).toHaveCSS('color', color)
  }
 }
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 const chips = page.getByLabel('Relationships Selected Filters')
 await expect(chips).not.toContainText('•')
})

test('BookFusion uses a pencil and plain note actions underline on hover', async ({ page }) => {
 const tables = await fixture(page)
 tables.works.push({ id: 'hover-work', ao3_work_id: 12001, verified_chapters: {} })
 tables.library_entries.push({ id: 'hover-entry', work_id: 'hover-work', original_url: 'https://archiveofourown.org/works/12001', reading_status: 'to_read', last_read_chapter: 0, notes: '', metadata_overrides: { title: 'Hover States', authors: ['Author'], published_chapters: 1, total_chapters: 1, publication_status: 'complete' } })
 await page.goto('/stories/hover-entry'); await login(page)
 const edit = page.getByRole('button', { name: 'Edit BookFusion Link', exact: true })
 await expect(edit).toBeVisible()
 await expect(edit).toHaveText('')
 await expect(edit.locator('svg')).toHaveCount(1)
 await page.getByRole('button', { name: 'Add a Note', exact: true }).click()
 const cancel = page.locator('.note-panel').getByRole('button', { name: 'Cancel', exact: true })
 await cancel.hover()
 await expect(cancel).toHaveCSS('text-decoration-line', 'underline')
 const panel = page.getByRole('region', { name: 'Reading and Organization' })
 const button = panel.locator('.button.secondary').first()
 await button.hover()
 const fill = await panel.evaluate(element => getComputedStyle(element).backgroundColor)
 await expect(button).not.toHaveCSS('background-color', fill)
})

test('collection transitions clear old tiles while destination requests are pending', async ({ page }) => {
 const tables = await fixture(page)
 for (const [index, status] of ['reading', 'to_read'].entries()) {
  tables.works.push({ id: `transition-work-${index}`, ao3_work_id: 20000 + index, verified_chapters: {}, published_chapters: 3, is_complete: false })
  tables.library_entries.push({ id: `transition-entry-${index}`, work_id: `transition-work-${index}`, original_url: `https://archiveofourown.org/works/${20000 + index}`, reading_status: status, last_read_chapter: index ? 0 : 1, metadata_overrides: { title: index ? 'Destination Story' : 'Previous Story', authors: [] } })
 }
 for (const mode of ['library', 'reading']) {
  await page.goto(`/${mode}?shelf=${mode === 'library' ? 'all' : 'view_all'}`)
  if (mode === 'library') await login(page)
  await expect(page.getByRole('link', { name: 'Previous Story', exact: true })).toBeVisible()
  let release!: () => void, started!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const requested = new Promise<void>(resolve => { started = resolve })
  await page.route('**/rest/v1/rpc/query_library', async route => {
   if (route.request().postDataJSON()?.p_query?.shelf === 'to_read') { started(); await blocked }
   await route.fallback()
  })
  if (mode === 'library') await page.locator('.collection-spine').filter({ hasText: 'To Read' }).click()
  else await page.getByRole('button', { name: 'To Read', exact: true }).click()
  await requested
  await expect(page.getByRole('link', { name: 'Previous Story', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Destination Story', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-results-loading="true"]')).toBeVisible()
  release()
  await expect(page.getByRole('link', { name: 'Destination Story', exact: true })).toBeVisible()
  await page.unroute('**/rest/v1/rpc/query_library')
 }
})

test('passive surfaces are square and progress sections are centered and divided', async ({ page }) => {
 const tables = await fixture(page)
 tables.works.push({ id: 'layout-work', ao3_work_id: 22000, verified_chapters: {}, published_chapters: 3, is_complete: false })
 tables.library_entries.push({ id: 'layout-entry', work_id: 'layout-work', original_url: 'https://archiveofourown.org/works/22000', reading_status: 'reading', last_read_chapter: 1, notes: 'A note', metadata_overrides: { title: 'Layout Story', authors: [] } })
 await page.goto('/library'); await login(page)
 const card = page.locator('.work-card').first()
 await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 240, 227)')
 await expect(card).toHaveCSS('background-color', 'rgb(252, 247, 236)')
 await expect(card).toHaveCSS('border-radius', '0px')
 await expect(card.locator('.book-spine-footer')).toHaveCSS('border-radius', '0px')
 await expect(page.locator('.collection-spine').first()).toHaveCSS('border-radius', '7px')
 await expect(card.locator('.spine-action').first()).toHaveCSS('border-radius', '4px')
 for (const selector of await page.locator('.reading-toolbar .filter-input, .reading-toolbar input, .reading-toolbar > .button').all()) await expect(selector).toHaveCSS('border-radius', '4px')
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 for (const selector of await page.locator('.reading-filters .filter-input, .reading-filters input:not([type=checkbox]), .reading-filters .filter-grid > .button, .reading-filters .filter-choice-row > .button').all()) await expect(selector).toHaveCSS('border-radius', '4px')
 await expect(page.getByRole('region', { name: 'Library Toolbar' }).getByRole('button', { name: 'Hide', exact: true })).toHaveCSS('border-radius', '4px')
 await page.getByRole('link', { name: 'Layout Story', exact: true }).click()
 const panel = page.getByRole('region', { name: 'Reading and Organization' })
 await expect(panel).toHaveCSS('background-color', 'rgb(241, 225, 209)')
 await expect(page.locator('.note-panel-filled')).toHaveCSS('background-color', 'rgb(241, 225, 209)')
 await expect(panel).toHaveCSS('border-radius', '0px')
 const sections = panel.locator('.progress-sections > *')
 await expect(sections).toHaveCount(3)
 for (const section of await sections.all()) await expect(section).toHaveCSS('text-align', 'center')
 const mobile = page.viewportSize()!.width <= 600
 await expect(sections.nth(1)).toHaveCSS(mobile ? 'border-top-width' : 'border-left-width', '1px')
 const headingFont = await page.getByRole('heading', { name: 'Layout Story', exact: true }).evaluate(element => getComputedStyle(element).fontFamily)
 await expect(panel.getByRole('heading', { name: 'Reading and Organization', exact: true })).toHaveCSS('font-family', headingFont)
 await expect(panel.locator('.rating-heading')).toHaveCSS('font-family', headingFont)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
 await page.screenshot({ path: test.info().outputPath('progress-layout.png'), fullPage: true })
})

test('work tiles and phone organizer controls use the requested reading layout',async({page},info)=>{
 const tables=await fixture(page)
 tables.works.push({id:'layout-order-work',ao3_work_id:44001,verified_chapters:{},published_chapters:3,is_complete:false})
 tables.library_entries.push({id:'layout-order-entry',work_id:'layout-order-work',original_url:'https://archiveofourown.org/works/44001',reading_status:'reading',last_read_chapter:1,notes:'',metadata_overrides:{title:'Layout Order Story',authors:['Layout Author'],fandoms:['Layout Fandom'],relationship_tags:['A/B','C/D'],character_tags:['Alice','Bob'],additional_tags:['Fluff','Hurt/Comfort','Slow Burn','Found Family'],categories:['Gen'],archive_warnings:['Warning'],published_chapters:3,total_chapters:3}})
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'layout-reader',name:'My Reader',url:'https://archivesunfolded.vercel.app/',reportedAt:'2026-10-30T00:00:00Z',works:['44001']}],stories:[]}}))
 await page.goto('/reading');await login(page)
 const card=page.locator('.work-card'),mobile=info.project.name==='mobile'
 await expect(card).toHaveCount(1)
 const authors=card.locator('.authors'),fandoms=card.locator('.work-fandoms')
 expect(await authors.evaluate((node,next)=>Boolean(node.compareDocumentPosition(next as Node)&Node.DOCUMENT_POSITION_FOLLOWING),await fandoms.elementHandle())).toBe(true)
 await expect(card.locator('.expandable-metadata-tags .metadata-tag')).toHaveCount(mobile?4:7)
 await card.getByRole('button',{name:/more$/}).click()
 await expect(card.locator('.expandable-metadata-tags .metadata-tag')).toHaveText(['Fluff','Hurt/Comfort','Slow Burn','Found Family','A/B','C/D','Alice','Bob','Gen','Warning'])
 await card.getByRole('button',{name:'Show Less',exact:true}).click()
 const toolbar=page.locator('.reading-toolbar')
 if(mobile) {
  for(const width of [390,320]) {
   await page.setViewportSize({width,height:844})
   const [title,refresh,sort,fandom,apply,filters]=await Promise.all([
    page.getByRole('heading',{name:'Currently Reading',exact:true}),
    page.getByRole('button',{name:'Mass Refresh All Stories on Page',exact:true}),
    toolbar.getByRole('button',{name:'Sort',exact:true}),toolbar.getByRole('button',{name:'Select Fandoms',exact:true}),
    toolbar.getByRole('button',{name:'Apply',exact:true}),toolbar.getByRole('button',{name:'Filters',exact:true}),
   ].map(async locator=>(await locator.boundingBox())!))
   expect(refresh.y).toBeLessThan(title.y+title.height)
   expect(refresh.y+refresh.height).toBeGreaterThan(title.y)
   expect(refresh.x).toBeGreaterThanOrEqual(title.x+title.width)
   expect(sort.x+sort.width).toBeLessThanOrEqual(fandom.x)
   expect(Math.abs(sort.y-fandom.y)).toBeLessThan(2)
   expect(apply.x+apply.width).toBeLessThanOrEqual(filters.x)
   expect(Math.abs(apply.y-filters.y)).toBeLessThan(2)
   await expect(page.locator('.pagination-inline').getByRole('button',{name:'Sort',exact:true})).toHaveCount(0)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
  await page.setViewportSize({width:390,height:844})
 } else await expect(page.locator('.pagination-inline').getByRole('button',{name:'Sort',exact:true})).toBeVisible()
 await page.screenshot({path:test.info().outputPath('tile-controls.png'),fullPage:true})
 await card.getByRole('link',{name:'Layout Order Story',exact:true}).click()
 const read=page.getByRole('link',{name:'Read EPUB',exact:true}),wayback=page.getByRole('link',{name:'View in Wayback Machine',exact:true})
 await expect(read).toBeVisible()
 if(mobile) {
  for(const width of [390,320]) {
   await page.setViewportSize({width,height:844})
   const first=(await read.boundingBox())!,second=(await wayback.boundingBox())!
   expect(first.x+first.width).toBeLessThanOrEqual(second.x)
   expect(Math.abs(first.y-second.y)).toBeLessThan(2)
   await expect(wayback).toHaveCSS('white-space','nowrap')
   expect(await wayback.evaluate(node=>node.clientHeight<2*parseFloat(getComputedStyle(node).lineHeight)+12)).toBe(true)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
 } else await expect(page.locator('.story-metadata-actions').getByRole('link',{name:'Read EPUB',exact:true})).toBeVisible()
 await page.screenshot({path:test.info().outputPath('work-info-actions.png'),fullPage:true})
 if(mobile) for(const display of [{workStats:{hidden:['updated']}},{workHeader:{hidden:['stats']}}]) {
  await page.evaluate(value=>localStorage.setItem('between-chapters:display:v1',JSON.stringify(value)),display)
  await page.reload()
  await expect(page.locator('.story-metadata-actions').getByRole('link',{name:'Read EPUB',exact:true})).toBeVisible()
 }
})
