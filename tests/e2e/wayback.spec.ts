import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'
const workUrl = 'https://archiveofourown.org/works/123'
const snapshot = `https://web.archive.org/web/20260101000000/${workUrl}?view_adult=true`
test('work actions open the newest checked Wayback result in a new tab and details offer the same action', async ({ page, context }) => {
 const tables = await fixture(page)
 tables.works.push({ id: 'wayback-work', ao3_work_id: 123, verified_chapters: {} })
 tables.library_entries.push({ id: 'wayback-entry', work_id: 'wayback-work', original_url: workUrl, reading_status: 'to_read', last_read_chapter: 0, notes: '', metadata_overrides: { title: 'Archived Story' } })
 // Popups share context routing; the lookup tab keeps the existing organizer session.
 await context.route('https://ao3-phase1-test.supabase.co/auth/v1/**', route => route.fulfill({ json: {} }))
 await context.route('https://ao3-phase1-test.supabase.co/functions/v1/wayback-lookup', async route => {
  expect(route.request().postDataJSON()).toEqual({ url: workUrl })
  await route.fulfill({ json: { url: snapshot, kind: 'adult_warning', checked: 2 } })
 })
 await context.route('https://web.archive.org/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Archived Adult Warning</h1>' }))
 await page.goto('/library'); await login(page)
 await page.getByLabel('Story Actions for Archived Story').click()
 const popupPromise = page.waitForEvent('popup')
 await page.getByRole('link', { name: 'View in Wayback Machine', exact: true }).click()
 const popup = await popupPromise
 await expect(popup).toHaveURL(snapshot)
 await expect(popup.getByRole('heading', { name: 'Archived Adult Warning' })).toBeVisible()
 await popup.close()
 await page.goto('/stories/wayback-entry')
 const updated = page.locator('.details-story-stats').locator('div').filter({has:page.locator('dt').filter({hasText:/^Date Updated$/})})
 await expect(updated.getByRole('link', { name: 'View in Wayback Machine', exact: true })).toBeVisible()
 await expect(page.locator('.story-metadata-actions').getByRole('link', { name: 'View in Wayback Machine', exact: true })).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('lookup failures offer the work calendar and retry without altering library data', async ({ page }) => {
 await fixture(page)
 await page.route('https://ao3-phase1-test.supabase.co/functions/v1/wayback-lookup', route => route.fulfill({ json: { kind: 'calendar', reason: 'unavailable', checked: 0 } }))
 await page.goto(`/wayback?${new URLSearchParams({ url: workUrl })}`); await login(page)
 await expect(page.getByText('Wayback Machine could not be fully checked.', { exact: false })).toBeVisible()
 await expect(page.getByRole('link', { name: 'Browse Snapshot Calendar' })).toHaveAttribute('href', `https://web.archive.org/web/*/${workUrl}`)
 await page.getByRole('button', { name: 'Try Again' }).click()
 await expect(page.getByRole('link', { name: 'Browse Snapshot Calendar' })).toBeVisible()
})
