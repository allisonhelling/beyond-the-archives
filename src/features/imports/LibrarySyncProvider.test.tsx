import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StrictMode } from 'react'
const mocks = vi.hoisted(() => ({ command: vi.fn() }))
vi.mock('./extension', () => ({ librarySyncCommand: mocks.command }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
import { LibrarySyncProvider, useLibrarySyncStatus } from './LibrarySyncProvider'
const paused = { id: 'scan', pages: 3, status: 'paused', error: 'AO3 is limiting requests.', attention: 'rate_limit', attentionId: 'pause-1' }
function Page() { const { refresh } = useLibrarySyncStatus(); return <><p>Library page</p><button onClick={() => void refresh()}>Refresh status</button></> }
function show() { render(<MemoryRouter initialEntries={['/library']}><LibrarySyncProvider><Page /></LibrarySyncProvider></MemoryRouter>) }
beforeEach(() => { vi.clearAllMocks(); mocks.command.mockResolvedValue({ state: paused }) })
it('loads the initial scan after StrictMode effect replay without waiting for another poll', async () => {
 render(<StrictMode><MemoryRouter><LibrarySyncProvider><Page /></LibrarySyncProvider></MemoryRouter></StrictMode>)
 expect(await screen.findByRole('dialog', { name: 'AO3 Request Restriction' })).toBeVisible()
 expect(mocks.command).toHaveBeenCalledTimes(1)
})
it('alerts on other app pages and opens the specific scan tab through the extension', async () => {
 show()
 expect(await screen.findByRole('dialog', { name: 'AO3 Request Restriction' })).toBeVisible()
 fireEvent.click(screen.getByRole('button', { name: 'Open Tab' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('open-tab', { scanId: 'scan' }))
 expect(mocks.command.mock.calls.some(([action]) => action === 'resume')).toBe(false)
})
it('keeps a dismissed alert closed while polling and alerts again on the next interruption', async () => {
 show(); await screen.findByRole('dialog')
 fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
 fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
 await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 mocks.command.mockResolvedValue({ state: { ...paused, attention: 'login', attentionId: 'pause-2', error: 'Sign in to AO3.' } })
 fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
 expect(await screen.findByRole('dialog', { name: 'AO3 Sign-In Required' })).toBeVisible()
})
it('does not interrupt a manually paused scan and gives guidance if the scan tab was closed', async () => {
 mocks.command.mockResolvedValueOnce({ state: { ...paused, error: '' } })
 show(); await waitFor(() => expect(mocks.command).toHaveBeenCalled())
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
 await screen.findByRole('dialog')
 mocks.command.mockRejectedValueOnce(new Error('The scan tab was closed. Resume the scan.'))
 fireEvent.click(screen.getByRole('button', { name: 'Open Tab' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('scan tab was closed')
})
it.each(['safety_limit', 'page_error'])('gives recovery guidance for current and legacy safety-limit scans: %s', async attention => {
 mocks.command.mockResolvedValue({ state: { ...paused, attention, error: 'Reached the 500-page safety limit. Discard this incomplete scan.' } })
 show()
 expect(await screen.findByRole('dialog', { name: 'AO3 Scan Limit Reached' })).toBeVisible()
 expect(screen.getByText(/choose Prepare Saved Batch/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'Review Scan' })).toHaveAttribute('href', '/imports')
 expect(screen.queryByRole('button', { name: 'Open Tab' })).not.toBeInTheDocument()
 expect(screen.queryByText(/Your scan is paused and saved pages are preserved/)).not.toBeInTheDocument()
})
