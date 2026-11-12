import { load } from 'cheerio'
import { ao3TagUrl, parseTagResolution, verifiedAo3TagLink } from './tag-resolution.ts'
import { retrieveAo3Document } from './adapter.ts'

export const fandomParserVersion = 'ao3_fandom_profile_v2'
export type FandomProfile = {
 name: string; canonical_name: string | null; status: 'canonical' | 'synonym' | 'custom' | 'unverified';
 aliases: string[]; metatag_names: string[]; hierarchy_state: 'missing' | 'observed' | 'malformed' | 'verified_empty';
 profile_complete: boolean; hierarchy_complete: boolean; parser_version: typeof fandomParserVersion; profile_url: string;
}
export type CachedFandomProfile = Omit<FandomProfile,'parser_version'> & { parser_version: string; attempted_at: string; checked_at: string | null; disputed: boolean }

/** Versioned template contract, verified against dated real Wayback captures. */
export function parseFandomProfile(html: string, name: string): FandomProfile {
 const $ = load(html, { sourceCodeLocationInfo: true }), roots = $('#main > .tag.home.profile')
 if (roots.length !== 1) throw new Error('Ambiguous fandom profile.')
 const records = parseTagResolution(html, name, 'fandom'), self = records.find(row => row.name === name)!
 if (self.status === 'canonical') {
  const indicators = roots.children('p').first().find('a[href*="canonicaldef"]')
  if (indicators.length !== 1) throw new Error('Ambiguous canonical evidence.')
  const indicator = new URL(indicators.attr('href') ?? '', 'https://archiveofourown.org')
  if (indicator.origin !== 'https://archiveofourown.org' || indicator.pathname !== '/faq/glossary' || indicator.hash !== '#canonicaldef') throw new Error('Unverified canonical evidence.')
 }
 const profile: FandomProfile = {
  name, canonical_name: self.canonical_name, status: self.status,
  aliases: self.status === 'canonical' ? records.filter(row => row.status === 'synonym').map(row => row.name) : [],
  metatag_names: [], hierarchy_state: 'missing', profile_complete: false, hierarchy_complete: false,
  parser_version: fandomParserVersion, profile_url: ao3TagUrl(name),
 }
 // Parse5 repairs truncated HTML. Require real source end tags on all enclosing
 // regions, a recognizable English template and a footer after the main region.
 const regions = ['html','body','#outer','#main','#main > .tag.home.profile','#footer']
 const locations = regions.map(selector => {
  const nodes = $(selector)
  return nodes.length === 1 ? (nodes[0] as unknown as { sourceCodeLocation?: { startTag?: { startOffset: number }; endTag?: { endOffset: number } } }).sourceCodeLocation : undefined
 })
 const parent = roots.children('.parent.fandom.listbox.group')
 profile.profile_complete = /^\s*<!doctype html>/i.test(html) && /<\/body>\s*<\/html>\s*$/i.test(html)
  && $('html').attr('lang') === 'en' && locations.every(location => location?.startTag && location.endTag)
  && locations[5]!.startTag!.startOffset > locations[3]!.endTag!.endOffset
  && $('#footer a[href="/tos"]').length === 1
  && roots.children('.primary.header.module').length === 1
  && parent.length === 1 && parent.children('h3.heading').text().trim() === 'Parent tags (more general):'
  && parent.children('ul.tags.commas.index.group').length === 1
  && roots.children().toArray().every(node => $(node).is('p, .primary, .parent, .merger, .synonym, .meta, .sub, .child, .work, .bookmark, .collection'))
 if (profile.aliases.length > 1000) throw new Error('Too many fandom aliases.')
 if (self.status !== 'canonical') return profile
 const sections = roots.children('.meta')
 if (!sections.length) {
  // A misspelled/unrecognized metatag section is not intentional omission.
  const suspicious = roots.find('h3').toArray().some(node => /metatag/i.test($(node).text()))
  if (profile.profile_complete && !suspicious) { profile.hierarchy_state = 'verified_empty'; profile.hierarchy_complete = true }
  return profile
 }
 const list = sections.children('ul.tags.tree.index')
 // Neither a missing section nor a synthetic empty list is verified no-parent evidence.
 if (sections.length !== 1 || sections.children('h3.heading').text().trim() !== 'Metatags:' || list.length !== 1 || !list.children('li').length) {
  profile.hierarchy_state = 'malformed'; return profile
 }
 try {
  const names: string[] = []
  // AO3 renders recursive ancestor trees as sibling <li><ul> nodes. Read only
  // direct links, never flatten them into fabricated direct parent edges.
  for (const item of list.children('li').toArray()) {
   const entry = $(item), links = entry.children('a.tag')
   if (links.length === 1 && entry.children().length === 1) names.push(verifiedAo3TagLink(links.text(), links.attr('href')))
   else if (links.length || entry.children('ul.tags.tree.index').length !== 1 || entry.children().length !== 1 || entry.contents().toArray().some(node => node.type === 'text' && Boolean($(node).text().trim()))) throw new Error('Malformed metatag tree.')
  }
  if (!names.length || names.length > 256 || names.includes(name)) throw new Error('Invalid metatag list.')
  profile.metatag_names = [...new Set(names)]
  profile.hierarchy_state = 'observed'
  profile.hierarchy_complete = profile.profile_complete
 } catch { profile.hierarchy_state = 'malformed' }
 return profile
}

