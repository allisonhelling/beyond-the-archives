import type { TagResolution } from './tag-resolution'
import { verifiedTags } from './tag-resolution'

export const tagCategories = { fandom: 'Fandom', character: 'Character', relationship: 'Relationship', freeform: 'Additional Tag', unknown: 'Unknown' } as const
export type TagCategory = keyof typeof tagCategories
export const ruleScopes = { story: 'This Story', site_fandom: 'Site and Fandom', site: 'Site', fandom: 'Fandom', global: 'Global' } as const
export type RuleScope = keyof typeof ruleScopes
export type ClassificationRule = {
 id: string; version: number; label: string; scope: RuleScope; category: TagCategory; enabled: boolean
 site: string | null; fandom: string | null; story_id: string | null; priority: number | null
}
export type TagContext = { storyId?: string; site: string; fandoms: string[]; authority?: 'ao3'; relationshipSyntax?: boolean }
export type RawTag = { label: string; sourceCategory: TagCategory | null; position: number | null }
export const defaultRulePriority: Record<RuleScope, number> = { story: 50, site_fandom: 40, site: 30, fandom: 20, global: 10 }
export const classifierVersion = 1

// Exact matching keeps diacritics, punctuation and word boundaries significant.
export function classificationKey(value: string) {
 return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC')
}
const priority = (rule: ClassificationRule) => rule.priority ?? defaultRulePriority[rule.scope]
const byId = (left: ClassificationRule, right: ClassificationRule) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0

export function createTagClassifier(rules: ClassificationRule[], records: TagResolution<'fandom' | 'character' | 'relationship' | 'freeform'>[] = []) {
 const byLabel = new Map<string, ClassificationRule[]>()
 for (const rule of rules) {
  if (!rule.enabled) continue
  const key = classificationKey(rule.label)
  const group = byLabel.get(key) ?? []
  group.push(rule)
  byLabel.set(key, group)
 }
 const canonicalByLabel = new Map<string, typeof records>()
 for (const record of verifiedTags(records)) {
  const group = canonicalByLabel.get(record.name) ?? []
  group.push(record)
  canonicalByLabel.set(record.name, group)
 }
 return (tag: RawTag, context: TagContext) => {
  const fandoms = new Set(context.fandoms.map(classificationKey))
  const applies = (rule: ClassificationRule) => {
   switch (rule.scope) {
    case 'story': return Boolean(context.storyId && rule.story_id === context.storyId)
    case 'site_fandom': return rule.site === context.site && fandoms.has(classificationKey(rule.fandom ?? ''))
    case 'site': return rule.site === context.site
    case 'fandom': return fandoms.has(classificationKey(rule.fandom ?? ''))
    case 'global': return true
   }
  }
  const matches = (byLabel.get(classificationKey(tag.label)) ?? []).filter(applies).sort((left, right) =>
   Number(right.scope === 'story') - Number(left.scope === 'story') || priority(right) - priority(left) || byId(left, right))
  const first = matches[0]
  const winners = first ? matches.filter(rule => (rule.scope === 'story') === (first.scope === 'story') && priority(rule) === priority(first)) : []
  // Multiple fandom contexts can disagree even when their priorities differ.
  const fandomWinners = winners.filter(rule => rule.scope === 'fandom' || rule.scope === 'site_fandom')
  const competing = matches.filter(rule => winners.includes(rule) || fandomWinners.some(winner =>
   rule.scope === winner.scope && classificationKey(rule.fandom ?? '') !== classificationKey(winner.fandom ?? '') && rule.category !== winner.category))
  const canonical = context.site === 'ao3' && context.authority === 'ao3' ? (canonicalByLabel.get(tag.label) ?? []).filter(record => !tag.sourceCategory || tag.sourceCategory === 'unknown' || record.category === tag.sourceCategory) : []
  const declared = tag.sourceCategory === 'unknown' ? null : tag.sourceCategory
  const heuristic = context.relationshipSyntax && /^[^/&\s][^/&]*\s*(?:\/|\s&\s)\s*[^/&\s][^/&]*$/u.test(tag.label) ? 'relationship' : null
  const result = (category: TagCategory, evidence: 'rule' | 'conflict' | 'source' | 'canonical' | 'structure' | 'unknown', explanation: string) => ({
   ...tag, category, evidence, explanation, context, canonical, heuristic, matches, version: classifierVersion,
   needsReview: evidence === 'conflict', sourceDisagrees: Boolean(declared && evidence === 'rule' && declared !== category),
   winningRules: evidence === 'conflict' ? competing : evidence === 'rule' ? winners : [],
  })
  if (new Set(competing.map(rule => rule.category)).size > 1) return result('unknown', 'conflict', 'Needs Review. Applicable rules disagree.')
  if (first) return result(first.category, 'rule', winners.length > 1 ? 'Your highest-priority rules agree.' : `Your saved rule applies to this tag (${ruleScopes[first.scope]}).`)
  if (declared) return result(declared, 'source', 'The source supplied this category.')
  if (canonical.length) {
   if (new Set(canonical.map(record => record.category)).size > 1) return result('unknown', 'conflict', 'Needs Review. Verified AO3 evidence spans multiple categories.')
   return result(canonical[0].category, 'canonical', 'Verified AO3 tag evidence supplies this category.')
  }
  if (heuristic) return result(heuristic, 'structure', 'This source uses relationship separators.')
  return result('unknown', 'unknown', 'There is insufficient category evidence.')
 }
}
