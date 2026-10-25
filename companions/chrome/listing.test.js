import { expect, it } from 'vitest'
import { captureListingPage, listingUrl, sameScanUrl } from './listing.js'
import { JSDOM } from 'jsdom'
import { vi } from 'vitest'
function page(html, path = '/users/alice/bookmarks') {
 const dom = new JSDOM(html, { url: 'https://archiveofourown.org' + path })
 vi.stubGlobal('document', dom.window.document); vi.stubGlobal('location', dom.window.location)
 Object.defineProperty(dom.window.document, 'readyState', { value: 'complete', configurable: true })
}
it('extracts scraper-compatible bookmark fields, line breaks, stable identities and pagination', () => {
 page(`<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_12"><h4 class="heading"><a href="/works/34">Title</a> by <a rel="author">Author</a></h4><div class="header"><p class="datetime">20 Oct 2026</p></div><blockquote class="summary"><p><em>One</em></p><p>Two<br>Three</p></blockquote><dl><dd class="words">1,234</dd><dd class="chapters">2/?</dd></dl><div class="user"><div class="notes"><p>Private Notes</p></div><div class="tags"><a class="tag">Mine</a></div></div></li><li class="bookmark deleted" id="bookmark_13"><p class="message">This has been deleted, sorry!</p></li><li class="bookmark"><h4 class="heading"><a href="/series/44">Series</a></h4></li></ol><ol class="pagination"><li><a href="?page=2">Next</a></li></ol></div>`)
 expect(captureListingPage('bookmarks')).toMatchObject({ hasNext: true, skipped: 0, seriesUrls: ['https://archiveofourown.org/series/44'], rows: [{ title: 'Title', author: 'Author', words: '1234', chapters: '2/?', 'bookmark id': '12', 'bookmark tags': 'Mine', 'bookmark notes': 'Private Notes', summary: 'One\nTwo\nThree', summary_html: '<p><em>One</em></p><p>Two<br>Three</p>', source_list: 'bookmarks', work_status: 'available' }, { link: 'https://archiveofourown.org/bookmarks/13', title: '', work_status: 'deleted', 'bookmark id': '13' }] })
})
it('distinguishes empty lists from login/error pages and omits history metadata', () => {
 page('<div id="main" class="readings-index"><ol class="work index"></ol></div>', '/users/alice/readings?show=to-read')
 expect(captureListingPage('marked_for_later')).toMatchObject({ rows: [], hasNext: false })
 page('<div id="main">Too many requests</div>')
 expect(captureListingPage('bookmarks').error).toBeTruthy()
})

it('classifies login and rate restriction pages for the app alert', () => {
 page('<div id="main"><form id="new_user"><input name="user[login]"></form></div>', '/users/login')
 expect(captureListingPage('bookmarks')).toMatchObject({ attention: 'login' })
 page('<div id="main"><h2>429 Too Many Requests</h2><p>Please try again later.</p></div>')
 expect(captureListingPage('bookmarks')).toMatchObject({ attention: 'rate_limit' })
})

