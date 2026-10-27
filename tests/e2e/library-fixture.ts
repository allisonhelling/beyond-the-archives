import { recordReadingTransition } from '../../src/features/library/reading-history'
import type { Story } from '../../src/features/library/model'
import { mergeEdits, type EditValues } from '../../src/features/library/edit-merge'
import type { Page } from '@playwright/test'
import { libraryQueryFixture } from './library-query-fixture'
// Browser contract fixtures persist independently of the page and Auth session.
// Real PostgreSQL/RLS coverage is in supabase/tests and the local integration runner.
export async function fixture(page: Page) {
  const user = { id: '10000000-0000-0000-0000-000000000001', email: 'reader@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-14T12:00:00Z' }
  const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`
  await page.route('https://ao3-phase1-test.supabase.co/auth/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/token') ? { access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user } : path.endsWith('/user') ? user : {} })
  })
  type Row = Record<string, unknown>
  const tables: Record<string, Row[]> = { library_entries: [], library_series: [], collection_series: [], metadata_preferences: [], reading_records: [], import_batches: [], import_items: [], works: [], collections: [], collection_works: [], personal_tags: [], library_entry_tags: [], tags: [], work_tags: [], authors: [], work_authors: [], fandoms: [], work_fandoms: [], metadata_jobs: [] }
  await page.route('https://ao3-phase1-test.supabase.co/functions/v1/tag-resolution', route => route.fulfill({ json: { records: tables.ao3_tag_resolutions ?? [], retryAfterMs: null } }))
  const snapshot = (entry: Row): EditValues => ({ status: entry.reading_status as string, progress: entry.last_read_chapter as number, notes: entry.notes as string, rating: entry.personal_rating as number | null, favorite: entry.is_favorite as boolean, rec: (entry.is_rec ?? false) as boolean, metadata: entry.metadata_overrides as EditValues, tags: tables.library_entry_tags.filter(link => link.library_entry_id === entry.id).map(link => String(tables.personal_tags.find(tag => tag.id === link.personal_tag_id)?.name)), collections: tables.collection_works.filter(link => link.library_entry_id === entry.id).map(link => String(link.collection_id)) })
  await page.route('https://ao3-phase1-test.supabase.co/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').pop()!, body = request.postDataJSON() as Row | null
    const now = new Date().toISOString()
    if (table === 'dnf_cleanup') return route.fulfill({ json: { settings: { enabled: false, hours: 168, protect_favorites: true, protect_personal: true, protect_collections: true }, eligible: 0, protected: 0, waiting: 0, removed: 0 } })
    if (table === 'personal_rating_settings') {
      let settings = tables.metadata_preferences.find(row => row.user_id === user.id)
      const input = body?.p_input as Row | undefined
      if (input && Object.hasOwn(input, 'text')) {
        if (!settings) { settings = { user_id: user.id, retrieval_mode: 'direct' }; tables.metadata_preferences.push(settings) }
        settings.personal_rating_info = input.text
      }
      return route.fulfill({ json: { ratingInfo: settings?.personal_rating_info ?? null } })
    }
    if (['review_import_reading','library_revision','library_navigation_snapshot','library_navigation','library_query_facets','library_catalog','library_story_details','query_library','paged_import_history'].includes(table)) return route.fulfill({ json: libraryQueryFixture(table,body??{},tables) })
    if (table === 'ensure_library_series' && body) {
      if (!tables.library_series.some(series => series.ao3_series_id === body.p_series)) tables.library_series.push({id:crypto.randomUUID(),user_id:user.id,ao3_series_id:body.p_series,notes:'',is_favorite:false,reading_status:'to_read',created_at:now,updated_at:now,metadata:{seriesId:body.p_series,title:body.p_title,normalizedUrl:`https://archiveofourown.org/series/${body.p_series}`,description:'',works:[],basic:true}})
      return route.fulfill({status:204})
    }
    if (table === 'remember_library_series' && body) {
      const metadata = body.p_metadata as Row
      let series = tables.library_series.find(series => series.ao3_series_id === metadata.seriesId)
      if (!series) { series = { id: crypto.randomUUID(), user_id: user.id, ao3_series_id: metadata.seriesId, notes: '', is_favorite:false, reading_status:'to_read', created_at: now }; tables.library_series.push(series) }
      Object.assign(series, { metadata, updated_at: now }); return route.fulfill({ json: series.id })
    }
    if (table === 'save_library_series_note' && body) {
      const series = tables.library_series.find(series => series.ao3_series_id === body.p_series)!
      const base = { notes: series.notes as string }, review = mergeEdits({ notes: body.p_base as string }, { notes: body.p_notes as string }, base)
      if (review.conflicts.length) return route.fulfill({ status: 409, json: { code: '40001', details: JSON.stringify({ ...review, base }) } })
      series.notes = review.merged.notes; return route.fulfill({ status: 204 })
    }
    if (['save_library_story_checked', 'update_library_entry_checked'].includes(table) && body) {
      const entry = tables.library_entries.find(entry => entry.id === body.p_id)
      let values = body.p_input as EditValues
      if (entry) {
        const base = snapshot(entry), review = mergeEdits(body.p_base as EditValues, values, base)
        if (review.conflicts.length) return route.fulfill({ status: 409, json: { code: '40001', details: JSON.stringify({ ...review, base }) } })
        values = review.merged
      }
      if (table === 'update_library_entry_checked') {
        const previous = { ...entry! } as unknown as Story
        Object.assign(entry!, { reading_status: values.status, last_read_chapter: values.progress, notes: values.notes, personal_rating: values.rating, is_favorite: values.favorite, is_rec: values.rec, updated_at: now })
        recordReadingTransition(entry! as unknown as Story, previous, now)
        return route.fulfill({ status: 204 })
      }
      Object.assign(body, { p_metadata: values.metadata, p_status: values.status, p_progress: values.progress, p_notes: values.notes, p_rating: values.rating, p_favorite: values.favorite, p_rec: values.rec, p_collections: values.collections, p_tags: values.tags })
    }
    if (['save_library_story', 'save_library_story_checked'].includes(table) && body) {
      let entry = tables.library_entries.find(e => e.id === body.p_id)
      const workId = String(body.p_url).match(/works\/(\d+)/)![1]
      if (!entry && tables.works.some(w => w.ao3_work_id === Number(workId))) return route.fulfill({ status: 409, json: { code: '23505' } })
      if (!entry) {
        const work = { id: crypto.randomUUID(), ao3_work_id: Number(workId), title: null, summary: null, rating: null, word_count: null, total_chapters: null, published_chapters: null, is_complete: null, verified_chapters: {}, ao3_updated_at: null, canonical_url: null, last_metadata_check: null }
        tables.works.push(work)
        entry = { id: crypto.randomUUID(), user_id: user.id, work_id: work.id, original_url: body.p_url, created_at: now }
        tables.library_entries.push(entry)
      }
      Object.assign(entry, { metadata_overrides: { ...entry.metadata_overrides as Row, ...body.p_metadata as Row }, reading_status: body.p_status, last_read_chapter: body.p_progress, notes: body.p_notes, is_favorite: body.p_favorite, is_rec: body.p_rec ?? entry.is_rec ?? false, personal_rating: body.p_rating, updated_at: now })
      const selected = body.p_collections as string[]
      tables.collection_works = tables.collection_works.filter(m => m.library_entry_id !== entry.id || selected.includes(String(m.collection_id)))
      for (const id of selected) if (!tables.collection_works.some(m => m.library_entry_id === entry.id && m.collection_id === id)) {
        tables.collection_works.push({ collection_id: id, library_entry_id: entry.id, created_at: now })
        Object.assign(tables.collections.find(collection => collection.id === id)!, { last_story_added_at: now })
      }
      tables.library_entry_tags = tables.library_entry_tags.filter(t => t.library_entry_id !== entry.id)
      for (const name of body.p_tags as string[]) {
        const tag = { id: crypto.randomUUID(), name }; tables.personal_tags.push(tag); tables.library_entry_tags.push({ library_entry_id: entry.id, personal_tag_id: tag.id })
      }
      return route.fulfill({ json: entry.id })
    }
    if (table === 'restore_library_story' && body) {
      const entry = body.p_entry as Row
      if (tables.library_entries.some(row => row.id === entry.id || row.work_id === entry.work_id)) return route.fulfill({ status: 409, json: { code: '23505' } })
      tables.library_entries.push(entry)
      for (const id of body.p_collections as string[]) if (tables.collections.some(c => c.id === id)) tables.collection_works.push({ collection_id: id, library_entry_id: entry.id })
      for (const name of body.p_tags as string[]) {
        const tag = tables.personal_tags.find(tag => tag.name === name)
        if (tag) tables.library_entry_tags.push({ library_entry_id: entry.id, personal_tag_id: tag.id })
      }
      return route.fulfill({ json: entry.id })
    }
    if (table === 'reorder_collections' && body) {
      for (const [position, id] of (body.p_ids as string[]).entries()) Object.assign(tables.collections.find(collection => collection.id === id)!, { sort_position: position })
      return route.fulfill({ status: 204 })
    }
    const rows = tables[table]
    if (!rows) return route.fulfill({ status: 404, json: {} })
    const id = url.searchParams.get('id')?.replace('eq.', '')
    if (request.method() === 'POST' && table === 'metadata_preferences' && body) {
      const existing = rows.find(row => row.user_id === body.user_id)
      if (existing) Object.assign(existing, body)
      else rows.push({ ...body })
      return route.fulfill({ status: 201, json: null })
    }
    if (request.method() === 'POST' && table === 'collection_works' && Array.isArray(body)) {
      for (const membership of body) if (!rows.some(row => row.collection_id === membership.collection_id && row.library_entry_id === membership.library_entry_id)) {
        rows.push({ ...membership, created_at: now })
        Object.assign(tables.collections.find(collection => collection.id === membership.collection_id)!, { last_story_added_at: now })
      }
      return route.fulfill({ status: 201, json: null })
    }
    if (request.method() === 'POST' && body) { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...body, default_key: null }; rows.push(row); return route.fulfill({ status: 201, json: request.headers().accept?.includes('object') ? row : null }) }
    const requestedIds = new Set(id?.startsWith('in.(') ? id.slice(4, -1).split(',').map(value => value.replaceAll('"', '')) : [id])
    const matches = (row: Row) => requestedIds.has(String(row.id)) && (url.searchParams.get('default_key') !== 'is.null' || !row.default_key)
    if (request.method() === 'PATCH') {
      const changed = rows.filter(matches)
      if (table === 'collections' && body?.automatic_rules === null) {
        const stories = libraryQueryFixture('library_story_details', { p_ids: tables.library_entries.map(entry => entry.id) }, tables) as { id: string; automaticCollectionIds?: string[] }[]
        for (const collection of changed.filter(row => row.automatic_rules)) for (const story of stories) {
          if (story.automaticCollectionIds?.includes(String(collection.id)) && !tables.collection_works.some(link => link.collection_id === collection.id && link.library_entry_id === story.id)) tables.collection_works.push({ collection_id: collection.id, library_entry_id: story.id })
        }
      }
      changed.forEach(row => Object.assign(row, body, { updated_at: now }))
      if (table === 'collections' && body?.automatic_rules) {
        const automatic = new Set(changed.map(row => row.id))
        tables.collection_works = tables.collection_works.filter(link => !automatic.has(link.collection_id))
        tables.collection_series = tables.collection_series.filter(link => !automatic.has(link.collection_id))
      }
      return route.fulfill({ json: request.headers().accept?.includes('object') ? changed[0] : null })
    }
    if (request.method() === 'DELETE') {
      const removed = new Set(rows.filter(matches).map(row => row.id))
      tables[table] = rows.filter(row => !removed.has(row.id))
      if (table === 'library_entries') { tables.collection_works = tables.collection_works.filter(row => !removed.has(row.library_entry_id)); tables.library_entry_tags = tables.library_entry_tags.filter(row => !removed.has(row.library_entry_id)) }
      if (table === 'collections') tables.collection_works = tables.collection_works.filter(row => !removed.has(row.collection_id))
      return route.fulfill({ status: 204 })
    }
    const selected = rows.filter(row => [...url.searchParams].every(([column,value]) => !value.startsWith('eq.') || String(row[column]) === value.slice(3)))
    const limit = Number(url.searchParams.get('limit') ?? selected.length), offset = Number(url.searchParams.get('offset') ?? 0)
    return route.fulfill({ json: selected.slice(offset,offset+limit) })
  })
  return tables
}
export async function login(page: Page) { await page.getByLabel('Email Address').fill('reader@example.com'); await page.getByLabel('Password', { exact: true }).fill('Test-password-123!'); await page.getByRole('button', { name: 'Sign In to Your Library' }).click() }

export async function selectLibraryShelf(page: Page, name: string) {
  const shelves = page.getByRole('navigation', { name: 'Library Shelves', exact: true })
  const spine = shelves.getByRole('button', { name, exact: true })
  if (!await spine.isVisible()) await shelves.getByRole('button', { name: 'Show All Collections', exact: true }).click()
  await spine.click()
}
