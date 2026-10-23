import { PersonalToggleButton } from './FavoriteButton'
import type { Story } from './model'

export function BookmarkRec({ story, disabled, onChange }: { story: Pick<Story, 'is_rec'>; disabled?: boolean; onChange: (selected: boolean) => void }) {
 return <PersonalToggleButton kind="rec" selected={story.is_rec} disabled={disabled} onChange={onChange} />
}
