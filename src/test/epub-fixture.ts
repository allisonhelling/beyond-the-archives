import { createZip } from '../lib/zip'

export function epubFiles({ source = 'https://archiveofourown.org/works/8001', preface = true } = {}) {
 return [
  { name: 'mimetype', content: 'application/epub+zip' },
  { name: 'META-INF/container.xml', content: '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
  { name: 'OEBPS/content.opf', content: `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Recovered &amp; Remembered</dc:title><dc:creator>Recovered Author</dc:creator><dc:source>${source}</dc:source><dc:language>en</dc:language><dc:subject>Found Tag</dc:subject><dc:description>&lt;p&gt;Recovered summary.&lt;/p&gt;</dc:description><meta name="calibre:series" content="Recovered Series"/></metadata><manifest><item id="preface" href="preface.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="preface"/><itemref idref="chapter"/></spine></package>` },
  { name: 'OEBPS/preface.xhtml', content: preface ? `<html><body><div id="preface"><p class="message"><b>Recovered &amp; Remembered</b><br/>Originally posted at <a href="${source}">${source}</a>.</p><div class="meta"><dl class="tags"><dt>Rating:</dt><dd><a>Explicit</a></dd><dt>Fandom:</dt><dd><a>Recovered Fandom</a></dd><dt>Archive Warning:</dt><dd><a>No Archive Warnings Apply</a></dd><dt>Relationship:</dt><dd><a>A/B</a></dd><dt>Characters:</dt><dd><a>A</a>, <a>B</a></dd><dt>Additional Tags:</dt><dd><a>Recovered Tag</a></dd><dt>Series:</dt><dd>Part 2 of <a href="https://archiveofourown.org/series/99">Recovered Series</a></dd><dt>Stats:</dt><dd>Published: 2020-01-01 Words: 12,345 Chapters: 3/3</dd></dl><h1>Recovered &amp; Remembered</h1><div class="byline">by <a rel="author" href="https://archiveofourown.org/users/recovered">Recovered Author</a></div><p>Summary</p><blockquote><p>Recovered summary.</p><script>danger()</script></blockquote><p>Notes</p><blockquote>Private author notes.</blockquote></div></div></body></html>` : '<html><body><p>No AO3 front matter.</p></body></html>' },
  { name: 'OEBPS/chapter.xhtml', content: '<html><body><div id="chapters"><div class="meta"><p>Summary</p><blockquote>Chapter summary must not replace work summary.</blockquote></div><div class="userstuff">PRIVATE CHAPTER PROSE <a href="https://archiveofourown.org/works/9999">Another work</a></div></div></body></html>' },
 ]
}

export async function epubBuffer(files = epubFiles()): Promise<ArrayBuffer> {
 const blob = createZip(files)
 if (blob.arrayBuffer) return blob.arrayBuffer()
 return new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.onerror = () => reject(reader.error)
  reader.readAsArrayBuffer(blob)
 })
}

/** AO3-style repeated author notes precede distinct chapter prose. */
export function chapterNotesFiles() {
 const files = epubFiles()
 files[2].content = files[2].content.replace('</manifest>', '<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/><item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="chapter3" href="chapter3.xhtml" media-type="application/xhtml+xml"/></manifest>').replace('<itemref idref="chapter"/>', '<itemref idref="notes"/><itemref idref="chapter"/><itemref idref="chapter2"/><itemref idref="chapter3"/>')
 const note = '<blockquote class="userstuff"><p>The same opening author note.</p></blockquote>'
 files.push({ name: 'OEBPS/notes.xhtml', content: `<html><body><h2>Notes:</h2>${note}</body></html>` })
 for (const number of [1, 2, 3]) {
  const content = `<html><body><div class="chapter"><h2 class="title">Chapter ${number}</h2>${number > 1 ? `<div class="chapter preface group"><div id="notes" class="notes module">${note}</div></div>` : ''}<div class="userstuff module"><p>${number === 1 ? 'First chapter prose.' : 'Repeated chapter prose.'}</p></div></div></body></html>`
  if (number === 1) files[4].content = content
  else files.push({ name: `OEBPS/chapter${number}.xhtml`, content })
 }
 return files
}
