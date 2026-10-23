import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
const auth = vi.hoisted(() => ({ userId: 'first' }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: auth.userId } } }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
import { Ao3UsernameSettings } from './Ao3UsernameSettings'
import { normalizeAo3Username, useAo3Username } from './ao3-username'
beforeEach(() => {
 auth.userId = 'first'
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
it('shows, changes, and deletes the saved import username', () => {
 const preference = renderHook(() => useAo3Username())
 preference.result.current.save('Alice')
 render(<Ao3UsernameSettings />)
 expect(screen.getByLabelText('AO3 Username')).toHaveValue('Alice')
 fireEvent.change(screen.getByLabelText('AO3 Username'), { target: { value: ' Bob_2 ' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Username' }))
 expect(preference.result.current.read()).toBe('Bob_2')
 fireEvent.click(screen.getByRole('button', { name: 'Delete Username' }))
 expect(screen.getByLabelText('AO3 Username')).toHaveValue('')
 expect(preference.result.current.read()).toBe('')
})
it('isolates saved usernames by library account', () => {
 const preference = renderHook(() => useAo3Username())
 preference.result.current.save('Alice')
 auth.userId = 'second'; preference.rerender()
 expect(preference.result.current.read()).toBe('')
 auth.userId = 'first'; preference.rerender()
 expect(preference.result.current.read()).toBe('Alice')
})
it('rejects URLs and usernames that could change the import path', () => {
 for (const value of ['', '../Bob', 'Alice?show=all', 'https://archiveofourown.org/users/Alice', 'Alice Bob']) expect(() => normalizeAo3Username(value)).toThrow()
})
