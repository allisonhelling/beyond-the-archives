import { expect, it } from 'vitest'
import { exampleWork } from '../library/display/display-examples'
import { offlineStories, type CloudReaderBook, type OfflineSnapshot } from './storage'
const book: CloudReaderBook = { id: 'a'.repeat(64), workId: '81234', metadata: { ...exampleWork.metadata, title: 'Saved in Cloud' }, status: 'reading', notes: 'Reader note', completedCount: 2 }
const snapshot: OfflineSnapshot = { userId: 'reader', savedAt: '2026-11-01T12:00:00Z', readers: [], stories: [], cloudBooks: [book] }
it('shows reader cloud works without download reports or organizer entries', () => {
 const stories = offlineStories(snapshot)
 expect(stories).toHaveLength(1)
 expect(stories[0]).toMatchObject({ metadata: { title: 'Saved in Cloud' }, work: { ao3_work_id: 81234 }, last_read_chapter: 2, reading_status: 'reading', notes: 'Reader note' })
})
it('deduplicates versions and keeps organizer metadata when a work is also saved there', () => {
 const linked = { ...exampleWork, work: { ...exampleWork.work, ao3_work_id: 81234 } }
 const result = offlineStories({ ...snapshot, stories: [linked], cloudBooks: [book, { ...book, id: 'b'.repeat(64) }] })
 expect(result).toEqual([linked])
 expect(offlineStories({ ...snapshot, cloudBooks: [book, { ...book, id: 'b'.repeat(64) }] })).toHaveLength(1)
})
it('retains installation-only tiles and excludes unrelated organizer works', () => {
 expect(offlineStories({ ...snapshot, cloudBooks: [], stories: [exampleWork] })).toEqual([])
 expect(offlineStories({ ...snapshot, cloudBooks: [], stories: [exampleWork], readers: [{ id: 'local', name: 'Reader', url: 'https://reader.example/', reportedAt: snapshot.savedAt, works: [String(exampleWork.work.ao3_work_id)] }] })).toEqual([exampleWork])
})

it('keeps cloud books without AO3 identities and reuses the shared manual-link recovery', () => {
 const unlinked={...book,workId:null}
 expect(offlineStories({...snapshot,cloudBooks:[unlinked]})[0]).toMatchObject({metadata:{title:'Saved in Cloud'},work:{ao3_work_id:null}})
 const recovered={...unlinked,metadata:{...unlinked.metadata,manual_url:'https://archiveofourown.org/works/81234'}}
 expect(offlineStories({...snapshot,cloudBooks:[recovered]})[0].work.ao3_work_id).toBe(81234)
})
