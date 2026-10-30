import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authenticated: true }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ authenticated: mocks.authenticated }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
import { ConnectReader } from './ConnectReader'
import { hostedOrganizer, hostedReaderUrl } from '../../lib/reader-connection'
beforeEach(() => {
  mocks.authenticated = true
  mocks.rpc.mockReset().mockResolvedValue({ data: { code: 'a'.repeat(64) }, error: null })
  vi.stubEnv('VITE_SUPABASE_URL', hostedOrganizer.url)
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', hostedOrganizer.key)
  vi.stubEnv('VITE_READER_URL', 'https://reader.example/')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
it('opens a detached reader tab with a fresh pairing code in its fragment', async () => {
  const tab = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  render(<ConnectReader />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Reader' }))
  await waitFor(() => expect(tab.location.replace).toHaveBeenCalledOnce())
  expect(tab.opener).toBeNull()
  expect(mocks.rpc).toHaveBeenCalledWith('manage_userscript_device', { p_action: 'create', p_name: 'My Reader' })
  const url = new URL(tab.location.replace.mock.calls[0][0])
  expect(url.origin).toBe('https://reader.example')
  expect(url.search).toBe('')
  expect(JSON.parse(new URLSearchParams(url.hash.slice(1)).get('readerPairing')!)).toEqual({ ...hostedOrganizer, code: 'a'.repeat(64) })
})
it('defaults to the hosted reader when no destination override is configured', async () => {
  vi.stubEnv('VITE_READER_URL', '')
  vi.spyOn(window, 'open').mockReturnValue(null)
  render(<ConnectReader />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Reader' }))
  const link = await screen.findByRole('link', { name: 'Open Reader' })
  expect(new URL(link.getAttribute('href')!).origin).toBe(new URL(hostedReaderUrl).origin)
})
it('offers an explicit link if the browser blocks the new tab', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  render(<ConnectReader />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Reader' }))
  expect(await screen.findByRole('link', { name: 'Open Reader' })).toHaveAttribute('rel', 'noreferrer')
})
it('closes the empty tab and permits retry when pairing fails', async () => {
  const tab = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('Failed') })
  render(<ConnectReader />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Reader' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Could not connect')
  expect(tab.close).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Connect Reader' })).toBeEnabled()
})
it('requires an online authenticated session', () => {
  mocks.authenticated = false
  render(<ConnectReader />)
  expect(screen.getByRole('button', { name: 'Connect Reader' })).toBeDisabled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('keeps a usable pairing link even after opening the tab or when navigation is blocked', async () => {
  const tab = { opener: window, closed: false, location: { replace: vi.fn(() => { throw new Error('Navigation blocked') }) }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  render(<ConnectReader />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Reader' }))
  const link = await screen.findByRole('link', { name: 'Open Reader' })
  expect(new URL(link.getAttribute('href')!).hash).toContain('readerPairing=')
  expect(tab.close).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('connect automatically')
})
