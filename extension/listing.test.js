import { expect, it } from 'vitest'
import { captureListingPage } from './listing.js'
import { JSDOM } from 'jsdom'
import { vi } from 'vitest'
function page(html, path = '/users/alice/bookmarks') {
 const dom = new JSDOM(html, { url: 'https://archiveofourown.org' + path })
 vi.stubGlobal('document', dom.window.document); vi.stubGlobal('location', dom.window.location)
 Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' })
}
it('extracts scraper-compatible bookmark fields, line breaks, stable identities and pagination', () => {
 page(`<div id="main" class="bookmarks-index"><ol class="bookmark index"><li class="bookmark" id="bookmark_12"><h4 class="heading"><a href="/works/34">Title</a> by <a rel="author">Author</a></h4><div class="header"><p class="datetime">20 Oct 2026</p></div><blockquote class="summary"><p>One</p><p>Two<br>Three</p></blockquote><dl><dd class="words">1,234</dd><dd class="chapters">2/?</dd></dl><div class="user"><div class="notes"><p>Private notes</p></div><div class="tags"><a class="tag">Mine</a></div></div></li><li class="bookmark deleted"></li><li class="bookmark"><h4 class="heading"><a href="/series/44">Series</a></h4></li></ol><ol class="pagination"><li><a href="?page=2">Next</a></li></ol></div>`)
 expect(captureListingPage('bookmarks')).toMatchObject({ hasNext: true, skipped: 2, rows: [{ title: 'Title', author: 'Author', words: '1234', chapters: '2/?', 'bookmark id': '12', 'bookmark tags': 'Mine', 'bookmark notes': 'Private notes', summary: 'One\nTwo\nThree', source_list: 'bookmarks' }] })
})
it('distinguishes empty lists from login/error pages and omits history metadata', () => {
 page('<div id="main" class="readings-index"><ol class="work index"></ol></div>', '/users/alice/readings?show=to-read')
 expect(captureListingPage('marked_for_later')).toMatchObject({ rows: [], hasNext: false })
 page('<div id="main">Too many requests</div>')
 expect(captureListingPage('bookmarks').error).toBeTruthy()
})
