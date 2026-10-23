import { expect, it } from 'vitest'
import { automaticCollectionRules, automaticCollectionLabels, applyAutomaticCollections } from './automatic-collections'
import { blankMetadata, filterDateText, type Collection, type Story } from '../model'
import { defaultReadingFilters, filterReading } from '../reading-search'
it('searches authors only for automatic collections while retaining library title search', () => {
 const stories = [
  {id:'title',metadata:{...blankMetadata,title:'Renée',authors:['Other author']}},
  {id:'author',metadata:{...blankMetadata,title:'Other title',authors:['Renée']}},
 ].map(story=>({...story,work:{},personalTags:[],collectionIds:[]})) as unknown as Story[]
 const filters={...defaultReadingFilters,query:'renee'}
 const collection={id:'automatic',automatic_rules:automaticCollectionRules(filters)} as unknown as Collection
 expect(filterReading(stories,filters)).toHaveLength(2)
 expect(applyAutomaticCollections(stories,[collection]).filter(story=>story.automaticCollectionIds?.length).map(story=>story.id)).toEqual(['author'])
})
it('uses effective saved filters without changing manual collection memberships', () => {
 const rules = automaticCollectionRules({...defaultReadingFilters,fandoms:['Fandom'],tags:'Found Family',within:'friend*'})
 const collection = {id:'automatic',automatic_rules:rules} as unknown as Collection
 const story = {id:'story',collectionIds:['manual'],personalTags:[],metadata:{...blankMetadata,fandoms:['Fandom'],additional_tags:['Found Family'],summary:'Friendship'},work:{}} as unknown as Story
 expect(applyAutomaticCollections([story],[collection])[0]).toMatchObject({collectionIds:['manual'],automaticCollectionIds:['automatic']})
 expect(applyAutomaticCollections([{...story,metadata:{...story.metadata,additional_tags:[]}}],[collection])[0].automaticCollectionIds).toEqual([])
 expect(story).not.toHaveProperty('automaticCollectionIds')
})
it('validates empty, malformed search and reversed date rules before saving', () => {
 expect(()=>automaticCollectionRules(defaultReadingFilters)).toThrow('at least one filter')
 expect(()=>automaticCollectionRules({...defaultReadingFilters,scope:'summary'})).toThrow('at least one filter')
 expect(()=>automaticCollectionRules({...defaultReadingFilters,within:'"unfinished'})).toThrow('quotation')
 expect(()=>automaticCollectionRules({...defaultReadingFilters,updatedAfter:'2026-10-02',updatedBefore:'2026-10-01'})).toThrow('start date')
})

it('describes the active automatic filters with the same labels used by the library', () => {
 const collection={automatic_rules:automaticCollectionRules({...defaultReadingFilters,query:'Writer',fandoms:['Batman'],rating:['Teen And Up Audiences'],publication:['in_progress'],oneShot:'only',inSeries:true,tags:'Fluff',favorites:true,updatedAfter:'2017-11-11'})} as unknown as Collection
 expect(automaticCollectionLabels(collection)).toEqual(expect.arrayContaining(['Author: Writer','Fandom: Batman','Tags: Fluff','Favorites Only','In a Series Only','One-Shot Only','Publication Status: In Progress on AO3',`Updated From: ${filterDateText('2017-11-11')}`]))
 expect(automaticCollectionLabels({...collection,automatic_rules:automaticCollectionRules({...defaultReadingFilters,oneShot:'exclude'})})).toEqual(['One-Shot Exclude'])
 expect(automaticCollectionLabels({automatic_rules:null})).toEqual([])
})
