import { expect, it } from 'vitest'
import { classifyCrossover, matchesCrossoverStatus, negativeEvidenceMaxAgeMs, type FandomObservation, type FandomSnapshot } from './crossover-evidence'
// Synthetic graph keys only: these fixtures assert no facts about real AO3 fandoms/markup.
const now = Date.parse('2026-11-09T12:00:00Z')
const known = (...keys: string[]): FandomObservation => ({ state:'known', fandoms:keys.map(key=>({authority:'ao3',key,verified:true})), unresolved:false })
const node = (key: string, parents: string[] = [], extra: Partial<FandomSnapshot> = {}): FandomSnapshot => ({ authority:'ao3',key,parents,verified:true,complete:true,lastCompleteSuccessfulAt:new Date(now-86400000).toISOString(),parserVersion:'synthetic-v1',...extra })
const classify = (observation: FandomObservation, snapshots: FandomSnapshot[] = []) => classifyCrossover(observation,{snapshots,parserVersion:'synthetic-v1',revision:'fixture-1'},now)
it('distinguishes verified empty/single confirmed from missing, unresolved and unsupported observations',()=>{
 for(const state of ['unknown','unavailable'] as const) expect(classify({state}).status).toBe('unknown')
 expect(classify({state:'known_empty',verified:true}).status).toBe('not_crossover')
 expect(classify({state:'known_empty',verified:false}).status).toBe('unknown')
 expect(classify(known()).status).toBe('unknown')
 expect(classify(known('A')).status).toBe('not_crossover')
 expect(classify(known('A','A')).status).toBe('not_crossover')
 expect(classify({...known('A'),unresolved:true} as FandomObservation).status).toBe('unknown')
 expect(classify({state:'known',fandoms:[{authority:'foreign',key:'A',verified:true}],unresolved:false}).status).toBe('unknown')
})
it('uses parent, shared ancestor and transitive bridge proofs even with incomplete negative closure',()=>{
 expect(classify(known('A','B'),[node('A',['B']),node('B',[],{complete:false})]).status).toBe('not_crossover')
 expect(classify(known('A','B'),[node('A',['Root']),node('B',['Root']),node('Root',[],{complete:false})]).status).toBe('not_crossover')
 expect(classify(known('A','B','C'),[node('A',['X']),node('B',['X','Y']),node('C',['Y']),node('X'),node('Y')]).status).toBe('not_crossover')
})
it('requires complete fresh separation proof and expires at 30 days without a network event',()=>{
 expect(classify(known('A','B'),[node('A'),node('B')])).toMatchObject({status:'crossover',policy:'ao3_hierarchy_v1',classifierVersion:1,evidenceRevision:'fixture-1'})
 for(const extra of [{complete:false},{lastCompleteSuccessfulAt:null},{lastCompleteSuccessfulAt:new Date(now-negativeEvidenceMaxAgeMs).toISOString()},{parserVersion:'obsolete'},{verified:false}]) expect(classify(known('A','B'),[node('A'),node('B',[],extra)]).status).toBe('unknown')
 expect(classify(known('A','B'),[node('A')]).status).toBe('unknown')
 // Complete contradictory refresh removes a prior positive edge.
 expect(classify(known('A','B'),[node('A',['B']),node('B')]).status).toBe('not_crossover')
 expect(classify(known('A','B'),[node('A'),node('B')]).status).toBe('crossover')
})
it('terminates cycles and traversal bounds, rejecting ambiguous snapshots and changed parsers',()=>{
 expect(classify(known('A','C'),[node('A',['B']),node('B',['A']),node('C')]).status).toBe('unknown')
 expect(classify(known('A','B'),[node('A'),node('A',['B']),node('B')]).status).toBe('unknown')
 const deep=Array.from({length:70},(_,i)=>node(String(i),[String(i+1)]))
 expect(classify(known('0','Other'),[...deep,node('Other')]).status).toBe('unknown')
 expect(classify(known('A','B'),[node('A',['B'],{parserVersion:'old'}),node('B')]).status).toBe('unknown')
})
it.each(['crossover','not_crossover','unknown'] as const)('keeps plural-filter Allowed/Only/Exclude semantics for %s',status=>{
 expect(matchesCrossoverStatus(status,'allowed')).toBe(true)
 expect(matchesCrossoverStatus(status,'only')).toBe(status==='crossover')
 expect(matchesCrossoverStatus(status,'exclude')).toBe(status!=='crossover')
})
