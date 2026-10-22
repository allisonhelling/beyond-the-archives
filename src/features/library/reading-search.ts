import { datePlaceholder } from '../../lib/dates'
import { inSeries, seriesMemberships } from './series'
import { publicationStatuses } from './publication-status'
import { active, isCalendarDate, isOneShot, statuses, tagNames, type Story } from './model'

type BaseSortOrder = 'updated' | 'added' | 'ready' | 'alpha'
export type SortOrder = BaseSortOrder | `${BaseSortOrder}_reverse` | 'random'
export type GroupBy = 'none' | 'fandom' | 'author' | 'series'
export type SearchScope = 'any' | 'summary' | 'notes'
export type ReadingFilters = {
  query: string; fandoms: string[]; publication: Story['metadata']['publication_status'][];
  oneShot: 'allowed' | 'only' | 'exclude'; inSeries: boolean; rating: string[]; favorites: boolean; relationship: string; characters: string; tags: string;
  updatedAfter: string; updatedBefore: string; within: string; scope: SearchScope;
  sort: SortOrder; groupBy: GroupBy; randomSeed?: string;
}
export const defaultReadingFilters: ReadingFilters = {
  query: '', fandoms: [], publication: [], oneShot: 'allowed', inSeries: false, rating: [], favorites: false,
  relationship: '', characters: '', tags: '', updatedAfter: '', updatedBefore: '', within: '', scope: 'any',
  sort: 'added', groupBy: 'none',
}
export function hasReadingFilters(filters: ReadingFilters) {
  return (Object.keys(defaultReadingFilters) as (keyof ReadingFilters)[]).some(key => !['sort', 'groupBy', 'scope'].includes(key) && JSON.stringify(filters[key]) !== JSON.stringify(defaultReadingFilters[key]))
}
export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()

// OR has lower precedence than space/AND; a leading minus negates one term.
// Quoted terms keep spaces. Backslash escapes the next character, including operators.
export type SearchTerms = { parts: string[]; exclude: boolean }[][]
export function parseSearch(query: string): SearchTerms {
  if (!query.trim()) return []
  const groups: { parts: string[]; exclude: boolean }[][] = [[]]
  let i = 0
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue }
    if (query.slice(i, i + 2) === '||') {
      if (!groups.at(-1)!.length) throw new Error('Add a search term before ||.')
      groups.push([]); i += 2; continue
    }
    let exclude = false, quoted = false, hasContent = false
    const parts = ['']
    if (query[i] === '-') { exclude = true; i++ }
    while (i < query.length) {
      const char = query[i]
      if (char === '\\') {
        if (++i >= query.length) throw new Error('Add a character after the escape \\ symbol.')
        parts[parts.length - 1] += normalize(query[i++]); hasContent = true
      } else if (char === '"') { quoted = !quoted; i++ }
      else if (!quoted && (/\s/.test(char) || query.slice(i, i + 2) === '||')) break
      else { if (char === '*') parts.push(''); else parts[parts.length - 1] += normalize(char); hasContent = true; i++ }
    }
    if (quoted) throw new Error('Close the quotation marks in your search.')
    if (!hasContent) throw new Error('Enter a term after - or inside quotation marks.')
    groups.at(-1)!.push({ parts, exclude })
  }
  if (!groups.at(-1)!.length) throw new Error('Add a search term after ||.')
  return groups
}
export function compileSearch(query: string): (text: string) => boolean {
  const groups = parseSearch(query)
  return text => {
    if (!groups.length) return true
    const value = normalize(text)
    return groups.some(group => group.every(term => matchesParts(value, term.parts) !== term.exclude))
  }
}
// Ordered substring matching implements * without regex backtracking on long summaries.
function matchesParts(value: string, parts: string[]) {
  let cursor = 0
  return parts.every(part => {
    const found = value.indexOf(part, cursor)
    if (found < 0) return false
    cursor = found + part.length
    return true
  })
}
export function tracked(stories: Story[]) { return stories.filter(s => active(s) || ['to_read', 'paused_reading'].includes(s.reading_status)) }
export function hasNewChapter(story: Story) {
  // Notification timestamps alone do not prove chapter availability.
  const next = story.last_read_chapter + 1
  const map = story.work.verified_chapters as Record<string, unknown>
  const notified = story.last_update_notification_at
  return Boolean(notified && (!story.update_dismissed_at || Date.parse(notified) > Date.parse(story.update_dismissed_at)) &&
    story.metadata.published_chapters !== null && story.metadata.published_chapters >= next &&
    typeof map?.[String(next)] === 'string' && /^[1-9]\d*$/.test(map[String(next)] as string))
}
export function inReadingSection(story: Story, section: string) {
  if (section === 'to_read' || section === 'paused_reading' || section === 're_reading') return story.reading_status === section
  const reading = story.reading_status === 'reading' || story.reading_status === 're_reading'
  if (section === 'complete') return reading && story.metadata.publication_status === 'complete'
  if (section === 'in_progress') return reading && story.metadata.publication_status === 'in_progress'
  if (section === 'waiting') return story.reading_status === 'waiting_for_updates'
  if (section === 'new') return hasNewChapter(story)
  return active(story)
}
export function searchText(story: Story, scope: SearchScope) {
  if (scope === 'summary') return story.metadata.summary
  if (scope === 'notes') return story.notes
  return [story.metadata.title, ...story.metadata.authors, ...story.metadata.fandoms, ...story.metadata.ao3_tags, ...tagNames(story.metadata, 'relationship'), ...tagNames(story.metadata, 'character'), ...tagNames(story.metadata, 'freeform'),
    ...story.personalTags, ...(story.metadata.series ?? []), story.metadata.summary, story.notes, story.metadata.rating,
    story.metadata.publication_status, story.reading_status, statuses[story.reading_status],
    publicationStatuses[story.metadata.publication_status].label, isOneShot(story.metadata, story.personalTags) ? 'One-shot' : '',
    story.work.ao3_updated_at ?? '', story.original_url].join('\n')
}
/** Stable seeded order keeps pagination repeatable until a fresh shuffle is selected. */
export function shuffleKey(id: string, seed = '') {
  let hash = 2166136261
  for (const character of `${seed}:${id}`) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 65599) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}
