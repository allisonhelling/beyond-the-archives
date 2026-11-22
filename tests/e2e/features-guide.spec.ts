import { desktopCompanion } from './desktop-companion-fixture'
import { blankMetadata } from '../../src/features/library/model'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'
import { libraryQueryFixture } from './library-query-fixture'

test('removes an older installation report without disconnecting the reader or removing cloud books',async({page})=>{
 await fixture(page)
 const older='20000000-0000-0000-0000-000000000001',current='20000000-0000-0000-0000-000000000002'
 let readers=[{id:older,name:'My Organizer',url:'https://reader.example/',reportedAt:'2026-11-04T14:58:40Z',works:[]},{id:current,name:'My Organizer',url:'https://reader.example/',reportedAt:'2026-11-04T15:40:40Z',works:[]}]
 const cloudBook={id:'a'.repeat(64),workId:null,metadata:{...blankMetadata,title:'Cloud Book Kept'},status:'to_read',notes:'',completedCount:0}
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers,stories:[],cloudBooks:[cloudBook]}}))
 const actions:string[]=[]
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>{
  const input=route.request().postDataJSON()
  actions.push(input.p_action)
  if(input.p_action==='forget_report') {
   expect(input.p_installation).toBe(older)
   readers=readers.filter(reader=>reader.id!==input.p_installation)
  }
  return route.fulfill({json:{enabled:true}})
 })
 await page.goto('/library');await login(page);await page.goto('/offline')
 await expect(page.getByText('Latest download report:',{exact:false})).toHaveCount(1)
 await page.getByText('Installation Reports (2)',{exact:true}).click()
 await page.locator('.settings-subsection').filter({hasText:older}).getByRole('button',{name:'Remove Report',exact:true}).click()
 await expect(page.getByText('Installation Reports (1)',{exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Connected Reader',exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Cloud Book Kept',exact:true})).toBeVisible()
 expect(actions).toContain('forget_report');expect(actions).not.toContain('disable')
 await page.reload()
 await expect(page.getByText('Installation Reports (1)',{exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Cloud Book Kept',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('platform availability filters saved works without offering organizer installation names',async({page})=>{
 const tables=await fixture(page)
 tables.reader_availability=[{works:['94001']},{works:['94002']}]
 for(const [index,title] of ['First Download','Second Download','BookFusion Only','Online Story'].entries()) {
  tables.works.push({id:`platform-work-${index}`,ao3_work_id:94001+index,verified_chapters:{}})
  tables.library_entries.push({id:`platform-entry-${index}`,work_id:`platform-work-${index}`,reading_status:'to_read',last_read_chapter:0,original_url:`https://archiveofourown.org/works/${94001+index}`,metadata_overrides:{title,...(index===2?{bookfusion_link:{url:'https://www.bookfusion.com/reader/123',kind:'book'}}:{})}})
 }
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'organizer',name:'My Organizer',url:'https://reader.example/',reportedAt:'2026-11-04T00:00:00Z',works:['94001']}],stories:[]}}))
 await page.goto('/library');await login(page)
 await expect(page.locator('.work-card')).toHaveCount(4)
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 const selector=page.getByRole('button',{name:'Available Offline',exact:true})
 await selector.click()
 await expect(page.getByRole('option',{name:'My Organizer',exact:true})).toHaveCount(0)
 for(const name of ['Apple Books','Kindle','PocketBook']) await expect(page.getByRole('option',{name,exact:true})).toBeDisabled()
 await selector.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 120))
 expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
 await page.getByRole('option',{name:'Online Only',exact:true}).click()
 await expect(page).toHaveURL(/availability=online-only/)
 await expect(page.locator('.work-card')).toHaveCount(1)
 await expect(page.getByRole('link',{name:'Online Story',exact:true})).toBeVisible()
 expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
 await expect(selector).toBeFocused()
 await selector.click()
 await page.getByRole('option',{name:'Any Offline Stories',exact:true}).click()
 await expect(page).toHaveURL(/availability=any-offline/)
 await expect(page.locator('.work-card')).toHaveCount(3)
 await expect(page.getByRole('link',{name:'Online Story',exact:true})).toHaveCount(0)
 await selector.click()
 await page.getByRole('option',{name:'bta reader',exact:true}).click()
 await expect(page).toHaveURL(/availability=unfolded/)
 await expect(page.locator('.work-card')).toHaveCount(2)
 await selector.click();await page.getByRole('option',{name:'BookFusion',exact:true}).click()
 await expect(page.locator('.work-card')).toHaveCount(1)
 await expect(page.getByRole('link',{name:'BookFusion Only',exact:true})).toBeVisible()
 await page.reload()
 await expect(page.locator('.work-card')).toHaveCount(1)
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 await selector.click();await page.getByRole('option',{name:'All Works',exact:true}).click()
 await expect(page.locator('.work-card')).toHaveCount(4)
})

