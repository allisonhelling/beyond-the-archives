import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ submit: vi.fn(), history: vi.fn(), refresh: vi.fn(), preview: vi.fn() }))
vi.mock('./repository', () => ({ submitImport: mocks.submit, importHistory: mocks.history, previewSeries: mocks.preview }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.refresh, refreshSeries: mocks.refresh }) }))
import { ImportLinkForm } from './ImportLinkForm'

function show() {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<ImportLinkForm />} />
    <Route path="/imports" element={<h1>Choose series works</h1>} />
    <Route path="/stories/entry" element={<h1>Saved fic metadata</h1>} />
  </Routes></MemoryRouter>)
}
async function submit() {
  fireEvent.change(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' }), { target: { value: 'https://archiveofourown.org/works/123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Import from Link' }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.submit.mockResolvedValue('batch')
  mocks.refresh.mockResolvedValue(undefined)
  mocks.history.mockResolvedValue({ items: [] })
  mocks.preview.mockResolvedValue({ seriesId:77, normalizedUrl:'https://archiveofourown.org/series/77', title:'Series title', description:'', works:[{workId:101,url:'https://archiveofourown.org/works/101',position:1,title:'First fic',authors:['Author'],summary:'A summary',tags:[],wordCount:1,chapters:'1/1',complete:true}] })
})
afterEach(() => { vi.useRealTimers() })
it('validates a single AO3 link and retains it if submission fails', async () => {
  show()
  fireEvent.change(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' }), { target: { value: 'https://example.com/works/123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Import from Link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a supported AO3 work URL')
  expect(mocks.submit).not.toHaveBeenCalled()
  mocks.submit.mockRejectedValue(new Error('Import unavailable'))
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('Import unavailable')
  expect(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' })).toHaveValue('https://archiveofourown.org/works/123')
})
it('submits the complete chapter URL so retrieval can verify reading progress', async () => {
  show()
  const url = 'https://archiveofourown.org/works/123/chapters/960?view_adult=true'
  fireEvent.change(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' }), { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: 'Import from Link' }))
  await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(url))
})
it('opens the saved fic while retrieval is pending', async () => {
  mocks.history.mockResolvedValue({ items: [{ entry_id: 'entry', status: 'pending' }] })
  let finishRefresh!: () => void
  mocks.refresh.mockReturnValue(new Promise<void>(resolve => { finishRefresh = resolve }))
  show(); await submit()
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('heading', { name: 'Saved fic metadata' })).not.toBeInTheDocument()
  await act(async () => { finishRefresh() })
  expect(await screen.findByRole('heading', { name: 'Saved fic metadata' })).toBeVisible()
  expect(mocks.history).toHaveBeenCalledWith('batch')
})
it('retries library loading before opening the saved fic', async () => {
  vi.useFakeTimers()
  mocks.history.mockResolvedValue({ items: [{ entry_id: 'entry', status: 'completed' }] })
  mocks.refresh.mockRejectedValueOnce(new Error('Offline'))
  show(); await act(async () => { await submit() })
  expect(screen.getByRole('alert')).toHaveTextContent('Could not check this import')
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(screen.getByRole('heading', { name: 'Saved fic metadata' })).toBeVisible()
})
it('keeps checking until the saved entry is available', async () => {
  vi.useFakeTimers()
  show(); await act(async () => { await submit() })
  expect(screen.getByRole('status')).toHaveTextContent('Retrieving metadata')
  mocks.history.mockResolvedValue({ items: [{ entry_id: 'entry', status: 'processing' }] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.getByRole('heading', { name: 'Saved fic metadata' })).toBeVisible()
})
it('shows an unsuccessful import without a saved entry', async () => {
  mocks.history.mockResolvedValue({ items: [{ entry_id: null, status: 'failed', error_message: 'Invalid work.' }] })
  show(); await submit()
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No saved fic was available'))
  expect(screen.getByText('Invalid work.')).toBeVisible()
})

it('reviews a series in place without creating a work',async()=>{
 show()
 fireEvent.change(screen.getByRole('textbox',{name:'AO3 Work or Series Link'}),{target:{value:'https://archiveofourown.org/series/77'}})
 fireEvent.click(screen.getByRole('button',{name:'Import from Link'}))
 expect(await screen.findByRole('heading',{name:'Choose Works From Series'})).toBeVisible()
 expect(mocks.submit).not.toHaveBeenCalled()
 expect(screen.queryByRole('heading',{name:'Choose series works'})).not.toBeInTheDocument()
 fireEvent.click((await screen.findAllByRole('button', { name: 'Show Series Works' }))[0])
 expect(await screen.findByRole('checkbox',{name:'Part 1: First fic'})).not.toBeChecked()
 expect(screen.getByRole('combobox',{name:'Reading Status'})).toHaveValue('to_read')
 fireEvent.change(screen.getByRole('combobox',{name:'Reading Status'}),{target:{value:'finished'}})
 fireEvent.click(screen.getByRole('checkbox',{name:'Part 1: First fic'}))
 fireEvent.click(screen.getByRole('button',{name:'Import Selected'}))
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith('https://archiveofourown.org/works/101',true,'finished',[77]))
 expect(screen.getByRole('heading',{name:'Importing Selected Works'})).toBeVisible()
})

it('submits the complete Wayback work link instead of replacing it with live AO3', async () => {
 show()
 const url = 'https://web.archive.org/web/20251007001146/https://archiveofourown.org/works/17199254?view_full_work=true'
 fireEvent.change(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' }), { target: { value: url } })
 expect(screen.getByRole('combobox', { name: 'Import Source' })).toHaveValue('wayback')
 fireEvent.click(screen.getByRole('button', { name: 'Import from Wayback Machine' }))
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(url))
})

it('offers a Wayback source option and requires a full snapshot rather than a live link', async () => {
 show()
 const source = screen.getByRole('combobox', { name: 'Import Source' })
 expect(source).toHaveValue('ao3')
 fireEvent.change(source, { target: { value: 'wayback' } })
 const input = screen.getByRole('textbox', { name: 'Wayback Machine Link' })
 for (const url of ['https://archiveofourown.org/works/123', 'https://web.archive.org/web/*/https://archiveofourown.org/works/123']) {
  fireEvent.change(input, { target: { value: url } })
  fireEvent.click(screen.getByRole('button', { name: 'Import from Wayback Machine' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('including its 14-digit capture timestamp')
 }
 expect(mocks.submit).not.toHaveBeenCalled()
 fireEvent.change(source, { target: { value: 'ao3' } })
 expect(screen.getByRole('textbox', { name: 'AO3 Work or Series Link' })).toBeVisible()
})
