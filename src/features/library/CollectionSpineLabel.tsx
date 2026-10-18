import type { LucideIcon } from 'lucide-react'
import { SpineDetails, type SpineDesign } from './SpineDetails'

export function CollectionSpineLabel({ name, Icon, design = 'radiant-ornament' }: { name: string; Icon: LucideIcon; design?: SpineDesign }) {
  return <><SpineDetails variant={design} /><span className="collection-spine-title">{name}</span><Icon className="collection-spine-symbol" size={24} strokeWidth={1.5} aria-hidden="true" /></>
}
