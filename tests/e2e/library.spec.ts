import { expect, test, type Page } from '@playwright/test'
// Browser contract fixtures persist independently of the page and Auth session.
// Real PostgreSQL/RLS coverage is in supabase/tests and the local integration runner.
async function fixture(page: Page) {
  const user = { id: '10000000-0000-0000-0000-000000000001', email: 'reader@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T12:00:00Z' }
  const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`
  await page.route('https://ao3-phase1-test.supabase.co/auth/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/token') ? { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user } : path.endsWith('/user') ? user : {} })
  })
  type Row = Record<string, unknown>
  const tables: Record<string, Row[]> = { library_entries: [], works: [], collections: [], collection_works: [], personal_tags: [], library_entry_tags: [] }
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').pop()!, body = request.postDataJSON() as Row | null
    const now = new Date().toISOString()
    if (table === 'save_library_story' && body) {
      let entry = tables.library_entries.find(e => e.id === body.p_id)
      const workId = String(body.p_url).match(/works\/(\d+)/)![1]
      if (!entry && tables.works.some(w => w.ao3_work_id === Number(workId))) return route.fulfill({ status: 409, json: { code: '23505' } })
      if (!entry) {
        const work = { id: crypto.randomUUID(), ao3_work_id: Number(workId), title: null, summary: null, rating: null, word_count: null, total_chapters: null, published_chapters: null, is_complete: null, verified_chapters: {}, ao3_updated_at: null, canonical_url: null, last_metadata_check: null }
        tables.works.push(work)
        entry = { id: crypto.randomUUID(), user_id: user.id, work_id: work.id, original_url: body.p_url, created_at: now }
        tables.library_entries.push(entry)
      }
      Object.assign(entry, { metadata_overrides: body.p_metadata, reading_status: body.p_status, last_read_chapter: body.p_progress, notes: body.p_notes, is_favorite: body.p_favorite, personal_rating: body.p_rating, updated_at: now })
      tables.collection_works = tables.collection_works.filter(m => m.library_entry_id !== entry.id)
      for (const id of body.p_collections as string[]) tables.collection_works.push({ collection_id: id, library_entry_id: entry.id })
      tables.library_entry_tags = tables.library_entry_tags.filter(t => t.library_entry_id !== entry.id)
      for (const name of body.p_tags as string[]) {
        const tag = { id: crypto.randomUUID(), name }; tables.personal_tags.push(tag); tables.library_entry_tags.push({ library_entry_id: entry.id, personal_tag_id: tag.id })
      }
      return route.fulfill({ json: entry.id })
    }
    const rows = tables[table]
    if (!rows) return route.fulfill({ status: 404, json: {} })
    const id = url.searchParams.get('id')?.replace('eq.', '')
    if (request.method() === 'POST' && body) { rows.push({ id: crypto.randomUUID(), ...body, default_key: null }); return route.fulfill({ status: 201, json: null }) }
    if (request.method() === 'PATCH') { const row = rows.find(r => r.id === id); if (row) Object.assign(row, body, { updated_at: now }); return route.fulfill({ json: request.headers().accept?.includes('object') ? row : null }) }
    if (request.method() === 'DELETE') { tables[table] = rows.filter(r => r.id !== id); if (table === 'collections') tables.collection_works = tables.collection_works.filter(r => r.collection_id !== id); return route.fulfill({ status: 204 }) }
    return route.fulfill({ json: rows })
  })
}
async function login(page: Page) { await page.getByLabel('Email address').fill('reader@example.com'); await page.getByLabel('Password', { exact: true }).fill('Test-password-123!'); await page.getByRole('button', { name: 'Sign in to your library' }).click() }
async function library(page: Page, mobile: boolean) { if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('link', { name: 'Library', exact: true }).click() }

test('manual library workflow persists through refresh and sign-out, on desktop and mobile', async ({ page }, info) => {
  await fixture(page); await page.goto('/library'); await login(page)
  for (const name of ['Comfort reads', 'Long fics']) {
    page.once('dialog', d => d.accept(name)); await page.getByRole('button', { name: 'New Shelf' }).click(); await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Add Story', exact: true }).click()
  await page.getByLabel('AO3 URL', { exact: true }).fill('https://archiveofourown.org/works/123/chapters/999?view_adult=true')
  await page.getByLabel('Title', { exact: true }).fill('A private story')
  await page.getByLabel('Authors (one per line)').fill('Author One\nAuthor Two')
  await page.getByLabel('Fandoms (one per line)').fill('My Fandom')
  await page.getByLabel('Summary', { exact: true }).fill('A manually saved summary.')
  await page.getByLabel('AO3 publication status').selectOption('complete')
  await page.getByLabel('Published chapters', { exact: true }).fill('6')
  await page.getByLabel('Reading status', { exact: true }).selectOption('reading')
  await page.getByLabel('Last fully read chapter').fill('3')
  await page.getByLabel('Private notes', { exact: true }).fill('Remember this moment.')
  await page.getByLabel('Personal rating', { exact: true }).selectOption('5')
  await page.getByLabel('Personal tags (one per line)').fill('Comfort\nRevisit')
  await page.getByLabel('Comfort reads', { exact: true }).check(); await page.getByLabel('Long fics', { exact: true }).check()
  await page.getByLabel('Favorite', { exact: true }).check()
  await page.getByRole('button', { name: 'Save story', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A private story', exact: true })).toBeVisible()
  await expect(page.getByText('Chapter 3 of ? · Next unread chapter: 4', { exact: true })).toBeVisible()
  await expect(page.getByText('Comfort reads, Long fics', { exact: true })).toBeVisible()
  await page.reload(); await expect(page.getByText('Remember this moment.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit chapter progress' }).click()
  await page.getByLabel('Last fully read chapter').fill('4'); await page.getByRole('button', { name: 'Save progress' }).click()
  await expect(page.getByText('Chapter 4 of ? · Next unread chapter: 5', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mark as Caught Up' }).click()
  await expect(page.getByLabel('Reading status for A private story')).toHaveValue('reading')
  await expect(page.getByText('Chapter 6 of ? · Next unread chapter: 7', { exact: true })).toBeVisible()
  await page.getByLabel('Reading status for A private story').selectOption('did_not_finish')
  await page.getByRole('button', { name: 'Sign out' }).click(); await login(page)
  await expect(page.getByText('Remember this moment.', { exact: true })).toBeVisible()
  await page.getByLabel('Reading status for A private story').selectOption('re_reading')
  await page.getByRole('button', { name: 'Edit story', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('My corrected title')
  await page.getByLabel('AO3 URL', { exact: true }).fill('https://archiveofourown.org/works/123/chapters/888')
  await page.getByRole('button', { name: 'Save story', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My corrected title' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open original AO3 story URL' })).toHaveAttribute('href', 'https://archiveofourown.org/works/123/chapters/999?view_adult=true')
  await expect(page.getByRole('link', { name: 'Open updated AO3 URL' })).toHaveAttribute('href', 'https://archiveofourown.org/works/123/chapters/888')
  await library(page, info.project.name === 'mobile')
  await page.getByLabel('Search title or author', { exact: true }).fill('Author Two')
  await expect(page.getByRole('heading', { name: 'My corrected title' })).toBeVisible()
  await page.getByRole('button', { name: 'Comfort reads', exact: true }).click()
  page.once('dialog', d => d.accept('Renamed shelf')); await page.getByRole('button', { name: 'Rename collection' }).click()
  await expect(page.getByRole('heading', { name: 'Renamed shelf' })).toBeVisible()
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete collection' }).click()
  await expect(page.getByRole('heading', { name: 'My corrected title' })).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => innerWidth))
  await page.getByLabel('Story actions for My corrected title').click()
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'Remove from Library' }).click()
  await expect(page.getByRole('heading', { name: 'My corrected title' })).toBeVisible()
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Remove from Library' }).click()
  await expect(page.getByRole('heading', { name: 'No stories here yet' })).toBeVisible()
})

test('Add menu defaults, invalid URLs, duplicates and Cancel preserve the library', async ({ page }, info) => {
  await fixture(page); await page.goto('/library'); await login(page)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Starting a Fic', exact: true }).click()
  await expect(page.getByLabel('Reading status', { exact: true })).toHaveValue('reading')
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No stories here yet' })).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save for Later', exact: true }).click()
  await expect(page.getByLabel('Reading status', { exact: true })).toHaveValue('to_read')
  await page.getByLabel('AO3 URL', { exact: true }).fill('https://example.com/works/123')
  await page.getByLabel('Title', { exact: true }).fill('A manual story')
  await page.getByRole('button', { name: 'Save story', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('supported AO3 work URL')
  await page.getByLabel('AO3 URL', { exact: true }).fill('https://archiveofourown.org/works/123/chapters/4')
  await page.getByRole('button', { name: 'Save story', exact: true }).click()
  await expect(page.getByText('Chapter 0 of ? · Next unread chapter: 1', { exact: true })).toBeVisible()
  await library(page, info.project.name === 'mobile')
  await page.getByRole('link', { name: 'Add Story', exact: true }).click()
  await page.getByLabel('AO3 URL', { exact: true }).fill('https://archiveofourown.org/works/123')
  await page.getByLabel('Title', { exact: true }).fill('Duplicate')
  await page.getByRole('button', { name: 'Save story', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already in your library')
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A manual story', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Favorites', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No stories here yet' })).toBeVisible()
  await page.getByRole('button', { name: 'All works', exact: true }).click()
  await page.getByRole('button', { name: 'Mark favorite', exact: true }).click()
  await page.getByRole('button', { name: 'Favorites', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A manual story', exact: true })).toBeVisible()
})
