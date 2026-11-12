import { expect, it } from 'vitest'
import { resolveFandomObservations, type SourceFandomObservation, type FandomIdentityMapping } from './fandom-identities'
import { classifyCrossover } from './crossover-evidence'
const source = (sourceKey: string, sourceSite = 'ao3'): SourceFandomObservation => ({ sourceSite, sourceKey, name: sourceKey, identityScheme: 'profile', membership: 'confirmed' })
const mapping = (sourceKey: string, canonicalFandomId = 'app-uuid-a'): FandomIdentityMapping => ({ sourceSite:'ao3', identityScheme:'profile', sourceKey, canonicalFandomId, state:'verified', ao3CanonicalVerified:true })
const classify = (observations: SourceFandomObservation[], mappings: FandomIdentityMapping[]) => classifyCrossover(resolveFandomObservations(observations,mappings),{snapshots:[],parserVersion:'test',revision:'1'},0).status
it('deduplicates verified aliases into app IDs while preserving original observations',()=>{
 const observations = [source('Exact A'),source('Alias A')]
 expect(resolveFandomObservations(observations,[mapping('Exact A'),mapping('Alias A')])).toEqual({ state:'known',fandoms:[{authority:'ao3',key:'app-uuid-a',verified:true}],unresolved:false })
 expect(classify(observations,[mapping('Exact A'),mapping('Alias A')])).toBe('not_crossover')
 expect(observations.map(row=>row.name)).toEqual(['Exact A','Alias A'])
})
it('keeps source namespaces, exact keys, candidates and conflicting mappings separate',()=>{
 for (const observation of [source('exact a'),source('Exact A','foreign'),{...source('Exact A'),membership:'candidate' as const}]) expect(classify([observation],[mapping('Exact A')])).toBe('unknown')
 for (const mappings of [[mapping('Exact A'),mapping('Exact A','other')],[{...mapping('Exact A'),state:'disputed' as const}],[{...mapping('Exact A'),ao3CanonicalVerified:false}]]) expect(classify([source('Exact A')],mappings)).toBe('unknown')
 expect(classify([source('Exact A'),source('Unknown')],[mapping('Exact A')])).toBe('unknown')
})
it('does not merge distinct related concepts or turn a display default into verified absence',()=>{
 expect(resolveFandomObservations([source('Parent'),source('Child')],[mapping('Parent','parent-id'),mapping('Child','child-id')])).toMatchObject({fandoms:[{key:'parent-id'},{key:'child-id'}]})
 expect(resolveFandomObservations([],[])).toEqual({state:'unknown'})
 expect(resolveFandomObservations([],[],true)).toEqual({state:'known_empty',verified:true})
})