test('suggestion retries preserve results and do not restart requests while idle',async({page})=>{
 await page.clock.install()
 const tables=await fixture(page)
 tables.works.push({id:'suggestions-work',ao3_work_id:94004,verified_chapters:{}})
 tables.library_entries.push({id:'suggestions-entry',work_id:'suggestions-work',reading_status:'to_read',last_read_chapter:0,original_url:'https://archiveofourown.org/works/94004',metadata_overrides:{title:'Retained Results'}})
 let facets=0,pages=0
 await page.route('**/rest/v1/rpc/library_query_facets',route=>++facets===1?route.fulfill({status:500,json:{code:'57014',message:'statement timeout'}}):route.fallback())
 await page.route('**/rest/v1/rpc/query_library',route=>{pages++;return route.fallback()})
 await page.goto('/library');await login(page)
 const retry=page.getByRole('button',{name:'Retry Suggestions',exact:true})
 await expect(retry).toBeVisible()
 await expect(page.getByRole('link',{name:'Retained Results',exact:true})).toBeVisible()
 await page.clock.runFor(60000)
 expect(facets).toBe(1)
 const before=pages
 await retry.click()
 await expect(retry).toHaveCount(0)
 expect(facets).toBe(2)
 expect(pages).toBe(before)
 await expect(page.getByRole('link',{name:'Retained Results',exact:true})).toBeVisible()
})

test('organizer browser titles follow pages and loaded work, author, and series names', async ({ page }) => {
 test.setTimeout(120000)
 const tables = await fixture(page)
 for (const [index, title] of ['Named Work', 'Other Work'].entries()) {
  const workId = 70001 + index
  tables.works.push({ id: `title-work-${index}`, ao3_work_id: workId, verified_chapters: {} })
  tables.library_entries.push({ id: `title-entry-${index}`, work_id: `title-work-${index}`, reading_status: 'to_read', last_read_chapter: 0,
   original_url: `https://archiveofourown.org/works/${workId}`, metadata_overrides: { title, authors: ['Named Author'],
    series_memberships: [{ id: 123, name: 'Named Series', url: 'https://archiveofourown.org/series/123', position: index + 1 }] } })
 }
 await page.goto('/library')
 await expect(page).toHaveTitle('Sign In · Beyond the Archives')
 await login(page)
 await expect(page).toHaveTitle('Library · Beyond the Archives')
 for (const [url, title] of [
  ['/reading', 'Currently Reading'], ['/offline', 'Offline'], ['/wayback', 'Wayback Machine'],
  ['/imports', 'Mass Import from AO3'], ['/imports?tab=site-links', 'Mass Import'], ['/import-fic', 'Add Story'],
  ['/stats', 'Reading Stats'], ['/features', 'Features'], ['/settings', 'Settings'], ['/settings#design', 'Design'],
  ['/settings/example-work', 'Work Info Page Preview'], ['/settings/example-series', 'Series Info Page Preview'],
  ['/authors/Named%20Author', 'Named Author'], ['/stories/title-entry-0', 'Named Work'],
  ['/stories/title-entry-0?edit=metadata', 'Edit Metadata · Named Work'], ['/series/123', 'Named Series'],
 ]) {
  await page.goto(url)
  await expect(page).toHaveTitle(`${title} · Beyond the Archives`, { timeout: 15000 })
 }
})

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

