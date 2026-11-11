import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({connect:vi.fn(),id:vi.fn()}))
vi.mock('./extension',async original=>({...await original<typeof import('./extension')>(),extensionId:()=>'',setExtensionId:mocks.id,connectExtension:mocks.connect}))
import { MetadataSettings } from './MetadataSettings'
beforeEach(()=>{vi.clearAllMocks();mocks.connect.mockResolvedValue(true)})
it('shows connection settings with no obsolete retrieval modes',()=>{
 render(<MetadataSettings />)
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
 expect(screen.getByText(/On mobile, open an AO3 work/)).toBeVisible()
 expect(screen.getByLabelText(/^Extension ID/)).toBeEnabled()
})
it('reconnects the configured companion without saving retrieval preferences',async()=>{
 render(<MetadataSettings />)
 fireEvent.change(screen.getByLabelText(/^Extension ID/),{target:{value:'a'.repeat(32)}})
 fireEvent.click(screen.getByRole('button',{name:'Reconnect Extension'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Extension connected.'))
 expect(mocks.id).toHaveBeenCalledWith('a'.repeat(32))
 expect(mocks.connect).toHaveBeenCalledOnce()
})
it('explains incompatible or disconnected companions',async()=>{
 mocks.connect.mockResolvedValue(false)
 render(<MetadataSettings />)
 fireEvent.click(screen.getByRole('button',{name:'Reconnect Extension'}))
 expect(await screen.findByRole('status')).toHaveTextContent('Update and reload the companion')
})
