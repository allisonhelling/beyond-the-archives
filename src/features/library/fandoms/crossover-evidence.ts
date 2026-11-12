/** AO3-authority policy over application-owned canonical fandom identities. */
export const crossoverPolicy = 'ao3_hierarchy_v1'
export const negativeEvidenceMaxAgeMs = 30 * 86400000
export type CrossoverStatus = 'crossover' | 'not_crossover' | 'unknown'
export type CrossoverFilter = 'allowed' | 'only' | 'exclude'
export type ConfirmedFandom = { authority: string; key: string; verified: boolean }
export type FandomObservation =
  | { state: 'unknown' | 'unavailable' }
  | { state: 'known_empty'; verified: boolean }
  | { state: 'known'; fandoms: ConfirmedFandom[]; unresolved: boolean }
/** Opaque app IDs are supplied by the verified mapping boundary, never display labels. */
export type FandomSnapshot = {
  authority: 'ao3'; key: string; parents: string[]; verified: boolean;
  complete: boolean; lastCompleteSuccessfulAt: string | null; parserVersion: string;
}
export type CrossoverEvidence = { snapshots: FandomSnapshot[]; parserVersion: string; revision: string }
export type CrossoverClassification = { status: CrossoverStatus; policy: typeof crossoverPolicy; classifierVersion: 1; evidenceRevision: string }

export function classifyCrossover(observation: FandomObservation, evidence: CrossoverEvidence, now: number): CrossoverClassification {
  const result = (status: CrossoverStatus): CrossoverClassification => ({ status, policy: crossoverPolicy, classifierVersion: 1, evidenceRevision: evidence.revision })
  if (observation.state === 'known_empty') return result(observation.verified ? 'not_crossover' : 'unknown')
  if (observation.state !== 'known' || observation.unresolved || !observation.fandoms.length || !Number.isFinite(now)) return result('unknown')
  if (observation.fandoms.some(fandom => !fandom.verified || fandom.authority !== 'ao3' || !fandom.key)) return result('unknown')
  const keys = [...new Set(observation.fandoms.map(fandom => fandom.key))]
  if (keys.length === 1) return result('not_crossover')
  // Conflicting duplicate snapshots never establish positive or negative authority.
  const nodes = new Map<string, FandomSnapshot>(), ambiguous = new Set<string>()
  for (const snapshot of evidence.snapshots) {
    if (nodes.has(snapshot.key)) ambiguous.add(snapshot.key)
    nodes.set(snapshot.key, snapshot)
  }
  let visitedCount = 0, exceeded = false
  const closures = keys.map(key => {
    const ancestors = new Set<string>(), visiting = new Set<string>()
    let complete = true
    function visit(current: string, depth: number) {
      if (visiting.has(current)) { complete = false; return }
      if (ancestors.has(current)) return
      if (depth > 64 || ++visitedCount > 4096) { exceeded = true; complete = false; return }
      const node = nodes.get(current)
      if (!node || ambiguous.has(current) || node.authority !== 'ao3' || !node.verified || node.parserVersion !== evidence.parserVersion) { complete = false; return }
      // A dangling/foreign/conflicting endpoint cannot establish a shared ancestor.
      ancestors.add(current)
      visiting.add(current)
      const timestamp = Date.parse(node.lastCompleteSuccessfulAt ?? '')
      if (!node.complete || !Number.isFinite(timestamp) || timestamp > now || now - timestamp >= negativeEvidenceMaxAgeMs) complete = false
      for (const parent of node.parents) { if (exceeded) break; visit(parent, depth + 1) }
      visiting.delete(current)
    }
    visit(key, 0)
    return { ancestors, complete }
  })
  if (exceeded) return result('unknown')
  // Connected-component transitivity includes bridges through a third effective fandom.
  const connected = new Set([0]), queue = [0]
  while (queue.length) {
    const index = queue.shift()!
    for (let other = 0; other < closures.length; other++) {
      if (!connected.has(other) && [...closures[index].ancestors].some(key => closures[other].ancestors.has(key))) { connected.add(other); queue.push(other) }
    }
  }
  if (connected.size === keys.length) return result('not_crossover')
  return result(closures.every(closure => closure.complete) ? 'crossover' : 'unknown')
}

export function matchesCrossoverStatus(status: CrossoverStatus, mode: CrossoverFilter) {
  return mode !== 'only' && mode !== 'exclude' || (mode === 'only' ? status === 'crossover' : status !== 'crossover')
}
