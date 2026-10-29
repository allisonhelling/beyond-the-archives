import { frontMatterMetadata, mergeMetadata, metadataVersion, packageMetadata } from './metadata'
import { parseWorkUrl } from '../../src/features/imports/urls'
import { chapterWordCount } from '../../src/features/library/chapter-word-count'
import { openZip, zipMaxBytes } from '../../src/lib/zip'
import { blankMetadata, type Book, type Chapter } from './model'
const parse = (text: string) => { if (/<!ENTITY/i.test(text)) throw new Error('Unsupported XML entities.'); const doc = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('Invalid EPUB XML.'); return doc }
const elements = (doc: Document, name: string) => [...doc.getElementsByTagNameNS('*', name)]
export function resourcePath(base: string, href: string) { const url = new URL(href, `https://epub.invalid/${base}`); if (url.origin !== 'https://epub.invalid' || url.search) throw new Error('External EPUB resource.'); return decodeURIComponent(url.pathname.slice(1)) }
export async function digest(buffer: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('') }
// Allow only prose markup. No imported styles, active content, network resources, or SVG.
export function sanitize(doc: Document, path: string, resources: Record<string, Blob>) {
  const allowed = new Set('p div span section article h1 h2 h3 h4 h5 h6 blockquote pre code em strong b i u s del ins sub sup br hr ul ol li dl dt dd table thead tbody tr th td caption a img figure figcaption aside'.split(' '))
  function clean(node: Element): Node {
    if (!allowed.has(node.localName.toLowerCase())) { const span = document.createElement('span'); if (!['script','style','iframe','object','svg','math','form','input','video','audio','link','meta','base'].includes(node.localName.toLowerCase())) for (const child of node.childNodes) span.append(child.nodeType === 3 ? document.createTextNode(child.textContent ?? '') : child.nodeType === 1 ? clean(child as Element) : document.createTextNode('')); return span }
    const out = document.createElement(node.localName.toLowerCase())
    if (node.id) out.id = node.id
    if (/^h[1-6]$/.test(node.localName) && /^Notes:?$/i.test(node.textContent?.trim() ?? '')) { out.textContent = 'Author Notes'; return out }
    if (node.localName === 'img') { const src = node.getAttribute('src'); if (!src) throw new Error('An embedded image has no source.'); const key = resourcePath(path, src); if (!resources[key]) throw new Error(`Missing embedded image: ${key}`); out.setAttribute('data-resource', key); out.setAttribute('alt', node.getAttribute('alt') ?? '') }
    if (node.localName === 'a') { const href = node.getAttribute('href') ?? ''; if (href.startsWith('#')) out.setAttribute('href', href); else { try { const target = new URL(href); if (['https:', 'http:'].includes(target.protocol)) { out.setAttribute('href', target.href); out.setAttribute('target', '_blank'); out.setAttribute('rel', 'noopener noreferrer') } } catch { out.setAttribute('data-link', `${resourcePath(path, href)}${href.includes('#') ? '#' + href.split('#')[1] : ''}`) } } }
    for (const child of node.childNodes) if (child.nodeType === 3) out.append(document.createTextNode(child.textContent ?? '')); else if (child.nodeType === 1) out.append(clean(child as Element))
    return out
  }
  const container = document.createElement('div'), body = elements(doc, 'body')[0]
  if (!body) throw new Error('EPUB chapter has no body.')
  for (const child of body.children) container.append(clean(child))
  return container.innerHTML
}
export async function importEpub(file: File): Promise<Book> {
  if (file.size > zipMaxBytes) throw new Error('EPUB exceeds the 50 MiB file limit.')
  const buffer = await file.arrayBuffer(), archive = openZip(buffer, { resource: 16 * 1024 * 1024, total: 200 * 1024 * 1024 })
  if ((await archive.readText('mimetype')).trim() !== 'application/epub+zip') throw new Error('Choose a valid EPUB file.')
  if (archive.names.includes('META-INF/encryption.xml')) { const encryption = parse(await archive.readText('META-INF/encryption.xml')); if (elements(encryption, 'EncryptionMethod').some(el => !['http://www.idpf.org/2008/embedding','http://ns.adobe.com/pdf/enc#RC'].includes(el.getAttribute('Algorithm') ?? ''))) throw new Error('DRM-protected content is unsupported.') }
  const container = parse(await archive.readText('META-INF/container.xml')), packagePath = elements(container, 'rootfile')[0]?.getAttribute('full-path')
  if (!packagePath) throw new Error('Missing EPUB package.')
  const opf = parse(await archive.readText(packagePath))
  if (elements(opf, 'meta').some(el => el.getAttribute('property') === 'rendition:layout' && el.textContent === 'pre-paginated')) throw new Error('Fixed-layout EPUBs are unsupported.')
  const manifest = new Map(elements(opf, 'item').map(el => [el.getAttribute('id'), { path: resourcePath(packagePath, el.getAttribute('href') ?? ''), type: el.getAttribute('media-type') ?? '', properties: el.getAttribute('properties') ?? '' }]))
  const resources: Record<string, Blob> = {}
  for (const item of manifest.values()) if (/^image\/(png|jpeg|gif|webp|avif)$/.test(item.type)) resources[item.path] = new Blob([await archive.readBytes(item.path)], { type: item.type })
  let extraMetadata = packageMetadata(opf)
  const chapters: Chapter[] = [], identities = new Set<string>()
  const identify = (value: string) => { try { identities.add(String(parseWorkUrl(value.replace(/^URL:/i, '').trim()).workId)) } catch { /* Non-AO3 publication identifiers do not identify a work. */ } }
  for (const el of [...elements(opf, 'source'), ...elements(opf, 'identifier')]) identify(el.textContent ?? '')
  for (const ref of elements(opf, 'itemref')) {
    const item = manifest.get(ref.getAttribute('idref'))
    if (!item || !['application/xhtml+xml', 'text/html'].includes(item.type)) throw new Error('Missing or unsupported chapter resource.')
    if (item.properties.includes('nav') || ref.getAttribute('linear') === 'no') continue
    const doc = parse(await archive.readText(item.path)), body = elements(doc, 'body')[0]
    if (!body) throw new Error('Missing chapter body.')
    if (body.querySelector('#preface, dl.tags')) for (const a of body.querySelectorAll('.message a[href], a[rel="canonical"]')) identify(a.getAttribute('href') ?? '')
    const frontMatter = frontMatterMetadata(doc)
    extraMetadata = mergeMetadata(extraMetadata, frontMatter.metadata)
    frontMatter.urls.forEach(identify)
    const title = body.querySelector('h2, h1, h3.fff_chapter_title, h3')?.textContent?.trim() || `Section ${chapters.length + 1}`
    const heading = body.querySelector('.chapter h2, h2.title, h2.heading, h1'), chapterLink = heading?.querySelector('a[href]')?.getAttribute('href') ?? ''
    const match = chapterLink.match(/archiveofourown\.org\/works\/([1-9]\d*)\/chapters\/([1-9]\d*)/)
    const number = heading?.textContent?.match(/^\s*(?:Chapter\s+)?(\d+)[.:\s–-]/i)
    const prose = body.querySelector('.chapter > .userstuff, #chapters > .userstuff, .userstuff:not(.summary):not(.notes)') ?? body
    const text = prose.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const ao3Id = match && identities.size === 1 && identities.has(match[1]) ? match[2] : null
    chapters.push({ kind: body.matches('.fff_titlepage, .fff_tocpage, .fff_logpage, .fff_coverpage') || body.querySelector('#preface, dl.tags') && !body.querySelector('.userstuff') ? 'frontmatter' : 'chapter', id: ao3Id ? `ao3:${ao3Id}` : `text:${await digest(new TextEncoder().encode(text).buffer)}`, ao3Id, number: match && number ? Number(number[1]) : null, title, html: sanitize(doc, item.path, resources), words: chapterWordCount(prose), path: item.path })
  }
  if (!chapters.length) throw new Error('No readable chapters found.')
  const metadata = { ...blankMetadata, title: elements(opf, 'title')[0]?.textContent || 'Untitled', authors: elements(opf, 'creator').map(el => el.textContent || ''), ao3_tags: elements(opf, 'subject').map(el => el.textContent || '') }
  // Reuse the organizer's richer AO3 extraction, while allowing standalone anthologies.
  try { const { readEpub } = await import('../../src/features/imports/epub'); Object.assign(metadata, (await readEpub(buffer)).metadata) } catch (error) { if (!(error instanceof Error) || !error.message.includes('multiple AO3 works')) throw error }
  return { id: await digest(buffer), workId: identities.size === 1 ? [...identities][0] : null, active: true, metadata: mergeMetadata(metadata, extraMetadata), metadataVersion, chapters, resources, file, importedAt: new Date().toISOString(), metadataAt: new Date().toISOString(), position: { chapter: chapters[0].id, fraction: 0 }, completed: [], history: [], status: 'to_read', notes: '', collections: [] }
}
