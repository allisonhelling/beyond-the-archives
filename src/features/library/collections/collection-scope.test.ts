import { expect, it } from 'vitest'
import { exampleWork } from '../display/display-examples'
import { collectionStories, distinctCollectionWorks } from './collection-scope'

it('counts distinct EPUB work identities, including standalone books', () => {
 const first = { ...exampleWork, id: 'first' }
 const second = { ...first, id: 'second-version' }
 const standalone = { ...exampleWork, id: 'standalone', work: { ...exampleWork.work, ao3_work_id: null } }
 expect(distinctCollectionWorks([first, second, standalone]).map(work => work.id)).toEqual(['first', 'standalone'])
})
it('uses manual and automatic memberships and retains rereads in Finished', () => {
 const work = { ...exampleWork, reading_status: 're_reading' as const, collectionIds: ['manual'], automaticCollectionIds: ['automatic'] }
 for (const shelf of ['all', 'currently_reading', 'finished', 'manual', 'automatic']) expect(collectionStories([work], shelf)).toEqual([work])
 for (const shelf of ['to_read', 'missing']) expect(collectionStories([work], shelf)).toEqual([])
})
