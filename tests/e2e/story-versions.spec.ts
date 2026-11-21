import { expect, test } from '@playwright/test'
import type { Story } from '../../src/features/library/model'
import { fixture, login } from './library-fixture'
import { libraryQueryFixture } from './library-query-fixture'

test('reviews, links, switches and unlinks independently tracked versions', async ({ page }) => {
 const tables = await fixture(page)
 const anchor = '55000000-0000-4000-8000-000000000001', alternate = '55000000-0000-4000-8000-000000000002'
 const group = 'synthetic-group'
 const timestamp = '2026-11-18T00:00:00.000Z'
 for (const [id, title, url, progress] of [
  [anchor, 'Original Edition', 'https://archiveofourown.org/works/99023', 2],
  [alternate, 'Other Edition', 'https://fiction.example/story/23', 1],
 ] as const) {
  tables.works.push({ id: `work-${id}`, ao3_work_id: id === anchor ? 99023 : null, verified_chapters: {},
   automatic_metadata: { summary_html: id === anchor ? '<a href="https://fiction.example/story/23">Other edition</a>'
    : '<a href="https://archiveofourown.org/works/99023">Original edition</a>' } })
  tables.library_entries.push({ id, work_id: `work-${id}`, original_url: url, source_url: id === alternate ? url : null,
   is_favorite: id === anchor, personal_rating: id === anchor ? 3 : null, reading_status: 'reading', last_read_chapter: progress, notes: `Notes for ${title}`, created_at: timestamp, updated_at: timestamp,
   metadata_overrides: { title, authors: ['Writer'], published_chapters: 4 } })
 }
 let linked = false
 await page.route('**/rest/v1/rpc/story_versions', route => {
  const { p_entry, p_linked_urls } = route.request().postDataJSON()
  expect(p_linked_urls).toEqual([p_entry === anchor ? 'https://fiction.example/story/23' : 'https://archiveofourown.org/works/99023'])
  const sources = libraryQueryFixture('library_story_details', { p_ids: [anchor, alternate] }, tables) as Story[]
  return route.fulfill({ json: {
   versions: linked ? sources : sources.filter(story => story.id === p_entry),
   revision: linked ? 'linked' : 'separate',
   candidates: linked ? [] : sources.filter(story => story.id !== p_entry),
  } })
 })
 await page.route('**/rest/v1/rpc/write_story_versions', route => {
  const input = route.request().postDataJSON()
  expect(input.p_revision).toBe(linked ? 'linked' : 'separate')
  expect(input.p_target).toBe(alternate)
  if (input.p_action === 'link') {
   expect(input.p_target_updated_at).toBe(timestamp)
   expect(input.p_organization).toEqual({ favorite: true, rating: 3, notes: 'A shared note', tags: ['Shared tag'], collections: [] })
   expect(input.p_target_organization.notes).toBe('Notes for Other Edition')
  }
  linked = input.p_action === 'link'
  tables.crosspost_organization = linked ? [{ group_id: group, settings: input.p_organization }] : []
  for (const entry of tables.library_entries) entry.crosspost_group_id = linked ? group : null
  return route.fulfill({ json: input.p_entry })
 })
 await page.route('**/rest/v1/rpc/story_completion', route => route.fulfill({ json: { status: null, override: null, prompt: null } }))
 await page.route('**/rest/v1/rpc/story_chapter_groups', route => route.fulfill({ json: [] }))
 await page.goto(`/stories/${anchor}`)
 await login(page)
 await expect(page.getByRole('button', { name: 'Crossposted Sites', exact: true })).toHaveCount(0)
 await page.getByRole('button', { name: 'Link Crosspost', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Compare Versions' })
 await dialog.getByRole('button', { name: 'Other Edition · fiction.example' }).click()
 await expect(dialog.getByRole('heading', { name: 'Review Selected Version' })).toBeVisible()
 await expect(dialog.getByText('The captured source summaries link to each other.')).toBeVisible()
 expect(linked).toBe(false)
 await expect(dialog.getByText('Notes for Original Edition')).toBeVisible()
 await expect(dialog.getByText('Notes for Other Edition')).toBeVisible()
 await dialog.getByRole('button', { name: 'Copy Settings From Original Edition · AO3' }).click()
 await expect(dialog.getByRole('checkbox', { name: 'Shared Favorite' })).toBeChecked()
 await dialog.getByRole('textbox', { name: 'Shared Private Notes' }).fill('A shared note')
 const tag = dialog.getByRole('textbox', { name: 'Personal Tags', exact: true })
 await tag.fill('Shared tag')
 await tag.press('Enter')
 await dialog.getByRole('button', { name: 'Confirm Same Story' }).click()
 await expect(dialog.getByText(/1 \/ 4 Chapters Read/)).toBeVisible()
 await expect(dialog.getByText(/2 \/ 4 Chapters Read/)).toBeVisible()
 await dialog.getByRole('link', { name: 'View Version' }).click()
 await expect(page.getByRole('heading', { name: 'Other Edition', exact: true })).toBeVisible()
 await expect(page.getByText('A shared note', { exact: true })).toBeVisible()
 const crossposted = page.getByRole('button', { name: 'Crossposted Sites', exact: true })
 await crossposted.focus()
 await expect(page.getByRole('tooltip', { name: 'Crossposted to AO3', exact: true })).toBeVisible()
 await page.getByRole('button', { name: 'Compare Versions', exact: true }).click()
 await dialog.getByRole('button', { name: 'Unlink fiction.example Version' }).click()
 await expect(dialog.getByRole('heading', { name: 'Original Edition' })).toHaveCount(0)
 expect(linked).toBe(false)
 await dialog.getByRole('button', { name: 'Close Dialog' }).click()
 await expect(crossposted).toHaveCount(0)
 await expect(page.getByText('Notes for Other Edition', { exact: true })).toBeVisible()
})

test('lists distinct linked sites beside Published On in natural language', async ({ page }) => {
 const tables = await fixture(page)
 const [anchor, ...alts] = ['https://archiveofourown.org/works/99023', 'https://fiction.example/one', 'https://fiction.example/two', 'https://stories.example/one', 'https://archive.example/one'].map((url, index) => {
  const id = `55000000-0000-4000-8000-00000000000${index + 1}`
  tables.works.push({ id: `work-${id}`, ao3_work_id: index === 0 ? 99023 : null, verified_chapters: {} })
  tables.library_entries.push({ id, work_id: `work-${id}`, original_url: url, source_url: index ? url : null, crosspost_group_id: 'synthetic-group', reading_status: 'to_read', metadata_overrides: { title: `Edition ${index}` } })
  return id
 })
 let versionCount = 3
 await page.route('**/rest/v1/rpc/story_versions', route => route.fulfill({ json: {
  versions: libraryQueryFixture('library_story_details', { p_ids: [anchor, ...alts.slice(0, versionCount)] }, tables),
  revision: 'linked', candidates: [],
 } }))
 await page.route('**/rest/v1/rpc/story_completion', route => route.fulfill({ json: { status: null, override: null, prompt: null } }))
 await page.goto(`/stories/${anchor}`)
 await login(page)
 const label = page.locator('.published-on-label').filter({ hasText: 'Published On' })
 const badge = label.getByRole('button', { name: 'Crossposted Sites' })
 await badge.focus()
 await expect(page.getByRole('tooltip', { name: 'Crossposted to fiction.example and stories.example', exact: true })).toBeVisible()
 versionCount = 4
 await page.reload()
 await badge.focus()
 await expect(page.getByRole('tooltip', { name: 'Crossposted to fiction.example, stories.example, and archive.example', exact: true })).toBeVisible()
})
