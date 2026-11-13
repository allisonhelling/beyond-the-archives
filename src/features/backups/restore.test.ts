import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { DecompressionStream as NodeDecompressionStream, TransformStream as NodeTransformStream } from 'node:stream/web'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { backupTables, backupFileLimit } from '../../types/backups'
import { browserPreferenceKeys } from './repository'
import { prepareRestore, readBackup, restoreBackup, type LibraryBackup } from './restore'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), save: vi.fn() }))
vi.mock('./repository', async original => ({ ...await original<typeof import('./repository')>(),
  backupClient: () => ({ rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } }), saveBackup: mocks.save,
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('DecompressionStream', NodeDecompressionStream)
  vi.stubGlobal('TransformStream', NodeTransformStream)
  vi.stubGlobal('Blob', NodeBlob)
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())

function backup() {
  const tables = Object.fromEntries(backupTables.map(table => [table, []])) as unknown as LibraryBackup['tables']
  tables.works = [{ id: 'work', ao3_work_id: 123, title: 'Source title', summary: 'Source summary', automatic_metadata: {}, verified_chapters: { 1: '456' }, is_complete: true, word_count: 1000, published_chapters: 4, total_chapters: 4 }] as unknown as LibraryBackup['tables']['works']
  tables.library_entries = [{ id: 'entry', user_id: 'alice', work_id: 'work', notes: 'Private note', metadata_overrides: { title: 'Manual title' }, extension_metadata: { summary: 'Private browser summary' }, extension_chapters: {} }] as unknown as LibraryBackup['tables']['library_entries']
  tables.authors = [{ id: 'author', name: 'Source author', ao3_url: null }] as LibraryBackup['tables']['authors']
  tables.work_authors = [{ work_id: 'work', author_id: 'author' }]
  return { format: 'between-chapters-backup', version: 1, user_id: 'alice', exported_at: '2026-10-21T12:00:00Z', tables,
    browser_preferences: { [browserPreferenceKeys[0]]: 'DMY', [browserPreferenceKeys[4]]: JSON.stringify({ hiddenCustom: ['old-id'] }), 'sb-auth-token': 'must-not-import' } } satisfies LibraryBackup
}
const preview = { counts: { library_entries: { current: 2, backup: 1 } }, fingerprint: 'fingerprint', exported_at: '2026-10-21T12:00:00Z' }

it('reads JSON and gzip, preserves source metadata privately, and retains separate manual corrections', async () => {
  const original = backup(), json = JSON.stringify(original)
  const plain = await readBackup(new NodeBlob([json]) as unknown as Blob)
  const compressed = await readBackup(new NodeBlob([gzipSync(json)]) as unknown as Blob)
  expect(compressed).toEqual(plain)
  expect(plain.tables.library_entries[0]).toMatchObject({ notes: 'Private note', metadata_overrides: { title: 'Manual title' },
    extension_metadata: { title: 'Source title', summary: 'Private browser summary', authors: ['Source author'], word_count: 1000 }, extension_chapters: { 1: '456' } })
  expect(original.tables.library_entries[0].extension_metadata).toEqual({ summary: 'Private browser summary' })
})

it('rejects invalid, incomplete, incompatible, oversized, and corrupt backups', async () => {
  const invalid = backup(); invalid.version = 99 as 1
  for (const bytes of ['bad JSON', '{}', JSON.stringify(invalid), JSON.stringify({ ...backup(), tables: {} }), new Uint8Array([0x1f, 0x8b, 0])]) {
    await expect(readBackup(new NodeBlob([bytes]) as unknown as Blob)).rejects.toThrow(/backup/i)
  }
  await expect(readBackup({ size: backupFileLimit + 1 } as Blob)).rejects.toThrow('50 MiB')
  await expect(readBackup(new NodeBlob([]) as unknown as Blob)).rejects.toThrow('50 MiB')
})

it('downloads saved copies for validation and never restores during preview', async () => {
  mocks.download.mockResolvedValue({ data: new NodeBlob([JSON.stringify(backup())]), error: null })
  mocks.rpc.mockResolvedValue({ data: preview, error: null })
  const prepared = await prepareRestore({ name: 'saved.json', path: 'alice/saved.json', createdAt: '', size: 1 })
  expect(prepared.preview).toEqual(preview)
  expect(mocks.download).toHaveBeenCalledWith('alice/saved.json')
  expect(mocks.rpc).toHaveBeenCalledWith('preview_library_restore', { p_backup: prepared.backup })
  expect(mocks.save).not.toHaveBeenCalled()
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
  await expect(prepareRestore(new NodeFile([JSON.stringify(backup())], 'backup.json') as unknown as File)).rejects.toThrow('own account')
})

it('requires a saved safety copy before restore and restores only allowlisted browser preferences with remapped IDs', async () => {
  const prepared = { name: 'backup.json', backup: backup(), preview }
  mocks.save.mockRejectedValueOnce(new Error('upload failed'))
  await expect(restoreBackup(prepared)).rejects.toThrow('upload failed')
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.save.mockResolvedValue([{ path: 'alice/safety.json' }])
  mocks.rpc.mockImplementation(async () => {
    expect(mocks.save).toHaveBeenCalledTimes(2)
    return { data: { 'old-id': 'new-id' }, error: null }
  })
  expect(await restoreBackup(prepared)).toContain('were restored')
  expect(mocks.rpc).toHaveBeenCalledWith('restore_own_library_backup', { p_backup: prepared.backup, p_fingerprint: 'fingerprint', p_safety_path: 'alice/safety.json' })
  expect(localStorage.getItem(browserPreferenceKeys[0])).toBe('DMY')
  expect(JSON.parse(localStorage.getItem(browserPreferenceKeys[4])!).hiddenCustom).toEqual(['new-id'])
  expect(localStorage.getItem('sb-auth-token')).toBeNull()
})

it('handles stale previews and distinguishes preference failures after a successful database restore', async () => {
  const prepared = { name: 'backup.json', backup: backup(), preview }
  mocks.save.mockResolvedValue([{ path: 'alice/safety.json' }])
  mocks.rpc.mockResolvedValue({ error: { code: '40001' } })
  await expect(restoreBackup(prepared)).rejects.toThrow('changed after preview')
  expect(localStorage.getItem(browserPreferenceKeys[0])).toBeNull()
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  vi.stubGlobal('localStorage', { setItem() { throw new Error('storage unavailable') } })
  expect(await restoreBackup(prepared)).toContain('library was restored, but')
})
it('accepts version 2 while preserving universal source identity and manual field confirmation times', async () => {
 const data={...backup(),version:2 as const}
 data.tables.works[0].ao3_work_id=null
 data.tables.library_entries[0]={...data.tables.library_entries[0],source_url:'https://fiction.example/story',original_url:'https://fiction.example/story',metadata_confirmation_times:{published_chapters:'2026-11-12T00:00:00Z'}}
 const read=await readBackup(new NodeBlob([JSON.stringify(data)]) as unknown as Blob)
 expect(read.version).toBe(2)
 expect(read.tables.library_entries[0]).toMatchObject({source_url:'https://fiction.example/story',metadata_confirmation_times:{published_chapters:'2026-11-12T00:00:00Z'}})
})