test('applied and selected filter chips use category colors without separator bullets', async ({ page }) => {
 await fixture(page)
 const params = new URLSearchParams({ shelf: 'all', relationship: 'A/B, C/D', characters: 'Alice, Bob' })
 await page.goto(`/library?${params}`); await login(page)
 const active = page.getByLabel('Active Filters')
 const relationship = active.getByRole('button', { name: 'Remove Filter Include (All): A/B', exact: true })
 await expect(relationship).toBeVisible()
 const lastWordOffset = await relationship.evaluate(chip => {
  const range = document.createRange()
  range.selectNodeContents(chip.firstChild!)
  const labelTop = range.getBoundingClientRect().top
  range.selectNodeContents(chip.querySelector('.tag-remove-tail')!.firstChild!)
  return range.getBoundingClientRect().top - labelTop
 })
 expect(lastWordOffset).toBeCloseTo(0, 0)
 await expect(active.locator('.info-separator')).toHaveCount(0)
 await expect(active).not.toContainText('•')
 const categories = { relationships: [107, 63, 112, 255], characters: [53, 92, 112, 255] }
 for (const [category, color] of Object.entries(categories)) {
  const chips = active.locator(`.categorized-tags[data-tag-category="${category}"] .metadata-tag`)
  await expect(chips).toHaveCount(2)
  const renderedColors = await chips.evaluateAll(elements => {
   const context = document.createElement('canvas').getContext('2d')!
   return elements.map(element => {
    context.fillStyle = getComputedStyle(element).color
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
   })
  })
  expect(renderedColors).toEqual([color, color])
 }
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 const chips = page.getByLabel('Relationships Selected Filters')
 await expect(chips).not.toContainText('•')
})

test('work reader shortcuts replace the BookFusion section and plain note actions underline on hover', async ({ page }) => {
 await page.emulateMedia({ reducedMotion: 'reduce' })
 const tables = await fixture(page)
 tables.works.push({ id: 'hover-work', ao3_work_id: 12001, verified_chapters: {} })
 tables.library_entries.push({ id: 'hover-entry', work_id: 'hover-work', original_url: 'https://archiveofourown.org/works/12001', reading_status: 'to_read', last_read_chapter: 0, notes: '', metadata_overrides: { title: 'Hover States', authors: ['Author'], published_chapters: 1, total_chapters: 1, publication_status: 'complete' } })
 await page.goto('/stories/hover-entry'); await login(page)
 const unfolded = page.getByRole('link', { name: 'bta reader', exact: true })
 await expect(unfolded).toHaveCount(0)
 await expect(page.getByRole('link', { name: 'Bookfusion', exact: true })).toHaveCount(0)
 await expect(page.getByRole('button', { name: 'Edit BookFusion Link', exact: true })).toHaveCount(0)
 await page.getByRole('button', { name: 'Add a Note', exact: true }).click()
 const cancel = page.locator('.note-panel').getByRole('button', { name: 'Cancel', exact: true })
 await cancel.hover()
 await expect(cancel).toHaveCSS('text-decoration-line', 'underline')
 const panel = page.getByRole('region', { name: 'Reading and Organization' })
 const button = panel.getByRole('button', { name: 'Add to Collection', exact: true })
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
  await expect(page.locator('.loading-work-card').first()).toBeVisible()
  release()
  await expect(page.getByRole('link', { name: 'Destination Story', exact: true })).toBeVisible()
  await expect(page.locator('.loading-work-card')).toHaveCount(0)
  await page.unroute('**/rest/v1/rpc/query_library')
 }
})

test('direct work links show loading before declaring a work unavailable', async ({ page }) => {
 await fixture(page)
 let release!: () => void
 const blocked = new Promise<void>(resolve => { release = resolve })
 await page.route('**/rest/v1/rpc/library_story_details', async route => {
  await blocked
  await route.fulfill({ json: [] })
 })
 await page.goto('/stories/not-in-library')
 await login(page)
 try {
  await expect(page.getByRole('status').filter({ hasText: 'Loading Work Details…' })).toBeVisible()
  await expect(page.getByText('Story unavailable.', { exact: false })).toHaveCount(0)
 } finally { release() }
 await expect(page.getByText('Story unavailable.', { exact: false })).toBeVisible()
})

