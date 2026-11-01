import { cloudBookFields, cloudPreferences, equal, type CloudEdit, type CloudValue } from './cloud-model'
import { chapterVersion, importEpub } from './epub'
import { repairChapterState, bookDetails, catalogBook, type Book, type BookContent, type BookDetails, type CatalogBook, type Pending } from './model'

export const readerOwner = localStorage.getItem('reader-cloud-owner') || ''
export const bookStores = ['books', 'catalog', 'contents', 'settings']
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(readerOwner ? `bta-reader-account:${readerOwner}` : 'bta-reader', 2)
  request.onupgradeneeded = event => {
    const db = request.result, tx = request.transaction!
    if (event.oldVersion === 0) for (const name of ['books', 'pending', 'settings']) db.createObjectStore(name, { keyPath: 'id' })
    db.createObjectStore('catalog', { keyPath: 'id' })
    db.createObjectStore('contents', { keyPath: 'id' })
    // Upgrade one record at a time; aborting rolls back both the split and version change.
    const cursor = tx.objectStore('books').openCursor()
    cursor.onsuccess = () => {
      const entry = cursor.result
      if (!entry) return
      putBook(tx, entry.value as Book)
      entry.continue()
    }
  }
  request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
  request.onerror = () => reject(request.error)
  request.onblocked = () => reject(new Error('Close other reader tabs, then reload to finish the library storage upgrade.'))
})
export async function transaction(stores: string[], action: (tx: IDBTransaction) => void) {
  const db = await database
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve(); tx.onerror = event => reject((event.target as IDBRequest).error ?? tx.error); tx.onabort = () => reject(tx.error)
    try { action(tx) } catch (error) { tx.abort(); reject(error) }
  })
}
export async function all<T>(store: string, prefix?: string): Promise<T[]> {
  const db = await database
  return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(prefix ? IDBKeyRange.bound(prefix, `${prefix}\uffff`) : undefined); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}
export async function get<T>(store: string, id: string): Promise<T | undefined> {
  const db = await database
  return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}
