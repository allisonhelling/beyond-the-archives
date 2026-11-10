import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import type { Database } from '../../types/database'
import { UsernameSettings } from './UsernameSettings'

it('loads and saves the signed-in user’s username and reports conflicts',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:null,error:null})
 const client={rpc} as unknown as SupabaseClient<Database>
 render(<UsernameSettings client={client} />)
 const input=screen.getByLabelText('Account Username'),user=userEvent.setup()
 await waitFor(()=>expect(input).toBeEnabled())
 expect(input).toHaveAttribute('readonly')
 await user.click(screen.getByRole('button',{name:'Edit'}))
 const draft=screen.getByLabelText('New Username')
 await user.type(draft,'Reader')
 rpc.mockResolvedValueOnce({data:null,error:{code:'23505',message:'private database details'}})
 await user.click(screen.getByRole('button',{name:'Save Username'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('That username is already taken.')
 expect(screen.queryByText('private database details')).not.toBeInTheDocument()
 await user.clear(draft);await user.type(draft,'NewReader')
 rpc.mockResolvedValueOnce({data:'NewReader',error:null})
 await user.click(screen.getByRole('button',{name:'Save Username'}))
 expect(await screen.findByRole('status')).toHaveTextContent('Username saved.')
 expect(rpc).toHaveBeenLastCalledWith('manage_account_username',{p_username:'NewReader'})
 expect(input).toHaveValue('NewReader')
})

it('disables unavailable account settings without requesting a username',()=>{
 const rpc=vi.fn(),client={rpc} as unknown as SupabaseClient<Database>
 render(<UsernameSettings client={client} disabled />)
 expect(screen.getByLabelText('Account Username')).toBeDisabled()
 expect(screen.getByRole('button',{name:'Edit'})).toBeDisabled()
 expect(rpc).not.toHaveBeenCalled()
})
