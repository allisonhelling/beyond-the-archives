import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import { AccountSecuritySettings } from './AccountSecuritySettings'

function setup() {
 const user = { id: 'alice', email: 'alice@example.com' }
 const auth = { getUser: vi.fn().mockResolvedValue({ data: { user } }), signInWithPassword: vi.fn().mockResolvedValue({ data: { user }, error: null }), updateUser: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn().mockResolvedValue({ error: null }) }
 const rpc = vi.fn().mockImplementation((name: string, input: { p_action?: string }) => Promise.resolve({ data: name === 'account_has_password' ? true : input.p_action === 'list' ? [{ id: 'browser' }] : [], error: null }))
 render(<AccountSecuritySettings client={{ auth, rpc } as unknown as SupabaseClient<Database>} redirectTo="https://organizer.test/auth/callback" />)
 return { auth, rpc }
}
it('blocks mismatched passwords and wrong current passwords before updating an account', async () => {
 const { auth } = setup()
 await waitFor(() => expect(screen.getByRole('button', { name: 'Change Password' })).toBeEnabled())
 fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
 fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'incorrect' } })
 fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-password' } })
 fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different-password' } })
 fireEvent.submit(screen.getByRole('button', { name: 'Save Password' }).closest('form')!)
 expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
 expect(auth.signInWithPassword).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new-password' } })
 auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error('Invalid credentials') })
 fireEvent.submit(screen.getByRole('button', { name: 'Save Password' }).closest('form')!)
 expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect.')
 expect(auth.updateUser).not.toHaveBeenCalled()
})
it('confirms email through Auth and revokes paired devices before global sign out', async () => {
 const { auth, rpc } = setup()
 fireEvent.click(screen.getByRole('button', { name: 'Edit Email' }))
 fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'current' } })
 fireEvent.change(screen.getByLabelText('New Email Address'), { target: { value: 'new@example.com' } })
 fireEvent.submit(screen.getByRole('button', { name: 'Save Email' }).closest('form')!)
 await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' }, { emailRedirectTo: 'https://organizer.test/auth/callback' }))
 fireEvent.click(screen.getByRole('button', { name: 'Log Out All Devices' }))
 const buttons = screen.getAllByRole('button', { name: 'Log Out All Devices' })
 fireEvent.click(buttons[buttons.length - 1])
 await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' }))
 expect(rpc).toHaveBeenCalledWith('manage_userscript_device', { p_action: 'revoke', p_id: 'browser' })
})
