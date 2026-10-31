import { readSummary } from '../../src/features/library/summaries/summary'
import { isCalendarDate } from '../../src/lib/dates'
import { parseSeriesUrl, parseWorkUrl } from '../../src/features/imports/urls'
import type { ReaderMetadata } from './model'

/** Present the AO3 publisher consistently, including existing imported snapshots. */
export function publisherName(value: string | undefined) {
  return value && /^(?:https?:\/\/)?(?:www\.)?archiveofourown\.org\/?$/i.test(value.trim()) ? 'AO3' : value
}
export function seriesNames(metadata:ReaderMetadata):string[] {
  return [...new Set([...(metadata.series??[]),...(metadata.series_memberships??[]).map(series=>series.name)].map(name=>name.trim()).filter(Boolean))]
}
export const metadataVersion = 4
const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
const keyOf = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
export function metadataDate(value: string): string | undefined {
  const date = value.trim().replaceAll('/', '-').slice(0, 10)
  return isCalendarDate(date) ? date : undefined
}
export function publicationStatusFromText(value: string): ReaderMetadata['publication_status'] | undefined {
  const status = keyOf(value.replace(/^(?:publication\s*status|status)\s*:\s*/i, ''))
  if (['complete', 'completed', 'finished', 'completeonao3'].includes(status)) return 'complete'
  if (['inprogress', 'ongoing', 'unfinished', 'inprogressonao3'].includes(status)) return 'in_progress'
  if (status === 'abandoned' || status === 'deleted' || status === 'unknown') return status
  if (status === 'ao3statusunknown') return 'unknown'
}
export function workTags(metadata: ReaderMetadata) {
  // Status remains in the saved snapshot and filter; it is displayed beside the title.
  return metadata.ao3_tags.filter(tag => publicationStatusFromText(tag) === undefined)
}
function count(value: string): number | undefined {
  const text = value.trim().replaceAll(',', '')
  if (!/^\d+$/.test(text)) return
  const number = Number(text)
  return Number.isSafeInteger(number) && number <= 2147483647 ? number : undefined
}
const listFields: Record<string, keyof ReaderMetadata> = {
  author: 'authors', authors: 'authors', creator: 'authors', byline: 'authors',
  fandom: 'fandoms', fandoms: 'fandoms', category: 'categories', categories: 'categories', ao3categories: 'categories',
  characters: 'character_tags', character: 'character_tags', relationships: 'relationship_tags', ships: 'relationship_tags',
  warnings: 'archive_warnings', archivewarnings: 'archive_warnings', archivewarning: 'archive_warnings',
  freeformtags: 'additional_tags', additionaltags: 'additional_tags', extratags: 'additional_tags', tags: 'ao3_tags', subject: 'ao3_tags',
  series: 'series', additionalseries: 'series', series00: 'series', series01: 'series', series02: 'series', series03: 'series',
  collections: 'ao3_collections',
}
const numbers: Record<string, keyof ReaderMetadata> = { words: 'word_count', numwords: 'word_count', wordcount: 'word_count', kudos: 'kudos', hits: 'hits', bookmarks: 'bookmark_count', comments: 'comment_count', totalchapters: 'total_chapters', chapterstotal: 'total_chapters' }
const dates: Record<string, keyof ReaderMetadata> = { published: 'published_at', datepublished: 'published_at', updated: 'updated_at', dateupdated: 'updated_at', lastupdate: 'updated_at', packaged: 'packaged_at', datecreated: 'packaged_at' }

