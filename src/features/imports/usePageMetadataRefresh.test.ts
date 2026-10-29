import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Story } from '../library/model'
import { usePageMetadataRefresh } from './usePageMetadataRefresh'

const mocks = vi.hoisted(() => ({ submit: vi.fn(), history: vi.fn(), refresh: vi.fn() }))
vi.mock('./repository', () => ({ submitImport: mocks.submit, importHistory: mocks.history }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.refresh }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
const story = (id: number | null) => ({ id: `entry-${id}`, work: { ao3_work_id: id } }) as Story
beforeEach(() => {
  vi.clearAllMocks()
  mocks.submit.mockResolvedValue('batch-1')
  mocks.refresh.mockResolvedValue(undefined)
  mocks.history.mockResolvedValue({ batches: [{ id: 'batch-1' }], items: [], jobs: [], summary: { total: 2, active: true, counts: {} } })
})

it('queues only the supplied page works, deduplicates IDs and preserves reading locations', async () => {
  const view = renderHook(() => usePageMetadataRefresh([story(123), story(456), story(123), story(null)]))
  expect(mocks.history).not.toHaveBeenCalled()
  await act(() => view.result.current.refresh())
  expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('https://archiveofourown.org/works/123\nhttps://archiveofourown.org/works/456', false)
  expect(view.result.current.busy).toBe(true)
  expect(view.result.current.message).toContain('2 works')
})

it('uses the latest page after filtering and blocks repeated clicks while a batch is active', async () => {
  const view = renderHook(({ stories }) => usePageMetadataRefresh(stories), { initialProps: { stories: [story(123)] } })
  view.rerender({ stories: [story(456)] })
  await act(async () => { await Promise.all([view.result.current.refresh(), view.result.current.refresh()]) })
  await act(() => view.result.current.refresh())
  expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('https://archiveofourown.org/works/456', false)
})

it.each(['Page', 'Series'] as const)('reloads affected works and reports completion for a %s refresh', async scope => {
  mocks.history.mockResolvedValue({ batches: [{ id: 'batch-1' }], items: [], jobs: [], changes: [{ id: 'job', entry_id: 'entry-123', status: 'completed' }], summary: { total: 1, active: false, counts: {} } })
  const view = renderHook(() => usePageMetadataRefresh([story(123)], scope))
  await act(() => view.result.current.refresh())
  await waitFor(() => expect(view.result.current.status).toBe('completed'))
  expect(view.result.current.message).toBe(`${scope} metadata refresh finished for 1 works.`)
  expect(view.result.current.busy).toBe(false)
  expect(mocks.refresh).toHaveBeenCalledWith(['entry-123'])
})

it('reports submission errors and allows retry without claiming a refresh succeeded', async () => {
  mocks.submit.mockRejectedValueOnce(new Error('Connection unavailable'))
  const view = renderHook(() => usePageMetadataRefresh([story(123)]))
  await act(() => view.result.current.refresh())
  expect(view.result.current).toMatchObject({ status: 'failed', busy: false, message: 'Connection unavailable' })
  await act(() => view.result.current.refresh())
  expect(view.result.current.status).toBe('pending')
})

it('does not submit empty pages or bookmarks without work IDs', async () => {
  const view = renderHook(() => usePageMetadataRefresh([story(null)]))
  await act(() => view.result.current.refresh())
  expect(view.result.current.unavailable).toBe(true)
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('reports failed metadata jobs even when their import items completed successfully', async () => {
  mocks.history.mockResolvedValue({ batches: [{ id: 'batch-1' }], items: [], jobs: [{ status: 'failed' }], summary: { total: 1, active: false, counts: { completed: 1 } } })
  const view = renderHook(() => usePageMetadataRefresh([story(123)]))
  await act(() => view.result.current.refresh())
  await waitFor(() => expect(view.result.current.status).toBe('partial'))
  expect(view.result.current.message).toContain('Some works could not be refreshed')
  expect(view.result.current.busy).toBe(false)
})
