// @vitest-environment node
import { expect, it } from 'vitest'
import { createEnvironmentManager } from './environments.js'

const profiles = {
 hosted: { label: 'Hosted', appOrigin: 'https://library.example', backend: 'https://hosted.supabase.co', publicKey: 'hosted-public' },
 local: { label: 'Local', appOrigin: 'http://127.0.0.1:5173', backend: 'http://127.0.0.1:54321', publicKey: 'local-public' },
}
function area(data) {
 return {
  async get(keys) { return keys === null ? { ...data } : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])) },
  async set(values) { Object.assign(data, structuredClone(values)) },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key] },
 }
}
it('defaults to hosted and isolates import sessions, scan pages, and baselines across switches and restarts', async () => {
 const local = { librarySync: { id: 'hosted-scan', status: 'paused' }, 'librarySync:hosted-scan:1': ['private notes'] }
 const session = { auth: { token: 'hosted-session' }, active: { id: 'hosted-work' } }
 const storage = { local: area(local), session: area(session) }
 const manager = createEnvironmentManager(profiles, 'hosted', storage)
 await manager.ready
 expect(manager.current.id).toBe('hosted')
 expect((await manager.storage.session.get('auth')).auth.token).toBe('hosted-session')
 await manager.select('local')
 expect(await manager.storage.session.get(['auth', 'active'])).toEqual({ auth: undefined, active: undefined })
 expect((await manager.storage.local.get('librarySync')).librarySync).toBeUndefined()
 await manager.storage.session.set({ auth: { token: 'local-session' } })
 await manager.storage.local.set({ librarySync: { id: 'local-scan' }, 'libraryBaseline:alice:list': [42] })
 const restarted = createEnvironmentManager(profiles, 'hosted', storage)
 await restarted.ready
 expect(restarted.current.id).toBe('local')
 expect((await restarted.storage.session.get('auth')).auth.token).toBe('local-session')
 await restarted.storage.session.clear()
 await restarted.select('hosted')
 expect((await restarted.storage.session.get('auth')).auth.token).toBe('hosted-session')
 expect((await restarted.storage.session.get('active')).active.id).toBe('hosted-work')
 expect((await restarted.storage.local.get('librarySync')).librarySync.id).toBe('hosted-scan')
 expect((await restarted.storage.local.get('librarySync:hosted-scan:1'))['librarySync:hosted-scan:1']).toEqual(['private notes'])
 expect((await restarted.storage.local.get('libraryBaseline:alice:list'))['libraryBaseline:alice:list']).toBeUndefined()
 await expect(restarted.select('unknown')).rejects.toThrow('not configured')
 expect(restarted.current.id).toBe('hosted')
})
