import fixture from '../../server/ao3/fixtures/work.html?raw'
import { parseMetadata } from '../../server/ao3/adapter.ts'
import { captureMetadataPage } from '../chrome/capture.js'
import { expect, it, vi } from 'vitest'
import { captureChapterRead, collectWorkPage, readPage, readWorkTiles } from './page'

function page(chapter, total = '10', full = false) {
 const doc = new DOMParser().parseFromString(`<h2 class="title">Test</h2><dl class="work meta"><dd class="chapters">10/${total}</dd></dl><select id="selected_id">${Array.from({ length: 10 }, (_, i) => `<option value="${100 + i}">${i + 1}. Title</option>`).join('')}</select><div id="chapters">PRIVATE CHAPTER TEXT</div>`, 'text/html')
 return readPage(doc, `https://archiveofourown.org/works/123${chapter ? `/chapters/${99 + chapter}` : ''}${full ? '?view_full_work=true' : ''}`)
}
it('counts chapter text locally, preserving inline words and excluding notes, summaries and scripts', () => {
 const doc = new DOMParser().parseFromString('<div id="chapters"><div class="chapter" id="chapter-4"><div class="summary"><div class="userstuff">Private summary</div></div><div class="userstuff"><h3>Title</h3><p>Hello <em>world</em>!</p><p>un<em>break</em>able<br>Another word.</p><div hidden>Hidden private text</div><script>SECRET CODE</script><div class="notes">Author notes</div></div><div class="notes"><div class="userstuff">Private note</div></div></div></div>', 'text/html')
 const captured = captureChapterRead(doc, { current: 4 }, 'https://archiveofourown.org/works/123/chapters/104')
 expect(captured).toEqual({ chapter: 4, chapter_id: '104', word_count: 6 })
 expect(JSON.stringify(captured)).not.toMatch(/Hello|private|notes|SECRET|summary/)
 expect(captureChapterRead(doc, { current: 10 }, 'https://archiveofourown.org/works/123/chapters/110').word_count).toBeNull()
})
it('counts a one-shot, distinguishes an empty chapter from unavailable text, and never counts a whole multi-chapter page', () => {
 const doc = new DOMParser().parseFromString('<div id="chapters"><div class="userstuff"><p>One shot.</p></div></div>', 'text/html')
 const info = { current: 1, chapters: {} }, url = 'https://archiveofourown.org/works/123'
 expect(captureChapterRead(doc, info, url)).toEqual({ chapter: 1, chapter_id: null, word_count: 2 })
 doc.querySelector('.userstuff').textContent = ''
 expect(captureChapterRead(doc, info, url).word_count).toBe(0)
 doc.querySelector('.userstuff').remove()
 expect(captureChapterRead(doc, info, url).word_count).toBeNull()
 expect(captureChapterRead(doc, { current: null }, url)).toBeNull()
 doc.querySelector('#chapters').innerHTML = '<div class="chapter"><div class="userstuff">Wrong chapter</div></div><div class="chapter"><div class="userstuff">Another chapter</div></div>'
 expect(captureChapterRead(doc, info, url).word_count).toBeNull()
})
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

it('captures every website import field through the shared extractor', async () => {
 const href = 'https://archiveofourown.org/works/123'
 const html = fixture.replace('<dl>', '<dl class="work meta">').replace('<p>A summary &amp; more.</p>', '<p>First paragraph.</p><p>Next<br>line.</p>')
 document.documentElement.innerHTML = html
 document.body.insertAdjacentHTML('beforeend', '<div id="chapters">PRIVATE CHAPTER TEXT</div><input value="PRIVATE TOKEN"><div class="notes">PRIVATE NOTE</div>')
 vi.stubGlobal('location', new URL(href))
 const captured = await captureMetadataPage()
 const imported = parseMetadata(captured.html, 123, href)
 const page = readPage(document, href)
 expect(page.metadata).toMatchObject(imported.metadata)
 expect(page.metadata).toMatchObject({
  summary: 'First paragraph.\n\nNext\nline.',
  author_links: { One: 'https://archiveofourown.org/users/One/pseuds/One', Two: 'https://archiveofourown.org/users/Two/pseuds/Two' },
  character_tags: ['A', 'B'], additional_tags: ['Zulu tag', 'Adventure', 'Middle tag'], categories: ['M/M'],
  archive_warnings: ['No Archive Warnings Apply'], word_count: 12345,
  ao3_published_at: '2024-01-01T00:00:00Z', ao3_updated_at: '2024-02-02T00:00:00Z',
  series: ['The Series'], series_memberships: [{ id: 77, name: 'The Series', url: 'https://archiveofourown.org/series/77', position: 2 }],
 })
 expect(JSON.stringify(page)).not.toMatch(/PRIVATE CHAPTER|PRIVATE TOKEN|PRIVATE NOTE/)
})

