import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { StrictMode } from 'react'
import App from './App'

vi.mock('../features/library/repository', () => ({ loadLibrary: async () => ({ stories: [], collections: [] }) }))

const fakeSession = { user: { id: 'account-1', email: 'reader@example.com' }, access_token: 'session-token' } as Session
const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(), unsubscribe: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  initialAuthType: null,
  authRedirectUrl: () => 'http://localhost:3000/auth/callback',
  supabase: { auth: {
    getSession: auth.getSession,
    onAuthStateChange: (cb: typeof auth.listener) => { auth.listener = cb; return { data: { subscription: { unsubscribe: auth.unsubscribe } } } },
    signInWithPassword: auth.signInWithPassword, signOut: auth.signOut,
    resetPasswordForEmail: auth.resetPasswordForEmail, updateUser: auth.updateUser, verifyOtp: auth.verifyOtp,
  } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  auth.session = null
  auth.listener = null
  auth.getSession.mockImplementation(async () => ({ data: { session: auth.session }, error: null }))
  auth.signInWithPassword.mockResolvedValue({ error: null })
  auth.signOut.mockImplementation(async () => { auth.listener?.('SIGNED_OUT', null); return { error: null } })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.verifyOtp.mockResolvedValue({ error: null })
  window.history.replaceState(null, '', '/')
})

describe('private app access and navigation', () => {
  it('protects every route from unauthenticated visitors', async () => {
    for (const path of ['/reading', '/library', '/stats', '/settings', '/features']) {
      window.history.replaceState(null, '', path)
      const view = render(<App />)
      expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
      view.unmount()
    }
  })
  it('signs in using Supabase and opens the protected shell', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Email address'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-secret-password')
    await user.click(screen.getByRole('button', { name: 'Sign in to your library' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'reader@example.com', password: 'a-secret-password' })
    act(() => auth.listener?.('SIGNED_IN', fakeSession))
    expect(await screen.findByRole('heading', { name: 'Currently Reading' })).toBeVisible()
  })
  it('renders errors without exposing provider internals', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('sensitive provider details') })
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Email address'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in to your library' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in')
    expect(screen.queryByText('sensitive provider details')).not.toBeInTheDocument()
  })
  it('restores the session, navigates between sections, and signs out', async () => {
    auth.session = fakeSession
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Currently Reading' })
    for (const [label, title] of [['Library', 'Your Library'], ['Stats', 'Reading Stats'], ['Settings', 'Settings'], ['Features', 'The next chapters']]) {
      if (label === 'Settings') await user.click(screen.getByRole('button', { name: 'Profile menu' }))
      await user.click(screen.getByRole('link', { name: label }))
      expect(await screen.findByRole('heading', { name: title })).toBeVisible()
    }
    await user.click(screen.getByRole('button', { name: 'Profile menu' }))
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
  it('provides mobile navigation and phase-labelled add options', async () => {
    auth.session = fakeSession
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('link', { name: 'Library' })[1])
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: /Save for Later/ })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /Import History from AO3/ }).every(button => button.hasAttribute('disabled'))).toBe(true)
  })
  it('removes protected content when the session expires', async () => {
    auth.session = fakeSession
    render(<App />)
    await screen.findByRole('heading', { name: 'Currently Reading' })
    act(() => auth.listener?.('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  })
  it('fails closed on session restoration failures', async () => {
    auth.getSession.mockRejectedValue(new Error('network unavailable'))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify your session')
  })
  it('requests account recovery and completes password update', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Forgot your password?' }))
    await user.type(screen.getByLabelText('Email address'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Send recovery link' }))
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('reader@example.com', { redirectTo: 'http://localhost:3000/auth/callback' })
    expect(await screen.findByRole('status')).toHaveTextContent('If this address has an account')
    act(() => auth.listener?.('PASSWORD_RECOVERY', fakeSession))
    await user.type(screen.getByLabelText(/New password/), 'New-password-123!')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'New-password-123!' })
    expect(await screen.findByRole('heading', { name: 'Currently Reading' })).toBeVisible()
  })
  it('verifies invitation tokens before allowing a password to be set', async () => {
    window.history.replaceState(null, '', '/auth/callback?token_hash=invitation-token&type=invite')
    auth.verifyOtp.mockImplementation(async () => { auth.listener?.('SIGNED_IN', fakeSession); return { error: null } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'invitation-token', type: 'invite' })
    expect(window.location.search).toBe('')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
  it('consumes a one-time invitation only once during StrictMode remounts', async () => {
    window.history.replaceState(null, '', '/auth/callback?token_hash=strictmode-invitation&type=invite')
    auth.verifyOtp.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      auth.listener?.('SIGNED_IN', fakeSession)
      return { error: null }
    })
    render(<StrictMode><App /></StrictMode>)
    expect(await screen.findByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
  it('rejects expired callback links', async () => {
    window.history.replaceState(null, '', '/auth/callback?error=access_denied')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify your session')
  })
  it('does not expose private data while session validation is pending', async () => {
    auth.getSession.mockReturnValue(new Promise(() => {}))
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening your reading space')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
  it('shows recovery failures and allows a deliberate retry', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Forgot your password?' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'reader@example.com' } })
    await user.click(screen.getByRole('button', { name: 'Send recovery link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send a recovery link')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send recovery link' })).toBeEnabled())
  })
})
