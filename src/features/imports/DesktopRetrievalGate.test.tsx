import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({connect:vi.fn()}))
vi.mock('./extension',async original=>({...await original<typeof import('./extension')>(),connectExtension:mocks.connect}))
import { DesktopRetrievalGate } from './DesktopRetrievalGate'
beforeEach(()=>{vi.clearAllMocks()})
it.each([390,1440])('blocks import controls without a compatible connection at width %s and permits reconnect',async width=>{
 Object.defineProperty(window,'innerWidth',{configurable:true,value:width})
 mocks.connect.mockResolvedValue(false)
 render(<MemoryRouter><DesktopRetrievalGate><button>Import URLs</button></DesktopRetrievalGate><p>Import History</p></MemoryRouter>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Check Connection'})).toBeEnabled())
 expect(screen.queryByRole('button',{name:'Import URLs'})).not.toBeInTheDocument()
 expect(screen.getByText('Import History')).toBeVisible()
 expect(screen.getByText(/On mobile, open an AO3 work/)).toBeVisible()
 mocks.connect.mockResolvedValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Check Connection'}))
 expect(await screen.findByRole('button',{name:'Import URLs'})).toBeEnabled()
})
it('retains in-progress form state across disconnection and reconnection',async()=>{
 mocks.connect.mockResolvedValue(true)
 render(<MemoryRouter><DesktopRetrievalGate><input aria-label="Import Draft" defaultValue="" /></DesktopRetrievalGate></MemoryRouter>)
 const input=await screen.findByRole('textbox',{name:'Import Draft'})
 fireEvent.change(input,{target:{value:'Keep my selection'}})
 mocks.connect.mockResolvedValue(false)
 fireEvent.focus(window)
 await waitFor(()=>expect(screen.getByRole('button',{name:'Check Connection'})).toBeEnabled())
 expect(input).not.toBeVisible()
 mocks.connect.mockResolvedValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Check Connection'}))
 await waitFor(()=>expect(input).toBeVisible())
 expect(input).toHaveValue('Keep my selection')
})