export async function retrieveFandomProfile(name: string, fetcher: typeof fetch = fetch) {
 const url = ao3TagUrl(name)
 const document = await retrieveAo3Document(url, next => new URL(next).pathname === new URL(url).pathname, fetcher, false)
 if (!('html' in document)) return { profile: null, failure: document }
 try { return { profile: parseFandomProfile(document.html, name), failure: null } }
 catch { return { profile: null, failure: null } }
}

export type FandomResolutionStore = {
 cached(names: string[]): Promise<CachedFandomProfile[]>
 store(profile: FandomProfile): Promise<void>
 retrieve?: typeof retrieveFandomProfile
 attempts?(user: string, names: string[]): Promise<{name: string; next_attempt_at: string}[]>
 failed?(user: string, name: string): Promise<void>
}

/** Explicit resolver requests only: never called by browsing or pagination. */
export async function resolveFandomRequest(names: string[], store: FandomResolutionStore, pacing: {
 reserve(): Promise<boolean>; pause(seconds: number, reason: string): Promise<void>
}, now: number, user?: string) {
 let records = await store.cached(names)
 const attempts = user && store.attempts ? await store.attempts(user,names) : []
 const refreshMs = 30 * 86400000, failureMs = 10 * 60000
 const due = (name: string) => {
  const row = records.find(record => record.name === name)
  if (attempts.some(attempt => attempt.name === name && Date.parse(attempt.next_attempt_at) > now)) return false
  if (!row) return true
  const attempted = Date.parse(row.attempted_at), checked = Date.parse(row.checked_at ?? '')
  return (!Number.isFinite(attempted) || now - attempted >= failureMs)
   && (row.status === 'unverified' || row.disputed || row.status === 'canonical' && (!row.hierarchy_complete || row.parser_version !== fandomParserVersion) || !Number.isFinite(checked) || now - checked >= refreshMs)
 }
 const name = names.find(due)
 if (!name) return { records, retryAfterMs: null }
 if (!await pacing.reserve()) return { records, retryAfterMs: 35000 }
 const result = await (store.retrieve ?? retrieveFandomProfile)(name)
 if (result.failure?.pauseSeconds) await pacing.pause(result.failure.pauseSeconds, 'fandom_resolution')
 if (!result.profile && user && store.failed) await store.failed(user,name)
 await store.store(result.profile ?? {
  name, canonical_name: null, status: 'unverified', aliases: [], metatag_names: [],
  hierarchy_state: 'missing', profile_complete: false, hierarchy_complete: false, parser_version: fandomParserVersion, profile_url: ao3TagUrl(name),
 })
 records = await store.cached(names)
 return { records, retryAfterMs: names.some(due) ? Math.max(35000, (result.failure?.pauseSeconds ?? 0) * 1000) : null }
}