export const listCatalog = () => all<CatalogBook>('catalog')
export const getBookDetails = (id: string) => get<BookDetails>('books', id)
export async function getBook(id: string): Promise<Book | undefined> {
  // A single readonly snapshot prevents mixing a replacement/removal with old contents.
  const db = await database
  const book = await new Promise<Book | undefined>((resolve, reject) => {
    const tx = db.transaction(['books', 'contents']), details = tx.objectStore('books').get(id), content = tx.objectStore('contents').get(id)
    tx.oncomplete = () => {
      const saved = details.result as BookDetails | undefined, body = content.result as BookContent | undefined
      if (!saved?.hasFile || !body?.file) { resolve(undefined); return }
      const { hasFile: _hasFile, ...state } = saved
      void _hasFile
      resolve({ ...state, ...body })
    }
    tx.onerror = event => reject((event.target as IDBRequest).error ?? tx.error); tx.onabort = () => reject(tx.error)
  })
  if (book?.file && book.fileBytes === undefined) {
    const size = book.file.size
    await mutateBook(id, current => current.hasFile ? { ...current, fileBytes: size } : current)
    book.fileBytes = size
  }
  if (!book || book.chapterVersion === chapterVersion) return book
  const imported = await importEpub(book.file as File)
  await transaction(bookStores, tx => {
    const details = tx.objectStore('books').get(id), contents = tx.objectStore('contents').get(id)
    contents.onsuccess = () => {
      const saved = details.result as BookDetails | undefined, body = contents.result as BookContent | undefined
      // A concurrent read/removal may already have repaired or removed the file.
      if (!saved?.hasFile || !body?.file || body.chapterVersion === chapterVersion) return
      const current = { ...saved, ...body }
      putBook(tx, { ...current, ...repairChapterState(current, imported.chapters), chapters: imported.chapters, resources: imported.resources, chapterVersion })
    }
  })
  return getBook(id)
}
export function putBook(tx: IDBTransaction, book: Book | BookDetails, fromCloud = false) {
  const details = 'file' in book ? bookDetails(book) : book
  if (readerOwner && !fromCloud) {
    const previous = tx.objectStore('books').get(book.id)
    previous.onsuccess = () => {
      const before = previous.result ? cloudBookFields(previous.result) : {}
      for (const [field, value] of Object.entries(cloudBookFields(details))) if (!equal(before[field], value)) queueCloud(tx, `${book.id}/${field}`, value)
    }
  }
  tx.objectStore('books').put(details)
  tx.objectStore('catalog').put(catalogBook(details))
  if ('file' in book) {
    if (book.file) tx.objectStore('contents').put({ id: book.id, file: book.file, resources: book.resources, chapters: book.chapters, chapterVersion: book.chapterVersion } satisfies BookContent)
    else tx.objectStore('contents').delete(book.id)
  }
}
export async function saveBook(book: Book | BookDetails, pending?: Pending, preservePosition = false) {
  await transaction(pending ? [...bookStores, 'pending'] : bookStores, tx => {
    const save = (value: Book | BookDetails) => { putBook(tx, value); if (pending) tx.objectStore('pending').put(pending) }
    if (!preservePosition) { save(book); return }
    const request = tx.objectStore('books').get(book.id)
    request.onsuccess = () => save({ ...book, position: request.result?.position ?? book.position })
  })
}
export async function removeDownload(book: BookDetails) {
  await transaction(bookStores, tx => { putBook(tx, { ...book, hasFile: false }); tx.objectStore('contents').delete(book.id) })
}
// Both confirmed local deletion and cloud tombstones erase the same version data.
export function eraseBook(tx: IDBTransaction, id: string, afterErase?: () => void, replacementId?: string) {
  for (const name of ['books', 'catalog', 'contents']) tx.objectStore(name).delete(id)
  const pending = tx.objectStore('pending').openCursor()
  pending.onsuccess = () => { const cursor = pending.result; if (!cursor) return; if (cursor.value.book === id) { if (replacementId) cursor.update({...cursor.value,book:replacementId}); else cursor.delete() } cursor.continue() }
  const settings = tx.objectStore('settings').openCursor()
  settings.onsuccess = () => {
    const cursor = settings.result
    if (!cursor) { afterErase?.(); return }
    const key = String(cursor.key), value = cursor.value.value
    if (key === `cloud-file:${id}` || key.startsWith(`cloud-base:${id}/`) || key.startsWith(`cloud-edit:${id}/`) || key.startsWith('cloud-conflict:') && value?.key?.startsWith(`${id}/`) || key === 'cloud-flight' && value?.key?.startsWith(`${id}/`)) cursor.delete()
    if (!replacementId && key.startsWith('calibre-job:') && value?.hash === id) { tx.objectStore('settings').delete(`calibre-file:${value.id}`); tx.objectStore('settings').delete(`calibre-ack:${value.id}`); cursor.delete() }
    cursor.continue()
  }
}
export function restoreDeletedVersion(tx: IDBTransaction, id: string) {
  const tombstone = tx.objectStore('settings').get(`cloud-base:${id}/deleted`)
  tombstone.onsuccess = () => { if (tombstone.result?.value.value === true) queueCloud(tx, `${id}/deleted`, false) }
}
export function deleteBook(tx: IDBTransaction, id: string, replacementId?: string) {
  const settings = tx.objectStore('settings'), baseline = settings.get(`cloud-base:${id}/deleted`)
  baseline.onsuccess = () => eraseBook(tx, id, () => {
    if (readerOwner) settings.put({id:`cloud-edit:${id}/deleted`,value:{id:crypto.randomUUID(),key:`${id}/deleted`,value:true,base:baseline.result?.value.revision ?? 0} satisfies CloudEdit})
  }, replacementId)
}
export async function deleteEpub(id: string) {
  await transaction([...bookStores, 'pending'], tx => deleteBook(tx, id))
}
export async function setting(id: string, value: unknown) { await transaction(['settings'], tx => {
  tx.objectStore('settings').put({ id, value })
  if (readerOwner && id === 'preferences') queueCloud(tx, 'preferences', cloudPreferences(value as import('./model').Preferences))
}) }
export async function loadSetting<T>(id: string): Promise<T | undefined> { return (await get<{id: string; value: T}>('settings', id))?.value }
export async function mutateBook(id: string, update: (book: BookDetails) => BookDetails, pendingId?: string) {
  await transaction(pendingId ? ['books', 'catalog', 'pending', 'settings'] : ['books', 'catalog', 'settings'], tx => {
    const request = tx.objectStore('books').get(id)
    request.onsuccess = () => { if (request.result) putBook(tx, update(request.result)); if (pendingId) tx.objectStore('pending').delete(pendingId) }
  })
}

