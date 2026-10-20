import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Story } from '../library/model'
import type { metadataRefreshJob as readJob } from './repository'
import { useMetadataRefresh } from './useMetadataRefresh'

const mocks = vi.hoisted(() => ({ read: vi.fn(), submit: vi.fn(), reload: vi.fn() }))
vi.mock('./repository', () => ({ metadataRefreshJob: mocks.read, submitImport: mocks.submit }))
vi.mock('../library/LibraryProvider', () => ({ useLibrary: () => ({ refresh: mocks.reload }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
type Job = NonNullable<Awaited<ReturnType<typeof readJob>>>
const story = { id: 'entry-1', original_url: 'https://archiveofourown.org/works/123' } as Story
const job = (status: string, extra: Partial<Job> = {}) => ({ status, error_category: null, error_message: null, next_attempt_at: '2026-10-16T12:00:00Z', ...extra }) as Job
async function tick(ms=5000) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
async function mount() {
  const hook = renderHook(() => useMetadataRefresh(story))
  await act(async () => {})
  return hook
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  mocks.read.mockResolvedValue(null)
  mocks.submit.mockResolvedValue('batch-1')
  mocks.reload.mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })

it('keeps queued and processing requests busy until the worker succeeds and reloads metadata', async () => {
  const { result } = await mount()
  let resolveSubmission!: (value: string) => void
  mocks.submit.mockReturnValue(new Promise(resolve => { resolveSubmission = resolve }))
  let submission!: Promise<void>
  act(() => { submission = result.current.refresh() })
  expect(result.current.status).toBe('submitting')
  await act(async () => { await result.current.refresh() })
  expect(mocks.submit).toHaveBeenCalledTimes(1)
  mocks.read.mockResolvedValue(job('pending'))
  await act(async () => { resolveSubmission('batch-1'); await submission })
  expect(mocks.submit).toHaveBeenCalledWith(story.original_url, false)
  expect(mocks.read).toHaveBeenLastCalledWith('entry-1', 'batch-1')
  expect(result.current.status).toBe('pending')
  expect(result.current.busy).toBe(true)
  expect(mocks.reload).not.toHaveBeenCalled()
  mocks.read.mockResolvedValue(job('processing'))
  await tick()
  expect(result.current.status).toBe('processing')
  mocks.read.mockResolvedValue(job('completed'))
  await tick()
  expect(result.current.message).toBe('Metadata refreshed successfully.')
  expect(result.current.busy).toBe(false)
  expect(mocks.reload).toHaveBeenCalledTimes(1)
  const calls = mocks.read.mock.calls.length
  await tick()
  expect(mocks.read).toHaveBeenCalledTimes(calls)
})

it.each([
  [job('completed'), 'completed', 'Metadata refreshed'],
  [job('failed', { error_message: 'AO3 is unavailable.' }), 'failed', 'AO3 is unavailable.'],
  [job('completed', { error_category: 'partial', error_message: 'Chapter list unavailable.' }), 'partial', 'Chapter list unavailable.'],
  [job('cancelled'), 'cancelled', 'cancelled'],
])('resets terminal job feedback on a return visit: %s', async (latest) => {
  mocks.read.mockResolvedValue(latest)
  const { result } = await mount()
  expect(result.current.status).toBe('idle')
  expect(result.current.message).toBe('')
  expect(result.current.busy).toBe(false)
  expect(mocks.reload).not.toHaveBeenCalled()
})

it('shows retry timing and stops checking when the page unmounts', async () => {
  mocks.read.mockResolvedValue(job('pending', { error_message: 'Temporarily unavailable.' }))
  const { result, unmount } = await mount()
  expect(result.current.message).toContain('waiting to retry: Temporarily unavailable.')
  expect(result.current.message).toContain('Next eligible:')
  unmount()
  await tick()
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('reports submission failure without claiming retrieval succeeded', async () => {
  const { result } = await mount()
  mocks.submit.mockRejectedValue(new Error('Could not confirm the import.'))
  await act(async () => { await result.current.refresh() })
  expect(result.current.status).toBe('failed')
  expect(result.current.message).toBe('Could not confirm the import.')
  expect(result.current.busy).toBe(false)
  expect(mocks.reload).not.toHaveBeenCalled()
})

it('recovers from status read failures without treating them as worker failures', async () => {
  mocks.read.mockRejectedValue(new Error('Check your connection.'))
  const { result } = await mount()
  expect(result.current.status).toBe('unknown')
  mocks.read.mockResolvedValue(job('completed'))
  await tick(10000)
  expect(result.current.status).toBe('idle')
})

it('ignores an older status response after a new refresh is requested', async () => {
  let resolveOld!: (value: Job) => void
  mocks.read.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
  const { result } = await mount()
  mocks.read.mockResolvedValue(job('pending'))
  await act(async () => { await result.current.refresh() })
  await act(async () => { resolveOld(job('completed')) })
  expect(result.current.status).toBe('pending')
  expect(mocks.reload).not.toHaveBeenCalled()
})

it('clears success feedback after one minute without requesting metadata again', async () => {
  mocks.read.mockResolvedValue(job('completed'))
  const { result } = await mount()
  await act(async () => { await result.current.refresh() })
  await act(async () => { await vi.advanceTimersByTimeAsync(59999) })
  expect(result.current.status).toBe('completed')
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(result.current.status).toBe('idle')
  expect(result.current.message).toBe('')
  expect(mocks.read).toHaveBeenCalledTimes(2)
})

it('does not clear a new pending request when the previous success timer expires', async () => {
  mocks.read.mockResolvedValue(job('completed'))
  const { result } = await mount()
  await act(async () => { await result.current.refresh() })
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  mocks.read.mockResolvedValue(job('pending'))
  await act(async () => { await result.current.refresh() })
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(result.current.status).toBe('pending')
  expect(result.current.busy).toBe(true)
})

it('forgets completed feedback after leaving and reopening the story', async () => {
  const hook = renderHook(({ selected }) => useMetadataRefresh(selected), { initialProps: { selected: story } })
  await act(async () => {})
  mocks.read.mockResolvedValue(job('completed'))
  await act(async () => { await hook.result.current.refresh() })
  expect(hook.result.current.status).toBe('completed')
  hook.rerender({ selected: { ...story, id: 'entry-2' } })
  await act(async () => {})
  expect(hook.result.current.status).toBe('idle')
  hook.rerender({ selected: story })
  await act(async () => {})
  expect(hook.result.current.status).toBe('idle')
})

it('ignores a submission result that arrives after leaving the story', async () => {
  let resolve!: (batch: string) => void
  mocks.submit.mockReturnValue(new Promise(done => { resolve = done }))
  const hook = renderHook(({ selected }) => useMetadataRefresh(selected), { initialProps: { selected: story } })
  await act(async () => {})
  let request!: Promise<void>
  act(() => { request = hook.result.current.refresh() })
  hook.rerender({ selected: { ...story, id: 'entry-2' } })
  await act(async () => { resolve('batch-1'); await request })
  hook.rerender({ selected: story })
  await act(async () => {})
  expect(hook.result.current.status).toBe('idle')
})