it('recognizes AO3’s explicit deleted message while leaving hidden and unsupported entries unclassified', () => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark"><li id="bookmark_100" class="bookmark blurb group"><p class="message">This has been deleted, sorry!</p><div class="user"><div class="notes"><p>Remember this</p></div><ul class="tags"><li><a class="tag">Mine</a></li></ul></div></li><li id="bookmark_101" class="bookmark"><p class="message">This work is hidden.</p></li><li id="bookmark_102" class="bookmark"><div class="user"><div class="notes">This has been deleted, sorry!</div></div></li></ol></div>')
 expect(captureListingPage('bookmarks')).toMatchObject({ skipped: 2, rows: [{ work_status: 'deleted', title: '', link: 'https://archiveofourown.org/bookmarks/100', 'bookmark id': '100', 'bookmark notes': 'Remember this', 'bookmark tags': 'Mine' }] })
 expect(captureListingPage('bookmarks').skippedEntries).toEqual([
  { title: 'This work is hidden.', url: 'https://archiveofourown.org/bookmarks/101', sourceUrl: 'https://archiveofourown.org/users/alice/bookmarks', reason: expect.stringContaining('No AO3 work link') },
  { title: 'Unidentified AO3 Entry', url: 'https://archiveofourown.org/bookmarks/102', sourceUrl: 'https://archiveofourown.org/users/alice/bookmarks', reason: expect.stringContaining('No AO3 work link') },
 ])
})
it('retains all displayed bookmark fields and remaining work data for explicit deletions', () => {
 page(`<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_123456"><p class="message">This has been deleted, sorry!</p>
 <p class="status" title="0 bookmarks"><a><span class="private rec">Private</span></a></p>
 <div class="user"><h5 class="byline"><a>alice</a></h5><p class="datetime">20 Oct 2026</p>
 <blockquote class="notes"><p>First note</p><p>Second<br>Third</p></blockquote><ul class="tags"><li><a class="tag">Favorites</a></li><li><a class="tag">To Reread</a></li></ul></div>
 <blockquote class="summary"><p>Remaining summary</p></blockquote><dl><dd class="kudos">12</dd></dl></li></ol></div>`)
 const result = captureListingPage('bookmarks')
 expect(result).toMatchObject({ skipped: 0, rows: [{ title: '', work_status: 'deleted', link: 'https://archiveofourown.org/bookmarks/123456',
  'bookmark id': '123456', 'bookmark url': 'https://archiveofourown.org/bookmarks/123456', 'bookmark notes': 'First note\nSecond\nThird',
  'bookmark tags': 'Favorites, To Reread', 'bookmark date': '20 Oct 2026', 'bookmark user': 'alice', 'bookmark count': '0', 'bookmark status': 'private rec',
  summary: 'Remaining summary', kudos: '12' }] })
 document.querySelector('li.bookmark').insertAdjacentHTML('afterbegin', '<h4 class="heading"><a href="/works/42">Remaining title</a></h4>')
 expect(captureListingPage('bookmarks').rows[0]).toMatchObject({ title: 'Remaining title', link: 'https://archiveofourown.org/works/42', work_status: 'deleted' })
})
it.each([
 ['rec', 'true'], ['public', 'false'], ['private', 'unknown'], ['hidden', 'unknown'], ['', 'unknown'],
])('records Rec evidence from the %s bookmark symbol without guessing', (symbol, expected) => {
 page(`<div id="main" class="bookmarks-index"><ol class="bookmark"><li class="bookmark" id="bookmark_5"><h4 class="heading"><a href="/works/42">Work</a></h4>${symbol ? `<p class="status"><a><span class="${symbol}"></span></a></p>` : ''}<div class="user"><div class="notes"><span class="rec">Rec in personal notes</span></div></div></li></ol></div>`)
 expect(captureListingPage('bookmarks').rows[0]['bookmark rec']).toBe(expected)
})

it('captures works on user, pseud, and series work pages using the shared row format', () => {
 for (const [kind, css, path] of [['works', 'works-index', '/users/alice/pseuds/Other/works'], ['series_works', 'series-show', '/series/12']]) {
  page(`<div id="main" class="${css}"><ul class="work"><li class="work"><h4 class="heading"><a href="/works/34">Work</a><a rel="author">Writer</a></h4><blockquote class="summary"><p>Summary</p></blockquote></li></ul></div>`, path)
  expect(captureListingPage(kind)).toMatchObject({ rows: [{ title: 'Work', author: 'Writer', summary: 'Summary', source_list: 'marked_for_later' }], hasNext: false })
 }
})
it('reads collection summary and intro from AO3 collection profile markup', () => {
 page('<div id="main"><div class="collection home profile"><div class="primary header module"><h2 class="heading"><a>Collection Title</a></h2><blockquote class="userstuff"><p>Summary</p></blockquote></div><div id="intro"><h3>Intro:</h3><blockquote class="userstuff"><p>First</p><p>Second<br>Third</p></blockquote></div><div id="rules">Omit rules</div></div></div>', '/collections/example/profile')
 expect(captureListingPage('collection_profile')).toMatchObject({ collection: { name: 'Collection Title', description: 'Summary\n\nFirst\nSecond\nThird' }, rows: [], hasNext: false })
})

