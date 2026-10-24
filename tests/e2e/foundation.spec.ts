import { libraryQueryFixture } from './library-query-fixture'
import { expect, test, type Page } from '@playwright/test'

const user = { id: '10000000-0000-0000-0000-000000000001', email: 'reader@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T12:00:00Z' }
const token = () => `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test-signature`

async function mockAuth(page: Page) {
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/**', route => { const name=new URL(route.request().url()).pathname.split('/').pop()!; return route.fulfill({json:libraryQueryFixture(name,route.request().method()==='POST'?route.request().postDataJSON():{}, {})??[]}) })
  await page.route('https://ao3-phase1-test.supabase.co/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: token(), refresh_token: 'test-only-refresh', expires_in: 3600, token_type: 'bearer', user } })
    if (path.endsWith('/user')) return route.fulfill({ json: user })
    if (path.endsWith('/logout') || path.endsWith('/recover')) return route.fulfill({ json: {} })
    return route.fulfill({ status: 401, json: { message: 'Unauthenticated' } })
  })
}
async function signIn(page: Page) {
  await page.getByLabel('Email Address').fill('reader@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Sign In to Your Library' }).click()
  await expect(page.getByRole('heading', { name: 'Currently Reading' })).toBeVisible()
}

test.beforeEach(async ({ page }) => { await mockAuth(page) })

test('private deep links require sign-in and the form works with a keyboard', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await page.getByLabel('Email Address').fill('reader@example.com')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  await page.keyboard.type('Test-password-123!')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
})

test('responsive navigation, persistence, and sign-out', async ({ page }, testInfo) => {
  await page.goto('/')
  await signIn(page)
  const mobile = testInfo.project.name === 'mobile'
  await expect(page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('link', { name: 'Settings', exact: true })).toHaveCount(mobile ? 0 : 1)
  await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Profile Menu', exact: true }).getByText('reader', { exact: true })).toBeVisible()
  await expect(page.locator('.profile-identity').getByText('Name', { exact: true })).toHaveCount(0)
  await page.getByRole('region', { name: 'Profile Menu', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click()
  if (mobile) await page.getByRole('navigation', { name: 'Settings Sections', exact: true }).getByRole('link', { name: 'Account & Security', exact: true }).click()
  await expect(page.getByText('reader@example.com')).toBeVisible()
  await page.reload()
  await expect(page.getByText('reader@example.com')).toBeVisible()
  if (mobile) await page.getByRole('button', { name: 'Back to Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  if (mobile) {
    const nav = page.getByRole('navigation', { name: 'Mobile Navigation' })
    await expect(nav.getByRole('link')).toHaveText(['Reading', 'Library', 'Add', 'Stats', 'Settings'])
    await expect(nav).toHaveCSS('position', 'fixed')
    expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(56)
    const active=nav.getByRole('link',{name:'Settings',exact:true})
    await expect(active).toHaveCSS('background-color','rgba(0, 0, 0, 0)')
    await expect(active).toHaveCSS('color','rgb(151, 0, 0)')
    expect(await active.evaluate(link=>getComputedStyle(link,'::before').backgroundColor)).toBe('rgb(151, 0, 0)')

  }
  await page.getByRole('button', { name: 'Profile Menu' }).click()
  await page.getByRole('link', { name: 'Features', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The Next Chapters' })).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Log Out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
})

test('Add controls are available and layouts fit the viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.screenshot({ path: `test-results/sign-in-${test.info().project.name}.png`, fullPage: true })
  await signIn(page)
  if (test.info().project.name === 'mobile') {
    await expect(page.locator('.app-header .add-wrapper')).toBeHidden()
    const add = page.getByRole('navigation', { name: 'Mobile Navigation' }).getByRole('link', { name: 'Add', exact: true })
    await expect(add.locator('svg')).toHaveCount(1)
    await add.click()
    await expect(page.getByRole('heading', { name: 'Add Story', exact: true })).toBeVisible()
  } else {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Add Story', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: /Import History from AO3/ })).toBeEnabled()
    await expect(page.locator('.add-menu button')).toHaveCount(2)
    await expect(page.locator('.add-option-label svg')).toHaveCount(2)
    await page.locator('.app-header .brand').click()
    await expect(page.locator('.add-menu')).toHaveCount(0)
  }
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.screenshot({ path: `test-results/reading-${test.info().project.name}.png`, fullPage: true })
})

test('recovery form reports delivery without exposing account existence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot Your Password?' }).click()
  await page.getByLabel('Email Address').fill('reader@example.com')
  await page.getByRole('button', { name: 'Send Recovery Link' }).click()
  await expect(page.getByRole('status')).toContainText('If this address has an account')
})

test('large imports show persisted results and fit the viewport after returning to the page', async ({ page }) => {
  let originals: string[] = []
  const batch = { id: '20000000-0000-0000-0000-000000000001', user_id: user.id, created_at: new Date().toISOString(), cancelled_at: null }
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/rpc/submit_import_urls', async route => {
    originals = (route.request().postDataJSON() as { p_urls: string[] }).p_urls
    return route.fulfill({ json: batch.id })
  })
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/import_batches*', route => route.fulfill({ json: originals.length ? [batch] : [] }))
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/import_items*', route => route.fulfill({ json: originals.filter(url => url.includes('archiveofourown.org')).map((url, i) => ({ id: `item-${i}`, batch_id: batch.id, original_url: url, ao3_work_id: Number(url.match(/works\/(\d+)/)?.[1]), chapter_id: null, status: 'completed', result: 'imported', metadata_status: 'completed', error_category: null, entry_id: `entry-${i}`, last_attempt_at: batch.created_at })) }))
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/rpc/paged_import_history',route=>route.fulfill({json:libraryQueryFixture('paged_import_history',route.request().postDataJSON(),{import_batches:originals.length?[batch]:[],import_items:originals.filter(url => url.includes('archiveofourown.org')).map((url,i)=>({id:`item-${i}`,batch_id:batch.id,original_url:url,ao3_work_id:Number(url.match(/works\/(\d+)/)?.[1]),chapter_id:null,status:'completed',result:'imported',metadata_status:'completed',error_category:null,entry_id:`entry-${i}`,last_attempt_at:batch.created_at}))})}))
  await page.goto('/')
  await signIn(page)
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
    await page.getByRole('link', { name: 'Import History from AO3', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: 'Import History from AO3', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Mass Import from AO3', exact: true })).toBeVisible()
  await page.getByLabel('AO3 URLs', { exact: true }).fill(Array.from({ length: 110 }, (_, n) => `https://archiveofourown.org/works/${n + 1}`).join('\n') + '\nhttps://example.com')
  await expect(page.getByText(/111 links found · 1 unrelated/)).toBeVisible()
  await page.getByRole('button', { name: 'Import URLs', exact: true }).click()
  await expect(page.getByText(/110 tracked URLs/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Review: 0',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByText('Batch finished. No failed, skipped, or cancelled results to review.')).toBeVisible()
  await page.getByRole('button',{name:'All Results: 110',exact:true}).click()
  await expect(page.getByRole('link', { name: 'Edit Metadata', exact: true })).toHaveCount(50)
  const results=page.locator('.import-results')
  const resultPages=page.getByRole('navigation',{name:'Result Pages'}).last()
  await expect(resultPages).toContainText('1–50 of 110')
  await resultPages.getByRole('button',{name:'Next',exact:true}).click()
  await expect(resultPages).toContainText('51–100 of 110')
  await resultPages.getByRole('button',{name:'Next',exact:true}).click()
  await expect(results.locator('tbody tr')).toHaveCount(10)
  await resultPages.getByRole('button',{name:'Prev',exact:true}).click()
  await resultPages.getByRole('button',{name:'Prev',exact:true}).click()
  await expect(results.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('button',{name:'failed: 0',exact:true}).click()
  await expect(results.getByText('No failed results in this batch.')).toBeVisible()
  await expect(page.getByRole('button',{name:'completed: 110',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'completed: 110',exact:true}).click()
  await expect(results.locator('tbody tr')).toHaveCount(50)
  await page.getByRole('button',{name:'All Results: 110',exact:true}).click()

  for (const name of ['View Saved Work', 'Edit Metadata']) {
    const link = page.getByRole('link', { name, exact: true }).first()
    await page.mouse.move(0, 0)
    await expect(link).toHaveCSS('color', 'rgb(128, 0, 32)')
    await expect(link).toHaveCSS('text-decoration-line', 'none')
    await link.hover()
    await expect(link).toHaveCSS('text-decoration-line', 'underline')
  }
  const row = page.locator('.import-results tbody tr').first()
  const detailSize = await row.locator('small').first().evaluate(el => getComputedStyle(el).fontSize)
  for (const cell of await row.locator('td').all()) await expect(cell).toHaveCSS('font-size', detailSize)
  for (const link of await row.getByRole('link').all()) await expect(link).toHaveCSS('font-size', detailSize)
  for (const status of await row.locator('.import-result-status').all()) await expect(status).toHaveCSS('text-transform', 'uppercase')
  const captionSpacing = await page.locator('.import-results caption').evaluate(el => ({ letters: parseFloat(getComputedStyle(el).letterSpacing), words: parseFloat(getComputedStyle(el).wordSpacing) }))
  expect(captionSpacing.letters).toBeGreaterThan(0)
  expect(captionSpacing.words).toBeGreaterThan(captionSpacing.letters)
  expect(originals.length).toBe(111)
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => innerWidth))
  await page.reload()
  await expect(page.getByText(/110 tracked URLs/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Review: 0',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.getByRole('button',{name:'All Results: 110',exact:true}).click()
  await expect(page.getByRole('link', { name: 'View Saved Work', exact: true })).toHaveCount(50)
})

test('series imports require explicit work selection and fit desktop and mobile', async ({ page }) => {
 let submitted: string[] = []
 await page.route('https://ao3-phase1-test.supabase.co/functions/v1/series-preview', route => route.fulfill({ json: { preview: {
  seriesId: 77, normalizedUrl: 'https://archiveofourown.org/series/77', title: 'Stories and art', description: 'Choose the works you want.',
  works: [
   { workId: 101, url: 'https://archiveofourown.org/works/101', position: 1, title: 'The story', authors: ['Author'], summary: 'An adventure.', tags: ['Adventure'], wordCount: 12000, chapters: '2/2', complete: true },
   { workId: 102, url: 'https://archiveofourown.org/works/102', position: 4, title: 'Art extras', authors: ['Author'], summary: 'Drawings.', tags: ['Fanart'], wordCount: 0, chapters: '1/1', complete: true },
  ],
 } } }))
 await page.route('https://ao3-phase1-test.supabase.co/rest/v1/rpc/submit_import_urls', async route => {
  const body = route.request().postDataJSON()
  submitted = body.p_urls
  expect(body.p_reading_status).toBe('reading')
  expect(body.p_series_ids).toEqual([77])
  await route.fulfill({ json: 'series-batch' })
 })
 await page.goto('/')
 await signIn(page)
 await page.goto('/imports')
 await page.getByLabel('AO3 URLs').fill('https://archiveofourown.org/series/77')
 await expect(page.getByRole('combobox', { name: 'Reading Status', exact: true })).toHaveValue('to_read')
 await page.getByRole('combobox', { name: 'Reading Status', exact: true }).selectOption('reading')
 await page.getByRole('button', { name: 'Review Series', exact: true }).click()
 await expect(page.getByRole('combobox', { name: 'Reading Status', exact: true })).toHaveValue('reading')
 expect(submitted).toEqual([])
 await expect(page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })).toBeVisible()
 await expect(page.getByRole('button', { name: 'Load works' })).toHaveCount(0)
 await expect(page.getByRole('link', { name: 'Stories and art • Series 77', exact: true })).toHaveAttribute('href', 'https://archiveofourown.org/series/77')
 await expect(page.getByRole('link', { name: 'View series on AO3', exact: true })).toHaveCount(0)
 const story = page.getByRole('checkbox', { name: 'Part 1: The story' })
 await expect(story).not.toBeChecked()
 await expect(page.getByRole('checkbox', { name: 'Part 4: Art extras' })).not.toBeChecked()
 await expect(page.getByText('An adventure.', { exact: true })).toBeVisible()
 await expect(page.getByText('Adventure', { exact: true })).toBeVisible()
 await expect(page.getByRole('link', { name: 'View on AO3: The story', exact: true })).toHaveAttribute('href', 'https://archiveofourown.org/works/101')
 await expect(page.locator('.series-work-choice').first()).toHaveCSS('font-size', '16px')
 await expect(page.locator('.series-import-work summary').first()).toHaveCSS('font-size', '16px')
 const seriesControls = page.getByRole('group', { name: 'All Series Top Controls', exact: true })
 await seriesControls.getByRole('button', { name: 'Hide All', exact: true }).click()
 await expect(page.getByText('An adventure.', { exact: true })).not.toBeVisible()
 await expect(page.getByText('Drawings.', { exact: true })).not.toBeVisible()
 await seriesControls.getByRole('button', { name: 'View All', exact: true }).click()
 await expect(page.getByText('An adventure.', { exact: true })).toBeVisible()
 await expect(page.getByText('Drawings.', { exact: true })).toBeVisible()
 await story.check()
 expect(submitted).toEqual([])
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
 await page.getByRole('button', { name: 'Import Selected', exact: true }).click()
 await expect(page.getByText(/Batch saved\./)).toBeVisible()
 expect(submitted).toEqual(['https://archiveofourown.org/works/101'])
})


for (const hash of ['#ios-safari-userscript', '#ao3-browser-bar']) test(`Browser bar instructions link ${hash} scrolls directly to its settings section after sign-in`, async ({ page }) => {
  await page.goto(`/settings${hash}`)
  await page.getByLabel('Email Address').fill('reader@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Sign In to Your Library' }).click()
  await expect(page.getByRole('heading', { name: 'AO3 Browser Bar', exact: true })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'AO3 Browser Bar', exact: true })).toBeInViewport()
})
