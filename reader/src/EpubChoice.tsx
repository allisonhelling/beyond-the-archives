import { useState } from 'react'
import { Dialog } from '../../src/components/Dialog'
import { isAnthology, type CatalogBook } from './model'

export function EpubChoice({ books, canDownload, onOpen, onClose }: { books: CatalogBook[]; canDownload: boolean; onOpen: (book: CatalogBook, remember: boolean) => Promise<void>; onClose: () => void }) {
  const [selected, setSelected] = useState(books.find(book => book.hasFile || canDownload)?.id ?? books[0]?.id)
  const [remember, setRemember] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const book = books.find(book => book.id === selected)
  return <Dialog title="Choose EPUB" busy={saving} onClose={onClose}><form onSubmit={event => {
    event.preventDefault(); if (!book) return
    setSaving(true); setError('')
    void onOpen(book, remember).catch(error => setError(error instanceof Error ? error.message : 'Could not open this EPUB.')).finally(() => setSaving(false))
  }}><p>This work is available in more than one EPUB. Active downloads are listed first.</p>
    <fieldset className="epub-choices"><legend>Available EPUBs</legend>{books.map(book => <label key={book.id}><input type="radio" name="epub" value={book.id} checked={selected === book.id} disabled={!book.hasFile && !canDownload} onChange={() => setSelected(book.id)} /><span><strong>{book.metadata.title}</strong><small>{isAnthology(book) ? `Anthology · ${book.works!.length} Works` : 'Individual Work'} · {book.hasFile ? 'Downloaded' : 'In Cloud'} · {book.active ? 'Active Version' : 'Retained Version'} · Imported {new Date(book.importedAt).toLocaleString()}</small></span></label>)}</fieldset>
    <label><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Remember This Choice for This Work</label>
    {error && <p role="alert">{error}</p>}<div className="dialog-actions"><button className="primary" disabled={saving || !book || !book.hasFile && !canDownload}>{saving ? 'Opening…' : book?.hasFile ? 'Open EPUB' : 'Download and Open'}</button><button type="button" disabled={saving} onClick={onClose}>Cancel</button></div>
  </form></Dialog>
}
