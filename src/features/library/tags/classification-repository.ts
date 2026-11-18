import { supabase } from '../../../lib/supabase'
import type { Json } from '../../../types/database'
import { allRows } from '../repository'
import type { TagResolution } from './tag-resolution'
import type { ClassificationRule, RawTag } from './classification'

function database() {
 if (!supabase) throw new Error('Sign in to manage classification rules.')
 return supabase
}

export async function loadClassificationRules(userId: string) {
 const db = database()
 return allRows((from, to) => db.from('tag_classification_rules').select('id,version,label,scope,category,enabled,site,fandom,story_id,priority').eq('user_id', userId).order('id').range(from, to), 'classification rules') as Promise<ClassificationRule[]>
}

export async function saveClassificationRule(rule: ClassificationRule, remove = false) {
 const { data, error } = await database().rpc('write_tag_classification_rule', {
  p_id: rule.id, p_version: rule.version, ...(!remove && { p_rule: rule as Json }),
 })
 if (error) throw new Error(error.code === '23514' || error.code === '22023' ? 'Check the rule’s label, scope, and priority.' : 'Could not update the classification rule.')
 if (!data) throw new Error('This rule changed. Reload your rules and review them before retrying.')
}

export async function loadTagEvidence(storyId: string) {
 const { data, error } = await database().rpc('story_tag_evidence', { p_story: storyId })
 if (error || !data) throw new Error('Could not load tag evidence for this story.')
 return data as unknown as { site: string | null; tags: RawTag[]; canonicalFandoms?: TagResolution<'fandom'>[] }
}

export async function loadClassificationRevision() {
 const { data, error } = await database().rpc('tag_classification_revision')
 if (error || !data) throw new Error('Could not confirm the current classification rules.')
 return data
}
export async function resetClassificationRules(revision: string) {
 const { data, error } = await database().rpc('reset_tag_classification_rules', { p_revision: revision })
 if (error) throw new Error('Could not reset classification rules.')
 if (!data) throw new Error('Your rules changed. Reload them and review before resetting.')
}
