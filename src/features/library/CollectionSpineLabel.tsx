import type { LucideIcon } from 'lucide-react'
import { SpineDetails, type SpineDesign } from './SpineDetails'

export function CollectionSpineLabel({ name, Icon, count, design = 'radiant-ornament' }: { name: string; Icon: LucideIcon; count?: number; design?: SpineDesign }) {
  return <><SpineDetails variant={design} /><span className="collection-spine-title">{name}</span><Icon className="collection-spine-symbol" size={24} strokeWidth={1.5} aria-hidden="true" />{count !== undefined && <span className="collection-spine-count" aria-hidden="true">{count.toLocaleString()}</span>}</>
}
