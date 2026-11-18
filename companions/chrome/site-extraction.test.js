// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { extractStory, readSelected, selectorFor } from './site-extraction'

const url = 'https://fiction.example/story/one'
function page(markup) { return new DOMParser().parseFromString(markup, 'text/html') }
it('uses real structured, metadata and semantic values from an unknown source', () => {
 const doc = page(`<title>Fallback</title><meta name="description" content="Short summary">
 <script type="application/ld+json">{"@type":"Book","name":"Actual Story","author":[{"name":"A. Author"},{"name":"B. Author"}],"numberOfChapters":12}</script>
 <main><h1>Different Title</h1><a rel="tag">Mystery</a><span data-planned-chapters>30</span><span data-fandom>Original Work</span></main>`)
 expect(extractStory(doc, url, []).observations).toEqual({
  title: { text: 'Actual Story', via: 'Structured Data' },
  authors: { text: 'A. Author\nB. Author', via: 'Structured Data' },
  published_chapters: { text: '12', via: 'Structured Data' },
  summary: { text: 'Short summary', via: 'Page Metadata' },
  ao3_tags: { text: 'Mystery', via: 'Page Element' },
  total_chapters: { text: '30', via: 'Page Element' },
  fandoms: { text: 'Original Work', via: 'Page Element' },
 })
})
it('generates selectors for picked text and rejects unsafe or malformed selections', () => {
 const doc = page('<main><p class="author">By A. Writer</p><form><p id="private">secret</p></form></main>')
 const selectors = selectorFor(doc, doc.querySelector('.author'))
 expect(selectors[0]).toBe('p.author')
 expect(readSelected(doc, 'authors', selectors[0], 'By ')).toBe('A. Writer')
 expect(readSelected(doc, 'authors', '[')).toBe('')
 expect(readSelected(doc, 'authors', '#private')).toBe('')
})
it('reports fallback and selector drift without replacing a confirmed rule', () => {
 const rule = { id: 'a', version: 2, field: 'title', scope: 'exact', example: url, previous: 'Original', selectors: ['h1.primary', 'h1.fallback'], validation: { example: url, health: 'Working' } }
 const fallback = extractStory(page('<h1 class="fallback">Changed</h1>'), url, [rule])
 expect(fallback.validations[0]).toMatchObject({ health: 'Needs Review', current: 'Changed', previous: 'Original' })
 expect(fallback.observations.title).toEqual({ text: 'Changed', via: 'Page Element' })
 expect(extractStory(page('<p>Missing</p>'), url, [rule]).validations[0].health).toBe('Broken')
 expect(extractStory(page('<h1 class="primary">Original</h1>'), url, [rule]).observations.title.via).toBe('Saved Mapping')
 expect(rule.selectors).toEqual(['h1.primary', 'h1.fallback'])
})
