import { load } from 'cheerio'
import { retrieveAo3Document } from './adapter.ts'
import { validAo3TagName, type Ao3TagCategory, type TagResolution } from '../../src/features/library/tags/tag-resolution.ts'

// AO3's Tag.to_param escapes these characters before URL percent encoding.
const escapes: Record<string,string> = { '/': '*s*', '&': '*a*', '.': '*d*', '?': '*q*', '#': '*h*' }
export function ao3TagUrl(name: string) {
 if (!validAo3TagName(name)) throw new Error('Invalid tag name.')
 return `https://archiveofourown.org/tags/${encodeURIComponent(name.replace(/[/&.?#]/g, value => escapes[value]))}?language_id=en`
}
export function parseTagResolution(html: string, name: string, category: Ao3TagCategory): TagResolution[] {
 const $ = load(html), root = $('#main > .tag.home.profile').first(), heading = root.children('.primary').find('h2.heading').first().text().trim()
 if (heading !== name) throw new Error('Tag identity could not be verified.')
 const description = root.children('p').first(), label = { character:'Character', relationship:'Relationship', freeform:'Additional Tags' }[category]
 // Read category evidence from the tag profile, never work blurbs or related lists.
 const categoryText = description.text().replace(/\s+/g,' ')
 if (!categoryText.includes(`This tag belongs to the ${label} Category.`)) throw new Error('Tag category could not be verified.')
 const checked_at = new Date().toISOString()
 const record = (tag: string, status: TagResolution['status'], canonical_name: string | null): TagResolution => ({ category, name:tag, status, canonical_name, checked_at, attempted_at:checked_at })
 const merger = root.children('.merger').find('a.tag').first()
 function verifiedLink(link: ReturnType<typeof $>) {
  const text = link.text().trim(), url = new URL(link.attr('href') ?? '', 'https://archiveofourown.org')
  if (!text || url.origin !== 'https://archiveofourown.org' || decodeURIComponent(url.pathname) !== decodeURIComponent(new URL(ao3TagUrl(text)).pathname) || url.search || url.hash) throw new Error('Unverified tag link.')
  return text
 }
 if (merger.length) {
  const canonical = verifiedLink(merger)
  if (canonical === name) throw new Error('Invalid tag synonym.')
  return [record(name,'synonym',canonical),record(canonical,'canonical',canonical)]
 }
 if (description.find('a[href*="canonicaldef"]').length) {
  const synonyms = root.children('.synonym').find('a.tag').toArray().map(node => verifiedLink($(node)))
  return [...new Map([record(name,'canonical',name),...synonyms.map(alias => record(alias,'synonym',name))].map(row => [row.name,row])).values()]
 }
 if (root.children('p').toArray().some(node => $(node).text().includes("This tag has not been marked common"))) return [record(name,'custom',null)]
 throw new Error('Tag classification could not be verified.')
}
export async function retrieveTagResolution(name: string, category: Ao3TagCategory, fetcher: typeof fetch = fetch) {
 const url = ao3TagUrl(name)
 const document = await retrieveAo3Document(url, next => new URL(next).pathname === new URL(url).pathname, fetcher, false)
 if (!('html' in document)) return { records: [], failure: document }
 try { return { records: parseTagResolution(document.html,name,category), failure: null } }
 catch { return { records: [], failure: null } }
}
