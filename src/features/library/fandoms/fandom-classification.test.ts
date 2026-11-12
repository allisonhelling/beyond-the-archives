import snapshots from '../sample/stories.json'
const fixtureNames = snapshots.flatMap(sample=>sample.metadata.fandoms)
import { expect,it } from 'vitest'
import { projectedCrossoverStatus } from './fandom-classification'
import { sampleFandomProjection } from '../sample/fandom-evidence'
const now=Date.parse('2026-11-11T12:00:00Z')
it('demonstrates related, unrelated and unresolved sample observations using the shared classifier',()=>{
 expect(sampleFandomProjection(['The Flash - All Media Types','The Flash (TV 2014)'],fixtureNames,now).crossoverStatus).toBe('not_crossover')
 expect(sampleFandomProjection(['Yuri!!! on Ice (Anime)','Fullmetal Alchemist: Brotherhood & Manga'],fixtureNames,now).crossoverStatus).toBe('crossover')
 expect(sampleFandomProjection(['Dream SMP','Unmapped'],fixtureNames,now).crossoverStatus).toBe('unknown')
 expect(sampleFandomProjection(['Unknown Imported Fandom'],fixtureNames,now).crossoverStatus).toBe('unknown')
})
it('retains unknown safely for legacy projections, unsupported policies and expired offline evidence',()=>{
 expect(projectedCrossoverStatus({},now)).toBe('unknown')
 const projection={crossoverStatus:'crossover' as const,crossoverPolicy:'ao3_hierarchy_v1',crossoverClassifierVersion:1,crossoverValidUntil:new Date(now+1000).toISOString()}
 expect(projectedCrossoverStatus(projection,now)).toBe('crossover')
 expect(projectedCrossoverStatus(projection,now+1000)).toBe('unknown')
 expect(projectedCrossoverStatus({...projection,crossoverPolicy:'foreign'},now)).toBe('unknown')
 expect(projectedCrossoverStatus({...projection,crossoverValidUntil:null},now)).toBe('unknown')
})
