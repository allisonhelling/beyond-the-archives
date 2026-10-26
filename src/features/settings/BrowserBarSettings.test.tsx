import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('../../lib/sample-mode',()=>({sampleMode:false}))
import { BrowserBarSettings } from './BrowserBarSettings'
afterEach(()=>vi.unstubAllGlobals())
it('copies a newly created pairing code on click or Enter and preserves it if copying fails',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined)
 vi.stubGlobal('navigator',{clipboard:{writeText}})
 mocks.rpc.mockImplementation((_name:string,args:{p_action:string})=>Promise.resolve({data:args.p_action==='create'?{code:'test-pairing-code'}:[],error:null}))
 render(<MemoryRouter><BrowserBarSettings /></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Create Pairing Code'}))
 const input=await screen.findByLabelText('One-Time Pairing Code')
 fireEvent.click(input)
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Pairing code copied.'))
 expect(writeText).toHaveBeenCalledWith('test-pairing-code')
 writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
 fireEvent.keyDown(input,{key:'Enter'})
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('copy it manually'))
 expect(input).toHaveValue('test-pairing-code')
})

it('shows connected devices without expiry and still allows manual disconnection', async () => {
 const devices = [{ id: 'paired-device', name: 'My Browser', paired: true, expires_at: null }, { id: 'pending-device', name: 'New Browser', paired: false, expires_at: '2026-10-26T12:05:00Z' }]
 mocks.rpc.mockImplementation((_name: string, args: { p_action: string }) => Promise.resolve({ data: args.p_action === 'revoke' ? devices.slice(1) : devices, error: null }))
 render(<MemoryRouter><BrowserBarSettings /></MemoryRouter>)
 expect(await screen.findByText(/My Browser · Connected · Until disconnected/)).toBeVisible()
 expect(screen.getByText(/New Browser · Awaiting pairing · expires/)).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: 'Disconnect My Browser' }))
 await waitFor(() => expect(screen.queryByRole('button', { name: 'Disconnect My Browser' })).not.toBeInTheDocument())
 expect(mocks.rpc).toHaveBeenLastCalledWith('manage_userscript_device', { p_action: 'revoke', p_name: 'My browser', p_id: 'paired-device' })
})
