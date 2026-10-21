import { formatDateTime } from '../../lib/dates'
import { useEffect, useRef, useState } from 'react'
import { sampleMode } from '../../lib/sample-mode'
import type { Story } from '../library/model'
import { useLibrary } from '../library/LibraryProvider'
import { metadataRefreshJob, submitImport } from './repository'

type Job = NonNullable<Awaited<ReturnType<typeof metadataRefreshJob>>>
export type MetadataRefreshStatus = 'idle' | 'submitting' | 'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'unknown'
type Feedback = { status: MetadataRefreshStatus; message: string; busy: boolean }
const idle: Feedback = { status: 'idle', message: '', busy: false }

function jobFeedback(job: Job): Feedback {
  switch (job.status) {
    case 'pending': return { status: 'pending', busy: true, message: job.retrieval_mode === 'extension'
      ? (job.error_message || 'Waiting for the browser extension. Connect it in Settings.') : job.error_message
      ? `Metadata refresh waiting to retry: ${job.error_message} Next eligible: ${formatDateTime(job.next_attempt_at)}.`
      : 'Metadata refresh queued. Waiting for the worker.' }
    case 'processing': return { status: 'processing', busy: true, message: job.retrieval_mode === 'extension' ? (job.error_message || 'Waiting for the browser extension to load the requested AO3 work…') : 'Refreshing metadata from AO3…' }
    case 'completed': return job.error_category
      ? { status: 'partial', busy: false, message: `Metadata partially refreshed. ${job.error_message || 'Some metadata could not be retrieved. See import history for details.'}` }
      : { status: 'completed', busy: false, message: 'Metadata refreshed successfully.' }
    case 'cancelled': return { status: 'cancelled', busy: false, message: 'Metadata refresh cancelled.' }
    default: return { status: 'failed', busy: false, message: `Metadata refresh failed. ${job.error_message || 'See import history for details.'}` }
  }
}

export function useMetadataRefresh(story: Story | undefined) {
  const { refresh: refreshLibrary } = useLibrary()
  const entryId = story?.id
  const [feedback, setFeedback] = useState<Feedback & { entryId: string }>()
  const [request, setRequest] = useState<{ entryId: string; batchId: string }>()
  const [visitEntryId, setVisitEntryId] = useState(entryId)
  if (visitEntryId !== entryId) {
    setVisitEntryId(entryId)
    setFeedback(undefined)
    setRequest(undefined)
  }
  const submitting = useRef(false)
  const generation = useRef(0)
  const current = feedback && feedback.entryId === entryId ? feedback : idle

  useEffect(() => () => { generation.current += 1; submitting.current = false }, [entryId])

  useEffect(() => {
    if (!entryId || current.status !== 'completed') return
    const timer = setTimeout(() => setFeedback(previous => previous?.entryId === entryId && previous.status === 'completed' ? { ...idle, entryId } : previous), 60000)
    return () => clearTimeout(timer)
  }, [current.status, entryId])

  useEffect(() => {
    if (!entryId || sampleMode) return
    let active = true
    let observing = request?.entryId === entryId
    const version = generation.current
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      let again = false
      try {
        const job = await metadataRefreshJob(entryId!, request && request.entryId === entryId ? request.batchId : undefined)
        if (!active || version !== generation.current) return
        if (!job && request?.entryId === entryId) throw new Error('Waiting for metadata refresh status. Check import history for details.')
        failures = 0
        const result = job ? jobFeedback(job) : idle
        again = result.busy
        if (again) observing = true
        // Past terminal jobs belong to a previous visit; only show results observed here.
        const visible = observing ? result : idle
        setFeedback({ ...visible, entryId: entryId! })
        if (job && !again && observing) {
          try { await refreshLibrary([entryId!]) }
          catch {
            if (active && version === generation.current) setFeedback({ ...result, entryId: entryId!, message: `${result.message} Could not reload your library. Reload the page to see the latest saved data.` })
          }
        }
      } catch (error) {
        if (!active || version !== generation.current) return
        again = true; failures++
        setFeedback({ entryId: entryId!, status: 'unknown', busy: false, message: error instanceof Error ? error.message : 'Could not check metadata refresh status.' })
      }
      if (active && version === generation.current && again) timer = setTimeout(() => void poll(), Math.max(document.hidden ? 30000 : 5000, Math.min(60000, 5000 * 2 ** failures)))
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [entryId, request, refreshLibrary])

  async function refresh() {
    if (!story || current.busy || submitting.current || sampleMode) return
    submitting.current = true
    generation.current += 1
    const version = generation.current
    setFeedback({ entryId: story.id, status: 'submitting', busy: true, message: 'Requesting metadata refresh…' })
    try {
      const batchId = await submitImport(story.original_url, false)
      if (version !== generation.current) return
      if (!batchId) throw new Error('Could not confirm the metadata refresh. Check import history before trying again.')
      setFeedback({ entryId: story.id, status: 'pending', busy: true, message: 'Metadata refresh queued. Waiting for the worker.' })
      setRequest({ entryId: story.id, batchId })
    } catch (error) {
      if (version !== generation.current) return
      setFeedback({ entryId: story.id, status: 'failed', busy: false, message: error instanceof Error ? error.message : 'Could not request metadata refresh.' })
    } finally { if (version === generation.current) submitting.current = false }
  }
  return { ...current, refresh }
}
