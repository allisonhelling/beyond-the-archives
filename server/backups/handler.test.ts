// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { backupHandler, type BackupFile, type BackupDependencies } from './handler'
import { pruneAccountBackups } from './prune'

let files: BackupFile[], events: string[], deps: BackupDependencies
const file = (n: number): BackupFile => ({ path: `alice/backup-${n}.json`, name: `backup-${n}.json`, createdAt: `2026-10-${n.toString().padStart(2,'0')}`, size: 1 })
const request = (method = 'POST', body: BodyInit | null = '{}', headers = {}) => new Request('https://app.test/save-backup', {
 method, ...(method === 'POST' && { body }), headers: { authorization: 'Bearer valid', 'content-type': 'application/json', ...headers },
})
beforeEach(() => {
 files = [file(3),file(2),file(1)]; events = []
 deps = {
  authenticate: vi.fn().mockResolvedValue('alice'), claim: vi.fn().mockResolvedValue({ token: 'lease' }), release: vi.fn().mockResolvedValue(undefined),
  files: vi.fn(async () => files.slice()),
  upload: vi.fn(async path => { events.push('upload'); files.unshift({ ...file(4), path }) }),
  remove: vi.fn(async paths => { events.push('remove'); files = files.filter(item => !paths.includes(item.path)) }),
 }
})

it('uploads successfully before deleting the oldest and retains exactly three newest copies', async () => {
 const response = await backupHandler(deps)(request())
 expect(response.status).toBe(200)
 expect(events).toEqual(['upload','remove'])
 expect(deps.remove).toHaveBeenCalledWith(['alice/backup-1.json'])
 expect(files).toHaveLength(3)
 expect((await response.json()).backups).toEqual(files)
 expect(deps.release).toHaveBeenCalledWith('alice','lease')
})

it('preserves all retained copies on a failed upload and releases its lease', async () => {
 const before = structuredClone(files)
 deps.upload = vi.fn().mockRejectedValue(new Error('secret provider details'))
 const response = await backupHandler(deps)(request())
 expect(response.status).toBe(503)
 expect(files).toEqual(before)
 expect(deps.remove).not.toHaveBeenCalled()
 expect(await response.text()).not.toContain('secret provider')
 expect(deps.release).toHaveBeenCalledOnce()
})

it('retries interrupted pruning on refresh and blocks additional uploads until old cleanup succeeds', async () => {
 deps.remove = vi.fn().mockRejectedValue(new Error('Storage unavailable'))
 const handler = backupHandler(deps)
 expect((await (await handler(request())).json()).error).toBe('cleanup_pending')
 expect(files).toHaveLength(4)
 expect((await handler(request())).status).toBe(503)
 expect(deps.upload).toHaveBeenCalledOnce()
 deps.remove = vi.fn(async paths => { files = files.filter(item => !paths.includes(item.path)) })
 expect((await handler(request('GET'))).status).toBe(200)
 expect(files).toHaveLength(3)
 expect(deps.claim).toHaveBeenLastCalledWith('alice',false)
})

it('reconciles existing over-limit accounts and only removes paths returned for the verified account', async () => {
 files = [file(6),file(5),file(4),file(3),file(2),file(1)]
 const response = await backupHandler(deps)(request('GET'))
 expect(response.status).toBe(200)
 expect(files.map(item => item.name)).toEqual(['backup-6.json','backup-5.json','backup-4.json'])
 expect(deps.upload).not.toHaveBeenCalled()
 expect(deps.files).toHaveBeenCalledWith('alice')
})

it('returns backend cooldown/busy errors with Retry-After and never uploads or prunes on rejection', async () => {
 for (const [error,status] of [['rate_limited',429],['busy',409]] as const) {
  deps.claim = vi.fn().mockResolvedValue({ error, retry_after: 60 })
  const response = await backupHandler(deps)(request())
  expect(response.status).toBe(status)
  expect(response.headers.get('Retry-After')).toBe('60')
 }
 expect(deps.upload).not.toHaveBeenCalled()
 expect(deps.remove).not.toHaveBeenCalled()
 expect(deps.release).not.toHaveBeenCalled()
})

it('rejects unauthorized requests and invalid types before touching account state', async () => {
 deps.authenticate = vi.fn().mockResolvedValue(null)
 expect((await backupHandler(deps)(request())).status).toBe(401)
 deps.authenticate = vi.fn().mockResolvedValue('alice')
 expect((await backupHandler(deps)(request('POST','x',{'content-type':'text/plain'}))).status).toBe(415)
 expect(deps.claim).not.toHaveBeenCalled()
})

it('enforces 50 MiB from both declared and streamed sizes without touching existing files', async () => {
 const handler = backupHandler(deps)
 expect((await handler(request('POST','{}',{'content-length':'52428801'}))).status).toBe(413)
 const chunk = new Uint8Array(1_048_576)
 let sent = 0, cancelled = false
 const stream = new ReadableStream({ pull(controller) { if (++sent <= 100) controller.enqueue(chunk); else controller.close() }, cancel() { cancelled = true } })
 const incoming = new Request('https://app.test/save-backup', { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type':'application/gzip' }, body: stream, duplex:'half' } as RequestInit)
 expect((await handler(incoming)).status).toBe(413)
 expect(cancelled).toBe(true)
 expect(deps.upload).not.toHaveBeenCalled()
 expect(deps.remove).not.toHaveBeenCalled()
})

it('uses the same locked retention operation to clean existing accounts during rollout', async () => {
 files = [file(5),file(4),file(3),file(2),file(1)]
 expect(await pruneAccountBackups(deps,'alice')).toBe(true)
 expect(files).toHaveLength(3)
 expect(deps.claim).toHaveBeenCalledWith('alice',false)
 expect(deps.upload).not.toHaveBeenCalled()
 expect(deps.release).toHaveBeenCalledWith('alice','lease')
})

it('leaves busy accounts untouched and releases the lease when maintenance cleanup fails', async () => {
 files.unshift(file(4))
 deps.claim = vi.fn().mockResolvedValue({ error:'busy',retry_after:60 })
 expect(await pruneAccountBackups(deps,'alice')).toBe(false)
 expect(deps.remove).not.toHaveBeenCalled()
 deps.claim = vi.fn().mockResolvedValue({ token:'lease' })
 deps.remove = vi.fn().mockRejectedValue(new Error('Storage unavailable'))
 await expect(pruneAccountBackups(deps,'alice')).rejects.toThrow('Storage unavailable')
 expect(deps.release).toHaveBeenCalledWith('alice','lease')
 expect(files).toHaveLength(4)
})
