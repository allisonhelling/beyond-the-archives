import type { DisplayLayout } from '../../lib/use-layout'

export type RetrievalMode = 'direct' | 'extension'
export function metadataRetrievalMode(preferences: { retrieval_mode?: string; retrieval_mode_mobile?: string | null } | null, layout: DisplayLayout): RetrievalMode {
 const mode = layout === 'mobile' ? preferences?.retrieval_mode_mobile ?? preferences?.retrieval_mode : preferences?.retrieval_mode
 return mode === 'extension' ? 'extension' : 'direct'
}
