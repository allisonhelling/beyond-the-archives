/** A normalized URL is a candidate, never evidence that a destination exists. */
export type WorkIdentity = { workId: number; chapterId: string | null; original: string; normalizedUrl: string }
export function parseWorkUrl(original: string): WorkIdentity {
  const value = original.trim()
  const match = value.match(/^https?:\/\/(?:www\.)?archiveofourown\.org\/(?:collections\/[^/?#\s]+\/)?works\/([1-9]\d*)(?:\/chapters\/([1-9]\d*))?\/?(?:[?#][^\s]*)?$/)
  if (!match || !Number.isSafeInteger(Number(match[1])) || (match[2] && !Number.isSafeInteger(Number(match[2])))) throw new Error('Enter a supported AO3 work URL with valid work and chapter identifiers, such as https://archiveofourown.org/works/123.')
  return { workId: Number(match[1]), chapterId: match[2] ?? null, original, normalizedUrl: `https://archiveofourown.org/works/${match[1]}` }
}
export function classifyUrl(original: string): { kind: 'valid'; identity: WorkIdentity } | { kind: 'unrelated' | 'invalid' | 'unsupported'; message: string } {
  let host = ''
  try { host = new URL(original.trim()).hostname } catch { /* The AO3-looking malformed case below is tracked. */ }
  if (!['archiveofourown.org', 'www.archiveofourown.org'].includes(host) && !/^https?:\/\/(?:www\.)?archiveofourown\.org(?:[/:?#]|$)/.test(original.trim())) return { kind: 'unrelated', message: 'Unrelated URL ignored.' }
  try { return { kind: 'valid', identity: parseWorkUrl(original) } }
  catch { return { kind: original.includes('/works/') ? 'invalid' : 'unsupported', message: 'A valid AO3 work URL is required; standalone chapter, user, series and other pages are unsupported.' } }
}
export function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/g)].map(match => classifyUrl(match[0]).kind === 'valid' ? match[0] : match[0].replace(/[.,;!)}\]]+$/, ''))
}
export function groupWorks(urls: string[]) {
  const groups = new Map<number, WorkIdentity[]>()
  for (const url of urls) { const result = classifyUrl(url); if (result.kind !== 'valid') continue; const list = groups.get(result.identity.workId) ?? []; list.push(result.identity); groups.set(result.identity.workId, list) }
  return groups
}
