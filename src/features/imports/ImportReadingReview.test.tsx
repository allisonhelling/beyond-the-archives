import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const rpc=vi.hoisted(()=>vi.fn())
vi.mock('./import-reading-review',()=>({reviewImportReading:rpc}))
import { ImportReadingReview } from './ImportReadingReview'
const review=(id:string)=>({id,title:`Work ${id}`,source:'legacy_unknown',savedProgressKnown:false,progressKnown:true,saved:{status:'to_read',progress:0,startedAt:null,finishedAt:null},proposed:{status:'finished',progress:3,startedAt:null,finishedAt:'2026-10-20T00:00:00Z'}})
beforeEach(()=>{rpc.mockReset().mockResolvedValue({reviews:[review('a'),review('b')],total:2,changed:0,skipped:0})})
it('shows unknown progress without claiming a confirmed zero and changes nothing until explicit acceptance',async()=>{
 const changed=vi.fn(async()=>{})
 render(<MemoryRouter><ImportReadingReview onChanged={changed} /></MemoryRouter>)
 expect(rpc).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Review Reading Corrections'}))
 expect(await screen.findByRole('table')).toBeVisible()
 expect(screen.getAllByText('Chapter progress unconfirmed')).toHaveLength(2)
 expect(changed).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('checkbox',{name:'Select Correction for Work a'}))
 rpc.mockResolvedValue({reviews:[review('b')],total:1,changed:1,skipped:0})
 fireEvent.click(screen.getByRole('button',{name:'Accept Selected Corrections'}))
 await waitFor(()=>expect(rpc).toHaveBeenLastCalledWith(['a'],'accept',1))
 await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1))
 expect(screen.getByText('1 corrections accepted.')).toBeVisible()
})
it('keeps all selected histories and surfaces review failures without claiming success',async()=>{
 render(<MemoryRouter><ImportReadingReview onChanged={vi.fn(async()=>{})} /></MemoryRouter>)
 fireEvent.click(screen.getByRole('button',{name:'Review Reading Corrections'}));await screen.findByRole('table')
 fireEvent.click(screen.getByRole('button',{name:'Select All on This Page'}))
 rpc.mockRejectedValue(new Error('Connection failed'))
 fireEvent.click(screen.getByRole('button',{name:'Keep Selected Reading History'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed')
 expect(rpc).toHaveBeenLastCalledWith(['a','b'],'keep',1)
 expect(screen.getByRole('table')).toBeVisible()
})
