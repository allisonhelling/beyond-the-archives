import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { StrictMode } from 'react'
import App from './App'

vi.mock('../features/library/repository', async importOriginal => ({
  ...await importOriginal<typeof import('../features/library/repository')>(),
  loadCatalog: async () => ({ stories: [], collections: [], series: [] }),
  loadCollections: async () => [],
  loadLibraryFacets: async () => ({ fandoms: [], total: 0 }),
  loadLibraryNavigation: async () => ({counts:{},revision:0}),
  loadLibraryRevision: async () => 0,
  queryLibrary: async () => ({ stories: [], series: [], total: 0, page: 1, pages: 1, fandoms: [], sections: {} }),
}))

const fakeSession = { user: { id: 'account-1', email: 'reader@example.com' }, access_token: 'session-token' } as Session
const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn(), unsubscribe: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  initialAuthType: null,
  authRedirectUrl: () => 'http://localhost:3000/auth/callback',
  supabase: { rpc: async () => ({ data: [], error: null }), auth: {
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
    for (const path of ['/reading', '/library', '/authors/Writer', '/stats', '/settings', '/features']) {
      window.history.replaceState(null, '', path)
      const view = render(<App />)
      expect(await screen.findByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
      view.unmount()
    }
  })
  it('signs in using Supabase and opens the protected shell', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Email Address'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-secret-password')
    await user.click(screen.getByRole('button', { name: 'Sign In to Your Library' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'reader@example.com', password: 'a-secret-password' })
    act(() => auth.listener?.('SIGNED_IN', fakeSession))
    expect(await screen.findByRole('heading', { name: 'Currently Reading' })).toBeVisible()
  })
  it('renders errors without exposing provider internals', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('sensitive provider details') })
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Email Address'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign In to Your Library' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in')
    expect(screen.queryByText('sensitive provider details')).not.toBeInTheDocument()
  })
  it('restores the session, navigates between sections, and signs out', async () => {
    auth.session = fakeSession
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Currently Reading' })
    for (const [label, title] of [['Library', 'Your Library'], ['Stats', 'Reading Stats'], ['Settings', 'Settings'], ['Features', 'The Next Chapters']]) {
      if (label === 'Features') await user.click(screen.getByRole('button', { name: 'Profile Menu' }))
      await act(async () => {
        await user.click(within(screen.getByRole(label === 'Features' ? 'region' : 'navigation', { name: label === 'Features' ? 'Profile Menu' : 'Main Navigation' })).getByRole('link', { name: label }))
      })
      expect(window.location.pathname).toBe(`/${label.toLowerCase()}`)
      expect(await screen.findByRole('heading', { name: title }, { timeout: 5000 })).toBeVisible()
    }
    await user.click(screen.getByRole('button', { name: 'Profile Menu' }))
    await user.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  }, 15000)
  it.each([
    ['/imports', 'Mass Import from AO3'],
    ['/settings/example-work', 'Example Work Info Page'],
    ['/settings/example-series', 'Example Series Info Page'],
  ])('opens the secondary page %s directly inside the shell', async (path, title) => {
    auth.session = fakeSession
    window.history.replaceState(null, '', path)
    render(<App />)
    expect(await screen.findByRole('heading', { name: title })).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Main Navigation' })).toBeVisible()
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument()
  })
  it('provides mobile navigation and a direct header Add Story link', async () => {
    auth.session = fakeSession
    const user = userEvent.setup()
    render(<App />)
    // Wait for the initial redirect before navigating.
    await screen.findByRole('heading', { name: 'Currently Reading' })
    expect(screen.getByRole('navigation', { name: 'Mobile Navigation' })).toBeInTheDocument()
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile Navigation' })
    expect(within(mobileNav).getAllByRole('link').map(link => link.textContent)).toEqual(['Reading', 'Library', 'Import', 'Stats', 'Settings'])
    await user.click(within(mobileNav).getByRole('link', { name: 'Library' }))
    expect(await screen.findByRole('heading', { name: 'Your Library' })).toBeVisible()
    expect(mobileNav).toBeInTheDocument()
    const add = screen.getByRole('link', { name: 'Add Story' })
    expect(add).toHaveAttribute('href', '/add?mode=finished')
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
    expect(screen.queryByText('Add to Your Library')).not.toBeInTheDocument()
    await user.click(add)
    expect(await screen.findByRole('heading', { name: 'Add Story' })).toBeVisible()
  })
  it('backs out of collection selection and then editing with successive Escape presses', async () => {
    auth.session = fakeSession
    window.history.replaceState(null, '', '/library')
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Edit Collections' }))
    await user.click(screen.getByRole('button', { name: 'Select Collections' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Cancel Selection' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Collections' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Done Editing' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Select Collections' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Collections' })).toHaveFocus()
  })
  it('removes protected content when the session expires', async () => {
    auth.session = fakeSession
    render(<App />)
    await screen.findByRole('heading', { name: 'Currently Reading' })
    act(() => auth.listener?.('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
  })
  it('fails closed on session restoration failures', async () => {
    auth.getSession.mockRejectedValue(new Error('network unavailable'))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome Back.' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify your session')
  })
  it('requests account recovery and completes password update', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Forgot Your Password?' }))
    await user.type(screen.getByLabelText('Email Address'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Send Recovery Link' }))
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('reader@example.com', { redirectTo: 'http://localhost:3000/auth/callback' })
    expect(await screen.findByRole('status')).toHaveTextContent('If this address has an account')
    act(() => auth.listener?.('PASSWORD_RECOVERY', fakeSession))
    await user.type(screen.getByLabelText(/New Password/), 'New-password-123!')
    await user.click(screen.getByRole('button', { name: 'Save Password' }))
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'New-password-123!' })
    expect(await screen.findByRole('heading', { name: 'Currently Reading' })).toBeVisible()
  })
  it('verifies invitation tokens before allowing a password to be set', async () => {
    window.history.replaceState(null, '', '/auth/callback?token_hash=invitation-token&type=invite')
    auth.verifyOtp.mockImplementation(async () => { auth.listener?.('SIGNED_IN', fakeSession); return { error: null } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Make Yourself at Home.' })).toBeVisible()
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
    expect(await screen.findByRole('heading', { name: 'Make Yourself at Home.' })).toBeVisible()
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
    await user.click(await screen.findByRole('button', { name: 'Forgot Your Password?' }))
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'reader@example.com' } })
    await user.click(screen.getByRole('button', { name: 'Send Recovery Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send a recovery link')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send Recovery Link' })).toBeEnabled())
  })
})

it.each(['#ios-safari-userscript', '#ao3-browser-bar'])('scrolls the browser bar settings deep link %s into view after authentication resolves', async hash => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  try {
    auth.session = fakeSession
    window.history.replaceState(null, '', `/settings${hash}`)
    await act(async () => { render(<App />) })
    const heading = await within(screen.getByRole('main')).findByRole('heading', { name: 'AO3 Browser Bar' }, { timeout: 5000 })
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' }))
    expect(scroll.mock.contexts).toContain(heading.closest('section'))
  } finally { delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView }
})
