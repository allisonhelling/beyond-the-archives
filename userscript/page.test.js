import { expect, it } from 'vitest'
import { readPage } from './page'

function page(chapter, total = '10', full = false) {
 const doc = new DOMParser().parseFromString(`<h2 class="title">Test</h2><dl class="work meta"><dd class="chapters">10/${total}</dd></dl><select id="selected_id">${Array.from({ length: 10 }, (_, i) => `<option value="${100 + i}">${i + 1}. Title</option>`).join('')}</select><div id="chapters">PRIVATE CHAPTER TEXT</div>`, 'text/html')
 return readPage(doc, `https://archiveofourown.org/works/123${chapter ? `/chapters/${99 + chapter}` : ''}${full ? '?view_full_work=true' : ''}`)
}
it('uses navigation positions rather than chapter IDs for first, middle and final defaults', () => {
 expect(page(1).defaults).toEqual({ status: 'to_read', chapter: 1, chapterFinished: false })
 expect(page(4).defaults).toEqual({ status: 'reading', chapter: 4, chapterFinished: false })
 expect(page(10).defaults).toEqual({ status: 'finished', chapter: 10, chapterFinished: true })
 expect(page(10, '?').defaults.status).toBe('reading')
 expect(page(0, '10', true).current).toBeNull()
 expect(JSON.stringify(page(4))).not.toContain('PRIVATE CHAPTER TEXT')
})
it('does not mount on unrelated origins, chapter-only links, or blocked pages', () => {
 for (const url of ['https://evil.test/works/123', 'https://archiveofourown.org/chapters/123', 'https://archiveofourown.org/works/0']) expect(readPage(document, url)).toBeNull()
 expect(readPage(document, 'https://archiveofourown.org/works/123')).toBeNull()
})
