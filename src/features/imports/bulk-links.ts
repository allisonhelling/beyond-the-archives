import { classifyUrl } from './urls.ts'
import { mappingMatches, sourcePage, type MappingRule } from './site-mapping.ts'
import { isFanFictionStoryUrl } from './site-adapters.ts'

export const bulkModes = { recognized: 'Recognized Story Links Only', candidates: 'All Links as Candidates' } as const
export type BulkMode = keyof typeof bulkModes
export type BulkLink = { url: string; candidate?: string; kind: 'ao3' | 'series' | 'recognized' | 'candidate' | 'duplicate' | 'unsafe' | 'unsupported' }

export function previewBulkLinks(values: string[], rules: MappingRule[]): BulkLink[] {
 const seen = new Set<string>()
 const rulesByOrigin = new Map<string, MappingRule[]>()
 for (const rule of rules) {
  if (rule.scope === 'site') continue
  const origin = new URL(rule.example).origin
  const group = rulesByOrigin.get(origin) ?? []
  group.push(rule)
  rulesByOrigin.set(origin, group)
 }
 return values.map(value => {
  const url = value.trim()
  const known = classifyUrl(url)
  const source = sourcePage(url)
  const key = known.kind === 'valid' ? `ao3:${known.identity.workId}` : known.kind === 'series' ? known.identity.normalizedUrl : source
  if (!key) return { url, kind: known.kind === 'unsupported' ? 'unsupported' : 'unsafe' }
  if (seen.has(key)) return { url, kind: 'duplicate' }
  seen.add(key)
  if (known.kind === 'valid') return { url, kind: 'ao3' }
  if (known.kind === 'series') return { url, kind: 'series' }
  const page = new URL(source!)
  const recognized = isFanFictionStoryUrl(page) || rulesByOrigin.get(page.origin)?.some(rule => mappingMatches(rule, source!))
  return { url, candidate: source!, kind: recognized ? 'recognized' : 'candidate' }
 })
}

export function discoverPastedLinks(text: string) {
 return text.split(/\s+/u).map(value => value.trim()).filter(Boolean)
}

export function eligibleBulkLink(link: BulkLink, mode: BulkMode) {
 return link.kind === 'ao3' || link.kind === 'series' || link.kind === 'recognized' || mode === 'candidates' && link.kind === 'candidate'
}