test('filter controls stay square and progress sections are centered and divided', async ({ page }) => {
 const tables = await fixture(page)
 tables.works.push({ id: 'layout-work', ao3_work_id: 22000, verified_chapters: {}, published_chapters: 3, is_complete: false })
 tables.library_entries.push({ id: 'layout-entry', work_id: 'layout-work', original_url: 'https://archiveofourown.org/works/22000', reading_status: 'reading', last_read_chapter: 1, notes: 'A note', metadata_overrides: { title: 'Layout Story', authors: [], additional_tags: ['Example Tag'] } })
 tables.metadata_preferences.push({ user_id: '10000000-0000-0000-0000-000000000001', tag_appearance: { shape: 'pill', colors: {} } })
 await page.goto('/library'); await login(page)
 const card = page.locator('.work-card').first()
 await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 240, 227)')
 await expect(card).toHaveCSS('background-color', 'rgb(252, 247, 236)')
 await expect(card).toHaveCSS('border-radius', '0px')
 await expect(card.locator('.book-spine-footer')).toHaveCSS('border-radius', '0px')
 await expect(card.locator('[data-tag-shape="pill"] .metadata-tag')).toHaveCSS('border-radius', '12px')
 await expect(page.getByRole('button', { name: 'Profile Menu', exact: true })).toHaveCSS('border-radius', '50%')
 if (page.viewportSize()!.width > 1100) {
   await expect(page.locator('.app-header').getByRole('link', { name: 'Add Story', exact: true })).toHaveCSS('height', '44px')
 }
 await expect(page.locator('.collection-spine').first()).toHaveCSS('border-radius', '7px')
 await expect(card.locator('.spine-action').first()).toHaveCSS('border-radius', '4px')
 for (const selector of await page.locator('.reading-toolbar .filter-input, .reading-toolbar input, .reading-toolbar .toolbar-actions > .button').all()) await expect(selector).toHaveCSS('border-radius', '0px')
 await page.getByRole('button', { name: 'Filters', exact: true }).click()
 for (const selector of await page.locator('.reading-filters .filter-input, .reading-filters input:not([type=checkbox]), .reading-filters .filter-choice-row > .button').all()) await expect(selector).toHaveCSS('border-radius', '0px')
 const toolbarHide = page.getByRole('region', { name: 'Library Toolbar' }).getByRole('button', { name: 'Hide', exact: true })
 await expect(toolbarHide).toHaveCSS('border-radius', '0px')
 await expect(toolbarHide).toHaveCSS('height', '36px')
 await expect(toolbarHide.locator('svg.lucide-sliders-horizontal')).toBeVisible()
 expect(await toolbarHide.evaluate(button => getComputedStyle(button, '::before').content)).toBe('none')
 const footer = page.locator('.reading-filters .filter-reset-actions')
 for (const name of ['Clear All Filters', 'Apply Filters from Filter Panel', 'Hide']) {
   await expect(footer.getByRole('button', { name, exact: true })).toHaveCSS('height', '44px')
 }
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
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>route.fulfill({json:{enabled:true}}))
 await page.goto('/reading');await login(page)
 const card=page.locator('.work-card'),mobile=info.project.name==='mobile'
 await expect(card).toHaveCount(1)
 const header = page.getByRole('banner')
 const footer = page.getByRole('contentinfo')
 await expect(header.locator('.brand-subtitle')).toHaveCount(0)
 expect((await header.boundingBox())!.height).toBeLessThan(80)
 await expect(footer).toHaveText('A PRIVATE AO3 ORGANIZER')
 await expect(footer).toHaveCSS('border-top-color', 'rgb(236, 221, 216)')
 const authors=card.locator('.authors'),fandoms=card.locator('.work-fandoms')
 expect(await authors.evaluate((node,next)=>Boolean(node.compareDocumentPosition(next as Node)&Node.DOCUMENT_POSITION_FOLLOWING),await fandoms.elementHandle())).toBe(true)
 await expect(card.locator('.expandable-metadata-tags .metadata-tag')).toHaveCount(mobile?4:7)
 const toggle = card.locator('.tags-toggle')
 const triangle = () => toggle.evaluate(button => getComputedStyle(button, '::before').content)
 expect(await triangle()).toBe('none')
 await toggle.click()
 await expect(toggle).toHaveText('Show Less')
 expect(await triangle()).toBe('none')
 await expect(card.locator('.expandable-metadata-tags .metadata-tag')).toHaveText(['Fluff','Hurt/Comfort','Slow Burn','Found Family','A/B','C/D','Alice','Bob','Gen','Warning'])
 await toggle.click()
 const toolbar=page.locator('.reading-toolbar')
 if(mobile) {
  for(const width of [390,320]) {
   await page.setViewportSize({width,height:844})
   const [title,refresh,sort,fandom,apply,filters]=await Promise.all([
    page.getByRole('heading',{name:'Currently Reading',exact:true}),
    page.getByRole('button',{name:'Mass Refresh All Stories on Page',exact:true}),
    toolbar.getByRole('button',{name:'Sort',exact:true}),toolbar.getByRole('button',{name:'Select Fandoms',exact:true}),
    toolbar.getByRole('button',{name:'Apply Filters',exact:true}),toolbar.getByRole('button',{name:'Filters',exact:true}),
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
 // Exercise the fallback font used when Avenir Next and Segoe UI are unavailable.
 if(mobile) await page.addStyleTag({content:':root { --font-sans: Arial, sans-serif; }'})
 const read=page.getByRole('link',{name:'bta reader',exact:true}),wayback=page.getByRole('link',{name:'Search in Wayback Machine',exact:true})
 await expect(read).toBeVisible()
 if(mobile) {
  for(const width of [390,320]) {
   await page.setViewportSize({width,height:844})
   await expect(async () => {
    const first=(await read.boundingBox())!,second=(await wayback.boundingBox())!
    expect(second.x+second.width).toBeLessThanOrEqual(first.x)
    expect(Math.abs(first.y-second.y)).toBeLessThan(2)
    await expect(wayback).toHaveCSS('white-space','nowrap')
    expect(await wayback.evaluate(node=>node.clientHeight<2*parseFloat(getComputedStyle(node).lineHeight)+12)).toBe(true)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   }).toPass({ timeout: 5000 })
  }
 } else await expect(page.locator('.details-updated-action').getByRole('link',{name:'bta reader',exact:true})).toBeVisible()
 await page.screenshot({path:test.info().outputPath('work-info-actions.png'),fullPage:true})
 if(mobile) for(const display of [{workStats:{hidden:['updated']}},{workHeader:{hidden:['stats']}}]) {
  await page.evaluate(value=>localStorage.setItem('between-chapters:display:v1',JSON.stringify(value)),display)
  await page.reload()
  await expect(page.locator('.story-metadata-actions').getByRole('link',{name:'bta reader',exact:true})).toBeVisible()
 }
})

test('clears a retired reader installation selection after report cleanup',async({page})=>{
 await fixture(page)
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'current-browser',name:'My Reader',url:'https://archivesunfolded.vercel.app/',reportedAt:'2026-10-31T00:00:00Z',works:[]}],stories:[]}}))
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>route.fulfill({json:{enabled:true}}))
 await page.goto('/library');await login(page)
 await page.goto('/offline?reader=retired-library-id')
 await expect(page.getByRole('combobox',{name:'Reader Installation',exact:true})).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Open Reader',exact:true})).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Connected Reader',exact:true})).toBeVisible()
 await expect(page).toHaveURL(url=>!url.searchParams.has('reader'))
})

