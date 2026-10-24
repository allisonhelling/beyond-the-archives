import { createLucideIcon } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { isOneShot, type Story } from './model'

const OneShotDiamond = createLucideIcon('OneShotDiamond', [
  ['path', { d: 'M12 2 22 12 12 22 2 12Z', key: 'outline' }],
  ['path', { d: 'M12 7 17 12 12 17 7 12Z', fill: 'currentColor', stroke: 'none', key: 'center' }],
])

export function OneShotIndicator({ story }: { story: Pick<Story, 'metadata' | 'personalTags'> }) {
  if (!isOneShot(story.metadata, story.personalTags)) return null
  return <>{'\u00a0'}<Tooltip description="One-Shot">{descriptionId => <span className="publication-icon" role="img" aria-label="One-Shot" aria-describedby={descriptionId} tabIndex={0}><OneShotDiamond size={18} strokeWidth={1.6} aria-hidden="true" /></span>}</Tooltip></>
}
