import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineSnapshot } from './storage'
import { exampleWork } from '../library/display/display-examples'
import { BrowsingSettings } from '../library/browsing/BrowsingSettings'
import { displaySettingsKey, offlineReadingPriority } from '../library/display/display-settings'
import { ReadOffline } from './ReadOffline'
const mocks = vi.hoisted(() => ({ snapshot: undefined as OfflineSnapshot | undefined }))
vi.mock('./OfflineProvider', () => ({ useOffline: () => ({ snapshot: mocks.snapshot }) }))
beforeEach(() => {
 const values = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
 mocks.snapshot = undefined
})
afterEach(() => vi.unstubAllGlobals())
const bookfusion = { url: 'https://www.bookfusion.com/reader/123', kind: 'book' as const }
function reader() {
 mocks.snapshot = { userId: exampleWork.user_id, savedAt: '2026-11-12T00:00:00Z', stories: [],
  readers: [{ id: 'reader', name: 'Reader', url: 'https://reader.example/', works: [String(exampleWork.work.ao3_work_id)], reportedAt: '2026-11-12T00:00:00Z' }] }
}

it('disables unavailable work destinations while retaining the Read Offline hover description', async () => {
 render(<MemoryRouter><ReadOffline story={exampleWork} /></MemoryRouter>)
 const button = screen.getByRole('button', { name: 'Read Offline' })
 expect(button).toBeDisabled()
 expect(screen.queryByRole('link', { name: 'Read Offline' })).not.toBeInTheDocument()
 fireEvent.mouseEnter(button.parentElement!)
 expect(await screen.findByRole('tooltip')).toHaveTextContent('Read Offline')
})

it('opens whichever single platform is available and uses the matching reader destination', () => {
 reader()
 const view = render(<MemoryRouter><ReadOffline story={exampleWork} /></MemoryRouter>)
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', `https://reader.example/?work=${exampleWork.work.ao3_work_id}`)
 mocks.snapshot = undefined
 view.rerender(<MemoryRouter><ReadOffline story={{ ...exampleWork, metadata: { ...exampleWork.metadata, bookfusion_link: bookfusion } }} /></MemoryRouter>)
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', bookfusion.url)
})

it('updates both-available destinations immediately from settings and preserves the priority on remount', () => {
 reader()
 localStorage.setItem(displaySettingsKey, JSON.stringify({ summaryMode: 'collapsed' }))
 const story = { ...exampleWork, metadata: { ...exampleWork.metadata, bookfusion_link: bookfusion } }
 const view = render(<MemoryRouter><BrowsingSettings /><ReadOffline story={story} /></MemoryRouter>)
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', `https://reader.example/?work=${story.work.ao3_work_id}`)
 fireEvent.change(screen.getByLabelText('Read Offline Priority'), { target: { value: 'bookfusion' } })
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', bookfusion.url)
 expect(JSON.parse(localStorage.getItem(displaySettingsKey)!)).toMatchObject({ summaryMode: 'collapsed', offlineReadingPriority: 'bookfusion' })
 view.unmount()
 render(<MemoryRouter><ReadOffline story={story} /></MemoryRouter>)
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', bookfusion.url)
})

it('rejects unsafe links and disconnected reports, falling back from an unavailable preferred platform', () => {
 reader()
 localStorage.setItem(displaySettingsKey, JSON.stringify({ offlineReadingPriority: 'bookfusion' }))
 const story = { ...exampleWork, metadata: { ...exampleWork.metadata, bookfusion_link: { ...bookfusion, url: 'javascript:alert(1)' } } }
 const view = render(<MemoryRouter><ReadOffline story={story} /></MemoryRouter>)
 expect(screen.getByRole('link', { name: 'Read Offline' })).toHaveAttribute('href', `https://reader.example/?work=${story.work.ao3_work_id}`)
 mocks.snapshot!.connected = false
 view.rerender(<MemoryRouter><ReadOffline story={story} /></MemoryRouter>)
 expect(screen.getByRole('button', { name: 'Read Offline' })).toBeDisabled()
 expect(offlineReadingPriority('{')).toBe('unfolded')
 expect(offlineReadingPriority('{"offlineReadingPriority":"unknown"}')).toBe('unfolded')
})

it('reports storage failure without changing the saved priority', () => {
 render(<MemoryRouter><BrowsingSettings /></MemoryRouter>)
 vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
 fireEvent.change(screen.getByLabelText('Read Offline Priority'), { target: { value: 'bookfusion' } })
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save the offline reader priority')
 expect(screen.getByLabelText('Read Offline Priority')).toHaveValue('unfolded')
})
