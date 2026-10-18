import { expect, test, type Page } from '@playwright/test'

const user = { id: '10000000-0000-0000-0000-000000000001', email: 'reader@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T12:00:00Z' }
const token = () => `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test-signature`

async function mockAuth(page: Page) {
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }))
  await page.route('https://ao3-phase1-test.supabase.co/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/token')) return route.fulfill({ json: { access_token: token(), refresh_token: 'test-only-refresh', expires_in: 3600, token_type: 'bearer', user } })
    if (path.endsWith('/user')) return route.fulfill({ json: user })
    if (path.endsWith('/logout') || path.endsWith('/recover')) return route.fulfill({ json: {} })
    return route.fulfill({ status: 401, json: { message: 'Unauthenticated' } })
  })
}
async function signIn(page: Page) {
  await page.getByLabel('Email address').fill('reader@example.com')
  await page.getByLabel('Password', { exact: true }).fill('Test-password-123!')
  await page.getByRole('button', { name: 'Sign in to your library' }).click()
  await expect(page.getByRole('heading', { name: 'Currently Reading' })).toBeVisible()
}

test.beforeEach(async ({ page }) => { await mockAuth(page) })

test('private deep links require sign-in and the form works with a keyboard', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await page.getByLabel('Email address').fill('reader@example.com')
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
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Profile menu', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Profile menu', exact: true }).getByText('reader', { exact: true })).toBeVisible()
  await expect(page.locator('.profile-identity').getByText('Name', { exact: true })).toHaveCount(0)
  await page.getByRole('region', { name: 'Profile menu', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('reader@example.com')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  if (mobile) {
    const nav = page.getByRole('navigation', { name: 'Mobile navigation' })
    await expect(nav.getByRole('link')).toHaveText(['Reading', 'Library', 'Stats', 'Settings'])
    await expect(nav).toHaveCSS('position', 'fixed')
    await page.getByRole('button', { name: 'Profile menu' }).click()
  }
  await page.getByRole('link', { name: 'Features', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The next chapters' })).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.getByRole('button', { name: 'Profile menu', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
})

test('Add controls are available and layouts fit the viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.screenshot({ path: `test-results/sign-in-${test.info().project.name}.png`, fullPage: true })
  await signIn(page)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add Story', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Import History from AO3/ })).toBeEnabled()
  await expect(page.locator('.add-menu button')).toHaveCount(2)
  await expect(page.locator('.add-option-label svg')).toHaveCount(2)
  await page.locator('.app-header .brand').click()
  await expect(page.locator('.add-menu')).toHaveCount(0)
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.screenshot({ path: `test-results/reading-${test.info().project.name}.png`, fullPage: true })
})

test('recovery form reports delivery without exposing account existence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot your password?' }).click()
  await page.getByLabel('Email address').fill('reader@example.com')
  await page.getByRole('button', { name: 'Send recovery link' }).click()
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
  await page.goto('/')
  await signIn(page)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Import History from AO3', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import History from AO3', exact: true })).toBeVisible()
  await page.getByLabel('AO3 URLs', { exact: true }).fill(Array.from({ length: 110 }, (_, n) => `https://archiveofourown.org/works/${n + 1}`).join('\n') + '\nhttps://example.com')
  await expect(page.getByText(/111 links found · 1 unrelated/)).toBeVisible()
  await page.getByRole('button', { name: 'Import URLs', exact: true }).click()
  await expect(page.getByText(/110 tracked URLs/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit metadata', exact: true })).toHaveCount(110)
  for (const name of ['View saved work', 'Edit metadata']) {
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
  await expect(page.getByRole('link', { name: 'View saved work', exact: true })).toHaveCount(110)
})