test('Read Offline follows availability and the saved priority in the shared bookspine', async ({ page }, info) => {
 const tables = await fixture(page)
 let available = false
 await page.route('**/rest/v1/rpc/reader_offline_snapshot', route => route.fulfill({ json: { readers: [{ id: 'offline-reader', name: 'Reader', url: 'https://reader.example/', reportedAt: '2026-11-12T00:00:00Z', works: available ? ['99002'] : [] }], stories: [] } }))
 await page.route('**/rest/v1/rpc/reader_organizer_connection', route => route.fulfill({ json: { enabled: true } }))
 tables.works.push({ id: 'offline-work', ao3_work_id: 99002, verified_chapters: {} })
 const metadata = { title: 'Offline Choices', authors: [], published_chapters: 2, total_chapters: 3, publication_status: 'in_progress', bookfusion_link: null as { url: string; kind: string } | null }
 tables.library_entries.push({ id: 'offline-entry', work_id: 'offline-work', original_url: 'https://archiveofourown.org/works/99002', reading_status: 'reading', last_read_chapter: 1, metadata_overrides: metadata })
 await page.goto('/library'); await login(page)
 const card = page.locator('[data-story-id="offline-entry"]'), footer = card.locator('.book-spine-footer')
 await expect(footer.getByRole('button', { name: 'Read Offline', exact: true })).toBeDisabled()
 await expect(footer.getByRole('button', { name: 'Read Offline', exact: true })).toHaveCSS('filter', 'grayscale(1)')
 if (info.project.name === 'desktop') {
  await footer.getByRole('button', { name: 'Read Offline', exact: true }).hover()
  await expect(page.getByRole('tooltip', { name: 'Read Offline', exact: true })).toBeVisible()
 }
 available = true; await page.reload()
 const link = footer.getByRole('link', { name: 'Read Offline', exact: true })
 await expect(link).toHaveAttribute('href', 'https://reader.example/?work=99002')
 const statusBox = (await footer.locator('.spine-status').boundingBox())!, offlineBox = (await link.boundingBox())!
 expect(offlineBox.x).toBeGreaterThanOrEqual(statusBox.x + statusBox.width)
 metadata.bookfusion_link = { url: 'https://www.bookfusion.com/reader/99002', kind: 'book' }
 await page.reload()
 await expect(link).toHaveAttribute('href', 'https://reader.example/?work=99002')
 await page.goto('/settings#settings-browsing')
 await page.getByRole('combobox', { name: 'Read Offline Priority', exact: true }).selectOption('bookfusion')
 await page.goto('/library')
 await expect(link).toHaveAttribute('href', metadata.bookfusion_link.url)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 available = false; await page.reload()
 await expect(link).toHaveAttribute('href', metadata.bookfusion_link.url)
 metadata.bookfusion_link = null; await page.reload()
 await expect(footer.getByRole('button', { name: 'Read Offline', exact: true })).toBeDisabled()
})

