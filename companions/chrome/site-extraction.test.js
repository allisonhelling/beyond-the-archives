// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { extractStory, readSelected, selectorFor } from './site-extraction'
import { classifyObservations } from '../../src/features/imports/classify-observations'

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
it('keeps a reusable rule in review on a second page until explicitly confirmed', () => {
 const rule = { id: 'a', version: 1, field: 'title', scope: 'matching', prefix: '/story/', example: url, previous: 'Original', selectors: ['h1'], validation: { example: url, health: 'Needs Review' } }
 const result = extractStory(page('<h1>Second Story</h1>'), 'https://fiction.example/story/two', [rule])
 expect(result.validations[0].health).toBe('Needs Review')
 expect(result.observations.title.via).toBe('Page Element')
 expect(readSelected(page('<p>&lt;script&gt;secret&lt;/script&gt;</p>'), 'summary', 'p')).toBe('')
})
it('captures only visible FanFiction.net header fields and leaves unverifiable fields blank', () => {
 const source = 'https://www.fanfiction.net/s/100/3/Fixture'
 const markup = `<title>Chapter 3 | FanFiction</title><div id="profile_top">
  <b class="xcontrast_txt">Fixture Title</b><a class="xcontrast_txt" href="/u/19/Fixture">Fixture Writer</a>
  <div class="xcontrast_txt">Fixture summary.</div><span>Chapters: 12 - Status: Complete</span></div>
  <div id="storytext">Private chapter text</div><meta name="keywords" content="Unverified keyword">`
 expect(extractStory(page(markup), source, [])).toEqual({ storyEvidence: true, validations: [], observations: {
  title: { text: 'Fixture Title', via: 'Site Adapter' },
  authors: { text: 'Fixture Writer', via: 'Site Adapter' },
  summary: { text: 'Fixture summary.', via: 'Site Adapter' },
 } })
 for (const altered of [markup.replace('id="storytext"', 'id="storytext" hidden'), markup.replace('id="profile_top"', 'id="other"'),
  '<title>Just a Moment</title><meta name="description" content="Challenge"><form><input value="private"></form>']) {
  expect(extractStory(page(altered), source, [])).toEqual({ storyEvidence: false, validations: [], observations: {} })
 }
 expect(extractStory(page(markup), 'https://fanfiction.net.example/s/100/3/Fixture', []).storyEvidence).toBe(false)
})
it('requires a work structure and accepts only that fork’s tag links', () => {
 const source = 'https://archive.example/works/100/chapters/45'
 const markup = `<main id="main"><dl class="work meta">
  <dd class="fandom tags"><a class="tag" href="/tags/Local/works">Local Fandom</a>
   <a class="tag" href="https://archiveofourown.org/tags/Remote/works">Remote Fandom</a></dd>
  <dd class="relationship tags"><a class="tag" href="/tags/Pair/works">A/B</a></dd>
  <dd class="character tags"><a class="tag" href="/tags/Character/works" hidden>Hidden Character</a></dd>
  </dl><div id="workskin"><div class="preface"><h2 class="title">Local Title</h2><h3 class="byline">Local Writer</h3></div>
  <div id="chapters">No chapter body should be captured.</div></div></main>`
 const { observations, storyEvidence } = extractStory(page(markup), source, [])
 expect(storyEvidence).toBe(true)
 expect(observations).toEqual({
  title: { text: 'Local Title', via: 'Site Adapter' }, authors: { text: 'Local Writer', via: 'Site Adapter' },
  fandoms: { text: 'Local Fandom', via: 'Site Adapter' }, relationship_tags: { text: 'A/B', via: 'Site Adapter' },
 })
 expect(classifyObservations(observations, source, [])).toMatchObject({ fandoms: ['Local Fandom'], relationship_tags: ['A/B'] })
 const foreignLinks = extractStory(page(markup.replaceAll('href="/tags/', 'href="https://archiveofourown.org/tags/')), source, [])
 expect(foreignLinks.storyEvidence).toBe(true)
 expect(Object.keys(foreignLinks.observations)).toEqual(['title', 'authors'])
 for (const result of [extractStory(page(markup), 'https://archive.example/search', []),
  extractStory(page(markup.replace('id="chapters"', 'id="chapters" hidden')), source, [])]) {
  expect(result.storyEvidence).toBe(false)
  expect(result.observations.fandoms).toBeUndefined()
 }
})
it('keeps a generic draft available when structured data is malformed', () => {
 const result = extractStory(page('<script type="application/ld+json">{"@graph":{}}</script><h1>Fallback</h1>'), url, [])
 expect(result.observations.title).toEqual({ text: 'Fallback', via: 'Page Element' })
 expect(result.storyEvidence).toBe(false)
})
