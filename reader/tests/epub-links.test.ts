import { expect, it } from 'vitest'
import { linkEpubUrls } from '../src/epub-links'

function render(html: string) {
 const doc = new DOMParser().parseFromString(html, 'text/html')
 const original = doc.body.textContent
 linkEpubUrls(doc.body)
 expect(doc.body.textContent).toBe(original)
 return doc.body
}
it('makes URLs clickable inside formatted text without changing their labels', () => {
 const body = render('<p><strong>URL: https://archiveofourown.org/works/23818510</strong></p><p>Visit www.example.com or http://example.com/path?a=1&amp;b=2#notes.</p>')
 expect([...body.querySelectorAll('a')].map(link => link.href)).toEqual(['https://archiveofourown.org/works/23818510', 'https://www.example.com/', 'http://example.com/path?a=1&b=2#notes'])
 expect(body.querySelector('strong a')?.textContent).toBe('https://archiveofourown.org/works/23818510')
 for (const link of body.querySelectorAll('a')) {
  expect(link.target).toBe('_blank')
  expect(link.rel).toBe('noopener noreferrer')
 }
})
it('preserves existing external and internal links and does not nest links', () => {
 const body = render('<a href="https://example.com/original">https://example.com/label</a><a data-link="chapter.xhtml#notes">www.example.com</a><a href="#footnote">Footnote</a>')
 const before = body.innerHTML
 linkEpubUrls(body)
 expect(body.innerHTML).toBe(before)
 expect(body.querySelectorAll('a a')).toHaveLength(0)
 expect(body.querySelectorAll('a')).toHaveLength(3)
})
it('keeps punctuation outside links and balanced URL parentheses inside', () => {
 const body = render('<p>(https://example.com/story). [https://example.com/other], https://example.com/Title_(Story). https://example.com/. [https://example.com/nested)].</p>')
 expect([...body.querySelectorAll('a')].map(link => link.textContent)).toEqual(['https://example.com/story', 'https://example.com/other', 'https://example.com/Title_(Story)', 'https://example.com/', 'https://example.com/nested'])
})
it('leaves unsupported schemes and invalid web URLs inert', () => {
 const body = render('<p>javascript:alert(1) data:text/html,example ftp://example.com https://[invalid]</p>')
 expect(body.querySelectorAll('a')).toHaveLength(0)
})
