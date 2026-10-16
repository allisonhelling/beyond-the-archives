import { active, statuses, tagNames, type Story } from './model'

export type SortOrder = 'updated' | 'ready' | 'alpha'
export type GroupBy = 'none' | 'fandom' | 'author' | 'series'
export type SearchScope = 'any' | 'summary' | 'notes'
export type ReadingFilters = {
  query: string; fandoms: string[]; publication: string;
  rating: string; favorites: boolean; relationship: string; characters: string; tags: string;
  updatedAfter: string; updatedBefore: string; within: string; scope: SearchScope;
  sort: SortOrder; groupBy: GroupBy;
}
export const defaultReadingFilters: ReadingFilters = {
  query: '', fandoms: [], publication: 'all', rating: '', favorites: false,
  relationship: '', characters: '', tags: '', updatedAfter: '', updatedBefore: '', within: '', scope: 'any',
  sort: 'updated', groupBy: 'none',
}
export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()

// OR has lower precedence than space/AND; a leading minus negates one term.
// Quoted terms keep spaces. Backslash escapes the next character, including operators.
export function compileSearch(query: string): (text: string) => boolean {
  if (!query.trim()) return () => true
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
  return text => {
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
export function tracked(stories: Story[]) { return stories.filter(s => active(s) || s.reading_status === 'to_read') }
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
  if (section === 'to_read') return story.reading_status === 'to_read'
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
    story.metadata.publication_status === 'complete' ? 'Complete on AO3' : story.metadata.publication_status === 'in_progress' ? 'In progress' : 'Unknown',
    story.work.ao3_updated_at ?? '', story.original_url].join('\n')
}
export function filterReading(stories: Story[], filters: ReadingFilters) {
  const within = compileSearch(filters.within)
  const query = normalize(filters.query.trim())
  const relationships = normalize(filters.relationship).split(',').map(term => term.trim()).filter(Boolean)
  const characters = normalize(filters.characters).split(',').map(term => term.trim()).filter(Boolean)
  const tags = normalize(filters.tags).split(',').map(t => t.trim()).filter(Boolean)
  const after = filters.updatedAfter ? Date.parse(`${filters.updatedAfter}T00:00:00Z`) : null
  const before = filters.updatedBefore ? Date.parse(`${filters.updatedBefore}T00:00:00Z`) + 86400000 : null
  return stories.filter(s => {
    const updated = s.work.ao3_updated_at ? Date.parse(s.work.ao3_updated_at) : null
    return (!query || normalize([s.metadata.title, ...s.metadata.authors].join('\n')).includes(query)) &&
      (!filters.fandoms.length || s.metadata.fandoms.some(f => filters.fandoms.includes(f))) &&
      (filters.publication === 'all' || s.metadata.publication_status === filters.publication) &&
      (!filters.rating || s.metadata.rating === filters.rating) && (!filters.favorites || s.is_favorite) &&
      relationships.every(term => tagNames(s.metadata, 'relationship').some(t => normalize(t).includes(term))) &&
      characters.every(term => tagNames(s.metadata, 'character').some(t => normalize(t).includes(term))) &&
      tags.every(term => tagNames(s.metadata, 'freeform').some(t => normalize(t).includes(term))) &&
      (after === null || (updated !== null && updated >= after)) &&
      (before === null || (updated !== null && updated < before)) && within(searchText(s, filters.scope))
  }).sort((a, b) => {
    const alpha = a.metadata.title.localeCompare(b.metadata.title)
    if (filters.sort === 'alpha') return alpha
    if (filters.sort === 'ready') {
      const ready = (s: Story) => s.metadata.published_chapters === null ? -1 : Math.max(0, s.metadata.published_chapters - s.last_read_chapter)
      return ready(b) - ready(a) || alpha
    }
    return (b.work.ao3_updated_at ? Date.parse(b.work.ao3_updated_at) : 0) - (a.work.ao3_updated_at ? Date.parse(a.work.ao3_updated_at) : 0) || alpha
  })
}
export function readingGroups(stories: Story[], group: GroupBy) {
  if (group === 'none') return [['', stories]] as [string, Story[]][]
  const groups = new Map<string, Story[]>()
  for (const story of stories) {
    const keys = group === 'fandom' ? story.metadata.fandoms : group === 'author' ? story.metadata.authors : (story.metadata.series ?? [])
    for (const key of new Set(keys.length ? keys : [group === 'series' ? 'No series information saved' : `Unknown ${group}`])) {
      groups.set(key, [...(groups.get(key) ?? []), story])
    }
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}
