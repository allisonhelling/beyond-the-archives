import fixture from '../server/ao3/fixtures/work.html?raw'
import { beforeEach, expect, it, vi } from 'vitest'
import { captureMetadataPage } from './capture.js'
import { parseMetadata } from '../server/ao3/adapter.ts'

beforeEach(() => { vi.stubGlobal('location', new URL('https://archiveofourown.org/works/123')); document.body.innerHTML = '' })
it('captures parser-compatible metadata without chapter text or account controls', async () => {
 document.documentElement.innerHTML = fixture
 // The fixture deliberately uses bare metadata; AO3 wraps it in dl.work.meta.
 const dl = document.querySelector('dl')
 dl.classList.add('work', 'meta')
 document.body.insertAdjacentHTML('beforeend', '<div id="chapters">PRIVATE CHAPTER TEXT</div><input value="PRIVATE CSRF"><div class="notes">PRIVATE NOTE</div>')
 const captured = await captureMetadataPage()
 expect(captured.html).not.toMatch(/PRIVATE CHAPTER|PRIVATE CSRF|PRIVATE NOTE/)
 expect(parseMetadata(captured.html, 123, captured.url)).toEqual(parseMetadata(fixture, 123, captured.url))
})
it('skips unloaded, unrelated and oversized pages', async () => {
 expect(await captureMetadataPage()).toBeNull()
 document.body.innerHTML = '<h2 class="title">Work</h2><div class="summary module">' + 'x'.repeat(400001) + '</div>'
 expect(await captureMetadataPage()).toBeNull()
 vi.stubGlobal('location', new URL('https://example.com/works/123'))
 expect(await captureMetadataPage()).toBeNull()
})
it('captures only explicit 404 evidence without account content or fabricated metadata', async () => {
 vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
 document.body.innerHTML = '<nav>PRIVATE ACCOUNT</nav><div id="main"><h2>Error 404</h2><p>The page you were looking for doesn\'t exist.</p></div>'
 const captured = await captureMetadataPage()
 expect(captured.notFound).toBe(true)
 expect(captured.html).not.toContain('PRIVATE ACCOUNT')
 expect(parseMetadata(captured.html, 123, captured.url)).toMatchObject({ category: 'not_found', metadata: null })
 document.querySelector('#main h2').textContent = 'Temporarily unavailable'
 expect(await captureMetadataPage()).toBeNull()
})

it('waits for parsed metadata and chapter navigation before capturing ahead of full load', async () => {
 const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
 document.body.innerHTML = '<h2 class="title">Incomplete</h2>'
 let finished = false
 const pending = captureMetadataPage(true).then(value => { finished = true; return value })
 document.documentElement.innerHTML = fixture
 document.querySelector('dl').classList.add('work', 'meta')
 await Promise.resolve()
 expect(finished).toBe(false)
 readyState.mockReturnValue('interactive')
 document.dispatchEvent(new Event('DOMContentLoaded'))
 const captured = await pending
 const result = parseMetadata(captured.html, 123, captured.url)
 expect(result.metadata).toMatchObject({ title: 'A & B', published_chapters: 6, fandoms: ['Fandom One', 'Fandom Two'] })
 expect(result.chapters).toMatchObject({ '1': '910', '6': '960' })
 expect(document.readyState).toBe('interactive')
})

it('waits for required fields, then detects them without another page load', async () => {
 vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive')
 document.documentElement.innerHTML = fixture
 document.querySelector('dl').classList.add('work', 'meta')
 const chapters = document.querySelector('dd.chapters')
 chapters.remove()
 let finished = false
 const pending = captureMetadataPage(true).then(value => { finished = true; return value })
 await Promise.resolve()
 expect(finished).toBe(false)
 document.querySelector('dl').append(chapters)
 expect((await pending).html).toContain('6/?')
})

it('falls back on full load for sparse metadata and bounds waits on confirmation pages', async () => {
 const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive')
 document.body.innerHTML = '<h2 class="title">Sparse work</h2>'
 const pending = captureMetadataPage(true)
 readyState.mockReturnValue('complete')
 document.dispatchEvent(new Event('readystatechange'))
 expect((await pending).html).toContain('Sparse work')
 readyState.mockReturnValue('interactive')
 document.body.innerHTML = '<p>This work could have adult content.</p>'
 vi.useFakeTimers()
 try {
  const waiting = captureMetadataPage(true)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await waiting).toBeNull()
 } finally { vi.useRealTimers() }
})

it('abandons an early wait when the requested document navigates away', async () => {
 vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
 const pending = captureMetadataPage(true)
 window.dispatchEvent(new Event('pagehide'))
 expect(await pending).toBeNull()
})

it('captures a requested series listing without scripts or images', async () => {
 document.body.innerHTML = '<div id="main"><h2 class="heading">Series</h2><dl class="series meta"><dt>Description:</dt><dd>Extras</dd></dl><ul class="series work index"><li class="work blurb"><h4 class="heading"><a href="/works/123">Story</a></h4><img src="private"><script>secret</script><blockquote class="summary">A story.</blockquote></li></ul></div>'
 const result = await captureMetadataPage(false, 'series')
 expect(result?.html).toContain('A story.')
 expect(result?.html).not.toContain('<img')
 expect(result?.html).not.toContain('<script')
})

it('captures only the requested chapter release index for bookmark progress', async () => {
 vi.stubGlobal('location', new URL('https://archiveofourown.org/works/123/navigate'))
 vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
 document.body.innerHTML = '<div id="main"><ol class="chapter index"><li><a href="/works/123/chapters/456">1. Chapter</a><span class="datetime">(2026-10-01)</span><script>secret()</script></li></ol><div>Private account details</div></div>'
 const snapshot = await captureMetadataPage(false, 'navigation')
 expect(snapshot.html).toContain('2026-10-01')
 expect(snapshot.html).not.toMatch(/secret|Private account/)
 vi.stubGlobal('location', new URL('https://archiveofourown.org/works/123'))
 expect(await captureMetadataPage(false, 'navigation')).toBeNull()
})

it('returns only explicit missing-page evidence when a chapter index is unavailable', async () => {
 vi.stubGlobal('location', new URL('https://archiveofourown.org/works/123/navigate'))
 Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true })
 document.body.innerHTML = '<div id="main"><h2>Error 404</h2><p>The page you were looking for doesn\'t exist.</p></div><div>Private navigation</div>'
 const page = await captureMetadataPage(false, 'navigation')
 expect(page.notFound).toBe(true)
 expect(page.html).not.toContain('Private navigation')
})
