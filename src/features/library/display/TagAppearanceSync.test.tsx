import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TagAppearanceSync } from './TagAppearanceSync'
import { displaySnapshot, saveTagAppearance, tagAppearance, type TagAppearance } from './display-settings'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
let remote: TagAppearance | null
beforeEach(() => {
 const data = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) })
 remote = null
 mocks.rpc.mockReset().mockImplementation(async (_name: string, args?: {p_input?: {tagAppearance: TagAppearance; base: TagAppearance | null}}) => {
  if (args?.p_input) remote = args.p_input.tagAppearance
  // PostgreSQL object key ordering need not match the browser's serialization.
  return { data: {tagAppearance: remote ? {colors: remote.colors, shape: remote.shape} : null}, error: null }
 })
})
afterEach(() => vi.unstubAllGlobals())
it('migrates local tag preferences, publishes saves, and pulls account changes without touching layouts', async () => {
 saveTagAppearance({shape:'commas',colors:{tags:'#123456'}})
 render(<TagAppearanceSync userId="alice" />)
 await waitFor(() => expect(remote?.shape).toBe('commas'))
 act(() => saveTagAppearance({shape:'filled',colors:{}}))
 await waitFor(() => expect(remote?.shape).toBe('filled'))
 remote={shape:'sharp',colors:{tags:'#654321'}}
 act(() => window.dispatchEvent(new Event('focus')))
 await waitFor(() => expect(tagAppearance(displaySnapshot())).toEqual(remote))
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('preserves a conflicting local draft until the user explicitly accepts organizer settings', async () => {
 remote={shape:'pill',colors:{}}
 render(<TagAppearanceSync userId="alice" />)
 await waitFor(() => expect(tagAppearance(displaySnapshot()).shape).toBe('pill'))
 remote={shape:'sharp',colors:{}}
 act(() => saveTagAppearance({shape:'commas',colors:{}}))
 await screen.findByRole('alert')
 expect(tagAppearance(displaySnapshot()).shape).toBe('commas')
 expect(remote.shape).toBe('sharp')
 act(() => screen.getByRole('button', {name:'Use Organizer Settings'}).click())
 await waitFor(() => expect(tagAppearance(displaySnapshot()).shape).toBe('sharp'))
})
it('does not seed another account with the previous account’s format', async () => {
 remote={shape:'pill',colors:{}}
 const view=render(<TagAppearanceSync userId="alice" />)
 await waitFor(() => expect(tagAppearance(displaySnapshot()).shape).toBe('pill'))
 view.unmount(); remote=null
 render(<TagAppearanceSync userId="bob" />)
 await waitFor(() => expect(remote?.shape).toBe('bullets'))
 expect(tagAppearance(displaySnapshot()).shape).toBe('bullets')
})
