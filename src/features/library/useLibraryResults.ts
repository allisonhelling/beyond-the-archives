import { useEffect, useState } from 'react'
import { useLibrary } from './LibraryProvider'
import type { LibraryQuery, LibraryResults } from './repository'

export function useLibraryResults(query: LibraryQuery, page: number, size: number, enabled: boolean): { loading: boolean; result?: LibraryResults; error?: string; suggestions?: LibraryResults['suggestions'] } {
  const { fetchPage, revision } = useLibrary()
  const [state, setState] = useState<{ key: string; queryKey?: string; result?: LibraryResults; error?: string }>({ key: '' })
  const queryKey = JSON.stringify([query, page, size])
  const key = JSON.stringify([queryKey, revision])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    // Debouncing avoids a database scan for every character of a search.
    const timer = setTimeout(() => {
      void fetchPage(query, page, size, controller.signal).then(result => {
        if (!controller.signal.aborted) setState({ key, queryKey, result })
      }).catch(error => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setState({ key, queryKey, error: error instanceof Error ? error.message : 'Could not load results.' })
      })
    }, 150)
    return () => { clearTimeout(timer); controller.abort() }
    // The serialized key contains the complete query and revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetchPage, enabled])
  return state.key === key || state.queryKey === queryKey && state.result ? { ...state, suggestions: state.result?.suggestions, loading: false } : { loading: enabled, suggestions: state.result?.suggestions }
}
