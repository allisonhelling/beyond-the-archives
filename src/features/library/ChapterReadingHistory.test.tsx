import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ChapterReadingHistory } from './ChapterReadingHistory'
import type { ChapterReadEvent } from './reading-history'

it('shows chapter counts, unknown counts, timestamps and rereads without inventing skipped chapters', () => {
 const first: ChapterReadEvent = { id: 'first', action: 'chapter_read', at: '2026-10-24T12:00:00Z', status: 'reading', chapter: 4, chapter_id: '104', word_count: 1234, is_reread: false }
 render(<ChapterReadingHistory history={[first, { ...first, id: 'second', is_reread: true, word_count: 1200 }, { ...first, id: 'unknown', chapter: 5, word_count: null }]} />)
 expect(screen.getByText('3 Chapter Reads · 2,434 Recorded Words')).toBeInTheDocument()
 const items = screen.getAllByRole('listitem', { hidden: true })
 expect(items[0]).toHaveTextContent('Chapter 4 · 1,234 Words · First Read')
 expect(items[1]).toHaveTextContent('Chapter 4 · 1,200 Words · Re-Read')
 expect(items[2]).toHaveTextContent('Chapter 5 · Word Count Unavailable')
 expect(items[0].querySelector('time')).toHaveAttribute('datetime', first.at)
})
it('shows how tracking starts for older works and forwards editor field attributes', () => {
 const { container } = render(<ChapterReadingHistory data-display-field="chapterHistory" tabIndex={0} />)
 expect(screen.getByText('Chapter Reading History')).toBeVisible()
 expect(screen.getByText('No chapter reads recorded yet.')).toBeVisible()
 expect(container.firstChild).toHaveAttribute('data-display-field', 'chapterHistory')
 expect(container.firstChild).toHaveAttribute('tabindex', '0')
})
