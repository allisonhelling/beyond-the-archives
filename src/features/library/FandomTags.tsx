import { BulletSeparated } from './BulletSeparated'
import { MetadataTags } from './MetadataTags'
import type { TagAppearance } from './display/display-settings'
import { useTagAppearance } from './display/useDisplayPreference'

export function FandomTags({ values, appearance, onSelect }: { values: string[]; appearance?: TagAppearance; onSelect?: (value: string) => void }) {
 const saved = useTagAppearance()
 const fandom = (appearance ?? saved).fandom
 if (!fandom) return <BulletSeparated values={values} onSelect={onSelect} />
 return <MetadataTags values={values} onTagClick={onSelect} appearance={{ shape: fandom.shape, textColor: fandom.textColor, colors: { tags: fandom.color } }} />
}
