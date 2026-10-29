import { useLayoutEffect } from 'react'
import { beginActivity } from './activity'

/** Observe an existing loading state without replacing its source of truth. */
export function useActivity(busy: boolean, label: string) {
 // Settle feedback during commit, before another route can be selected.
 useLayoutEffect(() => {
  if (busy) return beginActivity(label)
 }, [busy, label])
}
