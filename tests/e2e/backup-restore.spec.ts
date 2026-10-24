import { gzipSync, gunzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { backupTables } from '../../src/types/backups'
import { fixture, login } from './library-fixture'

test('previews a compressed backup and saves the current library before a confirmed restore', async ({ page }) => {
  const tables = await fixture(page)
  const user = '10000000-0000-0000-0000-000000000001', timestamp = '2026-10-21T12:00:00Z'
  tables.works.push({ id: 'work', ao3_work_id: 123, title: 'Shared source title', automatic_metadata: {}, verified_chapters: {} })
  tables.library_entries.push({ id: 'entry', user_id: user, work_id: 'work', original_url: 'https://archiveofourown.org/works/123', notes: 'Current notes',
    reading_status: 'reading', last_read_chapter: 2, is_favorite: true, personal_rating: 4, metadata_overrides: { title: 'My title', authors: ['Author'], fandoms: [], ao3_tags: [] }, extension_metadata: {}, extension_chapters: {}, created_at: timestamp, updated_at: timestamp })
  const snapshot = () => ({ format: 'between-chapters-backup', version: 1, user_id: user, exported_at: timestamp,
    tables: Object.fromEntries(backupTables.map(table => [table, tables[table] ?? []])) })
  const old = structuredClone(snapshot())
  old.tables.library_entries[0].notes = 'Archived notes'
  const events: string[] = []
  const safety = { name: 'safety.json.gz', path: `${user}/safety.json.gz`, createdAt: timestamp, size: 100 }
  await page.route('**/functions/v1/save-backup', async route => {
    if (route.request().method() === 'POST') {
      const bytes = route.request().postDataBuffer()!
      const content = route.request().headers()['content-type'] === 'application/gzip' ? gunzipSync(bytes) : bytes
      expect(JSON.parse(content.toString()).tables.library_entries[0].notes).toBe('Current notes')
      events.push('safety saved')
    }
    return route.fulfill({ json: { backups: events.length ? [safety] : [] } })
  })
  await page.route('**/rest/v1/rpc/export_library_backup', route => route.fulfill({ json: snapshot() }))
  await page.route('**/rest/v1/rpc/preview_library_restore', route => {
    expect(route.request().postDataJSON().p_backup.tables.library_entries[0].notes).toBe('Archived notes')
    events.push('preview')
    return route.fulfill({ json: { counts: { library_entries: { current: 1, backup: 1 } }, fingerprint: 'current', exported_at: timestamp } })
  })
  await page.route('**/rest/v1/rpc/restore_own_library_backup', route => {
    expect(events).toEqual(['preview', 'safety saved'])
    expect(route.request().postDataJSON().p_safety_path).toBe(safety.path)
    events.push('restored')
    return route.fulfill({ json: {} })
  })
  await page.goto('/settings#settings-backup')
  await login(page)
  const section = page.locator('#settings-backup')
  await section.getByLabel('Choose Backup File').setInputFiles({ name: 'library.json.gz', mimeType: 'application/gzip', buffer: gzipSync(JSON.stringify(old)) })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(events).toEqual(['preview'])
  await expect(dialog.getByText('1 current → 1 in backup')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: 'Save Safety Backup and Replace Library' }).click()
  await expect(section.getByRole('button', { name: 'Reload Library' })).toBeVisible()
  expect(events).toEqual(['preview', 'safety saved', 'restored'])
})
