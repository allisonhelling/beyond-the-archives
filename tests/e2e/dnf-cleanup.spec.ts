import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'
import type { CleanupSettings } from '../../src/features/settings/dnf-cleanup'

test('DNF settings support custom retention, previewed cleanup, and archive navigation', async ({ page }, info) => {
 await fixture(page)
 let settings: CleanupSettings = { enabled: false, hours: 168, protect_favorites: true, protect_personal: true, protect_collections: true }
 let cleaned = false
 const errors: string[] = []
 page.on('pageerror', error => errors.push(error.message))
 await page.route('**/rest/v1/rpc/dnf_cleanup', route => {
  const { p_action: action, p_input: input } = route.request().postDataJSON()
  if (action === 'save') settings = input.settings
  if (action === 'cleanup') {
   expect(input.entries).toHaveLength(1)
   expect(input.entries[0].id).toBe('dnf-entry')
   cleaned = true
  }
  if (action === 'archive') return route.fulfill({ json: { total: cleaned ? 1 : 0, records: cleaned ? [{ id: 'dnf-entry', ao3_work_id: 123, metadata: { title: 'The archived fic', authors: ['Writer'] }, last_read_chapter: 2, dnf_since: '2026-10-01T00:00:00Z', archived_at: '2026-10-24T00:00:00Z' }] : [] } })
  return route.fulfill({ json: { settings, eligible: cleaned ? 0 : 1, protected: 2, waiting: 0, removed: action === 'cleanup' ? 1 : 0,
   ...(action === 'preview' ? { entries: [{ id: 'dnf-entry', version: '2026-10-01T00:00:00Z', title: 'The archived fic', dnf_since: '2026-10-01T00:00:00Z', eligible_at: '2026-10-08T00:00:00Z' }] } : {}),
  } })
 })
 await page.goto('/settings#settings-dnf-cleanup')
 await login(page)
 const section = page.locator('#settings-dnf-cleanup')
 await expect(section.getByLabel('Clean Up After')).toHaveValue('168')
 await expect(section.getByLabel('Automatically Clean Up DNF Fics')).not.toBeChecked()
 await section.getByLabel('Clean Up After').selectOption('custom')
 await section.getByLabel('Custom Amount').fill('12')
 await section.getByLabel('Custom Unit').selectOption('hours')
 await expect(section.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
 await section.getByLabel('Custom Amount').fill('49')
 await section.getByLabel('Automatically Clean Up DNF Fics').check()
 await section.getByRole('button', { name: 'Save Settings' }).click()
 await expect(section.getByRole('status')).toHaveText('DNF cleanup settings saved.')
 await page.reload()
 await expect(section.getByLabel('Custom Amount')).toHaveValue('49')
 await expect(section.getByLabel('Custom Unit')).toHaveValue('hours')
 await expect(section.getByLabel('Automatically Clean Up DNF Fics')).toBeChecked()
 await section.getByRole('button', { name: 'Preview Cleanup' }).click()
 await expect(section.getByText('The archived fic', { exact: true })).toBeVisible()
 await section.getByRole('button', { name: 'Clean Up Now' }).click()
 const dialog = page.getByRole('dialog', { name: 'Clean Up DNF Fics?' })
 await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
 await dialog.getByRole('button', { name: 'Clean Up Now' }).click()
 await expect(section.getByRole('status')).toHaveText('Cleaned up 1 fics. Their compact reading records were preserved.')
 await section.getByRole('button', { name: 'View Archived Reading Activity' }).click()
 await expect(section.getByText('The archived fic', { exact: true })).toBeVisible()
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
 await page.screenshot({ path: info.outputPath('dnf-settings.png'), fullPage: true })
 await section.getByRole('link', { name: 'Add Again' }).click()
 await expect(page.getByRole('textbox', { name: /AO3.*link|AO3.*URL/i })).toHaveValue('https://archiveofourown.org/works/123')
 expect(errors).toEqual([])
})
