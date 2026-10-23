import { Heart, Star } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

type ToggleProps = { selected: boolean; disabled?: boolean; onChange: (selected: boolean) => void; menu?: boolean }
const kinds = {
 favorite: { Icon: Star, className: 'favorite', description: 'Favorite', mark: 'Mark favorite', unmark: 'Unmark favorite' },
 rec: { Icon: Heart, className: 'bookmark-rec', description: 'Rec', mark: 'Mark as Rec', unmark: 'Remove Rec' },
}
export function PersonalToggleButton({ kind, selected, disabled, onChange, menu = false }: ToggleProps & { kind: keyof typeof kinds }) {
 const { Icon, className, description, mark, unmark } = kinds[kind]
 const label = `${selected ? 'Remove from' : 'Add to'} ${kind === 'favorite' ? 'Favorites' : 'Recommended'}`
 if (menu) return <button type="button" className={`menu-item personal-toggle ${selected ? 'selected' : ''}`} aria-pressed={selected} disabled={disabled} onClick={() => onChange(!selected)}><Icon size={16} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />{label}</button>
 return <Tooltip description={description}>{id => <button type="button" className={`icon-button ${className} ${selected ? 'selected' : ''}`} aria-label={selected ? unmark : mark} aria-describedby={id} aria-pressed={selected} data-rec={kind === 'rec' ? String(selected) : undefined} disabled={disabled} onClick={() => onChange(!selected)}><Icon size={20} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" /></button>}</Tooltip>
}
export function FavoriteButton(props: ToggleProps) {
 return <PersonalToggleButton {...props} kind="favorite" />
}
