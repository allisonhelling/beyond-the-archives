import { useState } from 'react'
import { Pagination } from '../../src/features/library/browsing/Pagination'
import { Dialog } from '../../src/components/Dialog'
import type { CatalogBook } from './model'
import { formatBytes, storageFullMessage } from './storage-info'
export type StorageEstimate = { usage?: number; quota?: number; persistent?: boolean }
export function LocalStorageDialog({ books, storage, full, busy, onClose, onRemove, onPersist }: {
  books: CatalogBook[]; storage?: StorageEstimate; full: boolean; busy: boolean; onClose: () => void; onRemove: (book: CatalogBook) => void; onPersist: () => void
}) {
  const [page, setPage] = useState(1)
  const downloads = books.filter(book => book.hasFile).sort((a,b) => (b.fileBytes ?? 0) - (a.fileBytes ?? 0) || a.metadata.title.localeCompare(b.metadata.title))
  const size = 24, pages = Math.max(1, Math.ceil(downloads.length / size)), currentPage = Math.min(page, pages)
  const visible = downloads.slice((currentPage - 1) * size, currentPage * size)
  return <Dialog title="Manage Local Storage" busy={busy} onClose={onClose}>
    {full && <p role="alert">{storageFullMessage}</p>}
    <p>{storage?.usage !== undefined ? `${formatBytes(storage.usage)} used${storage.quota !== undefined ? ` of ${formatBytes(storage.quota)} browser allowance` : ''}.` : 'Storage estimate unavailable.'} This estimate covers all reader libraries and the offline application on this site.</p>
    <p>The reader does not delete downloads automatically. Removing a download keeps its notes, history, and position. Keep an original EPUB backup or verify a cloud copy before removing it.</p>
    <p>Browsers can clear nonpersistent site data without warning, including when the reader is closed. This screen controls only the selected library’s downloads.</p>
    {storage?.persistent !== true && <button disabled={busy} onClick={onPersist}>Request Persistent Storage</button>}
    {downloads.length > size && <Pagination inlinePage page={currentPage} pages={pages} total={downloads.length} size={size} onPage={setPage} />}
    {downloads.length ? visible.map(book => <div className="pending-item" key={book.id}><strong>{book.metadata.title}</strong><p>{book.fileBytes !== undefined ? `Original EPUB: ${formatBytes(book.fileBytes)}` : 'File size unavailable'} · Imported {new Date(book.importedAt).toLocaleDateString()}</p><button disabled={busy} onClick={() => onRemove(book)}>Remove Download</button></div>) : <p>No local downloads are available to remove in this library.</p>}
  </Dialog>
}