it('keeps absent metadata unknown and verifies chapter positions from numbered labels', () => {
 const doc = new DOMParser().parseFromString('<h2 class="title">Sparse</h2>', 'text/html')
 expect(readPage(doc, 'https://archiveofourown.org/works/123').metadata).toMatchObject({ publication_status: 'unknown', word_count: null, published_chapters: null, total_chapters: null })
 doc.body.insertAdjacentHTML('beforeend', '<dl class="work meta"><dd class="chapters">10/10</dd></dl><select id="selected_id"><option value="910">Choose a chapter</option><option value="940">4. Fourth</option></select>')
 expect(readPage(doc, 'https://archiveofourown.org/works/123/chapters/940').current).toBe(4)
 expect(readPage(doc, 'https://archiveofourown.org/works/123/chapters/910').current).toBeNull()
})

it('reads series listings with the shared parser and excludes unrelated page content', async () => {
 const html = (await import('../../server/ao3/fixtures/series.html?raw')).default
 const doc = new DOMParser().parseFromString(html + '<div id="chapters">PRIVATE CHAPTER TEXT</div>', 'text/html')
 const page = readPage(doc, 'https://archiveofourown.org/series/77')
 expect(page.series.seriesId).toBe(77)
 expect(page.series.works.length).toBeGreaterThan(0)
 expect(JSON.stringify(page)).not.toContain('PRIVATE CHAPTER TEXT')
 expect(readPage(doc, 'https://evil.test/series/77')).toBeNull()
})


it.each(['', '<div class="summary module"><blockquote></blockquote></div>', '<div class="summary module"><blockquote> \n </blockquote></div>'])('collects a missing or empty work summary from the first page without sending chapter summaries or story text (%s)', async placeholder => {
 const doc = new DOMParser().parseFromString(placeholder + '<h2 class="title">Later chapter</h2><dl class="work meta"><dd class="chapters">6/?</dd></dl><select id="selected_id"><option value="940">4. Fourth</option></select><div id="chapters"><div class="chapter"><div class="summary module"><blockquote>Chapter summary only</blockquote></div>PRIVATE STORY TEXT</div></div>', 'text/html')
 const fetcher = vi.fn().mockResolvedValue({ ok: true, url: 'https://archiveofourown.org/works/123?view_adult=true', text: async () => fixture.replace('<dl>', '<dl class="work meta">') })
 const result = await collectWorkPage(doc, 'https://archiveofourown.org/works/123/chapters/940', fetcher)
 expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://archiveofourown.org/works/123?view_adult=true', expect.objectContaining({ credentials: 'same-origin' }))
 expect(result).toMatchObject({ current: 4, metadata: { summary: 'A summary & more.', categories: ['M/M'] }, automaticMetadata: { summary: 'A summary & more.' } })
 expect(JSON.stringify(result)).not.toMatch(/Chapter summary only|PRIVATE STORY TEXT/)
})

it('rereads current metadata without a network request when the work summary is present', async () => {
 const doc = new DOMParser().parseFromString(fixture.replace('<dl>', '<dl class="work meta">'), 'text/html')
 const fetcher = vi.fn()
 expect((await collectWorkPage(doc, 'https://archiveofourown.org/works/123/chapters/940', fetcher)).metadata.summary).toBe('A summary & more.')
 expect(fetcher).not.toHaveBeenCalled()
})

it('refuses to save metadata from a different work after a redirect', async () => {
 const doc = new DOMParser().parseFromString('<h2 class="title">Test</h2>', 'text/html')
 const fetcher = vi.fn().mockResolvedValue({ ok: true, url: 'https://archiveofourown.org/works/999', text: vi.fn() })
 await expect(collectWorkPage(doc, 'https://archiveofourown.org/works/123/chapters/940', fetcher)).rejects.toThrow('Could not collect')
})

it('reads chapter navigation inside AO3 chapter action items without capturing chapter content', () => {
 const doc = new DOMParser().parseFromString('<h2 class="title">Test</h2><dl class="work meta"><dd class="chapters">10/10</dd></dl><ul class="work navigation actions"><li class="chapter"><ul id="chapter_index"><li><select id="selected_id"><option value="104">4. Fourth</option></select></li></ul></li></ul><div id="chapters"><div id="chapter-4" class="chapter"><div class="userstuff">PRIVATE CHAPTER TEXT</div></div></div>', 'text/html')
 const result = readPage(doc, 'https://archiveofourown.org/works/123/chapters/104')
 expect(result).toMatchObject({ current: 4, chapters: { '4': '104' }, defaults: { chapter: 4, status: 'reading' } })
 expect(JSON.stringify(result)).not.toContain('PRIVATE CHAPTER TEXT')
})

it('reads listing tiles through the shared blurb parser without inventing series memberships', async () => {
 const doc = new DOMParser().parseFromString((await import('../../server/ao3/fixtures/series.html?raw')).default, 'text/html')
 const tiles = readWorkTiles(doc, 'https://archiveofourown.org/tags/Naruto/works')
 expect(tiles).toHaveLength(2)
 expect(tiles[0].page).toMatchObject({ work: 101, current: null, metadata: { title: 'The first story', authors: ['One'], published_chapters: 2, total_chapters: 2 } })
 expect(tiles[0].page.metadata).not.toHaveProperty('series_memberships')
 expect(readWorkTiles(doc, 'https://evil.test/works')).toEqual([])
})
