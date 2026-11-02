// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sampleData } from './sample-data'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sample-data-'))
  await mkdir(join(root, 'src/features/library/sample'), { recursive: true })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const snapshot = { completeSnapshot: true, sampleVersion: 10, stories: [], collections: [], series: [] }
async function request(body = JSON.stringify(snapshot), headers = { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json' }, method = 'POST', enabled = true) {
  const use = vi.fn()
  const plugin = sampleData(enabled)
  const configure = plugin.configureServer as (server: ViteDevServer) => void
  configure({ config: { root }, middlewares: { use } } as unknown as ViteDevServer)
  if (!enabled) return { use }
  const req = Object.assign(Readable.from([Buffer.from(body)]), { headers, method }) as IncomingMessage
  const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
  await use.mock.calls[0][1](req, response as unknown as ServerResponse)
  return { ...response, use }
}

it('atomically writes a complete snapshot for new browsers and preserves empty libraries', async () => {
  const result = await request()
  expect(result.statusCode).toBe(200)
  expect(JSON.parse(await readFile(join(root, 'src/features/library/sample/default-state.json'), 'utf8'))).toEqual(snapshot)
})

it('does not install a write endpoint outside sample mode', async () => {
  expect((await request(undefined, undefined, undefined, false)).use).not.toHaveBeenCalled()
})

it('rejects cross-origin writes, non-POST requests, and malformed snapshots', async () => {
  expect((await request(undefined, { host: 'localhost:5173', origin: 'https://other.example', 'content-type': 'application/json' })).statusCode).toBe(403)
  expect((await request(undefined, undefined, 'GET')).statusCode).toBe(405)
  expect((await request('invalid')).statusCode).toBe(400)
  expect((await request('{}')).statusCode).toBe(400)
  await expect(readFile(join(root, 'src/features/library/sample/default-state.json'))).rejects.toThrow()
})

it('reports a write failure without claiming success', async () => {
  await rm(join(root, 'src'), { recursive: true })
  expect((await request()).statusCode).toBe(500)
})
