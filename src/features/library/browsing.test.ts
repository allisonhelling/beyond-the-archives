import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { browsingReturnTo, isFilterNavigation, readBrowsing, writeBrowsing } from './browsing'
import { defaultReadingFilters } from './reading-search'
import { pageSizeKey } from './page-size'
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)})})
it('keeps filter edits distinct from pagination, shelf changes and detail navigation', () => {
 const original = '/library?shelf=all&page=3&personalNotes=false'
 const filtered = '/library?shelf=all&page=1&personalNotes=true'
 expect(isFilterNavigation(original, filtered)).toBe(true)
 expect(isFilterNavigation(filtered, original)).toBe(true)
 expect(isFilterNavigation(original, '/library?shelf=all&page=4&personalNotes=false')).toBe(false)
 expect(isFilterNavigation(original, '/library?shelf=recs&personalNotes=true')).toBe(false)
 expect(isFilterNavigation('/stories/1', filtered)).toBe(false)
 expect(isFilterNavigation(original, filtered + '#work')).toBe(false)
 const filters = { ...defaultReadingFilters, personalRating: ['1', '5', 'unrated'], personalNotes: true, recs: true }
 expect(readBrowsing(writeBrowsing(new URLSearchParams(), filters, 25)).filters).toEqual(filters)
})
afterAll(()=>vi.unstubAllGlobals())
it('uses a saved size only without a valid URL size and canonicalizes malformed page links',()=>{
 localStorage.setItem(pageSizeKey,'100')
 expect(readBrowsing(new URLSearchParams()).size).toBe(100)
 expect(readBrowsing(new URLSearchParams('size=25&page=8'))).toMatchObject({size:25,page:8})
 for(const page of ['0','-1','no','9999999999999'])expect(readBrowsing(new URLSearchParams({page})).page).toBe(1)
})
it('round-trips every filter, grouping, sort, collection and size while resetting pages for edits',()=>{
 const filters={...defaultReadingFilters,query:'A & B',within:'"quoted term" || cafe* -bad',fandoms:['Fandom A','Fandom B'],publication:['complete'] as const,sort:'alpha_reverse' as const,groupBy:'author' as const}
 const next=writeBrowsing(new URLSearchParams('shelf=private-collection&page=8'),{...filters,publication:[...filters.publication]},250)
 expect(next.get('shelf')).toBe('private-collection')
 expect(readBrowsing(next)).toEqual({filters:{...filters,publication:['complete']},page:1,size:250})
 expect(readBrowsing(writeBrowsing(next,{...filters,publication:['complete']},250,4)).page).toBe(4)
})
it('restricts return navigation to internal browsing routes',()=>{
 expect(browsingReturnTo('/reading?shelf=waiting&page=3&size=50')).toContain('page=3')
 expect(browsingReturnTo('/series/77')).toBe('/series/77')
 for(const url of ['//evil.test','https://evil.test','/settings','/stories/1',null])expect(browsingReturnTo(url)).toBe('/library')
})
it('removes temporary page-size overrides from links so reload uses the saved default',()=>{
 localStorage.setItem(pageSizeKey,'100')
 const next=writeBrowsing(new URLSearchParams('shelf=favorites&size=25&page=3'),defaultReadingFilters,undefined,2)
 expect(next.has('size')).toBe(false)
 expect(readBrowsing(next)).toMatchObject({size:100,page:2})
 expect(next.get('shelf')).toBe('favorites')
})

it('retains a random seed in browsing links without changing its ordering between pages',()=>{
 const filters={...defaultReadingFilters,sort:'random' as const,randomSeed:'chosen-shuffle'}
 const params=writeBrowsing(new URLSearchParams(),filters,25,2)
 expect(readBrowsing(params)).toEqual({filters,page:2,size:25})
 expect(readBrowsing(writeBrowsing(params,filters,25,3)).filters).toEqual(filters)
})
