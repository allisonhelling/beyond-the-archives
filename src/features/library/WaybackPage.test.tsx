import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))
import { WaybackLink, WaybackPage } from './WaybackPage'
const base = 'https://archiveofourown.org/works/123'
function page(url = base) { return render(<MemoryRouter initialEntries={[`/wayback?${new URLSearchParams({ url })}`]}><WaybackPage /></MemoryRouter>) }
beforeEach(() => mocks.invoke.mockReset())
it('offers a new-tab action only for supported AO3 work identities', () => {
 render(<MemoryRouter><WaybackLink url={base} menu /><WaybackLink url="https://evil.test/works/123" /></MemoryRouter>)
 const link = screen.getByRole('link', { name: 'Open in Wayback Machine' })
 expect(link).toHaveTextContent('Open in Wayback Machine')
 expect(link.querySelector('svg')).toBeInTheDocument()
 expect(link).toHaveAttribute('target', '_blank')
 expect(link).toHaveAttribute('rel', 'noreferrer')
 expect(link.getAttribute('href')).toContain('/wayback?url=')
 expect(screen.getAllByRole('link')).toHaveLength(1)
})
it('provides a calendar fallback and retry after a bounded lookup finds no usable capture', async () => {
 mocks.invoke.mockResolvedValue({ data: { kind: 'calendar', reason: 'unverified' }, error: null })
 page()
 expect(await screen.findByText(/No usable page was found/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'Browse Snapshot Calendar' })).toHaveAttribute('href', `https://web.archive.org/web/*/${base}`)
 fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
 await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2))
})
it('rejects an archive link to another work or an external host', async () => {
 mocks.invoke.mockResolvedValue({ data: { kind: 'work', url: 'https://web.archive.org/web/20260101000000/https://archiveofourown.org/works/456' }, error: null })
 page()
 expect(await screen.findByText(/unexpected link/)).toBeVisible()
})
it('handles a missing function or unavailable service without claiming there are no snapshots', async () => {
 mocks.invoke.mockResolvedValue({ data: null, error: new Error('Unavailable') })
 page()
 expect(await screen.findByText(/Could not check Wayback Machine/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'Browse Snapshot Calendar' })).toBeVisible()
})
it('does not request unsupported input', async () => {
 page('https://evil.test/works/123')
 expect(await screen.findByText(/does not identify an AO3 work/)).toBeVisible()
 expect(mocks.invoke).not.toHaveBeenCalled()
 expect(screen.queryByRole('link', { name: 'Browse Snapshot Calendar' })).not.toBeInTheDocument()
})
