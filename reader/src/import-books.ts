import { importEpub } from './epub'
import { mergeMetadata, metadataVersion } from './metadata'
import { repairChapterState, replaceBook, type Book, type BookDetails } from './model'
import { bookStores, getBookDetails, listCatalog, putBook, loadSetting, restoreDeletedVersion, transaction } from './storage'

// Manual imports and both Calibre transports resolve identities in the same place.
export async function prepareImport(file: File, target?: string) {
  const next = await importEpub(file), saved = await listCatalog()
  if ((await loadSetting<{value:unknown}>(`cloud-edit:${next.id}/deleted`))?.value === true) throw new Error('Cloud deletion of this EPUB is pending. Sync the account before importing this version again.')
  const duplicate = saved.find(book => book.id === next.id)
  const explicit = saved.find(book => book.id === target)
  if (explicit?.workId && next.workId && explicit.workId !== next.workId) throw new Error('The replacement identifies a different AO3 work. Import it separately.')
  const prior = explicit ?? duplicate ?? saved.find(book => next.workId && book.workId === next.workId && book.active)
  return { next, duplicate, previous: prior && await getBookDetails(prior.id) }
}
export function importedVersion(next: Book, previous?: BookDetails) {
  if (!previous) return next
  if (previous.id !== next.id) return replaceBook(previous, next)
  const repaired = previous.chapterVersion !== next.chapterVersion ? repairChapterState(previous,next.chapters) : {}
  return { ...next, ...previous, ...repaired, metadata: mergeMetadata(previous.metadata, next.metadata), metadataVersion, chapters: next.chapters, chapterVersion: next.chapterVersion }
}
export function writeImport(tx: IDBTransaction, saved: Book, old?: BookDetails, replace = false) {
  // A restored hash is the same book, not a second version to deactivate.
  if (old && old.id !== saved.id) {
    putBook(tx, { ...old, active: false, hasFile: replace ? false : old.hasFile })
    if (replace) tx.objectStore('contents').delete(old.id)
  }
  // Only an explicit import may restore a deleted version.
  restoreDeletedVersion(tx, saved.id)
  putBook(tx, saved)
}
export async function saveImportedVersion(saved: Book, old?: BookDetails, replace = false) {
  await transaction(bookStores, tx => writeImport(tx, saved, old, replace))
}
