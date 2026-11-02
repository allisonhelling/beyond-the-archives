import { savedWorkIdentity } from './metadata'
import { importEpub } from './epub'
import type { TagAppearance } from '../../src/features/library/display/display-settings'
import { readerInstallationId, readerInstallationAliases, all, getBookDetails, getBook, listCatalog, loadSetting, mutateBook, putBook, setting, transaction } from './storage'
import { withPublication, withOrganizerProgress } from './model'
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
  // Background refreshes rotate through a bounded slice; manual sync checks the full catalog.
  // Only unidentified local downloads are reparsed. Cloud originals remain explicit downloads.
  const checkpointKey = `sync-checkpoint:${connection.account}`
  const checkpoint = await loadSetting<{ after: string; at: number }>(checkpointKey)
  if (!force && checkpoint && Date.now() - checkpoint.at < 60_000) return 'Reading updates are synced. Organizer refresh will continue on a later sync.'
  const waiting = new Set((await all<Pending>('pending')).map(p => p.book))
  const catalog = await listCatalog()
  const candidates = catalog.filter(b => !b.account || b.account === connection.account).sort((a,b) => a.id.localeCompare(b.id))
  const after = checkpoint?.after ?? ''
  const remaining = candidates.filter(b => b.id > after)
  const batch = force ? candidates : (remaining.length ? remaining : candidates).slice(0, 50)
  let checked = 0, unidentified = 0, waitingCount = 0, unreadable = 0
  for (let offset = 0; offset < batch.length; offset += 4) {
    const group = batch.slice(offset, offset + 4)
    const outcomes = await Promise.allSettled(group.map(async entry => {
      if (waiting.has(entry.id)) { waitingCount++; return }
      let book = await getBookDetails(entry.id)
      if (!book || (book.account && book.account !== connection.account)) return
      let identity = savedWorkIdentity(book)
      if (!identity && book.hasFile) {
        const original = await getBook(book.id)
        if (original?.file) try { identity = (await importEpub(original.file as File)).workId } catch { unreadable++ }
      }
      if (!identity) { unidentified++; return }
      if (book.workId !== identity) {
        const recovered = identity
        await mutateBook(book.id, current => ({ ...current, workId: savedWorkIdentity(current) ?? recovered }))
        book = await getBookDetails(book.id)
        if (!book) return
      }
      if (!book.workId || book.account && book.account !== connection.account) return
      const saved = book
      const result = await rpc(connection, 'get', book.workId)
      if (result.entry) await transaction(['books', 'catalog', 'pending', 'settings'], tx => {
        const queued = tx.objectStore('pending').getAll()
        queued.onsuccess = () => {
          if (queued.result.some((p: Pending) => p.book === saved.id)) return
          const request = tx.objectStore('books').get(saved.id)
          request.onsuccess = () => {
            const current = request.result as BookDetails | undefined
            // A local edit/link or another sync may have changed the baseline in flight.
            if (!current || current.account !== saved.account || current.workId !== saved.workId || current.remote?.version !== saved.remote?.version) return
            // Link existing standalone books without discarding personal edits made before pairing.
            // Later pulls also preserve fields that differ from the last organizer baseline.
            putBook(tx, { ...withOrganizerProgress(current, result.entry!), account: connection.account, remote: result.entry!, status: current.status === (current.remote?.status ?? 'to_read') ? result.entry!.status : current.status, notes: current.notes === (current.remote?.notes ?? '') ? result.entry!.notes : current.notes, collections: (result.collections ?? []).filter(c => result.entry!.collections?.includes(c.id)).map(c => c.name) })
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
  const available = await reportAvailability(connection)
  const linked = (await listCatalog()).filter(book => book.account === connection.account && book.workId && book.organizerEntryId).length
  return `Reading updates are synced. Catalog: ${catalog.length} EPUB versions. Checked ${checked} identified EPUB versions; ${linked} versions linked. ${unidentified} checked version${unidentified === 1 ? ' needs' : 's need'} an AO3 work link.${waitingCount ? ` ${waitingCount} versions have pending reading changes.` : ''}${unreadable ? ` ${unreadable} downloaded EPUBs could not be read for identity recovery.` : ''}${catalog.length > candidates.length ? ` ${catalog.length - candidates.length} versions belong to another organizer connection and were left unchanged.` : ''} ${available} downloaded works reported for Offline.${!force && candidates.length > batch.length ? ' More catalog versions will be checked on a later sync; Sync Now checks the full catalog.' : ''} Cloud-only EPUBs are not downloaded by sync.`
}

// Resolve files from IndexedDB on this installation before reporting availability.
export async function reportAvailability(connection: Connection) {
  const installationId = await readerInstallationId()
  const works = new Set<string>()
  for (const entry of await listCatalog()) {
    if (entry.active && entry.workId && entry.account === connection.account && entry.hasFile && await getBook(entry.id)) works.add(entry.workId)
  }
  await rpc(connection, 'reader_report', '0', { installationId, previousInstallationIds: await readerInstallationAliases(), name: connection.name, url: new URL('/', location.href).href, works: [...works] })
  return works.size
}
