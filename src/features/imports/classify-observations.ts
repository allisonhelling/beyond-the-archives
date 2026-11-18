import { createTagClassifier, type ClassificationRule, type RawTag, type TagCategory } from '../library/tags/classification.ts'
import { observationPatch, sourceTagFields, type Observations, type StoryField } from './site-mapping.ts'

type ClassifiedTagFields = Record<'fandoms' | 'relationship_tags' | 'character_tags' | 'additional_tags' | 'ao3_tags', string[]>
export function classifyObservations(observations: Observations, sourceUrl: string, rules: ClassificationRule[]): Record<string, unknown> & ClassifiedTagFields {
 const sourceTags = [...Object.entries(sourceTagFields), [null, 'ao3_tags'] as const].flatMap(([category, key]) => {
  const value = observations[key as StoryField]
  return ((value?.rawText ?? value?.text)?.split('\n') ?? []).flatMap((label, index) => label.trim()
   ? [{ label, position: index + 1, sourceCategory: category as TagCategory | null } satisfies RawTag] : [])
 })
 const classify = createTagClassifier(rules)
 const context = { site: new URL(sourceUrl).origin, fandoms: sourceTags.filter(tag => tag.sourceCategory === 'fandom').map(tag => tag.label) }
 const groups: Record<TagCategory, Set<string>> = { fandom: new Set(), relationship: new Set(), character: new Set(), freeform: new Set(), unknown: new Set() }
 for (const tag of sourceTags) groups[classify(tag, context).category].add(tag.label.trim())
 return {
  ...observationPatch(observations),
  fandoms: [...groups.fandom], relationship_tags: [...groups.relationship],
  character_tags: [...groups.character], additional_tags: [...groups.freeform],
  ao3_tags: [...groups.unknown],
 }
}
