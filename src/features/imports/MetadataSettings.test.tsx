import { StrictMode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), id: vi.fn(), auth: { session: { user: { id: 'alice' } } as Session | null, loading: false } }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }), upsert: mocks.save }) } }))
vi.mock('./extension', () => ({ extensionId: () => '', setExtensionId: mocks.id, connectExtension: mocks.connect, disconnectExtension: mocks.disconnect }))
import { ExtensionConnection, MetadataSettings } from './MetadataSettings'

beforeEach(() => {
 vi.clearAllMocks()
 mocks.auth = { session: { user: { id: 'alice' } } as Session, loading: false }
 mocks.disconnect.mockResolvedValue(true)
 mocks.load.mockResolvedValue({ data: null, error: null })
 mocks.save.mockResolvedValue({ error: null })
 mocks.connect.mockResolvedValue(true)
})
it('defaults to existing direct retrieval and saves it without requiring an extension', async () => {
 render(<MetadataSettings />)
 const save = screen.getByRole('button', { name: 'Save metadata mode' })
 await waitFor(() => expect(save).toBeEnabled())
 expect(screen.getByLabelText('How to load AO3 metadata')).toHaveValue('direct')
 fireEvent.click(save)
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ user_id: 'alice', retrieval_mode: 'direct' }))
 expect(mocks.connect).not.toHaveBeenCalled()
})
it('connects the configured extension before enabling its mode, and reconnect uses the entered ID', async () => {
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save metadata mode' })).toBeEnabled())
 fireEvent.change(screen.getByLabelText('How to load AO3 metadata'), { target: { value: 'extension' } })
 const id = 'a'.repeat(32)
 fireEvent.change(screen.getByLabelText(/^Extension ID/), { target: { value: id } })
 fireEvent.click(screen.getByRole('button', { name: 'Save metadata mode' }))
 await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ user_id: 'alice', retrieval_mode: 'extension' }))
 expect(mocks.id).toHaveBeenCalledWith(id)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Reconnect extension' })).toBeEnabled())
 fireEvent.click(screen.getByRole('button', { name: 'Reconnect extension' }))
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Extension connected.'))
 expect(mocks.connect).toHaveBeenCalledTimes(2)
})
it('leaves the current database mode intact when the extension cannot connect', async () => {
 mocks.connect.mockResolvedValue(false)
 render(<MetadataSettings />)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save metadata mode' })).toBeEnabled())
 fireEvent.change(screen.getByLabelText('How to load AO3 metadata'), { target: { value: 'extension' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save metadata mode' }))
 expect(await screen.findByRole('status')).toHaveTextContent('Could not connect.')
 expect(mocks.save).not.toHaveBeenCalled()
})

it('keeps the extension connected through StrictMode remounts and page closure', async () => {
 const { unmount } = render(<StrictMode><ExtensionConnection /></StrictMode>)
 await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(mocks.auth.session))
 expect(mocks.disconnect).not.toHaveBeenCalled()
 unmount()
 expect(mocks.disconnect).not.toHaveBeenCalled()
})
it('waits for auth initialization and disconnects after sign-out', async () => {
 mocks.auth = { session: null, loading: true }
 const { rerender } = render(<ExtensionConnection />)
 expect(mocks.disconnect).not.toHaveBeenCalled()
 mocks.auth = { session: { user: { id: 'alice' } } as Session, loading: false }
 rerender(<ExtensionConnection />)
 await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(mocks.auth.session))
 mocks.auth = { session: null, loading: false }
 rerender(<ExtensionConnection />)
 await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1))
})
