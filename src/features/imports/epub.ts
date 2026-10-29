import { load } from 'cheerio'
import { openZip, zipMaxBytes, zipTextLimit } from '../../lib/zip'
import { blankMetadata, parseWorkUrl, type Metadata } from '../library/model'
import { readSummary } from '../library/summaries/summary'
import { extractWorkMetadata, readAuthors, type AutomaticMetadata } from './ao3-metadata'
import { nonemptyMetadata } from './ao3-csv'

export type EpubMetadata = { url: string; metadata: Partial<Metadata> }
export const epubMaxBytes = zipMaxBytes

function xml(text: string) {
 if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Unsupported XML declarations in EPUB metadata.')
 const document = new DOMParser().parseFromString(text, 'application/xml')
 if (document.getElementsByTagName('parsererror').length) throw new Error('The EPUB contains invalid XML metadata.')
 return document
}
const elements = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS('*', name)]
const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
function workUrl(value: string) {
 try { return parseWorkUrl(value).normalizedUrl } catch { return '' }
}
function resourcePath(packagePath: string, href: string) {
 const url = new URL(href, `https://epub.invalid/${packagePath}`)
 if (url.origin !== 'https://epub.invalid' || url.search) throw new Error('Invalid EPUB resource path.')
 return decodeURIComponent(url.pathname.slice(1))
}

