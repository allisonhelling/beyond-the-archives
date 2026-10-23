import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibrary } from '../library/LibraryProvider'
import { importFinished } from './urls'
import { importHistory, type ImportHistory } from './repository'

export function useImportHistory(selected: string | undefined, historyPage: number, resultPage: number, status: string, enabled: boolean, busy: boolean) {
  const { refresh } = useLibrary()
  const [data, setData] = useState<ImportHistory>({ batches: [], items: [], jobs: [] })
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [loadedSelection, setLoadedSelection] = useState<string>()
  const queue = useRef<Promise<unknown>>(Promise.resolve()), version = useRef(0)
  const signatures = useRef(new Map<string, string>())
  const reload = useCallback(async () => {
    const request = ++version.current
    const operation = queue.current.catch(() => {}).then(async () => {
      const next = await importHistory(selected, { historyPage, resultPage, status })
      if (request !== version.current) return next
      const changes = next.changes ?? next.jobs
      const affected = new Set<string>(), changed = new Map<string,string>()
      for (const job of changes) {
        const signature = JSON.stringify([job.status, job.completed_at, job.last_attempt_at])
        if (signature !== signatures.current.get(job.id)) {
          changed.set(job.id, signature)
          if (job.entry_id) affected.add(job.entry_id)
        }
      }
      if (affected.size) await refresh([...affected])
      for (const [id, signature] of changed) signatures.current.set(id, signature)
      while (signatures.current.size > 6000) signatures.current.delete(signatures.current.keys().next().value!)
      if (request === version.current) { setData(next); setLoadedSelection(selected); setLoading(false); setError('') }
      return next
    })
    queue.current = operation
    return operation
  }, [selected, historyPage, resultPage, status, refresh])
  useEffect(() => {
    if (!enabled || busy) return
    let alive = true, failures = 0
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      let again = true
      try { const next = await reload(); failures = 0; again = !importFinished(next) && next.batches.length > 0 }
      catch { failures++; if (alive) { setError('Import history is unavailable. Check your connection and apply the latest migrations.'); setLoading(false) } }
      if (alive && again) timer = setTimeout(() => void poll(), Math.max(document.hidden ? 30000 : 5000, Math.min(60000, 5000 * 2 ** failures)))
    }
    void poll()
    const requests = version
    return () => { alive = false; clearTimeout(timer); requests.current++ }
  }, [reload, enabled, busy])
  return { data, loading, error, reload, loadedSelection }
}
