import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { localExtensionId, localExtensionKey } from './extension-config'
import { extensionId, setExtensionId } from './extension'
import { isLocalApp } from '../../lib/local-app'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function location(hostname: string) {
 const store = new Map<string, string>([['ao3-library-extension-id', 'a'.repeat(32)]])
 vi.stubGlobal('window', { location: new URL(`http://${hostname}`), localStorage: { getItem: (key: string) => store.get(key), setItem: (key: string, value: string) => store.set(key, value) } })
}
it('allows a shared extension ID on local origins', () => {
 for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
  location(host); vi.stubEnv('VITE_AO3_EXTENSION_ID', 'b'.repeat(32))
  expect(isLocalApp()).toBe(true)
  expect(extensionId()).toBe('a'.repeat(32))
  expect(() => setExtensionId('c'.repeat(32))).not.toThrow()
  expect(extensionId()).toBe('c'.repeat(32))
  expect(() => setExtensionId(localExtensionId)).not.toThrow()
 }
})
it('retains the hosted app’s configured extension selection', () => {
 location('library.example.com')
 expect(isLocalApp()).toBe(false)
 expect(extensionId()).toBe('a'.repeat(32))
 setExtensionId('c'.repeat(32)); expect(extensionId()).toBe('c'.repeat(32))
})
it('matches Chrome’s ID derivation from the public manifest key', () => {
 const hash = createHash('sha256').update(Buffer.from(localExtensionKey, 'base64')).digest('hex').slice(0, 32)
 expect([...hash].map(char => String.fromCharCode(97 + parseInt(char, 16))).join('')).toBe(localExtensionId)
})

it('uses the tokenless local sample connection when sample mode is enabled', async () => {
 vi.stubEnv('DEV', true); vi.stubEnv('VITE_SAMPLE_DATA', 'true'); vi.resetModules()
 location('127.0.0.1')
 const sendMessage = vi.fn((_id, _message, callback) => callback({ ok: true }))
 Object.assign(window, { chrome: { runtime: { sendMessage } } })
 const { connectExtension } = await import('./extension')
 expect(await connectExtension()).toBe(true)
 expect(sendMessage).toHaveBeenCalledWith('a'.repeat(32), { type: 'AO3_LIBRARY_SAMPLE_CONNECT' }, expect.any(Function))
})