test('exports one work in either format and shows bta reader only for a connected EPUB', async ({page},info)=>{
 const tables=await fixture(page)
 let available=false
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'export-reader',name:'My Reader',url:'https://reader.example/',reportedAt:'2026-11-01T00:00:00Z',works:available?['99001']:[]},{id:'second-reader',name:'Second Reader',url:'https://second-reader.example/',reportedAt:'2026-11-01T00:00:00Z',works:available?['99001']:[]}],stories:[]}}))
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>route.fulfill({json:{enabled:true}}))
 tables.works.push({id:'export-work',ao3_work_id:99001,verified_chapters:{}})
 tables.library_entries.push({id:'export-entry',work_id:'export-work',original_url:'https://archiveofourown.org/works/99001',reading_status:'reading',last_read_chapter:1,notes:'Saved private note',created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',metadata_overrides:{title:'Export Example',authors:['Writer'],publication_status:'in_progress',published_chapters:3,total_chapters:5}})
 await page.goto('/library');await login(page)
 const card=page.locator('[data-story-id="export-entry"]')
 await expect(card.locator('.story-menu .menu-surface')).toHaveCount(0)
 await card.getByLabel('Story Actions for Export Example',{exact:true}).click()
 const exportButton=card.getByRole('button',{name:'Export Work Metadata',exact:true})
 let downloads=0
 page.on('download',()=>downloads++)
 await exportButton.click()
 const dialog=page.getByRole('dialog',{name:'Export Work Metadata',exact:true})
 await expect(dialog.getByLabel('Export Format')).toHaveValue('json')
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
 expect(downloads).toBe(0)
 for(const format of ['json','csv']) {
  await card.getByLabel('Story Actions for Export Example',{exact:true}).click()
  await exportButton.click()
  await dialog.getByLabel('Export Format').selectOption(format)
  const downloading=page.waitForEvent('download')
  await dialog.getByRole('button',{name:'Export',exact:true}).click()
  const download=await downloading
  expect(download.suggestedFilename()).toBe(`beyond-the-archives-work-99001.${format}`)
  const content=await readFile((await download.path())!,'utf8')
  if(format==='json') {
   const exported = JSON.parse(content)
   expect(exported.work).toMatchObject({id:'export-entry',notes:'Saved private note',metadata:{title:'Export Example'}})
   expect(exported.source_version).toMatchObject({contractVersion:1,storyId:'export-entry',identity:{kind:'native',platform:'ao3',nativeWorkId:'99001'},
    publishedChapters:{value:3,source:'manual',manualOverride:true},publicationStatus:{value:'in_progress',source:'manual'}})
  }
  else {expect(content).toContain('Export Example');expect(content).toContain('Saved private note')}
 }
 expect(downloads).toBe(2)
 await page.keyboard.press('Escape')
 await card.getByRole('link',{name:'Export Example',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Export Example',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'bta reader',exact:true})).toHaveCount(0)
 const headerExport=page.locator('.work-details-actions').getByRole('button',{name:'Export Metadata',exact:true})
 const refresh=page.locator('.work-details-actions').getByRole('button',{name:'Retry / Update Metadata',exact:true})
 await expect(headerExport).toHaveText('Export Metadata')
 await expect(refresh).toBeVisible()
 const metadataPanel=page.locator('.details-metadata-panel')
 const inlineRefresh=(await metadataPanel.getByRole('button',{name:'Retry / Update Metadata',exact:true}).boundingBox())!,inlineExport=(await metadataPanel.getByRole('button',{name:'Export Work Metadata',exact:true}).boundingBox())!
 expect(inlineExport.x).toBeGreaterThan(inlineRefresh.x)
 expect(Math.abs(inlineExport.y-inlineRefresh.y)).toBeLessThan(2)
 if(info.project.name==='desktop') {await headerExport.hover();await expect(page.getByRole('tooltip',{name:'Export Work Metadata',exact:true})).toBeVisible()}
 await headerExport.click()
 await expect(dialog).toBeVisible()
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
 available=true
 await page.reload()
 const wayback=page.getByRole('link',{name:'Search in Wayback Machine',exact:true}),read=page.getByRole('link',{name:'bta reader',exact:true})
 await expect(wayback).toHaveText('Wayback')
 await expect(read).toHaveAttribute('href','https://reader.example/?work=99001')
 await expect(page.locator('.details-updated-action').getByRole('link',{name:'bta reader',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('mass import tabs preserve link drafts and show Previous Batches in every section',async({page})=>{
 await fixture(page)
 await page.goto('/imports');await login(page)
 await page.getByLabel('AO3 URLs',{exact:true}).fill('https://archiveofourown.org/works/123')
 for(const name of ['Website Links','AO3 Library Sync','CSV List','Calibre (Bookfusion)','Work or Series Links']) {
  await page.getByRole('tab',{name,exact:true}).click()
  const panel=page.getByRole('tabpanel',{name,exact:true})
  await expect(panel.getByRole('heading',{name:'Previous Batches',exact:true})).toBeVisible()
  expect(await panel.evaluate(element=>element.lastElementChild?.querySelector('h2')?.textContent)).toBe('Previous Batches')
 }
 await expect(page.getByRole('textbox',{name:'AO3 URLs',exact:true})).toHaveValue('https://archiveofourown.org/works/123')
 await page.getByRole('tab',{name:'Work or Series Links',exact:true}).press('ArrowRight')
 const websiteTab=page.getByRole('tab',{name:'Website Links',exact:true})
 await expect(websiteTab).toBeFocused()
 await expect(page.getByRole('tabpanel',{name:'Website Links',exact:true})).toBeVisible()
 await websiteTab.press('ArrowRight')
 await expect(page.getByRole('tab',{name:'AO3 Library Sync',exact:true})).toBeFocused()
 await expect(page.getByRole('tabpanel',{name:'AO3 Library Sync',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('offline lists downloaded works across installations of the linked reader account',async({page})=>{
 const tables=await fixture(page)
 tables.works.push({id:'offline-work',ao3_work_id:77111,verified_chapters:{}})
 tables.library_entries.push({id:'offline-entry',work_id:'offline-work',reading_status:'reading',last_read_chapter:0,notes:'',created_at:'2026-11-01T00:00:00Z',metadata_overrides:{title:'Downloaded On Another Installation',authors:['Writer']}})
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'empty-first',name:'Empty Installation',url:'https://reader.example/',reportedAt:'2026-11-01T00:00:00Z',works:[]},{id:'downloaded',name:'Downloaded Installation',url:'https://reader.example/',reportedAt:'2026-11-01T00:00:00Z',works:['77111']}],stories:[{id:'offline-entry',metadata:{title:'Downloaded On Another Installation',authors:['Writer'],fandoms:[],ao3_tags:[],summary:'',rating:'',publication_status:'unknown',published_chapters:null,total_chapters:null,word_count:null},work:{ao3_work_id:77111,verified_chapters:{}},collectionIds:[],personalTags:[],reading_status:'reading',last_read_chapter:0,notes:'',created_at:'2026-11-01T00:00:00Z',original_url:'https://archiveofourown.org/works/77111'}]}}))
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>route.fulfill({json:{enabled:true}}))
 await page.goto('/library');await login(page)
 await page.goto('/offline')
 await expect(page.getByRole('heading',{name:'Downloaded On Another Installation',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Open Reader',exact:true})).toHaveCount(0)
 await expect(page.getByRole('combobox',{name:'Reader Installation',exact:true})).toHaveCount(0)
 await expect(page.getByRole('link',{name:'Read Chapter 1 in EPUB',exact:true})).toHaveAttribute('href','https://reader.example/?work=77111&chapter=1')
})

test('offline shows cloud-only reader works and disconnects without deleting books',async({page})=>{
 await fixture(page)
 let connected=true
 const cloudBook={id:'a'.repeat(64),workId:null,metadata:{...blankMetadata,title:'Cloud-Only Reader Story',authors:['Cloud Writer']},status:'to_read',notes:'Saved in the reader',completedCount:0}
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[],stories:[],cloudBooks:connected?[cloudBook]:[]}}))
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>{
  if(route.request().postDataJSON().p_action==='disable')connected=false
  return route.fulfill({json:{enabled:connected}})
 })
 await page.goto('/library');await login(page);await page.goto('/offline')
 await expect(page.getByRole('heading',{name:'Cloud-Only Reader Story',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Read Chapter 1 in EPUB',exact:true})).toHaveAttribute('href',new RegExp(`\\?book=${cloudBook.id}&chapter=1$`))
 await expect(page.getByRole('link',{name:'Read EPUB',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Clear Retained Hub',exact:true})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'Disconnect Reader',exact:true}).click()
 await expect(page.getByRole('link',{name:'Open Reader',exact:true})).toBeVisible()
 await expect(page.locator('.story-card')).toHaveCount(0)
 expect(connected).toBe(false)
 expect(cloudBook.metadata.title).toBe('Cloud-Only Reader Story')
 await page.reload()
 await expect(page.getByRole('link',{name:'Open Reader',exact:true})).toBeVisible()
 await expect(page.locator('.story-card')).toHaveCount(0)
})

test('offline footers show organizer progress and refresh AO3 reading changes',async({page})=>{
 await page.clock.install()
 const tables=await fixture(page)
 let revision=0
 await page.route('**/rest/v1/rpc/*',route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1)!
  if(name==='library_revision')return route.fulfill({json:revision})
  if(name==='query_library'||name==='library_navigation_snapshot')return route.fulfill({json:{...libraryQueryFixture(name,route.request().postDataJSON(),tables) as Record<string,unknown>,revision}})
  return route.fallback()
 })
 const work={id:'progress-offline-work',ao3_work_id:88001,verified_chapters:{1:'88011',2:'88012',3:'88013'}}
 const entry={id:'progress-offline-entry',work_id:work.id,reading_status:'reading',last_read_chapter:1,notes:'Keep notes',created_at:'2026-11-02T00:00:00Z',original_url:'https://archiveofourown.org/works/88001',metadata_overrides:{title:'Connected Progress',publication_status:'complete',published_chapters:3,total_chapters:3}}
 tables.works.push(work);tables.library_entries.push(entry)
 await page.route('**/rest/v1/rpc/reader_offline_snapshot',route=>route.fulfill({json:{readers:[{id:'connected',name:'Reader',url:'https://reader.example/',reportedAt:'2026-11-02T00:00:00Z',works:['88001']}],stories:[{...entry,work,metadata:{...blankMetadata,...entry.metadata_overrides},collectionIds:[],personalTags:[]}]}}))
 await page.route('**/rest/v1/rpc/reader_organizer_connection',route=>route.fulfill({json:{enabled:true}}))
 await page.goto('/library');await login(page)
 await expect(page.locator('.book-spine-footer .chapter-progress-button')).toHaveText('Ch. 1 / 3')
 await page.getByRole('link',{name:'Offline',exact:true}).click()
 const footer=page.locator('.book-spine-footer')
 await expect(footer.locator('.chapter-progress-button')).toHaveText('Ch. 1 / 3')
 await expect(footer.getByRole('progressbar',{name:'Chapters Read'})).toHaveAttribute('aria-valuenow','1')
 await expect(footer.getByRole('img',{name:'Reading',exact:true})).toBeVisible()
 await expect(footer.getByRole('link',{name:'Read Chapter 2 in EPUB'})).toHaveAttribute('href','https://reader.example/?work=88001&chapter=2')
 await expect(footer.getByRole('button',{name:'Mark as Caught Up'})).toBeDisabled()
 // The AO3 companion saves into this same organizer row while the hub is open.
 entry.last_read_chapter=2
 revision++
 await page.clock.runFor(30001)
 await expect(footer.locator('.chapter-progress-button')).toHaveText('Ch. 2 / 3')
 await expect(footer.getByRole('link',{name:'Read Chapter 3 in EPUB'})).toHaveAttribute('href','https://reader.example/?work=88001&chapter=3')
 entry.last_read_chapter=3;entry.reading_status='finished'
 revision++
 await page.getByRole('button',{name:'Refresh Reader Reports',exact:true}).click()
 await expect(footer.getByRole('img',{name:'Finished',exact:true})).toBeVisible()
 await expect(footer.getByRole('link',{name:'Read Chapter 1 in EPUB'})).toHaveAttribute('href','https://reader.example/?work=88001&chapter=1')
 await page.getByRole('link',{name:'Library',exact:true}).click()
 await expect(page.locator('.book-spine-footer .chapter-progress-button')).toHaveText('Ch. 3 / 3')
})

// These workflows exercise desktop retrieval at both responsive viewport sizes.
test.beforeEach(async({page})=>{await desktopCompanion(page)})
