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
    case 'pending': return { status: 'pending', busy: true, message: job.error_message
      ? `Metadata refresh waiting to retry: ${job.error_message} Next eligible: ${new Date(job.next_attempt_at).toLocaleString()}.`
      : 'Metadata refresh queued. Waiting for the worker.' }
    case 'processing': return { status: 'processing', busy: true, message: 'Refreshing metadata from AO3…' }
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
  const submitting = useRef(false)
  const generation = useRef(0)
  const current = feedback && feedback.entryId === entryId ? feedback : idle

  useEffect(() => {
    if (!entryId || sampleMode) return
    let active = true
    const version = generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      let again = false
      try {
        const job = await metadataRefreshJob(entryId!, request && request.entryId === entryId ? request.batchId : undefined)
        if (!active || version !== generation.current) return
        if (!job && request?.entryId === entryId) throw new Error('Waiting for metadata refresh status. Check import history for details.')
        const result = job ? jobFeedback(job) : idle
        again = result.busy
        setFeedback({ ...result, entryId: entryId! })
        if (job && !again) {
          try { await refreshLibrary() }
          catch {
            if (active && version === generation.current) setFeedback({ ...result, entryId: entryId!, message: `${result.message} Could not reload your library. Reload the page to see the latest saved data.` })
          }
        }
      } catch (error) {
        if (!active || version !== generation.current) return
        again = true
        setFeedback({ entryId: entryId!, status: 'unknown', busy: false, message: error instanceof Error ? error.message : 'Could not check metadata refresh status.' })
      }
      if (active && version === generation.current && again) timer = setTimeout(() => void poll(), 5000)
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [entryId, request, refreshLibrary])

  async function refresh() {
    if (!story || current.busy || submitting.current || sampleMode) return
    submitting.current = true
    generation.current += 1
    setFeedback({ entryId: story.id, status: 'submitting', busy: true, message: 'Requesting metadata refresh…' })
    try {
      const batchId = await submitImport(story.original_url)
      if (!batchId) throw new Error('Could not confirm the metadata refresh. Check import history before trying again.')
      setFeedback({ entryId: story.id, status: 'pending', busy: true, message: 'Metadata refresh queued. Waiting for the worker.' })
      setRequest({ entryId: story.id, batchId })
    } catch (error) {
      setFeedback({ entryId: story.id, status: 'failed', busy: false, message: error instanceof Error ? error.message : 'Could not request metadata refresh.' })
    } finally { submitting.current = false }
  }
  return { ...current, refresh }
}
