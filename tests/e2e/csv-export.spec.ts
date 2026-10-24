import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { automaticCollectionRules } from '../../src/features/library/collections/automatic-collections'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import { fixture, login } from './library-fixture'

test('downloads selected CSVs and the whole library in one ZIP on desktop and mobile', async ({ page }) => {
  const tables = await fixture(page)
  const timestamp = '2026-10-21T12:00:00Z'
  // Cross the full-library loader's page boundary and the visible catalog size.
  for (let id = 1; id <= 1001; id++) {
    tables.works.push({ id: `work-${id}`, ao3_work_id: id, verified_chapters: {} })
    tables.library_entries.push({ id: `entry-${id}`, work_id: `work-${id}`, reading_status: 'reading', last_read_chapter: 1,
      notes: `Private note ${id}`, personal_rating: 4, is_favorite: true, created_at: timestamp, updated_at: timestamp,
      original_url: `https://archiveofourown.org/works/${id}`, metadata_overrides: { title: `Saved work ${id}`, authors: ['Writer'], fandoms: [], ao3_tags: [], summary: '', publication_status: 'complete' } })
  }
  tables.collections.push({ id: 'custom', name: 'My custom shelf', description: 'My description', color: '#800020', symbol: '✦', sort_position: 1, automatic_rules: null },
    { id: 'automatic', name: 'All favorites', automatic_rules: automaticCollectionRules({ ...defaultReadingFilters, favorites: true }) })
  tables.collection_works.push({ library_entry_id: 'entry-1001', collection_id: 'custom' })
  tables.library_series.push({ id: 'series', ao3_series_id: 7, notes: 'Private series note', reading_status: 'finished', is_favorite: true, metadata: { title: 'Saved series', works: [] } })
  tables.collection_series.push({ library_series_id: 'series', collection_id: 'custom' })
  tables.reading_records.push({ id: 'archived', reading_status: 'did_not_finish', metadata: { title: 'Archived DNF title', authors: ['Writer'] }, last_read_chapter: 2 })
  await page.goto('/settings#settings-csv-export')
  await login(page)
  await expect(page.getByRole('heading', { name: 'Export CSV', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const allDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV ZIP' }).click()
  const download = await allDownload
  expect(download.suggestedFilename()).toMatch(/^between-chapters-export-.*\.zip$/)
  const archive = await readFile((await download.path())!)
  expect(archive.readUInt32LE(0)).toBe(0x04034b50)
  const text = archive.toString('utf8')
  for (const content of ['works.csv', 'series.csv', 'collections.csv', 'collection_memberships.csv', 'reading_records.csv', 'Archived DNF title', 'Private note 1001', 'Private series note', 'My custom shelf', 'automatic_rules', 'All favorites']) expect(text).toContain(content)
  await expect(page.locator('#settings-csv-export').getByRole('status')).toHaveText('Your ZIP download has started.')
  await page.getByRole('checkbox', { name: 'Export all' }).uncheck()
  await expect(page.getByRole('button', { name: 'Download CSV ZIP' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /^collections.csv/ }).check()
  const selectedDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV ZIP' }).click()
  const selected = await readFile((await (await selectedDownload).path())!)
  const selectedText = selected.toString('utf8')
  expect(selectedText).toContain('collections.csv')
  for (const excluded of ['works.csv', 'series.csv', 'collection_memberships.csv', 'reading_records.csv', 'Archived DNF title', 'Private note', 'Private series note']) expect(selectedText).not.toContain(excluded)
})
