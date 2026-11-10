import { expect, it } from 'vitest'
import { defaultReadingFilters } from '../reading-search'
import { filterLibraryItems, seriesSearchStory } from './series-search'
import { librarySeries, type SeriesRecord } from './series'
const metadata = { seriesId:77,normalizedUrl:'https://archiveofourown.org/series/77',title:'Series title',description:'Series description',creators:['Creator'],complete:false,updated:'2026-10-19',works:[
 {workId:101,url:'https://archiveofourown.org/works/101',position:1,title:'First fic',authors:['Author A'],fandoms:['First fandom'],rating:'Mature',summary:'A secret garden',tags:['Slow Burn'],relationshipTags:['A/B'],characterTags:['Character A'],additionalTags:['Slow Burn'],wordCount:100,chapters:'1/1',complete:true},
 {workId:102,url:'https://archiveofourown.org/works/102',position:2,title:'Other fic',authors:['Author B'],fandoms:['Second fandom'],rating:'General Audiences',summary:'A flying ship',tags:['Adventure'],relationshipTags:['C/D'],characterTags:['Character B'],additionalTags:['Adventure'],wordCount:200,chapters:'2/2',complete:true},
] }
const series = librarySeries([], [{ao3_series_id:77,metadata,notes:'Private series reminder',is_favorite:true,reading_status:'finished',collectionIds:['collection'],created_at:'2026-10-19T12:00:00Z'} as unknown as SeriesRecord])
const pool = series.map(seriesSearchStory)
it('searches all preview works, including unsaved fics, using the shared filter toolbar contract', () => {
 for (const patch of [{query:'Other fic'},{query:'Author B'},{fandoms:['Second fandom']},{relationship:'A/B, C/D'},{characters:'Character B'},{tags:'Adventure'},{rating:['Mature','Explicit']},{favorites:true},{within:'garden ship'},{within:'"Other fic"'},{within:'flying',scope:'summary' as const},{within:'reminder',scope:'notes' as const}]) {
  expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,...patch},series)).toEqual(pool)
 }
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,within:'garden -ship'},series)).toEqual([])
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,within:'missing'},series)).toEqual([])
})
it('filters AO3 series completion independently from complete works and finished reading', () => {
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,publication:['in_progress']},series)).toEqual(pool)
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,publication:['complete']},series)).toEqual([])
 expect(pool[0].reading_status).toBe('finished') // A series can be finished without importing its works.
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,oneShot:'only'},series)).toEqual(pool)
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,oneShot:'exclude'},series)).toEqual(pool)
})

it('hides series cards until explicitly enabled without excluding their individual works', () => {
 expect(filterLibraryItems(pool, defaultReadingFilters, series)).toEqual([])
 expect(filterLibraryItems(pool, { ...defaultReadingFilters, showSeries: true, excludeLaterSeries: true }, series)).toEqual(pool)
})
it('applies shared expression modes to merged series categories without unioning members for crossover',()=>{
 for(const expression of [{mode:'all',tags:['First fandom','Second fandom']},{mode:'custom',groups:[['First fandom','Second fandom'],['Absent']]}]) expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,tagExpressions:{fandoms:expression}} as Parameters<typeof filterLibraryItems>[1],series)).toEqual(pool)
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,tagExpressions:{tags:{mode:'all',tags:['Adventure','Missing']}}},series)).toEqual([])
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,tagExpressions:{tags:{mode:'any',tags:['Adventure','Missing']}}},series)).toEqual(pool)
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,crossovers:'only'},series)).toEqual([])
 expect(filterLibraryItems(pool,{...defaultReadingFilters,showSeries:true,crossovers:'exclude'},series)).toEqual(pool)
})
