import { sha256 as digest } from '../../src/lib/crypto'
export { digest }
import { frontMatterMetadata, mergeMetadata, metadataVersion, packageMetadata } from './metadata'
import { parseWorkUrl } from '../../src/features/imports/urls'
import { chapterWordCount } from '../../src/features/library/chapter-word-count'
import { openZip, zipMaxBytes } from '../../src/lib/zip'
import { blankMetadata, type AnthologyWork, type Book, type Chapter } from './model'
import { withAnthologyMetadata } from './anthology'
export const chapterVersion = 4
const parse = (text: string) => { if (/<!ENTITY/i.test(text)) throw new Error('Unsupported XML entities.'); const doc = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('Invalid EPUB XML.'); return doc }
const elements = (doc: Document, name: string) => [...doc.getElementsByTagNameNS('*', name)]
export function resourcePath(base: string, href: string) { const url = new URL(href, `https://epub.invalid/${base}`); if (url.origin !== 'https://epub.invalid' || url.search) throw new Error('External EPUB resource.'); return decodeURIComponent(url.pathname.slice(1)) }
// Allow only prose markup. No imported styles, active content, network resources, or SVG.
export function sanitize(doc: Document, path: string, resources: Record<string, Blob>, onUnavailableImage: () => void = () => {}) {
  const allowed = new Set('p div span section article h1 h2 h3 h4 h5 h6 blockquote pre code em strong b i u s del ins sub sup br hr ul ol li dl dt dd table thead tbody tr th td caption a img figure figcaption aside'.split(' '))
  function clean(node: Element): Node {
    if (!allowed.has(node.localName.toLowerCase())) { const span = document.createElement('span'); if (!['script','style','iframe','object','svg','math','form','input','video','audio','link','meta','base'].includes(node.localName.toLowerCase())) for (const child of node.childNodes) span.append(child.nodeType === 3 ? document.createTextNode(child.textContent ?? '') : child.nodeType === 1 ? clean(child as Element) : document.createTextNode('')); return span }
    const out = document.createElement(node.localName.toLowerCase())
    if (node.id) out.id = node.id
    if (/^h[1-6]$/.test(node.localName) && /^Notes:?$/i.test(node.textContent?.trim() ?? '')) { out.textContent = 'Author Notes'; return out }
    if (node.localName === 'img') {
      const src = node.getAttribute('src'), alt = node.getAttribute('alt')?.trim()
      let key: string | undefined
      try { if (src) key = resourcePath(path, src) } catch { /* Remote/invalid image references are never fetched. */ }
      if (!key || !resources[key]) {
        onUnavailableImage()
        const placeholder = document.createElement('span'), label = alt ? `Image unavailable: ${alt}` : 'Image unavailable'
        placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', label)
        placeholder.textContent = `[${label}]`
        return placeholder
      }
      out.setAttribute('data-resource', key); out.setAttribute('alt', alt ?? '')
    }
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
  const manifest = new Map<string | null, { path: string; type: string; properties: string }>()
  for (const el of elements(opf, 'item')) {
    const type = el.getAttribute('media-type') ?? ''
    try { manifest.set(el.getAttribute('id'), { path: resourcePath(packagePath, el.getAttribute('href') ?? ''), type, properties: el.getAttribute('properties') ?? '' }) }
    catch (error) { if (!type.startsWith('image/')) throw error }
  }
  const navigation = new Map<string, { title: string; workTitle?: string; workPath?: string }>()
  for (const item of manifest.values()) {
    if (item.type !== 'application/x-dtbncx+xml' && !item.properties.split(/\s+/).includes('nav')) continue
    const nav = parse(await archive.readText(item.path))
    const ncx = item.type === 'application/x-dtbncx+xml'
    for (const node of ncx ? elements(nav, 'navPoint') : [...nav.querySelectorAll('nav li')]) {
      const link = ncx ? [...node.children].find(content => content.localName === 'content') : node.querySelector(':scope > a')
      const href = link?.getAttribute(ncx ? 'src' : 'href')
      const title = (ncx ? node.querySelector('navLabel') : link)?.textContent?.trim()
      if (!href || !title) continue
      const parent = node.parentElement?.closest(ncx ? 'navPoint' : 'li')
      const group = parent ?? (node.querySelector(ncx ? 'navPoint' : 'ol') ? node : null)
      const workTitle = (ncx ? group?.querySelector('navLabel') : group?.querySelector(':scope > a, :scope > span'))?.textContent?.trim()
      const groupLink = ncx ? group?.querySelector('content') : group?.querySelector(':scope > a')
      const groupHref = groupLink?.getAttribute(ncx ? 'src' : 'href')
      try { navigation.set(resourcePath(item.path, href.split('#')[0]), { title, workTitle, workPath: groupHref ? resourcePath(item.path, groupHref.split('#')[0]) : undefined }) } catch { /* Ignore external navigation. */ }
    }
  }
  const resources: Record<string, Blob> = {}
  for (const item of manifest.values()) if (/^image\/(png|jpeg|gif|webp|avif)$/.test(item.type) && archive.names.includes(item.path)) resources[item.path] = new Blob([await archive.readBytes(item.path)], { type: item.type })
  let extraMetadata = packageMetadata(opf), firstStorySeen = false
  let unavailableImages = 0, workTitle: string | undefined
  let currentWork: AnthologyWork | undefined
  const works: AnthologyWork[] = []
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
    const frontMatter = frontMatterMetadata(doc, item.path)
    const workHeading = body.querySelector('#preface h1, #preface h2.title, .fff_titlepage h3, .fff_titlepage h1')
    const nav = navigation.get(item.path)
    const groupedTitle = nav?.workPath && /(?:^|\/)(?:title[_-]?page|preface)\.(?:xhtml|html)$/i.test(nav.workPath) ? nav.workTitle : undefined
    const storyTitle = frontMatter.metadata.title ?? (workHeading?.querySelector('a') ?? workHeading)?.textContent?.trim() ?? groupedTitle
    const chapterHeading = body.querySelector('.chapter h2, h2.title, h2.heading, h3.fff_chapter_title, h1')
    const chapterLink = chapterHeading?.querySelector('a[href]')?.getAttribute('href') ?? ''
    const match = chapterLink.match(/archiveofourown\.org\/works\/([1-9]\d*)\/chapters\/([1-9]\d*)/)
    const sourceIds = new Set(frontMatter.urls.flatMap(url => { try { return [String(parseWorkUrl(url).workId)] } catch { return [] } }))
    const sourceId = sourceIds.size === 1 ? [...sourceIds][0] : match?.[1]
    if (sourceId) identities.add(sourceId)
    const workStart = Boolean(storyTitle && (!currentWork || storyTitle !== workTitle || sourceId && currentWork.workId && sourceId !== currentWork.workId)
      || sourceId && (!currentWork || currentWork.workId && sourceId !== currentWork.workId))
    if (workStart) {
      workTitle = storyTitle || `Work ${works.length + 1}`
      currentWork = { key: `work:${item.path}`, title: workTitle, workId: sourceId ?? null, metadata: { ...blankMetadata, title: workTitle } }
      works.push(currentWork)
    }
    if (currentWork) {
      currentWork.workId ??= sourceId ?? null
      currentWork.metadata = mergeMetadata(currentWork.metadata, frontMatter.metadata)
    }
    const { summary, summary_html, ...fields } = frontMatter.metadata
    // Merged EPUBs have front matter for each story. Later stories must not replace the first summary.
    extraMetadata = mergeMetadata(extraMetadata, firstStorySeen ? fields : { ...fields, summary, summary_html })
    if (frontMatter.urls.length || Object.keys(frontMatter.metadata).length) firstStorySeen = true
    frontMatter.urls.forEach(identify)
    const title = body.querySelector('h2, h1, h3.fff_chapter_title, h3')?.textContent?.trim() || navigation.get(item.path)?.title || `Section ${chapters.length + 1}`
    const number = chapterHeading?.textContent?.match(/^\s*(?:Chapter\s+)?(\d+)(?:[.:\s–—-]|$)/i)
    const prose = [...body.querySelectorAll('.userstuff')].find(node => !node.closest('.notes, .summary, #notes')) ?? body
    const text = prose.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const ao3Id = match && (!currentWork?.workId || currentWork.workId === match[1]) ? match[2] : null
    const nonChapter = body.matches('.fff_titlepage, .fff_tocpage, .fff_logpage, .fff_coverpage') || body.querySelector('.fff_titlepage, .fff_tocpage, .fff_logpage, .fff_coverpage') || /(?:^|\/)(?:title[_-]?page|cover|toc|log_page)\.(?:xhtml|html)$/i.test(item.path) || /^Notes:?$/i.test(title) || body.querySelector('#preface, dl.tags') && !body.querySelector('.userstuff')
    chapters.push({ sourceWorkId: sourceId ?? currentWork?.workId ?? undefined, workKey: currentWork?.key, workTitle, workStart, sectionType: nonChapter ? /^Notes:?$/i.test(title) ? 'notes' : /toc|log_page|cover/i.test(item.path) ? 'other' : 'title' : undefined, kind: nonChapter ? 'frontmatter' : 'chapter', id: ao3Id ? `ao3:${ao3Id}` : `text:${await digest(new TextEncoder().encode(text).buffer)}`, ao3Id, number: match && number ? Number(number[1]) : null, title: nav?.title && !chapterHeading ? nav.title : title, html: sanitize(doc, item.path, resources, () => { unavailableImages++ }), words: chapterWordCount(prose), path: item.path })
  }
  // Equal prose or repeated source links must still address separate spine sections.
  const counts = new Map<string, number>()
  for (const chapter of chapters) counts.set(chapter.id, (counts.get(chapter.id) ?? 0) + 1)
  const used = new Set<string>()
  for (const chapter of chapters) {
    const base = counts.get(chapter.id)! > 1 ? `${chapter.id}:resource:${encodeURIComponent(chapter.path)}` : chapter.id
    let id = base, occurrence = 1
    while (used.has(id)) id = `${base}:${++occurrence}`
    chapter.id = id; used.add(id)
  }
  if (!chapters.length) throw new Error('No readable chapters found.')
  const metadata = { ...blankMetadata, title: elements(opf, 'title')[0]?.textContent || 'Untitled', authors: elements(opf, 'creator').map(el => el.textContent || ''), ao3_tags: elements(opf, 'subject').map(el => el.textContent || '') }
  // Reuse the organizer's richer AO3 extraction, while allowing standalone anthologies.
  try { const { readEpub } = await import('../../src/features/imports/epub'); Object.assign(metadata, (await readEpub(buffer)).metadata) } catch (error) { if (!(error instanceof Error) || !error.message.includes('multiple AO3 works')) throw error }
  const merged = mergeMetadata(metadata, extraMetadata)
  if (works.length > 1) {
    merged.title = elements(opf, 'title')[0]?.textContent || 'Untitled Anthology'
    merged.authors = [...new Set(works.flatMap(work => work.metadata.authors))]
    merged.manual_url = undefined
  }
  return withAnthologyMetadata({ id: await digest(buffer), workId: identities.size === 1 && works.length <= 1 ? [...identities][0] : null, works: works.length > 1 ? works : undefined, active: true, chapterVersion, metadata: merged, metadataVersion, unavailableImages, chapters, resources, file, importedAt: new Date().toISOString(), metadataAt: new Date().toISOString(), position: { chapter: chapters[0].id, fraction: 0 }, completed: [], history: [], status: 'to_read', notes: '', collections: [] })
}
