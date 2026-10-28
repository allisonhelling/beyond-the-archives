import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), connect: vi.fn(), id: vi.fn(), local: false, sample: false, auth: { session: { user: { id: 'alice' } } as Session | null, loading: false } }))
vi.mock('../../lib/sample-mode', () => ({ get sampleMode() { return mocks.sample } }))
vi.mock('../../lib/local-app', () => ({ isLocalApp: () => mocks.local }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }), upsert: mocks.save }) } }))
vi.mock('./extension', () => ({ extensionId: () => '', setExtensionId: mocks.id, connectExtension: mocks.connect }))
import { MetadataSettings } from './MetadataSettings'

beforeEach(() => {
 vi.clearAllMocks()
 Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
 mocks.local = false
 mocks.sample = false
 mocks.auth = { session: { user: { id: 'alice' } } as Session, loading: false }
 mocks.load.mockResolvedValue({ data: null, error: null })
 mocks.save.mockResolvedValue({ error: null })
 mocks.connect.mockResolvedValue(true)
})
it('defaults to existing direct retrieval and saves it without requiring an extension', async () => {
 render(<MetadataSettings />)
 const save = screen.getByRole('button', { name: 'Save Metadata Mode' })
 await waitFor(() => expect(save).toBeEnabled())
 expect(screen.getByLabelText('Desktop Metadata Retrieval')).toHaveValue('direct')
 fireEvent.click(save)
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ user_id: 'alice', retrieval_mode: 'direct', retrieval_mode_mobile: null }))
 expect(mocks.connect).not.toHaveBeenCalled()
})
it('connects the configured extension before enabling its mode, and reconnect uses the entered ID', async () => {
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save Metadata Mode' })).toBeEnabled())
 fireEvent.change(screen.getByLabelText('Desktop Metadata Retrieval'), { target: { value: 'extension' } })
 const id = 'a'.repeat(32)
 fireEvent.change(screen.getByLabelText(/^Extension ID/), { target: { value: id } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Metadata Mode' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ user_id: 'alice', retrieval_mode: 'extension', retrieval_mode_mobile: null }))
 expect(mocks.id).toHaveBeenCalledWith(id)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect Extension' })).toBeEnabled())
 fireEvent.click(screen.getByRole('button', { name: 'Reconnect Extension' }))
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Extension connected.'))
 expect(mocks.connect).toHaveBeenCalledTimes(2)
})
it('leaves the current database mode intact when the extension cannot connect', async () => {
 mocks.connect.mockResolvedValue(false)
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save Metadata Mode' })).toBeEnabled())
 fireEvent.change(screen.getByLabelText('Desktop Metadata Retrieval'), { target: { value: 'extension' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Metadata Mode' }))
 expect(await screen.findByRole('status')).toHaveTextContent('Could not connect.')
 expect(mocks.save).not.toHaveBeenCalled()
})

it('allows the shared extension ID on the local app', async () => {
 mocks.local = true
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save Metadata Mode' })).toBeEnabled())
 fireEvent.change(screen.getByLabelText('Desktop Metadata Retrieval'), { target: { value: 'extension' } })
 expect(screen.getByLabelText(/^Extension ID/)).not.toHaveAttribute('readonly')
 expect(screen.getByText(/Use Beyond the Archives Companion with Local selected/)).toBeVisible()
})

it('connects the shared companion in local sample mode without saving backend preferences', async () => {
 mocks.local = true; mocks.sample = true; mocks.auth.session = null
 render(<MetadataSettings />)
 const id = screen.getByLabelText(/^Extension ID/)
 expect(id).toBeEnabled()
 fireEvent.change(id, { target: { value: 'b'.repeat(32) } })
 fireEvent.click(screen.getByRole('button', { name: 'Reconnect Extension' }))
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Extension connected.'))
 expect(mocks.id).toHaveBeenCalledWith('b'.repeat(32))
 expect(mocks.connect).toHaveBeenCalledOnce()
 expect(mocks.load).not.toHaveBeenCalled()
 expect(mocks.save).not.toHaveBeenCalled()
 expect(screen.queryByRole('button', { name: 'Save Metadata Mode' })).not.toBeInTheDocument()
})

it('saves mobile direct retrieval without connecting the desktop extension', async () => {
 Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
 mocks.load.mockResolvedValue({ data: { retrieval_mode: 'extension', retrieval_mode_mobile: null }, error: null })
 render(<MetadataSettings />)
 const save = screen.getByRole('button', { name: 'Save Metadata Mode' })
 await waitFor(() => expect(save).toBeEnabled())
 expect(screen.getByLabelText('Desktop Metadata Retrieval')).toHaveValue('extension')
 expect(screen.getByLabelText('Mobile Metadata Retrieval')).toHaveValue('inherit')
 fireEvent.change(screen.getByLabelText('Mobile Metadata Retrieval'), { target: { value: 'direct' } })
 fireEvent.click(save)
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ user_id: 'alice', retrieval_mode: 'extension', retrieval_mode_mobile: 'direct' }))
 expect(mocks.connect).not.toHaveBeenCalled()
 expect(screen.queryByLabelText(/^Extension ID/)).not.toBeInTheDocument()
})
it('loads independently saved desktop and mobile choices', async () => {
 mocks.load.mockResolvedValue({ data: { retrieval_mode: 'direct', retrieval_mode_mobile: 'extension' }, error: null })
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save Metadata Mode' })).toBeEnabled())
 expect(screen.getByLabelText('Desktop Metadata Retrieval')).toHaveValue('direct')
 expect(screen.getByLabelText('Mobile Metadata Retrieval')).toHaveValue('extension')
})
