import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
import { accountSession, owner, signedIn } from './account-fixture'

type CloudRow = { key: string; value: unknown; revision: number; generation: number }
type Traffic = Record<string, { requests: number; bytes: number }>

async function cloudFixture(context: BrowserContext, values = new Map<string, CloudRow>()) {
  await signedIn(context)
  const traffic: Traffic = {}
  await context.route(url => /^\/(auth|rest|storage)\/v1\//.test(url.pathname), async route => {
    const request = route.request(), url = new URL(request.url())
    const endpoint = url.pathname.split('/').at(-1)!
    const json = (payload: unknown, category = endpoint) => {
      const body = JSON.stringify(payload)
      const metric = traffic[category] ??= { requests: 0, bytes: 0 }
      metric.requests++
      metric.bytes += Buffer.byteLength(body)
      return route.fulfill({ contentType: 'application/json', body })
    }
    switch (endpoint) {
      case 'user': return json(accountSession().user)
      case 'token': return json(accountSession())
      case 'reader_app_access': return json({ user_id: owner })
      case 'library_revision': return json(0)
      case 'reader_organizer_connection': {
        const { p_action } = request.postDataJSON()
        return json(p_action === 'restore' ? { userId: owner, secret: 'test-reader' } : { enabled: true })
      }
      case 'userscript_library': return json({ entry: null })
      case 'reader_cloud_values': {
        const tombstones = url.searchParams.getAll('key').some(key => key.startsWith('like.'))
        const rows = [...values.values()].filter(row => !tombstones || row.key.endsWith('/deleted'))
        return json(rows, tombstones ? 'tombstones' : 'snapshot')
      }
      case 'reader_cloud_apply': {
        const { p_key, p_value, p_generation } = request.postDataJSON()
        const row = { key: p_key, value: p_value, revision: (values.get(p_key)?.revision ?? 0) + 1, generation: p_generation }
        values.set(p_key, row)
        return json(row)
      }
      default: return json([])
    }
  })
  return traffic
}

async function startClock(page: Page) {
  const now = Date.now()
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now + 1000)
  await page.goto('/')
}

async function importBook(page: Page, values: Map<string, CloudRow>) {
  await page.getByLabel('Import EPUB File').setInputFiles({
    name: 'polling.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(await createZip(epubFiles()).arrayBuffer()),
  })
  await expect.poll(async () => {
    await page.clock.runFor(100)
    return page.getByLabel('Book Content').isVisible()
  }).toBe(true)
  await expect.poll(() => [...values.keys()].some(key => key.endsWith('/manifest'))).toBe(true)
  await page.waitForTimeout(250)
}

async function moveChapter(page: Page, chapter: 'Next Chapter' | 'Previous Chapter') {
  await page.getByRole('button', { name: chapter, exact: true }).first().evaluate(button => (button as HTMLButtonElement).click())
}

test('keeps empty inbox polls independent of idle and active reader sync', async ({ page, context }) => {
  const values = new Map<string, CloudRow>()
  const traffic = await cloudFixture(context, values)
  await startClock(page)
  await importBook(page, values)

  async function measure(move: boolean) {
    const before = structuredClone(traffic), keys = ['reader_app_access', 'tombstones', 'snapshot', 'reader_import_inbox', 'reader_cloud_apply']
    for (let tick = 0; tick < 8; tick++) {
      if (move && tick % 2 === 1) {
        const chapter = tick % 4 === 1 ? 'Next Chapter' : 'Previous Chapter'
        await moveChapter(page, chapter)
        await page.waitForTimeout(75)
      }
      await page.clock.runFor(15000)
      // The virtual clock advances timers, while routed fetch and IndexedDB use real time.
      await page.waitForTimeout(200)
    }
    return Object.fromEntries(keys.map(key => [key, {
      requests: (traffic[key]?.requests ?? 0) - (before[key]?.requests ?? 0),
      bytes: (traffic[key]?.bytes ?? 0) - (before[key]?.bytes ?? 0),
    }]))
  }

  const idle = await measure(false), active = await measure(true)
  console.log(JSON.stringify({ idle, active }))
  expect(idle.reader_import_inbox.requests).toBe(8)
  expect(idle.snapshot.requests).toBe(2)
  expect(idle.tombstones.requests).toBe(idle.snapshot.requests)
  expect(idle.reader_cloud_apply.requests).toBe(0)
  expect(active.reader_import_inbox.requests).toBe(8)
  expect(active.reader_cloud_apply.requests).toBe(4)
  expect(active.snapshot.requests).toBe(4)
})

