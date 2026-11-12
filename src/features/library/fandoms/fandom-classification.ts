import { classifyCrossover, negativeEvidenceMaxAgeMs, type CrossoverClassification, type FandomSnapshot } from './crossover-evidence.ts'
import { resolveFandomObservations, type FandomIdentityMapping } from './fandom-identities.ts'

export const fandomHierarchyParser = 'ao3_fandom_profile_v2'
export type FandomEvidenceBatch = {
 revision: number; token: string;
 sets: { key: string; fandoms: string[]; verifiedEmpty: boolean }[];
 names: string[];
 profiles: { name: string; canonical_name: string | null; status: string; disputed: boolean; metatag_names: string[]; hierarchy_complete: boolean; parser_version: string; last_complete_at: string | null }[];
 mappings: { source_site: string; source_category: string; identity_scheme: string; source_key: string; canonical_fandom_id: string; mapping_state: string }[];
}
export type FandomSetResult = CrossoverClassification & { key: string; validUntil: string | null; dependencyNames: string[] }

/** Shared trusted/sample classifier boundary. No network access and no name inference. */
export function classifyFandomBatch(batch: FandomEvidenceBatch, now: number): FandomSetResult[] {
 const profiles = new Map(batch.profiles.map(profile => [profile.name, profile]))
 const qualified = batch.mappings.filter(mapping => mapping.source_site === 'ao3' && mapping.source_category === 'fandom' && mapping.identity_scheme === 'ao3_tag_profile_v1')
 const roots = new Map<string, string>()
 for (const profile of batch.profiles) {
  const mapping = qualified.find(mapping => mapping.source_key === profile.name)
  if (profile.status === 'canonical' && profile.canonical_name === profile.name && !profile.disputed && mapping?.mapping_state === 'verified') roots.set(mapping.canonical_fandom_id, profile.name)
 }
 const mappings: FandomIdentityMapping[] = qualified.map(mapping => ({
  sourceSite: 'ao3', identityScheme: 'ao3_tag_profile_v1', sourceKey: mapping.source_key,
  canonicalFandomId: mapping.canonical_fandom_id, state: mapping.mapping_state === 'verified' ? 'verified' : 'disputed',
  ao3CanonicalVerified: roots.has(mapping.canonical_fandom_id) && !profiles.get(mapping.source_key)?.disputed,
 }))
 const identity = (name: string) => mappings.find(mapping => mapping.sourceKey === name && mapping.state === 'verified' && mapping.ao3CanonicalVerified)?.canonicalFandomId
 const snapshots: FandomSnapshot[] = [...roots].map(([key, name]) => {
  const profile = profiles.get(name)!, parents = profile.metatag_names.map(identity)
  return { authority: 'ao3', key, parents: parents.filter((id): id is string => Boolean(id)), verified: true,
   complete: profile.hierarchy_complete && parents.every(Boolean), lastCompleteSuccessfulAt: profile.last_complete_at, parserVersion: profile.parser_version }
 })
 const evidence = { snapshots, parserVersion: fandomHierarchyParser, revision: String(batch.revision) }
 return batch.sets.map(set => {
  const observation = resolveFandomObservations(set.fandoms.map(name => ({ sourceSite:'ao3',identityScheme:'ao3_tag_profile_v1',sourceKey:name,name,membership:'confirmed' })), mappings, set.verifiedEmpty)
  const classification = classifyCrossover(observation,evidence,now)
  // Conservative batch minimum may expire a proof early, never late.
  const expiry = Math.min(...snapshots.map(snapshot => Date.parse(snapshot.lastCompleteSuccessfulAt ?? '') + negativeEvidenceMaxAgeMs).filter(Number.isFinite))
  return { ...classification,key:set.key,validUntil:classification.status === 'crossover' && Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,dependencyNames:batch.names }
 })
}

export type CrossoverProjection = {
 crossoverStatus?: 'crossover' | 'not_crossover' | 'unknown';
 crossoverPolicy?: string; crossoverClassifierVersion?: number; crossoverEvidenceRevision?: string;
 crossoverValidUntil?: string | null;
}
/** Retained/offline data loses negative authority at expiry even without a fetch. */
export function projectedCrossoverStatus(value: CrossoverProjection, now = Date.now()) {
 if (value.crossoverPolicy !== 'ao3_hierarchy_v1' || value.crossoverClassifierVersion !== 1) return 'unknown'
 if (value.crossoverStatus === 'crossover') {
  const expiry = Date.parse(value.crossoverValidUntil ?? '')
  return Number.isFinite(expiry) && expiry > now ? 'crossover' : 'unknown'
 }
 return value.crossoverStatus === 'not_crossover' ? 'not_crossover' : 'unknown'
}
