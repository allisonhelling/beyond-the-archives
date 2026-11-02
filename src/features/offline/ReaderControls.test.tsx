import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReaderReport } from './storage'
const mocks=vi.hoisted(()=>({readers:[] as ReaderReport[],connected:undefined as boolean|undefined}))
vi.mock('./OfflineProvider',()=>({useOffline:()=>({snapshot:{readers:mocks.readers,connected:mocks.connected}})}))
vi.mock('./ConnectReader',()=>({ConnectReader:()=> <button>Connect Reader</button>}))
import { ReadEpub, ReaderControls } from './ReaderControls'
beforeEach(()=>{mocks.readers=[];mocks.connected=undefined})
const report=(id:string,works:string[]):ReaderReport=>({id,name:id,url:`https://${id}.example/`,works,reportedAt:'2026-11-01T00:00:00Z'})
it.each([[],[report('empty',[])],[report('other',['456'])]].map(readers=>[readers]))('hides Read EPUB when no reader reports this work',readers=>{
 mocks.readers=readers
 render(<MemoryRouter><ReadEpub workId={123} /></MemoryRouter>)
 expect(screen.queryByRole('link',{name:'Read EPUB'})).not.toBeInTheDocument()
})
it('chooses only readers that have the EPUB even when another reader is selected',()=>{
 mocks.readers=[report('missing',[]),report('first',['123']),report('second',['123'])]
 render(<MemoryRouter initialEntries={['/?reader=missing']}><ReadEpub workId={123} /></MemoryRouter>)
 expect(screen.getByRole('link',{name:'Read EPUB'})).toHaveAttribute('href','https://first.example/?work=123')
 expect(screen.getAllByRole('option').map(option=>option.textContent)).toEqual(['first','second'])
})

it('hides connection and installation controls when the reader account is connected before its first report',()=>{
 mocks.connected=true
 render(<MemoryRouter><ReaderControls hub /></MemoryRouter>)
 expect(screen.getByRole('heading',{name:'Connected Reader'})).toBeVisible()
 expect(screen.queryByRole('button',{name:'Connect Reader'})).not.toBeInTheDocument()
 expect(screen.queryByRole('combobox',{name:'Reader Installation'})).not.toBeInTheDocument()
 expect(screen.getByText(/No downloaded EPUBs have been reported yet/)).toBeVisible()
})
it('offers Connect Reader only when the account has no reader connection',()=>{
 mocks.connected=false
 render(<MemoryRouter><ReaderControls hub /></MemoryRouter>)
 expect(screen.getByRole('button',{name:'Connect Reader'})).toBeVisible()
 expect(screen.queryByRole('combobox',{name:'Reader Installation'})).not.toBeInTheDocument()
})
