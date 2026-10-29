import { hasTagFilters, hasTagRules } from './tags/tag-resolution'
import { useActivity } from '../../lib/use-activity'
import { useEffect, useRef, useState } from 'react'
import { useLibrary } from './LibraryProvider'
import { libraryFacetScope, type LibraryFacets, type LibraryQuery, type LibraryResults } from './repository'

export function useLibraryResults(query: LibraryQuery, page: number, size: number, enabled: boolean): { loading: boolean; result?: LibraryResults; previousResult?: LibraryResults; error?: string; suggestions?: LibraryResults['suggestions']; facets?: LibraryFacets; facetsError?: string; retry: () => void } {
  const { hasCachedPage, fetchPage, fetchFacets, revision, tagRevision, collections } = useLibrary()
  const [state, setState] = useState<{ key: string; result?: LibraryResults; error?: string }>({ key: '' })
  const [facetState, setFacets] = useState<{ key: string; scopeKey?: string; result?: LibraryFacets; error?: string }>({ key: '' })
  const [attempt, setAttempt] = useState(0)
  const automatic = collections?.some(collection => collection.id === query.shelf && hasTagRules(collection.automatic_rules))
  const aliasRevision = hasTagFilters(query.filters) || automatic ? tagRevision ?? 0 : 0
  const queryKey = JSON.stringify([query, page, size, aliasRevision])
  const key = JSON.stringify([queryKey, revision, attempt])
  const scopeKey = JSON.stringify(libraryFacetScope(query))
  const facetKey = JSON.stringify([scopeKey, revision, attempt, automatic ? tagRevision ?? 0 : 0])
  function retry() { setState(current => ({ ...current, key: '', error: undefined })); setAttempt(value => value + 1) }
  const { query: search, within, relationship, characters, tags, personalTags, updatedAfter, updatedBefore, ...controls } = query.filters
  const textKey = JSON.stringify([search, within, relationship, characters, tags, personalTags, updatedAfter, updatedBefore])
  const controlKey = JSON.stringify([{ ...query, filters: controls }, size, revision, attempt, aliasRevision])
  const previous = useRef({ textKey, controlKey, page, enabled })
  useEffect(() => {
    const before = previous.current
    previous.current = { textKey, controlKey, page, enabled }
    if (!enabled) return
    const controller = new AbortController()
    const typing = before.enabled && before.controlKey === controlKey && before.textKey !== textKey && (page === before.page || page === 1)
    // Debouncing avoids a database scan for every character of a search.
    const load = () => {
      void fetchPage(query, page, size, controller.signal).then(result => {
        if (!controller.signal.aborted) setState({ key, result })
      }).catch(error => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setState(current => ({ ...current, key, error: error instanceof Error ? error.message : 'Could not load results.' }))
      })
    }
    const timer = typing && !hasCachedPage?.(query, page, size) ? setTimeout(load, 150) : undefined
    if (timer === undefined) load()
    return () => { clearTimeout(timer); controller.abort() }
    // The serialized key contains the complete query and revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetchPage, hasCachedPage, enabled])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void fetchFacets(query, controller.signal).then(result => { if (!controller.signal.aborted) setFacets({ key: facetKey, scopeKey, result }) }).catch(error => {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setFacets(previous => ({ key: facetKey, scopeKey, result: previous.scopeKey === scopeKey ? previous.result : undefined, error: error instanceof Error ? error.message : 'Could not load filter suggestions.' }))
    })
    return () => controller.abort()
    // Facets depend on the collection pool, not result filters or pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey, fetchFacets, enabled])
  const currentFacets = facetState.key === facetKey ? facetState : undefined
  const current = state.key === key
  useActivity(enabled && (!current || facetState.key !== facetKey), !current ? 'Loading library results…' : 'Loading filter suggestions…')
  const results = current && !state.error ? { result: state.result, loading: false, retry } : { loading: enabled && !current, error: current ? state.error : undefined, previousResult: state.result, retry }
  return { ...results, facets: currentFacets?.result ?? (facetState.scopeKey === scopeKey ? facetState.result : undefined), facetsError: currentFacets?.error, suggestions: currentFacets?.result?.suggestions }
}
