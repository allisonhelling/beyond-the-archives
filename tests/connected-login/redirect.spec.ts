import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { fixture } from '../e2e/library-fixture'

const organizer = 'http://127.0.0.1:4173', reader = 'http://127.0.0.1:4174'
const destination = '/stats?range=year#calendar'
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'reader@example.com', email_confirmed_at: '2026-10-14T12:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T12:00:00Z' }
const access = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`
const sourceSession = { access_token: access, refresh_token: 'source-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }

async function setup(page: Page, remembered = false, failExchange = false) {
 await fixture(page,{backend:'http://127.0.0.1:54321'})
 if (remembered) await page.addInitScript(({ reader, session }) => { if (location.origin === reader) localStorage.setItem('reader-cloud-auth', JSON.stringify(session)) }, { reader, session: sourceSession })
 const issued: Record<string, unknown>[] = [], redeemed: Record<string, unknown>[] = []
 await page.route('**/functions/v1/app-login', async route => {
  const input = route.request().postDataJSON()
  if (input.action === 'issue') {
   issued.push(input)
   expect(new URL(route.request().headers().origin).origin).toBe(reader)
   expect(input).toMatchObject({ target: organizer, userRequested: true })
   return route.fulfill({ json: { code: 'a'.repeat(64) } })
  }
  redeemed.push(input)
  expect(input.action).toBe('redeem')
  expect(createHash('sha256').update(input.verifier).digest('hex')).toBe(issued[0].challenge)
  return route.fulfill(failExchange ? { status: 401, json: { error: 'Expired or already used' } } : { json: { access_token: access, refresh_token: 'organizer-independent-refresh' } })
 })
 await page.goto(destination)
 await expect(page.getByRole('heading', { name: 'Sign In', exact: true })).toBeVisible()
 await page.getByRole('button', { name: 'Continue From Reader', exact: true }).click()
 await expect(page).toHaveURL(new RegExp(`^${reader}/auth/authorize\\?`))
 await expect(page.getByRole('heading', { name: 'Continue to Organizer', exact: true })).toBeVisible()
 expect(new URL(page.url()).searchParams.get('challenge')).toMatch(/^[a-f0-9]{64}$/)
 expect(page.url()).not.toContain('refresh')
 return { issued, redeemed }
}

test('confirms the available reader account in the same tab and restores the intended organizer page', async ({ page, context }) => {
 const calls = await setup(page, true)
 await expect(page.getByText('reader@example.com', { exact: true })).toBeVisible()
 expect(calls.issued).toHaveLength(0)
 expect(context.pages()).toHaveLength(1)
 await page.getByRole('button', { name: 'Continue to Organizer', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Reading Stats', exact: true })).toBeVisible()
 await expect(page).toHaveURL(organizer + destination)
 expect(calls.issued).toHaveLength(1); expect(calls.redeemed).toHaveLength(1)
 expect(await page.evaluate(() => sessionStorage.getItem('connected-login-redirect:v1'))).toBeNull()
 expect(page.url()).not.toContain('code=')
 await page.getByRole('link', { name: 'Library', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Your Library', exact: true })).toBeVisible()
 await page.goBack()
 await expect(page.getByRole('heading', { name: 'Reading Stats', exact: true })).toBeVisible()
 await page.reload()
 await expect(page.getByRole('heading', { name: 'Reading Stats', exact: true })).toBeVisible()
 expect(calls.redeemed).toHaveLength(1)
})

test('signs in and continues when a different tab holds an inaccessible tab-only reader session', async ({ page, context }) => {
 const other = await context.newPage()
 await other.route(`${reader}/session-holder`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Other Reader Installation</title>' }))
 await other.goto(`${reader}/session-holder`)
 await other.evaluate(session => { localStorage.setItem('reader:remember-session', 'false'); sessionStorage.setItem('reader-cloud-auth', JSON.stringify(session)) }, sourceSession)
 const calls = await setup(page)
 await expect(page.getByText('A login in another browser or installed app may be unavailable here.', { exact: false })).toBeVisible()
 await expect(page.getByLabel('Username or Email', { exact: true })).toBeVisible()
 await page.route('**/auth/v1/token?grant_type=password', route => route.request().postDataJSON().password === 'WrongPassword' ? route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }) : route.fallback())
 await page.getByLabel('Username or Email', { exact: true }).fill('reader@example.com')
 await page.getByLabel('Password', { exact: true }).fill('WrongPassword')
 await page.getByRole('button', { name: 'Sign In', exact: true }).click()
 await expect(page.getByRole('alert')).toContainText('Could not sign in')
 await page.getByLabel('Password', { exact: true }).fill('ValidPassword123!')
 await page.getByRole('button', { name: 'Sign In', exact: true }).click()
 await expect(page.getByText('reader@example.com', { exact: true })).toBeVisible()
 expect(calls.issued).toHaveLength(0)
 await page.getByRole('button', { name: 'Continue to Organizer', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Reading Stats', exact: true })).toBeVisible()
 await expect(page).toHaveURL(organizer + destination)
 expect(calls.redeemed).toHaveLength(1)
 expect(await other.evaluate(() => JSON.parse(sessionStorage.getItem('reader-cloud-auth')!).refresh_token)).toBe('source-refresh')
})

test('cancels back to the intended page without issuing a code or reopening the flow', async ({ page }) => {
 const calls = await setup(page)
 await page.getByRole('button', { name: 'Cancel', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Sign In', exact: true })).toBeVisible()
 await expect(page).toHaveURL(organizer + destination)
 expect(calls.issued).toHaveLength(0); expect(calls.redeemed).toHaveLength(0)
})

test('recovers from failed code exchange with ordinary organizer sign-in at the intended page', async ({ page }) => {
 const calls = await setup(page, true, true)
 await page.getByRole('button', { name: 'Continue to Organizer', exact: true }).click()
 await expect(page.getByRole('alert')).toContainText('code expired or could not be exchanged')
 await expect(page).toHaveURL(organizer + destination)
 await page.getByLabel('Username or Email', { exact: true }).fill('reader@example.com')
 await page.getByLabel('Password', { exact: true }).fill('ValidPassword123!')
 await page.getByRole('button', { name: 'Sign In', exact: true }).click()
 await expect(page.getByRole('heading', { name: 'Reading Stats', exact: true })).toBeVisible()
 expect(calls.redeemed).toHaveLength(1)
})

test('rejects an untrusted authorization target without displaying sign-in or issuing a code', async ({ page }) => {
 await page.goto(`${reader}/auth/authorize?target=https://attacker.example&challenge=${'a'.repeat(64)}&state=${'b'.repeat(64)}`)
 await expect(page.getByRole('alert')).toContainText('authorization request is invalid')
 await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0)
})

test('keeps authorization open with an account switch when reader access is denied', async ({ page }) => {
 await setup(page, true)
 await page.route('**/functions/v1/app-login', route => route.fulfill({ status: 403, json: { error: 'Reader account access required' } }))
 await page.getByRole('button', { name: 'Continue to Organizer', exact: true }).click()
 await expect(page.getByRole('alert')).toContainText('does not have reader access')
 await page.getByRole('button', { name: 'Use Another Account', exact: true }).click()
 await expect(page.getByLabel('Username or Email', { exact: true })).toBeVisible()
 await expect(page).toHaveURL(new RegExp(`^${reader}/auth/authorize\\?`))
})
