import { useState } from 'react'
import { pageSize, pageSizes, pageSizeKey, savedPageSize } from './page-size'
export function PageSizeSettings() {
  const [size, setSize] = useState(savedPageSize)
  return <section className="settings-card"><h2>Library browsing</h2><label>Works per page<select value={size} onChange={event => { const next = pageSize(event.target.value)!; setSize(next); try { localStorage.setItem(pageSizeKey, String(next)) } catch { /* Keep this selection when storage is unavailable. */ } }}>{pageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label><p className="muted">Used when a library link does not specify a page size.</p></section>
}
export function Pagination({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (page: number) => void }) {
  return <nav className="form-actions results-pagination" aria-label="Result pages"><button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span role="status">{total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}` : '0 results'} · Page {page} of {pages}</span><button className="button secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button><label>Page<input aria-label="Go to page" type="number" min={1} max={pages} value={page} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= pages) onPage(value) }} /></label></nav>
}
