import { expect, it } from 'vitest'
import { blankMetadata } from '../features/library/model'
import { readerWorkIdentities } from './reader-work-identities'

it('matches anthology members without treating a bundle as one source work', () => {
  const book = { workId: '999', metadata: { ...blankMetadata, manual_url: 'https://archiveofourown.org/works/888' }, works: [{ workId: '123' }, { workId: '456' }, { workId: null }] }
  expect(readerWorkIdentities(book)).toEqual(['123', '456'])
  expect(readerWorkIdentities({ ...book, works: undefined, workCount: 3, workIds: ['123', '456'] })).toEqual(['123', '456'])
  expect(readerWorkIdentities({ ...book, works: [{ workId: null }, { workId: null }] })).toEqual([])
})
it('retains legacy single-work link recovery and rejects unsafe member IDs', () => {
  expect(readerWorkIdentities({ workId: null, metadata: { ...blankMetadata, calibre_work_link: 'https://archiveofourown.org/works/123' } })).toEqual(['123'])
  expect(readerWorkIdentities({ workId: null, metadata: blankMetadata, workCount: 5, workIds: ['123', '123', '0', '9007199254740992', 'bad'] })).toEqual(['123'])
})
