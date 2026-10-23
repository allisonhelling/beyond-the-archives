import { StrictMode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ExtensionConnection } from './ExtensionConnection'

const mocks = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), auth: { session: { user: { id: 'alice' } } as Session | null, loading: false } }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => mocks.auth }))
vi.mock('./extension', () => ({ connectExtension: mocks.connect, disconnectExtension: mocks.disconnect }))

beforeEach(() => {
 vi.clearAllMocks()
 mocks.auth = { session: { user: { id: 'alice' } } as Session, loading: false }
 mocks.connect.mockResolvedValue(true)
 mocks.disconnect.mockResolvedValue(true)
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

