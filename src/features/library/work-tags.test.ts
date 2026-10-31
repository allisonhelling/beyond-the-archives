import { expect, it } from 'vitest'
import { blankMetadata } from './model'
import { workTagGroups } from './work-tags'
import type { TagResolution } from './tags/tag-resolution'

it('puts additional tags first without reclassifying fallback copies of known tags', () => {
 const metadata = { ...blankMetadata, fandoms: ['Fandom'], archive_warnings: ['Warning'], categories: ['Gen'], relationship_tags: ['A/B'], character_tags: ['A'], additional_tags: ['Custom', 'Verified', 'Alias'], ao3_tags: ['Fandom', 'Warning', 'A/B', 'A', 'Gen', 'Custom', 'Verified', 'Alias', 'Raw', 'Fandom: Other'] }
 const record = (name: string, status: TagResolution['status'], canonical_name: string | null): TagResolution => ({category:'freeform',name,status,canonical_name,checked_at:'2026-10-30',attempted_at:'2026-10-30'})
 const records = [record('Verified','canonical','Verified'), record('Alias','synonym','Verified'), record('Custom','custom',null)]
 const groups = workTagGroups(metadata, undefined, records)
 expect(groups.map(group => group.label)).toEqual(['Additional Tags','Relationships','Characters','Categories','AO3 Warnings'])
 expect(groups[0].values).toEqual(['Verified','Alias','Custom','Raw'])
 expect(groups.flatMap(group => group.values)).toHaveLength(8)
 expect(workTagGroups(metadata)[0].values).toEqual(['Custom','Verified','Alias','Raw'])
 expect(metadata.additional_tags).toEqual(['Custom','Verified','Alias'])
 expect(workTagGroups(metadata, value => value !== 'Custom')[0].values).toEqual(['Verified','Alias','Raw'])
})

it('shares the additional-tags-first category default across both applications', () => {
 const metadata = {...blankMetadata,relationship_tags:['A/B'],character_tags:['Alice'],additional_tags:['Fluff'],categories:['Gen'],archive_warnings:['Warning'],ao3_tags:['Warning','Alice','Fluff','Unclassified']}
 expect(workTagGroups(metadata).flatMap(group=>group.values)).toEqual(['Fluff','Unclassified','A/B','Alice','Gen','Warning'])
})
