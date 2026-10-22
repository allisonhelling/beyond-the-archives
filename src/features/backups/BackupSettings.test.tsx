import { Blob as NodeBlob } from 'node:buffer'
import { CompressionStream as NodeCompressionStream } from 'node:stream/web'
import { gunzipSync } from 'node:zlib'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BackupSettings } from './BackupSettings'
import { backupBucket, browserPreferenceKeys, exportBackup, saveBackup, listSavedBackups, downloadSavedBackup, deleteSavedBackup, type SavedBackup } from './repository'

const mock = vi.hoisted(() => ({ rpc: vi.fn(), sample: false, invoke: vi.fn(), from: vi.fn(), upload: vi.fn(), list: vi.fn(), download: vi.fn(), remove: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mock.rpc, functions: { invoke: mock.invoke }, storage: { from: mock.from } } }))
vi.mock('../../lib/sample-mode', () => ({ get sampleMode() { return mock.sample } }))

beforeEach(() => {
  vi.clearAllMocks(); mock.sample = false
  mock.invoke.mockResolvedValue({ data: { backups: [] }, error: null })
  mock.from.mockReturnValue({ upload: mock.upload, list: mock.list, download: mock.download, remove: mock.remove })
  mock.list.mockResolvedValue({ data: [], error: null })
  mock.upload.mockResolvedValue({ data: {}, error: null })
  mock.remove.mockResolvedValue({ data: [], error: null })
  mock.rpc.mockResolvedValue({ data: { format: 'between-chapters-backup', version: 1, user_id: 'reader', exported_at: '2026-10-21T12:00:00Z', tables: {} }, error: null })
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('downloads the complete server snapshot with browser preferences and excludes local credentials', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('Blob', NodeBlob)
  const data = { format: 'between-chapters-backup', version: 1, user_id: 'reader', exported_at: '2026-10-21T12:00:00Z', tables: { library_entries: Array.from({ length: 10000 }, (_, id) => ({ id })) } }
  mock.rpc.mockResolvedValue({ data, error: null })
  localStorage.setItem(browserPreferenceKeys[0], 'DMY')
  localStorage.setItem('sb-project-auth-token', 'secret-token')
  let blob: Blob | undefined
  const create = vi.fn((value: Blob) => { blob = value; return 'blob:backup' })
  const revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await exportBackup()
  expect(mock.rpc).toHaveBeenCalledWith('export_library_backup')
  expect(click).toHaveBeenCalledOnce()
  const content = await blob!.text()
  expect(JSON.parse(content).tables.library_entries).toHaveLength(10000)
  expect(JSON.parse(content).browser_preferences[browserPreferenceKeys[0]]).toBe('DMY')
  expect(content).not.toContain('secret-token')
  expect(document.querySelector('a[download]')).toBeNull()
  vi.advanceTimersByTime(60_000)
  expect(revoke).toHaveBeenCalledWith('blob:backup')
})

it('prevents duplicate requests, reports failure, and allows retry', async () => {
  let finish: (value: unknown) => void = () => {}
  mock.rpc.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(<BackupSettings />)
  await screen.findByText('No saved backups yet.')
  fireEvent.click(screen.getByRole('button', { name: 'Export Backup' }))
  expect(screen.getByRole('button', { name: 'Preparing backup…' })).toBeDisabled()
  expect(mock.rpc).toHaveBeenCalledOnce()
  finish({ data: null, error: { message: 'sensitive internals' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete')
  expect(screen.queryByText('sensitive internals')).toBeNull()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export Backup' })).toBeEnabled())
})

it('disables export and Supabase backups in sample mode', () => {
  mock.sample = true
  render(<BackupSettings />)
  expect(screen.getByRole('button', { name: 'Export Backup' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Save Backup to Supabase' })).toBeDisabled()
  expect(mock.list).not.toHaveBeenCalled()
})

it('stores all 10,000 entries and browser preferences as an immutable compressed object in the account folder', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', NodeCompressionStream)
  const data = { format: 'between-chapters-backup', version: 1, user_id: 'reader', exported_at: '2026-10-21T12:00:00Z', tables: { library_entries: Array.from({ length: 10000 }, (_, id) => ({ id, notes: `Notes ${id}`, summary: 'A summary. '.repeat(100) })) } }
  mock.rpc.mockResolvedValue({ data, error: null })
  localStorage.setItem(browserPreferenceKeys[0], 'YMD')
  localStorage.setItem('sb-project-auth-token', 'secret-token')
  await saveBackup()
  const [endpoint, options] = mock.invoke.mock.calls[0]
  expect(endpoint).toBe('save-backup')
  expect(options.method).toBe('POST')
  expect(options.headers).toEqual({ 'Content-Type': 'application/gzip' })
  expect(mock.upload).not.toHaveBeenCalled()
  const content = options.body as Blob
  const json = gunzipSync(Buffer.from(await content.arrayBuffer())).toString()
  expect(JSON.parse(json).tables.library_entries).toEqual(data.tables.library_entries)
  expect(JSON.parse(json).browser_preferences[browserPreferenceKeys[0]]).toBe('YMD')
  expect(json).not.toContain('secret-token')
  expect(content.size).toBeLessThan(json.length)
})

it('supports uncompressed storage when browser compression is unavailable and does not report failed uploads as saved', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', undefined)
  await saveBackup()
  expect(mock.invoke.mock.calls[0][1].headers['Content-Type']).toBe('application/json')
  mock.invoke.mockResolvedValue({ error: { message: 'sensitive internals' } })
  await expect(saveBackup()).rejects.toThrow('Could not access')
})

it('lists retained backend copies, downloads exact stored bytes, and deletes only the selected file', async () => {
  const selected: SavedBackup = { path: 'reader/backup.json.gz', name: 'backup.json.gz', createdAt: '2026-10-21T12:00:00Z', size: 123 }
  mock.invoke.mockResolvedValue({ data: { backups: [selected] }, error: null })
  expect(await listSavedBackups()).toEqual([selected])
  expect(mock.invoke).toHaveBeenCalledWith('save-backup', { method: 'GET' })
  const content = new NodeBlob(['gzip bytes'])
  mock.download.mockResolvedValue({ data: content, error: null })
  const create = vi.fn().mockReturnValue('blob:download')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.useFakeTimers()
  await downloadSavedBackup(selected)
  expect(mock.from).toHaveBeenCalledWith(backupBucket)
  expect(create).toHaveBeenCalledWith(content)
  await deleteSavedBackup(selected)
  expect(mock.remove).toHaveBeenCalledWith(['reader/backup.json.gz'])
  vi.runOnlyPendingTimers()
})

it('refreshes after saving and requires confirmation before deleting a backup', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', undefined)
  const file: SavedBackup = { path: 'reader/backup.json', name: 'backup.json', createdAt: '2026-10-21T12:00:00Z', size: 1024 }
  render(<BackupSettings />)
  await screen.findByText('No saved backups yet.')
  mock.invoke.mockImplementation(async (_name, options) => ({ data: { backups: options.method === 'GET' ? [file] : [] }, error: null }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Backup to Supabase' }))
  expect(await screen.findByText('Your backup was saved privately in Supabase.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Delete backup from/ }))
  expect(mock.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Backup' }))
  await waitFor(() => expect(mock.remove).toHaveBeenCalledWith(['reader/backup.json']))
  expect(await screen.findByText('No saved backups yet.')).toBeInTheDocument()
})

it('fails safely for signed-out listing and failed downloads/deletions', async () => {
  const backup: SavedBackup = { name: 'backup.json', path: 'reader/backup.json', createdAt: '', size: 0 }
  mock.invoke.mockResolvedValue({ error: { context: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) } })
  await expect(listSavedBackups()).rejects.toThrow('Sign in')
  expect(mock.list).not.toHaveBeenCalled()
  mock.download.mockResolvedValue({ data: null, error: { message: 'failure' } })
  await expect(downloadSavedBackup(backup)).rejects.toThrow('Could not download')
  mock.remove.mockResolvedValue({ error: { message: 'failure' } })
  await expect(deleteSavedBackup(backup)).rejects.toThrow('Could not delete')
})


it('shows backend rate-limit and cleanup messages while local downloads bypass the saved-backup service', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', undefined)
  for (const [code, expected] of [['rate_limited','one backup per minute'],['cleanup_pending','older-copy cleanup']]) {
    mock.invoke.mockResolvedValue({ error: { context: new Response(JSON.stringify({ error: code }), { status: 429 }) } })
    await expect(saveBackup()).rejects.toThrow(expected)
  }
  const before = mock.invoke.mock.calls.length
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:local'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(() => {})
  vi.useFakeTimers()
  await exportBackup()
  expect(mock.invoke.mock.calls).toHaveLength(before)
  vi.runOnlyPendingTimers()
})
