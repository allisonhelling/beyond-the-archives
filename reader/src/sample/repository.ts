import defaultState from './default-state.json'
import { sampleMode } from '../../../src/lib/sample-mode'
import { chapterContent, retainedContents } from '../anthology'
import { cloudPreferences } from '../cloud-model'
import { importEpub } from '../epub'
import { bookStores, loadSetting, putBook, rememberOpenBook, transaction } from '../storage'
import type { Book, BookContent, BookDetails, Preferences } from '../model'
import { isReaderSampleSnapshot, type ReaderSampleSnapshot } from './snapshot'

function requireSample() { if (!sampleMode) throw new Error('Sample data is available only in the local sample reader.') }
function localState(book: BookDetails): BookDetails {
  const { remote: _remote, account: _account, works, ...state } = book
  void _remote; void _account
  return { ...state, ...(works && { works: works.map(({ remote: _remote, account: _account, ...member }) => { void _remote; void _account; return member }) }) }
}
export async function replaceSampleReader(snapshot: unknown) {
  requireSample()
  if (!isReaderSampleSnapshot(snapshot)) throw new Error('Invalid reader sample snapshot.')
  // Decode and sanitize every EPUB before replacing anything; failures preserve the current library.
  const books: (Book | BookDetails)[] = [], ids = new Set<string>()
  for (const entry of snapshot.books) {
    const state = entry.state && localState(entry.state)
    let book: Book | BookDetails
    if (entry.file) {
      const file = new File([Uint8Array.from(atob(entry.file.base64), char => char.charCodeAt(0))], 'sample.epub', { type: entry.file.type })
      const imported = await importEpub(file)
      if (state && state.id !== imported.id) throw new Error('Sample EPUB identity does not match its saved reading state.')
      book = state ? { ...imported, ...state, file, resources: imported.resources, chapterVersion: imported.chapterVersion, chapters: chapterContent(imported.chapters, retainedContents(state, imported.chapters)) } : imported
    } else book = { ...state!, hasFile: false }
    if (ids.has(book.id)) throw new Error('Duplicate EPUB in reader sample snapshot.')
    ids.add(book.id); books.push(book)
  }
  await transaction([...bookStores, 'pending'], tx => {
    for (const store of [...bookStores, 'pending']) tx.objectStore(store).clear()
    for (const book of books) putBook(tx, book)
    if (snapshot.preferences) tx.objectStore('settings').put({ id: 'preferences', value: cloudPreferences(snapshot.preferences) })
    tx.objectStore('settings').put({ id: 'sample-initialized', value: true })
  })
  rememberOpenBook(undefined)
}
export async function initializeSampleReader() { requireSample(); if (!await loadSetting('sample-initialized')) await replaceSampleReader(defaultState) }
export async function captureSampleReader(): Promise<ReaderSampleSnapshot> {
  requireSample()
  let books: BookDetails[] = [], contents: BookContent[] = [], preferences: Preferences | undefined
  // One transaction keeps reading state, file presence and preferences from different edits from mixing.
  await transaction(bookStores, tx => {
    tx.objectStore('books').getAll().onsuccess = event => { books = (event.target as IDBRequest<BookDetails[]>).result }
    tx.objectStore('contents').getAll().onsuccess = event => { contents = (event.target as IDBRequest<BookContent[]>).result }
    tx.objectStore('settings').get('preferences').onsuccess = event => { preferences = (event.target as IDBRequest<{ value: Preferences } | undefined>).result?.value }
  })
  const byId = new Map(contents.map(content => [content.id, content]))
  const entries = await Promise.all(books.map(async book => {
    const file = book.hasFile ? byId.get(book.id)?.file : undefined
    if (book.hasFile && !file) throw new Error('A sample EPUB is missing. Import it again before updating defaults.')
    let base64 = ''
    if (file) { const bytes = new Uint8Array(await file.arrayBuffer()); for (let offset = 0; offset < bytes.length; offset += 32768) base64 += String.fromCharCode(...bytes.subarray(offset, offset + 32768)) }
    return { state: localState(book), file: file ? { type: 'application/epub+zip', base64: btoa(base64) } : null }
  }))
  return { version: 1, completeSnapshot: true, books: entries, ...(preferences && { preferences: cloudPreferences(preferences) }) }
}
export async function updateSampleReader() {
  const response = await fetch('/__sample-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await captureSampleReader()) })
  if (!response.ok) throw new Error('Could not save sample data. Keep the local sample server running and the snapshot under 20 MB.')
}
export async function resetSampleReader() {
  requireSample()
  // Reload seeds from the newly saved project fixture, rather than this page’s old JSON module.
  await transaction([...bookStores, 'pending'], tx => { for (const store of [...bookStores, 'pending']) tx.objectStore(store).clear() })
  rememberOpenBook(undefined)
}
