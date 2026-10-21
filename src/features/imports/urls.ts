/** A normalized URL is a candidate, never evidence that a destination exists. */
export type WorkIdentity = { workId: number; chapterId: string | null; original: string; normalizedUrl: string }
export function parseWorkUrl(original: string): WorkIdentity {
  const value = original.trim()
  const match = value.match(/^https?:\/\/(?:www\.)?archiveofourown\.org\/(?:collections\/[^/?#\s]+\/)?works\/([1-9]\d*)(?:\/chapters\/([1-9]\d*))?\/?(?:[?#][^\s]*)?$/)
  if (!match || !Number.isSafeInteger(Number(match[1])) || (match[2] && !Number.isSafeInteger(Number(match[2])))) throw new Error('Enter a supported AO3 work URL with valid work and chapter identifiers, such as https://archiveofourown.org/works/123.')
  return { workId: Number(match[1]), chapterId: match[2] ?? null, original, normalizedUrl: `https://archiveofourown.org/works/${match[1]}` }
}
export type SeriesIdentity = { seriesId: number; normalizedUrl: string }
export type SeriesPreview = SeriesIdentity & { basic?: boolean; fetchedAt?: string; title: string; description: string; complete?: boolean | null; creators?: string[]; creatorLinks?: Record<string, string>; begun?: string; updated?: string; creatorNotes?: string; wordCount?: number | null; workCount?: number | null; works: { workId: number; url: string; position: number | null; title: string; authors: string[]; fandoms?: string[]; rating?: string; relationshipTags?: string[]; characterTags?: string[]; additionalTags?: string[]; updated?: string; summary: string; tags: string[]; wordCount: number | null; chapters: string; complete: boolean | null }[] }
export function parseSeriesUrl(original: string): SeriesIdentity {
  const match = original.trim().match(/^https?:\/\/(?:www\.)?archiveofourown\.org\/series\/([1-9]\d*)\/?(?:[?#][^\s]*)?$/)
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error('Enter a valid AO3 series URL.')
  return { seriesId: Number(match[1]), normalizedUrl: `https://archiveofourown.org/series/${match[1]}` }
}
export function classifyUrl(original: string): { kind: 'valid'; identity: WorkIdentity } | { kind: 'series'; identity: SeriesIdentity } | { kind: 'unrelated' | 'invalid' | 'unsupported'; message: string } {
  let host = ''
  try { host = new URL(original.trim()).hostname } catch { /* The AO3-looking malformed case below is tracked. */ }
  if (!['archiveofourown.org', 'www.archiveofourown.org'].includes(host) && !/^https?:\/\/(?:www\.)?archiveofourown\.org(?:[/:?#]|$)/.test(original.trim())) return { kind: 'unrelated', message: 'Unrelated URL ignored.' }
  try { return { kind: 'series', identity: parseSeriesUrl(original) } } catch { /* Try a work identity next. */ }
  try { return { kind: 'valid', identity: parseWorkUrl(original) } }
  catch { return { kind: original.includes('/works/') ? 'invalid' : 'unsupported', message: 'A valid AO3 work URL is required; standalone chapter, user and other pages are unsupported.' } }
}
export function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/g)].map(match => ['valid', 'series'].includes(classifyUrl(match[0]).kind) ? match[0] : match[0].replace(/[.,;!)}\]]+$/, ''))
}
export function groupWorks(urls: string[]) {
  const groups = new Map<number, WorkIdentity[]>()
  for (const url of urls) { const result = classifyUrl(url); if (result.kind !== 'valid') continue; const list = groups.get(result.identity.workId) ?? []; list.push(result.identity); groups.set(result.identity.workId, list) }
  return groups
}

/** Keep direct chapter links intact; add each expanded work only once. */
export function selectedImportText(text: string, selected: SeriesPreview['works']): string {
  const urls = extractUrls(text).filter(url => classifyUrl(url).kind !== 'series')
  const existing = groupWorks(urls)
  for (const work of selected) if (!existing.has(work.workId)) {
    urls.push(work.url)
    existing.set(work.workId, [])
  }
  return urls.join('\n')
}

/** A batch is finished only after both URL processing and metadata retrieval. */
export function importFinished(history: { items: { status: string; metadata_status?: string | null }[]; jobs?: { status: string }[]; summary?: { total: number; active: boolean } }) {
 if (history.summary) return history.summary.total > 0 && !history.summary.active
 const active = ['pending', 'processing']
 return history.items.length > 0 && !history.items.some(item => active.includes(item.status) || active.includes(item.metadata_status ?? '')) && !(history.jobs ?? []).some(job => active.includes(job.status))
}
