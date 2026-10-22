import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('../../lib/sample-mode',()=>({sampleMode:false}))
import { UserscriptSettings } from './UserscriptSettings'
afterEach(()=>vi.unstubAllGlobals())
it('copies a newly created pairing code on click or Enter and preserves it if copying fails',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined)
 vi.stubGlobal('navigator',{clipboard:{writeText}})
 mocks.rpc.mockImplementation((_name:string,args:{p_action:string})=>Promise.resolve({data:args.p_action==='create'?{code:'test-pairing-code'}:[],error:null}))
 render(<MemoryRouter><UserscriptSettings /></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Create pairing code'}))
 const input=await screen.findByLabelText('One-time pairing code')
 fireEvent.click(input)
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Pairing code copied.'))
 expect(writeText).toHaveBeenCalledWith('test-pairing-code')
 writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
 fireEvent.keyDown(input,{key:'Enter'})
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('copy it manually'))
 expect(input).toHaveValue('test-pairing-code')
})
