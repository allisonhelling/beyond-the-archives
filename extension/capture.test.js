import fixture from '../server/ao3/fixtures/work.html?raw'
import { beforeEach, expect, it, vi } from 'vitest'
import { captureMetadataPage } from './capture.js'
import { parseMetadata } from '../server/ao3/adapter.ts'

beforeEach(() => { vi.stubGlobal('location', new URL('https://archiveofourown.org/works/123')); document.body.innerHTML = '' })
it('captures parser-compatible metadata without chapter text or account controls', () => {
 document.documentElement.innerHTML = fixture
 // The fixture deliberately uses bare metadata; AO3 wraps it in dl.work.meta.
 const dl = document.querySelector('dl')
 dl.classList.add('work', 'meta')
 document.body.insertAdjacentHTML('beforeend', '<div id="chapters">PRIVATE CHAPTER TEXT</div><input value="PRIVATE CSRF"><div class="notes">PRIVATE NOTE</div>')
 const captured = captureMetadataPage()
 expect(captured.html).not.toMatch(/PRIVATE CHAPTER|PRIVATE CSRF|PRIVATE NOTE/)
 expect(parseMetadata(captured.html, 123, captured.url).metadata).toMatchObject({ title: 'A & B', published_chapters: 6 })
})
it('skips unloaded, unrelated and oversized pages', () => {
 expect(captureMetadataPage()).toBeNull()
 document.body.innerHTML = '<h2 class="title">Work</h2><div class="summary module">' + 'x'.repeat(400001) + '</div>'
 expect(captureMetadataPage()).toBeNull()
 vi.stubGlobal('location', new URL('https://example.com/works/123'))
 expect(captureMetadataPage()).toBeNull()
})