test('flushes on reconnect and catches remote updates, deletion, and reimport after missed polls', async ({ page, context, browser }) => {
  const values = new Map<string, CloudRow>()
  const first = await cloudFixture(context, values)
  await startClock(page)
  await importBook(page, values)
  const manifest = [...values.values()].find(row => row.key.endsWith('/manifest'))!
  const book = manifest.key.split('/')[0]
  const positionKey = `${book}/position`, favoriteKey = `${book}/favorite`, deletionKey = `${book}/deleted`
  const savedPosition = values.get(positionKey)

  const device = await browser.newContext()
  try {
    const second = await cloudFixture(device, values)
    const other = await device.newPage()
    await startClock(other)
    await expect(other.locator('.story-card')).toHaveCount(1)
    await other.waitForTimeout(200)
    await other.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => document.visibilityState === 'hidden' })
    })
    const snapshots = second.snapshot.requests

    await context.setOffline(true)
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    const writes = first.reader_cloud_apply.requests
    await moveChapter(page, 'Next Chapter')
    await page.clock.fastForward(120000)
    expect(first.reader_cloud_apply.requests).toBe(writes)
    expect(values.get(positionKey)).toEqual(savedPosition)
    await context.setOffline(false)
    await expect.poll(() => values.get(positionKey)).not.toEqual(savedPosition)
    expect(first.reader_cloud_apply.requests).toBe(writes + 1)

    // A direct server-side update, such as an organizer shared-field trigger.
    values.set(favoriteKey, { key: favoriteKey, value: true, revision: (values.get(favoriteKey)?.revision ?? 0) + 1, generation: 0 })
    await other.clock.fastForward(180000)
    expect(second.snapshot.requests).toBe(snapshots)
    await other.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await expect(other.getByRole('button', { name: 'Unmark Favorite', exact: true })).toBeVisible()
    expect(second.snapshot.requests).toBe(snapshots + 1)

    for (const key of values.keys()) if (key.startsWith(`${book}/`)) values.delete(key)
    values.set(deletionKey, { key: deletionKey, value: true, revision: 1, generation: 1 })
    await other.clock.fastForward(60000)
    await expect(other.locator('.story-card')).toHaveCount(0)
    await other.waitForTimeout(200)

    // A new incarnation can start its field revisions at one again.
    values.set(deletionKey, { key: deletionKey, value: false, revision: 2, generation: 2 })
    values.set(manifest.key, { ...manifest, revision: 1, generation: 2 })
    values.set(favoriteKey, { key: favoriteKey, value: false, revision: 1, generation: 2 })
    await other.clock.fastForward(60000)
    await expect(other.locator('.story-card')).toHaveCount(1)
    await expect(other.getByRole('button', { name: 'Mark Favorite', exact: true })).toBeVisible()
  } finally {
    await device.close()
  }
})

test('pulls shared fields after an organizer write whose response is lost', async ({ page, context }) => {
  const values = new Map<string, CloudRow>()
  const traffic = await cloudFixture(context, values)
  await context.route('**/rest/v1/rpc/userscript_library', route => {
    if (route.request().postDataJSON().p_action !== 'progress') return route.fallback()
    const favorite = [...values.values()].find(row => row.key.endsWith('/favorite'))!
    values.set(favorite.key, { ...favorite, value: true, revision: favorite.revision + 1 })
    return route.abort()
  })
  await startClock(page)
  await importBook(page, values)
  const book = [...values.keys()].find(key => key.endsWith('/manifest'))!.split('/')[0]
  await page.evaluate(async ({ owner, book }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`bta-reader-account:${owner}`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pending', 'readwrite')
        tx.objectStore('pending').put({
          id: crypto.randomUUID(), book, work: '8001', account: `organizer:${owner}`,
          base: { version: 'before' }, input: { progress: 1, version: 'before' },
        })
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  }, { owner, book })
  const snapshots = traffic.snapshot.requests
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => page.evaluate(async ({ owner, book }) => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open(`bta-reader-account:${owner}`)
      request.onsuccess = () => resolve(request.result)
    })
    try {
      return await new Promise<boolean>(resolve => {
        const request = db.transaction('books').objectStore('books').get(book)
        request.onsuccess = () => resolve(request.result?.favorite)
      })
    } finally { db.close() }
  }, { owner, book })).toBe(true)
  expect(traffic.snapshot.requests).toBe(snapshots + 2)
})

for (const commitBeforeLoss of [false,true]) test(
  `shares a frozen flight across tabs without Web Locks after a lost response (${commitBeforeLoss ? 'after' : 'before'} commit)`,
  async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }))
  const values = new Map<string, CloudRow>()
  const traffic = await cloudFixture(context, values)
  await startClock(page)
  await importBook(page, values)
  const position = [...values.values()].find(row => row.key.endsWith('/position'))!
  type Request = { p_id: string; p_key: string; p_value: unknown; p_base: number; p_generation: number }
  const calls: Request[] = []
  let committed: CloudRow | undefined
  let release!: () => void
  const lostResponse = new Promise<void>(resolve => { release = resolve })
  await context.route('**/rpc/reader_cloud_apply', async route => {
    const input = route.request().postDataJSON() as Request
    if (input.p_key !== position.key) return route.fallback()
    calls.push(input)
    if (calls.length === 1) {
      committed = { ...position, value: input.p_value, revision: position.revision + 1 }
      if (commitBeforeLoss) values.set(position.key, committed)
      await lostResponse
      return route.abort()
    }
    if (input.p_id === calls[0].p_id) {
      values.set(position.key, committed!)
      return route.fulfill({ json: committed })
    }
    return route.fallback()
  })
  await moveChapter(page, 'Next Chapter')
  await page.waitForTimeout(75)
  await page.clock.runFor(30000)
  await expect.poll(() => calls.length).toBe(1)
  expect(values.get(position.key)?.revision).toBe(position.revision+Number(commitBeforeLoss))
  await moveChapter(page, 'Previous Chapter')
  await page.waitForTimeout(75)
  try {
    const other = await context.newPage()
    const snapshots = traffic.snapshot.requests
    await startClock(other)
    await expect.poll(() => calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[1]).toEqual(calls[0])
    await expect.poll(() => traffic.snapshot.requests).toBeGreaterThan(snapshots)
    release()
    await other.waitForTimeout(200)
    await other.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => calls.find(call => call.p_id !== calls[0].p_id)).toMatchObject({
      p_base: committed!.revision, p_generation: position.generation, p_value: position.value,
    })
    await expect.poll(() => values.get(position.key)?.revision).toBe(position.revision+2)
    await other.close()
  } finally { release() }
})
