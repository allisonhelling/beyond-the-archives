import { useRef, useState } from 'react'
import { sampleMode } from '../../lib/sample-mode'
import type { Story } from '../library/model'
import { submitImport } from './repository'
import { importFinished } from './urls'
import { useImportHistory } from './useImportHistory'
import type { MetadataRefreshStatus } from './useMetadataRefresh'

export function usePageMetadataRefresh(stories: Story[]) {
  const [request, setRequest] = useState<{ batch: string; count: number }>()
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState('')
  const locked = useRef(false)
  const history = useImportHistory(request?.batch, 1, 1, 'all', Boolean(request) && !sampleMode, submitting)
  const observed = request && history.loadedSelection === request.batch
  const finished = Boolean(observed && importFinished(history.data))
  const busy = submitting || Boolean(request && !finished)
  const failed = finished && (history.data.summary?.counts.failed || history.data.summary?.counts.cancelled
    || history.data.jobs.some(job => job.status === 'failed' || job.status === 'cancelled' || job.error_category))
  const status: MetadataRefreshStatus = submitting ? 'submitting' : error ? 'failed' : request ? finished ? failed ? 'partial' : 'completed' : 'pending' : 'idle'
  const message = error || (request ? history.error || (finished
    ? `Page metadata refresh finished for ${request.count} works.${failed ? ' Some works could not be refreshed. See import history for details.' : ''}`
    : `Metadata refresh queued for ${request.count} works. See import history for progress.`) : '')
  const urls = [...new Set(stories.flatMap(story => story.work.ao3_work_id ? [`https://archiveofourown.org/works/${story.work.ao3_work_id}`] : []))]

  async function refresh() {
    if (locked.current || busy || sampleMode || !urls.length) return
    locked.current = true; setSubmitting(true); setError('')
    try {
      const batch = await submitImport(urls.join('\n'), false)
      if (!batch) throw new Error('Could not confirm the metadata refresh. Check import history before trying again.')
      setRequest({ batch, count: urls.length })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not request the page metadata refresh.') }
    finally { locked.current = false; setSubmitting(false) }
  }
  return { refresh, busy, status, message, unavailable: !urls.length }
}