export function filterReading(stories: Story[], filters: ReadingFilters, { authorOnly = false }: { authorOnly?: boolean } = {}) {
  for (const [name, date] of [['From', filters.updatedAfter], ['Through', filters.updatedBefore]]) {
    if (date && !isCalendarDate(date)) throw new Error(`Enter a valid ${name} date (${datePlaceholder()}).`)
  }
  if (filters.updatedAfter && filters.updatedBefore && filters.updatedAfter > filters.updatedBefore) throw new Error('The last-updated start date must be before the end date.')
  const within = compileSearch(filters.within)
  const query = normalize(filters.query.trim())
  const relationships = normalize(filters.relationship).split(',').map(term => term.trim()).filter(Boolean)
  const characters = normalize(filters.characters).split(',').map(term => term.trim()).filter(Boolean)
  const tags = normalize(filters.tags).split(',').map(t => t.trim()).filter(Boolean)
  const after = filters.updatedAfter ? Date.parse(`${filters.updatedAfter}T00:00:00Z`) : null
  const before = filters.updatedBefore ? Date.parse(`${filters.updatedBefore}T00:00:00Z`) + 86400000 : null
  return stories.filter(s => {
    const updated = s.work.ao3_updated_at ? Date.parse(s.work.ao3_updated_at) : null
    return (!query || normalize([...(authorOnly ? [] : [s.metadata.title]), ...s.metadata.authors].join('\n')).includes(query)) &&
      (!filters.fandoms.length || s.metadata.fandoms.some(f => filters.fandoms.includes(f))) &&
      (!filters.publication.length || filters.publication.includes(s.metadata.publication_status)) &&
      (filters.oneShot === 'allowed' || isOneShot(s.metadata, s.personalTags) === (filters.oneShot === 'only')) &&
      (!filters.inSeries || inSeries(s)) &&
      (!filters.rating.length || filters.rating.includes(s.metadata.rating)) && (!filters.favorites || s.is_favorite) &&
      relationships.every(term => tagNames(s.metadata, 'relationship').some(t => normalize(t).includes(term))) &&
      characters.every(term => tagNames(s.metadata, 'character').some(t => normalize(t).includes(term))) &&
      tags.every(term => tagNames(s.metadata, 'freeform').some(t => normalize(t).includes(term))) &&
      (after === null || (updated !== null && updated >= after)) &&
      (before === null || (updated !== null && updated < before)) && within(searchText(s, filters.scope))
  }).sort((a, b) => {
    if (filters.sort === 'random') return shuffleKey(a.id, filters.randomSeed) - shuffleKey(b.id, filters.randomSeed) || a.id.localeCompare(b.id)
    const reverse = filters.sort.endsWith('_reverse')
    const order = filters.sort.replace(/_reverse$/, '')
    const direction = reverse ? -1 : 1
    const alpha = a.metadata.title.localeCompare(b.metadata.title) || a.id.localeCompare(b.id)
    if (order === 'alpha') return direction * a.metadata.title.localeCompare(b.metadata.title) || a.id.localeCompare(b.id)
    if (order === 'added') {
      const added = (story: Story) => { const timestamp = Date.parse(story.created_at); return Number.isFinite(timestamp) ? timestamp : -Infinity }
      const missing = Number(!Number.isFinite(added(a))) - Number(!Number.isFinite(added(b)))
      return missing || direction * (added(b) - added(a)) || alpha
    }
    if (order === 'ready') {
      const ready = (s: Story) => s.metadata.published_chapters === null ? -1 : Math.max(0, s.metadata.published_chapters - s.last_read_chapter)
      const missing = Number(a.metadata.published_chapters === null) - Number(b.metadata.published_chapters === null)
      return missing || direction * (ready(b) - ready(a)) || alpha
    }
    const missing = Number(!a.work.ao3_updated_at) - Number(!b.work.ao3_updated_at)
    return missing || direction * ((b.work.ao3_updated_at ? Date.parse(b.work.ao3_updated_at) : 0) - (a.work.ao3_updated_at ? Date.parse(a.work.ao3_updated_at) : 0)) || alpha
  })
}
type ReadingGroup = [name: string, stories: Story[], key: string]
export function readingGroups(stories: Story[], group: GroupBy): ReadingGroup[] {
  if (group === 'none') return [['', stories, '']]
  const groups = new Map<string, { name: string; stories: Story[] }>()
  for (const story of stories) {
    let keys: [string, string][]
    if (group === 'series') {
      const memberships = seriesMemberships(story)
      // Series cards are search documents whose own identity is already in the ID.
      if (/^series:[1-9]\d*$/.test(story.id)) keys = [[story.id, story.metadata.title]]
      else keys = [
        ...memberships.map(series => [`series:${series.id}`, series.name] as [string, string]),
        ...(story.metadata.series ?? []).filter(name => !memberships.some(series => series.name === name)).map(name => [`series-name:${name}`, name] as [string, string]),
      ]
    } else keys = (group === 'fandom' ? story.metadata.fandoms : story.metadata.authors).map(name => [name, name])
    if (!keys.length) {
      const name = group === 'series' ? 'No series information saved' : `Unknown ${group}`
      keys = [[group === 'series' ? 'missing-series' : name, name]]
    }
    for (const [key, name] of new Map(keys)) {
      const entry = groups.get(key) ?? { name, stories: [] }
      entry.stories.push(story); groups.set(key, entry)
    }
  }
  const nameCounts = new Map<string, number>()
  for (const { name } of groups.values()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  return [...groups].sort(([a, left], [b, right]) => left.name.localeCompare(right.name) || a.localeCompare(b)).map(([key, entry]) => [
    (nameCounts.get(entry.name) ?? 0) > 1 && key.startsWith('series:') ? `${entry.name} (AO3 series ${key.slice(7)})` : entry.name,
    entry.stories, key,
  ])
}
