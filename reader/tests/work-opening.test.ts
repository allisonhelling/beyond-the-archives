import { beforeAll, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { epubBuffer } from '../../src/test/epub-fixture'
import { importEpub } from '../src/epub'
import { bookDetails, catalogBook } from '../src/model'
import { openingPosition, preferredWorkVersion, requestedWork, workVersions } from '../src/work-opening'
import { anthologyFiles } from './anthology-fixture'
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto }) })
async function book() { const buffer = await epubBuffer(anthologyFiles()); return importEpub({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File) }

it('ranks active downloads before retained downloads and cloud-only versions', async () => {
  const catalog = catalogBook(bookDetails(await book()))
  const versions = [
    { ...catalog, id: 'cloud', hasFile: false },
    { ...catalog, id: 'retained', active: false },
    { ...catalog, id: 'active' },
    { ...catalog, id: 'unrelated', workId: '999', works: undefined },
  ]
  expect(workVersions(versions, '91002').map(book => book.id)).toEqual(['active', 'retained', 'cloud'])
  expect(workVersions(versions, 'retained').map(book => book.id)).toEqual(['retained'])
})
it('selects an active local copy before cloud versions and preserves deliberate version choices', async () => {
 const base = catalogBook(bookDetails(await book()))
 const local = { ...base, id: 'local', hasFile: true, active: true }
 const cloud = { ...base, id: 'cloud', hasFile: false, active: true }
 expect(preferredWorkVersion([cloud, local], undefined, true)).toBe(local)
 expect(preferredWorkVersion([cloud, local], 'cloud', true)).toBe(cloud)
 expect(preferredWorkVersion([cloud, local], 'cloud', false)).toBe(local)
 expect(preferredWorkVersion([cloud], undefined, true)).toBe(cloud)
 expect(preferredWorkVersion([cloud], undefined, false)).toBeUndefined()
 expect(preferredWorkVersion([local, { ...local, id: 'second' }], undefined, true)).toBeUndefined()
})
it('opens the requested fic at its next unread chapter without crossing work boundaries', async () => {
  const imported = await book(), chapters = imported.chapters.filter(chapter => chapter.kind !== 'frontmatter')
  imported.completed = [chapters[0].id]
  expect(openingPosition(imported, { target: '91001' })).toEqual({ chapter: chapters[1].id, fraction: 0 })
  expect(openingPosition(imported, { target: '91002', chapter: 1 })).toEqual({ chapter: chapters[3].id, fraction: 0 })
  expect(openingPosition(imported, { target: '91002', chapter: 99 })).toEqual({ chapter: chapters[3].id, fraction: 0 })
  expect(openingPosition(imported, { target: imported.id, chapter: 4 })).toEqual({ chapter: chapters[3].id, fraction: 0 })
  imported.position = { chapter: chapters[3].id, fraction: .4 }
  expect(openingPosition(imported, { target: '91002' })).toEqual(imported.position)
  expect(openingPosition(imported, { target: imported.id })).toBeUndefined()
})
it('validates inbound work identities and chapter positions', () => {
  expect(requestedWork('?work=91002&chapter=1')).toEqual({ target: '91002', chapter: 1 })
  expect(requestedWork('?work=91002&chapter=-1')).toEqual({ target: '91002' })
  expect(requestedWork('?book=' + 'a'.repeat(64))).toEqual({ target: 'a'.repeat(64) })
  expect(requestedWork('?work=9007199254740992')).toBeUndefined()
  expect(requestedWork('?work=javascript:bad')).toBeUndefined()
})
