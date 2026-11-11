import { desktopCompanion } from './desktop-companion-fixture'
import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('loading remains visible above mobile navigation and inside native dialogs until requests finish', async ({ page }) => {
 await fixture(page)
 let release!: () => void
 const pending = new Promise<void>(resolve => { release = resolve })
 await page.route('**/rest/v1/rpc/query_library', async route => { await pending; await route.fallback() })
 try {
  await page.goto('/library'); await login(page)
  const indicator = page.getByRole('progressbar', { name: 'Loading or Processing' })
  await expect(indicator).toBeVisible()
  await expect(indicator.locator('.loading-icon')).toHaveCSS('animation-name', 'metadata-refresh-spin')
  const bounds = (await indicator.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  const navigation = page.getByRole('navigation', { name: 'Mobile Navigation' })
  if (await navigation.isVisible()) expect(bounds.y + bounds.height).toBeLessThan((await navigation.boundingBox())!.y)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(indicator.locator('.loading-icon')).toHaveCSS('animation-name', 'none')
  await page.getByRole('navigation', { name: 'Library Shelves' }).getByRole('button', { name: 'New Collection', exact: true }).last().click()
  const dialog = page.getByRole('dialog', { name: 'New Collection', exact: true })
  await expect(dialog.getByRole('progressbar', { name: 'Loading or Processing' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(indicator).toBeVisible()
  release()
  await expect(indicator).toHaveCount(0)
 } finally { release() }
})

test('series preview loading stays visible in its dialog and clears after failure', async ({ page }) => {
 await fixture(page)
 let release!: () => void
 const pending = new Promise<void>(resolve => { release = resolve })
 await page.route('**/functions/v1/series-preview', async route => {
  await pending
  await route.fulfill({ status: 503, json: { error: 'Series temporarily unavailable' } })
 })
 try {
  await page.goto('/imports'); await login(page)
  await page.getByLabel('AO3 URLs', { exact: true }).fill('https://archiveofourown.org/series/77')
  await page.getByRole('button', { name: 'Review Series', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose Works From Series', exact: true })
  const indicator = dialog.getByRole('progressbar', { name: 'Loading or Processing' })
  await expect(indicator).toBeVisible()
  await expect(indicator).toContainText('Loading series preview…')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  release()
  await expect(dialog.getByRole('alert')).toHaveText('Series temporarily unavailable')
  await expect(indicator).toHaveCount(0)
 } finally { release() }
})

// These workflows exercise desktop retrieval at both responsive viewport sizes.
test.beforeEach(async({page})=>{await desktopCompanion(page)})
