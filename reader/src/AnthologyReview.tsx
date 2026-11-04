import { useState } from 'react'
import { Dialog } from '../../src/components/Dialog'
import { reviewContents, type ReviewedSection } from './anthology'
import type { BookDetails } from './model'

export function AnthologyReview({ book, onSave, onClose }: { book: BookDetails; onSave: (book: BookDetails) => Promise<void>; onClose: () => void }) {
  const [sections, setSections] = useState<ReviewedSection[]>(() => book.chapters.map((chapter, index) => {
    const work = book.works?.find(work => work.key === chapter.workKey)
    const workId = work?.workId ?? (!book.works?.length ? book.workId : null)
    return { path: chapter.path, kind: chapter.kind === 'frontmatter' ? chapter.sectionType ?? 'title' : 'chapter', beginsWork: Boolean(chapter.workStart || index === 0 && !book.works?.length && !book.chapters.some(item => item.workStart)), title: work?.title ?? chapter.workTitle ?? book.metadata.title, url: workId ? `https://archiveofourown.org/works/${workId}` : '' }
  }))
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  function change(index: number, patch: Partial<ReviewedSection>) { setSections(current => current.map((section, i) => i === index ? { ...section, ...patch } : section)); setError('') }
  const works = sections.filter(section => section.beginsWork).length, chapters = sections.filter(section => section.kind === 'chapter').length
  return <Dialog title="Review Anthology Contents" busy={saving} onClose={onClose} className="anthology-review"><form onSubmit={event => {
    event.preventDefault(); setSaving(true); setError('')
    void (async () => {
      try {
        const next = reviewContents(book, sections)
        await onSave(next); onClose()
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save anthology contents.') } finally { setSaving(false) }
    })()
  }}>
    <p>Confirm where each work begins and which sections are chapters. Covers, title pages, notes, and other sections stay readable without increasing chapter totals. Work links identify individual fics for organizer sync.</p>
    <p role="status">{works} {works === 1 ? 'work' : 'works'} · {chapters} {chapters === 1 ? 'chapter' : 'chapters'}</p>
    <ol className="anthology-sections">{sections.map((section, index) => <li key={section.path}><fieldset><legend>{index + 1}. {book.chapters[index].title}</legend>
      <label>Section Type<select value={section.kind} onChange={event => change(index, { kind: event.target.value as ReviewedSection['kind'] })}><option value="chapter">Chapter</option><option value="title">Title Page</option><option value="notes">Author Notes</option><option value="other">Other Section</option></select></label>
      <label className="check-label"><input type="checkbox" checked={section.beginsWork} onChange={event => change(index, { beginsWork: event.target.checked })} />Begins a Work</label>
      {section.beginsWork && <><label>Work Title<input required value={section.title} onChange={event => change(index, { title: event.target.value })} /></label><label>AO3 Work Link (Optional)<input type="url" value={section.url} placeholder="https://archiveofourown.org/works/123" onChange={event => change(index, { url: event.target.value })} /></label></>}
    </fieldset></li>)}</ol>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="dialog-actions"><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Contents'}</button><button type="button" disabled={saving} onClick={onClose}>Cancel</button></div>
  </form></Dialog>
}
