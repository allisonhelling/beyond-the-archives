import { expect, it } from 'vitest'
import { tagAliasIndex, tagMatches, tagSuggestionGroups, type TagResolution } from './tag-resolution'
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
 expect(tagMatches(['Alya (Miraculous Ladybug)'],'alya cesaire','character',aliases)).toBe(true)
 expect(tagMatches(['Protective Alya Césaire'],'alya cesaire','character',aliases)).toBe(false)
 expect(tagMatches(['Alya (Miraculous Ladybug)'],'alya cesaire','relationship',aliases)).toBe(false)
 expect(tagMatches(['Protective Alya Césaire'],'alya','character',aliases)).toBe(true)
 expect(tagMatches(['Custom Alya'],'custom alya','character',aliases)).toBe(true)
})
it('requires a category-correct verified canonical root, preserving raw fallback and foreign authority isolation',()=>{
 const incomplete=tagAliasIndex([records[1]])
 expect(tagMatches([records[1].name],'alya cesaire','character',incomplete)).toBe(false)
 expect(tagMatches(['Protective Alya Césaire'],'alya cesaire','character',incomplete)).toBe(true)
 const wrongRoot=tagAliasIndex([records[1],record('Alya Césaire','canonical','Alya Césaire','relationship')])
 expect(tagMatches([records[1].name],'alya cesaire','character',wrongRoot)).toBe(false)
 expect(tagMatches([records[1].name],'alya cesaire','character',tagAliasIndex(records),null)).toBe(false)
})
