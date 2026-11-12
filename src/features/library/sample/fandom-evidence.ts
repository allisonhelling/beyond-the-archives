import { classifyFandomBatch, fandomHierarchyParser, type CrossoverProjection, type FandomEvidenceBatch } from '../fandoms/fandom-classification'

// Simulated demonstration evidence, not statements about AO3's real taxonomy.
const families = [
 ['The Flash - All Media Types','The Flash (TV 2014)'],
 ['Wiedźmin | The Witcher - All Media Types','The Witcher (TV)'],
 ['Star Wars - All Media Types','Star Wars Prequel Trilogy','Star Wars Legends - All Media Types'],
 ['DCU','Batman - All Media Types','Red Hood and the Outlaws (Comics)'],
 ['Percy Jackson and the Olympians & Related Fandoms - All Media Types','Percy Jackson and the Olympians - Rick Riordan','The Heroes of Olympus - Rick Riordan','The Trials of Apollo - Rick Riordan'],
]
export function sampleFandomProjection(fandoms: string[], fixtureNames: readonly string[], now = Date.now()): CrossoverProjection {
 const names = [...new Set(fixtureNames)].filter(name => name !== 'Dream SMP')
 // Daily simulation clock makes reset/reload reproducible while keeping these
 // explicitly synthetic snapshots fresh without fetching or trusting AO3 data.
 const evidenceAt = new Date(Math.floor(now / 86400000) * 86400000).toISOString()
 const batch: FandomEvidenceBatch = {
  revision:1,token:'sample-only',sets:[{key:'sample',fandoms,verifiedEmpty:false}],names,
  profiles:names.map(name => ({name,canonical_name:name,status:'canonical',disputed:false,metatag_names:families.flatMap(family => family.slice(1).includes(name) ? [family[0]] : []),hierarchy_complete:true,parser_version:fandomHierarchyParser,last_complete_at:evidenceAt})),
  mappings:names.map((name,index) => ({source_site:'ao3',source_category:'fandom',identity_scheme:'ao3_tag_profile_v1',source_key:name,canonical_fandom_id:`sample-fandom-${index}`,mapping_state:'verified'})),
 }
 const result = classifyFandomBatch(batch,now)[0]
 return {crossoverStatus:result.status,crossoverPolicy:result.policy,crossoverClassifierVersion:result.classifierVersion,crossoverEvidenceRevision:result.evidenceRevision,crossoverValidUntil:result.validUntil}
}
