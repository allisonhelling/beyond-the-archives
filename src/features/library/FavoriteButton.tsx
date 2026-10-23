import { Star } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

export function FavoriteButton({ selected, disabled, onChange }: { selected: boolean; disabled?: boolean; onChange: (selected: boolean) => void }) {
  return <Tooltip description="Favorite">{descriptionId => <button type="button" className={`icon-button favorite ${selected ? 'selected' : ''}`} aria-label={selected ? 'Unmark favorite' : 'Mark favorite'} aria-describedby={descriptionId} aria-pressed={selected} disabled={disabled} onClick={() => onChange(!selected)}><Star size={20} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" /></button>}</Tooltip>
}
