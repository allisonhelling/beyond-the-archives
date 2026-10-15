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
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('reader@example.com')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Features', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'The next chapters' })).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
  await page.getByRole('button', { name: 'Sign out' }).click()
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
  await expect(page.getByRole('button', { name: /Save for Later/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Starting a Fic/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Import History from AO3/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
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
