import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { localExtensionId, localExtensionKey } from './extension-config'
import { extensionId, setExtensionId, librarySyncCommand, connectExtension, desktopExtensionAvailable, captureWorkWithExtension, disconnectExtension } from './extension'
import { isLocalApp } from '../../lib/local-app'
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function location(hostname: string, savedId: string | null = 'a'.repeat(32)) {
 const store = new Map<string, string>(savedId ? [['ao3-library-extension-id', savedId]] : [])
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
 const sendMessage = vi.fn((_id, _message, callback) => callback({ ok: true, capabilities: ['metadata-retrieval-v1'] }))
 Object.assign(window, { chrome: { runtime: { sendMessage } } })
 const { connectExtension } = await import('./extension')
 expect(await connectExtension()).toBe(true)
 expect(sendMessage).toHaveBeenCalledWith('a'.repeat(32), { type: 'AO3_LIBRARY_SAMPLE_CONNECT' }, expect.any(Function))
})

it('prefers a configured shared extension on local origins and retains the legacy fallback', () => {
 location('127.0.0.1', null)
 vi.stubEnv('VITE_AO3_EXTENSION_ID', 'b'.repeat(32))
 expect(extensionId()).toBe('b'.repeat(32))
 vi.stubEnv('VITE_AO3_EXTENSION_ID', '')
 expect(extensionId()).toBe(localExtensionId)
})

it('explains how to preserve a scan when an older companion rejects End Scan', async () => {
 location('library.example.com')
 const sendMessage = vi.fn((_id, _message, callback) => callback({ ok: false, error: 'This action is unavailable for the saved scan.' }))
 Object.assign(window, { chrome: { runtime: { sendMessage } } })
 await expect(librarySyncCommand('end', { scanId: 'older-scan' })).rejects.toThrow('Update and reload the existing extension')
 expect(sendMessage).toHaveBeenCalledTimes(1)
 expect(sendMessage).toHaveBeenCalledWith('a'.repeat(32), { type: 'AO3_LIBRARY_SYNC', action: 'end', scanId: 'older-scan' }, expect.any(Function))
 await expect(librarySyncCommand('resume', { scanId: 'older-scan' })).rejects.toThrow('This action is unavailable for the saved scan.')
})

it('rejects older companions and forged success replies without the supported capability', async () => {
 location('localhost')
 const sendMessage=vi.fn((_id,_message,callback)=>callback({ok:true}))
 Object.assign(window,{chrome:{runtime:{sendMessage}}})
 expect(await desktopExtensionAvailable()).toBe(false)
 expect(await connectExtension()).toBe(false)
 expect(sendMessage.mock.calls.every(call=>call[1].type==='AO3_LIBRARY_CAPABILITIES')).toBe(true)
})
it('recognizes compatible companions independently of viewport width',async()=>{
 location('localhost')
 Object.assign(window,{innerWidth:390,chrome:{runtime:{sendMessage:(_id:string,_message:object,callback:(reply:object)=>void)=>callback({ok:true,capabilities:['metadata-retrieval-v1']})}}})
 expect(await desktopExtensionAvailable()).toBe(true)
})
it('sign-out fences a connection waiting for its capability response',async()=>{
 location('localhost')
 let capabilityReply: ((reply:object)=>void)|undefined
 const sendMessage=vi.fn((_id:string,message:{type:string},callback:(reply:object)=>void)=>{
  if(message.type==='AO3_LIBRARY_CAPABILITIES')capabilityReply=callback
  else callback({ok:true})
 })
 Object.assign(window,{chrome:{runtime:{sendMessage}}})
 const {connectExtension,disconnectExtension}=await import('./extension')
 const pending=connectExtension({access_token:'signed-out-token',expires_at:Math.floor(Date.now()/1000)+3600} as import('@supabase/supabase-js').Session)
 await disconnectExtension()
 capabilityReply!({ok:true,capabilities:['metadata-retrieval-v1']})
 expect(await pending).toBe(false)
 expect(sendMessage.mock.calls.some(call=>call[1].type==='AO3_LIBRARY_CONNECT')).toBe(false)
})

it('rejects malformed capture replies with an actionable contract error', async () => {
 location('localhost')
 Object.assign(window, { chrome: { runtime: { sendMessage: (_id: string, _message: object, callback: (reply: object) => void) => callback({ ok: true, page: { url: 'https://archiveofourown.org/works/456', html: '<h2>Wrong work</h2>' } }) } } })
 await expect(captureWorkWithExtension('https://archiveofourown.org/works/123')).rejects.toMatchObject({ code: 'CONTRACT_UNSUPPORTED', message: expect.stringContaining('manually') })
})

it.each(['capture', 'scan'] as const)('rejects a late %s response after account disconnect', async operation => {
 location('localhost')
 let respond: ((reply: object) => void) | undefined
 Object.assign(window, { chrome: { runtime: { sendMessage: (_id: string, message: { type: string }, callback: (reply: object) => void) => {
  if (message.type === 'AO3_LIBRARY_DISCONNECT') callback({ ok: true })
  else respond = callback
 } } } })
 const url = 'https://archiveofourown.org/works/123'
 const pending = operation === 'capture' ? captureWorkWithExtension(url) : librarySyncCommand('status')
 const rejected = expect(pending).rejects.toThrow('current account')
 await disconnectExtension()
 respond!({ ok: true, page: { url, html: '<h2>Old account</h2>' } })
 await rejected
})