/** Known labeled metadata only; arbitrary prose and software diagnostics are ignored. */
function applyField(metadata: Partial<ReaderMetadata>, label: string, value: string, list?: string[]) {
  const key = keyOf(label), text = value.trim()
  if (!text) return
  const listKey = listFields[key]
  if (listKey) {
    const values = list?.length ? list : text.split(/\s*\n\s*|\s*,\s*/)
    Object.assign(metadata, { [listKey]: unique([...(metadata[listKey] as string[] | undefined ?? []), ...values]) })
  } else if (numbers[key]) {
    const number = count(text)
    if (number !== undefined) Object.assign(metadata, { [numbers[key]]: number })
  } else if (dates[key]) {
    const date = metadataDate(text)
    if (date) Object.assign(metadata, { [dates[key]]: date })
  } else if (['chapters', 'numchapters', 'chapterslashtotal', 'chapterstotalchapters'].includes(key)) {
    const parts = text.match(/^(\d[\d,]*)(?:\s*\/\s*(\d[\d,]*|\?))?$/)
    if (parts) {
      const published = count(parts[1]), total = parts[2] === '?' ? null : parts[2] ? count(parts[2]) : undefined
      if (published !== undefined) metadata.published_chapters = published
      if (total !== undefined) metadata.total_chapters = total
      if (published !== undefined && total !== undefined) metadata.publication_status = total !== null && total === published ? 'complete' : 'in_progress'
    }
  } else if (['status', 'publicationstatus'].includes(key)) {
    const status = publicationStatusFromText(text)
    if (status) metadata.publication_status = status
  } else if (['summary', 'description'].includes(key)) {
    Object.assign(metadata, readSummary(text, 'auto'))
  } else if (['language', 'langcode', 'rating', 'publisher', 'site', 'title'].includes(key)) {
    const field = key === 'site' ? 'publisher' : key === 'langcode' ? 'language_code' : key
    Object.assign(metadata, { [field]: text })
  }
}
function finish(metadata: Partial<ReaderMetadata>) {
  metadata.ao3_tags = unique([...(metadata.ao3_tags ?? []), ...(metadata.archive_warnings ?? []), ...(metadata.categories ?? []), ...(metadata.character_tags ?? []), ...(metadata.relationship_tags ?? []), ...(metadata.additional_tags ?? [])])
  return metadata
}
export function packageMetadata(opf: Document): Partial<ReaderMetadata> {
  const metadata: Partial<ReaderMetadata> = {}, node = opf.getElementsByTagNameNS('*', 'metadata')[0]
  if (!node) return metadata
  for (const el of node.children) {
    if (el.localName === 'description') Object.assign(metadata, readSummary(el.children.length ? el.innerHTML : el.textContent ?? '', 'auto'))
    if (el.localName === 'publisher') metadata.publisher = el.textContent?.trim()
    if (el.localName === 'language') metadata.language_code = el.textContent?.trim()
    if (el.localName === 'date') {
      const event = el.getAttributeNS('http://www.idpf.org/2007/opf', 'event') ?? el.getAttribute('opf:event')
      const field = event === 'modification' ? 'updated_at' : event === 'creation' ? 'packaged_at' : event === 'publication' || !event ? 'published_at' : null
      const date = metadataDate(el.textContent ?? '')
      if (field && date) metadata[field] = date
    }
    if (el.localName !== 'meta') continue
    const name = el.getAttribute('name') ?? el.getAttribute('property') ?? ''
    let value: unknown = el.getAttribute('content') ?? el.textContent ?? ''
    if (name.startsWith('calibre:user_metadata:')) {
      try { const json = JSON.parse(String(value)); value = json['#value#'] } catch { continue }
    }
    const label = name.replace(/^calibre:user_metadata:#?/, '').replace(/^(?:fanficfare|fff|calibre):/, '')
    if (Array.isArray(value)) applyField(metadata, label, value.map(String).join('\n'), value.map(String))
    else if (typeof value === 'string' || typeof value === 'number') applyField(metadata, label, String(value), keyOf(label) === 'series' ? [String(value)] : undefined)
  }
  return finish(metadata)
}
export function frontMatterMetadata(doc: Document): { metadata: Partial<ReaderMetadata>; urls: string[] } {
  const metadata: Partial<ReaderMetadata> = {}, urls: string[] = []
  const scope = doc.querySelector('.fff_titlepage, #preface') ?? (doc.querySelector('dl.tags') ? doc.querySelector('body') : null)
  if (!scope) return { metadata, urls }
  const read = (label: string, fragment: Element) => {
    const links = [...fragment.querySelectorAll('a')].map(el => el.textContent?.trim() ?? '').filter(Boolean)
    const items = [...fragment.querySelectorAll('li')].map(el => el.textContent?.trim() ?? '').filter(Boolean)
    const text = fragment.textContent?.trim() ?? ''
    if (['summary', 'description'].includes(keyOf(label))) Object.assign(metadata, readSummary(fragment.innerHTML))
    else applyField(metadata, label, text, items.length ? items : links.length ? links : undefined)
    if (keyOf(label) === 'series') {
      const memberships = metadata.series_memberships ?? []
      for (const link of fragment.querySelectorAll('a[href]')) {
        try {
          const series = parseSeriesUrl(new URL(link.getAttribute('href')!, 'https://archiveofourown.org').href)
          let prefix = ''
          for (let node = link.previousSibling; node; node = node.previousSibling) {
            if (node.nodeType === 1 && (node as Element).querySelector('a[href*="/series/"]')) break
            prefix = (node.textContent ?? '') + prefix
          }
          const position = prefix.match(/Part\s+(\d+)\s+of\s*$/i)
          memberships.push({ id: series.seriesId, name: link.textContent?.trim() ?? '', url: series.normalizedUrl, position: position ? count(position[1]) ?? null : null })
        } catch { /* Other series URLs retain their names without inventing positions. */ }
      }
      if (memberships.length) metadata.series_memberships = memberships
    }
    if (['url', 'storyurl', 'storyurlsection'].includes(keyOf(label))) for (const value of [text, ...[...fragment.querySelectorAll('a[href]')].map(a => a.getAttribute('href') ?? '')]) {
      try { urls.push(parseWorkUrl(value.replace(/^URL:/i, '').trim()).normalizedUrl) } catch { /* Never infer identity from title or a numeric Story ID. */ }
    }
  }
  for (const term of scope.querySelectorAll('dt')) if (term.nextElementSibling?.localName === 'dd') read(term.textContent ?? '', term.nextElementSibling)
  // FanFicFare supports both a table title page and repeated bold-label/br entries.
  if (scope.matches('.fff_titlepage')) {
    for (const label of scope.querySelectorAll('b, strong')) {
      if (!/:\s*$/.test(label.textContent ?? '')) continue
      const cell = label.closest('td'), row = cell?.parentElement
      if (cell && row?.children.length === 2 && cell === row.firstElementChild) { read(label.textContent ?? '', row.children[1]); continue }
      const fragment = document.createElement('div')
      let sibling = label.nextSibling
      const summary = ['summary', 'description'].includes(keyOf(label.textContent ?? ''))
      while (sibling) {
        if (sibling.nodeType === 1) {
          const element = sibling as Element
          if (summary ? element.matches('b, strong') && /:\s*$/.test(element.textContent ?? '') : ['br', 'b', 'strong'].includes(element.localName)) break
        }
        fragment.append(sibling.cloneNode(true)); sibling = sibling.nextSibling
      }
      read(label.textContent ?? '', fragment)
    }
    const storyLink = scope.querySelector('h3 a[href], h1 a[href]')
    if (storyLink) { try { urls.push(parseWorkUrl(storyLink.getAttribute('href') ?? '').normalizedUrl) } catch { /* Other publishers remain standalone. */ } }
  }
  // Work summaries belong to the front matter, never chapter summaries or author notes.
  if (!scope.matches('.fff_titlepage')) {
    const heading = [...scope.querySelectorAll('h2, h3, p')].find(el => /^Summary:?$/i.test(el.textContent?.trim() ?? ''))
    const summary = heading?.nextElementSibling
    if (summary?.matches('blockquote')) Object.assign(metadata, readSummary(summary.innerHTML))
  }
  // AO3 stats group several fields into one definition.
  const stats = [...scope.querySelectorAll('dt')].find(el => /^Stats:?$/i.test(el.textContent?.trim() ?? ''))?.nextElementSibling?.textContent ?? ''
  for (const match of stats.matchAll(/(Published|Updated|Completed|Words|Chapters):\s*([\d,?/-]+)/gi)) applyField(metadata, match[1].toLowerCase() === 'completed' ? 'Updated' : match[1], match[2])
  return { metadata: finish(metadata), urls: unique(urls) }
}
/** Merge only present fields so richer metadata never erases an older known value. */
export function mergeMetadata<T extends Partial<ReaderMetadata>>(base: T, extra: Partial<ReaderMetadata>): T {
  const fields = Object.fromEntries(Object.entries(extra).filter(([,value]) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)).map(([key,value]) => {
    const previous = base[key as keyof T]
    return [key, key === 'ao3_tags' && Array.isArray(value) && value.every(item => typeof item === 'string') ? unique([...(Array.isArray(previous) && previous.every(item => typeof item === 'string') ? previous as string[] : []), ...value as string[]]) : value]
  }))
  return { ...base, ...fields }
}
