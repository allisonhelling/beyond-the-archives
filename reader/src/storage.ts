import { bookDetails, catalogBook, type Book, type BookContent, type BookDetails, type CatalogBook, type Pending } from './model'

export const bookStores = ['books', 'catalog', 'contents']
const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('bta-reader', 2)
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
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
    try { action(tx) } catch (error) { tx.abort(); reject(error) }
  })
}
export async function all<T>(store: string): Promise<T[]> {
  const db = await database
  return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['books', 'contents']), details = tx.objectStore('books').get(id), content = tx.objectStore('contents').get(id)
    tx.oncomplete = () => {
      const saved = details.result as BookDetails | undefined, body = content.result as BookContent | undefined
      if (!saved?.hasFile || !body?.file) { resolve(undefined); return }
      const { hasFile: _hasFile, ...state } = saved
      void _hasFile
      resolve({ ...state, ...body })
    }
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
export function putBook(tx: IDBTransaction, book: Book | BookDetails) {
  const details = 'file' in book ? bookDetails(book) : book
  tx.objectStore('books').put(details)
  tx.objectStore('catalog').put(catalogBook(details))
  if ('file' in book) {
    if (book.file) tx.objectStore('contents').put({ id: book.id, file: book.file, resources: book.resources, chapters: book.chapters } satisfies BookContent)
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
export async function setting(id: string, value: unknown) { await transaction(['settings'], tx => tx.objectStore('settings').put({ id, value })) }
export async function loadSetting<T>(id: string): Promise<T | undefined> { return (await get<{id: string; value: T}>('settings', id))?.value }
export async function mutateBook(id: string, update: (book: BookDetails) => BookDetails, pendingId?: string) {
  await transaction(pendingId ? ['books', 'catalog', 'pending'] : ['books', 'catalog'], tx => {
    const request = tx.objectStore('books').get(id)
    request.onsuccess = () => { if (request.result) putBook(tx, update(request.result)); if (pendingId) tx.objectStore('pending').delete(pendingId) }
  })
}
