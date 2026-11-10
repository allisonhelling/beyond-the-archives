import { beforeEach, afterEach, vi, expect, it } from 'vitest'
import { changeTagMode, convertTagExpression, matchesTagExpression, normalizeTagExpressions, tagExpression, withTagExpression, type TagExpression } from './tag-expressions'
import { defaultReadingFilters, filterReading } from '../reading-search'
import { blankMetadata, type Story } from '../model'
import { readBrowsing, writeBrowsing } from '../browsing/browsing'
import { readFilterDefaults, saveFilterDefaults } from '../browsing/filter-defaults'
import { readingFilterLabels, removeReadingFilter, readingFilterTags } from '../reading-filter-labels'
beforeEach(() => { const storage = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key,value) }) })
afterEach(() => vi.unstubAllGlobals())
const custom: TagExpression = { mode: 'custom', groups: [['A','B'],['C']] }
it('converts the current selection in stable order and preserves equivalent Any/All to Custom results', () => {
 for (const mode of ['any','all'] as const) {
  const original = { mode, tags: ['A','B'] }, converted = convertTagExpression(original,'custom')
  expect(converted).toEqual({ mode:'custom', groups: mode === 'any' ? [['A'],['B']] : [['A','B']] })
  for (const tags of [[],['A'],['B'],['A','B'],['C']]) expect(matchesTagExpression(original,tag=>tags.includes(tag))).toBe(matchesTagExpression(converted,tag=>tags.includes(tag)))
 }
 expect(convertTagExpression(custom,'any')).toEqual({ mode:'any',tags:['A','B','C'] })
 expect(convertTagExpression({ mode:'custom',groups:[['B','A'],['B','C']] },'all')).toEqual({mode:'all',tags:['B','A','C']})
 expect(convertTagExpression({mode:'all',tags:[]},'custom')).toEqual({mode:'custom',groups:[]})
})
it('restores Custom across mode comparisons only while the selection remains unedited', () => {
 const any = changeTagMode(custom,'any'), all = changeTagMode(any.expression,'all',any.snapshot)
 expect(changeTagMode(all.expression,'custom',all.snapshot).expression).toEqual(custom)
 // Editors explicitly discard the snapshot on *every* selection edit, including a reversed edit.
 expect(changeTagMode(any.expression,'custom').expression).toEqual({mode:'custom',groups:[['A'],['B'],['C']]})
 expect(changeTagMode(all.expression,'custom').expression).toEqual({mode:'custom',groups:[['A','B','C']]})
 expect(changeTagMode({mode:'any',tags:['D']},'custom',any.snapshot).expression).toEqual({mode:'custom',groups:[['D']]})
})
it('normalizes malformed values, duplicate identities and empty clauses without creating match-all branches', () => {
 expect(normalizeTagExpressions({fandoms:{mode:'custom',groups:[[],[' A ','a',null],null,['C']]},characters:{mode:'oops'},tags:5})).toEqual({fandoms:{mode:'custom',groups:[['A'],['C']]}})
 expect(matchesTagExpression({mode:'custom',groups:[[],['A']]},()=>false)).toBe(false)
 expect(matchesTagExpression({mode:'custom',groups:[[]]},()=>false)).toBe(true)
 expect(tagExpression(defaultReadingFilters,'fandoms').mode).toBe('any')
 expect(tagExpression(defaultReadingFilters,'tags').mode).toBe('all')
})
it('round-trips active expressions through URLs/defaults without transient restoration data', () => {
 const filters = withTagExpression(defaultReadingFilters,'fandoms',custom)
 expect(readBrowsing(writeBrowsing(new URLSearchParams(),filters,50)).filters).toEqual(filters)
 saveFilterDefaults(filters)
 expect(readFilterDefaults('library:all')).toEqual(filters)
 expect(readBrowsing(new URLSearchParams({tagExpressions:'{"fandoms":{"mode":"invalid"}}'})).filters.tagExpressions).toEqual({})
 expect(readBrowsing(new URLSearchParams({fandoms:'["A","B"]',relationship:'A/B, C/D'})).filters).toMatchObject({fandoms:['A','B'],relationship:'A/B, C/D'})
 expect(JSON.stringify(filters)).not.toContain('snapshot')
})
it('shares expression matching and mode-aware applied removal across all categories, with category AND composition', () => {
 const stories = [['A'],['A','B'],['C']].map((fandoms,index)=>({id:String(index),metadata:{...blankMetadata,fandoms,character_tags:['Hero'],additional_tags:['Fluff']},work:{},personalTags:[],notes:'',reading_status:'reading'} as unknown as Story))
 const filters = withTagExpression(defaultReadingFilters,'fandoms',custom)
 expect(filterReading(stories,filters).map(s=>s.id)).toEqual(['1','2'])
 expect(filterReading(stories,withTagExpression(filters,'characters',{mode:'custom',groups:[['Hero','Villain'],['Absent']]}))).toEqual([])
 expect(readingFilterLabels(filters)[0]).toContain('Custom · 2 Groups')
 expect(filterReading(stories,removeReadingFilter(filters,readingFilterTags(filters)[0]))).toHaveLength(3)
})
it('lets explicit legacy URL selections replace newer saved default expressions',()=>{
 const defaults=withTagExpression(defaultReadingFilters,'fandoms',custom)
 const filters=readBrowsing(new URLSearchParams({fandoms:'["D"]'}),defaults).filters
 expect(tagExpression(filters,'fandoms')).toEqual({mode:'any',tags:['D']})
})
it('lets legacy saved defaults replace current expressions and keeps empty mode changes inactive',async()=>{
 const current=withTagExpression(defaultReadingFilters,'fandoms',custom)
 saveFilterDefaults({...defaultReadingFilters,tagExpressions:undefined,fandoms:['Legacy']},'library:all')
 expect(tagExpression(readFilterDefaults('library:all',current),'fandoms')).toEqual({mode:'any',tags:['Legacy']})
 const {hasReadingFilters}=await import('../reading-search')
 expect(hasReadingFilters(withTagExpression(defaultReadingFilters,'fandoms',{mode:'all',tags:[]}))).toBe(false)
})
