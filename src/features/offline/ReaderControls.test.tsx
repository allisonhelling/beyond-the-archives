import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { CloudReaderBook, ReaderReport } from './storage'
import { blankMetadata } from '../library/model'
const mocks=vi.hoisted(()=>({readers:[] as ReaderReport[],connected:undefined as boolean|undefined,cloudBooks:[] as CloudReaderBook[],disconnect:vi.fn()}))
vi.mock('./OfflineProvider',()=>({useOffline:()=>({snapshot:{readers:mocks.readers,connected:mocks.connected,cloudBooks:mocks.cloudBooks},disconnect:mocks.disconnect})}))
vi.mock('./ConnectReader',()=>({ConnectReader:()=> <button>Open Reader</button>}))
import { ReadEpub, ReaderControls } from './ReaderControls'
beforeEach(()=>{mocks.readers=[];mocks.connected=undefined;mocks.cloudBooks=[];mocks.disconnect.mockReset().mockResolvedValue(undefined)})
const report=(id:string,works:string[]):ReaderReport=>({id,name:id,url:`https://${id}.example/`,works,reportedAt:'2026-11-01T00:00:00Z'})
it.each([[],[report('empty',[])],[report('other',['456'])]].map(readers=>[readers]))('hides Read EPUB when no reader reports this work',readers=>{
 mocks.readers=readers
 render(<MemoryRouter><ReadEpub workId={123} /><ReadEpub workId={123} variant="details" /></MemoryRouter>)
 expect(screen.queryByRole('link',{name:'Read EPUB'})).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'Unfolded'})).not.toBeInTheDocument()
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
 expect(screen.queryByRole('button',{name:'Open Reader'})).not.toBeInTheDocument()
 expect(screen.queryByRole('combobox',{name:'Reader Installation'})).not.toBeInTheDocument()
 expect(screen.getByText(/No downloaded or cloud-saved EPUBs are available yet/)).toBeVisible()
})
it('offers Open Reader only when the account has no reader connection',()=>{
 mocks.connected=false
 render(<MemoryRouter><ReaderControls hub /></MemoryRouter>)
 expect(screen.getByRole('button',{name:'Open Reader'})).toBeVisible()
 expect(screen.queryByRole('combobox',{name:'Reader Installation'})).not.toBeInTheDocument()
})

it.each(['workId','calibre_work_link'])('opens cloud-only works through %s in organizer tiles', source => {
 mocks.connected=true
 mocks.cloudBooks=[{id:'cloud-book',workId:source==='workId'?'123':null,metadata:{...blankMetadata,calibre_work_link:'https://archiveofourown.org/works/123/chapters/4'} as CloudReaderBook['metadata'],status:'to_read',notes:'',completedCount:0}]
 render(<MemoryRouter><ReadEpub workId={123} /><ReadEpub workId={123} variant="details" /><ReaderControls hub /></MemoryRouter>)
 expect(screen.getByRole('link',{name:'Open in Reader'})).toHaveAttribute('href',expect.stringContaining('?work=123'))
 expect(screen.getByRole('link',{name:'Unfolded'})).toHaveAttribute('href',expect.stringContaining('?work=123'))
 expect(screen.queryByRole('link',{name:'Read EPUB'})).not.toBeInTheDocument()
 expect(screen.getByText(/1 work saved in the reader cloud/)).toBeVisible()
})
it('disconnects the account instead of only clearing the retained hub', async () => {
 mocks.connected=true
 render(<MemoryRouter><ReaderControls hub /></MemoryRouter>)
 expect(screen.queryByRole('button',{name:'Clear Retained Hub'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Disconnect Reader'}))
 await waitFor(()=>expect(mocks.disconnect).toHaveBeenCalledOnce())
 expect(await screen.findByText('Reader disconnected. Books and reading data are preserved.')).toBeVisible()
})

it('opens an unidentified cloud EPUB by its saved book identity', () => {
 const id='b'.repeat(64)
 mocks.connected=true
 mocks.cloudBooks=[{id,workId:null,metadata:{} as CloudReaderBook['metadata'],status:'to_read',notes:'',completedCount:0}]
 render(<MemoryRouter><ReadEpub workId={null} bookId={id} /></MemoryRouter>)
 expect(screen.getByRole('link',{name:'Open in Reader'})).toHaveAttribute('href',expect.stringContaining(`?book=${id}`))
})

it('uses the matching reader and requested chapter for the shared spine shortcut', async () => {
 mocks.connected=true
 mocks.readers=[report('missing',[]),report('downloaded',['123'])]
 render(<MemoryRouter><ReadEpub workId={123} variant="spine" chapter={4} /></MemoryRouter>)
 const link=screen.getByRole('link',{name:'Read Chapter 4 in EPUB'})
 expect(link).toHaveAttribute('href','https://downloaded.example/?work=123&chapter=4')
 expect(link).toHaveClass('spine-action')
 fireEvent.focus(link)
 expect(await screen.findByRole('tooltip')).toHaveTextContent('Read Chapter 4 in EPUB')
})

it('opens individual work tiles through an uploaded cloud anthology without a download report', () => {
 mocks.connected=true
 mocks.cloudBooks=[{id:'a'.repeat(64),workId:null,workCount:2,workIds:['123','456'],metadata:blankMetadata,status:'reading',notes:'',completedCount:1}]
 render(<MemoryRouter><ReadEpub workId={123} variant="spine" chapter={2} /><ReadEpub workId={456} /><ReaderControls hub /></MemoryRouter>)
 expect(screen.getByRole('link',{name:'Read Chapter 2 in EPUB'})).toHaveAttribute('href',expect.stringContaining('?work=123&chapter=2'))
 expect(screen.getByRole('link',{name:'Open in Reader'})).toHaveAttribute('href',expect.stringContaining('?work=456'))
 expect(screen.getByText(/2 works saved in the reader cloud/)).toBeVisible()
})
