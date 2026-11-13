// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
// @ts-expect-error Operator utility is intentionally Node-only JavaScript.
import { parseBackup, restoreBackup } from './restore-backup.mjs'

it('accepts downloaded JSON or gzip backups and rejects corrupt files before restoring', () => {
  const backup = { format: 'between-chapters-backup', version: 1, tables: { library_entries: [{ notes: 'Private notes' }] } }
  const bytes = Buffer.from(JSON.stringify(backup))
  expect(parseBackup(bytes)).toEqual(backup)
  expect(parseBackup(gzipSync(bytes))).toEqual(backup)
  expect(() => parseBackup(Buffer.from([0x1f, 0x8b, 0]))).toThrow()
  expect(() => parseBackup(Buffer.from('invalid JSON'))).toThrow()
})

it('requires an operator secret and explicit target, defaults to refusing replacement, and disables session persistence', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { old: 'new' }, error: null })
  const factory = vi.fn().mockReturnValue({ rpc })
  const sortKey = 'between-chapters:collection-sort:v1'
  const backup = { format: 'between-chapters-backup', version: 1, tables: {}, browser_preferences: { [sortKey]: JSON.stringify({ hiddenCustom: ['old'] }) } }
  const config = { backup, userId: '10000000-0000-0000-0000-000000000001', url: 'http://127.0.0.1:54321', secret: 'operator-only' }
  await expect(restoreBackup({ ...config, userId: '' }, factory)).rejects.toThrow('required')
  expect(factory).not.toHaveBeenCalled()
  const result = await restoreBackup(config, factory, async () => ({url:config.url,secretKey:config.secret}))
  expect(JSON.parse(result.browser_preferences[sortKey]).hiddenCustom).toEqual(['new'])
  expect(factory).toHaveBeenCalledWith(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false } })
  expect(rpc).toHaveBeenCalledWith('restore_library_backup', { p_backup: backup, p_user: config.userId, p_replace: false })
  rpc.mockResolvedValue({ error: { message: 'Target has data' } })
  await expect(restoreBackup({ ...config, replace: true }, factory, async () => ({url:config.url,secretKey:config.secret}))).rejects.toThrow('Check the destination')
})
