import { useState, type ReactNode } from 'react'

export function Pagination({ page, pages, total, size, onPage, trailing, itemLabel = 'works', inlinePage = false, range, stale = false, countError = false }: { stale?: boolean; countError?: boolean; range?: { start: number; end: number }; inlinePage?: boolean; itemLabel?: string; trailing?: ReactNode; page: number; pages: number; total?: number; size: number; onPage: (page: number) => void }) {
  const [draft, setDraft] = useState({ page, value: String(page) })
  if (draft.page !== page) setDraft({ page, value: String(page) })
  const value = draft.page === page ? draft.value : String(page)
  const pageInput = <input className="filter-input" aria-label="Go to Page" type="number" min={1} max={stale ? undefined : pages} value={value} onChange={event => setDraft({ page, value: event.target.value })} onKeyDown={event => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const next = Number(value)
    if (Number.isInteger(next) && next >= 1 && (stale || next <= pages)) onPage(next)
  }} />
  return <nav className={`results-pagination${inlinePage ? ' pagination-inline' : ''}`} aria-label="Result Pages">
    {!inlinePage && <label className="pagination-page">Page{pageInput}</label>}
    <div className="pagination-controls">
      <button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span role="status">{total === undefined ? 'Count unavailable' : total ? `${range?.start ?? (page - 1) * size + 1}–${range?.end ?? Math.min(page * size, total)} of ${total}` : '0 results'} {itemLabel} · {inlinePage ? <label className="pagination-page">Page{pageInput}of {pages}</label> : <>Page {page} of {pages}</>}{countError ? ' · Couldn’t update' : stale ? ' · Updating…' : ''}</span>
      <button className="button secondary" disabled={!stale && page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
    {!inlinePage && trailing && <div className="pagination-trailing">{trailing}</div>}
  </nav>
}
