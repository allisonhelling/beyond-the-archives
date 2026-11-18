import { expect, it } from 'vitest'
import { classificationKey, createTagClassifier, type ClassificationRule, type RawTag, type TagContext } from './classification'
import type { TagResolution } from './tag-resolution'

const tag: RawTag = { label: ' Élan ', sourceCategory: 'freeform', position: 12 }
const context: TagContext = { storyId: 'one', site: 'https://fiction.example', fandoms: ['Alpha', 'Beta'] }
const makeRule = (scope: ClassificationRule['scope'], category: ClassificationRule['category'], patch: Partial<ClassificationRule> = {}): ClassificationRule => ({
 id: scope, version: 1, label: 'E\u0301LAN', scope, category, enabled: true, priority: null,
 site: context.site, fandom: 'Alpha', story_id: context.storyId!, ...patch,
})
const read = (rules: ClassificationRule[], scope = context) => createTagClassifier(rules)(tag, scope)

it('preserves raw evidence and applies every scope in deterministic order', () => {
 const rules = [makeRule('story', 'relationship'), makeRule('site_fandom', 'character'), makeRule('site', 'fandom'), makeRule('fandom', 'freeform'), makeRule('global', 'unknown')]
 for (const [index, rule] of rules.entries()) {
  const result = read(rules.slice(index))
  expect(result).toMatchObject({ ...tag, category: rule.category, evidence: 'rule', winningRules: [rule] })
 }
 expect(read([])).toMatchObject({ ...tag, category: 'freeform', evidence: 'source' })
 expect(classificationKey('Élan')).not.toBe(classificationKey('Elan'))
})
it('applies explicit priorities, ignores disabled rules, and skips mismatched site or story context', () => {
 const site = makeRule('site', 'relationship'), fandom = makeRule('fandom', 'character', { priority: 31 })
 expect(read([site, fandom]).winningRules).toEqual([fandom])
 expect(read([site, { ...fandom, enabled: false }]).winningRules).toEqual([site])
 expect(read([site, makeRule('story', 'fandom')], { ...context, site: 'https://another.example', storyId: 'two' }).evidence).toBe('source')
 expect(read([site, { ...fandom, priority: 30 }])).toMatchObject({ category: 'unknown', needsReview: true })
})
it('reports multi-fandom disagreement without order or edit time as a tie breaker', () => {
 const alpha = makeRule('fandom', 'relationship', { id: 'a', priority: 22 })
 const beta = makeRule('fandom', 'character', { id: 'b', fandom: 'Beta' })
 expect(read([beta, alpha]).winningRules).toEqual([alpha, beta])
 expect(read([alpha, beta])).toMatchObject({ evidence: 'conflict', category: 'unknown' })
 expect(read([alpha, beta, makeRule('site_fandom', 'fandom')]).category).toBe('fandom')
 expect(read([alpha, { ...beta, category: 'relationship' }]).needsReview).toBe(false)
 const site = makeRule('site', 'relationship', { priority: 22 })
 expect(read([alpha, beta, { ...site, id: '0' }]).needsReview).toBe(true)
 expect(read([alpha, beta, { ...site, id: 'z' }]).needsReview).toBe(true)
})
it('gates canonical identities and structural inference by source authority', () => {
 const root: TagResolution = { name: 'Canonical', canonical_name: 'Canonical', category: 'character', status: 'canonical', checked_at: '', attempted_at: '' }
 const synonym = { ...root, status: 'synonym' as const, name: 'Élan' }
 const raw = { label: 'Élan', sourceCategory: null, position: 1 }
 const classify = createTagClassifier([], [root, synonym])
 expect(classify(raw, { ...context, site: 'ao3', authority: 'ao3' })).toMatchObject({ category: 'character', evidence: 'canonical', canonical: [synonym] })
 expect(classify(raw, { ...context, site: 'https://ao3-lookalike.example', authority: 'ao3' })).toMatchObject({ category: 'unknown', canonical: [] })
 expect(createTagClassifier([], [synonym])(raw, { ...context, site: 'ao3', authority: 'ao3' }).category).toBe('unknown')
 expect(classify({ ...raw, label: 'A/B' }, context).category).toBe('unknown')
 expect(classify({ ...raw, label: 'A/B' }, { ...context, relationshipSyntax: true }).category).toBe('relationship')
})
