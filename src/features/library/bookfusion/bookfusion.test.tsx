import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BookFusionButton } from './BookFusionFields'
import { safeBookFusionLink, validateBookFusionLink } from './bookfusion'
import { matchMapping, readMapping } from './mapping'
import { exampleWork } from '../display/display-examples'

const url = 'https://www.bookfusion.com/reader/book-123'
describe('BookFusion destinations', () => {
  it('preserves bookmark locations and requires explicit bookmark intent for query/fragment links', () => {
    const bookmark = { url: `${url}?location=chapter-2#epubcfi(test)`, kind: 'bookmark' as const }
    expect(validateBookFusionLink(bookmark)).toEqual(bookmark)
    expect(() => validateBookFusionLink({ ...bookmark, kind: 'book' })).toThrow(/Choose Bookmark/)
    expect(validateBookFusionLink({ url: ` ${url} `, kind: 'book' })).toEqual({ url, kind: 'book' })
  })
  it.each(['javascript:alert(1)', 'http://www.bookfusion.com/reader/123', 'https://bookfusion.com.evil.test/reader/123', 'https://user@bookfusion.com/reader/123', 'https://bookfusion.com/', 'not a URL'])('does not render an unsafe saved destination: %s', unsafe => {
    expect(safeBookFusionLink({ url: unsafe, kind: 'book' })).toBeNull()
    const { container } = render(<BookFusionButton value={{ url: unsafe, kind: 'book' }} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('exposes a keyboard accessible external shortcut and hover text', async () => {
    render(<BookFusionButton value={{ url, kind: 'book' }} />)
    const link = screen.getByRole('link', { name: 'Open in BookFusion' })
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.focus(link)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open in BookFusion')
  })
})
describe('Calibre report matching', () => {
  const row = { link: exampleWork.original_url!, title: 'Different title', author: 'Different author', bookfusion_id: 'upload-id', bookfusion_url: url }
  it('uses exact AO3 identities rather than titles/authors or upload IDs', () => {
    expect(matchMapping([row], [exampleWork])[0]).toMatchObject({ story: { id: exampleWork.id }, reason: '', replacement: false })
    expect(matchMapping([{ ...row, link: 'https://archiveofourown.org/works/999999999' }], [exampleWork])[0].reason).toMatch(/No unique/)
    expect(matchMapping([{ ...row, bookfusion_url: '' }], [exampleWork])[0].reason).toMatch(/identifier alone/)
  })
  it('flags duplicate reports and replacements for explicit review', () => {
    expect(matchMapping([row, row], [exampleWork]).every(match => match.reason.includes('Multiple'))).toBe(true)
    expect(matchMapping([row], [{ ...exampleWork, metadata: { ...exampleWork.metadata, bookfusion_link: { url: `${url}-old`, kind: 'bookmark' } } }])[0].replacement).toBe(true)
  })
  it('reuses CSV quoting support and rejects incorrect report schemas', () => {
    expect(readMapping(`link,title,author,bookfusion_id,bookfusion_url\r\n${row.link},"A, title",Author,123,${url}`)[0].title).toBe('A, title')
    expect(() => readMapping('link,title\nurl,title')).toThrow(/bookfusion_id/)
  })
})