/** Extract catalog metadata locally. Chapter prose is never returned or saved. */
export async function readEpub(buffer: ArrayBuffer): Promise<EpubMetadata> {
 const archive = openZip(buffer)
 if (!archive.names.includes('mimetype') || (await archive.readText('mimetype')).trim() !== 'application/epub+zip') throw new Error('Choose a valid EPUB file.')
 const container = xml(await archive.readText('META-INF/container.xml'))
 const root = elements(container, 'rootfile').find(item => item.getAttribute('media-type') === 'application/oebps-package+xml')
 const packagePath = root?.getAttribute('full-path')
 if (!packagePath) throw new Error('The EPUB does not identify its metadata package.')
 const document = xml(await archive.readText(packagePath))
 const metadataNode = elements(document, 'metadata')[0]
 if (!metadataNode) throw new Error('The EPUB has no book metadata.')
 const values = (name: string) => unique(elements(metadataNode, name).map(item => item.textContent ?? ''))
 const urls = unique([...values('source'), ...values('identifier')].map(workUrl))
 const captured: AutomaticMetadata = {}
 if (values('title')[0]) captured.title = values('title')[0]
 if (values('creator').length) captured.authors = values('creator')
 if (values('subject').length) captured.ao3_tags = values('subject')
 if (values('language')[0]) captured.language = values('language')[0]
 const description = elements(metadataNode, 'description')[0]
 if (description) Object.assign(captured, readSummary(description.children.length ? description.innerHTML : description.textContent ?? '', 'auto'))
 const series = elements(metadataNode, 'meta').find(item => item.getAttribute('name') === 'calibre:series')?.getAttribute('content')?.trim()
 if (series) captured.series = [series]

 // AO3 downloads are converted to EPUB by Calibre. Their front matter retains
 // AO3's metadata headings even when the resource filenames have been changed.
 const manifest = new Map(elements(document, 'item').filter(item => /application\/xhtml\+xml|text\/html/.test(item.getAttribute('media-type') ?? '')).map(item => [item.getAttribute('id'), item.getAttribute('href') ?? '']))
 const frontMatter = unique([
  ...[...manifest.values()].filter(href => /(?:preface|title[_-]?page|metadata)/i.test(href)),
  ...elements(document, 'itemref').slice(0, 4).map(item => manifest.get(item.getAttribute('idref')) ?? ''),
 ]).slice(0, 6)
 for (const href of frontMatter) {
  const path = resourcePath(packagePath, href)
  if (!archive.names.includes(path) || (archive.size(path) ?? 0) > zipTextLimit) continue
  const $ = load(await archive.readText(path))
  const preface = $('#preface').first().length ? $('#preface').first() : $('.meta').filter((_, node) => $(node).find('dl.tags').length > 0).first()
  if (!preface.length) continue
  // Exclude chapter bodies before using the shared page metadata extractor.
  const scope = load(preface.html() ?? '')
  const observed = extractWorkMetadata(scope, 'https://archiveofourown.org').metadata
  const title = scope('h1').first().text().trim()
  if (title) observed.title = title
  const authors = scope('.byline a[rel="author"], a[rel="author"]')
  if (authors.length) Object.assign(observed, readAuthors(scope, authors, 'https://archiveofourown.org'))
  const fields = { fandoms: /^Fandoms?:$/i, rating: /^Ratings?:$/i, archive_warnings: /^(?:Archive )?Warnings?:$/i, categories: /^Categor(?:y|ies):$/i, relationship_tags: /^Relationships?:$/i, character_tags: /^Characters?:$/i, additional_tags: /^Additional Tags:$/i, series: /^Series:$/i, language: /^Language:$/i } as const
  scope('dt').each((_, node) => {
   const label = scope(node).text().trim(), value = scope(node).next('dd')
   for (const [key, pattern] of Object.entries(fields)) if (pattern.test(label)) {
    const links = value.find('a').toArray().map(link => scope(link).text().trim()).filter(Boolean)
    const text = value.text().trim()
    if (key === 'rating' || key === 'language') Object.assign(observed, { [key]: text })
    else if (links.length || text) Object.assign(observed, { [key]: links.length ? links : [text] })
   }
  })
  const stats = scope('dt').filter((_, node) => /^Stats:$/i.test(scope(node).text().trim())).next('dd').text()
  const text = stats || scope('dl').text()
  const words = text.match(/Words:\s*([\d,]+)/i), chapters = text.match(/Chapters:\s*(\d+)\s*\/\s*(\d+|\?)/i)
  const count = (value: string) => { const number = Number(value.replaceAll(',', '')); return Number.isSafeInteger(number) && number <= 2147483647 ? number : undefined }
  if (words) observed.word_count = count(words[1])
  if (chapters) {
   observed.published_chapters = count(chapters[1])
   if (chapters[2] !== '?') observed.total_chapters = count(chapters[2])
   if (observed.published_chapters !== undefined) observed.is_complete = observed.total_chapters !== undefined && observed.total_chapters === observed.published_chapters
  }
  const summaryHeading = scope('h2, h3, p').filter((_, node) => /^Summary:?$/i.test(scope(node).text().trim())).first()
  const summary = summaryHeading.next('blockquote')
  if (summary.length) Object.assign(observed, readSummary(summary.html() ?? ''))
  for (const link of scope('.message a[href], a[rel="canonical"]').toArray()) {
   const url = workUrl(scope(link).attr('href') ?? '')
   if (url) urls.push(url)
  }
  Object.assign(captured, nonemptyMetadata(observed))
  if (scope('dl.tags').length) break
 }
 if (unique(urls).length > 1) throw new Error('This EPUB identifies multiple AO3 works. Import one work at a time.')
 const metadata: Partial<Metadata> = { ...captured }
 if (captured.is_complete !== undefined) metadata.publication_status = captured.is_complete ? 'complete' : 'in_progress'
 metadata.ao3_tags = unique([...(captured.ao3_tags ?? []), ...['archive_warnings', 'categories', 'relationship_tags', 'character_tags', 'additional_tags'].flatMap(key => captured[key as keyof AutomaticMetadata] as string[] ?? [])])
 // Empty EPUB fields must not erase saved information in an existing editor.
 for (const key of Object.keys(blankMetadata) as (keyof Metadata)[]) {
  if (metadata[key] === undefined || metadata[key] === '' || Array.isArray(metadata[key]) && !metadata[key]!.length) delete metadata[key]
 }
 if (!metadata.title) throw new Error('No work title was found in this EPUB. Try another copy or enter its metadata manually.')
 return { url: unique(urls)[0] ?? '', metadata }
}
