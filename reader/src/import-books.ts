import { parseWorkUrl } from '../../src/features/imports/urls'
import { savedWorkIdentity } from '../../src/features/library/model'
import { importEpub } from './epub'
import { mergeMetadata, metadataVersion } from './metadata'
import { repairChapterState, replaceBook, type Book, type BookDetails } from './model'
import { bookStores, getBookDetails, listCatalog, putBook, loadSetting, restoreDeletedVersion, deleteBook, transaction } from './storage'

// Manual imports and both Calibre transports resolve identities in the same place.
export async function prepareImport(file: File, target?: string, calibreId?: string, workLink?: unknown) {
  return prepareImportVersion(await importEpub(file), target, calibreId, workLink)
}
/** Apply Calibre identity once for both exact downloads and newly parsed EPUBs. */
export async function prepareImportVersion<T extends Book | BookDetails>(version: T, target?: string, calibreId?: string, workLink?: unknown) {
  let link: string | undefined, linkedId: string | null = null
  const suppliedLink = typeof workLink === 'string' ? workLink.trim() : workLink
  if (suppliedLink !== undefined && suppliedLink !== null && suppliedLink !== '') {
    if (typeof suppliedLink !== 'string' || suppliedLink.length > 2048) throw new Error('Calibre Work Link must be a valid HTTP or HTTPS URL.')
    try {
      const url = new URL(suppliedLink)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL')
      link = url.href
    } catch { throw new Error('Calibre Work Link must be a valid HTTP or HTTPS URL.') }
    try { const identity = parseWorkUrl(link); link = identity.normalizedUrl; linkedId = String(identity.workId) } catch { /* Other publishers retain their full work link. */ }
    const embeddedId = savedWorkIdentity(version)
    if (linkedId && embeddedId && linkedId !== embeddedId) throw new Error('Calibre Work Link identifies a different AO3 work from this EPUB. Check the column before replacing it.')
  }
  const next = { ...version, calibreId: calibreId ?? version.calibreId, workId: linkedId ?? version.workId, metadata: { ...version.metadata, ...(link && { calibre_work_link: link }) } }
  const saved = await listCatalog()
  if ((await loadSetting<{value:unknown}>(`cloud-edit:${next.id}/deleted`))?.value === true) throw new Error('Cloud deletion of this EPUB is pending. Sync the account before importing this version again.')
  const duplicate = saved.find(book => book.id === next.id)
  const explicit = saved.find(book => book.id === target)
  if (explicit?.workId && next.workId && explicit.workId !== next.workId) throw new Error('The replacement identifies a different AO3 work. Import it separately.')
  const linked = link ? saved.filter(book => (linkedId !== null && savedWorkIdentity(book) === linkedId) || book.metadata.calibre_work_link === link || book.metadata.manual_url === link) : []
  const work = linked.find(book => book.active) ?? linked[0]
  const matchedId = work && savedWorkIdentity(work)
  if (matchedId && next.workId && matchedId !== next.workId) throw new Error('Calibre Work Link matches a saved EPUB for a different AO3 work. Check its source before replacing it.')
  const calibre = calibreId ? saved.find(book => book.calibreId === calibreId) : undefined
  if (!work && calibre?.workId && next.workId && calibre.workId !== next.workId) throw new Error('This Calibre book identifies a different AO3 work. Check its source before replacing it.')
  const prior = explicit ?? work ?? duplicate ?? calibre ?? saved.find(book => next.workId && book.workId === next.workId && book.active)
  return { next, duplicate, previous: prior && await getBookDetails(prior.id), linked: Boolean(link) }
}
export function importedVersion<T extends Book | BookDetails>(next: T, previous?: BookDetails) {
  if (!previous) return next
  if (previous.id !== next.id) return replaceBook(previous, next)
  const repaired = previous.chapterVersion !== next.chapterVersion ? repairChapterState(previous,next.chapters) : {}
  return { ...next, ...previous, ...repaired, workId: previous.workId ?? next.workId, calibreId: next.calibreId ?? previous.calibreId, metadata: mergeMetadata(previous.metadata, next.metadata), metadataVersion, chapters: next.chapters, chapterVersion: next.chapterVersion }
}
export function writeImport(tx: IDBTransaction, saved: Book | BookDetails, old?: BookDetails, replace: boolean | 'delete' = false) {
  // A restored hash is the same book, not a second version to deactivate.
  if (old && old.id !== saved.id) {
    if (replace === 'delete') deleteBook(tx, old.id, saved.id)
    else {
      putBook(tx, { ...old, active: false, hasFile: replace ? false : old.hasFile })
      if (replace) tx.objectStore('contents').delete(old.id)
    }
  }
  // Only an explicit import may restore a deleted version.
  restoreDeletedVersion(tx, saved.id)
  putBook(tx, saved)
}
export async function saveImportedVersion(saved: Book, old?: BookDetails, replace = false) {
  await transaction(bookStores, tx => writeImport(tx, saved, old, replace))
}
