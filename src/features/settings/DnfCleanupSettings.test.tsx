import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultCleanupSettings, type CleanupResult } from './dnf-cleanup'
import { DnfCleanupSettings } from './DnfCleanupSettings'

const mocks = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn() }))
vi.mock('./dnf-cleanup', async original => ({ ...await original<typeof import('./dnf-cleanup')>(), cleanupRequest: mocks.request }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: 'alice' } } }) }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.refresh }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
let result: CleanupResult
beforeEach(() => {
 vi.clearAllMocks()
 result = { settings: { ...defaultCleanupSettings }, eligible: 1, protected: 2, waiting: 3, removed: 0 }
 mocks.request.mockImplementation(async (action: string, input?: { settings: typeof defaultCleanupSettings }) => {
  if (action === 'save') result = { ...result, settings: input!.settings }
  if (action === 'preview') return { ...result, entries: [{ id: 'entry', version: 'version', title: 'A DNF fic', dnf_since: '2026-10-01T00:00:00Z', eligible_at: '2026-10-08T00:00:00Z' }] }
  if (action === 'cleanup') return { ...result, eligible: 0, removed: 1 }
  if (action === 'archive') return { total: 1, records: [{ id: 'entry', metadata: { title: 'Archived fic', authors: ['Writer'] }, ao3_work_id: 123, last_read_chapter: 2, dnf_since: '2026-10-01T00:00:00Z', archived_at: '2026-10-08T00:00:00Z' }] }
  return result
 })
 mocks.refresh.mockResolvedValue(undefined)
})
async function show() {
 render(<MemoryRouter><DnfCleanupSettings /></MemoryRouter>)
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled())
}

it('loads the seven-day default and requested presets, validates custom units, and saves account settings', async () => {
 await show()
 const duration = screen.getByLabelText('Clean Up After')
 expect(duration).toHaveValue('168')
 expect(within(duration).getAllByRole('option').map(option => option.textContent)).toEqual(['24 Hours', '7 Days', '30 Days', '60 Days', 'Custom Duration'])
 expect(screen.getByLabelText('Automatically Clean Up DNF Fics')).not.toBeChecked()
 fireEvent.change(duration, { target: { value: 'custom' } })
 fireEvent.change(screen.getByLabelText('Custom Unit'), { target: { value: 'hours' } })
 fireEvent.change(screen.getByLabelText('Custom Amount'), { target: { value: '23' } })
 expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Custom Amount'), { target: { value: '49' } })
 expect(screen.getByRole('button', { name: 'Preview Cleanup' })).toBeDisabled()
 fireEvent.click(screen.getByLabelText('Automatically Clean Up DNF Fics'))
 fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
 await screen.findByText('DNF cleanup settings saved.')
 expect(mocks.request).toHaveBeenCalledWith('save', { settings: { ...defaultCleanupSettings, hours: 49, enabled: true }, base: defaultCleanupSettings })
 expect(screen.getByLabelText('Custom Amount')).toHaveValue(49)
 fireEvent.change(screen.getByLabelText('Custom Amount'), { target: { value: '' } })
 fireEvent.change(duration, { target: { value: '24' } })
 expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled()
})

it('previews before confirming removal and refreshes the library after archive preservation', async () => {
 await show()
 fireEvent.click(screen.getByRole('button', { name: 'Preview Cleanup' }))
 await screen.findByText('A DNF fic')
 expect(mocks.request).not.toHaveBeenCalledWith('cleanup', expect.anything())
 fireEvent.click(screen.getByRole('button', { name: 'Clean Up Now' }))
 const dialog = screen.getByRole('dialog')
 fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
 expect(mocks.request).not.toHaveBeenCalledWith('cleanup', expect.anything())
 fireEvent.click(screen.getByRole('button', { name: 'Clean Up Now' }))
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clean Up Now' }))
 await screen.findByText('Cleaned up 1 fics. Their compact reading records were preserved.')
 expect(mocks.request).toHaveBeenCalledWith('cleanup', { settings: defaultCleanupSettings, entries: [expect.objectContaining({ id: 'entry', version: 'version' })] })
 expect(mocks.refresh).toHaveBeenCalledOnce()
})

it('invalidates preview when protections change and keeps drafts after a save conflict', async () => {
 await show()
 fireEvent.click(screen.getByRole('button', { name: 'Preview Cleanup' }))
 await screen.findByText('A DNF fic')
 fireEvent.click(screen.getByLabelText('Favorites and Recommendations'))
 expect(screen.queryByText('A DNF fic')).not.toBeInTheDocument()
 mocks.request.mockRejectedValueOnce(new Error('Settings changed on another device.'))
 fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('changed on another device')
 expect(screen.getByLabelText('Favorites and Recommendations')).not.toBeChecked()
 fireEvent.click(screen.getByRole('button', { name: 'Reload Saved Settings' }))
 await waitFor(() => expect(screen.getByLabelText('Favorites and Recommendations')).toBeChecked())
})

it('shows compact archived reading activity and an explicit add-again link', async () => {
 await show()
 fireEvent.click(screen.getByRole('button', { name: 'View Archived Reading Activity' }))
 await screen.findByText('Archived fic')
 expect(screen.getByRole('link', { name: 'Add Again' })).toHaveAttribute('href', '/add')
 expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
 expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})
