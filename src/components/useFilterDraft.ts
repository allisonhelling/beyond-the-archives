import { useState } from 'react'

/** Stage edits without losing newer input when an applied update arrives later. */
export function useFilterDraft<T extends object>(applied: T, scope?: string) {
  const [state, setState] = useState({ applied, draft: applied, scope, edited: new Set<keyof T>() })
  let current = state
  if (state.applied !== applied || state.scope !== scope) {
    const reset = state.scope !== scope
    const draft = { ...(reset ? applied : state.draft) }, edited = new Set(reset ? [] : state.edited)
    for (const key of Object.keys(applied) as (keyof T)[]) {
      if (!edited.has(key)) draft[key] = applied[key]
      if (JSON.stringify(draft[key]) === JSON.stringify(applied[key])) edited.delete(key)
    }
    current = { applied, draft, scope, edited }
    setState(current)
  }
  function setDraft(next: T) {
    const edited = new Set(current.edited)
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (JSON.stringify(next[key]) !== JSON.stringify(current.draft[key])) edited.add(key)
    }
    setState({ applied, draft: next, scope, edited })
  }
  return [current.draft, setDraft] as const
}