it('reports an unfinished document as pending rather than a sign-in failure', () => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark index"></ol></div>')
 for (const value of ['loading']) {
  Object.defineProperty(document, 'readyState', { value, configurable: true })
  expect(captureListingPage('bookmarks')).toEqual({ url: location.href, pending: true })
 }
 Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true })
 expect(captureListingPage('bookmarks')).toMatchObject({ rows: [], hasNext: false })
})

it('matches equivalent scan queries while rejecting different pages, filters, paths and origins', () => {
 const url = 'https://archiveofourown.org/users/alice/bookmarks?bookmark_search%5Bsort_column%5D=created_at&page=1'
 expect(sameScanUrl('https://archiveofourown.org/users/alice/bookmarks?page=1&bookmark_search[sort_column]=created_at', url)).toBe(true)
 for (const other of [url.replace('page=1', 'page=2'), url.replace('created_at', 'revised_at'), url.replace('/alice/', '/bob/'), url.replace('archiveofourown.org', 'example.com'), undefined]) expect(sameScanUrl(other, url)).toBe(false)
})

it('ignores pagination anchors without href and resolves relative page links', () => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_12"><h4 class="heading"><a href="/works/34">Title</a></h4></li></ol><ol class="pagination"><li><a name="page-navigation">Pages</a></li><li><a href="">Current</a></li><li><a href="?page=2">Next</a></li></ol></div>')
 expect(captureListingPage('bookmarks')).toMatchObject({ rows: [{ link: 'https://archiveofourown.org/works/34' }], skipped: 0, hasNext: true })
 document.querySelector('.pagination a[href="?page=2"]').setAttribute('href', 'bookmarks?page=3')
 expect(captureListingPage('bookmarks')).toMatchObject({ hasNext: true })
})

it('counts malformed work links as skipped and retains the remaining bookmarks', () => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_12"><h4 class="heading"><a href="http://[">Malformed</a></h4></li><li class="bookmark" id="bookmark_13"><h4 class="heading"><a href="/works/35">Valid</a></h4></li></ol></div>')
 expect(captureListingPage('bookmarks')).toMatchObject({ rows: [{ link: 'https://archiveofourown.org/works/35', 'bookmark id': '13' }], skipped: 1, hasNext: false })
})

it.each(['http://[', 'https://example.com/?page=2', '/users/bob/bookmarks?page=2'])('stops safely on an invalid pagination destination %s', href => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark index"></ol><ol class="pagination"><li><a href="?page=2">Next</a></li></ol></div>')
 document.querySelector('.pagination a').setAttribute('href', href)
 expect(captureListingPage('bookmarks')).toMatchObject({ attention: 'page_error', error: expect.stringContaining('pagination') })
})

it('discovers unique series memberships in primary lists without following other memberships recursively', () => {
 page('<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_12"><h4 class="heading"><a href="/works/34">Title</a></h4><ul class="series"><li>Part 1 of <a href="/series/7">Series seven</a></li><li><a href="/series/7">Duplicate</a></li><li><a href="https://example.com/series/8">Other site</a></li><li><a href="http://[">Malformed</a></li></ul></li></ol></div>')
 expect(captureListingPage('bookmarks')).toMatchObject({ seriesUrls: ['https://archiveofourown.org/series/7'], rows: [{ link: 'https://archiveofourown.org/works/34' }] })
 document.querySelector('#main').className = 'series-show'
 expect(captureListingPage('series_works')).toMatchObject({ seriesUrls: [] })
})

it('accepts filtered root bookmark URLs for Full Scan and preserves their filter parameters', () => {
 const url = 'https://archiveofourown.org/bookmarks?commit=Sort+and+Filter&bookmark_search%5Bsort_column%5D=created_at&bookmark_search%5Bother_tag_names%5D=&bookmark_search%5Bbookmarkable_query%5D=blackkat&bookmark_search%5Brec%5D=0&user_id=AlmiH'
 expect(listingUrl(url)).toEqual({ kind: 'bookmarks', url })
 expect(() => listingUrl(url, 'quick')).toThrow()
 expect(() => listingUrl('https://archiveofourown.org/tags/Example/bookmarks', 'quick')).toThrow()
})
