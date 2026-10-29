// Shared by request transport and React operations. Each operation owns its
// cleanup so concurrent requests, failures and cancellations cannot hide others.
const operations = new Map<symbol, string>()
const listeners = new Set<() => void>()
let snapshot = ''

function changed() {
 const labels = [...operations.values()]
 const next = labels.reverse().find(label => label !== 'Loading…') ?? labels[0] ?? ''
 if (next === snapshot) return
 snapshot = next
 for (const listener of listeners) listener()
}
export function beginActivity(label = 'Loading…') {
 const id = Symbol()
 operations.set(id, label); changed()
 return () => { if (operations.delete(id)) changed() }
}
export function subscribeActivity(listener: () => void) {
 listeners.add(listener)
 return () => { listeners.delete(listener) }
}
export const activitySnapshot = () => snapshot
