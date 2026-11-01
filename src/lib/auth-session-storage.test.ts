import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authSessionStorage, rememberSession } from './auth-session-storage'

beforeEach(() => {
 const storage = () => {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
 }
 vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage())
})
afterEach(() => vi.unstubAllGlobals())


it('keeps existing session keys persistent when Remember Me is selected', () => {
 rememberSession('persistent-test', true)
 const storage = authSessionStorage('persistent-test')
 storage.setItem('existing-auth-key', 'persistent token')
 expect(localStorage.getItem('existing-auth-key')).toBe('persistent token')
 expect(sessionStorage.getItem('existing-auth-key')).toBeNull()
 expect(authSessionStorage('persistent-test').getItem('existing-auth-key')).toBe('persistent token')
 localStorage.removeItem('existing-auth-key')
 expect(storage.getItem('existing-auth-key')).toBeNull()
 storage.removeItem('existing-auth-key')
})

it('stores unchecked sessions only in the current tab and clears older persistent copies', () => {
 localStorage.setItem('tab-auth-key', 'old token')
 rememberSession('tab-test', false)
 const storage = authSessionStorage('tab-test')
 storage.setItem('tab-auth-key', 'tab token')
 expect(localStorage.getItem('tab-auth-key')).toBeNull()
 expect(sessionStorage.getItem('tab-auth-key')).toBe('tab token')
 expect(authSessionStorage('tab-test').getItem('tab-auth-key')).toBe('tab token')
 sessionStorage.removeItem('tab-auth-key')
 expect(authSessionStorage('tab-test').getItem('tab-auth-key')).toBeNull()
 storage.removeItem('tab-auth-key')
})

it('clears both session stores on sign-out', () => {
 const storage = authSessionStorage('logout-test')
 localStorage.setItem('logout-auth-key', 'persistent')
 sessionStorage.setItem('logout-auth-key', 'tab')
 storage.removeItem('logout-auth-key')
 expect(localStorage.getItem('logout-auth-key')).toBeNull()
 expect(sessionStorage.getItem('logout-auth-key')).toBeNull()
})
