import { expect, it } from 'vitest'
import { tagAliasIndex, tagMatches, tagSuggestionGroups, type TagResolution } from './tag-resolution'
import { matchesTagExpression } from './tag-expressions'
const record=(name:string,status:TagResolution['status'],canonical_name:string|null,category:TagResolution['category']='character'):TagResolution=>({name,status,canonical_name,category,checked_at:'2026-10-26',attempted_at:'2026-10-26'})
const records=[record('Alya Césaire','canonical','Alya Césaire'),record('Alya (Miraculous Ladybug)','synonym','Alya Césaire'),record('Alya Césaire (Miraculous Ladybug)','synonym','Alya Césaire'),record('Custom Alya','custom',null)]
it('shows the canonical first and retains raw custom/unverified tags without assuming their meaning',()=>{
 const names=records.map(r=>r.name)
 expect(tagSuggestionGroups(names,'alya',records,'character')).toEqual([{label:'Standard Tags',values:['Alya Césaire']},{label:'Other / Unverified Tags',values:['Custom Alya']}])
 expect(tagSuggestionGroups(['Alya (Miraculous Ladybug)'],'miraculous',records,'character')).toEqual([{label:'Standard Tags',values:['Alya Césaire']}])
 expect(tagSuggestionGroups(names,'alya',[],'character')).toEqual([{label:'Other / Unverified Tags',values:names}])
})
it('deduplicates suggestions across repeated spellings and keeps verification category-specific',()=>{
 const names=['Alya Césaire','ALYA CESAIRE','Alya (Miraculous Ladybug)','Custom Alya','custom alya','Custom Alya']
 expect(tagSuggestionGroups(names,'alya',records,'character')).toEqual([{label:'Standard Tags',values:['Alya Césaire']},{label:'Other / Unverified Tags',values:['Custom Alya']}])
 expect(tagSuggestionGroups(['Alya (Miraculous Ladybug)'],'alya',records,'freeform')).toEqual([{label:'Other / Unverified Tags',values:['Alya (Miraculous Ladybug)']}])
})
it('matches only verified synonyms for a canonical selection and preserves partial/raw searching and category boundaries',()=>{
 const aliases=tagAliasIndex(records)
 expect(tagMatches(['Alya (Miraculous Ladybug)'],'alya cesaire','character',aliases,'ao3')).toBe(true)
 expect(tagMatches(['Protective Alya Césaire'],'alya cesaire','character',aliases,'ao3')).toBe(false)
 expect(tagMatches(['Alya (Miraculous Ladybug)'],'alya cesaire','relationship',aliases,'ao3')).toBe(false)
 expect(tagMatches(['Protective Alya Césaire'],'alya','character',aliases,'ao3')).toBe(true)
 expect(tagMatches(['Custom Alya'],'custom alya','character',aliases,'ao3')).toBe(true)
})
it('requires a category-correct verified canonical root, preserving raw fallback and foreign authority isolation',()=>{
 const incomplete=tagAliasIndex([records[1]])
 expect(tagMatches([records[1].name],'alya cesaire','character',incomplete,'ao3')).toBe(false)
 expect(tagMatches(['Protective Alya Césaire'],'alya cesaire','character',incomplete,'ao3')).toBe(true)
 const wrongRoot=tagAliasIndex([records[1],record('Alya Césaire','canonical','Alya Césaire','relationship')])
 expect(tagMatches([records[1].name],'alya cesaire','character',wrongRoot,'ao3')).toBe(false)
 expect(tagMatches([records[1].name],'alya cesaire','character',tagAliasIndex(records),null)).toBe(false)
})

it.each(['ao3', 'fanfiction_net', 'wattpad'] as const)('keeps synthetic %s observations out of another authority’s alias set', platform => {
 // These are source-qualified contract fixtures, not accepted import options.
 const observation = { platform, category: 'character' as const, nativeTagId: 'same-id', rawLabel: records[1].name }
 const authority = observation.platform === 'ao3' ? 'ao3' : null
 const aliases = tagAliasIndex(records)
 const matches = (term: string) => tagMatches([observation.rawLabel], term, observation.category, aliases, authority)
 for (const expression of [
  { mode: 'any' as const, tags: ['alya cesaire'] },
  { mode: 'all' as const, tags: ['alya cesaire'] },
  { mode: 'custom' as const, groups: [['alya cesaire']] },
 ]) expect(matchesTagExpression(expression, matches)).toBe(platform === 'ao3')
 expect(matches('alya')).toBe(true) // Raw matching does not confer verified identity.
 expect(tagMatches(['ALYA CÉSAIRE'], 'alya cesaire', 'character', aliases, null)).toBe(true)
 expect(tagMatches(['Protective Alya Césaire'], 'alya cesaire', 'character', aliases, null)).toBe(true)
})
