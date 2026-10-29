import { expect, it } from 'vitest'
import { epubBuffer, epubFiles } from '../../test/epub-fixture'
import { readEpub } from './epub'

it('recovers AO3 metadata from EPUB front matter without chapter prose or author notes', async () => {
 const result = await readEpub(await epubBuffer())
 expect(result).toMatchObject({ url: 'https://archiveofourown.org/works/8001', metadata: { title: 'Recovered & Remembered', authors: ['Recovered Author'], author_links: { 'Recovered Author': 'https://archiveofourown.org/users/recovered' }, fandoms: ['Recovered Fandom'], published_chapters: 3, total_chapters: 3, word_count: 12345, publication_status: 'complete', rating: 'Explicit', relationship_tags: ['A/B'], character_tags: ['A', 'B'], additional_tags: ['Recovered Tag'], series: ['Recovered Series'], summary: 'Recovered summary.' } })
 expect(result.metadata.ao3_tags).toEqual(expect.arrayContaining(['Found Tag', 'A/B', 'A', 'B', 'Recovered Tag']))
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE CHAPTER|author notes|Chapter summary|danger/)
})
it('uses standard package metadata when no AO3 front matter is present and leaves unknown counts absent', async () => {
 const result = await readEpub(await epubBuffer(epubFiles({ source: '', preface: false })))
 expect(result.url).toBe('')
 expect(result.metadata).toMatchObject({ title: 'Recovered & Remembered', summary: 'Recovered summary.', authors: ['Recovered Author'] })
 expect(result.metadata.published_chapters).toBeUndefined()
 expect(result.metadata.publication_status).toBeUndefined()
})
it('recovers the work URL from the preface when Calibre has no source identifier', async () => {
 const files = epubFiles()
 files[2].content = files[2].content.replace(/<dc:source>.*?<\/dc:source>/, '')
 expect((await readEpub(await epubBuffer(files))).url).toBe('https://archiveofourown.org/works/8001')
})
it('rejects ambiguous work identities, invalid XML and files without an EPUB package', async () => {
 const files = epubFiles()
 files[2].content = files[2].content.replace('</metadata>', '<dc:identifier>https://archiveofourown.org/works/8002</dc:identifier></metadata>')
 await expect(readEpub(await epubBuffer(files))).rejects.toThrow('multiple AO3 works')
 files[1].content = '<invalid>'
 await expect(readEpub(await epubBuffer(files))).rejects.toThrow('invalid XML')
 await expect(readEpub(await epubBuffer([{ name: 'mimetype', content: 'text/plain' }]))).rejects.toThrow('valid EPUB')
})
it('does not execute XML entities or import unsafe summary HTML', async () => {
 const files = epubFiles()
 files[2].content = '<!DOCTYPE package [<!ENTITY source SYSTEM "https://example.com">]>' + files[2].content
 await expect(readEpub(await epubBuffer(files))).rejects.toThrow('Unsupported XML')
})

it.each([
 ['First line.\nSecond line.\n\nLast paragraph.', 'First line.\nSecond line.\n\nLast paragraph.'],
 ['&lt;p&gt;First &lt;em&gt;line&lt;/em&gt;.&lt;br/&gt;Second line.&lt;/p&gt;&lt;p&gt;Last paragraph.&lt;/p&gt;', 'First line.\nSecond line.\n\nLast paragraph.'],
 ['<p>First <em>line</em>.<br/>Second line.</p><p>Last paragraph.</p>', 'First line.\nSecond line.\n\nLast paragraph.'],
])('preserves package description formatting: %s', async (description, summary) => {
 const files = epubFiles({ preface: false })
 files[2].content = files[2].content.replace(/<dc:description>.*?<\/dc:description>/s, `<dc:description>${description}</dc:description>`)
 const result = await readEpub(await epubBuffer(files))
 expect(result.metadata.summary).toBe(summary)
 expect(result.metadata.summary_html).toContain('<br')
})
