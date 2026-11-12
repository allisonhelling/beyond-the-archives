import type { FandomObservation } from './crossover-evidence.ts'

/** Source spelling is retained separately from the app-owned identity. */
export type SourceFandomObservation = {
 sourceSite: string; identityScheme: string; sourceKey: string; name: string;
 membership: 'confirmed' | 'candidate';
}
export type FandomIdentityMapping = {
 sourceSite: string; identityScheme: string; sourceKey: string;
 canonicalFandomId: string; state: 'verified' | 'disputed';
 // App identity alone does not grant a classification authority.
 ao3CanonicalVerified: boolean;
}

/** Matching boundary, independent of acquisition and display-name normalization. */
export function resolveFandomObservations(observations: readonly SourceFandomObservation[], mappings: readonly FandomIdentityMapping[], verifiedEmpty = false): FandomObservation {
 if (!observations.length) return verifiedEmpty ? { state: 'known_empty', verified: true } : { state: 'unknown' }
 let unresolved = false
 const ids = new Set<string>()
 for (const observation of observations) {
  const matches = mappings.filter(mapping => mapping.sourceSite === observation.sourceSite
   && mapping.identityScheme === observation.identityScheme && mapping.sourceKey === observation.sourceKey)
  const mapping = matches[0]
  if (observation.membership !== 'confirmed' || matches.length !== 1 || mapping.state !== 'verified'
   || !mapping.ao3CanonicalVerified || !mapping.canonicalFandomId) { unresolved = true; continue }
  ids.add(mapping.canonicalFandomId)
 }
 return { state: 'known', fandoms: [...ids].map(key => ({ authority: 'ao3', key, verified: true })), unresolved }
}
