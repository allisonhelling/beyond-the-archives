import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('retrieval choices persist independently and requests identify the active layout', async ({ page }, info) => {
 const tables = await fixture(page)
 tables.metadata_preferences.push({ user_id: '10000000-0000-0000-0000-000000000001', retrieval_mode: 'extension', retrieval_mode_mobile: 'direct' })
 await page.goto('/settings#settings-metadata')
 await login(page)
 const desktop = page.getByRole('combobox', { name: 'Desktop Metadata Retrieval', exact: true })
 const mobile = page.getByRole('combobox', { name: 'Mobile Metadata Retrieval', exact: true })
 await expect(desktop).toHaveValue('extension')
 await expect(mobile).toHaveValue('direct')
 // A direct active choice can be saved without a Chrome/Edge connection.
 if (info.project.name === 'desktop') await desktop.selectOption('direct')
 await page.getByRole('button', { name: 'Save Metadata Mode', exact: true }).click()
 await expect(page.getByRole('status').filter({ hasText: 'Metadata mode saved' })).toBeVisible()
 await page.reload()
 await expect(desktop).toHaveValue(info.project.name === 'desktop' ? 'direct' : 'extension')
 await expect(mobile).toHaveValue('direct')
 await page.route('**/rest/v1/rpc/submit_import_urls', route => route.fulfill({ json: null }))
 await page.goto('/imports')
 await expect(page.getByRole('heading', { name: 'Import from CSV (Bookmarks or Marked for Later)', exact: true })).toBeVisible()
 await expect(page.getByRole('heading', { name: 'Previous Batches', exact: true })).toBeVisible()
 await page.getByRole('textbox', { name: 'AO3 URLs', exact: true }).fill('https://archiveofourown.org/works/97000')
 const request = page.waitForRequest('**/rest/v1/rpc/submit_import_urls')
 await page.getByRole('button', { name: 'Import URLs', exact: true }).click()
 expect((await request).headers()['x-client-info']).toContain(`ao3-library/${info.project.name}`)
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
