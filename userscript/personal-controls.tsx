import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PersonalTagInput } from '../src/features/library/PersonalTagInput'
import { StarRating } from '../src/features/library/StarRating'
import { parseLines } from '../src/features/library/model'

type Draft = { tags: string; rating: number | '' }

function PersonalControls({ draft, onChange }: { draft: Draft; onChange: () => void }) {
  const [tags, setTags] = useState(parseLines(draft.tags)), [rating, setRating] = useState<number | null>(draft.rating === '' ? null : Number(draft.rating))
  return <div className="companion-personal-controls">
    <div className="personal-tags-field"><p>Personal tags</p><PersonalTagInput inlineHelp value={tags} onChange={value => { setTags(value); draft.tags = value.join('\n'); onChange() }} /></div>
    <StarRating value={rating} onChange={value => { setRating(value); draft.rating = value ?? ''; onChange() }} />
  </div>
}

export function mountPersonalControls(container: HTMLElement, draft: Draft, onChange: () => void) {
  const root = createRoot(container)
  flushSync(() => root.render(<PersonalControls draft={draft} onChange={onChange} />))
  return () => root.unmount()
}
