import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { readerInstallationId, all, getBookDetails, getBook, listCatalog, loadSetting, mutateBook, putBook, setting, transaction } from './storage'
import { withPublication } from './model'
import type { Book, BookDetails, Connection, Pending, Remote } from './model'
export async function rpc(connection: Connection, action: string, work: string, input: Record<string, unknown> = {}): Promise<{entry: Remote | null; collections?: {id: string; name: string}[]; secret?: string; userId?: string; tagAppearance?: TagAppearance | null}> {
  const url = new URL(connection.backend)
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS for the organizer backend.')
  const response = await fetch(`${url.origin}/rest/v1/rpc/userscript_library`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: connection.key }, body: JSON.stringify({ p_secret: connection.secret, p_action: action, p_work: Number(work), p_input: input }), signal: AbortSignal.timeout(20000) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || `Organizer returned ${response.status}.`)
  return data
}
export function pendingUpdate(book: Book | BookDetails, connection: Connection | undefined, input: Record<string, unknown>): Pending | undefined {
  if (!connection || book.account !== connection.account || !book.remote || !book.workId) return
  return { id: crypto.randomUUID(), book: book.id, work: book.workId, account: connection.account, base: book.remote, input }
}
let running: Promise<string> | undefined
export function synchronize(connection: Connection, force = false): Promise<string> {
  if (running) return running
  running = performSync(connection, force).finally(() => { running = undefined })
  return running
}
async function performSync(connection: Connection, force: boolean) {
  if (!navigator.onLine) return 'Offline. Changes are saved on this device.'
  await reportAvailability(connection)
  const events = (await all<Pending>('pending')).filter(p => p.account === connection.account)
  for (const pending of events) {
    const book = await getBookDetails(pending.book)
    if (!book) continue
    // Freeze the exact checked request before sending. A retry after a lost response
    // uses the same baseline; the server's checked save cannot append a second read.
    if (!pending.input.version) { pending.input = { ...pending.input, version: book.remote?.version ?? pending.base.version, base: { ...pending.base } }; await transaction(['pending'], tx => tx.objectStore('pending').put(pending)) }
    try {
      const result = await rpc(connection, pending.action ?? 'progress', pending.work, pending.input)
      if (!result.entry) throw new Error('The organizer work no longer exists. Local reading history is retained.')
      await mutateBook(book.id, current => ({ ...withPublication(current, result.entry!), remote: result.entry! }), pending.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.'
      await transaction(['pending'], tx => tx.objectStore('pending').put({ ...pending, error: message }))
      return `Sync needs attention: ${message} Your local changes are retained.`
    }
  }
  // Check a bounded, rotating catalog slice; never load EPUB contents during sync.
  const checkpointKey = `sync-checkpoint:${connection.account}`
  const checkpoint = await loadSetting<{ after: string; at: number }>(checkpointKey)
  if (!force && checkpoint && Date.now() - checkpoint.at < 60_000) return 'Reading updates are synced. Organizer refresh will continue on a later sync.'
  const waiting = new Set((await all<Pending>('pending')).map(p => p.book))
  const linked = (await listCatalog()).filter(b => b.account === connection.account && b.workId).sort((a,b) => a.id.localeCompare(b.id))
  const after = checkpoint?.after ?? ''
  const remaining = linked.filter(b => b.id > after)
  const batch = (remaining.length ? remaining : linked).slice(0, 50)
  let checked = 0
  for (let offset = 0; offset < batch.length; offset += 4) {
    const group = batch.slice(offset, offset + 4)
    const outcomes = await Promise.allSettled(group.map(async entry => {
      if (waiting.has(entry.id)) return
      const book = await getBookDetails(entry.id)
      if (!book || book.account !== connection.account || !book.workId) return
      const result = await rpc(connection, 'get', book.workId)
      if (result.entry) await transaction(['books', 'catalog', 'pending', 'settings'], tx => {
        const queued = tx.objectStore('pending').getAll()
        queued.onsuccess = () => {
          if (queued.result.some((p: Pending) => p.book === book.id)) return
          const request = tx.objectStore('books').get(book.id)
          request.onsuccess = () => {
            const current = request.result as BookDetails | undefined
            // A local edit/link or another sync may have changed the baseline in flight.
            if (!current || current.account !== connection.account || current.workId !== book.workId || current.remote?.version !== book.remote?.version) return
            putBook(tx, { ...withPublication(current, result.entry!), remote: result.entry!, status: result.entry!.status, notes: result.entry!.notes, collections: (result.collections ?? []).filter(c => result.entry!.collections?.includes(c.id)).map(c => c.name) })
          }
        }
      })
      checked++
    }))
    const failed = outcomes.find(outcome => outcome.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    // Advance only after a complete group succeeds; failures retry this group safely.
    await setting(checkpointKey, { after: group.at(-1)!.id, at: Date.now() })
  }
  return `Reading updates are synced. Checked ${checked} of ${linked.length} linked versions.${linked.length > batch.length ? ' Sync Now checks the next batch.' : ''}`
}

// Resolve files from IndexedDB on this installation before reporting availability.
export async function reportAvailability(connection: Connection) {
  const installationId = await readerInstallationId()
  const works = new Set<string>()
  for (const entry of await listCatalog()) {
    if (entry.active && entry.workId && entry.account === connection.account && entry.hasFile && await getBook(entry.id)) works.add(entry.workId)
  }
  await rpc(connection, 'reader_report', '0', { installationId, name: connection.name, url: new URL('/', location.href).href, works: [...works] })
}