export function queueCloud(tx: IDBTransaction, key: string, value: unknown) {
  const store = tx.objectStore('settings'), baseline = store.get(`cloud-base:${key}`)
  baseline.onsuccess = () => {
    store.put({ id: `cloud-edit:${key}`, value: { id: crypto.randomUUID(), key, value, base: baseline.result?.value?.revision ?? 0 } satisfies CloudEdit })
  }
}
export async function cloudEdits() {
  return (await all<{ id: string; value: CloudEdit }>('settings', 'cloud-edit:')).filter(row => row.id.startsWith('cloud-edit:')).map(row => row.value)
}
export async function acceptCloud(value: CloudValue, edit?: CloudEdit) {
  await transaction(['settings'], tx => {
    const store = tx.objectStore('settings')
    store.put({ id: `cloud-base:${value.key}`, value })
    if (edit) {
      const request = store.get(`cloud-edit:${value.key}`)
      request.onsuccess = () => {
        if (request.result?.value.id === edit.id) store.delete(`cloud-edit:${value.key}`)
        else if (request.result) store.put({ ...request.result, value: { ...request.result.value, base: value.revision } })
      }
    }
  })
}

let installation: Promise<string> | undefined
let installationAliases: string[] = []
const installationKey = 'bta:reader-installation:v1', aliasesKey = 'bta:reader-installation-aliases:v1'
const validInstallation = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
async function savedInstallation(name: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const request = indexedDB.open(name)
    request.onupgradeneeded = () => { request.transaction!.abort(); resolve(undefined) }
    request.onerror = request.onblocked = () => resolve(undefined)
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('settings')) { db.close(); resolve(undefined); return }
      const read = db.transaction('settings').objectStore('settings').get('installation-id')
      read.onsuccess = () => { db.close(); resolve(read.result?.value) }
      read.onerror = () => { db.close(); resolve(undefined) }
    }
  })
}
export function readerInstallationId(): Promise<string> {
  return installation ??= (async () => {
    const saved = await loadSetting<string>('installation-id')
    let names = ['bta-reader']
    try { if (indexedDB.databases) names = (await indexedDB.databases()).flatMap(db => db.name === 'bta-reader' || db.name?.startsWith('bta-reader-account:') ? [db.name] : []) } catch { /* Older browsers can still migrate the guest identity. */ }
    const known = [saved, ...await Promise.all(names.map(savedInstallation))].filter(validInstallation)
    let shared: string | null = null, previous: unknown = []
    try { shared = localStorage.getItem(installationKey); previous = JSON.parse(localStorage.getItem(aliasesKey) ?? '[]') } catch { /* Keep the per-library fallback if browser storage is unavailable. */ }
    const id = validInstallation(shared) ? shared : known[0] ?? crypto.randomUUID()
    installationAliases = [...new Set([...known, ...(Array.isArray(previous) ? previous.filter(validInstallation) : [])])].filter(value => value !== id).slice(0, 100)
    try { localStorage.setItem(installationKey, id); localStorage.setItem(aliasesKey, JSON.stringify(installationAliases)) } catch { /* The existing library setting still preserves this installation. */ }
    if (saved !== id) await setting('installation-id', id)
    return id
  })()
}
export async function readerInstallationAliases() { await readerInstallationId(); return installationAliases }
